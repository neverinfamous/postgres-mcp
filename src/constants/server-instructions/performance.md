# Performance Tools

Core (24 methods): `explain()`, `explainAnalyze()`, `explainBuffers()`, `indexStats()`, `tableStats()`, `statStatements()`, `statActivity()`, `locks()`, `bloatCheck()`, `cacheHitRatio()`, `seqScanTables()`, `indexRecommendations()`, `queryPlanCompare()`, `baseline()`, `connectionPoolOptimize()`, `partitionStrategySuggest()`, `unusedIndexes()`, `duplicateIndexes()`, `vacuumStats()`, `queryPlanStats()`, `diagnoseDatabasePerformance()`, `detectQueryAnomalies()`, `detectBloatRisk()`, `detectConnectionSpike()`

Wrappers (3): `blockingQueries()`→`locks({showBlocked:true})`, `longRunningQueries({ seconds | minDuration }?)` filters by duration (returns `{longRunningQueries, count, threshold}`), `analyzeTable({ table })` runs ANALYZE (accepts `schema.table` format)

- `explain({ sql, format?, params? })`: Supports `format: 'text'|'json'|'yaml'|'xml'`. Default: text. Use `params: [value]` for `$1, $2` placeholders
- `explainAnalyze({ sql, format?, params? })`: Same format/params options as explain
- `explainBuffers({ sql, params? })`: Always returns JSON format (includes buffer statistics)
- `indexRecommendations({ sql?, params? })`: Pass `params: [value]` for parameterized queries (e.g., `sql: 'SELECT * FROM orders WHERE id = $1', params: [5]`)
- `queryPlanCompare({ query1, query2, params1?, params2?, compact? })`: Compare two query plans. Accepts `sql1`/`sql2` or `sqlA`/`sqlB` as aliases for `query1`/`query2`. Use `compact: true` to fetch analysis metrics only, omitting large JSON execution plans.
- `partitionStrategySuggest({ table })`: Accepts `schema.table` format (auto-parsed) or separate `table` + `schema` params
- ⚠️ **Data Type Awareness**: Query literals must match column types exactly—`WHERE sensor_id = 1` (integer), not `'sensor_1'` (string)

Aliases: `cacheStats`→`cacheHitRatio`, `queryStats`→`statStatements`, `activity`→`statActivity`, `vacuum`→`vacuumStats`, `indexUsage`→`indexStats`, `bloatEstimate`/`bloat`→`bloatCheck`, `runningQueries`→`longRunningQueries`

📦 **AI-Optimized Payloads**: Tools return limited results by default to reduce context size:

- `indexStats({ table?, schema?, limit? })`: Default 20 rows, **max 100**. Returns `truncated: true` + `totalCount` when limited. `limit: 0` returns up to the 100-row cap
- `tableStats({ table?, schema?, limit? })`: Default 20 rows, **max 100**. Returns `truncated: true` + `totalCount` when limited. `limit: 0` returns up to the 100-row cap
- `vacuumStats({ limit? })`: Default 10 rows, **max 100**. Same truncation indicators. `limit: 0` returns up to the 100-row cap
- `statStatements({ limit?, orderBy? })`: Default 20 rows, **max 100**. Returns `truncated: true` + `totalCount` when limited. `limit: 0` returns up to the 100-row cap. Invalid `orderBy` values return a structured validation error
- `unusedIndexes({ limit?, summary? })`: Default 20 rows. Use `summary: true` for aggregated stats by schema
- `queryPlanStats({ limit?, truncateQuery? })`: Default 10 rows, **max 100**, queries truncated to 100 chars. Use `truncateQuery: 0` for full text
- `seqScanTables({ minScans?, schema?, limit? })`: Default `minScans: 10`, `limit: 20`, **max 100**. Use `minScans: 0` for all tables. `limit: 0` returns up to the 100-row cap. Returns `truncated: true` + `totalCount` when limited
- `locks({ showBlocked?, limit? })`: Default 100 rows. Returns `count` + `truncated`. Use `limit: 0` for all. `showBlocked: true` returns blocking/blocked query pairs instead of the full lock list
- `statActivity({ includeIdle?, limit?, truncateQuery? })`: Default 100 connections (excludes idle), queries truncated to 100 chars. Returns `count`, `truncated`, and `backgroundWorkers`. Use `limit: 0` for all; `includeIdle: true` to include idle connections
- `detectQueryAnomalies({ threshold?, minCalls? })`: `threshold` must be 0.5–10 (default 2.0); `minCalls` must be 1–10000 (default 10). Out-of-range values return a structured validation error
- `detectBloatRisk({ minRows?, schema? })`: `minRows` must be 0–1,000,000 (default 1000). Nonexistent `schema` returns an empty result set (0 tables analyzed) rather than an error
- `detectConnectionSpike({ warningPercent? })`: Default 70. Flags users/apps holding ≥ `warningPercent`% of connections. Value is clamped to 10–100 (not `threshold` — that key is ignored)

📍 **Code Mode Note**: `pg_performance_baseline` → `pg.performance.baseline({ name? })` (not `performanceBaseline`). Optional `name` param labels the snapshot; defaults to an ISO timestamp. `indexRecommendations` accepts `query` alias for `sql`

⚠️ **Extension Dependency**: `diagnoseDatabasePerformance` uses `pg_stat_activity` (not `pg_stat_statements`) for slow query detection — it runs correctly even when `pg_stat_statements` is unavailable. `statStatements` and `queryPlanStats` require the `pg_stat_statements` extension and return a structured `QUERY_ERROR` if it is not installed.

**Top-Level Aliases**: `pg.explain()`, `pg.explainAnalyze()`, `pg.cacheHitRatio()`, `pg.indexStats()`, `pg.tableStats()`, `pg.indexRecommendations()`, `pg.bloatCheck()`, `pg.vacuumStats()`, `pg.unusedIndexes()`, `pg.duplicateIndexes()`, `pg.seqScanTables()`, `pg.diagnoseDatabasePerformance()`, `pg.detectQueryAnomalies()`, `pg.detectBloatRisk()`, `pg.detectConnectionSpike()`
