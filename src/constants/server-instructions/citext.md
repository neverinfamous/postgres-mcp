# citext Tools

Core: `createExtension()`, `convertColumn()`, `listColumns()`, `analyzeCandidates()`, `compare()`, `schemaAdvisor()`

- `pg_citext_create_extension`: Enable citext extension (idempotent). Returns `{success, message, usage}`
- `pg_citext_convert_column`: Supports `schema.table` format (auto-parsed). ⛔ Only allows text-based columns (text, varchar, character varying)—non-text columns return `{success: false, error, allowedTypes, suggestion}`. When views depend on column, returns `{success: false, dependentViews, hint}`—drop/recreate views manually. `col` alias for `column`. Returns `{previousType}` showing original type
- `pg_citext_list_columns`: Default `limit: 100` (use `0` for all). Returns `{columns: [{table_schema, table_name, column_name, is_nullable, column_default}], count, totalCount, truncated}`. Optional `schema`, `limit` filters. Supports `compact` mode (default: `true`) to structurally omit empty arrays
- `pg_citext_analyze_candidates`: Default `limit: 50` (use `0` for all). Default `excludeSystemSchemas: true` filters out extension schemas (cron, topology, partman, tiger) when no `schema`/`table` filter specified—use `excludeSystemSchemas: false` to include all. Returns `truncated: true` + `totalCount` when results are limited. Scans tables for TEXT/VARCHAR columns matching common patterns (email, username, name, etc.). Optional `schema`, `table`, `limit`, `excludeSystemSchemas`, `patterns` filters. Returns `{candidates, count, totalCount, truncated, summary: {highConfidence, mediumConfidence}, recommendation, patternsUsed, excludedSchemas?}`. Supports `compact` mode (default: `true`) to structurally omit empty arrays
- `pg_citext_compare`: Test case-insensitive comparison. Returns `{value1, value2, citextEqual, textEqual, lowerEqual, extensionInstalled}`
- `pg_citext_schema_advisor`: Supports `schema.table` format (auto-parsed). Analyzes specific table. Returns `{table, recommendations: [{column, currentType, previousType?, recommendation, confidence, reason}], summary, nextSteps}`. `tableName` alias for `table`. Already-citext columns include `previousType: "text or varchar (converted)"`

**Discovery**: `pg.citext.help()` returns `{methods, methodAliases, examples}` object
