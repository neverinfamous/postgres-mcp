# Advanced Stress Test — postgres-mcp — performance Group

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run any other test files.
- All changes **MUST** be consistent with other postgres-mcp tools and `code-map.md`.
- Do not do anything other than these tests.
- Please let me handle Lint, typecheck, vitest, and playwright. You cannot restart the server in antigravity as the cache has to be refreshed manually.

## Code Mode Execution

All tests should be executed via `pg_execute_code` code mode. Tests are written in direct tool call syntax for readability — translate to code mode:

| Direct Tool Call                                     | Code Mode Equivalent                                           |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `pg_anomaly_detection(...)`                          | `pg.performance.anomalyDetection(...)`                         |
| `pg_table_stats(...)`                                | `pg.performance.tableStats(...)`                               |
| `pg_index_stats(...)`                                | `pg.performance.indexStats(...)`                               |
| `pg_explain(...)`                                    | `pg.performance.explain(...)`                                  |

**Key rules:**
- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls
- Group multiple related tests into a single code mode call when practical

## Test Database Schema

Refer to `test-database.sql`. `test_products` and `test_orders` are useful for index stats.

## Naming & Cleanup

- **Temporary tables/schemas**: Prefix with `stress_perf_`
- **Cleanup**: Attempt to remove all `stress_perf_*` objects after testing.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `TABLE_NOT_FOUND`).

## Post-Test Procedures

1. Confirm cleanup of all `stress_perf_*` objects.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements and 📦 Payload problems.
3. Update the changelog with any changes made.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass, not counting this testing prompt itself. Highlight the single most expensive code mode block.
5. Stop and briefly summarize the testing results.

---

## performance Group Advanced Tests

### Category 1: Boundary Values & Empty States

**1.1 Deep Explain Execution Boundaries**
1. Run `pg_explain` with an extremely complex nested query (e.g., joining 4 system views to test parsing bounds).
2. Run `pg_explain` on a query targeting a completely missing table. Ensure it wraps native syntax errors into a `VALIDATION_ERROR`.
3. Try passing raw syntax errors into `pg_explain` (e.g., "SELECT * FROMM test_products") to verify raw injection safety.

**1.2 Anomaly Bounds**
4. Run `pg_anomaly_detection` with boundary bounds parameters (`threshold: -1`, `limit: 0`). Assert validation rejections.

### Category 2: State Pollution & Idempotency

**2.1 Idempotent Statistics Tracking**
5. Fetch `pg_table_stats` and `pg_index_stats` immediately after performing 5 sequential updates inside a code mode session. Verify stats refresh appropriately across the sandbox barrier, ensuring cache/transaction consistency works globally.

### Category 3: Alias & Parameter Combinations

6. Test `pg_anomaly_detection` default vs verbose outputs to confirm parameters cascade correctly through the handler.
7. Test `pg_index_stats` with fully qualified schema parameters `schema: "public"` vs default resolution.

### Category 4: Error Message Quality

8. Call `pg_table_stats` targeting `table: stress_nonexistent`. Ensure explicit `TABLE_NOT_FOUND` wraps the response.

### Category 5: Large Payload & Truncation Verification

**5.1 High Volume Stats Exploitation**
9. Use `pg_table_stats` across the entire `public` schema (`limit: 0` vs `limit: 10`). Trace `metrics.tokenEstimate` to verify `limit: 0` behaves predictably and `limit: 10` enforces `.truncated: true` successfully.

### Category 6: Code Mode Parity

**6.1 API Validation**
10. Programmatically resolve `pg_explain` Code Mode outputs against raw `EXPLAIN (FORMAT JSON)` payload mapping logic within the JS sandbox.

### Final Cleanup

Ensure all testing metrics and objects are purged.
