# Advanced Stress Test — postgres-mcp — performance Group

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run test-tools-advanced-1.md, test-tools-advanced-2.md, test-tools-advanced-3.md, test-tools-advanced-5.md, test-tools-advanced-6.md, test-tools-advanced-7.md, test-tools-advanced-8.md.
- All changes **MUST** be consistent with other postgres-mcp tools and `code-map.md`.
- Do not do anything other than these tests.
- Please let me handle Lint, typecheck, vitest, and playwright. You cannot restart the server in antigravity as the cache has to be refreshed manually.

## Code Mode Execution

All tests should be executed via `pg_execute_code` code mode. Tests are written in direct tool call syntax for readability — translate to code mode:

| Direct Tool Call                                     | Code Mode Equivalent                                           |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `pg_read_query({sql: "..."})`                        | `pg.core.readQuery({sql: "..."})`                              |
| `pg_write_query({sql: "..."})`                       | `pg.core.writeQuery({sql: "..."})`                             |
| `pg_create_table({table: "...", columns: [...]})`    | `pg.core.createTable({table: "...", columns: [...]})`          |
| `pg_describe_table({table: "..."})`                  | `pg.core.describeTable({table: "..."})`                        |
| `pg_drop_table({table: "..."})`                      | `pg.core.dropTable({table: "..."})`                            |
| `pg_count({table: "..."})`                           | `pg.core.count({table: "..."})`                                |
| `pg_exists({table: "..."})`                          | `pg.core.exists({table: "..."})`                               |
| `pg_batch_insert({...})`                             | `pg.core.batchInsert({...})`                                   |
| `pg_upsert({...})`                                   | `pg.core.upsert({...})`                                        |
| `pg_transaction_*({...})`                            | `pg.transactions.*({...})`                                     |
| `pg_jsonb_*({...})`                                  | `pg.jsonb.*({...})`                                            |
| `pg_text_*` / `pg_trigram_*` / `pg_fuzzy_*` / etc.   | `pg.text.*`                                                    |
| `pg_stats_*({...})`                                  | `pg.stats.*({...})`                                            |
| `pg_vector_*({...})`                                 | `pg.vector.*({...})`                                           |

**Key rules:**

- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls — create a table in one call, query it in the next
- Group multiple related tests into a single code mode call when practical

## Test Database Schema

Same as `test-tools.md` — refer to that file for the full schema reference. Key tables: `test_products` (15 rows), `test_orders` (20), `test_jsonb_docs` (3), `test_articles` (3), `test_measurements` (640, after resource seed), `test_embeddings` (75, after resource seed), `test_locations` (25, after resource seed), `test_users` (3), `test_categories` (6), `test_events` (100 across 4 partitions), `test_departments` (3), `test_employees` (5), `test_projects` (2), `test_assignments` (3), `test_audit_log` (3).

> **Note:** `test-resources.sql` runs after `test-database.sql` and adds ~200 measurements (minus deletions), 25 embeddings, and 20 locations. Counts reflect the post-seed state.

## Naming & Cleanup

- **Temporary tables**: Prefix with `stress_` (e.g., `stress_empty_table`)
- **Temporary indexes**: Prefix with `stress_idx_`
- **Temporary views**: Prefix with `stress_view_`
- **Temporary schemas**: Prefix with `stress_schema_`
- **Cleanup**: Attempt to remove all `stress_*` objects after testing. If DROP fails, note the leftover objects and move on — they will be cleaned up on next database reset

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized — **blocking, equally important as ❌ bugs**. Oversized payloads waste LLM context window tokens and degrade downstream tool-calling quality. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization (e.g., filter system tables, add `compact` option, omit empty arrays).
- ✅ Confirmed: Edge case handled correctly (use only inline during testing; omit from Final Summary)

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `TABLE_NOT_FOUND`, `COLUMN_NOT_FOUND`, `VALIDATION_ERROR`). These are fixable in `src/utils/errors/` by adding a `code` override to the matching error class. Treat as ⚠️ Issue and include in fix plan.

## Post-Test Procedures

