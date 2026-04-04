# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Worker-thread Code Mode sandbox with resource limits, RPC bridge, and configurable timeouts (`MCP_REQUEST_TIMEOUT`, `MCP_HEADERS_TIMEOUT`).
- Transport-agnostic Auth module supporting `SCOPE_PATTERNS`, `BASE_SCOPES`, and RFC 6750.
- Audit subsystem with session token estimates, JSONL logging, redaction, and `pg_audit_*` tools.
- 13 new statistics and admin tools including `pg_stats_outliers` and `pg_append_insight`.
- `pg_jsonb_pretty` tool for JSON formatting.
- 22 group-specific help resources accessible via `postgres://help`.
- Playwright E2E test coverage for Code Mode, authentication, and backups.
- Parameter extensions and aliases across core tools (e.g., `toType`, `indexName`, `read_only`).
- Agent-optimized documentation and Code Mode integration guides.

### Changed
- **BREAKING**: Core write tools require `write` scope; destructive tools require `admin`.
- Modularized source files applying strict kebab-case convention.
- Optimized token payload sizes (~30–41% reduction) via compact toggles and array collapsing.
- Reduced max-cap parameter limits from 500 to 100 and lowered default limits to 10-20 across heavy `performance` statistics tools (`pg_table_stats`, `pg_stat_statements`, `pg_vacuum_stats`, `pg_query_plan_stats`) to strictly enforce LLM context-window protection.
- Applied `openWorldHint: false` to all tools.
- Centralized default connection pool timeout to 30,000ms.
- Reduced npm package size by excluding test and source map artifacts.
- Refactored cross-tool validation helpers to throw standardized `ValidationError`s.
- Switched to SWC compilation for Vitest test suite.
- Updated dependencies and patched `hono` vulnerabilities.

### Removed
- Obsolete `META_GROUPS` shortcut bundles.
- Unused `hono` router dependency.
- Duplicate validation logic across performance handlers.

### Fixed
- Standardized P154 error structures (`success: false` + explicit `ValidationError`) across all 230+ tools.
- Corrected behavioral inconsistencies in Partitioning tools:
  - Added `pg_inherits` membership checks to `pg_detach_partition` to prevent misleading `TABLE_NOT_FOUND` errors.
  - Added `ifNotExists` parameter and `alreadyExists` response field to partition creation tools.
  - Fixed Zod validation leaks and structural input type validation for aliases.
  - Normalized error messages to use P154-consistent double-quote formatting.
  - Implemented pagination/limits to prevent extreme payloads on heavily partitioned tables.
- Corrected behavioral inconsistencies in Performance tools:
  - Fixed `SCHEMA_NOT_FOUND` validation in `pg_detect_bloat_risk` to return proper structural errors instead of empty tables.
  - Added strict parameter value parsing for enum constraints in `pg_stat_statements` to reject invalid `orderBy` inputs instead of defaulting silently.
- Resolved Split Schema Pattern violations in Search, JSONB, Vector, Stats, and Performance groups (e.g. `pg_seq_scan_tables`).
- Corrected Split Schema mapping for `isolation_level` alias in Transaction tools to properly enforce `isolationLevel` values instead of silently falling back to `READ COMMITTED`.
- Corrected misleading suggestions in `TransactionError` for missing transaction IDs.
- Corrected JSDoc and JSON Schema literal text descriptions in `performance` schemas to accurately reflect runtime defaults and boundary caps (e.g., limits accurately stated as 10-20 default, max 100).
- Fixed numeric type casting for SQL window functions (`row_number`, `rank`, `ntile`).
- Improved resilience in Admin and Monitoring tools (e.g., handling missing target tables or extensions gracefully).
- Fixed timing defects in progress logging and corrected migration rollback behavior.
- Remediated cascade simulators incorrectly truncating self-referencing foreign keys.
- Standardized snake_case alias parsing for alert threshold settings.
- Updated technical instructions and output schemas across all groups to reflect pagination boundaries and alias mappings.
- Bypassed Docker Hub rate-limit blocks by enforcing authenticated pulls in CI.

### Security
- Resolved prototype pollution vulnerabilities via `hono` and exact-version overrides.
- Replaced raw exceptions with `PostgresMcpError` to prevent SQL syntax leaks.
- Enforced SLSA Build L3 compliance via `--provenance` in publishing workflows.
- Patched npm-bundled vulnerabilities in Docker builds.
