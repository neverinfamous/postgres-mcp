# Tool Group Testing

**Step 1:** Read `postgres-mcp\src\constants\server-instructions.md` using `view_file` (not grep or search) — to understand documented behaviors, edge cases, and response structures for this tool group.

**Step 2:** Please conduct an exhaustive test of the tool group listed below using BOTH code mode (pg_execute_code) and direct tool calls, not scripts/terminal.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized — **blocking, equally important as ❌ bugs**. Oversized payloads waste LLM context window tokens and degrade downstream tool-calling quality. Report the response size in KB and suggest a concrete optimization (e.g., filter system tables, add `compact` option, omit empty arrays).

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
2. Create temporary tables with `temp_*` prefix for write operations (CREATE, INSERT, DROP, etc.)
3. Test each tool with realistic inputs based on the schema above
4. Clean up any `temp_*` tables after testing
5. Report all failures, unexpected behaviors, improvement opportunities, or unnecessarily large payloads
6. Do not mention what already works well or issues well documented in ServerInstructions and runtime hints which are already optimal
7. **Error path testing**: For **every** tool, test at least **two** invalid inputs: (a) a domain error (nonexistent table, invalid column, bad parameter value) and (b) a **Zod validation error** (call the tool with `{}` empty params if it has required parameters, or pass the wrong type). Both must return a **structured handler error** (`{success: false, error: "..."}`) — NOT a raw MCP error frame. See the "Structured Error Response Pattern" section below for how to distinguish the two. This is the most common deficiency found across tool groups.
8. **Deterministic checklist first**: Complete ALL items in the Deterministic Checklist below before moving to freeform exploration. The checklist uses exact inputs and expected outputs to ensure reproducible coverage every run.

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
5. **Orphaned output schemas**: If a schema is exported from `src/handlers/*/output-schemas/` but the corresponding tool definition does not reference it via `outputSchema`, report as ⚠️. Use `grep_search` to check whether the schema name appears in any tool file. Defined-but-unwired schemas provide zero enforcement.
6. **Inline output schemas**: If any tool defines `outputSchema: z.object({...})` inline in the handler file instead of importing a named schema from `output-schemas/`, report as ⚠️. All output schemas must live in the appropriate `output-schemas/` directory with named exports.

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

1. **Cleanup**: Confirm all `temp_*` tables and temporary testing data are removed
2. **Triage findings**: If issues or potential optimizations were found, create an implementation plan consistent with the architecture, other tools, etc. If the plan requires no user decisions, proceed directly to implementation
3. **Scope of fixes** includes corrections to any of:
   - Handler code
   - `server-instructions.md`
   - Test database (`test-database.sql`)
   - This prompt (`test-tools.md`) and group file (`test-group-tools.md`)

### After Implementation

4. **Validate**: Run test suite and fix broken tests, run lint + typecheck and fix issues, update changelog (no duplicate headers)
5. **Commit**: Stage and commit all changes — do NOT push
6. **Live re-test**: Test fixes with direct MCP tool calls. I will have already rebuilt and restarted the server.
7. **Final summary**: If no issues found, provide the final summary after testing. If issues were fixed, provide the summary after live MCP re-testing confirms fixes are working. If the test prompt/database can be improved, make the improvements.

---

## Troubleshooting

### Database is locked / connection refused

1. Ensure postgres container is running: `docker ps | grep postgres-mcp`
2. Start if needed: `docker start postgres-mcp`
3. Check port binding: `docker port postgres-mcp` → should show `5432/tcp`

### Reset script fails

1. Run with `-Verbose` to see detailed output
2. Try manual reset: `Get-Content .\test-server\test-database.sql -Raw | docker exec -i postgres-mcp psql -U postgres testdb`
3. If tables have dependencies, reset drops `CASCADE`

### Extension-dependent tools fail

Some tools require PostgreSQL extensions that may not be installed in all environments:

| Extension | Required For | Check |
|---|---|---|
| `pgvector` | Vector tools | `SELECT * FROM pg_available_extensions WHERE name = 'vector'` |
| `pg_trgm` | Text similarity | `SELECT * FROM pg_available_extensions WHERE name = 'pg_trgm'` |
| `postgis` | Spatial/PostGIS tools | `SELECT * FROM pg_available_extensions WHERE name = 'postgis'` |
| `pg_stat_statements` | Performance resource | `SELECT * FROM pg_available_extensions WHERE name = 'pg_stat_statements'` |
| `pg_cron` | Cron resource | `SELECT * FROM pg_available_extensions WHERE name = 'pg_cron'` |

### Spatial functions return "unknown SRID"

Ensure PostGIS is installed and the spatial_ref_sys table is populated: `SELECT COUNT(*) FROM spatial_ref_sys;`

---
