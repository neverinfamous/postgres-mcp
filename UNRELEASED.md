# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Completed production-readiness certification for the `introspection` tool group via rigorous Code Mode advanced stress testing
- Certified 100% Code Mode parity for topological sorting, cascade simulation, schema snapshots, and migration risk analysis
- Completed production-readiness certification for the `citext` tool group via rigorous Code Mode advanced stress testing
- Validated P154-compliant structured error isolation handling across all `citext` operations
- Confirmed Split Schema compliance and parameter alias mapping in `pg_citext_*` tools
- Certified 100% Code Mode parity for citext comparison, candidate analysis, and column conversions
- Transport-agnostic Auth module supporting `SCOPE_PATTERNS`, `BASE_SCOPES`, and RFC 6750.
- Audit subsystem with session token estimates, JSONL logging, redaction, and `pg_audit_*` tools.
- Worker-thread Code Mode sandbox with resource limits and an RPC bridge.
- Configurable server timeouts (`MCP_REQUEST_TIMEOUT`, `MCP_HEADERS_TIMEOUT`) and DNS rebinding protection.
- 13 new statistics and admin tools including `pg_stats_row_number`, `pg_stats_outliers`, and `pg_append_insight`.
- `pg_jsonb_pretty` tool for JSON formatting.
- 22 group-specific help resources accessible via `postgres://help`.
- Playwright E2E test coverage for Code Mode, authentication, and backups.
- Parameter extensions and aliases across core tools to improve query flexibility (e.g., `toType`, `name`/`indexName`, `read_only`).
- Filter-aware instruction generation based on tool filters and verbosity levels.

### Changed
- **BREAKING**: Core write tools now require `write` scope; destructive tools require `admin`.
- Optimized token payload sizes (~30–41% reduction) via compact toggles, array collapsing, and bounds limits on high-chatter tools.
- Modularized source files to strict kebab-case convention.
- Centralized default connection pool timeout to 30,000ms.
- Applied `openWorldHint: false` to all tools.
- Reduced npm package size by excluding test and source map artifacts.
- Refactored Vitest test suite to use SWC compilation.
- Refactored cross-tool validation helpers to throw standardized `ValidationError`s.
- Updated `POSTGRES_MCP_INSTRUCTIONS` (`performance.md`, `postgis.md`) to reflect bounded limits and payload optimization.
- **Dependency Updates**: Updated `eslint`, `@types/node`, `@modelcontextprotocol/sdk`, `@playwright/test`, `typescript`, `typescript-eslint`, and patched `hono`.

### Removed
- Obsolete shortcut action bundles (`META_GROUPS`).
- Unused `hono` router dependency.
- Duplicate and stale validation logic across performance handlers.

### Fixed
- Standardized P154 error structures (`success: false` paired with explicit `ValidationError`s) and pre-checks across 230+ tools.
- Normalized systemic anomalies into standard payloads (e.g., `42P01` "relation does not exist", `42501` auth bounds errors).
- Validated standardized `success: true` responses across Performance, Transactions, and Stats groups.
- Resolved Split Schema Pattern violations in `pg_hybrid_search`, JSONB, Vector, Citext, and Performance by exposing base types.
- Fixed Zod validation handling, eliminating silent failures and framework refine leaks in vector and transaction tools.
- Resolved Code Mode validation bypassing for alias/readonly parameters and isolated evaluation state discrepancies.
- Corrected migration rollback behavior to prevent unmanaged auto-commits.
- Fixed timing defects in admin tools that logged progress before failing validation.
- Handled Partman routines executing gracefully on missing child tables or lacking extensions.
- Remediated cascade simulators incorrectly truncating self-referencing foreign keys.
- Bypassed Docker Hub rate-limit blocks by enforcing explicit authenticated pulls in CI.
- Certified Admin tools group Code Mode execution and error framework compliance.
- Certified Backup tools group for full Code Mode audit interceptor compliance, structure integrity, and payload limiting.
- Certified deep cross-group functional pipelines (Core → Vector → JSONB → Stats).

### Security
- Resolved prototype pollution vulnerabilities via `hono` and exact-version overrides.
- Replaced raw Postgres exceptions with `PostgresMcpError` classes globally to prevent SQL syntax leaks.
- Enforced SLSA Build L3 compliance via `--provenance` in NPM publishing workflows.
- Patched npm-bundled vulnerabilities in Docker builds using explicit `npm pack` replacements.
