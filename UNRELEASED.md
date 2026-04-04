# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Agent-optimized local `README.md` to `src/constants/server-instructions` as a guardrail for autonomous editors.
- Code Mode cross-group integration gotchas to server instructions detailing limit overrides, native calculation mapping, and strict vector parameters.
- Server overview documentation covering Code Mode JavaScript sandbox capabilities and mapping of the 200+ specialized PostgreSQL tools.
- Explicit tool limitations (e.g. tsvector bounds, jsonb type strictness, abandoned transactions parsing overrides) and generalized result array truncation defaults to `gotchas.md`.
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
- Implemented a 500-item hardcap payload threshold to `pg_table_stats`, `pg_index_stats`, and `pg_vacuum_stats`.
- Optimized token payload sizes (~30–41% reduction) via compact toggles, array collapsing, and bounds limits on high-chatter tools.
- Modularized source files to strict kebab-case convention.
- Centralized default connection pool timeout to 30,000ms.
- Applied `openWorldHint: false` to all tools.
- Reduced npm package size by excluding test and source map artifacts.
- Refactored Vitest test suite to use SWC compilation.
- Refactored cross-tool validation helpers to throw standardized `ValidationError`s.
- Updated `POSTGRES_MCP_INSTRUCTIONS` (`performance.md`, `postgis.md`, `jsonb.md`, `vector.md`) to reflect bounded limits, payload optimization, correct standalone geometry return schemas, precise in-memory tool boundaries, and explicitly missing tool documentation (e.g., `pg_vector_add_column`).
- Configured instruction generation script to actively ignore `README.md` to prevent help-route and bundle bloat.
- **Dependency Updates**: Updated `eslint`, `@types/node`, `@modelcontextprotocol/sdk`, `@playwright/test`, `typescript`, `typescript-eslint`, and patched `hono`.

### Removed
- Obsolete shortcut action bundles (`META_GROUPS`).
- Unused `hono` router dependency.
- Duplicate and stale validation logic across performance handlers.

### Fixed
- Standardized P154 error structures (`success: false` with explicit `ValidationError`s) and pre-checks across all 230+ tools.
- Normalized systemic anomalies into standard payloads (e.g., `42P01` "relation does not exist", `42501` auth bounds errors).
- Validated standardized `success: true` responses across Performance, Transactions, and Stats groups.
- Resolved Split Schema Pattern violations in `pg_hybrid_search`, JSONB, Vector, Citext, and Performance by exposing base types.
- Corrected missing schema/table existence validation warnings in `listFunctions`, `listTriggers`, and `listConstraints` instruction documentation.
- Corrected `pg_hybrid_search` text parameter instructions in `vector.md` to accurately indicate the availability of the `query` field alias.
- Fixed SQL `row_number`, `rank`, and `ntile` window functions to properly cast index results as integer/real values to prevent string leakage.
- Fixed Split Schema Zod compliance in `stats` group base schemas (`coerceNumber` removal).
- Fixed `pg_detect_bloat_risk` to return valid empty datasets instead of throwing when evaluating nonexistent schemas.
- Fixed Zod validation handling, eliminating silent failures and framework refine leaks in vector and transaction tools.
- Resolved Code Mode validation bypassing for alias/readonly parameters and isolated evaluation state discrepancies.
- Corrected migration rollback behavior to prevent unmanaged auto-commits.
- Fixed timing defects in admin tools that logged progress before failing validation.
- Handled Partman routines executing gracefully on missing child tables or lacking extensions.
- Remediated cascade simulators incorrectly truncating self-referencing foreign keys.
- Fixed Code Mode alias bindings allowing `activeConnections` and `systemHealth` native translation.
- Fixed `pg_alert_threshold_set` to correctly ingest `warning_threshold` and `critical_threshold` snake_case alias parameters.
- Bypassed Docker Hub rate-limit blocks by enforcing explicit authenticated pulls in CI.
- Handled missing try/catch blocks within monitoring data tools to conform with P154 error patterns.
- Certified Code Mode execution compliance for deep cross-group functional pipelines (Core → Vector → JSONB → Stats).
- Completed production-readiness certification for the Monitoring tool group, ensuring precise payload limits, robust Code Mode compliance, and pristine P154 structured error handling.

### Security
- Resolved prototype pollution vulnerabilities via `hono` and exact-version overrides.
- Replaced raw Postgres exceptions with `PostgresMcpError` classes globally to prevent SQL syntax leaks.
- Enforced SLSA Build L3 compliance via `--provenance` in NPM publishing workflows.
- Patched npm-bundled vulnerabilities in Docker builds using explicit `npm pack` replacements.
