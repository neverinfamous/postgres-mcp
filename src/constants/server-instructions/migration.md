# Migration Tools

Code Mode: `pg.migration.*` — 6 tools for schema migration tracking and management.
Core: `init()`, `record()`, `apply()`, `rollback()`, `history()`, `status()`

- `pg_migration_init`: Initialize/verify `_mcp_schema_versions` tracking table (idempotent). Params: `schema?`. Returns `{success, tableCreated, tableName, existingRecords, error?}`
- `pg_migration_record`: Record a migration with SHA-256 hash dedup. ⚠️ Records metadata only—does NOT execute the SQL (status: 'recorded'). Use `pg_migration_apply` instead for complete migrations (status: 'applied'). Params: `version`, `description?`, `migrationSql` (aliases: `query`, `sql`), `rollbackSql?`, `sourceSystem?`, `appliedBy?`. Returns `{success, record, error?}`
- `pg_migration_apply`: Execute migration SQL and record it atomically in a single transaction. On failure, rolls back and records status as 'failed'. Same params as `pg_migration_record`. Returns `{success, record, error?}`
- `pg_migration_rollback`: Execute stored rollback SQL in a transaction. `dryRun: true` previews without executing (default: `false` — executes immediately). Lookup by `id` or `version`. Returns `{success, dryRun, rollbackSql, record, error?}`
- `pg_migration_history`: Query migration history. Params: `status?` ('applied'|'recorded'|'rolled_back'|'failed'), `sourceSystem?`, `limit?`, `offset?`. Returns `{success, records, total, limit, offset, error?}`
- `pg_migration_status`: Aggregate dashboard. Params: `schema?`. Returns `{success, initialized, latestVersion, latestAppliedAt, counts, sourceSystems, error?}`

> **Note**: All tools support P154 Structured Errors and will return `{success: false, error: "...", code: "...", category: "...", recoverable: boolean}` on failure rather than throwing raw MCP exceptions.

**Discovery**: `pg.migration.help()` returns `{methods, methodAliases, examples}`
