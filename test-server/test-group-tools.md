# Group-Specific Tool Testing Instructions

> **Smoke test**: Before starting any group's checklist, run `pg_server_version()` → verify `{version: "X.Y", version_num: N}` to confirm the MCP server is responding. This is the equivalent of db-mcp's `server_info` / `server_health` / `list_adapters` built-in tool checks.

### core Group-Specific Testing

core Tool Group (20 tools +1 for code mode):

1. 'pg_read_query'
2. 'pg_write_query'
3. 'pg_list_tables'
4. 'pg_describe_table'
5. 'pg_create_table'
6. 'pg_drop_table'
7. 'pg_get_indexes'
8. 'pg_create_index'
9. 'pg_drop_index'
10. 'pg_list_objects'
11. 'pg_object_details'
12. 'pg_list_extensions'
13. 'pg_analyze_db_health'
14. 'pg_analyze_workload_indexes'
15. 'pg_analyze_query_indexes'
16. 'pg_upsert' (convenience)
17. 'pg_batch_insert' (convenience)
18. 'pg_count' (convenience)
19. 'pg_exists' (convenience)
20. 'pg_truncate' (convenience)
21. 'pg_execute_code' (codemode, auto-added)

All tools implement P154 structured error handling for nonexistent tables/schemas. The 5 convenience tools (pg_count, pg_exists, pg_upsert, pg_batch_insert, pg_truncate) use explicit pre-checks and serve as canonical P154 verification targets. Test with `test_products` and `test_orders`.

> **Instructions**: Execute every numbered checklist item with the exact inputs shown. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

**Convenience tools (P154 canonical targets):**

1. `pg_count({table: "test_products"})` → `{count: 15}`
2. `pg_count({table: "test_products", where: "price > $1", params: [50]})` → `{count: N}` where N > 0
3. `pg_count({table: "nonexistent_table_xyz"})` → `{success: false, error: "..."}` mentioning table name
4. `pg_count({table: "fake_schema.test_products"})` → `{success: false, error: "..."}` mentioning schema
5. `pg_exists({table: "test_products"})` → `{exists: true, mode: "any_rows"}`
6. `pg_exists({table: "test_products", where: "id = $1", params: [1]})` → `{exists: true, mode: "filtered"}`
7. `pg_exists({table: "test_products", where: "id = $1", params: [99999]})` → `{exists: false, mode: "filtered"}`
8. `pg_exists({table: "nonexistent_table_xyz"})` → `{success: false}` structured error
9. `pg_truncate({table: "nonexistent_table_xyz"})` → `{success: false}` structured error
10. `pg_batch_insert({table: "nonexistent_table_xyz", rows: [{id: 1}]})` → `{success: false}` structured error
11. `pg_upsert({table: "nonexistent_table_xyz", data: {id: 1}, conflictColumns: ["id"]})` → `{success: false}` structured error

**Read/Write/Schema tools:**

12. `pg_read_query({sql: "SELECT COUNT(*) AS n FROM test_orders"})` → `{rows: [{n: 20}], rowCount: 1}`
13. `pg_list_tables({schema: "public", limit: 5})` → `{tables: [...], count: 5, truncated: true}`
14. `pg_describe_table({table: "test_products"})` → verify `columns` includes `id`, `name`, `price`; `primaryKey` present
15. `pg_list_objects({type: "view"})` → verify `test_order_summary` appears in results
16. `pg_object_details({name: "test_order_summary", type: "view"})` → verify `definition` field present
17. `pg_get_indexes({table: "test_orders"})` → verify `idx_orders_status` and `idx_orders_date` in results
18. `pg_list_extensions()` → verify response includes `pgcrypto`, `pg_trgm`, `vector` (or other installed extensions)
19. `pg_analyze_db_health()` → verify `overallStatus` is one of: `healthy`, `needs_attention`, `critical`
20. `pg_analyze_workload_indexes()` → verify response structure with `recommendations` or `queries` array
21. `pg_analyze_query_indexes({sql: "SELECT * FROM test_products WHERE name = 'Widget'"})` → verify `plan` and `recommendations` fields present

**Domain error paths (🔴):**

22. 🔴 `pg_read_query({sql: "SELECT * FROM nonexistent_table_xyz"})` → `{success: false, error: "..."}` handler error, NOT MCP error
23. 🔴 `pg_write_query({sql: "INSERT INTO nonexistent_xyz VALUES (1)"})` → `{success: false, error: "..."}` handler error
24. 🔴 `pg_read_query({sql: "SELECT nonexistent_column FROM test_products"})` → `{success: false, error: "..."}` mentioning column name
25. 🔴 `pg_list_tables({schema: "nonexistent_schema_xyz"})` → either empty results or `{success: false}` — not raw MCP error
26. 🔴 `pg_describe_table({table: "nonexistent_table_xyz"})` → `{success: false, error: "..."}` mentioning table name
27. 🔴 `pg_describe_table({table: "test_schema.order_seq"})` → `{success: false, error: "..."}` mentioning "sequence" (not a table)
28. 🔴 `pg_list_objects({type: "invalid_type"})` → `{success: false, error: "Validation error: ..."}` — NOT raw MCP `-32602` output validation error
29. 🔴 `pg_drop_index({name: "nonexistent_index_xyz"})` → `{success: false, error: "..."}` handler error with hint

**Zod validation error paths (🔴 — verify `"Validation error: ..."` format, NOT raw JSON array):**

30. 🔴 `pg_create_table({})` → `{success: false, error: "Validation error: name (or table alias) is required; Validation error: columns must not be empty"}` — NOT raw JSON array, NOT raw MCP error
31. 🔴 `pg_describe_table({})` → `{success: false, error: "Validation error: ..."}` (missing required `table` param)
32. 🔴 `pg_read_query({})` → `{success: false, error: "Validation error: ..."}` (missing required `sql`)
33. 🔴 `pg_write_query({})` → `{success: false, error: "Validation error: ..."}` (missing required `sql`)
34. 🔴 `pg_create_index({})` → `{success: false, error: "Validation error: ..."}` (missing required params)
35. 🔴 `pg_drop_table({})` → `{success: false, error: "Validation error: ..."}` (missing required `table`)
36. 🔴 `pg_count({params: ["not_a_number"]})` → `{success: false, error: "..."}` structured error for bad param type

**Alias acceptance (verify aliases produce identical results to primary parameter name):**

