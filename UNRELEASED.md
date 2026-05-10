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

- **Dependencies**: Updated `typescript` (6.0.3), `eslint` (10.3.0), `vitest` (4.1.5), `jose` (6.2.3), and `zod` (4.4.3).
- **GitHub Actions**: Updated CI workflows to the latest tagged versions with strict SHA pinning.
- **Core Tools**: Lowered the default limit from 50 to 20 in `pg_list_objects` and `pg_list_tables` to improve LLM token efficiency.
- **Introspection Tools**: Streamlined `pg_schema_snapshot` compact mode to default exclusively to tables, views, and indexes.

### Fixed

- **Error Handling Standardization**: Enforced strict P154-compliant structured error payloads and schema validations across Partman, Core, Schema, Docstore, Citext, and Ltree tools.
- **PostGIS Tools**: Enforced pagination limits for queries returning large spatial datasets and standardized payload key names.
- **Vector Tools**: Corrected inline schema definitions, parameter aliasing, and validation edge-cases to prevent silent processing errors.
- **Stats Tools**: Fixed output field naming inconsistencies and verified zero-state boundary coercions for numeric parameters.
- **Backup & Kcache Tools**: Ensured successful reads explicitly return `success: true` properties and corrected missing payload schemas.
- **JSONB Tools**: Refactored raw `json` parameter coercion to elegantly handle invalid parameter types.
- **Backup Tools**: Fixed `pg_dump_schema` and `pg_copy_import` to strictly verify table and schema object existence prior to command generation, complying with P154 standards.
- **Test Prompts**: Consolidated and repaired structurally fragmented Code Mode test prompts.

### Security

- **Dependencies**: Bumped `hono` to `4.12.18` (HTML Injection), `ip-address` to `10.2.0` (XSS), and `fast-uri` to `3.1.2` (Path Traversal) via package overrides.