1. Confirm cleanup of all `stress_*` object and any temporary files you might have created in the repository during testing.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in this prompt and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
3. Update the changelog with any changes made (being careful not to create duplicate headers), and commit without pushing.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass. Highlight the single most expensive code mode block.
5. Stop and briefly summarize the testing results and fixes, ensuring the total token count is prominently displayed.

---

## performance Group Advanced Tests

### Anomaly Detection Tools (subset of 24 +1 code mode)

> **Note:** Basic performance tools are thoroughly covered in standard testing (`test-group-tools.md`). This section focuses on anomaly detection edge cases.

Relevant tools for this section:

- pg_detect_query_anomalies
- pg_detect_bloat_risk
- pg_detect_connection_spike

### Category 1: pg_detect_query_anomalies Edge Cases

1. `pg_detect_query_anomalies({threshold: 0.5})` → minimum threshold clamp; verify more anomalies than default; `riskLevel` may be `high` or `critical`
2. `pg_detect_query_anomalies({threshold: 10.0})` → maximum threshold clamp; verify `anomalyCount: 0` (or 1 if an extreme outlier exists); `riskLevel` varies
3. `pg_detect_query_anomalies({minCalls: 10000})` → very high minimum should filter most queries; verify `totalAnalyzed` is small or 0
4. `pg_detect_query_anomalies({minCalls: 1})` → include all queries with at least 1 call; verify `totalAnalyzed` >= default result
5. If `pg_stat_statements` is not loaded (hypothetical) → verify structured error with `success: false`, `suggestion` field mentioning `pg_diagnose_database_performance`, NOT raw MCP error

### Category 2: pg_detect_bloat_risk Edge Cases

6. `pg_detect_bloat_risk({minRows: 0})` → should clamp to 0 (include micro-tables); verify all user tables appear including small ones
7. `pg_detect_bloat_risk({minRows: 1000000})` → very high threshold; expect `totalAnalyzed: 0` and empty `tables` (test DB has no million-row tables)
8. `pg_detect_bloat_risk({schema: "public", minRows: 1})` → combined filter; verify tables array only contains `public` schema tables
9. `pg_detect_bloat_risk({schema: "pg_catalog"})` → system schema filter; verify response structure (may be empty or contain system tables depending on filter logic)
10. Verify each table in response has: `riskScore` (0-100), `riskLevel`, `recommendations` array, `factors` object with `deadTupleRatio`, `vacuumStaleness`, `tableSizeImpact`, `autovacuumEffectiveness`

### Category 3: pg_detect_connection_spike Edge Cases

11. `pg_detect_connection_spike({warningPercent: 10})` → very low threshold; verify more `warnings` entries than default (70%)
12. `pg_detect_connection_spike({warningPercent: 100})` → maximum threshold; verify `warnings` is empty or minimal
13. Verify `byState` array intentionally EXCLUDES the current monitoring query (via `pid != pg_backend_pid()`), meaning `state: "active"` may be absent if no other queries are running
14. Verify `usagePercent` = `(totalConnections / maxConnections) * 100` (approximately)
15. Verify `concentrations` array structure: each entry has `dimension`, `value`, `count`, `percent`

### Category 4: Cross-Tool Correlation (Anomaly + Performance)

Use Code Mode to cross-verify anomaly tools against existing performance tools:

```javascript
// Run via pg_execute_code
const bloat = await pg.performance.detectBloatRisk({minRows: 1});
const bloatCheck = await pg.performance.bloatCheck();
return {
  anomalyTables: bloat.tables?.length ?? 0,
  bloatTables: bloatCheck.count ?? 0,
  anomalyAnalyzed: bloat.totalAnalyzed,
};
```

```javascript
// Verify connection spike aligns with connection_stats
const spike = await pg.performance.detectConnectionSpike();
const stats = await pg.monitoring.connectionStats();
return {
  spikeTotal: spike.totalConnections,
  statsTotal: stats.totalConnections,
  match: spike.totalConnections === stats.totalConnections,
  spikeMax: spike.maxConnections,
  statsMax: stats.maxConnections,
};
```

Expect: `match: true` (or close — slight timing differences acceptable)

### Final Cleanup

No cleanup needed (anomaly detection tools are read-only).
