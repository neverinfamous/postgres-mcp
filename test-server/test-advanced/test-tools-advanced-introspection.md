# Advanced Stress Test — postgres-mcp — introspection Group

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run test-tools-advanced-1.md, test-tools-advanced-2.md, test-tools-advanced-3.md, test-tools-advanced-4.md, test-tools-advanced-5.md, test-tools-advanced-6.md, test-tools-advanced-8.md.
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

## introspection Group Advanced Tests

> **Note:** Basic checklist tests (in `test-group-tools.md`) already cover happy paths: default dependency graph, topological sort both directions, DELETE cascade on `test_departments`, `compact: true` snapshot, constraint analysis defaults, and simple migration risk statements. This category focuses on **filtering, comparative, and degenerate-input** scenarios not covered there.

### introspection Group Tools (6 +1 code mode)

1. pg_dependency_graph
2. pg_topological_sort
3. pg_cascade_simulator
4. pg_schema_snapshot
5. pg_constraint_analysis
6. pg_migration_risks
7. pg_execute_code (auto-added)

### Category 1: Dependency Graph Filtering

1. `pg_dependency_graph({excludeExtensionSchemas: false})` → expect more nodes than default (default excludes cron/topology/tiger). Count nodes and compare
2. `pg_dependency_graph({excludeExtensionSchemas: true})` → count nodes, verify < test 1
3. `pg_dependency_graph({includeRowCounts: false})` → verify node objects do NOT have `rowCount` field
4. `pg_dependency_graph({includeRowCounts: true})` → verify node objects HAVE `rowCount` field with numeric values
5. `pg_dependency_graph({schema: "test_schema"})` → verify only `test_schema` objects in graph (or empty if no FKs in that schema)

### Category 2: Topological Sort Completeness

6. `pg_topological_sort({direction: "create"})` → verify isolated tables (no FK, e.g., `test_articles`, `test_measurements`) appear in order at level 0 with empty `dependencies`
7. `pg_topological_sort({direction: "drop"})` → verify same isolated tables still appear (direction shouldn't lose tables)
8. Compare create vs drop: count of tables should be identical in both directions
9. `pg_topological_sort({excludeExtensionSchemas: false})` → verify more tables than with `true`

### Category 3: Cascade Simulator Comparative

Run all three operation types on `test_departments` and compare:

10. `pg_cascade_simulator({table: "test_departments", operation: "DELETE"})` → capture `severity` and `affectedTables` count. Expect RESTRICT block from `test_projects` and NO ACTION block from `test_audit_log` (via employees)
11. `pg_cascade_simulator({table: "test_departments", operation: "DROP"})` → expect higher severity than DELETE (DROP force-cascades regardless of FK rules). All dependent tables affected
12. `pg_cascade_simulator({table: "test_departments", operation: "TRUNCATE"})` → expect similar severity to DROP (TRUNCATE also force-cascades)
13. Verify: DROP and TRUNCATE `severity` should be `"critical"` when dependent tables exist
14. Verify: DELETE should show `blockingActions` in stats (NO ACTION + RESTRICT FKs)

### Category 4: Cascade Simulator Self-Reference

15. `pg_cascade_simulator({table: "test_employees", operation: "DELETE"})` → verify self-referencing FK (`manager_id → id`, SET NULL) is handled without infinite recursion
16. Verify `test_employees` appears in affected tables (from `test_assignments` CASCADE and `test_audit_log` NO ACTION), but self-reference doesn't cause circular explosion
17. Verify `test_departments` does NOT appear in affected tables (employees→departments FK is "from" employees, not "to")

### Category 5: Constraint Analysis Selective Checks

18. `pg_constraint_analysis({checks: ["missing_pk"]})` → verify ONLY missing PK findings returned (should find `test_audit_log`). No unindexed FK findings in results
19. `pg_constraint_analysis({checks: ["unindexed_fk"]})` → verify ONLY unindexed FK findings returned (should find `test_audit_log.employee_id`). No missing PK findings
20. `pg_constraint_analysis({checks: ["missing_pk", "unindexed_fk"]})` → verify both types present
21. `pg_constraint_analysis({checks: ["redundant"]})` → verify only redundant constraint findings (may be empty in test DB)

### Category 6: Migration Risks Multi-Statement

22. `pg_migration_risks({statements: ["ALTER TABLE test_employees DROP COLUMN hire_date", "ALTER TABLE test_orders ADD COLUMN notes TEXT", "DROP TABLE test_assignments CASCADE"]})` → verify each statement gets its own risk entry. DROP COLUMN and DROP TABLE CASCADE should be higher risk than ADD COLUMN
23. Verify response `risks` array has 3 entries (one per statement)
24. Verify `summary` aggregates all risks

### Category 7: Migration Risks Idempotent DDL

25. `pg_migration_risks({statements: ["DROP TABLE IF EXISTS test_assignments"]})` → compare risk to unconditional `DROP TABLE test_assignments CASCADE`
26. `pg_migration_risks({statements: ["CREATE TABLE IF NOT EXISTS test_new (id INT)"]})` → verify lower risk than unconditional CREATE (IF NOT EXISTS is safer)
27. `pg_migration_risks({statements: ["SELECT 1"]})` → verify no risk or minimal risk for read-only statement

### Category 8: Schema Snapshot Cross-Schema

28. `pg_schema_snapshot({schema: "test_schema"})` → verify returns only `test_schema` objects. Should include `order_seq` sequence
29. `pg_schema_snapshot({schema: "test_schema", sections: ["sequences"]})` → verify only sequences section, containing `order_seq`
30. `pg_schema_snapshot({schema: "nonexistent_schema_xyz"})` → expect structured error or empty snapshot (not crash)

### Final Cleanup

All tools in this group are read-only — no cleanup needed. Confirm `test_products` (15 rows), `test_orders` (20 rows), and `test_measurements` (640 rows) are unchanged.
