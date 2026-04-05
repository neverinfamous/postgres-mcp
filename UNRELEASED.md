# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Worker-thread Code Mode sandbox with resource limits, RPC bridge, and configurable timeouts.
- Transport-agnostic Auth module supporting `SCOPE_PATTERNS`, `BASE_SCOPES`, and RFC 6750.
- Audit subsystem with session token estimates, JSONL logging, redaction, and `pg_audit_*` tools.
- 13 new statistics and admin tools (including `pg_stats_outliers`, `pg_append_insight`, and `pg_jsonb_pretty`).
- 22 group-specific help resources accessible via `postgres://help`.
- Playwright E2E test coverage for Code Mode, authentication, and backups.
- Parameter extensions and aliases for core tools (e.g., `toType`, `indexName`).
- Agent-optimized documentation and Code Mode integration guides.

### Changed
- **BREAKING**: Core write tools require `write` scope; destructive tools require `admin`.
- Modularized source files using strict `kebab-case` convention.
- Optimized payload sizes (~30–41% reduction) by reducing default limits (10-20), capping max limits (50-100), and omitting null/empty sections across Performance, Stats, Monitoring, and Introspection tools.
- Implemented configurable safety limits (default 100, max 500) for `pg_schema_snapshot` and `pg_dependency_graph` to prevent context window exhaustion in large database environments.
- Applied `openWorldHint: false` to all tools.
- Centralized default connection pool timeout to 30,000ms.
- Switched to SWC compilation for Vitest and reduced npm package size by excluding test/source map artifacts.

### Removed
- Obsolete `META_GROUPS` shortcut bundles.
- Unused `hono` router dependency.
- Duplicate validation logic across performance handlers.

### Fixed
- Corrected the static `totalResources` count reported by the `postgres://capabilities` resource to 23.
- Standardized P154 error structures and double-quote formatting across all 230+ tools.
- Resolved Split Schema Pattern violations across Search, JSONB, Vector, Stats, Performance, and Admin groups.
- Improved reliability for Performance tools (`pg_stat_statements`, `pg_diagnose_database_performance`, `pg_cache_hit_ratio`): fixed output schemas, aligned error reporting with P154, and handled empty parameter objects.
- Implemented strict numeric type coercion (`coerceNumber`) and Zod validation for performance tools to prevent native type mismatches and raw MCP errors.
- Partitioning tools: Fixed membership checks, added `ifNotExists` parameters, and implemented pagination limits.
- Transaction tools: Fixed `isolation_level` alias mapping and improved transaction error hints.
- Fixed factual inaccuracies in `performance.md` documentation.
- Improved resilience in Admin and Monitoring tools when handling missing tables or extensions.
- Bypassed Docker Hub rate-limit blocks in CI using authenticated pulls.
- Resolved various logic regressions in cascade simulators, progress logging, and snake_case alias parsing.

### Security
- Patched prototype pollution vulnerabilities in `hono`.
- Replaced raw exceptions with `PostgresMcpError` to prevent SQL syntax leaks.
- Enforced SLSA Build L3 compliance via `--provenance` in publishing workflows.
- Patched vulnerabilities in Docker builds.
