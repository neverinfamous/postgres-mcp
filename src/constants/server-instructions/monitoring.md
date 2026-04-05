# Monitoring Tools

Code Mode: `pg.monitoring.*` — `databaseSize()`, `tableSizes()`, `connectionStats()`, `showSettings()`, `capacityPlanning()`, `uptime()`, `serverVersion()`, `recoveryStatus()`, `replicationStatus()`, `resourceUsageAnalyze()`, `alertThresholdSet()`

- `databaseSize()`: Returns `{success: true, bytes: number, size: string, error?}`. Optional `database` param for specific db
- `tableSizes({ limit?, schema?, pattern? })`: Clamped to a maximum of 100 rows to prevent unmanageable token bloat. Default limit 10. Accepts `pattern`, `table`, or `name` for table wildcard matching (e.g., `%orders%` or exact). Returns `{success: true, tables: [...], count, truncated?, totalCount?, error?}`. `truncated: true` + `totalCount` when limited. Use `limit: 0` for up to 100 rows (maximum allowed). Invalid types gracefully default.
- `connectionStats({ database? })`: Requires P154 existence checks. Returns `{success: true, byDatabaseAndState, totalConnections: number, maxConnections: number, error?}`
- `showSettings({ setting?, limit? })`: Clamped to a maximum of 100 rows. Default limit 50 when no pattern. Accepts `pattern`, `setting`, `name`, or `like`. Exact names auto-match; `%` for LIKE patterns. Returns `{success: true, settings: [...], count, totalCount?, truncated?, error?}`. Invalid types gracefully default.
- `capacityPlanning({days: 90})`: `days` = `projectionDays`. Returns `{success: true, current, growth, projection, recommendations, error?}` with numeric fields. ⛔ Negative days yield P154 validation error.
- `uptime()`: Returns `{success: true, start_time: string, uptime: {days, hours, minutes, seconds, milliseconds}, error?}`
- `serverVersion()`: Returns `{success: true, full_version: string, version: string, version_num: number, error?}`
- `recoveryStatus()`: Returns `{success: true, in_recovery: boolean, last_replay_timestamp: string|null, error?}`
- `replicationStatus()`: Returns `{success: true, role: 'primary'|'replica', replicas: [...], error?}` for primary, or `{success: true, role: 'replica', replay_lag, receive_lsn, replay_lsn, error?}` for replica
- `resourceUsageAnalyze()`: Returns `{success: true, backgroundWriter, checkpoints, connectionDistribution, bufferUsage, activity, analysis, error?}`
- `alertThresholdSet({metric?, warningThreshold?, criticalThreshold?})`: Enforces strict threshold percentage bounds. Omit `metric` (e.g. `{}`) to return a comprehensive list of all threshold recommendations. Accepts snake_case parameter aliases (`warning_threshold`, `critical_threshold`). Returns `{success: true, metric?, threshold?, thresholds?, note?, error?}`. Valid metrics: connection_usage, cache_hit_ratio, replication_lag, dead_tuples, long_running_queries, lock_wait_time

> **Note**: All tools support P154 Structured Errors and will return `{success: false, error: "..."}` with standard `code` and `category` fields upon failure rather than throwing raw MCP exceptions. Wrong-type parameters for `limit` and `days` are silently coerced to defaults to prevent SDK ingestion rejection.

📦 **AI-Optimized Payloads**: Tools return limited results by default to reduce context size:

- `tableSizes({ limit? })`: Default 10 rows. Returns `truncated: true` + `totalCount` when limited. Use `limit: 0` for up to 100 rows (maximum allowed)
- `showSettings({ limit? })`: Default 50 rows when no pattern specified. Use `limit: 0` for up to 100 rows (maximum allowed) or specify a pattern

Aliases: `connections`/`activeConnections`→`connectionStats`, `tables`→`tableSizes`, `settings`/`config`→`showSettings`, `alerts`/`thresholds`→`alertThresholdSet`, `systemHealth`→`resourceUsageAnalyze`

**Top-Level Aliases**: `pg.databaseSize()`, `pg.tableSizes()`, `pg.connectionStats()`, `pg.activeConnections()`, `pg.serverVersion()`, `pg.uptime()`, `pg.showSettings()`, `pg.recoveryStatus()`, `pg.replicationStatus()`, `pg.capacityPlanning()`, `pg.resourceUsageAnalyze()`, `pg.systemHealth()`, `pg.alertThresholdSet()`
