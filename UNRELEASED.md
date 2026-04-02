# Changelog

All notable changes to this project will be documented in this file.
This project adheres to [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

#### Added

- Transport-agnostic Auth module (`src/auth/transport-agnostic.ts`)
- OAuth enhancements supporting `SCOPE_PATTERNS`, `BASE_SCOPES`, and RFC 6750
- Audit subsystem with session token estimates, JSONL logging, redaction, and `pg_audit_*` tools
- Worker-thread Code Mode sandbox with resource limits and an RPC bridge
- Configurable server timeouts (`MCP_REQUEST_TIMEOUT`, `MCP_HEADERS_TIMEOUT`) for Slowloris DoS protection
- DNS rebinding protection via `validateHostHeader()`
- Rate limiting bypass for `/health` and `Retry-After` header propagation
- 13 new statistics and admin tools including `pg_stats_row_number`, `pg_stats_outliers`, and `pg_append_insight`
- `pg_jsonb_pretty` tool for JSON formatting
- Filter-aware instruction generation based on tool filters and verbosity levels
- 22 group-specific help resources accessible via `postgres://help`
- Playwright E2E coverage for Code Mode, authentication, and backups
- `toType` parameter in `pg_citext_convert_column` for pure `text` type conversions
- Parallel array parameters (`keys`, `values`) in `pg_jsonb_object`
- `indexName` and `name` alias parameters in `pg_vector_create_index`
- `value` alias parameter in `pg_jsonb_pretty` for ergonomic harmony with builder tools

### Changed

- **BREAKING**: Core write tools now require `write` scope; destructive tools require `admin`
- Centralized default connection pool timeout to 30,000ms
- Expanded `PostgresMcpError` to track categories, suggestions, and serialization context
- Modularized source files and standardized file/directory names to kebab-case convention
- Minimized tool payload sizes overall (~30–41% token reduction) by selectively collapsing repetitive arrays and outputs (e.g., `ltree`, `jsonb`, `citext`)
- Added `compact` toggle (default: `true`) to schemas, audits, cron, citext, and kcache tools to conserve token payloads
- Reduced default item limits across high-chatter tools (e.g., `pg_audit_list_backups`, `pg_stat_kcache`) to prevent context window bloat
- Applied `openWorldHint: false` to all tools
- Standardized `count` response unconditionally in table mode for `pg_jsonb_pretty`
- Reduced npm package size by excluding source maps and tests
- Refactored Vitest test suite to use SWC compilation
- Harmonized test prompt architecture: split monolithic Code Mode tests, injected Structured Error boilerplates, and certified operational parity across all Core, JSONB, Vector, ltree, kcache, and migration tools
- Updated npm dependencies (`@modelcontextprotocol/sdk`, `@playwright/test`, `typescript`, `typescript-eslint`)

### Removed

- Obsolete shortcut action bundles (`META_GROUPS`)
- Unused `hono` router dependency

### Fixed

- Standardized `success: true` properties and P154 error structures across all 230+ tools, replacing inline `{success: false}` fallbacks with explicit `ValidationError` instances
- Prevented token payload bloat by enforcing explicit validations, `.max()` caps, and strict truncation bounds on high-volume inputs/outputs (`limit`, `n`, `pg_vector_search`, `pg_jsonb_normalize`, Code Mode `sanitizeResult`)
- Fixed Split Schema Pattern violations across `pg_hybrid_search`, `pg_jsonb_merge`, `pg_jsonb_normalize`, `pg_vector_create_index`, and `pg_citext_create_extension` by adding correct schema definitions and alias support
- Established serialization parity for standard arrays to Postgres vector conversions via Code Mode `pg_upsert` by bridging array parameters through JSON encoder
- Resolved Zod validation handling and eliminated framework refine leaks in vector tools (e.g., `pg_vector_batch_insert`, `pg_vector_create_extension`, `pg_vector_dimension_reduce`)
- Restructured malformed error strings across Vector tools to ensure proper object fields and zero-suppression
- Repaired migration rollback transaction isolation to prevent unmanaged auto-commits
- Fixed schema state invalidation missing DDL regex detection
- Adjusted Code Mode evaluation bypasses for readonly fields, schema errors, and exposed aliases
- Fixed backup restoration ordering and sequence defects, including dry-run validation failures and schema drift false positives
- Remediated introspection cascade simulator truncating self-referencing foreign keys
- Handled Partman initialization routines failing on missing child tables
- Patched metadata caching defects causing stale schema artifacts and Code Mode invalidation failures
- Resolved inconsistent 'does not exist' error messaging, regex matching, and validation leaks
- Added missing positional mappings for Introspection and Migration Code Mode aliases
- Fixed transaction ID propagation gaps in `text` and `vector` tools
- Added missing column headers and capped unbounded payloads in `pg_copy_export` empty table executions
- Removed internal boolean flags leaking into schema JSON response structures
- Extended `hasDifferences` output resolution in backup audits to volume mutations
- Fixed analytics volume drift silently dropping metrics for truncated tables
- Corrected inaccurate `summary` statistics in `pg_cron_job_run_details` when limits were applied
- Mapped raw schema/relation errors to structured `EXTENSION_MISSING` and `JOB_NOT_FOUND` codes in `pg_cron` tools
- Resolved JavaScript string arithmetic bugs in transaction boundary tests
- Bypassed Docker Hub rate-limit blocks during multi-arch image pipelines by enforcing authenticated pulls
- Standardized parameter requirements in `pg_jsonb_normalize`, `pg_jsonb_typeof`, `pg_jsonb_keys`, and `pg_jsonb_path_query` to allow standalone `json` instances
- Mapped `pg_drop_schema` native Postgres dependency errors to structured validation errors
- Corrected timing defects in admin vacuum/analyze tools causing progress logging before validation failures
- Fixed schema documentation for `pg_audit_list_backups` limit defaults
- Fixed dot-splitting parser in `citext` schemas failing on regex-heavy identifier names
- Enlarged `pg_reindex` valid `target` scope to correctly permit the `system` keyword
- Structured error handling for absent indexes in `pg_cluster` commands
- Applied parenthesized syntax with `skipLocked`, `truncate`, and `verbose` support to `VACUUM` and `ANALYZE` tools
- Enforced asynchronous flush synchronization within `postgres://audit` resource to eliminate millisecond-precision timing flakes in E2E tests
- Mapped raw Postgres configuration errors to structured `VALIDATION_ERROR` responses for invalid parameters in `pg_set_config`
- Updated `pg_citext_compare` input validation to natively accept empty strings internally
- Patched idempotency gaps in `pg_vector_create_index` for `ifNotExists: true` on pre-existing indexes
- Corrected `JsonbIndexSuggestOutputSchema` mismatch in `pg_jsonb_index_suggest` where fields were incorrectly nested
- Replaced Postgres `\b` word boundary regex with native `\y` matching in `pg_jsonb_security_scan` to prevent SQL injection regressions
- Supported raw JSON string literal validation across JSONB tools by enforcing explicit JSON parsing inside `toJsonString`
- Adjusted `pg_jsonb_validate_path` to return structured `ValidationError` with `$`-prefix hint for invalid expressions instead of `{success: true, valid: false}`
- Required at least one entry via `data`, `object`, or `pairs` in `pg_jsonb_object` instead of silently returning empty objects
- Fixed `pg_jsonb_object` incorrectly escaping parallel arrays via Code Mode by updating `OBJECT_WRAP_MAP` skip keys

### Security

- Replaced raw postgres exceptions with explicit `PostgresMcpError` classes preventing SQL syntax leaks
- Replaced inline error returns across JSONB tools with structured `ValidationError` instances preserving standard error output
- Enforced SLSA Build L3 compliance via `--provenance` in NPM publishing workflows
- Patched npm-bundled vulnerabilities in Dockerfile: GHSA-73rr-hh4g-fpgx (`diff@8.0.4`), CVE-2026-25547 (`@isaacs/brace-expansion@5.0.1`), CVE-2026-23950/CVE-2026-24842 (`tar@7.5.13`), and CVE-2026-27904/CVE-2026-27903 (`minimatch@10.2.5`) via manual `npm pack` replacements and exact-version `overrides` in `package.json`

