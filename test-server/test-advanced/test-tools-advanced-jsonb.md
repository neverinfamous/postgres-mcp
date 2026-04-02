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

All tests should be executed via `pg_execute_code` code mode. Tests are written in direct tool call syntax for readability — translate to code mode:

| Direct Tool Call                                     | Code Mode Equivalent                                           |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `pg_jsonb_extract(...)`                              | `pg.jsonb.extract(...)`                                        |
| `pg_jsonb_set(...)`                                  | `pg.jsonb.set(...)`                                            |
| `pg_jsonb_object(...)`                               | `pg.jsonb.object(...)`                                         |
| `pg_jsonb_array(...)`                                | `pg.jsonb.array(...)`                                          |
| `pg_jsonb_stats(...)`                                | `pg.jsonb.stats(...)`                                          |
| `pg_jsonb_*(...)`                                    | `pg.jsonb.*(...)`                                              |

**Key rules:**
- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls
- Group multiple related tests into a single code mode call when practical

## Test Database Schema

Refer to `test-database.sql`. `test_jsonb_docs` is specifically designed for this group. It contains 3 rows with `metadata`, `settings`, and `tags` columns.

## Naming & Cleanup

- **Temporary tables**: Prefix with `stress_jsonb_`
- **Cleanup**: Attempt to remove all `stress_jsonb_*` objects after testing.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `TABLE_NOT_FOUND`, `COLUMN_NOT_FOUND`).

## Post-Test Procedures

1. Confirm cleanup of all `stress_jsonb_*` objects.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in this prompt (test-tools-advanced-jsonb.md) and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
3. Update the changelog if there are any changes made (being careful not to create duplicate headers) and commit without pushing.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass, not counting this testing prompt itself. Highlight the single most expensive code mode block.
5. Stop and briefly summarize the testing results and fixes, ensuring the total token count is prominently displayed.

---

## jsonb Group Advanced Tests

### jsonb Group Tools (20 + 1 code mode)

1. pg_jsonb_extract
2. pg_jsonb_set
3. pg_jsonb_insert
4. pg_jsonb_delete
5. pg_jsonb_contains
6. pg_jsonb_path_query
7. pg_jsonb_agg
8. pg_jsonb_object
9. pg_jsonb_array
10. pg_jsonb_keys
11. pg_jsonb_strip_nulls
12. pg_jsonb_typeof
13. pg_jsonb_validate_path
14. pg_jsonb_stats
15. pg_jsonb_merge
16. pg_jsonb_normalize
17. pg_jsonb_diff
18. pg_jsonb_index_suggest
19. pg_jsonb_security_scan
20. pg_jsonb_pretty
21. pg_execute_code (auto-added)

### Category 1: Boundary Values & Empty States

Test handling of extreme size, depth, and edge-case literal values.

**1.1 Deep Nesting and Extraction**
1. Insert a 15-level deeply nested JSON document into a new `stress_jsonb_test` table.
2. `pg_jsonb_extract` → target `level1.level2...level15`. Verify retrieval.
3. `pg_jsonb_extract` → target a non-existent path `{path: "level1.wrong"}`. Expect clean validation handling or empty result.

**1.2 Massive Arrays**
4. Insert a JSON array containing 1,000 identical sub-objects.
5. `pg_jsonb_path_query` → use standard JSON Path parsing to filter and return exactly 50 objects.
6. `pg_jsonb_delete` → trigger an out-of-bounds error on `index: 999999`. Expect native PostgreSQL behavior (silent success/no-op).

**1.3 Degenerate Literals**
7. `pg_jsonb_typeof` → test against raw literal parameters `{json: "{}"}` (empty object), `{json: "[]"}` (empty array), and `{json: "null"}`.
8. `pg_jsonb_keys` → attempt to retrieve keys from a scalar primitive `{table: "test_jsonb_docs", column: "tags"}` (array column) or a literal `{json: "42"}`. Expect structured error preventing `jsonb_object_keys` exception.
9. `pg_jsonb_path_query` → query against an empty array `[]`.

### Category 2: State Pollution & Idempotency

**2.1 Idempotent Write Operations**
10. `pg_jsonb_insert` → attempt to override an existing key, then insert a completely new missing key. Ensure it operates predictably without crashing.
11. `pg_jsonb_delete` → delete the exact same key twice consecutively. Should succeed idempotently without throwing.
12. `pg_jsonb_set` + `pg_jsonb_delete` → SET a new path on an existing row, then immediately DELETE that path. Verify row returns to original state.

### Category 3: Cross-Tool Consistency

Ensure tools agree on types, paths, and values.

**3.1 Type Agreement**
13. `pg_jsonb_typeof` vs `pg_jsonb_keys` → Verify that if `typeof` returns `"object"`, `keys` successfully enumerates it.
14. `pg_jsonb_extract` + `pg_jsonb_set` Round-trip → Set a nested number field (e.g., `42`), extract it, and verify the type inside code mode using `typeof result === 'number'`. It must not be a double-escaped string.

**3.2 Operation Parity**
15. `pg_jsonb_normalize` → Test `mode: "flatten"` and verify the leaf node paths exactly match what `pg_jsonb_extract` would require to reach those nodes.
16. `pg_jsonb_merge` vs `pg_jsonb_normalize` → Merge two documents where one overrides the other, then normalize both the standalone result and the base documents. Verify consistency.

### Category 4: Analytics Tool Stress

Stress test the analysis and scanning tools on degenerate and dangerous patterns.

**4.1 Indexing and Suggestions**
17. `pg_jsonb_index_suggest` → test on `test_jsonb_docs.metadata` (object column) vs `test_jsonb_docs.tags` (array column). Array columns should gracefully report no keys / return validation error since `jsonb_each` doesn't work on arrays.
18. `pg_jsonb_index_suggest` → test on a column that already has a GIN index (create one on a temporary table first). Verify the tool correctly detects the existing index and avoids duplicate recommendations.

**4.2 Security Scanning**
19. `pg_jsonb_security_scan` → Insert intentionally malicious payloads: script tags `<script>alert(1)</script>`, SQL injection strings `' OR 1=1; DROP TABLE users; --`, and mock credentials `{"api_key": "sk_test_123"}`. Verify detection.
20. `pg_jsonb_security_scan` → test with a large `sampleSize` parameter (allow coercion testing as well).

**4.3 Statistical Analysis**
21. `pg_jsonb_stats` → Test on an entirely empty table. Expect graceful zero-state, not division-by-zero crashes.
22. `pg_jsonb_stats` → Test on a table with heterogeneous types in the same column (mixed objects, arrays, and scalars). Verify `typeDistribution` sums correctly.

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
