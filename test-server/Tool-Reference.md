# Tool Reference

Complete reference of all **232 tools** organized by their 22 tool groups. Each group automatically includes Code Mode (`pg_execute_code`) for token-efficient operations.

> Use [Tool Filtering](Tool-Filtering) to select the groups you need. See [Code Mode](Code-Mode) for the `pg.*` API that exposes every tool below through sandboxed JavaScript.

---

## codemode (1 tool)

Sandboxed JavaScript execution that exposes all 22 tool groups through the `pg.*` API.

| Tool | Description |
| ---- | ----------- |
| `pg_execute_code` | Execute JavaScript in a sandboxed environment with access to all tools via the `pg.*` API. Enables complex multi-step operations in a single call with 70–90% token savings. |

---

## core (20 tools + Code Mode)

Read/write queries, table and index management, object discovery, health analysis, and convenience operations.

| Tool | Description |
| ---- | ----------- |
| `pg_read_query` | Execute a read-only SQL query (SELECT, WITH). Returns rows as JSON. Supports `transactionId`. |
| `pg_write_query` | Execute a write SQL query (INSERT, UPDATE, DELETE). Returns affected row count. Supports `transactionId`. |
| `pg_list_tables` | List all tables, views, and materialized views with metadata. Use `limit` to restrict results. |
| `pg_describe_table` | Get detailed table structure including columns, types, and constraints. For tables/views only. |
| `pg_create_table` | Create a new table with specified columns and constraints. Supports composite primary keys. |
| `pg_drop_table` | Drop a table from the database. Supports `IF EXISTS` and `CASCADE`. |
| `pg_get_indexes` | List indexes with usage statistics. When table is omitted, lists all database indexes. |
| `pg_create_index` | Create an index on a table. Supports btree, hash, gin, gist, brin index types. |
| `pg_drop_index` | Drop an index. Supports `IF EXISTS`, `CASCADE`, and `CONCURRENTLY` options. |
| `pg_list_objects` | List database objects filtered by type (table, view, function, sequence, index, trigger). |
| `pg_object_details` | Get detailed metadata for a specific database object (table, view, function, sequence, index). |
| `pg_list_extensions` | List installed PostgreSQL extensions with versions. |
| `pg_analyze_db_health` | Comprehensive database health analysis including cache hit ratio, bloat, replication, and connection stats. |
| `pg_analyze_workload_indexes` | Analyze database workload using `pg_stat_statements` to recommend missing indexes. |
| `pg_analyze_query_indexes` | Analyze a specific query for index recommendations using EXPLAIN ANALYZE. |
| `pg_upsert` | Insert a row or update if it already exists (INSERT … ON CONFLICT DO UPDATE). |
| `pg_batch_insert` | Insert multiple rows in a single statement. More efficient than individual inserts. |
| `pg_count` | Count rows in a table, optionally filtered by a WHERE clause. |
| `pg_exists` | Check whether rows exist in a table, optionally filtered by a WHERE clause. |
| `pg_truncate` | Truncate a table. Supports `CASCADE` and `RESTART IDENTITY`. |

---

## transactions (8 tools + Code Mode)

Transaction control for multi-statement operations with savepoint support.

| Tool | Description |
| ---- | ----------- |
| `pg_transaction_begin` | Begin a new transaction. Returns a transaction ID for subsequent operations. |
| `pg_transaction_commit` | Commit a transaction, making all changes permanent. |
| `pg_transaction_rollback` | Rollback a transaction, undoing all changes. |
| `pg_transaction_savepoint` | Create a savepoint within a transaction for partial rollback. |
| `pg_transaction_release` | Release a savepoint, keeping all changes since it was created. |
| `pg_transaction_rollback_to` | Rollback to a savepoint, undoing changes made after it. |
| `pg_transaction_execute` | Execute multiple statements atomically in a single transaction. |
| `pg_transaction_status` | Check the state of an active managed transaction without modifying it. Returns `active`, `aborted`, or `not_found`. |

