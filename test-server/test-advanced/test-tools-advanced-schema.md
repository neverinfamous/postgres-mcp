# Advanced Stress Test — postgres-mcp — schema Group

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
| `pg_create_schema(...)`                              | `pg.schema.createSchema(...)`                                  |
| `pg_drop_schema(...)`                                | `pg.schema.dropSchema(...)`                                    |
| `pg_create_view(...)`                                | `pg.schema.createView(...)`                                    |
| `pg_drop_view(...)`                                  | `pg.schema.dropView(...)`                                      |
| `pg_create_sequence(...)`                            | `pg.schema.createSequence(...)`                                |
| `pg_drop_sequence(...)`                              | `pg.schema.dropSequence(...)`                                  |
| `pg_list_sequences(...)`                             | `pg.schema.listSequences(...)`                                 |

**Key rules:**
- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls — create a schema in one call, query it in the next
- Group multiple related tests into a single code mode call when practical

## Test Database Schema

Refer to `test-database.sql` for the baseline. Operations here should focus on expanding upon it and ensuring schema boundaries are respected.

## Naming & Cleanup

- **Temporary schemas**: Prefix with `stress_schema_`
- **Temporary views**: Prefix with `stress_view_`
- **Temporary sequences**: Prefix with `stress_seq_`
- **Cleanup**: Attempt to remove all `stress_*` objects after testing. If DROP fails, note the leftover objects and move on.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `SCHEMA_NOT_FOUND`).

## Post-Test Procedures

1. Confirm cleanup of all `stress_*` objects.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements and 📦 Payload problems.
3. Update the changelog with any changes made.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass, not counting this testing prompt itself. Highlight the single most expensive code mode block.
5. Stop and briefly summarize the testing results.

---

## schema Group Advanced Tests

### schema Group Tools

1. pg_create_schema
2. pg_drop_schema
3. pg_create_view
4. pg_drop_view
5. pg_create_sequence
6. pg_drop_sequence
7. pg_execute_code (auto-added)

### Category 1: Boundary Values & Empty States

**1.1 Deep Dependency Cascades**
Create `stress_schema_cascade_test`. Create `table_1` inside it. Create `stress_view_1` relying on it.
1. `pg_drop_schema` without `cascade: true` → Expect proper `VALIDATION_ERROR` (dependent objects exist), not a crash.
2. `pg_drop_schema` with `cascade: true` → Assert dropping is successful and wipes cleanly.

**1.2 Sequence Boundary Testing**
3. `pg_create_sequence` with extreme bounds: `maxvalue: 3`, `increment: 2`. 
4. Attempt to cycle the sequence (e.g., via `pg_read_query` using `nextval`) 3 times to intentionally cause an exception limit breach.
5. Capture whether the adapter wraps the native sequence limit syntax error into a clean `VALIDATION_ERROR` or leaks the native PostgreSQL error.

### Category 2: State Pollution & Idempotency

**2.1 Idempotent View Replacements**
6. `pg_create_view` -> Create `stress_view_replace` using `SELECT 1 AS num`.
7. `pg_create_view` -> Attempt recreation on `stress_view_replace` using `SELECT 2 AS num` with `orReplace: false`. Expect `VALIDATION_ERROR` (already exists).
8. `pg_create_view` -> Recreate using `orReplace: true`. Expect success.

**2.2 Create-Drop-Recreate schema Cycles**
9. `pg_create_schema` -> `stress_schema_cycle`
10. `pg_drop_schema` -> `stress_schema_cycle` -> expect `{existed: true}`
11. `pg_drop_schema` -> `stress_schema_cycle` again with `ifExists: true` -> expect `{existed: false}` (should not throw).

### Category 3: Alias & Parameter Combinations

12. `pg_drop_schema` with `name` alias instead of `schema` (if applicable) -> Verify resolution.
13. `pg_create_sequence` with minimum parameters (just name) vs fully qualified parameters (`increment`, `start`, `maxvalue`). Validate defaults are correctly initialized.

### Category 4: Error Message Quality

14. `pg_drop_view` on `stress_nonexistent_view` without `ifExists` -> Assert `VALIDATION_ERROR` or `VIEW_NOT_FOUND`.
15. `pg_drop_schema` on `stress_nonexistent_schema` without `ifExists` -> Assert `SCHEMA_NOT_FOUND`.

### Category 5: Large Payload & Truncation Verification

**5.1 Sequence Metadata Payloads**
If sequences exist across many tables, generating lists can swell.
16. Code Mode script to dynamically generate 50 sequences inside `stress_schema_mass`.
17. Introspect sequences using `pg_list_sequences`. Ensure response is cleanly token-estimated and `totalCount` correctly identifies exact counts if truncated limits apply.

### Category 6: Code Mode Parity

**6.1 API Aliases vs Direct Calls**
Verify that a direct tool call simulation via JS provides parity to native outputs.
18. Execute `pg.schema.createSchema({ schema: "stress_schema_parity" })` and compare schema existence validation loops programmatically.

### Final Cleanup

Ensure all `stress_schema_*` and global `stress_*` sequences/views are dropped using explicit Code Mode execution drops.