37. `pg_count({tableName: "test_products"})` → same result as item 1 (`{count: 15}`)
38. `pg_count({table: "test_products", condition: "price > 50"})` → same as `where` alias
39. `pg_read_query({query: "SELECT 1 AS test"})` → works via `query` alias for `sql`
40. `pg_exists({tableName: "test_products"})` → works via `tableName` alias for `table`
41. `pg_describe_table({name: "test_products"})` → works via `name` alias for `table`
42. `pg_analyze_query_indexes({query: "SELECT * FROM test_products"})` → works via `query` alias for `sql`

**Create → Use → Drop lifecycle (temp tables):**

43. `pg_create_table({name: "temp_lifecycle", columns: [{name: "id", type: "SERIAL", primaryKey: true}, {name: "name", type: "TEXT", notNull: true}]})` → `{success: true}`
44. `pg_batch_insert({table: "temp_lifecycle", rows: [{name: "Alice"}, {name: "Bob"}], returning: ["id", "name"]})` → verify returned rows with auto-generated IDs
45. `pg_upsert({table: "temp_lifecycle", data: {id: 1, name: "Alice Updated"}, conflictColumns: ["id"]})` → verify update
46. `pg_count({table: "temp_lifecycle"})` → `{count: 2}`
47. `pg_create_index({table: "temp_lifecycle", columns: ["name"], ifNotExists: true})` → `{success: true}`
48. `pg_get_indexes({table: "temp_lifecycle"})` → verify the new index appears
49. `pg_truncate({table: "temp_lifecycle", restartIdentity: true})` → `{success: true}`
50. `pg_count({table: "temp_lifecycle"})` → `{count: 0}`
51. `pg_drop_table({table: "temp_lifecycle", ifExists: true})` → `{success: true, existed: true}`
52. `pg_drop_table({table: "temp_lifecycle", ifExists: true})` → `{success: true, existed: false}` (already dropped)

**Code mode (`pg_execute_code`) deterministic items:**

53. `pg_execute_code({code: "return await pg.core.help()"})` → verify lists ~20 core methods
54. `pg_execute_code({code: "return await pg.count('test_products')"})` → verify works via top-level alias
55. `pg_execute_code({code: "return await pg.exists('test_products', 'id = 1')"})` → verify positional args work
56. `pg_execute_code({code: "return await pg.core.readQuery({sql: 'SELECT 1 AS n'})"})` → verify `{rows: [{n: 1}]}`
57. `pg_execute_code({code: "return await pg.readQuery({sql: 'SELECT * FROM nonexistent_xyz'})"})` → verify error is returned (not thrown), contains `{success: false}` or error object

---

### transactions Group-Specific Testing

transactions Tool Group (8 tools +1 for code mode):

1. 'pg_transaction_begin',
2. 'pg_transaction_commit'
3. 'pg_transaction_rollback'
4. 'pg_transaction_savepoint'
5. 'pg_transaction_release'
6. 'pg_transaction_rollback_to'
7. 'pg_transaction_execute'
8. 'pg_transaction_status'
9. 'pg_execute_code' (codemode, auto-added)

> **Instructions**: Execute every numbered checklist item with the exact inputs shown. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

1. `pg_transaction_begin()` → capture `transactionId`
2. `pg_read_query({sql: "SELECT 1 AS test", transactionId: <id>})` → `{rows: [{test: 1}]}`
3. `pg_transaction_savepoint({transactionId: <id>, name: "checklist_sp1"})` → `{success: true}`
4. `pg_transaction_rollback_to({transactionId: <id>, name: "checklist_sp1"})` → `{success: true}`
5. `pg_transaction_release({transactionId: <id>, name: "checklist_sp1"})` → note behavior (released savepoints cannot be rolled back to)
6. `pg_transaction_commit({transactionId: <id>})` → `{success: true}`
7. `pg_transaction_execute({statements: [{sql: "SELECT 1 AS a"}, {sql: "SELECT 2 AS b"}]})` → `{success: true, statementsExecuted: 2}`
8. 🔴 `pg_transaction_commit({transactionId: "nonexistent-uuid"})` → `{success: false, error: "..."}` handler error
9. 🔴 `pg_transaction_execute({})` → `{success: false, error: "..."}` (Zod validation — missing `statements`)

**pg_transaction_status:**

10. `pg_transaction_begin()` → capture `transactionId`, then `pg_transaction_status({transactionId: <id>})` → `{status: "active", transactionId: <id>}`
11. After item 10: `pg_transaction_commit({transactionId: <id>})`, then `pg_transaction_status({transactionId: <id>})` → `{status: "not_found", transactionId: <id>}`
12. `pg_transaction_begin()` → capture id, then `pg_read_query({sql: "SELECT FROM nonexistent_xyz", transactionId: <id>})` (force error), then `pg_transaction_status({transactionId: <id>})` → `{status: "aborted", transactionId: <id>}` — then rollback to clean up
13. 🔴 `pg_transaction_status({transactionId: "nonexistent-uuid"})` → `{status: "not_found", transactionId: "nonexistent-uuid"}` — handler result, NOT MCP error
14. 🔴 `pg_transaction_status({})` → `{success: false, error: "Validation error: ..."}` — Zod validation

**Code mode parity (pg_transaction_status):**

15. `pg_execute_code({code: "const tx = await pg.transactions.begin(); const s = await pg.transactions.status({transactionId: tx.transactionId}); await pg.transactions.rollback({transactionId: tx.transactionId}); return s"})` → verify `{status: "active"}`
16. `pg_execute_code({code: "return await pg.transactions.help()"})` → verify `status` appears in method list

---

### jsonb Group-Specific Testing

jsonb Tool Group (20 tools +1 for code mode):

1. 'pg_jsonb_extract'
2. 'pg_jsonb_set'
3. 'pg_jsonb_insert'
4. 'pg_jsonb_delete'
5. 'pg_jsonb_contains'
6. 'pg_jsonb_path_query'
7. 'pg_jsonb_agg'
8. 'pg_jsonb_object'
9. 'pg_jsonb_array'
10. 'pg_jsonb_keys'
11. 'pg_jsonb_strip_nulls'
12. 'pg_jsonb_typeof'
13. 'pg_jsonb_validate_path'
14. 'pg_jsonb_stats'
15. 'pg_jsonb_merge'
16. 'pg_jsonb_normalize'
17. 'pg_jsonb_diff'
18. 'pg_jsonb_index_suggest'
19. 'pg_jsonb_security_scan'
20. 'pg_jsonb_pretty'
21. 'pg_execute_code' (codemode, auto-added)

> **Instructions**: Execute every numbered checklist item with the exact inputs shown. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

**Test data:** Use `test_jsonb_docs` table which has these JSONB structures:

