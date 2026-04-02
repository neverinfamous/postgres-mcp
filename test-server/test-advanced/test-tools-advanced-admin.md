# Advanced Stress Test — postgres-mcp — admin Group

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

- **Temporary tables/schemas**: Prefix with `stress_admin_`
- **Cleanup**: Attempt to remove all `stress_admin_*` objects after testing.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `TABLE_NOT_FOUND`).

## Post-Test Procedures

1. Confirm cleanup of all `stress_admin_*` objects.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements and 📦 Payload problems.
3. Update the changelog with any changes made.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass.
5. Stop and briefly summarize the testing results.

---

## admin Group Advanced Tests

### Category 1: Boundary Values & Empty States

**1.1 Edge Case Vacuum**
1. Test `pg_vacuum` on explicit missing table configurations to assert clean boundary handling vs raw syntax errors.
2. Run log analytics over extremely long timescales targeting zero rows.

### Category 2: State Pollution & Idempotency

**2.1 Idempotent Sweeps**
3. Run explicit `pg_analyze` routines identically three consecutive times on `test_orders`. State tracking should absorb duplicate execution correctly.

### Category 3: Alias & Parameter Combinations

4. Configure verbose output variables or missing schemas on administrative calls and track defaults.

### Category 4: Error Message Quality

5. Attempt administrative kills or cancels on negative PIDs `pid: -5`. Ensure `VALIDATION_ERROR` prevents DB propagation.

### Category 5: Large Payload & Truncation Verification

**5.1 High Volume Admin Drops**
6. Force generate deep backend diagnostics. Assess token estimates mapping and implement `limit` triggers natively for log streaming.

### Category 6: Code Mode Parity

7. Ensure dynamic JS parsing natively identifies vacuum states from direct queries vs `pg.admin...` APIs.

### Final Cleanup

Drop all `stress_admin_*` tables.
