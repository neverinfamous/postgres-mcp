# postgres-mcp Tool Group **COMPLETE** Re-Testing

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using direct MCP tool calls, **NOT** codemode.
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not put temp files in root; Use C:\Users\chris\Desktop\postgres-mcp\tmp

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized — **blocking, equally important as ❌ bugs**. Oversized payloads waste LLM context window tokens and degrade downstream tool-calling quality. Report the response size in KB and suggest a concrete optimization (e.g., filter system tables, add `compact` option, omit empty arrays).

> **Token estimates**: Every tool response includes `_meta.tokenEstimate` in its `content[].text` payload (approximate token count based on ~4 bytes/token). Code Mode responses include `metrics.tokenEstimate` instead. These are injected automatically by the adapter — no per-tool assertions needed, but report as ⚠️ if absent.

## Test Database Schema

The test database (`postgres`) contains these tables:

| Table               | Rows | Key Columns                                                                        | JSONB Columns            | Tool Groups           |
| ------------------- | ---- | ---------------------------------------------------------------------------------- | ------------------------ | --------------------- |
| `test_products`     | 15   | id, name, description, price, created_at                                           | —                        | Core, Stats           |
| `test_orders`       | 20   | id, product_id (FK), quantity, total_price, status                                 | —                        | Core, Stats, Trans    |
| `test_jsonb_docs`   | 3    | id                                                                                 | metadata, settings, tags | JSONB (20 tools)      |
| `test_articles`     | 3    | id, title, body, search_vector (TSVECTOR)                                          | —                        | Text                  |
| `test_measurements` | 640  | id, sensor_id (INT 1-6), temperature, humidity, pressure                           | —                        | Stats (19 tools)      |
| `test_embeddings`   | 75   | id, content, category, embedding (vector 384d)                                     | —                        | Vector (16 tools)     |
| `test_locations`    | 25   | id, name, location (GEOMETRY POINT SRID 4326)                                      | —                        | PostGIS (15 tools)    |
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

> **Note:** Row counts reflect the post-seed state after both `test-database.sql` and `test-resources.sql` run. The resource seed adds ~200 measurements (minus deletions by `id % 5 = 0 AND id > 400`), 25 embeddings (IDs 51-75), and 20 locations (IDs 6-25).
Indexes: `idx_orders_status`, `idx_orders_date`, `idx_articles_fts` (GIN), `idx_locations_geo` (GIST), `idx_categories_path` (GIST), HNSW on `test_embeddings.embedding`.

## Testing Requirements

1. Use existing `test_*` tables for read operations (SELECT, COUNT, EXISTS, etc.)
2. Create temporary tables with `temp_*` prefix for write operations (CREATE, INSERT, DROP, etc.)
3. Test each tool with realistic inputs based on the schema above
4. Clean up any `temp_*` tables after testing
5. Report all failures, unexpected behaviors, improvement opportunities, or unnecessarily large payloads
6. Do not mention what already works well or issues well documented in ServerInstructions and runtime hints which are already optimal
7. **Error path testing**: For **every** tool, test at least **two** invalid inputs: (a) a domain error (nonexistent table, invalid column, bad parameter value) and (b) a **Zod validation error** (call the tool with `{}` empty params if it has required parameters, or pass the wrong type). Both must return a **structured handler error** (`{success: false, error: "..."}`) — NOT a raw MCP error frame. See the "Structured Error Response Pattern" section below for how to distinguish the two. This is the most common deficiency found across tool groups.
8. **Strict Coverage Matrix**: You must create a markdown table tracking your progress in your `task.md`. For EVERY tool in the group, you must explicitly log: Direct Call (Happy Path), Domain Error (Direct Call), Zod Empty Param (Direct Call), and Alias Acceptance (if applicable). Do not proceed to the final summary until every cell in this matrix is marked with a ✅.
9. **No Scripted Loops**: You must test each error path by writing an individual, distinct tool call.
10. **Pacing**: Test a maximum of 3-5 tools at a time. Report the results, update your matrix, and then move on to the next chunk.
11. **Deterministic checklist first**: Complete ALL items in the Deterministic Checklist below before moving to the Strict Coverage Matrix exploration. The checklist uses exact inputs and expected outputs to ensure reproducible coverage every run.
12. **Audit backup tools**: The 3 `pg_audit_*` tools require `--audit-backup` to be enabled on the test server. When enabled, destructive operations (`pg_truncate`, `pg_drop_table`, `pg_vacuum`, etc.) create gzip-compressed `.snapshot.json.gz` files alongside the audit log. **V2 features to verify**: `pg_audit_diff_backup` now returns a `volumeDrift` field (row count + size changes); `pg_audit_restore_backup` supports `restoreAs` for side-by-side non-destructive restore; and Code Mode calls through `pg_execute_code` that trigger destructive operations are also captured by the interceptor. When disabled, all 3 tools return `{success: false, error: "Audit backup not enabled"}`.

