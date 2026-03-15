# Performance Tools

Core (24 methods): `explain()`, `explainAnalyze()`, `explainBuffers()`, `indexStats()`, `tableStats()`, `statStatements()`, `statActivity()`, `locks()`, `bloatCheck()`, `cacheHitRatio()`, `seqScanTables()`, `indexRecommendations()`, `queryPlanCompare()`, `baseline()`, `connectionPoolOptimize()`, `partitionStrategySuggest()`, `unusedIndexes()`, `duplicateIndexes()`, `vacuumStats()`, `queryPlanStats()`, `diagnoseDatabasePerformance()`, `detectQueryAnomalies()`, `detectBloatRisk()`, `detectConnectionSpike()`

Wrappers (3): `blockingQueries()`→`locks({showBlocked:true})`, `longRunningQueries({ seconds | minDuration }?)` filters by duration (returns `{longRunningQueries, count, threshold}`), `analyzeTable({ table })` runs ANALYZE (accepts `schema.table` format)

- `explain({ sql, format?, params? })`: Supports `format: 'text'|'json'|'yaml'|'xml'`. Default: text. Use `params: [value]` for `$1, $2` placeholders
- `explainAnalyze({ sql, format?, params? })`: Same format/params options as explain
- `explainBuffers({ sql, params? })`: Always returns JSON format (includes buffer statistics)
- `indexRecommendations({ sql?, params? })`: Pass `params: [value]` for parameterized queries (e.g., `sql: 'SELECT * FROM orders WHERE id = $1', params: [5]`)
- `queryPlanCompare({ query1, query2, params1?, params2? })`: Compare two query plans. Use `params1`/`params2` for parameterized queries
- `partitionStrategySuggest({ table })`: Accepts `schema.table` format (auto-parsed) or separate `table` + `schema` params
- ⚠️ **Data Type Awareness**: Query literals must match column types exactly—`WHERE sensor_id = 1` (integer), not `'sensor_1'` (string)

Aliases: `cacheStats`→`cacheHitRatio`, `queryStats`→`statStatements`, `activity`→`statActivity`, `vacuum`→`vacuumStats`, `indexUsage`→`indexStats`, `bloatEstimate`/`bloat`→`bloatCheck`, `runningQueries`→`longRunningQueries`

📦 **AI-Optimized Payloads**: Tools return limited results by default to reduce context size:

- `indexStats({ limit? })`: Default 50 rows. Returns `truncated: true` + `totalCount` when limited. Use `limit: 0` for all
- `tableStats({ limit? })`: Default 50 rows. Returns `truncated: true` + `totalCount` when limited. Use `limit: 0` for all
- `vacuumStats({ limit? })`: Default 50 rows. Same truncation indicators. Use `limit: 0` for all
- `statStatements({ limit?, orderBy? })`: Default 20 rows. Returns `truncated: true` + `totalCount` when limited. Use `limit: 0` for all
- `unusedIndexes({ limit?, summary? })`: Default 20 rows. Use `summary: true` for aggregated stats by schema
- `queryPlanStats({ limit?, truncateQuery? })`: Default 20 rows, queries truncated to 100 chars. Use `truncateQuery: 0` for full text

📍 **Code Mode Note**: `pg_performance_baseline` → `pg.performance.baseline()` (not `performanceBaseline`). `indexRecommendations` accepts `query` alias for `sql`

**Top-Level Aliases**: `pg.explain()`, `pg.explainAnalyze()`, `pg.cacheHitRatio()`, `pg.indexStats()`, `pg.tableStats()`, `pg.indexRecommendations()`, `pg.bloatCheck()`, `pg.vacuumStats()`, `pg.unusedIndexes()`, `pg.duplicateIndexes()`, `pg.seqScanTables()`, `pg.diagnoseDatabasePerformance()`, `pg.detectQueryAnomalies()`, `pg.detectBloatRisk()`, `pg.detectConnectionSpike()`
