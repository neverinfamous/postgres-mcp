# Advanced Stress Test — postgres-mcp — Part 1a (Core)

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run any other test files or do anything other than these tests. Ignore distractions in terminal from work being done in other thread.
- All changes **MUST** be consistent with other postgres-mcp tools and `code-map.md`.
- Allow me to handle Lint, typecheck, Vitest, and Playwright. You cannot restart the server in Antigravity as the cache has to be refreshed manually.
- If you have trouble saving task.md, save it to a different location or use a different filename.

## Code Mode Execution

All tests should be executed via `pg_execute_code` code mode. Native direct tool calls are not to be used unless explicitly compared. State persists across sequential code mode logic inside a script.

## Test Database Schema

The test database (`postgres`) contains these tables:

| Table               | Rows | Key Columns                                                                        | JSONB Columns            | Tool Groups           |
| ------------------- | ---- | ---------------------------------------------------------------------------------- | ------------------------ | --------------------- |
| `test_products`     | 15   | id, name, description, price, created_at                                           | —                        | Core, Stats           |
| `test_orders`       | 20   | id, product_id (FK), quantity, total_price, status                                 | —                        | Core, Stats, Trans    |
| `test_jsonb_docs`   | 3    | id                                                                                 | metadata, settings, tags | JSONB (20 tools)      |
| `test_articles`     | 3    | id, title, body, search_vector (TSVECTOR)                                          | —                        | Text                  |
| `test_measurements` | 500  | id, sensor_id (INT 1-6), temperature, humidity, pressure                           | —                        | Stats (19 tools)      |
| `test_embeddings`   | 50   | id, content, category, embedding (vector 384d)                                     | —                        | Vector (16 tools)     |
| `test_locations`    | 5    | id, name, location (GEOMETRY POINT SRID 4326)                                      | —                        | PostGIS (15 tools)    |
| `test_users`        | 3    | id, username (CITEXT), email (CITEXT)                                              | —                        | Citext (6 tools)      |
| `test_categories`   | 6    | id, name, path (LTREE)                                                             | —                        | Ltree (8 tools)       |
| `test_secure_data`  | 0    | id, user_id, sensitive_data (BYTEA), created_at                                    | —                        | pgcrypto (9 tools)    |
| `test_events`       | 100  | id, event_type, event_date, payload (JSONB) — PARTITION BY RANGE                   | payload                  | Partitioning, Partman |
| `test_logs`         | 0    | id, log_level, message, created_at — PARTITION BY RANGE                            | —                        | Partman               |
| `test_departments`  | 3    | id, name, budget                                                                   | —                        | Introspection         |
| `test_employees`    | 5    | id, name, department_id (FK CASCADE), manager_id (FK self-ref SET NULL), hire_date | —                        | Introspection         |
| `test_projects`     | 2    | id, name, lead_id (FK SET NULL), department_id (FK RESTRICT)                       | —                        | Introspection         |
| `test_assignments`  | 3    | id, employee_id (FK CASCADE), project_id (FK CASCADE), role — UNIQUE(emp,proj)     | —                        | Introspection         |
| `test_audit_log`    | 3    | entry_id (no PK!), employee_id (FK, no index!), action, created_at                 | —                        | Introspection         |

Schema objects: `test_schema`, `test_schema.order_seq` (starts at 1000), `test_order_summary` (view), `test_get_order_count()` (function).
Indexes: `idx_orders_status`, `idx_orders_date`, `idx_articles_fts` (GIN), `idx_locations_geo` (GIST), `idx_categories_path` (GIST), HNSW on `test_embeddings.embedding`.

## Testing Requirements

