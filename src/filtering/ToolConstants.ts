/**
 * postgres-mcp - Tool Constants
 *
 * Defines the tool groups and meta-groups used for filtering.
 * STRICT LIMIT: No shortcut may exceed 50 tools.
 *
 * TOOL COUNT ACCOUNTING:
 *   ToolConstants arrays total: 222 tools (sum of all group arrays)
 *   Published "specialized tools": 213 (222 - 9 utility tools)
 *
 *   The 9 excluded utility tools:
 *     - 8 create_extension helpers (one per extension group):
 *       pg_vector_create_extension, pg_postgis_create_extension,
 *       pg_cron_create_extension, pg_partman_create_extension,
 *       pg_kcache_create_extension, pg_citext_create_extension,
 *       pg_ltree_create_extension, pg_pgcrypto_create_extension
 *     - 1 codemode meta-tool: pg_execute_code
 *
 *   When adding new tools: update group sizes, meta-group sums,
 *   and the published total in README/DOCKER_README/wiki.
 *   The published total = array total - 9 utility tools.
 */

import type { ToolGroup, MetaGroup } from "../types/index.js";

/**
 * Default tool groups and their member tools.
 * This serves as the canonical mapping of tools to groups.
 */
export const TOOL_GROUPS: Record<ToolGroup, string[]> = {
  core: [
    "pg_read_query",
    "pg_write_query",
    "pg_list_tables",
    "pg_describe_table",
    "pg_create_table",
    "pg_drop_table",
    "pg_get_indexes",
    "pg_create_index",
    "pg_list_objects",
    "pg_object_details",
    "pg_list_extensions",
    "pg_analyze_db_health",
    "pg_analyze_workload_indexes",
    "pg_analyze_query_indexes",
    // Convenience tools
    "pg_upsert",
    "pg_batch_insert",
    "pg_count",
    "pg_exists",
    "pg_truncate",
    "pg_drop_index",
  ],
  transactions: [
    "pg_transaction_begin",
    "pg_transaction_commit",
    "pg_transaction_rollback",
    "pg_transaction_savepoint",
    "pg_transaction_release",
    "pg_transaction_rollback_to",
    "pg_transaction_execute",
  ],
  jsonb: [
    "pg_jsonb_extract",
    "pg_jsonb_set",
    "pg_jsonb_insert",
    "pg_jsonb_delete",
    "pg_jsonb_contains",
    "pg_jsonb_path_query",
    "pg_jsonb_agg",
    "pg_jsonb_object",
    "pg_jsonb_array",
    "pg_jsonb_keys",
    "pg_jsonb_strip_nulls",
    "pg_jsonb_typeof",
    "pg_jsonb_validate_path",
    "pg_jsonb_stats",
    "pg_jsonb_merge",
    "pg_jsonb_normalize",
    "pg_jsonb_diff",
    "pg_jsonb_index_suggest",
    "pg_jsonb_security_scan",
  ],
  text: [
    "pg_text_search",
    "pg_text_rank",
    "pg_trigram_similarity",
    "pg_fuzzy_match",
    "pg_regexp_match",
    "pg_like_search",
    "pg_text_headline",
    "pg_create_fts_index",
    "pg_text_normalize",
    "pg_text_sentiment",
    "pg_text_to_vector",
    "pg_text_to_query",
    "pg_text_search_config",
  ],
  performance: [
    "pg_explain",
    "pg_explain_analyze",
    "pg_explain_buffers",
    "pg_index_stats",
    "pg_table_stats",
    "pg_stat_statements",
    "pg_stat_activity",
    "pg_locks",
    "pg_bloat_check",
    "pg_cache_hit_ratio",
    "pg_seq_scan_tables",
    "pg_index_recommendations",
    "pg_query_plan_compare",
    "pg_performance_baseline",
    "pg_connection_pool_optimize",
    "pg_partition_strategy_suggest",
    "pg_unused_indexes",
    "pg_duplicate_indexes",
    "pg_vacuum_stats",
    "pg_query_plan_stats",
  ],
  admin: [
    "pg_vacuum",
    "pg_vacuum_analyze",
    "pg_analyze",
    "pg_reindex",
    "pg_terminate_backend",
    "pg_cancel_backend",
    "pg_reload_conf",
    "pg_set_config",
    "pg_reset_stats",
    "pg_cluster",
  ],
  monitoring: [
    "pg_database_size",
    "pg_table_sizes",
    "pg_connection_stats",
    "pg_replication_status",
    "pg_server_version",
    "pg_show_settings",
    "pg_uptime",
    "pg_recovery_status",
    "pg_capacity_planning",
    "pg_resource_usage_analyze",
    "pg_alert_threshold_set",
  ],
  backup: [
    "pg_dump_table",
    "pg_dump_schema",
    "pg_copy_export",
    "pg_copy_import",
    "pg_create_backup_plan",
    "pg_restore_command",
    "pg_backup_physical",
    "pg_restore_validate",
    "pg_backup_schedule_optimize",
  ],
  schema: [
    "pg_list_schemas",
    "pg_create_schema",
    "pg_drop_schema",
    "pg_list_sequences",
    "pg_create_sequence",
    "pg_drop_sequence",
    "pg_list_views",
    "pg_create_view",
    "pg_drop_view",
    "pg_list_functions",
    "pg_list_triggers",
    "pg_list_constraints",
  ],
  vector: [
    "pg_vector_create_extension",
    "pg_vector_add_column",
    "pg_vector_insert",
    "pg_vector_batch_insert",
    "pg_vector_search",
    "pg_vector_create_index",
    "pg_vector_distance",
    "pg_vector_normalize",
    "pg_vector_aggregate",
    "pg_vector_cluster",
    "pg_vector_index_optimize",
    "pg_hybrid_search",
    "pg_vector_performance",
    "pg_vector_dimension_reduce",
    "pg_vector_embed",
    "pg_vector_validate",
  ],
  postgis: [
    "pg_postgis_create_extension",
    "pg_geometry_column",
    "pg_point_in_polygon",
    "pg_distance",
    "pg_buffer",
    "pg_intersection",
    "pg_bounding_box",
    "pg_spatial_index",
    "pg_geocode",
    "pg_geo_transform",
    "pg_geo_index_optimize",
    "pg_geo_cluster",
    "pg_geometry_buffer",
    "pg_geometry_intersection",
    "pg_geometry_transform",
  ],
  partitioning: [
    "pg_list_partitions",
    "pg_create_partition",
    "pg_attach_partition",
    "pg_detach_partition",
    "pg_partition_info",
    "pg_create_partitioned_table",
  ],
  stats: [
    "pg_stats_descriptive",
    "pg_stats_percentiles",
    "pg_stats_correlation",
    "pg_stats_regression",
    "pg_stats_time_series",
    "pg_stats_distribution",
    "pg_stats_hypothesis",
    "pg_stats_sampling",
  ],
  cron: [
    "pg_cron_create_extension",
    "pg_cron_schedule",
    "pg_cron_schedule_in_database",
    "pg_cron_unschedule",
    "pg_cron_alter_job",
    "pg_cron_list_jobs",
    "pg_cron_job_run_details",
    "pg_cron_cleanup_history",
  ],
  partman: [
    "pg_partman_create_extension",
    "pg_partman_create_parent",
    "pg_partman_run_maintenance",
    "pg_partman_show_partitions",
    "pg_partman_show_config",
    "pg_partman_check_default",
    "pg_partman_partition_data",
    "pg_partman_set_retention",
    "pg_partman_undo_partition",
    "pg_partman_analyze_partition_health",
  ],
  kcache: [
    "pg_kcache_create_extension",
    "pg_kcache_query_stats",
    "pg_kcache_top_cpu",
    "pg_kcache_top_io",
    "pg_kcache_database_stats",
    "pg_kcache_resource_analysis",
    "pg_kcache_reset",
  ],
  citext: [
    "pg_citext_create_extension",
    "pg_citext_convert_column",
    "pg_citext_list_columns",
    "pg_citext_analyze_candidates",
    "pg_citext_compare",
    "pg_citext_schema_advisor",
  ],
  ltree: [
    "pg_ltree_create_extension",
    "pg_ltree_query",
    "pg_ltree_subpath",
    "pg_ltree_lca",
    "pg_ltree_match",
    "pg_ltree_list_columns",
    "pg_ltree_convert_column",
    "pg_ltree_create_index",
  ],
  introspection: [
    "pg_dependency_graph",
    "pg_topological_sort",
    "pg_cascade_simulator",
    "pg_schema_snapshot",
    "pg_constraint_analysis",
    "pg_migration_risks",
    "pg_migration_init",
    "pg_migration_record",
    "pg_migration_apply",
    "pg_migration_rollback",
    "pg_migration_history",
    "pg_migration_status",
  ],
  pgcrypto: [
    "pg_pgcrypto_create_extension",
    "pg_pgcrypto_hash",
    "pg_pgcrypto_hmac",
    "pg_pgcrypto_encrypt",
    "pg_pgcrypto_decrypt",
    "pg_pgcrypto_gen_random_uuid",
    "pg_pgcrypto_gen_random_bytes",
    "pg_pgcrypto_gen_salt",
    "pg_pgcrypto_crypt",
  ],
  codemode: ["pg_execute_code"],
};

