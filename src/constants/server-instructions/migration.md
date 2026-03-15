# Migration Tools

Code Mode: `pg.migration.*` — 6 tools for schema migration tracking and management.
Core: `init()`, `record()`, `apply()`, `rollback()`, `history()`, `status()`

- `pg_migration_init`: Initialize/verify `_mcp_schema_versions` tracking table (idempotent). Returns `{success, tableCreated, tableName, existingRecords}`
- `pg_migration_record`: Record a migration with SHA-256 hash dedup. ⚠️ Records metadata only—does NOT execute the SQL (status: 'recorded'). Use `pg_migration_apply` instead for complete migrations (status: 'applied'). Params: `version`, `description?`, `migrationSql`, `rollbackSql?`, `sourceSystem?`. Returns `{success, record}`
- `pg_migration_apply`: Execute migration SQL and record it atomically in a single transaction. On failure, rolls back and records status as 'failed'. Same params as `pg_migration_record`. Returns `{success, record}` or `{success: false, error}`
- `pg_migration_rollback`: Execute stored rollback SQL in a transaction. `dryRun: true` previews without executing (default: `false` — executes immediately). Lookup by `id` or `version`. Returns `{success, dryRun, rollbackSql, record}`
- `pg_migration_history`: Query migration history with `status?` ('applied'|'recorded'|'rolled_back'|'failed'), `sourceSystem?`, `limit?`, `offset?`. Returns `{records, total, limit, offset}`
- `pg_migration_status`: Aggregate dashboard. Returns `{initialized, latestVersion, counts, sourceSystems}`

**Discovery**: `pg.migration.help()` returns `{methods, methodAliases, examples}`
