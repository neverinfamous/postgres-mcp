# Advanced Stress Test — postgres-mcp — vector Group

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run any other test files.
- All changes **MUST** be consistent with other postgres-mcp tools and `code-map.md`.
- Do not do anything other than these tests. Ignore distractions in terminal.
- Please let me handle Lint, typecheck, vitest, and playwright. You cannot restart the server in antigravity as the cache has to be refreshed manually.

## Code Mode Execution

All tests should be executed via `pg_execute_code` code mode.

**Key rules:**
- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls
- Group multiple related tests into a single code mode call when practical

## Naming & Cleanup

- **Temporary tables/schemas**: Prefix with `stress_vector_`
- **Cleanup**: Attempt to remove all `stress_vector_*` objects after testing.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `TABLE_NOT_FOUND`).

## Post-Test Procedures

1. Confirm cleanup of all `stress_vector_*` objects.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in this prompt (test-tools-advanced-vector.md) and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
3. Update the changelog if there are any changes made (being careful not to create duplicate headers) and commit without pushing.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass, not counting this testing prompt itself. Highlight the single most expensive code mode block.
5. Stop and briefly summarize the testing results and fixes, ensuring the total token count is prominently displayed.

---

## vector Group Advanced Tests

### Category 1: Boundary Values & Empty States

**1.1 Edge Case Creation**
1. Search vectors using entirely mismatched dimensions (e.g. querying a 1536-dim vector against a 3-dim stored record). Assert `VALIDATION_ERROR` triggers elegantly.
2. Insert empty arrays `[]` into vector columns.

### Category 2: State Pollution & Idempotency

**2.1 HNSW / IVFFLAT Idempotency**
3. Create an HNSW index on `stress_vector_table`. Call drop, then recreate identically. Ensure state logic bounds prevent deadlocks.

### Category 3: Alias & Parameter Combinations

4. Test `m` and `ef_construction` parameter aliases if applicable, mapping them through JS properties.

### Category 4: Error Message Quality

5. Execute similarity searches on tables that do not have `pgvector` columns. Assert `COLUMN_NOT_FOUND` or equivalent validation kicks in avoiding generic syntax crashes.

### Category 5: Large Payload & Truncation Verification

**5.1 High Volume Vector Extracts**
6. Extract 500 embedding rows in code mode and ensure the payload bounds cleanly estimate the token depth, utilizing `.truncated: true` logic if limits are naturally exceeded.

### Category 6: Code Mode Parity

7. Build vector matrices in code mode using native arrays and write them directly into the DB via `upsert` vs native `pg_write_query` to verify serialization parity for JS arrays → Postgres Vectors.

### Final Cleanup

Drop all `stress_vector_*` tables.
