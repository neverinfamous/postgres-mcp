# Stats Tools

- All stats tools support `schema.table` format (auto-parsed, embedded schema takes priority over explicit `schema` param)
- `descriptive`: Returns nested `statistics` object containing `count`, `min`, `max`, `avg`, `stddev`, `variance`, `sum`, `mode`. Access via `desc.statistics.avg` (note: uses `avg` for mean).
- `timeSeries`: Both `timeColumn` (must be timestamp/date) and `valueColumn` (must be numeric) are validated upfront with clear error messages. Aliases: `time`→`timeColumn`, `value`→`valueColumn`. `interval` accepts: `second`, `minute`, `hour`, `day`, `week`, `month`, `year` (keywords, PostgreSQL format, or plurals). Default `limit: 100` time buckets. Use `limit: 0` for no limit. Returns `truncated` and `totalCount` indicators when default limit is applied. **groupBy payloads**: Default `groupLimit: 20` groups. Returns `truncated` + `totalGroupCount` when groups are limited. Use `groupLimit: 0` for all groups
- `correlation`: Use `column1`/`column2` or aliases `x`/`y` for column names
- `distribution`: Returns `skewness`, `kurtosis` (excess). `buckets` must be > 0. **groupBy payloads**: Default `groupLimit: 20` groups (prevents large payloads with many histogram buckets per group). Returns `truncated` + `totalGroupCount` when groups are limited. Use `groupLimit: 0` for all groups
- `sampling`: Defaults to `random` method with 20 rows (optimized for LLM context). `sampleSize` always takes precedence over `percentage`. ⚠️ `percentage` param only works with `bernoulli`/`system` methods—ignored for default `random` method. Default limit of 100 rows applied to `bernoulli`/`system` with `percentage` to prevent large payloads. Returns `truncated` and `totalSampled` when TABLESAMPLE returns more rows than limit
- `percentiles`: Accepts 0-1 or 0-100 (auto-normalized). ⚠️ Use consistent scale—mixing (e.g., `[0.1, 50]`) produces unexpected keys and returns a `warning` field explaining the issue. Empty array → defaults [0.25, 0.5, 0.75]. Output keys use a prefix format (e.g., `p25`, `p50`, `p75`).
- `hypothesis`: Returns nested `results` object containing `pValue` (two-tailed), `testStatistic`, `interpretation`, `sampleMean`, `sampleStdDev`. Access via `hyp.results.pValue`. Use `populationStdDev` for z-test, otherwise defaults to t-test
- `regression`: Use `xColumn`/`yColumn`, aliases `x`/`y`, or `column1`/`column2` (for consistency with correlation). Returns nested `regression` object containing `slope`, `intercept`, `rSquared`, `equation`, `avgX`, `avgY`, `sampleSize`. Access via `reg.regression.slope`
- ⚠️ WARNING: `sampling` with `system` method unreliable for small tables—use `bernoulli` or `random`

**Window Functions (6 tools):**

- `pg_stats_row_number({ table, orderBy, partitionBy?, selectColumns?, where?, limit? })`: Sequential numbering within ordered result. `partitionBy` restarts numbering per group. Default `limit: 20` (max: 100). Returns `{success, rowCount, rows}`
- `pg_stats_rank({ table, orderBy, rankType?, partitionBy?, selectColumns?, where?, limit? })`: Rank within ordered set. `rankType`: 'rank' (default, with gaps), 'dense_rank' (no gaps), 'percent_rank' (0-1). Default `limit: 20` (max: 100). Returns `{success, rankType, rowCount, rows}`
- `pg_stats_lag_lead({ table, column, orderBy, direction, offset?, defaultValue?, partitionBy?, selectColumns?, where?, limit? })`: Access previous (`lag`) or next (`lead`) row values. `direction`: 'lag' or 'lead'. `offset` (default: 1) = number of rows to look back/ahead. `defaultValue` fills when no row exists. Default `limit: 20` (max: 100). Returns `{success, direction, offset, rowCount, rows}`
- `pg_stats_running_total({ table, column, orderBy, partitionBy?, selectColumns?, where?, limit? })`: Cumulative running total using `SUM OVER`. `partitionBy` resets total per group. Default `limit: 20` (max: 100). Returns `{success, valueColumn, rowCount, rows}`
- `pg_stats_moving_avg({ table, column, orderBy, windowSize, partitionBy?, selectColumns?, where?, limit? })`: Moving average over sliding window. `windowSize` = number of rows in window (default: 3). Default `limit: 20` (max: 100). Returns `{success, valueColumn, windowSize, rowCount, rows}`
- `pg_stats_ntile({ table, orderBy, buckets, partitionBy?, selectColumns?, where?, limit? })`: Divide rows into N equal buckets. `buckets` = number of groups (e.g., 4 for quartiles). Default `limit: 20` (max: 100). Returns `{success, buckets, rowCount, rows}`

**Outlier Detection:**

- `pg_stats_outliers({ table, column, method?, threshold?, where?, limit?, maxOutliers? })`: Detect outliers using IQR or Z-score. `method`: 'iqr' (default, robust for non-normal data) or 'zscore'. IQR `threshold` (default: 1.5, use 3 for extreme). Z-score `threshold` (default: 3). `maxOutliers` (default: 50). Validates column is numeric. Returns `{success, method, stats, outlierCount, totalRows, outliers, truncated?, totalOutliers?}`. IQR stats: `{q1, q3, iqr, lowerBound, upperBound}`. Z-score stats: `{mean, stdDev, lowerBound, upperBound}`

**Advanced Analysis (4 tools):**

- `pg_stats_top_n({ table, column, n?, direction?, selectColumns?, where? })`: Top N rows ranked by column. `n` (default: 10). `direction`: 'desc' (default) or 'asc'. Auto-excludes long-content columns (text, json, bytea) unless `selectColumns` specified—returns `hint` when columns excluded. Returns `{success, column, direction, count, rows, hint?}`
- `pg_stats_distinct({ table, column, where?, limit? })`: Distinct values with total cardinality. Default `limit: 100`. Returns `{success, column, distinctCount, values}`
- `pg_stats_frequency({ table, column, where?, limit? })`: Value frequency distribution ordered by frequency desc. Default `limit: 20`. Returns `{success, column, distinctValues, distribution: [{value, frequency, percentage}]}`
- `pg_stats_summary({ table, columns?, where? })`: Summary statistics for multiple numeric columns. Defaults to all numeric columns if `columns` omitted. Returns `{success, table, summaries: [{column, count, avg, min, max, stddev}]}`

**Top-Level Aliases**: `pg.descriptive()`, `pg.percentiles()`, `pg.correlation()`, `pg.regression()`, `pg.timeSeries()`, `pg.distribution()`, `pg.hypothesis()`, `pg.sampling()`
**Note**: All newer tools (e.g., window functions, outlier detection, advanced analysis) must be accessed via their group namespace: `pg.stats.rowNumber()`, `pg.stats.ntile()`, `pg.stats.outliers()`, etc.
