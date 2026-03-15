# Advanced Stress Test — postgres-mcp

**Step 1:** Read `C:\Users\chris\Desktop\postgres-mcp\src\constants\server-instructions.md` using `view_file` (not grep or search) to understand documented behaviors, edge cases, and response structures.

**Step 2:** Execute each numbered stress test below using both code mode (pg_execute_code) and direct tool calls, not scripts/terminal.

## Test Database Schema

Refer to `test-tools.md` § Test Database Schema for the full schema reference. Key tables: `test_products` (15 rows), `test_orders` (20), `test_jsonb_docs` (3), `test_articles` (3), `test_measurements` (500), `test_embeddings` (50), `test_locations` (5), `test_users` (3), `test_categories` (6), `test_events` (100 across 4 partitions), `test_departments` (3), `test_employees` (5), `test_projects` (2), `test_assignments` (3), `test_audit_log` (3).

## Naming & Cleanup

- **Temporary tables**: Prefix with `stress_` (e.g., `stress_empty_table`)
- **Temporary indexes**: Prefix with `stress_idx_`
- **Temporary views**: Prefix with `stress_view_`
- **Temporary schemas**: Prefix with `stress_schema_`
- Clean up ALL `stress_*` objects after testing

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response for the given input
- ✅ Confirmed: Edge case handled correctly (use only inline during testing; omit from Final Summary)

---

## Category 1: Boundary Values & Empty States

### 1.1 Empty Table Operations

Create `stress_empty_table (id SERIAL PRIMARY KEY, name TEXT, value DECIMAL(10,2))`, then test:

1. `pg_count` on `stress_empty_table` → expect `{count: 0}`
2. `pg_exists` on `stress_empty_table` (no WHERE) → expect `{exists: false, mode: "any_rows"}`
3. `pg_stats_descriptive` on `stress_empty_table` column `value` → expect graceful error or empty stats (not a crash)
4. `pg_stats_distribution` on `stress_empty_table` column `value` → expect structured error `{error: "No data or all nulls in column"}` (not a crash)
5. `pg_stats_sampling` on `stress_empty_table` → expect empty results, not error
6. `pg_copy_export` on `stress_empty_table` → expect `{rowCount: 0}` or empty data
7. `pg_dump_table` on `stress_empty_table` → expect valid DDL
8. `pg_schema_snapshot` with `sections: ["tables"]` → verify `stress_empty_table` appears

### 1.2 Single-Row Table

Insert one row into `stress_empty_table` (name: 'solo', value: 42.00), then test:

1. `pg_stats_descriptive` → expect valid stats (mean=42, stddev=0 or null)
2. `pg_stats_percentiles` with `[0.25, 0.5, 0.75]` → all should equal 42
3. `pg_stats_correlation` — requires 2 numeric columns. Use `id` and `value` → expect null or degenerate correlation (single point)
4. `pg_stats_hypothesis` with `hypothesizedMean: 40` → expect degenerate test result (n=1)
5. `pg_stats_regression` on single row → expect graceful handling (regression undefined for n=1)

### 1.3 NULL-Heavy Data

Insert 5 rows into `stress_empty_table` with: 3 rows where `name IS NULL` and `value IS NULL`, 2 rows with actual values.

1. `pg_count` with `column: "value"` → expect 3 (COUNT of non-null values: solo + real1 + real2)
2. `pg_exists` with `where: "value IS NULL"` → expect `{exists: true}`
3. N/A — `stress_empty_table` has no JSONB column. To test JSONB NULL behavior, use `test_jsonb_docs` or create a table with a JSONB column
4. `pg_copy_export` → verify NULL representation in CSV output

### 1.4 Extreme Numeric Values

Insert into `stress_empty_table`: `(name: 'max', value: 99999999.99)`, `(name: 'min', value: -99999999.99)`, `(name: 'zero', value: 0.00)`, `(name: 'tiny', value: 0.01)`

1. `pg_stats_descriptive` → verify mean, min, max are correct
2. `pg_batch_insert` with 100 rows using `generate_series` equivalent via code mode → verify `insertedCount: 100`

---

## Category 2: State Pollution & Idempotency

### 2.1 Create-Drop-Recreate Cycles

1. `pg_create_table` → create `stress_cycle_table (id INT PRIMARY KEY, data TEXT)`
2. `pg_create_index` → create `stress_idx_cycle` on `stress_cycle_table(data)`
3. `pg_drop_index` → drop `stress_idx_cycle` → expect `{existed: true}`
4. `pg_drop_index` → drop `stress_idx_cycle` again with `ifExists: true` → expect `{existed: false}` (not error)
5. `pg_create_index` → create `stress_idx_cycle` again → expect success
6. `pg_drop_table` → drop `stress_cycle_table` → expect `{existed: true}`
7. `pg_drop_table` → drop `stress_cycle_table` again with `ifExists: true` → expect `{existed: false}`
8. `pg_create_table` → recreate `stress_cycle_table` → expect success (no orphaned metadata)

### 2.2 Duplicate Object Detection

1. `pg_create_table` with `ifNotExists: true` on `test_products` → expect success with indication it already exists
2. `pg_create_index` with `ifNotExists: true` on `idx_orders_status` → expect `{alreadyExists: true}`
3. `pg_create_schema` with `ifNotExists: true` on `public` → expect graceful handling
4. `pg_create_view` with `orReplace: true` on `test_order_summary` using the same query → expect success

