# ruff: noqa: B008
import argparse
import asyncio
import logging
import os
import signal
import sys
from enum import Enum
from typing import Any
from typing import Dict
from typing import List
from typing import Literal
from typing import Optional
from typing import Union

import mcp.types as types
from mcp.server.fastmcp import FastMCP
from pydantic import Field
from pydantic import validate_call

from postgres_mcp.index.dta_calc import DatabaseTuningAdvisor

from .artifacts import ErrorResult
from .artifacts import ExplainPlanArtifact
from .backup import BackupTools
from .database_health import DatabaseHealthTool
from .database_health import HealthType
from .explain import ExplainPlanTool
from .geo import GeospatialTools
from .index.index_opt_base import MAX_NUM_INDEX_TUNING_QUERIES
from .index.llm_opt import LLMOptimizerTool
from .index.presentation import TextPresentation
from .json import JsonAdvancedTools
from .json import JsonHelperTools
from .monitoring import MonitoringTools
from .performance import PerformanceTools
from .resources import register_prompts
from .resources import register_resources
from .sql import DbConnPool
from .sql import SafeSqlDriver
from .sql import SqlDriver
from .sql import check_hypopg_installation_status
from .sql import obfuscate_password
from .statistics import StatisticalTools
from .text import TextProcessingTools
from .tool_filtering import filter_tools_from_server
from .top_queries import TopQueriesCalc
from .vector import VectorTools

# Initialize FastMCP with default settings
mcp = FastMCP("postgres-mcp")

# Constants
PG_STAT_STATEMENTS = "pg_stat_statements"
HYPOPG_EXTENSION = "hypopg"

ResponseType = List[types.TextContent | types.ImageContent | types.EmbeddedResource]

logger = logging.getLogger(__name__)


# Register MCP Resources and Prompts
# Note: These are registered at module level, but use get_sql_driver() which is defined below
# The actual registration happens when the functions are called, so forward reference is OK
register_resources(mcp, lambda: get_sql_driver())
register_prompts(mcp)


class AccessMode(str, Enum):
    """SQL access modes for the server."""

    UNRESTRICTED = "unrestricted"  # Unrestricted access
    RESTRICTED = "restricted"  # Read-only with safety features


# Global variables
db_connection = DbConnPool()
current_access_mode = AccessMode.UNRESTRICTED
shutdown_in_progress = False


async def get_sql_driver() -> Union[SqlDriver, SafeSqlDriver]:
    """Get the appropriate SQL driver based on the current access mode."""
    base_driver = SqlDriver(conn=db_connection)

    if current_access_mode == AccessMode.RESTRICTED:
        logger.debug("Using SafeSqlDriver with restrictions (RESTRICTED mode)")
        return SafeSqlDriver(sql_driver=base_driver, timeout=30)  # 30 second timeout
    else:
        logger.debug("Using unrestricted SqlDriver (UNRESTRICTED mode)")
        return base_driver


def format_text_response(text: Any) -> ResponseType:
    """Format a text response."""
    return [types.TextContent(type="text", text=str(text))]


def format_error_response(error: str) -> ResponseType:
    """Format an error response."""
    return format_text_response(f"Error: {error}")


@mcp.tool(description="List all schemas in the database")
async def list_schemas() -> ResponseType:
    """List all schemas in the database."""
    try:
        sql_driver = await get_sql_driver()
        rows = await sql_driver.execute_query(
            """
            SELECT
                schema_name,
                schema_owner,
                CASE
                    WHEN schema_name LIKE 'pg_%' THEN 'System Schema'
                    WHEN schema_name = 'information_schema' THEN 'System Information Schema'
                    ELSE 'User Schema'
                END as schema_type
            FROM information_schema.schemata
            ORDER BY schema_type, schema_name
            """
        )
        schemas = [row.cells for row in rows] if rows else []
        return format_text_response(schemas)
    except Exception as e:
        logger.error(f"Error listing schemas: {e}")
        return format_error_response(str(e))


@mcp.tool(description="List objects in a schema")
async def list_objects(
    schema_name: str = Field(description="Schema name"),
    object_type: str = Field(description="Object type: 'table', 'view', 'sequence', or 'extension'", default="table"),
) -> ResponseType:
    """List objects of a given type in a schema."""
    try:
        sql_driver = await get_sql_driver()

        if object_type in ("table", "view"):
            table_type = "BASE TABLE" if object_type == "table" else "VIEW"
            rows = await SafeSqlDriver.execute_param_query(
                sql_driver,
                """
                SELECT table_schema, table_name, table_type
                FROM information_schema.tables
                WHERE table_schema = {} AND table_type = {}
                ORDER BY table_name
                """,
                [schema_name, table_type],
            )
            objects = (
                [{"schema": row.cells["table_schema"], "name": row.cells["table_name"], "type": row.cells["table_type"]} for row in rows]
                if rows
                else []
            )

        elif object_type == "sequence":
            rows = await SafeSqlDriver.execute_param_query(
                sql_driver,
                """
                SELECT sequence_schema, sequence_name, data_type
                FROM information_schema.sequences
                WHERE sequence_schema = {}
                ORDER BY sequence_name
                """,
                [schema_name],
            )
            objects = (
                [{"schema": row.cells["sequence_schema"], "name": row.cells["sequence_name"], "data_type": row.cells["data_type"]} for row in rows]
                if rows
                else []
            )

        elif object_type == "extension":
            # Extensions are not schema-specific
            rows = await sql_driver.execute_query(
                """
                SELECT extname, extversion, extrelocatable
                FROM pg_extension
                ORDER BY extname
                """
            )
            objects = (
                [{"name": row.cells["extname"], "version": row.cells["extversion"], "relocatable": row.cells["extrelocatable"]} for row in rows]
                if rows
                else []
            )

        else:
            return format_error_response(f"Unsupported object type: {object_type}")

        return format_text_response(objects)
    except Exception as e:
        logger.error(f"Error listing objects: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Show detailed information about a database object")
async def get_object_details(
    schema_name: str = Field(description="Schema name"),
    object_name: str = Field(description="Object name"),
    object_type: str = Field(description="Object type: 'table', 'view', 'sequence', or 'extension'", default="table"),
) -> ResponseType:
    """Get detailed information about a database object."""
    try:
        sql_driver = await get_sql_driver()

        if object_type in ("table", "view"):
            # Get columns
            col_rows = await SafeSqlDriver.execute_param_query(
                sql_driver,
                """
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_schema = {} AND table_name = {}
                ORDER BY ordinal_position
                """,
                [schema_name, object_name],
            )
            columns = (
                [
                    {
                        "column": r.cells["column_name"],
                        "data_type": r.cells["data_type"],
                        "is_nullable": r.cells["is_nullable"],
                        "default": r.cells["column_default"],
                    }
                    for r in col_rows
                ]
                if col_rows
                else []
            )

            # Get constraints
            con_rows = await SafeSqlDriver.execute_param_query(
                sql_driver,
                """
                SELECT tc.constraint_name, tc.constraint_type, kcu.column_name
                FROM information_schema.table_constraints AS tc
                LEFT JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema = kcu.table_schema
                WHERE tc.table_schema = {} AND tc.table_name = {}
                """,
                [schema_name, object_name],
            )

            constraints: Dict[Any, Dict[str, Any]] = {}
            if con_rows:
                for row in con_rows:
                    cname = row.cells["constraint_name"]
                    ctype = row.cells["constraint_type"]
                    col = row.cells["column_name"]

                    if cname not in constraints:
                        constraints[cname] = {"type": ctype, "columns": []}
                    if col:
                        constraints[cname]["columns"].append(col)

            constraints_list: List[Dict[str, Any]] = [{"name": name, **data} for name, data in constraints.items()]

            # Get indexes
            idx_rows = await SafeSqlDriver.execute_param_query(
                sql_driver,
                """
                SELECT indexname, indexdef
                FROM pg_indexes
                WHERE schemaname = {} AND tablename = {}
                """,
                [schema_name, object_name],
            )

            indexes = [{"name": r.cells["indexname"], "definition": r.cells["indexdef"]} for r in idx_rows] if idx_rows else []

            result: Dict[str, Any] = {
                "basic": {"schema": schema_name, "name": object_name, "type": object_type},
                "columns": columns,
                "constraints": constraints_list,
                "indexes": indexes,
            }

        elif object_type == "sequence":
            rows = await SafeSqlDriver.execute_param_query(
                sql_driver,
                """
                SELECT sequence_schema, sequence_name, data_type, start_value, increment
                FROM information_schema.sequences
                WHERE sequence_schema = {} AND sequence_name = {}
                """,
                [schema_name, object_name],
            )

            if rows and rows[0]:
                row = rows[0]
                result = {
                    "schema": row.cells["sequence_schema"],
                    "name": row.cells["sequence_name"],
                    "data_type": row.cells["data_type"],
                    "start_value": row.cells["start_value"],
                    "increment": row.cells["increment"],
                }
            else:
                result = {}

        elif object_type == "extension":
            rows = await SafeSqlDriver.execute_param_query(
                sql_driver,
                """
                SELECT extname, extversion, extrelocatable
                FROM pg_extension
                WHERE extname = {}
                """,
                [object_name],
            )

            if rows and rows[0]:
                row = rows[0]
                result = {"name": row.cells["extname"], "version": row.cells["extversion"], "relocatable": row.cells["extrelocatable"]}
            else:
                result = {}

        else:
            return format_error_response(f"Unsupported object type: {object_type}")

        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error getting object details: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Explains the execution plan for a SQL query, showing how the database will execute it and provides detailed cost estimates.")
