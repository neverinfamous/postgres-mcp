# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **kcache**: Corrected inaccurate Zod schema description for `pg_kcache_database_stats` `database` parameter to accurately reflect that omitting it queries all databases.

### Verified
- **kcache Tool Group**: Completed advanced stress testing via Code Mode. Certified 100% test coverage against boundary conditions, state idempotency, payload truncation limits, and structured error compliance without requiring underlying logic modifications.
