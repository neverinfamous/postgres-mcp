# Unreleased

### Added

- **Transport-agnostic Auth**: Added `createAuthenticatedContext()`, `validateAuth()`, and scopes for transport independence in `src/auth/transport-agnostic.ts`.
- **OAuth enhancements**: Added `SCOPE_PATTERNS`, `BASE_SCOPES`, and RFC 6750 §3 `getWWWAuthenticateHeader()` compliant handling for `OAuthResourceServer`.
- **Audit subsystem**:
  - Session token estimates on audit entries and tool responses (`_meta.tokenEstimate`).
  - Opt-in read logging (`--audit-reads`) with size-based log rotation (`--audit-log-max-size`).
  - JSONL audit trail (`--audit-log`), redaction (`--audit-redact`), and backup snapshots (`--audit-backup`).
  - Three new backup management tools: `pg_audit_list_backups`, `pg_audit_restore_backup`, `pg_audit_diff_backup`.
  - Added Code Mode audit coverage (~2ms overhead), async gzip compression, and severity-tagged recommendations.
- **Worker-thread Code Mode**: Implemented V8 isolate sandbox (`src/codemode/worker-sandbox.ts`) using `node:worker_threads` with `ResourceLimits`, hard timeouts, and MessagePort RPC bridge.
- **Harmonized error types**: Introduced `types/error-types.ts` with `ErrorCategory` enum (9 categories) and canonical formatters for structured P154 error compliance.
- **Error auto-refinement**: Added `findSuggestion()` to refine generic codes into specific codes (e.g., `TABLE_NOT_FOUND`) via `REFINABLE_CODES`.
- **Server timeout protection**: Configured HTTP server keep-alive and headers timeouts to prevent slowloris-style DoS attacks.
- **DNS rebinding protection**: Added `validateHostHeader()` to validate `Host` headers against localhost addresses.
- **Rate-limit enhancements**: Added `/health` bypass for rate limiting with `Retry-After` headers and `MCP_RATE_LIMIT_MAX` environment fallback.
- **New Tools (13 total)**:
  - Stats — Window Functions (6): `pg_stats_row_number`, `pg_stats_rank`, `pg_stats_lag_lead`, `pg_stats_running_total`, `pg_stats_moving_avg`, `pg_stats_ntile`.
  - Stats — Outlier Detection (1): `pg_stats_outliers` (IQR and Z-score).
  - Stats — Advanced Analysis (4): `pg_stats_top_n`, `pg_stats_distinct`, `pg_stats_frequency`, `pg_stats_summary`.
  - Admin (1): `pg_append_insight` (in-memory memo via `postgres://insights` resource).
  - JSONB (1): `pg_jsonb_pretty` (dual-mode raw JSON or table column).
- **Filter-aware instruction generation**: `generateInstructions()` adapts to enabled tool groups and dynamically structures content based on `--instruction-level` (`essential`/`standard`/`full`).
- **Help resource architecture**: Swapped monolithic server instructions with 22 focused per-group `.md` files queried via the `postgres://help` interface.
- **Invariant test suites**: Added strict annotations testing tools enforcing mapping groups and correctly tracking output structures across all available functions natively.
- **E2E test suite expansion**: Added 18 new and ported Playwright spec files covering rate limits, OAuth, numeric coercion, code mode workflows, and backup subsystems. Added continuous drift detectors workflows.
- **Test helpers**: Introduced `getBaseURL()`, `callToolRaw()`, `expectHandlerError()`, `startServer()`, `stopServer()` to standard runtime workflows.

### Changed

- **Per-tool scope overrides (BREAKING)**: Core write tools now require `write` scope; destructive tools require `admin` scope. Backup read-only audit tools mapped securely to `read`.
- **`PostgresMcpError` enrichment**: Expanded base error class to track category, suggestion, recoverable flag, details, and serialization contexts cleanly.
- **`OAuthError` extensions**: Subclassed properly into `PostgresMcpError` establishing module prefixes. Deprecated raw `getWWWAuthenticateHeader()` static implements.
- **Default timeouts**: Connection pool timeout sets automatically to `30000` ms across all statement evaluations.
- **Code naming standardizations**: Processed 21 PascalCase source and test components renamed onto standard kebab-case structures natively modifying tracking references smoothly.
- **File modularization**: Sub-divided 20+ large files (>500 lines) within admin, citext, introspection, code mode adapters and core databases contexts cleanly.
- **Audit log performance**: Transformed `AuditLogger.recent()` into efficient 64KB positioned tail-reads directly preventing entire file loading sequences.
- **Core payload optimization**: Minimized payload volume dynamically (~30-41% token reduction) collapsing repeating representations (`primaryKey: false`, unneeded count arrays).
- **Zod schema optimizations**: Un-nested complex union arrays in `CreateTableSchema` speeding up evaluation contexts 10x. Hardened `inputSchema` schemas across parameter-less evaluations securely eliminating empty holes mappings.
- **System-wide input & output schemas**: Systematically eliminated loose `.any()` references mapping correctly typed structures natively removing implicit casting vectors. Extracted dynamic dotted name and formatting mapping safely. Removed unneeded nested Zod catching architectures safely.
- **`openWorldHint` defaults**: Appended `openWorldHint: false` constraints enforcing configurations onto 231 independent functions strictly limiting AI token context leakage organically.
- **Build footprint**: Slimmed published NPM packages by actively skipping source map generation (-1.65 MB reductions) and excluding test suites from the final distribution archive. Migrated Vitest to SWC compilation for significantly faster test pipeline executions.
- **Environment & documentation**: Overhauled default `.env.example` templates and synchronized README mappings to accurately describe Code Mode capabilities and token limits.

