# Advanced Stress Test — postgres-mcp — Part 2

**ESSENTIAL INSTRUCTIONS**

**Execute EVERY numbered stress test below using code mode (`pg_execute_code`).**
**Do NOT use scripts or terminal to replace planned tests.**
**Do NOT modify or skip tests.**
**Do NOT run test-tools-advanced-1.md.**
**All changes MUST be consistent with other postgres-mcp tools and `code-map.md`**

## Code Mode Execution

All tests should be executed via `pg_execute_code` code mode. Tests are written in direct tool call syntax for readability — translate to code mode:

| Direct Tool Call                                     | Code Mode Equivalent                                           |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `pg_read_query({sql: "..."})`                        | `pg.core.readQuery({sql: "..."})`                              |
| `pg_write_query({sql: "..."})`                       | `pg.core.writeQuery({sql: "..."})`                             |
| `pg_create_table({table: "...", columns: [...]})`    | `pg.core.createTable({table: "...", columns: [...]})`          |
| `pg_drop_table({table: "..."})`                      | `pg.core.dropTable({table: "..."})`                            |
| `pg_geocode({...})`                                  | `pg.postgis.geocode({...})`                                    |
| `pg_distance({...})`                                 | `pg.postgis.distance({...})`                                   |
| `pg_ltree_*({...})`                                  | `pg.ltree.*({...})`                                            |
| `pg_pgcrypto_*({...})`                               | `pg.pgcrypto.*({...})`                                         |
| `pg_citext_*({...})`                                 | `pg.citext.*({...})`                                           |
| `pg_cron_*({...})`                                   | `pg.cron.*({...})`                                             |
| `pg_kcache_*({...})`                                 | `pg.kcache.*({...})`                                           |
| `pg_partman_*({...})`                                | `pg.partman.*({...})`                                          |
| `pg_detect_*({...})`                                 | `pg.performance.*({...})`                                      |
| `pg_dependency_graph({...})`                         | `pg.introspection.dependencyGraph({...})`                      |
| `pg_topological_sort({...})`                         | `pg.introspection.topologicalSort({...})`                      |
| `pg_cascade_simulator({...})`                        | `pg.introspection.cascadeSimulator({...})`                     |
| `pg_schema_snapshot({...})`                          | `pg.introspection.schemaSnapshot({...})`                       |
| `pg_constraint_analysis({...})`                      | `pg.introspection.constraintAnalysis({...})`                   |
| `pg_migration_risks({...})`                          | `pg.introspection.migrationRisks({...})`                       |
| `pg_migration_*({...})`                              | `pg.migration.*({...})`                                        |

**Key rules:**

- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls — create a table in one call, query it in the next
- Group multiple related tests into a single code mode call when practical

## Test Database Schema

Same as `test-tools.md` — refer to that file for the full schema reference. Key tables: `test_products` (15 rows), `test_orders` (20), `test_jsonb_docs` (3), `test_articles` (3), `test_measurements` (640, after resource seed), `test_embeddings` (75, after resource seed), `test_locations` (25, after resource seed), `test_users` (3), `test_categories` (6), `test_events` (100 across 4 partitions), `test_departments` (3), `test_employees` (5), `test_projects` (2), `test_assignments` (3), `test_audit_log` (3).

> **Note:** `test-resources.sql` runs after `test-database.sql` and adds ~200 measurements (minus deletions), 25 embeddings, and 20 locations. Counts reflect the post-seed state.

## Naming & Cleanup

- **Temporary tables**: Prefix with `stress_` (e.g., `stress_empty_table`)
- **Temporary indexes**: Prefix with `stress_idx_`
- **Temporary views**: Prefix with `stress_view_`
- **Temporary schemas**: Prefix with `stress_schema_`
- **Cleanup**: Attempt to remove all `stress_*` objects after testing. If DROP fails, note the leftover objects and move on — they will be cleaned up on next database reset

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized — **blocking, equally important as ❌ bugs**. Oversized payloads waste LLM context window tokens and degrade downstream tool-calling quality. Report the response size in KB and suggest a concrete optimization (e.g., filter system tables, add `compact` option, omit empty arrays).
- ✅ Confirmed: Edge case handled correctly (use only inline during testing; omit from Final Summary)

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `TABLE_NOT_FOUND`, `COLUMN_NOT_FOUND`, `VALIDATION_ERROR`). These are fixable in `src/utils/errors/` by adding a `code` override to the matching error class. Treat as ⚠️ Issue and include in fix plan.

## Post-Test Procedures

1. Confirm cleanup of all `stress_*` object and any temporary files you might have created in the repository during testing.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in test-tools-advanced-2.md (this prompt) and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
3. Update the changelog with any changes made (being careful not to create duplicate headers), and commit without pushing.
4. Stop and briefly summarize the testing results and fixes.

---

## postgis Group Advanced Tests

### postgis Group Tools (15 +1 code mode)

1. pg_postgis_create_extension
2. pg_geometry_column
3. pg_point_in_polygon
4. pg_distance
5. pg_buffer
6. pg_intersection
7. pg_bounding_box
8. pg_spatial_index
9. pg_geocode
10. pg_geo_transform
11. pg_geo_index_optimize
12. pg_geo_cluster
13. pg_geometry_buffer
14. pg_geometry_intersection
15. pg_geometry_transform
16. pg_execute_code (auto-added)

