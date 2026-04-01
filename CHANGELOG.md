# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Backup DDL Generation** — Fixed `pg_audit_restore_backup` and `BackupManager` to extract and accurately restore `PRIMARY KEY` constraints that were previously omitted during snapshot generation.
- **Backup Volume Drift Metadata** — Fixed `pg_audit_diff_backup` and `BackupManager` snapshot capture to execute a fallback `SELECT COUNT(*)` when `pg_class.reltuples` indicates stale statistics (`-1`), restoring accurate data volume tracking.

### Changed
- **Audit Diff Payload Optimization** — Updated `pg_audit_diff_backup` to default to `compact: true`, bypassing redundant full DDL blocks in the response payload to conserve token consumption (saving ~1000+ tokens per evaluation) while preserving pure diff analysis.
- **Introspection Payload Optimization** — Updated `pg_schema_snapshot` to structurally omit `0`-value keys and empty fields from the `stats` telemetry block, significantly reducing redundant token payload lengths on localized snapshot requests.

See [UNRELEASED.md](UNRELEASED.md) for all pending changes.

## [2.3.0] - 2026-03-09

### Added
- **`pg_transaction_status` tool** — New read-only tool in the `transactions` group that checks the state of an active managed transaction without modifying it. Returns status (`"active"`, `"aborted"`, `"not_found"`). Exposed in Code Mode as `pg.transactions.status()`. Transaction tools: 7 → 8.

### Changed
- **Dependency Updates**
  - `jose`: 6.2.0 → 6.2.1
  - Dockerfile: bumped npm-bundled `tar` patch from 7.5.10 → 7.5.11 and `minimatch` to 10.2.4
  - `package.json` overrides: exactly pinned `tar` to 7.5.11 and `minimatch` to 10.2.4

### Fixed
- **Introspection Tools Silent Empty Results** — `pg_dependency_graph`, `pg_topological_sort`, `pg_constraint_analysis`, and `pg_cascade_simulator` now explicitly return a structured error (`success: false`) when queried against nonexistent schemas or tables instead of silently returning empty findings.
- **Migration Record Status** — `pg_migration_record` now inserts entries with `status: 'recorded'` instead of defaulting to `'applied'`, distinguishing metadata-only records from executed migrations.
- **Anomaly Detection Tools Numeric Coercion** — `pg_detect_query_anomalies`, `pg_detect_bloat_risk`, and `pg_detect_connection_spike` now gracefully fall back to default values for non-numeric parameter inputs instead of producing raw framework output validation errors.
- **Migration Group Tool Icons** — Fixed tool group icons correctly mapping to `migration` instead of `introspection`.
- **Export Syntax** — Added missing `export` keyword to `InvalidFtsConfigError` class in `fts-config.ts` to unblock test imports.
- **Documentation Consistency** — Updated tool counts in project README files and server instructions to accurately reflect the 232 tool cap.

### Security
- **Schema Validation** — Mitigated an SQL injection risk in diagnostics and anomaly-detection modules by replacing ad-hoc string escaping with `validateIdentifier()` schema validation.

## [2.2.0] - 2026-03-09

### Added
- **`pg_diagnose_database_performance` tool** — Read-only diagnostic tool that consolidates 7 parallel queries into a single actionable report yielding slow queries, blocking locks, and connection pressure.
- **Anomaly Detection Suite** — Added 3 proactive monitoring tools (`pg_detect_query_anomalies`, `pg_detect_bloat_risk`, `pg_detect_connection_spike`) measuring query Z-scores and connection bottlenecks.
- **Migration Tool Group** — Promoted migration utilities (`pg_migration_init`, `record`, `apply`, `rollback`, `history`, `status`) to a dedicated group requiring `WRITE` OAuth scopes.
- **Benchmarking & Testing infrastructure** — Introduced 18 Vitest scenarios covering introspection error paths and schema parsing performance, bringing total benchmark throughput metrics up to date.

