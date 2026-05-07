# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **Security Fixes**: Bumped `hono` to `4.12.18` (Improperly Handles JSX Attribute Names Allows HTML Injection in hono/jsx SSR) and `ip-address` to `10.2.0` (XSS in Address6 HTML-emitting methods) in `package.json` overrides.

### Added

- **Connection Pool**: `initializationSql` config to execute session setup queries once per connection checkout. Uses `WeakSet` for zero-GC-overhead deduplication. Applies to both `getConnection()` and `query()` paths.
- **Security tool group** (9 tools): `pg_security_audit`, `pg_security_firewall_status`, `pg_security_firewall_rules`, `pg_security_ssl_status`, `pg_security_encryption_status`, `pg_security_password_validate`, `pg_security_mask_data`, `pg_security_user_privileges`, `pg_security_sensitive_tables` — comprehensive security auditing, SSL/TLS monitoring, data masking, privilege analysis, and pg_hba.conf firewall management. Reverse-ported from mysql-mcp with PostgreSQL-native catalog queries. Full Code Mode support via `pg.security.*`.

### Changed

- **Dependency Updates**: 
  - Updated `devDependencies` (`@types/node` 25.6.0, `@vitest/coverage-v8` 4.1.5, `eslint` 10.3.0, `globals` 17.6.0, `typescript` 6.0.3, `typescript-eslint` 8.59.2, `vitest` 4.1.5)
  - Updated `dependencies` (`jose` 6.2.3, `zod` 4.4.3)
  - Updated GitHub Actions to latest tagged versions (`actions/github-script` v9.0.0, `github/gh-aw` v0.68.1, `trufflesecurity/trufflehog` v3.94.3, `actions/upload-artifact` v7.0.1, `docker/build-push-action` v7.1.0) with strict SHA pinning.
