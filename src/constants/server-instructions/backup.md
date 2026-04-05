# Backup Tools

Core: `dumpTable()`, `dumpSchema()`, `copyExport()`, `copyImport()`, `createBackupPlan()`, `restoreCommand()`, `physical()`, `restoreValidate()`, `scheduleOptimize()`, `auditListBackups()`, `auditDiffBackup()`, `auditRestoreBackup()`

Response Structures:

- `dumpTable`: `{ddl, type, note, insertStatements?}` — `insertStatements` only with `includeData: true` (separate field from `ddl`)
- `copyExport`: `{data, rowCount, truncated?, limit?}` — `data` contains CSV/text content. `truncated: true` + `limit` when rows returned equals applied limit (indicating more rows likely exist)
- `copyImport`: `{command, stdinCommand, notes}` — Both file and stdin COPY commands
- `createBackupPlan`: `{strategy: {fullBackup, walArchiving}, estimates}`
- `restoreCommand`: `{command, warnings?, notes}` — Warnings when `database` omitted
- `restoreValidate`: `{note?, validationSteps: [{step, name, command?, commands?, note?}], recommendations}` — Top-level `note` when `backupType` omitted (defaults to pg_dump). Step-level `note` for non-command steps
- `physical`: `{command, notes, requirements}`
- `scheduleOptimize`: `{analysis, recommendation, commands}`

📦 **AI-Optimized Payloads**: `copyExport` limits results to 500 rows by default, and implements a hard 50KB safe payload truncation ceiling to protect context window limits. Use `limit: 0` for all rows (which is still bounded by the 50KB limit).

- `pg_copy_export`: Use `query`/`sql` OR `table`. ⚠️ If both provided, `query` takes precedence with warning. Supports `schema.table` format (auto-parsed, takes priority over `schema` param). Format: `csv` (default, comma-delimited), `text` (tab-delimited). Both formats support `header: true` (default). ⛔ `binary` not supported via MCP—use `pg_dump_schema` for binary exports. Default `limit: 500` (use `0` for all rows). Optional `delimiter` to customize
- `pg_dump_table`: Returns `ddl` + `insertStatements` when `includeData: true`. Supports sequences (`type: 'sequence'`), views (`type: 'view'`), and partitioned tables (`type: 'partitioned_table'` with `PARTITION BY` clause). **PRIMARY KEYS, INDEXES, CONSTRAINTS NOT included**—use `pg_get_indexes`/`pg_get_constraints`. Supports `schema.table` format
- `pg_dump_schema`: Generates pg_dump command. Optional `schema`, `table`, `filename`
- `pg_copy_import`: Generates COPY FROM command. Supports `schema.table` format (auto-parsed, takes priority over `schema` param). `columns` array, `filePath`, `format`, `header`, `delimiter`
- `pg_restore_command`: Use `filename` (alias for `backupFile`). Include `database` parameter for complete command. Optional `schemaOnly`, `dataOnly`
- `pg_create_backup_plan`: Generates backup strategy with cron schedule. `frequency`: 'hourly'|'daily'|'weekly', `retention` count
- `pg_backup_physical`: Generates pg_basebackup command. Required `targetDir`. `format`: 'plain'|'tar' (default: 'tar'), `checkpoint`: 'fast'|'spread', `compress`: 0-9
- `pg_restore_validate`: Generates validation commands. Use `filename` (alias for `backupFile`). `backupType`: 'pg_dump' (default)|'pg_basebackup'
- `pg_backup_schedule_optimize`: Analyzes database activity patterns and recommends optimal backup schedule
- `pg_audit_list_backups`: Reads `.snapshot.json.gz` files from backup dir. Optional `tool?`/`target?` filters. Returns `{snapshots: [{filename, tool, target, schema, timestamp, sizeBytes, rowCount?}], count}` — requires `--audit-backup`. Supports `compact` mode (default: `true`) to significantly conserve payloads. Destructive operations executed in Code Mode are automatically intercepted and appear as `tool: 'pg_execute_code'`.
- `pg_audit_diff_backup({filename})`: Shows DDL + `volumeDrift` (row/size delta vs. live table). `volumeDrift` fields are conditional — only present when data exists. Note: Unanalyzed tables (`reltuples = -1`) automatically execute a fallback `SELECT COUNT(*)` for accurate data volume tracking. Defaults to `compact: true` to bypass redundant full DDL blocks and conserve tokens. Returns `{ddl, volumeDrift?: {rowCountSnapshot?, rowCountCurrent?, sizeBytesSnapshot?, sizeBytesCurrent?, summary}}`
- `pg_audit_restore_backup({filename, dryRun?, restoreAs?, confirm})`: Transaction-wrapped restore. Use `dryRun: true` to preview. `restoreAs` creates a side-by-side copy instead of overwriting. ⚠️ `confirm: true` is strictly REQUIRED for destructive in-place restores. SERIAL sequences dropped with table — DDL with `nextval()` fails on restore; use simple types or recreate sequences first. Returns `{success, restored, restoreAs?}`

**Top-Level Aliases**: `pg.dumpTable()`, `pg.dumpSchema()`, `pg.copyExport()`, `pg.copyImport()`, `pg.createBackupPlan()`, `pg.restoreCommand()`, `pg.restoreValidate()`, `pg.physical()`, `pg.backupPhysical()`, `pg.scheduleOptimize()`, `pg.backupScheduleOptimize()`, `pg.auditListBackups()`, `pg.auditDiffBackup()`, `pg.auditRestoreBackup()`
