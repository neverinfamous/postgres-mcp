# Vector Tools

⚠️ **Large Vectors**: Direct MCP tool calls may truncate vectors >256 dimensions due to JSON-RPC message size limits. For vectors ≥256 dimensions (e.g., OpenAI 1536-dim, local 384-dim), use Code Mode: `await pg.vector.search({table, column, vector, limit})`

- `pg_vector_search`: Supports `schema.table` format (auto-parsed). Returns `{success, results: [...], count, metric}`. Use `select: ["id", "name"]` to include identifying columns. Without select, only returns distance. `filter` = `where`. ⚠️ Vectors read from DB are strings—parse before passing: `vec.replace(/^\[|\]$/g, '').split(',').map(Number)`
- `pg_vector_insert`: Supports `schema.table` format (auto-parsed). Use `updateExisting` + `conflictColumn` + `conflictValue` for UPDATE mode. `additionalColumns` is applied in both INSERT and UPDATE modes
- `pg_vector_batch_insert`: `vectors` expects `[{vector: [...], data?: {...}}]` objects, not raw arrays
- `pg_vector_normalize`: Returns `{success, normalized: [...], magnitude: N}`. Note: `magnitude` is the **original** vector length (not 1)
- `pg_vector_aggregate`: Supports `schema.table` format (auto-parsed). ⛔ Validates column is vector type. Returns `{success, average_vector: {preview, dimensions, truncated}, count}` or `{success, groups: [{group_key, average_vector, count}]}` with groupBy. ⚠️ `groupBy` only supports simple column names (not expressions)
- `pg_vector_dimension_reduce`: Direct mode returns `{success, reduced: [...], originalDimensions, targetDimensions}`. Table mode returns `{success, rows: [{id, original_dimensions, reduced}], processedCount, summarized}`. Default `summarize: true` in table mode returns compact `{preview, dimensions, truncated}` format. Use `summarize: false` for full vectors
- `pg_vector_distance`: Calculate distance between two vectors. `metric`: 'l2' (default), 'cosine', 'inner_product'. Returns `{success, distance, metric}`
- `pg_vector_cluster`: `clusters` = `k`. Returns centroids with `{preview, dimensions, truncated}` format for large vectors (>10 dims)—use `pg_vector_distance` to assign rows
- `pg_vector_create_index`: Use `type` (or alias `method`) with values 'ivfflat' or 'hnsw'. IVFFlat: `lists` param. HNSW: `m`, `efConstruction` params. Supports explicit index naming via `indexName` (alias `name`). Includes strict idempotency support with `ifNotExists: true`.
- `pg_vector_performance`: Auto-generates testVector from first row if omitted. Returns `testVectorSource: 'auto-generated from first row'|'user-provided'`
- `pg_vector_validate`: Returns `{valid: bool, vectorDimensions}`. Empty vector `[]` returns `{valid: true, vectorDimensions: 0}`
- ⛔ `pg_vector_embed`: Demo only (hash-based). Use OpenAI/Cohere for production.
- `pg_hybrid_search`: Supports `schema.table` format (auto-parsed). Combines vector similarity and full-text search with weighted scoring. ⚠️ Text query param is `textQuery` (alias: `queryText`) — **not** `query`. `textColumn` auto-detects type: uses tsvector columns directly, wraps text columns with `to_tsvector()`. Code mode alias: `pg.hybridSearch()` → `pg.vector.hybridSearch()`
- 📝 **Error Handling & Validation**: Vector tools return structured validation errors (`{success: false, error: "..."}`) for dimension mismatches. Zod validation has been strictly enforced to eliminate internal framework refine leaks (no `_truncated` exposure in outputs). Token clamping on vector size uses strict payload `limit` parameters.
