# Admin Tools

Core: `vacuum()`, `vacuumAnalyze()`, `analyze()`, `reindex()`, `cluster()`, `setConfig()`, `reloadConf()`, `resetStats()`, `cancelBackend()`, `terminateBackend()`, `appendInsight()`

- All admin tools support `schema.table` format (auto-parsed, embedded schema takes priority over explicit `schema` param)
- `vacuum({ table?, full?, analyze?, verbose? })`: Without `table`, vacuums ALL tables. `verbose` output goes to logs. Note: Vacuum timing logic triggers log progress feedback *after* validation execution correctly.
- `reindex({ target, name?, concurrently? })`: Targets: 'table', 'index', 'schema', 'database'. `database` target defaults to current db when `name` omitted
- `cluster()`: Without args, re-clusters all previously-clustered tables. With args, requires BOTH `table` AND `index`
- `setConfig({ name, value, isLocal? })`: `isLocal: true` applies only to current transaction
- `cancelBackend({ pid })`: Graceful query cancellation—returns `{success: false}` for invalid PID (no error thrown)
- `terminateBackend({ pid })`: Forceful connection termination—use with caution
- `appendInsight({ insight })`: Record a business insight to in-memory memo. Insights are accessible via `postgres://insights` resource. Use to record key findings during database analysis. Returns `{success, insightCount, message}`

Aliases: `tableName`→`table`, `indexName`→`index`, `param`/`setting`→`name`, `processId`→`pid`

**Top-Level Aliases**: `pg.vacuum()`, `pg.vacuumAnalyze()`, `pg.analyze()`, `pg.reindex()`, `pg.cluster()`, `pg.setConfig()`, `pg.reloadConf()`, `pg.resetStats()`, `pg.cancelBackend()`, `pg.terminateBackend()`, `pg.appendInsight()`

**Discovery**: `pg.admin.help()` returns `{methods, methodAliases, examples}` object

**Response structures**:

- `vacuum()` / `vacuumAnalyze()`: `{success, message, table?, schema?, hint?}` (hint present when verbose: true)
- `analyze()`: `{success, message, table?, schema?, columns?}`
- `reindex()`: `{success, message}`
- `cluster()`: `{success, message, table?, index?}` (table/index present for table-specific cluster)
- `setConfig()`: `{success, message, parameter, value}`
- `reloadConf()` / `resetStats()`: `{success, message}`
- `cancelBackend()` / `terminateBackend()`: `{success, message}`
- `appendInsight()`: `{success, insightCount, message}`

