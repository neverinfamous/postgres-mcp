# Resource Testing Prompt

**Step 1:** Read `C:\Users\chris\Desktop\postgres-mcp\test-server\test-resources.sql` to understand what resource seed data has been set up.

**Step 2:** Test all 23 `postgres://` resources by reading each resource URI. For each resource, validate the output against the expected structure documented below.

### All 23 Resources

| #   | Resource URI              | Expected Output Shape                                               | Pass Criteria                                                                                          |
| --- | ------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | `postgres://schema`       | `{ tables: [...] }`                                                 | Returns array of table definitions with columns and types                                              |
| 2   | `postgres://tables`       | `{ tables: [...] }`                                                 | Returns 10+ tables (test\_\* tables from test-database.sql) with sizes                                 |
| 3   | `postgres://settings`     | `{ settings: [...] }` or key-value pairs                            | Returns PostgreSQL configuration parameters                                                            |
| 4   | `postgres://stats`        | `{ tableStats: [...] }`                                             | Returns table statistics; `test_measurements` should show stale stats from seed inserts                |
| 5   | `postgres://activity`     | `{ connections: [...] }`                                            | Returns at least 1 active connection                                                                   |
| 6   | `postgres://pool`         | `{ stats: {...}, health: {...} }`                                   | Returns connection pool state (total, idle, waiting)                                                   |
| 7   | `postgres://capabilities` | `{ serverVersion, postgresqlVersion, toolCategories, ... }`         | Returns PostgreSQL version and detected extensions                                                     |
| 8   | `postgres://performance`  | `{ extensionStatus, summary, topQueries, ... }`                     | `summary` has query counts; `topQueries` non-empty (requires pg_stat_statements)                       |
| 9   | `postgres://health`       | `{ overallStatus, checks, ... }`                                    | Returns health assessment with cache hit ratio, connection counts                                      |
| 10  | `postgres://extensions`   | `{ installedExtensions: [...], availableExtensions: [...] }`        | `installedExtensions` includes pgvector, postgis, etc.                                                 |
| 11  | `postgres://indexes`      | `{ totalIndexes, indexDetails: [...] }`                             | Returns index info for test tables (idx*orders*\*, idx_articles_fts, etc.)                             |
| 12  | `postgres://replication`  | `{ role, walStatus, ... }`                                          | Returns WAL position; replicas may be empty on standalone                                              |
| 13  | `postgres://vacuum`       | `{ vacuumStatistics: [...], transactionIdWraparound, warnings }`    | Returns vacuum stats; `test_products` should show dead tuples from seed updates                        |
| 14  | `postgres://locks`        | `{ totalLocks, lockDetails: [...], warnings }`                      | Returns lock info; may be empty when no contention exists                                              |
| 15  | `postgres://cron`         | `{ extensionInstalled, jobs: [...] }`                               | Returns pg_cron jobs including `resource_test_job` from seed                                           |
| 16  | `postgres://partman`      | `{ extensionInstalled, partitionSets: [...] }`                      | Returns partman config for `test_logs` if pg_partman is installed                                      |
| 17  | `postgres://kcache`       | `{ extensionInstalled, summary, topCpuQueries, topIoQueries, ... }` | Returns `extensionInstalled: true`; stats populated if extension installed                             |
| 18  | `postgres://vector`       | `{ extensionInstalled, vectorColumns: [...], indexes: [...] }`      | `vectorColumns` includes `test_embeddings.embedding`; HNSW index detected                              |
| 19  | `postgres://postgis`      | `{ extensionInstalled, spatialColumns: [...], indexes: [...] }`     | `spatialColumns` includes `test_locations.location`; GIST index detected                               |
| 20  | `postgres://crypto`       | `{ extensionInstalled, availableAlgorithms, passwordHashing, ... }` | Returns pgcrypto availability status and security recommendations                                      |
| 21  | `postgres://insights`     | `{ insights: "..." }` or text memo                                  | Returns accumulated business insights appended via `pg_append_insight`. May be empty on fresh server   |
| 22  | `postgres://audit`        | `{ sessionTokenEstimate, mostUsedTools: [...], recentLogs: [...] }` | Returns audit trail with token summaries. May be empty unless tools have been executed.                |
| 23  | `postgres://help`         | Markdown documentation                                              | Returns documentation overview and available tools. Can also be accessed via `postgres://help/{group}` |

### How to Read Resources

Use the MCP resource reading mechanism. In AntiGravity, you can read resources using the `read_resource` tool with:

- **ServerName**: `postgres` (or whatever the server is named in your MCP config)
- **Uri**: The resource URI (e.g., `postgres://schema`)

Read each resource one at a time (or in parallel batches of 3-4) and validate the output.

### Expected Limitations

These resources may return empty or "not configured" results depending on infrastructure — this is **expected** and should be noted but NOT reported as failures:

- `postgres://replication` — Returns WAL position but may show no replicas on standalone.
- `postgres://locks` — Returns empty locks when no concurrent lock contention exists.
- `postgres://performance` — Requires `pg_stat_statements` extension; may return empty if not loaded.
- `postgres://cron` — Only returns jobs if pg_cron is installed and `test-resources.sql` has been seeded.
- `postgres://partman` — Only returns config if pg_partman is installed and `test-resources.sql` has been seeded.
- `postgres://kcache` — Only returns stats if pg_stat_kcache is installed.
- `postgres://insights` — Returns empty or default message if no insights have been appended via `pg_append_insight` during the current server session. This is in-memory only and resets on server restart.
- `postgres://audit` — Only contains entries for mutations (`pg_write_query`, admin tools) or tools executed with Code Mode. Will be empty on a fresh session unless tools were executed first.
- `postgres://help/{group}` — Depending on `--tool-filter` settings during server start, some group help files may not be registered. However, the base `postgres://help` is always available.

### Reporting Format

For each resource, report:

- ✅ **Pass**: Resource returns expected data shape with meaningful content
- ⚠️ **Partial**: Resource returns correct shape but some fields are empty/zero (note which fields and whether expected)
- ❌ **Fail**: Resource errors, returns wrong shape, or returns unexpectedly empty data

### Final Summary

Provide a summary table of all 23 resources with their pass/partial/fail status. List any issues that require code fixes (e.g., resource handler bugs, missing error handling) separately from infrastructure-dependent limitations.
