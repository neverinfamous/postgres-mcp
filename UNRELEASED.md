# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Worker-thread Code Mode sandbox with resource limits, RPC bridge, and configurable timeouts.
- Transport-agnostic Auth module supporting `SCOPE_PATTERNS`, `BASE_SCOPES`, and RFC 6750.
- Audit subsystem with session token estimates, JSONL logging, redaction, and `pg_audit_*` tools.
- 13 new statistics and admin tools including `pg_stats_outliers` and `pg_append_insight`.
- `pg_jsonb_pretty` tool for JSON formatting.
- 22 group-specific help resources accessible via `postgres://help`.
- Playwright E2E test coverage for Code Mode, authentication, and backups.
- Parameter extensions and aliases across core tools (e.g., `toType`, `indexName`).
- Agent-optimized documentation and Code Mode integration guides.

### Changed
- **BREAKING**: Core write tools require `write` scope; destructive tools require `admin`.
- Modularized source files using strict `kebab-case` convention.
- Optimized payload sizes (~30–41% reduction) via compact toggles and array collapsing.
- Reduced parameter limits to 10-20 (default) and 100 (max) for all performance/statistics tools to protect LLM context windows.
- Applied `openWorldHint: false` to all tools.
- Centralized default connection pool timeout to 30,000ms.
- Reduced npm package size by excluding test and source map artifacts.
- Switched to SWC compilation for Vitest.
- Updated dependencies including `hono` and security patches.

### Removed
- Obsolete `META_GROUPS` shortcut bundles.
- Unused `hono` router dependency.
- Duplicate validation logic across performance handlers.

### Fixed
- Standardized P154 error structures and double-quote formatting across all 230+ tools.
- Resolved Split Schema Pattern violations in Search, JSONB, Vector, Stats, and Performance groups.
- Partitioning tools: Fixed `pg_detach_partition` membership checks, added `ifNotExists` parameters, and implemented pagination/limits.
- Performance tools: Fixed `pg_detect_bloat_risk` filter behavior and added strict constraint parsing to `pg_stat_statements`.
- Transaction tools: Fixed `isolation_level` alias mapping and improved `TransactionError` hints.
- Numeric type casting for SQL window functions (`row_number`, `rank`, `ntile`).
- Improved resilience in Admin and Monitoring tools when handling missing tables or extensions.
- Corrected progress logging timing and migration rollback behavior.
- Fixed cascade simulators for self-referencing foreign keys.
- Standardized snake_case alias parsing for alert thresholds.
- Bypassed Docker Hub rate-limit blocks in CI using authenticated pulls.
- **`pg_cache_hit_ratio` strict schema** — Changed `inputSchema: z.object({}).strict()` to `z.object({})` to prevent raw MCP `-32602` rejection when clients pass extra unknown params to a no-param tool.
- **`pg_stat_statements` limit description** — Fixed tool parameter `describe()` string advertising "max: 500" when the actual enforcement cap is 100 (aligned with payload safety standards).

### Security
- Patched prototype pollution vulnerabilities in `hono`.
- Replaced raw exceptions with `PostgresMcpError` to prevent SQL syntax leaks.
- Enforced SLSA Build L3 compliance via `--provenance` in publishing workflows.
- Patched npm-bundled vulnerabilities in Docker builds.
