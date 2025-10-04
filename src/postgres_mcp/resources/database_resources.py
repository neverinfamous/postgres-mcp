"""Database Resources for PostgreSQL MCP Server.

Provides real-time database meta-awareness through MCP Resources.
"""

import json
import logging
from typing import Any
from typing import Awaitable
from typing import Callable
from typing import Union

from mcp.server.fastmcp import FastMCP

from ..database_health import DatabaseHealthTool
from ..sql import SafeSqlDriver
from ..sql import SqlDriver
from ..top_queries import TopQueriesCalc

logger = logging.getLogger(__name__)


def register_resources(mcp: FastMCP, get_sql_driver_func: Callable[[], Awaitable[Union[SqlDriver, SafeSqlDriver]]]) -> None:
    """Register all database resources with the MCP server.

    Args:
        mcp: FastMCP server instance
        get_sql_driver_func: Async function to get SQL driver instance
    """

    @mcp.resource("database://schema")
    async def get_database_schema() -> str:  # pyright: ignore[reportUnusedFunction]
        """Return complete database schema as JSON."""
        try:
            sql_driver: Any = await get_sql_driver_func()

            # Query information_schema for tables
            tables_query = """
                SELECT
                    t.table_schema,
                    t.table_name,
                    t.table_type,
                    obj_description((t.table_schema||'.'||t.table_name)::regclass) as table_comment
                FROM information_schema.tables t
                WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
                ORDER BY t.table_schema, t.table_name
            """

            tables_result: Any = await sql_driver.execute_query(tables_query)
            tables: list[Any] = [row.cells for row in tables_result] if tables_result else []

            # Get PostgreSQL version
            version_query = "SELECT version()"
            version_result = await sql_driver.execute_query(version_query)
            pg_version = version_result[0].cells["version"] if version_result else "Unknown"

            schema_info: dict[str, Any] = {"database": "PostgreSQL", "version": pg_version, "total_tables": len(tables), "tables": []}

            # For each table, get columns, indexes, constraints
            for table in tables:
                schema_name = table["table_schema"]
                table_name = table["table_name"]

                # Get columns
                columns_query = """
                    SELECT
                        column_name,
                        data_type,
                        is_nullable,
                        column_default,
                        character_maximum_length
                    FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = %s
                    ORDER BY ordinal_position
                """
                col_result: Any = await sql_driver.execute_query(columns_query, [schema_name, table_name])
                columns: list[Any] = [row.cells for row in col_result] if col_result else []

                # Get indexes
                indexes_query = """
                    SELECT indexname, indexdef
                    FROM pg_indexes
                    WHERE schemaname = %s AND tablename = %s
                """
                idx_result: Any = await sql_driver.execute_query(indexes_query, [schema_name, table_name])
                indexes: list[Any] = [row.cells for row in idx_result] if idx_result else []

                table_info: dict[str, Any] = {
                    "schema": schema_name,
                    "name": table_name,
                    "type": table["table_type"],
                    "comment": table["table_comment"],
                    "columns": columns,
                    "indexes": indexes,
                    "column_count": len(columns),
                    "index_count": len(indexes),
                }

                schema_info["tables"].append(table_info)

            schema_info["summary"] = (
                f"PostgreSQL database with {len(tables)} tables across "
                f"{len(set(t.get('schema', 'public') for t in schema_info['tables']))} schemas. "
                f"Use this schema information to understand the database structure before querying."
            )

            return json.dumps(schema_info, indent=2)

        except Exception as e:
            logger.error(f"Error generating schema resource: {e}")
            return json.dumps({"error": str(e), "recommendation": "Check database connection and permissions"}, indent=2)

    @mcp.resource("database://capabilities")
    async def get_server_capabilities() -> str:  # pyright: ignore[reportUnusedFunction]
        """Return comprehensive server capabilities."""
        try:
            sql_driver = await get_sql_driver_func()

            # Check installed extensions
            extensions_query = """
                SELECT extname, extversion
                FROM pg_extension
                ORDER BY extname
            """
            ext_result = await sql_driver.execute_query(extensions_query)
            extensions = [row.cells for row in ext_result] if ext_result else []

            # Get PostgreSQL version
            version_query = "SELECT version()"
            version_result = await sql_driver.execute_query(version_query)
            pg_version = version_result[0].cells["version"] if version_result else "Unknown"

            # Check for critical extensions
            has_pg_stat = any(ext["extname"] == "pg_stat_statements" for ext in extensions)
            has_hypopg = any(ext["extname"] == "hypopg" for ext in extensions)
            has_pgvector = any(ext["extname"] == "vector" for ext in extensions)
            has_postgis = any(ext["extname"] == "postgis" for ext in extensions)

            recommendations: list[dict[str, Any]] = []

            capabilities: dict[str, Any] = {
                "server_version": "1.1.0",
                "postgresql_version": pg_version,
                "total_tools": 63,
                "total_resources": 10,
                "total_prompts": 10,
                "tool_categories": {
                    "Core Database": {"count": 9, "description": "Schema management, SQL execution, health monitoring"},
                    "JSON Operations": {"count": 11, "description": "JSONB operations, validation, security scanning"},
                    "Text Processing": {"count": 5, "description": "Similarity search, full-text search, fuzzy matching"},
                    "Statistical Analysis": {"count": 8, "description": "Descriptive stats, correlation, regression, time series"},
                    "Performance Intelligence": {"count": 6, "description": "Query optimization, index tuning, workload analysis"},
                    "Vector/Semantic Search": {"count": 8, "description": "Embeddings, similarity search, clustering"},
                    "Geospatial": {"count": 7, "description": "Distance calculation, spatial queries, GIS operations"},
                    "Backup & Recovery": {"count": 4, "description": "Backup planning, restore validation, scheduling"},
                    "Monitoring & Alerting": {"count": 5, "description": "Real-time monitoring, capacity planning, alerting"},
                },
                "installed_extensions": [{"name": ext["extname"], "version": ext["extversion"]} for ext in extensions],
                "critical_extensions": {
                    "pg_stat_statements": {
                        "installed": has_pg_stat,
                        "purpose": "Query performance tracking",
                        "required_for": ["get_top_queries", "slow_query_analyzer", "performance monitoring"],
                    },
                    "hypopg": {
                        "installed": has_hypopg,
                        "purpose": "Hypothetical index testing (zero-risk)",
                        "required_for": ["explain_query with hypothetical indexes", "index optimization"],
                    },
                    "pgvector": {
                        "installed": has_pgvector,
                        "purpose": "Vector similarity search",
                        "required_for": ["All vector_* tools", "semantic search", "AI embeddings"],
                    },
                    "postgis": {
                        "installed": has_postgis,
                        "purpose": "Geospatial operations",
                        "required_for": ["All geo_* tools", "spatial queries", "GIS analysis"],
                    },
                },
                "key_capabilities": [
                    "AI-native vector search via pgvector" if has_pgvector else "pgvector not installed (run: CREATE EXTENSION vector;)",
                    "Geospatial operations via PostGIS" if has_postgis else "PostGIS not installed",
                    "Hypothetical index testing via hypopg" if has_hypopg else "hypopg not installed (recommended for index optimization)",
                    "Real-time query performance via pg_stat_statements"
                    if has_pg_stat
                    else "pg_stat_statements not installed (CRITICAL for performance monitoring)",
                    "JSONB operations with advanced indexing",
                    "Full-text search with multiple languages",
                    "Enterprise backup and recovery workflows",
                    "Replication monitoring and management",
                ],
                "recommendations": recommendations,
            }

            # Add recommendations for missing extensions
            if not has_pg_stat:
                recommendations.append(
                    {
                        "priority": "HIGH",
                        "extension": "pg_stat_statements",
                        "sql": "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;",
                        "benefit": "Essential for query performance monitoring and optimization",
                    }
                )

            if not has_hypopg:
                recommendations.append(
                    {
                        "priority": "MEDIUM",
                        "extension": "hypopg",
                        "sql": "CREATE EXTENSION IF NOT EXISTS hypopg;",
                        "benefit": "Test index recommendations without disk I/O (PostgreSQL's killer feature)",
                    }
                )

            return json.dumps(capabilities, indent=2)

        except Exception as e:
            logger.error(f"Error generating capabilities resource: {e}")
            return json.dumps({"error": str(e)}, indent=2)

    @mcp.resource("database://performance")
    async def get_performance_metrics() -> str:  # pyright: ignore[reportUnusedFunction]
        """Return query performance metrics from pg_stat_statements."""
        try:
            sql_driver = await get_sql_driver_func()

            # Check if pg_stat_statements is available
            ext_query = "SELECT COUNT(*) as count FROM pg_extension WHERE extname = 'pg_stat_statements'"
            ext_result = await sql_driver.execute_query(ext_query)
            has_pg_stat = ext_result[0].cells["count"] > 0 if ext_result else False

            if not has_pg_stat:
                return json.dumps(
                    {
                        "extension_status": "not_installed",
                        "error": "pg_stat_statements extension not installed",
                        "recommendation": "Run: CREATE EXTENSION pg_stat_statements;",
                        "benefits": [
                            "Track query performance and identify slow queries",
                            "Optimize workload based on actual usage patterns",
                            "Enable all performance intelligence tools",
                            "Critical for production database monitoring",
                        ],
                    },
                    indent=2,
                )

            # Get top queries by total time
            top_queries_tool = TopQueriesCalc(sql_driver=sql_driver)
            queries_data = await top_queries_tool.get_top_queries_by_time(limit=20, sort_by="total")

            # Parse the string response (it's formatted text, not JSON)
            performance_metrics: dict[str, Any] = {
                "extension_status": "installed",
                "top_queries": queries_data,  # This is formatted text
                "recommendations": [],
                "summary": "Use get_top_queries tool for detailed query performance analysis",
            }

            return json.dumps(performance_metrics, indent=2)

        except Exception as e:
            logger.error(f"Error generating performance resource: {e}")
            return json.dumps({"error": str(e), "recommendation": "Verify pg_stat_statements is installed and configured"}, indent=2)

    @mcp.resource("database://health")
    async def get_database_health() -> str:  # pyright: ignore[reportUnusedFunction]
        """Return comprehensive database health status."""
        try:
            sql_driver = await get_sql_driver_func()
            health_tool = DatabaseHealthTool(sql_driver)

            # Run all health checks
            health_results = await health_tool.health(health_type="all")

            return json.dumps(
                {
                    "health_status": health_results,
                    "summary": "Comprehensive health check across indexes, connections, vacuum, replication, buffer cache, and constraints",
                    "next_steps": "Review any warnings or critical issues and use appropriate tools to address them",
                },
                indent=2,
            )

        except Exception as e:
            logger.error(f"Error generating health resource: {e}")
            return json.dumps({"error": str(e)}, indent=2)

    @mcp.resource("database://extensions")
    async def get_extensions_info() -> str:  # pyright: ignore[reportUnusedFunction]
        """Return installed extensions with versions and capabilities."""
        try:
            sql_driver = await get_sql_driver_func()

            # Get installed extensions
            extensions_query = """
                SELECT
                    e.extname,
                    e.extversion,
                    e.extrelocatable,
                    n.nspname as schema,
                    d.description
                FROM pg_extension e
                LEFT JOIN pg_namespace n ON e.extnamespace = n.oid
                LEFT JOIN pg_description d ON d.objoid = e.oid
                ORDER BY e.extname
            """
            ext_result = await sql_driver.execute_query(extensions_query)
            extensions = [row.cells for row in ext_result] if ext_result else []

            # Get available but not installed extensions
            available_query = """
                SELECT name, default_version, comment
                FROM pg_available_extensions
                WHERE name NOT IN (SELECT extname FROM pg_extension)
                AND name IN ('hypopg', 'pg_stat_statements', 'pgvector', 'postgis', 'pg_trgm', 'fuzzystrmatch')
                ORDER BY name
            """
            avail_result = await sql_driver.execute_query(available_query)
            available = [row.cells for row in avail_result] if avail_result else []

            recommendations_ext: list[dict[str, Any]] = []

            extensions_info: dict[str, Any] = {
                "installed_count": len(extensions),
                "installed_extensions": extensions,
                "available_extensions": available,
                "recommendations": recommendations_ext,
            }

            # Add recommendations
            critical_extensions = ["pg_stat_statements", "hypopg"]
            optional_extensions = ["vector", "postgis", "pg_trgm", "fuzzystrmatch"]

            installed_names = [e["extname"] for e in extensions]

            for ext_name in critical_extensions:
                if ext_name not in installed_names:
                    recommendations_ext.append(
                        {
                            "extension": ext_name,
                            "priority": "HIGH",
                            "sql": f"CREATE EXTENSION IF NOT EXISTS {ext_name};",
                            "reason": "Critical for performance monitoring"
                            if ext_name == "pg_stat_statements"
                            else "Enables risk-free index testing",
                        }
                    )

            for ext_name in optional_extensions:
                if ext_name not in installed_names:
                    reason_map = {
                        "vector": "Enables AI-native semantic search",
                        "postgis": "Enables geospatial operations",
                        "pg_trgm": "Enables fuzzy text search",
                        "fuzzystrmatch": "Enables phonetic matching",
                    }
                    recommendations_ext.append(
                        {
                            "extension": ext_name,
                            "priority": "OPTIONAL",
                            "sql": f"CREATE EXTENSION IF NOT EXISTS {ext_name};",
                            "reason": reason_map.get(ext_name, "Adds useful functionality"),
                        }
                    )

            return json.dumps(extensions_info, indent=2)

        except Exception as e:
            logger.error(f"Error generating extensions resource: {e}")
            return json.dumps({"error": str(e)}, indent=2)

    @mcp.resource("database://indexes")
    async def get_indexes_info() -> str:  # pyright: ignore[reportUnusedFunction]
        """Return index usage statistics and recommendations."""
        try:
            sql_driver = await get_sql_driver_func()

            # Get index usage statistics
            index_query = """
                SELECT
                    schemaname,
                    relname as tablename,
                    indexrelname as indexname,
                    idx_scan as index_scans,
                    idx_tup_read as tuples_read,
                    idx_tup_fetch as tuples_fetched,
                    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
                    pg_relation_size(indexrelid) as size_bytes
                FROM pg_stat_user_indexes
                WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
                ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC
                LIMIT 50
            """
            idx_result = await sql_driver.execute_query(index_query)
            indexes = [row.cells for row in idx_result] if idx_result else []

            # Analyze indexes
            unused_indexes = [idx for idx in indexes if idx["index_scans"] == 0 and idx["size_bytes"] > 1024 * 1024]  # > 1MB
            rarely_used = [idx for idx in indexes if 0 < idx["index_scans"] < 100 and idx["size_bytes"] > 10 * 1024 * 1024]  # > 10MB

            recommendations_idx: list[dict[str, Any]] = []

            indexes_info: dict[str, Any] = {
                "total_indexes": len(indexes),
                "unused_indexes": len(unused_indexes),
                "rarely_used_indexes": len(rarely_used),
                "index_details": indexes[:20],  # Top 20 by usage
                "recommendations": recommendations_idx,
            }

            # Add recommendations
            for idx in unused_indexes[:5]:  # Top 5 unused
                recommendations_idx.append(
                    {
                        "type": "UNUSED_INDEX",
                        "priority": "HIGH",
                        "index": f"{idx['schemaname']}.{idx['indexname']}",
                        "table": idx["tablename"],
                        "size": idx["index_size"],
                        "scans": idx["index_scans"],
                        "action": f"DROP INDEX IF EXISTS {idx['schemaname']}.{idx['indexname']};",
                        "benefit": f"Reclaim {idx['index_size']} and reduce write overhead",
                    }
                )

            if len(recommendations_idx) == 0:
                recommendations_idx.append({"type": "HEALTHY", "message": "No obvious index optimization opportunities found"})

            indexes_info["summary"] = (
                f"Analyzed {len(indexes)} indexes. Found {len(unused_indexes)} unused and "
                f"{len(rarely_used)} rarely-used indexes. Use index_tuning prompt for comprehensive analysis."
            )

            return json.dumps(indexes_info, indent=2)

        except Exception as e:
            logger.error(f"Error generating indexes resource: {e}")
            return json.dumps({"error": str(e)}, indent=2)

    @mcp.resource("database://connections")
    async def get_connections_info() -> str:  # pyright: ignore[reportUnusedFunction]
        """Return active connections and connection pool status."""
        try:
            sql_driver = await get_sql_driver_func()

            # Get connection statistics
            conn_query = """
                SELECT
                    count(*) as total_connections,
                    count(*) FILTER (WHERE state = 'active') as active_connections,
                    count(*) FILTER (WHERE state = 'idle') as idle_connections,
                    count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction,
                    count(*) FILTER (WHERE wait_event_type IS NOT NULL) as waiting_connections
                FROM pg_stat_activity
            """
            conn_result = await sql_driver.execute_query(conn_query)
            conn_stats = conn_result[0].cells if conn_result else {}

            # Get max connections
            max_conn_query = "SHOW max_connections"
            max_result = await sql_driver.execute_query(max_conn_query)
            max_connections = int(max_result[0].cells["max_connections"]) if max_result else 0

            # Get connection details
            details_query = """
                SELECT
                    pid,
                    usename,
                    application_name,
                    client_addr::text as client_addr,
                    state,
                    query_start::text as query_start,
                    state_change::text as state_change,
                    wait_event_type,
                    wait_event,
                    LEFT(query, 100) as query_preview
                FROM pg_stat_activity
                WHERE pid != pg_backend_pid()
                ORDER BY query_start DESC NULLS LAST
                LIMIT 20
            """
            details_result = await sql_driver.execute_query(details_query)
            connection_details = [row.cells for row in details_result] if details_result else []

            # Calculate utilization
            utilization = (conn_stats.get("total_connections", 0) / max_connections * 100) if max_connections > 0 else 0

            warnings_conn: list[dict[str, Any]] = []

            connections_info: dict[str, Any] = {
                "summary": conn_stats,
                "max_connections": max_connections,
                "utilization_percent": round(utilization, 2),
                "recent_connections": connection_details,
                "warnings": warnings_conn,
            }

            # Add warnings
            if utilization > 80:
                warnings_conn.append(
                    {
                        "severity": "HIGH",
                        "message": f"Connection pool utilization at {utilization:.1f}% - approaching limit",
                        "recommendation": "Consider increasing max_connections or optimizing connection pooling",
                    }
                )

            if conn_stats.get("idle_in_transaction", 0) > 5:
                warnings_conn.append(
                    {
                        "severity": "MEDIUM",
                        "message": f"{conn_stats['idle_in_transaction']} connections idle in transaction",
                        "recommendation": "Review application connection handling - may indicate transaction leaks",
                    }
                )

            if len(warnings_conn) == 0:
                warnings_conn.append({"severity": "INFO", "message": "Connection pool looks healthy"})

            return json.dumps(connections_info, indent=2)

        except Exception as e:
            logger.error(f"Error generating connections resource: {e}")
            return json.dumps({"error": str(e)}, indent=2)

    @mcp.resource("database://replication")
    async def get_replication_info() -> str:  # pyright: ignore[reportUnusedFunction]
        """Return replication status and lag."""
        try:
            sql_driver = await get_sql_driver_func()

            # Check if we're on primary or replica
            role_query = "SELECT pg_is_in_recovery() as is_replica"
            role_result = await sql_driver.execute_query(role_query)
            is_replica = role_result[0].cells["is_replica"] if role_result else False

            replication_info: dict[str, Any] = {
                "role": "replica" if is_replica else "primary",
                "replication_slots": [],
                "replication_stats": [],
                "wal_status": {},
            }

            if not is_replica:
                # Primary server - get replication slots
                slots_query = """
                    SELECT
                        slot_name,
                        slot_type,
                        database,
                        active,
                        restart_lsn,
                        confirmed_flush_lsn,
                        wal_status,
                        safe_wal_size
                    FROM pg_replication_slots
                """
                slots_result = await sql_driver.execute_query(slots_query)
                replication_info["replication_slots"] = [row.cells for row in slots_result] if slots_result else []

                # Get replication statistics
                stats_query = """
                    SELECT
                        client_addr,
                        application_name,
                        state,
                        sync_state,
                        replay_lsn,
                        write_lag,
                        flush_lag,
                        replay_lag
                    FROM pg_stat_replication
                """
                stats_result = await sql_driver.execute_query(stats_query)
                replication_info["replication_stats"] = [row.cells for row in stats_result] if stats_result else []
            else:
                # Replica server - get replication delay
                lag_query = """
                    SELECT
                        now() - pg_last_xact_replay_timestamp() AS replication_delay
                """
                lag_result = await sql_driver.execute_query(lag_query)
                replication_info["replication_delay"] = str(lag_result[0].cells["replication_delay"]) if lag_result else "Unknown"

            # Get WAL status
            wal_query = """
                SELECT
                    pg_current_wal_lsn() as current_wal_lsn,
                    pg_walfile_name(pg_current_wal_lsn()) as current_wal_file
            """
            wal_result = await sql_driver.execute_query(wal_query)
            replication_info["wal_status"] = wal_result[0].cells if wal_result else {}

            return json.dumps(replication_info, indent=2)

        except Exception as e:
            logger.error(f"Error generating replication resource: {e}")
            return json.dumps({"error": str(e), "note": "Replication monitoring requires appropriate permissions"}, indent=2)

    @mcp.resource("database://vacuum")
    async def get_vacuum_info() -> str:  # pyright: ignore[reportUnusedFunction]
        """Return vacuum status and transaction ID wraparound info."""
        try:
            sql_driver = await get_sql_driver_func()

            # Get vacuum statistics
            vacuum_query = """
                SELECT
                    schemaname,
                    relname,
                    last_vacuum,
                    last_autovacuum,
                    last_analyze,
                    last_autoanalyze,
                    vacuum_count,
                    autovacuum_count,
                    analyze_count,
                    autoanalyze_count,
                    n_dead_tup,
                    n_live_tup,
                    CASE
                        WHEN n_live_tup > 0
                        THEN round(100.0 * n_dead_tup / n_live_tup, 2)::float
                        ELSE 0
                    END as dead_tuple_percent
                FROM pg_stat_user_tables
                WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
                ORDER BY n_dead_tup DESC
                LIMIT 20
            """
            vacuum_result = await sql_driver.execute_query(vacuum_query)
            vacuum_stats = [row.cells for row in vacuum_result] if vacuum_result else []

            # Get transaction ID wraparound info
            wraparound_query = """
                SELECT
                    datname,
                    age(datfrozenxid) as xid_age,
                    2147483648 - age(datfrozenxid) as xids_until_wraparound,
                    round(100.0 * age(datfrozenxid) / 2147483648, 2)::float as percent_toward_wraparound
                FROM pg_database
                WHERE datname = current_database()
            """
            wraparound_result = await sql_driver.execute_query(wraparound_query)
            wraparound_info = wraparound_result[0].cells if wraparound_result else {}

            warnings_vac: list[dict[str, Any]] = []

            vacuum_info: dict[str, Any] = {"vacuum_statistics": vacuum_stats, "transaction_id_wraparound": wraparound_info, "warnings": warnings_vac}

            # Add warnings
            if wraparound_info.get("percent_toward_wraparound", 0) > 75:
                warnings_vac.append(
                    {
                        "severity": "CRITICAL",
                        "message": f"Transaction ID wraparound at {wraparound_info['percent_toward_wraparound']}%",
                        "recommendation": "Run VACUUM FREEZE immediately to prevent database shutdown",
                    }
                )
            elif wraparound_info.get("percent_toward_wraparound", 0) > 50:
                warnings_vac.append(
                    {
                        "severity": "HIGH",
                        "message": f"Transaction ID wraparound at {wraparound_info['percent_toward_wraparound']}%",
                        "recommendation": "Schedule VACUUM FREEZE during maintenance window",
                    }
                )

            for table in vacuum_stats[:5]:
                if table["dead_tuple_percent"] > 20:
                    warnings_vac.append(
                        {
                            "severity": "MEDIUM",
                            "table": f"{table['schemaname']}.{table['relname']}",
                            "message": f"{table['dead_tuple_percent']}% dead tuples",
                            "recommendation": f"Run VACUUM ANALYZE {table['schemaname']}.{table['relname']};",
                        }
                    )

            if len(warnings_vac) == 0:
                warnings_vac.append({"severity": "INFO", "message": "Vacuum status looks healthy"})

            return json.dumps(vacuum_info, indent=2)

        except Exception as e:
            logger.error(f"Error generating vacuum resource: {e}")
            return json.dumps({"error": str(e)}, indent=2)

    @mcp.resource("database://locks")
    async def get_locks_info() -> str:  # pyright: ignore[reportUnusedFunction]
        """Return current lock information."""
        try:
            sql_driver = await get_sql_driver_func()

            # Get lock information
            locks_query = """
                SELECT
                    l.locktype,
                    l.mode,
                    l.granted,
                    l.pid,
                    a.usename,
                    a.application_name,
                    a.client_addr::text as client_addr,
                    a.state,
                    a.wait_event_type,
                    a.wait_event,
                    COALESCE(r.relname, l.relation::text) as relation,
                    LEFT(a.query, 100) as query_preview,
                    EXTRACT(EPOCH FROM age(now(), a.query_start))::float as query_duration_seconds
                FROM pg_locks l
                LEFT JOIN pg_stat_activity a ON l.pid = a.pid
                LEFT JOIN pg_class r ON l.relation = r.oid
                WHERE l.pid != pg_backend_pid()
                ORDER BY l.granted, a.query_start NULLS LAST
                LIMIT 50
            """
            locks_result = await sql_driver.execute_query(locks_query)
            locks = [row.cells for row in locks_result] if locks_result else []

            # Analyze locks
            blocking_locks = [lock for lock in locks if not lock["granted"]]
            active_locks = [lock for lock in locks if lock["granted"]]

            warnings_lock: list[dict[str, Any]] = []

            locks_info: dict[str, Any] = {
                "total_locks": len(locks),
                "active_locks": len(active_locks),
                "blocking_locks": len(blocking_locks),
                "lock_details": locks,
                "warnings": warnings_lock,
            }

            # Add warnings
            if len(blocking_locks) > 0:
                warnings_lock.append(
                    {
                        "severity": "HIGH",
                        "message": f"{len(blocking_locks)} blocked queries detected",
                        "recommendation": "Review blocking queries and consider terminating long-running transactions",
                    }
                )

            if len(locks) > 100:
                warnings_lock.append(
                    {
                        "severity": "MEDIUM",
                        "message": f"High number of locks ({len(locks)}) - showing top 50",
                        "recommendation": "May indicate lock contention or long-running transactions",
                    }
                )

            if len(warnings_lock) == 0:
                warnings_lock.append({"severity": "INFO", "message": "No lock contention detected"})

            return json.dumps(locks_info, indent=2)

        except Exception as e:
            logger.error(f"Error generating locks resource: {e}")
            return json.dumps({"error": str(e)}, indent=2)

    @mcp.resource("database://statistics")
    async def get_statistics_info() -> str:  # pyright: ignore[reportUnusedFunction]
        """Return table/index statistics quality."""
        try:
            sql_driver = await get_sql_driver_func()

            # Get statistics age
            stats_query = """
                SELECT
                    schemaname,
                    relname as tablename,
                    last_vacuum,
                    last_autovacuum,
                    last_analyze,
                    last_autoanalyze,
                    n_live_tup,
                    n_dead_tup,
                    n_mod_since_analyze,
                    CASE
                        WHEN n_live_tup > 0
                        THEN round(100.0 * n_mod_since_analyze / n_live_tup, 2)::float
                        ELSE 0
                    END as percent_modified_since_analyze
                FROM pg_stat_user_tables
                WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
                ORDER BY n_mod_since_analyze DESC
                LIMIT 20
            """
            stats_result = await sql_driver.execute_query(stats_query)
            statistics = [row.cells for row in stats_result] if stats_result else []

            statistics_info = {"table_statistics": statistics, "recommendations": []}

            # Add recommendations
            for table in statistics[:10]:
                if table["percent_modified_since_analyze"] > 20:
                    statistics_info["recommendations"].append(
                        {
                            "priority": "HIGH",
                            "table": f"{table['schemaname']}.{table['tablename']}",
                            "percent_stale": table["percent_modified_since_analyze"],
                            "action": f"ANALYZE {table['schemaname']}.{table['tablename']};",
                            "reason": "Stale statistics may lead to poor query plans",
                        }
                    )
                elif table["percent_modified_since_analyze"] > 10:
                    statistics_info["recommendations"].append(
                        {
                            "priority": "MEDIUM",
                            "table": f"{table['schemaname']}.{table['tablename']}",
                            "percent_stale": table["percent_modified_since_analyze"],
                            "action": f"ANALYZE {table['schemaname']}.{table['tablename']};",
                            "reason": "Statistics could be fresher for optimal query planning",
                        }
                    )

            if len(statistics_info["recommendations"]) == 0:
                statistics_info["recommendations"].append({"priority": "INFO", "message": "Table statistics are up to date"})

            return json.dumps(statistics_info, indent=2)

        except Exception as e:
            logger.error(f"Error generating statistics resource: {e}")
            return json.dumps({"error": str(e)}, indent=2)

    logger.info(
        "Registered 10 database resources: schema, capabilities, performance, "
        "health, extensions, indexes, connections, replication, vacuum, locks, statistics"
    )
