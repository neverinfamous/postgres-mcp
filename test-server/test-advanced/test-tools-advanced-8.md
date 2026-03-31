# Advanced Stress Test — postgres-mcp — Part 8

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run test-tools-advanced-1.md, test-tools-advanced-2.md, test-tools-advanced-3.md, test-tools-advanced-4.md, test-tools-advanced-5.md, test-tools-advanced-6.md, test-tools-advanced-7.md.
- All changes **MUST** be consistent with other postgres-mcp tools and `code-map.md`.
- Do not do anything other than these tests.

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
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in test-tools-advanced-8.md (this prompt) and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
3. Update the changelog with any changes made (being careful not to create duplicate headers), and commit without pushing.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass. Highlight the single most expensive code mode block.
5. Stop and briefly summarize the testing results and fixes, ensuring the total token count is prominently displayed.

---

## backup Group Advanced Tests

> Audit backup tools require `--audit-backup` enabled on test server. All 3 tools return `{success: false, error: "Audit backup not enabled"}` when disabled. When enabled, snapshot files are gzip-compressed (`.snapshot.json.gz`). **V2 features under test**: `restoreAs` (non-destructive side-by-side restore), `volumeDrift` (row count + size drift in diff output), and Code Mode audit coverage via the AuditInterceptor.

### backup Group Tools (12 +1 code mode)

1. pg_dump_table
2. pg_dump_schema
3. pg_copy_export
4. pg_copy_import
5. pg_create_backup_plan
6. pg_restore_command
7. pg_backup_physical
8. pg_restore_validate
9. pg_backup_schedule_optimize
10. pg_audit_list_backups
11. pg_audit_restore_backup
12. pg_audit_diff_backup
13. pg_execute_code (auto-added)

### Category 1: Snapshot Lifecycle (Audit Backup)

1. Create `stress_backup_lifecycle (id SERIAL PRIMARY KEY, name TEXT, status TEXT DEFAULT 'active')`, insert 3 rows via `pg_batch_insert`
2. `pg_truncate({table: "stress_backup_lifecycle"})` → triggers pre-mutation snapshot capture
3. `pg_audit_list_backups({target: "stress_backup_lifecycle"})` → verify snapshot exists with `filename`, `timestamp`, `tool: "pg_truncate"`, `target: "stress_backup_lifecycle"`
4. `pg_write_query({sql: "ALTER TABLE stress_backup_lifecycle ADD COLUMN drift_col INT DEFAULT 0"})` → introduce schema drift post-snapshot
5. `pg_audit_diff_backup({filename: <from step 3>})` → verify diff detects the `drift_col` addition
6. `pg_audit_restore_backup({filename: <from step 3>, dryRun: true})` → verify DDL preview returned; `drift_col` still present on live table after dry run
7. `pg_audit_restore_backup({filename: <from step 3>, confirm: true})` → verify restore executes successfully
8. `pg_describe_table({table: "stress_backup_lifecycle"})` → confirm `drift_col` no longer exists (restored to pre-truncate schema)

### Category 2: Multiple Snapshots, Filtering, and volumeDrift

9. Create `stress_backup_multi (id INT PRIMARY KEY, val TEXT)`, insert 2 rows
10. `pg_truncate({table: "stress_backup_multi"})` → first snapshot; verify `{success: true}`
11. Insert 1 row, then `pg_truncate({table: "stress_backup_multi"})` → second snapshot
12. `pg_audit_list_backups({target: "stress_backup_multi"})` → verify `count >= 2` (multiple snapshots for same table)
13. `pg_audit_list_backups({tool: "pg_truncate"})` → verify tool filter returns only `pg_truncate` snapshots
14. `pg_audit_list_backups()` → verify all snapshots across all tables returned; note snapshot filenames end in `.snapshot.json.gz`

**volumeDrift verification:**

15. Capture the filename for the *first* `stress_backup_multi` snapshot (before 2nd truncate); at that point it had 2 rows
16. `pg_audit_diff_backup({filename: <first snapshot>})` → verify `volumeDrift` object present:
    - `rowCountSnapshot: 2` (row count at snapshot time)
    - `rowCountCurrent: 0` (table was truncated twice, now 0 rows or 1 depending on test state)
    - `summary` string describes the row count change
    - `hasDifferences` is `true` if any schema drift exists OR `volumeDrift` row counts differ
17. Verify `sizeBytesSnapshot` and `sizeBytesCurrent` fields present (may be `null` if size data unavailable)