---

## jsonb (19 tools + Code Mode)

Comprehensive JSONB manipulation — read, write, transform, and analyze JSON documents stored in PostgreSQL.

| Tool | Description |
| ---- | ----------- |
| `pg_jsonb_extract` | Extract value from JSONB at specified path. Returns null if path does not exist. Use `select` param to include identifying columns. |
| `pg_jsonb_set` | Set value in JSONB at path. Uses dot-notation by default; for literal dots in keys use array format. Use empty path to replace entire column value. |
| `pg_jsonb_insert` | Insert value into JSONB array. Index -1 inserts BEFORE last element; use `insertAfter: true` with -1 to append at end. |
| `pg_jsonb_delete` | Delete a key or array element from a JSONB column. Accepts path as string or array. |
| `pg_jsonb_contains` | Find rows where JSONB column contains the specified value. Note: empty object `{}` matches all rows. |
| `pg_jsonb_path_query` | Query JSONB using SQL/JSON path expressions (PostgreSQL 12+). Recursive descent (`..`) syntax is not supported by PostgreSQL. |
| `pg_jsonb_agg` | Aggregate rows into a JSONB array. With `groupBy`, returns all groups with their aggregated items. |
| `pg_jsonb_object` | Build a JSONB object from key-value pairs. |
| `pg_jsonb_array` | Build a JSONB array from values. Accepts `values` or `elements` parameter. |
| `pg_jsonb_keys` | Get all unique keys from a JSONB object column (deduplicated across rows). |
| `pg_jsonb_strip_nulls` | Remove null values from a JSONB column. Use `preview: true` to see changes without modifying data. |
| `pg_jsonb_typeof` | Get JSONB type at path. Uses dot-notation (`a.b.c`), not JSONPath (`$`). Distinguishes NULL columns via `columnNull`. |
| `pg_jsonb_validate_path` | Validate a JSONPath expression and test it against sample data. Supports `vars` for parameterized paths. |
| `pg_jsonb_stats` | Get statistics about JSONB column usage. `topKeys` only applies to object-type JSONB, not arrays. |
| `pg_jsonb_merge` | Merge two JSONB objects. `deep: true` (default) recursively merges. `mergeArrays: true` concatenates arrays. |
| `pg_jsonb_normalize` | Normalize JSONB to key-value pairs. Use `idColumn` to specify row identifier. |
| `pg_jsonb_diff` | Compare two JSONB objects. Returns top-level key differences only (shallow comparison). |
| `pg_jsonb_index_suggest` | Analyze JSONB column and suggest indexes. Only works on object-type JSONB (not arrays). |
| `pg_jsonb_security_scan` | Scan JSONB for security issues (PII, credentials, injection patterns). Only works on object-type JSONB. |

---

## text (13 tools + Code Mode)

Full-text search, trigram similarity, fuzzy matching, and text normalization.

| Tool | Description |
| ---- | ----------- |
| `pg_text_search` | Full-text search using tsvector and tsquery. |
| `pg_text_rank` | Get relevance ranking for full-text search results. Returns matching rows only with rank score. |
| `pg_trigram_similarity` | Find similar strings using pg_trgm trigram matching. Returns similarity score (0–1). Default threshold 0.3; use lower (e.g., 0.1) for partial matches. |
| `pg_fuzzy_match` | Fuzzy string matching using fuzzystrmatch extension. Levenshtein (default): returns distance. Soundex/metaphone: returns phonetic code. |
| `pg_regexp_match` | Match text using POSIX regular expressions. |
| `pg_like_search` | Search text using LIKE patterns. Case-insensitive (ILIKE) by default. |
| `pg_text_headline` | Generate highlighted snippets from full-text search matches. Use `select` param for stable row identification. |
| `pg_create_fts_index` | Create a GIN index for full-text search on a column. |
| `pg_text_normalize` | Remove accent marks (diacritics) from text using the `unaccent` extension. Does not lowercase or trim. |
| `pg_text_sentiment` | Perform basic sentiment analysis on text using keyword matching. |
| `pg_text_to_vector` | Convert text to tsvector representation for full-text search operations. |
| `pg_text_to_query` | Convert text to tsquery. Modes: plain (default), phrase (proximity), websearch (Google-like syntax). |
| `pg_text_search_config` | List available full-text search configurations (e.g., `english`, `german`, `simple`). |

