# Introspection Tools

Code Mode: `pg.introspection.*` — 6 read-only tools for schema analysis.
Core: `dependencyGraph()`, `topologicalSort()`, `cascadeSimulator()`, `schemaSnapshot()`, `constraintAnalysis()`, `migrationRisks()`

**Schema Analysis (6 tools):**

- `pg_dependency_graph`: FK dependency graph with cycle detection, row counts, edge annotations (CASCADE, RESTRICT, etc.). Params: `schema?`, `includeRowCounts?` (default: true), `excludeExtensionSchemas?` (default: true), `compact?` (default: false).
- `pg_topological_sort`: Safe DDL execution order via Kahn's algorithm. Params: `schema?`, `direction`: 'create' (default) or 'drop', `excludeExtensionSchemas?` (default: true). Self-referencing FKs are filtered.
- `pg_cascade_simulator`: Simulates DELETE/DROP/TRUNCATE impact with cascade path tracing. Params: `table` (supports schema.table format), `schema?` (default: public), `operation`: 'DELETE' (default), 'DROP', 'TRUNCATE'. ⚠️ DROP/TRUNCATE force-cascades. Stats include `blockingActions` (RESTRICT/NO ACTION FKs).
- `pg_schema_snapshot`: Full schema snapshot. Params: `schema?`, `includeSystem?` (default: false), `excludeExtensionSchemas?` (default: true), `sections?`: array of object types, `compact?`: `true` (default) omits per-column details and 0-value keys from stats. Returns `{snapshot, stats, generatedAt, compact?}`
- `pg_constraint_analysis`: Identifies constraint issues. Params: `schema?`, `table?`, `checks?`: `['redundant','missing_fk','missing_not_null','missing_pk','unindexed_fk']`, `excludeExtensionSchemas?` (default: true). Returns `{findings, summary}`
- `pg_migration_risks`: Static DDL risk assessment. Params: `statements` (aliases: `statement`, `sql`), `schema?` (default: public). ⚠️ Does NOT validate object existence—analyzes SQL patterns only. Returns `{risks, summary}`

**Discovery**: `pg.introspection.help()` returns `{methods, methodAliases, examples}`