### Category 3: restoreAs Non-Destructive Restore

> Uses `stress_backup_lifecycle` snapshots from Category 1 above. Requires the table to have schema drift introduced (drift_col still present, or re-add it).

22. `pg_write_query({sql: "ALTER TABLE stress_backup_lifecycle ADD COLUMN has_drifted BOOLEAN DEFAULT false"})` → introduce fresh drift for restoreAs test
23. Capture any snapshot filename from `pg_audit_list_backups({target: "stress_backup_lifecycle"})`
24. `pg_audit_restore_backup({filename: <captured>, restoreAs: "stress_backup_restored", dryRun: true})` → verify:
    - Response `{success: true}` or dry-run preview returned
    - `stress_backup_lifecycle` still exists with `has_drifted` column (original unmodified)
    - `stress_backup_restored` does NOT yet exist (dry-run only previews)
25. `pg_audit_restore_backup({filename: <captured>, restoreAs: "stress_backup_restored", confirm: true})` → verify:
    - Response `{success: true}`
    - `stress_backup_lifecycle` still has `has_drifted` column (unmodified)
    - `pg_describe_table({table: "stress_backup_restored"})` → verify `has_drifted` column is NOT present (restored to snapshot's structure)
    - `pg_count({table: "stress_backup_restored"})` → `{count: 0}` (DDL-only restore, no data copy)
26. 🔴 `pg_audit_restore_backup({filename: <captured>, restoreAs: "stress_backup_restored", confirm: true})` → report behavior when `restoreAs` target already exists (conflicting table)

### Category 4: Code Mode Audit Interceptor Coverage

> Verifies that Code Mode calls through `pg_execute_code` that trigger destructive ops are captured by the AuditInterceptor.

27. Via Code Mode:
    ```javascript
    await pg.core.dropTable({table: 'stress_codemode_audit', ifExists: true});
    await pg.core.createTable({name: 'stress_codemode_audit', columns: [{name: 'id', type: 'SERIAL', primaryKey: true}, {name: 'tag', type: 'TEXT'}]});
    await pg.core.batchInsert({table: 'stress_codemode_audit', rows: [{tag: 'a'}, {tag: 'b'}, {tag: 'c'}]});
    await pg.core.dropTable({table: 'stress_codemode_audit', ifExists: true});
    return 'done';
    ```
28. `pg_audit_list_backups({tool: "pg_execute_code"})` → verify:
    - `count >= 1` — the `pg_drop_table` call inside Code Mode was intercepted
    - Snapshot has `tool: "pg_execute_code"` and `target` containing `stress_codemode_audit`
29. `pg_audit_diff_backup({filename: <from step 28>})` → verify diff reports the DDL of the dropped table

### Category 5: Error Message Quality

30. `pg_audit_diff_backup({filename: "nonexistent_snapshot_xyz.json"})` → structured error with `filename` context, NOT raw MCP error
31. `pg_audit_restore_backup({filename: "valid.json"})` without `confirm` → structured error mentioning `confirm` is required
32. `pg_audit_restore_backup({filename: "nonexistent_xyz.json", confirm: true})` → structured error for missing file
33. All 3 audit tools called with `--audit-backup` **disabled**: verify each returns `{success: false, error: "..."}` structured error, NOT MCP error

### Category 6: Code Mode Parity

```javascript
// Run via pg_execute_code
const list = await pg.backup.listBackups();
const hasSnapshots = (list.snapshots?.length ?? list.count ?? 0) > 0;
return { hasSnapshots, count: list.count ?? list.snapshots?.length ?? 0 };
```

34. Verify: `hasSnapshots: true` and `count > 0` (from lifecycle snapshots above)

```javascript
// Diff via code mode with volumeDrift check
const snapshots = await pg.backup.listBackups({ target: "stress_backup_multi" });
const filename = snapshots.snapshots?.[0]?.filename;
if (!filename) return { error: "No snapshot found" };
const diff = await pg.backup.diffBackup({ filename });
return { hasDiff: !!diff, hasVolumeDrift: !!diff.volumeDrift, filename };
```

35. Verify: `hasDiff: true`, `hasVolumeDrift: true`

### Final Cleanup

Drop `stress_backup_lifecycle`, `stress_backup_multi`, `stress_backup_restored`, and `stress_codemode_audit`. Confirm no `stress_*` tables remain.

---

## Cross-Group Integration Workflows

> **Purpose**: Test realistic multi-group pipelines that exercise tool chains spanning multiple groups. These catch state-management bugs that single-group tests miss (e.g., temp table metadata leaking between groups, transaction isolation issues).

### Workflow 1: Core → JSONB → Stats (Data Pipeline)

1. `pg_create_table({table: "stress_pipeline", columns: [{name: "id", type: "SERIAL", primaryKey: true}, {name: "data", type: "JSONB"}, {name: "score", type: "NUMERIC(5,2)"}]})` → success
2. Insert 5 rows with JSONB data (`{"category": "tech", "priority": N}`) and varying scores
3. `pg_jsonb_extract({table: "stress_pipeline", column: "data", path: "$.category"})` → verify extraction
4. `pg_stats_descriptive({table: "stress_pipeline", column: "score"})` → verify mean, stddev, min, max
5. `pg_stats_percentiles({table: "stress_pipeline", column: "score", percentiles: [25, 50, 75]})` → verify 3 values
6. `pg_stats_outliers({table: "stress_pipeline", column: "score"})` → verify outlier detection on small dataset (5 rows)
7. `pg_stats_frequency({table: "stress_pipeline", column: "score"})` → verify frequency distribution with value/count/percentage
8. `pg_stats_summary({table: "stress_pipeline"})` → verify includes `score` column in multi-column summary
9. Cleanup: `pg_drop_table({table: "stress_pipeline"})`

### Workflow 2: Core → Vector → Text (AI Search Pipeline)

7. `pg_create_table({table: "stress_ai_search", columns: [{name: "id", type: "SERIAL", primaryKey: true}, {name: "content", type: "TEXT"}, {name: "embedding", type: "vector(4)"}]})` → success
8. Insert 3 rows with text content and 4-dim vectors
9. `pg_vector_search({table: "stress_ai_search", column: "embedding", vector: [0.1, 0.2, 0.3, 0.4], limit: 2})` → verify 2 nearest results
10. `pg_text_search({table: "stress_ai_search", column: "content", query: "<search term>"})` → verify text search
11. Cleanup: `pg_drop_table({table: "stress_ai_search"})`

### Workflow 3: Migration → Introspection (Schema Lifecycle)

12. `pg_migration_init()` then `pg_migration_apply({version: "stress-integration", migrationSql: "CREATE TABLE stress_migrated (id SERIAL PRIMARY KEY, status TEXT DEFAULT 'active');", rollbackSql: "DROP TABLE IF EXISTS stress_migrated;"})` → verify migration applied
13. `pg_describe_table({table: "stress_migrated"})` → verify columns match migration DDL
14. `pg_constraint_analysis({table: "stress_migrated"})` → verify primary key constraint
15. `pg_migration_rollback({version: "stress-integration"})` → verify rollback
16. `pg_describe_table({table: "stress_migrated"})` → verify table no longer exists (structured error)

### Workflow 4: Admin → Performance (Health Check Pipeline)

17. `pg_analyze({table: "test_products"})` → update statistics
18. `pg_explain({sql: "SELECT * FROM test_products WHERE name = 'Laptop'"})` → execution plan
19. `pg_vacuum({table: "test_products"})` → vacuum
20. `pg_explain({sql: "SELECT * FROM test_products WHERE name = 'Laptop'"})` → compare plan post-vacuum

### Error Code Consistency (Cross-Group Check)

During all workflows above, watch for these error code quality indicators:

| Quality Level     | Example                                                     | Verdict                                     |
| ----------------- | ----------------------------------------------------------- | ------------------------------------------- |
| **5 - Excellent** | `Table 'stress_pipeline' does not exist (schema: public)`   | ✅ Includes object name + context            |
| **4 - Good**      | `Table 'stress_pipeline' does not exist`                    | ✅ Includes object name                      |
| **3 - Adequate**  | `relation "stress_pipeline" does not exist`                 | ⚠️ Raw PG error leaked but informative       |
| **2 - Poor**      | `ERROR: 42P01: relation does not exist`                     | ⚠️ Code-only, no object name                 |
| **1 - Useless**   | `Query failed` or generic `Error occurred`                  | ❌ No context, report as issue               |

Flag any tool returning Level 1-2 error messages as ⚠️ with the tool name for error quality improvement.

### Final Cleanup

Drop all remaining `stress_*` tables, views, and schemas. Drop `_mcp_schema_versions` if present. Confirm all test table row counts match baselines.