### Changed
- **Group Separation** — Separated the 12-tool introspection group into read-only `introspection` (6 tools) and write-oriented `migration` (6 tools). Tool count increased to 231.
- **`pg_schema_snapshot` Concurrent Query Execution** — Replaced 9 sequential queries with `Promise.all()`, drastically reducing total execution latency on complex targets.
- **`pg_topological_sort` Optimization** — Consolidated foreign key iteration arrays down to a single pass mechanism removing double iterations.
- **Code Mode Stability** — Migration methods explicitly exposed to the runtime bindings dictionary enabling full Code Mode operability.
- **Documentation Modernization** — Refreshed README and DOCKER_README benchmark metrics and group tool count definitions (e.g. `ext-perf`, `dba-schema`).

### Removed
- **Dead Code Cleanup** — Purged unused exports, unused interfaces, obsolete routing abstractions, and isolated benchmark-only generation scripts to reduce bundle friction.

### Fixed
- **Raw Zod Error Handling Leaks** — Added missing `try/catch` and P154 structuring across Admin, JSONB, Vector, Text, Citext, Partitioning, and Monitoring tools. Fixed `-32602` SDK SDK errors triggering on empty requisite params, invalid numeric formats, and arbitrary ENUM rejections. Enforced "Split Schema" pattern ensuring the MCP client filters properly without crashing server handlers.
- **Duplicate Hash Checking** — Abstracted redundant 20-line block across migration execution paths to enforce consistent detection.
- **Index Generation Typo** — Duplicate `pg_vector_create_index` exceptions now correctly refer to "Index" instead of "Table".
- **Legacy Transport Resolution** — The server can now fall back to legacy SSE protocols (`/sse`/`POST /messages`) concurrently with the modern `StreamableHTTPServerTransport` (`/mcp`), enabling standard tools like the Python SSE client.
- **Partition Verification Parity** — `pg_list_partitions` and `pg_partition_info` emit consistent structured error shapes instead of merging failed outcomes into generic success payloads with warning traits.

### Security
- **Alpine & Docker Pipeline Hardening** — Upgraded Docker Scout severity thresholds. Force-installed `zlib>=1.3.2-r0` directly from Alpine edge inside Dockerfile stages to patch CVSS 4.6 and CVSS 2.9 CVEs. Integrated Aquasecurity Trivy via `trivy-action`. Replaced `curl` HEALTHCHECK with native Node 24 fetch API reducing attack surface.
- **Session Auth & Trust Proxy Configuration** — Added `--trust-proxy` parameter allowing left-most `X-Forwarded-For` verification upon rate checking upstreams. Included logger warnings alerting developers on unauthenticated HTTP endpoints.
- **Action Supply-Chain Fastening** — Pinned all 37 Github Actions throughout CI/CD triggers to exact SHA constraints instead of rolling version tags.
- **DDL Template Hardening** — Removed unsafe `.replace(TRACKING_TABLE, ...)` string modifications in favor of explicitly verified SQL object builder pipelines.


## [2.1.0] - 2026-03-08

### Fixed
- **Raw Zod Error Handling Leaks & Parameter Type Safety:**
  - `pg_cron_job_run_details`, `pg_cron_cleanup_history` fixed invalid `jobId` rejection.
  - `pg_vector_create_index`, `pg_vector_embed`, `pg_vector_distance`, `pg_vector_normalize` refined validation.
  - Pgcrypto tools (`hash`, `hmac`, `gen_salt`, `gen_random_bytes`, `crypt`) produce structured errors for empty params.
  - Citext, Kcache, Partman, and Cron tools gracefully fallback on wrong-type numbers.
  - Text, Ltree, JSONB, Monitoring, and Admin tools now strictly utilize `try/catch` and `formatPostgresError` for valid MCP output constraints.
  - Eliminated `@typescript-eslint/no-unsafe-assignment` lint errors globally using `z.coerce.number()`.
- **Systematic Output Alignment (P154 structured errors):**
  - Partitioning tools, FTS functions, Text matchers (`limit: 0`), and Sequence iterators now accurately flag truncation limits.
  - Nonexistent schemas and tables appropriately respond with `success: false` and standard exception details bypassing earlier framework `isError` schema rejection.
- **Duplicate Object Detection:**
  - `pg_ltree_create_index` prevents duplicate GiST structures regardless of naming deviations.
- **SQL Parsing & Parameterization:**
  - `pg_cluster` handles `schema.table` dot-notation accurately.
  - FK constraints (`23503`) violations return clean relational checks rather than raw failures.
  - PostGIS boundary checks resolve flat `[lat, lng]` injection correctly.
