# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security
- **hono**: Pinned to `4.12.12` to address moderate vulnerabilities including path traversal and middleware bypass.

### Changed
- **Dependencies**: Bumped `@vitest/coverage-v8`, `typescript-eslint`, and `vitest`.
- **Dockerfile**: Extracted duplicated CVE patch instructions into `scripts/patch-npm-deps.sh` to eliminate stage drift and enforce cache purging.

### Fixed
- **anomaly-detection**: Modified `pg_detect_bloat_risk` to return empty responses instead of validation errors on nonexistent schemas.
- **caching**: Added robust validation for `METADATA_CACHE_TTL_MS` to prevent cache expiration failures.
- **core**: Removed `.unknown()` from column type schemas to constrain default values and prevent DDL validation errors.
- **kcache**: Ensured `query_preview` remains preserved during compact payload generation across CPU, IO, and query tools.
- **kcache**: Increased API parameter bounds from 10 to 100 and improved property aliasing.
- **kcache**: Added `coerceNumber` data preprocessing to all numeric thresholds to properly handle string inputs.
- **partitioning**: Patched syntax errors by escaping embedded single quotes within DDL fragment values.
