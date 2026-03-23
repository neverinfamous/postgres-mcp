# postgres-mcp Code Map

> **Agent-optimized navigation reference.** Read this before searching the codebase. Covers directory layout, handler→tool mapping, type/schema locations, error hierarchy, and key constants.
>
> Last updated: March 22, 2026

---

## Directory Tree

```
src/
├── cli.ts                          # CLI entry point (delegates to cli/ submodules)
├── index.ts                        # Barrel re-export for library consumers
│
├── cli/
│   ├── args.ts                     # Argument parsing, transport selection
│   ├── config.ts                   # DB/OAuth config builders
│   ├── server.ts                   # stdio/HTTP server starters
│   └── index.ts                    # Barrel
│
├── server/
│   └── mcp-server.ts              # McpServer setup, adapter registration, tool/resource/prompt wiring
│
├── types/                          # Core TypeScript types (barrel: types/index.ts)
│   ├── index.ts                    # Barrel — also re-exports error classes from errors.ts
│   ├── database.ts                 # DatabaseConfig, PostgresOptions, PoolConfig, PoolStats, HealthStatus,
│   │                               #   QueryResult, ColumnInfo, FieldInfo, TableInfo
│   ├── schema.ts                   # SchemaInfo, IndexInfo
│   ├── mcp.ts                      # TransportType
│   ├── oauth.ts                    # OAuthConfig, OAuthScope, TokenClaims, RequestContext
│   ├── errors.ts                   # PostgresMcpError base + 7 subclasses (see § Error Classes)
│   ├── filtering.ts                # ToolGroup, MetaGroup, ToolFilterRule, ToolFilterConfig
│   └── adapters.ts                 # AdapterCapabilities, ToolDefinition, ResourceDefinition, PromptDefinition
│
├── constants/
│   ├── server-instructions.ts      # Generated: generateInstructions() + HELP_CONTENT map (composable, filter-aware)
│   └── server-instructions/        # Source .md files for each help resource (22 files: overview, gotchas, jsonb, text, stats, etc.)
│
├── filtering/
│   ├── tool-constants.ts           # TOOL_GROUPS arrays, META_GROUPS shortcuts, group→tools map
│   └── tool-filter.ts              # ToolFilter class — parse/apply --tool-filter, getEnabledGroups()
│
├── utils/
│   ├── logger.ts                   # Logger class (structured JSON, severity filtering, SENSITIVE_KEY_LIST)
│   ├── module-logger.ts            # ModuleLogger class (per-module logger wrapper)
│   ├── query-helpers.ts            # coerceNumber(), coerceLimit(), buildLimitClause(), DEFAULT_QUERY_LIMIT, toStr()
│   ├── identifiers.ts              # SQL identifier validation/sanitization
│   ├── annotations.ts              # MCP tool annotation presets (READ_ONLY, WRITE, etc. with openWorldHint)
│   ├── icons.ts                    # MCP icon definitions per tool group
│   ├── fts-config.ts               # Full-text search configuration helpers
│   ├── insights-manager.ts         # In-memory InsightsManager for pg_append_insight / postgres://insights
│   ├── progress-utils.ts           # MCP progress notification helpers
│   ├── resource-annotations.ts     # MCP resource annotation helpers
│   ├── version.ts                  # SSoT version constant (reads package.json)
│   ├── where-clause.ts             # WHERE clause builder/validator
│   └── error-suggestions.ts        # Pattern-based error suggestions + findSuggestion() (auto-refinement)
│
├── pool/
│   └── connection-pool.ts          # PostgreSQL connection pool manager (pg)
│
├── auth/                           # OAuth 2.1 implementation (11 files)
│   ├── transport-agnostic.ts       # Transport-agnostic auth (createAuthenticatedContext, validateAuth, formatOAuthError)
│   ├── middleware.ts               # Express-style middleware (re-exports shared types from transport-agnostic.ts)
│   ├── token-validator.ts          # JWT/JWKS token validation
│   ├── scopes.ts                   # Scope parsing, enforcement
│   ├── scope-map.ts                # Tool→scope mapping
│   ├── auth-context.ts             # Request context builder (AsyncLocalStorage)
│   ├── oauth-resource-server.ts    # RFC 9728 /.well-known/oauth-protected-resource
│   ├── authorization-server-discovery.ts  # RFC 8414 auth server metadata discovery
│   ├── errors.ts                   # OAuth-specific error classes
│   ├── types.ts                    # OAuth TypeScript types
│   └── index.ts                    # Barrel
│
├── transports/
│   ├── index.ts                    # Barrel
│   └── http/
│       ├── server.ts               # HTTP/SSE transport orchestrator
│       ├── streamable.ts           # Streamable HTTP transport handler
│       ├── stateless.ts            # Stateless HTTP transport handler
│       ├── legacy-sse.ts           # Legacy SSE transport handler
│       ├── handlers.ts             # Route handlers (POST /mcp, GET /sse, health, etc.)
│       ├── security.ts             # Security headers, rate limiting, CORS, DNS rebinding (validateHostHeader), body parsing
│       ├── types.ts                # HTTP transport types
│       └── index.ts                # Barrel
│
├── codemode/                       # Code Mode sandbox (secure JS execution)
│   ├── sandbox.ts                  # VM-based SandboxPool lifecycle manager (default mode)
│   ├── worker-sandbox.ts           # Worker-thread sandbox (true V8 isolate with ResourceLimits)
│   ├── worker-script.ts            # Worker entry point (pg.* Proxy API + vm.createContext)
│   ├── sandbox-factory.ts          # Mode selection factory (vm | worker)
│   ├── auto-return.ts              # Last-expression auto-return transform (IIFE helper)
│   ├── security.ts                 # Code validation (blocked patterns, injection prevention)
│   ├── types.ts                    # Sandbox TypeScript types (SecurityConfig, RpcRequest/Response)
│   ├── index.ts                    # Barrel
│   └── api/                        # pg.* API bridge (unique to postgres-mcp)
│       ├── index.ts                # Main API bridge — exposes tools to sandbox
│       ├── maps.ts                 # Tool name → handler function mapping (22KB)
│       ├── group-api.ts            # Per-group API surface generation
│       ├── aliases.ts              # Tool alias resolution (15KB)
│       └── normalize.ts            # Parameter normalization utilities
│
├── adapters/
│   ├── database-adapter.ts         # Abstract DatabaseAdapter base class
│   │
│   └── postgresql/                 # ── PostgreSQL adapter (pg) ──
│       ├── postgres-adapter.ts     # PostgresAdapter class (extends DatabaseAdapter)
│       ├── transaction-operations.ts  # Transaction helper operations (extracted from adapter)
│       ├── index.ts                # Barrel
│       ├── schema-operations/      # Schema introspection queries
│       │   ├── describe.ts         # Table/column metadata queries
│       │   ├── list.ts             # List tables/schemas/indexes
│       │   └── index.ts            # Barrel
│       ├── schemas/                # Zod schemas (see § below)
│       ├── prompts/                # 13+ MCP prompts (see § below)
│       ├── resources/              # 21 MCP data resources (see § below)
│       └── tools/                  # Tool handler files (see § Handler Map below)
```

