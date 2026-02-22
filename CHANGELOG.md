# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Vitest dual-reporter configuration** — Added `json` reporter alongside `default` in `vitest.config.ts`, outputting structured test results to `test-results.json`. Enables reliable agent consumption of full test failure details (diffs, stack traces) via file reads instead of truncated terminal output. Added `test-results.json` to `.gitignore`

## [1.3.0] - 2026-02-22

### Fixed

- **`test-resources.sql` partman seed schema mismatch** — The partman resource seed block referenced `partman.part_config` and `partman.create_parent()`, but pg_partman is installed in the `public` schema. Changed to `public.part_config` and `public.create_parent()`. Also added `p_start_partition` parameter so child partitions cover the 14-day log data date range

- **5 pgcrypto tools raw MCP errors for invalid inputs** — `pg_pgcrypto_hash({ algorithm: "invalid" })`, `pg_pgcrypto_hmac({ algorithm: "invalid" })`, `pg_pgcrypto_gen_salt({ type: "invalid" })`, `pg_pgcrypto_gen_random_bytes({ length: 0 })`, and `pg_pgcrypto_gen_random_uuid({ count: 0 })` now return `{success: false, error: "Validation error: ..."}` instead of raw MCP `-32602` Zod validation errors. Applied Split Schema pattern: created `PgcryptoHashSchemaBase`, `PgcryptoHmacSchemaBase`, `PgcryptoGenSaltSchemaBase`, `PgcryptoRandomBytesSchemaBase` (relaxed `z.string()`/`z.number()`) for MCP `inputSchema` visibility, keeping strict schemas (`z.enum()`/`.min().max()`) inside the handler's `try/catch`. Also added `ZodError` interception to `pg_pgcrypto_encrypt` and `pg_pgcrypto_decrypt` handlers for consistency. Added 8 unit tests

- **`pg_cron_alter_job` raw MCP errors for invalid inputs** — `pg_cron_alter_job({ schedule: "60 seconds" })` and `pg_cron_alter_job({ jobId: "abc" })` now return `{success: false, error: "..."}` instead of raw MCP `-32602` validation errors. Applied Split Schema pattern: created `CronAlterJobSchemaBase` (plain `z.object()`) for MCP `inputSchema` visibility, using `CronAlterJobSchema` (with `.refine()` for interval validation) only inside the handler's `try/catch`. The handler's existing `ZodError` interception now correctly catches validation failures that were previously thrown at the MCP framework level

- **`formatPostgresError` raw Zod validation JSON leak** — `formatPostgresError` now detects ZodErrors (via duck-typed `.issues` array) and extracts clean human-readable messages (e.g., `Validation error: buckets must be greater than 0 (buckets)`) instead of returning a raw JSON-stringified Zod validation array. This is a centralized fix benefiting all tool handlers that use `formatPostgresError` for error formatting. Added 3 unit tests for ZodError handling in `core.test.ts` and 1 integration test for `pg_stats_distribution` with `buckets: 0` in `stats.test.ts`

- **`pg_cron_unschedule` raw MCP error when called without arguments** — `pg_cron_unschedule({})` now returns `{success: false, error: "Either jobId or jobName must be provided"}` instead of a raw MCP Zod validation error (`-32602`). Applied Split Schema pattern: `CronUnscheduleSchemaBase` (plain `z.object()`) for MCP visibility, `CronUnscheduleSchema` with `.refine()` for handler parsing. The `.refine()` validation was previously on the `inputSchema`, causing the MCP framework to reject the input before the handler's `try/catch` could intercept it

- **`pg_cron_job_run_details` inconsistent error shape for invalid status** — `pg_cron_job_run_details({ status: "invalid" })` now returns `{success: false, error: "Invalid status \"invalid\". Valid statuses: running, succeeded, failed"}` instead of the previous `{runs: [], count: 0, summary: {...}, error: "..."}` which mixed an error field alongside normal response data without `success: false`. Updated `CronJobRunDetailsOutputSchema` with optional `success`/`error` fields and made `runs`/`count`/`summary` optional to accommodate both success and error response shapes. Updated 1 unit test

- **`pg_fuzzy_match` raw MCP error for invalid method** — `pg_fuzzy_match({ method: "invalid" })` now returns `{success: false, error: "Invalid method \"invalid\". Valid methods: levenshtein, soundex, metaphone"}` instead of a raw MCP Zod validation error (`-32602`). Changed `inputSchema` `method` from `z.enum()` to `z.string().optional()` with handler-level validation. Added 1 unit test

- **`pg_transaction_execute` raw MCP error for `{query: ...}` in statements** — `pg_transaction_execute({ statements: [{ query: "SELECT 1" }] })` now correctly resolves the `query` alias to `sql`, matching the alias pattern used by `pg_read_query` and `pg_write_query`. Previously, the MCP framework rejected statement objects with `query` instead of `sql` at the schema validation level (raw `-32602` error) before the handler could run. Made `sql` optional in `TransactionExecuteSchemaBase`, added `query` alias field, and added per-statement alias resolution in `TransactionExecuteSchema` transform with a refine ensuring every statement has `sql` or `query`. Added 2 unit tests

- **`pg_kcache_top_cpu` / `pg_kcache_top_io` Split Schema violation** — Both tools now use proper `KcacheTopCpuSchemaBase` and `KcacheTopIoSchemaBase` schemas as `inputSchema` instead of inline `z.preprocess(...)`. Ensures all parameters (`limit`, `queryPreviewLength`, `type`/`ioType`) are correctly exposed to MCP clients via JSON Schema generation. Removed unused `defaultToEmpty` helper

- **`pg_alert_threshold_set` raw MCP validation error for invalid metric** — `pg_alert_threshold_set({ metric: "invalid_xyz" })` now returns `{success: false, error: "Invalid metric \"invalid_xyz\". Valid metrics: connection_usage, ..."}` instead of a raw MCP Zod validation error (`-32602`). Changed `inputSchema` from `z.enum()` to `z.string().optional()` with valid values in `.describe()`, and added handler-level validation. Previously, the MCP SDK rejected invalid enum values at the schema level before the handler could execute. Updated `ServerInstructions.ts` docs. Added 1 unit test

### Performance

- **`pg_stat_activity` background worker noise** — `pg_stat_activity` now filters out background workers (checkpointer, bgwriter, walwriter, autovacuum launcher, logical replication launcher, etc.) by adding `backend_type = 'client backend'` to the query filter. These workers had all-null fields (`usename`, `datname`, `state`, `query_start`, `duration` all null) inflating the payload with no actionable insight. The response now includes `backgroundWorkers: N` count so consumers know workers exist without the noise

- **`pg_query_plan_compare` verbose `fullPlans` payload** — `fullPlans` output now strips zero-value block statistics (`Shared Hit Blocks: 0`, `Shared Read Blocks: 0`, etc.), empty `Triggers: []` arrays, and empty `Planning: {}` objects from EXPLAIN plan JSON. Non-zero values are preserved. Reduces `fullPlans` payload size significantly when `analyze: true` is used

### Dependencies

- Bump `@types/node` from 25.2.3 to 25.3.0
- Bump `eslint` from 10.0.0 to 10.0.1
- Bump `aquasecurity/trivy-action` from 0.33.1 to 0.34.0 in `security-update.yml`
- **Security audit fixes** — `npm audit fix` upgraded transitive dependencies `ajv` (→8.18.0/6.14.0, ReDoS via `$data`), `hono` (→4.12.1, timing comparison hardening), `qs` (→6.15.0, arrayLimit bypass DoS). Added `minimatch` npm override (≥10.2.1) to resolve ReDoS CVE (GHSA-3ppc-4f35-3m26) in `@typescript-eslint/typescript-estree` dependency tree without downgrading `typescript-eslint`

### Changed

- **Dependencies** — Updated `eslint` from 9.28.0 → 10.0.0, `@eslint/js` from 9.28.0 → 10.0.1, `typescript-eslint` from 8.55.0 → 8.56.0 (first `typescript-eslint` version with ESLint 10 support)

- **Schema tools SQL parameterization** — Converted all SQL string interpolation in schema tool existence checks and dynamic WHERE clauses to parameterized queries (`$1`, `$2`, etc.) with `queryParams` arrays. Affected handlers: `pg_create_schema`, `pg_drop_schema`, `pg_list_sequences`, `pg_create_sequence`, `pg_drop_sequence`, `pg_list_views`, `pg_create_view`, `pg_drop_view`, `pg_list_functions`, `pg_list_triggers`, `pg_list_constraints`. Improves consistency with parameterized query patterns used across all other tool groups. Updated 13 test assertions to verify parameterized SQL patterns

### Documentation

- **README.md / DOCKER_README.md "What Sets Us Apart" section** — Replaced the "What This Does" bullet list with a "What Sets Us Apart" feature-matrix table, matching the mysql-mcp README style. Highlights 13 differentiating features including Code Mode, 8 extension ecosystems, deterministic error handling, and MCP 2025-11-25 compliance. Removed redundant "Why Choose postgres-mcp?" section from README.md

- **README.md / DOCKER_README.md deterministic error handling** — Added "Deterministic Error Handling" row to the "What Sets Us Apart" table and added "deterministic error handling" to the introduction blurb. Highlights that every tool returns structured `{success, error}` responses with no raw exceptions, silent failures, or misleading messages

### Security

- **`pg_transaction_execute` `isolationLevel` missing enum constraint** — `TransactionExecuteSchemaBase.isolationLevel` now uses `z.enum(["READ UNCOMMITTED", "READ COMMITTED", "REPEATABLE READ", "SERIALIZABLE"])` instead of `z.string()`, matching the existing validation in `BeginTransactionSchema`. Previously, arbitrary strings could reach the `BEGIN ISOLATION LEVEL ${isolationLevel}` SQL interpolation in `PostgresAdapter.beginTransaction()`. Also chained `preprocessBeginParams` normalizer for shorthand support (`RC`, `RR`, `S`, case-insensitive forms)

- **`pg_create_sequence` `ownedBy` parameter unsanitized** — The `ownedBy` parameter is now validated for format (`table.column` or `schema.table.column`) and each component is sanitized through `sanitizeIdentifier()` before SQL interpolation. Previously, `ownedBy` was interpolated directly into DDL (`OWNED BY ${ownedBy}`) without any identifier-level validation

### Fixed

- **`pg_database_size` raw MCP error for nonexistent database** — `pg_database_size({ database: "nonexistent_db" })` now returns `{success: false, error: "..."}` instead of throwing a raw MCP error. Wrapped `executeQuery` in try-catch with `formatPostgresError`. Updated `DatabaseSizeOutputSchema` with optional `success`/`error` fields and made `bytes`/`size` optional. Added 1 unit test

- **`pg_index_stats`/`pg_table_stats`/`pg_vacuum_stats`/`pg_bloat_check` `schema.table` format not parsed** — `pg_index_stats({ table: 'sales.orders' })` and the other 3 tools now correctly parse dot-notation into `schema=sales, table=orders` instead of treating `sales.orders` as a literal table name in the `public` schema. Previously produced misleading P154 errors like `Table 'public.sales.orders' not found`. Added inline `schema.table` splitting logic matching the pattern used by `pg_partition_strategy_suggest`. Added 4 unit tests

- **`pg_list_tables` MCP schema missing all parameters** — Direct MCP tool calls to `pg_list_tables` now correctly expose `schema`, `limit`, and `exclude` parameters. Previously, the tool used a `z.preprocess()`-wrapped schema as `inputSchema`, which strips parameter metadata from JSON Schema generation, making direct MCP calls unable to filter results. Applied Split Schema pattern: `ListTablesSchemaBase` for MCP visibility, `ListTablesSchema` with `z.preprocess()` for handler parsing

- **Universal Split Schema pattern application** — Applied the Split Schema pattern to 22 remaining tools that used `z.preprocess()` directly as `inputSchema`, which strips parameter metadata from MCP JSON Schema generation. Created `Base` schemas (plain `z.object()`) for MCP client visibility while preserving preprocessed schemas for handler parsing. Affected tool groups: monitoring (3), extensions/kcache (3), extensions/ltree (1), performance (2), core/health (2), transactions (1), and 10 inline performance tool schemas across `stats.ts`, `monitoring.ts`, `optimization.ts`, and `analysis.ts`

- **`pg_list_triggers`/`pg_list_constraints` `schema.table` format not parsed** — `pg_list_triggers({ table: 'custom_schema.orders' })` and `pg_list_constraints({ table: 'custom_schema.orders' })` now correctly parse into `schema=custom_schema, table=orders` instead of treating `custom_schema.orders` as a literal table name in the `public` schema. Previously produced misleading errors like `Table 'public.custom_schema.orders' not found`. Added inline `schema.table` splitting logic matching the pattern used by other schema tools. Added 2 unit tests

- **`ServerInstructions.ts` `pg_analyze_db_health` incomplete response docs** — Updated response structure documentation from `{cacheHitRatio: {ratio, heap, index, status}}` to include all 10 top-level fields: `cacheHitRatio`, `databaseSize`, `tableStats`, `unusedIndexes`, `tablesNeedingVacuum`, `connections`, `bloat`, `isReplica`, `overallScore`, `overallStatus`. Previously only documented `cacheHitRatio` and mentioned `bloat` in passing

- **`pg_get_indexes` raw MCP error for nonexistent table/schema** — `pg_get_indexes({ table: 'nonexistent' })` now returns `{success: false, error: "Table 'public.nonexistent' not found..."}` instead of throwing a raw MCP error. Changed P154 existence checks from `throw new Error()` to structured `return {success: false, error}`. Updated `IndexListOutputSchema` with optional `success`/`error` fields, made `indexes`/`count` optional. Converted 2 unit tests from `rejects.toThrow()` to `{success: false}` assertions

- **`pg_list_functions`/`pg_list_triggers`/`pg_list_constraints` silent empty result for nonexistent table/schema** — These three list tools now return `{success: false, error: "Table/Schema '...' not found/does not exist"}` instead of silently returning `{count: 0}` when given nonexistent tables or schemas. `pg_list_functions` validates schema existence; `pg_list_triggers` and `pg_list_constraints` validate both schema and table existence. All three handlers wrapped in try-catch with `formatPostgresError` for database errors and `ZodError` interception for validation failures. Updated `ListFunctionsOutputSchema`, `ListTriggersOutputSchema`, and `ListConstraintsOutputSchema` with optional `success`/`error` fields, made success-path fields optional, converted to `.loose()`. Added 5 unit tests, updated 3 existing filter-by mocks

- **Performance tools silent empty result for nonexistent table/schema** — `pg_index_stats`, `pg_table_stats`, `pg_vacuum_stats`, `pg_bloat_check`, `pg_index_recommendations` (table mode), and `pg_seq_scan_tables` (schema filter) now return `{success: false, error}` instead of silently returning empty results for nonexistent tables/schemas. Added `validatePerformanceTableExists()` helper to `stats.ts`, `monitoring.ts`, and `analysis.ts` with schema-first granular error messages. Updated 5 output schemas with optional `success`/`error` fields and optional data arrays. Added 8 P154 unit tests, updated 11 existing filter-by test mocks

- **`ServerInstructions.ts` `pg_list_functions` recommended `exclude` list missing extensions** — Added `'vector'` and `'topology'` to the recommended `exclude` array for `pg_list_functions`. Previously, the recommended list omitted these extensions, resulting in large payloads (958+ lines) from pgvector internal C functions and PostGIS topology functions

- **`pg_list_views` stale truncation test** — Fixed test name from "1000 chars" to "500 chars" and assertion from `1003` to `503` to match the actual default `truncateDefinition: 500`

- **`pg_citext_analyze_candidates` `schema.table` format not parsed** — `pg_citext_analyze_candidates({ table: 'custom_schema.users' })` now correctly parses into `schema=custom_schema, table=users` instead of treating `custom_schema.users` as a literal table name in the `public` schema. Changed `CitextAnalyzeCandidatesSchema` preprocessor from `normalizeOptionalParams` to chain `preprocessCitextTableParams` (which splits `schema.table` format), matching the behavior of `CitextSchemaAdvisorSchema` and `CitextConvertColumnSchema`. Added 1 unit test

- **`pg_citext_analyze_candidates` silent empty result for nonexistent table/schema** — `pg_citext_analyze_candidates({ table: 'nonexistent' })` now returns `{success: false, error: "Table ... does not exist"}` instead of silently returning `{candidates: [], count: 0}`. When only `schema` is specified, validates schema existence via `information_schema.schemata`. Matches the structured error pattern used by `pg_citext_schema_advisor` and `pg_citext_convert_column`. Updated `CitextAnalyzeCandidatesOutputSchema` with optional `success`/`error` fields. Added 2 unit tests, updated 1 existing test mock

- **Partman tools inconsistent `truncated`/`totalCount` fields** — `pg_partman_show_partitions`, `pg_partman_show_config`, and `pg_partman_analyze_partition_health` now always include `truncated: false` and `totalCount` in responses when results are not truncated, matching the convention in `partitioning.ts` and other paginated tools. Previously, these fields were only present when `truncated: true`, making it impossible to determine completeness without checking the limit

- **`pg_partman_check_default` missing `success` field on happy path** — All 4 happy path return statements in `pg_partman_check_default` now include `success: true`, matching other partman tools. Previously, only error paths included the `success` field

- **`pg_cron_schedule` / `pg_cron_schedule_in_database` raw MCP error for missing command** — Calling either tool without `command`/`sql`/`query` now returns `{success: false, error: "Either command, sql, or query must be provided"}` instead of a raw Zod validation error. Root cause: `CronScheduleSchemaBase` and `CronScheduleInDatabaseSchemaBase` had `.refine()` calls that were evaluated at the MCP framework level before reaching the handler's `try/catch`. Moved all refinements (command check, database check, interval validation) from the Base schemas to the Transform schemas (`CronScheduleSchema`, `CronScheduleInDatabaseSchema`), which are parsed inside the handler. Added 2 unit tests

- **`pg_cron_alter_job` error message says "Job unknown" instead of actual jobId** — `pg_cron_alter_job` with a nonexistent `jobId` (e.g., `99999`) now returns `Job '99999' not found` instead of `Job 'unknown' not found`. Hoisted `parsedJobId` before the try block and passed it as `target` context to `formatPostgresError` in the catch block. Tightened unit test assertion to verify the actual jobId appears in the error message

- **`ServerInstructions.ts` `pg_cron_alter_job` misleading "throws error" wording** — Changed `⛔ Non-existent jobId throws error` to `⛔ Non-existent jobId returns error` to accurately reflect that a structured `{success: false}` response is returned, not a raw throw

- **Cron tools structured error returns** — `pg_cron_schedule`, `pg_cron_schedule_in_database`, `pg_cron_unschedule`, and `pg_cron_alter_job` now **return** structured `{success: false, error}` responses instead of throwing raw MCP errors. Each handler wrapped in top-level try-catch with `ZodError` interception for validation failures and `formatPostgresError` for PostgreSQL errors. Updated 4 output schemas (`CronScheduleOutputSchema`, `CronScheduleInDatabaseOutputSchema`, `CronUnscheduleOutputSchema`, `CronAlterJobOutputSchema`) with optional `error` field and optional success-path fields. Changed import from `parsePostgresError` to `formatPostgresError`. Converted 5 unit tests from `rejects.toThrow()` to `{success: false}` assertions

- **`pg_geocode` test using `rejects.toThrow()` instead of structured assertion** — Converted postgis.test.ts `pg_geocode` missing lat/lng test from `rejects.toThrow()` to `{success: false}` structured error assertions, matching the PostGIS error handling fix applied in the prior session

- **`pg_vector_cluster` null centroids for non-vector columns** — `pg_vector_cluster` with a non-vector column (e.g., `text`, `integer`) now returns `{success: false, error: "Column '...' is not a vector column (type: ...)", suggestion: "Use a column with vector type for clustering"}` instead of silently returning null centroids. Added `information_schema.columns` type check after `checkTableAndColumn`, matching the existing pattern in `pg_vector_index_optimize`. Added 1 unit test, updated 3 existing test mocks

- **`pg_vector_add_column` raw MCP exception for duplicate column** — `pg_vector_add_column({ table: 'x', column: 'existing_col', dimensions: 384 })` without `ifNotExists: true` now returns `{success: false, error: "Column 'existing_col' already exists on table 'x'", suggestion: "Use ifNotExists: true to skip if column already exists"}` instead of throwing a raw PostgreSQL exception. Wrapped `ALTER TABLE` in try-catch with duplicate column pattern match. Added 1 unit test

- **`pg_vector_batch_insert` MCP schema missing all parameters** — Direct MCP tool calls to `pg_vector_batch_insert` now correctly expose `table`, `tableName`, `column`, `col`, `vectors`, and `schema` parameters. Previously, the tool used a `.transform()`-ed schema as `inputSchema`, which strips parameter metadata from JSON Schema generation, making direct MCP calls fail with Zod validation errors. Applied Split Schema pattern: `BatchInsertSchemaBase` for MCP visibility, `BatchInsertSchema` with `.transform()` for handler alias resolution. Added 1 unit test

- **`pg_vector_batch_insert` raw MCP error for dimension mismatch** — `pg_vector_batch_insert` with vectors whose dimensions don't match the target column now returns `{success: false, error: "Vector dimension mismatch", expectedDimensions, providedDimensions, suggestion}` instead of throwing a raw MCP error. Wrapped `executeQuery` in try-catch with dimension regex pattern match, mirroring `pg_vector_insert`. Added 1 unit test

- **Stats tools raw MCP exceptions** — All 8 stats tool handlers (`pg_stats_descriptive`, `pg_stats_percentiles`, `pg_stats_correlation`, `pg_stats_regression`, `pg_stats_time_series`, `pg_stats_distribution`, `pg_stats_hypothesis`, `pg_stats_sampling`) now **return** structured `{success: false, error}` responses instead of throwing raw MCP errors. Each handler in `basic.ts` and `advanced.ts` wrapped in top-level try-catch with `formatPostgresError`. Updated 5 output schemas (`DescriptiveOutputSchema`, `PercentilesOutputSchema`, `CorrelationOutputSchema`, `TimeSeriesOutputSchema`, `SamplingOutputSchema`) with optional `success`/`error` fields and made success-path required fields optional. Converted 13 unit tests from `rejects.toThrow()` to `{success: false}` assertions

- **Partitioning tools structured error returns** — `pg_create_partitioned_table`, `pg_create_partition`, `pg_attach_partition`, and `pg_detach_partition` now **return** structured `{success: false, error}` responses instead of throwing raw MCP errors for all failure conditions (PK validation, duplicate table, overlapping bounds, already-attached partition, SQL failures). Changed catch blocks from `throw parsePostgresError()` to `return {success: false, error: formatPostgresError()}`. Validation errors (`subpartitionKey` required, PK missing partition key) also converted from `throw new Error()` to structured returns. Added `error` field to `CreatePartitionedTableOutputSchema` and made success-path fields optional. Removed unused `parsePostgresError` import. Converted 5 unit tests from `rejects.toThrow()` to `{success: false}` assertions

- **`pg_capacity_planning` raw Zod exception for negative days** — `pg_capacity_planning({ days: -5 })` now returns `{success: false, error: "Projection days must be a non-negative number"}` instead of throwing a raw Zod validation error. Wrapped `CapacityPlanningSchema.parse()` in try-catch with `ZodError` interception and `formatPostgresError` fallback. Updated `CapacityPlanningOutputSchema` with optional `success`/`error` fields and made success-path fields optional. Converted 1 unit test from `rejects.toThrow()` to `{success: false}` assertion

- **`pg_dump_table` / `pg_copy_export` raw MCP exceptions** — Both backup tool handlers now **return** structured `{success: false, error}` responses instead of throwing raw MCP errors for nonexistent tables/schemas, invalid SQL, empty params, and unsupported binary format. Changed catch blocks from `throw parsePostgresError()` to `return {success: false, error: formatPostgresError()}`. Updated `DumpTableOutputSchema` and `CopyExportOutputSchema` with optional `error` field. Converted 4 unit tests from `rejects.toThrow()` to `{success: false}` assertions

- **`pg_index_stats`/`pg_table_stats`/`pg_vacuum_stats` inconsistent `truncated`/`totalCount` fields** — These three tools now always include `truncated: false` and `totalCount` in responses when results are not truncated, matching the behavior of `pg_stat_statements`, `pg_unused_indexes`, and `pg_query_plan_stats`. Previously, these fields were only present when `truncated: true`, making it impossible to determine if results were complete without also checking the limit. Also added `pg_cache_hit_ratio` response structure to `ServerInstructions.ts`. Added 3 unit tests

- **Text tools raw MCP exceptions** — All 8 table-based text tool handlers (`pg_text_search`, `pg_text_rank`, `pg_trigram_similarity`, `pg_fuzzy_match`, `pg_regexp_match`, `pg_like_search`, `pg_text_headline`, `pg_create_fts_index`) now **return** structured `{success: false, error}` responses instead of throwing raw MCP errors. Each handler wrapped in a top-level try-catch with `formatPostgresError` for PostgreSQL errors and `ZodError` interception for validation failures (e.g., invalid fuzzy match method). Updated `TextRowsOutputSchema` and `FtsIndexOutputSchema` to include optional `success`/`error` fields. Converted 8 unit tests and 11 security-injection tests from `rejects.toThrow()` to `{success: false}` assertions. Added 1 new Zod validation test for `pg_fuzzy_match`

- **JSONB tools silently ignore fake schemas** — All 14 database-facing JSONB tool handlers now validate schema existence via `information_schema.schemata` before executing queries. Previously, specifying a nonexistent schema (e.g., `schema: "fake"`) would silently fall back to `public` if the table existed there. Basic tools (`basic.ts`: extract, set, insert, delete, contains, path_query, agg, keys, strip_nulls, typeof) use a new `resolveJsonbTable()` helper that returns schema-qualified table names via `sanitizeTableName(table, schema)`. Advanced tools (`advanced.ts`: normalize, index_suggest, security_scan, stats) pass schema directly to `sanitizeTableName()`. Added `schema` field to 8 Zod schemas that were missing it (Typeof, Keys, StripNulls, Agg, Normalize, Stats, IndexSuggest, SecurityScan). Added 2 unit tests for fake schema detection

- **`pg_jsonb_strip_nulls` raw Zod exception when WHERE omitted** — `pg_jsonb_strip_nulls({table, column})` without `where`/`filter` now returns `{success: false, error: "pg_jsonb_strip_nulls validation error: ..."}` instead of a raw Zod `.refine()` exception. Wrapped `JsonbStripNullsSchema.parse()` in try-catch with `ZodError` interception. Added 1 unit test