Note: The isError flag propagation issue has been fixed. P154 structured errors (`{success: false, error: "..."}`) now return as parseable JSON objects via direct tool calls — not as raw MCP error strings. During error path testing, verify this: if a direct tool call for a nonexistent schema/table returns a raw error string instead of a JSON object with `success` and `error` fields, report it as ❌.

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
2. **Parameter visibility**: For tools with optional parameters (e.g., `schema`, `limit`), make a direct MCP call using those parameters. If the tool ignores or rejects documented parameters, report as a Split Schema violation.
3. **Alias acceptance**: For tools with documented parameter aliases (e.g., table/tableName/name, sql/query), verify that direct MCP tool calls correctly accept the aliases—not just the primary parameter name. If a direct call using only an alias fails with a validation error like "X is required", report it as a Split Schema violation requiring a fix.
4. **`z.preprocess()` as `inputSchema`**: If a tool uses `z.preprocess()` directly as its `inputSchema` (instead of a plain `SchemaBase`), parameter metadata is stripped from JSON Schema generation, making direct MCP calls unable to see or use those parameters. Report as a Split Schema violation.

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

- **Temporary tables**: Prefix with `temp_` (e.g., `temp_analysis_results`)
- **Test views**: Prefix with `test_view_` (e.g., `test_view_order_summary`)
- **Test functions**: Prefix with `test_func_` (e.g., `test_func_calculate`)
- **Test schemas**: Prefix with `test_schema_` (e.g., `test_schema_temp`)

After testing, clean up:

```sql
-- List temp tables
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'temp_%';

-- Drop temp table
DROP TABLE IF EXISTS temp_my_test_table;
```

## Post-Test Procedures

### Reporting Rules

- Use ✅ only in inline notes during testing; omit from Final Summary
- Do not mention what already works well or issues already documented in server-instructions.md and runtime hints

### After Testing

1. **Cleanup**: Confirm all `temp_*` tables and temporary testing data are removed including any files created during testing.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in the files listed below, and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
3. **Read `code-map.md` before making changes and make all changes consistent with other tools.**
4. **Scope of fixes** includes corrections to any of:
   - Handler code
   - `server-instructions.md`
   - Test database (`test-database.sql`)
   - This prompt (`test-tools.md`) and group file (`test-group-tools.md`)
5. **User will handle validation**
6. Update the changelog if there were any changes made (being careful not to create duplicate headers), and commit without pushing.
7. Create a /session-summary in memory-journal-mcp for the issues and their fixes.
8. Stop and briefly summarize the issues and their fixes.

---

## Part 3: Analytics & Spatial

> This is Part 3: Analytics & Spatial of the testing suite. After finishing these groups, move on to the next part in a new thread.

---

### stats Group-Specific Testing

stats Group (19 tools +1 for code mode)

1. 'pg_stats_descriptive'
2. 'pg_stats_percentiles'
3. 'pg_stats_correlation'
4. 'pg_stats_regression'
5. 'pg_stats_time_series'
6. 'pg_stats_distribution'
7. 'pg_stats_hypothesis'
8. 'pg_stats_sampling'
9. 'pg_stats_row_number'
10. 'pg_stats_rank'
11. 'pg_stats_lag_lead'
12. 'pg_stats_running_total'
13. 'pg_stats_moving_avg'
14. 'pg_stats_ntile'
15. 'pg_stats_outliers'
16. 'pg_stats_top_n'
17. 'pg_stats_distinct'
18. 'pg_stats_frequency'
19. 'pg_stats_summary'
20. 'pg_execute_code' (codemode, auto-added)

> **Instructions**: Execute every numbered checklist item with the exact inputs shown using DIRECT TOOL CALLS ONLY. Skip any items specifically testing `pg_execute_code` or Code Mode Parity. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

**Test data:** Uses `test_measurements` (500 rows, sensor_id 1-6, columns: temperature, humidity, pressure, measured_at).

**Original 8 tools — Checklist:**

