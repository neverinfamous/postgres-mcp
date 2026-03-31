# Unreleased

### Added

- **OAuth enhancements**: `SCOPE_PATTERNS`, `BASE_SCOPES` constants in `scopes.ts`. New `OAuthResourceServer.getWWWAuthenticateHeader()`, `isOAuthError()` type guard, and `getWWWAuthenticateHeader()` utility (RFC 6750 §3)
- **Harmonized error types**: New `types/error-types.ts` with `ErrorCategory` enum (9 categories), `ErrorResponse` and `ErrorContext` interfaces. New `formatHandlerError()` canonical formatter in `error-helpers.ts`
- **Error auto-refinement**: `findSuggestion()` in `error-suggestions.ts` (24 patterns) — generic codes auto-refined to specific codes (`TABLE_NOT_FOUND`, `COLUMN_NOT_FOUND`) via `REFINABLE_CODES`
- **DNS rebinding protection**: `validateHostHeader()` in `src/transports/http/security.ts` validates Host header against localhost addresses
- **Transport types module**: Extracted `HttpTransportConfig` and timeout constants to `transports/http/types.ts`
- **Server timeouts**: HTTP server sets `setTimeout`, `keepAliveTimeout`, `headersTimeout` to prevent slowloris-style DoS
- **Health check rate-limit bypass**: `/health` bypasses rate limiting. 429 responses include `Retry-After` header
- **`MCP_RATE_LIMIT_MAX` environment variable**: Fallback when `rateLimitMaxRequests` is not set in config
- **Audit subsystem**:
  - Token estimates on every audit entry and tool response (`_meta.tokenEstimate`), session summary via `postgres://audit`
  - Opt-in read logging (`--audit-reads`), size-based log rotation (`--audit-log-max-size`, default 10MB)
  - JSONL audit trail (`--audit-log`), redaction (`--audit-redact`), backup snapshots (`--audit-backup`)
  - 3 backup tools: `pg_audit_list_backups`, `pg_audit_restore_backup` (with `restoreAs`), `pg_audit_diff_backup` (with `volumeDrift`)
  - V2: Code Mode audit coverage (~2ms overhead), gzip snapshot compression, `BackupManager.flush()`, `--audit-backup-max-data-size` (default 50MB)
  - V2: `pg_safe_restore_workflow` prompt (20 total). `postgres://vacuum` suggestions with severity-tagged recommendations
- **Transport-agnostic auth**: `src/auth/transport-agnostic.ts` with `createAuthenticatedContext()`, `validateAuth()`, `formatOAuthError()`
- **Worker-thread Code Mode**: `src/codemode/worker-sandbox.ts` — V8 isolate sandbox using `node:worker_threads` with `ResourceLimits`, hard timeouts, and MessagePort RPC bridge
- **13 new tools** ported from db-mcp/mysql-mcp:
  - Stats — Window Functions (6): `pg_stats_row_number`, `pg_stats_rank`, `pg_stats_lag_lead`, `pg_stats_running_total`, `pg_stats_moving_avg`, `pg_stats_ntile`
  - Stats — Outlier Detection (1): `pg_stats_outliers` (IQR and Z-score)
  - Stats — Advanced Analysis (4): `pg_stats_top_n`, `pg_stats_distinct`, `pg_stats_frequency`, `pg_stats_summary`
  - Admin (1): `pg_append_insight` (in-memory memo via `postgres://insights` resource)
  - JSONB (1): `pg_jsonb_pretty` (dual-mode raw JSON or table column)
