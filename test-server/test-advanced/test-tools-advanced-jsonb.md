# Advanced Stress Test — postgres-mcp — jsonb Group

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
| `pg_jsonb_extract(...)`                              | `pg.jsonb.extract(...)`                                        |
| `pg_jsonb_set(...)`                                  | `pg.jsonb.set(...)`                                            |
| `pg_jsonb_insert(...)`                               | `pg.jsonb.insert(...)`                                         |
| `pg_jsonb_delete(...)`                               | `pg.jsonb.delete(...)`                                         |
| `pg_jsonb_contains(...)`                             | `pg.jsonb.contains(...)`                                       |
| `pg_jsonb_path_query(...)`                           | `pg.jsonb.pathQuery(...)`                                      |
| `pg_jsonb_normalize(...)`                            | `pg.jsonb.normalize(...)`                                      |

**Key rules:**
- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls
- Group multiple related tests into a single code mode call when practical

## Test Database Schema

Refer to `test-database.sql`. `test_jsonb_docs` is specifically designed for this group.

## Naming & Cleanup

- **Temporary tables/schemas**: Prefix with `stress_jsonb_`
- **Cleanup**: Attempt to remove all `stress_jsonb_*` objects after testing.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `TABLE_NOT_FOUND`).

## Post-Test Procedures

1. Confirm cleanup of all `stress_jsonb_*` objects.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements and 📦 Payload problems.
3. Update the changelog with any changes made.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass, not counting this testing prompt itself. Highlight the single most expensive code mode block.
5. Stop and briefly summarize the testing results.

---

## jsonb Group Advanced Tests

### Category 1: Boundary Values & Empty States

**1.1 Deep JSONB Path Edge Cases**
1. Seed `stress_jsonb_test` with a 15-level deeply nested JSON document.
2. Test `pg_jsonb_extract` targeting `level1.level2...level15`.
3. Try extracting a path that doesn't exist `{path: "level1.wrong"}`. Expect empty array or cleanly formatted validation handling.

**1.2 Massive Array Extractions**
4. Insert a JSON array with 1,000 sub-objects.
5. Test `pg_jsonb_path_query` using standard JSON Path parsing to filter out exactly 50 objects.
6. Trigger out-of-order array bound errors using `.delete()` on `index: 999999`.

### Category 2: State Pollution & Idempotency

**2.1 Idempotent Inserts / Upserts**
7. Test `pg_jsonb_insert` overriding an existing key vs inserting a missing key. Ensure it operates reliably in sequence.
8. Test `pg_jsonb_delete` on the same key twice consecutively. It should logically execute successfully without throwing.

### Category 3: Alias & Parameter Combinations

9. Validate `pg_jsonb_normalize` handling standalone JSON strings vs Table-centric row operations. Use `JSON.stringify({...})` passing parameters explicitly.

### Category 4: Error Message Quality

10. Send maliciously formatted JSON blobs `{ value: "{broken json," }` into setter functions. Expect adapter wrapped `VALIDATION_ERROR` intercepting syntax failures.

### Category 5: Large Payload & Truncation Verification

**5.1 Size Limitations**
11. Perform a `pg_jsonb_path_query` returning 10MB of JSON text dynamically inside the sandbox. Trace `metrics.tokenEstimate`. Implement safeguards if it completely exhausts buffer without throwing an intentional size bound failure.

### Category 6: Code Mode Parity

**6.1 JSON Serialization Parity Checks**
12. Ensure JSON returned by `pg_jsonb_extract` resolves properly against `typeof obj === 'object'` instead of double-escaped strings via Code Mode reflection scripts.

### Final Cleanup

Drop all `stress_jsonb_*` tables.
