# Advanced Stress Test — postgres-mcp — stats Group

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run test-tools-advanced-1.md, test-tools-advanced-2.md, test-tools-advanced-4.md, test-tools-advanced-5.md, test-tools-advanced-6.md, test-tools-advanced-7.md, test-tools-advanced-8.md.
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
- 📦 Payload: Unnecessarily large response that should be optimized — **blocking, equally important as ❌ bugs**. Oversized payloads waste LLM context window tokens and degrade downstream tool-calling quality. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization (e.g., filter system tables, add `compact` option, omit empty arrays).
- ✅ Confirmed: Edge case handled correctly (use only inline during testing; omit from Final Summary)

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `TABLE_NOT_FOUND`, `COLUMN_NOT_FOUND`, `VALIDATION_ERROR`). These are fixable in `src/utils/errors/` by adding a `code` override to the matching error class. Treat as ⚠️ Issue and include in fix plan.

## Post-Test Procedures

1. Confirm cleanup of all `stress_*` object and any temporary files you might have created in the repository during testing.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in this prompt and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
3. Update the changelog with any changes made (being careful not to create duplicate headers), and commit without pushing.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass. Highlight the single most expensive code mode block.
5. Stop and briefly summarize the testing results and fixes, ensuring the total token count is prominently displayed.

---

## stats Group Advanced Tests

### stats Group Tools (19 +1 code mode)

1. pg_stats_descriptive
2. pg_stats_percentiles
3. pg_stats_correlation
4. pg_stats_regression
5. pg_stats_time_series
6. pg_stats_distribution
7. pg_stats_hypothesis
8. pg_stats_sampling
9. pg_stats_row_number
10. pg_stats_rank
11. pg_stats_lag_lead
12. pg_stats_running_total
13. pg_stats_moving_avg
14. pg_stats_ntile
15. pg_stats_outliers
16. pg_stats_top_n
17. pg_stats_distinct
18. pg_stats_frequency
19. pg_stats_summary
20. pg_execute_code (auto-added)

### Category 1: Boundary Values & Empty States

> Tests 1–8 above (in core Category 1) already exercise `pg_stats_descriptive` and `pg_stats_percentiles` on `stress_empty_table`. These additional tests focus on stats-specific edge cases.

**1.1 Statistical Edge Cases**

1. `pg_stats_correlation({table: "test_products", column1: "id", column2: "id"})` → self-correlation ≈ 1.0
2. `pg_stats_hypothesis({table: "test_measurements", column: "temperature", hypothesizedMean: 999})` → should reject null hypothesis (very different from actual mean)
3. `pg_stats_regression` on single row (use `xColumn`/`yColumn` params, NOT `columnX`/`columnY`) → expect graceful handling (regression undefined for n=1)
4. `pg_stats_correlation` — on `stress_empty_table` with single row, use `id` and `value` → expect null or degenerate correlation (single point)
5. `pg_stats_hypothesis` with `hypothesizedMean: 40` on single row → expect degenerate test result (n=1)

### Category 2: Window Function Boundary Values

> Uses `stress_empty_table` (created in core Category 1). Insert data as needed for edge case testing.

**2.1 Single-Row Window Functions**

6. `pg_stats_row_number({table: "stress_empty_table", column: "value", orderBy: "id", limit: 5})` → with 1 row: verify `row_number: 1` returned
7. `pg_stats_lag_lead({table: "stress_empty_table", column: "value", orderBy: "id", direction: "lag", limit: 5})` → with 1 row: verify `lag_value: null` (no previous row)
8. `pg_stats_running_total({table: "stress_empty_table", column: "value", orderBy: "id", limit: 5})` → with 1 row: verify `running_total` equals the value itself

**2.2 Identical Values (Ranking Edge Cases)**

Insert 5 rows into `stress_empty_table` all with `value: 42.00`, then:

9. `pg_stats_rank({table: "stress_empty_table", column: "value", orderBy: "value", limit: 10})` → verify all rows get `rank: 1` (all tied)
10. `pg_stats_rank({table: "stress_empty_table", column: "value", orderBy: "value", method: "dense_rank", limit: 10})` → verify all rows get `dense_rank: 1`
11. `pg_stats_ntile({table: "stress_empty_table", column: "value", orderBy: "value", buckets: 10, limit: 10})` → with 5 rows and 10 buckets: verify bucket assignment (some buckets empty, rows distributed across buckets 1-5)