- **Transport Backward Compatibility:**
  - Streamable HTTP protocol (MCP 2025-11-25) now seamlessly operates alongside legacy `/sse` POST message clients via dual-route logic.
- **CI Fixes** — Granted `GITHUB_TOKEN` to `secrets-scanning.yml` resolving Gitleaks failure on PRs.

### Changed
- **Version Number SSoT** — Configured `utils/version.ts` to derive the runtime version directly from `package.json`, preventing mismatches across documentation and CLI constants.

### Performance
- **Sandbox Optimization** — `Proxy` blocklist and `async/await` IIFE modules are permanently instantiated instead of reallocated.
- **Query Evaluation Speed** — Replaced `sanitizeContext` internal loop with optimized `slice(0)` and compiled 20 WHERE regex conditions into one evaluation node.

### Security
- **Defense in Depth SQL Interpolation:**
  - Replaced ad-hoc catalog variable injections with parameterized `$1, $2` constraints across Performance, Monitoring, Admin, PostGIS, and Backup abstraction layers.
- **Where-Clause Abuse Limits:**
  - Blocklist expanded to preclude `dblink_connect`, `dblink_exec`, `dblink`, `pg_notify`, and `pg_execute_server_program`.
- **DDoS Slowloris Threat Tracking:**
  - HTTP `maxBodySize` listener strictly applies tracking against data chunked envelopes directly mitigating `Content-Length` evasion patterns. Replaced probabilistic cache purge cycles for tracking hashes with deterministic `setInterval` limits.
- **Header Standards:**
  - Deprecated `X-XSS-Protection`, incorporated `Referrer-Policy: no-referrer`, and disabled generic `Permissions-Policy`. Default `ssl: true` flags force-reject unauthorized protocols without explicit bypass parameters.
- **NPM Package Auditing** — Hardened pipeline, updated `minimatch`, `hono`, and `jose` addressing ReDoS constraints. Removed local MCP Registry dummy tokens.

## [2.0.0] - 2026-03-02

### Added
- **Introspection Tool Group** — Unveiled a major comprehensive suite of 6 advanced read-only `pg_catalog` discovery tools focusing on DDL dependency routing:
  - `pg_dependency_graph` (Foreign key connections).
  - `pg_topological_sort` (Safe DDL dropping rules logic).
  - `pg_cascade_simulator` (Cascade routing mapping severity evaluation).
  - `pg_schema_snapshot` (Complete table/extensions overview in one pull with `compact` mode configuration).
  - `pg_constraint_analysis` (Checking PK constraints, non-indexed FK, unused defaults).
  - `pg_migration_risks` (Advising upon schema table drops).
- **Migration Group Tool Tracking** — Initiated a subset of 5 utilities implementing `_mcp_schema_versions` storage for executing, validating, restoring, and tracking schema upgrades. Use `pg_migration_apply` and `pg_migration_record`.
- **System Architecture Extensibility:**
  - Included 58 new `ToolFilter` unit verification benchmarks confirming group extraction routing. Added internal validation checks bridging 8 categories and resolving mock API limits.
  - Added 59 micro-benchmarks checking codebase infrastructure throughput capabilities.

### Changed
- **Repository Rename** — Successfully transitioned the core project from `postgresql-mcp` to `postgres-mcp`, aligning documentation paths, `.env` constraints, and npm packaging structures.
- **Tool Filter Adjustments & Shortcuts** — Standardized 16 IDE codemode combinations splitting generic components:
  - `dba-manage` separated into `dba-schema` & `dba-infra`.
  - `dev-power` configured into `dev-schema` & `dev-analytics`.
  - Deprecated `base-core` bundle entirely.
- **File System Refactoring & Documentation Output** — Centralized and converted `server-instructions.ts` strings down to markdown documents parsed organically via `generate-server-instructions.ts` keeping internal syntax clean. Added `backgroundWorkers` response logic for activities.
- **Code Mode Stability Enhancements** — Reconfigured `vm.Script` into LRU buffers yielding significant performance savings during repetitious loops. Utilized `process.memoryUsage.rss()` to stabilize metric loads across Windows operations. 

