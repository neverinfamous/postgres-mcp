# Postgres-MCP `backup` Tool Group Certification Task

## Strict Coverage Matrix

| Tool | Direct Call (Happy Path) | Domain Error | Zod Empty Param | Alias Acceptance |
|------|--------------------------|--------------|-----------------|------------------|
| `pg_dump_table` | ✅ | ✅ | ✅ | N/A |
| `pg_dump_schema` | ✅ | ✅ | ✅ | N/A |
| `pg_copy_export` | ✅ | ✅ | ✅ | N/A |
| `pg_copy_import` | ✅ | N/A | ✅ | N/A |
| `pg_create_backup_plan` | ✅ | N/A | ✅ | N/A |
| `pg_restore_command` | ✅ | N/A | ✅ | N/A |
| `pg_backup_physical` | ✅ | N/A | ✅ | N/A |
| `pg_restore_validate` | ✅ | N/A | ✅ | N/A |
| `pg_backup_schedule_optimize` | ✅ | N/A | N/A | N/A |
| `pg_audit_list_backups` | ✅ | N/A | N/A | N/A |
| `pg_audit_restore_backup` | ✅ | ✅ | ✅ | N/A |
| `pg_audit_diff_backup` | ✅ | ✅ | ✅ | N/A |