- **JSONB tools raw MCP exceptions** — All 19 JSONB tool handlers (`basic.ts`: extract, set, insert, delete, contains, path_query, agg, object, array, keys, strip_nulls, typeof; `advanced.ts`: merge, normalize, diff, index_suggest, security_scan, stats, validate_path) now **return** structured `{success: false, error}` responses instead of throwing raw MCP errors. Each handler wrapped in a top-level try-catch with `formatPostgresError`. Domain-specific error messages preserved (invalid JSONPath, array vs. object column mismatches, missing WHERE clauses). Removed unused `parsePostgresError` imports. Converted 19 unit tests from `rejects.toThrow()` to `{success: false}` assertions

- **`pg_count` raw MCP error for query execution failures** — `pg_count` with an invalid column expression (e.g., `column: "DISTINCT status"`) now returns `{success: false, error}` instead of throwing a raw MCP error. Wrapped `executeQuery` in try-catch with `formatPostgresError`, matching the pattern used by `pg_batch_insert`. Added 1 unit test

- **8 core tools return structured error responses instead of raw MCP exceptions** — `pg_read_query`, `pg_write_query`, `pg_describe_table`, `pg_create_table`, `pg_create_index`, `pg_object_details`, `pg_analyze_query_indexes`, and `pg_batch_insert` now consistently return `{success: false, error}` responses for all error conditions (nonexistent tables/schemas, constraint violations, invalid transactionIds, SQL syntax errors). Added `formatPostgresError` utility to `error-helpers.ts` that wraps the throwing `parsePostgresError` function and returns the structured message string. Updated 5 output schemas (`ReadQueryOutputSchema`, `TableDescribeOutputSchema`, `TableOperationOutputSchema`, `IndexOperationOutputSchema`, `ObjectDetailsOutputSchema`) to include optional `success`/`error` fields. Converted 19 unit tests from `rejects.toThrow()` to `{success: false}` assertions across `core.test.ts` and `convenience.test.ts`

- **`pg_pgcrypto_encrypt` and `pg_pgcrypto_decrypt` raw PostgreSQL exceptions** — Both tools now return structured `{success: false, error}` responses instead of raw PG exceptions. Covers "Unsupported cipher algorithm" (invalid `options`), "Wrong key or corrupt data" (incorrect decryption password), and "invalid symbol found while decoding base64 sequence" (corrupt encrypted data). Handlers wrapped in try-catch with `parsePostgresError` fallback for PG-coded errors. Updated 1 existing test, added 2 new error handling tests

- **Transaction tools raw MCP exceptions** — All 7 transaction handlers (`pg_transaction_begin`, `pg_transaction_commit`, `pg_transaction_rollback`, `pg_transaction_savepoint`, `pg_transaction_release`, `pg_transaction_rollback_to`, `pg_transaction_execute`) now **return** structured `{success: false, error}` responses instead of throwing errors that propagated as raw MCP exceptions. Added `getStructuredError` helper to capture `parsePostgresError`'s thrown message as a string. `pg_transaction_execute` error responses now include top-level `statementsExecuted`, `statementsTotal`, `failedStatement`, and `autoRolledBack` fields instead of a JSON-embedded context string. Updated 4 output schemas with optional `error` field. Converted 11 existing tests from `rejects.toThrow()` to `{success: false}` assertions

- **Performance tools raw MCP exceptions** — 6 performance tool handlers (`pg_explain`, `pg_explain_analyze`, `pg_explain_buffers`, `pg_index_recommendations`, `pg_query_plan_compare`, `pg_partition_strategy_suggest`) now **return** structured `{success: false, error}` responses instead of throwing raw MCP errors via `parsePostgresError`. Changed imports from `parsePostgresError` to `formatPostgresError` in `explain.ts`, `analysis.ts`, and `optimization.ts`. Updated 4 output schemas (`ExplainOutputSchema`, `IndexRecommendationsOutputSchema`, `QueryPlanCompareOutputSchema`, `PartitionStrategySuggestOutputSchema`) with optional `success`/`error` fields and made success-path required fields optional. Converted 3 existing `rejects.toThrow()` tests to `{success: false}` assertions and added 6 new error handling tests

- **`pg_transaction_execute` Zod validation error for empty statements** — `pg_transaction_execute({ statements: [] })` now returns `{success: false, error: "statements is required..."}` instead of throwing a raw Zod validation error. Moved `TransactionExecuteSchema.parseAsync()` inside a try-catch with `ZodError` interception, matching the error handling pattern of all other transaction handlers. Added 1 unit test

- **PostGIS tools raw MCP exceptions → structured error returns** — All 11 PostGIS tool handlers (`pg_geocode`, `pg_distance`, `pg_point_in_polygon`, `pg_buffer`, `pg_intersection`, `pg_bounding_box`, `pg_geo_transform`, `pg_geo_cluster`, `pg_geometry_buffer`, `pg_geometry_intersection`, `pg_geometry_transform`) now **return** structured `{success: false, error}` responses instead of throwing raw MCP errors. Changed catch blocks from `throw parsePostgresError()` to `return {success: false, error: formatPostgresError()}`. Zod validation errors also return structured responses. Updated 10 output schemas with optional `success`/`error` fields. Removed unused `parsePostgresError` imports from `advanced.ts` and `standalone.ts`. Converted 9 unit tests from `rejects.toThrow()` to `{success: false}` assertions

- **Admin tools raw MCP exceptions** — All 6 admin tool handlers (`pg_vacuum`, `pg_vacuum_analyze`, `pg_analyze`, `pg_reindex`, `pg_set_config`, `pg_cluster`) now **return** structured `{success: false, error}` responses instead of throwing raw MCP errors via `parsePostgresError`. Changed import from `parsePostgresError` to `formatPostgresError`. Added `ZodError` interception for `pg_cluster`'s Zod `.refine()` validation (table/index co-dependency). Converted bare `throw new Error()` calls in `pg_analyze` (columns-without-table) and `pg_reindex` (name required) to structured returns. Updated 5 output schemas (`VacuumOutputSchema`, `AnalyzeOutputSchema`, `ReindexOutputSchema`, `ClusterOutputSchema`, `ConfigOutputSchema`) with optional `error` field and made `message` optional. Converted 9 existing `rejects.toThrow()` tests to `{success: false}` assertions, added 1 new test for `pg_cluster` index-without-table

- **`pg_ltree_match` and `pg_ltree_create_index` raw PostgreSQL exceptions** — Both tools now validate table existence and column ltree type via `information_schema` pre-checks before executing main queries, returning structured `{success: false, error}` responses for nonexistent tables, missing columns, and non-ltree columns. Catch blocks also converted from `throw parsePostgresError()` to `return {success: false}` for consistent structured error handling. Previously, calling either tool on a nonexistent table produced a raw `relation does not exist` exception. Added 4 unit tests, updated 8 existing test mocks

- **P154 convenience tools raw MCP exceptions for nonexistent tables/schemas** — `pg_count`, `pg_exists`, `pg_upsert`, `pg_batch_insert`, and `pg_truncate` now **return** structured `{success: false, error}` responses instead of throwing raw MCP errors when `validateTableExists()` detects nonexistent tables or schemas. Changed `validateTableExists()` from `throw new Error()` to returning error strings (`Promise<string | null>`), with all 5 handler call sites checking the return and producing structured responses. Updated 4 output schemas (`CountOutputSchema`, `ExistsOutputSchema`, `WriteQueryOutputSchema`, `TruncateOutputSchema`) to make success-path fields optional and include `error` field. Converted 12 unit tests from `rejects.toThrow()` to `{success: false}` assertions

- **`parsePostgresError` unnecessary regex escapes** — Removed 2 unnecessary `\"` escapes in the pg_cron job-not-found regex pattern (ESLint `no-useless-escape`)

- **`pg_ltree_query` and `pg_ltree_convert_column` misleading "Column not found" for nonexistent table** — Both tools now check table existence separately when the `information_schema` column lookup returns 0 rows, returning `Table "schema"."table" does not exist` instead of the misleading `Column "X" not found`. Added 2 unit tests

- **`pg_citext_convert_column` misleading "Column not found" for nonexistent table** — `pg_citext_convert_column({ table: 'nonexistent', column: 'email' })` now returns `{success: false, error: "Table ... does not exist"}` instead of the misleading `"Column \"email\" not found"`. Added table existence check before column lookup. Extension-not-installed error also converted from thrown exception to structured `{success: false}` return. Entire handler wrapped in try-catch with `parsePostgresError` fallback

- **`pg_citext_schema_advisor` raw MCP error for nonexistent table** — `pg_citext_schema_advisor({ table: 'nonexistent' })` now returns `{success: false, error: "Table ... not found"}` instead of throwing a raw MCP error. Handler wrapped in try-catch with `parsePostgresError` fallback. Updated 4 unit tests

- **`pg_spatial_index` raw PostgreSQL error for nonexistent column** — `pg_spatial_index({ table: 'locations', column: 'nonexistent' })` now throws a structured error via `parsePostgresError` instead of a raw PostgreSQL exception (`column "nonexistent" does not exist`). Wrapped the `CREATE INDEX` executeQuery call in try-catch, consistent with other PostGIS tools

- **`pg_geo_transform` misleading error for nonexistent table** — `pg_geo_transform({ table: 'nonexistent', column: 'geom', toSrid: 3857 })` now throws `Table or view 'nonexistent' not found` instead of the misleading `Could not auto-detect SRID`. Added a table existence check via `information_schema.tables` before SRID auto-detection. Updated 4 unit tests

- **`pg_geocode` raw Zod validation error** — `pg_geocode({ lat: 95, lng: -74 })` with out-of-bounds coordinates now throws a clean error message (e.g., `lat must be between -90 and 90 degrees`) instead of a raw Zod validation error array. Wrapped handler in try-catch with `ZodError` interception and `parsePostgresError` fallback for database errors. Added 2 unit tests

- **PostGIS tools raw PostgreSQL exceptions** — `pg_point_in_polygon`, `pg_distance`, `pg_buffer`, `pg_intersection`, `pg_bounding_box`, `pg_geo_cluster`, `pg_geometry_buffer`, `pg_geometry_intersection`, and `pg_geometry_transform` now route errors through `parsePostgresError()` for structured messages instead of raw PG exceptions. Covers nonexistent tables (`42P01`), invalid geometry inputs, and other database errors. Added 9 unit tests

- **Kcache tools raw MCP exceptions** — All 6 kcache tool handlers (`pg_kcache_query_stats`, `pg_kcache_top_cpu`, `pg_kcache_top_io`, `pg_kcache_database_stats`, `pg_kcache_resource_analysis`, `pg_kcache_reset`) now **return** structured `{success: false, error}` responses instead of throwing raw MCP errors. Each handler wrapped in top-level try-catch with `formatPostgresError`. Updated 6 output schemas (`KcacheQueryStatsOutputSchema`, `KcacheTopCpuOutputSchema`, `KcacheTopIoOutputSchema`, `KcacheDatabaseStatsOutputSchema`, `KcacheResourceAnalysisOutputSchema`, `KcacheResetOutputSchema`) with optional `success`/`error` fields and made success-path fields optional. Added 5 unit tests

- **`pg_bounding_box` misleading syntax error for nonexistent table** — `pg_bounding_box({ table: 'nonexistent' })` now throws `Table or view 'nonexistent' not found in schema 'public'` instead of a raw SQL syntax error. The column lookup returned empty results for nonexistent tables, producing an empty SELECT clause. Added pre-query empty-columns check

- **`pg_geo_transform` raw PostgreSQL exceptions** — Queries after SRID auto-detection (column lookup, main transform, count) are now wrapped in try-catch with `parsePostgresError()`. A nonexistent table now throws `Table or view 'X' not found` instead of raw PG exceptions

- **`pg_distance` raw Zod validation error for out-of-bounds coordinates** — `pg_distance({ point: { lat: 95, lng: -74 } })` now throws a clean error message (e.g., `lat must be between -90 and 90 degrees`) instead of a raw Zod validation error. Consolidated two separate try-catch blocks into one wrapping the entire handler body with `ZodError` interception, matching the `pg_geocode` pattern. Added 2 unit tests

- **Standalone geometry tools structured error for invalid WKT/GeoJSON** — `pg_geometry_buffer`, `pg_geometry_intersection`, and `pg_geometry_transform` now throw `Invalid geometry input. Use WKT format (e.g., 'POINT(-74 40)') or GeoJSON format (...)` instead of raw `parse error - invalid geometry` exceptions. Added XX000 geometry parse error pattern to `parsePostgresError()`

- **`pg_vector_validate` output schema error for non-vector columns** — `pg_vector_validate({ table: 'embeddings', column: 'name' })` where `name` is a text column now returns `{valid: false, error: "Column 'name' is not a vector column (type: text)", suggestion: "..."}` instead of returning `null` for `columnDimensions` and `expectedDimensions`, which violated the output schema. Added a pre-check of `udt_name` before calling `vector_dims()`

- **`pg_vector_create_index` raw PostgreSQL error for non-vector columns** — `pg_vector_create_index({ table: 'embeddings', column: 'name', type: 'hnsw' })` where `name` is a text column now returns `{success: false, error: "Column 'name' is not a vector column (type: text)...", suggestion: "..."}` instead of the raw PostgreSQL exception `operator class "vector_l2_ops" does not accept data type text`. Added pattern match in the catch block

- **`pg_dump_table` raw PostgreSQL exceptions** — Nonexistent tables/schemas now throw structured errors (e.g., `Table 'x' not found. Use pg_list_tables`) instead of raw PG exceptions like `relation "x" does not exist`. Added try-catch with `parsePostgresError`

- **`pg_stats_correlation` misleading error for nonexistent table** — `pg_stats_correlation({ table: 'nonexistent', column1: 'a', column2: 'b' })` now throws `Table "public.nonexistent" not found` instead of the misleading `Column "a" not found in table "public.nonexistent"`. Replaced inline column validation with shared `validateNumericColumn()` which checks table existence first

- **`pg_stats_time_series` `totalGroupCount` excluded null groups** — When using `groupBy` on a column containing NULLs, `totalGroupCount` now includes the null group in its count, matching the `count` field which already included it. Fixed by making the `COUNT(DISTINCT)` SQL null-aware via a `CASE` expression that adds 1 when NULLs are present

- **`pg_copy_export` raw PostgreSQL exceptions** — Invalid SQL and nonexistent tables now throw structured errors instead of raw PG exceptions. Added try-catch with `parsePostgresError`

- **Schema tools raw MCP exceptions** — `pg_create_schema`, `pg_drop_schema`, `pg_create_sequence`, `pg_drop_sequence`, `pg_create_view`, and `pg_drop_view` now **return** structured `{success: false, error}` responses instead of throwing raw MCP errors. Changed catch blocks from `throw parsePostgresError()` to `return {success: false, error: formatPostgresError()}`. Wrapped Zod `.parse()` calls in outer try-catch with `ZodError` interception for validation failures. Removed unused `parsePostgresError` import. Updated 6 output schemas (`CreateSchemaOutputSchema`, `DropSchemaOutputSchema`, `CreateSequenceOutputSchema`, `DropSequenceOutputSchema`, `CreateViewOutputSchema`, `DropViewOutputSchema`) with optional `error` field, made success-path fields optional, and converted `DropSequenceOutputSchema`/`DropViewOutputSchema` to `.loose()`. Added 6 unit tests for structured error responses. Added `vector` to `pg_list_functions` exclude parameter description

- **Schema create tools misleading "Table already exists" error** — `pg_create_schema`, `pg_create_sequence`, and `pg_create_view` now throw object-type-specific error messages (`Schema 'X' already exists`, `Sequence 'X' already exists`, `View 'X' already exists`) instead of the generic `Table 'X' already exists`. Added `42P06` handler for duplicate schemas and `objectType` context for sequences/views in `parsePostgresError`

- **`pg_list_functions` `exclude: ["vector"]` inconsistency** — Added `vector` to `EXTENSION_ALIASES` so passing the actual extension name (not just the alias `pgvector`) in the `exclude` array correctly filters pgvector functions

- **Partitioning tools raw PostgreSQL exceptions** — `pg_create_partitioned_table`, `pg_create_partition`, and `pg_attach_partition` now route errors through `parsePostgresError()` for structured messages instead of raw PG exceptions. Covers duplicate table/partition names, overlapping range bounds, and already-attached partitions

- **Partitioning tools undocumented response structures** — Added response structure documentation for all 6 partitioning tools and sub-partitioning primary key constraint note to `ServerInstructions.ts`

- **`pg_create_partition` overlapping bounds raw error** — Creating a partition with bounds that overlap an existing partition now throws `Partition bounds overlap with an existing partition. Use pg_list_partitions to see current partition bounds` instead of a raw PostgreSQL exception. Added message-pattern handler in `parsePostgresError` for `would overlap partition` and `conflicting values for partition`

- **`pg_attach_partition` already-attached raw error** — Attaching a table that is already a partition now throws `Table 'X' is already a partition. Use pg_list_partitions to see current partitions, or pg_detach_partition to detach it first` instead of a raw PostgreSQL exception. Added message-pattern handler in `parsePostgresError`

- **`pg_create_partition` sub-partitioning PK conflict misleading error** — Creating a sub-partitioned partition where the parent's primary key doesn't include the sub-partition key column now throws `Primary key on partitioned table must include all partitioning columns...` instead of a raw PostgreSQL `42P16` error. Added message-pattern handler in `parsePostgresError`

- **`pg_detach_partition` response key inconsistency** — Response now uses `partition` key instead of `detached`, matching the `ServerInstructions.ts` documentation and the `pg_attach_partition` response pattern. Updated handler, output schema, and unit tests

- **`pg_detach_partition` missing error handling** — `pg_detach_partition` SQL execution is now wrapped in try-catch with `parsePostgresError`, matching the error handling pattern of `pg_create_partition` and `pg_attach_partition`. Previously, SQL failures leaked as raw PostgreSQL exceptions

- **Cron tools raw PostgreSQL exceptions** — `pg_cron_schedule`, `pg_cron_schedule_in_database`, `pg_cron_unschedule`, and `pg_cron_alter_job` now route errors through `parsePostgresError()` for structured messages instead of raw PG exceptions. Covers invalid cron expressions, nonexistent databases, nonexistent job IDs, and nonexistent job names. Added cron-specific patterns in `parsePostgresError`: `could not find valid entry for job` → `Job 'X' not found`, `invalid schedule:` → `Invalid cron schedule`, and a `pg_cron_` tool context guard in the 42704 block for `alter_job` (job not found) and `schedule_in_database` (database not found). Updated 4 unit tests with stricter assertions

- **`pg_partman_partition_data` / `pg_partman_undo_partition` schema resolution failure** — pg_partman's `partition_data_time` function contains a hardcoded fully-qualified call to `partman.check_control_type(...)`. When pg_partman is installed in the `public` schema (default for newer versions), this fails with `schema "partman" does not exist`. The new `ensurePartmanSchemaAlias` function creates a `partman` schema with a thin wrapper function delegating to `public.check_control_type()`, called automatically by `callPartmanProcedure` when `partmanSchema === 'public'`. Verified live: 3 rows moved successfully from default partition

- **`pg_partman_analyze_partition_health` `hasDataInDefault` false negative** — The default partition data check now uses an actual `SELECT COUNT(*) FROM (SELECT 1 FROM <default> LIMIT 1) t` query instead of `pg_class.reltuples` (an estimated count that returns 0 or -1 for recently-inserted data before ANALYZE has run). This matches the accurate checking pattern already used by `pg_partman_check_default`. Updated 1 unit test

- **Partman tools raw exceptions → structured error returns** — `pg_partman_partition_data` CALL is now wrapped in try-catch returning `{success: false, error, hint}` instead of leaking raw schema errors. `part_config` config query also now wrapped in try-catch, catching cases where `getPartmanSchema()` falls back to `'partman'` but that schema doesn't exist — returns `{success: false, error: "pg_partman extension not found..."}` instead of raw PG exception. `pg_partman_set_retention` 3 `throw new Error()` sites (invalid retention format, config not found in both disable and set paths) converted to structured `{success: false, error, hint}` returns. `pg_partman_undo_partition` target-table-not-found `throw` converted to structured return, and `CALL undo_partition_proc` catch block converted from `throw parsePostgresError()` to structured `{success: false, error, hint}` return with special handling for "No entry in part_config" errors. Added 2 unit tests

- **`pg_partman_create_parent` "system catalogs" error** — `pg_partman_create_parent({ parentTable: 'nonexistent' })` now returns `{success: false, error: "Table 'nonexistent' does not exist."}` instead of the raw pg_partman error `Unable to find given parent table in system catalogs`. Added pattern match in the existing try-catch block

- **`pg_describe_table` output schema error on partitioned tables** — `pg_describe_table` on partitioned tables without a primary key no longer fails with output validation error. The `primaryKey` field in `TableDescribeOutputSchema` now allows `null` in addition to `string[]` and `undefined`, matching the `null` value returned by `PostgresAdapter.describeTable()` when no PK constraint exists

- **`pg_explain` / `pg_explain_analyze` / `pg_explain_buffers` `query` alias rejected** — Direct MCP tool calls using `{ query: "SELECT ..." }` instead of `{ sql: "SELECT ..." }` now work correctly. Previously, the MCP SDK rejected the `query` alias at runtime because `ExplainSchemaBase` did not include it as a field and marked `sql` as required. Added `query` as an optional alias field, made `sql` optional in the base schema, and added handler guard clauses to validate that at least one is provided

- **ESLint 10 compliance** — Resolved 20 new lint errors introduced by ESLint 10's stricter `eslint:recommended` rules:
  - 11 `no-useless-assignment` — Removed dead initial assignments to variables that were always overwritten in subsequent control flow (e.g., `let x = 0` before try/catch that always sets `x`). Affected `ltree.ts`, `citext.ts`, `cron.ts`, `kcache.ts`, `partman/operations.ts`, `postgis/advanced.ts`, `vector/basic.ts`, `jsonb/basic.ts`
  - 9 `preserve-caught-error` — Added `{ cause: error }` to all `throw new Error(...)` calls inside catch blocks to preserve error chain and stack traces. Affected `core/convenience.ts`, `jsonb/advanced.ts`, `jsonb/basic.ts`

- **`pg_count` `condition`/`filter` aliases silently ignored** — `pg_count({ condition: "active = true" })` and `pg_count({ filter: "status = $1" })` now correctly map to the `where` clause. Previously, these aliases were accepted without error but silently dropped, unlike `pg_exists` which handled them correctly. Added `preprocessCountParams` function and updated `CountSchemaBase`/`CountParseSchema` to include alias fields

- **Code Mode `pg.count()` positional WHERE clause dropped** — `pg.count("users", "active = true")` now correctly passes the second positional argument as the `where` parameter. Previously, the `POSITIONAL_PARAM_MAP` for `count` only mapped the first argument (`table`), causing the WHERE clause to be silently dropped. Updated mapping from `"table"` to `["table", "where"]`

- **`pg_object_details` near-empty result for nonexistent objects** — `pg_object_details({ name: "nonexistent", type: "table" })` now throws a clear "not found" error instead of returning a near-empty object with only the type field. Previously, when a `type` was explicitly provided but the object did not exist, the detection query returned `null` but the handler proceeded using the user-provided type, producing unhelpful results

- **`pg_get_indexes` silent empty result for nonexistent tables** — `pg_get_indexes({ table: "nonexistent" })` now throws a high-signal P154 error (`Table 'public.nonexistent' not found`) instead of silently returning an empty `indexes` array. Schema existence is also validated separately. The "list all indexes" path (no table specified) remains unaffected

- **`pg_drop_index` missing `existed` field** — `pg_drop_index` now includes an `existed` boolean in its response, matching the pattern established by `pg_drop_table`. A pre-check query against `pg_indexes` determines whether the index existed before the DROP statement executes

- **`pg_create_index` race condition with `ifNotExists`** — `pg_create_index` with `ifNotExists: true` now performs a pre-check against `pg_indexes` before executing CREATE INDEX. If the index already exists, it returns `{ alreadyExists: true }` without attempting the CREATE. A fallback catch for "already exists" errors handles race conditions where the index is created between the check and the CREATE

- **`pg_read_query` raw PostgreSQL exceptions** — Queries against nonexistent tables now throw structured errors (e.g., `Table 'x' not found. Use pg_list_tables`) instead of raw PG exceptions like `relation "x" does not exist`. Added shared `parsePostgresError()` helper in `error-helpers.ts`

- **`pg_create_table` raw PostgreSQL exceptions** — Creating a duplicate table without `ifNotExists` now throws a structured error (`Table 'x' already exists. Use ifNotExists: true`) instead of the raw PG `relation already exists` exception

- **`pg_drop_table` raw PostgreSQL exceptions** — Dropping a nonexistent table without `ifExists` now throws a structured error instead of the raw PG exception

- **`pg_drop_index` raw PostgreSQL exceptions** — Dropping a nonexistent index without `ifExists` now throws a structured error (`Index 'x' not found. Use ifExists: true`) instead of the raw PG exception

- **`pg_create_index` raw PostgreSQL exceptions** — Creating a duplicate index without `ifNotExists` now throws a structured error with actionable guidance instead of the raw PG exception

- **`ServerInstructions.ts` `pg_list_tables` response docs** — Added missing `totalCount`, `truncated?`, and `hint?` fields to the response structure documentation

- **`pg_text_search` / `pg_text_rank` misleading tsvector error** — Targeting a `tsvector` column now throws `"Column appears to be a tsvector type, which cannot be used directly with text search tools"` instead of the misleading `"Object 'unknown' not found"`. Added a specific pattern in `parsePostgresError` for `function ... tsvector ... does not exist` errors

- **`ServerInstructions.ts` `pg_object_details` response docs** — Added note that table-type objects return the full `pg_describe_table` response shape (columns, primaryKey, indexes, constraints, foreignKeys)

- **`pg_create_table` misleading schema error** — Creating a table in a nonexistent schema (e.g., `schema: "fake"`) now throws `Schema 'fake' does not exist. Create it with pg_create_schema or use pg_list_schemas` instead of the misleading `Object 'fake' not found. Use ifExists: true`

- **`pg_drop_table` generic error message** — Dropping a nonexistent table now throws a schema-qualified table-specific error (`Table 'public.X' not found. Use ifExists: true, or pg_list_tables to verify`) instead of the generic `Object 'X' not found`

