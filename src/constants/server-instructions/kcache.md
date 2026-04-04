# pg_stat_kcache Tools

Core: `createExtension()`, `queryStats()`, `topCpu()`, `topIo()`, `databaseStats()`, `resourceAnalysis()`, `reset()`

- `pg_kcache_query_stats`: `limit` param (default: 5, max: 10). Returns `truncated` + `totalCount` when limited. `orderBy`: 'total_time' (default), 'cpu_time', 'reads', 'writes'. `queryPreviewLength`: chars for query preview (default: 100, max: 500, 0 for full). `compact`: boolean (default: true, omits query_preview text and 0/empty fields). ⛔ 'calls' NOT valid for orderBy—use `minCalls` param
- `pg_kcache_resource_analysis`: `limit` param (default: 5, max: 10). Returns `truncated` + `totalCount` when limited. `minCalls`, `queryPreviewLength`, and `compact` supported. Classifies queries as 'CPU-bound', 'I/O-bound', or 'Balanced'
- `pg_kcache_top_cpu`: Top CPU-consuming queries. `limit` param (default: 5, max: 10). `queryPreviewLength` and `compact` supported. Returns `truncated` + `totalCount` when limited
- `pg_kcache_top_io`: `type`/`ioType` (alias): 'reads', 'writes', 'both' (default). `limit` param (default: 5, max: 10). `queryPreviewLength` and `compact` supported. Returns `truncated` + `totalCount` when limited
- `pg_kcache_database_stats`: Aggregated CPU/IO stats per database. Optional `database` param to filter specific db. `compact`: boolean (default: true, omits 0/empty fields to save tokens)
- `pg_kcache_reset`: Resets pg_stat_kcache AND pg_stat_statements statistics
