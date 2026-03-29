# Schema Tool Group Testing

## Deterministic Checklist
1. [x] `pg_list_schemas()`
2. [x] `pg_list_views()`
3. [x] `pg_list_sequences({schema: "test_schema"})`
4. [x] `pg_list_functions({schema: "public", limit: 5})`
5. [x] `pg_list_constraints({table: "test_orders"})`
6. [x] `pg_list_triggers({schema: "public"})`
7. [x] `pg_list_constraints({table: "nonexistent_table_xyz"})`
8. [x] `pg_create_sequence({name: "temp_seq_test", start: "abc"})`

## Strict Coverage Matrix
| Tool | Happy Path | Domain Error | Zod Empty Param | Alias Acceptance |
|---|---|---|---|---|
| `pg_list_schemas` | ✅ | ✅ (No-ops/Empty obj OK) | ✅ (No-ops/Empty obj OK) | N/A |
| `pg_create_schema` | ✅ | ✅ | ✅ | ✅ (schema) |
| `pg_drop_schema` | ✅ | ✅ | ✅ | ✅ (schema) |
| `pg_list_sequences` | ✅ | ✅ | ✅ | N/A |
| `pg_create_sequence` | ✅ | ✅ | ✅ | ✅ (sequenceName) |
| `pg_drop_sequence` | ✅ | ✅ | ✅ | ✅ (sequenceName) |
| `pg_list_views` | ✅ | ✅ | ✅ | N/A |
| `pg_create_view` | ✅ | ✅ | ✅ | ✅ (viewName, definition) |
| `pg_drop_view` | ✅ | ✅ | ✅ | ✅ (view) |
| `pg_list_functions` | ✅ | ✅ | ✅ | N/A |
| `pg_list_triggers` | ✅ | ✅ | ✅ | N/A |
| `pg_list_constraints`| ✅ | ✅ | ✅ | N/A |