---

## Handler → Tool Mapping

245 tools across 22 groups. Each handler file registers tools with `group` labels.

### Tool Handlers (`src/adapters/postgresql/tools/`)

| Group | Handler File(s) | Tools | Description |
|-------|----------------|-------|-------------|
| **codemode** | `codemode/index.ts` | 1 | `pg_execute_code` |
| **core** | `core/query.ts` | 2 | `pg_read_query`, `pg_write_query` |
| | `core/tables.ts` | 4 | `pg_list_tables`, `pg_describe_table`, `pg_create_table`, `pg_drop_table` |
| | `core/indexes.ts` | 3 | `pg_get_indexes`, `pg_create_index`, `pg_drop_index` |
| | `core/objects.ts` | 3 | `pg_list_objects`, `pg_object_details`, `pg_list_extensions` |
| | `core/convenience.ts` | 2 | `pg_upsert`, `pg_batch_insert` |
| | `core/health.ts` | 3 | `pg_analyze_db_health`, `pg_analyze_workload_indexes`, `pg_analyze_query_indexes` |
| | `core/utility.ts` | 3 | `pg_count`, `pg_exists`, `pg_truncate` |
| | `core/error-helpers.ts` | — | Shared `formatHandlerError()` orchestrator (~4KB) |
| | `core/error-parser.ts` | — | PG error code→message parser (~14KB) |
| | `core/schemas/input.ts` | — | Zod input schemas for core tools |
| | `core/schemas/output.ts` | — | Zod output schemas for core tools |
| | `core/convenience-schemas.ts` | — | Zod schemas for convenience tools |
| **transactions** | `transactions.ts` | 8 | `pg_transaction_begin/commit/rollback/savepoint/release/rollback_to/execute/status` |
| **jsonb** | `jsonb/read.ts` | 3 | `pg_jsonb_extract`, `pg_jsonb_contains`, `pg_jsonb_path_query` |
| | `jsonb/write.ts` | 6 | `pg_jsonb_set`, `pg_jsonb_insert`, `pg_jsonb_delete`, `pg_jsonb_object`, `pg_jsonb_array`, `pg_jsonb_strip_nulls` |
| | `jsonb/write-builders.ts` | — | Builder helpers for object, array, stripNulls operations |
| | `jsonb/transform.ts` | 4 | `pg_jsonb_validate_path`, `pg_jsonb_merge`, `pg_jsonb_normalize`, `pg_jsonb_diff` |
| | `jsonb/query.ts` | 3 | `pg_jsonb_agg`, `pg_jsonb_keys`, `pg_jsonb_typeof` |
| | `jsonb/analytics.ts` | 3 | `pg_jsonb_index_suggest`, `pg_jsonb_security_scan`, `pg_jsonb_stats` |
| | `jsonb/pretty.ts` | 1 | `pg_jsonb_pretty` |
| **text** | `text/fts.ts` | 4 | `pg_text_search`, `pg_text_rank`, `pg_text_headline`, `pg_create_fts_index` |
| | `text/matching.ts` | 3 | `pg_trigram_similarity`, `pg_fuzzy_match`, `pg_regexp_match` |
| | `text/search.ts` | 4 | `pg_text_normalize`, `pg_text_to_vector`, `pg_text_to_query`, `pg_text_search_config` |
| | `text/search-tools.ts` | 2 | `pg_like_search`, `pg_text_sentiment` |
| **stats** | `stats/basic.ts` | 2 | `pg_stats_correlation`, `pg_stats_regression` |
| | `stats/descriptive.ts` | 2 | `pg_stats_descriptive`, `pg_stats_percentiles` |
| | `stats/distribution.ts` | 1 | `pg_stats_distribution` |
| | `stats/hypothesis.ts` | 1 | `pg_stats_hypothesis` |
| | `stats/sampling.ts` | 1 | `pg_stats_sampling` |
| | `stats/time-series.ts` | 1 | `pg_stats_time_series` |
| | `stats/window.ts` | 6 | `pg_stats_row_number`, `pg_stats_rank`, `pg_stats_lag_lead`, `pg_stats_running_total`, `pg_stats_moving_avg`, `pg_stats_ntile` |
| | `stats/outlier.ts` | 1 | `pg_stats_outliers` |
| | `stats/advanced.ts` | 4 | `pg_stats_top_n`, `pg_stats_distinct`, `pg_stats_frequency`, `pg_stats_summary` |
| | `stats/math-utils.ts` | — | Statistical math helpers |
| | `stats/validators.ts` | — | Input validators for stats tools |
| **performance** | `performance/explain.ts` | 3 | `pg_explain`, `pg_explain_analyze`, `pg_explain_buffers` |
| | `performance/query-stats.ts` | 3 | `pg_stat_statements`, `pg_stat_activity`, `pg_query_plan_stats` |
| | `performance/analysis.ts` | 2 | `pg_seq_scan_tables`, `pg_index_recommendations` |
| | `performance/optimization.ts` | 3 | `pg_performance_baseline`, `pg_connection_pool_optimize`, `pg_partition_strategy_suggest` |
| | `performance/catalog-stats.ts` | 3 | `pg_index_stats`, `pg_table_stats`, `pg_vacuum_stats` |
| | `performance/index-analysis.ts` | 2 | `pg_unused_indexes`, `pg_duplicate_indexes` |
| | `performance/monitoring.ts` | 3 | `pg_locks`, `pg_bloat_check`, `pg_cache_hit_ratio` |
| | `performance/diagnostics.ts` | 1 | `pg_diagnose_database_performance` |
| | `performance/connection-analysis.ts` | 1 | `pg_detect_connection_spike` |
| | `performance/compare.ts` | 1 | `pg_query_plan_compare` |
| | `performance/anomaly-detection.ts` | 2 | `pg_detect_query_anomalies`, `pg_detect_bloat_risk` |
| **monitoring** | `monitoring/basic.ts` | 8 | `pg_database_size`, `pg_table_sizes`, `pg_connection_stats`, `pg_replication_status`, `pg_server_version`, `pg_show_settings`, `pg_uptime`, `pg_recovery_status` |
| | `monitoring/capacity-planning.ts` | 1 | `pg_capacity_planning` |
| | `monitoring/resource-usage.ts` | 1 | `pg_resource_usage_analyze` |
| | `monitoring/alert-thresholds.ts` | 1 | `pg_alert_threshold_set` |
| **admin** | `admin/vacuum-tools.ts` | 3 | `pg_vacuum`, `pg_vacuum_analyze`, `pg_analyze` |
| | `admin/backend-tools.ts` | 3 | `pg_terminate_backend`, `pg_cancel_backend`, `pg_reindex` |
| | `admin/config-tools.ts` | 4 | `pg_reload_conf`, `pg_set_config`, `pg_reset_stats`, `pg_cluster` |
| | `admin/insights.ts` | 1 | `pg_append_insight` |
| **backup** | `backup/dump.ts` | 2 | `pg_dump_table`, `pg_dump_schema` |
| | `backup/copy.ts` | 2 | `pg_copy_export`, `pg_copy_import` |
| | `backup/planning.ts` | 5 | `pg_create_backup_plan`, `pg_restore_command`, `pg_backup_physical`, `pg_restore_validate`, `pg_backup_schedule_optimize` |
| **schema** | `schema/catalog.ts` | 3 | `pg_list_functions`, `pg_list_triggers`, `pg_list_constraints` |
| | `schema/objects.ts` | 6 | `pg_list_schemas`, `pg_create_schema`, `pg_drop_schema`, `pg_list_sequences`, `pg_create_sequence`, `pg_drop_sequence` |
| | `schema/views.ts` | 3 | `pg_list_views`, `pg_create_view`, `pg_drop_view` |
| **partitioning** | `partitioning/info.ts` | 3 | `pg_attach_partition`, `pg_detach_partition`, `pg_partition_info` |
| | `partitioning/management.ts` | 3 | `pg_list_partitions`, `pg_create_partitioned_table`, `pg_create_partition` |
| **vector** | `vector/data.ts` | 2 | `pg_vector_create_extension`, `pg_vector_add_column` |
| | `vector/data-insert.ts` | 2 | `pg_vector_insert`, `pg_vector_batch_insert` |
| | `vector/search.ts` | 2 | `pg_vector_search`, `pg_vector_create_index` |
| | `vector/search-advanced.ts` | 2 | `pg_hybrid_search`, `pg_vector_performance` |
| | `vector/math.ts` | 2 | `pg_vector_distance`, `pg_vector_normalize` |
| | `vector/aggregate.ts` | 2 | `pg_vector_aggregate`, `pg_vector_validate` |
| | `vector/cluster.ts` | 1 | `pg_vector_cluster` |
| | `vector/management.ts` | 3 | `pg_vector_index_optimize`, `pg_vector_dimension_reduce`, `pg_vector_embed` |
| **postgis** | `postgis/setup.ts` | 3 | `pg_postgis_create_extension`, `pg_geometry_column`, `pg_spatial_index` |
| | `postgis/query.ts` | 5 | `pg_point_in_polygon`, `pg_distance`, `pg_buffer`, `pg_intersection`, `pg_bounding_box` |
| | `postgis/spatial-analysis.ts` | 2 | `pg_geo_index_optimize`, `pg_geo_cluster` |
| | `postgis/advanced.ts` | 2 | `pg_geocode`, `pg_geo_transform` |
| | `postgis/standalone.ts` | 3 | `pg_geometry_buffer`, `pg_geometry_intersection`, `pg_geometry_transform` |
| **cron** | `cron/scheduling.ts` | 4 | `pg_cron_create_extension`, `pg_cron_schedule`, `pg_cron_schedule_in_database`, `pg_cron_unschedule` |
| | `cron/management.ts` | 4 | `pg_cron_alter_job`, `pg_cron_list_jobs`, `pg_cron_job_run_details`, `pg_cron_cleanup_history` |
| **partman** | `partman/create.ts` | 2 | `pg_partman_create_extension`, `pg_partman_create_parent` |
| | `partman/management.ts` | 3 | `pg_partman_run_maintenance`, `pg_partman_show_partitions`, `pg_partman_show_config` |
| | `partman/retention.ts` | 1 | `pg_partman_set_retention` |
| | `partman/health-analysis.ts` | 2 | `pg_partman_undo_partition`, `pg_partman_analyze_partition_health` |
| | `partman/operations.ts` | 2 | `pg_partman_check_default`, `pg_partman_partition_data` |
| | `partman/helpers.ts` | — | Shared partman helpers |
| **kcache** | `kcache/admin.ts` | 4 | `pg_kcache_create_extension`, `pg_kcache_database_stats`, `pg_kcache_resource_analysis`, `pg_kcache_reset` |
| | `kcache/query.ts` | 3 | `pg_kcache_query_stats`, `pg_kcache_top_cpu`, `pg_kcache_top_io` |
| | `kcache/helpers.ts` | — | Shared kcache helpers |
| **citext** | `citext/setup.ts` | 2 | `pg_citext_create_extension`, `pg_citext_convert_column` |
| | `citext/list-compare.ts` | 2 | `pg_citext_list_columns`, `pg_citext_compare` |
| | `citext/candidates-advisor.ts` | 2 | `pg_citext_analyze_candidates`, `pg_citext_schema_advisor` |
| **ltree** | `ltree/basic.ts` | 5 | `pg_ltree_create_extension`, `pg_ltree_query`, `pg_ltree_subpath`, `pg_ltree_lca`, `pg_ltree_list_columns` |
| | `ltree/operations.ts` | 3 | `pg_ltree_match`, `pg_ltree_convert_column`, `pg_ltree_create_index` |
| **pgcrypto** | `pgcrypto.ts` | 9 | `pg_pgcrypto_create_extension`, `pg_pgcrypto_hash`, `pg_pgcrypto_hmac`, `pg_pgcrypto_encrypt`, `pg_pgcrypto_decrypt`, `pg_pgcrypto_gen_random_uuid`, `pg_pgcrypto_gen_random_bytes`, `pg_pgcrypto_gen_salt`, `pg_pgcrypto_crypt` |
| **introspection** | `introspection/graph.ts` | 3 | `pg_dependency_graph`, `pg_topological_sort`, `pg_cascade_simulator` |
| | `introspection/analysis.ts` | 2 | `pg_constraint_analysis`, `pg_migration_risks` |
| | `introspection/snapshot.ts` | 1 | `pg_schema_snapshot` |
| **migration** | `introspection/migration.ts` | 3 | `pg_migration_init`, `pg_migration_record`, `pg_migration_apply` |
| | `introspection/migration-query.ts` | 3 | `pg_migration_rollback`, `pg_migration_history`, `pg_migration_status` |

