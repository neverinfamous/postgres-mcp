# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **hono**: Pinned override to `4.12.12` to address multiple moderate severity vulnerabilities (cookie write path validation, path traversal in `toSSG()`, middleware bypass in `serveStatic()`, etc.)


### Fixed

- **kcache output optimization**: Ensured `query_preview` is preserved in the response even when `compact` mode is active across `pg_kcache_query_stats`, `pg_kcache_top_cpu`, `pg_kcache_top_io`, and `pg_kcache_resource_analysis` to maintain query debuggability while saving tokens
- **Anomaly Detection Empty Filters**: `pg_detect_bloat_risk` now properly returns an empty array and `totalAnalyzed: 0` instead of throwing a validation error when queried with a nonexistent schema
- **kcache schemas**: Apply `coerceNumber` preprocess to all numeric params (`limit`, `minCalls`, `queryPreviewLength`, `threshold`) — string inputs like `"5"` are now properly coerced instead of rejected
- **partition preprocessing**: Escape embedded single quotes in `from`/`to`/`values[]` when building `forValues` DDL fragments — prevents broken SQL and potential injection
- **adapter-cache**: Validate `METADATA_CACHE_TTL_MS` env var with `Number.isFinite()` fallback — prevents `NaN` from silently disabling TTL expiry
- **core queries**: Remove `.unknown()` from `default`/`defaultValue` column schema — restores constrained `string|number|boolean` union to prevent objects from generating invalid DDL

### Changed

- **Dockerfile**: Extract 6 duplicated CVE patch `RUN` blocks into shared `scripts/patch-npm-deps.sh` — eliminates drift between builder and production stages; production stage now includes `--clean-cache` to purge `/root/.npm`
- **Dependency Updates**: Updated `@vitest/coverage-v8` to `4.1.3`, `typescript-eslint` from `8.58.0` to `8.58.1`, `vitest` to `4.1.3`.
