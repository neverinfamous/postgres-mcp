# postgres-mcp Tool Group Re-Testing: [admin]

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
> **Code Mode Token Tracking**: For at least one `pg_execute_code` test, explicitly verify that `metrics.tokenEstimate` is present in the response and is a number greater than 0, reporting as ❌ if it is missing or zero.

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

1. **Token Tracking**: Before concluding, call `read_resource` on `postgres://audit` to retrieve the `sessionTokenEstimate` (total token usage) for your testing session. Include this "Total Token Usage" in your final test report and session summary.
2. **Cleanup**: Confirm all `temp_*` tables and temporary testing data are removed including any files created during testing.
3. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in the files listed below, and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
4. **Read `code-map.md` before making changes and make all changes consistent with other tools.**
5. **Scope of fixes** includes corrections to any of:
   - Handler code
   - `server-instructions.md`
   - Test database (`test-database.sql`)
   - This prompt
6. **User will handle validation**
7. Update the changelog if there were any changes made (being careful not to create duplicate headers), and commit without pushing.
8. Create a /session-summary in memory-journal-mcp for the issues and their fixes, explicitly including the "Total Token Usage" captured.
9. Stop and briefly summarize the issues and their fixes, including the Total Token Usage.

---

## Group Focus: admin

### admin Group-Specific Testing

admin Tool Group (11 tools +1 code mode):

1. 'pg_vacuum'
2. 'pg_vacuum_analyze'
3. 'pg_analyze'
4. 'pg_reindex'
5. 'pg_terminate_backend'
6. 'pg_cancel_backend'
7. 'pg_reload_conf'
8. 'pg_set_config'
9. 'pg_reset_stats'
10. 'pg_cluster'
11. 'pg_append_insight'
12. 'pg_execute_code' (codemode, auto-added)

> **Instructions**: Execute every numbered checklist item with the exact inputs shown using DIRECT TOOL CALLS ONLY. Skip any items specifically testing `pg_execute_code` or Code Mode Parity. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

1. `pg_analyze({table: "test_products"})` → `{success: true}`
2. `pg_vacuum({table: "test_products"})` → `{success: true}`
3. `pg_reindex({target: "table", name: "test_products"})` → `{success: true}`
4. `pg_cancel_backend({pid: 99999})` → `{success: false}` (invalid PID, no error thrown)
5. `pg_set_config({name: "statement_timeout", value: "30000"})` → `{success: true}`

**pg_append_insight:**

6. `pg_append_insight({text: "Test insight from checklist"})` → verify `{success: true, insightCount: N, message: "..."}` where `insightCount >= 1`
7. `pg_append_insight({text: "Second insight for testing"})` → verify `insightCount` is previous value + 1
8. 🔴 `pg_append_insight({})` → `{success: false, error: "..."}` (Zod validation — missing required `text`)

**Domain error paths (🔴):**

9. 🔴 `pg_analyze({table: "nonexistent_table_xyz"})` → `{success: false, error: "..."}` handler error
10. 🔴 `pg_reindex({})` → `{success: false, error: "..."}` (Zod validation)
11. 🔴 `pg_cancel_backend({pid: "abc"})` → must NOT return raw MCP `-32602` error — should return handler error or `{success: false}` (wrong-type numeric param)
