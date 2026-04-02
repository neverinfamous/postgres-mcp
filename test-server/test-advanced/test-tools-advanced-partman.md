# Advanced Stress Test — postgres-mcp — partman Group

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
| `pg_partman_create_parent(...)`                      | `pg.partman.createParent(...)`                                 |
| `pg_partman_run_maintenance(...)`                    | `pg.partman.runMaintenance(...)`                               |
| `pg_partman_undo_partition(...)`                     | `pg.partman.undoPartition(...)`                                |
| `pg_*(...)`                                          | `pg.partman.*(...)`                                            |

**Key rules:**
- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls
- Group multiple related tests into a single code mode call when practical

## Naming & Cleanup

- **Temporary testing states**: Prefix testing structures with `stress_partman_`
- **Cleanup**: `pg_drop_table` on cleanly populated items.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `COLUMN_NOT_FOUND`, `TABLE_NOT_FOUND`, `EXTENSION_MISSING`).

## Post-Test Procedures

1. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in this prompt (test-tools-advanced-partman.md) and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
2. Update the changelog if there are any changes made (being careful not to create duplicate headers) and commit without pushing.
3. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass, not counting this testing prompt itself. Highlight the single most expensive code mode block.
4. Stop and briefly summarize the testing results and fixes, ensuring the total token count is prominently displayed.

---

## partman Group Advanced Tests

### partman Group Tools (10 + 1 code mode)

1. pg_partman_create_extension
2. pg_partman_create_parent
3. pg_partman_run_maintenance
4. pg_partman_show_partitions
5. pg_partman_show_config
6. pg_partman_check_default
7. pg_partman_partition_data
8. pg_partman_set_retention
9. pg_partman_undo_partition
10. pg_partman_analyze_partition_health
11. pg_execute_code (auto-added)

### Category 1: Boundary Values & Empty States

Test tools against extreme characters, non-applicable parameters, and zero-state topologies.

1. `pg_partman_create_parent` → Supply an intentionally invalid `interval` constraint natively: `interval: "14 lightyears"`. Expect a strictly formatted `VALIDATION_ERROR` or handled DB rejection rather than an unhandled internal type cast failure.
2. `pg_partman_set_retention` → Set `{keepTable: false, keepIndex: false}` and attempt to apply it to a purely numeric range ID table not bound by standard timestamp logic (if schema parsing enforces types).
3. `pg_partman_partition_data` → Supply a massive iteration constraint `batchSize: 999999` to invoke logic boundary logic natively.

### Category 2: State Pollution & Idempotency

Ensure tools execute safely when repeated identically multiple times.

4. `pg_partman_create_parent` → Call the parent creation command consecutively identically natively. Verify it intercepts the collision efficiently (`alreadyExists`) rather than corrupting the internal metadata mappings for the partman schema tracker.
5. `pg_partman_undo_partition` → Point to a table that *is not* a partitioned parent. Does it cleanly fail gracefully or attempt to run native unbind commands fatally?

### Category 3: Alias & Parameter Combinations

Test parametric fallback modes and configuration matrices.

6. `pg_partman_run_maintenance` → Test parameter omission: execute immediately with no arguments versus executing strictly focused via `{parentTable: "stress_partman_parent"}`. Validate behavior parity.
7. `pg_partman_show_partitions` → Validate query bounds mapping limits on `pg_partman_show_partitions({limit: 0})` versus `limit: 5`.

### Category 4: Error Message Quality

Ensure tools predictably return typed `VALIDATION_ERROR`, etc.

8. Target unmanaged partitions -> Attempt `pg_partman_show_config({table: "test_articles"})`. Ensure `TABLE_NOT_FOUND` wraps cleanly indicating the table is simply not tracked by partman.
9. Target non-existent table -> Attempt `pg_partman_show_config({table: "nonexistent_ghost_table"})`.
10. Environment Mock -> Manually drop the `pg_partman` extension directly using pure SQL within Code Mode. Then execute `pg_partman_analyze_partition_health`. Validate error returned is typed `EXTENSION_MISSING`.
11. Restore the extension via `pg_partman_create_extension()` directly afterwards.

### Category 5: Mathematical Edge Sets

Verify that complex native functions calculate topological tracking precisely.

12. `pg_partman_check_default` → After generating partitions legitimately, evaluate output accuracy natively. If a default table doesn't have overflow data, it usually returns `{hasData: false}` safely.

### Category 6: Extended Cross-Schema Formatting

13. Create a parent explicitly spanning an alternate schema: `stress_schema_alpha.partman_test`. Ensure that `createParent`, `showPartitions`, and `undoPartition` precisely honor the `schema.table` string bindings rather than throwing schema parsing bugs when split internally by the adapter.

### Category 7: Large Payload & Truncation Verification

Ensure sweeping reads cap context window exposure.

14. `pg_partman_analyze_partition_health` → Evaluate internal sizing parameters when executed on a database. Confirm no unbounded metadata loops exceed token limits natively (`metrics.tokenEstimate`).

### Final Cleanup

15. Native Execution -> Ensure any remaining partitions bound to `stress_partman_*` are accurately unbound natively, and the root tables are dropped.
