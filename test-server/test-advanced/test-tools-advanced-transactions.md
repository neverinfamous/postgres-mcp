# Advanced Stress Test — postgres-mcp — transactions Group

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

- **Temporary tables/schemas**: Prefix with `stress_tx_`
- **Cleanup**: Attempt to remove all `stress_tx_*` objects after testing.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `TRANSACTION_ERROR`).

## Post-Test Procedures

1. Confirm cleanup of all `stress_tx_*` objects.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements and 📦 Payload problems.
3. Update the changelog with any changes made.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass.
5. Stop and briefly summarize the testing results.

---

## transactions Group Advanced Tests

### Category 1: Boundary Values & Empty States

**1.1 Edge Case Creation**
1. Initiate a transaction, create a table `stress_tx_table`, run an illegal insert to deliberately abort it, then attempt to `pg_commit`. Assert `VALIDATION_ERROR` or `TRANSACTION_ERROR` reflecting the rollback nature.
2. Explicitly rollback an already committed transaction ID.

### Category 2: State Pollution & Idempotency

**2.1 Idempotent Rollbacks**
3. Create multiple nested tracking statements, roll back to a specific savepoint twice sequentially.

### Category 3: Alias & Parameter Combinations

4. Test `isolation_level` and `read_only` aliases during standard `begin` calls. 

### Category 4: Error Message Quality

5. Provide a completely invalid formatting ID to any transaction tracking parameter to test error handler parsing.

### Category 5: Large Payload & Truncation Verification

**5.1 Huge Transaction Sets**
6. Try creating massive savepoints recursively inside Code Mode (e.g. 50 inner loop saves). Ensure array outputs for active savepoints remain cleanly truncated.

### Category 6: Code Mode Parity

7. Verify transaction execution boundaries naturally wrap and rollback if an unhandled Javascript Error is explicitly thrown mid-script.

### Final Cleanup

Drop all `stress_tx_*` tables.
