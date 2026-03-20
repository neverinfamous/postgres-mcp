# Unreleased

## Added
- **13 New Tools Ported from db-mcp/mysql-mcp**:
  - **Stats — Window Functions (6)**: `pg_stats_row_number`, `pg_stats_rank`, `pg_stats_lag_lead`, `pg_stats_running_total`, `pg_stats_moving_avg`, `pg_stats_ntile` — SQL window functions with `partitionBy`, `selectColumns`, and configurable limits
  - **Stats — Outlier Detection (1)**: `pg_stats_outliers` — IQR and Z-score outlier detection with configurable thresholds and `maxOutliers` cap
  - **Stats — Advanced Analysis (4)**: `pg_stats_top_n` (auto-excludes long-content columns), `pg_stats_distinct`, `pg_stats_frequency`, `pg_stats_summary` (multi-column numeric summary)
  - **Admin — Insights (1)**: `pg_append_insight` — in-memory business insight memo accessible via `postgres://insights` resource
  - **JSONB — Pretty Print (1)**: `pg_jsonb_pretty` — dual-mode (raw JSON string or table column via `jsonb_pretty()`)
- **Insights Resource**: Added `postgres://insights` resource (21 total resources) for reading AI-appended business insights
- **Server Instructions**: Updated help content in `admin.md`, `jsonb.md`, `stats.md` with full parameter docs, response shapes, and top-level aliases for all 13 new tools
- **Test Coverage for New Tools**: Added 24 vitest handler tests for 11 new stats tools (window, outlier, advanced) in `stats.test.ts`. Added 9 E2E Playwright tests: 6 stats payload contracts (`payloads-stats.spec.ts`), 1 jsonb pretty (`payloads-jsonb.spec.ts`), 1 admin insights (`payloads-admin.spec.ts`), 1 insights resource (`resources-extended.spec.ts`)
- **Code Map Update**: Updated `code-map.md` with new handler files, schemas, resource, utility (245 tools, 21 resources)


- **Ported E2E Tests**: Ported 13 Playwright E2E test files from `db-mcp`, adapted for postgres-mcp tool names and PostgreSQL semantics:
  - Infrastructure: `rate-limiting.spec.ts` (429/Retry-After/health exemption), `session-advanced.spec.ts` (cross-protocol guard, sequential isolation, post-DELETE rejection), `streaming.spec.ts` (Streamable HTTP + Legacy SSE), `oauth-discovery.spec.ts` (RFC 9728 metadata)
  - Validation: `zod-sweep.spec.ts` (~100 tools empty-args sweep), `numeric-coercion.spec.ts` (string→numeric params), `errors-extended.spec.ts` (per-group error paths)
  - Code Mode: `codemode.spec.ts` (sandbox basics, security, readonly, workflows), `codemode-groups.spec.ts` (10 groups via `pg.*` API)
  - Data Quality: `boundary.spec.ts` (empty tables, NULLs, idempotency, view lifecycle), `integration-workflows.spec.ts` (cross-group pipelines)
  - Feature: `help-resources.spec.ts` (22-group `postgres://help` resources)
- **E2E Test Coverage Expansion**: Added 5 new spec files and extended 2 existing files (+37 tests):
  - `resources-extended.spec.ts` (12 tests) — reads 12 previously untested data resources (`stats`, `activity`, `pool`, `capabilities`, `performance`, `indexes`, `replication`, `vacuum`, `locks`, `vector`, `postgis`, `crypto`)
  - `tool-filter.spec.ts` (4 tests) — first-ever `--tool-filter` runtime E2E tests (`core`, `starter`, `core,-codemode`, individual whitelist)
  - `payloads-transactions.spec.ts` (3 tests) — savepoint lifecycle, rollback verification, transaction status
  - `payloads-convenience.spec.ts` (6 tests) — `pg_batch_insert`, `pg_upsert`, `pg_exists`, `pg_list_objects`, `pg_object_details`
  - `codemode-groups-extended.spec.ts` (4 tests) — transactions, backup, partitioning groups via Code Mode
  - `payloads-performance.spec.ts` (+4) — `pg_vacuum_stats`, `pg_locks`, `pg_unused_indexes`, `pg_diagnose_database_performance`
  - `payloads-schema.spec.ts` (+4) — `pg_list_sequences`, `pg_list_triggers`, `pg_topological_sort`, `pg_schema_snapshot`