---

## performance (24 tools + Code Mode)

Query analysis, execution plans, statistics, index recommendations, diagnostics, and anomaly detection.

| Tool | Description |
| ---- | ----------- |
| `pg_explain` | Show query execution plan without running the query. |
| `pg_explain_analyze` | Run query and show actual execution plan with timing. |
| `pg_explain_buffers` | Show query plan with buffer usage statistics. |
| `pg_index_stats` | Get index usage statistics. |
| `pg_table_stats` | Get table access statistics. |
| `pg_stat_statements` | Get query statistics from `pg_stat_statements` (requires extension). |
| `pg_stat_activity` | Get currently running queries and connections. |
| `pg_locks` | View current lock information. |
| `pg_bloat_check` | Check for table and index bloat. Returns tables with dead tuples. |
| `pg_cache_hit_ratio` | Get buffer cache hit ratio statistics. |
| `pg_seq_scan_tables` | Find tables with high sequential scan counts (potential missing indexes). Default `minScans: 10`. |
| `pg_index_recommendations` | Suggest missing indexes based on table statistics or query analysis. When `sql` is provided and HypoPG is installed, creates hypothetical indexes to measure potential improvement. |
| `pg_query_plan_compare` | Compare execution plans of two SQL queries to identify performance differences. |
| `pg_performance_baseline` | Capture current database performance metrics as a baseline for comparison. |
| `pg_connection_pool_optimize` | Analyze connection usage and provide pool optimization recommendations. |
| `pg_partition_strategy_suggest` | Analyze a table and suggest optimal partitioning strategy. |
| `pg_unused_indexes` | Find indexes that have never been used (`idx_scan = 0`). Candidates for removal. |
| `pg_duplicate_indexes` | Find duplicate or overlapping indexes (same leading columns). Candidates for consolidation. |
| `pg_vacuum_stats` | Get detailed vacuum statistics including dead tuples, last vacuum times, and wraparound risk. |
| `pg_query_plan_stats` | Get query plan statistics showing planning time vs execution time (requires `pg_stat_statements`). |
| `pg_diagnose_database_performance` | Consolidates key performance metrics into a single actionable report with per-section health ratings and an overall score. |
| `pg_detect_query_anomalies` | Detects queries deviating from historical execution time norms using z-score analysis. Returns anomalous queries ranked by deviation severity. |
| `pg_detect_bloat_risk` | Scores tables by bloat risk using dead tuple ratio, vacuum staleness, table size, and autovacuum effectiveness. Returns per-table scores (0–100). |
| `pg_detect_connection_spike` | Detects unusual connection patterns by analyzing concentration by user, application, state, and wait events. |

---

## admin (10 tools + Code Mode)

Database maintenance — vacuum, analyze, reindex, and configuration management.

| Tool | Description |
| ---- | ----------- |
| `pg_vacuum` | Run VACUUM to reclaim storage and update visibility map. Use `analyze: true` to also update statistics. |
| `pg_vacuum_analyze` | Run VACUUM and ANALYZE together for optimal performance. |
| `pg_analyze` | Update table statistics for the query planner. |
| `pg_reindex` | Rebuild indexes to improve performance. For `target: database`, name defaults to the current database. |
| `pg_terminate_backend` | Terminate a database connection (forceful, use with caution). |
| `pg_cancel_backend` | Cancel a running query (graceful, preferred over terminate). |
| `pg_reload_conf` | Reload PostgreSQL configuration without restart. |
| `pg_set_config` | Set a configuration parameter for the current session. |
| `pg_reset_stats` | Reset statistics counters (requires superuser). |
| `pg_cluster` | Physically reorder table data based on an index. Call with no args to re-cluster all previously-clustered tables. |

