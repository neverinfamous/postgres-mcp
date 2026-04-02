# Advanced Stress Test — postgres-mcp — stats Group

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run any other test files.
- All changes **MUST** be consistent with other postgres-mcp tools and `code-map.md`.
- Do not do anything other than these tests.
- Please let me handle Lint, typecheck, vitest, and playwright. You cannot restart the server in antigravity as the cache has to be refreshed manually.

## Code Mode Execution

All tests should be executed via `pg_execute_code` code mode. Native direct tool calls are not to be used unless explicitly compared. State persists across sequential code mode logic inside a script.

## Test Database Schema

The test database (`postgres`) contains these tables:

| Table               | Rows | Key Columns                                                                        | JSONB Columns            | Tool Groups           |
| ----
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

19. `pg_stats_summary({table: "stress_no_num"})` → table with no numeric columns (create it first: `CREATE TABLE stress_no_num (id UUID PRIMARY KEY, name TEXT);`): verify graceful error or empty summary
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