/**
 * Meta-groups that expand to multiple tool groups.
 * These provide shortcuts for common use cases.
 *
 * ALL presets include codemode (pg_execute_code) by default for token efficiency.
 *
 * Group sizes:
 *   core:20, transactions:7, jsonb:19, text:13, performance:20,
 *   admin:10, monitoring:11, backup:9, schema:12, introspection:12,
 *   vector:16, postgis:15, partitioning:6, stats:8, cron:8, partman:10
 *   kcache:7, citext:6, ltree:8, pgcrypto:9, codemode:1
 *
 * Tool counts (with codemode):
 *   starter:      59 (core:20 + transactions:7 + jsonb:19 + schema:12 + codemode:1)
 *   essential:    47 (core:20 + transactions:7 + jsonb:19 + codemode:1)
 *   dev-power:    66 (core:20 + transactions:7 + schema:12 + stats:8 + partitioning:6 + introspection:12 + codemode:1)
 *   ai-data:      60 (core:20 + jsonb:19 + text:13 + transactions:7 + codemode:1)
 *   ai-vector:    50 (core:20 + vector:16 + transactions:7 + partitioning:6 + codemode:1)
 *   dba-monitor:  59 (core:20 + monitoring:11 + performance:20 + transactions:7 + codemode:1)
 *   dba-manage:   70 (core:20 + admin:10 + backup:9 + partitioning:6 + schema:12 + introspection:12 + codemode:1)
 *   dba-stats:    57 (core:20 + admin:10 + monitoring:11 + transactions:7 + stats:8 + codemode:1)
 *   geo:          43 (core:20 + postgis:15 + transactions:7 + codemode:1)
 *   base-core:    59 (core:20 + jsonb:19 + transactions:7 + schema:12 + codemode:1)
 *   base-ops:     51 (admin:10 + monitoring:11 + backup:9 + partitioning:6 + stats:8 + citext:6 + codemode:1)
 *   ext-ai:       26 (vector:16 + pgcrypto:9 + codemode:1)
 *   ext-geo:      24 (postgis:15 + ltree:8 + codemode:1)
 *   ext-schedule: 19 (cron:8 + partman:10 + codemode:1)
 *   ext-perf:     28 (kcache:7 + performance:20 + codemode:1)
 */
