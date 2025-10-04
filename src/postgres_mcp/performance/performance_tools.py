"""Performance Intelligence Tools for PostgreSQL MCP Server.

This module provides 6 performance intelligence tools:
- query_plan_compare: Compare execution plans
- performance_baseline: Establish performance baselines
- slow_query_analyzer: Advanced slow query analysis
- connection_pool_optimize: Connection optimization
- vacuum_strategy_recommend: Vacuum strategy optimization
- partition_strategy_suggest: Partitioning recommendations
"""

import json
import logging
from typing import Any
from typing import Dict
from typing import List
from typing import Optional
from typing import cast

from typing_extensions import LiteralString

from ..sql import SqlDriver

logger = logging.getLogger(__name__)


class PerformanceTools:
    """Performance intelligence operations for PostgreSQL."""

    def __init__(self, sql_driver: SqlDriver):
        """Initialize performance tools.

        Args:
            sql_driver: SQL driver instance for database operations
        """
        self.sql_driver = sql_driver

    async def query_plan_compare(
        self,
        query1: str,
        query2: str,
        params1: Optional[List[Any]] = None,
        params2: Optional[List[Any]] = None,
    ) -> Dict[str, Any]:
        """Compare execution plans of two queries.

        Args:
            query1: First SQL query
            query2: Second SQL query
            params1: Parameters for first query
            params2: Parameters for second query

        Returns:
            Comparison of execution plans with cost analysis

        Examples:
            # Compare two query variations
            await query_plan_compare(
                'SELECT * FROM users WHERE email = %s',
                'SELECT * FROM users WHERE LOWER(email) = LOWER(%s)',
                params1=['test@example.com'],
                params2=['test@example.com']
            )
        """
        try:
            params1 = params1 or []
            params2 = params2 or []

            # Get plan for query 1
            explain_query1 = cast(LiteralString, f"EXPLAIN (FORMAT JSON, ANALYZE) {query1}")
            result1 = await self.sql_driver.execute_query(explain_query1, params1)

            if not result1:
                return {
                    "success": False,
                    "error": "Failed to get plan for query 1",
                }

            plan1_data = result1[0].cells.get("QUERY PLAN")
            # Handle both string and list responses
            plan1: Dict[str, Any]
            if isinstance(plan1_data, str):
                plan1 = cast(Dict[str, Any], json.loads(plan1_data)[0]["Plan"])
            elif isinstance(plan1_data, list):
                plan1 = cast(Dict[str, Any], plan1_data[0]["Plan"])
            else:
                plan1 = {}

            # Get plan for query 2
            explain_query2 = cast(LiteralString, f"EXPLAIN (FORMAT JSON, ANALYZE) {query2}")
            result2 = await self.sql_driver.execute_query(explain_query2, params2)

            if not result2:
                return {
                    "success": False,
                    "error": "Failed to get plan for query 2",
                }

            plan2_data = result2[0].cells.get("QUERY PLAN")
            # Handle both string and list responses
            plan2: Dict[str, Any]
            if isinstance(plan2_data, str):
                plan2 = cast(Dict[str, Any], json.loads(plan2_data)[0]["Plan"])
            elif isinstance(plan2_data, list):
                plan2 = cast(Dict[str, Any], plan2_data[0]["Plan"])
            else:
                plan2 = {}

            # Extract key metrics
            cost1 = float(plan1.get("Total Cost", 0))
            cost2 = float(plan2.get("Total Cost", 0))
            time1 = float(plan1.get("Actual Total Time", 0))
            time2 = float(plan2.get("Actual Total Time", 0))

            # Calculate differences
            cost_diff = cost2 - cost1
            cost_diff_pct = (cost_diff / cost1 * 100) if cost1 > 0 else 0.0
            time_diff = time2 - time1
            time_diff_pct = (time_diff / time1 * 100) if time1 > 0 else 0.0

            return {
                "success": True,
                "query1": {
                    "estimated_cost": cost1,
                    "actual_time_ms": time1,
                    "node_type": plan1.get("Node Type"),
                    "rows": plan1.get("Actual Rows"),
                },
                "query2": {
                    "estimated_cost": cost2,
                    "actual_time_ms": time2,
                    "node_type": plan2.get("Node Type"),
                    "rows": plan2.get("Actual Rows"),
                },
                "comparison": {
                    "cost_difference": cost_diff,
                    "cost_difference_percent": cost_diff_pct,
                    "time_difference_ms": time_diff,
                    "time_difference_percent": time_diff_pct,
                    "recommendation": "Query 1 is faster" if time1 < time2 else "Query 2 is faster",
                },
                "plans": {
                    "query1_plan": plan1,
                    "query2_plan": plan2,
                },
            }

        except Exception as e:
            logger.error(f"Error in query_plan_compare: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def performance_baseline(
        self,
        queries: List[str],
        iterations: int = 5,
    ) -> Dict[str, Any]:
        """Establish performance baselines for critical queries.

        Args:
            queries: List of SQL queries to baseline
            iterations: Number of times to run each query

        Returns:
            Performance baseline metrics for each query

        Examples:
            # Establish baseline for key queries
            await performance_baseline([
                'SELECT * FROM users WHERE active = true',
                'SELECT * FROM orders WHERE status = \'pending\''
            ], iterations=10)
        """
        try:
            baselines: List[Dict[str, Any]] = []

            for query in queries:
                times: List[float] = []
                costs: List[float] = []

                for _ in range(iterations):
                    # Run with EXPLAIN ANALYZE
                    explain_query = cast(LiteralString, f"EXPLAIN (FORMAT JSON, ANALYZE) {query}")
                    result = await self.sql_driver.execute_query(explain_query)

                    if result:
                        plan_data = result[0].cells.get("QUERY PLAN")
                        if plan_data:
                            # Handle both string and list responses
                            plan: Dict[str, Any]
                            if isinstance(plan_data, str):
                                plan = cast(Dict[str, Any], json.loads(plan_data)[0])
                            elif isinstance(plan_data, list):
                                plan = cast(Dict[str, Any], plan_data[0])
                            else:
                                continue
                            times.append(float(plan["Plan"].get("Actual Total Time", 0)))
                            costs.append(float(plan["Plan"].get("Total Cost", 0)))

                if times:
                    avg_time = sum(times) / len(times)
                    min_time = min(times)
                    max_time = max(times)
                    stddev_time = (sum((t - avg_time) ** 2 for t in times) / len(times)) ** 0.5

                    baselines.append(
                        {
                            "query": query[:100] + "..." if len(query) > 100 else query,
                            "iterations": len(times),
                            "avg_time_ms": avg_time,
                            "min_time_ms": min_time,
                            "max_time_ms": max_time,
                            "stddev_time_ms": stddev_time,
                            "avg_cost": sum(costs) / len(costs) if costs else 0,
                        }
                    )

            return {
                "success": True,
                "baselines": baselines,
                "total_queries": len(queries),
                "iterations_per_query": iterations,
            }

        except Exception as e:
            logger.error(f"Error in performance_baseline: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def slow_query_analyzer(
        self,
        min_duration_ms: float = 1000,
        limit: int = 20,
    ) -> Dict[str, Any]:
        """Analyze slow queries with detailed metrics.

        Args:
            min_duration_ms: Minimum query duration to analyze (milliseconds)
            limit: Maximum number of queries to return

        Returns:
            Slow query analysis with optimization suggestions

        Examples:
            # Find queries taking over 1 second
            await slow_query_analyzer(min_duration_ms=1000, limit=20)

        Note:
            Requires pg_stat_statements extension
        """
        try:
            # Check for pg_stat_statements
            check_query = """
            SELECT EXISTS(
                SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
            ) as has_extension
            """
            result = await self.sql_driver.execute_query(check_query)

            if not result or not result[0].cells.get("has_extension"):
                return {
                    "success": False,
                    "error": "pg_stat_statements extension not installed. Run: CREATE EXTENSION IF NOT EXISTS pg_stat_statements;",
                }

            query = f"""
            SELECT
                queryid,
                LEFT(query, 100) as query_preview,
                calls,
                total_exec_time,
                mean_exec_time,
                min_exec_time,
                max_exec_time,
                stddev_exec_time,
                rows,
                shared_blks_hit,
                shared_blks_read,
                shared_blks_dirtied,
                shared_blks_written,
                temp_blks_read,
                temp_blks_written,
                CASE
                    WHEN shared_blks_hit + shared_blks_read > 0
                    THEN (shared_blks_hit::float / (shared_blks_hit + shared_blks_read) * 100)
                    ELSE 0
                END as cache_hit_ratio
            FROM pg_stat_statements
            WHERE mean_exec_time > {min_duration_ms}
            ORDER BY mean_exec_time DESC
            LIMIT {limit}
            """

            result = await self.sql_driver.execute_query(cast(LiteralString, query))

            if not result:
                return {
                    "success": True,
                    "slow_queries": [],
                    "message": "No slow queries found",
                }

            slow_queries: List[Dict[str, Any]] = []
            for row in result:
                cells = row.cells
                query_data = {
                    "queryid": str(cells.get("queryid")),
                    "query_preview": cells.get("query_preview"),
                    "calls": int(cells.get("calls", 0)),
                    "total_time_ms": float(cells.get("total_exec_time", 0)),
                    "mean_time_ms": float(cells.get("mean_exec_time", 0)),
                    "min_time_ms": float(cells.get("min_exec_time", 0)),
                    "max_time_ms": float(cells.get("max_exec_time", 0)),
                    "stddev_time_ms": float(cells.get("stddev_exec_time", 0)),
                    "rows_per_call": int(cells.get("rows", 0)) / max(int(cells.get("calls", 1)), 1),
                    "cache_hit_ratio": float(cells.get("cache_hit_ratio", 0)),
                }

                # Generate optimization suggestions
                suggestions: List[str] = []
                cache_hit_ratio = query_data["cache_hit_ratio"]
                stddev_time = query_data["stddev_time_ms"]
                mean_time = query_data["mean_time_ms"]
                if isinstance(cache_hit_ratio, (int, float)) and cache_hit_ratio < 90:
                    suggestions.append("Low cache hit ratio - consider adding indexes or increasing shared_buffers")
                if isinstance(stddev_time, (int, float)) and isinstance(mean_time, (int, float)) and stddev_time > mean_time:
                    suggestions.append("High variance in execution time - query performance is inconsistent")
                if cells.get("temp_blks_written", 0) > 0:
                    suggestions.append("Query using temp space - consider increasing work_mem")

                query_data["optimization_suggestions"] = suggestions
                slow_queries.append(query_data)

            return {
                "success": True,
                "slow_queries": slow_queries,
                "total_found": len(slow_queries),
                "min_duration_ms": min_duration_ms,
            }

        except Exception as e:
            logger.error(f"Error in slow_query_analyzer: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def connection_pool_optimize(self) -> Dict[str, Any]:
        """Analyze and optimize connection pool settings.

        Returns:
            Connection pool analysis and optimization recommendations

        Examples:
            # Get connection pool recommendations
            await connection_pool_optimize()
        """
        try:
            query = """
            WITH conn_stats AS (
                SELECT
                    COUNT(*) as total_connections,
                    COUNT(*) FILTER (WHERE state = 'active') as active_connections,
                    COUNT(*) FILTER (WHERE state = 'idle') as idle_connections,
                    COUNT(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction,
                    COUNT(*) FILTER (WHERE wait_event_type IS NOT NULL) as waiting_connections,
                    MAX(EXTRACT(EPOCH FROM (NOW() - backend_start))) as max_conn_age_seconds,
                    AVG(EXTRACT(EPOCH FROM (NOW() - backend_start))) as avg_conn_age_seconds
                FROM pg_stat_activity
                WHERE pid != pg_backend_pid()
            ),
            settings AS (
                SELECT
                    current_setting('max_connections')::int as max_connections,
                    current_setting('superuser_reserved_connections')::int as superuser_reserved
            )
            SELECT
                conn_stats.*,
                settings.max_connections,
                settings.superuser_reserved,
                settings.max_connections - settings.superuser_reserved as available_connections,
                (conn_stats.total_connections::float / (settings.max_connections - settings.superuser_reserved) * 100) as utilization_percent
            FROM conn_stats, settings
            """

            result = await self.sql_driver.execute_query(query)

            if not result:
                return {
                    "success": False,
                    "error": "Failed to get connection statistics",
                }

            row = result[0].cells
            total = int(row.get("total_connections", 0))
            max_conn = int(row.get("max_connections", 100))
            available = int(row.get("available_connections", 100))
            utilization = float(row.get("utilization_percent", 0))
            active = int(row.get("active_connections", 0))
            idle = int(row.get("idle_connections", 0))
            idle_in_txn = int(row.get("idle_in_transaction", 0))

            # Generate recommendations
            recommendations: List[str] = []

            if utilization > 80:
                recommended_max = int(max_conn * 1.5)
                recommendations.append(f"High connection utilization ({utilization:.1f}%) - consider increasing max_connections to {recommended_max}")

            if idle > active * 2:
                recommendations.append(f"Many idle connections ({idle}) compared to active ({active}) - consider connection pooling (pgBouncer)")

            if idle_in_txn > 0:
                recommendations.append(f"{idle_in_txn} idle in transaction connections - review application transaction management")

            if utilization < 20 and max_conn > 100:
                recommendations.append(f"Low utilization ({utilization:.1f}%) - max_connections might be too high")

            return {
                "success": True,
                "current_connections": {
                    "total": total,
                    "active": active,
                    "idle": idle,
                    "idle_in_transaction": idle_in_txn,
                    "waiting": int(row.get("waiting_connections", 0)),
                },
                "limits": {
                    "max_connections": max_conn,
                    "available_connections": available,
                    "utilization_percent": utilization,
                },
                "age": {
                    "max_connection_age_seconds": float(row.get("max_conn_age_seconds", 0)),
                    "avg_connection_age_seconds": float(row.get("avg_conn_age_seconds", 0)),
                },
                "recommendations": recommendations,
            }

        except Exception as e:
            logger.error(f"Error in connection_pool_optimize: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def vacuum_strategy_recommend(
        self,
        table_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Analyze vacuum needs and recommend strategy.

        Args:
            table_name: Optional specific table to analyze

        Returns:
            Vacuum strategy recommendations

        Examples:
            # Analyze all tables
            await vacuum_strategy_recommend()

            # Analyze specific table
            await vacuum_strategy_recommend(table_name='large_table')
        """
        try:
            if table_name:
                where_clause = f"AND schemaname || '.' || relname = '{table_name}'"
            else:
                where_clause = ""

            query = f"""
            WITH table_stats AS (
                SELECT
                    schemaname,
                    relname,
                    n_live_tup,
                    n_dead_tup,
                    n_mod_since_analyze,
                    last_vacuum,
                    last_autovacuum,
                    last_analyze,
                    last_autoanalyze,
                    CASE
                        WHEN n_live_tup > 0
                        THEN (n_dead_tup::float / n_live_tup * 100)
                        ELSE 0
                    END as dead_tuple_percent,
                    pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) as table_size,
                    pg_total_relation_size(schemaname||'.'||relname) as table_size_bytes
                FROM pg_stat_user_tables
                WHERE n_live_tup > 0
                {where_clause}
                ORDER BY n_dead_tup DESC
                LIMIT 20
            )
            SELECT
                schemaname,
                relname,
                n_live_tup,
                n_dead_tup,
                n_mod_since_analyze,
                dead_tuple_percent,
                table_size,
                table_size_bytes,
                last_vacuum,
                last_autovacuum,
                last_analyze,
                last_autoanalyze,
                CASE
                    WHEN dead_tuple_percent > 20 THEN 'URGENT'
                    WHEN dead_tuple_percent > 10 THEN 'HIGH'
                    WHEN dead_tuple_percent > 5 THEN 'MEDIUM'
                    ELSE 'LOW'
                END as priority
            FROM table_stats
            ORDER BY dead_tuple_percent DESC, table_size_bytes DESC
            """

            result = await self.sql_driver.execute_query(cast(LiteralString, query))

            if not result:
                return {
                    "success": True,
                    "tables": [],
                    "message": "No tables need vacuum",
                }

            tables: List[Dict[str, Any]] = []
            for row in result:
                cells = row.cells
                dead_pct = float(cells.get("dead_tuple_percent", 0))
                priority = cells.get("priority")

                # Generate recommendations
                recommendations: List[str] = []
                if dead_pct > 20:
                    recommendations.append("URGENT: Run VACUUM FULL immediately")
                elif dead_pct > 10:
                    recommendations.append("Run VACUUM ANALYZE soon")
                elif dead_pct > 5:
                    recommendations.append("Schedule regular VACUUM")

                if cells.get("n_mod_since_analyze", 0) > 10000:
                    recommendations.append("Run ANALYZE to update statistics")

                tables.append(
                    {
                        "schema": cells.get("schemaname"),
                        "table": cells.get("relname"),
                        "live_tuples": int(cells.get("n_live_tup", 0)),
                        "dead_tuples": int(cells.get("n_dead_tup", 0)),
                        "dead_tuple_percent": dead_pct,
                        "modifications_since_analyze": int(cells.get("n_mod_since_analyze", 0)),
                        "table_size": cells.get("table_size"),
                        "last_vacuum": str(cells.get("last_vacuum")) if cells.get("last_vacuum") else "Never",
                        "last_autovacuum": str(cells.get("last_autovacuum")) if cells.get("last_autovacuum") else "Never",
                        "priority": priority,
                        "recommendations": recommendations,
                    }
                )

            return {
                "success": True,
                "tables": tables,
                "total_analyzed": len(tables),
            }

        except Exception as e:
            logger.error(f"Error in vacuum_strategy_recommend: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def partition_strategy_suggest(
        self,
        table_name: str,
        partition_column: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Suggest partitioning strategy for large tables.

        Args:
            table_name: Table name to analyze
            partition_column: Optional column to analyze for partitioning

        Returns:
            Partitioning strategy recommendations

        Examples:
            # Analyze table for partitioning
            await partition_strategy_suggest('orders')

            # Analyze specific column
            await partition_strategy_suggest('orders', partition_column='created_at')
        """
        try:
            # Get table statistics
            table_query = f"""
            SELECT
                pg_size_pretty(pg_total_relation_size('{table_name}')) as table_size,
                pg_total_relation_size('{table_name}') as table_size_bytes,
                n_live_tup as row_count
            FROM pg_stat_user_tables
            WHERE schemaname || '.' || relname = '{table_name}'
               OR relname = '{table_name}'
            """

            table_result = await self.sql_driver.execute_query(cast(LiteralString, table_query))

            if not table_result:
                return {
                    "success": False,
                    "error": f"Table '{table_name}' not found",
                }

            table_info = table_result[0].cells
            table_size_bytes = int(table_info.get("table_size_bytes", 0))
            row_count = int(table_info.get("row_count", 0))

            # Partitioning only makes sense for large tables
            size_threshold = 10 * 1024 * 1024 * 1024  # 10 GB
            row_threshold = 10_000_000  # 10 million rows

            recommendations: List[str] = []
            partition_benefit = "LOW"

            if table_size_bytes > size_threshold or row_count > row_threshold:
                partition_benefit = "HIGH"
                recommendations.append("Table size justifies partitioning")

                if partition_column:
                    # Analyze partition column distribution
                    dist_query = f"""
                    SELECT
                        pg_typeof({partition_column}) as column_type,
                        COUNT(DISTINCT {partition_column}) as distinct_values,
                        MIN({partition_column}) as min_value,
                        MAX({partition_column}) as max_value
                    FROM {table_name}
                    """

                    dist_result = await self.sql_driver.execute_query(cast(LiteralString, dist_query))

                    if dist_result:
                        dist_info = dist_result[0].cells
                        col_type = str(dist_info.get("column_type", ""))
                        distinct_vals = int(dist_info.get("distinct_values", 0))

                        if "timestamp" in col_type.lower() or "date" in col_type.lower():
                            recommendations.append(f"RANGE partitioning recommended for {partition_column} (temporal data)")
                            recommendations.append("Suggested: Partition by month or year")
                        elif distinct_vals < 100:
                            recommendations.append(f"LIST partitioning recommended for {partition_column} (low cardinality)")
                        else:
                            recommendations.append(f"HASH partitioning recommended for {partition_column} (high cardinality)")
                else:
                    # Suggest analyzing temporal columns
                    col_query = f"""
                    SELECT column_name, data_type
                    FROM information_schema.columns
                    WHERE table_name = '{table_name.split(".")[-1]}'
                      AND (data_type LIKE '%timestamp%' OR data_type LIKE '%date%')
                    ORDER BY ordinal_position
                    """

                    col_result = await self.sql_driver.execute_query(cast(LiteralString, col_query))

                    if col_result:
                        temporal_cols = [str(row.cells.get("column_name")) for row in col_result if row.cells.get("column_name")]
                        if temporal_cols:
                            recommendations.append(f"Consider RANGE partitioning on temporal columns: {', '.join(temporal_cols)}")
            else:
                partition_benefit = "LOW"
                recommendations.append("Table size doesn't justify partitioning overhead")

            return {
                "success": True,
                "table": table_name,
                "current_stats": {
                    "table_size": table_info.get("table_size"),
                    "table_size_bytes": table_size_bytes,
                    "row_count": row_count,
                },
                "partition_benefit": partition_benefit,
                "recommendations": recommendations,
            }

        except Exception as e:
            logger.error(f"Error in partition_strategy_suggest: {e}")
            return {
                "success": False,
                "error": str(e),
            }