1. `pg_stats_descriptive({table: "test_measurements", column: "temperature"})` → verify `mean`, `stddev`, `min`, `max` present
2. `pg_stats_percentiles({table: "test_measurements", column: "temperature", percentiles: [0.25, 0.5, 0.75]})` → verify 3 percentile values
3. `pg_stats_correlation({table: "test_measurements", column1: "temperature", column2: "humidity"})` → verify correlation value between -1 and 1
4. `pg_stats_distribution({table: "test_measurements", column: "temperature", buckets: 10})` → verify `buckets` array with 10 entries
5. `pg_stats_time_series({table: "test_measurements", timeColumn: "measured_at", valueColumn: "temperature", interval: "day"})` → verify time series data returned
6. `pg_stats_sampling({table: "test_measurements", sampleSize: 10})` → verify exactly 10 rows returned
7. `pg_stats_sampling({table: "test_measurements", method: "bernoulli", percentage: 10})` → verify sample returned with `method: "bernoulli"`
8. `pg_stats_hypothesis({table: "test_measurements", column: "temperature", hypothesizedMean: 27})` → verify `results.pValue` present

**Window function tools:**

9. `pg_stats_row_number({table: "test_measurements", orderBy: "measured_at", limit: 5})` → verify 5 rows returned, each with `row_number` field (1-5)
10. `pg_stats_row_number({table: "test_measurements", orderBy: "measured_at", partitionBy: "sensor_id", limit: 10})` → verify `row_number` resets per sensor_id partition
11. `pg_stats_rank({table: "test_measurements", orderBy: "temperature", limit: 5})` → verify rows with `rank` field
12. `pg_stats_rank({table: "test_measurements", orderBy: "temperature", method: "dense_rank", limit: 5})` → verify `dense_rank` — no gaps in ranking
13. `pg_stats_lag_lead({table: "test_measurements", column: "temperature", orderBy: "measured_at", direction: "lag", limit: 5})` → verify rows with `lag_value` field; first row's `lag_value` should be null
14. `pg_stats_lag_lead({table: "test_measurements", column: "temperature", orderBy: "measured_at", direction: "lead", offset: 2, limit: 5})` → verify `lead_value` with offset 2
15. `pg_stats_running_total({table: "test_measurements", column: "temperature", orderBy: "measured_at", limit: 5})` → verify rows with `running_total` field, monotonically increasing
16. `pg_stats_running_total({table: "test_measurements", column: "temperature", orderBy: "measured_at", partitionBy: "sensor_id", limit: 10})` → verify `running_total` resets per sensor_id
17. `pg_stats_moving_avg({table: "test_measurements", column: "temperature", orderBy: "measured_at", windowSize: 5, limit: 5})` → verify rows with `moving_avg` field
18. `pg_stats_ntile({table: "test_measurements", column: "temperature", orderBy: "temperature", buckets: 4, limit: 10})` → verify rows with `ntile` field (values 1-4)

**Outlier detection and analysis tools:**

19. `pg_stats_outliers({table: "test_measurements", column: "temperature"})` → verify `{outliers, outlierCount, method, stats}` where `method` is `"iqr"` (default)
20. `pg_stats_outliers({table: "test_measurements", column: "temperature", method: "zscore", threshold: 2})` → verify same shape with `method: "zscore"`
21. `pg_stats_top_n({table: "test_measurements", column: "temperature", n: 3})` → verify exactly 3 rows, descending order by default
22. `pg_stats_top_n({table: "test_measurements", column: "temperature", n: 3, direction: "asc"})` → verify 3 rows in ascending order
23. `pg_stats_distinct({table: "test_measurements", column: "sensor_id"})` → verify `{values, distinctCount}` with `distinctCount` of 6 (sensors 1-6)
24. `pg_stats_frequency({table: "test_measurements", column: "sensor_id"})` → verify `{distribution}` array with value, count, and percentage for each sensor
25. `pg_stats_summary({table: "test_measurements"})` → verify multi-column summary auto-detecting numeric columns (temperature, humidity, pressure)
26. `pg_stats_summary({table: "test_measurements", columns: ["temperature", "humidity"]})` → verify summary for exactly 2 specified columns

**Domain error paths (🔴):**

27. 🔴 `pg_stats_descriptive({table: "nonexistent_xyz", column: "x"})` → `{success: false, error: "..."}` handler error
28. 🔴 `pg_stats_percentiles({})` → `{success: false, error: "..."}` (Zod validation)
29. 🔴 `pg_stats_row_number({})` → `{success: false, error: "..."}` (Zod validation — missing required `table`, `orderBy`)
30. 🔴 `pg_stats_outliers({table: "nonexistent_xyz", column: "x"})` → `{success: false, error: "..."}` handler error
31. 🔴 `pg_stats_frequency({table: "test_measurements", column: "nonexistent_col_xyz"})` → `{success: false, error: "..."}` handler error mentioning column

