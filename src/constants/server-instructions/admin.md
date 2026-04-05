# Admin Tools

Core: `vacuum()`, `vacuumAnalyze()`, `analyze()`, `reindex()`, `cluster()`, `setConfig()`, `reloadConf()`, `resetStats()`, `cancelBackend()`, `terminateBackend()`, `appendInsight()`

- All admin tools support `schema.table` format (auto-parsed, embedded schema takes priority over explicit `schema` param)
- `vacuum({ table?, full?, analyze?, verbose? })`: Without `table`, vacuums ALL tables. `verbose` output goes to logs. Note: Vacuum timing logic triggers log progress feedback _after_ validation execution correctly.
- `reindex({ target, name?, concurrently? })`: Targets: 'table', 'index', 'schema', 'database'. `database` target defaults to current db when `name` omitted
- `cluster()`: Without args, re-clusters all previously-clustered tables. If `index` is specified, `table` is also required.
- `setConfig({ name, value, isLocal? })`: `isLocal: true` applies only to current transaction
- `cancelBackend({ pid })`: Graceful query cancellation—returns `{success: false}` for invalid PID (no error thrown)
- `terminateBackend({ pid })`: Forceful connection termination—use with caution
- `appendInsight({ insight })`: Record a business insight to in-memory memo. Insights are accessible via `postgres://insights` resource. Use to record key findings during database analysis. Returns `{success, insightCount, message}`

Aliases: `tableName`→`table`, `indexName`→`index`, `param`/`setting`→`name`, `processId`→`pid`, `text`→`insight`. (Note: for `reindex`, `tableName`/`table`/`indexName` all map to `name`).

**Top-Level Aliases**: `pg.vacuum()`, `pg.vacuumAnalyze()`, `pg.analyze()`, `pg.reindex()`, `pg.cluster()`, `pg.setConfig()`, `pg.reloadConf()`, `pg.resetStats()`, `pg.cancelBackend()`, `pg.terminateBackend()`, `pg.appendInsight()`

**Discovery**: `pg.admin.help()` returns `{methods, methodAliases, examples}` object

**Response structures**:
_(Note: All operations strictly adhere to P154 error handling, returning `{success: false, error: "...", code: "..."}` natively for domain errors and Zod validation failures)._

- `vacuum()` / `vacuumAnalyze()`: `{success, message, table?, schema?, hint?}`
- `analyze()`: `{success, message, table?, schema?, hint?}`
- `reindex()`: `{success, message, target?, name?, concurrently?, hint?}`
- `cluster()`: `{success, message, table?, index?, hint?}`
- `setConfig()`: `{success, message, parameter?, value?, hint?}`
- `reloadConf()` / `resetStats()`: `{success, message, hint?}`
- `cancelBackend()` / `terminateBackend()`: `{success, message, pid?, hint?}`
- `appendInsight()`: `{success, insightCount, message}`