### Category 1: Boundary Coordinates

1. `pg_geocode` with lat=91, lng=0 → expect bounds validation error (lat ±90°)
2. `pg_geocode` with lat=0, lng=181 → expect bounds validation error (lng ±180°)
3. `pg_geocode` with lat=90, lng=180 (exact boundary) → should succeed
4. `pg_geocode` with lat=-90, lng=-180 (exact boundary) → should succeed
5. `pg_distance` with out-of-bounds point → expect bounds validation error
6. `pg_point_in_polygon` with out-of-bounds point → expect bounds validation error

### Final Cleanup

Confirm `test_locations` count is still 25 (post-resource-seed baseline).

---

## ltree Group Advanced Tests

### ltree Group Tools (8 +1 code mode)

1. pg_ltree_create_extension
2. pg_ltree_query
3. pg_ltree_subpath
4. pg_ltree_lca
5. pg_ltree_match
6. pg_ltree_list_columns
7. pg_ltree_convert_column
8. pg_ltree_create_index
9. pg_execute_code (auto-added)

### Category 1: Edge Cases

1. `pg_ltree_query` with `path: ""` (empty string) → report behavior
2. `pg_ltree_subpath` with `path: "a"`, `offset: 0`, `length: 1` → expect `"a"`
3. `pg_ltree_subpath` with `path: "a.b.c"`, `offset: 5` (beyond depth) → expect structured error with `pathDepth`
4. `pg_ltree_subpath` with negative offset `offset: -1` → expect last label
5. `pg_ltree_lca` with only 1 path → expect error (minimum 2 paths)
6. `pg_ltree_lca` with identical paths `["electronics", "electronics"]` → expect `{hasCommonAncestor: false}` with empty string (root-level labels have no ancestor above them — PostgreSQL's `lca()` returns `""` for single-label paths, even identical ones; use multi-level paths like `"electronics.phones"` to get meaningful LCA results)
7. `pg_ltree_lca` with paths having no common ancestor `["electronics", "clothing"]` → expect empty/null ancestor
8. `pg_ltree_query({table: "test_products", column: "name", path: "electronics"})` → error about non-ltree column

### Final Cleanup

Confirm `test_categories` count is still 6.

---

## pgcrypto Group Advanced Tests

### pgcrypto Group Tools (9 +1 code mode)

1. pg_pgcrypto_create_extension
2. pg_pgcrypto_hash
3. pg_pgcrypto_hmac
4. pg_pgcrypto_encrypt
5. pg_pgcrypto_decrypt
6. pg_pgcrypto_gen_random_uuid
7. pg_pgcrypto_gen_random_bytes
8. pg_pgcrypto_gen_salt
9. pg_pgcrypto_crypt
10. pg_execute_code (auto-added)

### Category 1: Full Encrypt/Decrypt Workflow

1. `pg_pgcrypto_encrypt({data: "sensitive-data-123", password: "strongpass"})` → capture encrypted output
2. `pg_pgcrypto_decrypt({encryptedData: <captured>, password: "strongpass"})` → expect `"sensitive-data-123"`
3. `pg_pgcrypto_decrypt({encryptedData: <captured>, password: "wrongpass"})` → expect structured error

### Category 2: Password Hash/Verify Workflow

4. `pg_pgcrypto_gen_salt({type: "bf", iterations: 4})` → capture salt
5. `pg_pgcrypto_crypt({password: "mypassword", salt: <captured>})` → capture hash
6. `pg_pgcrypto_crypt({password: "mypassword", salt: <hash>})` → expect same hash (verification succeeds)
7. `pg_pgcrypto_crypt({password: "wrongpassword", salt: <hash>})` → expect different hash (verification fails)

### Category 3: Error Message Quality

8. `pg_pgcrypto_decrypt` with wrong password on encrypted data → expect structured error
9. `pg_pgcrypto_hash` with invalid algorithm `"sha999"` → structured error

### Final Cleanup

No cleanup needed (pgcrypto tools are stateless computations).

---

## citext Group Advanced Tests

### citext Group Tools (6 +1 code mode)

1. pg_citext_create_extension
2. pg_citext_convert_column
3. pg_citext_list_columns
4. pg_citext_analyze_candidates
5. pg_citext_compare
6. pg_citext_schema_advisor
7. pg_execute_code (auto-added)

### Category 1: Edge Cases

1. `pg_citext_convert_column` on a non-text column (e.g., `test_products.price` which is DECIMAL) → expect `{success: false, allowedTypes, suggestion}`
2. `pg_citext_analyze_candidates` with `excludeSystemSchemas: false` → verify more results than with `true`
3. `pg_citext_compare` with identical values `{value1: "test", value2: "test"}` → both `citextEqual` and `textEqual` should be `true`
4. `pg_citext_compare` with unicode: `{value1: "café", value2: "CAFÉ"}` → report behavior (accent handling)

### Final Cleanup

No cleanup needed (citext tests are read-only or non-destructive).

---

## cron Group Advanced Tests

### cron Group Tools (8 +1 code mode)

1. pg_cron_create_extension
2. pg_cron_schedule
3. pg_cron_schedule_in_database
4. pg_cron_unschedule
5. pg_cron_alter_job
6. pg_cron_list_jobs
7. pg_cron_job_run_details
8. pg_cron_cleanup_history
9. pg_execute_code (auto-added)

### Category 1: Edge Cases

1. `pg_cron_schedule({name: "stress_dup_job", schedule: "0 0 * * *", command: "SELECT 1"})` → capture jobId
2. `pg_cron_schedule({name: "stress_dup_job", schedule: "0 1 * * *", command: "SELECT 2"})` → report behavior: does it error on duplicate name, or overwrite?
3. `pg_cron_schedule({name: "stress_bad_cron", schedule: "invalid cron", command: "SELECT 1"})` → report whether validation catches invalid expression or defers to pg_cron
4. `pg_cron_schedule({name: "stress_bad_sql", schedule: "0 0 * * *", command: "SELECT * FROM nonexistent_xyz"})` → report: does scheduling succeed (SQL validated on execution, not schedule-time)?
5. `pg_cron_job_details({jobName: "stress_dup_job"})` → report behavior (if tool exists)
6. Cleanup: `pg_cron_unschedule` all `stress_*` jobs

### Category 2: Error Message Quality

7. `pg_cron_schedule({name: "stress_bad_cron", schedule: "invalid cron", command: "SELECT 1"})` → report behavior

### Final Cleanup

Unschedule all `stress_*` jobs created during testing.

---

## kcache Group Advanced Tests

### kcache Group Tools (7 +1 code mode)

1. pg_kcache_create_extension
2. pg_kcache_query_stats
3. pg_kcache_top_cpu
4. pg_kcache_top_io
5. pg_kcache_database_stats
6. pg_kcache_resource_analysis
7. pg_kcache_reset
8. pg_execute_code (auto-added)

### Category 1: Stress Tests

1. `pg_kcache_query_stats({limit: 0})` → verify unlimited mode works or report behavior
2. `pg_kcache_top_cpu({limit: 0})` → same
3. `pg_kcache_top_io({type: "reads", limit: 3})` → verify `type: "reads"` filter works
4. `pg_kcache_top_io({type: "writes", limit: 3})` → verify `type: "writes"` filter works
5. `pg_kcache_top_io({type: "invalid_type", limit: 3})` → report: structured error or accepted?
6. `pg_kcache_database_stats()` with no activity → verify graceful empty response

### Final Cleanup

No cleanup needed (kcache tools are read-only).

---

## partman Group Advanced Tests

### partman Group Tools (10 +1 code mode)

1. pg_partman_create_extension
2. pg_partman_create_parent
3. pg_partman_run_maintenance
4. pg_partman_show_partitions
5. pg_partman_show_config
6. pg_partman_check_default
7. pg_partman_partition_data
8. pg_partman_set_retention
9. pg_partman_undo_partition
10. pg_partman_analyze_partition_health
11. pg_execute_code (auto-added)

**Requires `test_logs` table (PARTITION BY RANGE on `created_at`, no existing partitions).**

### Category 1: Lifecycle Stress

1. `pg_partman_create_parent({parentTable: "test_logs", controlColumn: "created_at", interval: "1 day", startPartition: "now"})` → verify success and partitions created
2. `pg_partman_run_maintenance({parentTable: "test_logs"})` → verify success
3. `pg_partman_run_maintenance({parentTable: "test_logs"})` immediately again → verify idempotent (no error, no duplicate partitions)
4. `pg_partman_show_config({table: "test_logs"})` → verify config matches what was set
5. `pg_partman_analyze_partition_health()` → verify health check works with active partman tables
6. `pg_partman_create_parent({parentTable: "test_logs", controlColumn: "created_at", interval: "1 hour"})` → report: does it error because already managed, or overwrite?
7. Cleanup: `pg_partman_undo_partition({parentTable: "test_logs"})` or note state for `reset-database.ps1`

### Final Cleanup

Undo partman management on `test_logs` or note state for reset.

---

## performance Group Advanced Tests

### Anomaly Detection Tools (subset of 24 +1 code mode)

> **Note:** Basic performance tools are thoroughly covered in standard testing (`test-group-tools.md`). This section focuses on anomaly detection edge cases.

Relevant tools for this section:

- pg_detect_query_anomalies
- pg_detect_bloat_risk
- pg_detect_connection_spike

### Category 1: pg_detect_query_anomalies Edge Cases

1. `pg_detect_query_anomalies({threshold: 0.5})` → minimum threshold clamp; verify more anomalies than default; `riskLevel` may be `high` or `critical`
2. `pg_detect_query_anomalies({threshold: 10.0})` → maximum threshold clamp; verify `anomalyCount: 0` (or 1 if an extreme outlier exists); `riskLevel` varies
3. `pg_detect_query_anomalies({minCalls: 10000})` → very high minimum should filter most queries; verify `totalAnalyzed` is small or 0
4. `pg_detect_query_anomalies({minCalls: 1})` → include all queries with at least 1 call; verify `totalAnalyzed` >= default result
5. If `pg_stat_statements` is not loaded (hypothetical) → verify structured error with `success: false`, `suggestion` field mentioning `pg_diagnose_database_performance`, NOT raw MCP error

### Category 2: pg_detect_bloat_risk Edge Cases

6. `pg_detect_bloat_risk({minRows: 0})` → should clamp to 0 (include micro-tables); verify all user tables appear including small ones
7. `pg_detect_bloat_risk({minRows: 1000000})` → very high threshold; expect `totalAnalyzed: 0` and empty `tables` (test DB has no million-row tables)
8. `pg_detect_bloat_risk({schema: "public", minRows: 1})` → combined filter; verify tables array only contains `public` schema tables
9. `pg_detect_bloat_risk({schema: "pg_catalog"})` → system schema filter; verify response structure (may be empty or contain system tables depending on filter logic)
10. Verify each table in response has: `riskScore` (0-100), `riskLevel`, `recommendations` array, `factors` object with `deadTupleRatio`, `vacuumStaleness`, `tableSizeImpact`, `autovacuumEffectiveness`

### Category 3: pg_detect_connection_spike Edge Cases

11. `pg_detect_connection_spike({warningPercent: 10})` → very low threshold; verify more `warnings` entries than default (70%)
12. `pg_detect_connection_spike({warningPercent: 100})` → maximum threshold; verify `warnings` is empty or minimal
13. Verify `byState` array intentionally EXCLUDES the current monitoring query (via `pid != pg_backend_pid()`), meaning `state: "active"` may be absent if no other queries are running
14. Verify `usagePercent` = `(totalConnections / maxConnections) * 100` (approximately)
15. Verify `concentrations` array structure: each entry has `dimension`, `value`, `count`, `percent`

### Category 4: Cross-Tool Correlation (Anomaly + Performance)

Use Code Mode to cross-verify anomaly tools against existing performance tools:

```javascript
// Run via pg_execute_code
const bloat = await pg.performance.detectBloatRisk({minRows: 1});
const bloatCheck = await pg.performance.bloatCheck();
return {
  anomalyTables: bloat.tables?.length ?? 0,
  bloatTables: bloatCheck.count ?? 0,
  anomalyAnalyzed: bloat.totalAnalyzed,
};
```

```javascript
// Verify connection spike aligns with connection_stats
const spike = await pg.performance.detectConnectionSpike();
const stats = await pg.monitoring.connectionStats();
return {
  spikeTotal: spike.totalConnections,
  statsTotal: stats.totalConnections,
  match: spike.totalConnections === stats.totalConnections,
  spikeMax: spike.maxConnections,
  statsMax: stats.maxConnections,
};
```

Expect: `match: true` (or close — slight timing differences acceptable)

### Final Cleanup

No cleanup needed (anomaly detection tools are read-only).

---

## introspection Group Advanced Tests

> **Note:** Basic checklist tests (in `test-group-tools.md`) already cover happy paths: default dependency graph, topological sort both directions, DELETE cascade on `test_departments`, `compact: true` snapshot, constraint analysis defaults, and simple migration risk statements. This category focuses on **filtering, comparative, and degenerate-input** scenarios not covered there.

### introspection Group Tools (6 +1 code mode)

1. pg_dependency_graph
2. pg_topological_sort
3. pg_cascade_simulator
4. pg_schema_snapshot
5. pg_constraint_analysis
6. pg_migration_risks
7. pg_execute_code (auto-added)

### Category 1: Dependency Graph Filtering

1. `pg_dependency_graph({excludeExtensionSchemas: false})` → expect more nodes than default (default excludes cron/topology/tiger). Count nodes and compare
2. `pg_dependency_graph({excludeExtensionSchemas: true})` → count nodes, verify < test 1
3. `pg_dependency_graph({includeRowCounts: false})` → verify node objects do NOT have `rowCount` field
4. `pg_dependency_graph({includeRowCounts: true})` → verify node objects HAVE `rowCount` field with numeric values
5. `pg_dependency_graph({schema: "test_schema"})` → verify only `test_schema` objects in graph (or empty if no FKs in that schema)

### Category 2: Topological Sort Completeness

6. `pg_topological_sort({direction: "create"})` → verify isolated tables (no FK, e.g., `test_articles`, `test_measurements`) appear in order at level 0 with empty `dependencies`
7. `pg_topological_sort({direction: "drop"})` → verify same isolated tables still appear (direction shouldn't lose tables)
8. Compare create vs drop: count of tables should be identical in both directions
9. `pg_topological_sort({excludeExtensionSchemas: false})` → verify more tables than with `true`

### Category 3: Cascade Simulator Comparative

Run all three operation types on `test_departments` and compare:

10. `pg_cascade_simulator({table: "test_departments", operation: "DELETE"})` → capture `severity` and `affectedTables` count. Expect RESTRICT block from `test_projects` and NO ACTION block from `test_audit_log` (via employees)
11. `pg_cascade_simulator({table: "test_departments", operation: "DROP"})` → expect higher severity than DELETE (DROP force-cascades regardless of FK rules). All dependent tables affected
12. `pg_cascade_simulator({table: "test_departments", operation: "TRUNCATE"})` → expect similar severity to DROP (TRUNCATE also force-cascades)
13. Verify: DROP and TRUNCATE `severity` should be `"critical"` when dependent tables exist
14. Verify: DELETE should show `blockingActions` in stats (NO ACTION + RESTRICT FKs)

### Category 4: Cascade Simulator Self-Reference

15. `pg_cascade_simulator({table: "test_employees", operation: "DELETE"})` → verify self-referencing FK (`manager_id → id`, SET NULL) is handled without infinite recursion
16. Verify `test_employees` appears in affected tables (from `test_assignments` CASCADE and `test_audit_log` NO ACTION), but self-reference doesn't cause circular explosion
17. Verify `test_departments` does NOT appear in affected tables (employees→departments FK is "from" employees, not "to")

### Category 5: Constraint Analysis Selective Checks

18. `pg_constraint_analysis({checks: ["missing_pk"]})` → verify ONLY missing PK findings returned (should find `test_audit_log`). No unindexed FK findings in results
19. `pg_constraint_analysis({checks: ["unindexed_fk"]})` → verify ONLY unindexed FK findings returned (should find `test_audit_log.employee_id`). No missing PK findings
20. `pg_constraint_analysis({checks: ["missing_pk", "unindexed_fk"]})` → verify both types present
21. `pg_constraint_analysis({checks: ["redundant"]})` → verify only redundant constraint findings (may be empty in test DB)

### Category 6: Migration Risks Multi-Statement

22. `pg_migration_risks({statements: ["ALTER TABLE test_employees DROP COLUMN hire_date", "ALTER TABLE test_orders ADD COLUMN notes TEXT", "DROP TABLE test_assignments CASCADE"]})` → verify each statement gets its own risk entry. DROP COLUMN and DROP TABLE CASCADE should be higher risk than ADD COLUMN
23. Verify response `risks` array has 3 entries (one per statement)
24. Verify `summary` aggregates all risks

### Category 7: Migration Risks Idempotent DDL

25. `pg_migration_risks({statements: ["DROP TABLE IF EXISTS test_assignments"]})` → compare risk to unconditional `DROP TABLE test_assignments CASCADE`
26. `pg_migration_risks({statements: ["CREATE TABLE IF NOT EXISTS test_new (id INT)"]})` → verify lower risk than unconditional CREATE (IF NOT EXISTS is safer)
27. `pg_migration_risks({statements: ["SELECT 1"]})` → verify no risk or minimal risk for read-only statement

### Category 8: Schema Snapshot Cross-Schema

28. `pg_schema_snapshot({schema: "test_schema"})` → verify returns only `test_schema` objects. Should include `order_seq` sequence
29. `pg_schema_snapshot({schema: "test_schema", sections: ["sequences"]})` → verify only sequences section, containing `order_seq`
30. `pg_schema_snapshot({schema: "nonexistent_schema_xyz"})` → expect structured error or empty snapshot (not crash)

### Final Cleanup

All tools in this group are read-only — no cleanup needed. Confirm `test_products` (15 rows), `test_orders` (20 rows), and `test_measurements` (640 rows) are unchanged.

---

## migration Group Advanced Tests

> **Note:** Basic checklist and Part 1 Category 2.3 (State Pollution) already cover: init idempotency, apply success, duplicate hash detection, rollback execution, and re-apply after rollback. This category focuses on **record-only distinction, failure persistence, history filtering, status alignment, and rollback edge cases**.

> **Prerequisite:** All tests require `pg_migration_init` first. Tests build on each other and must run in order.

### migration Group Tools (6 +1 code mode)

1. pg_migration_init
2. pg_migration_record
3. pg_migration_apply
4. pg_migration_rollback
5. pg_migration_history
6. pg_migration_status
7. pg_execute_code (auto-added)

### Category 1: Record vs Apply Distinction

1. `pg_migration_init()` → initialize tracking table
2. `pg_migration_record({version: "stress-record-1.0", migrationSql: "CREATE TABLE stress_record_only (id INT);", rollbackSql: "DROP TABLE IF EXISTS stress_record_only;", sourceSystem: "stress-test"})` → verify `success: true` with SHA-256 hash and `record.status = "recorded"` (NOT `"applied"`)
3. Verify `stress_record_only` does NOT exist: `pg_read_query({sql: "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'stress_record_only') AS e"})` → `false`
4. `pg_migration_apply({version: "stress-apply-1.0", migrationSql: "CREATE TABLE stress_apply_test (id SERIAL PRIMARY KEY, name TEXT);", rollbackSql: "DROP TABLE IF EXISTS stress_apply_test;", sourceSystem: "stress-test"})` → verify `success: true` and `record.status = "applied"`
5. Verify `stress_apply_test` DOES exist via `pg_read_query`

### Category 2: Failed Migration Persistence

6. `pg_migration_apply({version: "stress-fail-1.0", migrationSql: "ALTER TABLE nonexistent_table_xyz ADD COLUMN bad_col INT;", sourceSystem: "stress-test"})` → verify `success: false`
7. `pg_migration_history({status: "failed"})` → verify entry with version `"stress-fail-1.0"` appears with error details
8. Verify failed entry has `status: "failed"` and non-null error information

### Category 3: History Filtering Combinatorics

9. `pg_migration_history()` → capture total count (should be ≥3 from steps above: record, apply, fail)
10. `pg_migration_history({status: "applied"})` → verify only applied entries
11. `pg_migration_history({status: "recorded"})` → verify only record-only entries (from step 1.2)
12. `pg_migration_history({sourceSystem: "stress-test"})` → verify only entries with `sourceSystem: "stress-test"`
13. `pg_migration_history({limit: 1})` → verify exactly 1 record returned
14. `pg_migration_history({limit: 1, offset: 1})` → verify returns different record than limit-only call
15. `pg_migration_history({status: "applied", sourceSystem: "stress-test"})` → verify combined filter

### Category 4: Status Dashboard Alignment

16. `pg_migration_status()` → capture counts (`applied`, `recorded`, `rolledBack`, `failed`)
17. Cross-verify: `applied` count should match `pg_migration_history({status: "applied"})` total
18. Cross-verify: `recorded` count should match `pg_migration_history({status: "recorded"})` total
19. Cross-verify: `failed` count should match `pg_migration_history({status: "failed"})` total
20. Verify `latestVersion` is the most recently applied version
21. Verify `sourceSystems` includes `"stress-test"`

### Category 5: Rollback Edge Cases

22. `pg_migration_rollback({version: "nonexistent-version-xyz"})` → expect structured error (version not found)
23. `pg_migration_rollback({version: "stress-apply-1.0", dryRun: true})` → verify rollback SQL returned without execution, `stress_apply_test` still exists
24. `pg_migration_rollback({version: "stress-apply-1.0"})` → execute rollback, verify `stress_apply_test` dropped
25. `pg_migration_rollback({version: "stress-apply-1.0"})` → attempt rollback again on already rolled-back version → expect structured error or graceful handling

### Category 6: Multi-Migration Hash Independence

26. `pg_migration_apply({version: "stress-multi-1", migrationSql: "CREATE TABLE stress_multi_a (id INT);", rollbackSql: "DROP TABLE IF EXISTS stress_multi_a;", sourceSystem: "stress-test"})` → capture `record.migrationHash`
27. `pg_migration_apply({version: "stress-multi-2", migrationSql: "CREATE TABLE stress_multi_b (id INT);", rollbackSql: "DROP TABLE IF EXISTS stress_multi_b;", sourceSystem: "stress-test"})` → capture `record.migrationHash`, verify different from step 26
28. `pg_migration_apply({version: "stress-multi-3", migrationSql: "CREATE TABLE stress_multi_c (id INT);", rollbackSql: "DROP TABLE IF EXISTS stress_multi_c;", sourceSystem: "stress-test"})` → capture `record.migrationHash`, verify unique
29. Rollback `stress-multi-2` only → verify `stress_multi_a` and `stress_multi_c` still exist but `stress_multi_b` is dropped
30. Verify `pg_migration_history` shows: stress-multi-1 applied, stress-multi-2 rolled_back, stress-multi-3 applied

### Final Cleanup

1. Drop all `stress_*` tables created by migration tests
2. Drop `_mcp_schema_versions` table
3. Verify no `stress_*` tables remain

---

## backup Group Advanced Tests

> Audit backup tools require `--audit-backup` enabled on test server. All 3 tools return `{success: false, error: "Audit backup not enabled"}` when disabled. When enabled, snapshot files are gzip-compressed (`.snapshot.json.gz`). **V2 features under test**: `restoreAs` (non-destructive side-by-side restore), `volumeDrift` (row count + size drift in diff output), and Code Mode audit coverage via the AuditInterceptor.

### backup Group Tools (12 +1 code mode)

1. pg_dump_table
2. pg_dump_schema
3. pg_copy_export
4. pg_copy_import
5. pg_create_backup_plan
6. pg_restore_command
7. pg_backup_physical
8. pg_restore_validate
9. pg_backup_schedule_optimize
10. pg_audit_list_backups
11. pg_audit_restore_backup
12. pg_audit_diff_backup
13. pg_execute_code (auto-added)

### Category 1: Snapshot Lifecycle (Audit Backup)

1. Create `stress_backup_lifecycle (id SERIAL PRIMARY KEY, name TEXT, status TEXT DEFAULT 'active')`, insert 3 rows via `pg_batch_insert`
2. `pg_truncate({table: "stress_backup_lifecycle"})` → triggers pre-mutation snapshot capture
3. `pg_audit_list_backups({target: "stress_backup_lifecycle"})` → verify snapshot exists with `filename`, `timestamp`, `tool: "pg_truncate"`, `target: "stress_backup_lifecycle"`
4. `pg_write_query({sql: "ALTER TABLE stress_backup_lifecycle ADD COLUMN drift_col INT DEFAULT 0"})` → introduce schema drift post-snapshot
5. `pg_audit_diff_backup({filename: <from step 3>})` → verify diff detects the `drift_col` addition
6. `pg_audit_restore_backup({filename: <from step 3>, dryRun: true})` → verify DDL preview returned; `drift_col` still present on live table after dry run
7. `pg_audit_restore_backup({filename: <from step 3>, confirm: true})` → verify restore executes successfully
8. `pg_describe_table({table: "stress_backup_lifecycle"})` → confirm `drift_col` no longer exists (restored to pre-truncate schema)

### Category 2: Multiple Snapshots, Filtering, and volumeDrift

9. Create `stress_backup_multi (id INT PRIMARY KEY, val TEXT)`, insert 2 rows
10. `pg_truncate({table: "stress_backup_multi"})` → first snapshot; verify `{success: true}`
11. Insert 1 row, then `pg_truncate({table: "stress_backup_multi"})` → second snapshot
12. `pg_audit_list_backups({target: "stress_backup_multi"})` → verify `count >= 2` (multiple snapshots for same table)
13. `pg_audit_list_backups({tool: "pg_truncate"})` → verify tool filter returns only `pg_truncate` snapshots
14. `pg_audit_list_backups()` → verify all snapshots across all tables returned; note snapshot filenames end in `.snapshot.json.gz`

**volumeDrift verification:**

15. Capture the filename for the *first* `stress_backup_multi` snapshot (before 2nd truncate); at that point it had 2 rows
16. `pg_audit_diff_backup({filename: <first snapshot>})` → verify `volumeDrift` object present:
    - `rowCountSnapshot: 2` (row count at snapshot time)
    - `rowCountCurrent: 0` (table was truncated twice, now 0 rows or 1 depending on test state)
    - `summary` string describes the row count change
    - `hasDifferences` is `true` if any schema drift exists OR `volumeDrift` row counts differ
17. Verify `sizeBytesSnapshot` and `sizeBytesCurrent` fields present (may be `null` if size data unavailable)

### Category 3b: restoreAs Non-Destructive Restore

> Uses `stress_backup_lifecycle` snapshots from Category 1 above. Requires the table to have schema drift introduced (drift_col still present, or re-add it).

22. `pg_write_query({sql: "ALTER TABLE stress_backup_lifecycle ADD COLUMN has_drifted BOOLEAN DEFAULT false"})` → introduce fresh drift for restoreAs test
23. Capture any snapshot filename from `pg_audit_list_backups({target: "stress_backup_lifecycle"})`
24. `pg_audit_restore_backup({filename: <captured>, restoreAs: "stress_backup_restored", dryRun: true})` → verify:
    - Response `{success: true}` or dry-run preview returned
    - `stress_backup_lifecycle` still exists with `has_drifted` column (original unmodified)
    - `stress_backup_restored` does NOT yet exist (dry-run only previews)
25. `pg_audit_restore_backup({filename: <captured>, restoreAs: "stress_backup_restored", confirm: true})` → verify:
    - Response `{success: true}`
    - `stress_backup_lifecycle` still has `has_drifted` column (unmodified)
    - `pg_describe_table({table: "stress_backup_restored"})` → verify `has_drifted` column is NOT present (restored to snapshot's structure)
    - `pg_count({table: "stress_backup_restored"})` → `{count: 0}` (DDL-only restore, no data copy)
26. 🔴 `pg_audit_restore_backup({filename: <captured>, restoreAs: "stress_backup_restored", confirm: true})` → report behavior when `restoreAs` target already exists (conflicting table)

### Category 4: Code Mode Audit Interceptor Coverage

> Verifies that Code Mode calls through `pg_execute_code` that trigger destructive ops are captured by the AuditInterceptor.

27. Via Code Mode:
    ```javascript
    await pg.core.dropTable({table: 'stress_codemode_audit', ifExists: true});
    await pg.core.createTable({name: 'stress_codemode_audit', columns: [{name: 'id', type: 'SERIAL', primaryKey: true}, {name: 'tag', type: 'TEXT'}]});
    await pg.core.batchInsert({table: 'stress_codemode_audit', rows: [{tag: 'a'}, {tag: 'b'}, {tag: 'c'}]});
    await pg.core.dropTable({table: 'stress_codemode_audit', ifExists: true});
    return 'done';
    ```
28. `pg_audit_list_backups({tool: "pg_execute_code"})` → verify:
    - `count >= 1` — the `pg_drop_table` call inside Code Mode was intercepted
    - Snapshot has `tool: "pg_execute_code"` and `target` containing `stress_codemode_audit`
29. `pg_audit_diff_backup({filename: <from step 28>})` → verify diff reports the DDL of the dropped table

### Category 5 (was 3): Error Message Quality

30. `pg_audit_diff_backup({filename: "nonexistent_snapshot_xyz.json"})` → structured error with `filename` context, NOT raw MCP error
31. `pg_audit_restore_backup({filename: "valid.json"})` without `confirm` → structured error mentioning `confirm` is required
32. `pg_audit_restore_backup({filename: "nonexistent_xyz.json", confirm: true})` → structured error for missing file
33. All 3 audit tools called with `--audit-backup` **disabled**: verify each returns `{success: false, error: "..."}` structured error, NOT MCP error

### Category 6 (was 4): Code Mode Parity

```javascript
// Run via pg_execute_code
const list = await pg.backup.listBackups();
const hasSnapshots = (list.snapshots?.length ?? list.count ?? 0) > 0;
return { hasSnapshots, count: list.count ?? list.snapshots?.length ?? 0 };
```

34. Verify: `hasSnapshots: true` and `count > 0` (from lifecycle snapshots above)

```javascript
// Diff via code mode with volumeDrift check
const snapshots = await pg.backup.listBackups({ target: "stress_backup_multi" });
const filename = snapshots.snapshots?.[0]?.filename;
if (!filename) return { error: "No snapshot found" };
const diff = await pg.backup.diffBackup({ filename });
return { hasDiff: !!diff, hasVolumeDrift: !!diff.volumeDrift, filename };
```

35. Verify: `hasDiff: true`, `hasVolumeDrift: true`

### Final Cleanup

Drop `stress_backup_lifecycle`, `stress_backup_multi`, `stress_backup_restored`, and `stress_codemode_audit`. Confirm no `stress_*` tables remain.

---

## Cross-Group Integration Workflows

> **Purpose**: Test realistic multi-group pipelines that exercise tool chains spanning multiple groups. These catch state-management bugs that single-group tests miss (e.g., temp table metadata leaking between groups, transaction isolation issues).

### Workflow 1: Core → JSONB → Stats (Data Pipeline)

1. `pg_create_table({table: "stress_pipeline", columns: [{name: "id", type: "SERIAL PRIMARY KEY"}, {name: "data", type: "JSONB"}, {name: "score", type: "NUMERIC(5,2)"}]})` → success
2. Insert 5 rows with JSONB data (`{"category": "tech", "priority": N}`) and varying scores
3. `pg_jsonb_extract({table: "stress_pipeline", column: "data", path: "$.category"})` → verify extraction
4. `pg_stats_descriptive({table: "stress_pipeline", column: "score"})` → verify mean, stddev, min, max
5. `pg_stats_percentiles({table: "stress_pipeline", column: "score", percentiles: [25, 50, 75]})` → verify 3 values
6. `pg_stats_outliers({table: "stress_pipeline", column: "score"})` → verify outlier detection on small dataset (5 rows)
7. `pg_stats_frequency({table: "stress_pipeline", column: "score"})` → verify frequency distribution with value/count/percentage
8. `pg_stats_summary({table: "stress_pipeline"})` → verify includes `score` column in multi-column summary
9. Cleanup: `pg_drop_table({table: "stress_pipeline"})`

### Workflow 2: Core → Vector → Text (AI Search Pipeline)

7. `pg_create_table({table: "stress_ai_search", columns: [{name: "id", type: "SERIAL PRIMARY KEY"}, {name: "content", type: "TEXT"}, {name: "embedding", type: "vector(4)"}]})` → success
8. Insert 3 rows with text content and 4-dim vectors
9. `pg_vector_search({table: "stress_ai_search", column: "embedding", vector: [0.1, 0.2, 0.3, 0.4], limit: 2})` → verify 2 nearest results
10. `pg_text_search({table: "stress_ai_search", column: "content", query: "<search term>"})` → verify text search
11. Cleanup: `pg_drop_table({table: "stress_ai_search"})`

### Workflow 3: Migration → Introspection (Schema Lifecycle)

12. `pg_migration_init()` then `pg_migration_apply({version: "stress-integration", migrationSql: "CREATE TABLE stress_migrated (id SERIAL PRIMARY KEY, status TEXT DEFAULT 'active');", rollbackSql: "DROP TABLE IF EXISTS stress_migrated;"})` → verify migration applied
13. `pg_describe_table({table: "stress_migrated"})` → verify columns match migration DDL
14. `pg_constraint_analysis({table: "stress_migrated"})` → verify primary key constraint
15. `pg_migration_rollback({version: "stress-integration"})` → verify rollback
16. `pg_describe_table({table: "stress_migrated"})` → verify table no longer exists (structured error)

### Workflow 4: Admin → Performance (Health Check Pipeline)

17. `pg_analyze({table: "test_products"})` → update statistics
18. `pg_explain({sql: "SELECT * FROM test_products WHERE name = 'Laptop'"})` → execution plan
19. `pg_vacuum({table: "test_products"})` → vacuum
20. `pg_explain({sql: "SELECT * FROM test_products WHERE name = 'Laptop'"})` → compare plan post-vacuum

### Error Code Consistency (Cross-Group Check)

During all workflows above, watch for these error code quality indicators:

| Quality Level     | Example                                                     | Verdict                                     |
| ----------------- | ----------------------------------------------------------- | ------------------------------------------- |
| **5 - Excellent** | `Table 'stress_pipeline' does not exist (schema: public)`   | ✅ Includes object name + context            |
| **4 - Good**      | `Table 'stress_pipeline' does not exist`                    | ✅ Includes object name                      |
| **3 - Adequate**  | `relation "stress_pipeline" does not exist`                 | ⚠️ Raw PG error leaked but informative       |
| **2 - Poor**      | `ERROR: 42P01: relation does not exist`                     | ⚠️ Code-only, no object name                 |
| **1 - Useless**   | `Query failed` or generic `Error occurred`                  | ❌ No context, report as issue               |

Flag any tool returning Level 1-2 error messages as ⚠️ with the tool name for error quality improvement.

### Final Cleanup

Drop all remaining `stress_*` tables, views, and schemas. Drop `_mcp_schema_versions` if present. Confirm all test table row counts match baselines.
