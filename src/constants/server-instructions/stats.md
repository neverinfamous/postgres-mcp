# Stats Tools

- All stats tools support `schema.table` format (auto-parsed, embedded schema takes priority over explicit `schema` param)
- `timeSeries`: Both `timeColumn` (must be timestamp/date) and `valueColumn` (must be numeric) are validated upfront with clear error messages. Aliases: `time`→`timeColumn`, `value`→`valueColumn`. `interval` accepts: `second`, `minute`, `hour`, `day`, `week`, `month`, `year` (keywords, PostgreSQL format, or plurals). Default `limit: 100` time buckets. Use `limit: 0` for no limit. Returns `truncated` and `totalCount` indicators when default limit is applied. **groupBy payloads**: Default `groupLimit: 20` groups. Returns `truncated` + `totalGroupCount` when groups are limited. Use `groupLimit: 0` for all groups
- `correlation`: Use `column1`/`column2` or aliases `x`/`y` for column names
- `distribution`: Returns `skewness`, `kurtosis` (excess). `buckets` must be > 0. **groupBy payloads**: Default `groupLimit: 20` groups (prevents large payloads with many histogram buckets per group). Returns `truncated` + `totalGroupCount` when groups are limited. Use `groupLimit: 0` for all groups
- `sampling`: Defaults to `random` method with 20 rows (optimized for LLM context). `sampleSize` always takes precedence over `percentage`. ⚠️ `percentage` param only works with `bernoulli`/`system` methods—ignored for default `random` method. Default limit of 100 rows applied to `bernoulli`/`system` with `percentage` to prevent large payloads. Returns `truncated` and `totalSampled` when TABLESAMPLE returns more rows than limit
- `percentiles`: Accepts 0-1 or 0-100 (auto-normalized). ⚠️ Use consistent scale—mixing (e.g., `[0.1, 50]`) produces unexpected keys and returns a `warning` field explaining the issue. Empty array → defaults [0.25, 0.5, 0.75]
- `hypothesis`: Returns nested `results` object containing `pValue` (two-tailed), `testStatistic`, `interpretation`, `sampleMean`, `sampleStdDev`. Access via `hyp.results.pValue`. Use `populationStdDev` for z-test, otherwise defaults to t-test
- `regression`: Use `xColumn`/`yColumn`, aliases `x`/`y`, or `column1`/`column2` (for consistency with correlation). Returns nested `regression` object containing `slope`, `intercept`, `rSquared`, `equation`, `avgX`, `avgY`, `sampleSize`. Access via `reg.regression.slope`
- ⚠️ WARNING: `sampling` with `system` method unreliable for small tables—use `bernoulli` or `random`

**Top-Level Aliases**: `pg.descriptive()`, `pg.percentiles()`, `pg.correlation()`, `pg.regression()`, `pg.timeSeries()`, `pg.distribution()`, `pg.hypothesis()`, `pg.sampling()`