---

## monitoring (11 tools + Code Mode)

Real-time database monitoring — sizes, connections, replication, capacity, and alerting.

| Tool | Description |
| ---- | ----------- |
| `pg_database_size` | Get the size of a database. |
| `pg_table_sizes` | Get sizes of all tables with indexes and total. |
| `pg_connection_stats` | Get connection statistics by database and state. |
| `pg_replication_status` | Check replication status and lag. |
| `pg_server_version` | Get PostgreSQL server version information. |
| `pg_show_settings` | Show current PostgreSQL configuration settings. Filter by name pattern or exact setting name. |
| `pg_uptime` | Get server uptime and startup time. |
| `pg_recovery_status` | Check if server is in recovery mode (replica). |
| `pg_capacity_planning` | Analyze database growth trends and provide capacity planning forecasts. Growth estimates are based on `pg_stat_user_tables` counters since last stats reset. |
| `pg_resource_usage_analyze` | Analyze current resource usage including CPU, memory, and I/O patterns. |
| `pg_alert_threshold_set` | Get recommended alert thresholds for monitoring key database metrics. Informational only — does not configure alerts in PostgreSQL itself. |

---

## backup (9 tools + Code Mode)

Backup and restore — pg_dump, COPY, backup planning, and restore validation.

| Tool | Description |
| ---- | ----------- |
| `pg_dump_table` | Generate DDL for a table or sequence. Returns CREATE TABLE for tables, CREATE SEQUENCE for sequences. |
| `pg_dump_schema` | Get the `pg_dump` command for a schema or database. |
| `pg_copy_export` | Export query results using COPY TO. Use `query`/`sql` for custom query or `table` for SELECT *. |
| `pg_copy_import` | Generate COPY FROM command for importing data. |
| `pg_create_backup_plan` | Generate a backup strategy recommendation with cron schedule. |
| `pg_restore_command` | Generate `pg_restore` command for restoring backups. |
| `pg_backup_physical` | Generate `pg_basebackup` command for physical (binary) backup. |
| `pg_restore_validate` | Generate commands to validate backup integrity and restorability. |
| `pg_backup_schedule_optimize` | Analyze database activity patterns and recommend optimal backup schedule. |

---

## schema (12 tools + Code Mode)

DDL management for schemas, views, sequences, functions, triggers, and constraints.

| Tool | Description |
| ---- | ----------- |
| `pg_list_schemas` | List all schemas in the database. |
| `pg_create_schema` | Create a new schema. |
| `pg_drop_schema` | Drop a schema (optionally with all objects). |
| `pg_list_sequences` | List all sequences in the database. |
| `pg_create_sequence` | Create a new sequence with optional START, INCREMENT, MIN/MAX, CACHE, CYCLE, and OWNED BY. |
| `pg_drop_sequence` | Drop a sequence. Supports `IF EXISTS` and `CASCADE`. |
| `pg_list_views` | List all views and materialized views. |
| `pg_create_view` | Create a view or materialized view. |
| `pg_drop_view` | Drop a view or materialized view. Supports `IF EXISTS` and `CASCADE`. |
| `pg_list_functions` | List user-defined functions with optional filtering. Use `exclude` (array) to filter out extension functions. Default `limit: 500`. |
| `pg_list_triggers` | List all triggers. |
| `pg_list_constraints` | List table constraints (primary keys, foreign keys, unique, check). |

---

## introspection (6 tools + Code Mode)

Read-only schema analysis — dependency graphs, cascade simulation, snapshots, and migration risk assessment.

