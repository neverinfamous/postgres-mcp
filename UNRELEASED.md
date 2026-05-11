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
- **Docstore Tools**: Reduced the default limit from 100 to 50 in `pg_doc_find` to prevent large payload bloat.
- **Stats Tools**: Increased the maximum `limit` allowed in window function tools from 100 to 1000 to better support data analysis pipelines on larger datasets.

### Fixed

- **Partman Tools**: Fixed missing handler-side Zod strict parsing in `pg_partman_create_extension` to prevent parameter leaks.
- **Error Handling Standardization**: Enforced strict P154-compliant structured error payloads and schema validations across Partman, Core, Schema, Citext, and Ltree tools.
- **Docstore Tools**: Fixed missing `$in` and `$nin` operator support, added structured error handling for unsupported nested JSON path queries, intercepted Zod validation errors on empty document arrays, fixed `unknown` collection name leakage in `pg_doc_create_collection` and `pg_doc_drop_collection` when aliases are used, and prevented raw MCP error leaks by moving `.min(1)` constraints from `pg_doc_create_index` schema to handler-side validation.
- **PostGIS Tools**: Enforced pagination limits for queries returning large spatial datasets, standardized payload key names, and fixed missing point payload fallback logic in `pg_distance` and `pg_point_in_polygon` schemas that caused queries to silently default to `(0,0)` if `lat`/`lng` were passed at the root rather than within a `point` object.
- **Vector Tools**: Corrected inline schema definitions, parameter aliasing, and validation edge-cases to prevent silent processing errors.
- **Stats Tools**: Fixed output field naming inconsistencies and verified zero-state boundary coercions for numeric parameters.
- **Backup & Kcache Tools**: Ensured successful reads explicitly return `success: true` properties and corrected missing payload schemas.
- **JSONB Tools**: Refactored raw `json` parameter coercion to elegantly handle invalid parameter types.
- **Backup Tools**: Fixed `pg_dump_schema` and `pg_copy_import` to strictly verify table and schema object existence prior to command generation, complying with P154 standards.
- Fixed Zod validation error messages in `DropSchemaSchema`, `DropSequenceSchema`, and `DropViewSchema` to correctly list available aliases instead of only 'name', improving split-schema compliance.
- Fixed `pg_role_create` and `pg_role_drop` parameter mismatch (used `roleName` instead of `name` in output).
- **Kcache Tools**: Fixed unhandled relation-not-found exceptions when the `pg_stat_kcache` extension is missing by mapping them to gracefully typed `EXTENSION_MISSING` structured errors.
- **Pgcrypto Tools**: Fixed `gen_random_bytes` to support `raw` natively by returning postgres `escape` encoding. Fixed unhandled exceptions when the `pgcrypto` extension is missing by mapping them to cleanly typed `EXTENSION_MISSING` structured errors. Fixed native error leakage by mapping PostgreSQL `invalid base64 sequence` decryption errors and `Illegal argument` empty-password encryption errors to strictly typed `VALIDATION_ERROR` responses.
- **Test Prompts**: Consolidated and repaired structurally fragmented Code Mode test prompts.
- **Security Tools**: Fixed a Zod validation leak in `pg_security_password_validate` where empty string inputs bypassed constraint checking by adding explicit handler-side validation.
- **Text Tools**: Normalized parameter aliasing across all text tools, added native support for the `damerau-levenshtein` method alias in `pg_fuzzy_match`, verified full P154 and structured error handling compliance across the entire 13-tool advanced testing matrix, fixed a parameter boundary enforcement bug in `pg_trigram_similarity` where explicitly negative or out-of-bounds `threshold` values were passed directly to PostgreSQL instead of throwing a structured `VALIDATION_ERROR`, and fixed a validation bypass in `pg_text_search_config` where the handler ignored parameters instead of strictly parsing the input schema.
- **Core Tools**: Added a P154 object existence check for schemas in `pg_list_tables` to correctly return a structured error when filtering by a nonexistent schema.
- **Core Tools**: Fixed an error propagation issue in the core convenience tools (`pg_upsert`, `pg_batch_insert`, `pg_count`, `pg_exists`, `pg_truncate`) where `validateTableExists` returned raw string messages, resulting in missing `code`, `category`, and `recoverable` fields in the final structured error response.
- Fixed an error parsing inconsistency in `pg_jsonb_diff` where providing missing parameters yielded a confusing validation error about arrays and primitive values instead of accurately reporting missing parameters.
- Clamped `limit` parameter to 100 max internally in `kcache` group tools instead of throwing a validation error for values > 100.
- Cast BIGINT fields (`reads`, `writes`, `read_bytes`) and NUMERIC percentages (`user_cpu_percent`, `cpu_time_percent`) to `float8` in `kcache` tools to ensure precise JS numerical formatting instead of returning string values.
- Fixed a cross-schema scoping inconsistency in the `migration` tools by adding support for and passing down the optional `schema` parameter to all internal tracking table queries rather than implicitly defaulting to `public` during execution.
- Fixed an internal handler error where Zod validation failures were leaking as raw JSON error strings instead of structured error responses (`isZodLikeError` function was failing `instanceof Error` checks across modules).
- Fixed a parameter alias resolution bug in the `schema` tools where the `sequence` alias was not natively mapping through Zod preprocessing on the backend, leading to incorrect validation failures during `pg_create_sequence` and `pg_drop_sequence` operations.
- Fixed a PostgreSQL error parsing miss where sequence boundary breaches (error code 2200H) were returned as unhandled `QUERY_ERROR` exceptions instead of mapping into structured `VALIDATION_ERROR` responses with correct user suggestions.
- Fixed a sequence bounds alias resolution bug in the `schema` tools where the `maxvalue` and `minvalue` lowercased SQL-native aliases were ignored during `pg_create_sequence` preprocessing.
- Clamped `limit` and `n` parameters in `stats` group tools (`pg_stats_top_n`, `pg_stats_distinct`, `pg_stats_frequency`) to their maximum allowed values instead of throwing validation errors.
- Fixed a validation bypass in the `introspection` tools where `pg_migration_risks` accepted an empty `statements` array and returned success without raising a structured validation error.
- Fixed a parameter coercion bypass in the `monitoring` tools where the `coerceNumber` helper silently converted invalid strings into `undefined`, allowing `.optional()` fields like `limit` and `days` to skip type validation. Replaced `coerceNumber` with `coerceStrictNumber` in `schemas/monitoring.ts` to ensure invalid inputs surface cleanly as structured `VALIDATION_ERROR` responses.
- Fixed an error parsing regex mismatch in the core error parser where `pg_connection_stats` formatting of "does not exist" using single quotes bypassed the native `3D000` database check. Updated the base error string to use double quotes to successfully trigger standard `OBJECT_NOT_FOUND` resolution.
- Fixed an error formatting issue in `pg_drop_view` and `pg_drop_sequence` tools where relation-not-found errors were resolving to generic `"Table ... does not exist"` messages by properly passing `objectType` context to the upstream handler, and added explicit view handling to the core error parser.

### Security

- **Dependencies**: Bumped `hono` to `4.12.18` (HTML Injection), `ip-address` to `10.2.0` (XSS), and `fast-uri` to `3.1.2` (Path Traversal) via package overrides.
