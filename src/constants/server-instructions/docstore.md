# Document Store (`pg_doc_*`)

- **Collection creation**: `pg_doc_create_collection` creates a JSONB document collection. Use `ifNotExists: true` (default) to avoid errors when the collection already exists. Returns `{ success: false, error }` if collection already exists (without `ifNotExists`). Accepts optional `schema` parameter.
- **Collection drop**: `pg_doc_drop_collection` removes a collection. With `ifExists: true` (default), returns `{ success: true, message: "Collection did not exist" }` when the collection was already absent.
- **Collection detection**: Tools identify document collections as tables containing a `doc JSONB` column with an `_id` text column. Manually created JSONB tables with this pattern may appear in collection listings.
- **Nonexistent collection handling**: `pg_doc_collection_info`, `pg_doc_add`, `pg_doc_find`, `pg_doc_modify`, `pg_doc_remove`, and `pg_doc_create_index` return `{ success: false, error }` when the target collection does not exist.
- **Nonexistent schema handling**: All docstore tools that accept a `schema` parameter return a structured error when a nonexistent schema is explicitly provided, matching the P154 pattern.
- **Index creation**: `pg_doc_create_index` creates PostgreSQL expression indexes on JSONB paths. Returns `{ success: false, error }` if the index already exists. Supports typed indexes (`TEXT`, `INT`, `DOUBLE`, `DATE`, `TIMESTAMP`, `BOOLEAN`).
- **Filter Syntax** (for `pg_doc_find`, `pg_doc_modify`, `pg_doc_remove`):
  - **By _id**: Pass the 32-character hex _id directly: `filter: "686dd247b9724bcfa08ce6f1efed8b77"`
  - **By field value**: Use `field=value` format: `filter: "name=Alice"` or `filter: "age=30"`
  - **By existence**: Use JSON path: `filter: "$.address"` (matches docs where address field exists)
  - ❌ Incorrect: `filter: "$.name == 'Alice'"` (comparison operators not supported in path)
  - ✅ Correct: `filter: "name=Alice"` (field=value format)
- **Find Filters** (`pg_doc_find`): The filter parameter supports _id, field=value, and JSON path existence (e.g., `$.address.zip`). The path must be a valid JSON path; invalid paths return `{ success: false, error }`.
- **PostgreSQL-specific**: Uses JSONB operators (`@>`, `?`, `->`, `->>`), `jsonb_set()` for modifications, `#-` for field removal, and expression indexes instead of generated columns.