1. Use existing `test_*` tables for read operations (SELECT, COUNT, EXISTS, etc.)
2. Create temporary tables with `stress_*` prefix for write operations (CREATE, INSERT, DROP, etc.)
3. Test each tool with realistic inputs based on the schema above
4. Clean up any `stress_*` tables after testing
5. Report all failures, unexpected behaviors, improvement opportunities, or unnecessarily large payloads
6. Do not mention what already works well or issues well documented in ServerInstructions and runtime hints which are already optimal
7. **Error path testing**: For **every** tool, test at least **two** invalid inputs: (a) a domain error (nonexistent table, invalid column, bad parameter value) and (b) a **Zod validation error** (call the tool with `{}` empty params if it has required parameters, or pass the wrong type). Both must return a **structured handler error** (`{success: false, error: "..."}`) — NOT a raw MCP error frame. See the "Structured Error Response Pattern" section below for how to distinguish the two. This is the most common deficiency found across tool groups.
8. **Advanced Strict Coverage Matrix**: You must create a markdown table tracking your progress in your `task.md` in C:\Users\chris\Desktop\postgres-mcp\tmp. For EVERY tool in the advanced test categories, you must explicitly track completions. Do not proceed to the final summary until every check is marked with a ✅.
9. **Scripting Efficiency**: You should bundle multiple tool checks into a single `pg_execute_code` call to save LLM context window tokens. Use conditional checks to aggregate errors and return a `failures` array.
10. **Pacing**: Test up to an entire tool group in a single script if feasible, but limit scripts to ~10-15 steps to remain manageable. Report the aggregated results, update your matrix, and move to the next group.
11. **Deterministic checklist first**: Complete ALL items in the Deterministic Checklist below using Code Mode before moving to the Strict Coverage Matrix exploration.
12. **Audit backup tools**: The 3 `pg_audit_*` tools require `--audit-backup` to be enabled on the test server. When enabled, destructive operations (`pg_truncate`, `pg_drop_table`, `pg_vacuum`, etc.) create gzip-compressed `.snapshot.json.gz` files alongside the audit log. **V2 features to verify**: `pg_audit_diff_backup` now returns a `volumeDrift` field (row count + size changes); `pg_audit_restore_backup` supports `restoreAs` for side-by-side non-destructive restore; and Code Mode calls through `pg_execute_code` that trigger destructive operations are also captured by the interceptor. When disabled, all 3 tools return `{success: false, error: "Audit backup not enabled"}`.

Note: The isError flag propagation issue has been fixed. P154 structured errors (`{success: false, error: "..."}`) return as parseable JSON objects. During error path testing, verify this: if an invalid Code Mode call returns a raw error string instead of a JSON object with `success` and `error` fields, report it as ❌.


## Structured Error Response Pattern

All tools must return errors as structured objects instead of throwing. A thrown error propagates as a raw MCP error, which is unhelpful to clients. The expected pattern:

```json
{ "success": false, "error": "Human-readable error message", "code": "QUERY_ERROR", "category": "query", "recoverable": false }
```

The enriched `ErrorResponse` from `formatHandlerError` always includes `success`, `error`, `code`, `category`, and `recoverable`. Optional fields `suggestion` and `details` may also be present. Some tools include additional context fields (e.g., `pg_transaction_execute` includes `statementsExecuted`, `failedStatement`, `autoRolledBack`). These are acceptable as long as `success: false` and `error` are always present.

### Handler Error vs MCP Error — How to Distinguish

There are two kinds of error responses. Only one is correct:

| Type | Source | What you see | Verdict |
|------|--------|--------------|---------|
| **Handler error** ✅ | Handler catches error and returns `{success: false, error: "..."}` | Parseable JSON object with `success` and `error` fields | Correct |
| **MCP error** ❌ | Uncaught throw propagates to MCP framework | Raw text error string, often prefixed with `Error:`, wrapped in an `isError: true` content block — no `success` field | Bug — report as ❌ |

**Concrete examples:**

```
✅ Handler error (correct):
{"success": false, "error": "Table \"public.nonexistent\" does not exist"}

❌ MCP error (bug — handler threw instead of catching):
content: [{type: "text", text: "Error: relation \"nonexistent\" does not exist"}]
isError: true
```

The MCP error case means the handler is missing a `try/catch` block. When testing, if you see a raw error string (especially one containing PostgreSQL internal messages like `relation "..." does not exist` without a `success` field), report it as ❌.

### Zod Validation Errors

