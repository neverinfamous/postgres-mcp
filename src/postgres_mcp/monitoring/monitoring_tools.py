"""Monitoring and Alerting Tools for PostgreSQL MCP Server.

This module provides 5 monitoring and alerting tools:
- monitor_real_time: Real-time performance monitoring
- alert_threshold_set: Configure performance alert thresholds
- capacity_planning: Growth projection and capacity analysis
- resource_usage_analyze: CPU/Memory/IO resource analysis
- replication_monitor: Replication lag and status monitoring
"""

import logging
from typing import Any
from typing import Dict
from typing import Optional
from typing import cast

from typing_extensions import LiteralString

from ..sql import SqlDriver

logger = logging.getLogger(__name__)


def safe_float(value: Any) -> Optional[float]:
    """Safely convert a value to float, returning None if not possible."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def safe_int(value: Any) -> Optional[int]:
    """Safely convert a value to int, returning None if not possible."""
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


class MonitoringTools:
    """Monitoring and alerting operations for PostgreSQL."""

    def __init__(self, sql_driver: SqlDriver):
        """Initialize monitoring tools.

        Args:
            sql_driver: SQL driver instance for database operations
        """
        self.sql_driver = sql_driver

    async def _check_pg_stat_statements_installed(self) -> bool:
        """Check if pg_stat_statements extension is installed.

        Returns:
            True if pg_stat_statements is installed, False otherwise
        """
        try:
            check_query = """
            SELECT EXISTS(
                SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
            ) as has_pg_stat_statements
            """
            result = await self.sql_driver.execute_query(check_query)
            return bool(result and result[0].cells.get("has_pg_stat_statements"))
        except Exception as e:
            logger.error(f"Error checking pg_stat_statements installation: {e}")
            return False

    async def monitor_real_time(
        self,
        include_queries: bool = True,
        include_locks: bool = True,
        include_io: bool = True,
        limit: int = 20,
    ) -> Dict[str, Any]:
        """Monitor real-time database performance metrics.

        This tool provides a snapshot of current database activity including
        active queries, locks, I/O statistics, and connection status.

        Args:
            include_queries: Include currently running queries
            include_locks: Include lock information
            include_io: Include I/O statistics
            limit: Maximum number of items per category

        Returns:
            Real-time performance monitoring data

        Examples:
            await monitor_real_time()
            await monitor_real_time(include_queries=True, include_locks=True)
        """
        try:
            result: Dict[str, Any] = {"success": True, "timestamp": "NOW()", "metrics": {}}

            # Get current timestamp
            time_query = cast(LiteralString, "SELECT NOW() as current_time")
            time_result = await self.sql_driver.execute_query(time_query)
            if time_result:
                result["timestamp"] = str(time_result[0].cells.get("current_time", ""))

            # Active connections and states
            conn_query = cast(
                LiteralString,
                """
            SELECT
                state,
                COUNT(*) as count,
                COUNT(*) FILTER (WHERE wait_event_type IS NOT NULL) as waiting
            FROM pg_stat_activity
            WHERE datname = current_database()
            GROUP BY state
            ORDER BY count DESC
            """,
            )
            connections = await self.sql_driver.execute_query(conn_query)

            conn_summary = []
            total_connections = 0
            if connections:
                for conn in connections:
                    count = safe_int(conn.cells.get("count", 0)) or 0
                    total_connections += count
                    conn_summary.append(
                        {
                            "state": conn.cells.get("state"),
                            "count": count,
                            "waiting": safe_int(conn.cells.get("waiting", 0)),
                        }
                    )

            result["metrics"]["connections"] = {
                "total": total_connections,
                "by_state": conn_summary,
            }

            # Currently running queries
            if include_queries:
                query_query = """
                SELECT
                    pid,
                    usename,
                    application_name,
                    client_addr,
                    state,
                    wait_event_type,
                    wait_event,
                    state_change,
                    query_start,
                    EXTRACT(EPOCH FROM (NOW() - query_start)) as duration_seconds,
                    LEFT(query, 200) as query_preview
                FROM pg_stat_activity
                WHERE datname = current_database()
                    AND state != 'idle'
                    AND pid != pg_backend_pid()
                ORDER BY query_start
                LIMIT %s
                """
                queries = await self.sql_driver.execute_query(query_query, [limit])

                query_list = []
                if queries:
                    for query in queries:
                        duration = safe_float(query.cells.get("duration_seconds", 0))
                        query_list.append(
                            {
                                "pid": safe_int(query.cells.get("pid")),
                                "user": query.cells.get("usename"),
                                "application": query.cells.get("application_name"),
                                "client_address": query.cells.get("client_addr"),
                                "state": query.cells.get("state"),
                                "wait_event_type": query.cells.get("wait_event_type"),
                                "wait_event": query.cells.get("wait_event"),
                                "duration_seconds": round(duration, 2) if duration else 0,
                                "query_preview": query.cells.get("query_preview"),
                            }
                        )

                result["metrics"]["active_queries"] = {
                    "count": len(query_list),
                    "queries": query_list,
                }

            # Lock information
            if include_locks:
                lock_query = """
                SELECT
                    locktype,
                    mode,
                    COUNT(*) as count,
                    COUNT(*) FILTER (WHERE NOT granted) as blocked
                FROM pg_locks
                WHERE database = (SELECT oid FROM pg_database WHERE datname = current_database())
                GROUP BY locktype, mode
                ORDER BY count DESC
                LIMIT %s
                """
                locks = await self.sql_driver.execute_query(lock_query, [limit])

                lock_list = []
                total_locks = 0
                total_blocked = 0
                if locks:
                    for lock in locks:
                        count = safe_int(lock.cells.get("count", 0)) or 0
                        blocked = safe_int(lock.cells.get("blocked", 0)) or 0
                        total_locks += count
                        total_blocked += blocked
                        lock_list.append(
                            {
                                "lock_type": lock.cells.get("locktype"),
                                "mode": lock.cells.get("mode"),
                                "count": count,
                                "blocked": blocked,
                            }
                        )

                result["metrics"]["locks"] = {
                    "total": total_locks,
                    "blocked": total_blocked,
                    "by_type": lock_list,
                }

            # I/O statistics
            if include_io:
                io_query = cast(
                    LiteralString,
                    """
                SELECT
                    SUM(heap_blks_read) as heap_blocks_read,
                    SUM(heap_blks_hit) as heap_blocks_hit,
                    SUM(idx_blks_read) as index_blocks_read,
                    SUM(idx_blks_hit) as index_blocks_hit,
                    CASE
                        WHEN SUM(heap_blks_read + heap_blks_hit) > 0
                        THEN ROUND(100.0 * SUM(heap_blks_hit) / SUM(heap_blks_read + heap_blks_hit), 2)
                        ELSE 0
                    END as heap_hit_ratio,
                    CASE
                        WHEN SUM(idx_blks_read + idx_blks_hit) > 0
                        THEN ROUND(100.0 * SUM(idx_blks_hit) / SUM(idx_blks_read + idx_blks_hit), 2)
                        ELSE 0
                    END as index_hit_ratio
                FROM pg_statio_user_tables
                """,
                )
                io_stats = await self.sql_driver.execute_query(io_query)

                if io_stats:
                    result["metrics"]["io_statistics"] = {
                        "heap_blocks_read": safe_int(io_stats[0].cells.get("heap_blocks_read", 0)),
                        "heap_blocks_hit": safe_int(io_stats[0].cells.get("heap_blocks_hit", 0)),
                        "index_blocks_read": safe_int(io_stats[0].cells.get("index_blocks_read", 0)),
                        "index_blocks_hit": safe_int(io_stats[0].cells.get("index_blocks_hit", 0)),
                        "heap_hit_ratio_percent": safe_float(io_stats[0].cells.get("heap_hit_ratio")),
                        "index_hit_ratio_percent": safe_float(io_stats[0].cells.get("index_hit_ratio")),
                    }

            # Database size and activity
            size_query = cast(
                LiteralString,
                """
            SELECT
                pg_database_size(current_database()) as db_size,
                pg_size_pretty(pg_database_size(current_database())) as db_size_pretty,
                (SELECT SUM(n_tup_ins + n_tup_upd + n_tup_del) FROM pg_stat_user_tables) as total_modifications
            """,
            )
            size_info = await self.sql_driver.execute_query(size_query)

            if size_info:
                result["metrics"]["database"] = {
                    "size_bytes": safe_int(size_info[0].cells.get("db_size", 0)),
                    "size_pretty": size_info[0].cells.get("db_size_pretty"),
                    "total_modifications": safe_int(size_info[0].cells.get("total_modifications", 0)),
                }

            return result

        except Exception as e:
            logger.error(f"Error in monitor_real_time: {e}")
            return {"success": False, "error": str(e)}

    async def alert_threshold_set(
        self,
        metric_type: str,
        warning_threshold: Optional[float] = None,
        critical_threshold: Optional[float] = None,
        check_current: bool = True,
    ) -> Dict[str, Any]:
        """Analyze metrics against alert thresholds.

        This tool evaluates current database metrics against provided thresholds
        and returns alert status. Supports multiple metric types.

        Args:
            metric_type: Type of metric ('connection_count', 'cache_hit_ratio',
                        'transaction_age', 'replication_lag', 'disk_usage')
            warning_threshold: Warning level threshold
            critical_threshold: Critical level threshold
            check_current: Check current value against thresholds

        Returns:
            Alert threshold analysis and current metric status

        Examples:
            await alert_threshold_set('connection_count', warning_threshold=80, critical_threshold=95)
            await alert_threshold_set('cache_hit_ratio', warning_threshold=95, critical_threshold=90)
        """
        try:
            result: Dict[str, Any] = {
                "success": True,
                "metric_type": metric_type,
                "thresholds": {},
                "current_value": None,
                "alert_status": "unknown",
            }

            if warning_threshold is not None:
                result["thresholds"]["warning"] = warning_threshold
            if critical_threshold is not None:
                result["thresholds"]["critical"] = critical_threshold

            if not check_current:
                return result

            # Get current value based on metric type
            current_value = None
            max_value = None

            if metric_type == "connection_count":
                query = cast(
                    LiteralString,
                    """
                SELECT
                    COUNT(*) as current_connections,
                    (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections
                FROM pg_stat_activity
                WHERE datname = current_database()
                """,
                )
                data = await self.sql_driver.execute_query(query)
                if data:
                    current_value = safe_int(data[0].cells.get("current_connections", 0))
                    max_value = safe_int(data[0].cells.get("max_connections", 0))
                    if max_value and max_value > 0:
                        current_value = (current_value / max_value) * 100 if current_value else 0
                    result["current_value"] = round(current_value, 2) if current_value else 0
                    result["max_connections"] = max_value
                    result["unit"] = "percent"

            elif metric_type == "cache_hit_ratio":
                query = cast(
                    LiteralString,
                    """
                SELECT
                    CASE
                        WHEN SUM(blks_read + blks_hit) > 0
                        THEN ROUND(100.0 * SUM(blks_hit) / SUM(blks_read + blks_hit), 2)
                        ELSE 0
                    END as hit_ratio
                FROM pg_stat_database
                WHERE datname = current_database()
                """,
                )
                data = await self.sql_driver.execute_query(query)
                if data:
                    current_value = safe_float(data[0].cells.get("hit_ratio"))
                    result["current_value"] = current_value
                    result["unit"] = "percent"

            elif metric_type == "transaction_age":
                query = cast(
                    LiteralString,
                    """
                SELECT
                    MAX(EXTRACT(EPOCH FROM (NOW() - xact_start))) as max_transaction_age
                FROM pg_stat_activity
                WHERE state IN ('idle in transaction', 'active')
                    AND datname = current_database()
                """,
                )
                data = await self.sql_driver.execute_query(query)
                if data:
                    current_value = safe_float(data[0].cells.get("max_transaction_age"))
                    result["current_value"] = round(current_value, 2) if current_value else 0
                    result["unit"] = "seconds"

            elif metric_type == "disk_usage":
                query = cast(
                    LiteralString,
                    """
                SELECT
                    pg_database_size(current_database()) as db_size
                """,
                )
                data = await self.sql_driver.execute_query(query)
                if data:
                    current_value = safe_int(data[0].cells.get("db_size", 0))
                    current_value_gb = (current_value / (1024 * 1024 * 1024)) if current_value else 0
                    result["current_value"] = round(current_value_gb, 2)
                    result["unit"] = "gigabytes"

            elif metric_type == "replication_lag":
                query = cast(
                    LiteralString,
                    """
                SELECT
                    EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp())) as lag_seconds
                """,
                )
                try:
                    data = await self.sql_driver.execute_query(query)
                    if data and data[0].cells.get("lag_seconds") is not None:
                        current_value = safe_float(data[0].cells.get("lag_seconds"))
                        result["current_value"] = round(current_value, 2) if current_value else 0
                        result["unit"] = "seconds"
                    else:
                        result["current_value"] = None
                        result["note"] = "Not a replica or no replication activity"
                except Exception:
                    result["current_value"] = None
                    result["note"] = "Primary server (no replication lag)"

            # Determine alert status
            if current_value is not None:
                if metric_type == "cache_hit_ratio":
                    # For cache hit ratio, lower is worse
                    if critical_threshold and current_value < critical_threshold:
                        result["alert_status"] = "critical"
                    elif warning_threshold and current_value < warning_threshold:
                        result["alert_status"] = "warning"
                    else:
                        result["alert_status"] = "ok"
                else:
                    # For most metrics, higher is worse
                    if critical_threshold and current_value > critical_threshold:
                        result["alert_status"] = "critical"
                    elif warning_threshold and current_value > warning_threshold:
                        result["alert_status"] = "warning"
                    else:
                        result["alert_status"] = "ok"

            return result

        except Exception as e:
            logger.error(f"Error in alert_threshold_set: {e}")
            return {"success": False, "error": str(e)}

    async def capacity_planning(
        self,
        forecast_days: int = 90,
        include_table_growth: bool = True,
        include_index_growth: bool = True,
    ) -> Dict[str, Any]:
        """Analyze database growth and project future capacity needs.

        This tool analyzes historical growth patterns and projects future
        storage and capacity requirements for planning purposes.

        Args:
            forecast_days: Number of days to forecast ahead
            include_table_growth: Include table-level growth analysis
            include_index_growth: Include index-level growth analysis

        Returns:
            Capacity planning analysis and growth projections

        Examples:
            await capacity_planning(forecast_days=90)
            await capacity_planning(forecast_days=180, include_table_growth=True)
        """
        try:
            result: Dict[str, Any] = {"success": True, "current_state": {}, "projections": {}}

            # Current database size
            size_query = cast(
                LiteralString,
                """
            SELECT
                pg_database_size(current_database()) as total_size,
                pg_size_pretty(pg_database_size(current_database())) as total_size_pretty,
                (SELECT SUM(pg_total_relation_size(schemaname || '.' || tablename))
                 FROM pg_tables
                 WHERE schemaname NOT IN ('pg_catalog', 'information_schema')) as user_data_size,
                (SELECT SUM(pg_indexes_size(schemaname || '.' || tablename))
                 FROM pg_tables
                 WHERE schemaname NOT IN ('pg_catalog', 'information_schema')) as index_size
            """,
            )
            size_data = await self.sql_driver.execute_query(size_query)

            total_size_bytes = 0
            user_data_bytes = 0
            index_bytes = 0

            if size_data:
                total_size_bytes = safe_int(size_data[0].cells.get("total_size", 0)) or 0
                user_data_bytes = safe_int(size_data[0].cells.get("user_data_size", 0)) or 0
                index_bytes = safe_int(size_data[0].cells.get("index_size", 0)) or 0

                result["current_state"]["total_size"] = {
                    "bytes": total_size_bytes,
                    "mb": round(total_size_bytes / (1024 * 1024), 2),
                    "gb": round(total_size_bytes / (1024 * 1024 * 1024), 2),
                    "pretty": size_data[0].cells.get("total_size_pretty"),
                }
                result["current_state"]["user_data_size_mb"] = round(user_data_bytes / (1024 * 1024), 2)
                result["current_state"]["index_size_mb"] = round(index_bytes / (1024 * 1024), 2)

            # Table growth analysis
            if include_table_growth:
                table_query = """
                SELECT
                    schemaname,
                    relname as tablename,
                    pg_total_relation_size(schemaname || '.' || relname) as total_size,
                    n_live_tup as row_count,
                    n_tup_ins as inserts,
                    n_tup_upd as updates,
                    n_tup_del as deletes
                FROM pg_stat_user_tables
                ORDER BY total_size DESC
                LIMIT %s
                """
                tables = await self.sql_driver.execute_query(table_query, [10])

                table_list = []
                if tables:
                    for table in tables:
                        table_size = safe_int(table.cells.get("total_size", 0)) or 0
                        row_count = safe_int(table.cells.get("row_count", 0)) or 0
                        inserts = safe_int(table.cells.get("inserts", 0)) or 0
                        updates = safe_int(table.cells.get("updates", 0)) or 0
                        deletes = safe_int(table.cells.get("deletes", 0)) or 0

                        # Calculate average row size
                        avg_row_size = (table_size / row_count) if row_count > 0 else 0

                        # Estimate net growth (inserts - deletes)
                        net_changes = inserts - deletes

                        table_list.append(
                            {
                                "schema": table.cells.get("schemaname"),
                                "table": table.cells.get("tablename"),
                                "size_mb": round(table_size / (1024 * 1024), 2),
                                "row_count": row_count,
                                "avg_row_size_bytes": round(avg_row_size, 2),
                                "net_changes": net_changes,
                                "inserts": inserts,
                                "updates": updates,
                                "deletes": deletes,
                            }
                        )

                result["current_state"]["top_tables"] = table_list

            # Index growth analysis
            if include_index_growth:
                index_query = """
                SELECT
                    schemaname,
                    relname as tablename,
                    indexrelname as indexname,
                    pg_relation_size(indexrelid) as index_size
                FROM pg_stat_user_indexes
                ORDER BY index_size DESC
                LIMIT %s
                """
                indexes = await self.sql_driver.execute_query(index_query, [10])

                index_list = []
                if indexes:
                    for index in indexes:
                        index_size = safe_int(index.cells.get("index_size", 0)) or 0
                        index_list.append(
                            {
                                "schema": index.cells.get("schemaname"),
                                "table": index.cells.get("tablename"),
                                "index": index.cells.get("indexname"),
                                "size_mb": round(index_size / (1024 * 1024), 2),
                            }
                        )

                result["current_state"]["top_indexes"] = index_list

            # Growth projections (simple linear projection based on current activity)
            activity_query = cast(
                LiteralString,
                """
            SELECT
                SUM(n_tup_ins) as total_inserts,
                SUM(n_tup_del) as total_deletes,
                AVG(n_live_tup) as avg_rows_per_table
            FROM pg_stat_user_tables
            """,
            )
            activity = await self.sql_driver.execute_query(activity_query)

            if activity and total_size_bytes > 0:
                total_inserts = safe_int(activity[0].cells.get("total_inserts", 0)) or 0
                total_deletes = safe_int(activity[0].cells.get("total_deletes", 0)) or 0
                net_growth_rows = total_inserts - total_deletes

                # Estimate daily growth rate (assuming stats since last restart)
                # This is a rough estimate - in production, use historical data
                avg_row_size = total_size_bytes / max(total_inserts, 1)
                daily_growth_bytes = net_growth_rows * avg_row_size

                # Project growth
                forecast_growth_bytes = daily_growth_bytes * forecast_days
                projected_size_bytes = total_size_bytes + forecast_growth_bytes

                result["projections"] = {
                    "forecast_days": forecast_days,
                    "estimated_daily_growth_mb": round(daily_growth_bytes / (1024 * 1024), 2),
                    "estimated_total_growth_mb": round(forecast_growth_bytes / (1024 * 1024), 2),
                    "estimated_total_growth_gb": round(forecast_growth_bytes / (1024 * 1024 * 1024), 2),
                    "projected_total_size_mb": round(projected_size_bytes / (1024 * 1024), 2),
                    "projected_total_size_gb": round(projected_size_bytes / (1024 * 1024 * 1024), 2),
                    "note": "Projection based on current activity statistics",
                }

                # Storage recommendations
                recommended_storage_gb = (projected_size_bytes / (1024 * 1024 * 1024)) * 1.5  # 50% buffer
                result["recommendations"] = {
                    "recommended_storage_gb": round(recommended_storage_gb, 2),
                    "buffer_percentage": 50,
                    "planning_horizon_days": forecast_days,
                }

            return result

        except Exception as e:
            logger.error(f"Error in capacity_planning: {e}")
            return {"success": False, "error": str(e)}

    async def resource_usage_analyze(
        self,
        include_cpu: bool = True,
        include_memory: bool = True,
        include_io: bool = True,
    ) -> Dict[str, Any]:
        """Analyze database resource usage patterns.

        This tool analyzes CPU, memory, and I/O resource usage patterns
        to identify bottlenecks and optimization opportunities.

        Args:
            include_cpu: Include CPU usage analysis (via query statistics)
            include_memory: Include memory/buffer usage analysis
            include_io: Include I/O pattern analysis

        Returns:
            Resource usage analysis and recommendations

        Examples:
            await resource_usage_analyze()
            await resource_usage_analyze(include_cpu=True, include_memory=True)
        """
        try:
            result: Dict[str, Any] = {"success": True, "resource_analysis": {}, "recommendations": []}

            # Memory/Buffer analysis
            if include_memory:
                buffer_query = cast(
                    LiteralString,
                    """
                SELECT
                    (SELECT setting::bigint FROM pg_settings WHERE name = 'shared_buffers') as shared_buffers_blocks,
                    (SELECT setting FROM pg_settings WHERE name = 'shared_buffers') as shared_buffers_setting,
                    (SELECT setting::bigint FROM pg_settings WHERE name = 'effective_cache_size') as effective_cache_size_blocks,
                    pg_database_size(current_database()) as db_size,
                    SUM(blks_hit) as buffer_hits,
                    SUM(blks_read) as disk_reads,
                    CASE
                        WHEN SUM(blks_hit + blks_read) > 0
                        THEN ROUND(100.0 * SUM(blks_hit) / SUM(blks_hit + blks_read), 2)
                        ELSE 0
                    END as hit_ratio
                FROM pg_stat_database
                WHERE datname = current_database()
                """,
                )
                buffer_stats = await self.sql_driver.execute_query(buffer_query)

                if buffer_stats:
                    hit_ratio = safe_float(buffer_stats[0].cells.get("hit_ratio"))
                    shared_buffers = buffer_stats[0].cells.get("shared_buffers_setting")

                    memory_analysis = {
                        "shared_buffers": shared_buffers,
                        "buffer_cache_hit_ratio": hit_ratio,
                        "buffer_hits": safe_int(buffer_stats[0].cells.get("buffer_hits", 0)),
                        "disk_reads": safe_int(buffer_stats[0].cells.get("disk_reads", 0)),
                    }

                    result["resource_analysis"]["memory"] = memory_analysis

                    # Memory recommendations
                    if hit_ratio and hit_ratio < 95:
                        result["recommendations"].append(
                            {
                                "category": "memory",
                                "priority": "high",
                                "current_hit_ratio": hit_ratio,
                                "recommendation": "Buffer cache hit ratio is below 95%. Consider increasing shared_buffers.",
                                "setting": "shared_buffers",
                            }
                        )

            # I/O pattern analysis
            if include_io:
                io_query = cast(
                    LiteralString,
                    """
                SELECT
                    SUM(heap_blks_read) as heap_disk_blocks,
                    SUM(heap_blks_hit) as heap_cache_blocks,
                    SUM(idx_blks_read) as index_disk_blocks,
                    SUM(idx_blks_hit) as index_cache_blocks,
                    SUM(toast_blks_read) as toast_disk_blocks,
                    SUM(toast_blks_hit) as toast_cache_blocks
                FROM pg_statio_user_tables
                """,
                )
                io_stats = await self.sql_driver.execute_query(io_query)

                if io_stats:
                    heap_disk = safe_int(io_stats[0].cells.get("heap_disk_blocks", 0)) or 0
                    heap_cache = safe_int(io_stats[0].cells.get("heap_cache_blocks", 0)) or 0
                    index_disk = safe_int(io_stats[0].cells.get("index_disk_blocks", 0)) or 0
                    index_cache = safe_int(io_stats[0].cells.get("index_cache_blocks", 0)) or 0

                    heap_total = heap_disk + heap_cache
                    index_total = index_disk + index_cache

                    heap_hit_ratio = (heap_cache / heap_total * 100) if heap_total > 0 else 0
                    index_hit_ratio = (index_cache / index_total * 100) if index_total > 0 else 0

                    io_analysis = {
                        "heap_blocks_from_disk": heap_disk,
                        "heap_blocks_from_cache": heap_cache,
                        "heap_hit_ratio": round(heap_hit_ratio, 2),
                        "index_blocks_from_disk": index_disk,
                        "index_blocks_from_cache": index_cache,
                        "index_hit_ratio": round(index_hit_ratio, 2),
                    }

                    result["resource_analysis"]["io"] = io_analysis

                    # I/O recommendations
                    if heap_hit_ratio < 95:
                        result["recommendations"].append(
                            {
                                "category": "io",
                                "priority": "medium",
                                "current_ratio": round(heap_hit_ratio, 2),
                                "recommendation": "High heap disk I/O. Consider increasing shared_buffers or optimizing queries.",
                            }
                        )

                    if index_hit_ratio < 95:
                        result["recommendations"].append(
                            {
                                "category": "io",
                                "priority": "medium",
                                "current_ratio": round(index_hit_ratio, 2),
                                "recommendation": "High index disk I/O. Review index usage and consider increasing cache.",
                            }
                        )

            # CPU usage (via pg_stat_statements if available)
            if include_cpu:
                has_pg_stat = await self._check_pg_stat_statements_installed()

                if has_pg_stat:
                    cpu_query = cast(
                        LiteralString,
                        """
                    SELECT
                        SUM(total_exec_time) as total_cpu_time,
                        SUM(calls) as total_calls,
                        AVG(mean_exec_time) as avg_query_time,
                        MAX(max_exec_time) as max_query_time
                    FROM pg_stat_statements
                    WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
                    """,
                    )
                    cpu_stats = await self.sql_driver.execute_query(cpu_query)

                    if cpu_stats:
                        total_cpu = safe_float(cpu_stats[0].cells.get("total_cpu_time"))
                        avg_time = safe_float(cpu_stats[0].cells.get("avg_query_time"))
                        max_time = safe_float(cpu_stats[0].cells.get("max_query_time"))

                        cpu_analysis = {
                            "total_execution_time_ms": round(total_cpu, 2) if total_cpu else 0,
                            "total_calls": safe_int(cpu_stats[0].cells.get("total_calls", 0)),
                            "avg_query_time_ms": round(avg_time, 2) if avg_time else 0,
                            "max_query_time_ms": round(max_time, 2) if max_time else 0,
                        }

                        result["resource_analysis"]["cpu"] = cpu_analysis

                        if avg_time and avg_time > 100:
                            result["recommendations"].append(
                                {
                                    "category": "cpu",
                                    "priority": "medium",
                                    "avg_query_time": round(avg_time, 2),
                                    "recommendation": "Average query time is high. Review slow queries and consider optimization.",
                                }
                            )
                else:
                    result["resource_analysis"]["cpu"] = {
                        "note": "pg_stat_statements extension not installed. CPU analysis unavailable.",
                    }

            # Overall recommendations
            if not result["recommendations"]:
                result["recommendations"].append(
                    {
                        "category": "general",
                        "priority": "info",
                        "recommendation": "Resource usage appears healthy. Continue monitoring.",
                    }
                )

            return result

        except Exception as e:
            logger.error(f"Error in resource_usage_analyze: {e}")
            return {"success": False, "error": str(e)}

    async def replication_monitor(
        self,
        include_slots: bool = True,
        include_wal_status: bool = True,
    ) -> Dict[str, Any]:
        """Monitor replication status and lag.

        This tool monitors PostgreSQL replication including streaming replication,
        replication slots, and WAL sender/receiver status.

        Args:
            include_slots: Include replication slot information
            include_wal_status: Include WAL sender/receiver status

        Returns:
            Replication monitoring data and status

        Examples:
            await replication_monitor()
            await replication_monitor(include_slots=True, include_wal_status=True)
        """
        try:
            result: Dict[str, Any] = {"success": True, "replication_status": {}, "lag_info": {}}

            # Check if this is a replica or primary
            recovery_query = cast(LiteralString, "SELECT pg_is_in_recovery() as is_replica")
            recovery_status = await self.sql_driver.execute_query(recovery_query)

            is_replica = False
            if recovery_status:
                is_replica = bool(recovery_status[0].cells.get("is_replica"))

            result["replication_status"]["is_replica"] = is_replica

            if is_replica:
                # Replica-specific information
                lag_query = cast(
                    LiteralString,
                    """
                SELECT
                    pg_last_wal_receive_lsn() as receive_lsn,
                    pg_last_wal_replay_lsn() as replay_lsn,
                    EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp())) as lag_seconds,
                    pg_last_xact_replay_timestamp() as last_replay_time
                """,
                )
                lag_data = await self.sql_driver.execute_query(lag_query)

                if lag_data:
                    lag_seconds = safe_float(lag_data[0].cells.get("lag_seconds"))

                    result["lag_info"] = {
                        "receive_lsn": lag_data[0].cells.get("receive_lsn"),
                        "replay_lsn": lag_data[0].cells.get("replay_lsn"),
                        "lag_seconds": round(lag_seconds, 2) if lag_seconds else 0,
                        "last_replay_time": str(lag_data[0].cells.get("last_replay_time", "")),
                    }

                    # Lag assessment
                    if lag_seconds:
                        if lag_seconds > 60:
                            result["lag_info"]["status"] = "critical"
                            result["lag_info"]["message"] = "Replication lag is over 1 minute"
                        elif lag_seconds > 10:
                            result["lag_info"]["status"] = "warning"
                            result["lag_info"]["message"] = "Replication lag is over 10 seconds"
                        else:
                            result["lag_info"]["status"] = "ok"
                            result["lag_info"]["message"] = "Replication lag is acceptable"
            else:
                # Primary-specific information
                result["replication_status"]["role"] = "primary"

                # WAL sender information
                if include_wal_status:
                    sender_query = cast(
                        LiteralString,
                        """
                    SELECT
                        application_name,
                        client_addr,
                        state,
                        sync_state,
                        sent_lsn,
                        write_lsn,
                        flush_lsn,
                        replay_lsn,
                        EXTRACT(EPOCH FROM (NOW() - backend_start)) as connection_age_seconds
                    FROM pg_stat_replication
                    ORDER BY application_name
                    """,
                    )
                    senders = await self.sql_driver.execute_query(sender_query)

                    sender_list = []
                    if senders:
                        for sender in senders:
                            sender_list.append(
                                {
                                    "application": sender.cells.get("application_name"),
                                    "client_address": sender.cells.get("client_addr"),
                                    "state": sender.cells.get("state"),
                                    "sync_state": sender.cells.get("sync_state"),
                                    "sent_lsn": sender.cells.get("sent_lsn"),
                                    "write_lsn": sender.cells.get("write_lsn"),
                                    "flush_lsn": sender.cells.get("flush_lsn"),
                                    "replay_lsn": sender.cells.get("replay_lsn"),
                                    "connection_age_seconds": round(safe_float(sender.cells.get("connection_age_seconds", 0)) or 0, 2),
                                }
                            )

                    result["replication_status"]["wal_senders"] = {
                        "count": len(sender_list),
                        "senders": sender_list,
                    }

            # Replication slots
            if include_slots:
                slot_query = cast(
                    LiteralString,
                    """
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
                ORDER BY slot_name
                """,
                )
                slots = await self.sql_driver.execute_query(slot_query)

                slot_list = []
                inactive_slots = 0
                if slots:
                    for slot in slots:
                        is_active = slot.cells.get("active")
                        if not is_active:
                            inactive_slots += 1

                        slot_list.append(
                            {
                                "name": slot.cells.get("slot_name"),
                                "type": slot.cells.get("slot_type"),
                                "database": slot.cells.get("database"),
                                "active": is_active,
                                "restart_lsn": slot.cells.get("restart_lsn"),
                                "confirmed_flush_lsn": slot.cells.get("confirmed_flush_lsn"),
                                "wal_status": slot.cells.get("wal_status"),
                                "safe_wal_size": slot.cells.get("safe_wal_size"),
                            }
                        )

                result["replication_status"]["replication_slots"] = {
                    "total_count": len(slot_list),
                    "inactive_count": inactive_slots,
                    "slots": slot_list,
                }

                if inactive_slots > 0:
                    result["replication_status"]["warning"] = f"{inactive_slots} inactive replication slots detected"

            return result

        except Exception as e:
            logger.error(f"Error in replication_monitor: {e}")
            return {"success": False, "error": str(e)}