- **Test Helpers Enhancement**: Added `getBaseURL()`, `callToolRaw()`, `expectHandlerError()`, `startServer()`, `stopServer()` to `tests/e2e/helpers.ts`. `createClient()` now accepts optional `baseURL` parameter with retry logic.
- **Error Auto-Refinement**: Added `findSuggestion()` in `src/utils/error-suggestions.ts` (24 patterns) and auto-refinement logic in `PostgresMcpError` constructor — generic codes (`QUERY_ERROR`, `VALIDATION_ERROR`) are auto-refined to specific codes (`TABLE_NOT_FOUND`, `COLUMN_NOT_FOUND`) via `REFINABLE_CODES` set
- **DNS Rebinding Protection**: Added `validateHostHeader()` in `src/transports/http/security.ts` — prevents DNS rebinding attacks on localhost-bound servers by validating Host header against `localhost`, `127.0.0.1`, `::1`. Integrated into `server.ts` request pipeline.
- **Invariant Tests**: Added `src/__tests__/tool-annotations.test.ts` (9 tests) and `src/__tests__/tool-output-schemas.test.ts` (3 tests) for structural enforcement — verifies every tool has complete annotations (title, readOnlyHint, destructiveHint, openWorldHint), description, group, and outputSchema
- **openWorldHint**: Added `openWorldHint: false` to all 5 annotation presets (`READ_ONLY`, `WRITE`, `DESTRUCTIVE`, `IDEMPOTENT`, `ADMIN`) — fixes 231 tools missing this field

### Security
- **Dependency Updates**:
  - Hono vulnerable to Prototype Pollution fixed via `v4.12.8`
  - Bumped `gitleaks-action` to `ff98106`
  - Bumped `trufflehog` to `v3.93.8` (`6c05c4a`)
  - Bumped `github/codeql-action` to `v4` (`0d579ff`)
- **CI/CD Hardening**:
  - Updated `e2e.yml` checkout action from v4 SHA to v6 SHA for consistency with all other workflows
  - Added `--provenance` flag to `npm publish` in `publish-npm.yml` for SLSA Build L3 attestation
  - Added `id-token: write` permission to `publish-npm.yml` for OIDC provenance token generation

## Added
- **Help Resource Architecture**: Replaced monolithic `ServerInstructions.ts` (72KB) with 22 per-group `.md` files under `src/constants/server-instructions/`. Slim ~600 char instructions field points agents to `postgres://help` resources for on-demand reference. `McpServer.ts` registers `postgres://help` (always) + `postgres://help/{group}` filtered by `--tool-filter`. Supersedes instruction filter alignment.
- **Agent Experience Test**: Added `test-server/test-agent-experience.md` with 9 passes (37 scenarios) covering all tool groups with explicit tool group annotations.
- **Integration Test**: Added `test-server/test-instruction-levels.mjs` to verify instruction filtering behavior.

### Changed
- **Dependency Updates**:
  - Bumped `hono` to `v4.12.8`
  - Bumped `jose` to `v6.2.2`
  - Bumped `@vitest/coverage-v8` to `v4.1.0`
  - Bumped `vitest` to `v4.1.0`
  - Bumped `typescript-eslint` to `v8.57.1`
  - Bumped `@types/node` to `v25.5.0`
  - Bumped `actions/upload-artifact` to `v7.0.0`
  - Bumped `docker/metadata-action` to `v6.0.0`