| Tool | Description |
| ---- | ----------- |
| `pg_dependency_graph` | Get the full foreign key dependency graph with cascade paths, row counts, circular dependency detection, and severity assessment. |
| `pg_topological_sort` | Get tables in safe DDL execution order. `create` direction: dependencies first. `drop` direction: dependents first. |
| `pg_cascade_simulator` | Simulate the impact of DELETE, DROP, or TRUNCATE on a table. Returns affected tables, estimated row counts, cascade paths, and severity. |
| `pg_schema_snapshot` | Get a complete schema snapshot in a single agent-optimized JSON structure (tables, columns, types, constraints, indexes, triggers, sequences, extensions). |
| `pg_constraint_analysis` | Analyze all constraints for issues: redundant indexes, missing foreign keys, missing NOT NULL, missing primary keys, and unindexed foreign keys. |
| `pg_migration_risks` | Analyze proposed DDL statements for risks: data loss, lock contention, constraint violations, and breaking changes. Pre-flight check before migrations. |

---

## migration (6 tools + Code Mode)

Schema migration tracking — initialize, record, apply, rollback, and audit migrations with SHA-256 deduplication.

| Tool | Description |
| ---- | ----------- |
| `pg_migration_init` | Initialize or verify the schema version tracking table (`_mcp_schema_versions`). Idempotent — safe to call repeatedly. |
| `pg_migration_record` | Record a migration in the tracking table with status `'recorded'` (metadata only, SQL not executed). Use `pg_migration_apply` to execute SQL and record with status `'applied'`. Auto-provisions on first use. SHA-256 hash for idempotency. |
| `pg_migration_apply` | Execute migration SQL and record it atomically in a single transaction. On failure, rolls back and records a `failed` entry. |
| `pg_migration_rollback` | Roll back a specific migration by ID or version. Executes stored `rollback_sql` in a transaction. Use `dryRun: true` to preview. |
| `pg_migration_history` | Query migration history with optional filtering by status and source system. Returns paginated results ordered by `applied_at` descending. |
| `pg_migration_status` | Get current migration tracking status: latest version, counts by status, and list of source systems. |

---

## partitioning (6 tools + Code Mode)

Native PostgreSQL partition management (RANGE, LIST, HASH).

| Tool | Description |
| ---- | ----------- |
| `pg_list_partitions` | List all partitions of a partitioned table. Returns warning if table is not partitioned. |
| `pg_create_partitioned_table` | Create a partitioned table. `primaryKey`/`unique` must include the partition key column. |
| `pg_create_partition` | Create a partition. Use `subpartitionBy`/`subpartitionKey` for multi-level partitioning. |
| `pg_attach_partition` | Attach an existing table as a partition. |
| `pg_detach_partition` | Detach a partition. Use `concurrently: true` for non-blocking. Use `finalize: true` only after an interrupted CONCURRENTLY detach. |
| `pg_partition_info` | Get detailed information about a partitioned table. Returns warning if table is not partitioned. |

---

## stats (8 tools + Code Mode)

Statistical analysis — descriptive stats, percentiles, correlation, regression, distributions, and sampling.

| Tool | Description |
| ---- | ----------- |
| `pg_stats_descriptive` | Calculate descriptive statistics (count, min, max, avg, stddev, variance, sum) for a numeric column. Use `groupBy` for per-category stats. |
| `pg_stats_percentiles` | Calculate percentiles (quartiles, custom) for a numeric column. Use `groupBy` for per-category percentiles. |
| `pg_stats_correlation` | Calculate Pearson correlation coefficient between two numeric columns. Use `groupBy` for per-category correlation. |
| `pg_stats_regression` | Perform linear regression analysis (y = mx + b) between two columns. Use `groupBy` for per-category regression. |
| `pg_stats_time_series` | Aggregate data into time buckets for time series analysis. Use `groupBy` for separate series per category. |
| `pg_stats_distribution` | Analyze data distribution with histogram buckets, skewness, and kurtosis. Use `groupBy` for per-category distribution. |
| `pg_stats_hypothesis` | Perform one-sample t-test or z-test against a hypothesized mean. For z-test, provide `populationStdDev`. Use `groupBy` to test each group. |
| `pg_stats_sampling` | Get a random sample of rows. Use `sampleSize` for exact row count, or `percentage` for approximate sampling with bernoulli/system methods. |

