# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **CI/CD Utilities**: Automated coverage badge updates in `README.md` and `DOCKER_README.md` upon test suite execution.
- **Connection Pool**: Added `initializationSql` config to safely execute session setup queries on connection checkout.
- **Security Tools**: Introduced 9 new tools for auditing, SSL/TLS monitoring, data masking, and firewall management.
- **Roles Tools**: Introduced 12 new tools for comprehensive role CRUD, privilege, and row-level security management.
- **Document Store Tools**: Introduced 9 new tools for NoSQL-style JSONB document management, indexing, and filtering.

### Changed

- **Dependencies**: Updated `typescript` (6.0.3), `eslint` (10.3.0), `jose` (6.2.3), `zod` (4.4.3), `@playwright/test` (1.60.0), `@types/node` (25.8.0), `vitest` and `@vitest/coverage-v8` (4.1.6), and `typescript-eslint` (8.59.3).
- **Docker Dependencies**: Pinned transitive Dockerfile dependencies to address known CVEs: `diff` (9.0.0), `tar` (7.5.15), and `brace-expansion` (5.0.6).
- **GitHub Actions**: Updated CI workflows to the latest tagged versions with strict SHA pinning.
- **Payload Optimization**: Optimized default `limit` and truncation parameters across Performance, Core, Monitoring, Docstore, and Schema tools to prevent LLM token bloat. Increased max `limit` in Stats tools to 1000 for broader dataset analysis.
- **Introspection Tools**: Streamlined `pg_schema_snapshot` compact mode to default exclusively to tables, views, and indexes.
- **Schema Tools**: Added an `exclude` array parameter to `pg_list_views` to safely filter out large system/extension views.

### Fixed

- **Validation (Split Schema)**: Resolved Zod validation leaks across Monitoring, Partman, Kcache, Core, Performance, Stats, Docstore, Roles, Vector, and Text tool groups by migrating input schemas to `z.unknown().optional()`. This ensures type mismatches return structured handler errors instead of raw `-32602` MCP framework exceptions.
- **Validation (Object Existence)**: Enforced strict P154 object existence verification across Migration, Citext, Pgcrypto, Core, Ltree, Backup, and Performance tool groups to explicitly handle nonexistent schemas, tables, and views instead of failing silently.
- **Validation (Type Coercion)**: Replaced `coerceNumber` with `coerceStrictNumber` in Stats, Migration, and Monitoring tools to prevent invalid string inputs from silently bypassing validation and resolving to `NaN` or `undefined`.
- **Parameter Aliasing**: Fixed alias mapping bugs across Schema, Roles, Text, Admin, and Ltree tools, ensuring aliases like `tableName`, `maxvalue`, and `setting` resolve properly through Zod preprocessing.
- **Error Handling**: Standardized parsing for missing extensions (`ltree`, `pg_stat_kcache`, `pgcrypto`, `fuzzystrmatch`) and native Postgres sequence, dimension mismatch, and operator exceptions, translating them into structured, actionable errors.
- **Backup & Kcache Tools**: Fixed `hasDifferences` field compliance in `pg_audit_diff_backup`. Fixed BIGINT/NUMERIC precision by casting to `float8`. Ensured successful reads reliably return `success: true`.
- **Docstore Tools**: Fixed `$in`/`$nin` operators, native dot-notation parsing, and JSONB containment (`@>`) for nested object filters. Added missing structured error handling for nested queries.
- **Ltree & Transactions Tools**: Rejected negative `length` values and fixed validation bypass for malformed syntax in `pg_ltree_lca`. Truncated multi-statement query outputs to cap payload sizes.
- **Migration Tools**: Fixed cross-schema scoping in internal tracking tables to accurately support the optional `schema` parameter.
- **Partman Tools**: Fixed a schema-resolution bug in `helpers.ts` where the extension was hardcoded to `public`/`partman`. Tools now dynamically detect the installed namespace.
- **Pgcrypto Tools**: Fixed `gen_random_bytes` to natively support `raw` output. Restored full algorithm options visibility in base schemas.
- **PostGIS Tools**: Standardized payload key names and fixed missing point fallback logic in `pg_distance` and `pg_point_in_polygon`.
- **Roles Tools**: Fixed `validUntil` timestamp serialization, prevented malformed queries from empty privilege arrays, and corrected parameter mismatches in role creation tools.
- **Security Tools**: Fixed SQL syntax generation for empty patterns in `pg_security_sensitive_tables` and handled empty object payloads correctly.
- **Vector Tools**: Corrected inline schema definitions and verified full array serialization parity against native vector inputs.
- **Testing**: Fixed state bleed issue in `reset-database.ps1` where test extensions fell back to `topology` instead of `public`. Resolved fragile assertions in E2E codemode tests and PowerShell encoding bugs.

### Security

- **Dependencies**: Bumped `hono` to `4.12.18` (HTML Injection), `ip-address` to `10.2.0` (XSS), and `fast-uri` to `3.1.2` (Path Traversal) via package overrides.