- **Modularization**: Split 8 files exceeding 500-line limit into focused sub-modules:
  - `server.ts` (690→~420) → extracted `streamable.ts`, `stateless.ts`, `legacy-sse.ts`
  - `PostgresAdapter.ts` (674→~480) → extracted `transaction-operations.ts`
  - `partman/maintenance.ts` (632) → split into `retention.ts` + `health-analysis.ts`
  - `citext/analysis.ts` (611) → split into `list-compare.ts` + `candidates-advisor.ts`
  - `schemas/introspection.ts` (602) → split into `introspection/input.ts` + `output.ts`
  - `tools/admin.ts` (599) → split into `admin/vacuum-tools.ts` + `backend-tools.ts` + `config-tools.ts`
  - `schemas/index.ts` (555→8) → split into `core-exports.ts` + `extension-exports.ts`
  - `tools/core/schemas.ts` (559→8) → split into `schemas/input.ts` + `schemas/output.ts`
  - `schemas/jsonb/basic.ts` (587→~420) → extracted `utils.ts` (path normalization, preprocessing)
  - `schemas/postgis/basic.ts` (575→~430) → extracted `utils.ts` (preprocessing, coordinate helpers)
  - `schemas/postgis/advanced.ts` (535→~218) → extracted `output.ts` (16 output schemas)
  - `schemas/partman.ts` (577) → promoted to `partman/` directory with `input.ts` + `output.ts` + `index.ts`
  - `schemas/vector.ts` (529) → promoted to `vector/` directory with `input.ts` + `output.ts` + `index.ts`
  - `schemas/partitioning/range.ts` (545→~350) → extracted `preprocess.ts` (alias resolution, bounds construction)
  - `tools/monitoring/analysis.ts` (547) → split into `capacity-planning.ts` + `resource-usage.ts` + `alert-thresholds.ts`
  - `tools/jsonb/write.ts` (549→~360) → extracted `write-builders.ts` (object, array, stripNulls)
  - `cli.ts` (532→~230) → extracted `cli/config.ts` (DB/OAuth config builders) + `cli/server.ts` (stdio/HTTP starters)
  - `tools/core/error-helpers.ts` (516→~135) → extracted `error-parser.ts` (PG error code→message parser)
- **Naming conventions**: Renamed 12 source + 9 test PascalCase files to kebab-case (`DatabaseAdapter.ts` → `database-adapter.ts`, `PostgresAdapter.ts` → `postgres-adapter.ts`, `McpServer.ts` → `mcp-server.ts`, etc.). Updated all import paths across ~80 files.

### Fixed
- **Test imports**: Fixed stale import paths in `admin.test.ts`, `security-injection.test.ts` (admin split), `http.test.ts` (HTTP transport function extraction), and `schemas.test.ts` (partman/vector directory promotion)
- **Code Mode readonly enforcement**: `pg_execute_code` with `readonly: true` now actually blocks write operations at the API binding level (previously only used for audit logging). Write-capable methods (identified via `readOnlyHint` annotations) are replaced with functions that throw `Readonly mode` errors synchronously, eliminating the async DB round-trip that caused intermittent 60s E2E test timeouts