export const META_GROUPS: Record<MetaGroup, ToolGroup[]> = {
  // 1. General Use (Recommended) - All include codemode for token efficiency
  starter: ["core", "transactions", "jsonb", "schema", "codemode"], // 59
  essential: ["core", "transactions", "jsonb", "codemode"], // 47
  "dev-power": [
    "core",
    "transactions",
    "schema",
    "stats",
    "partitioning",
    "introspection",
    "codemode",
  ], // 60

  // 2. AI Workloads
  "ai-data": ["core", "jsonb", "text", "transactions", "codemode"], // 60
  "ai-vector": ["core", "vector", "transactions", "partitioning", "codemode"], // 50

  // 3. DBA Workloads
  "dba-monitor": [
    "core",
    "monitoring",
    "performance",
    "transactions",
    "codemode",
  ], // 59
  "dba-manage": [
    "core",
    "admin",
    "backup",
    "partitioning",
    "schema",
    "introspection",
    "codemode",
  ], // 64
  "dba-stats": [
    "core",
    "admin",
    "monitoring",
    "transactions",
    "stats",
    "codemode",
  ], // 57

  // 4. Specialty Workloads
  geo: ["core", "postgis", "transactions", "codemode"], // 43

  // 5. Base Blocks (Building Blocks for Combining)
  "base-core": ["core", "jsonb", "transactions", "schema", "codemode"], // 59
  "base-ops": [
    "admin",
    "monitoring",
    "backup",
    "partitioning",
    "stats",
    "citext",
    "codemode",
  ], // 51

  // 6. Extension Bundles (for adding extension capabilities)
  "ext-ai": ["vector", "pgcrypto", "codemode"], // 26
  "ext-geo": ["postgis", "ltree", "codemode"], // 24
  "ext-schedule": ["cron", "partman", "codemode"], // 19
  "ext-perf": ["kcache", "performance", "codemode"], // 28
};
