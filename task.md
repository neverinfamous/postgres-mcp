# postgres-mcp partman Tool Group - Strict Coverage Matrix

| Tool Name | Direct Call (Happy Path) | Domain Error (Direct Call) | Zod Empty Param (Direct Call) | Alias Acceptance |
| :--- | :---: | :---: | :---: | :---: |
| `pg_partman_create_extension` | | N/A | N/A | N/A |
| `pg_partman_create_parent` | | | | N/A |
| `pg_partman_run_maintenance` | | | N/A (Optional) | N/A |
| `pg_partman_show_partitions` | | | | N/A |
| `pg_partman_show_config` | | | N/A (Optional) | N/A |
| `pg_partman_check_default` | | | | N/A |
| `pg_partman_partition_data` | | | | N/A |
| `pg_partman_set_retention` | | | | N/A |
| `pg_partman_undo_partition` | | | | N/A |
| `pg_partman_analyze_partition_health`| | N/A | N/A | N/A |

## Checklist Progress

✅ 1. `pg_partman_create_parent({parentTable: "test_logs", controlColumn: "created_at", interval: "1 day", startPartition: "now"})` → verify success
✅ 2. `pg_partman_show_config({table: "test_logs"})` → verify config is returned
✅ 3. `pg_partman_show_partitions({parentTable: "test_logs"})` → verify partitions created
✅ 4. `pg_partman_run_maintenance({parentTable: "test_logs"})` → verify success response
✅ 5. `pg_partman_analyze_partition_health()` → verify `{summary}` with `overallHealth` field
✅ 6. Cleanup: `pg_partman_undo_partition` if applicable, or note state for reset-database.ps1
✅ 7. 🔴 `pg_partman_show_partitions({parentTable: "nonexistent_xyz"})` → `{success: false, error: "..."}` handler error
✅ 8. 🔴 `pg_partman_create_parent({})` → `{success: false, error: "..."}` (Zod validation)
✅ 9. 🔴 `pg_partman_partition_data({parentTable: "test_logs", batchSize: "abc"})` → must NOT return raw MCP `-32602` error — should return handler error or silently default `batchSize` (wrong-type numeric param)