- **`ServerInstructions.ts` response structure docs** — Added missing response structures for `pg_create_table`, `pg_drop_table`, `pg_create_index`, `pg_drop_index`, and `pg_truncate`. Fixed `pg_batch_insert` to include `success` and `rowCount` fields

- **`pg_analyze_query_indexes` raw PostgreSQL exceptions** — Queries referencing nonexistent tables now throw structured errors (e.g., `Table 'x' not found. Use pg_list_tables`) instead of raw PG exceptions like `relation "x" does not exist`. Uses the shared `parsePostgresError()` helper consistent with `pg_read_query` and other core tools

- **`pg_write_query` raw PostgreSQL exceptions** — Write queries against nonexistent tables, invalid columns, or duplicate keys now throw structured errors instead of raw PG exceptions. Added try/catch wrapping with `parsePostgresError()` for both transaction and non-transaction execution paths

- **`pg_batch_insert` raw constraint violation exceptions** — Batch inserts that violate unique constraints now throw structured errors (e.g., `Unique constraint violated: ... Use pg_upsert for insert-or-update behavior`) instead of raw PG exceptions. Added try/catch wrapping with `parsePostgresError()`

- **`parsePostgresError` expanded coverage** — Added three new PG error codes: `42601` (syntax_error → `SQL syntax error: ...`), `42703` (undefined_column → `Column not found: ...`), `23505` (unique_violation → `Unique constraint violated: ...`). Fixed 42P01 regex to avoid false-matching 42703 column error messages that also contain `relation "..." does not exist`

- **`parsePostgresError` transaction error codes** — Added two new PG error codes with higher precedence than the broad `42704` handler: `3B001` (savepoint_exception → `Savepoint 'X' does not exist in this transaction`) and `25P02` (in_failed_sql_transaction → `Transaction is in an aborted state — only ROLLBACK ...`)

- **Performance tools raw PostgreSQL exceptions** — `pg_explain`, `pg_explain_analyze`, `pg_explain_buffers`, `pg_index_recommendations`, `pg_query_plan_compare`, and `pg_partition_strategy_suggest` now throw structured errors (via `parsePostgresError`) instead of raw PG exceptions when queries reference nonexistent tables, have syntax errors, etc. Added try/catch wrapping in `explain.ts`, `analysis.ts`, and `optimization.ts`

- **`ServerInstructions.ts` performance tool response docs** — Added missing response structures for 9 performance tools: `pg_stat_activity`, `pg_locks`, `pg_bloat_check`, `pg_seq_scan_tables`, `pg_connection_pool_optimize`, `pg_performance_baseline`, `pg_unused_indexes`, `pg_duplicate_indexes`, `pg_query_plan_compare`

- **`PostgresAdapter` savepoint methods raw exceptions** — `createSavepoint`, `releaseSavepoint`, and `rollbackToSavepoint` now wrap errors through `parsePostgresError()` for structured messages instead of propagating raw PG exceptions

- **`PostgresAdapter` commit-after-abort silent data loss** — `commitTransaction` now probes the transaction state with `SELECT 1` before issuing `COMMIT`. If the transaction is in an aborted state (25P02), it rolls back and throws a clear `TransactionError` instead of silently performing a rollback disguised as a commit

- **`pg_transaction_execute` raw error propagation** — The execute handler now wraps caught errors through `parsePostgresError()` and includes `autoRolledBack: true` context when the transaction was automatically cleaned up (auto-commit mode)

- **`ServerInstructions.ts` transaction docs** — Added aborted transaction state recovery guidance and documented `SELECT` query support in `pg_transaction_execute`

- **JSONB tools raw PostgreSQL exceptions** — All 14 database-facing JSONB tool handlers (`pg_jsonb_extract`, `pg_jsonb_set`, `pg_jsonb_delete`, `pg_jsonb_contains`, `pg_jsonb_typeof`, `pg_jsonb_path_query`, `pg_jsonb_agg`, `pg_jsonb_keys`, `pg_jsonb_insert`, `pg_jsonb_normalize`, `pg_jsonb_index_suggest`, `pg_jsonb_security_scan`, `pg_jsonb_stats`, `pg_jsonb_strip_nulls`) now route errors through `parsePostgresError()` for structured messages instead of raw PG exceptions. Handlers with existing domain-specific catches (keys, insert, normalize, index_suggest, security_scan, stats) were augmented with `parsePostgresError()` as a fallback

- **`pg_jsonb_insert` preliminary queries raw PostgreSQL exceptions** — The three pre-flight checks (NULL column detection, root-level type check, parent-path type check) now wrap errors through `parsePostgresError()`. Previously, a nonexistent table error from these checks leaked as a raw PG exception, bypassing the structured error handling that the main UPDATE query already had

- **`pg_jsonb_path_query` invalid JSONPath syntax** — Invalid JSONPath expressions now throw a clear `Invalid JSONPath syntax: '...' Use $.key, $.array[*], or $.* ? (@.field > 10) syntax` error instead of the raw PG `syntax error at end of jsonpath input` exception

- **Text tools raw PostgreSQL exceptions** — All 8 table-based text tool handlers (`pg_text_search`, `pg_text_rank`, `pg_trigram_similarity`, `pg_fuzzy_match`, `pg_regexp_match`, `pg_like_search`, `pg_text_headline`, `pg_create_fts_index`) now route errors through `parsePostgresError()` for structured messages instead of raw PG exceptions

- **`ServerInstructions.ts` text tool docs** — Added Text Tools section documenting `pg_text_search`/`pg_text_rank` text-column-only limitation (tsvector columns unsupported) and `pg_create_fts_index` response structure (`{success, index, config, skipped}`)

- **Admin tools raw PostgreSQL exceptions** — `pg_vacuum`, `pg_vacuum_analyze`, `pg_analyze`, `pg_reindex`, `pg_set_config`, and `pg_cluster` now route errors through `parsePostgresError()` for structured messages instead of raw PG exceptions. Added try/catch wrapping with context-aware error fields (table, schema) for each handler

- **`ServerInstructions.ts` admin tool response docs** — Added missing response structures for all 10 admin tools: `vacuum`, `vacuumAnalyze`, `analyze`, `reindex`, `cluster`, `setConfig`, `reloadConf`, `resetStats`, `cancelBackend`, `terminateBackend`

- **`pg_set_config` unrecognized parameter error** — `pg_set_config({ name: 'nonexistent_param' })` now throws `Unrecognized configuration parameter 'nonexistent_param'. Use pg_show_settings to see available parameters` instead of the generic `Object 'nonexistent_param' not found. Use ifExists: true`

- **`pg_reindex` misleading error for nonexistent index** — `pg_reindex({ target: 'index', name: 'nonexistent' })` now throws `Index 'nonexistent' not found. Use pg_get_indexes to see available indexes` instead of the misleading `Table or view 'nonexistent' not found`. The handler now passes `target` and `index`/`table` context to `parsePostgresError()`

- **`pg_cluster` misleading `ifExists` suggestion for nonexistent index** — `pg_cluster({ table: 'users', index: 'nonexistent' })` now throws `Index 'nonexistent' not found. Use pg_get_indexes to see available indexes` instead of suggesting `Use ifExists: true to avoid this error`, which is not a valid `pg_cluster` parameter. Added tool-context guard in `parsePostgresError` 42704 handler. Added 1 unit test

- **`pg_database_size` misleading `ifExists` suggestion for nonexistent database** — `pg_database_size({ database: 'nonexistent_db' })` now returns `{success: false, error: "Database 'nonexistent_db' does not exist. Verify the database name or omit the parameter to use the current database."}` instead of the misleading `"Object 'nonexistent_db' not found. Use ifExists: true to avoid this error."`. Added `3D000` (invalid_catalog_name) handler to `parsePostgresError` before the generic `42704` block. Tightened 1 unit test assertion

## [1.2.0] - 2026-02-10

### Added

- **P154 Object Existence Verification** — Convenience tools (`pg_count`, `pg_exists`, `pg_upsert`, `pg_batch_insert`, `pg_truncate`) now perform a pre-flight table existence check before executing their main query. When a table does not exist, these tools return a high-signal error message (e.g., `Table "public.nonexistent" does not exist`) instead of raw PostgreSQL errors like `relation "nonexistent" does not exist`. Implemented via a shared `validateTableExists()` helper that queries `information_schema.tables`. Added 12 dedicated unit tests in `convenience.test.ts`
- **pg_list_tables `exclude` parameter** — `pg_list_tables` now accepts an optional `exclude` array of schema names to filter out extension/system schemas (e.g., `exclude: ['cron', 'topology', 'partman']`). Reduces noisy output by hiding extension-owned tables and views. Added 3 unit tests
- **`--server-host` CLI argument** — New `--server-host <host>` flag and `MCP_HOST` environment variable for configuring the server bind address (default: `localhost`). Enables containerized deployments by allowing the server to bind to `0.0.0.0`. Precedence: CLI flag → `MCP_HOST` → `HOST` → `localhost`. Dockerfile now defaults to `HOST=0.0.0.0` for container use

### Improved

- **`pg_upsert` response cleanup** — Removed the `sql` field from the default response to prevent leaking generated SQL and reduce context token usage
- **P154 schema-vs-table error granularity** — `validateTableExists()` now performs a schema-existence check before the table check, producing distinct error messages: `Schema 'X' does not exist` vs `Table 'X.Y' not found`. Updated 30 existing tests and added 5 new schema-specific tests
- **`pg_analyze_workload_indexes` `queryPreviewLength` parameter** — Added configurable maximum characters for query preview (default: 200). Truncated queries now end with `…` instead of silently cutting off
- **`pg_describe_table` documentation** — Clarified `rowCount: -1` meaning in `ServerInstructions.ts` to distinguish stale/missing statistics from small table optimization

### Fixed

- **`pg_ltree_convert_column` already-ltree response consistency** — When the target column is already of `ltree` type, the response now includes `table` and `previousType: "ltree"` fields, matching the response shape of a successful conversion. Previously returned only `{success, message, wasAlreadyLtree}` without the `table` or `previousType` fields documented in `ServerInstructions.ts`

- **`pg_ltree_create_index` already-exists response consistency** — When the target index already exists, the response now includes `table`, `column`, and `indexType: "gist"` fields, matching the response shape of a fresh index creation. Previously returned only `{success, message, indexName, alreadyExists}` without the additional context fields

- **`pg_kcache_top_io` type-specific WHERE filter** — `pg_kcache_top_io` now filters by the type-specific I/O column when `ioType` (or `type`) is `reads` or `writes`. Previously, the WHERE clause always used `(reads + writes) > 0` regardless of `ioType`, meaning `ioType: 'reads'` included queries with zero reads but nonzero writes (sorted to the bottom). Now: `reads` filters by `reads > 0`, `writes` filters by `writes > 0`, `both` (default) filters by `reads + writes > 0`

- **`pg_kcache_query_stats` and `pg_kcache_resource_analysis` schema default description** — Fixed `limit` parameter description in `KcacheQueryStatsSchema` and `KcacheResourceAnalysisSchema` from `(default: 50)` to `(default: 20)` to match handler `DEFAULT_LIMIT = 20`. Previously, the schema documentation misled callers into expecting 50 results when only 20 were returned by default

- **`pg_kcache_top_cpu` and `pg_kcache_top_io` `queryPreviewLength` parameter** — Both tools now accept `queryPreviewLength` (default: 100, max: 500, 0 for full query), consistent with `pg_kcache_query_stats` and `pg_kcache_resource_analysis` which already supported it. Previously hardcoded to `LEFT(s.query, 100)`. Updated `ServerInstructions.ts` and added 2 unit tests

- **Kcache `count`/`totalCount` race condition guard** — All 4 kcache tools with count-then-query pattern (`queryStats`, `topCpu`, `topIo`, `resourceAnalysis`) now use `Math.max(totalCount, rowCount)` to prevent `totalCount < count` when kcache self-referential queries inflate the result set between the COUNT and main queries. Ensures `truncated` flag is never misleadingly `false`

- **`pg_kcache_query_stats` and `pg_kcache_resource_analysis` default limit reduced** — Default limit lowered from 50 to 20 for both tools, reducing typical response payload by ~60%. Consistent with `pg_stat_statements` (default 20) and `pg_unused_indexes` (default 20). Use `limit: 50` to restore previous behavior, or `limit: 0` for all rows

- **`pg_pgcrypto_gen_random_uuid` `count` parameter MCP exposure** — The `count` parameter (1-100) is now visible to MCP clients for direct tool calls, enabling batch UUID generation (e.g., `pg_pgcrypto_gen_random_uuid({ count: 5 })`). Previously, the `.default({})` on the Zod schema collapsed the object during JSON Schema conversion, hiding `count` from MCP clients. Applied Split Schema pattern: `GenUuidSchemaBase` for MCP visibility, `GenUuidSchema` with `.default({})` for handler parsing

- **`pg_buffer` and `pg_geo_transform` truncation indicators for explicit limits** — Both tools now correctly return `truncated: true` + `totalCount` when an explicit `limit` parameter truncates results. Previously, `truncated` and `totalCount` were only returned when the default limit (50) was applied, contradicting the documented behavior in `ServerInstructions.ts`. The truncation check condition was broadened from `parsed.limit === undefined && effectiveLimit > 0` to `effectiveLimit > 0`. Added 3 unit tests

- **`pg_geo_transform` SRID auto-detection from column metadata** — `fromSrid` is now optional. When not provided, the tool auto-detects the source SRID from `geometry_columns`/`geography_columns` catalog tables, matching the pattern used by `pg_intersection`. Returns `autoDetectedSrid: true` in the response when auto-detected. Returns structured `{success: false, error, suggestion}` with actionable message when SRID cannot be determined. Removed `fromSrid > 0` schema refine. Added 3 unit tests, updated 1 existing schema test

- **Partitioning write tools structured error handling** — `pg_create_partition`, `pg_attach_partition`, and `pg_detach_partition` now return structured `{success: false, error: "..."}` responses instead of raw PostgreSQL errors when parent tables don't exist, aren't partitioned, or partition tables don't exist. Uses `checkTablePartitionStatus` pre-checks consistent with read tools (`pg_list_partitions`, `pg_partition_info`). Updated output schemas to make non-success fields optional and added `error` field. Added 6 unit tests covering all error paths

- **`pg_drop_schema` response key consistency** — Renamed response key `dropped` → `schema` to align with sibling drop tools (`pg_drop_sequence` → `sequence`, `pg_drop_view` → `view`). The `schema` field now always returns the schema name; use `existed` boolean to determine if the schema was present before drop. Updated output schema and 2 unit tests

- **`pg_list_functions` fuzzystrmatch alias mapping for `exclude`** — `pg_list_functions({ exclude: ['fuzzymatch'] })` and `exclude: ['fuzzy']` now correctly filter out fuzzystrmatch functions. The fuzzystrmatch extension registers functions in the `public` schema, so passing the full `'fuzzystrmatch'` name was required. Added `fuzzymatch` → `fuzzystrmatch` and `fuzzy` → `fuzzystrmatch` aliases to `EXTENSION_ALIASES`, matching the existing `pgvector` → `vector` and `partman` → `pg_partman` patterns. Added 2 unit tests

- **`pg_hybrid_search` tsvector `textColumn` support** — `textColumn` now auto-detects column type: uses tsvector columns directly (no wrapping), wraps plain text columns with `to_tsvector('english', ...)`. Previously, tsvector columns caused SQL errors due to unconditional `to_tsvector()` wrapping. Added 2 unit tests and updated 4 existing test mocks

- **`pg_vector_batch_insert` tool filtering registration** — Fixed `pg_vector_batch_insert` not appearing as a direct MCP tool. The tool was fully implemented and registered in the vector factory (`vector/index.ts`) but missing from the `vector` tool group in `ToolConstants.ts` (tool filtering registry). Added to vector array, increasing total vector tools from 15 to 16. Updated meta-group tool counts (`ai-vector` 48→49, `ext-ai` 25→26)

- **Vector tool object existence checks (P154)** — `pg_vector_search`, `pg_vector_aggregate`, `pg_vector_insert`, `pg_vector_batch_insert`, `pg_vector_add_column`, `pg_vector_cluster`, `pg_vector_index_optimize`, `pg_vector_performance`, `pg_vector_create_index`, `pg_vector_dimension_reduce`, and `pg_hybrid_search` now perform two-step existence verification (table first, then column) before executing main operations. Returns structured `{success: false, error: "...", suggestion: "..."}` with actionable messages distinguishing missing tables from missing columns. `pg_hybrid_search` catch block error format also standardized to separate schema and table names. Extracted reusable `checkTableAndColumn` helper. Added 21 unit tests covering all error paths