---

## vector (16 tools + Code Mode)

pgvector extension — vector similarity search, indexing, clustering, and AI/ML operations.

| Tool | Description |
| ---- | ----------- |
| `pg_vector_create_extension` | Enable the pgvector extension for vector similarity search. |
| `pg_vector_add_column` | Add a vector column to a table with specified dimensions. |
| `pg_vector_insert` | Insert a vector into a table, or update an existing row's vector. For upsert: use `updateExisting` + `conflictColumn` + `conflictValue`. |
| `pg_vector_batch_insert` | Efficiently insert multiple vectors. `vectors` expects array of `{vector: [...], data?: {...}}` objects, not raw arrays. |
| `pg_vector_search` | Search for similar vectors. Use `select` param to include identifying columns (e.g., `select: ["id", "name"]`). |
| `pg_vector_create_index` | Create vector index. Requires: table, column, type (`ivfflat` or `hnsw`). |
| `pg_vector_distance` | Calculate distance between two vectors. Valid metrics: `l2` (default), `cosine`, `inner_product`. |
| `pg_vector_normalize` | Normalize a vector to unit length. |
| `pg_vector_aggregate` | Calculate average vector. Optional: `groupBy`, `where`. |
| `pg_vector_validate` | Validate vector dimensions against a column or check a vector before operations. Empty vector `[]` returns `{valid: true, vectorDimensions: 0}`. |
| `pg_vector_cluster` | Perform K-means clustering on vectors. Returns cluster centroids only (not row assignments). Compare rows to centroids using `pg_vector_distance`. |
| `pg_vector_index_optimize` | Analyze vector column and recommend optimal index parameters for IVFFlat/HNSW. |
| `pg_hybrid_search` | Combined vector similarity and full-text search with weighted scoring. |
| `pg_vector_performance` | Analyze vector search performance and index effectiveness. Provide `testVector` for benchmarking. |
| `pg_vector_dimension_reduce` | Reduce vector dimensions using random projection. Supports direct vector input or table-based extraction. |
| `pg_vector_embed` | Generate text embeddings. Returns a simple hash-based embedding for demos (use external APIs for production). |

---

## postgis (15 tools + Code Mode)

PostGIS extension — geospatial queries, distance calculations, spatial indexing, and geometry operations.

| Tool | Description |
| ---- | ----------- |
| `pg_postgis_create_extension` | Enable the PostGIS extension for geospatial operations. |
| `pg_geometry_column` | Add a geometry column to a table. Returns `alreadyExists: true` if column exists. |
| `pg_point_in_polygon` | Check if a point is within any polygon in a table. The geometry column should contain POLYGON or MULTIPOLYGON geometries. |
| `pg_distance` | Find nearby geometries within a distance from a point. Output `distance_meters` is always in meters; `unit` only affects the filter threshold. |
| `pg_buffer` | Create a buffer zone around geometries. Default limit: 50 rows, default simplify: 10m (set `simplify: 0` to disable). |
| `pg_intersection` | Find geometries that intersect with a given geometry. Auto-detects SRID from target column if not specified. |
| `pg_bounding_box` | Find geometries within a bounding box. Swapped min/max values are auto-corrected. |
| `pg_spatial_index` | Create a GiST spatial index for geometry column. Uses `IF NOT EXISTS` to avoid errors on duplicate names. |
| `pg_geocode` | Create a point geometry from latitude/longitude coordinates. SRID parameter sets output metadata only; input is always WGS84 lat/lng. |
| `pg_geo_transform` | Transform geometry from one spatial reference system (SRID) to another. |
| `pg_geo_index_optimize` | Analyze spatial indexes and provide optimization recommendations. |
| `pg_geo_cluster` | Perform spatial clustering using DBSCAN or K-Means. DBSCAN defaults: eps=100m, minPoints=3. K-Means default: numClusters=5. |
| `pg_geometry_buffer` | Create a buffer zone around a WKT or GeoJSON geometry. Returns buffered geometry as GeoJSON and WKT. |
| `pg_geometry_intersection` | Compute the intersection of two WKT or GeoJSON geometries. Returns intersection geometry and whether they intersect. |
| `pg_geometry_transform` | Transform a WKT or GeoJSON geometry from one SRID to another. Common SRIDs: 4326 (WGS84/GPS), 3857 (Web Mercator). |

