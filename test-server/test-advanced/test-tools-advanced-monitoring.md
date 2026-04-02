# Advanced Stress Test — postgres-mcp — monitoring Group

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
| `pg_database_size(...)`                              | `pg.monitoring.databaseSize(...)`                              |
| `pg_table_sizes(...)`                                | `pg.monitoring.tableSizes(...)`                                |
| `pg_capacity_planning(...)`                          | `pg.monitoring.capacityPlanning(...)`                          |
| `pg_active_connections(...)`                         | `pg.monitoring.activeConnections(...)`                         |
| `pg_connection_stats(...)`                           | `pg.monitoring.connectionStats(...)`                           |
| `pg_show_settings(...)`                              | `pg.monitoring.showSettings(...)`                              |
| `pg_alert_threshold_set(...)`                        | `pg.monitoring.alertThresholdSet(...)`                         |
| `pg_system_health(...)`                              | `pg.monitoring.systemHealth(...)`                              |

**Key rules:**
- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls
- Group multiple related tests into a single code mode call when practical

## Test Database Schema

Refer to `test-database.sql` for the baseline. Operations here focus on system-level analytics.

## Naming & Cleanup

- **Temporary tables**: Prefix with `stress_mon_`
- **Cleanup**: Attempt to remove all `stress_mon_*` objects after testing.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`).

## Post-Test Procedures

1. Confirm cleanup of all `stress_mon_*` objects.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements and 📦 Payload problems.
3. Update the changelog with any changes made.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass, not counting this testing prompt itself. Highlight the single most expensive code mode block.
5. Stop and briefly summarize the testing results.

---

## monitoring Group Advanced Tests

### monitoring Group Tools

1. pg_database_size
2. pg_table_sizes
3. pg_capacity_planning
4. pg_active_connections
5. pg_connection_stats
6. pg_show_settings
7. pg_alert_threshold_set
8. pg_system_health
9. pg_execute_code (auto-added)

### Category 1: Extreme Limits & Boundary Values

**1.1 Data Size Explosion Queries**
1. `pg_capacity_planning` across ALL tables (using `limit: 0` or massive bounded inputs) → verify the payload doesn't explode in token sizes. Ensure robust bounds parsing.
2. `pg_table_sizes` using wildcards matching `*` vs strict filters → verifying exact token bounds and performance impact.

**1.2 Invalid Thresholds**
3. `pg_alert_threshold_set` with invalid boundary metrics: negative percentages (e.g. `-50%`) or impossible values (`>100%`) for resource constraints → Expect a strongly typed `VALIDATION_ERROR`.
4. `pg_alert_threshold_set` with missing or blank string parameters.

### Category 2: State Pollution & Idempotency

**2.1 Alert Idempotency**
5. Setup the same `pg_alert_threshold_set` three times sequentially. Output must process cleanly without duplicates or primary key state violations in dynamic tracker tables (if any apply).
6. Request `pg_system_health` immediately following alert configurations and ensure thresholds reflect instantly and completely idempotently.

### Category 3: Alias & Parameter Combinations

7. Target `pg_show_settings` with regex `like: '%buffer%'` vs `pattern: '%buffer%'` to test aliasing logic for filtering.
8. Run `pg_active_connections` against specific non-existent target DB strings to isolate error responses.

### Category 4: Error Message Quality

9. Assess any system catalog lookups against restricted user permissions (e.g., intentionally requesting stats tied to internal Postgres metadata usually blocked by non-superusers). Verify adapter graceful wraps permission denied bounds (`AUTHORIZATION_ERROR` or similar).

### Category 5: Large Payload & Truncation Verification

**5.1 High Volume Health Dumps**
10. `pg_system_health` inherently hits many internal dynamic views. Monitor `metrics.tokenEstimate`. It must not exceed 4,000 tokens during worst-case outputs.
11. `pg_show_settings({ limit: 5 })` vs `pg_show_settings({ limit: 0 })`. Note the drastic token divergence and flag it if missing explicit size boundaries triggers unmanageable output.

### Category 6: Code Mode Parity

**6.1 API Validation**
12. Use Code Mode to dynamically fetch `pg_database_size()` and simultaneously evaluate raw `SELECT pg_database_size(current_database())` to confirm metric parsing integrity matches the raw DB output identically without parsing corruption.

### Final Cleanup

Cleanup all test-injected configurations if alert records persist.
