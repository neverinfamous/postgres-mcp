# Advanced Stress Test — postgres-mcp — Part 1a (Core)

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run any other test files.
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

**Key rules:**

- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls — create a table in one call, query it in the next
- Group multiple related tests into a single code mode call when practical

## Test Database Schema

Same as `test-tools.md` — refer to that file for the full schema reference. Key tables: `test_products` (15 rows), `test_orders` (20), `test_jsonb_docs` (3).

> **Note:** `test-resources.sql` runs after `test-database.sql` and adds ~200 measurements, 25 embeddings, and 20 locations. Counts reflect the post-seed state.

## Naming & Cleanup

- **Temporary tables**: Prefix with `stress_` (e.g., `stress_empty_table`)
- **Temporary indexes**: Prefix with `stress_idx_`
- **Temporary views**: Prefix with `stress_view_`
- **Temporary schemas**: Prefix with `stress_schema_`
- **Cleanup**: Attempt to remove all `stress_*` objects after testing. If DROP fails, note the leftover objects and move on.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `TABLE_NOT_FOUND`, `COLUMN_NOT_FOUND`, `VALIDATION_ERROR`).

## Post-Test Procedures

1. Confirm cleanup of all `stress_*` objects.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements and 📦 Payload problems.
3. Update the changelog with any changes made.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your executions.
5. Stop and briefly summarize the testing results.

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

**3.2 Schema-Qualified Table Names**

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
