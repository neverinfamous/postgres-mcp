"""Backup and Recovery Tools for PostgreSQL MCP Server.

This module provides 4 backup and recovery tools:
- backup_logical: Logical backup with validation
- backup_physical: Physical backup management
- restore_validate: Backup integrity verification
- backup_schedule_optimize: Backup strategy optimization
"""

import logging
from typing import Any
from typing import Dict
from typing import List
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


class BackupTools:
    """Backup and recovery operations for PostgreSQL."""

    def __init__(self, sql_driver: SqlDriver):
        """Initialize backup tools.

        Args:
            sql_driver: SQL driver instance for database operations
        """
        self.sql_driver = sql_driver

    async def backup_logical(
        self,
        schema_name: Optional[str] = None,
        table_names: Optional[List[str]] = None,
        include_data: bool = True,
        include_schema: bool = True,
        validate_after: bool = True,
    ) -> Dict[str, Any]:
        """Generate logical backup information and validation.

        This tool provides backup planning and validation information for logical backups.
        Actual backup execution should be done using pg_dump command-line tool.

        Args:
            schema_name: Schema to backup (None = all schemas)
            table_names: Specific tables to backup (None = all tables)
            include_data: Include table data in backup plan
            include_schema: Include schema definitions in backup plan
            validate_after: Validate backup strategy

        Returns:
            Backup planning information and validation results

        Examples:
            await backup_logical(schema_name="public")
            await backup_logical(table_names=["users", "orders"])
        """
        try:
            result: Dict[str, Any] = {"success": True, "backup_plan": {}, "validation": {}}

            # Get database information
            db_info_query = """
            SELECT 
                pg_database_size(current_database()) as db_size,
                current_database() as db_name,
                version() as pg_version
            """
            db_info = await self.sql_driver.execute_query(db_info_query)

            if db_info:
                db_size = safe_int(db_info[0].cells.get("db_size", 0))
                result["backup_plan"]["database_name"] = db_info[0].cells.get("db_name")
                result["backup_plan"]["database_size_bytes"] = db_size
                result["backup_plan"]["database_size_mb"] = round(db_size / (1024 * 1024), 2) if db_size else 0
                result["backup_plan"]["postgresql_version"] = db_info[0].cells.get("pg_version")

            # Build table list query
            if schema_name and table_names:
                # Specific tables in schema
                table_query = f"""
                SELECT 
                    schemaname,
                    relname as tablename,
                    pg_total_relation_size(schemaname || '.' || relname) as table_size,
                    n_live_tup as row_count
                FROM pg_stat_user_tables
                WHERE schemaname = %s
                    AND relname = ANY(%s)
                ORDER BY table_size DESC
                """
                params = [schema_name, table_names]
            elif schema_name:
                # All tables in schema
                table_query = f"""
                SELECT 
                    schemaname,
                    relname as tablename,
                    pg_total_relation_size(schemaname || '.' || relname) as table_size,
                    n_live_tup as row_count
                FROM pg_stat_user_tables
                WHERE schemaname = %s
                ORDER BY table_size DESC
                """
                params = [schema_name]
            elif table_names:
                # Specific tables (any schema)
                table_query = f"""
                SELECT 
                    schemaname,
                    relname as tablename,
                    pg_total_relation_size(schemaname || '.' || relname) as table_size,
                    n_live_tup as row_count
                FROM pg_stat_user_tables
                WHERE relname = ANY(%s)
                ORDER BY table_size DESC
                """
                params = [table_names]
            else:
                # All user tables
                table_query = cast(
                    LiteralString,
                    """
                SELECT 
                    schemaname,
                    relname as tablename,
                    pg_total_relation_size(schemaname || '.' || relname) as table_size,
                    n_live_tup as row_count
                FROM pg_stat_user_tables
                ORDER BY table_size DESC
                """,
                )
                params = []

            tables = await self.sql_driver.execute_query(table_query, params)

            table_list = []
            total_size = 0
            total_rows = 0

            if tables:
                for table in tables:
                    table_size = safe_int(table.cells.get("table_size", 0)) or 0
                    row_count = safe_int(table.cells.get("row_count", 0)) or 0

                    table_list.append(
                        {
                            "schema": table.cells.get("schemaname"),
                            "table": table.cells.get("tablename"),
                            "size_bytes": table_size,
                            "size_mb": round(table_size / (1024 * 1024), 2),
                            "row_count": row_count,
                        }
                    )
                    total_size += table_size
                    total_rows += row_count

            result["backup_plan"]["tables"] = table_list
            result["backup_plan"]["table_count"] = len(table_list)
            result["backup_plan"]["total_size_bytes"] = total_size
            result["backup_plan"]["total_size_mb"] = round(total_size / (1024 * 1024), 2)
            result["backup_plan"]["total_rows"] = total_rows
            result["backup_plan"]["include_data"] = include_data
            result["backup_plan"]["include_schema"] = include_schema

            # Validation checks
            if validate_after:
                validation = {}

                # Check for large tables that may need special handling
                large_tables = [t for t in table_list if t["size_mb"] > 1000]
                if large_tables:
                    validation["large_tables_warning"] = {
                        "count": len(large_tables),
                        "tables": [f"{t['schema']}.{t['table']}" for t in large_tables[:5]],
                        "recommendation": "Consider parallel backup or table-by-table backup for large tables",
                    }

                # Check for very wide tables (many columns)
                column_query = """
                SELECT 
                    table_schema,
                    table_name,
                    COUNT(*) as column_count
                FROM information_schema.columns
                WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
                GROUP BY table_schema, table_name
                HAVING COUNT(*) > 100
                ORDER BY column_count DESC
                LIMIT 5
                """
                wide_tables = await self.sql_driver.execute_query(column_query)

                if wide_tables:
                    validation["wide_tables_info"] = {
                        "count": len(wide_tables),
                        "tables": [
                            {
                                "table": f"{t.cells['table_schema']}.{t.cells['table_name']}",
                                "columns": safe_int(t.cells.get("column_count")),
                            }
                            for t in wide_tables
                        ],
                    }

                # Estimate backup time (rough estimate: 10MB/sec for logical backup)
                estimated_seconds = total_size / (10 * 1024 * 1024) if total_size > 0 else 0
                validation["estimated_backup_time"] = {
                    "seconds": round(estimated_seconds, 1),
                    "minutes": round(estimated_seconds / 60, 1),
                    "note": "Estimate based on 10MB/sec throughput",
                }

                # Recommended pg_dump command
                if schema_name:
                    pg_dump_cmd = f"pg_dump -Fc -f backup.dump -n {schema_name}"
                elif table_names:
                    table_args = " ".join([f"-t {t}" for t in table_names])
                    pg_dump_cmd = f"pg_dump -Fc -f backup.dump {table_args}"
                else:
                    pg_dump_cmd = "pg_dump -Fc -f backup.dump"

                if not include_data:
                    pg_dump_cmd += " --schema-only"
                elif not include_schema:
                    pg_dump_cmd += " --data-only"

                validation["recommended_command"] = pg_dump_cmd
                validation["backup_format"] = "custom (-Fc) for compression and flexibility"

                result["validation"] = validation

            return result

        except Exception as e:
            logger.error(f"Error in backup_logical: {e}")
            return {"success": False, "error": str(e)}

    async def backup_physical(
        self,
        check_wal_archiving: bool = True,
        check_replication_slots: bool = True,
    ) -> Dict[str, Any]:
        """Analyze physical backup readiness and configuration.

        This tool checks physical backup configuration including WAL archiving,
        replication slots, and provides recommendations for physical backup setup.

        Args:
            check_wal_archiving: Check WAL archiving configuration
            check_replication_slots: Check replication slot status

        Returns:
            Physical backup readiness analysis and recommendations

        Examples:
            await backup_physical()
            await backup_physical(check_wal_archiving=True)
        """
        try:
            result: Dict[str, Any] = {"success": True, "configuration": {}, "recommendations": []}

            # Check WAL level
            wal_query = cast(
                LiteralString,
                """
            SELECT 
                name,
                setting,
                unit,
                context
            FROM pg_settings
            WHERE name IN (
                'wal_level',
                'archive_mode',
                'archive_command',
                'max_wal_senders',
                'wal_keep_size',
                'checkpoint_timeout'
            )
            ORDER BY name
            """,
            )
            wal_settings = await self.sql_driver.execute_query(wal_query)

            config = {}
            if wal_settings:
                for setting in wal_settings:
                    name = setting.cells.get("name", "")
                    value = setting.cells.get("setting", "")
                    unit = setting.cells.get("unit", "")
                    context = setting.cells.get("context", "")

                    config[name] = {
                        "value": value,
                        "unit": unit if unit else None,
                        "context": context,
                    }

            result["configuration"]["wal_settings"] = config

            # Check if WAL archiving is enabled
            recommendations = []
            wal_level = config.get("wal_level", {}).get("value", "")
            archive_mode = config.get("archive_mode", {}).get("value", "")

            if wal_level not in ("replica", "logical"):
                recommendations.append(
                    {
                        "type": "critical",
                        "setting": "wal_level",
                        "current": wal_level,
                        "recommended": "replica",
                        "reason": "WAL level must be 'replica' or 'logical' for physical backups",
                    }
                )

            if archive_mode != "on":
                recommendations.append(
                    {
                        "type": "warning",
                        "setting": "archive_mode",
                        "current": archive_mode,
                        "recommended": "on",
                        "reason": "WAL archiving should be enabled for point-in-time recovery",
                    }
                )

            # Check replication slots if requested
            if check_replication_slots:
                slot_query = cast(
                    LiteralString,
                    """
                SELECT 
                    slot_name,
                    slot_type,
                    active,
                    restart_lsn,
                    confirmed_flush_lsn
                FROM pg_replication_slots
                ORDER BY slot_name
                """,
                )
                slots = await self.sql_driver.execute_query(slot_query)

                slot_list = []
                if slots:
                    for slot in slots:
                        slot_list.append(
                            {
                                "name": slot.cells.get("slot_name"),
                                "type": slot.cells.get("slot_type"),
                                "active": slot.cells.get("active"),
                                "restart_lsn": slot.cells.get("restart_lsn"),
                                "confirmed_flush_lsn": slot.cells.get("confirmed_flush_lsn"),
                            }
                        )

                result["configuration"]["replication_slots"] = slot_list

            # Check current WAL file and location
            wal_location_query = cast(
                LiteralString,
                """
            SELECT 
                pg_current_wal_lsn() as current_lsn,
                pg_walfile_name(pg_current_wal_lsn()) as current_wal_file
            """,
            )
            wal_location = await self.sql_driver.execute_query(wal_location_query)

            if wal_location:
                result["configuration"]["wal_location"] = {
                    "current_lsn": wal_location[0].cells.get("current_lsn"),
                    "current_wal_file": wal_location[0].cells.get("current_wal_file"),
                }

            # Add general recommendations
            if wal_level in ("replica", "logical") and archive_mode == "on":
                recommendations.append(
                    {
                        "type": "info",
                        "message": "Physical backup configuration looks good",
                        "next_steps": "Use pg_basebackup for consistent physical backups",
                    }
                )
            else:
                recommendations.append(
                    {
                        "type": "info",
                        "message": "Physical backups require proper WAL configuration",
                        "documentation": "https://www.postgresql.org/docs/current/continuous-archiving.html",
                    }
                )

            result["recommendations"] = recommendations

            return result

        except Exception as e:
            logger.error(f"Error in backup_physical: {e}")
            return {"success": False, "error": str(e)}

    async def restore_validate(
        self,
        check_disk_space: bool = True,
        check_connections: bool = True,
        check_constraints: bool = True,
    ) -> Dict[str, Any]:
        """Validate database readiness for restore operations.

        This tool checks if the database is ready for restore operations,
        including disk space, active connections, and constraint status.

        Args:
            check_disk_space: Check available disk space
            check_connections: Check active database connections
            check_constraints: Check constraint validity

        Returns:
            Restore readiness validation results

        Examples:
            await restore_validate()
            await restore_validate(check_disk_space=True)
        """
        try:
            result: Dict[str, Any] = {"success": True, "validation": {}, "warnings": [], "errors": []}

            # Check disk space
            if check_disk_space:
                disk_query = cast(
                    LiteralString,
                    """
                SELECT 
                    pg_database_size(current_database()) as current_size,
                    pg_size_pretty(pg_database_size(current_database())) as current_size_pretty
                """,
                )
                disk_info = await self.sql_driver.execute_query(disk_query)

                if disk_info:
                    current_size = safe_int(disk_info[0].cells.get("current_size", 0))
                    result["validation"]["disk_space"] = {
                        "current_database_size_bytes": current_size,
                        "current_database_size_pretty": disk_info[0].cells.get("current_size_pretty"),
                        "recommended_free_space": "At least 2x current database size",
                    }

            # Check active connections
            if check_connections:
                conn_query = cast(
                    LiteralString,
                    """
                SELECT 
                    COUNT(*) as total_connections,
                    COUNT(*) FILTER (WHERE state = 'active') as active_connections,
                    COUNT(*) FILTER (WHERE state = 'idle') as idle_connections,
                    COUNT(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
                FROM pg_stat_activity
                WHERE datname = current_database()
                """,
                )
                conn_info = await self.sql_driver.execute_query(conn_query)

                if conn_info:
                    total_conns = safe_int(conn_info[0].cells.get("total_connections", 0))
                    active_conns = safe_int(conn_info[0].cells.get("active_connections", 0))
                    idle_trans = safe_int(conn_info[0].cells.get("idle_in_transaction", 0))

                    result["validation"]["connections"] = {
                        "total": total_conns,
                        "active": active_conns,
                        "idle": safe_int(conn_info[0].cells.get("idle_connections", 0)),
                        "idle_in_transaction": idle_trans,
                    }

                    if active_conns and active_conns > 1:
                        result["warnings"].append(
                            {
                                "type": "active_connections",
                                "count": active_conns,
                                "message": "Active connections detected. Consider terminating before restore.",
                            }
                        )

                    if idle_trans and idle_trans > 0:
                        result["errors"].append(
                            {
                                "type": "idle_in_transaction",
                                "count": idle_trans,
                                "message": "Idle transactions detected. These must be terminated before restore.",
                            }
                        )

            # Check constraint validity
            if check_constraints:
                constraint_query = cast(
                    LiteralString,
                    """
                SELECT 
                    conrelid::regclass as table_name,
                    conname as constraint_name,
                    contype as constraint_type,
                    convalidated as is_validated
                FROM pg_constraint
                WHERE connamespace IN (
                    SELECT oid FROM pg_namespace 
                    WHERE nspname NOT IN ('pg_catalog', 'information_schema')
                )
                AND NOT convalidated
                ORDER BY conrelid::regclass::text, conname
                """,
                )
                invalid_constraints = await self.sql_driver.execute_query(constraint_query)

                constraint_list = []
                if invalid_constraints:
                    for constraint in invalid_constraints:
                        constraint_list.append(
                            {
                                "table": str(constraint.cells.get("table_name", "")),
                                "constraint": constraint.cells.get("constraint_name"),
                                "type": constraint.cells.get("constraint_type"),
                                "validated": constraint.cells.get("is_validated"),
                            }
                        )

                    result["warnings"].append(
                        {
                            "type": "invalid_constraints",
                            "count": len(constraint_list),
                            "constraints": constraint_list[:10],  # Limit to first 10
                            "message": "Some constraints are not validated. Validate before restore.",
                        }
                    )

                result["validation"]["constraints"] = {
                    "invalid_count": len(constraint_list),
                    "status": "ok" if len(constraint_list) == 0 else "needs_attention",
                }

            # Overall readiness assessment
            has_errors = len(result["errors"]) > 0
            has_warnings = len(result["warnings"]) > 0

            if has_errors:
                result["readiness"] = "not_ready"
                result["readiness_message"] = "Critical issues must be resolved before restore"
            elif has_warnings:
                result["readiness"] = "ready_with_warnings"
                result["readiness_message"] = "Ready for restore, but warnings should be reviewed"
            else:
                result["readiness"] = "ready"
                result["readiness_message"] = "Database is ready for restore operations"

            return result

        except Exception as e:
            logger.error(f"Error in restore_validate: {e}")
            return {"success": False, "error": str(e)}

    async def backup_schedule_optimize(
        self,
        daily_change_rate_mb: Optional[float] = None,
        backup_window_hours: int = 8,
        retention_days: int = 30,
    ) -> Dict[str, Any]:
        """Optimize backup schedule based on database characteristics.

        This tool analyzes database activity and size to recommend an optimal
        backup schedule including full, differential, and incremental backups.

        Args:
            daily_change_rate_mb: Estimated daily data change in MB (auto-calculated if None)
            backup_window_hours: Available backup window in hours
            retention_days: Required backup retention period in days

        Returns:
            Optimized backup schedule recommendations

        Examples:
            await backup_schedule_optimize()
            await backup_schedule_optimize(daily_change_rate_mb=500, retention_days=90)
        """
        try:
            result: Dict[str, Any] = {"success": True, "analysis": {}, "recommendations": {}}

            # Get database size
            size_query = cast(
                LiteralString,
                """
            SELECT 
                pg_database_size(current_database()) as db_size,
                pg_size_pretty(pg_database_size(current_database())) as db_size_pretty
            """,
            )
            size_info = await self.sql_driver.execute_query(size_query)

            db_size_bytes = 0
            if size_info:
                db_size_bytes = safe_int(size_info[0].cells.get("db_size", 0)) or 0
                db_size_mb = db_size_bytes / (1024 * 1024)
                result["analysis"]["current_database_size"] = {
                    "bytes": db_size_bytes,
                    "mb": round(db_size_mb, 2),
                    "gb": round(db_size_mb / 1024, 2),
                    "pretty": size_info[0].cells.get("db_size_pretty"),
                }

            # Get table activity statistics
            activity_query = cast(
                LiteralString,
                """
            SELECT 
                SUM(n_tup_ins) as total_inserts,
                SUM(n_tup_upd) as total_updates,
                SUM(n_tup_del) as total_deletes,
                SUM(n_live_tup) as total_live_tuples,
                COUNT(*) as table_count
            FROM pg_stat_user_tables
            """,
            )
            activity = await self.sql_driver.execute_query(activity_query)

            if activity:
                total_changes = (
                    (safe_int(activity[0].cells.get("total_inserts", 0)) or 0)
                    + (safe_int(activity[0].cells.get("total_updates", 0)) or 0)
                    + (safe_int(activity[0].cells.get("total_deletes", 0)) or 0)
                )
                result["analysis"]["activity"] = {
                    "total_inserts": safe_int(activity[0].cells.get("total_inserts", 0)),
                    "total_updates": safe_int(activity[0].cells.get("total_updates", 0)),
                    "total_deletes": safe_int(activity[0].cells.get("total_deletes", 0)),
                    "total_changes": total_changes,
                    "table_count": safe_int(activity[0].cells.get("table_count", 0)),
                }

            # Calculate or use provided change rate
            if daily_change_rate_mb is None and db_size_bytes > 0:
                # Estimate based on activity (rough heuristic)
                # Assume average row size of 1KB and use total changes
                total_changes = result["analysis"]["activity"]["total_changes"]
                estimated_change_mb = (total_changes * 1024) / (1024 * 1024)
                daily_change_rate_mb = estimated_change_mb
                result["analysis"]["change_rate_estimation"] = "auto_calculated"
            else:
                result["analysis"]["change_rate_estimation"] = "user_provided"

            result["analysis"]["daily_change_rate_mb"] = round(daily_change_rate_mb or 0, 2)

            # Calculate backup recommendations
            db_size_mb = db_size_bytes / (1024 * 1024)

            # Backup strategy based on database size
            if db_size_mb < 1000:  # < 1GB
                strategy = "full_daily"
                full_frequency = "daily"
                incremental_frequency = None
                differential_frequency = None
            elif db_size_mb < 10000:  # < 10GB
                strategy = "full_weekly_diff_daily"
                full_frequency = "weekly"
                incremental_frequency = None
                differential_frequency = "daily"
            else:  # >= 10GB
                strategy = "full_weekly_diff_daily_incr_hourly"
                full_frequency = "weekly"
                incremental_frequency = "hourly" if backup_window_hours >= 12 else "every_6_hours"
                differential_frequency = "daily"

            recommendations = {
                "strategy": strategy,
                "full_backup": {
                    "frequency": full_frequency,
                    "estimated_duration_minutes": round(db_size_mb / (10 * 60), 1),
                    "estimated_size_mb": round(db_size_mb * 0.7, 2),  # Compressed estimate
                },
            }

            if differential_frequency:
                recommendations["differential_backup"] = {
                    "frequency": differential_frequency,
                    "estimated_duration_minutes": round((daily_change_rate_mb or 0) / (10 * 60), 1),
                    "estimated_size_mb": round((daily_change_rate_mb or 0) * 0.7, 2),
                }

            if incremental_frequency:
                hourly_change = (daily_change_rate_mb or 0) / 24
                recommendations["incremental_backup"] = {
                    "frequency": incremental_frequency,
                    "estimated_duration_minutes": round(hourly_change / (10 * 60), 1),
                    "estimated_size_mb": round(hourly_change * 0.7, 2),
                }

            # Storage requirements
            weekly_storage_mb = db_size_mb * 0.7  # One full backup
            if differential_frequency:
                weekly_storage_mb += (daily_change_rate_mb or 0) * 0.7 * 7  # Daily diffs
            if incremental_frequency:
                weekly_storage_mb += (daily_change_rate_mb or 0) * 0.7  # Incremental overhead

            total_storage_mb = weekly_storage_mb * (retention_days / 7)

            recommendations["storage_requirements"] = {
                "weekly_storage_mb": round(weekly_storage_mb, 2),
                "weekly_storage_gb": round(weekly_storage_mb / 1024, 2),
                "total_storage_mb": round(total_storage_mb, 2),
                "total_storage_gb": round(total_storage_mb / 1024, 2),
                "retention_days": retention_days,
            }

            # Backup window validation
            full_backup_minutes = round(db_size_mb / (10 * 60), 1)
            backup_window_minutes = backup_window_hours * 60

            if full_backup_minutes > backup_window_minutes:
                recommendations["backup_window_warning"] = {
                    "required_minutes": full_backup_minutes,
                    "available_minutes": backup_window_minutes,
                    "recommendation": "Increase backup window or use parallel backup",
                }

            result["recommendations"] = recommendations

            return result

        except Exception as e:
            logger.error(f"Error in backup_schedule_optimize: {e}")
            return {"success": False, "error": str(e)}
