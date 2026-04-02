# Advanced Stress Test — postgres-mcp — cron Group

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

- **Temporary tables/schemas**: Prefix with `stress_cron_`
- **Cleanup**: Attempt to remove all `stress_cron_*` objects after testing.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `JOB_NOT_FOUND`).

## Post-Test Procedures

1. Confirm cleanup of all `stress_cron_*` objects.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements and 📦 Payload problems.
3. Update the changelog with any changes made.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass.
5. Stop and briefly summarize the testing results.

---

## cron Group Advanced Tests

### Category 1: Boundary Values & Empty States

**1.1 Edge Case Creation**
1. Schedule a cron job with boundary strings (e.g. `* * * * 9` which represents an invalid day of week). Ensure `VALIDATION_ERROR` prevents raw PG crash.
2. Attempt to unschedule a completely non-existent job ID. Assert `JOB_NOT_FOUND`.

### Category 2: State Pollution & Idempotency

**2.1 Idempotent Submissions**
3. Submit a job with the exact same name `stress_cron_dup`. Try to submit again. Assert safe handling instead of crash.

### Category 3: Alias & Parameter Combinations

4. Test unscheduling aliases `jobId` vs `jobName` and ensure dynamic resolution successfully drops the target.

### Category 4: Error Message Quality

5. Execute job queries in a database without `pg_cron` loaded to invoke a clean `EXTENSION_MISSING` exception.

### Category 5: Large Payload & Truncation Verification

**5.1 High Volume Job Queries**
6. Generate 50 dummy jobs and pull the list. Check token estimations for `limit: 10` versus `limit: 0`.

### Category 6: Code Mode Parity

7. Read job statuses natively inside Code Mode and compare `pg.cron.listJobs()` data shape vs direct `readQuery` mapped JSON.

### Final Cleanup

Ensure all `stress_cron_*` definitions are cleanly evicted.