Calling a tool with wrong parameter types or missing required fields triggers a Zod validation error. If the handler has no outer `try/catch`, this surfaces as a raw MCP error. Test every tool with `{}` (empty params) if it has required parameters — the response must be a handler error, not an MCP error.

**Error message format matters:** Zod `.refine()` failures produce a `ZodError` whose `.message` property is a **raw JSON array** of Zod issues (e.g., `[{"code":"custom","message":"..."}]`). If the handler catches the error with `error.message` instead of routing through `formatHandlerError`, this raw JSON leaks as the error string. All handlers must route through `formatHandlerError`, which duck-types the `.issues` array and produces clean `Validation error: name (or table alias) is required; Validation error: columns must not be empty` messages. If you see a raw JSON array in an error message, report it as ❌.

**Zod refinement leak pattern:** The Split Schema pattern uses `.partial()` on input schemas so the SDK accepts `{}`. But `.partial()` only makes keys **optional** — it does NOT strip refinements like `.min(1)`, `.max(90)`, or `.min(-90).max(90)`. This applies to **ALL types** — strings, arrays, AND numbers:

- `z.string().min(1)` + empty `""` → SDK rejects with raw MCP `-32602`
- `z.array().min(1)` + empty `[]` → SDK rejects with raw MCP `-32602`
- `z.number().min(-90).max(90)` + value `91` → SDK rejects with raw MCP `-32602`

**Fix:** Remove ALL `.min(N)` / `.max(N)` refinements from the schema and validate inside the handler instead. Optional fields with `.default()` are safe because the default satisfies the constraint.

**Required enum coercion pattern:** For **optional** enum params with defaults, `z.preprocess(coercer, z.enum([...]).optional().default(...))` works — the coercer returns `undefined` for invalid values → the `.default()` kicks in. For **required** enum params (no `.optional().default(...)`), this pattern **fails**: the SDK's `.partial()` wraps the preprocess in `.optional()`, but the inner `z.enum()` still rejects `undefined` → raw MCP `-32602`. **Fix:** Use `z.string()` in the schema and validate the enum inside the handler's `try/catch`, returning a structured error.

**What to report:**

- If a tool call returns a raw MCP error (no JSON body with `success` field), report it as ❌ with the tool name and the raw error message
- If a tool returns `{success: false, error: "..."}` but the error string is a raw Zod JSON array (starts with `[{`), report as ❌ (handler uses `error.message` instead of `formatHandlerError`)
- If a tool returns `{success: false, error: "Validation error: ..."}` with clean human-readable text, that is the correct behavior — do not report it as a failure
- If a tool returns a successful response for an obviously invalid input (e.g., nonexistent table returns `{success: true}`), report it as ⚠️

## Split Schema Pattern Verification

All tools use the Split Schema pattern: a plain `z.object()` Base schema for MCP parameter visibility (used as `inputSchema`), and handler-side parsing via `z.preprocess()`, `.default({})`, or direct `.parse()` inside `try/catch`. Verify:

