# Changelog

All notable changes to this project will be documented in this file.
This project adheres to [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Transport-agnostic Auth module (`src/auth/transport-agnostic.ts`)
- OAuth enhancements supporting `SCOPE_PATTERNS`, `BASE_SCOPES`, and RFC 6750
- Audit subsystem with session token estimates, JSONL logging, redaction, and `pg_audit_*` tools
- Worker-thread Code Mode sandbox with resource limits and an RPC bridge
- Configurable server timeouts (`MCP_REQUEST_TIMEOUT`, `MCP_HEADERS_TIMEOUT`) and DNS rebinding protection
- Rate limiting bypass for `/health` and `Retry-After` header propagation
- 13 new statistics and admin tools including `pg_stats_row_number`, `pg_stats_outliers`, and `pg_append_insight`
- `pg_jsonb_pretty` tool for JSON formatting (includes `value` alias parameter)
- Filter-aware instruction generation based on tool filters and verbosity levels
- 22 group-specific help resources accessible via `postgres://help`
- Playwright E2E coverage for Code Mode, authentication, and backups
- `toType` parameter in `pg_citext_convert_column` for pure `text` type conversions
- Parallel array parameters (`keys`, `values`) in `pg_jsonb_object`
- `indexName` and `name` alias parameters in `pg_vector_create_index`
- `pattern`, `table`, and `name` alias parameters for wildcard matching in `pg_table_sizes`

### Changed
- **BREAKING**: Core write tools now require `write` scope; destructive tools require `admin`
- Centralized default connection pool timeout to 30,000ms
- Expanded `PostgresMcpError` to track categories, suggestions, and serialization context
- Modularized source files and standardized file/directory names to kebab-case convention
- Optimized token payload sizes (~30–41% reduction) via `compact` toggles, array collapsing, and reduced default limits on high-chatter tools
- Applied `openWorldHint: false` to all tools
- Standardized `count` response unconditionally in table mode for `pg_jsonb_pretty`
- Reduced npm package size by excluding source maps and tests
- Refactored Vitest test suite to use SWC compilation
- Harmonized test prompt architecture and certified operational parity across all tool groups
- Updated npm dependencies (`@modelcontextprotocol/sdk`, `@playwright/test`, `typescript`, `typescript-eslint`)

### Removed
- Obsolete shortcut action bundles (`META_GROUPS`)
- Unused `hono` router dependency

### Fixed
- Standardized P154 error structures (`success: false` replaced with explicit `ValidationError` instances) across 230+ tools
- Enforced strict payload bounds (`limit`, `n`, `sanitizeResult`) to prevent token bloat
- Resolved Split Schema Pattern violations across `pg_hybrid_search`, `pg_jsonb_*`, `pg_vector_*`, and `pg_citext_*` tools
- Repaired serialization parity for standard arrays to Postgres vector conversions via Code Mode `pg_upsert`
- Fixed Zod validation handling and eliminated framework refine leaks in vector tools
- Corrected migration rollback transaction isolation to prevent unmanaged auto-commits
- Fixed schema state invalidation missing DDL regex detection
- Adjusted Code Mode evaluation bypasses for readonly fields, schema errors, and exposed aliases
- Resolved backup restoration ordering, sequence defects, and schema drift false positives
- Remediated introspection cascade simulator truncating self-referencing foreign keys
- Handled Partman initialization routines failing on missing child tables
- Patched metadata caching defects causing stale schema artifacts and Code Mode invalidation failures
- Resolved inconsistent 'does not exist' error messaging, regex matching, and validation leaks
- Bypassed Docker Hub rate-limit blocks during multi-arch image pipelines by enforcing authenticated pulls
- Standardized parameter requirements in `pg_jsonb_normalize`, `pg_jsonb_typeof`, `pg_jsonb_keys`, and `pg_jsonb_path_query`
- Fixed timing defects in admin vacuum/analyze tools causing progress logging before validation failures
- Updated `pg_citext_compare` input validation to natively accept empty strings
- Patched idempotency gaps in `pg_vector_create_index` for `ifNotExists: true`
- Supported raw JSON string literal validation across JSONB tools by enforcing explicit JSON parsing
- Adjusted `pg_jsonb_validate_path` to return structured `ValidationError` with `$`-prefix hint
- Required at least one entry via `data`, `object`, or `pairs` in `pg_jsonb_object`
- Fixed `pg_jsonb_object` incorrectly escaping parallel arrays via Code Mode
- Clamped unbound limits in `pg_show_settings` and `pg_table_sizes` to a maximum of 100 rows to prevent unmanageable token bloat
- Fixed `pg_connection_stats` input schema to use filtering and enforce P154 existence checks
- Enforced strict coercion (`coerceStrictNumber`) across monitoring endpoints to reject improper numeric string types
- Patched missing empty string and NaN evasion constraint validations in `pg_alert_threshold_set`
- Mapped Postgres authorization bounds error (`42501`) gracefully to structured error payloads
- Added `like` alias parameter support and deduplicated wildcard logic in `pg_show_settings`
- Added missing `success: true` fields to responses across `pg_capacity_planning`, `pg_alert_threshold_set`, and other monitoring group tools
- Fixed `pg_partman` tools schema detection properly reporting missing extensions via `ExtensionNotAvailableError`
- Corrected `pg_partman_show_config` to elegantly return `TABLE_NOT_FOUND` when queried with an unmanaged table alias
- Added `sqlA`/`sqlB` aliases (in addition to `sql1`/`sql2`) to `pg_query_plan_compare` schema base for full Code Mode parity
- Replaced silent clamping in `pg_detect_query_anomalies` (threshold, minCalls) and `pg_detect_bloat_risk` (minRows) with explicit structured validation errors
- Added schema existence pre-checks (P154) to `pg_detect_bloat_risk` and `pg_diagnose_database_performance`
- Capped `pg_stat_statements` and `pg_query_plan_stats` maximum return limit at 500 rows to prevent unbounded payload blowout on large `pg_stat_statements` tables
- Fixed Split Schema violation in `pg_performance_baseline`: extracted plain `PerformanceBaselineSchemaBase` for `inputSchema` (MCP parameter visibility), keeping `z.preprocess()` wrapper only for handler-side parsing
- Updated `performance.md` server instructions: documented `baseline({ name? })` param (now MCP-visible), `detectConnectionSpike({ warningPercent? })` correct param name and clamp range, and `seqScanTables` payload limits in the AI-Optimized Payloads section
- Fixed Split Schema violations in `pg_detect_query_anomalies`, `pg_detect_bloat_risk`, `pg_detect_connection_spike`, and `pg_diagnose_database_performance`: all four used `InputBase.shape` (a plain object dict) instead of the full `z.object()` ZodObject as `inputSchema`, making parameters invisible to MCP client tool introspection
- Added missing `success: true` to all 24 performance group tool success responses across `explain.ts`, `monitoring.ts`, `catalog-stats.ts`, `optimization.ts`, `compare.ts`, `analysis.ts`, `diagnostics.ts`, `anomaly-detection.ts`, `connection-analysis.ts`, `query-stats.ts`, and `index-analysis.ts`


### Security
- Replaced raw Postgres exceptions with explicit `PostgresMcpError` classes to prevent SQL syntax leaks
- Enforced SLSA Build L3 compliance via `--provenance` in NPM publishing workflows
- Patched npm-bundled vulnerabilities in Dockerfile via manual `npm pack` replacements and exact-version `overrides`
