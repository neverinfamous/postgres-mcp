# Advanced Stress Test — postgres-mcp — Part 1

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run test-tools-advanced-2.md, test-tools-advanced-3.md, test-tools-advanced-4.md.
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
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in test-tools-advanced-1.md (this prompt) and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
3. Update the changelog with any changes made (being careful not to create duplicate headers), and commit without pushing.
4. Stop and briefly summarize the testing results and fixes.

---

## core Group Advanced Tests

### core Group Tools (20 +1 code mode)

1. pg_read_query
2. pg_write_query
3. pg_list_tables
4. pg_describe_table
5. pg_create_table
6. pg_drop_table
7. pg_get_indexes
8. pg_create_index
9. pg_drop_index
10. pg_list_objects
11. pg_object_details
12. pg_list_extensions
13. pg_analyze_db_health
14. pg_analyze_workload_indexes
15. pg_analyze_query_indexes
16. pg_upsert
17. pg_batch_insert
18. pg_count
19. pg_exists
20. pg_truncate
21. pg_execute_code (auto-added)

### Category 1: Boundary Values & Empty States

**1.1 Empty Table Operations**

Create `stress_empty_table (id SERIAL PRIMARY KEY, name TEXT, value DECIMAL(10,2))`, then test:

1. `pg_count` on `stress_empty_table` → expect `{count: 0}`
2. `pg_exists` on `stress_empty_table` (no WHERE) → expect `{exists: false, mode: "any_rows"}` (Note: evaluates if rows exist, not table schema existence, so returning TABLE_NOT_FOUND for nonexistent tables is expected)
3. `pg_stats_descriptive` on `stress_empty_table` column `value` → expect graceful error or empty stats (not a crash)
4. `pg_copy_export` on `stress_empty_table` → expect `{rowCount: 0}` or empty data
5. `pg_dump_table` on `stress_empty_table` → expect valid DDL
6. `pg_schema_snapshot` with `sections: ["tables"]` → verify `stress_empty_table` appears

**1.2 Single-Row Table**

Insert one row into `stress_empty_table` (name: 'solo', value: 42.00), then test:

7. `pg_stats_descriptive` → expect valid stats (mean=42, stddev=0 or null)
8. `pg_stats_percentiles` with `[0.25, 0.5, 0.75]` → all should equal 42

**1.3 NULL-Heavy Data**

Insert 5 rows into `stress_empty_table` with: 3 rows where `name IS NULL` and `value IS NULL`, 2 rows with actual values.

9. `pg_count` with `column: "value"` → expect 3 (COUNT of non-null values: solo + real1 + real2)
10. `pg_exists` with `where: "value IS NULL"` → expect `{exists: true}`
11. `pg_copy_export` → verify NULL representation in CSV output

**1.4 Extreme Numeric Values**

Insert into `stress_empty_table`: `(name: 'max', value: 99999999.99)`, `(name: 'min', value: -99999999.99)`, `(name: 'zero', value: 0.00)`, `(name: 'tiny', value: 0.01)`

12. `pg_stats_descriptive` → verify mean, min, max are correct
13. `pg_batch_insert` with 100 rows using `generate_series` equivalent via code mode → verify `insertedCount: 100`

### Category 2: State Pollution & Idempotency

**2.1 Create-Drop-Recreate Cycles**

14. `pg_create_table` → create `stress_cycle_table (id INT PRIMARY KEY, data TEXT)`
15. `pg_create_index` → create `stress_idx_cycle` on `stress_cycle_table(data)`
16. `pg_drop_index` → drop `stress_idx_cycle` → expect `{existed: true}`
17. `pg_drop_index` → drop `stress_idx_cycle` again with `ifExists: true` → expect `{existed: false}` (not error)
18. `pg_create_index` → create `stress_idx_cycle` again → expect success
19. `pg_drop_table` → drop `stress_cycle_table` → expect `{existed: true}`
20. `pg_drop_table` → drop `stress_cycle_table` again with `ifExists: true` → expect `{existed: false}`
21. `pg_create_table` → recreate `stress_cycle_table` → expect success (no orphaned metadata)

**2.2 Duplicate Object Detection**

22. `pg_create_table` with `ifNotExists: true` on `test_products` → expect success with indication it already exists
23. `pg_create_index` with `ifNotExists: true` on `idx_orders_status` (on table `test_orders`) → expect `{alreadyExists: true}`
24. `pg_create_schema` with `ifNotExists: true` on `public` → expect graceful handling
25. `pg_create_view` with `orReplace: true` on `test_order_summary` using the same query (`SELECT o.status, o.total_price FROM test_orders o`) → expect success

