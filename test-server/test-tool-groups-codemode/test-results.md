# Token Consumption during codemode Testing of postgres-mcp

Last tested: April 4th, 2026

| Test Document | Approximate Token Usage | Notes |
| :--- | :--- | :--- |
| `test-tool-group-codemode-admin.md` | ~1,098,369 | |
| `test-tool-group-codemode-backup.md` | ~7,665 | |
| `test-tool-group-codemode-citext.md` | ~7,370 | |
| `test-tool-group-codemode-core-part1.md` | ~3,489 | |
| `test-tool-group-codemode-core-part2.md` | ~3,550 | |
| `test-tool-group-codemode-cron.md` | ~4,930 | |
| `test-tool-group-codemode-cross-group.md` | ~187,341 | |
| `test-tool-group-codemode-introspection.md` | ~41,208 | |
| `test-tool-group-codemode-jsonb-part1.md` | ~31,891 | |
| `test-tool-group-codemode-jsonb-part2.md` | ~3,309 | |
| `test-tool-group-codemode-kcache.md` | ~6,341 | |
| `test-tool-group-codemode-ltree.md` | ~7,569 | |
| `test-tool-group-codemode-migration.md` | ~3,930 | |
| `test-tool-group-codemode-monitoring.md` | ~6,336 | |
| `test-tool-group-codemode-partitioning.md` | ~2,117 | |
| `test-tool-group-codemode-partman.md` | ~3,598 | |
| `test-tool-group-codemode-performance-part1.md` | ~12,170 | |
| `test-tool-group-codemode-performance-part2.md` | ~14,405 | |
| `test-tool-group-codemode-pgcrypto.md` | ~10,634 | |
| `test-tool-group-codemode-postgis-part1.md` | ~5,974 | |
| `test-tool-group-codemode-postgis-part2.md` | ~9,606 | |
| `test-tool-group-codemode-schema.md` | ~12,790 | |
| `test-tool-group-codemode-stats-part1.md` | ~57,469 | |
| `test-tool-group-codemode-stats-part2.md` | ~9,082 | |
| `test-tool-group-codemode-text.md` | ~6,042 | |
| `test-tool-group-codemode-transactions.md` | ~2,893 | |
| `test-tool-group-codemode-vector-part1.md` | ~3,630 | |
| `test-tool-group-codemode-vector-part2.md` | ~8,473 | |
| **Total Estimated Tokens** | **~1,645,679** | |

**Safe to test in pairs**
jsonb + vector
postgis + ltree
pgcrypto + citext
text + cron
partman + partitioning
stats + backup

**Token counts don't include tokens used by the testing prompts themselves.**
