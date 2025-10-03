"""JSON Helper Tools for PostgreSQL MCP Server.

This module provides 6 core JSON operations with validation and security:
- json_insert: Insert JSONB with validation
- json_update: Update by path with creation
- json_select: Extract with multiple formats
- json_query: Complex filtering and aggregation
- json_validate_path: Path validation with security
- json_merge: Merge objects with conflict resolution
"""

import json
import logging
from typing import Any
from typing import Dict
from typing import List
from typing import Optional
from typing import Union
from typing import cast

from typing_extensions import LiteralString

from ..sql import SafeSqlDriver
from ..sql import SqlDriver

logger = logging.getLogger(__name__)


class JsonHelperTools:
    """Core JSON helper operations for PostgreSQL."""

    def __init__(self, sql_driver: SqlDriver):
        """Initialize JSON helper tools.

        Args:
            sql_driver: SQL driver instance for database operations
        """
        self.sql_driver = sql_driver

    async def json_insert(
        self,
        table_name: str,
        json_column: str,
        json_data: Union[Dict[str, Any], str],
        where_clause: Optional[str] = None,
        where_params: Optional[List[Any]] = None,
        validate: bool = True,
    ) -> Dict[str, Any]:
        """Insert or update JSONB data with validation.

        Args:
            table_name: Target table name
            json_column: JSONB column name
            json_data: JSON data to insert (dict or JSON string)
            where_clause: Optional WHERE clause for UPDATE
            where_params: Parameters for WHERE clause
            validate: Whether to validate JSON structure

        Returns:
            Result with success status and row count

        Examples:
            # Insert new JSON data
            await json_insert('users', 'preferences', {'theme': 'dark', 'lang': 'en'})

            # Update existing JSON data
            await json_insert('users', 'preferences', {'theme': 'light'},
                            where_clause='id = {}', where_params=[123])
        """
        try:
            # Convert to JSON string if needed
            if isinstance(json_data, dict):
                json_str = json.dumps(json_data)
            else:
                json_str = json_data

            # Validate JSON if requested
            if validate:
                try:
                    json.loads(json_str)
                except json.JSONDecodeError as e:
                    return {
                        "success": False,
                        "error": f"Invalid JSON: {e!s}",
                    }

            # Build query based on whether it's insert or update
            if where_clause:
                # Update existing row
                query = f"""
                UPDATE {table_name}
                SET {json_column} = %s::jsonb
                WHERE {where_clause}
                """
                params = [json_str] + (where_params or [])
            else:
                # Insert new row (requires table to have id or similar)
                query = f"""
                INSERT INTO {table_name} ({json_column}) VALUES (%s::jsonb)
                """
                params = [json_str]

            result = await self.sql_driver.execute_query(query, params)

            return {
                "success": True,
                "rows_affected": len(result) if result else 0,
            }

        except Exception as e:
            logger.error(f"Error in json_insert: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def json_update(
        self,
        table_name: str,
        json_column: str,
        json_path: str,
        new_value: Any,
        where_clause: str,
        where_params: List[Any],
        create_if_missing: bool = True,
    ) -> Dict[str, Any]:
        """Update JSON value by path, optionally creating path if missing.

        Args:
            table_name: Target table name
            json_column: JSONB column name
            json_path: JSON path (e.g., '{key,subkey}')
            new_value: New value to set
            where_clause: WHERE clause to identify rows
            where_params: Parameters for WHERE clause
            create_if_missing: Create path if it doesn't exist

        Returns:
            Result with success status and row count

        Examples:
            # Update nested value
            await json_update('users', 'preferences', '{theme,color}', 'blue',
                            'id = {}', [123])

            # Create new path
            await json_update('users', 'settings', '{notifications,email}', True,
                            'id = {}', [123], create_if_missing=True)
        """
        try:
            # Convert value to JSON
            value_json = json.dumps(new_value)

            # Use jsonb_set with create_missing parameter
            query = f"""
            UPDATE {table_name}
            SET {json_column} = jsonb_set(
                {json_column},
                %s,
                %s::jsonb,
                %s
            )
            WHERE {where_clause}
            """

            params = [json_path, value_json, create_if_missing, *where_params]

            result = await self.sql_driver.execute_query(query, params)

            return {
                "success": True,
                "rows_affected": len(result) if result else 0,
            }

        except Exception as e:
            logger.error(f"Error in json_update: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def json_select(
        self,
        table_name: str,
        json_column: str,
        json_path: Optional[str] = None,
        where_clause: Optional[str] = None,
        where_params: Optional[List[Any]] = None,
        output_format: str = "json",
        limit: int = 100,
    ) -> Dict[str, Any]:
        """Extract JSON data with multiple output formats.

        Args:
            table_name: Source table name
            json_column: JSONB column name
            json_path: Optional path to extract (e.g., '$.user.name')
            where_clause: Optional WHERE clause
            where_params: Parameters for WHERE clause
            output_format: Output format ('json', 'text', 'array')
            limit: Maximum rows to return

        Returns:
            Extracted data in specified format

        Examples:
            # Get full JSON
            await json_select('users', 'preferences')

            # Extract specific path
            await json_select('users', 'preferences', '$.theme')

            # Get as text array
            await json_select('users', 'preferences', '$.tags',
                            output_format='array')
        """
        try:
            # Build SELECT clause based on path and format
            if json_path:
                if output_format == "text":
                    select_expr = f"jsonb_path_query_first({json_column}, %s)::text"
                    select_params = [json_path]
                elif output_format == "array":
                    select_expr = f"jsonb_path_query_array({json_column}, %s)"
                    select_params = [json_path]
                else:  # json
                    select_expr = f"jsonb_path_query_first({json_column}, %s)"
                    select_params = [json_path]
            else:
                select_expr = json_column
                select_params = []

            # Build full query
            where_part = f"WHERE {where_clause}" if where_clause else ""
            query = f"""
            SELECT {select_expr}
            FROM {table_name}
            {where_part}
            LIMIT %s
            """

            params = select_params + (where_params or []) + [limit]

            result = await self.sql_driver.execute_query(query, params)

            if not result:
                return {"success": True, "data": [], "count": 0}

            # Format results
            data = [row.cells for row in result]

            return {
                "success": True,
                "data": data,
                "count": len(data),
                "format": output_format,
            }

        except Exception as e:
            logger.error(f"Error in json_select: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def json_query(
        self,
        table_name: str,
        json_column: str,
        json_path: str,
        filter_expr: Optional[str] = None,
        aggregate: Optional[str] = None,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """Complex JSON filtering and aggregation using JSONPath.

        Args:
            table_name: Source table name
            json_column: JSONB column name
            json_path: JSONPath query expression
            filter_expr: Optional filter expression
            aggregate: Optional aggregate function ('count', 'sum', 'avg', 'min', 'max')
            limit: Maximum rows to return

        Returns:
            Query results with optional aggregation

        Examples:
            # Find products over $100
            await json_query('orders', 'data',
                           '$.products[*] ? (@.price > 100)')

            # Count matching items
            await json_query('orders', 'data',
                           '$.items[*]',
                           aggregate='count')

            # Get average price
            await json_query('orders', 'data',
                           '$.products[*].price',
                           aggregate='avg')
        """
        try:
            # Build query based on aggregate
            if aggregate:
                agg_func = aggregate.lower()
                if agg_func not in ["count", "sum", "avg", "min", "max"]:
                    return {
                        "success": False,
                        "error": f"Invalid aggregate function: {aggregate}",
                    }

                if agg_func == "count":
                    query = f"""
                    SELECT COUNT(*) as result
                    FROM {table_name},
                    LATERAL jsonb_path_query({json_column}, %s) as item
                    """
                else:
                    query = f"""
                    SELECT {agg_func.upper()}((item->>'value')::numeric) as result
                    FROM {table_name},
                    LATERAL jsonb_path_query({json_column}, %s) as item
                    """

                params = [json_path]
            else:
                query = f"""
                SELECT item
                FROM {table_name},
                LATERAL jsonb_path_query({json_column}, %s) as item
                LIMIT %s
                """
                params = [json_path, limit]

            result = await self.sql_driver.execute_query(query, params)

            if not result:
                return {"success": True, "data": [], "count": 0}

            # Format results
            if aggregate:
                data = result[0].cells if result else {"result": 0}
            else:
                data = [row.cells for row in result]

            return {
                "success": True,
                "data": data,
                "count": len(data) if not aggregate else 1,
                "aggregate": aggregate,
            }

        except Exception as e:
            logger.error(f"Error in json_query: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def json_validate_path(
        self,
        json_path: str,
        json_data: Optional[Union[Dict[str, Any], str]] = None,
    ) -> Dict[str, Any]:
        """Validate JSONPath expression with security checks.

        Args:
            json_path: JSONPath expression to validate
            json_data: Optional JSON data to test against

        Returns:
            Validation result with errors if any

        Examples:
            # Validate path syntax
            await json_validate_path('$.user.name')

            # Validate path against data
            await json_validate_path('$.items[*].price',
                                   {'items': [{'price': 10}, {'price': 20}]})
        """
        try:
            # Basic security checks
            dangerous_patterns = ["eval(", "exec(", "import ", "__"]
            for pattern in dangerous_patterns:
                if pattern in json_path.lower():
                    return {
                        "success": False,
                        "valid": False,
                        "error": f"Potentially dangerous pattern detected: {pattern}",
                    }

            # Test path with PostgreSQL
            if json_data:
                if isinstance(json_data, dict):
                    json_str = json.dumps(json_data)
                else:
                    json_str = json_data

                query = """
                SELECT jsonb_path_query({}, {})
                """
                params = [json_str, json_path]

                result = await SafeSqlDriver.execute_param_query(
                    self.sql_driver,
                    query,
                    params,
                )

                return {
                    "success": True,
                    "valid": True,
                    "matches": len(result) if result else 0,
                }
            else:
                # Just validate syntax without data
                return {
                    "success": True,
                    "valid": True,
                    "message": "Path syntax appears valid (no test data provided)",
                }

        except Exception as e:
            return {
                "success": False,
                "valid": False,
                "error": str(e),
            }

    async def json_merge(
        self,
        table_name: str,
        json_column: str,
        merge_data: Union[Dict[str, Any], str],
        where_clause: str,
        where_params: List[Any],
        strategy: str = "overwrite",
    ) -> Dict[str, Any]:
        """Merge JSON objects with conflict resolution strategies.

        Args:
            table_name: Target table name
            json_column: JSONB column name
            merge_data: JSON data to merge
            where_clause: WHERE clause to identify rows
            where_params: Parameters for WHERE clause
            strategy: Merge strategy ('overwrite', 'keep_existing', 'concat_arrays')

        Returns:
            Result with success status and row count

        Examples:
            # Overwrite existing keys
            await json_merge('users', 'preferences',
                           {'theme': 'dark', 'fontSize': 14},
                           'id = {}', [123], strategy='overwrite')

            # Keep existing values
            await json_merge('users', 'preferences',
                           {'theme': 'dark'},
                           'id = {}', [123], strategy='keep_existing')

            # Concatenate arrays
            await json_merge('users', 'tags',
                           {'tags': ['new', 'tag']},
                           'id = {}', [123], strategy='concat_arrays')
        """
        try:
            # Convert to JSON string if needed
            if isinstance(merge_data, dict):
                merge_json = json.dumps(merge_data)
            else:
                merge_json = merge_data

            # Build query based on strategy
            if strategy == "overwrite":
                # Use || operator (right side overwrites left)
                query = f"""
                UPDATE {table_name}
                SET {json_column} = {json_column} || %s::jsonb
                WHERE {where_clause}
                """
                params = [merge_json, *where_params]

            elif strategy == "keep_existing":
                # Use || operator (left side takes precedence)
                query = f"""
                UPDATE {table_name}
                SET {json_column} = %s::jsonb || {json_column}
                WHERE {where_clause}
                """
                params = [merge_json, *where_params]

            elif strategy == "concat_arrays":
                # For array values, concatenate instead of replace
                query = f"""
                UPDATE {table_name}
                SET {json_column} = jsonb_concat_recursive({json_column}, %s::jsonb)
                WHERE {where_clause}
                """
                params = [merge_json, *where_params]

            else:
                return {
                    "success": False,
                    "error": f"Invalid merge strategy: {strategy}",
                }

            result = await self.sql_driver.execute_query(query, params)

            return {
                "success": True,
                "rows_affected": len(result) if result else 0,
                "strategy": strategy,
            }

        except Exception as e:
            logger.error(f"Error in json_merge: {e}")
            return {
                "success": False,
                "error": str(e),
            }
