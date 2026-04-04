# ltree Tools

Core: `createExtension()`, `query()`, `match()`, `subpath()`, `lca()`, `listColumns()`, `convertColumn()`, `createIndex()`

**Table Aliases**: All table-oriented tools above support `tableName` or `name` aliases for `table`, and `col` alias for `column`.

- `pg_ltree_create_extension`: Enable ltree extension (idempotent). Returns `{success, message}`
- `pg_ltree_query`: Query hierarchical relationships. Supports `schema.table` format (auto-parsed). `mode`/`type`: 'ancestors', 'descendants' (default), 'exact'. `pattern` alias for `path`. Accepts `limit` (default 50). Returns `{results, count, path, mode, isPattern, truncated, totalCount}`. ⚠️ Validates column is ltree type—returns clear error for non-ltree columns
- `pg_ltree_match`: Match paths using lquery pattern syntax (`*`, `*{1,2}`, `*.label.*`). Supports `schema.table` format. `pattern`/`lquery`/`query` aliases. `maxResults` alias for `limit` (default 50). Returns `{results, count, pattern, truncated, totalCount}`
- `pg_ltree_subpath`: Extract portion of ltree path. `offset`/`start`/`from` and `length`/`len`/`end` aliases. Negative `offset` counts from end. ⚠️ Returns `{success: false, error, pathDepth}` for invalid offset (validated before PostgreSQL call)
- `pg_ltree_lca`: Find longest common ancestor of multiple paths. Requires `paths` array (min 1). Returns `{longestCommonAncestor, hasCommonAncestor: bool, paths}`
- `pg_ltree_list_columns`: List all ltree columns in database. Optional `schema` filter. Returns `{columns: [{table_schema, table_name, column_name, is_nullable, column_default}], count}`
- `pg_ltree_convert_column`: Convert TEXT column to ltree. Supports `schema.table` format. Returns `{previousType, wasAlreadyLtree}`. ⚠️ When views depend on column, returns `{success: false, dependentViews, hint}`—drop/recreate views manually
- `pg_ltree_create_index`: Create GiST index on ltree column. Supports `schema.table` format. Auto-generates index name if `indexName` omitted. Returns `{indexName, indexType: 'gist', alreadyExists?}`

**Discovery**: `pg.ltree.help()` returns `{methods, methodAliases, examples}` object. Top-level aliases available: `pg.ltreeQuery()`, `pg.ltreeMatch()`, etc.