### Removed

- **Shortcut Action Bundles**: Discarded obsolete `META_GROUPS` macros (e.g., `starter`, `dba-monitor`); functionally eclipsed by Code Mode capabilities and direct `--tool-filter` operations organically.
- **Hono Router**: Removed unused routing library and dependent arrays smoothly.

### Fixed

- **Migration connection isolation**: Fixed `pg_migration_apply` and `pg_migration_rollback` so transaction state spans executing DDL scripts and internal tracking insertions on identically mapped connections, preventing unmanaged auto-commits. Implemented direct `invalidateSchemaCache` invocations immediately upon commit to synchronize schema introspection capabilities.
- **Migration error structuring**: Standardized `checkDuplicateHash` responses into fully compliant P154 Structured Error payloads (`code`, `category`, `recoverable`).
- **System-wide Split Schema and Output Validation hardening**: Applied comprehensive input parameter verification, strict Zod schemas, accurate numeric coercion, and missing `success: true` properties across all 230+ tools in 18 tool groups (cron, migration, partman, citext, etc.) to ensure determinism and compliance.
- **Docker Multi-Arch image pull bug (Issue #92)**: Fixed image pushing pipeline by transitioning to a two-stage CI process mapping manifest convergences properly, eliminating the concurrent blob sync race condition.
- **Schema state invalidation desync**: Added DDL regex detection in `executeWriteQuery()` to auto-flush index and stats caches natively when queries alter state.
- **Code Mode evaluation edge-cases**: Fixed `readonly: true` bypass inside direct script structures, resolved `-32602` Split Schema validation on empty inputs, surfaced tool titles dynamically missing from previous architectures, and auto-returned plain Javascript expressions (like `pg.help()`). Added missing `pg.backup` namespaces to Code Mode aliases.
- **Query limits & payload truncations**: Pushed universal `limit` coercions properly onto unbounded functions (stats summaries, indexes, vector searches) to prevent node process memory exhaustion.
- **Backup restoration defects**: Resolved `DROP TABLE` schema order omissions alongside `CREATE SEQUENCE IF NOT EXISTS` dependencies missing from snapshot state captures. Addressed formatting bugs incorrectly transforming PostgreSQL's `-1` `reltuples` definitions directly truncating exports safely.
- **Introspection cascading loops**: Stopped cascade simulator from incorrectly truncating self-referencing foreign keys. Rebalanced `DELETE` risk factors to `high` instead of `critical` for `RESTRICT` dependencies. Recursive payloads properly strip empty elements.
- **Partman initialization routines**: Intercepted missing child tables correctly gracefully returning successes on parameter ad-hoc errors interpreting missing bounds explicitly.
- **Error Parser accuracy**: Narrowed generic regex string patterns successfully preventing false positive triggers over text search capabilities.
- **Test Database Seed Flakiness**: Fixed scientific notation serialization bug in `(random() * X || ' days')::interval` inside `test-database.sql` and `test-resources.sql` by updating them to use native interval multiplication. This fully resolves intermittent row count failures for auto-generated `test_measurements` and `test_logs` tables.

### Security

- **P154 Structured Error Isolation**: Hard-remediated unmanaged `{success: false}` payloads across vector, pgcrypto, partman, and cron groups by migrating them to explicit `PostgresMcpError` instantiations. This proactively prevents raw PostgreSQL syntax exceptions from leaking to the LLM agent during edge-case input sequences.
- **Action Workflow SLSA Compliance**: Enforced `--provenance` identity requirements using `id-token: write` integrations inside the NPM publishing workflows to meet SLSA Build L3 standards. Enabled hard-fail thresholding on CI security gates via strict `--omit=dev` testing bounds.
