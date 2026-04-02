# Advanced Stress Test — postgres-mcp — jsonb Group

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run any other test files.
- All changes **MUST** be consistent with other postgres-mcp tools and `code-map.md`.
- Do not do anything other than these tests. Ignore distractions in terminal.
- Please let me handle Lint, typecheck, vitest, and playwright. You cannot restart the server in antigravity as the cache has to be refreshed manually.

## Code Mode Execution

All tests should be executed via `pg_execute_code` code mode. Native direct tool calls are not to be used unless explicitly compared. State persists across sequential code mode logic inside a script.

## Test Database Schema

The test database (`postgres`) contains these tables:

| Table               | Rows | Key Columns                                                                        | JSONB Columns            | Tool Groups           |
| ----
### Category 5: Schema-Qualified & NULL Column Edge Cases

**5.1 Schema Filtering**
23. `pg_jsonb_stats` → use `schema: "test_schema"` against a temporary JSONB table created there.
24. `pg_jsonb_stats` → test against `schema: "nonexistent_schema_xyz"`. Expect standard P154 `SCHEMA_NOT_FOUND` / `TABLE_NOT_FOUND` structured error.

**5.2 Interaction with SQL NULL**
25. `pg_jsonb_strip_nulls` → test on a row where the JSONB column is entirely `SQL NULL` (not `{"key": null}`). Verify it skips or returns success with `rowsAffected: 0`.
26. `pg_jsonb_set` vs `pg_jsonb_insert` → Set/Insert a value into a row where the column is `SQL NULL`. Verify `set` correctly initializes it, while checking if `insert` correctly handles or rejects it.

### Category 6: Builder Tools & Multi-Row Operations

**6.1 JSON Constructors**
27. `pg_jsonb_object` → Test creating an object from arbitrary key-value pairs. Verify output type.
28. `pg_jsonb_array` → Test building an array from scattered values. Verify output.
29. `pg_jsonb_agg` → Aggregate `test_products` rows into a single JSONB array. Group by category if possible. Check payload size.

### Category 7: Error Message Quality

Ensure tools reliably generate `VALIDATION_ERROR` instead of database exceptions.

30. `pg_jsonb_set` → Pass maliciously formatted, broken JSON `{ value: "{broken json," }`. Expect adapter intercepted error handling.
31. `pg_jsonb_pretty` → Pass identical broken JSON to pretty printer. Expect clean formatting rejection.
32. `pg_jsonb_validate_path` → Test with invalid syntax (e.g., standard dot-notation `"a.b.c"` instead of valid JSONPath format `"$.a.b.c"`).
33. Write Tools (`set`/`insert`/`delete`) → use a `where` clause that finds 0 rows. Verify structured `{success: true, rowsAffected: 0}` and a potential warning or hint, rather than an exception.

### Category 8: Large Payload & Truncation Verification

**8.1 Truncation Bounds**
34. `pg_jsonb_path_query` → Return ~10MB of JSON dynamically across thousands of rows. DO NOT provide a `limit` argument. Verify that the tool forcefully limits the result window and reports `truncated: true`. Track `metrics.tokenEstimate` to ensure it falls well within context limits.
35. `pg_jsonb_normalize` → Test `mode: "keys"` on a massive table without limits. Verify truncation limits its payload execution safely.
36. `pg_jsonb_stats` → Query `topKeysLimit: 50` on a table loaded with randomly generated wide JSON key distributions.

### Category 9: Code Mode Parity

**9.1 Method Exposure Parity**
37. Use `pg.jsonb.help()` to retrieve all methods. Verify that all 20 JSONB methods are exposed on `pg.jsonb` inside the sandbox exactly matching their direct tool equivalents.
38. `pg_jsonb_diff` → Use the code mode interface to calculate diffs between two JS object literals passed through `pg.jsonb.diff({doc1: {...}, doc2: {...}})`.
39. Ensure the `metrics.tokenEstimate` populates accurately on the final sandbox execution context.

### Final Cleanup

Drop all `stress_jsonb_*` tables. Ensure `test_jsonb_docs` is untouched.