**2.3 Window Size Exceeds Data**

12. `pg_stats_moving_avg({table: "stress_empty_table", column: "value", orderBy: "id", windowSize: 100, limit: 10})` → with 5 rows: verify graceful handling (window > data), moving averages still computed

### Category 3: Analysis Tool Edge Cases

**3.1 Outlier Detection Edge Cases**

13. `pg_stats_outliers({table: "stress_empty_table", column: "value"})` → with all-identical values: verify `outlierCount: 0` (no deviation = no outliers)
14. `pg_stats_outliers({table: "stress_empty_table", column: "value", method: "zscore"})` → with all-identical values: verify graceful handling (stddev=0, z-score undefined)

**3.2 Top-N Edge Cases**

15. `pg_stats_top_n({table: "test_measurements", column: "temperature", n: 0})` → report behavior (should error or return empty)
16. `pg_stats_top_n({table: "test_measurements", column: "temperature", n: 1000})` → with 640 rows: verify returns all rows or caps at configured max

**3.3 Distinct/Frequency Edge Cases**

17. `pg_stats_distinct({table: "stress_empty_table", column: "value"})` → with all same value: verify `distinctCount: 1`
18. `pg_stats_frequency({table: "stress_empty_table", column: "value"})` → verify single entry with `count: 5` (or current row count) and `percentage: 100` in the `distribution` array

**3.4 Summary Edge Cases**

19. `pg_stats_summary({table: "test_articles"})` → table with no numeric columns: verify graceful error or empty summary
20. `pg_stats_summary({table: "test_measurements", columns: ["sensor_id"]})` → integer column: verify it's included in summary

### Category 4: Code Mode Chaining (Multi-Tool Analysis)

```javascript
// Window function pipeline: rank → filter top quartile → running total
const ranked = await pg.stats.ntile({
  table: "test_measurements", column: "temperature",
  orderBy: "temperature", buckets: 4, limit: 640
});
const topQuartile = ranked.rows?.filter(r => r.ntile === 1 || r.ntile === "1").length ?? 0;
const runningTotal = await pg.stats.runningTotal({
  table: "test_measurements", column: "temperature",
  orderBy: "measured_at", partitionBy: "sensor_id", limit: 10
});
return {
  topQuartileCount: topQuartile,
  runningTotalRows: runningTotal.rows?.length ?? 0
};
```

21. Verify: `topQuartileCount > 0` and `runningTotalRows === 10`

```javascript
// Outlier → distinct → frequency pipeline
const outliers = await pg.stats.outliers({
  table: "test_measurements", column: "temperature"
});
const distinct = await pg.stats.distinct({
  table: "test_measurements", column: "sensor_id"
});
const summary = await pg.stats.summary({table: "test_measurements"});
return {
  outlierMethod: outliers.method,
  distinctSensors: distinct.distinctCount,
  summaryColumns: summary.summaries?.length ?? 0
};
```

22. Verify: `outlierMethod: "iqr"`, `distinctSensors: 6`, `summaryColumns >= 3` (temperature, humidity, pressure). **Note:** `summary` response uses `summaries` key, not `columns`

### Category 5: Error Message Quality

23. `pg_stats_descriptive({table: "nonexistent_table_xyz", column: "price"})` → structured error
24. `pg_stats_descriptive({table: "test_products", column: "nonexistent_col"})` → structured error mentioning column name
25. [REMOVED] -> `pg_capacity_planning` is a monitoring tool, tested in the advanced-1 suite.
26. `pg_stats_correlation({table: "test_products", column1: "name", column2: "description"})` → error about non-numeric columns (both are VARCHAR)
27. `pg_stats_time_series` with `timeColumn: "name"` (TEXT, not timestamp) on `test_products` → expect type validation error
28. `pg_stats_distribution` with `buckets: 0` → expect error (must be > 0)
29. `pg_stats_distribution` with `buckets: -1` → expect error

### Final Cleanup

Confirm `test_measurements` row count is still 640 (post-resource-seed baseline).