- `metadata`: `{"type": "article", "author": "Alice", "views": 100}` / `{"type": "video", "author": "Bob", "duration": 3600}`
- `settings`: `{"theme": "dark", "notifications": true}` / `{"quality": "hd", "autoplay": false}`
- `tags`: `["tech", "news"]` / `["entertainment"]` / `["tech", "tutorial"]`
- Nested access: `test_jsonb_docs` row 3 has `metadata.nested.level1.level2 = "deep"`
- `test_events.payload` — `{"page": "home"}`

**Checklist:**

1. `pg_jsonb_extract({table: "test_jsonb_docs", column: "metadata", path: "author", where: "id = 1"})` → result contains `"Alice"`
2. `pg_jsonb_extract({table: "test_jsonb_docs", column: "metadata", path: "nested.level1.level2", where: "id = 3"})` → result contains `"deep"`
3. `pg_jsonb_keys({table: "test_jsonb_docs", column: "metadata", where: "id = 1"})` → keys include `type`, `author`, `views`
4. `pg_jsonb_typeof({table: "test_jsonb_docs", column: "tags", where: "id = 1"})` → `"array"`
5. `pg_jsonb_typeof({table: "test_jsonb_docs", column: "metadata", where: "id = 1"})` → `"object"`
6. `pg_jsonb_contains({table: "test_jsonb_docs", column: "metadata", contains: {"type": "article"}, where: "id = 1"})` → true
7. `pg_jsonb_stats({table: "test_jsonb_docs", column: "metadata"})` → verify `topKeys` present, `typeDistribution` present
8. `pg_jsonb_validate_path({path: "$.a.b.c"})` → valid (note: validates JSONPath syntax, not dot-notation — `"a.b.c"` is invalid JSONPath)
9. `pg_jsonb_diff({doc1: {"a": 1, "b": 2}, doc2: {"a": 1, "c": 3}})` → verify `differences` array with `status` field (`"added"`, `"removed"`, `"modified"`), `hasDifferences: true`

**pg_jsonb_pretty:**

10. `pg_jsonb_pretty({json: "{\"a\":1,\"b\":2}"})` → verify pretty-printed JSON string with indentation
11. `pg_jsonb_pretty({table: "test_jsonb_docs", column: "metadata", where: "id = 1"})` → verify formatted output contains `"author": "Alice"` with indentation
12. 🔴 `pg_jsonb_pretty({})` → `{success: false, error: "..."}` (Zod validation — must provide either `json` or `table`+`column`)

**Domain error paths (🔴):**

13. 🔴 `pg_jsonb_extract({table: "nonexistent_xyz", column: "data", path: "key"})` → `{success: false, error: "..."}` handler error
14. 🔴 `pg_jsonb_keys({})` → `{success: false, error: "..."}` (Zod validation)
15. 🔴 `pg_jsonb_stats({table: "test_jsonb_docs", column: "metadata", sampleSize: "abc"})` → must NOT return raw MCP `-32602` error — should silently default `sampleSize` to 1000 and return valid stats (wrong-type numeric param coercion)
16. 🔴 `pg_jsonb_contains({table: "test_jsonb_docs", column: "metadata", value: {"type": "article"}, limit: "abc"})` → must NOT return raw MCP `-32602` error — should silently default `limit` to 100 and return valid results (wrong-type numeric param coercion)

---

### text Group-Specific Testing

text Tool Group (13 tools +1 for code mode)

1. 'pg_text_search'
2. 'pg_text_rank'
3. 'pg_trigram_similarity'
4. 'pg_fuzzy_match'
5. 'pg_regexp_match'
6. 'pg_like_search'
7. 'pg_text_headline'
8. 'pg_create_fts_index'
9. 'pg_text_normalize'
10. 'pg_text_sentiment'
11. 'pg_text_to_vector'
12. 'pg_text_to_query'
13. 'pg_text_search_config'
14. 'pg_execute_code' (codemode, auto-added)

> **Instructions**: Execute every numbered checklist item with the exact inputs shown. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

**Test data:** Uses `test_articles` which has a GIN FTS index on `search_vector`.

Searchable terms: `PostgreSQL`, `database`, `full-text`, `search`, `performance`, `query`, `MCP`, `protocol`.

**Checklist:**

1. `pg_text_search({table: "test_articles", column: "body", query: "PostgreSQL"})` → at least 1 result
2. `pg_text_search({table: "test_articles", column: "body", query: "nonexistent_word_xyz"})` → 0 results
3. `pg_trigram_similarity({table: "test_articles", column: "title", value: "Postgre", threshold: 0.1, limit: 5})` → results with similarity scores
4. `pg_fuzzy_match({table: "test_articles", column: "title", value: "Postrgres", method: "levenshtein", maxDistance: 30, limit: 5})` → results with distances
5. `pg_text_normalize({text: "café résumé"})` → accents removed
6. `pg_text_to_vector({text: "hello world"})` → returns tsvector representation
7. `pg_text_to_query({text: "hello world"})` → returns tsquery representation
8. `pg_text_search_config()` → returns available configurations including `english`
9. 🔴 `pg_text_search({table: "nonexistent_xyz", column: "body", query: "test"})` → `{success: false, error: "..."}` handler error
10. 🔴 `pg_trigram_similarity({})` → `{success: false, error: "..."}` (Zod validation)
11. 🔴 `pg_text_search({table: "test_articles", column: "body", query: "test", limit: "abc"})` → must NOT return raw MCP `-32602` error — should return handler error or silently default `limit` (wrong-type numeric param)

---

### performance Group-Specific Testing

performance Tool Group (24 tools +1 code mode)

1. 'pg_explain'
2. 'pg_explain_analyze'
3. 'pg_explain_buffers'
4. 'pg_index_stats'
5. 'pg_table_stats'
6. 'pg_stat_statements'
7. 'pg_stat_activity'
8. 'pg_locks'
9. 'pg_bloat_check'
10. 'pg_cache_hit_ratio'
11. 'pg_seq_scan_tables'
12. 'pg_index_recommendations'
13. 'pg_query_plan_compare'
14. 'pg_performance_baseline'
15. 'pg_connection_pool_optimize'
16. 'pg_partition_strategy_suggest'
17. 'pg_unused_indexes'
18. 'pg_duplicate_indexes'
19. 'pg_vacuum_stats'
20. 'pg_query_plan_stats'
21. 'pg_diagnose_database_performance'
22. 'pg_detect_query_anomalies'
23. 'pg_detect_bloat_risk'
24. 'pg_detect_connection_spike'
25. 'pg_execute_code' (codemode, auto-added)

