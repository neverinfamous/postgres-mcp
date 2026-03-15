# Introspection Tools

Code Mode: `pg.introspection.*` — 6 read-only tools for schema analysis.
Core: `dependencyGraph()`, `topologicalSort()`, `cascadeSimulator()`, `schemaSnapshot()`, `constraintAnalysis()`, `migrationRisks()`

**Schema Analysis (6 tools):**

- `pg_dependency_graph`: FK dependency graph with cycle detection, row counts, edge annotations (CASCADE, RESTRICT, SET NULL, SET DEFAULT, NO ACTION). Params: `schema?`, `includeRowCounts?` (default: true), `excludeExtensionSchemas?` (default: true, excludes cron/topology/tiger/tiger_data)
- `pg_topological_sort`: Safe DDL execution order via Kahn's algorithm. `direction: 'create'` (default) = dependencies first; `direction: 'drop'` = dependents first. `excludeExtensionSchemas?` (default: true). Self-referencing FKs are filtered (don't affect ordering)
- `pg_cascade_simulator`: Simulates DELETE/DROP/TRUNCATE impact with cascade path tracing. `operation`: 'DELETE' (default), 'DROP', 'TRUNCATE'. ⚠️ DROP/TRUNCATE force-cascade regardless of FK ON DELETE rule → always `severity: 'critical'` when dependent tables exist. Returns `{sourceTable, operation, affectedTables, severity, stats}`. Stats include `blockingActions` (NO ACTION + RESTRICT FKs that would prevent the operation)
- `pg_schema_snapshot`: Full schema snapshot in one call. `sections?`: `['tables','views','indexes','constraints','functions','triggers','sequences','types','extensions']` to limit output. `compact?`: `true` to omit per-column details from tables section for reduced payload (use `pg_describe_table` to drill into specific tables). `excludeExtensionSchemas?` (default: true): excludes cron, topology, tiger, tiger_data schemas. `schema?`: filter to specific schema. Returns `{snapshot, stats, generatedAt, compact?}`
- `pg_constraint_analysis`: Identifies constraint issues. `checks?`: `['redundant','missing_fk','missing_not_null','missing_pk','unindexed_fk']`. Returns `{findings, summary}`
- `pg_migration_risks`: Static DDL risk assessment. ⚠️ Does NOT validate object existence—analyzes SQL patterns only. Returns `{risks, summary}`

**Discovery**: `pg.introspection.help()` returns `{methods, methodAliases, examples}`
