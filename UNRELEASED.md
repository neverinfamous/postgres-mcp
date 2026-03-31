## [Unreleased]

### Added
- Transport-agnostic Auth module (`src/auth/transport-agnostic.ts`)
- OAuth enhancements supporting `SCOPE_PATTERNS`, `BASE_SCOPES`, and RFC 6750
- Audit subsystem with session token estimates, JSONL logging, redaction, and `pg_audit_*` tools
- Worker-thread Code Mode sandbox with resource limits and an RPC bridge
- Configurable server timeouts (`MCP_REQUEST_TIMEOUT`, `MCP_HEADERS_TIMEOUT`) for Slowloris DoS protection
- DNS rebinding protection via `validateHostHeader()`
- Rate limiting bypass for `/health` and `Retry-After` header propagation
- 13 new statistics and admin tools including `pg_stats_row_number`, `pg_stats_outliers`, and `pg_append_insight`
- `pg_jsonb_pretty` tool for JSON formatting
- Filter-aware instruction generation based on tool filters and verbosity levels
- 22 group-specific help resources accessible via `postgres://help`
- Playwright E2E coverage for Code Mode, authentication, and backups
- Advanced stress test Code Mode prompts for the `monitoring`, `schema`, and `partitioning` tool groups

### Changed
- Explicitly mandate session-level token tracking via `postgres://audit` in all testing prompts
- Refactored advanced stress testing suite into logic-based modular parts
- **BREAKING**: Core write tools now require `write` scope; destructive tools require `admin`
- Expanded `PostgresMcpError` to track categories, suggestions, and serialization context
- Centralized default connection pool timeout to 30,000ms
- Standardized file and directory names to kebab-case convention
- Modularized 20+ large files into smaller components
- Minimized tool payload size (~30-41% token reduction) by collapsing repetitive properties
- Optimized stats and admin tool responses to conditionally omit empty arrays
- Default `pg_schema_snapshot` to `compact: true` to significantly reduce payload footprint
- Optimized Zod schema evaluation logic for faster execution speed
- Applied `openWorldHint: false` to all 231 tools
- Reduced npm package size by excluding source maps and tests
- Refactored Vitest test suite to use SWC compilation
- Updated npm dependencies (`@modelcontextprotocol/sdk`, `typescript`, `typescript-eslint`)
- Updated `.env.example` templates and README context
- Restrict max limits across all pg_stat_kcache resource tools to 25 to prevent context window payload bloat

### Removed
- Obsolete shortcut action bundles (`META_GROUPS`)
- Unused `hono` router dependency

### Fixed
- Migration rollback transaction isolation to prevent unmanaged auto-commits
- Missing `success: true` properties and P154 error structures across all 230+ tools
- Docker Hub rate-limit blocks during multi-arch image pipelines by enforcing authenticated pulls
- Schema state invalidation missing DDL regex detection
- Code Mode evaluation bypasses on readonly fields, schema errors, and exposed aliases
- Memory limit exhaustion by enforcing defaults on unbounded queries
- Backup restoration ordering and sequence defects
- Introspection cascade simulator truncating self-referencing foreign keys
- Partman initialization routines failing on missing child tables
- Scientific notation serialization bug in database seed script generating intervals
- Inaccurate tool test instructions requiring superfluous parameters
- Inconsistent 'does not exist' error messaging in `stats` tools
- Zod validation leak returning schema errors instead of handler exceptions in `stats` tools
- Split Schema violations and ad-hoc validation logic overriding structures in `admin` tools
- Empty array rendering in `pg_schema_snapshot` payloads
- Insufficient validation constraints on `pg_text_sentiment` permitting empty analysis payloads
- Missing positional mappings for Introspection and Migration Code Mode tool aliases
- Transaction ID propagation gaps in `text` and `vector` tools
- Massive gap of 92 unlisted tool executions across 36 direct and Code Mode deterministic testing checklists
- Unhandled P154 validation database exceptions in `pg_text_search` and `pg_create_fts_index`
- Missing error parser mapping for invalid input syntax types resulting in generic errors
- Javascript string arithmetic bugs in transaction boundary tests
- Internal `compact` boolean flag leaking into `pg_schema_snapshot` JSON response structures
- Inaccurate parameter references and misattributions within advanced stress testing documentation
- Restored missing `pg_ltree_lca` constraint to properly handle single paths and common ancestors
- Refined jsonb validation instructions indicating query paths
- Removed mismatched `pg_capacity_planning` and `pg_pgcrypto_hash` tests from the `stats` and `vector` test sections in `test-tools-advanced-2.md`
- Missing targetTable parameters within `test-tools-advanced-3` partman execution directives
- Replaced generic PG query exceptions in `pg_distance` and `pg_point_in_polygon` out-of-bounds checks with specific `ValidationError` structures (P154 compliance)
- Corrected inaccuracies in `test-tools-advanced-3.md` removing obsolete `pg_ltree_match` and `pg_citext_schema_advisor` tool names and rectifying assumed implicit kwargs in postgis coordinate tests
- Reduced `pg_kcache` top resource query tool default unbounded limits (`limit: 0`) from `25` down to `10` to prevent token exhaustion payload bloat
- Added explicit validation rejecting `path: ""` (empty string) in `pg_ltree_query` to prevent unbounded match-all payload exhaustion
- Missing column headers in `pg_copy_export` empty table payloads
- Unbounded payloads in `pg_copy_export` exceeding 50KB strings causing context window exhaustion

### Security
- Replaced raw postgres exceptions with explicit `PostgresMcpError` classes preventing SQL syntax leaks
- Enforced SLSA Build L3 compliance via `--provenance` in NPM publishing workflows