- **Help resource architecture**: Replaced monolithic `ServerInstructions.ts` (72KB) with 22 per-group `.md` files. `postgres://help` + `postgres://help/{group}` filtered by `--tool-filter`
- **Filter-aware instruction generation**: `generateInstructions()` adapts to enabled tool groups and `--instruction-level` (`essential`/`standard`/`full`)
- **Invariant tests**: `tool-annotations.test.ts` (9 tests) and `tool-output-schemas.test.ts` (3 tests) enforcing annotations, descriptions, groups, and `outputSchema` on all tools
- **`openWorldHint`**: Added `openWorldHint: false` to all 5 annotation presets — fixes 231 tools missing this field
- **Zod schema hardening**: Tightened `inputSchema` for 23 parameter-less tools from `z.object({})` to `z.object({}).strict()`
- **Pgcrypto error handling**: `handlePgcryptoError()` boundary for the entire pgcrypto suite — Base64 panics, key corruption, and invalid algorithm calls mapped to P154 errors
- **CI / workflows**: Ported drift detectors from memory-journal-mcp. Ported `test-tool-annotations.mjs` and `test-prompts.mjs`
- **E2E test coverage**: Ported 13 Playwright spec files from db-mcp (rate limiting, sessions, streaming, OAuth, Zod sweep, numeric coercion, code mode, data quality, help resources). Added 5 new spec files and extended 2 existing (+37 tests). Added performance, backup, audit, and token monitoring E2E tests. `prompts.spec.ts` (20 tests), `streamable-http.spec.ts` (6 tests), `errors.spec.ts` (6 tests)
- **Test helpers**: `getBaseURL()`, `callToolRaw()`, `expectHandlerError()`, `startServer()`, `stopServer()` in E2E helpers
- **Environment configuration**: Synchronized `.env.example` with audit and OAuth parameters
- **Code map update**: Updated `code-map.md` (248 tools, 22 resources)

### Changed

- **`PostgresMcpError` enriched**: Base error class now includes `category`, `suggestion`, `recoverable`, `details`, and `toResponse()`. All 8 subclasses updated
- **`OAuthError` extends `PostgresMcpError`**: Module-prefixed codes, `wwwAuthenticate` as instance property. Deprecated `getWWWAuthenticateHeader()`. Removed deprecated export from `auth/index.ts`
- **Per-tool scope overrides** (**BREAKING**): Core write tools require `write` scope; destructive tools require `admin` scope. Backup read-only audit tools overridden to `read`. Added `TOOL_SCOPE_OVERRIDES` in `scopes.ts`
- **Default 30s statement timeout**: Connection pool applies `statement_timeout = 30000` by default
- **Naming conventions**: Renamed 12 source + 9 test PascalCase files to kebab-case. Updated imports across ~80 files
- **Modularization**: Split 20+ files exceeding 500-line limit into focused sub-modules — `server.ts`, `PostgresAdapter.ts`, `database-adapter.ts`, `cli.ts`, plus 12+ schema/tool files across partman, citext, introspection, admin, monitoring, jsonb, postgis, vector, and core groups
- **Code quality improvements**:
  - `catch (error)` → `catch (error: unknown)` across 24 files (65+ blocks)
  - Removed 52 redundant `instanceof ZodError` catch blocks across 19 tool files
  - Extracted shared helpers: `toStr()`, `coerceLimit()`, `buildLimitClause()`, `formatZodIssues()`, `extractSchemaFromDottedName()`, `extractBearerToken()`
  - Replaced `z.any()` with proper typed schemas in 3 performance tool output schemas
  - Replaced 5 raw `as` casts with proper Zod `.parse()`, 12 `throw new Error()` with `throw new ValidationError()`
  - Added `logger.warn()` for silently swallowed errors, replaced `void` lint-suppression with underscore-prefix destructuring
  - Extracted named constants for magic literals (audit defaults, sensitive keys, module logger, schema helpers, code mode config)
  - Merged duplicate imports, removed stale phase labels and orphaned JSDoc blocks
  - Replaced 2 unsafe `error as Error` casts with `instanceof Error` guards
