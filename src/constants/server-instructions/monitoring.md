# Monitoring Tools

Core: `databaseSize()`, `tableSizes()`, `connectionStats()`, `showSettings()`, `capacityPlanning()`, `uptime()`, `serverVersion()`, `recoveryStatus()`, `replicationStatus()`, `resourceUsageAnalyze()`, `alertThresholdSet()`

- `databaseSize()`: Returns `{success: true, bytes: number, size: string}`. Optional `database` param for specific db
- `tableSizes({ limit?, schema? })`: Clamped to a maximum of 100 rows to prevent unmanageable token bloat. Default limit 10. Returns `{success: true, tables: [...], count, truncated?, totalCount?}`. `truncated: true` + `totalCount` when limited. Use `limit: 0` for up to 100 rows (maximum allowed)
- `connectionStats({ database? })`: Requires P154 existence checks. Returns `{success: true, byDatabaseAndState, totalConnections: number, maxConnections: number}`
- `showSettings({ setting?, limit? })`: Clamped to a maximum of 100 rows to prevent unmanageable token bloat. Default limit 50 when no pattern. Accepts `pattern`, `setting`, `name`, or `like`. Exact names auto-match; `%` for LIKE patterns
- `capacityPlanning({days: 90})`: `days` = `projectionDays`. Returns `{success: true, current, growth, projection, recommendations}` with numeric fields. ⛔ Negative days rejected
- `uptime()`: Returns `{success: true, start_time: string, uptime: {days, hours, minutes, seconds, milliseconds}}`
- `serverVersion()`: Returns `{success: true, full_version: string, version: string, version_num: number}`
- `recoveryStatus()`: Returns `{success: true, in_recovery: boolean, last_replay_timestamp: string|null}`
- `replicationStatus()`: Returns `{success: true, role: 'primary'|'replica', replicas: [...]}` for primary, or `{success: true, role: 'replica', replay_lag, ...}` for replica
- `resourceUsageAnalyze()`: Returns `{success: true, backgroundWriter, checkpoints, connectionDistribution, bufferUsage, activity, analysis}` with all counts as numbers
- `alertThresholdSet({metric, warningThreshold?, criticalThreshold?})`: Enforces threshold bounds. Returns recommended mapping or sets them. Valid metrics: connection_usage, cache_hit_ratio, replication_lag, dead_tuples, long_running_queries, lock_wait_time

📦 **AI-Optimized Payloads**: Tools return limited results by default to reduce context size:

- `tableSizes({ limit? })`: Default 10 rows. Returns `truncated: true` + `totalCount` when limited. Use `limit: 0` for up to 100 rows (maximum allowed)
- `showSettings({ limit? })`: Default 50 rows when no pattern specified. Use `limit: 0` for up to 100 rows (maximum allowed) or specify a pattern

Aliases: `tables`→`tableSizes`, `connections`→`connectionStats`, `settings`/`config`→`showSettings`, `alerts`/`thresholds`→`alertThresholdSet`

**Top-Level Aliases**: `pg.databaseSize()`, `pg.tableSizes()`, `pg.connectionStats()`, `pg.serverVersion()`, `pg.uptime()`, `pg.showSettings()`, `pg.recoveryStatus()`, `pg.replicationStatus()`, `pg.capacityPlanning()`, `pg.resourceUsageAnalyze()`, `pg.alertThresholdSet()`