### Changed (Audit)
- **npm package slimming**: Added `!dist/**/*.map` and `!dist/__tests__` to `package.json` `files`, excluding 578 source map files (1.65 MB) and compiled test support from the npm package. Docker images unaffected (`.dockerignore` already excludes `dist/`).
- **Bench file exclusion**: Added `**/*.bench.ts` to `tsconfig.json` `exclude`, preventing 52 benchmark files (139 KB) from compiling into `dist/`
- **Lazy help content**: Converted eagerly-allocated `HELP_CONTENT` Map (76 KB) in `server-instructions.ts` to lazy-initialized `getHelpContent()` — only built on first access during `registerHelpResources()`
- **Prebuild clean**: Added `prebuild` script (`node -e "require('fs').rmSync('dist',{recursive:true,force:true})"`) to `package.json`, preventing stale compiled output from persisting across file renames
- **Logger dedup**: Consolidated duplicated 23-item sensitive-key list in `logger.ts` into a single `SENSITIVE_KEY_LIST` constant, deriving both the `Set` and `RegExp` from it
- **ModuleLogger extraction**: Moved `ModuleLogger` class from `logger.ts` (513→~440 lines) to `module-logger.ts`
- **Zod error dedup**: Extracted duplicated Zod validation issue formatting in `error-helpers.ts` into shared `isZodLikeError()` guard + `formatZodIssues()` helper
- **Limit coercion**: Extracted duplicated limit-coercion logic (7 occurrences across `matching.ts`, `search-tools.ts`, `fts.ts`) into `query-helpers.ts` with `coerceLimit()` + `buildLimitClause()` + `DEFAULT_QUERY_LIMIT` constant
- **Silent catch logging**: Added `logger.warn()` for bloat estimation errors in `health.ts` (was silently swallowed)
- **Schema helper extraction**: Extracted `extractSchemaFromDottedName()` in `schema-mgmt.ts` to DRY 4 preprocessing functions
- **Output schema typing**: Replaced `z.any()` / `z.array(z.any())` with `z.record(z.string(), z.unknown())` / `z.array(z.record(...))` in 3 performance tool output schemas
- **ZodError catch dedup**: Removed 33 redundant `if (error instanceof ZodError)` catch blocks across 13 tool files — centralized `formatHandlerErrorResponse` already handles ZodError
- **Input schema coercion**: Replaced 40 `z.any().optional()` input fields with `z.coerce.number().optional()` across 13 schema/tool files for proper numeric validation at parse time. Removed redundant handler-side `Number()` wrappers.
- **Residual `z.any()` cleanup**: Replaced 5 remaining `z.any()` fields with `z.coerce.number()` in `cron.ts` (limit, olderThanDays), `views.ts` (truncateDefinition, limit), and `objects.ts` (limit)
- **Raw param cast removal**: Replaced 5 `(params ?? {}) as` raw casts with proper Zod `.parse()` in `catalog.ts` (pg_list_triggers, pg_list_constraints), `views.ts` (pg_list_views), `objects.ts` (pg_list_sequences), and `monitoring.ts` (pg_locks)
- **Stale comment cleanup**: Updated 2 comments that incorrectly referenced `z.any()` after prior refactoring in `catalog.ts` and `cron.ts`
- **ZodError catch dedup (pass 2)**: Removed 19 more redundant `instanceof z.ZodError` blocks in 6 tool files (`pgcrypto.ts`, `monitoring/basic.ts`, `monitoring/capacity-planning.ts`, `ltree/basic.ts`, `ltree/operations.ts`, `core/convenience.ts`). Cleaned up 2 now-unused `z` imports.
- **Resource helper dedup**: Extracted duplicated `toStr()` helper (9 resource files) and `SMALL_TABLE_THRESHOLD` constant (2 files) into shared `query-helpers.ts`. Unified `toStr` to handle string, number, null, and object coercion.
- **Code mode magic values**: Added `rateLimitWindowMs` and `resultPreviewLength` to `SecurityConfig` and `DEFAULT_SECURITY_CONFIG` in `codemode/types.ts`, replacing hardcoded `60000` and `1000` in `codemode/security.ts`.
- **Threshold documentation**: Added explanatory comments for intentionally different large-table warning thresholds: 10K (PostGIS — spatial queries expensive) vs 100K (pgvector — sequential scans tolerable on moderate tables).
- **Advanced test prompt restructure**: Replaced monolithic `advanced-test-tools.md` (690 lines, 12 cross-cutting categories) with per-tool-group split files `test-tools-advanced-1.md` (core, transactions, jsonb, text, stats, vector) and `test-tools-advanced-2.md` (extensions, performance, introspection, migration, cross-group workflows) — aligning with db-mcp's proven strategy for AI tool-limited environments
