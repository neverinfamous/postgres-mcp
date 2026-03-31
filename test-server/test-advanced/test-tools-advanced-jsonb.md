# Advanced Stress Test — postgres-mcp — jsonb Group

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run test-tools-advanced-1.md, test-tools-advanced-3.md, test-tools-advanced-4.md, test-tools-advanced-5.md, test-tools-advanced-6.md, test-tools-advanced-7.md, test-tools-advanced-8.md.
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
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in this prompt and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
3. Update the changelog with any changes made (being careful not to create duplicate headers), and commit without pushing.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass. Highlight the single most expensive code mode block.
5. Stop and briefly summarize the testing results and fixes, ensuring the total token count is prominently displayed.

---

## jsonb Group Advanced Tests

### jsonb Group Tools (20 +1 code mode)

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

### Category 1: JSONB Mutation Workflow

Create `stress_jsonb_mut (id SERIAL PRIMARY KEY, data JSONB DEFAULT '{}')`, insert one row with `data: {"name": "Alice", "tags": ["a", "b"], "nested": {"level1": {"value": 1}}}`, then test:

1. `pg_jsonb_set({table: "stress_jsonb_mut", column: "data", path: "name", value: "\"Bob\"", where: "id = 1"})` → verify `name` changed to `"Bob"`
2. `pg_jsonb_set({table: "stress_jsonb_mut", column: "data", path: "nested.level1.value", value: "42", where: "id = 1"})` → verify deep path set works
3. `pg_jsonb_set({table: "stress_jsonb_mut", column: "data", path: "newKey", value: "\"inserted\"", where: "id = 1", createMissing: true})` → verify new key added. **Note:** `pg_jsonb_insert` is for array targets only. Use `pg_jsonb_set` with `createMissing` for object key insertion
4. `pg_jsonb_delete({table: "stress_jsonb_mut", column: "data", path: "tags", where: "id = 1"})` → verify `tags` key removed
5. `pg_jsonb_merge` — standalone merge requires `base` + `overlay` params (not `doc1`/`doc2`). Use via Code Mode: `pg.jsonb.merge({base: {"a": 1, "b": 2}, overlay: {"b": 3, "c": 4}})` → verify merge result `{"a": 1, "b": 3, "c": 4}` (overlay wins on conflicts)
6. Verify final state via `pg_jsonb_extract` on specific paths or `pg_read_query` — confirm all mutations applied correctly

**pg_jsonb_pretty (mutation + standalone):**

7. `pg_jsonb_pretty({table: "stress_jsonb_mut", column: "data", where: "id = 1"})` → verify the mutated JSONB is pretty-printed with indentation
8. `pg_jsonb_pretty({json: "{\"compact\":true,\"nested\":{\"a\":1}}"})` → verify standalone pretty-print with indentation
9. Cleanup: Drop `stress_jsonb_mut`

### Category 2: Error Message Quality

10. `pg_jsonb_extract({table: "nonexistent_table_xyz", column: "data", path: "test"})` → structured error
11. `pg_jsonb_set({table: "test_jsonb_docs", column: "metadata", path: "author", value: "\"Modified\"", where: "id = 99999"})` → report behavior for nonexistent row

### Final Cleanup

Confirm `test_jsonb_docs` row count is still 3 and contents are unchanged.
