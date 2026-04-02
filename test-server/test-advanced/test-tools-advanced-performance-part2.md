# Advanced Stress Test — postgres-mcp — performance Group

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

Ensure tools predictably return typed `VALIDATION_ERROR`, etc.

11. `pg_table_stats` → Target `{table: "fake_ghost_table"}` natively. Assert rigorous propagation of `TABLE_NOT_FOUND` exceptions directly.
12. `pg_index_stats` → Pass `{schema: "non_existent_void"}`. Assess if the execution handles mapping errors strictly (`SCHEMA_NOT_FOUND`) natively.
13. `pg_query_plan_compare` → Attempt to compare a valid query against a structurally non-parseable query (`sqlB: "DELETE FROM * WHERE"`). Assess which format handler maps the underlying execution exception.

### Category 5: Extensions & Graceful Degradation Testing

14. `pg_diagnose_database_performance` → Validate global execution bounds natively. Ensure that if pg_stat_statements is somehow limited, the diagnostic engine emits `overallStatus: "warning"` or degraded health properties rather than violently crashing.
15. `pg_stat_statements` → Request stats using `limit: 5`. Assess `metrics.tokenEstimate` natively across large queries versus explicit bounds mappings.

### Category 6: Extended Cross-Schema Formatting

16. `pg_explain_buffers` → Verify the code mode handler accepts parameterized inputs native formatting schemas cleanly (e.g., passing explicit values into positional mappings via parameter bindings natively without coercion faults).

### Category 7: Large Payload & Truncation Verification

Ensure sweeping reads cap context window exposure.

17. `pg_locks` → Track active locks safely across concurrent environment setups natively. Ensure return map binds and truncates `limit` values strictly to prevent memory extraction payloads internally if exceeding contextual scope natively (`metrics.tokenEstimate`).
18. `pg_stat_activity` → Fetch all system processes natively using default mappings. Examine output JSON size natively if bounded bounds protect downstream limits efficiently natively.

### Final Cleanup

19. Native Execution -> Drop any experimental items created solely to trigger specific path faults natively within the `stress_perf_*` space securely.