### Fixed
- **Documentation Refresh** — Consolidated instructions rectifying incorrect feature listings, parameter omissions (like `includeRowCounts`), output inconsistencies, and false `test-tools.md` threshold metrics. Fixed internal Code Mode capabilities stating incorrect subset limits.
- **Introspection/Migration Quality Improvements:**
  - Added filter boundaries ignoring extension-owned architectures (`topology`, `cron`, `tiger`) when examining graphs or building schema mapping.
  - Eliminated cyclic-reference locks within topological DDL sorting tools processing recursive rows. 
  - Restored true NO ACTION severity constraints during Cascade Simulator procedures rather than coalescing RESTRICT rules universally.
- **Runtime Overheads** — Pinned `.gitignore` constraints preventing accidental local artifacts like `.eslintcache`, test output `.nyc_output`, and `build` volumes.
- **Dependencies** — Incremented `@modelcontextprotocol/sdk` (1.26.0 -> 1.27.1), Postgres packages, and base TypeScript nodes. Passed Trivy and security resolution patches across `@types/node`. 

### Removed
- **Worker Isolation Mechanism** — Abstracted and permanently wiped out unused, un-operational `worker_threads` mode files configuring `Code Mode` dependencies. 
- **Non-Functional Graphing Variables** — Eliminated `includeIndexes` dummy parameter inside Dependency schemas causing confusion against active constraints.

## [1.3.0] - 2026-02-15

### Added
- **Core Tool Enhancements**: Added `schema.table` parsing format support to text, admin, postgis, citext, and ltree tools.
- **Top-Level Code Mode Aliases**: Added comprehensive top-level convenience aliases to Code Mode for all major tool groups including core, performance, admin, monitoring, backup, text, jsonb, postgis, cron, citext, ltree, pgcrypto, and transaction tools.
- **Dependency Updates**: Bumped `@modelcontextprotocol/sdk` to v1.4.1, `hono` to v4.12.0, `pg` to v8.18.1, `uuid` to v11.1.0, and `zod` to v3.24.2.

### Changed
- **Payload Optimization Defaults**: Implemented strict default payload limits (typically 20-50 rows) with standard truncation metadata (`truncated: true` and `totalCount`) across all tool groups.
- **Documentation Standardization**: Synchronized `ServerInstructions.ts` to fully document aliases, edge case behaviors, and correct response structures across all tool groups.
- **Code Mode Transaction Cleanup**: Implemented automatic rollback and cleanup logic for orphaned transactions during failed or timed-out Code Mode executions.
- **JSONB Alias Resolution**: Standardized `tableName`, `col`, and `filter` aliases across JSONB tools using the Split Schema pattern.

### Fixed
- **Direct MCP Aliasing (Split Schema)**: Remediated an issue where tool parameter aliases (e.g., `tableName` for `table`) were invisible or triggered validation errors during Direct Tool Calls by universally adopting the Split Schema pattern.
- **Kcache Race Conditions**: Added guard logic (`Math.max(totalCount, rowCount)`) to prevent result inflation between COUNT and main queries.
- **Vector Payload Exhaustion**: Addressed JSON-RPC size limitations for large embeddings by returning compact summaries by default in `pg_vector_embed`, `pg_vector_cluster`, and `pg_vector_aggregate` tools.
- **Partitioning Error Handling**: Upgraded partitioning tools to output structured `{success: false, error}` blocks instead of crashing when parents or children do not exist.
- **Object Extraction Edge Cases**: Corrected `schema.table` name parsing, negative index formatting, and strict type handling across the schema, text, partman, and cron tool subsets.

## [1.2.0] - 2026-02-05

### Added
- **Vector Tool Filters**: Integrated `pg_vector_batch_insert` directly into the MCP tool list.
- **Dependency Updates**: Bumped `@modelcontextprotocol/sdk` to v1.26.0, `commander` to v14.0.3, `globals` to v17.3.0, `pg` to v8.18.0, and `typescript-eslint` to v8.55.0.

### Changed
- **Code Hygiene**: Systematically eliminated ~43 unnecessary `eslint-disable` lines to improve static analysis fidelity.