async def explain_query(
    sql: str = Field(description="SQL query to explain"),
    analyze: bool = Field(
        description="When True, actually runs the query to show real execution statistics instead of estimates. "
        "Takes longer but provides more accurate information.",
        default=False,
    ),
    hypothetical_indexes: list[dict[str, Any]] = Field(
        description="""A list of hypothetical indexes to simulate. Each index must be a dictionary with these keys:
    - 'table': The table name to add the index to (e.g., 'users')
    - 'columns': List of column names to include in the index (e.g., ['email'] or ['last_name', 'first_name'])
    - 'using': Optional index method (default: 'btree', other options include 'hash', 'gist', etc.)

Examples: [
    {"table": "users", "columns": ["email"], "using": "btree"},
    {"table": "orders", "columns": ["user_id", "created_at"]}
]
If there is no hypothetical index, you can pass an empty list.""",
        default=[],
    ),
) -> ResponseType:
    """
    Explains the execution plan for a SQL query.

    Args:
        sql: The SQL query to explain
        analyze: When True, actually runs the query for real statistics
        hypothetical_indexes: Optional list of indexes to simulate
    """
    try:
        sql_driver = await get_sql_driver()
        explain_tool = ExplainPlanTool(sql_driver=sql_driver)
        result: ExplainPlanArtifact | ErrorResult | None = None

        # If hypothetical indexes are specified, check for HypoPG extension
        if hypothetical_indexes and len(hypothetical_indexes) > 0:
            if analyze:
                return format_error_response("Cannot use analyze and hypothetical indexes together")
            try:
                # Use the common utility function to check if hypopg is installed
                (
                    is_hypopg_installed,
                    hypopg_message,
                ) = await check_hypopg_installation_status(sql_driver)

                # If hypopg is not installed, return the message
                if not is_hypopg_installed:
                    return format_text_response(hypopg_message)

                # HypoPG is installed, proceed with explaining with hypothetical indexes
                result = await explain_tool.explain_with_hypothetical_indexes(sql, hypothetical_indexes)
            except Exception:
                raise  # Re-raise the original exception
        elif analyze:
            try:
                # Use EXPLAIN ANALYZE
                result = await explain_tool.explain_analyze(sql)
            except Exception:
                raise  # Re-raise the original exception
        else:
            try:
                # Use basic EXPLAIN
                result = await explain_tool.explain(sql)
            except Exception:
                raise  # Re-raise the original exception

        if result and isinstance(result, ExplainPlanArtifact):
            return format_text_response(result.to_text())
        else:
            error_message = "Error processing explain plan"
            if result and hasattr(result, "to_text"):
                error_message = result.to_text()
            return format_error_response(error_message)
    except Exception as e:
        logger.error(f"Error explaining query: {e}")
        return format_error_response(str(e))


# Query function declaration without the decorator - we'll add it dynamically based on access mode
async def execute_sql(
    sql: str = Field(description="SQL query to run. Use %s for parameter placeholders.", default="SELECT 1"),
    params: Optional[List[Any]] = Field(description="Parameters for the SQL query placeholders", default=None),
) -> ResponseType:
    """Executes a SQL query against the database with parameter binding for security.

    For security, use parameterized queries with %s placeholders:
    - Safe: SELECT * FROM users WHERE id = %s (with params=[123])
    - Unsafe: SELECT * FROM users WHERE id = 123 (direct concatenation)
    """
    try:
        # Security validation: Check for SQL injection patterns when no params are used
        actual_params = params if params is not None and not hasattr(params, "default") else None

        # If no parameters are provided, validate the SQL for potential injection
        if actual_params is None:
            # Check for common SQL injection patterns
            sql_upper = sql.upper().strip()
            suspicious_patterns = [
                "UNION",
                "--",
                "/*",
                "*/",
                ";",
                "DROP",
                "DELETE",
                "UPDATE",
                "INSERT",
                "CREATE",
                "ALTER",
                "EXEC",
                "EXECUTE",
                "SP_",
                "XP_",
                "SCRIPT",
                "INFORMATION_SCHEMA",
                "PG_",
                "CURRENT_USER",
                "VERSION()",
            ]

            # Allow basic SELECT queries but block suspicious patterns
            if any(pattern in sql_upper for pattern in suspicious_patterns):
                # Check if this is a simple SELECT without injection patterns
                if not (
                    sql_upper.startswith("SELECT")
                    and not any(pattern in sql_upper for pattern in ["UNION", "--", "/*", ";", "DROP", "DELETE", "UPDATE", "INSERT"])
                ):
                    return format_error_response(
                        "Potential SQL injection detected. Use parameter binding with %s placeholders for dynamic values. "
                        "Example: SELECT * FROM table WHERE id = %s (with params=[value])"
                    )

        sql_driver = await get_sql_driver()
        rows = await sql_driver.execute_query(sql, params=actual_params)  # type: ignore
        if rows is None:
            return format_text_response("No results")
        return format_text_response(list([r.cells for r in rows]))
    except Exception as e:
        logger.error(f"Error executing query: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Analyze frequently executed queries in the database and recommend optimal indexes")
@validate_call
async def analyze_workload_indexes(
    max_index_size_mb: int = Field(description="Max index size in MB", default=10000),
    method: Literal["dta", "llm"] = Field(description="Method to use for analysis", default="dta"),
) -> ResponseType:
    """Analyze frequently executed queries in the database and recommend optimal indexes."""
    try:
        sql_driver = await get_sql_driver()
        if method == "dta":
            index_tuning = DatabaseTuningAdvisor(sql_driver)
        else:
            index_tuning = LLMOptimizerTool(sql_driver)
        dta_tool = TextPresentation(sql_driver, index_tuning)
        result = await dta_tool.analyze_workload(max_index_size_mb=max_index_size_mb)
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error analyzing workload: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Analyze a list of (up to 10) SQL queries and recommend optimal indexes")
@validate_call
async def analyze_query_indexes(
    queries: list[str] = Field(description="List of Query strings to analyze"),
    max_index_size_mb: int = Field(description="Max index size in MB", default=10000),
    method: Literal["dta", "llm"] = Field(description="Method to use for analysis", default="dta"),
) -> ResponseType:
    """Analyze a list of SQL queries and recommend optimal indexes."""
    if len(queries) == 0:
        return format_error_response("Please provide a non-empty list of queries to analyze.")
    if len(queries) > MAX_NUM_INDEX_TUNING_QUERIES:
        return format_error_response(f"Please provide a list of up to {MAX_NUM_INDEX_TUNING_QUERIES} queries to analyze.")

    try:
        sql_driver = await get_sql_driver()
        if method == "dta":
            index_tuning = DatabaseTuningAdvisor(sql_driver)
        else:
            index_tuning = LLMOptimizerTool(sql_driver)
        dta_tool = TextPresentation(sql_driver, index_tuning)
        result = await dta_tool.analyze_queries(queries=queries, max_index_size_mb=max_index_size_mb)
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error analyzing queries: {e}")
        return format_error_response(str(e))