- **`pg_write_query` DDL outputSchema validation error** — DDL statements (`CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`) no longer fail output schema validation with `"expected number, received undefined"` on the `rowsAffected` field. The handler now defaults `rowsAffected` to `0` when the adapter returns `undefined` (DDL commands don't report affected rows). Added unit test

- **`pg_list_functions` extension alias mapping for `exclude`** — `pg_list_functions({ exclude: ["pgvector"] })` now correctly filters out pgvector functions. The pgvector extension registers as `vector` in PostgreSQL's `pg_extension` catalog, so passing `"pgvector"` in the `exclude` array previously failed to match. Added `EXTENSION_ALIASES` mapping that expands well-known names (e.g., `pgvector` → `vector`) before building the exclude query. Both the schema-name filter (`nspname NOT IN`) and the `pg_depend`/`pg_extension` ownership filter now use the expanded list. Added unit test

- **`pg_list_functions` partman alias for `exclude`** — `exclude: ["partman"]` now correctly filters out pg_partman functions. pg_partman installs functions in the `public` schema, so the schema-name exclusion filter alone doesn't catch them. Added `partman` → `pg_partman` alias to `EXTENSION_ALIASES`, matching the existing `pgvector` → `vector` pattern. Added unit test

- **`pg_list_tables` / `pg_describe_table` `rowCount` consistency** — `rowCount` now returns `0` for empty or freshly created tables instead of being silently omitted from the response. Previously, `listTables()` used `effectiveRowCount > 0 ? effectiveRowCount : undefined` which converted zero to `undefined`, and `describeTable()` used raw `c.reltuples::bigint` which returned `-1` for never-analyzed tables. Both methods now use the same `CASE WHEN reltuples = -1 THEN NULL` SQL guard with `live_row_estimate` fallback. Added 2 unit tests

- **`runningQueries` Code Mode alias mapping** — `pg.performance.runningQueries()` now correctly routes to `longRunningQueries()` (returning `{longRunningQueries, count, threshold}`) instead of `statActivity()` (which returns `{connections, count}`). The `METHOD_ALIASES` map in `api.ts` incorrectly pointed `runningQueries` to `statActivity` instead of `longRunningQueries`

- **`pg_stat_statements` missing `count` field** — Response now includes `count` (number of statements returned), consistent with all other paginated performance tools (`pg_index_stats`, `pg_table_stats`, `pg_unused_indexes`, etc.). Output schema updated to use shared `PaginatedBase` pattern

### Performance

- **Metadata caching for `listTables` and `describeTable`** — These high-frequency schema introspection methods now use the existing TTL-based metadata cache (default 30s, configurable via `METADATA_CACHE_TTL_MS`), matching the caching already applied to `getAllIndexes`. Reduces database load for repeated schema queries within the TTL window. Cache is automatically invalidated via `clearMetadataCache()`. Added 4 dedicated unit tests

### Documentation

- **Code Mode token efficiency guidance** — Added actionable tips to `README.md`, `DOCKER_README.md`, and `Code-Mode.md` wiki page recommending users instruct their AI agents to prefer `pg_execute_code` (Code Mode) for multi-step database operations. Includes example prompt rule for agent configuration. Links to the Code Mode wiki for full API documentation

- **Tool count consistency across all documentation** — Synchronized tool counts across `ToolConstants.ts`, `README.md`, `DOCKER_README.md`, and 7 wiki pages. Fixed `core` group comment (19→20) in `ToolConstants.ts` to match actual array length after `pg_drop_index` addition. Updated total tool count (205→206), `vector` group table entry (16→17), and all meta-group/shortcut counts that include `core` (+1 each: `starter` 58→59, `essential` 46→47, `ai-vector` 49→50, `geo` 42→43, etc.). Fixed stale capabilities table in `Home.md` (204→206). Fixed `ext-ai` count in `Tool-Filtering.md` wiki (25→26). Recalculated extension tool total in `Extension-Overview.md` (87→80→79→80). Fixed stale pgvector inline count in `Home.md` wiki nav (16→17). Updated `ToolConstants.ts` inline meta-group comments to match block comment sums

- **DOCKER_README.md prompt names and resource URIs** — Fixed 6 incorrect prompt names missing the `pg_` prefix (e.g., `optimize_query` → `pg_performance_analysis`, `index_tuning` → `pg_index_tuning`). Replaced non-existent `performance_baseline` prompt with `pg_tool_index`. Fixed non-existent resource URI `postgres://connections` → `postgres://activity`. Updated prompt link anchor to match README.md

- **DOCKER_README.md missing extensions** — Added `pg_trgm`, `fuzzystrmatch`, and `hypopg` to the extension support table, aligning with the full 12-extension list in `README.md`

- **Troubleshooting wiki `pg_cancel_query` → `pg_cancel_backend`** — Fixed incorrect tool name reference. `pg_cancel_query` does not exist; the actual tool is `pg_cancel_backend` (admin group)

- **Code-Mode wiki expanded API documentation** — Replaced minimal `pg.query()`/`pg.execute()` API section with comprehensive documentation covering all 19 API groups (`pg.{group}.{method}()` pattern), naming conventions, top-level aliases, format auto-resolution, and `pg.help()` discovery. Updated AntiGravity section to reference the full API surface

- **`pg_kcache_database_stats` optional `database` parameter in `ServerInstructions.ts`** — Documented that `pg_kcache_database_stats` accepts an optional `database` parameter to filter stats to a specific database. The parameter was already implemented in the handler but undocumented

- **`pg_kcache_top_cpu` and `pg_kcache_top_io` truncation indicators in `ServerInstructions.ts`** — Added missing `truncated` + `totalCount` documentation for both tools. These fields were already returned by the handlers but undocumented, making it harder for agents to anticipate the response structure

- **`pg_regexp_match` and `pg_like_search` default limit** — Both tools now default to `LIMIT 100` when no `limit` parameter is specified, preventing unbounded result sets on large tables. Consistent with `pg_trigram_similarity` and `pg_fuzzy_match` which already defaulted to 100. Updated schema descriptions and added 2 unit tests

- **Stale `pg_similarity_search` reference in `ServerInstructions.ts`** — Removed non-existent tool reference and replaced with accurate documentation noting that `pg_trigram_similarity`, `pg_fuzzy_match`, `pg_regexp_match`, and `pg_like_search` all default to 100 results

- **`pg_partman_show_config` schema-agnostic description** — Changed tool description from "partman.part_config table" to "part_config table" since the `part_config` table can reside in either the `partman` or `public` schema depending on how `pg_partman` was installed

- **`pg_partman_undo_partition` cleanup guidance** — The `undo_partition` handler now always includes a `note` field explaining that the parent partitioned table remains after the operation and may require manual `DROP TABLE ... CASCADE` cleanup. When `keepTable` is true (default), an additional note explains that detached child partitions also remain as standalone tables. Updated `ServerInstructions.ts` with cleanup guidance

- **Misleading `forValues` parameter description in partitioning schemas** — Updated `forValues` description in `CreatePartitionSchemaBase` and `AttachPartitionSchemaBase` to explicitly state it requires a raw SQL partition bounds string with concrete examples (e.g., `FROM ('2024-01-01') TO ('2024-07-01')`, `IN ('US', 'CA')`, `WITH (MODULUS 4, REMAINDER 0)`). The previous description ("Provide: from/to (RANGE), values (LIST), modulus/remainder (HASH)") misled AI callers into passing JSON objects like `{"from": "...", "to": "..."}` instead of raw SQL strings

- **Performance tools response structures in `ServerInstructions.ts`** — Added missing Response Structures table entries for `pg_index_stats` (`{indexes, count, truncated?, totalCount?}`), `pg_table_stats` (`{tables, ...}`), `pg_vacuum_stats` (`{tables, ...}`), and `pg_stat_statements` (`{statements, ...}`). These tools return truncation-aware payloads but their response key names were undocumented, making it harder for agents to access the correct array keys (e.g., `indexes` not `indexStats`)

- **`help()` documentation consistency in `ServerInstructions.ts`** — Fixed 5 `pg.{group}.help()` discovery lines to consistently document the `methodAliases` key. 4 lines (ltree, postgis, cron, pgcrypto) incorrectly said `aliases` instead of `methodAliases`, and 1 line (schema) omitted it entirely. Now all match the actual `help()` return structure `{methods, methodAliases, examples}` from `api.ts`

- **PostGIS code mode aliases in `ServerInstructions.ts`** — Added missing `pg.postgis.geoCluster()` → `pg_geo_cluster` and `pg.postgis.geoTransform()` → `pg_geo_transform` code mode method mappings. Updated `pg_geo_transform` docs to mention SRID auto-detection and `autoDetectedSrid` response field

- **Updated tool counts in README.md and DOCKER_README.md** — Reflected `pg_vector_batch_insert` addition: total 204→205, `ai-vector` 48→49, `ext-ai` 25→26, pgvector 15→16 vector tools (12 changes across 2 files)

- **`pg_list_functions` exclude example expanded** — Updated `ServerInstructions.ts` exclude example from `['postgis', 'citext', 'fuzzystrmatch']` to include 9 common extensions (`postgis`, `pg_trgm`, `ltree`, `citext`, `fuzzystrmatch`, `pg_stat_statements`, `hypopg`, `unaccent`, `pg_stat_kcache`). Added caveat that the `language` filter does NOT exclude extension functions—agents should use `exclude` alongside `language` for clean results

- **`pg_vector_performance` `testVectorSource` documentation** — Fixed documented values from `'auto-generated'|'user-provided'` to `'auto-generated from first row'|'user-provided'` to match actual handler output

- **`pg_hybrid_search` tsvector support documented** — Added note in `ServerInstructions.ts` that `textColumn` auto-detects type

- **`pg_write_query` DDL response clarification** — Updated `ServerInstructions.ts` response structures table to note that DDL statements return `rowsAffected: 0`

- **`pg_describe_table` response structure completeness** — Updated `ServerInstructions.ts` to list the full top-level envelope fields (`name`, `schema`, `type`, `owner`, `rowCount`, `primaryKey`) alongside the previously documented array fields

- **`pg_list_functions` response structure** — Removed undocumented `note?` field from `listFunctions` response structure in `ServerInstructions.ts`

- **`createView` `alreadyExisted` clarification** — Clarified that `alreadyExisted` is only present when `ifNotExists`/`orReplace` is set, not unconditionally

### Dependencies

- Bump `@modelcontextprotocol/sdk` from 1.25.3 to 1.26.0
- Bump `@types/node` from 25.1.0 to 25.2.3
- Bump `commander` from 14.0.2 to 14.0.3
- Bump `globals` from 17.2.0 to 17.3.0
- Bump `pg` from 8.17.2 to 8.18.0
- Bump `typescript-eslint` from 8.54.0 to 8.55.0
- Skipped `eslint` 10.0.0 and `@eslint/js` 10.0.1 — major version upgrade blocked by `typescript-eslint` v8.55 which only supports `eslint ^8.57.0 || ^9.0.0`

### Code Quality

- **Systematic `eslint-disable` elimination** — Removed ~43 `eslint-disable` comments across the codebase. Only 7 justified suppressions remain (5 `no-deprecated` for SDK limitations, 2 `no-control-regex` for security patterns), all with inline justification comments
  - `require-await` (~30 occurrences) — Removed `async` keyword from prompt/tool handlers and test adapter methods that don't `await`; wrapped returns in `Promise.resolve()` or `Promise.resolve().then()` to maintain `Promise<unknown>` signatures
  - `no-misused-promises` (2 occurrences) — Added type casts in mock files (`adapter.ts`, `pool.ts`) to match `mockImplementation` signatures
  - `no-unused-vars` (2 occurrences) — Replaced `_xmax` destructuring with `Object.fromEntries` filter in `convenience.ts`; added `varsIgnorePattern: "^_"` to ESLint config for intentionally unused `_`-prefixed variables
  - `no-unsafe-argument` / `no-explicit-any` (1 occurrence) — Replaced `as any` with `as Transport` type import in `cli.ts` for SDK `exactOptionalPropertyTypes` incompatibility

## [1.1.0] - 2026-01-29

### Fixed

- **pg_set_config Zod output schema error** — Fixed direct MCP tool call failing with output validation error. The handler was returning `{success, parameter, value}` without a `message` field, which is required by `ConfigOutputSchema`. Handler now returns a `message` field (e.g., "Set work_mem = 256MB") and the schema now includes optional `parameter` and `value` fields for set_config operations
- **pg_cache_hit_ratio Zod output schema error** — Fixed direct MCP tool call failing with `Cannot read properties of undefined (reading '_zod')` error. The root cause was the `CacheHitRatioOutputSchema` using `.nullable()` at the top level, which broke MCP's Zod-to-JSON Schema conversion. Changed schema to always return an object with nullable fields, and updated handler to never return `null` (fields are set to `null` individually when no data exists)
- **pg_stats_hypothesis params stripped by transform** — Fixed `StatsHypothesisSchema.transform()` stripping the `params` field from parsed input, causing parameterized WHERE clauses to fail with "there is no parameter $1" errors. The transform now preserves `params: data.params`
- **JSONB Output Schema Validation Bugs**
  - `pg_jsonb_typeof` — Fixed `columnNull` field type from array to boolean to match actual handler output
  - `pg_jsonb_strip_nulls` — Refactored output schema from union to combined object with optional fields to resolve Zod validation errors
  - `pg_jsonb_stats` — Fixed `typeDistribution[].type` to accept null for SQL NULL columns; added missing `sqlNullCount` and `hint` output fields
- **Vector Tools Output Schema Validation Bugs**
  - `pg_vector_index_optimize` — Fixed `estimatedRows` returned as string from PostgreSQL bigint; now explicitly cast to number before output schema validation
  - `pg_vector_performance` — Fixed `estimatedRows`, `idx_scan`, and `idx_tup_read` returned as strings from PostgreSQL bigint; now explicitly cast to numbers
  - `pg_vector_aggregate` — Fixed output schema field names: handler returns `average_vector`/`group_key` but schema expected `average`/`groupKey`; updated schema to match handler output
  - `pg_vector_embed` — Fixed output schema validation error when `summarize: false`; handler now always returns embedding in object format `{preview, dimensions, truncated}` to comply with `VectorEmbedOutputSchema`
- **pg_vector_insert Split Schema Violation** — Fixed direct MCP tool calls not accepting `tableName` and `col` aliases. Implemented Split Schema pattern with `VectorInsertSchemaBase` for MCP visibility and transformed schema for handler alias resolution. Error messages now mention aliases (e.g., "table (or tableName) parameter is required")
- **pg_vector_validate user-friendly error** — Fixed raw Zod validation error being returned when invalid input types are provided (e.g., string instead of number array for `vector` parameter). Now returns `{valid: false, error: \"Invalid vector: ...\", suggestion: \"Ensure vector is an array of numbers, e.g., [0.1, 0.2, 0.3]\"}` for type validation failures
- **pg_vector_validate direct MCP tool exposure** — Fixed `pg_vector_validate` not appearing as a direct MCP tool. The tool was missing from the `vector` tool group in `ToolConstants.ts` (registry entry). Added `pg_vector_validate` to the vector array, increasing total vector tools from 14 to 15
- **Cron schedule output schema jobId type** — Fixed `pg_cron_schedule` and `pg_cron_schedule_in_database` direct MCP tool calls failing with output validation error. PostgreSQL BIGINT values are returned as strings due to JavaScript number precision limits, but the output schema expected `z.number()`. Changed `jobId` type to `z.string()` in both `CronScheduleOutputSchema` and `CronScheduleInDatabaseOutputSchema`

### Performance

- **pg_cron_job_run_details default limit reduced** — Reduced default limit from 100 to 50 rows to match AI-optimized payload patterns used by other tools (e.g., `pg_cron_list_jobs`, `pg_table_stats`). Reduces typical response payload size by ~50%. Use `limit: 100` or higher to restore previous behavior, or `limit: 0` for all records

### Documentation

- **Large vector limitations** — Updated `ServerInstructions.ts` Vector Tools section to document that direct MCP tool calls may truncate vectors >256 dimensions due to JSON-RPC message size limits. Recommends Code Mode (`await pg.vector.search({...})`) for vectors ≥256 dimensions (e.g., OpenAI 1536-dim, local 384-dim embeddings)

- **JSONB Split Schema Pattern** — Implemented Split Schema pattern for 6 JSONB tools to support parameter aliases in direct MCP tool calls:
  - Added `tableName` (alias for `table`), `col` (alias for `column`), and `filter` (alias for `where`) support
  - Added `preprocessJsonbParams()` function for alias normalization and `schema.table` parsing
  - Created Base schemas for MCP visibility and full schemas with preprocessing for handler parsing
  - Updated tools: `pg_jsonb_extract`, `pg_jsonb_set`, `pg_jsonb_insert`, `pg_jsonb_delete`, `pg_jsonb_contains`, `pg_jsonb_path_query`
- **JSONB path parsing negative index support** — Fixed `stringPathToArray()` to parse negative array indices like `[-1]` in string paths. Previously, the regex `/\[(\d+)\]/g` only matched positive indices, causing paths like `'tags[-1]'` to fail parsing. Now supports both `[0]` and `[-1]` bracket notation

### Changed

- **Modern Tool Registration** — Migrated from deprecated `server.tool()` to `server.registerTool()` API for MCP 2025-11-25 compliance
  - Updated `DatabaseAdapter.registerTool()` to use modern registration API
  - Enhanced `createContext()` with optional `server` and `progressToken` parameters
  - Removed unused `extractZodShape()` helper method

### Added

- **Progress Notification Infrastructure** — Added `src/utils/progress-utils.ts` with MCP 2025-11-25 compliant progress utilities
  - `buildProgressContext()` — Extracts server/token from RequestContext
  - `sendProgress()` — Sends progress notifications to client
  - `createBatchProgressReporter()` — Throttled progress for batch operations
- **Admin Tool Progress Notifications** — Long-running operations now emit progress:
  - `pg_vacuum` — VACUUM operations
  - `pg_vacuum_analyze` — VACUUM ANALYZE operations
  - `pg_analyze` — ANALYZE operations
  - `pg_reindex` — REINDEX operations
  - `pg_cluster` — CLUSTER operations
- **Backup Tool Progress Notifications** — `pg_copy_export` now emits progress for large exports
- **Stats tools `params` support** — All 8 stats tools now accept an optional `params` array for parameterized `where` clauses (e.g., `where: "value > $1", params: [100]`). Consistent with core tools like `pg_read_query` and `pg_count`. Affected tools: `pg_stats_descriptive`, `pg_stats_percentiles`, `pg_stats_correlation`, `pg_stats_regression`, `pg_stats_time_series`, `pg_stats_distribution`, `pg_stats_hypothesis`, `pg_stats_sampling`
- **JSONB Stats Payload Control** — Added `topKeysLimit` parameter to `pg_jsonb_stats` to control number of top keys returned (default: 20)
- **Structured Content (outputSchema) for Core Tools** — All 20 core tools now include `outputSchema` for MCP 2025-11-25 compliance:
  - Query tools: `pg_read_query`, `pg_write_query`
  - Table tools: `pg_list_tables`, `pg_describe_table`, `pg_create_table`, `pg_drop_table`
  - Index tools: `pg_get_indexes`, `pg_create_index`, `pg_drop_index`
  - Object tools: `pg_list_objects`, `pg_object_details`, `pg_list_extensions`
  - Health tools: `pg_analyze_db_health`, `pg_analyze_workload_indexes`, `pg_analyze_query_indexes`
  - Convenience tools: `pg_upsert`, `pg_batch_insert`, `pg_count`, `pg_exists`, `pg_truncate`
  - Added 15 reusable output schemas in `core/schemas.ts`
- **Structured Content (outputSchema) for Transaction Tools** — All 8 transaction/codemode tools now include `outputSchema`:
  - Transaction tools: `pg_transaction_begin`, `pg_transaction_commit`, `pg_transaction_rollback`, `pg_transaction_savepoint`, `pg_transaction_release`, `pg_transaction_rollback_to`, `pg_transaction_execute`
  - Codemode tool: `pg_execute_code`
  - Added 4 reusable transaction output schemas in `core.ts` and 1 codemode output schema
- **Structured Content (outputSchema) for JSONB Tools** — All 19 JSONB tools now include `outputSchema`:
  - Basic tools: `pg_jsonb_extract`, `pg_jsonb_set`, `pg_jsonb_insert`, `pg_jsonb_delete`, `pg_jsonb_contains`, `pg_jsonb_path_query`, `pg_jsonb_agg`, `pg_jsonb_object`, `pg_jsonb_array`, `pg_jsonb_keys`, `pg_jsonb_strip_nulls`, `pg_jsonb_typeof`
  - Advanced tools: `pg_jsonb_validate_path`, `pg_jsonb_merge`, `pg_jsonb_normalize`, `pg_jsonb_diff`, `pg_jsonb_index_suggest`, `pg_jsonb_security_scan`, `pg_jsonb_stats`
  - Added 19 reusable output schemas in `schemas/jsonb.ts`
- **Structured Content (outputSchema) for Text Tools** — All 13 text tools now include `outputSchema`:
  - Search tools: `pg_text_search`, `pg_text_rank`, `pg_trigram_similarity`, `pg_fuzzy_match`, `pg_regexp_match`, `pg_like_search`, `pg_text_headline`
  - Utility tools: `pg_create_fts_index`, `pg_text_normalize`, `pg_text_sentiment`, `pg_text_to_vector`, `pg_text_to_query`, `pg_text_search_config`
  - Added 7 reusable output schemas in `schemas/text-search.ts` (shared TextRowsOutputSchema for search tools)
- **Structured Content (outputSchema) for Performance Tools** — All 20 performance tools now include `outputSchema`:
  - Explain tools: `pg_explain`, `pg_explain_analyze`, `pg_explain_buffers`
  - Stats tools: `pg_index_stats`, `pg_table_stats`, `pg_stat_statements`, `pg_stat_activity`, `pg_unused_indexes`, `pg_duplicate_indexes`, `pg_vacuum_stats`, `pg_query_plan_stats`
  - Monitoring tools: `pg_locks`, `pg_bloat_check`, `pg_cache_hit_ratio`
  - Analysis tools: `pg_seq_scan_tables`, `pg_index_recommendations`, `pg_query_plan_compare`
  - Optimization tools: `pg_performance_baseline`, `pg_connection_pool_optimize`, `pg_partition_strategy_suggest`
  - Added 17 reusable output schemas in `schemas/performance.ts`
- **Structured Content (outputSchema) for Monitoring Tools** — All 11 monitoring tools now include `outputSchema`:
  - Size tools: `pg_database_size`, `pg_table_sizes`
  - Connection/replication: `pg_connection_stats`, `pg_replication_status`, `pg_recovery_status`
  - Server info: `pg_server_version`, `pg_show_settings`, `pg_uptime`
  - Analysis tools: `pg_capacity_planning`, `pg_resource_usage_analyze`, `pg_alert_threshold_set`
  - Added 11 reusable output schemas in `schemas/monitoring.ts`
- **Structured Content (outputSchema) for Backup Tools** — All 9 backup tools now include `outputSchema`:
  - Dump tools: `pg_dump_table`, `pg_dump_schema`, `pg_copy_export`, `pg_copy_import`
  - Planning tools: `pg_create_backup_plan`, `pg_restore_command`, `pg_backup_physical`, `pg_restore_validate`, `pg_backup_schedule_optimize`
  - Added 9 reusable output schemas in `schemas/backup.ts`
- **Structured Content (outputSchema) for Schema Tools** — All 12 schema tools now include `outputSchema`:
  - Schema management: `pg_list_schemas`, `pg_create_schema`, `pg_drop_schema`
  - Sequence tools: `pg_list_sequences`, `pg_create_sequence`, `pg_drop_sequence`
  - View tools: `pg_list_views`, `pg_create_view`, `pg_drop_view`
  - Metadata tools: `pg_list_functions`, `pg_list_triggers`, `pg_list_constraints`
  - Added 12 reusable output schemas in `schemas/schema-mgmt.ts`
- **Structured Content (outputSchema) for Partitioning Tools** — All 6 partitioning tools now include `outputSchema`:
  - List/info: `pg_list_partitions`, `pg_partition_info`
  - Create: `pg_create_partitioned_table`, `pg_create_partition`
  - Attach/detach: `pg_attach_partition`, `pg_detach_partition`
  - Added 6 reusable output schemas in `schemas/partitioning.ts`
- **Structured Content (outputSchema) for Stats Tools** — All 8 stats tools now include `outputSchema`:
  - Basic: `pg_stats_descriptive`, `pg_stats_percentiles`, `pg_stats_correlation`, `pg_stats_regression`
  - Advanced: `pg_stats_time_series`, `pg_stats_distribution`, `pg_stats_hypothesis`, `pg_stats_sampling`
  - Added 8 reusable output schemas in `schemas/stats.ts`
- **Structured Content (outputSchema) for Vector Tools** — All 14 vector tools now include `outputSchema`:
  - Extension: `pg_vector_create_extension`
  - Column: `pg_vector_add_column`
  - Data: `pg_vector_insert`, `pg_vector_batch_insert`, `pg_vector_validate`
  - Search: `pg_vector_search`, `pg_hybrid_search`
  - Index: `pg_vector_create_index`, `pg_vector_index_optimize`
  - Analysis: `pg_vector_distance`, `pg_vector_normalize`, `pg_vector_aggregate`, `pg_vector_cluster`
  - Performance: `pg_vector_performance`, `pg_vector_dimension_reduce`, `pg_vector_embed`
  - Added 14 reusable output schemas in `schemas/vector.ts`
- **Structured Content (outputSchema) for PostGIS Tools** — All 15 PostGIS tools now include `outputSchema`:
  - Extension: `pg_postgis_create_extension`
  - Column: `pg_geometry_column`
  - Query tools: `pg_point_in_polygon`, `pg_distance`, `pg_buffer`, `pg_intersection`, `pg_bounding_box`
  - Index: `pg_spatial_index`
  - Advanced: `pg_geocode`, `pg_geo_transform`, `pg_geo_index_optimize`, `pg_geo_cluster`
  - Standalone: `pg_geometry_buffer`, `pg_geometry_intersection`, `pg_geometry_transform`
  - Added 15 reusable output schemas in `schemas/postgis.ts`
- **Structured Content (outputSchema) for Cron Tools** — All 8 pg_cron tools now include `outputSchema`:
  - Extension: `pg_cron_create_extension`
  - Scheduling: `pg_cron_schedule`, `pg_cron_schedule_in_database`
  - Job management: `pg_cron_unschedule`, `pg_cron_alter_job`, `pg_cron_list_jobs`
  - Monitoring: `pg_cron_job_run_details`, `pg_cron_cleanup_history`
  - Added 8 reusable output schemas in `schemas/cron.ts`
- **Structured Content (outputSchema) for Partman Tools** — All 10 pg_partman tools now include `outputSchema`:
  - Extension: `pg_partman_create_extension`
  - Setup: `pg_partman_create_parent`, `pg_partman_show_config`
  - Maintenance: `pg_partman_run_maintenance`, `pg_partman_show_partitions`
  - Operations: `pg_partman_check_default`, `pg_partman_partition_data`, `pg_partman_set_retention`
  - Advanced: `pg_partman_undo_partition`, `pg_partman_analyze_partition_health`
  - Added 10 reusable output schemas in `schemas/partman.ts`
- **Structured Content (outputSchema) for Kcache Tools** — All 7 pg_stat_kcache tools now include `outputSchema`:
  - Extension: `pg_kcache_create_extension`
  - Query analysis: `pg_kcache_query_stats`, `pg_kcache_top_cpu`, `pg_kcache_top_io`
  - Database: `pg_kcache_database_stats`, `pg_kcache_resource_analysis`
  - Management: `pg_kcache_reset`
  - Added 7 reusable output schemas in `schemas/extensions.ts`
- **Structured Content (outputSchema) for Citext Tools** — All 6 citext tools now include `outputSchema`:
  - Extension: `pg_citext_create_extension`
  - Column: `pg_citext_convert_column`, `pg_citext_list_columns`
  - Analysis: `pg_citext_analyze_candidates`, `pg_citext_compare`, `pg_citext_schema_advisor`
  - Added 6 reusable output schemas in `schemas/extensions.ts`
- **Structured Content (outputSchema) for Ltree Tools** — All 8 ltree tools now include `outputSchema`:
  - Extension: `pg_ltree_create_extension`
  - Query: `pg_ltree_query`, `pg_ltree_subpath`, `pg_ltree_lca`, `pg_ltree_match`
  - Management: `pg_ltree_list_columns`, `pg_ltree_convert_column`, `pg_ltree_create_index`
  - Added 8 reusable output schemas in `schemas/extensions.ts`
- **Structured Content (outputSchema) for Pgcrypto Tools** — All 9 pgcrypto tools now include `outputSchema`:
  - Extension: `pg_pgcrypto_create_extension`
  - Hashing: `pg_pgcrypto_hash`, `pg_pgcrypto_hmac`, `pg_pgcrypto_crypt`
  - Encryption: `pg_pgcrypto_encrypt`, `pg_pgcrypto_decrypt`
  - Random: `pg_pgcrypto_gen_random_uuid`, `pg_pgcrypto_gen_random_bytes`, `pg_pgcrypto_gen_salt`
  - Added 9 reusable output schemas in `schemas/extensions.ts`

### Security

- **Docker CVE-2026-25547 Remediation** — Manually updated npm's bundled `@isaacs/brace-expansion` from 5.0.0 to 5.0.1 in Dockerfile to fix Inefficient Regular Expression Complexity vulnerability (HIGH). Applied to both builder and production stages
- **Docker CVE-2026-24842 Remediation** — Upgraded manual `tar` patch in Dockerfile from version 7.5.4 to 7.5.7 to fix Path Traversal vulnerability (CVSS 8.2). Applied to both builder and production stages. Docker Scout scan now reports 0 fixable critical/high CVEs
- **Enhanced Log Sanitization** — Upgraded logger to match db-mcp security standards
  - Added `sanitizeStack()` function to replace newlines with safe arrow delimiters (`→`) in stack traces
  - Added taint-breaking `writeToStderr()` method to satisfy CodeQL static analysis
  - Expanded sensitive key list with 8 additional OAuth 2.1 fields: `authorizationserverurl`, `authorization_server_url`, `bearerformat`, `bearer_format`, `oauthconfig`, `oauth_config`, `oauth`, `scopes_supported`, `scopessupported`
  - Stricter control character removal (now removes all 0x00-0x1F + 0x7F including tabs and newlines)
- **SQL Injection Remediation** — Comprehensive fixes for WHERE clause, FTS config, and table name injection vectors
  - Created `src/utils/fts-config.ts` — Validates FTS configurations using PostgreSQL identifier pattern (63 chars max, alphanumeric + underscore only)
  - Created `src/utils/where-clause.ts` — Pattern-based blocklist for dangerous SQL patterns (`;DROP`, `UNION SELECT`, `--`, `/*`, `pg_sleep`, stacked queries)
  - Updated 8 text tools with sanitization: `pg_text_search`, `pg_text_rank`, `pg_trigram_similarity`, `pg_fuzzy_match`, `pg_regexp_match`, `pg_like_search`, `pg_text_headline`, `pg_create_fts_index`
  - Updated 2 vector tools with WHERE clause sanitization: `pg_vector_search`, `pg_vector_aggregate`
  - Added 31 comprehensive security injection tests in `security-injection.test.ts`
  - **Breaking change**: Tools now reject inputs containing SQL injection patterns (previously passed through)

### Fixed

- **pg_create_index `schema.table` format parsing** — Fixed `pg_create_index` not correctly parsing `schema.table` format in the `table` parameter. The tool now correctly auto-parses table names like `"public.users"` into separate schema and table components, matching the behavior of other tools (`pg_count`, `pg_describe_table`, `pg_get_indexes`, `pg_truncate`, `pg_drop_table`). Previously, using `table: "public.users"` caused `relation "public.users" does not exist` errors and required the workaround of using separate `schema` and `table` parameters
- **pg_analyze_query_indexes output schema error** — Fixed MCP output validation error for direct tool calls
  - Handler now includes required `sql` field in all response paths (success, error, and no-plan cases)
  - Updated `QueryIndexAnalysisOutputSchema` to match actual response structure (issues, recommendations as string arrays, timing fields)
- **pg.listExtensions() top-level alias missing** — Added missing Code Mode top-level alias for consistency
  - `pg.listExtensions()` now works in Code Mode (was previously only accessible via `pg.core.listExtensions()`)
  - Updated `ServerInstructions.ts` documentation to include the alias
- **Transaction savepoint reserved keyword syntax errors** — Fixed savepoint operations failing with SQL syntax errors when using reserved keywords (e.g., `outer`, `inner`, `select`, `table`) as savepoint names
  - Added new `quoteIdentifier()` utility in `src/utils/identifiers.ts` that safely quotes identifiers without rejecting reserved keywords (unlike `sanitizeIdentifier()` which is stricter for schema/table/column names)
  - Updated `createSavepoint()`, `releaseSavepoint()`, and `rollbackToSavepoint()` in `PostgresAdapter.ts` to use `quoteIdentifier()` for savepoint names
  - Expanded `RESERVED_KEYWORDS` set with 8 additional keywords: `cross`, `full`, `inner`, `join`, `left`, `natural`, `right`, `outer`
  - Example: `pg.transactions.savepoint({ tx: txId, name: 'outer' })` now works correctly instead of producing `syntax error at or near "outer"`
- **Code Mode orphaned transaction cleanup** — Implemented automatic transaction cleanup when code mode execution fails
  - Added `getActiveTransactionIds()` and `cleanupTransaction()` methods to `PostgresAdapter` for tracking and rolling back orphaned transactions
  - Code mode handler now captures active transactions before execution and cleans up any new transactions created if the code fails
  - Prevents dangling database connections from uncommitted transactions after code errors or timeouts

### Documentation

- **pg_describe_table rowCount -1 clarification** — Documented that `rowCount: -1` in `pg_describe_table` response indicates PostgreSQL has no statistics for the table (run `ANALYZE` to populate)
- **Code Mode memoryUsedMb metrics clarification** — Documented that `memoryUsedMb` measures heap delta (end - start) and negative values indicate memory was freed during execution (e.g., GC ran)
- **pg_transaction_rollback_to behavior clarification** — Enhanced documentation to clarify that `rollbackTo` restores the database state to when the savepoint was created, undoing ALL work (data changes AND savepoints) created after the target savepoint—not just savepoints. This is standard PostgreSQL behavior where rolling back to a savepoint reverts both data modifications and nested savepoint definitions
- **pg_jsonb_strip_nulls WHERE requirement** — Updated `ServerInstructions.ts` to clarify that `pg_jsonb_strip_nulls` requires a `where`/`filter` clause—write operations must be targeted for safety. Added `preview: true` suggestion for pre-modification inspection
- **pg_jsonb_insert path format clarification** — Updated `ServerInstructions.ts` to recommend using array format `[-1]` instead of string format `"[-1]"` for negative array indices, as the string format can cause PostgreSQL parsing errors in some contexts
- **soundex/metaphone Code Mode clarification** — Updated `ServerInstructions.ts` to clarify that `soundex` and `metaphone` are Code Mode convenience wrappers (`pg.text.soundex()`, `pg.text.metaphone()`) that call `pg_fuzzy_match` internally, not direct MCP tools. For direct MCP access, use `pg_fuzzy_match` with `method: 'soundex'|'metaphone'`

### Dependencies

- Bump `@types/node` from 25.0.10 to 25.1.0
- Bump `globals` from 17.1.0 to 17.2.0
- Bump `typescript-eslint` from 8.53.1 to 8.54.0
- Bump `hono` from 4.11.5 to 4.11.7

## [1.0.0] - 2026-01-24

### Highlights

🎉 **First stable TypeScript release** — Complete rewrite from Python with 203 tools, 20 resources, and 19 prompts.

### Added (Infrastructure)

- **Docker Hub Publication** — Multi-platform images (amd64/arm64) at `writenotenow/postgres-mcp`
- **NPM Package** — Available via `npm install -g postgres-mcp`
- **MCP Registry** — Listed as `io.github.neverinfamous/postgres-mcp`
- **GitHub Workflows**:
  - `lint-and-test.yml` — CI pipeline with Node.js 24/25 matrix
  - `docker-publish.yml` — Docker Hub publication with security scanning
  - `publish-npm.yml` — NPM publication on GitHub releases
  - `secrets-scanning.yml` — TruffleHog and Gitleaks secret detection
  - `dependabot-auto-merge.yml` — Auto-merge for minor/patch updates
  - `security-update.yml` — Weekly Trivy vulnerability scanning
- **Dockerfile** — Multi-stage build with security hardening
- **DOCKER_README.md** — Docker Hub documentation

### Added

- **pg_list_extensions tool** — New core tool (`pg_list_extensions`) lists installed PostgreSQL extensions with name, version, schema, and description. Available in both direct MCP tool calls and Code Mode (`pg.core.listExtensions()`)
- **Monitoring `tables` alias** — Code mode monitoring group now supports `tables` as a shorthand alias for `tableSizes` (e.g., `pg.monitoring.tables({ limit: 10 })`), consistent with other group aliases like `connections` → `connectionStats`
- **Stats tools `groupLimit` parameter** — `pg_stats_time_series` and `pg_stats_distribution` now support a `groupLimit` parameter when using `groupBy` to prevent large payloads. Default is 20 groups. Returns `truncated: true` + `totalGroupCount` metadata when groups are limited. Use `groupLimit: 0` for all groups. This addresses payload size concerns when groupBy produces many groups with many histogram buckets (distribution) or many time buckets (timeSeries)
- **pg_partman `parent` and `name` aliases** — All pg_partman tools now accept `parent` and `name` as additional aliases for `parentTable`, in addition to the existing `table` alias. Provides consistency with documentation and matches partitioning tools pattern. All aliases: `parentTable`, `table`, `parent`, `name`

### Performance

- **pg_geo_transform default limit** — `pg_geo_transform` now applies a default limit of 50 rows when no `limit` parameter is specified. Returns `truncated: true` + `totalCount` metadata when results are limited. Use `limit: 0` for all rows. Consistent with `pg_buffer` and other AI-optimized payload tools

### Fixed

- **pg_geometry_buffer null geometry warning** — `pg_geometry_buffer` now returns a `warning` field when simplification tolerance is too high relative to buffer distance, causing the geometry to collapse to null. The warning explains the issue and suggests reducing the `simplify` value or setting `simplify: 0` to disable. Previously, aggressive simplification silently returned `null` for both `buffer_geojson` and `buffer_wkt` without explanation

### Documentation

- **OAuth CLI example improvements** — Updated README OAuth 2.1 section with `--postgres` flag in CLI example (required for OAuth to work), updated realm naming from `db-mcp` to `postgres-mcp` for consistency, and added note for Keycloak users about required audience mapper configuration for `aud` claim validation
- **pg_copy_export enhanced documentation** — Updated `ServerInstructions.ts` to clarify: (1) warning is returned when both `query` and `table` parameters are provided (query takes precedence), (2) `text` format uses tab-delimited output by default but supports `header: true` like CSV format, (3) `delimiter` parameter can customize the field separator for both formats
- **pg_buffer/pg_geo_transform truncation indicator clarification** — Updated `ServerInstructions.ts` to explicitly state that `truncated: true` + `totalCount` appear "when results are truncated" rather than "when default limit applies". Provides clearer documentation that these fields are only present when actual truncation occurs
- **pg_partman_set_retention default behavior clarification** — Updated `ServerInstructions.ts` to explicitly document that `retentionKeepTable` defaults to `false` (DROP behavior). Added warning indicator to emphasize the destructive default. Prevents accidental partition data loss
- **pg_partman comprehensive alias documentation** — Added new documentation note listing all supported aliases: `parentTable` accepts `table`, `parent`, `name`; `controlColumn` accepts `control`, `column`; `targetTable` accepts `target`
- **pg_kcache_top_io parameter order clarification** — Updated `ServerInstructions.ts` to clarify that `type` is the primary parameter and `ioType` is the alias for `pg_kcache_top_io`, matching the actual MCP schema implementation

### Fixed

- **HTTP transport `Transport already started` crash** — Fixed HTTP transport crashing with \"Transport already started\" error when MCP Inspector (or any client) connected via HTTP `/sse` endpoint. The bug was caused by explicitly calling `transport.start()` before passing the transport to `server.connect()`, which internally calls `start()` again. Removed the explicit `start()` call since the MCP SDK's `Server.connect()` handles transport startup internally

- **Stats tools Split Schema alias fixes** — `pg_stats_correlation`, `pg_stats_regression`, and `pg_stats_time_series` now correctly accept documented parameter aliases in direct MCP tool calls. Previously, using aliases like `x`/`y` (for correlation/regression), `column1`/`column2` (for regression), or `time`/`value` (for timeSeries) caused validation errors because only the primary parameter names (`column1`/`column2`, `xColumn`/`yColumn`, `timeColumn`/`valueColumn`) were exposed in the MCP schema. Uses the Split Schema pattern: base schema with optional alias parameters, preprocessed schema with `.refine()` validation to ensure at least one of the aliases is provided
- **pg_cron_job_run_details `limit: 0` behavior** — `pg_cron_job_run_details` now correctly returns all rows when `limit: 0` is specified. Previously, `limit: 0` was incorrectly applied as SQL `LIMIT 0`, returning zero results instead of all results. Now consistent with `pg_cron_list_jobs` and other AI-optimized tools where `limit: 0` means "no limit / return all"
- **pg_vector_dimension_reduce table mode aliases** — `pg_vector_dimension_reduce` now correctly accepts `tableName` and `col` aliases in direct MCP tool calls for table mode. Previously, using `{ tableName: 'embeddings', col: 'vector', targetDimensions: 10 }` caused "Either vector or table+column must be provided" error because the aliases were not exposed in the MCP schema. Now consistent with other vector tools (`pg_vector_search`, `pg_vector_aggregate`, etc.) that accept these aliases
- **Partitioning `isDefault` parameter Split Schema fix** — `pg_create_partition` and `pg_attach_partition` now correctly accept `isDefault: true` as an alternative to `forValues` for creating/attaching DEFAULT partitions. Previously, using `isDefault: true` without `forValues` caused "Invalid input: expected string, received undefined" validation errors because `forValues` was marked as required in the MCP-visible schema. Now both `forValues: "DEFAULT"` and `isDefault: true` work for DEFAULT partitions
- **Partitioning tools Split Schema fixes** — `pg_list_partitions`, `pg_partition_info`, `pg_create_partition`, `pg_attach_partition`, and `pg_detach_partition` now correctly accept documented parameter aliases in direct MCP tool calls. Previously, using aliases like `parent`, `parentTable`, `table`, `name`, `partitionName`, or `partitionTable` caused "Invalid input: expected string, received undefined" errors because only the primary parameter names were exposed in the MCP schema. Uses the Split Schema pattern: base schema with optional alias parameters plus `.refine()` validation, preprocessed schema for handler parsing with alias resolution. `pg_list_partitions` and `pg_partition_info` now use dedicated `ListPartitionsSchemaBase` and `PartitionInfoSchemaBase` schemas instead of inline definitions
- **pg_query_plan_stats `limit: 0` behavior** — `pg_query_plan_stats` now correctly returns all rows when `limit: 0` is specified. Previously, `limit: 0` was incorrectly applied as SQL `LIMIT 0`, returning zero results instead of all results. Now consistent with other tools (`tableStats`, `vacuumStats`, `unusedIndexes`) where `limit: 0` means "no limit / return all"
- **pg_partman_create_parent interval error clarity** — `pg_partman_create_parent` now returns a user-friendly error message when an invalid interval format is provided. Previously, passing `interval: 'invalid'` or `interval: 'daily'` produced cryptic PostgreSQL error "invalid input syntax for type interval". Now returns `{error: "Invalid interval format: '...'", hint: "Use PostgreSQL interval syntax...", examples: ["1 day", "1 week", ...]}`
- **pg_citext_list_columns `limit` and `schema` parameters** — `pg_citext_list_columns` now correctly accepts `limit` and `schema` parameters in direct MCP tool calls. Previously, these parameters were ignored because the tool used a preprocessed Zod schema for `inputSchema`, which prevented proper JSON Schema generation for MCP clients (parameters worked in Code Mode but not Direct Tool Calls). Uses the Split Schema pattern: base schema (`CitextListColumnsSchemaBase`) for MCP visibility, preprocessed schema for handler parsing
- **ltree tools Split Schema fixes** — `pg_ltree_query`, `pg_ltree_match`, `pg_ltree_convert_column`, and `pg_ltree_create_index` now correctly accept documented parameter aliases (`name`, `tableName`, `col`) in direct MCP tool calls. Previously, using aliases like `{ name: 'categories', col: 'path' }` caused "Invalid input: expected string, received undefined" validation errors because `table` and `column` were marked as required in the MCP-visible base schemas. Now uses the Split Schema pattern: base schemas with all alias parameters optional, transform schemas with `.refine()` validation after alias resolution

### Performance

- **pg_stat_statements AI-optimized payloads** — `pg_stat_statements` now returns `truncated: true` + `totalCount` metadata when the default limit (20) truncates results. Supports `limit: 0` for all statements. Provides consistent truncation indicators matching `tableStats`, `vacuumStats`, `unusedIndexes`, and `queryPlanStats`. Documentation updated in `ServerInstructions.ts`
- **Performance Tools documentation improvements** — Updated `ServerInstructions.ts` Performance Tools section with complete method listing (20 core methods + 3 wrappers), added missing aliases (`indexUsage`→`indexStats`, `bloatEstimate`/`bloat`→`bloatCheck`, `runningQueries`→`longRunningQueries`), and documented that `longRunningQueries` returns `{longRunningQueries, count, threshold}` (not `statActivity` format)
- **pg_index_stats default limit** — `pg_index_stats` now applies a default limit of 50 rows when no `limit` parameter is specified. Returns `truncated: true` + `totalCount` metadata when results are limited. Use `limit: 0` for all indexes. Prevents large payloads in databases with many indexes
- **pg_seq_scan_tables default limit** — `pg_seq_scan_tables` now applies a default limit of 50 rows when no `limit` parameter is specified. Returns `truncated: true` + `totalCount` metadata when results are limited. Use `limit: 0` for all tables. Consistent with other AI-optimized payload tools
- **pg_duplicate_indexes default limit** — `pg_duplicate_indexes` now applies a default limit of 50 rows when no `limit` parameter is specified. Returns `truncated: true` + `totalCount` metadata when results are limited. Use `limit: 0` for all duplicate index groups. Prevents large payloads when analyzing index overlaps
- **pg_query_plan_stats truncation indicators** — `pg_query_plan_stats` now returns `truncated: true` + `totalCount` metadata when results are limited, consistent with other paginated performance tools

- **pg_index_recommendations direct MCP tool call fix** — `pg_index_recommendations` now correctly accepts `sql`, `query`, and `params` parameters in direct MCP tool calls. Previously, these parameters were ignored due to using a transformed Zod schema for `inputSchema`, causing `queryAnalysis: false` to always be returned even when SQL was provided. Uses the "Split Schema" pattern: base schema (`IndexRecommendationsSchemaBase`) for MCP visibility with both `sql` and `query` parameters, transformed schema for alias resolution in handler. Also exposes `query` as a documented alias for `sql` in the MCP schema
- **Performance tools Code Mode documentation** — Updated `ServerInstructions.ts` to document that `pg_performance_baseline` maps to `pg.performance.baseline()` (not `performanceBaseline`) and that `indexRecommendations` accepts `query` as an alias for `sql` parameter
- **Text tools `tableName` alias Split Schema fix** — 8 table-based text tools (`pg_text_search`, `pg_text_rank`, `pg_text_headline`, `pg_trigram_similarity`, `pg_fuzzy_match`, `pg_like_search`, `pg_regexp_match`, `pg_create_fts_index`) now correctly accept `tableName` as an alias for `table` parameter in direct MCP tool calls. Previously, using `{ tableName: "articles" }` caused "Invalid input: expected string, received undefined" error because the base schemas marked `table` as required, hiding the alias from MCP clients. Uses the Split Schema pattern: base schema with both `table` and `tableName` optional plus `.refine()` validation, full schema with preprocess for handler parsing
- **pg_jsonb_extract response consistency** — `pg_jsonb_extract` now always returns `{rows: [...], count}` response structure regardless of whether `select` columns are specified. Previously, the response inconsistently returned `{results: [...], count}` without select columns and `{rows: [...], count}` with select columns. Now both modes return `rows` containing objects with a `value` property for consistent parsing
- **pg_describe_table `name` alias Split Schema fix** — `pg_describe_table` direct MCP tool calls now correctly accept `name` as an alias for `table` parameter, matching `pg_create_table`, `pg_drop_table`, and code mode behavior. Previously, using `{ name: "table_name" }` caused "table (or tableName alias) is required" error because the `name` alias was not exposed in the MCP schema (only handled in handler parsing)

### Documentation

- **`pg_describe_table`** — Updated ServerInstructions.ts to reflect that `pg_describe_table` returns index information
- **pg.help() code mode documentation** — Updated `ServerInstructions.ts` to clarify that `pg.help()` returns `{group: methods[]}` mapping object (e.g., `{core: ['readQuery', ...], jsonb: [...]}`), not just "lists all groups". Prevents errors when trying to access non-existent `.groups` property
- **pg_jsonb_agg response structure documentation** — Fixed documentation incorrectly stating `pg_jsonb_agg` with `groupBy` returns `{groups: [...]}`. Actual response uses `{result: [{group_key, items}], count, grouped: true}`. Updated `ServerInstructions.ts` response structures table and tool parameter description to match actual behavior

### Added

- **Transactions documentation section** — Added comprehensive `## Transactions` section to `ServerInstructions.ts` documenting all 7 transaction tools: `pg_transaction_begin`, `pg_transaction_commit`, `pg_transaction_rollback`, `pg_transaction_savepoint`, `pg_transaction_rollback_to`, `pg_transaction_release`, `pg_transaction_execute`. Documents transaction lifecycle, savepoint behavior (including the caveat that rollback_to destroys later savepoints), atomic execution modes (auto-commit vs join existing), parameter aliases (`tx`/`txId`/`transactionId`, `name`/`savepoint`), response structures, and `pg.transactions.help()` discovery
- **MCP Resource Annotations** — All 20 resources now include MCP Resource Annotations (SDK 1.25+)
  - `audience` — Indicates target readers: `["user", "assistant"]` for most resources, `["assistant"]` for agent-focused resources
  - `priority` — Float from 0.0-1.0 indicating resource importance: HIGH_PRIORITY (0.9), MEDIUM_PRIORITY (0.6), LOW_PRIORITY (0.4), ASSISTANT_FOCUSED (0.5)
  - Priority assignments: health/schema/activity at 0.9 (critical), performance/indexes/tables/vacuum/locks/stats at 0.6 (monitoring), pool/extensions/replication/cron/partman/kcache/vector/postgis/crypto at 0.4 (supplementary), settings/capabilities at 0.5 (agent-focused)
  - New `ResourceAnnotations` type in `types/adapters.ts` and reusable presets in `utils/resourceAnnotations.ts`
  - `DatabaseAdapter.registerResource()` now passes annotations to the MCP SDK
- **pg.textXxx() top-level aliases** — Code mode now supports top-level text method aliases for convenience: `pg.textSearch()`, `pg.textRank()`, `pg.textHeadline()`, `pg.textNormalize()`, `pg.textSentiment()`, `pg.textToVector()`, `pg.textToQuery()`, `pg.textSearchConfig()`, `pg.textTrigramSimilarity()`, `pg.textFuzzyMatch()`, `pg.textLikeSearch()`, `pg.textRegexpMatch()`, `pg.textCreateFtsIndex()`. These map directly to `pg.text.xxx()` methods, matching the aliases documented in `pg.text.help()`
- **Text tools schema.table format support** — All 13 text tools now support `schema.table` format (auto-parsed, embedded schema takes priority over explicit `schema` parameter). Consistent with other tool groups like stats, vector, partitioning
- **pg.jsonbXxx() top-level aliases** — Code mode now supports top-level JSONB method aliases for convenience: `pg.jsonbExtract()`, `pg.jsonbSet()`, `pg.jsonbInsert()`, `pg.jsonbDelete()`, `pg.jsonbContains()`, `pg.jsonbPathQuery()`, `pg.jsonbAgg()`, `pg.jsonbObject()`, `pg.jsonbArray()`, `pg.jsonbKeys()`, `pg.jsonbStripNulls()`, `pg.jsonbTypeof()`, `pg.jsonbValidatePath()`, `pg.jsonbMerge()`, `pg.jsonbNormalize()`, `pg.jsonbDiff()`, `pg.jsonbIndexSuggest()`, `pg.jsonbSecurityScan()`, `pg.jsonbStats()`. These map directly to `pg.jsonb.xxx()` methods, matching the aliases documented in `pg.jsonb.help()`
- **pg.createIndex() and 7 more top-level core aliases** — Code mode now supports additional top-level aliases beyond the original 11 starter tools: `pg.createIndex()`, `pg.dropIndex()`, `pg.getIndexes()`, `pg.listObjects()`, `pg.objectDetails()`, `pg.analyzeDbHealth()`, `pg.analyzeQueryIndexes()`, `pg.analyzeWorkloadIndexes()`. All 19 starter tools now have top-level aliases for maximum ergonomics
- **pg.explain() and 10 more top-level performance aliases** — Code mode now supports top-level performance method aliases for convenience: `pg.explain()`, `pg.explainAnalyze()`, `pg.cacheHitRatio()`, `pg.indexStats()`, `pg.tableStats()`, `pg.indexRecommendations()`, `pg.bloatCheck()`, `pg.vacuumStats()`, `pg.unusedIndexes()`, `pg.duplicateIndexes()`, `pg.seqScanTables()`. These map directly to `pg.performance.xxx()` methods for improved ergonomics
- **pg.vacuum() and 9 more top-level admin aliases** — Code mode now supports top-level admin method aliases for convenience: `pg.vacuum()`, `pg.vacuumAnalyze()`, `pg.analyze()`, `pg.reindex()`, `pg.cluster()`, `pg.setConfig()`, `pg.reloadConf()`, `pg.resetStats()`, `pg.cancelBackend()`, `pg.terminateBackend()`. These map directly to `pg.admin.xxx()` methods for system maintenance tasks
- **pg.databaseSize() and 10 more top-level monitoring aliases** — Code mode now supports top-level monitoring method aliases for convenience: `pg.databaseSize()`, `pg.tableSizes()`, `pg.connectionStats()`, `pg.serverVersion()`, `pg.uptime()`, `pg.showSettings()`, `pg.recoveryStatus()`, `pg.replicationStatus()`, `pg.capacityPlanning()`, `pg.resourceUsageAnalyze()`, `pg.alertThresholdSet()`. These map directly to `pg.monitoring.xxx()` methods for server monitoring tasks
- **pg.dumpTable() and 10 more top-level backup aliases** — Code mode now supports top-level backup method aliases for convenience: `pg.dumpTable()`, `pg.dumpSchema()`, `pg.copyExport()`, `pg.copyImport()`, `pg.createBackupPlan()`, `pg.restoreCommand()`, `pg.restoreValidate()`, `pg.physical()`, `pg.backupPhysical()`, `pg.scheduleOptimize()`, `pg.backupScheduleOptimize()`. These map directly to `pg.backup.xxx()` methods for backup and recovery tasks
- **Admin tools schema.table format support** — `pg_vacuum`, `pg_vacuum_analyze`, and `pg_analyze` now support `schema.table` format (e.g., `'public.users'` → auto-parsed). Embedded schema takes priority over explicit `schema` parameter, consistent with other tool groups
- **Admin tools tableName alias** — `pg_vacuum`, `pg_vacuum_analyze`, and `pg_analyze` now accept `tableName` as an alias for `table` parameter, with consistent response field inclusion
- **pg_dump_table partitioned table support** — `pg_dump_table` now detects partitioned tables and includes the `PARTITION BY` clause in the DDL output. Returns `type: 'partitioned_table'` instead of `type: 'table'` for partitioned tables. Supports RANGE, LIST, and HASH partitioning strategies with correct partition key columns. Note provides guidance to use `pg_list_partitions` for partition children
- **createSchema/createSequence `alreadyExisted` response field** — `pg_create_schema` and `pg_create_sequence` now return `alreadyExisted: boolean` when `ifNotExists: true` is used, indicating whether the object already existed before the operation. Consistent with `drop` operations which return `existed` field
- **createView `alreadyExisted` response field** — `pg_create_view` now returns `alreadyExisted: boolean` when `orReplace: true` is used, indicating whether the view was replaced or created new. Provides parity with `drop` operations for response consistency
- **pg.descriptive() and 7 more top-level stats aliases** — Code mode now supports top-level stats method aliases for convenience: `pg.descriptive()`, `pg.percentiles()`, `pg.correlation()`, `pg.regression()`, `pg.timeSeries()`, `pg.distribution()`, `pg.hypothesis()`, `pg.sampling()`. These map directly to `pg.stats.xxx()` methods for improved ergonomics, matching the pattern of other tool groups
- **pg.postgisXxx() top-level aliases** — Code mode now supports top-level PostGIS method aliases for convenience: `pg.postgisCreateExtension()`, `pg.postgisGeocode()`, `pg.postgisGeometryColumn()`, `pg.postgisSpatialIndex()`, `pg.postgisDistance()`, `pg.postgisBoundingBox()`, `pg.postgisIntersection()`, `pg.postgisPointInPolygon()`, `pg.postgisBuffer()`, `pg.postgisGeoTransform()`, `pg.postgisGeoCluster()`, `pg.postgisGeometryBuffer()`, `pg.postgisGeometryTransform()`, `pg.postgisGeometryIntersection()`, `pg.postgisGeoIndexOptimize()`. These map directly to `pg.postgis.xxx()` methods, matching the pattern of other tool groups
- **pg.cronXxx() top-level aliases** — Code mode now supports top-level cron method aliases for convenience: `pg.cronCreateExtension()`, `pg.cronSchedule()`, `pg.cronScheduleInDatabase()`, `pg.cronUnschedule()`, `pg.cronAlterJob()`, `pg.cronListJobs()`, `pg.cronJobRunDetails()`, `pg.cronCleanupHistory()`. These map directly to `pg.cron.xxx()` methods, matching the aliases documented in `pg.cron.help()`
- **pg_cron interval schedule validation** — `pg_cron_schedule`, `pg_cron_schedule_in_database`, and `pg_cron_alter_job` now validate interval schedules client-side. pg_cron only supports intervals from 1-59 seconds; for 60+ seconds, standard cron syntax must be used. Error message now explains the limitation and suggests cron syntax alternatives (e.g., `* * * * *` for every minute). Previously, invalid intervals like `60 seconds` or `1 minute` produced cryptic PostgreSQL errors
- **pg_kcache_resource_analysis minCalls parameter** — `pg_kcache_resource_analysis` now supports `minCalls` parameter for filtering by minimum call count, matching the behavior of `pg_kcache_query_stats`. Provides consistent API across kcache query tools

### Performance

- **pg_kcache_query_stats payload optimization** — `pg_kcache_query_stats` now applies a default limit of 50 queries when no `limit` parameter is specified. Returns `truncated: true` + `totalCount` metadata when results are limited. Use `limit: 0` for all queries. New `queryPreviewLength` parameter controls query preview truncation (default: 100 chars, max: 500, 0 for full). Prevents large payloads in databases with many tracked queries
- **pg_kcache_resource_analysis payload optimization** — `pg_kcache_resource_analysis` now applies a default limit of 50 queries when no `limit` parameter is specified. Returns `truncated: true` + `totalCount` metadata when results are limited. `queryPreviewLength` parameter supported for query preview control. Consistent with `pg_kcache_query_stats` payload behavior
- **pg_cron_list_jobs default limit** — `pg_cron_list_jobs` now applies a default limit of 50 jobs when no `limit` parameter is specified. Returns `truncated: true` + `totalCount` metadata when results are limited. Use `limit: 0` for all jobs. Prevents large payloads in environments with many scheduled jobs
- **pg_cron_job_run_details truncation indicators** — `pg_cron_job_run_details` now returns `truncated: boolean` and `totalCount: number` in the response when the default limit (100) causes truncation. Helps LLMs understand when execution history has been limited and how much data is available
- **pg_partman_show_config default limit** — `pg_partman_show_config` now applies a default limit of 50 configs when no `limit` parameter is specified. Returns `truncated: true` + `totalCount` metadata when results are limited. Use `limit: 0` for all configs. Prevents large payloads in databases with many partition sets (especially those with orphaned configs from prior testing)
- **pg_partman_analyze_partition_health default limit** — `pg_partman_analyze_partition_health` now applies a default limit of 50 partition sets when no `limit` parameter is specified. Returns `truncated: true` + `totalCount` metadata when results are limited. Use `limit: 0` for all. Prevents large payloads when analyzing databases with many partition sets
- **pg_partman_run_maintenance orphaned grouping** — `pg_partman_run_maintenance` (without `parentTable`) now groups orphaned configs in the response instead of repeating individual entries. Returns `orphaned: {count, tables, hint}` object for cleaner payload structure. `errors` array contains only non-orphan failures. Message includes breakdown: `"X skipped (Y orphaned, Z errors)"`
- **pg_partman_show_partitions default limit** — `pg_partman_show_partitions` now applies a default limit of 50 partitions when no `limit` parameter is specified. Returns `truncated: true` + `totalCount` metadata when results are limited. Use `limit: 0` for all partitions. Prevents large payloads for partition sets with many children
- **pg_citext_analyze_candidates default limit** — `pg_citext_analyze_candidates` now applies a default limit of 50 candidates when no `limit` parameter is specified. Returns `truncated: true` + `totalCount` metadata when results are limited. Use `limit: 0` for all candidates. Prevents large payloads in databases with many tables matching citext patterns
- **pg_citext_list_columns default limit** — `pg_citext_list_columns` now applies a default limit of 100 columns when no `limit` parameter is specified. Returns `truncated: true` + `totalCount` metadata when results are limited. Use `limit: 0` for all columns. Prevents large payloads in databases with many citext columns
- **pg_citext_analyze_candidates system schema exclusion** — `pg_citext_analyze_candidates` now excludes extension/system schemas (`cron`, `topology`, `partman`, `tiger`, `tiger_data`) by default when no `schema` or `table` filter is specified. Returns `excludedSchemas` field listing filtered schemas. Use `excludeSystemSchemas: false` to include all schemas. Reduces noise from extension tables in candidate results
- **pg_citext_analyze_candidates payload deduplication** — `pg_citext_analyze_candidates` response no longer includes duplicate `highConfidenceCandidates` and `mediumConfidenceCandidates` arrays. The `summary` object now contains only the counts (`highConfidence`, `mediumConfidence`), and the main `candidates` array contains all results. Reduces response payload size by ~50% for typical candidate lists

### Fixed

- **Core tools MCP schema visibility** — Fixed core tools (query, table, convenience) not receiving parameters via direct MCP tool calls. Root cause: schemas with `.transform().refine()` chains marked required fields as optional for alias support, causing MCP clients to think parameters were optional. Solution: Split Schema pattern with base schemas showing required fields for MCP visibility, and full schemas for alias-aware parsing. Affected tools: `pg_read_query`, `pg_write_query`, `pg_describe_table`, `pg_upsert`, `pg_batch_insert`, `pg_count`, `pg_exists`, `pg_truncate`
- **pg.kcache.help() examples correction** — `pg.kcache.help()` examples now correctly reference actual method names (`topCpu`, `topIo`, `resourceAnalysis`) instead of non-existent methods (`topQueries`, `ioPatterns`). Previously, following the help examples would result in undefined method errors
- **pg.kcache method aliases correction** — Code mode `METHOD_ALIASES` for kcache now correctly map to actual tool methods (`topCpu`, `topIo`, `databaseStats`, `resourceAnalysis`). Previously included non-existent aliases (`topQueries`, `ioPatterns`, `cpuProfiles`) that would fail silently
- **pg_partman_undo_partition child table note** — `pg_partman_undo_partition` response now includes a `note` field explaining that child partitions are detached but remain as standalone tables (pg_partman default behavior). Provides guidance for manual cleanup: `DROP TABLE <partition_name>;`. Previously, users were surprised to find orphaned tables after undoing partition sets
- **pg_partman_run_maintenance clean error messages** — `pg_partman_run_maintenance` with specific `parentTable` now returns clean, concise error messages instead of verbose stack traces. Error messages are truncated to first line and PL/pgSQL context is stripped. Reduces error payload size by ~90% for common pg_partman configuration errors
- **Test database reset partman cleanup** — `reset-database.ps1` now cleans up pg_partman configurations (`part_config` entries) and template tables before dropping test tables. Prevents orphaned partman configs with stale data (e.g., `retention: "invalid"`) from persisting across database resets. Added as Step 3 in the 7-step reset process
- **Partman and kcache test mock corrections** — Fixed failing unit tests for `pg_partman_show_partitions`, `pg_partman_show_config`, `pg_partman_analyze_partition_health`, and `pg_kcache_resource_analysis`. Tests were missing mocks for COUNT queries added during payload optimization. All 1765 tests now pass
- **pg_kcache_query_stats/resourceAnalysis/topCpu/topIo limit:0 fix** — All 4 kcache tools with `limit` parameter now correctly return all rows when `limit: 0` is specified. Previously, `limit: 0` was incorrectly applied as SQL `LIMIT 0`, returning zero results instead of all results. Now `limit: 0` omits the LIMIT clause entirely, consistent with other tool groups like timeSeries, partman, and cron
- **pg_kcache_top_cpu/topIo truncation indicators** — `pg_kcache_top_cpu` and `pg_kcache_top_io` now return `truncated: true` + `totalCount` metadata when results are limited, consistent with `pg_kcache_query_stats` and `pg_kcache_resource_analysis`. Helps LLMs understand when query data has been truncated
- **pg_kcache_query_stats/resourceAnalysis/topCpu/topIo response consistency** — All 4 kcache tools now always include `truncated` (boolean) and `totalCount` (number) fields in responses, regardless of whether truncation occurred. Previously, these fields were only included when `truncated: true`, requiring callers to check for field existence. Now provides consistent response shape across all kcache query tools
- **pg_partman cleanup hints schema detection** — `pg_partman_show_config`, `pg_partman_run_maintenance`, and `pg_partman_create_parent` cleanup hints now dynamically reference the correct schema where pg_partman is installed (e.g., `DELETE FROM public.part_config...` or `DELETE FROM partman.part_config...`). Previously, hints hardcoded `partman.` schema which fails on newer pg_partman installations that install to `public` schema by default
- **Code mode help() alias field naming and filtering** — `pg.{group}.help()` now returns `methodAliases` instead of `aliases` to clarify these are alternate method names within the group (e.g., `pg.partman.analyzeHealth` → `pg.partman.analyzePartitionHealth`), not top-level `pg.*` aliases. Also filtered out redundant prefix aliases (e.g., `partmanShowConfig`, `cronListJobs`) from the help output since they're internal fallback catches, not intended API surface. Only useful shorthand aliases (e.g., `analyzeHealth`) are now shown
- **pg_geometry_column schema.table format support** — `pg_geometry_column` now supports `schema.table` format (e.g., `'myschema.locations'` → auto-parsed to schema='myschema', table='locations'). Previously, passing `schema.table` format caused "Table does not exist in schema public" errors because the schema wasn't being extracted from the table name. Consistent with other PostGIS tools like `pg_spatial_index`, `pg_distance`, `pg_buffer`, etc.
- **pg_geo_cluster numeric type normalization** — `pg_geo_cluster` now returns `summary.num_clusters`, `summary.noise_points`, `summary.total_points` and `clusters[].point_count` as JavaScript numbers instead of strings. Consistent with other tools' numeric response handling
- **Cron tools direct MCP tool call alias support** — `pg_cron_schedule` and `pg_cron_schedule_in_database` now correctly accept `sql`/`query` aliases for `command` parameter and `db` alias for `database` parameter when called directly via MCP protocol. Previously, using aliases required the `command` parameter directly, causing \"expected string, received undefined\" errors for `sql`/`query`. Uses the refined base schema pattern with validation ensuring at least one of the aliased parameters is provided
- **pg_citext_convert_column type validation** — `pg_citext_convert_column` now validates that the target column is a text-based type (text, varchar, character varying) before attempting conversion. Non-text columns (e.g., integer, boolean) now return `{success: false, error, currentType, allowedTypes, suggestion}` instead of proceeding with conversion which would break table operations. Previously, converting an integer column to citext succeeded but caused all subsequent queries with integer comparisons to fail with \"operator does not exist: citext = integer\"
- **pg_citext_analyze_candidates consistent response fields** — `pg_citext_analyze_candidates` now always returns `summary` with `highConfidence` and `mediumConfidence` counts regardless of whether a `table` filter is applied. Previously, these fields were only included when filtering by specific table, making the response structure inconsistent
- **pg_citext_list_columns response consistency** — `pg_citext_list_columns` now always includes `totalCount` and `truncated` fields in responses for consistent structure with other paginated tools
- **pg.{group}.help() methodAliases consistency** — `pg.{group}.help()` now always returns `methodAliases` as an array (empty when no aliases) instead of `undefined`. Provides consistent response shape across all tool groups, eliminating the need to check for field existence
- **pg.ltree.help() examples correction** — `pg.ltree.help()` examples now correctly demonstrate actual method usage: `query()` uses `path` parameter (not `pattern`), and `subpath()`/`lca()` are standalone operations that don't require `table`/`column` parameters. Previously, following the help examples would result in validation errors
- **pg_ltree_match lquery alias support** — `pg_ltree_match` direct MCP tool calls now correctly accept `lquery` or `query` as aliases for the `pattern` parameter. Previously, using aliases caused "Invalid input: expected string, received undefined" errors because the base schema marked `pattern` as required without considering aliases
- **pg_ltree_convert_column type validation** — `pg_ltree_convert_column` now validates that the target column is a text-based type (text, varchar, character varying) before attempting conversion. Non-text columns (e.g., integer, boolean) now return `{success: false, error, currentType, allowedTypes, suggestion}` instead of producing cryptic PostgreSQL errors like "cannot cast type integer to ltree". Matches the validation behavior of `pg_citext_convert_column`
- **pg_ltree_query/match truncation indicators** — `pg_ltree_query` and `pg_ltree_match` now return `truncated: boolean` and `totalCount: number` when the `limit` parameter is specified. Provides consistent truncation feedback matching other paginated tools (kcache, partman, citext, etc.)
- **pg_object_details direct MCP tool call fix** — `pg_object_details` now works correctly when called directly via MCP protocol. Previously, `name`, `object`, `objectName`, and `table` parameters were hidden due to using a transformed Zod schema for `inputSchema`. Uses the "Split Schema" pattern: base schema (`ObjectDetailsSchemaBase`) for MCP visibility, full schema for handler parsing with alias support
- **pg_analyze_query_indexes direct MCP tool call fix** — `pg_analyze_query_indexes` now works correctly when called directly via MCP protocol. Previously, `sql` and `query` parameters were hidden due to using a transformed Zod schema for `inputSchema`. Uses the "Split Schema" pattern: base schema (`AnalyzeQueryIndexesSchemaBase`) for MCP visibility, full schema for handler parsing with alias support
- **Core tools Split Schema fixes (5 tools)** — Fixed 5 additional core tools not receiving parameters via direct MCP tool calls: `pg_object_details`, `pg_create_table`, `pg_drop_table`, `pg_create_index`, `pg_drop_index`. Root cause: these tools used transformed Zod schemas for `inputSchema`, which hides parameters from MCP clients. Solution: Export base schemas without transforms (`ObjectDetailsSchemaBase`, `CreateTableSchemaBase`, `DropTableSchemaBase`, `CreateIndexSchemaBase`, `DropIndexSchemaBase`) for MCP visibility, use full schemas with transforms for handler parsing. All parameter aliases now work in both direct MCP tool calls and Code Mode
- **pg_get_indexes Split Schema fix** — `pg_get_indexes` now correctly accepts `table` and `tableName` parameters in direct MCP tool calls. Previously, these parameters were ignored because the tool used a transformed Zod schema for `inputSchema`, causing MCP clients to not pass the parameters to the handler. Uses the "Split Schema" pattern: base schema (`GetIndexesSchemaBase`) for MCP visibility, transformed schema for alias resolution in handler parsing
- **Core tools alias parameter MCP visibility** — Fixed 9 core tools not accepting alias parameters in direct MCP tool calls. Previously, aliases like `tableName` for `table`, `query` for `sql`, and `values` for `data` were only resolved during handler parsing (via Zod transforms), but MCP clients couldn't see them because the base schemas marked only primary parameters as required. Now all alias parameters are visible in the MCP schema with proper optional typing. Affected tools: `pg_read_query`, `pg_write_query`, `pg_describe_table`, `pg_count`, `pg_exists`, `pg_truncate`, `pg_upsert`, `pg_batch_insert`, `pg_list_objects`

### Added

- **pg_citext_analyze_candidates patternsUsed field** — `pg_citext_analyze_candidates` response now includes `patternsUsed` array showing which column name patterns were used for matching (e.g., `['email', 'username', 'name', ...]`). Provides transparency for users who want to understand or customize the analysis

### Performance

- **pg_buffer default simplify** — `pg_buffer` now applies a default simplification tolerance of 10 meters to reduce polygon point count in GeoJSON output. Reduces payload size by ~50-70% for typical buffer geometries without noticeable precision loss. Set `simplify: 0` to disable simplification, or use higher values (e.g., `simplify: 100`) for more aggressive reduction. Returns `{simplified: true, simplifyTolerance: 10}` in response when applied

- **pg_dump_table limit parameter support** — `pg_dump_table` (`dumpTable()`) now respects the `limit` parameter when `includeData: true` is specified. Previously, the `limit` parameter was completely ignored and all rows were returned (up to hardcoded 1000). Now applies a default limit of 500 rows to prevent large payloads. Use `limit: 0` for all rows, or specify a custom limit (e.g., `limit: 50`). This is consistent with `pg_copy_export` payload optimization behavior
- **pg_copy_export truncated flag consistency** — `pg_copy_export` (`copyExport()`) now returns `truncated: true` and `limit: N` whenever any limit (default or explicit) causes truncation, not just when the default limit is applied. This provides consistent feedback to LLMs about whether the result set was limited. Previously, explicit limits (e.g., `limit: 100`) did not include truncation metadata even when the data was actually cut off
- **pg_cluster response consistency** — `pg_cluster` with table+index now returns a `message` field (e.g., `"Clustered users using index idx_users_email"`) for consistency with the no-args version which returns `"Re-clustered all previously-clustered tables"`. Previously, table-specific cluster returned only `{success, table, index}` without a message
- **pg_fuzzy_match invalid method validation** — `pg_fuzzy_match` now throws a descriptive error when an invalid `method` is provided (e.g., `method: "invalid"`). Previously, invalid methods silently defaulted to `levenshtein`, which could be misleading. Error message includes valid options: `levenshtein`, `soundex`, `metaphone`
- **pg_jsonb_object MCP tool call fix** — `pg_jsonb_object` direct MCP tool calls now properly accept key-value pairs via `data`, `object`, or `pairs` parameter (e.g., `{data: {name: "John", age: 30}}`). Previously, passing individual key-value pairs as separate tool parameters returned an empty object `{}` because the MCP protocol doesn't support arbitrary record keys as tool parameters. Code mode continues to work with direct object syntax via the OBJECT_WRAP_MAP normalization
- **Text tools direct MCP tool call fix** — All 13 text tools (`pg_text_search`, `pg_text_rank`, `pg_text_headline`, `pg_text_normalize`, `pg_text_sentiment`, `pg_text_to_vector`, `pg_text_to_query`, `pg_text_search_config`, `pg_trigram_similarity`, `pg_fuzzy_match`, `pg_like_search`, `pg_regexp_match`, `pg_create_fts_index`) now work correctly when called directly via MCP protocol. Previously, `z.preprocess()` in the input schemas interfered with JSON Schema generation, causing "Invalid input: expected string, received undefined" errors. Uses the "Split Schema" pattern: base schema for MCP visibility, full schema with preprocess for handler parsing
- **Performance EXPLAIN tools direct MCP tool call fix** — `pg_explain`, `pg_explain_analyze`, and `pg_explain_buffers` now work correctly when called directly via MCP protocol. Previously, the `sql` parameter was marked as optional in the schema (to support `query` alias) which prevented MCP clients from prompting for the required parameter. Uses the "Split Schema" pattern: base schema with required `sql` for MCP visibility, full schema with preprocess for alias handling
- **pg_query_plan_compare direct MCP tool call fix** — `pg_query_plan_compare` now works correctly when called directly via MCP protocol. Previously, `query1` and `query2` parameters were hidden by `z.preprocess()`. Uses the "Split Schema" pattern for proper parameter visibility
- **pg_partition_strategy_suggest direct MCP tool call fix** — `pg_partition_strategy_suggest` now works correctly when called directly via MCP protocol. Previously, `table` parameter was hidden by `z.preprocess()`. Uses the "Split Schema" pattern for proper parameter visibility
- **Schema tools direct MCP tool call fix** — `pg_create_view`, `pg_drop_view`, `pg_create_sequence`, and `pg_drop_sequence` now work correctly when called directly via MCP protocol. Previously, these tools had no input parameters exposed in the MCP schema, making them unusable via Direct Tool Calls (only Code Mode worked). Uses the "Split Schema" pattern: base schema (`CreateViewSchemaBase`, etc.) for MCP input schema visibility, full preprocess schema for handler parsing
- **pg_list_functions direct MCP tool call fix** — `pg_list_functions` now correctly respects `schema`, `limit`, `exclude`, and `language` parameters when called directly via MCP protocol. Previously, these parameters were ignored and the tool always returned 500 functions from all schemas regardless of filters specified. Uses the "Split Schema" pattern: base schema (`ListFunctionsSchemaBase`) for MCP input schema visibility, full preprocess schema for handler parsing
- **Partitioning write tools direct MCP tool call fix** — `pg_create_partitioned_table`, `pg_create_partition`, `pg_attach_partition`, and `pg_detach_partition` now work correctly when called directly via MCP protocol. Previously, these tools had no input parameters exposed in the MCP schema, making them unusable via Direct Tool Calls (only Code Mode worked). Uses the "Split Schema" pattern: base schema (`CreatePartitionedTableSchemaBase`, `CreatePartitionSchemaBase`, `AttachPartitionSchemaBase`, `DetachPartitionSchemaBase`) for MCP input schema visibility, full preprocess schema for handler parsing with alias support
- **Stats tools direct MCP tool call fix** — All 8 stats tools (`pg_stats_descriptive`, `pg_stats_percentiles`, `pg_stats_correlation`, `pg_stats_regression`, `pg_stats_time_series`, `pg_stats_distribution`, `pg_stats_hypothesis`, `pg_stats_sampling`) now work correctly when called directly via MCP protocol. Previously, `z.preprocess()` in the input schemas interfered with JSON Schema generation, causing parameters to be hidden from MCP clients. Uses the "Split Schema" pattern: base schema for MCP visibility, full schema with preprocess for handler parsing with alias support
- **pg_stats_time_series limit:0 fix** — `pg_stats_time_series` now correctly returns all time buckets when `limit: 0` is specified. Previously, `limit: 0` was treated as "no explicit limit" and the default limit of 100 was applied
- **pg_stats_time_series truncation indicators** — `pg_stats_time_series` now returns `truncated: boolean` and `totalCount: number` in the response when the default limit (100) is applied. Helps LLMs understand when time series data has been limited and how much data is available
- **Vector tools direct MCP tool call fix** — `pg_vector_search`, `pg_vector_add_column`, and `pg_vector_create_index` now work correctly when called directly via MCP protocol. Previously, these tools had no input parameters exposed in the MCP schema (caused by using transformed schemas that hide parameters), making them unusable via Direct Tool Calls (only Code Mode worked). Uses the "Split Schema" pattern: base schema for MCP input schema visibility, transformed schema for handler parsing with alias support
- **pg_intersection GeoJSON object support** — `pg_intersection` now accepts GeoJSON objects in addition to WKT/GeoJSON strings in Code Mode (e.g., `pg.postgis.intersection({ table: 't', column: 'geom', geometry: { type: 'Polygon', coordinates: [...] } })`). Previously, passing a GeoJSON object failed with "expected string, received Object". The fix adds automatic JSON.stringify() conversion for object inputs while maintaining string passthrough for WKT/GeoJSON strings

### Performance

- **pg_table_stats default limit** — `pg_table_stats` now applies a default limit of 50 rows when no `limit` parameter is specified. Returns `truncated: true` + `totalCount` metadata when results are limited. Use `limit: 0` for all tables. Prevents large payloads in databases with many tables
- **pg_vacuum_stats default limit** — `pg_vacuum_stats` now applies a default limit of 50 rows when no `limit` parameter is specified. Same truncation indicators as `pg_table_stats`. Use `limit: 0` for all tables
- **pg_unused_indexes default limit** — `pg_unused_indexes` now applies a default limit of 20 rows when no `limit` parameter is specified. Returns `truncated: true` + `totalCount` when limited. Use `limit: 0` for all indexes
- **pg_unused_indexes summary mode** — `pg_unused_indexes({ summary: true })` returns aggregated statistics by schema (`{bySchema: [{schema, unusedCount, totalSize, totalSizeBytes}], totalCount, totalSizeBytes}`) instead of individual indexes, providing a compact overview for large databases
- **pg_query_plan_stats query truncation** — `pg_query_plan_stats` now truncates query text to 100 characters by default, significantly reducing payload size. Each row includes `queryTruncated: boolean` indicator. Use `truncateQuery: 0` for full query text
- **pg_trigram_similarity default limit** — `pg_trigram_similarity` now applies a default limit of 100 rows when no `limit` parameter is specified. Prevents large response payloads when searching across many rows. Use `limit: 500` or higher to see more results
- **pg_fuzzy_match default limit** — `pg_fuzzy_match` now applies a default limit of 100 rows when no `limit` parameter is specified. Consistent with `pg_trigram_similarity` and other list-returning tools
- **pg_get_indexes payload reduction** — Removed redundant `indexName` (duplicate of `name`) and `indexType` (duplicate of `type`) fields from `pg_get_indexes` response. Index objects now return only `{name, tableName, schemaName, columns, unique, type, sizeBytes?, numberOfScans?, ...}`, reducing payload size by ~15%
- **pg_describe_table indexes payload reduction** — Same redundant field removal applied to the `indexes` array in `pg_describe_table` response
- **pg_list_tables default limit** — `pg_list_tables` now applies a default limit of 100 rows when no `limit` parameter is specified. Returns `{truncated: true, totalCount, hint}` metadata when results are truncated. Prevents UI slowdowns in AntiGravity and other MCP clients when databases have many tables. Use `limit: 500` to see more, or `schema` filter to narrow scope
- **pg_list_objects default limit** — `pg_list_objects` now applies a default limit of 100 objects when no `limit` parameter is specified. Same truncation metadata as `pg_list_tables`. Prevents massive JSON response payloads (300KB+ in databases with accumulated test tables)
- **pg_table_sizes default limit** — `pg_table_sizes` now applies a default limit of 50 rows when no `limit` parameter is specified. Returns `truncated: true` + `totalCount` metadata when results are limited. Use `limit: 0` for all tables. Prevents large payloads in databases with many tables
- **pg_show_settings default limit** — `pg_show_settings` now applies a default limit of 50 rows when no filter pattern is specified. Returns `truncated: true` + `totalCount` when limited. Use `limit: 0` for all settings or specify a pattern/setting to override. Previously returned all 415+ settings, consuming excessive context
- **pg_analyze_query_indexes reduced payload** — Removed redundant `explainPlan` and `executionPlan` aliases from response (these were duplicates of `plan`). Response now returns only `{plan, issues, recommendations, executionTime, planningTime}`, reducing payload size by ~66% for complex query plans
- **pg_analyze_db_health reduced payload** — Removed redundant `connectionStats` alias from response (was duplicate of `connections`). Response now uses only `connections` field for connection statistics
- **pg_analyze_query_indexes verbosity parameter** — Added `verbosity` parameter to `pg_analyze_query_indexes` with options `'summary'` (default) or `'full'`. Summary mode returns a condensed plan with only essential metrics (`Node Type`, `Actual Rows`, `Actual Total Time`, relation/index names, filters), reducing payload size significantly for routine query analysis. Full mode returns the complete EXPLAIN ANALYZE output
- **pg_list_tables payload reduction** — Removed redundant `data` field from `pg_list_tables` response (was duplicate of `tables`). Response now returns only `{tables, count, totalCount, truncated?, hint?}`, reducing payload size
- **pg_copy_export default limit** — `pg_copy_export` now applies a default limit of 500 rows when no `limit` parameter is specified. Returns `{truncated: true, limit: 500}` metadata when default limit is applied. Use `limit: 0` for all rows. Prevents accidentally large data exports consuming excessive context
- **pg_list_views definition truncation** — `pg_list_views` now truncates view definitions to 500 characters by default (reduced from 1000), further reducing payload size for databases with complex system views (e.g., PostGIS). Returns `{definitionTruncated: true}` per view and `{truncatedDefinitions: N}` in response. Use `truncateDefinition: 0` for full definitions
- **pg_list_views default limit** — `pg_list_views` now applies a default limit of 50 views when no `limit` parameter is specified. Returns `{truncated: true, note}` metadata when results are limited. Use `limit: 0` for all views. Prevents large payloads in databases with many system and extension views
- **pg_list_views truncated field consistency** — `pg_list_views` now always includes the `truncated` field in the response (set to `true` or `false`) for consistent response structure. Previously, the field was only included when `truncated: true`, which required callers to check for field existence
- **pg_list_partitions default limit** — `pg_list_partitions` now applies a default limit of 50 partitions when no `limit` parameter is specified. Returns `{truncated: true, totalCount}` metadata when results are limited. Use `limit: 0` for all partitions. Prevents large payloads for heavily-partitioned tables
- **pg_list_partitions bounds field consistency** — `pg_list_partitions` now uses the `bounds` field name instead of `partition_bounds`, consistent with `pg_partition_info`. Provides uniform field naming across partitioning tools
- **pg_list_partitions truncated field** — `pg_list_partitions` now always includes the `truncated` field in the response (set to `true` or `false`) for consistent response structure, matching the pattern used by other list tools
- **pg_stats_sampling default limit** — `pg_stats_sampling` now applies a default limit of 20 rows when no `sampleSize` parameter is specified (reduced from 100). Optimized for LLM context usage. Use `sampleSize: 100` or higher for larger samples
- **pg_stats_sampling system method hint** — `pg_stats_sampling` with `method: 'system'` now includes an inline hint in the response: "Consider using 'bernoulli' or 'random' method for more reliable results on small tables." Helps users understand why 0 rows may be returned
- **pg_stats_sampling percentage limit** — `pg_stats_sampling` with `bernoulli` or `system` methods using `percentage` parameter now applies a default limit of 100 rows to prevent large payloads. Returns `truncated: boolean` and `totalSampled: number` when TABLESAMPLE returns more rows than the limit. Use explicit `sampleSize` to override
- **pg_vector_embed embedding summarization** — `pg_vector_embed` now returns embeddings in the compact `{preview, dimensions, truncated}` format by default, reducing payload size from ~6KB to a concise preview for 384-dimension embeddings. Shows first 5 and last 5 values of the normalized vector. Use `summarize: false` parameter to get the raw full embedding array when needed for insertion into vector columns
- **pg_vector_performance benchmark payload reduction** — `pg_vector_performance` benchmark output now truncates large vectors in EXPLAIN ANALYZE query plans. Previously, 384-dimension vectors were included verbatim in the `Sort Key` line (~3KB per benchmark). Now displays `[...384 dims]` placeholder, reducing payload by ~85% for high-dimensional embeddings
- **pg_vector_dimension_reduce table mode summarization** — `pg_vector_dimension_reduce` in table mode now returns reduced vectors in the compact `{preview, dimensions, truncated}` format by default, significantly reducing payload size. For example, 5 rows with 32-dim reduced vectors now return ~500 bytes instead of ~2KB. Use `summarize: false` to get full reduced vectors when needed for downstream processing
- **pg_geo_index_optimize tableStats filtering** — `pg_geo_index_optimize` without a `table` parameter now returns `tableStats` only for tables with geometry/geography columns, instead of all tables in the schema. Prevents unnecessarily large payloads in databases with many non-spatial tables
- **PostGIS tools raw WKB removal** — `pg_distance`, `pg_buffer`, `pg_point_in_polygon`, `pg_intersection`, `pg_bounding_box`, and `pg_geo_transform` no longer return the raw WKB hex string for geometry columns. Responses now include only readable `geometry_text` (WKT format) plus computed fields (`distance_meters`, `buffer_geojson`, `transformed_geojson`, `transformed_wkt`). Reduces payload size by ~50% for tables with geometry columns
- **pg_buffer default limit** — `pg_buffer` now applies a default limit of 50 rows when no `limit` parameter is specified. Returns `{truncated: true, totalCount, limit}` metadata when results are limited. Buffer geometries can have large polygon coordinates; use `limit: 0` for all rows
- **pg_buffer simplify parameter** — `pg_buffer` now accepts `simplify` parameter (tolerance in meters) to reduce buffer polygon point count using ST_SimplifyPreserveTopology. Higher values = fewer points. Returns `{simplified: true, simplifyTolerance}` when used. Useful for reducing payload size when high-precision buffer boundaries aren't needed

### Added

- **pg_geo_cluster K>N warning** — `pg_geo_cluster` with K-Means now returns a `warning` field when requested `numClusters` exceeds available data points. Instead of erroring, K is automatically clamped to row count with `{warning, requestedClusters, actualClusters}` in response. Provides graceful handling instead of requiring users to know row count upfront
- **pg_geo_cluster DBSCAN contextual hints** — `pg_geo_cluster` with DBSCAN now returns contextual `hints` array based on clustering results, explaining parameter trade-offs:
  - When all points form a single cluster: "Consider decreasing eps to create more distinct clusters"
  - When >50% of points are noise: "Consider increasing eps or decreasing minPoints"
  - When no clusters formed: "Try increasing eps or decreasing minPoints"
  - Also includes `parameterGuide` object explaining eps and minPoints effects

- **pg_geometry_buffer simplify parameter** — `pg_geometry_buffer` (standalone geometry buffer) now accepts optional `simplify` parameter (tolerance in meters) to reduce buffer polygon point count, matching `pg_buffer` behavior. Returns `{simplified: true, simplifyTolerance}` when applied. Useful for reducing payload size when high-precision buffer boundaries aren't needed

### Fixed

- **pg_geometry_transform camelCase field naming** — `pg_geometry_transform` now returns `fromSrid` and `toSrid` (camelCase) instead of `from_srid` and `to_srid` (snake_case). Consistent with `pg_geo_transform` response field naming

- **pg_drop_table existed property** — `pg_drop_table` now returns `existed: boolean` in response, indicating whether the table existed before the drop operation. Consistent with `dropSchema()`, `dropView()`, and `dropSequence()` behavior
- **pg_object_details materialized_view/partitioned_table support** — `pg_object_details` `type`/`objectType` parameter now accepts `materialized_view` and `partitioned_table` in addition to `table`, `view`, `function`, `sequence`, and `index`. Materialized views now return their `definition` SQL like regular views
- **pg_create_table now() auto-conversion** — `defaultValue: 'now()'` is now automatically converted to `CURRENT_TIMESTAMP` to prevent PostgreSQL "cannot use column reference in DEFAULT expression" error. Also converts `current_date()`, `current_time()`, and `current_timestamp()` to their SQL keyword equivalents
- **pg_create_table string literal auto-quoting** — `defaultValue` parameter now auto-quotes plain string literals (e.g., `defaultValue: 'active'` → `DEFAULT 'active'`). Detects SQL expressions (functions, keywords, casts, numerics) and only quotes literal text values. Internal single quotes are escaped automatically (e.g., `"it's working"` → `'it''s working'`)

- **pg.readQuery() and 10 other top-level core aliases** — Code mode now supports top-level aliases for the most common starter tools: `pg.readQuery()`, `pg.writeQuery()`, `pg.listTables()`, `pg.describeTable()`, `pg.createTable()`, `pg.dropTable()`, `pg.count()`, `pg.exists()`, `pg.upsert()`, `pg.batchInsert()`, `pg.truncate()`. These map directly to `pg.core.*` methods for improved ergonomics
- **pg_upsert/pg_batch_insert RETURNING documentation** — Added critical gotcha #13 documenting that `returning` parameter must be an array of column names (e.g., `["id", "name"]`) and does not support `"*"` wildcard
- **pg_create_table constraints documentation** — Added critical gotcha #5 documenting that `constraints` array only accepts `{type: 'unique'|'check'}`. Primary keys must use `column.primaryKey` property or top-level `primaryKey: ['col1', 'col2']` array
- **pg.transactions.execute response structure documentation** — Updated critical gotcha #1 to document actual response structure: `{success, statementsExecuted, results}` with automatic rollback on error

- **pg_citext_analyze_candidates filter parameters** — `pg_citext_analyze_candidates` now accepts optional `table` and `limit` parameters to narrow results. Useful for large databases where scanning all tables produces too many candidates. Response now includes applied filters in output
- **pg_citext_schema_advisor previousType field** — `pg_citext_schema_advisor` recommendations for already-citext columns now include `previousType: "text or varchar (converted)"` field, providing clearer indication that the column was converted from a text-based type

- **pg_batch_insert insertedCount alias** — Response now includes `insertedCount` as a semantic alias for batch insert operations (alongside `rowsAffected` and `affectedRows`)
- **Parameter binding for performance tools** — `indexRecommendations()`, `explain()`, `explainAnalyze()`, and `explainBuffers()` now accept `params` array for parameterized query support (e.g., `sql: 'SELECT * FROM orders WHERE id = $1', params: [5]`)
- **queryPlanCompare parameter support** — `queryPlanCompare()` now accepts `params1` and `params2` arrays for comparing parameterized queries
- **Monitoring tools documentation** — Added documentation for `uptime()`, `serverVersion()`, `recoveryStatus()`, and `replicationStatus()` with correct output key names in ServerInstructions.ts
- **copyExport limit parameter** — `copyExport()` now supports `limit: N` parameter to cap the number of exported rows (works with both `table` and `query` modes)
- **Comprehensive Backup tools documentation** — Enhanced ServerInstructions.ts with complete documentation for all 9 backup tools including parameters, usage notes, binary format limitation for `copyExport`, and response structures (`dumpTable`, `copyExport`, `copyImport`, `createBackupPlan`, `restoreCommand`, `physical`, `scheduleOptimize`). Documents that `dumpTable({ includeData: true })` returns INSERT statements in a separate `insertStatements` field
- **scheduleOptimize changeVelocity numeric field** — `scheduleOptimize()` now returns both `changeVelocity` (number) and `changeVelocityRatio` (formatted string with %) for type consistency with other tools
- **createView schema.name format support** — `createView()` now supports `schema.name` format (e.g., `'myschema.myview'`) with auto-parsing, consistent with other tools like `createTable` and `upsert`
- **createView checkOption validation** — `createView()` now validates `checkOption` with enum: `'cascaded'`, `'local'`, `'none'`. Invalid values are rejected with a descriptive Zod error instead of being silently passed to PostgreSQL
- **Comprehensive Schema tools documentation** — Enhanced ServerInstructions.ts with complete documentation for all 12 schema tools including response structures (`listSchemas`, `listViews`, `listSequences`, `listFunctions`, `listTriggers`, `listConstraints`), parameters, and constraint type codes. Includes clarifications: `listFunctions({ exclude })` filters by **schema name** not function name prefix; `listSequences` `owned_by` omits `public.` prefix for sequences in public schema; `createView` OR REPLACE can add columns but cannot rename/remove existing ones
- **dropView/dropSequence `existed` field** — `dropView()` and `dropSequence()` now return `existed: boolean` field for consistency with `dropSchema()`, indicating whether the object existed before the drop operation
- **Schema tools discovery documentation** — Added note that `pg.schema.help()` returns `{methods: string[], examples: string[]}` object with available methods and usage examples
- **createView `orReplace` parameter documentation** — Clarified that the parameter name is `orReplace: true` (not `replace`) for CREATE OR REPLACE functionality in `createView()`
- **Partitioning tools documentation** — Updated ServerInstructions.ts to clarify: `forValues` requires raw SQL string format (e.g., `"FROM ('2024-01-01') TO ('2024-07-01')"`), `isDefault: true` is a separate boolean param for DEFAULT partitions, and `createPartitionedTable` does NOT support `schema.table` format (requires separate `schema` param)
- **listPartitions/partitionInfo schema.table support** — `pg_list_partitions` and `pg_partition_info` now support `schema.table` format (auto-parsed) and accept `table`, `parent`, `parentTable`, or `name` aliases for ergonomic consistency with other partitioning tools
- **attachPartition/detachPartition schema.table support** — `pg_attach_partition` and `pg_detach_partition` now support `schema.table` format for `parent` and `partition` parameters (auto-parsed). Explicit `schema` parameter also now works correctly
- **createPartition schema.table support** — `pg_create_partition` now supports `schema.table` format for `parent` parameter (auto-parsed)
- **createPartitionedTable schema.table support** — `pg_create_partitioned_table` now supports `schema.table` format for `name` parameter (e.g., `'myschema.events'` → schema='myschema', name='events'). Auto-parsed, eliminating the need for separate `schema` parameter
- **createPartitionedTable table-level primaryKey** — `pg_create_partitioned_table` now supports `primaryKey: ['col1', 'col2']` array for composite primary keys, matching the behavior of `pg_create_table`
- **createPartitionedTable primaryKey validation** — `pg_create_partitioned_table` now validates that `primaryKey` array includes the partition key column. Throws a descriptive error if validation fails (e.g., "Primary key must include partition key column 'event_date'") instead of silently skipping the primary key constraint
- **Stats tools schema.table support** — All 8 stats tools (`descriptive`, `percentiles`, `correlation`, `regression`, `timeSeries`, `distribution`, `hypothesis`, `sampling`) now support `schema.table` format for the `table` parameter (auto-parsed, embedded schema takes priority over explicit `schema` param). Consistent with other tool groups
- **Enhanced Stats tools documentation** — Updated ServerInstructions.ts to clarify `sampling` behavior: `percentage` param only works with `bernoulli`/`system` methods and is ignored for default `random` method
- **Hypothesis test p-value calculation** — `pg_stats_hypothesis` now returns actual two-tailed `pValue` calculated using numerical approximation (t-distribution CDF for t-tests, normal CDF for z-tests). Interpretation now based on p-value thresholds (p<0.001 highly significant, p<0.01 very significant, p<0.05 significant, p<0.1 marginal, p≥0.1 not significant). Previously only returned test statistic without p-value
- **Percentiles scale consistency documentation** — Updated ServerInstructions.ts to clarify that `percentiles()` parameter values should use a consistent scale (all 0-1 OR all 0-100). Mixing scales (e.g., `[0.1, 50]`) produces unexpected key names due to the auto-normalization logic
- **timeSeries second-level granularity** — `pg_stats_time_series` now supports `second` as an interval option for sub-minute time series analysis. Valid intervals: `second`, `minute`, `hour`, `day`, `week`, `month`, `year`
- **timeSeries time/value aliases** — `pg_stats_time_series` now accepts `time` as alias for `timeColumn` and `value` as alias for `valueColumn` for ergonomic consistency
- **correlation x/y aliases** — `pg_stats_correlation` now accepts `x`/`y` as aliases for `column1`/`column2`, matching `pg_stats_regression` for API consistency
- **timeSeries valueColumn upfront validation** — `pg_stats_time_series` now validates `valueColumn` exists and is numeric upfront, matching the validation behavior for `timeColumn`. Provides clear error messages (e.g., "Column not found", "Column is not a numeric type") instead of raw PostgreSQL errors
- **percentiles mixed scale warning** — `pg_stats_percentiles` now returns a `warning` field when mixed percentile scales are detected (e.g., `[0.1, 50]` where some values appear to be 0-1 format and others 0-100 format). Helps users understand unexpected key names like p0 instead of p10
- **hypothesis() and regression() response structure documentation** — Clarified in ServerInstructions.ts that `hypothesis()` returns results in a nested `results` object (access via `hyp.results.pValue`) and `regression()` returns results in a nested `regression` object (access via `reg.regression.slope`). Prevents confusion when accessing response fields
- **regression column1/column2 aliases** — `pg_stats_regression` now accepts `column1`/`column2` as aliases for `xColumn`/`yColumn`, matching the API of `pg_stats_correlation` for consistency. Users can now use the same parameter names across both tools
- **Vector tools documentation improvements** — Enhanced ServerInstructions.ts vector tools section:
  - `pg_vector_search` now documents return structure: `{results: [...], count, metric}` (not `rows`). Added note about parsing vector strings from DB
  - `pg_vector_insert` now documents `schema.table` format support and `updateExisting` mode usage
  - `pg_vector_normalize` documents accurate response: `{normalized: [...], magnitude: N}` where `magnitude` is the **original** vector length (not 1)
  - `pg_vector_aggregate` documents both ungrouped and grouped response structures, clarifying that `average_vector` is wrapped in a preview object for large vectors
  - `pg_vector_dimension_reduce` now documented with return structure for both direct vector mode and table mode
  - `pg_vector_create_index` documents `type` parameter with `method` alias, plus IVFFlat/HNSW-specific parameters
  - `pg_vector_performance` documents `testVectorSource` return field
  - `pg_vector_validate` documents empty vector behavior: `[]` returns `{valid: true, vectorDimensions: 0}`
- **pg_vector_insert schema.table format support** — `pg_vector_insert` now supports `schema.table` format (e.g., `'myschema.embeddings'` → auto-parsed). Embedded schema takes priority over explicit `schema` parameter
- **pg_vector_batch_insert schema.table format support** — `pg_vector_batch_insert` now supports `schema.table` format for consistency with `pg_vector_insert`
- **pg_vector_create_index method alias** — `pg_vector_create_index` now accepts `method` as an alias for `type` parameter (e.g., `method: 'hnsw'` or `type: 'ivfflat'`)
- **pg_hybrid_search schema.table support** — `pg_hybrid_search` now supports `schema.table` format (e.g., `'myschema.embeddings'` → auto-parsed). Embedded schema takes priority over explicit `schema` parameter, consistent with other vector tools
- **pg_vector_aggregate schema.table support and column type validation** — `pg_vector_aggregate` now supports `schema.table` format (auto-parsed) and validates that the specified column is actually a vector type. Returns clear error `{success: false, error: "Column 'x' is not a vector column (type: ...)", suggestion: "..."}` for non-vector columns instead of computing meaningless averages
- **Vector tools error handling documentation** — Enhanced ServerInstructions.ts to document that vector tools return `{success: false, error: "...", suggestion: "..."}` objects for validation/semantic errors (dimension mismatch, non-vector column, table not found). Users should check the `success` field before processing results
- **pg_vector_distance documentation** — Added documentation for `pg_vector_distance` tool in ServerInstructions.ts. Documents `metric` parameter ('l2', 'cosine', 'inner_product') and return structure `{distance, metric}`
- **pg_vector_aggregate groupBy limitation documentation** — Added note that `groupBy` parameter only supports simple column names (not expressions) due to SQL injection safety measures
- **pg_vector_search schema.table support** — `pg_vector_search` now supports `schema.table` format (e.g., `'myschema.embeddings'` → auto-parsed). Embedded schema takes priority over explicit `schema` parameter, consistent with other vector tools (`pg_vector_insert`, `pg_vector_aggregate`, `pg_hybrid_search`)
- **pg.hybridSearch top-level alias** — Code mode now supports `pg.hybridSearch()` as a top-level alias for `pg.vector.hybridSearch()`, providing more intuitive access to hybrid search functionality
- **pg_vector_cluster centroid preview format** — `pg_vector_cluster` now returns centroids in the compact `{preview, dimensions, truncated}` format for large vectors (>10 dimensions), consistent with `pg_vector_aggregate`. Reduces output from ~15KB to a compact preview for 384-dim embeddings
- **Comprehensive PostGIS tools documentation** — Enhanced ServerInstructions.ts with categorized documentation for all 15 PostGIS tools covering geometry creation, spatial queries, table-based operations, standalone geometry operations, and administration tools. Documents response structures, parameter aliases, and code mode aliases (`pg.postgis.addColumn()` → `geometryColumn`, `pg.postgis.indexOptimize()` → `geoIndexOptimize`)
- **PostGIS point bounds validation** — `preprocessPoint()` now validates coordinate bounds (lat: ±90°, lng: ±180°) by default for consistency with `pg_geocode`. Tools accepting `point` parameter (`pg_distance`, `pg_point_in_polygon`, `pg_bounding_box`, `pg_buffer`) now throw clear errors for out-of-bounds coordinates instead of passing invalid geometry to PostgreSQL
- **help() response structure documentation** — Clarified in ServerInstructions.ts that `pg.{group}.help()` returns `{methods, aliases, examples}` structure (not just methods array), making alias discovery more intuitive
- **Comprehensive Cron tools documentation** — Added `## Cron Tools (pg_cron)` section to ServerInstructions.ts documenting all 8 pg_cron tools with parameters, aliases (`sql`/`query` for `command`, `name` for `jobName`, `db` for `database`, `days` for `olderThanDays`), error handling behavior, and discovery via `pg.cron.help()`
- **Enhanced pg_partman tools documentation** — Expanded `## pg_partman Tools` section in ServerInstructions.ts with comprehensive documentation for all 10 tools including:
  - `pg_partman_create_parent`: Required params (`parentTable`, `controlColumn`/`control`, `interval`) and `startPartition` 'now' shorthand
  - `pg_partman_run_maintenance`: Behavior without `parentTable` (maintains ALL), `partial: true` response with `skipped` array
  - `pg_partman_show_config`: `schema.table` format support with auto-prefix `public.`, `orphaned` flag in response
  - `pg_partman_set_retention`: `retentionKeepTable` behavior (detach vs DROP), `retention: null` to disable
  - `pg_partman_analyze_partition_health`: Response structure with `overallHealth` status values
  - Schema resolution note: All partman tools auto-prefix `public.` when no schema specified
- **Comprehensive citext tools documentation** — Expanded `## citext Tools` section in ServerInstructions.ts with documentation for all 6 tools including:
  - Core methods: `createExtension()`, `convertColumn()`, `listColumns()`, `analyzeCandidates()`, `compare()`, `schemaAdvisor()`
  - Response structures for all tools
  - `schema.table` format support documentation for `convertColumn` and `schemaAdvisor`
  - Discovery via `pg.citext.help()` returning `{methods, aliases, examples}`
- **citext schema.table format support** — `pg_citext_convert_column` and `pg_citext_schema_advisor` now support `schema.table` format (e.g., `'myschema.users'` → auto-parsed). Embedded schema takes priority over explicit `schema` parameter, consistent with other tool groups
- **pg.citextXxx() top-level aliases** — Code mode now supports top-level citext method aliases for convenience: `pg.citextCreateExtension()`, `pg.citextConvertColumn()`, `pg.citextListColumns()`, `pg.citextAnalyzeCandidates()`, `pg.citextCompare()`, `pg.citextSchemaAdvisor()`. These map directly to `pg.citext.xxx()` methods, matching the aliases documented in `pg.citext.help()`
- **pg.ltreeXxx() top-level aliases** — Code mode now supports top-level ltree method aliases for convenience: `pg.ltreeCreateExtension()`, `pg.ltreeQuery()`, `pg.ltreeSubpath()`, `pg.ltreeLca()`, `pg.ltreeMatch()`, `pg.ltreeListColumns()`, `pg.ltreeConvertColumn()`, `pg.ltreeCreateIndex()`. These map directly to `pg.ltree.xxx()` methods, matching the aliases documented in `pg.ltree.help()`
- **Comprehensive ltree tools documentation** — Expanded `## ltree Tools` section in ServerInstructions.ts with documentation for all 8 tools including:
  - Core methods: `createExtension()`, `query()`, `match()`, `subpath()`, `lca()`, `listColumns()`, `convertColumn()`, `createIndex()`
  - Response structures for all tools
  - `schema.table` format support documentation for `query`, `match`, `convertColumn`, `createIndex`
  - Parameter aliases documentation (`offset`/`start`/`from`, `length`/`len`, `pattern`/`lquery`/`query`, `mode`/`type`)
  - Enhanced error handling documentation (column type validation, offset bounds checking, dependent views)
  - Discovery via `pg.ltree.help()` returning `{methods, aliases, examples}`
- **pg.pgcryptoXxx() top-level aliases** — Code mode now supports top-level pgcrypto method aliases for convenience: `pg.pgcryptoCreateExtension()`, `pg.pgcryptoHash()`, `pg.pgcryptoHmac()`, `pg.pgcryptoEncrypt()`, `pg.pgcryptoDecrypt()`, `pg.pgcryptoGenRandomUuid()`, `pg.pgcryptoGenRandomBytes()`, `pg.pgcryptoGenSalt()`, `pg.pgcryptoCrypt()`. These map directly to `pg.pgcrypto.xxx()` methods, matching the aliases documented in `pg.pgcrypto.help()`
- **pg_pgcrypto_gen_random_uuid convenience `uuid` property** — `pg_pgcrypto_gen_random_uuid` response now includes a `uuid` convenience property (containing the first UUID) when generating a single UUID. Previously only returned `uuids` array. Now returns `{success, uuid, uuids, count}` for single UUID requests
- **Comprehensive pgcrypto tools documentation** — Added `## pgcrypto Tools` section to ServerInstructions.ts documenting all 9 tools with parameters, aliases (`key`/`password`, `encryptedData`/`data`), response structures, password workflow pattern (genSalt → crypt → store → verify), and discovery via `pg.pgcrypto.help()`
- **pg.transactions.execute statement format clarification** — Updated Critical Gotcha #1 to clarify that `pg.transactions.execute` requires statements as array of objects with `sql` property (`statements: [{sql: "..."}, ...]`), not raw strings. Prevents validation errors from passing raw SQL strings
- **pg.exists() positional args with params support** — Code mode `pg.exists()` now supports positional arguments with params array: `pg.exists("users", "id=$1", [1])`. The third positional argument maps to `params`, enabling parameterized WHERE clauses without object syntax
- **Enhanced error messages with usage examples** — Starter tools (`pg_count`, `pg_exists`, `pg_truncate`, `pg_upsert`, `pg_batch_insert`, `pg_describe_table`) now include usage examples in error messages when required parameters are missing. Example: `table (or tableName alias) is required. Usage: pg_count({ table: "users" })`
- **pg.transactionXxx() top-level aliases** — Code mode now supports top-level transaction method aliases for consistency: `pg.transactionBegin()`, `pg.transactionCommit()`, `pg.transactionRollback()`, `pg.transactionSavepoint()`, `pg.transactionRelease()`, `pg.transactionRollbackTo()`, `pg.transactionExecute()`. These map directly to `pg.transactions.xxx()` methods

### Fixed

- **pg_partman_show_config/analyze_partition_health schema auto-resolution** — `pg_partman_show_config` and `pg_partman_analyze_partition_health` now auto-prefix `public.` when `parentTable` is specified without a schema (e.g., `showConfig({ parentTable: 'events' })` now correctly resolves to `public.events`). Previously, plain table names returned empty results or "not_found" status instead of matching the partman config. Also added `table` alias support for consistency with other partman tools
- **pg_geometry_intersection SRID mismatch** — `pg_geometry_intersection` now normalizes both geometries to SRID 4326 before computing intersection. Previously, mixing GeoJSON input (implicit SRID 4326) with WKT input (no SRID) caused PostgreSQL error: "ST_Intersects: Operation on mixed SRID geometries". Now safe to mix formats; returns `sridUsed: 4326` in response
- **pg_hybrid_search error handling consistency** — `pg_hybrid_search` now returns `{success: false, error: "...", suggestion: "..."}` objects for all error cases (dimension mismatch, table not found, column not found) instead of throwing exceptions. Consistent with other vector tools like `pg_vector_search`, `pg_vector_insert`, and `pg_vector_aggregate`
- **pg_vector_aggregate direct tool call parameters** — Fixed `pg_vector_aggregate` direct MCP tool call failing with "table parameter is required" error even when `table` was provided. The issue was caused by using a transformed Zod schema for `inputSchema`, which prevented proper JSON Schema generation for MCP clients. Now uses a base schema for MCP visibility and applies transforms only in the handler
- **pg_vector_dimension_reduce table mode response documentation** — Fixed ServerInstructions.ts documentation for table mode response structure. Documents correct `{rows: [{id, original_dimensions, reduced}], processedCount}` structure (previously incorrectly documented as `{results: [{id, reduced}]}`)
- **test_embeddings identical vectors** — Fixed test database seeding to generate **unique** random vectors for each row instead of identical vectors. The previous SQL approach using `ARRAY(SELECT random() FROM generate_series(...))` was optimized by PostgreSQL to compute once and reuse for all rows. Now uses a DO block with explicit loop iteration to ensure truly diverse embeddings for meaningful vector search/clustering tests. Also added `category` column (tech, science, business, sports, entertainment) for groupBy testing
- **Stats tools error handling consistency** — `pg_stats_descriptive`, `pg_stats_correlation`, and `pg_stats_time_series` now throw exceptions for invalid columns/tables instead of returning `{error: ...}` objects. Consistent with other stats tools (`percentiles`, `distribution`, `regression`, `hypothesis`, `sampling`)
- **attachPartition DEFAULT partition handling** — `attachPartition` with `isDefault: true` now correctly generates `ATTACH PARTITION ... DEFAULT` SQL syntax (previously generated invalid `FOR VALUES __DEFAULT__`)
- **attachPartition/detachPartition schema parameter** — Both tools now correctly use the `schema` parameter when building SQL statements (previously ignored schema, causing "relation does not exist" errors for non-public schemas)
- **createPartition forValues: "DEFAULT" support** — `createPartition` now accepts `forValues: "DEFAULT"` as an alternative to `isDefault: true` for creating DEFAULT partitions, matching the behavior of `attachPartition` for API consistency
- **createPartitionedTable multi-column partition key validation** — Primary key validation now correctly handles multi-column partition keys (e.g., `partitionKey: 'region, event_date'`). Previously, the validation checked for an exact string match instead of verifying that all partition key columns are included in the `primaryKey` array
- **Stats tools comprehensive error validation** — `pg_stats_percentiles`, `pg_stats_distribution`, `pg_stats_regression`, `pg_stats_hypothesis`, and `pg_stats_sampling` now have consistent, user-friendly error validation. All tools now validate table existence and column types upfront, throwing descriptive errors (e.g., "Table not found", "Column not found", "Column is not a numeric type") instead of passing raw PostgreSQL errors
- **hypothesis populationStdDev validation** — `pg_stats_hypothesis` now validates that `populationStdDev` must be greater than 0 when provided. Previously accepted negative or zero values, producing mathematically invalid results (negative standard error or division by zero)
- **pg_vector_aggregate groupBy expression error handling** — `pg_vector_aggregate` now returns a structured error object `{success: false, error: \"...\", suggestion: \"...\"}` when an expression (e.g., `LOWER(category)`) is passed to `groupBy` instead of throwing an unrecoverable `InvalidIdentifierError`. Consistent with other vector tool error handling patterns
- **timeSeries table existence error message** — `pg_stats_time_series` now checks table existence before column validation, returning a clear "Table not found" error instead of the confusing "Column not found in table" message when the table doesn't exist
- **pg_vector_insert updateExisting mode additionalColumns** — Fixed `pg_vector_insert` `updateExisting` mode to also update `additionalColumns` alongside the vector column. Previously, only the vector was updated and additional columns were ignored. Now returns `columnsUpdated: N` indicating total columns modified
- **pg_vector_validate direct MCP tool exposure** — Fixed `pg_vector_validate` not appearing as a direct MCP tool. Applied Split Schema pattern (base schema for MCP visibility, transformed schema for handler). Also enhanced tool description to document return structure `{valid: bool, vectorDimensions}` and empty vector behavior
- **pg_partman_undo_partition targetTable schema auto-resolution** — `pg_partman_undo_partition` now auto-prefixes `public.` to `targetTable` when no schema is specified, consistent with `parentTable` behavior. Previously, plain table names caused \"Unable to find given target table in system catalogs\" errors because pg_partman requires schema-qualified table references
- **pg_citext_convert_column previousType display** — `pg_citext_convert_column` now correctly reports `previousType: \"citext\"` instead of `\"USER-DEFINED\"` when converting an already-citext column. The fix queries both `data_type` and `udt_name` columns and normalizes the display for user-defined types
- **pg_ltree_query column type validation** — `pg_ltree_query` now validates that the specified column is an ltree type before querying. Returns clear error message (e.g., `Column "name" is not an ltree type (found: varchar)`) instead of cryptic PostgreSQL function error `function nlevel(character varying) does not exist`
- **pg_ltree_subpath offset bounds validation** — `pg_ltree_subpath` now validates offset before calling PostgreSQL `subpath()` function. Returns structured error `{success: false, error: \"Invalid offset: 5. Path 'a.b' has 2 labels...\", pathDepth: 2}` instead of raw PostgreSQL error `invalid positions`
- **pg_ltree_convert_column dependent views handling** — `pg_ltree_convert_column` now checks for dependent views before attempting type conversion, matching `pg_citext_convert_column` behavior. Returns `{success: false, dependentViews: [...], hint: \"...\"}` instead of raw PostgreSQL error. Also validates ltree extension is installed, enhanced error messages for column not found, and catches conversion errors with helpful hints

- **pg_transaction_execute transaction isolation** — `pg_transaction_execute` now correctly joins an existing transaction when `transactionId` parameter is provided. Previously, it always created a new auto-commit transaction, ignoring the `transactionId` from `pg_transaction_begin`. Fix enables proper multi-step transaction workflows: `begin() → execute({transactionId, ...}) → commit()/rollback()`. When joining an existing transaction, the tool does NOT auto-commit, letting the caller control the transaction lifecycle
- **pg_jsonb_object code mode double-wrapping fix** — `pg.jsonb.object({ data: { name: "John" } })` now correctly passes through to the tool without double-wrapping. Previously, Code Mode wrapped all objects unconditionally, causing `{ data: { key: 'val' } }` to become `{ data: { data: { key: 'val' } } }`. The fix uses skipKeys detection: when the object already contains expected keys (`data`, `object`, or `pairs`), it passes through unchanged. Both usage patterns now work correctly: `pg.jsonb.object({ name: "John" })` wraps to `{ data: { name: "John" } }`, while `pg.jsonb.object({ data: { name: "John" } })` passes through as-is
- **pg_batch_insert JSONB column support** — `pg_batch_insert` now correctly handles objects and arrays in row data, serializing them to JSON strings for JSONB column compatibility. Previously, passing objects/arrays to JSONB columns caused "invalid input syntax for type json" errors. Now `pg.batchInsert("table", [{ data: { nested: "object" }, tags: ["a", "b"] }])` works correctly

- **Text tools filter/where parameter support** — `pg_trigram_similarity`, `pg_fuzzy_match`, `pg_like_search`, and `pg_regexp_match` now properly support `filter` and `where` parameters. Previously, these parameters were silently ignored and all matching rows were returned
- **Text tools `text` parameter alias** — `pg_trigram_similarity` and `pg_fuzzy_match` now accept `text` as an alias for `value` parameter, matching the examples in `pg.text.help()` output
- **pg_text_search `column` singular alias** — `pg_text_search` now accepts `column` (singular string) as an alias for `columns` (array) in both Direct Tool Calls and Code Mode, auto-wrapping to array. MCP schema exposes both parameters with validation requiring at least one
- **Text tools table vs standalone clarification** — Updated ServerInstructions.ts to clearly distinguish between standalone text utilities (`normalize`, `sentiment`, `toVector`, `toQuery`, `searchConfig` — text input only) and table-based text operations (`soundex`, `metaphone` — require `table`, `column`, `value` parameters to query database rows). Prevents confusion when using `pg.text.help()` which lists both types under methods
- **pg_create_fts_index `indexName` parameter alias** — `pg_create_fts_index` now accepts `indexName` as an alias for `name` parameter
- **pg_create_fts_index default `ifNotExists: true`** — `pg_create_fts_index` now defaults `ifNotExists` to `true`, gracefully skipping existing indexes instead of throwing an error. Use `ifNotExists: false` to force error on existing index. Returns `{skipped: true}` when index already exists
- **pg_text_headline convenience parameters** — `pg_text_headline` now accepts `startSel`, `stopSel`, `maxWords`, and `minWords` as separate parameters for easier use. Previously these could only be set via the raw `options` string. When using separate params, they are merged into the options string automatically. The raw `options` parameter still takes priority if provided
- **dumpTable table parameter validation** — `dumpTable()` now validates that the `table` parameter is provided and throws a descriptive error if missing (previously created invalid DDL for "undefined")
- **dumpTable schema.table format parsing** — `dumpTable()` now correctly parses `schema.table` format (e.g., `'public.users'` → schema='public', table='users'). Embedded schema takes priority over explicit `schema` parameter to prevent duplication errors
- **copyExport schema.table format parsing** — `copyExport()` now correctly parses `schema.table` format with embedded schema taking priority over explicit `schema` parameter to prevent `public.public.table` duplication errors
- **copyImport schema.table format parsing** — `copyImport()` now correctly parses `schema.table` format with embedded schema taking priority over explicit `schema` parameter. Previously could cause `"schema"."schema.table"` quoting issues
- **scheduleOptimize numeric type coercion** — `scheduleOptimize()` now returns `activityByHour[].hour` and `activityByHour[].connection_count` as JavaScript numbers instead of strings
- **uptime() component breakdown** — `uptime()` now returns all time components (`days`, `hours`, `minutes`, `seconds`, `milliseconds`) instead of a raw PostgreSQL interval string. Documentation updated to reflect accurate output structure
- **capacityPlanning() negative days validation** — `capacityPlanning()` now validates and rejects negative `days`/`projectionDays` values with a descriptive Zod error message
- **Numeric type coercion in monitoring tools** — All monitoring tool outputs now consistently return JavaScript numbers instead of strings for numeric fields (affects `databaseSize`, `tableSizes`, `connectionStats`, `serverVersion`, `capacityPlanning`, `resourceUsageAnalyze`)
- **Numeric type coercion in performance tools** — All performance tool outputs now consistently return JavaScript numbers instead of strings for numeric fields (affects `tableStats`, `indexStats`, `vacuumStats`, `statStatements`, `bloatCheck`, `cacheHitRatio`, `seqScanTables`, `indexRecommendations`, `baseline`, `connectionPoolOptimize`, `queryPlanStats`, `partitionStrategySuggest`, `unusedIndexes`)
- **Output key standardization** — `vacuumStats()` now returns data under the `tables` key (previously `vacuumStats`) and `bloatCheck()` returns `tables` (previously `bloatedTables`) for consistency with other tools
- **Expression index column display** — `pg_get_indexes`, `pg_describe_table`, and `pg_object_details` now correctly display expression columns (e.g., `lower((name)::text)`) instead of `NULL` for expression-based indexes
- **Double schema prefix in performance tools** — `partitionStrategySuggest()` and `analyzeTable()` now correctly handle `schema.table` format without creating `public.public.table` errors
- **longRunningQueries minDuration alias** — Now recognizes `minDuration` as a parameter alias alongside `seconds`, `threshold`, and `minSeconds`
- **alertThresholdSet metric validation** — Invalid metric values now throw a Zod validation error instead of silently falling back to returning all thresholds
- **Code mode no-argument handling** — Code mode methods (e.g., `pg.backup.dumpSchema()`) now work correctly when called without arguments, matching direct tool call behavior. Previously threw "Invalid input: expected object, received undefined"
- **copyImport tableName alias** — `copyImport()` now correctly resolves `tableName` as an alias for `table` parameter. Previously threw "Cannot read properties of undefined" when using the alias
- **Backup tools code mode positional arguments** — Added positional argument support for backup tools in code mode: `copyExport('table_name')`, `copyImport('table_name')`, `dumpTable('table_name')`, `restoreCommand('backup.dump')`, `physical('/backups/dir')`, `restoreValidate('backup.dump')` now work with single string arguments
- **Numeric type coercion in partitioning tools** — `pg_list_partitions` and `pg_partition_info` now return `size_bytes` as a JavaScript number instead of string. `pg_partition_info` also returns `partition_count` as a number for consistency with other tools
- **partitioning help() example** — Fixed `pg.partitioning.help()` example for `createPartition` to show correct string format for `forValues` (e.g., `"FROM ('2024-01-01') TO ('2024-04-01')"`) instead of incorrect object format

### Changed

- **Node.js 24 LTS Baseline** — Upgraded from Node 18 to Node 24 LTS as the project baseline
  - `package.json` now requires Node.js >=24.0.0 in `engines` field
  - README prerequisites updated to specify Node.js 24+ (LTS)
- **Dependency Updates (2026-01-24)** — Updated npm dependencies to latest versions
  - `@modelcontextprotocol/sdk`: 1.25.2 → 1.25.3
  - `@types/node`: 25.0.9 → 25.0.10
  - `@vitest/coverage-v8`: 4.0.17 → 4.0.18
  - `globals`: 17.0.0 → 17.1.0
  - `pg`: 8.17.1 → 8.17.2
  - `typescript-eslint`: 8.53.0 → 8.53.1
  - `vitest`: 4.0.17 → 4.0.18
  - `zod`: 4.3.5 → 4.3.6

### Security

- **Transitive Dependency Fixes** — Resolved 2 high severity vulnerabilities via npm audit fix
  - hono <=4.11.3 → upgraded (JWT algorithm confusion vulnerability)
  - qs <6.14.1 → upgraded (DoS via memory exhaustion vulnerability)

### Performance

- **Parallelized Health Queries** — Health resource now executes 5 checks concurrently using `Promise.all()`
  - Expected ~5x latency improvement for `postgres://health` resource
- **Batched Index Queries** — `getSchema()` now fetches all indexes in a single query
  - Eliminates N+1 query pattern (e.g., 101 queries → 1 query for 100 tables)
- **Tool Definition Caching** — 194 tool definitions are now cached after first generation
  - Subsequent calls return cached array without re-creation
- **Metadata Cache with TTL** — Added configurable TTL-based cache for expensive metadata queries
  - Default 30s TTL, configurable via `METADATA_CACHE_TTL_MS` environment variable
  - `clearMetadataCache()` method for invalidation after schema changes
- **Benchmark Tests** — Added performance benchmark test suite (`src/adapters/postgresql/__tests__/performance.test.ts`)

### Security

- **Identifier Sanitization** — New utility to prevent SQL injection via identifier interpolation
  - `sanitizeIdentifier()`, `sanitizeTableName()`, `sanitizeColumnRef()` functions
  - PostgreSQL-compliant validation and double-quote escaping
  - Applied to JSONB, vector, and text search tool handlers
- **HTTP Transport Hardening** — Enhanced HTTP transport security
  - **Rate Limiting** — 100 requests/minute per IP (configurable via `rateLimitMaxRequests`, `rateLimitWindowMs`)
  - **Body Size Limits** — 1MB max request body (configurable via `maxBodySize`)
  - **HSTS Support** — Optional Strict-Transport-Security header for HTTPS deployments
  - **Enhanced CORS** — Browser MCP client support with `Vary: Origin`, credentials, and MCP-specific headers
- **Log Injection Prevention** — Control character sanitization for log messages
  - Strips ASCII 0x00-0x1F (except tab/newline), 0x7F, and C1 control characters
  - Prevents log forging and escape sequence attacks
- **CodeQL Remediation** — Fixed 4 clear-text logging vulnerabilities (js/clear-text-logging)
  - Added `sanitizeDetails()` to Logger class that redacts sensitive OAuth/security fields before console output
  - Sensitive keys redacted: password, secret, token, key, apikey, issuer, audience, jwksUri, credentials, etc.
  - Supports recursive sanitization for nested configuration objects
  - Prevents exposure of OAuth configuration data in log output
- Removed unused `beforeEach` import in middleware tests (js/unused-local-variable)

### Changed

- **Tool File Modularity Refactoring** — Restructured 8 large tool files (500+ lines each) into modular directories
  - `tools/core/` — 6 sub-modules: query, tables, indexes, objects, health, schemas (20 tools)
  - `tools/performance/` — 5 sub-modules: explain, stats, monitoring, analysis, optimization (16 tools)
  - `tools/vector/` — 2 sub-modules: basic, advanced (14 tools)
  - `tools/jsonb/` — 2 sub-modules: basic, advanced (19 tools)
  - `tools/stats/` — 2 sub-modules: basic, advanced (8 tools)
  - `tools/partman/` — 2 sub-modules: management, operations (10 tools)
  - `tools/backup/` — 2 sub-modules: dump, planning (9 tools)
  - `tools/postgis/` — 2 sub-modules: basic, advanced (12 tools)
  - Each directory has an `index.ts` barrel file for clean re-exports
  - No file exceeds 350 lines; improved maintainability and navigation
- **@modelcontextprotocol/sdk** upgraded from 1.0.0 to 1.25.1
  - Aligned with MCP spec 2025-11-25
  - Enables: Streamable HTTP transport, OAuth 2.1 framework, Tasks API, tool annotations, elicitation, and JSON-RPC batching
  - Full backwards compatibility with existing stdio transport

### Added

- **OAuth 2.1 Authentication** — Full RFC-compliant OAuth for HTTP/SSE transports
  - RFC 9728 Protected Resource Metadata at `/.well-known/oauth-protected-resource`
  - RFC 8414 Authorization Server Metadata discovery
  - JWT token validation with JWKS caching
  - PostgreSQL-specific scopes: `read`, `write`, `admin`, `full`, `db:{name}`, `schema:{name}`, `table:{schema}:{table}`
  - Configurable via CLI (`--oauth-enabled`, `--oauth-issuer`, etc.) or environment variables
  - Compatible with Keycloak and other OAuth 2.0/2.1 providers
- **HTTP/SSE Transport** — New transport mode for web clients
  - Streamable HTTP server transport using MCP SDK 1.25+
  - SSE endpoints at `/sse` and `/messages`
  - Security headers (X-Content-Type-Options, X-Frame-Options, CSP)
  - CORS support for cross-origin requests
  - Health check endpoint at `/health`
- **Tool Annotations** — All 194 tools now include MCP Tool Annotations (SDK 1.25+)
  - `title` — Human-readable tool names for UX display
  - `readOnlyHint` — Identifies read-only tools (SELECT, EXPLAIN, list operations)
  - `destructiveHint` — Marks destructive operations (DROP, DELETE, TRUNCATE)
  - `idempotentHint` — Identifies safe-to-retry operations (IF NOT EXISTS patterns)
  - `openWorldHint` — Set to `false` for all tools (no external system interaction)
  - Centralized annotation helpers: `readOnly()`, `write()`, `destructive()`, `admin()`
- **Tool Icons** — All 194 tools now include MCP Tool Icons (SDK 1.25+)
  - Per-tool icons based on behavior: warning icons for destructive, gear icons for admin
  - 19 category-specific colored SVG icons (one per tool group)
  - Embedded as data URIs for maximum portability — no external hosting required
  - Centralized icon utility: `getToolIcons()` in `src/utils/icons.ts`
- **MCP Enhanced Logging** — Full MCP protocol-compliant structured logging (SDK 1.25+)
  - RFC 5424 severity levels: debug, info, notice, warning, error, critical, alert, emergency
  - Module-prefixed error codes (e.g., `PG_CONNECT_FAILED`, `AUTH_TOKEN_INVALID`)
  - Structured log format: `[timestamp] [LEVEL] [MODULE] [CODE] message {context}`
  - Module-scoped loggers via `logger.forModule()` and `logger.child()`
  - Dual-mode output: stderr for local debugging + MCP protocol notifications to clients
  - Dynamic log level control via `logging/setLevel` request from MCP clients
  - Sensitive data redaction for OAuth 2.1 configuration fields
  - Stack trace inclusion for error-level logs with sanitization
  - Log injection prevention via control character sanitization
- **21 resources** — migrated + new extension resources
  - `postgres://capabilities` — Server version, extensions, tool categories
  - `postgres://performance` — pg_stat_statements query metrics
  - `postgres://health` — Comprehensive database health status
  - `postgres://extensions` — Extension inventory with recommendations
  - `postgres://indexes` — Index usage with unused detection
  - `postgres://replication` — Replication status and lag monitoring
  - `postgres://vacuum` — Vacuum stats and wraparound warnings
  - `postgres://locks` — Lock contention detection
  - `postgres://cron` — pg_cron job status, schedules, and execution history
  - `postgres://partman` — pg_partman partition configuration and health status
  - `postgres://kcache` — pg_stat_kcache CPU/I/O metrics summary
  - `postgres://vector` — pgvector columns, indexes, and recommendations
  - `postgres://postgis` — PostGIS spatial columns and index status
  - `postgres://crypto` — pgcrypto availability and security recommendations
  - `postgres://annotations` — Tool behavior hints categorized by type (read-only, write, destructive)
- Enhanced `postgres://stats` with stale statistics detection and recommendations
- **12 prompts** (6 migrated + 6 new extension-specific)
  - `pg_database_health_check` — Comprehensive health assessment workflow
  - `pg_backup_strategy` — Enterprise backup planning (logical/physical/PITR)
  - `pg_index_tuning` — Index usage analysis and optimization
  - `pg_extension_setup` — Extension installation guides
  - `pg_setup_pgvector` — Complete pgvector setup for semantic search
  - `pg_setup_postgis` — Complete PostGIS setup for geospatial operations
  - `pg_setup_pgcron` — Complete pg_cron setup for job scheduling
  - `pg_setup_partman` — Complete pg_partman setup for partition management
  - `pg_setup_kcache` — Complete pg_stat_kcache setup for OS-level monitoring
  - `pg_setup_citext` — Complete citext setup for case-insensitive text
  - `pg_setup_ltree` — Complete ltree setup for hierarchical tree data
  - `pg_setup_pgcrypto` — Complete pgcrypto setup for cryptographic functions
- **8 pg_cron tools** — Job scheduling extension support
  - `pg_cron_create_extension` — Enable pg_cron
  - `pg_cron_schedule` — Schedule cron jobs
  - `pg_cron_schedule_in_database` — Cross-database scheduling
  - `pg_cron_unschedule` — Remove jobs
  - `pg_cron_alter_job` — Modify existing jobs
  - `pg_cron_list_jobs` — List scheduled jobs
  - `pg_cron_job_run_details` — View execution history
  - `pg_cron_cleanup_history` — Clean old history records
- New `cron` tool-filtering group for pg_cron tools
- **10 pg_partman tools** — Automated partition lifecycle management
  - `pg_partman_create_extension` — Enable pg_partman
  - `pg_partman_create_parent` — Create partition set with automatic child creation
  - `pg_partman_run_maintenance` — Execute partition maintenance
  - `pg_partman_show_partitions` — List managed partitions
  - `pg_partman_show_config` — View partition configuration
  - `pg_partman_check_default` — Check for data in default partition
  - `pg_partman_partition_data` — Move data to child partitions
  - `pg_partman_set_retention` — Configure retention policies
  - `pg_partman_undo_partition` — Convert back to regular table
  - `pg_partman_analyze_partition_health` — Health check with recommendations
- New `partman` tool-filtering group for pg_partman tools
- **7 pg_stat_kcache tools** — OS-level performance visibility
  - `pg_kcache_create_extension` — Enable pg_stat_kcache
  - `pg_kcache_query_stats` — Query stats with CPU/IO metrics
  - `pg_kcache_top_cpu` — Top CPU-consuming queries
  - `pg_kcache_top_io` — Top I/O-consuming queries
  - `pg_kcache_database_stats` — Database-level aggregated stats
  - `pg_kcache_resource_analysis` — CPU-bound vs I/O-bound classification
  - `pg_kcache_reset` — Reset statistics
- New `kcache` tool-filtering group for pg_stat_kcache tools
- **6 citext tools** — Case-insensitive text type support
  - `pg_citext_create_extension` — Enable citext
  - `pg_citext_convert_column` — Convert text columns to citext
  - `pg_citext_list_columns` — List citext columns
  - `pg_citext_analyze_candidates` — Find columns that could benefit from citext
  - `pg_citext_compare` — Case-insensitive comparison
  - `pg_citext_schema_advisor` — Schema design recommendations
- New `citext` tool-filtering group for citext schema intelligence tools
- **8 ltree tools** — Hierarchical tree label support
  - `pg_ltree_create_extension` — Enable ltree
  - `pg_ltree_query` — Query ancestors/descendants with @> and <@ operators
  - `pg_ltree_subpath` — Extract path segments
  - `pg_ltree_lca` — Find longest common ancestor
  - `pg_ltree_match` — Pattern matching with lquery syntax
  - `pg_ltree_list_columns` — List ltree columns
  - `pg_ltree_convert_column` — Convert text to ltree
  - `pg_ltree_create_index` — Create GiST index for tree queries
- New `ltree` tool-filtering group for hierarchical tree operations
- **9 pgcrypto tools** — Cryptographic functions support
  - `pg_pgcrypto_create_extension` — Enable pgcrypto
  - `pg_pgcrypto_hash` — Hash data with digest() (SHA-256, MD5, etc.)
  - `pg_pgcrypto_hmac` — HMAC authentication
  - `pg_pgcrypto_encrypt` — Symmetric encryption with pgp_sym_encrypt()
  - `pg_pgcrypto_decrypt` — Symmetric decryption with pgp_sym_decrypt()
  - `pg_pgcrypto_gen_random_uuid` — Generate cryptographically secure UUID v4
  - `pg_pgcrypto_gen_random_bytes` — Generate random bytes for salts/tokens
  - `pg_pgcrypto_gen_salt` — Generate salt for password hashing
  - `pg_pgcrypto_crypt` — Hash passwords with crypt()
- New `pgcrypto` tool-filtering group for cryptographic operations
- **7 tool-filtering shortcuts** — Meta-groups for easier filtering
  - `starter` (49 tools) — **Recommended default**: core, transactions, jsonb, schema
  - `essential` (39 tools) — Minimal footprint: core, transactions, jsonb
  - `dev` (68 tools) — Application development: adds text search and stats
  - `ai` (80 tools) — AI/ML workloads: adds pgvector and performance
  - `dba` (90 tools) — Database administration: monitoring, backup, maintenance
  - `base` (120 tools) — All core PostgreSQL tools without extensions
  - `extensions` (74 tools) — All extension tools

### Changed

- Restructured resources into modular files for maintainability
- Resource count from 6 to 21
- Prompt count from 7 to 13
- Restructured prompts into modular files for maintainability
- Tool count from 146 to 194 (added pg_cron, pg_partman, pg_stat_kcache, citext, ltree, and pgcrypto tools)

### Planned

- Verify prompts and resources from old Python server are ported
- Verify all PostgreSQL extensions are supported
- Comprehensive testing before v1.0 release

## [0.2.0] - 2025-12-14

### Added

- **146 total tools** — comprehensive PostgreSQL coverage
- **Core tools** (13): `pg_list_objects`, `pg_object_details`, `pg_analyze_db_health`, `pg_analyze_workload_indexes`, `pg_analyze_query_indexes`
- **JSONB tools** (19): `pg_jsonb_validate_path`, `pg_jsonb_stats`, `pg_jsonb_merge`, `pg_jsonb_normalize`, `pg_jsonb_diff`, `pg_jsonb_index_suggest`, `pg_jsonb_security_scan`
- **Stats tools** (8): New group — `pg_stats_descriptive`, `pg_stats_percentiles`, `pg_stats_correlation`, `pg_stats_regression`, `pg_stats_time_series`, `pg_stats_distribution`, `pg_stats_hypothesis`, `pg_stats_sampling`
- **Vector tools** (14): `pg_vector_cluster`, `pg_vector_index_optimize`, `pg_vector_dimension_reduce`, `pg_hybrid_search`, `pg_vector_performance`, `pg_vector_embed`
- **Performance tools** (16): `pg_query_plan_compare`, `pg_performance_baseline`, `pg_connection_pool_optimize`, `pg_partition_strategy_suggest`
- **Monitoring tools** (11): `pg_capacity_planning`, `pg_resource_usage_analyze`, `pg_alert_threshold_set`
- **Backup tools** (9): `pg_backup_physical`, `pg_restore_validate`, `pg_backup_schedule_optimize`
- **PostGIS tools** (12): `pg_geo_transform`, `pg_geo_index_optimize`, `pg_geo_cluster`
- **Text tools** (11): `pg_text_sentiment`
- Tool filtering with `TOOL_GROUPS` for all 146 tools

### Changed

- Status from "Development Preview" to "Initial Implementation Complete"
- Updated README with accurate tool counts and categories

## [0.1.0] - 2025-12-13

### Added

- Initial repository setup
- Community standards (LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY)
- GitHub automation (CodeQL, Dependabot, issue/PR templates)
- Project configuration (TypeScript, ESLint, package.json)
- Core infrastructure with 106 base tools
- Connection pooling with health checks
- Tool filtering system
- 6 resources and 7 AI-powered prompts