---

## Zod Schemas (`src/adapters/postgresql/schemas/`)

Per-group Zod schema files (unlike mysql-mcp's monolithic 72KB file):

| Subdirectory / File | Groups Covered |
|---------------------|---------------|
| `index.ts` | Barrel (re-exports `core-exports.ts` + `extension-exports.ts`) |
| `core-exports.ts` | Core schema barrel exports |
| `extension-exports.ts` | Extension schema barrel exports |
| `error-response-fields.ts` | Shared `ErrorResponseFields` — merged into all 100 output schemas via `.extend()` |
| `core/queries.ts` | Core read/write query schemas |
| `core/transactions.ts` | Transaction schemas |
| `core/index-schemas.ts` | Index operation schemas |
| `jsonb/basic.ts` | JSONB read/write/transform schemas |
| `jsonb/advanced.ts` | JSONB analytics/validation schemas |
| `jsonb/pretty.ts` | JSONB pretty-print schemas |
| `jsonb/utils.ts` | Path normalization, preprocessing helpers |
| `extensions/citext.ts` | Citext schemas |
| `extensions/ltree.ts` | Ltree schemas |
| `extensions/pgcrypto.ts` | pgcrypto schemas |
| `extensions/kcache.ts` | pg_stat_kcache schemas |
| `extensions/shared.ts` | Shared extension schemas |
| `stats/base-schemas.ts` | Statistics base schemas |
| `stats/input.ts` | Statistics input schemas |
| `stats/output.ts` | Statistics output schemas |
| `stats/preprocessing.ts` | Statistics preprocessing helpers |
| `stats/window.ts` | Window function schemas |
| `stats/advanced.ts` | Advanced analysis + outlier detection schemas |
| `introspection/input.ts` | Introspection input schemas |
| `introspection/output.ts` | Introspection output schemas |
| `partitioning/range.ts` | Range partitioning schemas |
| `partitioning/list.ts` | List partitioning schemas |
| `partitioning/preprocess.ts` | Alias resolution, bounds construction |
| `postgis/basic.ts` | PostGIS basic schemas |
| `postgis/advanced.ts` | PostGIS advanced input schemas |
| `postgis/output.ts` | PostGIS output schemas (16 schemas) |
| `postgis/utils.ts` | Preprocessing, coordinate helpers |
| `partman/input.ts` | Partman input schemas |
| `partman/output.ts` | Partman output schemas |
| `vector/input.ts` | Vector input schemas |
| `vector/output.ts` | Vector output schemas |
| Plus: `admin.ts`, `backup.ts`, `cron.ts`, `monitoring.ts`, `performance.ts`, `schema-mgmt.ts`, `text-search.ts` |

---

## Prompts (`src/adapters/postgresql/prompts/`)

13+ prompt definitions:

| File | Prompts |
|------|---------| 
| `index.ts` | Barrel + `pg_optimization`, `pg_health_check` |
| `backup.ts` | `pg_backup_strategy` |
| `citext.ts` | `pg_citext_setup` |
| `extension-setup.ts` | `pg_extension_setup` |
| `health.ts` | `pg_health_diagnosis` |
| `index-tuning.ts` | `pg_index_tuning` |
| `kcache.ts` | `pg_kcache_setup` |
| `ltree.ts` | `pg_ltree_setup` |
| `partman.ts` | `pg_partman_setup` |
| `pgcron.ts` | `pg_cron_setup` |
| `pgcrypto.ts` | `pg_crypto_setup` |
| `pgvector.ts` | `pg_vector_setup` |
| `postgis.ts` | `pg_postgis_setup` |

---

## Resources (`src/adapters/postgresql/resources/`)

21 data resources + 22+ help resources providing read-only metadata and agent guidance:

### Data Resources

| File | Resources |
|------|-----------|
| `schema.ts` | `postgres://schema` |
| `tables.ts` | `postgres://tables` |
| `indexes.ts` | `postgres://indexes` |
| `settings.ts` | `postgres://settings/{category}` |
| `health.ts` | `postgres://health` |
| `pool.ts` | `postgres://pool` |
| `capabilities.ts` | `postgres://capabilities` |
| `performance.ts` | `postgres://performance/{view}` |
| `stats.ts` | `postgres://stats/{table}` |
| `vacuum.ts` | `postgres://vacuum/{info}` |
| `replication.ts` | `postgres://replication/{view}` |
| `locks.ts` | `postgres://locks` |
| `activity.ts` | `postgres://activity` |
| `extensions.ts` | `postgres://extensions` |
| `cron.ts` | `postgres://cron/{view}` |
| `partman.ts` | `postgres://partman/{view}` |
| `kcache.ts` | `postgres://kcache/{view}` |
| `postgis.ts` | `postgres://postgis/{view}` |
| `vector.ts` | `postgres://vector/{table}` |
| `crypto.ts` | `postgres://crypto/{info}` |
| `insights.ts` | `postgres://insights` |

### Help Resources (registered dynamically by McpServer)

| URI | Source | Content |
|-----|--------|---------|
| `postgres://help` | `server-instructions/overview.md` + `gotchas.md` | Gotchas, aliases, Code Mode API — always available |
| `postgres://help/{group}` | `server-instructions/{group}.md` | Per-group tool reference — filtered by `--tool-filter` |

22 group-specific help resources (one per tool group). Only groups enabled by `--tool-filter` are registered.

---

## Error Class Hierarchy

All errors extend `PostgresMcpError` (defined in `src/types/errors.ts`). Every tool returns structured `ErrorResponse` objects — never raw MCP exceptions.

```
PostgresMcpError (types/errors.ts)                code: string, details?: Record
├── ConnectionError              code: CONNECTION_ERROR
├── PoolError                    code: POOL_ERROR
├── QueryError                   code: QUERY_ERROR          (auto-refined → TABLE_NOT_FOUND, etc.)
├── AuthenticationError          code: AUTHENTICATION_ERROR
├── AuthorizationError           code: AUTHORIZATION_ERROR
├── ValidationError              code: VALIDATION_ERROR     (auto-refined → COLUMN_NOT_FOUND, etc.)
├── TransactionError             code: TRANSACTION_ERROR
└── ExtensionNotAvailableError   code: EXTENSION_NOT_AVAILABLE    (unique to postgres-mcp)
```

**Auto-refinement** — `PostgresMcpError` constructor calls `findSuggestion(message)` from `utils/error-suggestions.ts`. Generic codes in `REFINABLE_CODES` (`QUERY_ERROR`, `VALIDATION_ERROR`, `RESOURCE_ERROR`, `UNKNOWN_ERROR`) are auto-refined to specific codes when a pattern match provides one (e.g., `QUERY_ERROR` → `TABLE_NOT_FOUND`). Suggestions are also auto-populated if not explicitly provided.

**Usage pattern** — all tool handlers:
```typescript
import { ValidationError, ExtensionNotAvailableError } from "../../types/index.js";

// Throw typed errors:
throw new ValidationError("Table name required", { table: input });
throw new ExtensionNotAvailableError("pgvector");

// Catch at handler boundary → return enriched ErrorResponse
```

**Error helpers** — `tools/core/error-helpers.ts` (~4KB) + `tools/core/error-parser.ts` (~14KB):
- `formatHandlerError(error, context?)` — returns enriched `ErrorResponse` with `success`, `error`, `code`, `category`, `suggestion`, `recoverable`
- `error-parser.ts` — PG error code→message mapping (extracted from error-helpers)
- Handles pg-specific error codes (e.g., `42P01` undefined table, `42703` undefined column)
- Used across all handler files — all catch blocks return `formatHandlerError()` (centralized ZodError handling, no per-file `instanceof ZodError` blocks)

---

## Key Constants & Config

| What | Where | Notes |
|------|-------|-------|
| Server instructions (agent prompt) | `src/constants/server-instructions.ts` | Generated: `generateInstructions(enabledGroups, level, toolCount)` + `HELP_CONTENT` map. Composable segments gated by tool groups and `InstructionLevel`. Source: `server-instructions/*.md` (22 files) |
| Tool group arrays | `src/filtering/tool-constants.ts` | `TOOL_GROUPS` map, `META_GROUPS` shortcuts |
| Tool filter logic | `src/filtering/tool-filter.ts` | `ToolFilter` class, `getEnabledGroups()` utility |
| Connection pool | `src/pool/connection-pool.ts` | pg-native pool wrapper |
| Logger | `src/utils/logger.ts` | Structured logging with severity filtering, `SENSITIVE_KEY_LIST` constant |
| Module logger | `src/utils/module-logger.ts` | Per-module `ModuleLogger` class |
| Query helpers | `src/utils/query-helpers.ts` | `coerceNumber()`, `coerceLimit()`, `buildLimitClause()`, `DEFAULT_QUERY_LIMIT`, `toStr()`, `SMALL_TABLE_THRESHOLD` |
| Identifiers | `src/utils/identifiers.ts` | SQL identifier validation/sanitization |
| FTS config | `src/utils/fts-config.ts` | Full-text search configuration helpers |
| Version SSoT | `src/utils/version.ts` | Reads from `package.json` at build time |

---

## Architecture Patterns (Quick Reference)

| Pattern | Description |
|---------|-------------|
| **Structured Errors** | Every tool returns enriched `ErrorResponse` (`{success, error, code, category, suggestion, recoverable}`) — never raw exceptions. Uses `formatHandlerError()`. Centralized ZodError handling — no per-handler catch blocks. |
| **P154 Pattern** | All tools verify object existence before operating. Returns structured error for missing tables/schemas. |
| **Adapter Pattern** | `DatabaseAdapter` (abstract) → `PostgresAdapter`. Single adapter (no WASM variant). |
| **Schema Cache** | Metadata caching via `schema-operations/` (describe + list). |
| **Connection Pool** | `ConnectionPool` wraps `pg` module. Managed lifecycle with health checks. |
| **Code Mode Bridge** | `pg.*` API in sandbox. Dual-mode: VM (default, `sandbox.ts`) or Worker (`worker-sandbox.ts` + `worker-script.ts`). Factory in `sandbox-factory.ts`. Unique `api/` subdir with alias resolution + group-api generation. Security constants in `SecurityConfig`. |
| **Tool Aliases** | postgres-mcp has a dedicated alias system (`codemode/api/aliases.ts`, 15KB) for Code Mode. |
| **Per-Group Schemas** | Zod schemas separated into `schemas/` subdir organized by group (vs mysql-mcp's monolithic file). |
| **Extension Tools** | citext, ltree, pgcrypto, kcache, partman, cron, PostGIS, pgvector — each requires extension installation. |
| **Help Resources** | `generateInstructions()` produces composable, filter-aware instructions (Code Mode gated by `codemode` group, help pointers list only enabled groups, active tools summary at `full` level). On-demand `postgres://help/{group}` resources filtered by `--tool-filter`. Supports `--instruction-level` (`essential`/`standard`/`full`). |
| **Barrel Re-exports** | Import from `./module/index.js` (with `.js` extension for ESM). |
| **Input Coercion** | All numeric input fields use `z.preprocess(coerceNumber, z.number().optional())` for safe validation at parse time. Zero `z.coerce.number()` remaining — fully migrated across 29 source files (15 schema + 14 handler). |

---

## Import Path Conventions

- All imports use **`.js` extension** (ESM requirement): `import { x } from "./foo/index.js"`
- Error classes: import from `../../types/index.js` (barrel re-export)
- All filenames use **kebab-case** (`postgres-adapter.ts`, `mcp-server.ts`, `connection-pool.ts`, `tool-filter.ts`, etc.)

---

## Test Infrastructure

| File / Directory | Purpose |
|-----------------|---------|
| `test-server/README.md` | Agent testing orchestration doc |
| `test-server/test-database.sql` | Core seed DDL+DML (16 tables, ~700+ rows) |
| `test-server/reset-database.ps1` | Reset Docker container DB from seed data |
| `test-server/Tool-Reference.md` | Complete 245-tool inventory with descriptions |
| `test-server/tool-groups-list.md` | Canonical tool inventory (22 groups) |
| `test-server/test-group-tools.md` | Per-group deterministic checklists (all 22 groups) |
| `test-server/test-tools.md` | Entry-point protocol (schema ref, P154, reporting format) |
| `test-server/advanced-test-tools.md` | Stress tests (boundary, concurrency, cross-group) |
| `test-server/test-resources.md` | Resource testing plan (20 resources) |
| `test-server/test-prompts.md` | Prompt testing plan (19 prompts) |
| `test-server/test-preflight.md` | Pre-test environment validation |
| `test-server/test-agent-experience.md` | Agent experience test (9 passes, 37 scenarios) |
| `test-server/test-instruction-levels.mjs` | Instruction filtering + level behavior verification |
| `test-server/test-filter-instructions.mjs` | Filter-aware instruction validation (8-config matrix: section presence/absence per filter × level) |
| `src/__tests__/` | Vitest unit tests (top-level) |
| `tests/e2e/` | Playwright E2E suite (33 spec files) |
| `tests/e2e/helpers.ts` | E2E helpers: `getBaseURL()`, `callToolRaw()`, `expectHandlerError()`, `startServer()`, `stopServer()`, `createClient()` |
