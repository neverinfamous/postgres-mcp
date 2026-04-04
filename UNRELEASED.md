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
- `pg_jsonb_pretty` tool for JSON formatting
- Filter-aware instruction generation based on tool filters and verbosity levels
- 22 group-specific help resources accessible via `postgres://help`
- Playwright E2E coverage for Code Mode, authentication, and backups
- Utility parameter extensions for tool completeness: `toType` in `pg_citext_convert_column`, parallel arrays in `pg_jsonb_object`
- Parameter aliases for query flexibility: `indexName`/`name` in `pg_vector_create_index`, `pattern`/`table`/`name` in `pg_table_sizes`, `like` in `pg_show_settings`, `value` in `pg_jsonb_pretty`, and `sqlA`/`sqlB` in `pg_query_plan_compare`
- `read_only` parameter explicitly supported in `pg_transaction_begin` and `pg_transaction_execute` to securely initialize isolated non-mutating blocks natively

### Changed
- **Dependency Updates**: Updated `eslint` to 10.2.0, `@types/node` to 25.5.2, and patched `hono` to 4.12.10.
- **BREAKING**: Core write tools now require `write` scope; destructive tools require `admin`
- Centralized default connection pool timeout to 30,000ms
- Expanded `PostgresMcpError` to track categories, suggestions, and serialization context
- Modularized source files and standardized file/directory names to kebab-case convention
- Optimized token payload sizes (~30–41% reduction) via `compact` toggles, array collapsing, and reduced default limits on high chatter tools
- Applied `openWorldHint: false` to all tools
- Standardized `count` response unconditionally in table mode for `pg_jsonb_pretty`
- Reduced npm package size by excluding source maps and tests
- Refactored Vitest test suite to use SWC compilation
- Harmonized test prompt architecture and certified operational parity across all tool groups
- Refactored cross-tool validation helpers (e.g., `validatePerformanceTableExists`) to throw standardized `ValidationError`s
- Updated server instructions (`performance.md`, `postgis.md`) to reflect bounded parameter limits, extension requirements, and payload optimization
- Updated npm dependencies (`@modelcontextprotocol/sdk`, `@playwright/test`, `typescript`, `typescript-eslint`)

### Removed
- Obsolete shortcut action bundles (`META_GROUPS`)
- Unused `hono` router dependency
- Duplicate or stale validation logic implementations across performance handlers

### Fixed
- Standardized P154 error structures (`success: false` paired with explicit `ValidationError` subclasses) and implemented consistent schema-existence pre-checks across 230+ tools
- Globally normalized "relation does not exist" (`42P01`) exceptions into canonical schema-aware P154 formats
- Enforced strict payload bounds (`limit`, `n`, `sanitizeResult`) on unbounded system tools (`pg_locks`, `pg_stat_activity`, `pg_stat_statements`, `pg_show_settings`) to prevent token depletion
- Resolved Split Schema Pattern violations across `pg_hybrid_search`, JSONB, Vector, Citext, and Performance tools by refactoring `inputSchema` to expose base parameter types securely
- Standardized success responses by prepending `success: true` to outputs across `pg_capacity_planning` and all 24 Performance Group utility tools
- Appended missing `success: true` properties to Transaction and Stats group utility tools (`pg_transaction_begin`, `pg_transaction_status`, `pg_stats_descriptive`, `pg_stats_percentiles`)
- Repaired serialization parity for array-to-vector conversions via Code Mode `pg_upsert`
- Fixed Zod validation handling and eliminated framework refine leaks in vector tools
- Corrected migration rollback transaction isolation to prevent unmanaged auto-commits
- Fixed schema state invalidation missing DDL regex detection
- Adjusted Code Mode evaluation bypasses for readonly fields, schema errors, and exposed aliases
- Resolved backup restoration ordering, sequence defects, and schema drift false positives
- Remediated introspection cascade simulator truncating self-referencing foreign keys
- Handled Partman initialization routines failing on missing child tables and reporting extension absences gracefully
- Patched caching defects causing stale schema artifacts and Code Mode invalidation failures
- Bypassed Docker Hub rate-limit blocks during multi-arch image pipelines by enforcing authenticated pulls
- Standardized parameter constraints in `pg_jsonb_normalize`, `pg_jsonb_typeof`, `pg_jsonb_keys`, and `pg_jsonb_path_query`
- Fixed timing defects in admin vacuum/analyze tools displaying progress logging before validation failures
- Updated `pg_citext_compare` and `pg_alert_threshold_set` input validation to accept explicit empty strings or strict coercions appropriately
- Resolved idempotency gaps in `pg_vector_create_index` (`ifNotExists`) and `pg_postgis_create_extension`
- Corrected JSONB operations that failed to execute raw literal bindings or improperly escaped Code Mode inputs
- Ensured Zod alias mapping for `readOnly` to `read_only` in transactions schemas to prevent undefined stripping causing silent mutating vulnerabilities
- Restricted parameters such as EPS and MinPoints in PostGIS clustering to prevent raw geometry failures
- Replaced silent return clamping in connection analysis and anomaly detection with explicit validation errors
- Mapped Postgres authorization bounds error (`42501`) gracefully to structured error payloads
- Re-seeded missing `test_locations.location` column setups in database teardown tests to fix cascade side-effects

### Security
- Resolved Dependabot prototype pollution alerts via `hono` exact-version override bump
- Replaced raw Postgres exceptions with explicit `PostgresMcpError` classes to prevent SQL syntax leaks
- Enforced SLSA Build L3 compliance via `--provenance` in NPM publishing workflows
- Patched npm-bundled vulnerabilities in Dockerfile via manual `npm pack` replacements and exact-version `overrides`
