# Monitoring Tools

Core: `databaseSize()`, `tableSizes()`, `connectionStats()`, `showSettings()`, `capacityPlanning()`, `uptime()`, `serverVersion()`, `recoveryStatus()`, `replicationStatus()`, `resourceUsageAnalyze()`, `alertThresholdSet()`

- `databaseSize()`: Returns `{bytes: number, size: string}`. Optional `database` param for specific db
- `tableSizes({ limit?, schema? })`: Default limit 50. Returns `{tables: [...], count, truncated?, totalCount?}`. `truncated: true` + `totalCount` when limited. Use `limit: 0` for all
- `connectionStats({ database? })`: Requires P154 existence checks. Returns `{byDatabaseAndState, totalConnections: number, maxConnections: number}`
- `showSettings({ setting?, limit? })`: Clamped to a maximum of 100 rows to prevent unmanageable token bloat. Default limit 50 when no pattern. Accepts `pattern`, `setting`, or `name`. Exact names auto-match; `%` for LIKE patterns
- `capacityPlanning({days: 90})`: `days` = `projectionDays`. Returns `{current, growth, projection, recommendations}` with numeric fields. ⛔ Negative days rejected
- `uptime()`: Returns `{start_time: string, uptime: {days, hours, minutes, seconds, milliseconds}}`
- `serverVersion()`: Returns `{full_version: string, version: string, version_num: number}`
- `recoveryStatus()`: Returns `{in_recovery: boolean, last_replay_timestamp: string|null}`
- `replicationStatus()`: Returns `{role: 'primary'|'replica', replicas: [...]}` for primary, or `{role: 'replica', replay_lag, ...}` for replica
- `resourceUsageAnalyze()`: Returns `{backgroundWriter, checkpoints, connectionDistribution, bufferUsage, activity, analysis}` with all counts as numbers
- `alertThresholdSet({metric, warningThreshold?, criticalThreshold?})`: Enforces threshold bounds. Returns recommended mapping or sets them. Valid metrics: connection_usage, cache_hit_ratio, replication_lag, dead_tuples, long_running_queries, lock_wait_time

📦 **AI-Optimized Payloads**: Tools return limited results by default to reduce context size:

- `tableSizes({ limit? })`: Default 50 rows. Returns `truncated: true` + `totalCount` when limited. Use `limit: 0` for all
- `showSettings({ limit? })`: Default 50 rows when no pattern specified. Use `limit: 0` for all or specify a pattern

Aliases: `tables`→`tableSizes`, `connections`→`connectionStats`, `settings`/`config`→`showSettings`, `alerts`/`thresholds`→`alertThresholdSet`

**Top-Level Aliases**: `pg.databaseSize()`, `pg.tableSizes()`, `pg.connectionStats()`, `pg.serverVersion()`, `pg.uptime()`, `pg.showSettings()`, `pg.recoveryStatus()`, `pg.replicationStatus()`, `pg.capacityPlanning()`, `pg.resourceUsageAnalyze()`, `pg.alertThresholdSet()`