@mcp.tool(
    description="Analyzes database health. Here are the available health checks:\n"
    "- index - checks for invalid, duplicate, and bloated indexes\n"
    "- connection - checks the number of connection and their utilization\n"
    "- vacuum - checks vacuum health for transaction id wraparound\n"
    "- sequence - checks sequences at risk of exceeding their maximum value\n"
    "- replication - checks replication health including lag and slots\n"
    "- buffer - checks for buffer cache hit rates for indexes and tables\n"
    "- constraint - checks for invalid constraints\n"
    "- all - runs all checks\n"
    "You can optionally specify a single health check or a comma-separated list of health checks. The default is 'all' checks."
)
async def analyze_db_health(
    health_type: str = Field(
        description=f"Optional. Valid values are: {', '.join(sorted([t.value for t in HealthType]))}.",
        default="all",
    ),
) -> ResponseType:
    """Analyze database health for specified components.

    Args:
        health_type: Comma-separated list of health check types to perform.
                    Valid values: index, connection, vacuum, sequence, replication, buffer, constraint, all
    """
    health_tool = DatabaseHealthTool(await get_sql_driver())
    result = await health_tool.health(health_type=health_type)
    return format_text_response(result)


@mcp.tool(
    name="get_top_queries",
    description=f"Reports the slowest or most resource-intensive queries using data from the '{PG_STAT_STATEMENTS}' extension.",
)
async def get_top_queries(
    sort_by: str = Field(
        description="Ranking criteria: 'total_time' for total execution time or 'mean_time' for mean execution time per call, or 'resources' "
        "for resource-intensive queries",
        default="resources",
    ),
    limit: int = Field(description="Number of queries to return when ranking based on mean_time or total_time", default=10),
) -> ResponseType:
    try:
        sql_driver = await get_sql_driver()
        top_queries_tool = TopQueriesCalc(sql_driver=sql_driver)

        if sort_by == "resources":
            result = await top_queries_tool.get_top_resource_queries()
            return format_text_response(result)
        elif sort_by == "mean_time" or sort_by == "total_time":
            # Map the sort_by values to what get_top_queries_by_time expects
            result = await top_queries_tool.get_top_queries_by_time(limit=limit, sort_by="mean" if sort_by == "mean_time" else "total")
        else:
            return format_error_response("Invalid sort criteria. Please use 'resources' or 'mean_time' or 'total_time'.")
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error getting slow queries: {e}")
        return format_error_response(str(e))


# ============================================================================
# JSON Helper Tools (Phase 2 - 6 tools)
# ============================================================================


