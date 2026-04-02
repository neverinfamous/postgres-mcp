# Advanced Stress Test — postgres-mcp — Part 1a (Core)

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run any other test files or do anything other than these tests. Ignore distractions in terminal from work being done in other thread.
- All changes **MUST** be consistent with other postgres-mcp tools and `code-map.md`.
- Allow me to handle Lint, typecheck, Vitest, and Playwright. You cannot restart the server in Antigravity as the cache has to be refreshed manually.
- If you have trouble saving task.md, save it to a different location or use a different filename.

## Code Mode Execution

All tests should be executed via `pg_execute_code` code mode. Native direct tool calls are not to be used unless explicitly compared. State persists across sequential code mode logic inside a script.

## Test Database Schema

The test database (`postgres`) contains these tables:

| Table               | Rows | Key Columns                                                                        | JSONB Columns            | Tool Groups           |
| ----
### Category 4: Error Message Quality

For each test, verify the error returns a **structured response** (`{success: false, error: "..."}`) — NOT a raw MCP exception. Rate each error message: does it include enough context to diagnose the problem?

**4.1 Cross-Group Nonexistent Objects (not covered in first-level)**

33. `pg_get_indexes({table: "nonexistent_table_xyz"})` → report behavior
34. `pg_object_details({name: "nonexistent_table_xyz"})` → structured error

**4.2 Invalid Columns**

35. `pg_count({table: "test_products", column: "nonexistent_col"})` → report behavior
36. `pg_create_index({table: "test_products", columns: ["nonexistent_col"]})` → report behavior

**4.3 Invalid Parameter Values**

37. `pg_batch_insert({table: "test_products", rows: []})` (empty array) → report behavior

### Category 5: Large Payload & Truncation Verification

**5.1 Truncation Indicators**

Verify that tools returning `truncated` and `totalCount` fields work correctly:

38. `pg_list_tables({limit: 2})` → expect `truncated: true` and `totalCount` > 2
39. `pg_get_indexes({limit: 1})` → expect `truncated: true` and `totalCount` > 1
40. `pg_index_stats({limit: 1})` → expect `truncated: true` and `totalCount` > 1
41. `pg_table_stats({limit: 1})` → expect `truncated: true` and `totalCount` > 1
42. `pg_copy_export({table: "test_measurements", limit: 5})` → expect 5 rows
43. `pg_list_partitions({table: "test_events", limit: 1})` → expect `truncated: true` and remaining partitions in `totalCount`
44. `pg_show_settings({limit: 2})` (Note: this is in the `monitoring` group) → expect `truncated: true`

**5.2 Limit Zero (Unlimited)**

45. `pg_list_tables({limit: 0})` → count should match actual table count
46. `pg_copy_export({table: "test_measurements", limit: 0})` → expect all 640 rows
47. `pg_index_stats({limit: 0})` → verify `truncated: false` or absent

**5.3 Schema Snapshot Compact Mode**

48. `pg_schema_snapshot({compact: false})` (full mode) → note payload size
49. `pg_schema_snapshot()` (default is compact: true) → verify tables section omits `columns` key, note payload size reduction
50. `pg_schema_snapshot({sections: ["tables", "indexes"]})` → verify only those sections present

### Category 6: Code Mode Parity

**6.1 Core API Parity**

Verify Code Mode aliases return identical results to direct tool calls:

```javascript
// Run via pg_execute_code
const direct = await pg.core.readQuery({
  sql: "SELECT COUNT(*) AS n FROM test_products",
});
const alias = await pg.readQuery("SELECT COUNT(*) AS n FROM test_products");
return {
  direct: direct.rows[0].n,
  alias: alias.rows[0].n,
  match: direct.rows[0].n === alias.rows[0].n,
};
```

Expect: `match: true`

**6.2 Discovery Methods**

51. `pg_execute_code: pg.help()` → verify returns group→methods mapping for all 21 groups
52. `pg_execute_code: pg.core.help()` → verify returns `{methods, methodAliases, examples}`

**6.3 Code Mode Error Handling**

Code mode wraps errors as structured return values instead of throwing. Verify:

```javascript
const result = await pg.core.readQuery({ sql: "SELECT * FROM nonexistent_xyz" });
return {
  success: result.success,
  hasError: !!result.error,
  hasTableName: result.error?.includes("nonexistent_xyz"),
};
```

Expect: `{success: false, hasError: true, hasTableName: true}`

### Final Cleanup

Drop all `stress_*` tables and indexes. Confirm `test_products` row count is still 15 (no pollution).

## Post-Test Procedures

### Reporting Rules

- Use ✅ only in inline notes during testing; omit from Final Summary
- Do not mention what already works well or issues already documented in server-instructions.md and runtime hints

### After Testing

1. **Cleanup**: Confirm all `stress_*` tables and temporary testing data are removed
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, 📦 Payload problems (responses that should be truncated or offer a `limit` param) and files listed below. All changes MUST be consistent with other postgres-mcp tools and `code-map.md`
3. **Scope of fixes** includes corrections to any of:
   - Handler code
   - `server-instructions.md`
   - Test database (`test-database.sql`)
   - This prompt (`test-tools-codemode.md`) and group file (`test-group-tools-codemode.md`)
4. Update the changelog with any changes made (being careful not to create duplicate headers), and commit without pushing.
5. **Token Audit**: Before concluding, call `read_resource` on `postgres://audit` to retrieve the `sessionTokenEstimate` (total token usage) for your testing session. Include this "Total Token Usage" in your final test report and session summary. Highlight the single most expensive Code Mode execution block.
6. Stop and briefly summarize the testing results and fixes, **ensuring the total token count is prominently displayed.**