### Category 3: Alias & Parameter Combinations

**3.1 Core Tool Alias Matrix (aliases NOT covered in first-level testing)**

First-level tests already cover: `pg_count` with `tableName`/`condition`, `pg_read_query` with `query`, `pg_exists` with `tableName`, `pg_describe_table` with `name`, `pg_analyze_query_indexes` with `query`. Test the remaining aliases here:

| Tool             | Primary Param | Test with Alias                                                                            | Expected Behavior              |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------ | ------------------------------ |
| `pg_write_query` | `sql`         | `{query: "UPDATE test_products SET name = name WHERE id = 1"}`                             | Returns `{rowsAffected: 1}`    |
| `pg_count`       | `where`       | `{table: "test_products", filter: "price > 50"}`                                           | Returns count > 0 (`filter` alias) |
| `pg_exists`      | `where`       | `{table: "test_products", filter: "id = 1"}`                                               | Returns `{exists: true}` (`filter` alias) |
| `pg_upsert`      | `data`        | `{table: "stress_cycle_table", values: {id: 999, data: "alias"}, conflictColumns: ["id"]}` | Returns success (`values` alias) |
| `pg_drop_table`  | `table`       | `{name: "stress_does_not_exist", ifExists: true}`                                          | Returns `{existed: false}` (`name` alias) |
| `pg_drop_table`  | `table`       | `{tableName: "stress_does_not_exist", ifExists: true}`                                     | Returns `{existed: false}` (`tableName` alias) |

**3.2 Extension Tool Alias Matrix**

| Tool                  | Primary Param | Test with Alias                                                       | Expected Behavior      |
| --------------------- | ------------- | --------------------------------------------------------------------- | ---------------------- |
| `pg_ltree_query`      | `table`       | `{tableName: "test_categories", column: "path", path: "electronics"}` | Returns descendants    |
| `pg_ltree_subpath`    | `offset`      | `{path: "a.b.c.d", start: 1, length: 2}`                              | Returns `b.c`          |
| `pg_citext_compare`   | —             | `{value1: "Hello", value2: "HELLO"}`                                  | `citextEqual: true`    |
| `pg_pgcrypto_hash`    | —             | `{data: "test", algorithm: "sha256"}`                                 | Returns hex hash       |
| `pg_pgcrypto_encrypt` | `password`    | `{data: "secret", key: "mykey"}`                                      | Returns encrypted data |

**3.3 Schema-Qualified Table Names**

Test `schema.table` parsing on these tools (use `public.test_products`):

26. `pg_count({table: "public.test_products"})` → expect `{count: 15}`
27. `pg_exists({table: "public.test_products"})` → expect `{exists: true}`
28. `pg_describe_table({table: "public.test_products"})` → expect column info
29. `pg_stats_descriptive({table: "public.test_products", column: "price"})` → expect stats
30. `pg_dump_table({table: "public.test_products"})` → expect DDL
31. `pg_copy_export({table: "public.test_products", limit: 5})` → expect 5 rows

Also test with `test_schema.order_seq`: 32. `pg_list_sequences({schema: "test_schema"})` → expect `order_seq`

### Category 4: Error Message Quality

For each test, verify the error returns a **structured response** (`{success: false, error: "..."}`) — NOT a raw MCP exception. Rate each error message: does it include enough context to diagnose the problem?

> **Note:** Nonexistent-object tests (P154) are already covered comprehensively in first-level testing. This category focuses on error *quality* for scenarios NOT covered there.

**4.1 Cross-Group Nonexistent Objects (not covered in first-level)**

33. `pg_get_indexes({table: "nonexistent_table_xyz"})` → report behavior
34. `pg_object_details({name: "nonexistent_table_xyz"})` → structured error

**4.2 Invalid Columns**

35. `pg_count({table: "test_products", column: "nonexistent_col"})` → report behavior
36. `pg_create_index({table: "test_products", columns: ["nonexistent_col"]})` → report behavior

**4.3 Invalid Parameter Values**

37. `pg_batch_insert({table: "test_products", rows: []})` (empty array) → report behavior

### Category 5: Large Payload & Truncation Verification

**5.1 Truncation Indicators**

Verify that tools returning `truncated` and `totalCount` fields work correctly:

38. `pg_list_tables({limit: 2})` → expect `truncated: true` and `totalCount` > 2
39. `pg_get_indexes({limit: 1})` → expect `truncated: true` and `totalCount` > 1
40. `pg_index_stats({limit: 1})` → expect `truncated: true` and `totalCount` > 1
41. `pg_table_stats({limit: 1})` → expect `truncated: true` and `totalCount` > 1
42. `pg_copy_export({table: "test_measurements", limit: 5})` → expect 5 rows
43. `pg_list_partitions({table: "test_events", limit: 1})` → expect `truncated: true` and remaining partitions in `totalCount`
44. `pg_show_settings({limit: 2})` (Note: this is in the `monitoring` group) → expect `truncated: true`

