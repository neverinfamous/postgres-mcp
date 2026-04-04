# Token Consumption during Advanced Stress Testing of postgres-mcp

Last tested: April 4th, 2026

| Test Document | Approximate Token Usage | Notes |
| :--- | :--- | :--- |
| `test-tools-advanced-admin.md` | ~2,300 | |
| `test-tools-advanced-backup.md` | ~2,518 | |
| `test-tools-advanced-citext.md` | ~4,072 | |
| `test-tools-advanced-citext.md` | ~3,183 | |
| `test-tools-advanced-core-part1.md` | ~6,729 | |
| `test-tools-advanced-core-part2.md` | ~39,638 | |
| `test-tools-advanced-cron.md` | ~4,979 | |
| `test-tools-advanced-cross-group.md` | ~93,229 | |
| `test-tools-advanced-introspection.md` | ~5,948 | |
| `test-tools-advanced-jsonb-part1.md` | ~3,021 | |
| `test-tools-advanced-jsonb-part2.md` | ~4,814 | |
| `test-tools-advanced-kcache.md` | ~564 | |
| `test-tools-advanced-ltree.md` | ~4,658 | |
| `test-tools-advanced-migration.md` | ~4,062 | |
| `test-tools-advanced-migration.md` | ~3,091 | |
| `test-tools-advanced-monitoring.md` | ~13,440 | |
| `test-tools-advanced-partitioning.md` | ~5,398 | |
| `test-tools-advanced-partman.md` | ~6,166 | |
| `test-tools-advanced-performance-part1.md` | ~17,025 | |
| `test-tools-advanced-performance-part2.md` | ~8,322 | |
| `test-tools-advanced-pgcrypto.md` | ~5,627 | |
| `test-tools-advanced-postgis-part1.md` | ~6,063 | |
| `test-tools-advanced-postgis-part2.md` | ~5,848 | |
| `test-tools-advanced-schema.md` | ~2,375 | |
| `test-tools-advanced-stats.md` | ~1,985 | |
| `test-tools-advanced-stats-part1.md` | ~6,549 | |
| `test-tools-advanced-stats-part2.md` | ~26,248 | |
| `test-tools-advanced-text.md` | ~2,256 | |
| `test-tools-advanced-transactions.md` | ~5,383 | |
| `test-tools-advanced-vector-part1.md` | ~3,930 | |
| `test-tools-advanced-vector-part2.md` | ~1,039,366 | bloat from testing filters/limits/truncation |
| **Total Estimated Tokens** | **~1,342,482** | |

**Safe to test in pairs**
jsonb + vector
postgis + ltree
pgcrypto + citext
text + cron
partman + partitioning
stats + backup

**Token counts don't include tokens used by the testing prompts themselves.**