### Fixed
- **Object Existence Verification (P154)**: Hardened vector tools to independently verify table and column existence before mutating or analyzing data.
- **Default Parameter Masking**: Fixed MCP conversion of the `.default({})` schema on `pg_pgcrypto_gen_random_uuid`, restoring visibility of the `count` parameter.
- **Kcache Truncation Safety**: Ensured correct truncation calculations and reduced default limits across all kcache query modules.
- **PostGIS SRID Auto-Detection**: Repaired `fromSrid` auto-detection logic within `pg_geo_transform`.

## [1.1.0] - 2026-01-29

### Added
- **Progress Infrastructure**: Implemented MCP 2025-11-25 compliant progress notifications (`sendProgress`) for long-running administrative and backup operations like `pg_vacuum`, `pg_analyze`, and `pg_copy_export`.
- **Output Schema Compliance**: Annotated all 200+ tools with structured `outputSchema` definitions to comply with modern MCP capabilities.
- **Parameterized WHERE Clauses**: Added `params` array support to all stats tools for dynamic filtering.

### Changed
- **Tool Registration Mechanism**: Migrated from deprecated `server.tool()` to `server.registerTool()` per MCP 2025-11-25 standards.
- **Dependency Updates**: Bumped `@modelcontextprotocol/sdk`, `@types/node`, `globals`, `hono`, and `typescript-eslint`.
- **Method Aliasing Enhancements**: Mapped `soundex` and `metaphone` code mode functions appropriately and expanded parameter tracking.

### Fixed
- **Zod Output Validation Errors**: Addressed restrictive schema validation errors crashing valid payloads on tool invocation across jsonb, vector, cron, and performance modules.
- **DDL Validation**: Remedied DDL response errors correctly assigning `0` when `rowsAffected` was `undefined`.
- **Alias Handling**: Added proper extension map normalization for aliases, including `pgvector` → `vector` and `partman` → `pg_partman`.

### Security
- **SQL Injection Prevention**: Hardened text and vector tools with blocklists against dangerous SQL patterns (`UNION SELECT`, `--`, `pg_sleep`).
- **Log Sanitization**: Upgraded logger class with `sanitizeStack()` and taint-breaking techniques to mask sensitive OAuth fields and limit control character insertion.
- **Vulnerability Remediation**: Patched Docker image build dependencies and resolved CodeQL static analysis findings.

## [1.0.0] - 2026-01-24

### Added
- **First Stable Release**: Completed rewrite from Python to a robust Node.js 24 LTS and TypeScript baseline, encapsulating 194 specialized PostgreSQL tools.
- **Dual Transport Protocol**: Delivered stable implementations of the standard stdio and streamable HTTP/SSE transport modes with comprehensive OAuth 2.1 authentication and RFC 9728 support.
- **Advanced Ecosystem Extensions**: Standardized first-class support for `pg_cron`, `pg_partman`, `pg_stat_kcache`, `citext`, `ltree`, and `pgcrypto` tools.
- **Structural Resilience**: Introduced built-in connection pooling, health probes, and query timeout handling.
- **Developer Experience**: Migrated code to highly modular sub-directories. Packaged system for distribution across Docker Hub (multi-platform) and NPM.

### Changed
- **Tool Level Classifications**: Embedded semantic, behavior-driven MCP Annotations, including destructiveness indicators and role-based prioritization.
- **Payload Safety Guardrails**: Hardened limits and pagination defaults on high-cardinality operations resulting in an 85% reduction in context window footprint.

### Fixed
- **Cross-Platform Compatibility**: Eliminated Windows/Linux path resolution faults and environment loading constraints.
- **Result Summarization**: Refactored buffer and extraction payloads to leverage simplified geometries. 

### Security
- **Advanced Environment Hardening**: Introduced 100 requests/minute rate-limiting, size guardrails, and Strict-Transport-Security settings to HTTP transport.
- **Static Analysis Compliance**: Repaired clear-text logging issues and removed unreferenced payloads resolving CodeQL findings.

## [0.2.0] - 2025-12-14

### Added
- **Expanded Capabilities**: Stabilized 146 tools across 11 groups including performance, text, JSONB, and administrative functions.

### Changed
- **Status Upgrade**: Graduated from Development Preview to Initial Implementation Complete.

## [0.1.0] - 2025-12-13

### Added
- **Initial Setup**: Established repository foundation, GitHub automation, and 106 base tools with connection pool scaffolding.
