# Advanced Stress Test — postgres-mcp — kcache Group

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
| `pg_kcache_query_stats(...)`                         | `pg.kcache.queryStats(...)`                                    |
| `pg_kcache_top_cpu(...)`                             | `pg.kcache.topCpu(...)`                                        |
| `pg_kcache_reset(...)`                               | `pg.kcache.reset(...)`                                         |
| `pg_*(...)`                                          | `pg.kcache.*(...)`                                             |

**Key rules:**
- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls
- Group multiple related tests into a single code mode call when practical

## Naming & Cleanup

- **Temporary testing states**: Avoid destructive queries natively during statistics gathering to maintain stable metrics.
- **Cleanup**: NA (telemetry tools are purely introspective).

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `EXTENSION_MISSING`).

## Post-Test Procedures

1. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in this prompt (test-tools-advanced-kcache.md) and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
2. Update the changelog if there are any changes made (being careful not to create duplicate headers) and commit without pushing.
3. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass, not counting this testing prompt itself. Highlight the single most expensive code mode block.
4. Stop and briefly summarize the testing results and fixes, ensuring the total token count is prominently displayed.

---

## kcache Group Advanced Tests

### kcache Group Tools (7 + 1 code mode)

1. pg_kcache_create_extension
2. pg_kcache_query_stats
3. pg_kcache_top_cpu
4. pg_kcache_top_io
5. pg_kcache_database_stats
6. pg_kcache_resource_analysis
7. pg_kcache_reset
8. pg_execute_code (auto-added)

### Category 1: Boundary Values & Empty States

Test tools against extreme characters, non-applicable parameters, and zero-state topologies.

1. `pg_kcache_query_stats` → Zero/Negative constraints check: Invoke with `{limit: 0}` and `{limit: -5}`. Validate `VALIDATION_ERROR` prevents raw query syntax errors.
2. `pg_kcache_top_io` → Empty string check: Invoke with `{type: ""}`. Expect typed failure.
3. `pg_kcache_top_cpu` → Fetch with an exact constraint of `{limit: 1}` to verify array unwrapping and limits logic behaves cleanly on singular row retrieval.
4. `pg_kcache_query_stats` → Extreme upper bound limit check: `{limit: 999999}`. Verify query returns cleanly or applies internal cap properly natively without locking.

### Category 2: State Pollution & Idempotency

Ensure tools execute safely when repeated identically multiple times.

5. `pg_kcache_reset` → Call reset three times consecutively. Verify clear `{success: true}` (or environment restriction error cleanly formatted) natively across all calls with zero transaction conflicts.
6. `pg_kcache_create_extension` → Create the extension natively. Call it again. Verify clean `alreadyInstalled` or generic success block.

### Category 3: Alias & Parameter Combinations

Test parametric fallback modes and configuration matrices.

7. `pg_kcache_top_io` → Enumerate explicit type filters: Execute with `{type: "read"}`, `{type: "write"}`, and `{type: "both"}` to verify SQL generation correctly isolates those disk mechanisms.
8. `pg_kcache_top_io` → Invalid enum execution: `{type: "network"}`. Expect clean `VALIDATION_ERROR`.
9. `pg_kcache_resource_analysis` → Attempt to supply irrelevant arguments (if mapping allows). Identify if schema correctly strips or strictly enforces inputs cleanly.

### Category 4: Error Message Quality

Ensure tools predictably return typed `VALIDATION_ERROR`, etc.

10. Environment Mock -> Manually drop the `pg_stat_kcache` extension wrapper directly using pure SQL within Code Mode. Then execute `pg_kcache_database_stats`. Validate that the error returned is a gracefully typed `EXTENSION_MISSING` error instead of a catastrophic relation-not-found unhandled exception.
11. Restore the extension via `pg_kcache_create_extension()` directly afterwards.
12. Attempt to pull `pg_kcache_query_stats` using user identifiers pointing to a non-existent role, checking if it generates clean warnings (if supported by parameters) or valid empty sets.

### Category 5: Operational Granularity

Verify that caching hooks capture multi-step queries accurately within the same sandbox environment.

13. Generate 5 unique complex JOIN operations natively in Code Mode spanning `test_orders` and `test_products`.
14. Immediately pull `pg_kcache_top_cpu` and `pg_kcache_top_io` verifying that the current transaction context is updating those statistics reliably (system metrics often delay; test observational lag characteristics securely).

### Category 6: Large Payload & Truncation Verification

Ensure sweeping reads cap context window exposure.

15. `pg_kcache_query_stats` → If limit limits are stripped, measure total `metrics.tokenEstimate`. On high-volume databases, raw statistic arrays can be massive. Does the limit logic enforce a strict boundary natively if the user passes unbounded defaults? (A limit MUST ideally be enforced at the adapter layer).

### Category 7: Code Mode Parity 

16. Validations -> Compare the exact property outputs of `pg.kcache.topCpu()` inside JS Code Mode to ensure integer formatting (especially `BIGINT` conversions often used for disk bytes) maintains precise JS numerical structures without `NaN` or un-serializable `BigInt` crash leaks.

### Final Cleanup

No object state cleanup required for KCache.