> **Instructions**: Execute every numbered checklist item with the exact inputs shown. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

**Existing performance tools:**

1. `pg_explain({sql: "SELECT * FROM test_products WHERE id = 1"})` → verify plan returned
2. `pg_explain({sql: "SELECT * FROM test_products WHERE id = $1", params: [1]})` → verify parameterized plan
3. `pg_table_stats({limit: 3})` → verify `{tables: [...], count: 3, truncated: true, totalCount: N}`
4. `pg_index_stats({limit: 3})` → verify `{indexes: [...], count: 3, truncated: true, totalCount: N}`
5. `pg_cache_hit_ratio()` → verify `{heap_read, heap_hit, cache_hit_ratio}` where all are numbers or null
6. `pg_bloat_check()` → verify returns `{tables, count}`
7. `pg_seq_scan_tables({limit: 3, minScans: 1})` → verify `{tables, count: 3, truncated: true, totalCount: N}`
8. `pg_unused_indexes({limit: 3})` → verify returns `{unusedIndexes, count}`
9. `pg_duplicate_indexes()` → verify response structure

**Diagnostics tool:**

10. `pg_diagnose_database_performance()` → verify `{sections, overallScore, overallStatus, totalRecommendations, allRecommendations}` where `overallStatus` is one of `healthy`, `warning`, `critical`; `overallScore` is 0-100

**Anomaly detection tools — pg_detect_query_anomalies:**

11. `pg_detect_query_anomalies()` → verify `{anomalies, riskLevel, totalAnalyzed, anomalyCount, summary}` where `riskLevel` ∈ `{low, moderate, high, critical}`; `anomalyCount` matches `anomalies.length`
12. `pg_detect_query_anomalies({threshold: 1.0})` → lower threshold may produce more anomalies; verify `anomalyCount >= 0`
13. `pg_detect_query_anomalies({threshold: 5.0, minCalls: 100})` → higher threshold + minCalls should reduce noise; verify response structure

**Anomaly detection tools — pg_detect_bloat_risk:**

14. `pg_detect_bloat_risk()` → verify `{tables, highRiskCount, totalAnalyzed, summary}` where `highRiskCount >= 0` and `totalAnalyzed >= 0`
15. `pg_detect_bloat_risk({schema: "public"})` → verify only `public` schema tables in results
16. `pg_detect_bloat_risk({minRows: 1})` → lower threshold should include more tables; verify `totalAnalyzed` >= default result's `totalAnalyzed`
17. `pg_detect_bloat_risk({schema: "nonexistent_schema_xyz"})` → should return valid response with `totalAnalyzed: 0` and empty `tables` (filter produces no matches, not an error)

**Anomaly detection tools — pg_detect_connection_spike:**

18. `pg_detect_connection_spike()` → verify `{totalConnections, maxConnections, usagePercent, byState, concentrations, warnings, riskLevel, summary}` where `totalConnections >= 1`, `maxConnections > 0`, `usagePercent` is 0-100, `riskLevel` ∈ `{low, moderate, high, critical}`
19. `pg_detect_connection_spike({warningPercent: 10})` → lower threshold may produce more warnings; verify `warnings` is an array
20. `pg_detect_connection_spike({warningPercent: 100})` → maximum threshold should produce fewer warnings; verify response structure

**Domain error paths (🔴):**

21. 🔴 `pg_table_stats({})` → verify returns handler error (not MCP error) for empty params or returns valid results
22. 🔴 `pg_explain({})` → `{success: false, error: "..."}` (Zod validation — missing required `sql`)

**Wrong-type numeric param coercion (🔴):**

23. 🔴 `pg_table_stats({limit: "abc"})` → must NOT return raw MCP `-32602` error — should return handler error or silently default `limit` (wrong-type numeric param)
24. 🔴 `pg_detect_query_anomalies({threshold: "abc"})` → must NOT return raw MCP error; `threshold` should silently coerce to default 2.0 and return valid results
25. 🔴 `pg_detect_query_anomalies({minCalls: "abc"})` → must NOT return raw MCP error; `minCalls` should silently coerce to default 10 and return valid results
26. 🔴 `pg_detect_bloat_risk({minRows: "abc"})` → must NOT return raw MCP error; `minRows` should silently coerce to default 1000 and return valid results
27. 🔴 `pg_detect_connection_spike({warningPercent: "abc"})` → must NOT return raw MCP error; `warningPercent` should silently coerce to default 70 and return valid results

**Code mode parity (anomaly detection):**

28. `pg_execute_code({code: "return await pg.performance.detectQueryAnomalies()"})` → verify returns same structure as item 11
29. `pg_execute_code({code: "return await pg.performance.detectBloatRisk({schema: 'public'})"})` → verify returns same structure as item 15
30. `pg_execute_code({code: "return await pg.performance.detectConnectionSpike()"})` → verify returns same structure as item 18

---

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

> **Instructions**: Execute every numbered checklist item with the exact inputs shown. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

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

---

### monitoring Group-Specific Testing

monitoring group (11 tools +1 for code mode)

1. 'pg_database_size'
2. 'pg_table_sizes'
3. 'pg_connection_stats'
4. 'pg_replication_status'
5. 'pg_server_version'
6. 'pg_show_settings'
7. 'pg_uptime'
8. 'pg_recovery_status'
9. 'pg_capacity_planning'
10. 'pg_resource_usage_analyze'
11. 'pg_alert_threshold_set'
12. 'pg_execute_code' (codemode, auto-added)

> **Instructions**: Execute every numbered checklist item with the exact inputs shown. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

1. `pg_database_size()` → `{bytes: N, size: "X MB/GB"}`
2. `pg_table_sizes({limit: 3})` → verify `{tables, count, truncated}`
3. `pg_connection_stats()` → verify `{totalConnections: N, maxConnections: N}`
4. `pg_server_version()` → verify `{version: "X.Y", version_num: N}`
5. `pg_uptime()` → verify `{uptime: {days, hours, minutes, seconds}}`
6. `pg_show_settings({setting: "max_connections"})` → verify exact match returned
7. `pg_recovery_status()` → verify `{in_recovery: boolean}`
8. `pg_alert_threshold_set({metric: "connection_usage"})` → verify thresholds returned
9. `pg_alert_threshold_set({metric: "invalid_metric_xyz"})` → `{success: false}` structured error
10. 🔴 `pg_table_sizes({})` → verify returns handler error or valid defaults (not MCP error)
11. 🔴 `pg_table_sizes({limit: "abc"})` → must NOT return raw MCP `-32602` error — should return handler error or silently default `limit` (wrong-type numeric param)

