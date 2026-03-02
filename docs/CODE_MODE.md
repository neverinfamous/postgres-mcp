# Code Mode

Code Mode (`pg_execute_code`) enables 70-90% token reduction by executing JavaScript code in a sandboxed environment with direct database access.

---

## Overview

Instead of making multiple individual tool calls, Code Mode lets you write a single JavaScript snippet that:

- Executes multiple queries in sequence
- Processes and transforms results
- Returns structured output

This dramatically reduces token usage in multi-step database operations.

---

## Available API

Inside Code Mode, every tool is accessible through the `pg` API using the pattern `pg.{group}.{method}()`.

### API Groups

| Group             | Methods                                                                                      | Example                                          |
| ----------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `pg.core`         | `readQuery`, `writeQuery`, `listTables`, `describeTable`, `createTable`, `createIndex`, etc. | `pg.core.readQuery({sql: "SELECT..."})`          |
| `pg.jsonb`        | `extract`, `set`, `insert`, `delete`, `contains`, `pathQuery`, `agg`, etc.                   | `pg.jsonb.extract({table, column, path})`        |
| `pg.text`         | `search`, `fuzzy`, `headline`, `rank`, etc.                                                  | `pg.text.search({table, columns, query})`        |
| `pg.transactions` | `begin`, `commit`, `rollback`, `savepoint`, `execute`                                        | `pg.transactions.execute({statements})`          |
| `pg.performance`  | `explain`, `tableStats`, `indexStats`, `baseline`, etc.                                      | `pg.performance.explain({sql})`                  |
| `pg.admin`        | `vacuum`, `analyze`, `reindex`, `cancelBackend`, etc.                                        | `pg.admin.analyze({table})`                      |
| `pg.monitoring`   | `databaseSize`, `tableSizes`, `connectionStats`, etc.                                        | `pg.monitoring.databaseSize()`                   |
| `pg.backup`       | `dumpTable`, `dumpSchema`, `copyExport`, `copyImport`, etc.                                  | `pg.backup.copyExport({table})`                  |
| `pg.schema`       | `createSchema`, `createView`, `createSequence`, `listViews`, etc.                            | `pg.schema.listViews()`                          |
| `pg.stats`        | `descriptive`, `percentiles`, `correlation`, `timeSeries`, etc.                              | `pg.stats.descriptive({table, column})`          |
| `pg.partitioning` | `createPartition`, `listPartitions`, etc.                                                    | `pg.partitioning.listPartitions({table})`        |
| `pg.vector`       | `search`, `createIndex`, `embed`, `distance`, etc.                                           | `pg.vector.search({table, column, vector})`      |
| `pg.postgis`      | `distance`, `buffer`, `pointInPolygon`, etc.                                                 | `pg.postgis.distance({table, column, lat, lng})` |
| `pg.cron`         | `schedule`, `unschedule`, `listJobs`, etc.                                                   | `pg.cron.listJobs()`                             |
| `pg.partman`      | `createParent`, `runMaintenance`, etc.                                                       | `pg.partman.showConfig()`                        |
| `pg.kcache`       | `queryStats`, `reset`, `topCpu`, `topIo`, etc.                                               | `pg.kcache.queryStats()`                         |
| `pg.citext`       | `convertColumn`, `listColumns`, `analyzeCandidates`, etc.                                    | `pg.citext.analyzeCandidates()`                  |
| `pg.ltree`        | `query`, `subpath`, `lca`, `match`, etc.                                                     | `pg.ltree.query({table, column, path})`          |
| `pg.pgcrypto`     | `hash`, `encrypt`, `decrypt`, `genRandomUuid`, etc.                                          | `pg.pgcrypto.hash({data, algorithm})`            |

### Naming Convention

Tool names map to API methods by dropping the group prefix:

```
pg_jsonb_extract  →  pg.jsonb.extract()
pg_vector_search  →  pg.vector.search()
pg_text_search    →  pg.text.search()
```

### Top-Level Aliases

Common core tools are available directly on `pg` for convenience:

```javascript
pg.readQuery("SELECT..."); // pg.core.readQuery()
pg.listTables(); // pg.core.listTables()
pg.describeTable({ table }); // pg.core.describeTable()
pg.exists("users", "id=1"); // pg.core.exists() — positional args work
pg.createIndex("users", ["email"]);
```

### Low-Level Primitives

For raw SQL when no typed method exists:

```javascript
// Read queries
const result = await pg.query("SELECT * FROM users WHERE id = $1", [userId]);
return result.rows;

// Write queries
await pg.execute("UPDATE users SET last_login = NOW() WHERE id = $1", [userId]);
return { success: true };
```

### Discovery

Use `pg.help()` to list all available groups and methods:

```javascript
const api = pg.help(); // Returns {group: methods[]} mapping
const coreApi = pg.core.help(); // Group-specific methods and examples
```

### Format Auto-Resolution

- **Schema.Table**: `'public.users'` auto-parses to `{schema: 'public', table: 'users'}`
- **JSONB Paths**: Both `'a.b.c'` (string) and `['a','b','c']` (array) work
- **Aliases**: `query`/`sql`, `table`/`tableName`, etc. resolve automatically

---

## Security Constraints

Code Mode enforces strict security:

### Blocked Operations

- `require()` - No module imports
- `process` - No process access
- `eval()` - No dynamic code execution
- Filesystem access - No file operations
- Network requests - No external HTTP calls

### Access Control

- Requires `admin` OAuth scope
- Rate limited: **60 executions/minute**

---

## Disabling Code Mode

If you don't have admin access or prefer individual tool calls:

```json
{
  "args": ["--tool-filter", "starter,-codemode"]
}
```

---

## AntiGravity Users

> **Important:** AntiGravity does not currently support automatic MCP server instructions.

For optimal Code Mode usage in AntiGravity, manually provide the contents of [`src/constants/ServerInstructions.ts`](../src/constants/ServerInstructions.ts) to the agent in your prompt or user rules.

This ensures the AI understands the full `pg.{group}.{method}()` API, response structures, and tool-specific gotchas available in Code Mode.

---

## Example: Complex Analysis

```javascript
// Analyze query performance across all tables
const stats = await pg.query(`
  SELECT relname, n_live_tup, n_dead_tup, 
         last_vacuum, last_analyze
  FROM pg_stat_user_tables
  ORDER BY n_dead_tup DESC
  LIMIT 10
`);

const analysis = stats.rows.map((row) => ({
  table: row.relname,
  liveRows: row.n_live_tup,
  deadRows: row.n_dead_tup,
  bloatRatio: row.n_dead_tup / (row.n_live_tup + row.n_dead_tup + 1),
  needsVacuum: row.n_dead_tup > 1000,
  lastVacuum: row.last_vacuum,
  lastAnalyze: row.last_analyze,
}));

return {
  summary: `Found ${analysis.filter((a) => a.needsVacuum).length} tables needing vacuum`,
  tables: analysis,
};
```

---

## Maximizing Token Efficiency

Code Mode is included in all presets by default, but your AI agent may not always choose it over individual tool calls. For maximum token savings, add a rule like this to your agent's prompt or system configuration:

> _"When using postgres-mcp, prefer `pg_execute_code` (Code Mode) for multi-step database operations to minimize token usage."_

This ensures the agent batches multiple operations into a single `pg_execute_code` call — reducing token usage by 70-90% compared to making many individual tool calls.
