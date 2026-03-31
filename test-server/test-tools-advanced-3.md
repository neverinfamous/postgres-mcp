# Advanced Stress Test — postgres-mcp — Part 3

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run test-tools-advanced-1.md, test-tools-advanced-2.md, test-tools-advanced-4.md.
- All changes **MUST** be consistent with other postgres-mcp tools and `code-map.md`.
- Do not do anything other than these tests.

## Code Mode Execution

All tests should be executed via `pg_execute_code` code mode. Tests are written in direct tool call syntax for readability — translate to code mode:

| Direct Tool Call                                     | Code Mode Equivalent                                           |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `pg_read_query({sql: "..."})`                        | `pg.core.readQuery({sql: "..."})`                              |
| `pg_write_query({sql: "..."})`                       | `pg.core.writeQuery({sql: "..."})`                             |
| `pg_create_table({table: "...", columns: [...]})`    | `pg.core.createTable({table: "...", columns: [...]})`          |
| `pg_describe_table({table: "..."})`                  | `pg.core.describeTable({table: "..."})`                        |
| `pg_drop_table({table: "..."})`                      | `pg.core.dropTable({table: "..."})`                            |
| `pg_count({table: "..."})`                           | `pg.core.count({table: "..."})`                                |
| `pg_exists({table: "..."})`                          | `pg.core.exists({table: "..."})`                               |
| `pg_batch_insert({...})`                             | `pg.core.batchInsert({...})`                                   |
| `pg_upsert({...})`                                   | `pg.core.upsert({...})`                                        |
| `pg_transaction_*({...})`                            | `pg.transactions.*({...})`                                     |
| `pg_jsonb_*({...})`                                  | `pg.jsonb.*({...})`                                            |
| `pg_text_*` / `pg_trigram_*` / `pg_fuzzy_*` / etc.   | `pg.text.*`                                                    |
| `pg_stats_*({...})`                                  | `pg.stats.*({...})`                                            |
| `pg_vector_*({...})`                                 | `pg.vector.*({...})`                                           |

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
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in test-tools-advanced-3.md (this prompt) and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
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
5. `pg_ltree_lca` with only 1 path → expect `{hasCommonAncestor: true}` with the identical path returned
6. `pg_ltree_lca` with identical paths `["electronics.phones", "electronics.phones"]` → expect `{hasCommonAncestor: true}` and returns `"electronics.phones"`
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
5. `pg_cron_job_run_details({jobName: "stress_dup_job"})` → report behavior (if tool exists)
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