---

### backup Group-Specific Testing

backup Tool Group (12 tools +1 for code mode)

1. 'pg_dump_table'
2. 'pg_dump_schema'
3. 'pg_copy_export'
4. 'pg_copy_import'
5. 'pg_create_backup_plan'
6. 'pg_restore_command'
7. 'pg_backup_physical'
8. 'pg_restore_validate'
9. 'pg_backup_schedule_optimize'
10. 'pg_audit_list_backups'
11. 'pg_audit_restore_backup'
12. 'pg_audit_diff_backup'
13. 'pg_execute_code' (codemode, auto-added)

> **Instructions**: Execute every numbered checklist item with the exact inputs shown. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

1. `pg_dump_table({table: "test_products"})` → verify `ddl` contains `CREATE TABLE`
2. `pg_dump_table({table: "test_products", includeData: true})` → verify `insertStatements` present
3. `pg_copy_export({table: "test_products", limit: 3})` → verify `{data: "...", rowCount: 3}`
4. `pg_copy_export({table: "test_products", format: "text"})` → verify tab-delimited output
5. `pg_create_backup_plan({frequency: "daily", retention: 7})` → verify `{strategy}` present
6. `pg_restore_command({filename: "backup.dump", database: "testdb"})` → verify `{command}` present
7. 🔴 `pg_restore_command({})` → `{success: false, error: "..."}` (missing required `backupFile`)
8. 🔴 `pg_backup_physical({})` → `{success: false, error: "..."}` (missing required `targetDir`)

**Audit backup tools (require `--audit-backup` enabled on test server):**

> These 3 tools return `{success: false, error: "Audit backup not enabled"}` when `--audit-backup` is not set.

9. Setup: `pg_create_table({name: "temp_backup_test", columns: [{name: "id", type: "SERIAL", primaryKey: true}, {name: "name", type: "TEXT"}]})`, then `pg_batch_insert({table: "temp_backup_test", rows: [{name: "Alice"}, {name: "Bob"}]})`
10. `pg_truncate({table: "temp_backup_test"})` → triggers snapshot creation; verify `{success: true}`
11. `pg_audit_list_backups({target: "temp_backup_test"})` → verify `{snapshots: [...], count: N}` where `count >= 1`; each snapshot has `timestamp`, `tool`, `target`, `filename`
12. `pg_audit_list_backups({tool: "pg_truncate"})` → verify filter returns only snapshots created by `pg_truncate`
13. `pg_audit_list_backups()` → verify returns all snapshots; capture a `filename` from results for diff/restore tests

**Audit diff workflow:**

14. After item 10: `pg_write_query({sql: "ALTER TABLE temp_backup_test ADD COLUMN drift_col TEXT"})` → introduces schema drift
15. `pg_audit_diff_backup({filename: <captured from item 13>})` → verify response contains DDL differences showing the drift (additions/removals)
16. 🔴 `pg_audit_diff_backup({filename: "nonexistent_snapshot_xyz.json"})` → `{success: false, error: "..."}` handler error

**Audit restore workflow:**

17. `pg_audit_restore_backup({filename: <captured from item 13>, dryRun: true})` → verify dry-run returns DDL preview without executing; `drift_col` still present on live table
18. `pg_audit_restore_backup({filename: <captured from item 13>, confirm: true})` → verify restore applies DDL
19. 🔴 `pg_audit_restore_backup({filename: "nonexistent_snapshot_xyz.json", confirm: true})` → `{success: false, error: "..."}` handler error
20. 🔴 `pg_audit_restore_backup({filename: <valid filename>})` without `confirm` → `{success: false, error: "..."}` (confirm required)

**Zod validation / disabled-state error paths (🔴):**

21. 🔴 `pg_audit_diff_backup({})` → `{success: false, error: "..."}` (Zod validation — missing required `filename`)
22. 🔴 `pg_audit_restore_backup({})` → `{success: false, error: "..."}` (Zod validation — missing required `filename`)

**Code mode parity:**

23. `pg_execute_code({code: "return await pg.backup.help()"})` → verify lists audit backup methods (`listBackups`, `diffBackup`, `restoreBackup`)
24. `pg_execute_code({code: "return await pg.backup.listBackups()"})` → verify same structure as item 13

**Cleanup:**

25. `pg_drop_table({table: "temp_backup_test", ifExists: true})` → cleanup

---

### schema Group-Specific Testing

schema Tool Group (12 tools +1 for code mode)

1. 'pg_list_schemas'
2. 'pg_create_schema'
3. 'pg_drop_schema'
4. 'pg_list_sequences'
5. 'pg_create_sequence'
6. 'pg_drop_sequence'
7. 'pg_list_views'
8. 'pg_create_view'
9. 'pg_drop_view'
10. 'pg_list_functions'
11. 'pg_list_triggers'
12. 'pg_list_constraints'
13. 'pg_execute_code' (codemode, auto-added)

> **Instructions**: Execute every numbered checklist item with the exact inputs shown. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

1. `pg_list_schemas()` → verify `public` and `test_schema` in results
2. `pg_list_views()` → verify `test_order_summary` in results
3. `pg_list_sequences({schema: "test_schema"})` → verify `order_seq` appears
4. `pg_list_functions({schema: "public", limit: 5})` → verify response structure
5. `pg_list_constraints({table: "test_orders"})` → verify FK to `test_products` appears
6. `pg_list_triggers({schema: "public"})` → verify response structure (may be empty)
7. 🔴 `pg_list_constraints({table: "nonexistent_table_xyz"})` → `{success: false, error: "..."}` handler error
8. 🔴 `pg_create_sequence({name: "temp_seq_test", start: "abc"})` → must NOT return raw MCP `-32602` error — should return handler error (wrong-type numeric param)

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

> **Instructions**: Execute every numbered checklist item with the exact inputs shown. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

**Test data:** Uses `test_events`: `PARTITION BY RANGE (event_date)` with 4 quarterly partitions (`test_events_2024_q1` through `test_events_2024_q4`).

**Checklist:**

1. `pg_list_partitions({table: "test_events"})` → verify 4 quarterly partitions listed
2. `pg_partition_info({table: "test_events"})` → verify `{tableInfo, partitions, totalSizeBytes}`
3. `pg_list_partitions({table: "test_events", limit: 2})` → verify `{truncated: true, totalCount: 4}`
4. 🔴 `pg_list_partitions({table: "nonexistent_table_xyz"})` → `{success: false, error: "..."}` handler error
5. 🔴 `pg_partition_info({})` → `{success: false, error: "..."}` (Zod validation)

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

