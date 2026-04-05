# Token Consumption during Direct Tool Testing of postgres-mcp

Last tested: April 4th, 2026

| Test Document | Approximate Token Usage | Notes |
| :--- | :--- | :--- |
| `test-tool-group-admin.md` | ~3,405 | |
| `test-tool-group-backup.md` | ~6,132 | |
| `test-tool-group-citext.md` | ~5,369 | |
| `test-tool-group-core-part1.md` | ~7,737 | |
| `test-tool-group-core-part2.md` | ~4,322 | |
| `test-tool-group-cron.md` | ~3,309 | |
| `test-tool-group-introspection.md` | ~20,513 | |
| `test-tool-group-jsonb-part1.md` | ~8,482 | |
| `test-tool-group-jsonb-part2.md` | ~2,845 | |
| `test-tool-group-kcache.md` | ~4,386 | |
| `test-tool-group-ltree.md` | ~4,441 | |
| `test-tool-group-migration.md` | ~4,609 |
| `test-tool-group-monitoring.md` | ~5,380 | |
| `test-tool-group-partitioning.md` | ~3,365 | |
| `test-tool-group-partman.md` | ~4,174 | |
| `test-tool-group-performance-part1.md` | ~8,938 | |
| `test-tool-group-performance-part2.md` | ~12,326 | |
| `test-tool-group-pgcrypto.md` | ~2,876 | |
| `test-tool-group-postgis-part1.md` | ~5,119 | |
| `test-tool-group-postgis-part2.md` | ~5,072 | |
| `test-tool-group-schema.md` | ~5,506 | |
| `test-tool-group-stats-part1.md` | ~8,824 | |
| `test-tool-group-stats-part2.md` | ~9,835 | |
| `test-tool-group-text.md` | ~5,377 | |
| `test-tool-group-transactions.md` | ~3,240 | |
| `test-tool-group-vector-part1.md` | ~2,678 | |
| `test-tool-group-vector-part2.md` | ~6,552| |
| **Total Estimated Tokens** | **~172,537** | |

**Safe to test in pairs**
jsonb + vector
postgis + ltree
pgcrypto + citext
text + cron
partman + partitioning
stats + backup

**Token counts don't include tokens used by the testing prompts themselves.**
