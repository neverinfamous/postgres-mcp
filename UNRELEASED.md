# Unreleased

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
- Optimized stats and admin tools to conditionally omit empty arrays (`rows`, `outliers`) from JSON responses to reduce context window token usage.
- Optimized Zod schema evaluation logic for faster execution speed.
- Applied `openWorldHint: false` to all 231 tools.
- Reduced NPM package size (-1.65 MB) by removing source maps and test directories.
- Refactored Vitest test suite to use SWC compilation.
- Updated npm dependencies (`@modelcontextprotocol/sdk`, `typescript`, `typescript-eslint`).
- Updated `.env.example` templates and README.

### Removed
- Obsolete shortcut action bundles (`META_GROUPS`).
- Unused `hono` router dependency.

### Fixed
- Migration rollback transaction isolation to prevent unmanaged auto-commits.
- Missing `success: true` properties and P154 error structures across all 230+ tools.
- Docker multi-arch image push pipeline to resolve concurrent blob sync errors (Issue #92).
- Schema state invalidation missing DDL regex detection to flush caches on state alteration.
- Code Mode evaluation bypass on `readonly: true`, `-32602` schema errors on empty inputs, and exposed `pg.backup` namespace aliases.
- Memory limit exhaustion by forcing default `limit` integer coercions on unbounded queries.
- Backup restoration ordering and sequence defects.
- Introspection cascade simulator truncating self-referencing foreign keys.
- Partman initialization routines failing on missing child tables.
- Scientific notation serialization bug in database seed script generating intervals.
- Resolved `numeric field overflow` PostgreSQL exceptions by mapping them to specific `CALCULATION_ERROR` error structures instead of returning raw proxy errors.
- Added 1000-character input validation constraints to `pg_append_insight` to prevent extreme query bloating in the `postgres://insights` resource limit.
- Inaccurate tool test instructions in `test-group-tools.md` requiring superfluous `column` parameters for window functions (`pg_stats_row_number`, `pg_stats_rank`).
- Standardized error codes for nonexistent columns and tables in `stats` tool group to rigidly match PostgreSQL syntax ('does not exist').
- Solved Zod validation refinement leak returning `-32602` schema errors by safely moving explicit ceiling boundaries (`n`, `limit`, `maxOutliers`) inside `stats` tool handlers while maintaining `coerceNumber` fallback resiliency.
- Split Schema violations in `admin` tools by moving 6 inline input schemas (`ReloadConfSchemaBase`, `SetConfigSchemaBase`, `ClusterSchemaBase`, etc.) from `config-tools.ts` into `schemas/admin.ts` and exporting them globally.

### Security
- Replaced raw postgres exceptions with explicit `PostgresMcpError` classes to prevent SQL syntax leaks.
- Enforced SLSA Build L3 compliance via `--provenance` in NPM publishing workflows.

