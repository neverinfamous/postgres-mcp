# Advanced Stress Test — postgres-mcp — performance Group

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run any other test files.
- All changes **MUST** be consistent with other postgres-mcp tools and `code-map.md`.
- Do not do anything other than these tests. Ignore distractions in terminal.
- Please let me handle Lint, typecheck, vitest, and playwright. You cannot restart the server in antigravity as the cache has to be refreshed manually.

## Code Mode Execution

All tests should be executed via `pg_execute_code` code mode. Tests are written in direct tool call syntax for readability — translate to code mode:

| Direct Tool Call                                     | Code Mode Equivalent                                           |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `pg_anomaly_detection(...)`                          | `pg.performance.anomalyDetection(...)`                         |
| `pg_table_stats(...)`                                | `pg.performance.tableStats(...)`                               |
| `pg_explain_analyze(...)`                            | `pg.performance.explainAnalyze(...)`                           |
| `pg_query_plan_compare(...)`                         | `pg.performance.queryPlanCompare(...)`                         |
| `pg_*(...)`                                          | `pg.performance.*(...)`                                        |

**Key rules:**
- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls
- Group multiple related tests into a single code mode call when practical

## Naming & Cleanup

- **Temporary testing states**: Prefix testing structures with `stress_perf_`
- **Cleanup**: `pg_drop_table` on cleanly populated items.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `COLUMN_NOT_FOUND`, `TABLE_NOT_FOUND`, `EXTENSION_MISSING`).

## Post-Test Procedures

1. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in this prompt (test-tools-advanced-performance.md) and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
2. Update the changelog if there are any changes made (being careful not to create duplicate headers) and commit without pushing.
3. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass, not counting this testing prompt itself. Highlight the single most expensive code mode block.
4. Stop and briefly summarize the testing results and fixes, ensuring the total token count is prominently displayed.

---

## performance Group Advanced Tests

### performance Group Tools (24 + 1 code mode)

1. `pg_explain`
2. `pg_explain_analyze`
3. `pg_explain_buffers`
4. `pg_index_stats`
5. `pg_table_stats`
6. `pg_stat_statements`
7. `pg_stat_activity`
8. `pg_locks`
9. `pg_bloat_check`
10. `pg_cache_hit_ratio`
11. `pg_seq_scan_tables`
12. `pg_index_recommendations`
13. `pg_query_plan_compare`
14. `pg_performance_baseline`
15. `pg_connection_pool_optimize`
16. `pg_partition_strategy_suggest`
17. `pg_unused_indexes`
18. `pg_duplicate_indexes`
19. `pg_vacuum_stats`
20. `pg_query_plan_stats`
21. `pg_diagnose_database_performance`
22. `pg_detect_query_anomalies`
23. `pg_detect_bloat_risk`
24. `pg_detect_connection_spike`
25. `pg_execute_code` (auto-added)

### Category 1: Boundary Values & Empty States

Test tools against extreme characters, non-applicable parameters, and zero-state topologies.

1. `pg_seq_scan_tables` → Pass `minScans: 999999999`. Ensure boundary logic natively returns an empty set mapping gracefully without integer casting overflows inside the engine.
2. `pg_explain_analyze` → Pass a wildly malformed query string like `sql: "SELECT * FROMM _WHERE x = ("`. Validate formatting returns typing `VALIDATION_ERROR` seamlessly.
3. `pg_partition_strategy_suggest` → Call on a completely empty table definition natively and assess zero-state calculations against statistical sizing bounds.
4. `pg_detect_bloat_risk` → Pass `minRows: -100` natively. Validate negative parameter bounds correctly throw handler validations instead of executing unmapped schema faults.
5. `pg_explain` → Pass a massive deeply nested `UNION ALL` string (with at least 6 logic blocks) into code mode to ensure IPC mapping limits do not truncate the underlying JS processing capability internally.

### Category 2: State Pollution & Idempotency

Ensure tools execute safely when repeated identically multiple times.

6. `pg_performance_baseline` → Generate baselines consecutively natively multiple times. Determine if output caching or DB locks create race conditions across simultaneous statistical fetches.
7. `pg_query_plan_compare` → Compare identical queries natively in code mode (`sqlA: "SELECT 1"`, `sqlB: "SELECT 1"`). Identify if baseline tracking handles diff equivalencies dynamically.

### Category 3: Alias & Parameter Combinations

Test parametric fallback modes and configuration matrices.

8. `pg_index_recommendations` → Pass the `schema`, `table`, and custom `thresholds` limits simultaneously. Validate Zod parsing correctly cascades these bindings natively into the engine processor.
9. `pg_vacuum_stats` → Compare behavior of explicitly setting `{table: "stress_perf_test"}` versus omitting it for the global sweep array map natively.
10. `pg_detect_query_anomalies` → Set extremely volatile configurations `threshold: 0.1` and `minCalls: 1`. Validate payload returns properly unspooled or filters down correctly via internal bounds.

### Category 4: Error Message Quality

Ensure tools predictably return typed `VALIDATION_ERROR`, etc.

11. `pg_table_stats` → Target `{table: "fake_ghost_table"}` natively. Assert rigorous propagation of `TABLE_NOT_FOUND` exceptions directly.
12. `pg_index_stats` → Pass `{schema: "non_existent_void"}`. Assess if the execution handles mapping errors strictly (`SCHEMA_NOT_FOUND`) natively.
13. `pg_query_plan_compare` → Attempt to compare a valid query against a structurally non-parseable query (`sqlB: "DELETE FROM * WHERE"`). Assess which format handler maps the underlying execution exception.

### Category 5: Extensions & Graceful Degradation Testing

14. `pg_diagnose_database_performance` → Validate global execution bounds natively. Ensure that if pg_stat_statements is somehow limited, the diagnostic engine emits `overallStatus: "warning"` or degraded health properties rather than violently crashing.
15. `pg_stat_statements` → Request stats using `limit: 5`. Assess `metrics.tokenEstimate` natively across large queries versus explicit bounds mappings.

### Category 6: Extended Cross-Schema Formatting

16. `pg_explain_buffers` → Verify the code mode handler accepts parameterized inputs native formatting schemas cleanly (e.g., passing explicit values into positional mappings via parameter bindings natively without coercion faults).

### Category 7: Large Payload & Truncation Verification

Ensure sweeping reads cap context window exposure.

17. `pg_locks` → Track active locks safely across concurrent environment setups natively. Ensure return map binds and truncates `limit` values strictly to prevent memory extraction payloads internally if exceeding contextual scope natively (`metrics.tokenEstimate`).
18. `pg_stat_activity` → Fetch all system processes natively using default mappings. Examine output JSON size natively if bounded bounds protect downstream limits efficiently natively.

### Final Cleanup

19. Native Execution -> Drop any experimental items created solely to trigger specific path faults natively within the `stress_perf_*` space securely.
