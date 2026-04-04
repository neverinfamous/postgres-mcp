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
- Reduced parameter limits to 10-20 (default) and 100 (max) for all performance, statistics, and vector tools (e.g., `pg_vector_dimension_reduce`) to protect LLM context windows.
- Reduced default limits for `pg_stat_statements` (20→10) and `pg_diagnose_database_performance` topN (10→5) to further optimize token payloads.
- Optimized payload sizes for `pg_table_stats` and `pg_index_stats` by reducing default limits to 10 and explicitly omitting null timestamp values.
- Applied `openWorldHint: false` to all tools.
- Centralized default connection pool timeout to 30,000ms.
- Reduced npm package size by excluding test and source map artifacts.
- Switched to SWC compilation for Vitest.
- Updated dependencies including security patches for `hono`.

### Removed
- Obsolete `META_GROUPS` shortcut bundles.
- Unused `hono` router dependency.
- Duplicate validation logic across performance handlers.

### Fixed
- Standardized P154 error structures and double-quote formatting across all 230+ tools.
- Resolved Split Schema Pattern violations across Search, JSONB, Vector (specifically `pg_vector_add_column`), Stats, Performance, and Admin groups.
- Fixed orphaned output/input schemas for catalog stat tools (`pg_table_stats`, `pg_index_stats`, `pg_vacuum_stats`).
- Improved `pg_stat_statements` and `pg_cache_hit_ratio` reliability: fixed output schema validation, aligned error reporting with P154 standards, and ensured consistent pagination metadata.
- Partitioning tools: Fixed membership checks, added `ifNotExists` parameters, and implemented pagination limits.
- Fixed type coercion fallback leaks in Performance tools (`pg_seq_scan_tables`, `pg_detect_query_anomalies`, `pg_detect_bloat_risk`) to prevent native type mismatches by ensuring strict parameter checking.
- Bounded limit definitions natively for `pg_locks` and `pg_stat_activity` to firmly cap max output rows at 100, preventing token extraction payloads from scaling unbounded.
- Fixed Zod schema strictness for `limit` and `undefined` payload parameters across Performance tools (`pg_unused_indexes`, `pg_duplicate_indexes`, `pg_explain_buffers`) to strictly adhere to P154 validation standards.
- Updated `pg_diagnose_database_performance` to surface Zod validation errors cleanly using `ValidationError` instead of incomplete error payload objects.
- Fixed massive payload blowout in `pg_stat_statements` and `pg_query_plan_stats` by capping maximum limits at 50 instead of 100, and optimized `pg_diagnose_database_performance` to omit empty structural array sections (e.g. slowQueries) to significantly reduce output token count.
- Fixed factual inaccuracies in `performance.md` concerning `detectBloatRisk` schema error handling and expanded parameter signature documentation for `indexRecommendations` and `unusedIndexes`.
- Transaction tools: Fixed `isolation_level` alias mapping and improved transaction error hints.
- Fixed numeric type casting for SQL window functions (`row_number`, `rank`, `ntile`).
- Improved resilience in Admin and Monitoring tools when handling missing tables or extensions.
- Corrected progress logging timing and migration rollback behavior.
- Fixed cascade simulators for self-referencing foreign keys.
- Standardized snake_case alias parsing for alert thresholds.
- Bypassed Docker Hub rate-limit blocks in CI using authenticated pulls.

### Security
- Patched prototype pollution vulnerabilities in `hono`.
- Replaced raw exceptions with `PostgresMcpError` to prevent SQL syntax leaks.
- Enforced SLSA Build L3 compliance via `--provenance` in publishing workflows.
- Patched npm-bundled vulnerabilities in Docker builds.
