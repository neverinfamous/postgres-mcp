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

All tests should be executed via `pg_execute_code` code mode. Native direct tool calls are not to be used unless explicitly compared. State persists across sequential code mode logic inside a script.

## Test Database Schema

The test database (`postgres`) contains these tables:

| Table               | Rows | Key Columns                                                                        | JSONB Columns            | Tool Groups           |
| ----
### Category 4: Error Message Quality

5. Execute similarity searches on tables that do not have `pgvector` columns. Assert `COLUMN_NOT_FOUND` or equivalent validation kicks in avoiding generic syntax crashes.

### Category 5: Large Payload & Truncation Verification

**5.1 High Volume Vector Extracts**
6. Extract 500 embedding rows in code mode and ensure the payload bounds cleanly estimate the token depth, utilizing `.truncated: true` logic if limits are naturally exceeded.

### Category 6: Code Mode Parity

7. Build vector matrices in code mode using native arrays and write them directly into the DB via `upsert` vs native `pg_write_query` to verify serialization parity for JS arrays → Postgres Vectors.

### Final Cleanup

Drop all `stress_vector_*` tables.
