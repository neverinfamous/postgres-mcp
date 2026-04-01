# Advanced Stress Test — postgres-mcp — cron Group

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run test-tools-advanced-1.md, test-tools-advanced-2.md, test-tools-advanced-3.md, test-tools-advanced-4.md, test-tools-advanced-5.md, test-tools-advanced-7.md, test-tools-advanced-8.md.
- All changes **MUST** be consistent with other postgres-mcp tools and `code-map.md`.
- Do not do anything other than these tests.
- Please let me handle Lint, typecheck, vitest, and playwright. You cannot restart the server in antigravity as the cache has to be refreshed manually.

## Code Mode Execution

All tests should be executed via `pg_execute_code` code mode. Tests are written in direct tool call syntax for readability — translate to code mode:

| Direct Tool Call                                     | Code Mode Equivalent                                           |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `pg_read_query({sql: "..."})`                        | `pg.core.readQuery({sql: "..."})`                              |
| `pg_write_query({sql: "..."})`                       | `pg.core.writeQuery({sql: "..."})`                             |
| `pg_create_table({table: "...", columns: [...]})`    | `pg.core.createTable({table: "...", columns: [...]})`          |
| `pg_describe_table({table: "..."})`                  | `pg.core.describeTable({table: "..."})`                        |
| `pg_drop_table({table: "..."})`                      | `pg.core.dropTable({table: "..."})`                            |
| `pg_count({table: "..."})`                           | `pg.core.count({table: "..."})`                                |
| `pg_exists({table: "..."})`                          | `pg.core.exists({table: "..."})`                               |
| `pg_batch_insert({...})`                             | `pg.core.batchInsert({...})`                                   |
| `pg_upsert({...})`                                   | `pg.core.upsert({...})`                                        |
| `pg_transaction_*({...})`                            | `pg.transactions.*({...})`                                     |
| `pg_jsonb_*({...})`                                  | `pg.jsonb.*({...})`                                            |
| `pg_text_*` / `pg_trigram_*` / `pg_fuzzy_*` / etc.   | `pg.text.*`                                                    |
| `pg_stats_*({...})`                                  | `pg.stats.*({...})`                                            |
| `pg_vector_*({...})`                                 | `pg.vector.*({...})`                                           |

**Key rules:**

- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls — create a table in one call, query it in the next
- Group multiple related tests into a single code mode call when practical

## Test Database Schema

Same as `test-tools.md` — refer to that file for the full schema reference. Key tables: `test_products` (15 rows), `test_orders` (20), `test_jsonb_docs` (3), `test_articles` (3), `test_measurements` (640, after resource seed), `test_embeddings` (75, after resource seed), `test_locations` (25, after resource seed), `test_users` (3), `test_categories` (6), `test_events` (100 across 4 partitions), `test_departments` (3), `test_employees` (5), `test_projects` (2), `test_assignments` (3), `test_audit_log` (3).

> **Note:** `test-resources.sql` runs after `test-database.sql` and adds ~200 measurements (minus deletions), 25 embeddings, and 20 locations. Counts reflect the post-seed state.

## Naming & Cleanup

- **Temporary tables**: Prefix with `stress_` (e.g., `stress_empty_table`)
- **Temporary indexes**: Prefix with `stress_idx_`
- **Temporary views**: Prefix with `stress_view_`
- **Temporary schemas**: Prefix with `stress_schema_`
- **Cleanup**: Attempt to remove all `stress_*` objects after testing. If DROP fails, note the leftover objects and move on — they will be cleaned up on next database reset

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized — **blocking, equally important as ❌ bugs**. Oversized payloads waste LLM context window tokens and degrade downstream tool-calling quality. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization (e.g., filter system tables, add `compact` option, omit empty arrays).
- ✅ Confirmed: Edge case handled correctly (use only inline during testing; omit from Final Summary)

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `TABLE_NOT_FOUND`, `COLUMN_NOT_FOUND`, `VALIDATION_ERROR`). These are fixable in `src/utils/errors/` by adding a `code` override to the matching error class. Treat as ⚠️ Issue and include in fix plan.

## Post-Test Procedures

1. Confirm cleanup of all `stress_*` object and any temporary files you might have created in the repository during testing.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in this prompt and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
3. Update the changelog with any changes made (being careful not to create duplicate headers), and commit without pushing.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass. Highlight the single most expensive code mode block.
5. Stop and briefly summarize the testing results and fixes, ensuring the total token count is prominently displayed.

---

## cron Group Advanced Tests

### cron Group Tools (8 +1 code mode)

1. pg_cron_create_extension
2. pg_cron_schedule
3. pg_cron_schedule_in_database
4. pg_cron_unschedule
5. pg_cron_alter_job
6. pg_cron_list_jobs
7. pg_cron_job_run_details
8. pg_cron_cleanup_history
9. pg_execute_code (auto-added)

### Category 1: Edge Cases

1. `pg_cron_schedule({name: "stress_dup_job", schedule: "0 0 * * *", command: "SELECT 1"})` → capture jobId
2. `pg_cron_schedule({name: "stress_dup_job", schedule: "0 1 * * *", command: "SELECT 2"})` → report behavior: does it error on duplicate name, or overwrite?
3. `pg_cron_schedule({name: "stress_bad_cron", schedule: "invalid cron", command: "SELECT 1"})` → report whether validation catches invalid expression or defers to pg_cron
4. `pg_cron_schedule({name: "stress_bad_sql", schedule: "0 0 * * *", command: "SELECT * FROM nonexistent_xyz"})` → report: does scheduling succeed (SQL validated on execution, not schedule-time)?
5. `pg_cron_job_run_details({jobName: "stress_dup_job"})` → report behavior (if tool exists)
6. Cleanup: `pg_cron_unschedule` all `stress_*` jobs

### Category 2: Error Message Quality

7. `pg_cron_schedule({name: "stress_bad_cron", schedule: "invalid cron", command: "SELECT 1"})` → report behavior

### Final Cleanup

Unschedule all `stress_*` jobs created during testing.
