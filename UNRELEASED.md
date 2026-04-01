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

### Changed
- **BREAKING**: Core write tools now require `write` scope; destructive tools require `admin`
- Centralized default connection pool timeout to 30,000ms
- Expanded `PostgresMcpError` to track categories, suggestions, and serialization context
- Modularized source files and standardized file/directory names to kebab-case convention
- Minimized tool payload sizes overall (~30-41% token reduction) by collapsing repetitive properties and selectively omitting empty arrays/objects
- Added `compact` toggle (default: `true`) to schemas, audits, cron, citext, and kcache tools to significantly conserve token payloads
- Reduced default item limits across high-chatter tools (e.g., `pg_audit_list_backups`, `pg_stat_kcache`) to prevent context window bloat
- Applied `openWorldHint: false` to all tools
- Optimized payload efficiency in `pg_jsonb_agg` by structurally omitting the empty array result field to conserve tokens
- Standardized `count` response property unconditionally in table mode for `pg_jsonb_pretty` to maintain response schema integrity
- Reduced npm package size by excluding source maps and tests
- Refactored Vitest test suite to use SWC compilation
- Updated npm dependencies (`@modelcontextprotocol/sdk`, `typescript`, `typescript-eslint`)
- Updated `.env.example` templates and README context

### Removed
- Obsolete shortcut action bundles (`META_GROUPS`)
- Unused `hono` router dependency

### Fixed
- Missing `success: true` properties and standardized P154 error structures across all 230+ tools
- Migration rollback transaction isolation to prevent unmanaged auto-commits
- Schema state invalidation missing DDL regex detection
- Code Mode evaluation bypasses on readonly fields, schema errors, and exposed aliases
- Memory limit exhaustion by enforcing defaults on unbounded queries
- Backup restoration ordering and sequence defects
- Introspection cascade simulator truncating self-referencing foreign keys
- Partman initialization routines failing on missing child tables
- Metadata caching defects causing stale schema artifacts and Code Mode invalidation failures
- Inconsistent 'does not exist' error messaging, regex matching, and validation leaks across multiple tool groups
- Missing positional mappings for Introspection and Migration Code Mode aliases
- Transaction ID propagation gaps in `text` and `vector` tools
- Missing column headers and unbounded payloads in `pg_copy_export` empty table executions
- Internal boolean flags leaking into schema JSON response structures
- Schema drift false positives in `pg_audit_diff_backup` for primary keys and sequences
- Proper `hasDifferences` output resolution in backup audits extending to volume mutations
- Analytics volume drift silently dropping metrics for truncated tables
- Dry-run validation in `pg_audit_restore_backup` failing to bypass persistent table allocations
- Preserved numeric sequence suffixes during side-by-side data restorations
- Inaccurate `summary` statistics in `pg_cron_job_run_details` when limits were applied
- Inactive job failures in `pg_cron_unschedule` handled via `jobId` fallback lookups
- JavaScript string arithmetic bugs in transaction boundary tests
- Error category refinements in `PostgresMcpError` overriding generic instantiations
- Explicit warnings for zero rows affected in JSONB write operations
- Docker Hub rate-limit blocks during multi-arch image pipelines by enforcing authenticated pulls
- 'pg_jsonb_normalize' incorrectly requiring 'table' and 'column' parameters for standalone 'json' instances
- Handled native Error conversions to explicit `ValidationError` mappings preventing generic `QUERY_ERROR` fallbacks in JSONB operations

### Security
- Replaced raw postgres exceptions with explicit `PostgresMcpError` classes preventing SQL syntax leaks
- Replaced inline error returns across JSONB tools with structured `ValidationError` instances, preserving standard error output
- Enforced SLSA Build L3 compliance via `--provenance` in NPM publishing workflows
