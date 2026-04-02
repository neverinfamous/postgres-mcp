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
- `keys` and `values` parallel array parameters in `pg_jsonb_object`, enabling `{ keys: ["a","b"], values: [1,2] }` as an alternative to `{ data: {a:1, b:2} }`; mismatched array lengths produce a clear `ValidationError`
- `indexName` and `name` alias parameters in `pg_vector_create_index` allowing callers to specify a custom index name instead of the auto-generated `idx_{table}_{column}_{type}` default

### Changed

- Harmonized test prompt architecture: split 6 monolithic Advanced Code Mode tests into part 1/2 pairings, injected missing Structured Error verification boilerplates into all 28 advanced files, and remediated cross-group testing logic loops

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
- Updated npm dependencies (`@modelcontextprotocol/sdk`, `@playwright/test`, `typescript`, `typescript-eslint`)

### Removed

- Obsolete shortcut action bundles (`META_GROUPS`)
- Unused `hono` router dependency

### Fixed

- Standardized `success: true` properties and P154 error structures across all 230+ tools; replaced inline `{success: false}` fallbacks and generic `QUERY_ERROR` returns with explicit `ValidationError` instances
- Remediated Split Schema Pattern violation in `pg_citext_create_extension` by adding `CitextCreateExtensionSchema` to intercept optional schema definitions and block missing properties from reaching framework boundaries
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
- `pg_cron_unschedule` inactive-job failures mapped to `JOB_NOT_FOUND` via `jobId` fallback; `pg_cron` listing and cleanup tools now safely invoke unbounded behavior when passed `limit: 0`, enforce strict Zod evaluation across all optional integers to avoid silent payload reductions, and `pg_cron_alter_job` resolves native missing `jobName` aliases via internal lookups
- Mapped raw schema and relation errors to structured `EXTENSION_MISSING` code in `pg_cron` tools when the extension is absent
- JavaScript string arithmetic bugs in transaction boundary tests
- Docker Hub rate-limit blocks during multi-arch image pipelines by enforcing authenticated pulls
- `pg_jsonb_normalize`, `pg_jsonb_typeof`, `pg_jsonb_keys`, and `pg_jsonb_path_query` incorrectly requiring `table` and `column` parameters for standalone `json` instances
- `pg_drop_schema` native Postgres dependency errors re-thrown as structured validation errors
- Timing defects in admin vacuum/analyze tools causing progress logging before validation failures
- Incorrect schema documentation for `pg_audit_list_backups` limit defaults
- Dot-splitting parser in `citext` schemas failing on regex-heavy identifier names
- `pg_reindex` valid `target` scope enlarged to correctly permit the `system` keyword
- Structured error handling for absent indexes in `pg_cluster` commands through mapped contexts
- `VACUUM` and `ANALYZE` tool executions translated to parenthesized syntax with `skipLocked`, `truncate`, and `verbose` support
- Asynchronous flush synchronization enforced within `postgres://audit` resource to eliminate millisecond-precision timing flakes in E2E tests
- Mapped raw Postgres configuration errors to structured `VALIDATION_ERROR` responses for invalid parameters in `pg_set_config`
- Updated `pg_citext_compare` input validation to natively accept empty strings internally without throwing `VALIDATION_ERROR`s when executing case-insensitive comparisons
- Fixed Split Schema Violations in `pg_hybrid_search` where parameter aliases (`queryVector`, `queryText`) were ignored due to missing schema declarations
- Remediated high-volume MCP payload bloat in `pg_vector_search` ensuring vectors returned in results are safely parsed and truncated
- Hardened boundary conditions in `pg_vector_distance` and `pg_vector_normalize` by catching empty payloads and returning structured validation errors
- Resolved Zod validation handling in `pg_vector_batch_insert` ensuring malformed vector arrays return standard MCP `success: false` schema instead of leaking Zod exceptions
- Patched idempotency gaps in `pg_vector_create_index` enabling safe resolution when `ifNotExists: true` is triggered on pre-existing indexes
- Restored missing alias support for `ef_construction` in `pg_vector_create_index`, remediating a Split Schema Pattern violation
- Enforced strict Zod schema parsing in `pg_vector_create_extension` to close parameter validation leaks
- Fixed `JsonbIndexSuggestOutputSchema` mismatch in `pg_jsonb_index_suggest` where `keyDistribution` and `existingIndexes` fields were incorrectly nested under `analyzed` rather than matching the root-level emission of the handler
- Certified Code Mode parity across all 20 Core tools, confirming correct schema propagation for boundary testing, nonexistent variables, alias mapping, and `limit: 0` query resolution
- Fixed Split Schema Violations in `pg_jsonb_merge` and `pg_jsonb_normalize` by correctly evaluating stringified JSON schemas and nested base parameters
- Replaced Postgres `\b` word boundary regex with native `\y` matching in `pg_jsonb_security_scan` to prevent SQL Injection payload regressions
- Certified Code Mode parity across JSONB tools (Part 1 & 2), confirming deep nesting resolution, unbounded array deletion scoping, cross-tool consistency tests, array/object native equivalence for inserts, and literal document evaluation for merge operations
- Enforced strict truncation bounds and `truncated` limit flags across `pg_jsonb_normalize` to safely process massive multi-row JSON arrays and objects without excessive payload bloat
- Certified Code Mode parity across Vector tools (Part 1), confirming strict Zod validation against mismatched array dimensions, zero-suppression for P154 object existence errors, and comprehensive structural parity against boundary conditions
- Fixed malformed error string literal in `pg_vector_cluster` where the `isNaN` handler path embedded the `code` and `category` fields as raw text inside the error message string; restructured as proper separate object fields and extended the guard to `!Number.isFinite(k)` to also reject `Infinity`/`-Infinity` with a clear structured error
- Fixed unstructured Error leak in `pg_vector_dimension_reduce` by wrapping domain errors with proper `VALIDATION_ERROR` codes
- Eliminated Zod framework refine leak in `VectorCreateIndexSchema` by extracting inline validation to handler-side
- Added missing `column` and `col` aliases for vector-column mappings in `pg_hybrid_search` complying with standard Vector group API patterns
- Supported raw JSON string literal validation across JSONB tools by enforcing explicit JSON parsing inside `toJsonString`, preventing double-encoding of primitive representations, and intercepting maliciously formatted literals with structured ValidationError codes
- Fixed `pg_jsonb_validate_path` incorrectly returning `{success: true, valid: false}` for syntactically invalid JSONPath expressions; now returns `{success: false}` via `formatHandlerErrorResponse` wrapping a `ValidationError` with a helpful `$`-prefix hint
- Fixed `pg_jsonb_object` silently returning `{success: true, object: {}}` when called with no key-value pairs; now raises a `ValidationError` requiring at least one entry via `data`, `object`, or `pairs`
- Added `value` as an alias for the `json` parameter in `pg_jsonb_pretty`, harmonizing ergonomics with other builder tools that accept `value` as a content parameter
- Updated unit test `pg_jsonb_validate_path > should return invalid for bad path` to assert `success: false` and a `VALIDATION_ERROR`-scoped message; removed stale assertions for the old `{success: true, valid: false}` response shape
- Fixed `pg_jsonb_object` incorrectly escaping parallel arrays via Code Mode into `{data: {keys: [], values: []}}` due to `OBJECT_WRAP_MAP` ignoring `"keys"` and `"values"` in its `skipKeys` array; added keys ensuring parallel shapes map to PostgreSQL parameters correctly
### Security

- Replaced raw postgres exceptions with explicit `PostgresMcpError` classes preventing SQL syntax leaks
- Replaced inline error returns across JSONB tools with structured `ValidationError` instances preserving standard error output
- Enforced SLSA Build L3 compliance via `--provenance` in NPM publishing workflows
- Patched npm-bundled vulnerabilities in Dockerfile: GHSA-73rr-hh4g-fpgx (`diff@8.0.4`), CVE-2026-25547 (`@isaacs/brace-expansion@5.0.1`), CVE-2026-23950/CVE-2026-24842 (`tar@7.5.13`), and CVE-2026-27904/CVE-2026-27903 (`minimatch@10.2.5`) via manual `npm pack` replacements and exact-version `overrides` in `package.json`