- **Core tool payload optimization**: ~30-41% token reduction — dropped redundant fields (`nullable`, `primaryKey: false`, `comment: null`), removed duplicate count aliases, canonical `rowsAffected` field
- **Streaming tail-read for audit log**: `AuditLogger.recent()` reads only last 64KB via positioned `read()` instead of full file load
- **Single-stringify token estimate**: `registerTool()` serializes once and patches estimate via string replacement
- **Async gzip snapshots**: `BackupManager.writeSnapshot()` uses async `gzip()` instead of blocking `gzipSync()`
- **Incremental TypeScript compilation**: `incremental: true` in `tsconfig.json` — sub-second rebuilds for small changes
- **Vitest SWC Transform**: `unplugin-swc` in `vitest.config.ts` for faster test transforms
- **Zod Union Optimization**: Un-nested complex union types in `CreateTableSchema` — 10x faster parsing
- **Security sanitization fast-path**: Arrays exceeding 500 rows immediately sliced in Code Mode serialization
- **Compact JSON serialization**: `JSON.stringify(result)` for `structuredContent` responses (~15-20% payload reduction)
- **Derived tool counts**: Replaced ~50 hardcoded tool counts with dynamic derivations from `TOOL_GROUPS`
- **npm package slimming**: Excluded source maps (1.65 MB) and compiled tests. Added bench file exclusion from `tsconfig.json`
- **Safe numeric coercion**: `coerceNumber()` converts non-numeric values to `undefined` instead of `NaN`
- **Prebuild clean**: Added `prebuild` script preventing stale compiled output across file renames
- **Advanced test prompt restructure**: Split monolithic 690-line test file into per-group files
- **Removed unused `hono` dependency**
- **Documentation**: Updated server instructions, READMEs, test protocols, and gotchas with new tools, token visibility, and configuration
- **Playwright config**: `--tool-filter +all`, `MCP_RATE_LIMIT_MAX: "1000"`, `workers: 1`
- **E2E shared client pattern**: `tools.spec.ts` uses shared client via `beforeAll`/`afterAll`
- **Dependency updates**:
  - `jose` → v6.2.2, `@modelcontextprotocol/sdk` → v1.28.0, `@types/pg` → v8.20.0
  - `@vitest/coverage-v8` → v4.1.2, `eslint` → v10.1.0, `vitest` → v4.1.2
  - `typescript-eslint` → v8.57.2, `@types/node` → v25.5.0
  - `actions/upload-artifact` → v7.0.0, `docker/metadata-action` → v6.0.0

### Fixed

