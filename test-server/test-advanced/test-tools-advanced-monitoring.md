# Advanced Stress Test — postgres-mcp — monitoring Group

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- All changes **MUST** be consistent with other postgres-mcp tools and `code-map.md`.
- Do not do anything other than these tests.

## Code Mode Execution

All tests should be executed via `pg_execute_code` code mode. Tests are written in direct tool call syntax for readability — translate to code mode:

| Direct Tool Call                                     | Code Mode Equivalent                                           |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `pg_database_size(...)`                              | `pg.monitoring.databaseSize(...)`                              |
| `pg_table_sizes(...)`                                | `pg.monitoring.tableSizes(...)`                                |
| `pg_capacity_planning(...)`                          | `pg.monitoring.capacityPlanning(...)`                          |
| `...`                                                | `...`                                                          |

**Key rules:**

- Use `pg.<group>.help()` to discover method names and parameters for each group
- Group multiple related tests into a single code mode call when practical

## Naming & Cleanup

- **Temporary tables**: Prefix with `stress_` (e.g., `stress_empty_table`)
- **Cleanup**: Attempt to remove all `stress_*` objects after testing.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**.
- ✅ Confirmed: Edge case handled correctly

### Error Code Consistency

Flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code.

## Post-Test Procedures

1. Confirm cleanup of all `stress_*` object.
2. **Fix EVERY finding**.
3. Update the changelog with any changes made.
4. **Token Audit**: Sum the `metrics.tokenEstimate` and report the **Total Tokens Used**.
5. Stop and briefly summarize the testing results and fixes.

---

## monitoring Group Advanced Tests

### Category 1: Extreme Limits & Payload Boundaries

1. `pg_capacity_planning` across all tables → Verify payload doesn't explode in size; enforce limits if necessary.
2. `pg_table_sizes` on a massive wildcard matching `*` vs `stress_*` limits checking token bounds.
3. `pg_alert_threshold_set` with invalid boundaries (e.g., negative percentage or >100) → Expect valid `VALIDATION_ERROR`.

### Final Cleanup

Confirm any temporary state is cleaned up.