**Wrong-type numeric param coercion (🔴):**

32. 🔴 `pg_stats_sampling({table: "test_measurements", sampleSize: "abc"})` → must NOT return raw MCP `-32602` error — should return handler error or silently default `sampleSize` (wrong-type numeric param)
33. 🔴 `pg_stats_distribution({table: "test_measurements", column: "temperature", buckets: "abc"})` → must NOT return raw MCP `-32602` error — should return handler error or silently default `buckets` (wrong-type numeric param)
34. 🔴 `pg_stats_top_n({table: "test_measurements", column: "temperature", n: "abc"})` → must NOT return raw MCP `-32602` error — should return handler error or silently default `n` (wrong-type numeric param)

**Code mode parity:**

35. `pg_execute_code({code: "return await pg.stats.help()"})` → verify lists all 19 stats methods including `rowNumber`, `rank`, `lagLead`, `runningTotal`, `movingAvg`, `ntile`, `outliers`, `topN`, `distinct`, `frequency`, `summary`
36. `pg_execute_code({code: "return await pg.stats.outliers({table: 'test_measurements', column: 'temperature'})"})` → verify returns same structure as item 19
37. `pg_execute_code({code: "return await pg.stats.distinct({table: 'test_measurements', column: 'sensor_id'})"})` → verify returns same structure as item 23

---

### partitioning Group-Specific Testing

partitioning Tool Group (6 tools +1 for code mode)

1. 'pg_list_partitions'
2. 'pg_create_partition'
3. 'pg_attach_partition'
4. 'pg_detach_partition'
5. 'pg_partition_info'
6. 'pg_create_partitioned_table'
7. 'pg_execute_code' (codemode, auto-added)

> **Instructions**: Execute every numbered checklist item with the exact inputs shown using DIRECT TOOL CALLS ONLY. Skip any items specifically testing `pg_execute_code` or Code Mode Parity. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

**Test data:** Uses `test_events`: `PARTITION BY RANGE (event_date)` with 4 quarterly partitions (`test_events_2024_q1` through `test_events_2024_q4`).

**Checklist:**

1. `pg_list_partitions({table: "test_events"})` → verify 4 quarterly partitions listed
2. `pg_partition_info({table: "test_events"})` → verify `{tableInfo, partitions, totalSizeBytes}`
3. `pg_list_partitions({table: "test_events", limit: 2})` → verify `{truncated: true, totalCount: 4}`
4. 🔴 `pg_list_partitions({table: "nonexistent_table_xyz"})` → `{success: false, error: "..."}` handler error
5. 🔴 `pg_partition_info({})` → `{success: false, error: "..."}` (Zod validation)

---

### vector Group-Specific Testing

vector Tool Group (16 tools +1 for code mode)

1. pg_vector_create_extension
2. pg_vector_add_column
3. pg_vector_insert
4. pg_vector_batch_insert
5. pg_vector_search
6. pg_vector_create_index
7. pg_vector_distance
8. pg_vector_normalize
9. pg_vector_aggregate
10. pg_vector_validate
11. pg_vector_cluster
12. pg_vector_index_optimize
13. pg_hybrid_search
14. pg_vector_performance
15. pg_vector_dimension_reduce
16. pg_vector_embed
17. pg_execute_code (codemode, auto-added)

> **Instructions**: Execute every numbered checklist item with the exact inputs shown using DIRECT TOOL CALLS ONLY. Skip any items specifically testing `pg_execute_code` or Code Mode Parity. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

**Test data:** Uses `test_embeddings` with 384-dimension vectors (50 rows, 5 categories: tech, science, business, sports, entertainment). HNSW index on `embedding` column using cosine distance.

**Checklist** (Use Code Mode for vector operations to avoid truncation):