> **Instructions**: Execute every numbered checklist item with the exact inputs shown. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

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

9. `pg_stats_row_number({table: "test_measurements", column: "temperature", orderBy: "measured_at", limit: 5})` → verify 5 rows returned, each with `row_number` field (1-5)
10. `pg_stats_row_number({table: "test_measurements", column: "temperature", orderBy: "measured_at", partitionBy: "sensor_id", limit: 10})` → verify `row_number` resets per sensor_id partition
11. `pg_stats_rank({table: "test_measurements", column: "temperature", orderBy: "temperature", limit: 5})` → verify rows with `rank` field
12. `pg_stats_rank({table: "test_measurements", column: "temperature", orderBy: "temperature", method: "dense_rank", limit: 5})` → verify `dense_rank` — no gaps in ranking
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
29. 🔴 `pg_stats_row_number({})` → `{success: false, error: "..."}` (Zod validation — missing required `table`, `column`, `orderBy`)
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

> **Instructions**: Execute every numbered checklist item with the exact inputs shown. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

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

> **Instructions**: Execute every numbered checklist item with the exact inputs shown. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

**Test data:** Uses `test_locations.location` (POINT with SRID 4326, WGS84). GIST index on `location`.

Cities: New York, Los Angeles, Chicago, London, Tokyo.

Test distance calculations between cities (e.g., New York ↔ London).

**Checklist:**

1. `pg_geocode({lat: 40.7128, lng: -74.006})` → verify `{geojson, wkt}` present
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

> **Instructions**: Execute every numbered checklist item with the exact inputs shown. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

1. `pg_cron_list_jobs()` → verify response structure `{jobs, count}`
2. `pg_cron_schedule({name: "checklist_test_job", schedule: "0 5 * * *", command: "SELECT 1"})` → capture jobId
3. `pg_cron_list_jobs()` → verify `checklist_test_job` appears
4. `pg_cron_unschedule({jobName: "checklist_test_job"})` → verify success
5. `pg_cron_list_jobs()` → verify job removed
6. 🔴 `pg_cron_unschedule({jobName: "nonexistent_job_xyz"})` → `{success: false, error: "..."}` handler error
7. 🔴 `pg_cron_schedule({})` → `{success: false, error: "..."}` (Zod validation)
8. 🔴 `pg_cron_cleanup_history({days: "abc"})` → must NOT return raw MCP `-32602` error — should return handler error or silently default `days` (wrong-type numeric param)

---

### partman Group-Specific Testing

partman Tool Group (10 tools +1 for code mode)

1. 'pg_partman_create_extension'
2. 'pg_partman_create_parent'
3. 'pg_partman_run_maintenance'
4. 'pg_partman_show_partitions'
5. 'pg_partman_show_config'
6. 'pg_partman_check_default'
7. 'pg_partman_partition_data'
8. 'pg_partman_set_retention'
9. 'pg_partman_undo_partition'
10. 'pg_partman_analyze_partition_health'
11. 'pg_execute_code' (codemode, auto-added)

> **Instructions**: Execute every numbered checklist item with the exact inputs shown. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

**Test data:** Uses `test_logs`: `PARTITION BY RANGE (created_at)` — no partitions created yet (for partman to manage).

**Checklist:**

1. `pg_partman_create_parent({parentTable: "test_logs", controlColumn: "created_at", interval: "1 day", startPartition: "now"})` → verify success
2. `pg_partman_show_config({table: "test_logs"})` → verify config is returned
3. `pg_partman_show_partitions({parentTable: "test_logs"})` → verify partitions created
4. `pg_partman_run_maintenance({parentTable: "test_logs"})` → verify success response
5. `pg_partman_analyze_partition_health()` → verify `{summary}` with `overallHealth` field
6. Cleanup: `pg_partman_undo_partition` if applicable, or note state for reset-database.ps1
7. 🔴 `pg_partman_show_partitions({parentTable: "nonexistent_xyz"})` → `{success: false, error: "..."}` handler error
8. 🔴 `pg_partman_create_parent({})` → `{success: false, error: "..."}` (Zod validation)
9. 🔴 `pg_partman_partition_data({parentTable: "test_logs", batchSize: "abc"})` → must NOT return raw MCP `-32602` error — should return handler error or silently default `batchSize` (wrong-type numeric param)

---

### kcache Group-Specific Testing

kcache Tool Group (7 tools +1 for code mode)

1. 'pg_kcache_create_extension'
2. 'pg_kcache_query_stats'
3. 'pg_kcache_top_cpu'
4. 'pg_kcache_top_io'
5. 'pg_kcache_database_stats'
6. 'pg_kcache_resource_analysis'
7. 'pg_kcache_reset'
8. 'pg_execute_code' (codemode, auto-added)

> **Instructions**: Execute every numbered checklist item with the exact inputs shown. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

1. `pg_kcache_query_stats({limit: 5})` → verify `{queries, count}` structure (may be empty if extension not loaded with data)
2. `pg_kcache_top_cpu({limit: 3})` → verify response structure
3. `pg_kcache_top_io({type: "both", limit: 3})` → verify response structure
4. `pg_kcache_database_stats()` → verify per-database stats returned
5. 🔴 `pg_kcache_query_stats({limit: -1})` → verify returns handler error or graceful response (not MCP error)

---

### citext Group-Specific Testing

citext Tool Group (6 tools +1 for code mode)

1. 'pg_citext_create_extension'
2. 'pg_citext_convert_column'
3. 'pg_citext_list_columns'
4. 'pg_citext_analyze_candidates'
5. 'pg_citext_compare'
6. 'pg_citext_schema_advisor'
7. 'pg_execute_code' (codemode, auto-added)

> **Instructions**: Execute every numbered checklist item with the exact inputs shown. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

**Test data:** Uses `test_users` with CITEXT columns (`username`, `email`). Test case-insensitive matching: `JohnDoe` = `johndoe`.

**Checklist:**

1. `pg_citext_compare({value1: "JohnDoe", value2: "johndoe"})` → `{citextEqual: true, textEqual: false}`
2. `pg_citext_list_columns()` → verify `test_users.username` and `test_users.email` appear
3. `pg_citext_analyze_candidates({schema: "public", limit: 5})` → verify candidates returned
4. `pg_citext_schema_advisor({table: "test_users"})` → verify recommendations for already-citext columns
5. 🔴 `pg_citext_compare({})` → `{success: false, error: "..."}` (Zod validation — missing `value1`/`value2`)
6. 🔴 `pg_citext_schema_advisor({table: "nonexistent_xyz"})` → `{success: false, error: "..."}` handler error

