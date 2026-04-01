# Advanced Stress Test — postgres-mcp — schema Group

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- All changes **MUST** be consistent with other postgres-mcp tools and `code-map.md`.
- Do not do anything other than these tests.
- Please let me handle Lint, typecheck, vitest, and playwright. You cannot restart the server in antigravity as the cache has to be refreshed manually.

## Code Mode Execution

All tests should be executed via `pg_execute_code` code mode. Tests are written in direct tool call syntax for readability — translate to code mode:

| Direct Tool Call                                     | Code Mode Equivalent                                           |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `pg_create_schema(...)`                              | `pg.schema.createSchema(...)`                                  |
| `pg_create_view(...)`                                | `pg.schema.createView(...)`                                    |
| `pg_create_sequence(...)`                            | `pg.schema.createSequence(...)`                                |
| `pg_drop_schema(...)`                                | `pg.schema.dropSchema(...)`                                    |
| `...`                                                | `...`                                                          |

**Key rules:**

- Use `pg.<group>.help()` to discover method names and parameters for each group
- Group multiple related tests into a single code mode call when practical
- State **persists** across `pg_execute_code` calls

## Naming & Cleanup

- **Temporary tables**: Prefix with `stress_`
- **Temporary schemas**: Prefix with `stress_schema_`
- **Cleanup**: Attempt to remove all `stress_*` objects after testing. Drop schemas with `CASCADE`.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response. **You MUST monitor `metrics.tokenEstimate` for every operation**.
- ✅ Confirmed: Edge case handled correctly

## schema Group Advanced Tests

### Category 1: Deep Nesting & Cascades

1. `pg_create_schema` -> Generate `stress_schema_cascade_test`. Create `stress_table_1` inside the schema, and a view `stress_view_1` relying on it.
2. `pg_drop_schema` without `cascade: true` → Expect proper dependency `VALIDATION_ERROR` due to table/view existing.
3. `pg_drop_schema` with `cascade: true` → Assert dropping is successful and cleanly wipes dependencies without orphaned schemas.

### Category 2: Sequence Boundary Conditions

4. `pg_create_sequence` -> Set bounds parameters to `maxvalue: 5`, `increment: 2`. Run queries using the sequence until it exceeds `maxvalue` boundary.
5. Capture structured P154 error output when sequence exhaustion natively throws postgres syntax errors. Let the handler wrap it.

### Final Cleanup

Confirm any temporary state is cleaned up.
