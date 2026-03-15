# Schema Tools

Core: `listSchemas()`, `createSchema()`, `dropSchema()`, `listViews()`, `createView()`, `dropView()`, `listSequences()`, `createSequence()`, `dropSequence()`, `listFunctions()`, `listTriggers()`, `listConstraints()`

Response Structures:

- `listSchemas()`: `{schemas: string[], count}`
- `listViews({ includeMaterialized?, truncateDefinition?, limit?, schema? })`: `{views: [{schema, name, type, definition, definitionTruncated?}], count, hasMatViews, truncatedDefinitions?, truncated, totalCount?, note?}`. Default `limit: 50` (use `0` for all). Default `truncateDefinition: 500` chars (use `0` for full definitions). `truncated` always included (`true`/`false`). `totalCount` included when truncated. ⚠️ Validates schema existence—nonexistent schema returns `{success: false, error: "..."}`
- `listSequences({ schema?, limit? })`: `{sequences: [{schema, name, owned_by}], count, truncated, totalCount?, note?}`. Default `limit: 50` (use `0` for all). Returns `truncated: true` + `totalCount` when results are limited. ⚠️ Validates schema existence—nonexistent schema returns `{success: false, error: "..."}`. Note: `owned_by` omits `public.` prefix for sequences in public schema (e.g., `users.id` not `public.users.id`)
- `listFunctions({ schema?, limit?, exclude? })`: `{functions: [{schema, name, arguments, returns, language, volatility}], count, limit}`
- `listTriggers({ schema?, table? })`: `{triggers: [{schema, table_name, name, timing, events, function_name, enabled}], count}`
- `listConstraints({ schema?, table?, type? })`: `{constraints: [{schema, table_name, name, type, definition}], count}`. Type filter values: `primary_key`, `foreign_key`, `unique`, `check`. Returned `type` field uses matching human-readable names
- `dropSchema/dropView/dropSequence`: All return `{existed: true/false}` to indicate if object existed before drop
- `createSchema/createSequence` (with `ifNotExists`) and `createView` (with `orReplace`): Return `{alreadyExisted: true/false}` when the flag is set. Without `ifNotExists`/`orReplace`, the field is omitted

- `pg_create_view`: Supports `schema.name` format (auto-parsed). Use `orReplace: true` for CREATE OR REPLACE. `checkOption`: 'cascaded', 'local', 'none'. ⛔ OR REPLACE can add new columns but cannot rename/remove existing ones—PostgreSQL limitation
- `pg_create_sequence`: Supports `schema.name` format. Parameters: `start`, `increment`, `minValue`, `maxValue`, `cache`, `cycle`, `ownedBy`, `ifNotExists`
- `pg_list_functions`: Default limit=500. Use `schema: 'public'`, `limit: 2000`, or `exclude: ['postgis', 'pg_trgm', 'ltree', 'citext', 'fuzzystrmatch', 'pg_stat_statements', 'hypopg', 'unaccent', 'pg_stat_kcache', 'pgcrypto', 'partman', 'vector', 'topology']` to filter. ⚠️ `exclude` filters by **schema name** AND extension-owned functions. The `language` filter does NOT exclude extension functions—use `exclude` alongside `language` for clean results. Note: Aggressive `exclude` may return 0 results if all functions belong to excluded extensions

📦 **AI-Optimized Payloads**: `listViews({ limit? })` and `listSequences({ limit? })` both default to 50 rows. Returns `truncated: true` + `totalCount` when limited. Use `limit: 0` for all

**Discovery**: `pg.schema.help()` returns `{methods, methodAliases, examples}` object