1. **JSON Schema visibility**: Before testing tool behavior, call `tools/list` (or inspect the MCP server's tool definitions) and confirm each tool's `inputSchema` exposes its parameters. Tools with optional parameters (e.g., `schema`, `limit`, `direction`) must show non-empty `properties` in the JSON Schema. If a tool's `inputSchema` is empty or missing `properties`, report as a Split Schema violation.
2. **Parameter visibility**: For tools with optional parameters (e.g., `schema`, `limit`), make a Code Mode call using those parameters. If the tool ignores or rejects documented parameters, report as a Split Schema violation.
3. **Alias acceptance**: For tools with documented parameter aliases (e.g., table/tableName/name, sql/query), verify that Code Mode calls correctly accept the aliases—not just the primary parameter name. If a call using only an alias fails with a validation error like "X is required", report it as a Split Schema violation requiring a fix.
4. **`z.preprocess()` as `inputSchema`**: If a tool uses `z.preprocess()` directly as its `inputSchema` (instead of a plain `SchemaBase`), parameter metadata is stripped from JSON Schema generation, making MCP tooling unable to see or use those parameters. Report as a Split Schema violation.

## P154 Object Existence Verification

All tools should return structured error responses for nonexistent tables/schemas (via `formatHandlerError`). The 5 core convenience tools (pg_count, pg_exists, pg_upsert, pg_batch_insert, pg_truncate) implement explicit pre-checks and serve as canonical verification targets. Beyond those, **every tool group must have at least one nonexistent-table test in its checklist** — see the error-path items (marked 🔴) in each group's checklist in `test-group-tools.md`.

For each P154 test, verify that calling with a nonexistent table (e.g., `table: "nonexistent_table_xyz"`) returns a handler error like `{success: false, error: "Table \"public.nonexistent_table_xyz\" does not exist"}` rather than a raw MCP error. Also verify that a nonexistent schema (e.g., `table: "fake_schema.users"`) produces a similarly clear handler error.

Key PostgreSQL error codes that should be intercepted by `formatHandlerError` (not leaked as raw errors):

| PG Error Code | Meaning | Expected Structured Message |
|---------------|---------|---------------------------|
| 42P01 | Undefined table | `Table "X" does not exist` |
| 42P06 | Duplicate schema | `Schema "X" already exists` |
| 42P07 | Duplicate table | `Table "X" already exists` |
| 42701 | Duplicate column | `Column "X" already exists` |
| 42703 | Undefined column | `Column "X" does not exist` |
| 23505 | Unique violation | `Duplicate key: ...` |
| 23503 | FK violation | `Foreign key constraint violated` |
| 42601 | Syntax error | `SQL syntax error: ...` |
| 3F000 | Invalid schema name | `Schema "X" does not exist` |
| XX000 | Internal error | `Internal error: ...` |

## Error Consistency Audit

During testing, check for these inconsistencies across tool groups:

1. **Throw-vs-return**: If a tool throws a raw error instead of returning `{success: false}`, report as ❌. Document which tool groups have the worst raw-error leakage.
2. **Error field name**: All `{ success: false }` error responses should use `error` as the field name. If a tool uses a different field name for error context in a failure response, report as ⚠️.
3. **Zod validation leaks**: If calling a tool with an invalid enum value or missing required field produces a raw MCP `-32602` Zod validation error instead of a structured response, report as ❌. This indicates the Zod schema is rejecting the input at the MCP framework level before the handler's `try/catch` can intercept.
4. **Missing `formatHandlerError` wrapping**: postgres-mcp has a centralized `formatHandlerError` helper. If a handler catches errors but returns ad-hoc messages instead of using the centralized formatter, report which handler and the ad-hoc message pattern.
5. **Orphaned output schemas**: If a schema is exported from `src/adapters/postgresql/schemas/` but the corresponding tool definition does not reference it via `outputSchema`, report as ⚠️. Use `grep_search` to check whether the schema name appears in any tool file. Defined-but-unwired schemas provide zero enforcement.
6. **Inline output schemas**: If any tool defines `outputSchema: z.object({...})` inline in the handler file instead of importing a named schema from the `schemas/` directory, report as ⚠️. All output schemas must live in the appropriate `schemas/` directory with named exports.

## Error Path Testing Checklist

For each tool group under test, verify at least one scenario from each applicable row:

| Error Scenario | Tool Groups to Test | Example Input |
|----------------|-------------------|---------------|
| Nonexistent table | All table-accepting tools | `table: "nonexistent_xyz"` |
| Nonexistent schema | Core, introspection, schema | `schema: "fake_schema"` or `table: "fake_schema.users"` |
| Invalid SQL syntax | Core (`read_query`, `write_query`) | `sql: "SELECTT * FROM"` |
| Invalid column name | Stats, JSONB, text, vector, PostGIS | `column: "nonexistent_col"` |
| Duplicate table/index | Core (`create_table`, `create_index`) | Create existing table |
| Empty required array | Transactions | `statements: []` |
| Missing required field via alias | Core, transactions | `sql` alias instead of `query` |
| **Zod validation (empty params)** | **Every tool with required params** | `{}` (empty object — must return handler error, not MCP `-32602` error) |
| **Zod validation (wrong type)** | **Tools with typed params** | Pass string where number expected, etc. |

## Cleanup Conventions

During testing, use these naming conventions:

- **Temporary tables**: Prefix with `stress_` (e.g., `stress_analysis_results`)
- **Test views**: Prefix with `test_view_` (e.g., `test_view_order_summary`)
- **Test functions**: Prefix with `test_func_` (e.g., `test_func_calculate`)
- **Test schemas**: Prefix with `test_schema_` (e.g., `test_schema_temp`)

After testing, clean up:

```sql
-- List temp tables
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'stress_%';

-- Drop temp table
DROP TABLE IF EXISTS stress_my_test_table;
```

## Post-Test Procedures

### Reporting Rules

- Use ✅ only in inline notes during testing; omit from Final Summary
- Do not mention what already works well or issues already documented in server-instructions.md and runtime hints

### After Testing

1. **Cleanup**: Confirm all `stress_*` tables and temporary testing data are removed
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, 📦 Payload problems (responses that should be truncated or offer a `limit` param) and files listed below. All changes MUST be consistent with other postgres-mcp tools and `code-map.md`
3. **Scope of fixes** includes corrections to any of:
   - Handler code
   - `server-instructions.md`
   - Test database (`test-database.sql`)
   - This prompt (`test-tools-codemode.md`) and group file (`test-group-tools-codemode.md`)
4. Update the changelog with any changes made (being careful not to create duplicate headers), and commit without pushing.
5. **Token Audit**: Before concluding, call `read_resource` on `postgres://audit` to retrieve the `sessionTokenEstimate` (total token usage) for your testing session. Include this "Total Token Usage" in your final test report and session summary. Highlight the single most expensive Code Mode execution block.
6. Stop and briefly summarize the testing results and fixes, **ensuring the total token count is prominently displayed.**

---

## core Group Advanced Tests

### core Group Tools (20 +1 code mode)

1. pg_read_query
2. pg_write_query
3. pg_list_tables
4. pg_describe_table
5. pg_create_table
6. pg_drop_table
7. pg_get_indexes
8. pg_create_index
9. pg_drop_index
10. pg_list_objects
11. pg_object_details
12. pg_list_extensions
13. pg_analyze_db_health
14. pg_analyze_workload_indexes
15. pg_analyze_query_indexes
16. pg_upsert
17. pg_batch_insert
18. pg_count
19. pg_exists
20. pg_truncate
21. pg_execute_code (auto-added)

### Category 1: Boundary Values & Empty States

**1.1 Empty Table Operations**

Create `stress_empty_table (id SERIAL PRIMARY KEY, name TEXT, value DECIMAL(10,2))`, then test:

1. `pg_count` on `stress_empty_table` → expect `{count: 0}`
2. `pg_exists` on `stress_empty_table` (no WHERE) → expect `{exists: false, mode: "any_rows"}` (Note: evaluates if rows exist, not table schema existence, so returning TABLE_NOT_FOUND for nonexistent tables is expected)
3. `pg_stats_descriptive` on `stress_empty_table` column `value` → expect graceful error or empty stats (not a crash)
4. `pg_copy_export` on `stress_empty_table` → expect `{rowCount: 0}` or empty data
5. `pg_dump_table` on `stress_empty_table` → expect valid DDL
6. `pg_schema_snapshot` with `sections: ["tables"]` → verify `stress_empty_table` appears

**1.2 Single-Row Table**

Insert one row into `stress_empty_table` (name: 'solo', value: 42.00), then test:

7. `pg_stats_descriptive` → expect valid stats (mean=42, stddev=0 or null)
8. `pg_stats_percentiles` with `[0.25, 0.5, 0.75]` → all should equal 42

**1.3 NULL-Heavy Data**

Insert 5 rows into `stress_empty_table` with: 3 rows where `name IS NULL` and `value IS NULL`, 2 rows with actual values.

9. `pg_count` with `column: "value"` → expect 3 (COUNT of non-null values: solo + real1 + real2)
10. `pg_exists` with `where: "value IS NULL"` → expect `{exists: true}`
11. `pg_copy_export` → verify NULL representation in CSV output

**1.4 Extreme Numeric Values**

Insert into `stress_empty_table`: `(name: 'max', value: 99999999.99)`, `(name: 'min', value: -99999999.99)`, `(name: 'zero', value: 0.00)`, `(name: 'tiny', value: 0.01)`

12. `pg_stats_descriptive` → verify mean, min, max are correct
13. `pg_batch_insert` with 100 rows using `generate_series` equivalent via code mode → verify `insertedCount: 100`

### Category 2: State Pollution & Idempotency

**2.1 Create-Drop-Recreate Cycles**

14. `pg_create_table` → create `stress_cycle_table (id INT PRIMARY KEY, data TEXT)`
15. `pg_create_index` → create `stress_idx_cycle` on `stress_cycle_table(data)`
16. `pg_drop_index` → drop `stress_idx_cycle` → expect `{existed: true}`
17. `pg_drop_index` → drop `stress_idx_cycle` again with `ifExists: true` → expect `{existed: false}` (not error)
18. `pg_create_index` → create `stress_idx_cycle` again → expect success
19. `pg_drop_table` → drop `stress_cycle_table` → expect `{existed: true}`
20. `pg_drop_table` → drop `stress_cycle_table` again with `ifExists: true` → expect `{existed: false}`
21. `pg_create_table` → recreate `stress_cycle_table` → expect success (no orphaned metadata)

**2.2 Duplicate Object Detection**

22. `pg_create_table` with `ifNotExists: true` on `test_products` → expect success with indication it already exists
23. `pg_create_index` with `ifNotExists: true` on `idx_orders_status` (on table `test_orders`) → expect `{alreadyExists: true}`
24. `pg_create_schema` with `ifNotExists: true` on `public` → expect graceful handling
25. `pg_create_view` with `orReplace: true` on `test_order_summary` using the same query (`SELECT o.status, o.total_price FROM test_orders o`) → expect success

### Category 3: Alias & Parameter Combinations

**3.1 Core Tool Alias Matrix (aliases NOT covered in first-level testing)**

First-level tests already cover: `pg_count` with `tableName`/`condition`, `pg_read_query` with `query`, `pg_exists` with `tableName`, `pg_describe_table` with `name`, `pg_analyze_query_indexes` with `query`. Test the remaining aliases here:

| Tool             | Primary Param | Test with Alias                                                                            | Expected Behavior              |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------ | ------------------------------ |
| `pg_write_query` | `sql`         | `{query: "UPDATE test_products SET name = name WHERE id = 1"}`                             | Returns `{rowsAffected: 1}`    |
| `pg_count`       | `where`       | `{table: "test_products", filter: "price > 50"}`                                           | Returns count > 0 (`filter` alias) |
| `pg_exists`      | `where`       | `{table: "test_products", filter: "id = 1"}`                                               | Returns `{exists: true}` (`filter` alias) |
| `pg_upsert`      | `data`        | `{table: "stress_cycle_table", values: {id: 999, data: "alias"}, conflictColumns: ["id"]}` | Returns success (`values` alias) |
| `pg_drop_table`  | `table`       | `{name: "stress_does_not_exist", ifExists: true}`                                          | Returns `{existed: false}` (`name` alias) |
| `pg_drop_table`  | `table`       | `{tableName: "stress_does_not_exist", ifExists: true}`                                     | Returns `{existed: false}` (`tableName` alias) |

**3.2 Schema-Qualified Table Names**

Test `schema.table` parsing on these tools (use `public.test_products`):

26. `pg_count({table: "public.test_products"})` → expect `{count: 15}`
27. `pg_exists({table: "public.test_products"})` → expect `{exists: true}`
28. `pg_describe_table({table: "public.test_products"})` → expect column info
29. `pg_stats_descriptive({table: "public.test_products", column: "price"})` → expect stats
30. `pg_dump_table({table: "public.test_products"})` → expect DDL
31. `pg_copy_export({table: "public.test_products", limit: 5})` → expect 5 rows

Also test with `test_schema.order_seq`: 32. `pg_list_sequences({schema: "test_schema"})` → expect `order_seq`
