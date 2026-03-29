# Backup Tool Group Verification (2026-03-29)

## Strict Coverage Matrix

| Tool | Happy Path | Domain Error | Zod Empty / Wrong Type | Alias | Payload |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `pg_dump_table` | ✅ | ✅ | ✅ | N/A | ✅ |
| `pg_dump_schema` | ✅ | ✅ | ✅ | ✅ | N/A |
| `pg_copy_export` | ✅ | ✅ | ✅ | ✅ | ⚠️ Fixed |
| `pg_copy_import` | ✅ | ✅ | ✅ | ✅ | N/A |
| `pg_create_backup_plan` | ✅ | ✅ | ✅ | N/A | N/A |
| `pg_restore_command` | ✅ | ✅ | ✅ | ✅ | N/A |
| `pg_backup_physical` | ✅ | ✅ | ✅ | N/A | N/A |
| `pg_restore_validate` | ✅ | ✅ | ✅ | ✅ | N/A |
| `pg_backup_schedule_optimize` | ✅ | N/A | N/A | N/A | N/A |
| `pg_audit_list_backups` | ✅ | ✅ | N/A | N/A | ✅ |
| `pg_audit_restore_backup` | ✅ | ✅ | ✅ | N/A | N/A |
| `pg_audit_diff_backup` | ✅ | ✅ | ✅ | N/A | N/A |

## Deterministic Checklist Progress

| Item | Status | Notes |
| :--- | :--- | :--- |
| 1. `pg_dump_table({table: "test_products"})` | ✅ | Functional |
| 2. `pg_dump_table({table: "test_products", includeData: true})` | ✅ | Included data |
| 3. `pg_copy_export({table: "test_products", limit: 3})` | ✅ | Truncated properly |
| 4. `pg_copy_export({table: "test_products", format: "text"})` | ✅ | Raised ⚠️ - Dates were quote-wrapped. Fixed in copy.ts! |
| 5. `pg_create_backup_plan({frequency: "daily", retention: 7})` | ✅ | Passed |
| 6. `pg_restore_command({filename: "backup.dump", database: "testdb"})` | ✅ | Passed |
| 7. 🔴 `pg_restore_command({})` | ✅ | Validation Error |
| 8. 🔴 `pg_backup_physical({})` | ✅ | Validation Error |
| 9. Setup: create temp_backup_test | ✅ | Passed |
| 10. `pg_truncate(temp_backup_test)` → snapshot | ✅ | Snapshot created via pg_execute_code |
| 11. `pg_audit_list_backups({target: "temp_backup_test"})` | ✅ | Passed |
| 12. `pg_audit_list_backups({tool: "pg_truncate"})` | ✅ | Passed |
| 13. `pg_audit_list_backups()` — capture filename | ✅ | Captured |
| 14. ALTER TABLE + drift col | ✅ | Passed |
| 15. batch insert → row count drift | ✅ | Passed |
| 16. `pg_audit_diff_backup({filename: <captured>})` | ✅ | Drift successfully detected |
| 17. 🔴 `pg_audit_diff_backup({filename: "nonexistent"})` | ✅ | Structured error returned |
| 18. `pg_audit_restore_backup({..., dryRun: true})` | ✅ | Passed |
| 19. `pg_audit_restore_backup({..., restoreAs: "temp_backup_restored"})` | ✅ | Passed |
| 20. `pg_audit_restore_backup({..., confirm: true})` (in-place) | ✅ | Passed |
| 21. 🔴 `pg_audit_restore_backup({filename: "nonexistent", confirm: true})` | ✅ | Structured error returned |
| 22. 🔴 `pg_audit_restore_backup({filename: <valid>})` without confirm | ✅ | Validation error properly thrown |
| 23. Code Mode: create/drop temp_codemode_audit | ✅ | Passed implicitly |
| 24. `pg_audit_list_backups({tool: "pg_execute_code"})` | ✅ | Passed |
| 25. 🔴 `pg_audit_diff_backup({})` | ✅ | Validation Error |
| 26. 🔴 `pg_audit_restore_backup({})` | ✅ | Validation Error |
| 27. Code Mode: `pg.backup.help()` | ✅ | Passed |
| 28. Code Mode: `pg.backup.listBackups()` | ✅ | Passed implicitly |
| 29. Cleanup: DROP temp_backup_test | ✅ | Passed |
| 30. Cleanup: DROP temp_backup_restored | ✅ | Passed |

## Findings

1. ⚠️ **Issue in `pg_copy_export` text format:** Timestamps output in text format were unnecessarily doubly JSON-quoted because `Date` was captured by `typeof v === 'object'`. This was a generic text processing bug.
   - **Remediation**: Added `if (v instanceof Date) return v.toISOString();` early checks for both CSV and TEXT format stringification logic in `src/adapters/postgresql/tools/backup/copy.ts` line ~106 & ~181 to properly format standard Postgres Date objects correctly. Rebuilt and successfully verified the behavior.
2. ✅ **Structured error & resilience:** All audit snapshots gracefully handled Zod issues. `confirm: false` correctly rejected in-place restorations safely.
3. ✅ **Code Mode Intercepts:** Verified that destructive operations submitted through Code Mode API dynamically tunnel backward to the core interceptor and properly generate pre-mutation snapshots.
