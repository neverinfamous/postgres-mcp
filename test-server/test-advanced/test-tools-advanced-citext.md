# Advanced Stress Test — postgres-mcp — citext Group

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

- **Temporary tables/schemas**: Prefix with `stress_citext_`
- **Cleanup**: Attempt to remove all `stress_citext_*` objects after testing.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `TABLE_NOT_FOUND`).

## Post-Test Procedures

1. Confirm cleanup of all `stress_citext_*` objects.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements and 📦 Payload problems.
3. Update the changelog with any changes made.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass.
5. Stop and briefly summarize the testing results.

---

## citext Group Advanced Tests

### Category 1: Boundary Values & Empty States

**1.1 Edge Case Strings**
1. Search lists utilizing strings exclusively containing special regex control values `(.*+?[)`.
2. Convert tables back to pure `TEXT` resolving structural impacts natively.

### Category 2: State Pollution & Idempotency

**2.1 Idempotent Conversions**
3. Perform `pg_citext_convert_column` consecutively on the same target. Handle NOOP cleanly without throwing type-already-exists errors.

### Category 3: Alias & Parameter Combinations

4. Default case insensitivity fallback parameters versus explicit constraints.

### Category 4: Error Message Quality

5. Attempt case conversion routines targeting non-existent database identifiers. Expect `COLUMN_NOT_FOUND`.

### Category 5: Large Payload & Truncation Verification

**5.1 High Volume Checks**
6. Introspect mass listings of `citext` usage footprints measuring token counts via `metrics.tokenEstimate` closely against defaults limitings.

### Category 6: Code Mode Parity

7. Mirror outputs directly to explicit Javascript mapping arrays matching exactly.

### Final Cleanup

Drop all `stress_citext_*` tables.
