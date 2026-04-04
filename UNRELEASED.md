# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Worker-thread Code Mode sandbox with resource limits, RPC bridge, and configurable timeouts (`MCP_REQUEST_TIMEOUT`, `MCP_HEADERS_TIMEOUT`).
- Transport-agnostic Auth module supporting `SCOPE_PATTERNS`, `BASE_SCOPES`, and RFC 6750.
- Audit subsystem with session token estimates, JSONL logging, redaction, and `pg_audit_*` tools.
- 13 new statistics and admin tools including `pg_stats_row_number`, `pg_stats_outliers`, and `pg_append_insight`.
- `pg_jsonb_pretty` tool for JSON formatting.
- 22 group-specific help resources accessible via `postgres://help`.
- Playwright E2E test coverage for Code Mode, authentication, and backups.
- Parameter extensions and aliases across core tools to improve query flexibility (e.g., `toType`, `name`/`indexName`, `read_only`).
- Extensive documentation including an agent-optimized `README.md`, server overview, and Code Mode cross-group integration gotchas.

### Changed
- **BREAKING**: Core write tools now require `write` scope; destructive tools require `admin`.
- Modularized source files applying strict kebab-case convention.
- Optimized token payload sizes (~30–41% reduction) via compact toggles, array collapsing, and bounds limits on high-chatter tools.
- Applied a 500-item hardcap payload threshold to `pg_table_stats`, `pg_index_stats`, and `pg_vacuum_stats`.
- Applied `openWorldHint: false` to all tools.
- Centralized default connection pool timeout to 30,000ms.
- Reduced npm package size by excluding test and source map artifacts.
- Refactored cross-tool validation helpers to throw standardized `ValidationError`s.
- Updated `POSTGRES_MCP_INSTRUCTIONS` references to reflect bounded limits, payload optimization, and correct geometry return schemas.
- Switched to SWC compilation for Vitest test suite.
- Updated dependencies (`eslint`, `@types/node`, `@modelcontextprotocol/sdk`, `@playwright/test`, `typescript`, `typescript-eslint`) and patched `hono`.

### Removed
- Obsolete shortcut action bundles (`META_GROUPS`).
- Unused `hono` router dependency.
- Duplicate and stale validation logic across performance handlers.

### Fixed
- Completed production-readiness certification across Core, Monitoring, Performance, Stats, Vector, Transactions, Text, Admin, Backup, Citext, and Cron tool groups (verified explicit payload boundaries, Zod compliance, and Code Mode execution).
- Standardized P154 error structures (`success: false` with explicit `ValidationError`s) across all 230+ tools.
- Normalized systemic anomalies into standard payloads (e.g., `42P01` "relation does not exist", `42501` auth bounds errors) preventing unformatted ad-hoc messages.
- Corrected `admin.md`, `backup.md`, and `citext.md` output schemas to properly reflect P154 handler fields, correct array wrappers (`snapshots`), and split schema alias mappings.
- Resolved Split Schema Pattern violations across `pg_hybrid_search`, JSONB, Vector, Citext, Performance, and Stats groups by exposing base types.
- Fixed SQL window functions (`row_number`, `rank`, `ntile`) properly casting index results as numeric values to prevent string leakage.
- Handled missing schema validation dynamically (e.g., `pg_detect_bloat_risk` returning empty datasets instead of throwing).
- Resolved Code Mode validation bypassing for alias/readonly parameters and native translation (`activeConnections`, `systemHealth`).
- Corrected migration rollback behavior to prevent unmanaged auto-commits.
- Fixed timing defects in admin tools that logged progress before failing validation.
- Handled Partman routines executing gracefully on missing child tables or extensions.
- Remediated cascade simulators incorrectly truncating self-referencing foreign keys.
- Corrected `pg_alert_threshold_set` parameter parsing to correctly ingest snake_case aliases.
- Handled missing try/catch blocks within monitoring tools.
- Bypassed Docker Hub rate-limit blocks by enforcing authenticated pulls in CI.

### Security
- Resolved prototype pollution vulnerabilities via `hono` and exact-version overrides.
- Replaced raw Postgres exceptions with `PostgresMcpError` classes globally to prevent SQL syntax leaks.
- Enforced SLSA Build L3 compliance via `--provenance` in NPM publishing workflows.
- Patched npm-bundled vulnerabilities in Docker builds using explicit `npm pack` replacements.