@mcp.tool(description="Insert or update JSONB data with validation")
async def json_insert(
    table_name: str = Field(description="Target table name"),
    json_column: str = Field(description="JSONB column name"),
    json_data: str = Field(description="JSON data to insert (as JSON string)"),
    where_clause: Optional[str] = Field(description="Optional WHERE clause for UPDATE", default=None),
    where_params: Optional[List[Any]] = Field(description="Parameters for WHERE clause", default=None),
    validate: bool = Field(description="Whether to validate JSON structure", default=True),
) -> ResponseType:
    """Insert or update JSONB data with validation."""
    try:
        sql_driver = await get_sql_driver()
        json_tools = JsonHelperTools(sql_driver)
        result = await json_tools.json_insert(
            table_name=table_name,
            json_column=json_column,
            json_data=json_data,
            where_clause=where_clause,
            where_params=where_params,
            validate=validate,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in json_insert: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Update JSON value by path, optionally creating path if missing")
async def json_update(
    table_name: str = Field(description="Target table name"),
    json_column: str = Field(description="JSONB column name"),
    json_path: str = Field(description="JSON path (e.g., '{key,subkey}')"),
    new_value: Any = Field(description="New value to set"),
    where_clause: str = Field(description="WHERE clause to identify rows"),
    where_params: List[Any] = Field(description="Parameters for WHERE clause"),
    create_if_missing: bool = Field(description="Create path if it doesn't exist", default=True),
) -> ResponseType:
    """Update JSON value by path with optional creation."""
    try:
        sql_driver = await get_sql_driver()
        json_tools = JsonHelperTools(sql_driver)
        result = await json_tools.json_update(
            table_name=table_name,
            json_column=json_column,
            json_path=json_path,
            new_value=new_value,
            where_clause=where_clause,
            where_params=where_params,
            create_if_missing=create_if_missing,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in json_update: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Extract JSON data with multiple output formats")
async def json_select(
    table_name: str = Field(description="Source table name"),
    json_column: str = Field(description="JSONB column name"),
    json_path: Optional[str] = Field(description="Optional path to extract (e.g., '$.user.name')", default=None),
    where_clause: Optional[str] = Field(description="Optional WHERE clause", default=None),
    where_params: Optional[List[Any]] = Field(description="Parameters for WHERE clause", default=None),
    output_format: str = Field(description="Output format ('json', 'text', 'array')", default="json"),
    limit: int = Field(description="Maximum rows to return", default=100),
) -> ResponseType:
    """Extract JSON data in various formats."""
    try:
        sql_driver = await get_sql_driver()
        json_tools = JsonHelperTools(sql_driver)
        result = await json_tools.json_select(
            table_name=table_name,
            json_column=json_column,
            json_path=json_path,
            where_clause=where_clause,
            where_params=where_params,
            output_format=output_format,
            limit=limit,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in json_select: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Complex JSON filtering and aggregation using JSONPath")
async def json_query(
    table_name: str = Field(description="Source table name"),
    json_column: str = Field(description="JSONB column name"),
    json_path: str = Field(description="JSONPath query expression"),
    filter_expr: Optional[str] = Field(description="Optional filter expression", default=None),
    aggregate: Optional[str] = Field(description="Optional aggregate function ('count', 'sum', 'avg', 'min', 'max')", default=None),
    limit: int = Field(description="Maximum rows to return", default=100),
) -> ResponseType:
    """Perform complex JSON queries with optional aggregation."""
    try:
        sql_driver = await get_sql_driver()
        json_tools = JsonHelperTools(sql_driver)
        result = await json_tools.json_query(
            table_name=table_name,
            json_column=json_column,
            json_path=json_path,
            filter_expr=filter_expr,
            aggregate=aggregate,
            limit=limit,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in json_query: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Validate JSONPath expression with security checks")
async def json_validate_path(
    json_path: str = Field(description="JSONPath expression to validate"),
    json_data: Optional[str] = Field(description="Optional JSON data to test against", default=None),
) -> ResponseType:
    """Validate JSONPath with security checks."""
    try:
        sql_driver = await get_sql_driver()
        json_tools = JsonHelperTools(sql_driver)
        result = await json_tools.json_validate_path(
            json_path=json_path,
            json_data=json_data,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in json_validate_path: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Merge JSON objects with conflict resolution strategies")
async def json_merge(
    table_name: str = Field(description="Target table name"),
    json_column: str = Field(description="JSONB column name"),
    merge_data: str = Field(description="JSON data to merge"),
    where_clause: str = Field(description="WHERE clause to identify rows"),
    where_params: List[Any] = Field(description="Parameters for WHERE clause"),
    strategy: str = Field(description="Merge strategy ('overwrite', 'keep_existing', 'concat_arrays')", default="overwrite"),
) -> ResponseType:
    """Merge JSON with configurable strategies."""
    try:
        sql_driver = await get_sql_driver()
        json_tools = JsonHelperTools(sql_driver)
        result = await json_tools.json_merge(
            table_name=table_name,
            json_column=json_column,
            merge_data=merge_data,
            where_clause=where_clause,
            where_params=where_params,
            strategy=strategy,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in json_merge: {e}")
        return format_error_response(str(e))


# ============================================================================
# Advanced JSON Tools (Phase 2 - Selection of 5 most useful tools)
# ============================================================================


@mcp.tool(description="Normalize Python-style JSON to valid JSON format")
async def json_normalize(
    json_data: str = Field(description="Python-style JSON string to normalize"),
) -> ResponseType:
    """Auto-fix Python-style JSON (single quotes, True/False/None)."""
    try:
        sql_driver = await get_sql_driver()
        json_advanced = JsonAdvancedTools(sql_driver)
        result = await json_advanced.json_normalize(json_data=json_data)
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in json_normalize: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Compare two JSON structures and return differences")
async def json_diff(
    json1: str = Field(description="First JSON object (as string)"),
    json2: str = Field(description="Second JSON object (as string)"),
) -> ResponseType:
    """Compare JSON structures."""
    try:
        sql_driver = await get_sql_driver()
        json_advanced = JsonAdvancedTools(sql_driver)
        result = await json_advanced.json_diff(json1=json1, json2=json2)
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in json_diff: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Suggest indexes for JSONB columns based on usage patterns")
async def jsonb_index_suggest(
    table_name: str = Field(description="Target table name"),
    json_column: str = Field(description="JSONB column name"),
    common_paths: Optional[List[str]] = Field(description="List of commonly queried paths", default=None),
    analyze_usage: bool = Field(description="Analyze query patterns", default=True),
) -> ResponseType:
    """Get index recommendations for JSON queries."""
    try:
        sql_driver = await get_sql_driver()
        json_advanced = JsonAdvancedTools(sql_driver)
        result = await json_advanced.jsonb_index_suggest(
            table_name=table_name,
            json_column=json_column,
            common_paths=common_paths,
            analyze_usage=analyze_usage,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in jsonb_index_suggest: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Scan JSON data for potential security issues")
async def json_security_scan(
    json_data: str = Field(description="JSON data to scan (as string)"),
    check_injection: bool = Field(description="Check for SQL injection patterns", default=True),
    check_xss: bool = Field(description="Check for XSS patterns", default=True),
) -> ResponseType:
    """Scan JSON for security vulnerabilities."""
    try:
        sql_driver = await get_sql_driver()
        json_advanced = JsonAdvancedTools(sql_driver)
        result = await json_advanced.json_security_scan(
            json_data=json_data,
            check_injection=check_injection,
            check_xss=check_xss,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in json_security_scan: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Analyze JSON structure and generate statistics")
async def jsonb_stats(
    table_name: str = Field(description="Source table name"),
    json_column: str = Field(description="JSONB column name"),
    where_clause: Optional[str] = Field(description="Optional WHERE clause", default=None),
    where_params: Optional[List[Any]] = Field(description="Parameters for WHERE clause", default=None),
) -> ResponseType:
    """Get JSON structure statistics."""
    try:
        sql_driver = await get_sql_driver()
        json_advanced = JsonAdvancedTools(sql_driver)
        result = await json_advanced.jsonb_stats(
            table_name=table_name,
            json_column=json_column,
            where_clause=where_clause,
            where_params=where_params,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in jsonb_stats: {e}")
        return format_error_response(str(e))


# ============================================================================
# Text Processing Tools (Phase 2 - Selection of 5 most useful tools)
# ============================================================================


@mcp.tool(description="Find similar text using trigram similarity (requires pg_trgm extension)")
async def text_similarity(
    table_name: str = Field(description="Source table name"),
    text_column: str = Field(description="Text column name"),
    search_text: str = Field(description="Text to search for"),
    similarity_threshold: float = Field(description="Minimum similarity score (0-1)", default=0.3),
    limit: int = Field(description="Maximum results to return", default=100),
) -> ResponseType:
    """Find similar text using trigram similarity."""
    try:
        sql_driver = await get_sql_driver()
        text_tools = TextProcessingTools(sql_driver)
        result = await text_tools.text_similarity(
            table_name=table_name,
            text_column=text_column,
            search_text=search_text,
            similarity_threshold=similarity_threshold,
            limit=limit,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in text_similarity: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Advanced full-text search with ranking")
async def text_search_advanced(
    table_name: str = Field(description="Source table name"),
    text_columns: List[str] = Field(description="List of text columns to search"),
    search_query: str = Field(description="Search query (supports AND, OR, NOT operators)"),
    language: str = Field(description="Text search language configuration", default="english"),
    rank_normalization: int = Field(description="Rank normalization (0-32)", default=0),
    limit: int = Field(description="Maximum results to return", default=100),
) -> ResponseType:
    """Perform advanced full-text search."""
    try:
        sql_driver = await get_sql_driver()
        text_tools = TextProcessingTools(sql_driver)
        result = await text_tools.text_search_advanced(
            table_name=table_name,
            text_columns=text_columns,
            search_query=search_query,
            language=language,
            rank_normalization=rank_normalization,
            limit=limit,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in text_search_advanced: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Extract all pattern matches with capture groups using regex")
async def regex_extract_all(
    table_name: str = Field(description="Source table name"),
    text_column: str = Field(description="Text column name"),
    pattern: str = Field(description="Regular expression pattern"),
    flags: str = Field(description="Regex flags (g=global, i=case-insensitive)", default="g"),
    where_clause: Optional[str] = Field(description="Optional WHERE clause", default=None),
    where_params: Optional[List[Any]] = Field(description="Parameters for WHERE clause", default=None),
    limit: int = Field(description="Maximum results to return", default=100),
) -> ResponseType:
    """Extract regex patterns from text."""
    try:
        sql_driver = await get_sql_driver()
        text_tools = TextProcessingTools(sql_driver)
        result = await text_tools.regex_extract_all(
            table_name=table_name,
            text_column=text_column,
            pattern=pattern,
            flags=flags,
            where_clause=where_clause,
            where_params=where_params,
            limit=limit,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in regex_extract_all: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Find fuzzy matches using Levenshtein distance (requires fuzzystrmatch extension)")
async def fuzzy_match(
    table_name: str = Field(description="Source table name"),
    text_column: str = Field(description="Text column name"),
    search_text: str = Field(description="Text to search for"),
    max_distance: int = Field(description="Maximum edit distance", default=3),
    limit: int = Field(description="Maximum results to return", default=100),
) -> ResponseType:
    """Find fuzzy text matches."""
    try:
        sql_driver = await get_sql_driver()
        text_tools = TextProcessingTools(sql_driver)
        result = await text_tools.fuzzy_match(
            table_name=table_name,
            text_column=text_column,
            search_text=search_text,
            max_distance=max_distance,
            limit=limit,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in fuzzy_match: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Basic sentiment analysis using keyword matching")
async def text_sentiment(
    text: str = Field(description="Text to analyze"),
) -> ResponseType:
    """Analyze text sentiment."""
    try:
        sql_driver = await get_sql_driver()
        text_tools = TextProcessingTools(sql_driver)
        result = await text_tools.text_sentiment(text=text)
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in text_sentiment: {e}")
        return format_error_response(str(e))


# ============================================================================
# Phase 3: Statistical Analysis Suite (8 tools)
# ============================================================================


@mcp.tool(description="Calculate descriptive statistics (mean, median, mode, std dev) for numeric columns")
async def stats_descriptive(
    table_name: str = Field(description="Source table name"),
    column_name: str = Field(description="Numeric column to analyze"),
    where_clause: Optional[str] = Field(description="Optional WHERE clause", default=None),
    where_params: Optional[List[Any]] = Field(description="Parameters for WHERE clause", default=None),
) -> ResponseType:
    """Calculate descriptive statistics."""
    try:
        sql_driver = await get_sql_driver()
        stats_tools = StatisticalTools(sql_driver)
        result = await stats_tools.stats_descriptive(
            table_name=table_name,
            column_name=column_name,
            where_clause=where_clause,
            where_params=where_params,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in stats_descriptive: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Calculate percentiles and detect outliers using IQR method")
async def stats_percentiles(
    table_name: str = Field(description="Source table name"),
    column_name: str = Field(description="Numeric column to analyze"),
    percentiles: Optional[List[float]] = Field(description="List of percentiles (0-1 scale)", default=None),
    detect_outliers: bool = Field(description="Whether to detect outliers", default=True),
    where_clause: Optional[str] = Field(description="Optional WHERE clause", default=None),
    where_params: Optional[List[Any]] = Field(description="Parameters for WHERE clause", default=None),
) -> ResponseType:
    """Calculate percentiles and detect outliers."""
    try:
        sql_driver = await get_sql_driver()
        stats_tools = StatisticalTools(sql_driver)
        result = await stats_tools.stats_percentiles(
            table_name=table_name,
            column_name=column_name,
            percentiles=percentiles,
            detect_outliers=detect_outliers,
            where_clause=where_clause,
            where_params=where_params,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in stats_percentiles: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Calculate correlation between two numeric columns (Pearson or Spearman)")
async def stats_correlation(
    table_name: str = Field(description="Source table name"),
    column1: str = Field(description="First numeric column"),
    column2: str = Field(description="Second numeric column"),
    method: str = Field(description="Correlation method ('pearson' or 'spearman')", default="pearson"),
    where_clause: Optional[str] = Field(description="Optional WHERE clause", default=None),
    where_params: Optional[List[Any]] = Field(description="Parameters for WHERE clause", default=None),
) -> ResponseType:
    """Calculate correlation between two columns."""
    try:
        sql_driver = await get_sql_driver()
        stats_tools = StatisticalTools(sql_driver)
        result = await stats_tools.stats_correlation(
            table_name=table_name,
            column1=column1,
            column2=column2,
            method=method,
            where_clause=where_clause,
            where_params=where_params,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in stats_correlation: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Calculate linear regression analysis with coefficients and R-squared")
async def stats_regression(
    table_name: str = Field(description="Source table name"),
    x_column: str = Field(description="Independent variable (X)"),
    y_column: str = Field(description="Dependent variable (Y)"),
    where_clause: Optional[str] = Field(description="Optional WHERE clause", default=None),
    where_params: Optional[List[Any]] = Field(description="Parameters for WHERE clause", default=None),
) -> ResponseType:
    """Calculate linear regression."""
    try:
        sql_driver = await get_sql_driver()
        stats_tools = StatisticalTools(sql_driver)
        result = await stats_tools.stats_regression(
            table_name=table_name,
            x_column=x_column,
            y_column=y_column,
            where_clause=where_clause,
            where_params=where_params,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in stats_regression: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Analyze time series data with aggregation and trend analysis")
async def stats_time_series(
    table_name: str = Field(description="Source table name"),
    time_column: str = Field(description="Timestamp column"),
    value_column: str = Field(description="Value column to aggregate"),
    interval: str = Field(description="Time interval (e.g., '1 hour', '1 day', '1 week')", default="1 day"),
    aggregation: str = Field(description="Aggregation function ('avg', 'sum', 'count', 'min', 'max')", default="avg"),
    where_clause: Optional[str] = Field(description="Optional WHERE clause", default=None),
    where_params: Optional[List[Any]] = Field(description="Parameters for WHERE clause", default=None),
) -> ResponseType:
    """Analyze time series data."""
    try:
        sql_driver = await get_sql_driver()
        stats_tools = StatisticalTools(sql_driver)
        result = await stats_tools.stats_time_series(
            table_name=table_name,
            time_column=time_column,
            value_column=value_column,
            interval=interval,
            aggregation=aggregation,
            where_clause=where_clause,
            where_params=where_params,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in stats_time_series: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Analyze data distribution with histogram and distribution fitting")
async def stats_distribution(
    table_name: str = Field(description="Source table name"),
    column_name: str = Field(description="Numeric column to analyze"),
    bins: int = Field(description="Number of bins for histogram", default=10),
    where_clause: Optional[str] = Field(description="Optional WHERE clause", default=None),
    where_params: Optional[List[Any]] = Field(description="Parameters for WHERE clause", default=None),
) -> ResponseType:
    """Analyze data distribution."""
    try:
        sql_driver = await get_sql_driver()
        stats_tools = StatisticalTools(sql_driver)
        result = await stats_tools.stats_distribution(
            table_name=table_name,
            column_name=column_name,
            bins=bins,
            where_clause=where_clause,
            where_params=where_params,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in stats_distribution: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Perform hypothesis testing (t-test, z-test)")
async def stats_hypothesis(
    table_name: str = Field(description="Source table name"),
    column_name: str = Field(description="Numeric column to test"),
    test_type: str = Field(description="Type of test ('t_test', 'z_test')", default="t_test"),
    hypothesis_value: Optional[float] = Field(description="Hypothesized mean value (for one-sample tests)", default=None),
    group_column: Optional[str] = Field(description="Column for grouping (for two-sample tests)", default=None),
    where_clause: Optional[str] = Field(description="Optional WHERE clause", default=None),
    where_params: Optional[List[Any]] = Field(description="Parameters for WHERE clause", default=None),
) -> ResponseType:
    """Perform hypothesis testing."""
    try:
        sql_driver = await get_sql_driver()
        stats_tools = StatisticalTools(sql_driver)
        result = await stats_tools.stats_hypothesis(
            table_name=table_name,
            column_name=column_name,
            test_type=test_type,
            hypothesis_value=hypothesis_value,
            group_column=group_column,
            where_clause=where_clause,
            where_params=where_params,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in stats_hypothesis: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Generate statistical samples from tables (random, systematic, stratified)")
async def stats_sampling(
    table_name: str = Field(description="Source table name"),
    sample_size: Optional[int] = Field(description="Absolute number of rows to sample", default=None),
    sample_percent: Optional[float] = Field(description="Percentage of rows to sample (0-100)", default=None),
    method: str = Field(description="Sampling method ('random', 'systematic', 'stratified')", default="random"),
    where_clause: Optional[str] = Field(description="Optional WHERE clause", default=None),
    where_params: Optional[List[Any]] = Field(description="Parameters for WHERE clause", default=None),
) -> ResponseType:
    """Generate statistical samples."""
    try:
        sql_driver = await get_sql_driver()
        stats_tools = StatisticalTools(sql_driver)
        result = await stats_tools.stats_sampling(
            table_name=table_name,
            sample_size=sample_size,
            sample_percent=sample_percent,
            method=method,
            where_clause=where_clause,
            where_params=where_params,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in stats_sampling: {e}")
        return format_error_response(str(e))


# ============================================================================
# Phase 3: Performance Intelligence Tools (6 tools)
# ============================================================================


@mcp.tool(description="Compare execution plans of two queries with cost analysis")
async def query_plan_compare(
    query1: str = Field(description="First SQL query"),
    query2: str = Field(description="Second SQL query"),
    params1: Optional[List[Any]] = Field(description="Parameters for first query", default=None),
    params2: Optional[List[Any]] = Field(description="Parameters for second query", default=None),
) -> ResponseType:
    """Compare two query execution plans."""
    try:
        sql_driver = await get_sql_driver()
        perf_tools = PerformanceTools(sql_driver)
        result = await perf_tools.query_plan_compare(
            query1=query1,
            query2=query2,
            params1=params1,
            params2=params2,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in query_plan_compare: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Establish performance baselines for critical queries")
async def performance_baseline(
    queries: List[str] = Field(description="List of SQL queries to baseline"),
    iterations: int = Field(description="Number of times to run each query", default=5),
) -> ResponseType:
    """Establish performance baselines."""
    try:
        sql_driver = await get_sql_driver()
        perf_tools = PerformanceTools(sql_driver)
        result = await perf_tools.performance_baseline(
            queries=queries,
            iterations=iterations,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in performance_baseline: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Analyze slow queries with optimization suggestions (requires pg_stat_statements)")
async def slow_query_analyzer(
    min_duration_ms: float = Field(description="Minimum query duration (milliseconds)", default=1000),
    limit: int = Field(description="Maximum queries to return", default=20),
) -> ResponseType:
    """Analyze slow queries."""
    try:
        sql_driver = await get_sql_driver()
        perf_tools = PerformanceTools(sql_driver)
        result = await perf_tools.slow_query_analyzer(
            min_duration_ms=min_duration_ms,
            limit=limit,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in slow_query_analyzer: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Analyze connection pool and provide optimization recommendations")
async def connection_pool_optimize() -> ResponseType:
    """Optimize connection pool settings."""
    try:
        sql_driver = await get_sql_driver()
        perf_tools = PerformanceTools(sql_driver)
        result = await perf_tools.connection_pool_optimize()
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in connection_pool_optimize: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Analyze vacuum needs and recommend vacuum strategy")
async def vacuum_strategy_recommend(
    table_name: Optional[str] = Field(description="Optional specific table to analyze", default=None),
) -> ResponseType:
    """Recommend vacuum strategy."""
    try:
        sql_driver = await get_sql_driver()
        perf_tools = PerformanceTools(sql_driver)
        result = await perf_tools.vacuum_strategy_recommend(
            table_name=table_name,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in vacuum_strategy_recommend: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Suggest partitioning strategy for large tables")
async def partition_strategy_suggest(
    table_name: str = Field(description="Table to analyze for partitioning"),
    partition_column: Optional[str] = Field(description="Optional column to analyze", default=None),
) -> ResponseType:
    """Suggest partitioning strategy."""
    try:
        sql_driver = await get_sql_driver()
        perf_tools = PerformanceTools(sql_driver)
        result = await perf_tools.partition_strategy_suggest(
            table_name=table_name,
            partition_column=partition_column,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in partition_strategy_suggest: {e}")
        return format_error_response(str(e))


# ============================================================================
# Vector/Semantic Search Tools (Phase 4 - 8 tools)
# ============================================================================


@mcp.tool(description="Generate embeddings for text data (requires pgvector extension and API integration)")
async def vector_embed(
    table_name: str = Field(description="Source table name"),
    text_column: str = Field(description="Column containing text to embed"),
    vector_column: str = Field(description="Column to store embeddings (must be vector type)"),
    model: str = Field(description="Embedding model name", default="text-embedding-ada-002"),
    batch_size: int = Field(description="Number of rows to process per batch", default=100),
    where_clause: Optional[str] = Field(description="Optional WHERE clause for filtering", default=None),
    where_params: Optional[List[Any]] = Field(description="Parameters for WHERE clause", default=None),
) -> ResponseType:
    """Generate embeddings for text data."""
    try:
        sql_driver = await get_sql_driver()
        vector_tools = VectorTools(sql_driver)
        result = await vector_tools.vector_embed(
            table_name=table_name,
            text_column=text_column,
            vector_column=vector_column,
            model=model,
            batch_size=batch_size,
            where_clause=where_clause,
            where_params=where_params,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in vector_embed: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Find similar vectors using cosine, L2, or inner product distance (requires pgvector)")
async def vector_similarity(
    table_name: str = Field(description="Source table name"),
    vector_column: str = Field(description="Column containing vectors"),
    query_vector: List[float] = Field(description="Query vector to find similar vectors"),
    distance_metric: str = Field(description="Distance metric: 'cosine', 'l2', 'inner_product'", default="cosine"),
    limit: int = Field(description="Maximum results to return", default=10),
    where_clause: Optional[str] = Field(description="Optional WHERE clause for filtering", default=None),
    where_params: Optional[List[Any]] = Field(description="Parameters for WHERE clause", default=None),
) -> ResponseType:
    """Find similar vectors."""
    try:
        sql_driver = await get_sql_driver()
        vector_tools = VectorTools(sql_driver)
        result = await vector_tools.vector_similarity(
            table_name=table_name,
            vector_column=vector_column,
            query_vector=query_vector,
            distance_metric=distance_metric,
            limit=limit,
            where_clause=where_clause,
            where_params=where_params,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in vector_similarity: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Semantic search with ranking and distance threshold (requires pgvector)")
async def vector_search(
    table_name: str = Field(description="Source table name"),
    vector_column: str = Field(description="Column containing vectors"),
    query_vector: List[float] = Field(description="Query vector for semantic search"),
    distance_metric: str = Field(description="Distance metric: 'cosine', 'l2', 'inner_product'", default="cosine"),
    limit: int = Field(description="Maximum results to return", default=10),
    threshold: Optional[float] = Field(description="Optional distance threshold for filtering", default=None),
    return_columns: Optional[List[str]] = Field(description="Specific columns to return (None = all)", default=None),
    where_clause: Optional[str] = Field(description="Optional WHERE clause for filtering", default=None),
    where_params: Optional[List[Any]] = Field(description="Parameters for WHERE clause", default=None),
) -> ResponseType:
    """Semantic search with ranking."""
    try:
        sql_driver = await get_sql_driver()
        vector_tools = VectorTools(sql_driver)
        result = await vector_tools.vector_search(
            table_name=table_name,
            vector_column=vector_column,
            query_vector=query_vector,
            distance_metric=distance_metric,
            limit=limit,
            threshold=threshold,
            return_columns=return_columns,
            where_clause=where_clause,
            where_params=where_params,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in vector_search: {e}")
        return format_error_response(str(e))


@mcp.tool(description="K-means clustering for vector data (requires implementation)")
async def vector_cluster(
    table_name: str = Field(description="Source table name"),
    vector_column: str = Field(description="Column containing vectors"),
    num_clusters: int = Field(description="Number of clusters (k)", default=5),
    max_iterations: int = Field(description="Maximum iterations for convergence", default=100),
    distance_metric: str = Field(description="Distance metric: 'cosine', 'l2', 'inner_product'", default="l2"),
) -> ResponseType:
    """K-means clustering for vectors."""
    try:
        sql_driver = await get_sql_driver()
        vector_tools = VectorTools(sql_driver)
        result = await vector_tools.vector_cluster(
            table_name=table_name,
            vector_column=vector_column,
            num_clusters=num_clusters,
            max_iterations=max_iterations,
            distance_metric=distance_metric,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in vector_cluster: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Optimize vector indexes (HNSW/IVFFlat) for performance (requires pgvector)")
async def vector_index_optimize(
    table_name: str = Field(description="Source table name"),
    vector_column: str = Field(description="Column containing vectors"),
    index_type: str = Field(description="Index type: 'hnsw' or 'ivfflat'", default="hnsw"),
    distance_metric: str = Field(description="Distance metric: 'cosine', 'l2', 'inner_product'", default="cosine"),
    index_options: Optional[Dict[str, Any]] = Field(description="Index-specific options", default=None),
) -> ResponseType:
    """Optimize vector indexes."""
    try:
        sql_driver = await get_sql_driver()
        vector_tools = VectorTools(sql_driver)
        result = await vector_tools.vector_index_optimize(
            table_name=table_name,
            vector_column=vector_column,
            index_type=index_type,
            distance_metric=distance_metric,
            index_options=index_options,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in vector_index_optimize: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Dimensionality reduction for vector data (requires implementation)")
async def vector_dimension_reduce(
    table_name: str = Field(description="Source table name"),
    vector_column: str = Field(description="Column containing vectors"),
    target_dimensions: int = Field(description="Target number of dimensions"),
    method: str = Field(description="Reduction method: 'pca' or 'random_projection'", default="pca"),
) -> ResponseType:
    """Reduce vector dimensions."""
    try:
        sql_driver = await get_sql_driver()
        vector_tools = VectorTools(sql_driver)
        result = await vector_tools.vector_dimension_reduce(
            table_name=table_name,
            vector_column=vector_column,
            target_dimensions=target_dimensions,
            method=method,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in vector_dimension_reduce: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Hybrid search combining full-text and vector similarity (requires pgvector)")
async def hybrid_search(
    table_name: str = Field(description="Source table name"),
    vector_column: str = Field(description="Column containing vectors"),
    text_columns: List[str] = Field(description="Columns for full-text search"),
    query_vector: List[float] = Field(description="Query vector for semantic search"),
    query_text: str = Field(description="Query text for full-text search"),
    vector_weight: float = Field(description="Weight for vector similarity (0-1)", default=0.7),
    text_weight: float = Field(description="Weight for text relevance (0-1)", default=0.3),
    distance_metric: str = Field(description="Distance metric: 'cosine', 'l2', 'inner_product'", default="cosine"),
    language: str = Field(description="Text search language configuration", default="english"),
    limit: int = Field(description="Maximum results to return", default=10),
) -> ResponseType:
    """Hybrid search combining text and vector."""
    try:
        sql_driver = await get_sql_driver()
        vector_tools = VectorTools(sql_driver)
        result = await vector_tools.hybrid_search(
            table_name=table_name,
            vector_column=vector_column,
            text_columns=text_columns,
            query_vector=query_vector,
            query_text=query_text,
            vector_weight=vector_weight,
            text_weight=text_weight,
            distance_metric=distance_metric,
            language=language,
            limit=limit,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in hybrid_search: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Vector query optimization and performance benchmarking (requires pgvector)")
async def vector_performance(
    table_name: str = Field(description="Source table name"),
    vector_column: str = Field(description="Column containing vectors"),
    query_vector: List[float] = Field(description="Query vector for benchmarking"),
    distance_metric: str = Field(description="Distance metric: 'cosine', 'l2', 'inner_product'", default="cosine"),
    test_limits: Optional[List[int]] = Field(description="List of limits to test", default=None),
) -> ResponseType:
    """Benchmark vector query performance."""
    try:
        sql_driver = await get_sql_driver()
        vector_tools = VectorTools(sql_driver)
        result = await vector_tools.vector_performance(
            table_name=table_name,
            vector_column=vector_column,
            query_vector=query_vector,
            distance_metric=distance_metric,
            test_limits=test_limits,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in vector_performance: {e}")
        return format_error_response(str(e))


# ============================================================================
# Geospatial Tools (Phase 4 - 7 tools)
# ============================================================================


@mcp.tool(description="Calculate distance between geometries (requires PostGIS extension)")
async def geo_distance(
    table_name: str = Field(description="Source table name"),
    geometry_column: str = Field(description="Column containing geometry data"),
    reference_point: str = Field(description="Reference point in WKT format (e.g., 'POINT(-122.4194 37.7749)')"),
    distance_type: str = Field(description="Distance unit: 'meters', 'kilometers', 'miles', 'feet'", default="meters"),
    max_distance: Optional[float] = Field(description="Maximum distance filter", default=None),
    limit: int = Field(description="Maximum results to return", default=100),
    srid: int = Field(description="Spatial reference system ID (default: 4326 = WGS84)", default=4326),
) -> ResponseType:
    """Calculate distance between geometries."""
    try:
        sql_driver = await get_sql_driver()
        geo_tools = GeospatialTools(sql_driver)
        result = await geo_tools.geo_distance(
            table_name=table_name,
            geometry_column=geometry_column,
            reference_point=reference_point,
            distance_type=distance_type,
            max_distance=max_distance,
            limit=limit,
            srid=srid,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in geo_distance: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Point-in-polygon and geometric containment queries (requires PostGIS)")
async def geo_within(
    table_name: str = Field(description="Source table name"),
    geometry_column: str = Field(description="Column containing geometry data"),
    boundary_geometry: str = Field(description="Boundary in WKT format (e.g., 'POLYGON((...))' )"),
    geometry_type: str = Field(description="Type of boundary: 'polygon', 'multipolygon', 'circle'", default="polygon"),
    limit: int = Field(description="Maximum results to return", default=1000),
    srid: int = Field(description="Spatial reference system ID (default: 4326)", default=4326),
) -> ResponseType:
    """Find geometries within boundary."""
    try:
        sql_driver = await get_sql_driver()
        geo_tools = GeospatialTools(sql_driver)
        result = await geo_tools.geo_within(
            table_name=table_name,
            geometry_column=geometry_column,
            boundary_geometry=boundary_geometry,
            geometry_type=geometry_type,
            limit=limit,
            srid=srid,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in geo_within: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Create buffer zones around geometries (requires PostGIS)")
async def geo_buffer(
    table_name: str = Field(description="Source table name"),
    geometry_column: str = Field(description="Column containing geometry data"),
    buffer_distance: float = Field(description="Buffer distance"),
    distance_unit: str = Field(description="Distance unit: 'meters', 'kilometers', 'miles', 'feet'", default="meters"),
    segments: int = Field(description="Number of segments for buffer (higher = smoother)", default=8),
    where_clause: Optional[str] = Field(description="Optional WHERE clause for filtering", default=None),
    where_params: Optional[List[Any]] = Field(description="Parameters for WHERE clause", default=None),
    limit: int = Field(description="Maximum results to return", default=100),
    srid: int = Field(description="Spatial reference system ID (default: 4326)", default=4326),
) -> ResponseType:
    """Create buffer zones around geometries."""
    try:
        sql_driver = await get_sql_driver()
        geo_tools = GeospatialTools(sql_driver)
        result = await geo_tools.geo_buffer(
            table_name=table_name,
            geometry_column=geometry_column,
            buffer_distance=buffer_distance,
            distance_unit=distance_unit,
            segments=segments,
            where_clause=where_clause,
            where_params=where_params,
            limit=limit,
            srid=srid,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in geo_buffer: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Find geometric intersections (requires PostGIS)")
async def geo_intersection(
    table_name: str = Field(description="Source table name"),
    geometry_column: str = Field(description="Column containing geometry data"),
    intersecting_geometry: str = Field(description="Geometry to test intersection (WKT format)"),
    return_intersection: bool = Field(description="Return intersection geometry if True", default=False),
    limit: int = Field(description="Maximum results to return", default=100),
    srid: int = Field(description="Spatial reference system ID (default: 4326)", default=4326),
) -> ResponseType:
    """Find geometric intersections."""
    try:
        sql_driver = await get_sql_driver()
        geo_tools = GeospatialTools(sql_driver)
        result = await geo_tools.geo_intersection(
            table_name=table_name,
            geometry_column=geometry_column,
            intersecting_geometry=intersecting_geometry,
            return_intersection=return_intersection,
            limit=limit,
            srid=srid,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in geo_intersection: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Optimize spatial indexes (GIST/BRIN/SP-GIST) for performance (requires PostGIS)")
async def geo_index_optimize(
    table_name: str = Field(description="Source table name"),
    geometry_column: str = Field(description="Column containing geometry data"),
    index_type: str = Field(description="Index type: 'gist', 'brin', 'spgist'", default="gist"),
    index_options: Optional[Dict[str, Any]] = Field(description="Index-specific options", default=None),
) -> ResponseType:
    """Optimize spatial indexes."""
    try:
        sql_driver = await get_sql_driver()
        geo_tools = GeospatialTools(sql_driver)
        result = await geo_tools.geo_index_optimize(
            table_name=table_name,
            geometry_column=geometry_column,
            index_type=index_type,
            index_options=index_options,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in geo_index_optimize: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Transform geometries between coordinate systems (requires PostGIS)")
async def geo_transform(
    table_name: str = Field(description="Source table name"),
    geometry_column: str = Field(description="Column containing geometry data"),
    source_srid: int = Field(description="Source spatial reference system ID"),
    target_srid: int = Field(description="Target spatial reference system ID"),
    limit: int = Field(description="Maximum results to return", default=100),
) -> ResponseType:
    """Transform coordinate systems."""
    try:
        sql_driver = await get_sql_driver()
        geo_tools = GeospatialTools(sql_driver)
        result = await geo_tools.geo_transform(
            table_name=table_name,
            geometry_column=geometry_column,
            source_srid=source_srid,
            target_srid=target_srid,
            limit=limit,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in geo_transform: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Spatial clustering using distance-based grouping (requires PostGIS)")
async def geo_cluster(
    table_name: str = Field(description="Source table name"),
    geometry_column: str = Field(description="Column containing geometry data"),
    cluster_distance: float = Field(description="Maximum distance for clustering"),
    distance_unit: str = Field(description="Distance unit: 'meters', 'kilometers', 'miles'", default="meters"),
    min_points: int = Field(description="Minimum points to form a cluster", default=2),
    limit: int = Field(description="Maximum results to return", default=1000),
    srid: int = Field(description="Spatial reference system ID (default: 4326)", default=4326),
) -> ResponseType:
    """Spatial clustering."""
    try:
        sql_driver = await get_sql_driver()
        geo_tools = GeospatialTools(sql_driver)
        result = await geo_tools.geo_cluster(
            table_name=table_name,
            geometry_column=geometry_column,
            cluster_distance=cluster_distance,
            distance_unit=distance_unit,
            min_points=min_points,
            limit=limit,
            srid=srid,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in geo_cluster: {e}")
        return format_error_response(str(e))


# ============================================================================
# BACKUP & RECOVERY TOOLS (Phase 5)
# ============================================================================


@mcp.tool(description="Generate logical backup plan with validation")
async def backup_logical(
    schema_name: Optional[str] = Field(description="Schema to backup (None = all schemas)", default=None),
    table_names: Optional[List[str]] = Field(description="Specific tables to backup (None = all tables)", default=None),
    include_data: bool = Field(description="Include table data in backup plan", default=True),
    include_schema: bool = Field(description="Include schema definitions in backup plan", default=True),
    validate_after: bool = Field(description="Validate backup strategy", default=True),
) -> ResponseType:
    """Generate logical backup plan."""
    try:
        sql_driver = await get_sql_driver()
        backup_tools = BackupTools(sql_driver)
        result = await backup_tools.backup_logical(
            schema_name=schema_name,
            table_names=table_names,
            include_data=include_data,
            include_schema=include_schema,
            validate_after=validate_after,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in backup_logical: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Analyze physical backup readiness and configuration")
async def backup_physical(
    check_wal_archiving: bool = Field(description="Check WAL archiving configuration", default=True),
    check_replication_slots: bool = Field(description="Check replication slot status", default=True),
) -> ResponseType:
    """Analyze physical backup readiness."""
    try:
        sql_driver = await get_sql_driver()
        backup_tools = BackupTools(sql_driver)
        result = await backup_tools.backup_physical(
            check_wal_archiving=check_wal_archiving,
            check_replication_slots=check_replication_slots,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in backup_physical: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Validate database readiness for restore operations")
async def restore_validate(
    check_disk_space: bool = Field(description="Check available disk space", default=True),
    check_connections: bool = Field(description="Check active database connections", default=True),
    check_constraints: bool = Field(description="Check constraint validity", default=True),
) -> ResponseType:
    """Validate restore readiness."""
    try:
        sql_driver = await get_sql_driver()
        backup_tools = BackupTools(sql_driver)
        result = await backup_tools.restore_validate(
            check_disk_space=check_disk_space,
            check_connections=check_connections,
            check_constraints=check_constraints,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in restore_validate: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Optimize backup schedule based on database characteristics")
async def backup_schedule_optimize(
    daily_change_rate_mb: Optional[float] = Field(description="Estimated daily data change in MB (auto-calculated if None)", default=None),
    backup_window_hours: int = Field(description="Available backup window in hours", default=8),
    retention_days: int = Field(description="Required backup retention period in days", default=30),
) -> ResponseType:
    """Optimize backup schedule."""
    try:
        sql_driver = await get_sql_driver()
        backup_tools = BackupTools(sql_driver)
        result = await backup_tools.backup_schedule_optimize(
            daily_change_rate_mb=daily_change_rate_mb,
            backup_window_hours=backup_window_hours,
            retention_days=retention_days,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in backup_schedule_optimize: {e}")
        return format_error_response(str(e))


# ============================================================================
# MONITORING & ALERTING TOOLS (Phase 5)
# ============================================================================


@mcp.tool(description="Monitor real-time database performance metrics")
async def monitor_real_time(
    include_queries: bool = Field(description="Include currently running queries", default=True),
    include_locks: bool = Field(description="Include lock information", default=True),
    include_io: bool = Field(description="Include I/O statistics", default=True),
    limit: int = Field(description="Maximum number of items per category", default=20),
) -> ResponseType:
    """Monitor real-time performance."""
    try:
        sql_driver = await get_sql_driver()
        monitoring_tools = MonitoringTools(sql_driver)
        result = await monitoring_tools.monitor_real_time(
            include_queries=include_queries,
            include_locks=include_locks,
            include_io=include_io,
            limit=limit,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in monitor_real_time: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Analyze metrics against alert thresholds")
async def alert_threshold_set(
    metric_type: str = Field(description="Type of metric: 'connection_count', 'cache_hit_ratio', 'transaction_age', 'replication_lag', 'disk_usage'"),
    warning_threshold: Optional[float] = Field(description="Warning level threshold", default=None),
    critical_threshold: Optional[float] = Field(description="Critical level threshold", default=None),
    check_current: bool = Field(description="Check current value against thresholds", default=True),
) -> ResponseType:
    """Analyze alert thresholds."""
    try:
        sql_driver = await get_sql_driver()
        monitoring_tools = MonitoringTools(sql_driver)
        result = await monitoring_tools.alert_threshold_set(
            metric_type=metric_type,
            warning_threshold=warning_threshold,
            critical_threshold=critical_threshold,
            check_current=check_current,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in alert_threshold_set: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Analyze database growth and project future capacity needs")
async def capacity_planning(
    forecast_days: int = Field(description="Number of days to forecast ahead", default=90),
    include_table_growth: bool = Field(description="Include table-level growth analysis", default=True),
    include_index_growth: bool = Field(description="Include index-level growth analysis", default=True),
) -> ResponseType:
    """Capacity planning analysis."""
    try:
        sql_driver = await get_sql_driver()
        monitoring_tools = MonitoringTools(sql_driver)
        result = await monitoring_tools.capacity_planning(
            forecast_days=forecast_days,
            include_table_growth=include_table_growth,
            include_index_growth=include_index_growth,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in capacity_planning: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Analyze database resource usage patterns (CPU/Memory/IO)")
async def resource_usage_analyze(
    include_cpu: bool = Field(description="Include CPU usage analysis (via query statistics)", default=True),
    include_memory: bool = Field(description="Include memory/buffer usage analysis", default=True),
    include_io: bool = Field(description="Include I/O pattern analysis", default=True),
) -> ResponseType:
    """Analyze resource usage."""
    try:
        sql_driver = await get_sql_driver()
        monitoring_tools = MonitoringTools(sql_driver)
        result = await monitoring_tools.resource_usage_analyze(
            include_cpu=include_cpu,
            include_memory=include_memory,
            include_io=include_io,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in resource_usage_analyze: {e}")
        return format_error_response(str(e))


@mcp.tool(description="Monitor replication status and lag")
async def replication_monitor(
    include_slots: bool = Field(description="Include replication slot information", default=True),
    include_wal_status: bool = Field(description="Include WAL sender/receiver status", default=True),
) -> ResponseType:
    """Monitor replication."""
    try:
        sql_driver = await get_sql_driver()
        monitoring_tools = MonitoringTools(sql_driver)
        result = await monitoring_tools.replication_monitor(
            include_slots=include_slots,
            include_wal_status=include_wal_status,
        )
        return format_text_response(result)
    except Exception as e:
        logger.error(f"Error in replication_monitor: {e}")
        return format_error_response(str(e))


async def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="PostgreSQL MCP Server")
    parser.add_argument("database_url", help="Database connection URL", nargs="?")
    parser.add_argument(
        "--access-mode",
        type=str,
        choices=[mode.value for mode in AccessMode],
        default=AccessMode.UNRESTRICTED.value,
        help="Set SQL access mode: unrestricted (unrestricted) or restricted (read-only with protections)",
    )
    parser.add_argument(
        "--transport",
        type=str,
        choices=["stdio", "sse"],
        default="stdio",
        help="Select MCP transport: stdio (default) or sse",
    )
    parser.add_argument(
        "--sse-host",
        type=str,
        default="localhost",
        help="Host to bind SSE server to (default: localhost)",
    )
    parser.add_argument(
        "--sse-port",
        type=int,
        default=8000,
        help="Port for SSE server (default: 8000)",
    )

    args = parser.parse_args()

    # Store the access mode in the global variable
    global current_access_mode
    current_access_mode = AccessMode(args.access_mode)

    # Add the query tool with a description appropriate to the access mode
    if current_access_mode == AccessMode.UNRESTRICTED:
        mcp.add_tool(execute_sql, description="Execute any SQL query")
    else:
        mcp.add_tool(execute_sql, description="Execute a read-only SQL query")

    # Apply tool filtering from POSTGRES_MCP_TOOL_FILTER environment variable
    filter_tools_from_server(mcp)

    logger.info(f"Starting PostgreSQL MCP Server in {current_access_mode.upper()} mode")

    # Get database URL from environment variable or command line
    database_url = os.environ.get("DATABASE_URI", args.database_url)

    if not database_url:
        raise ValueError(
            "Error: No database URL provided. Please specify via 'DATABASE_URI' environment variable or command-line argument.",
        )

    # Initialize database connection pool
    try:
        await db_connection.pool_connect(database_url)
        logger.info("Successfully connected to database and initialized connection pool")
    except Exception as e:
        logger.warning(
            f"Could not connect to database: {obfuscate_password(str(e))}",
        )
        logger.warning(
            "The MCP server will start but database operations will fail until a valid connection is established.",
        )

    # Set up proper shutdown handling
    try:
        loop = asyncio.get_running_loop()
        signals = (signal.SIGTERM, signal.SIGINT)
        for s in signals:
            loop.add_signal_handler(s, lambda s=s: asyncio.create_task(shutdown(s)))
    except NotImplementedError:
        # Windows doesn't support signals properly
        logger.warning("Signal handling not supported on Windows")
        pass

    # Run the server with the selected transport (always async)
    if args.transport == "stdio":
        await mcp.run_stdio_async()
    else:
        # Update FastMCP settings based on command line arguments
        mcp.settings.host = args.sse_host
        mcp.settings.port = args.sse_port
        await mcp.run_sse_async()


async def shutdown(sig: Optional[signal.Signals] = None) -> None:
    """Clean shutdown of the server."""
    global shutdown_in_progress

    if shutdown_in_progress:
        logger.warning("Forcing immediate exit")
        # Use sys.exit instead of os._exit to allow for proper cleanup
        sys.exit(1)

    shutdown_in_progress = True

    if sig:
        logger.info(f"Received exit signal {sig.name}")

    # Close database connections
    try:
        await db_connection.close()
        logger.info("Closed database connections")
    except Exception as e:
        logger.error(f"Error closing database connections: {e}")

    # Exit with appropriate status code
    sys.exit(128 + int(sig.value) if sig is not None else 0)
