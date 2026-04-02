# Advanced Stress Test — postgres-mcp — backup Group

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

- **Temporary tables/schemas/views**: Prefix with `stress_backup_`
- **Cleanup**: Attempt to remove all `stress_backup_*` objects after testing.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `TABLE_NOT_FOUND`).

## Post-Test Procedures

1. Confirm cleanup of all `stress_backup_*` objects.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements and 📦 Payload problems.
3. Update the changelog with any changes made.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass.
5. Stop and briefly summarize the testing results.

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
13. `pg_audit_list_backups({tool: "pg_execute_code"})` → verify tool filter returns `pg_execute_code` snapshots (since `pg_truncate` inherits the Code Mode identity)
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