**5.2 Limit Zero (Unlimited)**

45. `pg_list_tables({limit: 0})` → count should match actual table count
46. `pg_copy_export({table: "test_measurements", limit: 0})` → expect all 640 rows
47. `pg_index_stats({limit: 0})` → verify `truncated: false` or absent

**5.3 Schema Snapshot Compact Mode**

48. `pg_schema_snapshot({compact: false})` (full mode) → note payload size
49. `pg_schema_snapshot()` (default is compact: true) → verify tables section omits `columns` key, note payload size reduction
50. `pg_schema_snapshot({sections: ["tables", "indexes"]})` → verify only those sections present

### Category 6: Code Mode Parity

**6.1 Core API Parity**

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

**6.2 Discovery Methods**

51. `pg_execute_code: pg.help()` → verify returns group→methods mapping for all 21 groups
52. `pg_execute_code: pg.core.help()` → verify returns `{methods, methodAliases, examples}`

**6.3 Code Mode Error Handling**

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

### Final Cleanup

Drop all `stress_*` tables and indexes. Confirm `test_products` row count is still 15 (no pollution).

---

## transactions Group Advanced Tests

### transactions Group Tools (8 +1 code mode)

1. pg_transaction_begin
2. pg_transaction_commit
3. pg_transaction_rollback
4. pg_transaction_savepoint
5. pg_transaction_release
6. pg_transaction_rollback_to
7. pg_transaction_execute
8. pg_transaction_status
9. pg_execute_code (auto-added)

### Category 1: Aborted Transaction Recovery

1. `pg_transaction_begin` → get `transactionId`
2. Execute intentionally failing SQL: `pg_write_query` within transaction → `"INSERT INTO nonexistent_table VALUES (1)"`
3. `pg_transaction_status({transactionId: <id>})` → verify `{status: "aborted"}` (transaction is poisoned)
4. Attempt another write in same transaction → expect aborted state error
5. `pg_transaction_rollback` → expect success (transaction can be cleanly ended)
6. `pg_transaction_status({transactionId: <id>})` → verify `{status: "not_found"}` (rolled-back transaction is cleaned up)
7. Start new transaction → verify it works normally

### Category 2: Savepoint Stress Test

8. `pg_transaction_begin` → get `transactionId`
9. Create savepoint `sp1`
10. Insert row into `test_products` (within transaction)
11. Create savepoint `sp2`
12. Insert another row
13. Create savepoint `sp3`
14. Insert another row
15. `pg_transaction_rollback_to` `sp2` (Code mode param: `name: "sp2"`) → should undo sp3's insert AND remove sp3
16. `pg_transaction_status({transactionId: <id>})` → verify still `{status: "active"}` (savepoint rollback does not abort the transaction)
17. Verify: savepoint `sp3` no longer exists (attempt rollback_to sp3 → expect error)
18. `pg_transaction_rollback_to` `sp1` (Code mode param: `name: "sp1"`) → should undo sp2's insert
19. `pg_transaction_commit` → only pre-sp1 state should persist
20. Verify `test_products` row count is unchanged from baseline (15)

### Category 3: Transaction Execute Mixed Statements

21. `pg_transaction_execute` with mixed SELECT + INSERT + SELECT:
    ```
    statements: [
      {sql: "SELECT COUNT(*) AS before FROM test_products"},
      {sql: "INSERT INTO test_products (name, description, price) VALUES ('stress_tx', 'test', 99.99)"},
      {sql: "SELECT COUNT(*) AS after FROM test_products"}
    ]
    ```
22. Verify: `parseInt(results[0].rows[0].before)` = 15 (or current count), `parseInt(results[2].rows[0].after)` = before + 1
23. Cleanup: Delete the inserted row

### Category 4: Transaction Execute Failure Rollback

24. `pg_transaction_execute` with a failing statement mid-batch:
    ```
    statements: [
      {sql: "CREATE TABLE stress_tx_fail (id INT)"},
      {sql: "INSERT INTO nonexistent_table VALUES (1)"},
      {sql: "CREATE TABLE stress_tx_fail2 (id INT)"}
    ]
    ```
25. Verify: `success: false`, `statementsExecuted` indicates how far it got
26. Verify: `stress_tx_fail` does NOT exist (auto-rollback worked)

### Category 5: Transaction Timeout & Abandoned Transactions

