# Changelog

All notable changes to this project will be documented in this file.
This project adheres to [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

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
- Updated npm dependencies (`@modelcontextprotocol/sdk`, `typescript`, `typescript-eslint`)

### Removed

- Obsolete shortcut action bundles (`META_GROUPS`)
- Unused `hono` router dependency

### Fixed

- Standardized `success: true` properties and P154 error structures across all 230+ tools; replaced inline `{success: false}` fallbacks and generic `QUERY_ERROR` returns with explicit `ValidationError` instances
- Enforced explicit `ValidationError` rejections on `limit` and `n` parameters to prevent silent clamping and unbounded token payload bloat; applied hard `.max()` caps in window statistics, grouped time-series, distinct/frequency analysis, advanced statistical queries, and `pg_append_insight` payloads
- Migration rollback transaction isolation to prevent unmanaged auto-commits
- Schema state invalidation missing DDL regex detection
- Code Mode evaluation bypasses on readonly fields, schema errors, and exposed aliases
- Memory limit exhaustion by enforcing defaults on unbounded queries
- Backup restoration ordering and sequence defects
- Introspection cascade simulator truncating self-referencing foreign keys
- Partman initialization routines failing on missing child tables
- Metadata caching defects causing stale schema artifacts and Code Mode invalidation failures
- Inconsistent 'does not exist' error messaging, regex matching, and validation leaks
- Missing positional mappings for Introspection and Migration Code Mode aliases
- Transaction ID propagation gaps in `text` and `vector` tools
- Missing column headers and unbounded payloads in `pg_copy_export` empty table executions
- Internal boolean flags leaking into schema JSON response structures
- Schema drift false positives in `pg_audit_diff_backup` for primary keys and sequences
- `hasDifferences` output resolution in backup audits extended to volume mutations
- Analytics volume drift silently dropping metrics for truncated tables
- Dry-run validation in `pg_audit_restore_backup` failing to bypass persistent table allocations
- Numeric sequence suffixes preserved during side-by-side data restorations
- Inaccurate `summary` statistics in `pg_cron_job_run_details` when limits were applied
- `pg_cron_unschedule` inactive-job failures mapped to `JOB_NOT_FOUND` via `jobId` fallback; `pg_cron` listing routines now reject `limit: 0` with a `ValidationError`
- Mapped raw schema and relation errors to structured `EXTENSION_MISSING` code in `pg_cron` tools when the extension is absent
- JavaScript string arithmetic bugs in transaction boundary tests
- Docker Hub rate-limit blocks during multi-arch image pipelines by enforcing authenticated pulls
- `pg_jsonb_normalize` incorrectly requiring `table` and `column` parameters for standalone `json` instances
- `pg_drop_schema` native Postgres dependency errors re-thrown as structured validation errors
- Timing defects in admin vacuum/analyze tools causing progress logging before validation failures
- Incorrect schema documentation for `pg_audit_list_backups` limit defaults
- Dot-splitting parser in `citext` schemas failing on regex-heavy identifier names
- `pg_reindex` valid `target` scope enlarged to correctly permit the `system` keyword
- Structured error handling for absent indexes in `pg_cluster` commands through mapped contexts
- `VACUUM` and `ANALYZE` tool executions translated to parenthesized syntax with `skipLocked`, `truncate`, and `verbose` support
- Asynchronous flush synchronization enforced within `postgres://audit` resource to eliminate millisecond-precision timing flakes in E2E tests

### Security

- Replaced raw postgres exceptions with explicit `PostgresMcpError` classes preventing SQL syntax leaks
- Replaced inline error returns across JSONB tools with structured `ValidationError` instances preserving standard error output
- Enforced SLSA Build L3 compliance via `--provenance` in NPM publishing workflows