---

### ltree Group-Specific Testing

ltree Tool Group (8 tools +1 for code mode)

1. 'pg_ltree_create_extension'
2. 'pg_ltree_query'
3. 'pg_ltree_subpath'
4. 'pg_ltree_lca'
5. 'pg_ltree_match'
6. 'pg_ltree_list_columns'
7. 'pg_ltree_convert_column'
8. 'pg_ltree_create_index'
9. 'pg_execute_code' (codemode, auto-added)

> **Instructions**: Execute every numbered checklist item with the exact inputs shown. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

**Test data:** Uses `test_categories` with LTREE paths. GIST index on `path`.

Paths: `electronics`, `electronics.phones`, `electronics.phones.smartphones`, `electronics.accessories`, `clothing`, `clothing.shirts`.

**Checklist:**

1. `pg_ltree_query({table: "test_categories", column: "path", path: "electronics"})` → verify descendants include `phones`, `smartphones`, `accessories`
2. `pg_ltree_query({table: "test_categories", column: "path", path: "electronics", mode: "exact"})` → exactly 1 result
3. `pg_ltree_subpath({path: "electronics.phones.smartphones", offset: 1, length: 2})` → `"phones.smartphones"`
4. `pg_ltree_lca({paths: ["electronics.phones", "electronics.accessories"]})` → `"electronics"`
5. `pg_ltree_match({table: "test_categories", column: "path", pattern: "electronics.*"})` → results include `phones`, `accessories`
6. `pg_ltree_list_columns()` → verify `test_categories.path` appears
7. 🔴 `pg_ltree_query({table: "nonexistent_xyz", column: "path", path: "a"})` → `{success: false, error: "..."}` handler error
8. 🔴 `pg_ltree_subpath({})` → `{success: false, error: "..."}` (Zod validation)

---

### pgcrypto Group-Specific Testing

pgcrypto Tool Group (9 tools +1 for code mode)

1. 'pg_pgcrypto_create_extension'
2. 'pg_pgcrypto_hash'
3. 'pg_pgcrypto_hmac'
4. 'pg_pgcrypto_encrypt'
5. 'pg_pgcrypto_decrypt'
6. 'pg_pgcrypto_gen_random_uuid'
7. 'pg_pgcrypto_gen_random_bytes'
8. 'pg_pgcrypto_gen_salt'
9. 'pg_pgcrypto_crypt'
10. 'pg_execute_code' (codemode, auto-added)

> **Instructions**: Execute every numbered checklist item with the exact inputs shown. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

**Test data:** Uses `test_secure_data` for storing encrypted data. Table is initially empty (pgcrypto tools create test data during testing).

**Checklist:**

1. `pg_pgcrypto_hash({data: "hello", algorithm: "sha256"})` → verify known SHA-256 hash of "hello" (hex: `2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824`)
2. `pg_pgcrypto_gen_random_uuid()` → verify UUID v4 format (8-4-4-4-12 hex)
3. `pg_pgcrypto_gen_random_uuid({count: 3})` → verify `{uuids: [...], count: 3}`
4. `pg_pgcrypto_gen_random_bytes({length: 16, encoding: "hex"})` → verify 32-char hex string
5. `pg_pgcrypto_gen_salt({type: "bf"})` → verify salt starts with `$2a$` or `$2b$`
6. `pg_pgcrypto_encrypt({data: "test", password: "key"})` → capture encrypted; then `pg_pgcrypto_decrypt` → verify `"test"` returned
7. 🔴 `pg_pgcrypto_hash({})` → `{success: false, error: "..."}` (Zod validation — missing `data` and `algorithm`)
8. 🔴 `pg_pgcrypto_decrypt({data: "invalid", password: "wrong"})` → `{success: false, error: "..."}` handler error

---

### introspection Group-Specific Testing

introspection Tool Group (6 tools +1 for code mode)

1. pg_dependency_graph
2. pg_topological_sort
3. pg_cascade_simulator
4. pg_schema_snapshot
5. pg_constraint_analysis
6. pg_migration_risks
7. pg_execute_code (codemode, auto-added)

> **Instructions**: Execute every numbered checklist item with the exact inputs shown. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

**Test data:** Uses the interconnected `test_departments → test_employees → test_projects → test_assignments` FK chain for dependency/cascade testing. Also uses `test_audit_log` (deliberately missing PK and unindexed FK) for constraint analysis.

**Key test scenarios:**

- **pg_dependency_graph**: Run with defaults — verify multi-table graph, self-reference on `test_employees.manager_id`, row counts, cascade/restrict/set-null edge annotations
- **pg_topological_sort**: Run with both `direction: "create"` and `direction: "drop"` — verify departments comes before employees in create order, reversed in drop
- **pg_cascade_simulator**: Simulate `DELETE` on `test_departments` — should show CASCADE to employees→assignments, RESTRICT block from projects, and NO ACTION block from audit_log (via employees). Simulate `DROP` to see full impact
- **pg_schema_snapshot**: Run with defaults and with `schema: "test_schema"` — verify comprehensive output (tables, views, indexes, constraints, functions, sequences). Test `compact: true` — verify tables section omits per-column details (no `columns` key in table rows) for reduced payload size
- **pg_constraint_analysis**: Should detect: missing PK on `test_audit_log`, unindexed FK `test_audit_log.employee_id`
- **pg_migration_risks**: Test with DDL statements including risky operations:
  - `["ALTER TABLE test_employees DROP COLUMN hire_date"]` (column drop = data loss risk)
  - `["ALTER TABLE test_orders ADD COLUMN status_new VARCHAR(20)"]` (safe)
  - `["DROP TABLE test_assignments CASCADE"]` (cascade drop risk)

**Checklist:**

1. `pg_dependency_graph()` → verify multi-table graph with `test_departments`, `test_employees`, `test_projects`, `test_assignments`, edge annotations
2. `pg_topological_sort({direction: "create"})` → verify `test_departments` appears before `test_employees`
3. `pg_topological_sort({direction: "drop"})` → verify reversed order
4. `pg_cascade_simulator({table: "test_departments", operation: "DELETE"})` → verify CASCADE path to employees→assignments, RESTRICT block from projects
5. `pg_schema_snapshot({compact: true})` → verify tables section omits column details
6. `pg_constraint_analysis()` → verify detects missing PK on `test_audit_log`, unindexed FK on `test_audit_log.employee_id`
7. `pg_migration_risks({statements: ["ALTER TABLE test_employees DROP COLUMN hire_date"]})` → verify data loss risk flagged
8. 🔴 `pg_dependency_graph({schema: "nonexistent_schema_xyz"})` → `{success: false, error: "..."}` handler error
9. 🔴 `pg_cascade_simulator({})` → `{success: false, error: "..."}` (Zod validation — missing required `table`)