- **Docker image pull unknown blob bug (Issue #92)**: Transitioned CI/CD to two-stage process — platform digests pushed with suffix-bound tags and converged via `docker buildx imagetools create`, eliminating multi-arch race condition
- **`TableListOutputSchema` rejection**: Added missing `owner`, `totalSizeBytes`, `comment`, `statsStale` properties
- **`describeTable` stale schema after DDL**: Added DDL-aware cache invalidation in `executeWriteQuery()` — detects DDL via regex, extracts target table, clears affected cache entries
- **Tool title propagation**: `registerTool()` now passes `title` as top-level config key. Previously all tools silently emitted no title
- **Code Mode readonly enforcement**: `readonly: true` now blocks write operations at the API binding level. Previously only used for audit logging
- **Code Mode last-expression auto-return**: Bare expressions like `pg.help()` now correctly return values via `transformAutoReturn()`
- **Code Mode backup namespace**: Added `listBackups`, `diffBackup`, `restoreBackup` aliases to `pg.backup`
- **Code Mode Split Schema**: Empty parameters on `pg_execute_code` now return structured response instead of raw `-32602`
- **`volumeDrift` always undefined**: `pg_class.reltuples::bigint` sent as string — fixed with `parseInt(String(...))` in snapshot capture and diff
- **`volumeDrift` -1 sentinel**: PostgreSQL `reltuples = -1` now treated as `undefined` instead of surfacing literally
- **Structured error on throw**: Outer catch in `registerTool()` now returns `structuredContent` with error fields when tool has `outputSchema`
- **Schema error acceptance**: Made success-path fields `.optional()` in 18 output schemas that rejected error-only payloads
- **Missing `outputSchema` on `pg_vector_batch_insert`**: Added `VectorBatchInsertOutputSchema`
- **In-place restore failures**: Fixed `pg_audit_restore_backup` generating wrong `DROP` statement for tables. Fixed missing `CREATE SEQUENCE IF NOT EXISTS` for `SERIAL` columns in snapshot DDL
- **Backup data exporter quoting bug**: `Date` objects no longer double-quoted in CSV/TEXT exports via `pg_copy_export`
- **Instruction filtering regression**: Help pointers now generated dynamically by `buildHelpPointers()` instead of static section
- **Test script hangs**: `reset-database.ps1` defaults password, pipes DDL through stdin, uses precise container inspection
- **Core idempotency (`pg_create_table`)**: `ifNotExists: true` now correctly reports `alreadyExists: true` via schema pre-check
- **Schema view replacement (`pg_create_view`)**: `orReplace: true` with changed column type catches `42P16` and drops/recreates
- **Stats summary query error leak**: Column data type pre-validation against `information_schema.columns` for non-numeric columns
- **Schema creation idempotency**: Unified `alreadyExisted` → `alreadyExists` across `pg_create_schema`, `pg_create_sequence`, `pg_create_view`
- **Cron job name filter**: `pg_cron_job_run_details` `jobName` parameter now executes subquery resolution instead of being silently ignored
- **Pgcrypto output symmetry**: `encrypted` → `encryptedData` in `pg_pgcrypto_encrypt` to match `pg_pgcrypto_decrypt` input
- **Introspection fixes**: Cascade simulator no longer skips self-referencing FKs. `pg_schema_snapshot` recursively strips null values and empty entities
- **Migration idempotency risk**: `pg_migration_risks` flags non-`IF NOT EXISTS` `CREATE TABLE` as `low` risk
- **Partman missing-child grace**: `pg_partman_run_maintenance` intercepts `Child table does not exist <NULL>` for new partition sets, returns `success: true`
- **Graph error categorization**: `pg_cascade_simulator` assigns `high` instead of `critical` for `DELETE` blocked by `RESTRICT` FKs
- **Admin tool errors**: `pg_terminate_backend`, `pg_cancel_backend` return structured P154 responses. `pg_append_insight` validates empty text and max 1000 characters
- **Introspection compact mode**: `DependencyEdgeSchema` fields corrected from required to `.optional()` for compact mode
- **Error parser fixes**: Broad regex leak causing column errors to map as `TABLE_NOT_FOUND` fixed with negative lookbehind. Tsvector false-positive regex tightened. Schema entity extraction expanded for views and sequences. Single/double quote support unified
- **Query plan compare**: Added `compact` parameter to suppress verbose `fullPlans` output
- **Core index limit leak**: `pg_get_indexes` now universally applies `limit` parameter with `truncated` metadata
- **Stats fixes**: Array payload boundaries (`.max(1000)`) on `pg_stats_top_n`, `pg_stats_distinct`, `pg_stats_frequency`. Hypothesis edge cases throw P154 `ValidationError`. `pg_stats_rank` `method`→`rankType` and `pg_stats_top_n` `direction`→`orderDirection` parameter alignment. Scalar coercion overflow fix on `pg_stats_descriptive`
- **Partitioning payload contract**: Fixed parameter name mapping for `pg_attach_partition`/`pg_detach_partition`. Removed hallucinated `pg_partition_tree` test
- **Extensions payload contract**: Purged hallucinated-alias expectations in `payloads-extensions.spec.ts`. All 30+ extension tools verified through exact SDK execution
- **Core error context (`pg_drop_table`)**: Table parameter now correctly forwarded to error formatter for P154 `TABLE_NOT_FOUND` rendering
- **Performance payload contract**: `pg_detect_query_anomalies` `anomalies` array no longer arbitrarily truncated; underlying query already enforces `LIMIT 20`
- **Split Schema / Zod validation fixes** (consolidated across all tool groups):
  - **PostGIS** (15 tools): Replaced `z.enum()` with `z.string()` in base schemas, fixed `z.preprocess()` stripping `.optional()`, coordinate bounds validation, spatial index object integrity, error boundaries. Restored `wkt` output to `pg_geocode`. Reduced `pg_buffer`/`pg_geo_transform` default limit from 50→10. Added `limit` to `pg_bounding_box`/`pg_intersection`
  - **Vector** (16 tools): Fixed limit/alias leaks on `pg_vector_search`, Zod leaks on cluster/dimension tools, dimension mismatch error codes unified to `DIMENSION_MISMATCH`, accuracy fix for swapped expected/provided dimensions, batch insert query leaks, `pg_vector_distance` structured error
  - **Pgcrypto** (9 tools): Fixed `z.preprocess()` stripping `.optional()` on 3 tools, gen_salt numeric coercion, create_extension param parsing, inline schema violations, decryption output fidelity, validation regression on gen_random_uuid/gen_random_bytes
  - **Ltree** (8 tools): Fixed `pg_ltree_lca` array length bounds validation leak
  - **Citext** (6 tools): Fixed Split Schema leaks, strict validation on create_extension, convert_column errors, alias handling, constraint/error boundary leaks
  - **Kcache** (7 tools): Relaxed `z.object({}).strict()` on parameterless tools, bounded limits (1-100, default 50), added compact mode, fixed numeric coercion and validation leaks
  - **Partman** (10 tools): Re-introduced 8 parameter aliases across 9 base schemas, fixed numeric field typing, added table existence checks (`TABLE_NOT_FOUND`), fixed `pg_partman_analyze_partition_health` ad-hoc responses
  - **Migration** (6 tools): Fixed `z.preprocess()`/`z.enum()` leaks on rollback/history, numeric coercion via `z.union()`, status output omitting `recorded: 0`, added `sql`/`query` aliases for record/apply, P154 error leaks on apply
  - **Cron**: Removed Zod regex validation leak in `CoercibleJobId`, fixed Split Schema validation leaks, limit coercion, Zod boundary violations across schedule/cleanup/list tools, optimized pg_cron_job_run_details payload, made success field required in output schemas, added missing `success: true` to pg_cron_list_jobs and pg_cron_job_run_details, fixed missing error fields in CronCreateExtensionOutputSchema and CronListJobsOutputSchema, corrected limit schema description for pg_cron_job_run_details
  - **Backup** (12 tools): Fixed Split Schema bugs on restore/diff, enum leaks across 5 tools, structured error leaks across 6 tools, payload bloat on list_backups (added `limit` default 50)
  - **Monitoring** (11 tools): Fixed `pg_table_sizes`/`pg_show_settings` leaks, inline schema extraction for capacity/alert tools, `pg_resource_usage_analyze` missing error boundary, `pg_database_size` Zod leak, payload optimization (table_sizes default 50→10)
  - **Schema** (12 tools): Fixed missing alias mappings for drop_sequence/drop_view, structured error leaks on list tools, extract error leaks on list_triggers/constraints/functions, alias missing fallbacks on create tools, numeric coercion leak, Split Schema consistency
  - **Admin** (11 tools): Fixed Split Schema bugs on terminate/cancel/append_insight/set_config/reindex, Zod leaks, inline schema violations
  - **Text** (11 tools): Fixed Zod coercion and alias leaks across FTS tools, P154 error leaks on pg_like_search, payload contracts for rank/headline
  - **JSONB** (20 tools): Fixed Zod leaks on pg_jsonb_array/pg_jsonb_strip_nulls, numeric coercion leaks across 7 tools via `z.union()` base schemas. Added missing `success: true` to all success response paths in `pg_jsonb_set`, `pg_jsonb_insert`, and `pg_jsonb_delete` (5 code paths)
  - **Core** (5 tools): Fixed `pg_upsert`/`pg_batch_insert` P154 error compliance, error pipeline generic/raw PG leaks
  - **Transactions**: Fixed `pg_transaction_execute` wrong-type leak (statements schema), `pg_jsonb_diff` wrong-type leak
  - **Performance**: Fixed P154 structured error leaks on query_plan_compare/partition_strategy_suggest, workload_indexes raw error leak, enum validation leaks on analyze_query_indexes/list_objects/object_details
- **P154 structured error compliance**: Replaced manual `{success: false, error}` objects lacking `code`/`category` with proper `PostgresMcpError` classes across citext, partman, backup, stats, text, vector, core, and cron tool groups. Updated unit test assertions to expect structured payloads

### Removed

- **`META_GROUPS` shortcut bundles**: Removed all 16 predefined shortcut bundles (e.g. `starter`, `dev-schema`, `dba-monitor`). Use granular `TOOL_GROUPS` or Code Mode for maximum access

### Security

- **Dependency updates**: Bumped `gitleaks-action`, `trufflehog` → v3.93.8, `github/codeql-action` → v4. Patched `flatted`, `picomatch`, `hono` overrides. Updated Dockerfile `diff` → 8.0.4 and `tar` → 7.5.13
- **CI/CD hardening**: Updated `e2e.yml` checkout to v6 SHA. Added `--provenance` flag and `id-token: write` to `publish-npm.yml` for SLSA Build L3 attestation. Added `npm audit --omit=dev` to `lint-and-test.yml`. Removed `continue-on-error: true` from Docker Hub description update
