# Advanced Stress Test — postgres-mcp — kcache Group

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run any other test files.
- All changes **MUST** be consistent with other postgres-mcp tools and `code-map.md`.
- Do not do anything other than these tests.
- Please let me handle Lint, typecheck, vitest, and playwright. You cannot restart the server in antigravity as the cache has to be refreshed manually.

## Code Mode Execution

All tests should be executed via `pg_execute_code` code mode.

**Key rules:**
- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls
- Group multiple related tests into a single code mode call when practical

## Naming & Cleanup

- **Temporary tables/schemas**: Prefix with `stress_kcache_`
- **Cleanup**: Attempt to remove all `stress_kcache_*` objects after testing.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `TABLE_NOT_FOUND`).

## Post-Test Procedures

1. Confirm cleanup of all `stress_kcache_*` objects.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements and 📦 Payload problems.
3. Update the changelog with any changes made.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass.
5. Stop and briefly summarize the testing results.

---

## kcache Group Advanced Tests

### Category 1: Boundary Values & Empty States

**1.1 Edge Case Limits**
1. Test query bounds enforcing rigid structural output boundaries. Ensure missing extensions trigger `EXTENSION_MISSING` validations gracefully natively handling the logic envelope limits.

### Category 2: State Pollution & Idempotency

**2.1 Idempotent Resets**
2. Consecutive runs triggering stats cache clearing should map without race condition exceptions natively inside the handler core architecture.

### Category 3: Alias & Parameter Combinations

3. Target specific limits or `limit: 0` constraints observing boundary parameter logic behaviors securely executing natively.

### Category 4: Error Message Quality

4. Ensure natively wrapped syntax limits prevent data leaks providing accurate adapter payloads mapping strictly.

### Category 5: Large Payload & Truncation Verification

**5.1 High Volume Logs**
5. Fetch extreme stats bounds ensuring output limits trace explicitly returning cleanly bound token measurements via `metrics.tokenEstimate`.

### Category 6: Code Mode Parity

6. Monitor cache query performance outputs returning mapping payload sets identically inside JS sandbox arrays precisely tracking direct payloads.

### Final Cleanup

Drop all `stress_kcache_*` tables.