1. Via code mode: read first embedding from `test_embeddings`, then search with it → verify results returned with distances
2. `pg_vector_validate({vector: [1.0, 2.0, 3.0]})` → `{valid: true, vectorDimensions: 3}`
3. `pg_vector_validate({vector: []})` → `{valid: true, vectorDimensions: 0}`
4. `pg_vector_distance({vector1: [1,0,0], vector2: [0,1,0], metric: "cosine"})` → verify distance returned
5. `pg_vector_normalize({vector: [3, 4]})` → `{normalized: [0.6, 0.8], magnitude: 5}`
6. `pg_vector_aggregate({table: "test_embeddings", column: "embedding"})` → verify `{average_vector, count: 50}`
7. 🔴 `pg_vector_search({table: "nonexistent_xyz", column: "v", vector: [1,0,0]})` → `{success: false, error: "..."}` handler error
8. 🔴 `pg_vector_validate({})` → `{success: false, error: "..."}` (Zod validation — missing required `vector`)
9. 🔴 `pg_vector_search({table: "test_embeddings", column: "embedding", vector: [1,0,0], limit: "abc"})` → must NOT return raw MCP `-32602` error — should return handler error or silently default `limit` (wrong-type numeric param)

---

### postgis Group-Specific Testing

postgis Tool Group (15 tools +1 for code mode)

1. 'pg_postgis_create_extension'
2. 'pg_geometry_column'
3. 'pg_point_in_polygon'
4. 'pg_distance'
5. 'pg_buffer'
6. 'pg_intersection'
7. 'pg_bounding_box'
8. 'pg_spatial_index'
9. 'pg_geocode'
10. 'pg_geo_transform'
11. 'pg_geo_index_optimize'
12. 'pg_geo_cluster'
13. 'pg_geometry_buffer'
14. 'pg_geometry_intersection'
15. 'pg_geometry_transform'
16. 'pg_execute_code' (codemode, auto-added)

> **Instructions**: Execute every numbered checklist item with the exact inputs shown using DIRECT TOOL CALLS ONLY. Skip any items specifically testing `pg_execute_code` or Code Mode Parity. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

**Test data:** Uses `test_locations.location` (POINT with SRID 4326, WGS84). GIST index on `location`.

Cities: New York, Los Angeles, Chicago, London, Tokyo.

Test distance calculations between cities (e.g., New York ↔ London).

**Checklist:**

1. `pg_geocode({lat: 40.7128, lng: -74.006})` → verify `{geojson}` present
2. `pg_distance({table: "test_locations", column: "location", lat: 40.7128, lng: -74.006, distance: 100000})` → expect: New York in results
3. `pg_bounding_box({table: "test_locations", column: "location", minLat: 34, maxLat: 42, minLng: -119, maxLng: -73})` → expect: NY, LA, Chicago
4. `pg_geo_index_optimize({table: "test_locations"})` → verify spatial index analysis returned
5. 🔴 `pg_distance({table: "nonexistent_xyz", column: "geom", lat: 0, lng: 0, distance: 100})` → `{success: false, error: "..."}` handler error
6. 🔴 `pg_geocode({})` → `{success: false, error: "..."}` (Zod validation — missing required `lat`/`lng`)
7. 🔴 `pg_distance({table: "test_locations", column: "location", lat: 40.7128, lng: -74.006, distance: "abc"})` → must NOT return raw MCP `-32602` error — should return handler error or silently default `distance` (wrong-type numeric param)

---

### cron Group-Specific Testing

cron Tool Group (8 tools +1 for code mode)

1. 'pg_cron_create_extension'
2. 'pg_cron_schedule'
3. 'pg_cron_schedule_in_database'
4. 'pg_cron_unschedule'
5. 'pg_cron_alter_job'
6. 'pg_cron_list_jobs'
7. 'pg_cron_job_run_details'
8. 'pg_cron_cleanup_history'
9. 'pg_execute_code' (codemode, auto-added)

> **Instructions**: Execute every numbered checklist item with the exact inputs shown using DIRECT TOOL CALLS ONLY. Skip any items specifically testing `pg_execute_code` or Code Mode Parity. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

1. `pg_cron_list_jobs()` → verify response structure `{jobs, count}`
2. `pg_cron_schedule({name: "checklist_test_job", schedule: "0 5 * * *", command: "SELECT 1"})` → capture jobId
3. `pg_cron_list_jobs()` → verify `checklist_test_job` appears
4. `pg_cron_unschedule({jobName: "checklist_test_job"})` → verify success
5. `pg_cron_list_jobs()` → verify job removed
6. 🔴 `pg_cron_unschedule({jobName: "nonexistent_job_xyz"})` → `{success: false, error: "..."}` handler error
7. 🔴 `pg_cron_schedule({})` → `{success: false, error: "..."}` (Zod validation)
8. 🔴 `pg_cron_cleanup_history({days: "abc"})` → must NOT return raw MCP `-32602` error — should return handler error or silently default `days` (wrong-type numeric param)
