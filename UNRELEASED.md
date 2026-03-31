## [Unreleased]

### Added
- Transport-agnostic Auth module (`src/auth/transport-agnostic.ts`).
- OAuth enhancements supporting `SCOPE_PATTERNS`, `BASE_SCOPES`, and RFC 6750.
- Audit subsystem with session token estimates, JSONL logging, redaction, and new tools (`pg_audit_list_backups`, `pg_audit_restore_backup`, `pg_audit_diff_backup`).
- Worker-thread Code Mode sandbox (`node:worker_threads`) with resource limits and an RPC bridge.
- Configurable server timeouts (`MCP_REQUEST_TIMEOUT`, `MCP_HEADERS_TIMEOUT`) for Slowloris DoS protection.
- DNS rebinding protection via `validateHostHeader()`.
- Rate limiting `/health` bypass and `Retry-After` header propagation.
- 13 new statistics and admin tools including `pg_stats_row_number`, `pg_stats_outliers`, and `pg_append_insight`.
- `pg_jsonb_pretty` tool for JSON formatting.
- Filter-aware instruction generation based on tool filters and verbosity levels.
- 22 group-specific help resources accessible via `postgres://help`.
- Playwright E2E coverage for Code Mode, authentication, and backups.

### Changed
- **BREAKING**: Core write tools now require `write` scope; destructive tools require `admin`.
- Expanded `PostgresMcpError` to track categories, suggestions, and serialization context.
- Centralized default connection pool timeout to 30,000ms.
- Standardized file and directory names to kebab-case convention.
- Modularized 20+ large files (>500 lines) into smaller components.
- Minimized tool payload size (~30-41% token reduction) by collapsing repetitive properties.
- Optimized stats and admin tool responses to conditionally omit empty arrays, reducing token usage.
- `pg_schema_snapshot` now defaults to `compact: true` to significantly reduce payload footprint by omitting verbose column definitions.
- Optimized Zod schema evaluation logic for faster execution speed.
- Applied `openWorldHint: false` to all 231 tools.
- Reduced npm package size (-1.65 MB) by excluding source maps and tests.
- Refactored Vitest test suite to use SWC compilation.
- Updated npm dependencies (`@modelcontextprotocol/sdk`, `typescript`, `typescript-eslint`).
- Updated `.env.example` templates and README.

### Removed
- Obsolete shortcut action bundles (`META_GROUPS`).
- Unused `hono` router dependency.

### Fixed
- Migration rollback transaction isolation to prevent unmanaged auto-commits.
- Missing `success: true` properties and P154 error structures across all 230+ tools.
- Docker Hub `toomanyrequests` rate-limit blocks during multi-arch image CI/CD pipelines by enforcing authenticated pulls for security scanning.
- Schema state invalidation missing DDL regex detection to flush caches on state alteration.
- Code Mode evaluation bypass on `readonly: true`, `-32602` schema errors on empty inputs, and exposed `pg.backup` namespace aliases.
- Memory limit exhaustion by forcing default `limit` integer coercions on unbounded queries.
- Backup restoration ordering and sequence defects.
- Introspection cascade simulator truncating self-referencing foreign keys.
- Partman initialization routines failing on missing child tables.
- Scientific notation serialization bug in database seed script generating intervals.
- `numeric field overflow` PostgreSQL exceptions mapping to raw proxy errors instead of `CALCULATION_ERROR` structures.
- Missing input validation bounds on `pg_append_insight` preventing extreme query bloating.
- Inaccurate tool test instructions in `test-group-tools.md` requiring superfluous parameters.
- Inconsistent 'does not exist' error messaging for missing columns and tables in `stats` tools.
- Zod validation refinement leak returning `-32602` schema errors instead of handler exceptions in `stats` tools.
- Split Schema violations in `admin` tools by extracting inline schemas to centralized files.
- Ad-hoc validation logic bypassing `formatHandlerErrorResponse` formatting in `admin` tools (`pg_analyze`, `pg_reindex`, `pg_cluster`).
- Empty array rendering in `pg_schema_snapshot` payload preventing optimized token footprints.
- Insufficient validation constraints on `pg_text_sentiment` permitting empty analysis payloads.
- Missing positional mappings for Introspection and Migration Code Mode tool aliases preventing shorthand property resolution.
- Transaction ID propagation gaps in `text` and `vector` tools, ensuring full isolation compliance within Code Mode sandboxes.
- P154 validation omissions in `pg_text_search` and `pg_create_fts_index` causing unhandled database exceptions on invalid columns rather than structured errors.
- Missing error parser mapping for `invalid input syntax for type` resulting in generic `QUERY_ERROR` instead of `VALIDATION_ERROR`.
- Corrected Javascript string arithmetic bugs in transaction boundary tests (`test-tools-advanced-1.md`) when validating row counts.
- `compact` internal boolean flag leaking into `pg_schema_snapshot` JSON response structures.
- Inaccurate parameter references (`vectorA` to `vector1`) within advanced stress testing documentation.
- Corrected `pg_stats_regression` parameter names in `test-tools-advanced-1.md` (`columnX`/`columnY` → `xColumn`/`yColumn`).
- Fixed `pg_ltree_lca` constraint requiring 2 paths; now properly handles single paths and identical common ancestors mirroring native Postgres functionality.

### Security
- Replaced raw postgres exceptions with explicit `PostgresMcpError` classes to prevent SQL syntax leaks.
- Enforced SLSA Build L3 compliance via `--provenance` in NPM publishing workflows.
