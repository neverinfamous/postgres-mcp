# Advanced Stress Test — postgres-mcp — migration Group

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run test-tools-advanced-1.md, test-tools-advanced-2.md, test-tools-advanced-3.md, test-tools-advanced-4.md, test-tools-advanced-5.md, test-tools-advanced-6.md, test-tools-advanced-8.md.
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
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass, not counting this testing prompt itself. Highlight the single most expensive code mode block.
5. Stop and briefly summarize the testing results and fixes, ensuring the total token count is prominently displayed.

---

## migration Group Advanced Tests

> **Note:** Basic checklist and Part 1 Category 2.3 (State Pollution) already cover: init idempotency, apply success, duplicate hash detection, rollback execution, and re-apply after rollback. This category focuses on **record-only distinction, failure persistence, history filtering, status alignment, and rollback edge cases**.

> **Prerequisite:** All tests require `pg_migration_init` first. Tests build on each other and must run in order.

### migration Group Tools (6 +1 code mode)

1. pg_migration_init
2. pg_migration_record
3. pg_migration_apply
4. pg_migration_rollback
5. pg_migration_history
6. pg_migration_status
7. pg_execute_code (auto-added)

### Category 1: Record vs Apply Distinction

1. `pg_migration_init()` → initialize tracking table
2. `pg_migration_record({version: "stress-record-1.0", migrationSql: "CREATE TABLE stress_record_only (id INT);", rollbackSql: "DROP TABLE IF EXISTS stress_record_only;", sourceSystem: "stress-test"})` → verify `success: true` with SHA-256 hash and `record.status = "recorded"` (NOT `"applied"`)
3. Verify `stress_record_only` does NOT exist: `pg_read_query({sql: "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'stress_record_only') AS e"})` → `false`
4. `pg_migration_apply({version: "stress-apply-1.0", migrationSql: "CREATE TABLE stress_apply_test (id SERIAL PRIMARY KEY, name TEXT);", rollbackSql: "DROP TABLE IF EXISTS stress_apply_test;", sourceSystem: "stress-test"})` → verify `success: true` and `record.status = "applied"`
5. Verify `stress_apply_test` DOES exist via `pg_read_query`

### Category 2: Failed Migration Persistence

6. `pg_migration_apply({version: "stress-fail-1.0", migrationSql: "ALTER TABLE nonexistent_table_xyz ADD COLUMN bad_col INT;", sourceSystem: "stress-test"})` → verify `success: false`
7. `pg_migration_history({status: "failed"})` → verify entry with version `"stress-fail-1.0"` appears with error details
8. Verify failed entry has `status: "failed"` and non-null error information

### Category 3: History Filtering Combinatorics

9. `pg_migration_history()` → capture total count (should be ≥3 from steps above: record, apply, fail)
10. `pg_migration_history({status: "applied"})` → verify only applied entries
11. `pg_migration_history({status: "recorded"})` → verify only record-only entries (from step 1.2)
12. `pg_migration_history({sourceSystem: "stress-test"})` → verify only entries with `sourceSystem: "stress-test"`
13. `pg_migration_history({limit: 1})` → verify exactly 1 record returned
14. `pg_migration_history({limit: 1, offset: 1})` → verify returns different record than limit-only call
15. `pg_migration_history({status: "applied", sourceSystem: "stress-test"})` → verify combined filter

### Category 4: Status Dashboard Alignment

16. `pg_migration_status()` → capture counts (`applied`, `recorded`, `rolledBack`, `failed`)
17. Cross-verify: `applied` count should match `pg_migration_history({status: "applied"})` total
18. Cross-verify: `recorded` count should match `pg_migration_history({status: "recorded"})` total
19. Cross-verify: `failed` count should match `pg_migration_history({status: "failed"})` total
20. Verify `latestVersion` is the most recently applied version
21. Verify `sourceSystems` includes `"stress-test"`

### Category 5: Rollback Edge Cases

22. `pg_migration_rollback({version: "nonexistent-version-xyz"})` → expect structured error (version not found)
23. `pg_migration_rollback({version: "stress-apply-1.0", dryRun: true})` → verify rollback SQL returned without execution, `stress_apply_test` still exists
24. `pg_migration_rollback({version: "stress-apply-1.0"})` → execute rollback, verify `stress_apply_test` dropped
25. `pg_migration_rollback({version: "stress-apply-1.0"})` → attempt rollback again on already rolled-back version → expect structured error or graceful handling

### Category 6: Multi-Migration Hash Independence

26. `pg_migration_apply({version: "stress-multi-1", migrationSql: "CREATE TABLE stress_multi_a (id INT);", rollbackSql: "DROP TABLE IF EXISTS stress_multi_a;", sourceSystem: "stress-test"})` → capture `record.migrationHash`
27. `pg_migration_apply({version: "stress-multi-2", migrationSql: "CREATE TABLE stress_multi_b (id INT);", rollbackSql: "DROP TABLE IF EXISTS stress_multi_b;", sourceSystem: "stress-test"})` → capture `record.migrationHash`, verify different from step 26
28. `pg_migration_apply({version: "stress-multi-3", migrationSql: "CREATE TABLE stress_multi_c (id INT);", rollbackSql: "DROP TABLE IF EXISTS stress_multi_c;", sourceSystem: "stress-test"})` → capture `record.migrationHash`, verify unique
29. Rollback `stress-multi-2` only → verify `stress_multi_a` and `stress_multi_c` still exist but `stress_multi_b` is dropped
30. Verify `pg_migration_history` shows: stress-multi-1 applied, stress-multi-2 rolled_back, stress-multi-3 applied

### Final Cleanup

1. Drop all `stress_*` tables created by migration tests
2. Drop `_mcp_schema_versions` table
3. Verify no `stress_*` tables remain
