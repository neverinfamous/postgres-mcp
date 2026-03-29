# Vector Tool Group Testing

## Deterministic Checklist
1. [x] Via code mode: read first embedding from `test_embeddings`, then search with it → verify results returned with distances
2. [x] `pg_vector_validate({vector: [1.0, 2.0, 3.0]})` → `{valid: true, vectorDimensions: 3}`
3. [x] `pg_vector_validate({vector: []})` → `{valid: true, vectorDimensions: 0}`
4. [x] `pg_vector_distance({vector1: [1,0,0], vector2: [0,1,0], metric: "cosine"})` → verify distance returned
5. [x] `pg_vector_normalize({vector: [3, 4]})` → `{normalized: [0.6, 0.8], magnitude: 5}`
6. [x] `pg_vector_aggregate({table: "test_embeddings", column: "embedding"})` → verify `{average_vector, count: 50}`
7. [x] 🔴 `pg_vector_search({table: "nonexistent_xyz", column: "v", vector: [1,0,0]})` → `{success: false, error: "..."}` handler error
8. [x] 🔴 `pg_vector_validate({})` → `{success: false, error: "..."}` (Zod validation — missing required `vector`)
9. [x] 🔴 `pg_vector_search({table: "test_embeddings", column: "embedding", vector: [1,0,0], limit: "abc"})` → must NOT return raw MCP `-32602` error — should return handler error or silently default `limit` (wrong-type numeric param)

## Strict Coverage Matrix
| Tool | Happy Path | Domain Error | Zod Empty Param | Alias Acceptance |
|---|---|---|---|---|
| `pg_vector_create_extension` | ✅ | N/A | ✅ | N/A |
| `pg_vector_add_column` | ✅ | ✅ | ✅ | ✅ (col, tableName) |
| `pg_vector_insert` | ✅ | ✅ | ✅ | ✅ (col, tableName) |
| `pg_vector_batch_insert` | ✅ | ✅ | ✅ | ✅ (col, tableName) |
| `pg_vector_search` | ✅ | ✅ | ✅ | ✅ (col, tableName, queryVector) |
| `pg_vector_create_index` | ✅ | ✅ | ✅ | ✅ (col, method, distanceMetric, tableName) |
| `pg_vector_distance` | ✅ | ✅ | ✅ | N/A |
| `pg_vector_normalize` | ✅ | ✅ | ✅ | N/A |
| `pg_vector_aggregate` | ✅ | ✅ | ✅ | ✅ (col, tableName) |
| `pg_vector_validate` | ✅ | ✅ | ✅ | ✅ (col, tableName) |
| `pg_vector_cluster` | ✅ | ✅ | ✅ | ✅ (col, tableName, clusters) |
| `pg_vector_index_optimize` | ✅ | ✅ | ✅ | ✅ (col, tableName) |
| `pg_hybrid_search` | ✅ | ✅ | ✅ | ✅ (col, vectorCol, tableName) |
| `pg_vector_performance` | ✅ | ✅ | ✅ | ✅ (col, tableName) |
| `pg_vector_dimension_reduce` | ✅ | ✅ | ✅ | ✅ (col, tableName, dimensions) |
| `pg_vector_embed` | ✅ | ✅ | ✅ | N/A |
