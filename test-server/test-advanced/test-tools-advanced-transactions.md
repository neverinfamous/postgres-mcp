# Advanced Stress Test — postgres-mcp — Part 1b (Transactions)

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
| `pg_read_query({sql: "..."})`                        | `pg.core.readQuery({sql: "..."})`                              |
| `pg_write_query({sql: "..."})`                       | `pg.core.writeQuery({sql: "..."})`                             |
| `pg_transaction_*({...})`                            | `pg.transactions.*({...})`                                     |

**Key rules:**

- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls — create a table in one call, query it in the next
- Group multiple related tests into a single code mode call when practical

## Test Database Schema

Same as `test-tools.md` — refer to that file for the full schema reference. Key tables: `test_products` (15 rows), `test_orders` (20), `test_jsonb_docs` (3).

## Naming & Cleanup

- **Temporary tables**: Prefix with `stress_` (e.g., `stress_empty_table`)
- **Conclusion**: Attempt to remove all `stress_*` objects after testing. If DROP fails, note the leftover objects and move on.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `TABLE_NOT_FOUND`, `COLUMN_NOT_FOUND`, `VALIDATION_ERROR`).

## Post-Test Procedures

1. Confirm cleanup of all `stress_*` objects.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements and 📦 Payload problems.
3. Update the changelog with any changes made.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your executions.
5. Stop and briefly summarize the testing results.

---

## transactions Group Advanced Tests

### transactions Group Tools (8 +1 code mode)

1. pg_transaction_begin
2. pg_transaction_commit
3. pg_transaction_rollback
4. pg_transaction_savepoint
5. pg_transaction_release
6. pg_transaction_rollback_to
7. pg_transaction_execute
8. pg_transaction_status
9. pg_execute_code (auto-added)

### Category 1: Aborted Transaction Recovery

1. `pg_transaction_begin` → get `transactionId`
2. Execute intentionally failing SQL: `pg_write_query` within transaction → `"INSERT INTO nonexistent_table VALUES (1)"`
3. `pg_transaction_status({transactionId: <id>})` → verify `{status: "aborted"}` (transaction is poisoned)
4. Attempt another write in same transaction → expect aborted state error
5. `pg_transaction_rollback` → expect success (transaction can be cleanly ended)
6. `pg_transaction_status({transactionId: <id>})` → verify `{status: "not_found"}` (rolled-back transaction is cleaned up)
7. Start new transaction → verify it works normally

### Category 2: Savepoint Stress Test

8. `pg_transaction_begin` → get `transactionId`
9. Create savepoint `sp1`
10. Insert row into `test_products` (within transaction)
11. Create savepoint `sp2`
12. Insert another row
13. Create savepoint `sp3`
14. Insert another row
15. `pg_transaction_rollback_to` `sp2` (Code mode param: `name: "sp2"`) → should undo sp3's insert AND remove sp3
16. `pg_transaction_status({transactionId: <id>})` → verify still `{status: "active"}` (savepoint rollback does not abort the transaction)
17. Verify: savepoint `sp3` no longer exists (attempt rollback_to sp3 → expect error)
18. `pg_transaction_rollback_to` `sp1` (Code mode param: `name: "sp1"`) → should undo sp2's insert
19. `pg_transaction_commit` → only pre-sp1 state should persist
20. Verify `test_products` row count is unchanged from baseline (15)

### Category 3: Transaction Execute Mixed Statements

21. `pg_transaction_execute` with mixed SELECT + INSERT + SELECT:
    ```
    statements: [
      {sql: "SELECT COUNT(*) AS before FROM test_products"},
      {sql: "INSERT INTO test_products (name, description, price) VALUES ('stress_tx', 'test', 99.99)"},
      {sql: "SELECT COUNT(*) AS after FROM test_products"}
    ]
    ```
22. Verify: `parseInt(results[0].rows[0].before)` = 15 (or current count), `parseInt(results[2].rows[0].after)` = before + 1
23. Cleanup: Delete the inserted row

### Category 4: Transaction Execute Failure Rollback

24. `pg_transaction_execute` with a failing statement mid-batch:
    ```
    statements: [
      {sql: "CREATE TABLE stress_tx_fail (id INT)"},
      {sql: "INSERT INTO nonexistent_table VALUES (1)"},
      {sql: "CREATE TABLE stress_tx_fail2 (id INT)"}
    ]
    ```
25. Verify: `success: false`, `statementsExecuted` indicates how far it got
26. Verify: `stress_tx_fail` does NOT exist (auto-rollback worked)

### Category 5: Transaction Timeout & Abandoned Transactions

27. `pg_transaction_begin` → get `transactionId`
28. Do NOT commit or rollback — leave transaction open
29. Wait ~5 seconds, then `pg_transaction_status({transactionId: <id>})` → verify `{status: "active"}` (abandoned transaction is still alive)
30. Attempt `pg_transaction_begin` again (new transaction while old is still open) → report behavior — does it succeed or block?
31. Clean up: `pg_transaction_rollback({transactionId: <id>})` the abandoned transaction
32. `pg_transaction_status({transactionId: <id>})` → verify `{status: "not_found"}` (cleaned up)
33. Verify new operations work normally after cleanup

### Category 6: Rapid State Transition Stress Test

34. Via `pg_execute_code`: Begin 3 transactions, verify all report `{status: "active"}`, then commit the first, force-abort the second (run bad SQL), and rollback the third. Status-check all three → expected: all `"not_found"` (committed and rolled-back transactions are cleaned up)
35. Verify no leaked connections: `pg_connection_stats()` → total connections should not have increased

### Category 7: Error Message Quality

36. `pg_transaction_execute` with empty `statements: []` → report behavior
37. `pg_transaction_execute` with `statements: [{}]` (missing `sql` key) → report behavior

### Final Cleanup

Verify `test_products` row count is still 15 and no `stress_*` tables remain.
