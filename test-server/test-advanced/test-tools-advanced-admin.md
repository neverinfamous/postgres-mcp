# Advanced Stress Test — postgres-mcp — admin Group

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
| `pg_vacuum(...)`                                     | `pg.admin.vacuum(...)`                                         |
| `pg_analyze(...)`                                    | `pg.admin.analyze(...)`                                        |
| `pg_reindex(...)`                                    | `pg.admin.reindex(...)`                                        |
| `pg_set_config(...)`                                 | `pg.admin.setConfig(...)`                                      |
| `pg_*(...)`                                          | `pg.admin.*(...)`                                              |

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

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `TABLE_NOT_FOUND`, `PROCESS_NOT_FOUND`).

## Post-Test Procedures

1. Confirm cleanup of all `stress_admin_*` objects.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in this prompt (test-tools-advanced-admin.md) and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
3. Update the changelog if there are any changes made (being careful not to create duplicate headers) and commit without pushing.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass, not counting this testing prompt itself. Highlight the single most expensive code mode block.
5. Stop and briefly summarize the testing results and fixes, ensuring the total token count is prominently displayed.

---

## admin Group Advanced Tests

### admin Group Tools (11 + 1 code mode)

1. pg_vacuum
2. pg_vacuum_analyze
3. pg_analyze
4. pg_reindex
5. pg_terminate_backend
6. pg_cancel_backend
7. pg_reload_conf
8. pg_set_config
9. pg_reset_stats
10. pg_cluster
11. pg_append_insight
12. pg_execute_code (auto-added)

### Category 1: Boundary Values & Empty States

Test admin tools against empty, deleted, and anomalous states.

1. `pg_analyze` → Test on an entirely empty table.
2. `pg_vacuum` → Insert 50 rows into a temporary table, then delete them all. Run `pg_vacuum` and verify it executes without error.
3. `pg_vacuum` → Run on a table with 0 rows (never inserted into).
4. `pg_set_config` → Use an empty string for the value `{name: "work_mem", value: ""}`. Expect structured error rather than crashed session.
5. Process Kills → Test `pg_cancel_backend` and `pg_terminate_backend` with anomalous PIDs: `0`, `-1`, and `2147483647` (Max Int). Ensure `VALIDATION_ERROR` or clean `PROCESS_NOT_FOUND` prevents propagation.

### Category 2: State Pollution & Idempotency

Ensure administrative tools execute safely multiple times.

6. `pg_analyze` → Run explicitly three consecutive times on `test_orders`.
7. `pg_vacuum_analyze` → Run twice consecutively on the same table.
8. `pg_set_config` → Set `statement_timeout` to `30000`, then immediately set it to `30000` again.
9. `pg_append_insight` → Call with identical text twice: `pg_append_insight({text: "Idempotent insight check"})`. Verify the `insightCount` increments both times (insights are additive telemetry).
10. `pg_cluster` → Cluster a table using a specific index. Then cluster it again. Verify idempotency.

### Category 3: Alias & Parameter Combinations

Test the full matrix of administrative options.

**3.1 Vacuum Options Matrix**
11. `pg_vacuum` → Use combinations (if supported by schema parameters): `{table: "...", full: true, analyze: true}`. Note: `FULL` cannot be run in a transaction block. Since Code Mode runs each script in an implicit block normally unless managed by the handler, verify how `pg_vacuum` handles `FULL` mode. (Does it seamlessly drop transaction wrappers, or error politely?)
12. `pg_vacuum` → Extract other parameters: `{skipLocked: true, truncate: false}` (verify accepted/mapped correctly).

**3.2 Reindex Target Types**
13. `pg_reindex` → `{target: "index", name: "idx_orders_status"}`
14. `pg_reindex` → `{target: "table", name: "test_products"}`
15. `pg_reindex` → `{target: "schema", name: "public"}` (check token response size, should be modest).
16. `pg_reindex` → `{target: "system", name: "postgres"}` (if permitted by perms, otherwise graceful error).

**3.3 Analyze Options**
17. `pg_analyze` → `{verbose: true, skipLocked: true}`. Verify output response contains verbose telemetry if surfaced.

### Category 4: Error Message Quality

Ensure tools predictably return typed `VALIDATION_ERROR`, `TABLE_NOT_FOUND`, etc., instead of raw PostgreSQL errors.

18. `pg_reindex` → `{target: "table", name: "nonexistent_table_xyz"}`. Must be P154 compliant (`TABLE_NOT_FOUND`).
19. `pg_reindex` → `{target: "index", name: "nonexistent_idx_xyz"}`. Must return structured `{success: false}`.
20. `pg_set_config` → Test setting an unrecognized Postgres configuration parameter `{name: "fake_mem_limit_xyz", value: "1MB"}`. Verify structured error response.
21. `pg_cluster` → Try to cluster a table using a non-existent index name.
22. `pg_cluster` → Try to cluster `test_products` (which has no indexes). Expect structured error explaining an index is required for clustering.

### Category 5: Cross-Schema Operations

Verify administrative tasks function across schema boundaries.

23. `pg_analyze` → `{table: "test_schema.order_seq"}` (Sequence analysis).
24. `pg_vacuum` → Create `stress_admin_schema` and `stress_admin_schema.my_table`. Vacuum `{schema: "stress_admin_schema", table: "my_table"}`.
25. `pg_reindex` → Reindex `{target: "schema", name: "test_schema"}`.
26. `pg_cluster` → Create an index on `stress_admin_schema.my_table` and cluster it.

### Category 6: System & Global Admin Tools

Test server-wide operations safely.

27. `pg_reload_conf` → Execute tool. Verify it returns `{success: true}` (requires superuser, may return `{success: false}` cleanly on RDS/some hosts — verify structured response).
28. `pg_reset_stats` → Execute tool. Returns `{success: true}` or clean permission error.

### Category 7: Large Payload & Truncation

29. `pg_vacuum` / `pg_analyze` → Check if verbose diagnostic text is returned natively. If yes, verify it does not completely consume the context window.
30. `pg_append_insight` → Push extremely large insight text (`10,000` characters). Verify truncation or validation rejection protects memory telemetry.

### Category 8: Code Mode Parity

31. Confirm `pg.admin.help()` correctly lists all 11 administrative APIs.
32. Confirm `pg.admin.vacuum({ ... })` handles parameter translation flawlessly within javascript, especially boolean flags like `analyze: true`.

### Final Cleanup

Drop all `stress_admin_*` objects and schemas.
