# Advanced Stress Test — postgres-mcp — partman Group

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

| Direct Tool Call                                     | Code Mode Equivalent                                           |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `pg_partman_create_parent(...)`                      | `pg.partman.createParent(...)`                                 |
| `pg_partman_run_maintenance(...)`                    | `pg.partman.runMaintenance(...)`                               |

**Key rules:**
- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls
- Group multiple related tests into a single code mode call when practical

## Test Database Schema

Refer to `test-database.sql`. Testing partman requires ensuring the pg_partman extension is loaded (usually tested dynamically if it exists).

## Naming & Cleanup

- **Temporary tables/schemas**: Prefix with `stress_partman_`
- **Cleanup**: Attempt to remove all `stress_partman_*` objects after testing.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `TABLE_NOT_FOUND`).

## Post-Test Procedures

1. Confirm cleanup of all `stress_partman_*` objects.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements and 📦 Payload problems.
3. Update the changelog with any changes made.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass.
5. Stop and briefly summarize the testing results.

---

## partman Group Advanced Tests

### Category 1: Boundary Values & Empty States

**1.1 Edge Case Creation**
1. Create a `stress_partman_parent` table. Setup `pg_partman_create_parent` with an extremely unusual interval (e.g. `p_interval := '27 minutes'`).
2. Supply boundary control columns (e.g., passing a non-existent column name). Expect `VALIDATION_ERROR` rather than native syntax crash.

### Category 2: State Pollution & Idempotency

**2.1 Maintenance Cycle Collisions**
3. Call `pg_partman_run_maintenance` three times seamlessly on the same parent. Should safely NOOP without throwing state tracking violation crashes.

### Category 3: Alias & Parameter Combinations

4. Configure limits omitting the schema qualifier versus aggressively validating cross-schema configurations between `stress_partman_schema.xyz`.

### Category 4: Error Message Quality

5. Run `pg_partman_create_parent` on an environment where the extension doesn't exist. Ensure it produces a clean `EXTENSION_MISSING` adapter exception instead of raw DB failures.

### Category 5: Large Payload & Truncation Verification

**5.1 High Volume Maintenance Logging**
6. Perform maintenance affecting massive partitions, evaluate if returning affected row structures exceeds token bounds for `metrics.tokenEstimate`.

### Category 6: Code Mode Parity

7. Verify programmatic retrieval of partman configuration rules natively matches JS object parity inside the sandbox scope.

### Final Cleanup

Drop all `stress_partman_*` tables.
