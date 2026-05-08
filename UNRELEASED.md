# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **Security Fixes**: Bumped `hono` to `4.12.18` (Improperly Handles JSX Attribute Names Allows HTML Injection in hono/jsx SSR) and `ip-address` to `10.2.0` (XSS in Address6 HTML-emitting methods) in `package.json` overrides.
### Fixed

- **Core Tools**: Fixed Code Mode certification checklist expectations for `pg_write_query` payload output (`rowsAffected`) and `pg_list_objects` default behavior.
- **Ltree Tools**: Completed full Code Mode certification of all 8 ltree tools. Fixed `pg_ltree_create_extension` by explicitly exporting `LtreeCreateExtensionSchemaBase` and `LtreeCreateExtensionSchema` from the `schemas/extensions/ltree.ts` barrel, removing the inline schema definition to adhere strictly to the Split Schema and P154 structured error handling patterns.
- **Docstore Tools**: Fixed `pg_doc_collection_info` returning string for `rowCount` causing type mismatches; updated logic to `parseInt` the result. Fixed `pg_doc_find` rejecting valid object filters by applying the Split Schema pattern (`z.preprocess`) to `filter` schemas in `schemas/docstore.ts`. Added support for MongoDB-style operators (`$gt`, `$lt`, `$gte`, `$lte`, `$ne`) in JSON filters in `helpers.ts` `parseDocFilter()`. Resolved Split Schema parameter alias violations by mapping `collection` to `name` in `CreateCollectionSchema` and `DropCollectionSchema`, and `field` to `fields` in `CreateDocIndexSchema`.
- **Test Prompts**: Remediated structural fragmentation and non-sequential numbering across split Code Mode test prompts for the `postgis`, `stats`, and `vector` tool groups. Ensured all tools include missing P154 error path and Zod validation testing requirements.
- **Pgcrypto Tools**: Completed full Code Mode certification of all 9 pgcrypto tools. Fixed Split Schema metadata stripping violation in `PgcryptoGenRandomUuidSchemaBase`, `PgcryptoRandomBytesSchemaBase`, and `PgcryptoGenSaltSchemaBase` by replacing `z.preprocess()` with `z.number().optional()` to ensure proper visibility in MCP clients. Verified full P154 structured error compliance for Zod validation errors.
- **Security Tools**: Completed full Code Mode certification of all 9 security tools. Optimized `pg_security_user_privileges` payload by making `includeGrants` an optional parameter (default: false) to prevent massive output generation. Verified full P154 structured error handling and Split Schema pattern compliance. Fixed missing object regex parsing in `pg_security_sensitive_tables` and `pg_security_user_privileges` by bypassing standard error parsing for customized messages. Fixed validation error parsing leak in `pg_security_mask_data`. Fixed non-superuser fallback in `pg_security_firewall_status` and `pg_security_firewall_rules` to properly return structured errors.
- **Stats Tools**: Completed full Code Mode certification of the advanced and windowing stats tools. Fixed field naming in `pg_stats_frequency` output to use `count` instead of `frequency` for consistency with prompt expectations and output schemas. Verified full P154 structured error compliance and Split Schema implementations.
### Added

- **Connection Pool**: `initializationSql` config to execute session setup queries once per connection checkout. Uses `WeakSet` for zero-GC-overhead deduplication. Applies to both `getConnection()` and `query()` paths.
- **Security tool group** (9 tools): `pg_security_audit`, `pg_security_firewall_status`, `pg_security_firewall_rules`, `pg_security_ssl_status`, `pg_security_encryption_status`, `pg_security_password_validate`, `pg_security_mask_data`, `pg_security_user_privileges`, `pg_security_sensitive_tables` — comprehensive security auditing, SSL/TLS monitoring, data masking, privilege analysis, and pg_hba.conf firewall management. Reverse-ported from mysql-mcp with PostgreSQL-native catalog queries. Full Code Mode support via `pg.security.*`.
- **Roles tool group** (12 tools): `pg_role_list`, `pg_role_create`, `pg_role_drop`, `pg_role_attributes`, `pg_role_grants`, `pg_role_grant`, `pg_role_assign`, `pg_role_revoke`, `pg_user_roles`, `pg_role_set`, `pg_role_rls_enable`, `pg_role_rls_policies` — role CRUD, privilege management, membership assignment, session role switching, and row-level security management. Reverse-ported from mysql-mcp with PostgreSQL-native enhancements (role attributes, SET ROLE, RLS). Full Code Mode support via `pg.roles.*`.
- **Document Store tool group** (9 tools): `pg_doc_list_collections`, `pg_doc_create_collection`, `pg_doc_drop_collection`, `pg_doc_collection_info`, `pg_doc_find`, `pg_doc_add`, `pg_doc_modify`, `pg_doc_remove`, `pg_doc_create_index` — NoSQL-style JSONB document collection management with auto-generated `_id` primary keys, field/value/path filtering, expression indexes, and JSONB-native operations (`jsonb_set`, `#-`, `@>`). Ported from mysql-mcp with PostgreSQL-specific expression indexes (vs generated columns). Full Code Mode support via `pg.docstore.*` with aliases (`search`→`find`, `insert`→`add`, `update`→`modify`, `delete`→`remove`). Includes `postgres://docstore` resource, `pg_setup_docstore` prompt, and `postgres://help/docstore` help content.
- **Backup tool group**: Completed full code-mode certification of all 10 backup tools. Migrated inline Zod schemas to Split Schema pattern (`schemas/backup.ts`) to ensure MCP client visibility for tools like `pg_dump_table` and `pg_copy_import`. Verified V2 `volumeDrift` anomaly detection and strict error handling parity.

### Changed

- **Dependency Updates**:
  - Updated `devDependencies` (`@types/node` 25.6.0, `@vitest/coverage-v8` 4.1.5, `eslint` 10.3.0, `globals` 17.6.0, `typescript` 6.0.3, `typescript-eslint` 8.59.2, `vitest` 4.1.5)
  - Updated `dependencies` (`jose` 6.2.3, `zod` 4.4.3)
  - Updated GitHub Actions to latest tagged versions (`actions/github-script` v9.0.0, `github/gh-aw` v0.68.1, `trufflesecurity/trufflehog` v3.94.3, `actions/upload-artifact` v7.0.1, `docker/build-push-action` v7.1.0) with strict SHA pinning.
  - Updated GitHub Actions to latest tagged versions (`actions/github-script` v9.0.0, `github/gh-aw` v0.68.1, `trufflesecurity/trufflehog` v3.94.3, `actions/upload-artifact` v7.0.1, `docker/build-push-action` v7.1.0) with strict SHA pinning.