27. `pg_transaction_begin` → get `transactionId`
28. Do NOT commit or rollback — leave transaction open
29. Wait ~5 seconds, then `pg_transaction_status({transactionId: <id>})` → verify `{status: "active"}` (abandoned transaction is still alive)
30. Attempt `pg_transaction_begin` again (new transaction while old is still open) → report behavior — does it succeed or block?
31. Clean up: `pg_transaction_rollback({transactionId: <id>})` the abandoned transaction
32. `pg_transaction_status({transactionId: <id>})` → verify `{status: "not_found"}` (cleaned up)
33. Verify new operations work normally after cleanup

### Category 6: Rapid State Transition Stress Test

34. Via `pg_execute_code`: Begin 3 transactions, verify all report `{status: "active"}`, then commit the first, force-abort the second (run bad SQL), and rollback the third. Status-check all three → expected: all `"not_found"` (committed and rolled-back transactions are cleaned up)
35. Verify no leaked connections: `pg_connection_stats()` → total connections should not have increased

### Category 7: Error Message Quality

36. `pg_transaction_execute` with empty `statements: []` → report behavior
37. `pg_transaction_execute` with `statements: [{}]` (missing `sql` key) → report behavior

### Final Cleanup

Verify `test_products` row count is still 15 and no `stress_*` tables remain.

---

## jsonb Group Advanced Tests

### jsonb Group Tools (20 +1 code mode)

1. pg_jsonb_extract
2. pg_jsonb_set
3. pg_jsonb_insert
4. pg_jsonb_delete
5. pg_jsonb_contains
6. pg_jsonb_path_query
7. pg_jsonb_agg
8. pg_jsonb_object
9. pg_jsonb_array
10. pg_jsonb_keys
11. pg_jsonb_strip_nulls
12. pg_jsonb_typeof
13. pg_jsonb_validate_path
14. pg_jsonb_stats
15. pg_jsonb_merge
16. pg_jsonb_normalize
17. pg_jsonb_diff
18. pg_jsonb_index_suggest
19. pg_jsonb_security_scan
20. pg_jsonb_pretty
21. pg_execute_code (auto-added)

### Category 1: JSONB Mutation Workflow

Create `stress_jsonb_mut (id SERIAL PRIMARY KEY, data JSONB DEFAULT '{}')`, insert one row with `data: {"name": "Alice", "tags": ["a", "b"], "nested": {"level1": {"value": 1}}}`, then test:

1. `pg_jsonb_set({table: "stress_jsonb_mut", column: "data", path: "name", value: "\"Bob\"", where: "id = 1"})` → verify `name` changed to `"Bob"`
2. `pg_jsonb_set({table: "stress_jsonb_mut", column: "data", path: "nested.level1.value", value: "42", where: "id = 1"})` → verify deep path set works
3. `pg_jsonb_set({table: "stress_jsonb_mut", column: "data", path: "newKey", value: "\"inserted\"", where: "id = 1", createMissing: true})` → verify new key added. **Note:** `pg_jsonb_insert` is for array targets only. Use `pg_jsonb_set` with `createMissing` for object key insertion
4. `pg_jsonb_delete({table: "stress_jsonb_mut", column: "data", path: "tags", where: "id = 1"})` → verify `tags` key removed
5. `pg_jsonb_merge` — standalone merge requires `base` + `overlay` params (not `doc1`/`doc2`). Use via Code Mode: `pg.jsonb.merge({base: {"a": 1, "b": 2}, overlay: {"b": 3, "c": 4}})` → verify merge result `{"a": 1, "b": 3, "c": 4}` (overlay wins on conflicts)
6. Verify final state via `pg_jsonb_extract` on specific paths or `pg_read_query` — confirm all mutations applied correctly

**pg_jsonb_pretty (mutation + standalone):**

7. `pg_jsonb_pretty({table: "stress_jsonb_mut", column: "data", where: "id = 1"})` → verify the mutated JSONB is pretty-printed with indentation
8. `pg_jsonb_pretty({json: "{\"compact\":true,\"nested\":{\"a\":1}}"})` → verify standalone pretty-print with indentation
9. Cleanup: Drop `stress_jsonb_mut`

### Category 2: Error Message Quality

10. `pg_jsonb_extract({table: "nonexistent_table_xyz", column: "data", path: "test"})` → structured error
11. `pg_jsonb_set({table: "test_jsonb_docs", column: "metadata", path: "author", value: "\"Modified\"", where: "id = 99999"})` → report behavior for nonexistent row

### Final Cleanup

Confirm `test_jsonb_docs` row count is still 3 and contents are unchanged.