---

## cron (8 tools + Code Mode)

pg_cron extension — job scheduling, management, and execution history.

| Tool | Description |
| ---- | ----------- |
| `pg_cron_create_extension` | Enable the pg_cron extension for job scheduling. Requires superuser privileges. |
| `pg_cron_schedule` | Schedule a new cron job. Supports standard cron syntax or interval syntax (e.g., `"30 seconds"`). Note: pg_cron allows duplicate job names. |
| `pg_cron_schedule_in_database` | Schedule a cron job to run in a different database. Useful for cross-database maintenance tasks. |
| `pg_cron_unschedule` | Remove a scheduled cron job by its ID or name. If both are provided, `jobName` takes precedence. |
| `pg_cron_alter_job` | Modify an existing cron job. Can change schedule, command, database, username, or active status. Only specify parameters you want to change. |
| `pg_cron_list_jobs` | List all scheduled cron jobs. Shows job ID, name, schedule, command, and status. Default limit: 50 rows. |
| `pg_cron_job_run_details` | View execution history for cron jobs. Shows start/end times, status, and return messages. |
| `pg_cron_cleanup_history` | Delete old job run history records. By default, removes records older than 7 days. |

---

## partman (10 tools + Code Mode)

pg_partman extension — automated partition lifecycle management.

| Tool | Description |
| ---- | ----------- |
| `pg_partman_create_extension` | Enable the pg_partman extension for automated partition management. Requires superuser privileges. |
| `pg_partman_create_parent` | Create a new partition set using `create_parent()`. Supports time-based and integer-based partitioning. Parent table must already exist. For empty tables, provide `startPartition` (accepts `'now'`). |
| `pg_partman_run_maintenance` | Run partition maintenance to create new child partitions and enforce retention policies. Should be executed regularly (e.g., via pg_cron). |
| `pg_partman_show_partitions` | List all child partitions for a partition set managed by pg_partman. |
| `pg_partman_show_config` | View configuration for a partition set from `part_config` table. |
| `pg_partman_check_default` | Check if data exists in the default partition that should be moved to child partitions. |
| `pg_partman_partition_data` | Move data from the default partition to appropriate child partitions. Creates new partitions if needed. |
| `pg_partman_set_retention` | Configure retention policy for a partition set. Old partitions will be dropped or detached during maintenance. |
| `pg_partman_undo_partition` | Convert a partitioned table back to a regular table. Requires `targetTable` parameter — pg_partman does not consolidate data back to the parent directly. |
| `pg_partman_analyze_partition_health` | Analyze partition health: data in default partitions, missing premake partitions, stale maintenance, and retention configuration. |

---

## kcache (7 tools + Code Mode)

pg_stat_kcache extension — OS-level CPU and I/O performance metrics.

