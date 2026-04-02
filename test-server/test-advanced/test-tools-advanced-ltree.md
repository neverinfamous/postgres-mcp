# Advanced Stress Test — postgres-mcp — ltree Group

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
| `pg_ltree_query(...)`                                | `pg.ltree.query(...)`                                          |
| `pg_ltree_match(...)`                                | `pg.ltree.match(...)`                                          |
| `pg_ltree_convert_column(...)`                       | `pg.ltree.convertColumn(...)`                                  |
| `pg_*(...)`                                          | `pg.ltree.*(...)`                                              |

**Key rules:**
- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls
- Group multiple related tests into a single code mode call when practical

## Naming & Cleanup

- **Temporary testing states**: Prefix testing structures with `stress_ltree_`
- **Cleanup**: `pg_drop_table` on cleanly populated items.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `COLUMN_NOT_FOUND`, `TABLE_NOT_FOUND`, `EXTENSION_MISSING`).

## Post-Test Procedures

1. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in this prompt (test-tools-advanced-ltree.md) and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
2. Update the changelog if there are any changes made (being careful not to create duplicate headers) and commit without pushing.
3. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass, not counting this testing prompt itself. Highlight the single most expensive code mode block.
4. Stop and briefly summarize the testing results and fixes, ensuring the total token count is prominently displayed.

---

## ltree Group Advanced Tests

### ltree Group Tools (8 + 1 code mode)

1. pg_ltree_create_extension
2. pg_ltree_query
3. pg_ltree_subpath
4. pg_ltree_lca
5. pg_ltree_match
6. pg_ltree_list_columns
7. pg_ltree_convert_column
8. pg_ltree_create_index
9. pg_execute_code (auto-added)

### Category 1: Boundary Values & Empty States

Test tools against extreme characters, non-applicable parameters, and zero-state topologies.

1. `pg_ltree_subpath` → Supply negative offsets and lengths: e.g. `offset: -1`, `length: -10`. Ensure boundary logic natively throws a properly formatted `VALIDATION_ERROR` or DB error mapping cleanly.
2. `pg_ltree_subpath` → Subpath on root node single item `path: Root`. Attempt extraction of offset 5.
3. `pg_ltree_convert_column` → Create a `stress_ltree_invalid` table with invalid string characters (e.g. `path: "a b !! c"`) and attempt to convert it to an `ltree` type. Assert an accurate syntax rejection instead of an ambiguous error.

### Category 2: State Pollution & Idempotency

Ensure tools execute safely when repeated identically multiple times.

4. `pg_ltree_create_index` → Create a GIST index natively on a generated table's `path` column. Immediately call it again. Ensure it handles identical index topology cleanly without failing (`alreadyExists` true).
5. `pg_ltree_convert_column` → After successfully converting a column safely, execute the same conversion requirement immediately. It should be idempotent (`{success: true}`) without altering the metadata.
6. `pg_ltree_create_extension` → Execute natively consecutively multiple times. Ensure success cleanly maps.

### Category 3: Alias & Parameter Combinations

Test parametric fallback modes and configuration matrices.

7. `pg_ltree_match` → Test full `lquery` syntax: Use complex identifiers containing strict bounds natively if supported (e.g. `pattern: "electronics.*.smartphones"` instead of base mode). Verify the adapter properly binds and delegates standard lquery syntax vs throwing regex type faults.
8. `pg_ltree_query` → Apply limit limits (if available) when traversing children `mode: "children"`. Ensure result sizing matches the explicitly provided bound.

### Category 4: Error Message Quality

Ensure tools predictably return typed `VALIDATION_ERROR`, etc.

9. `pg_ltree_query` → Point to a nonexistent column on an existing table. Assert typing throws exactly `COLUMN_NOT_FOUND`.
10. `pg_ltree_match` → Target `table: "missing_hierarchies_123"`. Ensure `TABLE_NOT_FOUND` wraps seamlessly. 
11. Environment Mock -> Manually drop the `ltree` extension directly using pure SQL within Code Mode. Then execute `pg_ltree_lca`. Validate error returned is typed `EXTENSION_MISSING` (or a cleanly handled syntax wrapper).
12. Restore the extension via `pg_ltree_create_extension()` directly afterwards.

### Category 5: Mathematical Ancestry Matrices

Verify that complex native functions calculate topological positions precisely.

13. `pg_ltree_lca` → Request LCA for two completely disjointed, non-overlapping paths with different root origins (`A.B.C` vs `Z.Y.X`). Verify clean empty response natively rather than an indexing fault.
14. `pg_ltree_lca` → Execute against an array composed strictly of exactly identically repeated path definitions (`["Root.Node", "Root.Node", "Root.Node"]`).

### Category 6: Code Mode Parity 

15. Serialization IPC Check: Pull `pg_ltree_list_columns()` via Code Mode. Verify the resultant column mapping accurately isolates tables explicitly defined as hierarchical versus standard properties safely without JS coercion string anomalies.

### Final Cleanup

16. Native Execution -> Drop all `stress_ltree_*` tables created during the testing block via direct code mode execution.
