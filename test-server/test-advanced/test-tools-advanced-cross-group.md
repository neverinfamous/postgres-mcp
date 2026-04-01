# Advanced Stress Test — postgres-mcp — cross-group Group

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run test-tools-advanced-1.md, test-tools-advanced-2.md, test-tools-advanced-3.md, test-tools-advanced-4.md, test-tools-advanced-5.md, test-tools-advanced-6.md, test-tools-advanced-7.md.
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