| Tool | Description |
| ---- | ----------- |
| `pg_kcache_create_extension` | Enable the pg_stat_kcache extension. Requires `pg_stat_statements` to be installed first. Both must be in `shared_preload_libraries`. |
| `pg_kcache_query_stats` | Get query statistics with OS-level CPU and I/O metrics. Joins `pg_stat_statements` with `pg_stat_kcache`. `orderBy`: `total_time`, `cpu_time`, `reads`, `writes`. |
| `pg_kcache_top_cpu` | Get top CPU-consuming queries. Shows user CPU (application code) vs system CPU (kernel operations). |
| `pg_kcache_top_io` | Get top I/O-consuming queries. Shows filesystem-level reads and writes (actual disk access, not just shared buffer hits). |
| `pg_kcache_database_stats` | Get aggregated OS-level statistics for a database (total CPU time, I/O, page faults). |
| `pg_kcache_resource_analysis` | Analyze queries to classify them as CPU-bound, I/O-bound, or balanced. Helps identify root cause of performance issues. |
| `pg_kcache_reset` | Reset pg_stat_kcache statistics. Note: also resets `pg_stat_statements` statistics. |

---

## citext (6 tools + Code Mode)

citext extension — case-insensitive text data type helpers.

| Tool | Description |
| ---- | ----------- |
| `pg_citext_create_extension` | Enable the citext extension. Ideal for emails, usernames, and identifiers where case shouldn't matter. |
| `pg_citext_convert_column` | Convert a TEXT column to CITEXT for case-insensitive comparisons. Note: views depending on this column must be dropped and recreated manually first. |
| `pg_citext_list_columns` | List all columns using the citext type in the database. |
| `pg_citext_analyze_candidates` | Find TEXT columns that may benefit from case-insensitive comparisons (email, username, name, slug patterns). |
| `pg_citext_compare` | Compare two values using case-insensitive semantics. Useful for testing behavior before converting columns. |
| `pg_citext_schema_advisor` | Analyze a specific table and recommend which columns should use citext based on column names and data patterns. |

---

## ltree (8 tools + Code Mode)

ltree extension — hierarchical tree label queries and management.

| Tool | Description |
| ---- | ----------- |
| `pg_ltree_create_extension` | Enable the ltree extension for hierarchical tree-structured labels. |
| `pg_ltree_query` | Query hierarchical relationships in ltree columns. Supports exact paths (descendants/ancestors) and lquery patterns with wildcards. |
| `pg_ltree_subpath` | Extract a portion of an ltree path. |
| `pg_ltree_lca` | Find the longest common ancestor of multiple ltree paths. |
| `pg_ltree_match` | Match ltree paths using lquery pattern syntax. |
| `pg_ltree_list_columns` | List all columns using the ltree type in the database. |
| `pg_ltree_convert_column` | Convert a TEXT column to LTREE type. Note: views depending on this column must be dropped and recreated manually first. |
| `pg_ltree_create_index` | Create a GiST index on an ltree column for efficient tree queries. |

---

## pgcrypto (9 tools + Code Mode)

pgcrypto extension — cryptographic hashing, encryption, UUIDs, and salt generation.

| Tool | Description |
| ---- | ----------- |
| `pg_pgcrypto_create_extension` | Enable the pgcrypto extension for cryptographic functions. |
| `pg_pgcrypto_hash` | Hash data using various algorithms (SHA-256, SHA-512, MD5, etc.). |
| `pg_pgcrypto_hmac` | Compute HMAC for data with a secret key. |
| `pg_pgcrypto_encrypt` | Encrypt data using PGP symmetric encryption. |
| `pg_pgcrypto_decrypt` | Decrypt data that was encrypted with `pg_pgcrypto_encrypt`. |
| `pg_pgcrypto_gen_random_uuid` | Generate a cryptographically secure UUID v4. |
| `pg_pgcrypto_gen_random_bytes` | Generate cryptographically secure random bytes. |
| `pg_pgcrypto_gen_salt` | Generate a salt for use with `crypt()` password hashing. |
| `pg_pgcrypto_crypt` | Hash a password using `crypt()` with a salt from `gen_salt()`. |
