# JSONB Tools

- `pg_jsonb_extract`: Returns null if path doesn't exist
- `pg_jsonb_insert`: Index -1 inserts BEFORE last element; use `insertAfter: true` to append. ⚠️ Use array format `[-1]` not string `"[-1]"` for negative indices
- `pg_jsonb_set`: `createMissing=true` creates full nested paths; initializes NULL columns to `{}`. Empty path (`''` or `[]`) replaces entire column value
- `pg_jsonb_strip_nulls`: ⚠️ Requires `where`/`filter` clause—write operations must be targeted. Use `preview: true` to see changes first
- `pg_jsonb_agg`: Supports AS aliases in select: `["id", "metadata->>'name' AS name"]`. ⚠️ `->>` returns text—use `->` to preserve JSON types
- `pg_jsonb_object`: Use `data`, `object`, or `pairs` parameter: `{data: {name: "John", age: 30}}`. Returns `{object: {...}}`
- `pg_jsonb_normalize`: `flatten` doesn't descend into arrays; `keys` returns text (use `pairs` for JSON types). Supports standalone `json` instances without requiring `table` and `column`
- `pg_jsonb_stats`: Returns column-level statistics. `topKeysLimit` controls key count (default: 20). ⚠️ `typeDistribution` null type = SQL NULL columns (entire column NULL, not JSON `null` literal). Use `sqlNullCount` for explicit count
- `pg_jsonb_pretty`: Two modes: (1) Pass raw JSON via `json` param—formats with indentation locally. (2) Pass `table` + `column` (+ optional `where`/`filter`, `limit`)—uses PostgreSQL's native `jsonb_pretty()`. Table mode defaults to `limit: 10`. Supports `schema.table` format. Returns `{formatted}` (raw mode) or `{rows: [{formatted}], count}` (table mode)
- ⛔ **Object-only tools**: `diff`, `merge`, `keys`, `indexSuggest`, `securityScan`, `stats`—topKeys require JSONB objects, throw descriptive errors for arrays
- ⛔ **Array-only tools**: `insert`—requires JSONB arrays, throws errors for objects
- 📝 `normalize` modes: `pairs`/`keys`/`flatten` for objects; `array` for arrays
- 📦 **AI-Optimized Payloads**: `contains` and `pathQuery` default to 100 results. Returns `truncated` + `totalCount` when capped. Use `limit: 0` for all rows

**Top-Level Aliases**: `pg.jsonbExtract()`, `pg.jsonbSet()`, `pg.jsonbInsert()`, `pg.jsonbDelete()`, `pg.jsonbContains()`, `pg.jsonbPathQuery()`, `pg.jsonbAgg()`, `pg.jsonbObject()`, `pg.jsonbArray()`, `pg.jsonbKeys()`, `pg.jsonbStripNulls()`, `pg.jsonbTypeof()`, `pg.jsonbValidatePath()`, `pg.jsonbMerge()`, `pg.jsonbNormalize()`, `pg.jsonbDiff()`, `pg.jsonbIndexSuggest()`, `pg.jsonbSecurityScan()`, `pg.jsonbStats()`, `pg.jsonbPretty()`

