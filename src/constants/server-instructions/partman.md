# pg_partman Tools

- `pg_partman_create_parent`: Interval uses PostgreSQL syntax ('1 day', '1 month') NOT keywords ('daily'). `startPartition` accepts 'now' shorthand for current date. Required params: `parentTable`/`table`, `controlColumn`/`control`/`column`, `interval`
- `pg_partman_run_maintenance`: Without `parentTable`, maintains ALL partition sets. Returns `partial: true` when some tables are skipped. `orphaned` object groups orphaned configs with `count`, `tables`, and cleanup `hint`. `errors` array for other failures
- `pg_partman_show_config`: Default `limit: 50` (use `0` for all). Returns `truncated` + `totalCount` when limited. `orphaned` flag per config. Supports `schema.table` or plain table name (auto-prefixes `public.`)
- `pg_partman_show_partitions`: Default `limit: 50` (use `0` for all). Returns `truncated` + `totalCount` when limited. `parentTable` required. Supports `schema.table` format (auto-parsed)
- `pg_partman_check_default`/`partition_data`: `parentTable` required. Supports `schema.table` format (auto-parsed)
- `pg_partman_set_retention`: ⚠️ **CAUTION: Default is DROP** — `retentionKeepTable: false` (default) = DROP partitions, `true` = detach only (safer). Pass `retention: null` to disable retention
- `pg_partman_undo_partition`: `targetTable` MUST exist before calling. Requires both `parentTable` and `targetTable`/`target`. ⚠️ Parent table and child partitions remain after undo—use `DROP TABLE parent CASCADE` to clean up
- `pg_partman_analyze_partition_health`: Default `limit: 50` (use `0` for all). Returns `truncated` + `totalCount` when limited. `summary.overallHealth`: 'healthy'|'warnings'|'issues_found'
- 📝 **Schema Resolution**: All partman tools auto-prefix `public.` when no schema specified in `parentTable`
- 📝 **Aliases**: `parentTable` accepts `table`, `parent`, `name`. `controlColumn` accepts `control`, `column`, `partitionColumn`. `targetTable` accepts `target`. `retentionKeepTable` accepts `keepTable`.
- 📝 **Strict Error Handling**: Attempting to query unmanaged tables (e.g. via `pg_partman_show_config`) throws `TABLE_NOT_FOUND`. Missing the extension completely throws `EXTENSION_MISSING` — remediate via `pg_partman_create_extension` before using partman tools.