**Code mode parity:**

10. `pg_execute_code({code: "return await pg.introspection.help()"})` → verify lists 6 introspection methods
11. `pg_execute_code({code: "return await pg.introspection.constraintAnalysis()"})` → verify same structure as item 6

---

### migration Group-Specific Testing

migration Tool Group (6 tools +1 for code mode)

1. pg_migration_init
2. pg_migration_record
3. pg_migration_apply
4. pg_migration_rollback
5. pg_migration_history
6. pg_migration_status
7. pg_execute_code (codemode, auto-added)

> **Instructions**: Execute every numbered checklist item with the exact inputs shown. Compare responses against the expected results. Report any deviation. These are the minimum-bar tests that must pass every run — freeform testing comes after.

**Migration Tracking** — test in this exact order, each step builds on the previous state:

**1. Initialize tracking table:**

- **pg_migration_init**: Call with defaults — verify `_mcp_schema_versions` table is created, `tableCreated: true` on first call, `tableCreated: false` on second

**2. Record-only (no execution):**

- **pg_migration_record**: Record a test migration with version `"test-record-1.0"`, description, migrationSql: `"CREATE TABLE temp_record_only (id INT);"`, rollbackSql: `"DROP TABLE temp_record_only;"`, sourceSystem: `"test"`, appliedBy: `"agent"` — verify SHA-256 hash and returned record with `record.status = "recorded"` (NOT `"applied"`). Confirm `temp_record_only` does NOT exist (record-only doesn't execute SQL). Call again with same SQL and different version — verify it succeeds (duplicate hash check only blocks `status: 'applied'` entries, so recording the same SQL twice is allowed by design)

**3. Apply migration — success path:**

- **pg_migration_apply**: Apply with version `"test-apply-1.0"`, migrationSql: `"CREATE TABLE temp_migration_test (id SERIAL PRIMARY KEY, name VARCHAR(100), created_at TIMESTAMP DEFAULT NOW());"`, rollbackSql: `"DROP TABLE IF EXISTS temp_migration_test;"`, sourceSystem: `"test"`, appliedBy: `"agent"`. Verify:
  - Response: `success: true` with `record.status = "applied"` and SHA-256 hash
  - Table `temp_migration_test` **actually exists** (run `pg_read_query` with `SELECT * FROM temp_migration_test`)
  - `pg_migration_history` shows the new record

**4. Apply migration — SQL failure + rollback + failed entry:**

- **pg_migration_apply**: Apply with version `"test-apply-fail"`, migrationSql: `"ALTER TABLE nonexistent_table_xyz ADD COLUMN bad_col INT;"`. Verify:
  - Response: `success: false`, error contains `"Transaction was rolled back"`
  - `pg_migration_history` with `status: "failed"` — verify the failed entry was recorded with version `"test-apply-fail"`

**5. Apply migration — duplicate hash detection:**

- **pg_migration_apply**: Apply with version `"test-apply-dup"` but use the EXACT same `migrationSql` as step 3 (`"CREATE TABLE temp_migration_test ..."`). Verify:
  - Response: `success: false`, error contains `"Duplicate migration detected"` with the original version `"test-apply-1.0"` and its ID

**6. Apply migration — validation errors:**

- **pg_migration_apply**: Call with `{}` (empty params) — verify structured error response with `"Validation error"` (not a raw MCP exception)
- **pg_migration_apply**: Call with `version: "v1"` but no `migrationSql` — verify structured validation error

**7. Rollback integration:**

- **pg_migration_rollback**: Dry-run first (`version: "test-apply-1.0"`, `dryRun: true`) — verify rollback SQL is returned (`"DROP TABLE IF EXISTS temp_migration_test;"`) without execution, table still exists
- **pg_migration_rollback**: Execute (`version: "test-apply-1.0"`) — verify status changes to `rolled_back` and `temp_migration_test` is dropped
- **pg_migration_apply**: Re-apply the same `migrationSql` from step 3 with version `"test-apply-2.0"` — verify it succeeds now (duplicate check only blocks `status: 'applied'` entries, not rolled-back ones)

**8. History and status verification:**

- **pg_migration_history**: Query all records — verify you see entries from steps 2-7. Filter by `status: "applied"` — should show step 7's re-applied migration. Filter by `status: "recorded"` — should show step 2's record-only entry. Filter by `status: "failed"` — should show step 4's failed entry
- **pg_migration_status**: Verify counts match expected state: applied, recorded, rolledBack, failed counts; latestVersion; sourceSystems includes `"test"`

**9. Cleanup:**

- Drop `temp_migration_test` table (from step 7 re-apply)
- Drop `_mcp_schema_versions` table (or rely on `reset-database.ps1` which now handles it)

**Checklist:**

1. `pg_migration_init()` → `{success: true, tableCreated: true}` on first call
2. `pg_migration_init()` → `{success: true, tableCreated: false}` on second call (idempotent)
3. `pg_migration_status()` → verify `{initialized: true, counts}` structure
4. `pg_migration_apply({version: "test-apply-1.0", migrationSql: "CREATE TABLE temp_migration_test (id SERIAL PRIMARY KEY);", rollbackSql: "DROP TABLE IF EXISTS temp_migration_test;"})` → `{success: true, record: {status: "applied"}}`
5. `pg_migration_history()` → verify entry from step 4 appears
6. `pg_migration_rollback({version: "test-apply-1.0", dryRun: true})` → verify rollback SQL returned without execution
7. 🔴 `pg_migration_apply({})` → `{success: false, error: "Validation error: ..."}` (Zod validation — missing required fields)
8. 🔴 `pg_migration_apply({version: "v1"})` → `{success: false, error: "Validation error: ..."}` (missing `migrationSql`)
9. 🔴 `pg_migration_history({offset: "abc"})` → must NOT return raw MCP `-32602` error — should return handler error or silently default `offset` (wrong-type numeric param)

**Code mode parity:**

10. `pg_execute_code({code: "return await pg.migration.help()"})` → verify lists 6 migration methods
11. `pg_execute_code({code: "return await pg.migration.status()"})` → verify same structure as item 3
