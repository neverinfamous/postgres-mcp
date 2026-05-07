# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Connection Pool**: `initializationSql` config to execute session setup queries once per connection checkout. Uses `WeakSet` for zero-GC-overhead deduplication. Applies to both `getConnection()` and `query()` paths.
- **Security tool group** (9 tools): `pg_security_audit`, `pg_security_firewall_status`, `pg_security_firewall_rules`, `pg_security_ssl_status`, `pg_security_encryption_status`, `pg_security_password_validate`, `pg_security_mask_data`, `pg_security_user_privileges`, `pg_security_sensitive_tables` — comprehensive security auditing, SSL/TLS monitoring, data masking, privilege analysis, and pg_hba.conf firewall management. Reverse-ported from mysql-mcp with PostgreSQL-native catalog queries. Full Code Mode support via `pg.security.*`.
