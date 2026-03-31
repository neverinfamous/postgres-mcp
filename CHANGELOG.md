# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.0] - 2026-03-09

### Added
- Comprehensive test coverage through new E2E Playwright verification suite.
- P154-compliant structured error format replacing raw MCP exception throws.
- Native TypeScript implementations of `postgis`, `migration`, and `introspection` tools.

### Changed
- Refactored handler execution to strictly adhere to semantic versioning patterns.
- Enhanced tool schemas with robust Zod validations eliminating edge cases.

### Fixed
- Addressed boundary condition failures across complex geospatial operations.
- Resolved legacy query execution bugs within the anomaly detection tool groups.

## [2.2.0] - 2026-03-09

### Added
- Robust Slowloris DoS mitigation supporting environment-driven timeout configuration.
- Broad Playwright test capabilities simulating extreme environment load.

### Changed
- Standardized file paths and simplified execution semantics for dual protocol (SSE/HTTP) paths.

### Fixed
- Eliminated timeout unreliability bugs exposed under heavy Code Mode API bridge testing.

## [2.1.0] - 2026-03-08

### Added
- Formalized implementation of Side-Effect Group Partitioning (Pattern P171).
- Added comprehensive tool inventory mapping all 231 tools.

### Changed
- Truncation indicators deployed broadly to limit response payloads and preserve context window efficiency.

### Fixed
- Remediation of deeply nested EXPLAIN PLAN context exhaustion.

## [2.0.0] - 2026-03-02

### Added
- Launched complete API rewrite under `v2.0.0` introducing the modern MCP Code Mode sandbox.
- Dynamic API Bridge and Worker Threads RPC designed to isolate user-script execution safely.
- Expansion across Core, JSONB, Stats, and Performance tools to support 220+ operations natively.

### Removed
- Deprecated legacy, monolithic instruction scripts entirely.

## [1.3.0] - 2026-02-22

### Added
- In-depth observability metrics tracking runtime query caching patterns (kcache).

### Changed
- Updated node connection logic to support Node LTS runtime baselines.

### Fixed
- Multiple query planner statistics edge cases addressed correctly.

## [1.2.0] - 2026-02-10

### Changed
- Comprehensive migration from ESLint 8 / legacy configurations to fully enforced ESLint 10 standards.
- Replaced ambiguous error throws with structured `{success: false, error: ...}` return schemas.

## [1.1.0] - 2026-01-29

### Added
- Initial support for advanced JSONB aggregation, postgis bounds calculation, and text similarity algorithms.
### Security
- Hardened default Docker configurations ensuring least-privilege deployment.

## [1.0.0] - 2026-01-24

### Added
- First formal, stable release supporting Standardized MCP SDK 1.25+ compatibility.
- Streamable HTTP Transport and OAuth 2.1 framework.
### Changed
- Graduated tools from experimental to production-ready status.

## [0.2.0] - 2025-12-14

### Added
- Broad scale implementation covering Vector and Stats operations (146+ methods).
- Tool filtering with `TOOL_GROUPS` for specialized workload deployments.
### Changed
- Updated README with accurate tool counts and shifted status from "Development Preview" to "Initial Implementation Complete".

## [0.1.0] - 2025-12-13

### Added
- Initial repository setup with 106 base tools and community standards.
- Core infrastructure with connection pooling and health checks.
- 6 runtime resources and 7 AI-powered system prompts.
