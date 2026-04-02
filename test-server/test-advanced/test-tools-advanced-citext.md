# Advanced Stress Test — postgres-mcp — citext Group

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
| `pg_citext_create_extension(...)`                    | `pg.citext.createExtension(...)`                               |
| `pg_citext_convert_column(...)`                      | `pg.citext.convertColumn(...)`                                 |
| `pg_citext_list_columns(...)`                        | `pg.citext.listColumns(...)`                                   |
| `pg_*(...)`                                          | `pg.citext.*(...)`                                             |

**Key rules:**
- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls
- Group multiple related tests into a single code mode call when practical

## Naming & Cleanup

- **Temporary tables/schemas**: Prefix with `stress_citext_`
- **Cleanup**: Attempt to remove all `stress_citext_*` objects after testing.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `TABLE_NOT_FOUND`, `COLUMN_NOT_FOUND`).

## Post-Test Procedures

1. Confirm cleanup of all `stress_citext_*` objects.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in this prompt (test-tools-advanced-citext.md) and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
3. Update the changelog if there are any changes made (being careful not to create duplicate headers) and commit without pushing.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass, not counting this testing prompt itself. Highlight the single most expensive code mode block.
5. Stop and briefly summarize the testing results and fixes, ensuring the total token count is prominently displayed.

---

## citext Group Advanced Tests

### citext Group Tools (6 + 1 code mode)

1. pg_citext_create_extension
2. pg_citext_convert_column
3. pg_citext_list_columns
4. pg_citext_analyze_candidates
5. pg_citext_compare
6. pg_citext_schema_advisor
7. pg_execute_code (auto-added)

### Category 1: Boundary Values & Empty States

Test tools against extreme characters, non-applicable tables, and zero-state topologies.

1. `pg_citext_compare` → Compare empty strings `value1: "", value2: ""`.
2. `pg_citext_compare` → Compare strings with heavily reserved regex and PostgreSQL control characters: `value1: ".*+?()[]^\\$%", value2: ".*+?()[]^\\$%"`.
3. `pg_citext_schema_advisor` → Test against a table that contains absolutely NO textual data (e.g., exclusively `INTEGER`, `BOOLEAN`, `JSONB`). Verify elegant null-op behavior.
4. `pg_citext_analyze_candidates` → Run analysis on a schema explicitly known to be empty or stripped of character-based limits.

### Category 2: State Pollution & Idempotency

Ensure tools execute safely when repeated identically multiple times.

5. `pg_citext_create_extension` → Attempt to create the extension when it is already installed. Verify idempotency natively succeeds or politely returns `{alreadyInstalled: true}`.
6. `pg_citext_convert_column` → Create a temporary table and convert a `TEXT` column to `CITEXT`. Then, aggressively try to convert the same column to `CITEXT` two more times consecutively. Verify clean NOOP without blowing up transaction logs.
7. `pg_citext_convert_column` → Manually alter the column back to `TEXT` (using pure SQL via code mode wrapper), then use the tool to revert it to `CITEXT`. Verify the round-trip type preservation works seamlessly.

### Category 3: Alias & Parameter Combinations

Test parametric fallback modes and configuration matrices.

8. `pg_citext_analyze_candidates` → Execute with tight strictness bounds (e.g., very high false-negative limits if the API supports it, or `limit: 1`) to ensure array bounding operates effectively.
9. `pg_citext_list_columns` → Omit the schema parameter (fallback to all visible/public) vs Explicitly supplying `{schema: "public"}`. Assert exact count parity.
10. `pg_citext_schema_advisor` → Iterate against all `temp` tables generated in Code Mode and verify parameters accept aliases seamlessly if available.

### Category 4: Error Message Quality

Ensure tools predictably return typed `VALIDATION_ERROR`, `TABLE_NOT_FOUND`, etc.

11. `pg_citext_convert_column` → `table: "nonexistent_abc", column: "nonexistent_xyz"`. Verify structured `TABLE_NOT_FOUND` / `COLUMN_NOT_FOUND`.
12. `pg_citext_convert_column` → `table: "test_users", column: "nonexistent_xyz"`. Verify structured `COLUMN_NOT_FOUND`.
13. `pg_citext_schema_advisor` → `table: "fake_table_123"`. Verify structured failure pattern.
14. `pg_citext_convert_column` → Target a column that is an `INTEGER` sequence rather than text. Expect polite `VALIDATION_ERROR` indicating the type is intrinsically incompatible with citext mappings.

### Category 5: Cross-Schema Operations

Verify extension resolution targets external namespaces properly.

15. `pg_citext_create_extension` → Specify parameter `{schema: "stress_citext_schema"}`. Inspect if extension successfully registers out-of-core vs defaulting to public. *(Note: PostGres often globalizes this, just gauge tool behavior)*.
16. `pg_citext_list_columns` → Run against `"stress_citext_schema"`. Must isolate the results.
17. `pg_citext_schema_advisor` → Specify a fully qualified table path: `{table: "stress_citext_schema.my_table"}`. Look for correct resolution mechanics.

### Category 6: Edge-case Index Constraints

Inspect conversion safety features on high-integrity data.

18. Prepare: Create `stress_citext_indexed (id INT, email TEXT UNIQUE)`.
19. `pg_citext_convert_column` → Convert the `email` column.
20. Validation: Immediately attempt to insert duplicate case-conflicting rows into the table (`admin@google.com` vs `ADMIN@google.com`). This *must* fail on the unique constraint if CITEXT applied properly to the underlying index hierarchy.

### Category 7: Large Payload & Truncation

Ensure sweeping reads cap context window exposure.

21. `pg_citext_list_columns` → Assuming massive schemas, ensure no singular payload ever tops limits inherently without triggering a truncation wrapper natively available on the adapter.
22. `pg_citext_analyze_candidates` → Strip any limit checks if possible. Monitor `metrics.tokenEstimate`. It must actively protect LLM integrity.

### Category 8: Code Mode Parity 

23. Validate via `pg.citext.help()` that all 6 tools are effectively exposed and documented inside the dynamic Sandbox APIs precisely parallel to native external definitions.

### Final Cleanup

Drop all `stress_citext_*` objects and schemas.