### 2.3 Migration Idempotency

(Requires `pg_migration_init` first)

1. `pg_migration_init` → note `tableCreated`
2. `pg_migration_init` again → expect `{tableCreated: false}` (idempotent)
3. `pg_migration_apply` with version `"stress-1.0"`, SQL: `CREATE TABLE stress_migration_idem (id INT);`
4. `pg_migration_apply` with version `"stress-1.1"` but **same SQL** → expect duplicate hash detection
5. `pg_migration_rollback` version `"stress-1.0"` (actual execution, not dryRun) → verify table dropped
6. `pg_migration_apply` again with version `"stress-2.0"` and same SQL → expect success (rolled-back entries don't block)
7. Cleanup: Drop `stress_migration_idem`, `_mcp_schema_versions`

---

## Category 3: Alias & Parameter Combinations

### 3.1 Core Tool Alias Matrix (aliases NOT covered in first-level testing)

First-level tests already cover: `pg_count` with `tableName`/`condition`, `pg_read_query` with `query`, `pg_exists` with `tableName`, `pg_describe_table` with `name`, `pg_analyze_query_indexes` with `query`. Test the remaining aliases here:

| Tool                | Primary Param | Test with Alias                                                                            | Expected Behavior             |
| ------------------- | ------------- | ------------------------------------------------------------------------------------------ | ----------------------------- |
| `pg_write_query`    | `sql`         | `{query: "UPDATE test_products SET name = name WHERE id = 1"}`                             | Returns `{rowsAffected: 1}`   |
| `pg_count`          | `where`       | `{table: "test_products", filter: "price > 50"}`                                           | Returns count > 0 (`filter` alias — first-level tests `condition`) |
| `pg_exists`         | `where`       | `{table: "test_products", filter: "id = 1"}`                                               | Returns `{exists: true}` (`filter` alias) |
| `pg_upsert`         | `data`        | `{table: "stress_cycle_table", values: {id: 999, data: "alias"}, conflictColumns: ["id"]}` | Returns success (`values` alias for `data`) |
| `pg_drop_table`     | `table`       | `{name: "stress_does_not_exist", ifExists: true}`                                          | Returns `{existed: false}` (`name` alias) |
| `pg_drop_table`     | `table`       | `{tableName: "stress_does_not_exist", ifExists: true}`                                     | Returns `{existed: false}` (`tableName` alias) |

### 3.2 Extension Tool Alias Matrix

| Tool                  | Primary Param | Test with Alias                                                       | Expected Behavior      |
| --------------------- | ------------- | --------------------------------------------------------------------- | ---------------------- |
| `pg_ltree_query`      | `table`       | `{tableName: "test_categories", column: "path", path: "electronics"}` | Returns descendants    |
| `pg_ltree_subpath`    | `offset`      | `{path: "a.b.c.d", start: 1, length: 2}`                              | Returns `b.c`          |
| `pg_citext_compare`   | —             | `{value1: "Hello", value2: "HELLO"}`                                  | `citextEqual: true`    |
| `pg_pgcrypto_hash`    | —             | `{data: "test", algorithm: "sha256"}`                                 | Returns hex hash       |
| `pg_pgcrypto_encrypt` | `password`    | `{data: "secret", key: "mykey"}`                                      | Returns encrypted data |

### 3.3 Schema-Qualified Table Names

Test `schema.table` parsing on these tools (use `public.test_products`):

1. `pg_count({table: "public.test_products"})` → expect `{count: 15}`
2. `pg_exists({table: "public.test_products"})` → expect `{exists: true}`
3. `pg_describe_table({table: "public.test_products"})` → expect column info
4. `pg_stats_descriptive({table: "public.test_products", column: "price"})` → expect stats
5. `pg_dump_table({table: "public.test_products"})` → expect DDL
6. `pg_copy_export({table: "public.test_products", limit: 5})` → expect 5 rows

Also test with `test_schema.order_seq`: 7. `pg_list_sequences({schema: "test_schema"})` → expect `order_seq`

---

## Category 4: Error Message Quality

For each test below, verify the error returns a **structured response** (`{success: false, error: "..."}`) - NOT a raw MCP exception. Rate each error message: does it include enough context to diagnose the problem without looking at logs?

> **Note:** Nonexistent-object tests (P154) are already covered comprehensively in first-level testing. This category focuses on error *quality* for scenarios NOT covered there.

### 4.1 Cross-Group Nonexistent Objects (not covered in first-level)

1. `pg_get_indexes({table: "nonexistent_table_xyz"})` → report behavior (first-level doesn't test this tool with nonexistent table)
2. `pg_object_details({name: "nonexistent_table_xyz"})` → structured error
3. `pg_stats_descriptive({table: "nonexistent_table_xyz", column: "price"})` → structured error

### 4.2 Invalid Columns

1. `pg_count({table: "test_products", column: "nonexistent_col"})` → report behavior
2. `pg_stats_descriptive({table: "test_products", column: "nonexistent_col"})` → structured error
3. `pg_stats_correlation({table: "test_products", column1: "name", column2: "description"})` → error about non-numeric columns (both are VARCHAR)
4. `pg_create_index({table: "test_products", columns: ["nonexistent_col"]})` → report behavior
5. `pg_ltree_query({table: "test_products", column: "name", path: "electronics"})` → error about non-ltree column

### 4.3 Type Mismatches

1. `pg_vector_insert` with a 128-dim vector into `test_embeddings` (384-dim column) → expect dimension mismatch error
2. `pg_pgcrypto_decrypt` with wrong password on encrypted data → expect structured error
3. `pg_stats_time_series` with `timeColumn: "name"` (TEXT, not timestamp) on `test_products` → expect type validation error
4. `pg_pgcrypto_hash` with invalid algorithm `"sha999"` → structured error

### 4.4 Invalid Parameter Values

1. `pg_migration_apply` with no params `{}` → expect validation error, not crash
2. `pg_transaction_execute` with empty `statements: []` → report behavior
3. `pg_transaction_execute` with `statements: [{}]` (missing `sql` key) → report behavior
4. `pg_stats_distribution` with `buckets: 0` → expect error (must be > 0)
5. `pg_stats_distribution` with `buckets: -1` → expect error
6. `pg_capacity_planning` with `days: -30` → expect rejection
7. `pg_cron_schedule` with invalid cron expression `"invalid cron"` → report behavior
8. `pg_batch_insert` with `rows: []` (empty array) → report behavior

---

## Category 5: Concurrency & Transaction Edge Cases

### 5.1 Aborted Transaction Recovery

1. `pg_transaction_begin` → get `transactionId`
2. Execute intentionally failing SQL: `pg_write_query` within transaction → `"INSERT INTO nonexistent_table VALUES (1)"`
3. `pg_transaction_status({transactionId: <id>})` → verify `{status: "aborted"}` (transaction is poisoned)
4. Attempt another write in same transaction → expect aborted state error
5. `pg_transaction_rollback` → expect success (transaction can be cleanly ended)
6. `pg_transaction_status({transactionId: <id>})` → verify `{status: "not_found"}` (rolled-back transaction is cleaned up)
7. Start new transaction → verify it works normally

### 5.2 Savepoint Stress Test

1. `pg_transaction_begin` → get `transactionId`
2. Create savepoint `sp1`
3. Insert row into `test_products` (within transaction)
4. Create savepoint `sp2`
5. Insert another row
6. Create savepoint `sp3`
7. Insert another row
8. `pg_transaction_rollback_to` `sp2` → should undo sp3's insert AND remove sp3
9. `pg_transaction_status({transactionId: <id>})` → verify still `{status: "active"}` (savepoint rollback does not abort the transaction)
10. Verify: savepoint `sp3` no longer exists (attempt rollback_to sp3 → expect error)
11. `pg_transaction_rollback_to` `sp1` → should undo sp2's insert
12. `pg_transaction_commit` → only pre-sp1 state should persist
13. Verify `test_products` row count is unchanged from baseline (15)

### 5.3 Transaction Execute Mixed Statements

1. `pg_transaction_execute` with mixed SELECT + INSERT + SELECT:
   ```
   statements: [
     {sql: "SELECT COUNT(*) AS before FROM test_products"},
     {sql: "INSERT INTO test_products (name, description, price) VALUES ('stress_tx', 'test', 99.99)"},
     {sql: "SELECT COUNT(*) AS after FROM test_products"}
   ]
   ```
2. Verify: `results[0].rows[0].before` = 15 (or current count), `results[2].rows[0].after` = before + 1
3. Cleanup: Delete the inserted row

### 5.4 Transaction Execute Failure Rollback

1. `pg_transaction_execute` with a failing statement mid-batch:
   ```
   statements: [
     {sql: "CREATE TABLE stress_tx_fail (id INT)"},
     {sql: "INSERT INTO nonexistent_table VALUES (1)"},
     {sql: "CREATE TABLE stress_tx_fail2 (id INT)"}
   ]
   ```
2. Verify: `success: false`, `statementsExecuted` indicates how far it got
3. Verify: `stress_tx_fail` does NOT exist (auto-rollback worked)

### 5.5 Transaction Timeout & Abandoned Transactions

1. `pg_transaction_begin` → get `transactionId`
2. Do NOT commit or rollback — leave transaction open
3. Wait ~5 seconds, then `pg_transaction_status({transactionId: <id>})` → verify `{status: "active"}` (abandoned transaction is still alive)
4. Attempt `pg_transaction_begin` again (new transaction while old is still open) → report behavior — does it succeed or block?
5. Clean up: `pg_transaction_rollback({transactionId: <id>})` the abandoned transaction
6. `pg_transaction_status({transactionId: <id>})` → verify `{status: "not_found"}` (cleaned up)
7. Verify new operations work normally after cleanup

### 5.6 Rapid State Transition Stress Test

1. Via `pg_execute_code`: Begin 3 transactions, verify all report `{status: "active"}`, then commit the first, force-abort the second (run bad SQL), and rollback the third. Status-check all three → expected: all `"not_found"` (committed and rolled-back transactions are cleaned up)
2. Verify no leaked connections: `pg_connection_stats()` → total connections should not have increased

---

## Category 6: Extension Edge Cases

### 6.1 Vector Dimension Mismatches

1. `pg_vector_insert` with a 3-dim vector `[1.0, 2.0, 3.0]` into `test_embeddings.embedding` (384-dim) → expect dimension error
2. `pg_vector_search` with a 5-dim query vector on `test_embeddings` → expect dimension error
3. `pg_vector_validate` with empty vector `[]` → expect `{valid: true, vectorDimensions: 0}`
4. `pg_vector_validate` with single-element `[1.0]` → expect `{valid: true, vectorDimensions: 1}`
5. `pg_vector_distance` between vectors of different dimensions `[1,2,3]` vs `[1,2]` → expect error

### 6.2 PostGIS Boundary Coordinates

1. `pg_geocode` with lat=91, lng=0 → expect bounds validation error (lat ±90°)
2. `pg_geocode` with lat=0, lng=181 → expect bounds validation error (lng ±180°)
3. `pg_geocode` with lat=90, lng=180 (exact boundary) → should succeed
4. `pg_geocode` with lat=-90, lng=-180 (exact boundary) → should succeed
5. `pg_distance` with out-of-bounds point → expect bounds validation error
6. `pg_point_in_polygon` with out-of-bounds point → expect bounds validation error

### 6.3 ltree Edge Cases

1. `pg_ltree_query` with `path: ""` (empty string) → report behavior
2. `pg_ltree_subpath` with `path: "a"`, `offset: 0`, `length: 1` → expect `"a"`
3. `pg_ltree_subpath` with `path: "a.b.c"`, `offset: 5` (beyond depth) → expect structured error with `pathDepth`
4. `pg_ltree_subpath` with negative offset `offset: -1` → expect last label
5. `pg_ltree_lca` with only 1 path → expect error (minimum 2 paths)
6. `pg_ltree_lca` with identical paths `["electronics", "electronics"]` → expect `{hasCommonAncestor: false}` with empty string (root-level labels have no ancestor above them — PostgreSQL's `lca()` returns `""` for single-label paths, even identical ones; use multi-level paths like `"electronics.phones"` to get meaningful LCA results)
7. `pg_ltree_lca` with paths having no common ancestor `["electronics", "clothing"]` → expect empty/null ancestor

### 6.4 pgcrypto Workflow Verification

Full encrypt → decrypt → verify cycle:

1. `pg_pgcrypto_encrypt({data: "sensitive-data-123", password: "strongpass"})` → capture encrypted output
2. `pg_pgcrypto_decrypt({encryptedData: <captured>, password: "strongpass"})` → expect `"sensitive-data-123"`
3. `pg_pgcrypto_decrypt({encryptedData: <captured>, password: "wrongpass"})` → expect structured error

Full password hash → verify cycle:

4. `pg_pgcrypto_gen_salt({type: "bf", iterations: 4})` → capture salt
5. `pg_pgcrypto_crypt({password: "mypassword", salt: <captured>})` → capture hash
6. `pg_pgcrypto_crypt({password: "mypassword", salt: <hash>})` → expect same hash (verification succeeds)
7. `pg_pgcrypto_crypt({password: "wrongpassword", salt: <hash>})` → expect different hash (verification fails)

### 6.5 citext Edge Cases

1. `pg_citext_convert_column` on a non-text column (e.g., `test_products.price` which is DECIMAL) → expect `{success: false, allowedTypes, suggestion}`
2. `pg_citext_analyze_candidates` with `excludeSystemSchemas: false` → verify more results than with `true`
3. `pg_citext_compare` with identical values `{value1: "test", value2: "test"}` → both `citextEqual` and `textEqual` should be `true`
4. `pg_citext_compare` with unicode: `{value1: "café", value2: "CAFÉ"}` → report behavior (accent handling)

### 6.6 JSONB Mutation Workflow

Create `stress_jsonb_mut (id SERIAL PRIMARY KEY, data JSONB DEFAULT '{}')`, insert one row with `data: {"name": "Alice", "tags": ["a", "b"], "nested": {"level1": {"value": 1}}}`, then test:

1. `pg_jsonb_set({table: "stress_jsonb_mut", column: "data", path: "name", value: "\"Bob\"", where: "id = 1"})` → verify `name` changed to `"Bob"`
2. `pg_jsonb_set({table: "stress_jsonb_mut", column: "data", path: "nested.level1.value", value: "42", where: "id = 1"})` → verify deep path set works
3. `pg_jsonb_set({table: "stress_jsonb_mut", column: "data", path: "newKey", value: "\"inserted\"", where: "id = 1", createMissing: true})` → verify new key added. **Note:** `pg_jsonb_insert` is for array targets only (see server-instructions §JSONB). Use `pg_jsonb_set` with `createMissing` for object key insertion
4. `pg_jsonb_delete({table: "stress_jsonb_mut", column: "data", path: "tags", where: "id = 1"})` → verify `tags` key removed
5. `pg_jsonb_merge` — standalone merge requires `base` + `overlay` params (not `doc1`/`doc2`). Use via Code Mode: `pg.jsonb.merge({base: {"a": 1, "b": 2}, overlay: {"b": 3, "c": 4}})` → verify merge result `{"a": 1, "b": 3, "c": 4}` (overlay wins on conflicts)
6. Verify final state via `pg_jsonb_extract` — confirm all mutations applied correctly
7. Cleanup: Drop `stress_jsonb_mut`

### 6.7 Cron Edge Cases

1. `pg_cron_schedule({name: "stress_dup_job", schedule: "0 0 * * *", command: "SELECT 1"})` → capture jobId
2. `pg_cron_schedule({name: "stress_dup_job", schedule: "0 1 * * *", command: "SELECT 2"})` → report behavior: does it error on duplicate name, or overwrite?
3. `pg_cron_schedule({name: "stress_bad_cron", schedule: "invalid cron", command: "SELECT 1"})` → report whether validation catches invalid expression or defers to pg_cron
4. `pg_cron_schedule({name: "stress_bad_sql", schedule: "0 0 * * *", command: "SELECT * FROM nonexistent_xyz"})` → report: does scheduling succeed (SQL validated on execution, not schedule-time)?
5. `pg_cron_job_details({jobName: "stress_dup_job"})` → report behavior (if tool exists)
6. Cleanup: `pg_cron_unschedule` all `stress_*` jobs

### 6.8 kcache Stress Tests

1. `pg_kcache_query_stats({limit: 0})` → verify unlimited mode works or report behavior
2. `pg_kcache_top_cpu({limit: 0})` → same
3. `pg_kcache_top_io({type: "reads", limit: 3})` → verify `type: "reads"` filter works
4. `pg_kcache_top_io({type: "writes", limit: 3})` → verify `type: "writes"` filter works
5. `pg_kcache_top_io({type: "invalid_type", limit: 3})` → report: structured error or accepted?
6. `pg_kcache_database_stats()` with no activity → verify graceful empty response

### 6.9 Partman Stress Tests

**Requires `test_logs` table (PARTITION BY RANGE on `created_at`, no existing partitions).**

1. `pg_partman_create_parent({parentTable: "test_logs", controlColumn: "created_at", interval: "1 day", startPartition: "now"})` → verify success and partitions created
2. `pg_partman_run_maintenance({parentTable: "test_logs"})` → verify success
3. `pg_partman_run_maintenance({parentTable: "test_logs"})` immediately again → verify idempotent (no error, no duplicate partitions)
4. `pg_partman_show_config({table: "test_logs"})` → verify config matches what was set
5. `pg_partman_analyze_partition_health()` → verify health check works with active partman tables
6. `pg_partman_create_parent({parentTable: "test_logs", controlColumn: "created_at", interval: "1 hour"})` → report: does it error because already managed, or overwrite?
7. Cleanup: `pg_partman_undo_partition({parentTable: "test_logs"})` or note state for `reset-database.ps1`

---

## Category 7: Large Payload & Truncation Verification

### 7.1 Truncation Indicators

Verify that tools returning `truncated` and `totalCount` fields work correctly:

1. `pg_list_tables({limit: 2})` → expect `truncated: true` and `totalCount` > 2
2. `pg_get_indexes({limit: 1})` → expect `truncated: true` and `totalCount` > 1
3. `pg_index_stats({limit: 1})` → expect `truncated: true` and `totalCount` > 1
4. `pg_table_stats({limit: 1})` → expect `truncated: true` and `totalCount` > 1
5. `pg_copy_export({table: "test_measurements", limit: 5})` → expect 5 rows
6. `pg_list_partitions({table: "test_events", limit: 1})` → expect `truncated: true` and remaining partitions in `totalCount`
7. `pg_show_settings({limit: 2})` → expect `truncated: true`

### 7.2 Limit Zero (Unlimited)

Verify `limit: 0` returns all rows:

1. `pg_list_tables({limit: 0})` → count should match actual table count
2. `pg_copy_export({table: "test_measurements", limit: 0})` → expect all 500 rows
3. `pg_index_stats({limit: 0})` → verify `truncated: false` or absent

### 7.3 Schema Snapshot Compact Mode

1. `pg_schema_snapshot()` (default) → note payload size
2. `pg_schema_snapshot({compact: true})` → verify tables section omits `columns` key, note payload size reduction
3. `pg_schema_snapshot({sections: ["tables", "indexes"]})` → verify only those sections present

---

## Category 8: Code Mode Parity

### 8.1 Core API Parity

Verify Code Mode aliases return identical results to direct tool calls:

```javascript
// Run via pg_execute_code
const direct = await pg.core.readQuery({
  sql: "SELECT COUNT(*) AS n FROM test_products",
});
const alias = await pg.readQuery("SELECT COUNT(*) AS n FROM test_products");
return {
  direct: direct.rows[0].n,
  alias: alias.rows[0].n,
  match: direct.rows[0].n === alias.rows[0].n,
};
```

Expect: `match: true`

### 8.2 Discovery Methods

1. `pg_execute_code: pg.help()` → verify returns group→methods mapping for all 21 groups
2. `pg_execute_code: pg.core.help()` → verify returns `{methods, methodAliases, examples}`
3. `pg_execute_code: pg.jsonb.help()` → verify JSONB-specific methods listed
4. `pg_execute_code: pg.admin.help()` → verify admin methods listed
5. `pg_execute_code: pg.introspection.help()` → verify lists 6 introspection methods
6. `pg_execute_code: pg.migration.help()` → verify lists 6 migration methods

### 8.3 Code Mode Error Handling

Code mode wraps errors as structured return values instead of throwing. Verify:

```javascript
const result = await pg.core.readQuery({ sql: "SELECT * FROM nonexistent_xyz" });
return {
  success: result.success,
  hasError: !!result.error,
  hasTableName: result.error?.includes("nonexistent_xyz"),
};
```

Expect: `{success: false, hasError: true, hasTableName: true}`

---

## Category 9: Anomaly Detection Stress Tests

### 9.1 pg_detect_query_anomalies Edge Cases

1. `pg_detect_query_anomalies({threshold: 0.5})` → minimum threshold clamp; verify more anomalies than default; `riskLevel` may be `high` or `critical`
2. `pg_detect_query_anomalies({threshold: 10.0})` → maximum threshold clamp; verify `anomalyCount: 0` (no query should deviate by 10σ); `riskLevel: "low"`
3. `pg_detect_query_anomalies({minCalls: 10000})` → very high minimum should filter most queries; verify `totalAnalyzed` is small or 0
4. `pg_detect_query_anomalies({minCalls: 1})` → include all queries with at least 1 call; verify `totalAnalyzed` >= default result
5. If `pg_stat_statements` is not loaded (hypothetical) → verify structured error with `success: false`, `suggestion` field mentioning `pg_diagnose_database_performance`, NOT raw MCP error

### 9.2 pg_detect_bloat_risk Edge Cases

1. `pg_detect_bloat_risk({minRows: 0})` → should clamp to 0 (include micro-tables); verify all user tables appear including small ones
2. `pg_detect_bloat_risk({minRows: 1000000})` → very high threshold; expect `totalAnalyzed: 0` and empty `tables` (test DB has no million-row tables)
3. `pg_detect_bloat_risk({schema: "public", minRows: 1})` → combined filter; verify tables array only contains `public` schema tables
4. `pg_detect_bloat_risk({schema: "pg_catalog"})` → system schema filter; verify response structure (may be empty or contain system tables depending on filter logic)
5. Verify each table in response has: `riskScore` (0-100), `riskLevel`, `recommendations` array, `factors` object with `deadTupleRatio`, `vacuumStaleness`, `tableSizeImpact`, `autovacuumEffectiveness`

### 9.3 pg_detect_connection_spike Edge Cases

1. `pg_detect_connection_spike({warningPercent: 10})` → very low threshold; verify more `warnings` entries than default (70%)
2. `pg_detect_connection_spike({warningPercent: 100})` → maximum threshold; verify `warnings` is empty or minimal
3. Verify `byState` array contains at least one entry with `state: "active"` (the current query)
4. Verify `usagePercent` = `(totalConnections / maxConnections) * 100` (approximately)
5. Verify `concentrations` array structure: each entry has `dimension`, `value`, `count`, `percent`

### 9.4 Cross-Tool Correlation (Anomaly + Performance)

Use Code Mode to cross-verify anomaly tools against existing performance tools:

```javascript
// Run via pg_execute_code
const bloat = await pg.performance.detectBloatRisk({minRows: 1});
const bloatCheck = await pg.performance.bloatCheck();
return {
  anomalyTables: bloat.tables?.length ?? 0,
  bloatTables: bloatCheck.count ?? 0,
  // Both should analyze similar tables
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

---

## Category 10: Introspection Deep Dive

> **Note:** Basic checklist tests (in `test-group-tools.md`) already cover happy paths: default dependency graph, topological sort both directions, DELETE cascade on `test_departments`, `compact: true` snapshot, constraint analysis defaults, and simple migration risk statements. This category focuses on **filtering, comparative, and degenerate-input** scenarios not covered there.

### 10.1 Dependency Graph Filtering

1. `pg_dependency_graph({excludeExtensionSchemas: false})` → expect more nodes than default (default excludes cron/topology/tiger). Count nodes and compare
2. `pg_dependency_graph({excludeExtensionSchemas: true})` → count nodes, verify < test 1
3. `pg_dependency_graph({includeRowCounts: false})` → verify node objects do NOT have `rowCount` field
4. `pg_dependency_graph({includeRowCounts: true})` → verify node objects HAVE `rowCount` field with numeric values
5. `pg_dependency_graph({schema: "test_schema"})` → verify only `test_schema` objects in graph (or empty if no FKs in that schema)

### 10.2 Topological Sort Completeness

1. `pg_topological_sort({direction: "create"})` → verify isolated tables (no FK, e.g., `test_articles`, `test_measurements`) appear in order at level 0 with empty `dependencies`
2. `pg_topological_sort({direction: "drop"})` → verify same isolated tables still appear (direction shouldn't lose tables)
3. Compare create vs drop: count of tables should be identical in both directions
4. `pg_topological_sort({excludeExtensionSchemas: false})` → verify more tables than with `true`

### 10.3 Cascade Simulator Comparative

Run all three operation types on `test_departments` and compare:

1. `pg_cascade_simulator({table: "test_departments", operation: "DELETE"})` → capture `severity` and `affectedTables` count. Expect RESTRICT block from `test_projects` and NO ACTION block from `test_audit_log` (via employees)
2. `pg_cascade_simulator({table: "test_departments", operation: "DROP"})` → expect higher severity than DELETE (DROP force-cascades regardless of FK rules). All dependent tables affected
3. `pg_cascade_simulator({table: "test_departments", operation: "TRUNCATE"})` → expect similar severity to DROP (TRUNCATE also force-cascades)
4. Verify: DROP and TRUNCATE `severity` should be `"critical"` when dependent tables exist
5. Verify: DELETE should show `blockingActions` in stats (NO ACTION + RESTRICT FKs)

### 10.4 Cascade Simulator Self-Reference

1. `pg_cascade_simulator({table: "test_employees", operation: "DELETE"})` → verify self-referencing FK (`manager_id → id`, SET NULL) is handled without infinite recursion
2. Verify `test_employees` appears in affected tables (from `test_assignments` CASCADE and `test_audit_log` NO ACTION), but self-reference doesn't cause circular explosion
3. Verify `test_departments` does NOT appear in affected tables (employees→departments FK is "from" employees, not "to")

### 10.5 Constraint Analysis Selective Checks

1. `pg_constraint_analysis({checks: ["missing_pk"]})` → verify ONLY missing PK findings returned (should find `test_audit_log`). No unindexed FK findings in results
2. `pg_constraint_analysis({checks: ["unindexed_fk"]})` → verify ONLY unindexed FK findings returned (should find `test_audit_log.employee_id`). No missing PK findings
3. `pg_constraint_analysis({checks: ["missing_pk", "unindexed_fk"]})` → verify both types present
4. `pg_constraint_analysis({checks: ["redundant"]})` → verify only redundant constraint findings (may be empty in test DB)

### 10.6 Migration Risks Multi-Statement

1. `pg_migration_risks({statements: ["ALTER TABLE test_employees DROP COLUMN hire_date", "ALTER TABLE test_orders ADD COLUMN notes TEXT", "DROP TABLE test_assignments CASCADE"]})` → verify each statement gets its own risk entry. DROP COLUMN and DROP TABLE CASCADE should be higher risk than ADD COLUMN
2. Verify response `risks` array has 3 entries (one per statement)
3. Verify `summary` aggregates all risks

### 10.7 Migration Risks Idempotent DDL

1. `pg_migration_risks({statements: ["DROP TABLE IF EXISTS test_assignments"]})` → compare risk to unconditional `DROP TABLE test_assignments CASCADE`
2. `pg_migration_risks({statements: ["CREATE TABLE IF NOT EXISTS test_new (id INT)"]})` → verify lower risk than unconditional CREATE (IF NOT EXISTS is safer)
3. `pg_migration_risks({statements: ["SELECT 1"]})` → verify no risk or minimal risk for read-only statement

### 10.8 Schema Snapshot Cross-Schema

1. `pg_schema_snapshot({schema: "test_schema"})` → verify returns only `test_schema` objects. Should include `order_seq` sequence
2. `pg_schema_snapshot({schema: "test_schema", sections: ["sequences"]})` → verify only sequences section, containing `order_seq`
3. `pg_schema_snapshot({schema: "nonexistent_schema_xyz"})` → expect structured error or empty snapshot (not crash)

---

## Category 11: Migration Lifecycle Stress

> **Note:** Basic checklist and Category 2.3 already cover: init idempotency, apply success, duplicate hash detection, rollback execution, and re-apply after rollback. This category focuses on **record-only distinction, failure persistence, history filtering, status alignment, and rollback edge cases**.

> **Prerequisite:** All tests require `pg_migration_init` first. Tests build on each other and must run in order.

### 11.1 Record vs Apply Distinction

1. `pg_migration_init()` → initialize tracking table
2. `pg_migration_record({version: "stress-record-1.0", migrationSql: "CREATE TABLE stress_record_only (id INT);", rollbackSql: "DROP TABLE IF EXISTS stress_record_only;", sourceSystem: "stress-test"})` → verify `success: true` with SHA-256 hash and `record.status = "recorded"` (NOT `"applied"`)
3. Verify `stress_record_only` does NOT exist: `pg_read_query({sql: "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'stress_record_only') AS e"})` → `false`
4. `pg_migration_apply({version: "stress-apply-1.0", migrationSql: "CREATE TABLE stress_apply_test (id SERIAL PRIMARY KEY, name TEXT);", rollbackSql: "DROP TABLE IF EXISTS stress_apply_test;", sourceSystem: "stress-test"})` → verify `success: true` and `record.status = "applied"`
5. Verify `stress_apply_test` DOES exist via `pg_read_query`

### 11.2 Failed Migration Persistence

1. `pg_migration_apply({version: "stress-fail-1.0", migrationSql: "ALTER TABLE nonexistent_table_xyz ADD COLUMN bad_col INT;", sourceSystem: "stress-test"})` → verify `success: false`
2. `pg_migration_history({status: "failed"})` → verify entry with version `"stress-fail-1.0"` appears with error details
3. Verify failed entry has `status: "failed"` and non-null error information

### 11.3 History Filtering Combinatorics

1. `pg_migration_history()` → capture total count (should be ≥3 from steps above: record, apply, fail)
2. `pg_migration_history({status: "applied"})` → verify only applied entries
3. `pg_migration_history({status: "recorded"})` → verify only record-only entries (from step 11.1 item 2)
4. `pg_migration_history({sourceSystem: "stress-test"})` → verify only entries with `sourceSystem: "stress-test"`
5. `pg_migration_history({limit: 1})` → verify exactly 1 record returned
6. `pg_migration_history({limit: 1, offset: 1})` → verify returns different record than limit-only call
7. `pg_migration_history({status: "applied", sourceSystem: "stress-test"})` → verify combined filter

### 11.4 Status Dashboard Alignment

1. `pg_migration_status()` → capture counts (`applied`, `recorded`, `rolledBack`, `failed`)
2. Cross-verify: `applied` count should match `pg_migration_history({status: "applied"})` total
3. Cross-verify: `recorded` count should match `pg_migration_history({status: "recorded"})` total
4. Cross-verify: `failed` count should match `pg_migration_history({status: "failed"})` total
5. Verify `latestVersion` is the most recently applied version
6. Verify `sourceSystems` includes `"stress-test"`

### 11.5 Rollback Edge Cases

1. `pg_migration_rollback({version: "nonexistent-version-xyz"})` → expect structured error (version not found)
2. `pg_migration_rollback({version: "stress-apply-1.0", dryRun: true})` → verify rollback SQL returned without execution, `stress_apply_test` still exists
3. `pg_migration_rollback({version: "stress-apply-1.0"})` → execute rollback, verify `stress_apply_test` dropped
4. `pg_migration_rollback({version: "stress-apply-1.0"})` → attempt rollback again on already rolled-back version → expect structured error or graceful handling

### 11.6 Multi-Migration Hash Independence

1. `pg_migration_apply({version: "stress-multi-1", migrationSql: "CREATE TABLE stress_multi_a (id INT);", rollbackSql: "DROP TABLE IF EXISTS stress_multi_a;", sourceSystem: "stress-test"})` → capture `record.migrationHash`
2. `pg_migration_apply({version: "stress-multi-2", migrationSql: "CREATE TABLE stress_multi_b (id INT);", rollbackSql: "DROP TABLE IF EXISTS stress_multi_b;", sourceSystem: "stress-test"})` → capture `record.migrationHash`, verify different from step 1
3. `pg_migration_apply({version: "stress-multi-3", migrationSql: "CREATE TABLE stress_multi_c (id INT);", rollbackSql: "DROP TABLE IF EXISTS stress_multi_c;", sourceSystem: "stress-test"})` → capture `record.migrationHash`, verify unique
4. Rollback `stress-multi-2` only → verify `stress_multi_a` and `stress_multi_c` still exist but `stress_multi_b` is dropped
5. Verify `pg_migration_history` shows: stress-multi-1 applied, stress-multi-2 rolled_back, stress-multi-3 applied

### 11.7 Cleanup

1. Drop all `stress_*` tables created by migration tests
2. Drop `_mcp_schema_versions` table
3. Verify no `stress_*` tables remain

---

## Category 12: Cross-Group Integration Workflows

> **Purpose**: Test realistic multi-group pipelines that exercise tool chains spanning multiple groups. These catch state-management bugs that single-group tests miss (e.g., temp table metadata leaking between groups, transaction isolation issues).

### Workflow 1: Core → JSONB → Stats (Data Pipeline)

1. `pg_create_table({table: "stress_pipeline", columns: [{name: "id", type: "SERIAL PRIMARY KEY"}, {name: "data", type: "JSONB"}, {name: "score", type: "NUMERIC(5,2)"}]})` → success
2. Insert 5 rows with JSONB data (`{"category": "tech", "priority": N}`) and varying scores
3. `pg_jsonb_extract({table: "stress_pipeline", column: "data", path: "$.category"})` → verify extraction
4. `pg_stats_descriptive({table: "stress_pipeline", column: "score"})` → verify mean, stddev, min, max
5. `pg_stats_percentiles({table: "stress_pipeline", column: "score", percentiles: [25, 50, 75]})` → verify 3 values
6. Cleanup: `pg_drop_table({table: "stress_pipeline"})`

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

| Quality Level | Example | Verdict |
|---|---|---|
| **5 - Excellent** | `Table 'stress_pipeline' does not exist (schema: public)` | ✅ Includes object name + context |
| **4 - Good** | `Table 'stress_pipeline' does not exist` | ✅ Includes object name |
| **3 - Adequate** | `relation "stress_pipeline" does not exist` | ⚠️ Raw PG error leaked but informative |
| **2 - Poor** | `ERROR: 42P01: relation does not exist` | ⚠️ Code-only, no object name |
| **1 - Useless** | `Query failed` or generic `Error occurred` | ❌ No context, report as issue |

Flag any tool returning Level 1-2 error messages as ⚠️ with the tool name for error quality improvement.

---

## Post-Test Procedures

### Final Summary

Compile a summary of all findings:

1. **Fails (❌)**: Tool errors or incorrect results that need code fixes
2. **Issues (⚠️)**: Unexpected behaviors or improvement opportunities
3. **Payload (📦)**: Unnecessarily large responses
4. **Error quality ratings**: For Category 4, rate each error message 1-5 for contextual usefulness (5=excellent: includes object name, type, suggestion; 1=useless: generic "error occurred")

### After Testing

1. **Cleanup**: Confirm ALL `stress_*` objects are removed
2. **Triage findings**: If issues were found, create an implementation plan. If the plan requires no user decisions, proceed directly to implementation
3. **Scope of fixes** includes corrections to any of:
   - Handler code
   - `server-instructions.md`
   - Test database (`test-database.sql`)
   - This prompt (`advanced-test-tools.md`)

### After Implementation

4. **Validate**: Run test suite and fix broken tests, run lint + typecheck and fix issues, run prettier, update changelog (no duplicate headers)
5. **Commit**: Stage and commit all changes — do NOT push
6. **Live re-test**: Test fixes with direct MCP tool calls
7. **Final summary**: If no issues found, provide the final summary after testing. If issues were fixed, provide the summary after live MCP re-testing confirms fixes are working

> **Note:** `test-server/` is in `.gitignore` as intended.
