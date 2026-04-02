# Advanced Stress Test — postgres-mcp — cron Group

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
| `pg_cron_schedule(...)`                              | `pg.cron.schedule(...)`                                        |
| `pg_cron_unschedule(...)`                            | `pg.cron.unschedule(...)`                                      |
| `pg_cron_alter_job(...)`                             | `pg.cron.alterJob(...)`                                        |
| `pg_*(...)`                                          | `pg.cron.*(...)`                                               |

**Key rules:**
- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls
- Group multiple related tests into a single code mode call when practical

## Naming & Cleanup

- **Jobs**: Prefix with `stress_cron_`
- **Cleanup**: Attempt to `unschedule` all `stress_cron_*` jobs after testing.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `JOB_NOT_FOUND`, `EXTENSION_MISSING`).

## Post-Test Procedures

1. Confirm cleanup of all `stress_cron_*` jobs.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in this prompt (test-tools-advanced-cron.md) and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
3. Update the changelog if there are any changes made (being careful not to create duplicate headers) and commit without pushing.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass, not counting this testing prompt itself. Highlight the single most expensive code mode block.
5. Stop and briefly summarize the testing results and fixes, ensuring the total token count is prominently displayed.

---

## cron Group Advanced Tests

### cron Group Tools (8 + 1 code mode)

1. pg_cron_create_extension
2. pg_cron_schedule
3. pg_cron_schedule_in_database
4. pg_cron_unschedule
5. pg_cron_alter_job
6. pg_cron_list_jobs
7. pg_cron_job_run_details
8. pg_cron_cleanup_history
9. pg_execute_code (auto-added)

### Category 1: Boundary Values & Empty States

Test tools against extreme characters, non-applicable parameters, and zero-state topologies.

1. `pg_cron_schedule` → Attempt to schedule using intentionally invalid or boundary crontab strings: `* * * * 9` (Invalid DoW) or `60 * * * *` (Invalid Minute). Verify `VALIDATION_ERROR` prevents raw PG crash.
2. `pg_cron_unschedule` → Target a non-existent `jobId: 999999999`. Assert typed `JOB_NOT_FOUND`.
3. `pg_cron_unschedule` → Target a non-existent `jobName: "invalid_ghost_job"`. Assert typed `JOB_NOT_FOUND`.
4. `pg_cron_cleanup_history` → Execute with extreme boundary days: `{days: 0}`, `{days: -1}`, and `{days: 999999}`. Verify graceful normalization or specific handler exceptions without crashing.
5. `pg_cron_alter_job` → Try to alter a non-existent task. Expect clean `JOB_NOT_FOUND`.

### Category 2: State Pollution & Idempotency

Ensure tools execute safely when repeated identically multiple times.

6. `pg_cron_create_extension` → Execute creating the extension multiple times consecutively. Verify clean `{success: true}` (already installed hook) rather than database collision exceptions.
7. `pg_cron_schedule` → Create a job named `stress_cron_dup`. Immediately try to create another job with exactly the same name. Does the adapter deduplicate/overwrite cleanly or correctly emit a conflict?
8. `pg_cron_alter_job` → Switch a job to `{active: false}`. Re-issue the exact same `{active: false}` command natively. Verify deterministic state without internal iteration crashes.

### Category 3: Alias & Parameter Combinations

Test parametric fallback modes and configuration matrices.

9. `pg_cron_alter_job` → Create a job. Alter *only* the `active` parameter. Verify other parameters remain intact.
10. `pg_cron_alter_job` → Alter *only* the `schedule` parameter, leaving `active` and `command` independent.
11. `pg_cron_alter_job` → Alter *all* parameters simultaneously: `{jobName: "stress_cron_multi", schedule: "0 0 * * *", command: "SELECT 2", active: true}`.
12. `pg_cron_schedule_in_database` → Include explicit variables natively: `{database: "postgres", username: "postgres", active: false}`. Ensure proper parsing onto the extended function signature.

### Category 4: Error Message Quality

Ensure tools predictably return typed `VALIDATION_ERROR`, etc.

13. Environment Mock -> Manually DROP the `pg_cron` extension via code mode wrapper. Then, attempt to execute `pg_cron_list_jobs`. Verify you receive a specialized `EXTENSION_MISSING` (or clearly structured) error rather than a horrific runtime cascade.
14. Restore the extension via `pg_cron_create_extension` directly afterwards.
15. `pg_cron_job_run_details` → Supply a massive integer `jobId: 2147483647`. Verify clean miss formatting instead of numeric overflow crashes.

### Category 5: Complex Cross-Database Routing

Verify scheduling logic across DB boundaries.

16. `pg_cron_schedule_in_database` → Schedule a job explicitly intended for a non-existent database: `{database: "nonexistent_db_xyz"}`. Note: pg_cron ordinarily accepts this on schedule but fails on execution. Monitor how the adapter natively reflects this pattern constraints.

### Category 6: Historical Telemetry & Run Extraction

17. `pg_cron_job_run_details` → Query history for a job that was *just* created (has 0 execution history logs). Verify it cleanly returns an empty array vs an object reference error.
18. `pg_cron_schedule` → Schedule a job to run every minute `* * * * *` with `command: "SELECT 1"`. (We won't wait for execution, but simulate the hook).

### Category 7: Large Payload & Truncation

Ensure sweeping reads cap context window exposure.

19. `pg_cron_list_jobs` → Assuming the scheduling topology is dense, ensure proper `limit` parsing. Compare token estimates of `{limit: 0}` versus `{limit: 10}`. Is the `jobs` manifest correctly constrained?

### Category 8: Code Mode Parity 

20. Validations -> Compare the exact property outputs of `pg.cron.listJobs()` inside JS Code Mode to ensure timestamp formats, boolean states (`active`), and routing details are not stripped or mangled during IPC bridging.

### Final Cleanup

Ensure all `stress_cron_*` definitions are cleanly evicted.
