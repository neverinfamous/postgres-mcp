# postgres-mcp Test Database — Agent Testing Instructions

> **This README is optimized for AI agent consumption.** It serves as the primary orchestration document for running manual MCP functionality tests against the local PostgreSQL database (`postgres`).

## Files

| File | Size | Purpose | When to Read |
|------|------|---------|--------------|
| `test-tools.md` | 17 KB | **Entry-point protocol** — schema reference, P154 error patterns, Split Schema verification, structured error docs, cleanup rules. Paste a group checklist from `test-group-tools.md` at the bottom. | Always read first (Step 1 says read `src/constants/server-instructions.md`, Step 2 is the testing) |
| `test-group-tools.md` | 48 KB | Per-group **deterministic checklists** for all 22 tool groups. Each section has numbered items with exact inputs/outputs, 🔴 error path items, alias tests, and create→use→drop lifecycles. | When running a specific tool group |
| `advanced-test-tools.md` | 26 KB | **Second-pass stress tests** — 8 categories: boundary values, state pollution, alias matrix, error quality, concurrency/transactions, extension edge cases, payload truncation, code mode parity. | After basic checklist passes |
| `test-preflight.md` | ~2KB | **Pre-flight check** — validates slim instructions, help resources, data resources, and tool-filter alignment in 5 steps | Before any test pass |
| `test-resources.md` | 5 KB | Resource testing plan (20 `postgres://` resources via `read_resource`) | When testing resources |
| `test-resources.sql` | 10 KB | Seed SQL for resource-specific test data (`resource_test_job` cron, vacuum stats, etc.) | Run before resource testing |
| `test-prompts.md` | 8 KB | Prompt testing plan (19 prompts). Tested manually since agents typically don't invoke prompts yet. | When testing prompts |
| `test-prompts.sql` | 19 KB | Seed SQL for prompt-specific `prompt_*` tables | Run before prompt testing |
| `tool-groups-list.md` | 8 KB | **Canonical tool inventory** — all 22 groups, 231 tools (222 published + 9 utility). Source of truth for tool counts. | Reference / auditing |
| `Tool-Reference.md` | 31 KB | **Complete Tool Reference** — Detailed list of all 231 tools mapped to their specific tool groups. | Reference |
| [`code-map.md`](code-map.md) | ~16KB | **Source Code Map** — Directory tree, handler→tool mapping, type/schema locations, error hierarchy, constants, architecture patterns. | When debugging source code or making changes |
| `test-database.sql` | 9 KB | Core seed SQL for all `test_*` tables | Reference only — reset script uses this |
| `reset-database.ps1` | 15 KB | PowerShell script to reset Docker container DB from seed data. Handles `_mcp_migrations`, partman cleanup, cron jobs. | After migration/partman testing or data pollution |

## Connection Details (Docker)

| Property  | Value         |
| --------- | ------------- |
| Host      | `localhost`   |
| Port      | `5432`   |
| Database  | `postgres`      |
| Container  | `postgres-server`      |
| Password  | `root`      |
| User  | `root`      |

## Test Database Schema 

| Table | Rows | Key Columns | Special Types | Primary Tool Groups |
|-------|------|-------------|---------------|---------------------|
| `test_products` | 15 | id, name, price | — | Core, Stats |
| `test_orders` | 20 | product_id FK→products, status | — | Core, Stats, Transactions |
| `test_jsonb_docs` | 3 | id | **metadata, settings, tags** (JSONB) | JSONB (19 tools) |
| `test_articles` | 3 | title, body, **search_vector** | TSVECTOR + GIN index | Text (13 tools) |
| `test_measurements` | 500 | sensor_id (INT 1-6), temperature, humidity, pressure | — | Stats (8 tools) |
| `test_embeddings` | 50 | content, category, **embedding** | vector(384) + HNSW index | Vector (16 tools) |
| `test_locations` | 5 | name, **location** | GEOMETRY POINT SRID 4326 + GIST | PostGIS (15 tools) |
| `test_users` | 3 | **username, email** | CITEXT | Citext (6 tools) |
| `test_categories` | 6 | name, **path** | LTREE + GIST index | Ltree (8 tools) |
| `test_secure_data` | 0 | sensitive_data | BYTEA | pgcrypto (9 tools) |
| `test_events` | 100 | event_type, event_date, payload (JSONB) | **PARTITION BY RANGE** (4 quarterly) | Partitioning, Partman |
| `test_logs` | 0 | log_level, message, created_at | **PARTITION BY RANGE** (no partitions — for partman) | Partman |
| `test_departments` | 3 | name, budget | — | Introspection |
| `test_employees` | 5 | department_id FK CASCADE, manager_id FK self-ref SET NULL | — | Introspection |
| `test_projects` | 2 | lead_id FK SET NULL, department_id FK RESTRICT | — | Introspection |
| `test_assignments` | 3 | employee_id FK CASCADE, project_id FK CASCADE, UNIQUE(emp,proj) | — | Introspection |
| `test_audit_log` | 3 | employee_id FK (**no PK, no index on FK** — intentional) | — | Introspection |

**Schema objects:** `test_schema`, `test_schema.order_seq` (starts 1000), `test_order_summary` (view), `test_get_order_count()` (function).

**Indexes:** `idx_orders_status`, `idx_orders_date`, `idx_articles_fts` (GIN), `idx_locations_geo` (GIST), `idx_categories_path` (GIST), HNSW on `test_embeddings.embedding`.

## Tool Groups (22 groups, 231 tools)

| Group | Tools | Key Test Data |
|-------|-------|---------------|
| core | 20+1 | `test_products`, `test_orders` |
| transactions | 7+1 | temp tables |
| jsonb | 19+1 | `test_jsonb_docs` (nested paths, arrays), `test_events.payload` |
| text | 13+1 | `test_articles` (FTS, GIN index) |
| performance | 24+1 | system catalogs |
| admin | 10+1 | `test_products` (vacuum/analyze targets) |
| monitoring | 11+1 | system catalogs |
| backup | 9+1 | `test_products` (dump targets) |
| schema | 12+1 | `test_schema`, views, sequences, constraints |
| partitioning | 6+1 | `test_events` (4 quarterly partitions) |
| stats | 8+1 | `test_measurements` (500 rows, 6 sensors) |
| vector | 16+1 | `test_embeddings` (384-dim, HNSW, 5 categories) |
| postgis | 15+1 | `test_locations` (5 cities: NYC, LA, Chicago, London, Tokyo) |
| cron | 8+1 | schedule/unschedule lifecycle |
| partman | 10+1 | `test_logs` (unpartitioned, for partman to manage) |
| kcache | 7+1 | pg_stat_kcache system stats |
| citext | 6+1 | `test_users` (case-insensitive username/email) |
| ltree | 8+1 | `test_categories` (electronics→phones→smartphones hierarchy) |
| pgcrypto | 9+1 | `test_secure_data`, encrypt/decrypt/hash cycles |
| introspection | 6+1 | `test_departments→employees→projects→assignments` FK chain, cascade simulation, schema analysis |
| migration | 6+1 | Migration tracking, SHA-256 dedup, rollback, history/status |

## Conventions & Protocols

| Convention | Rule |
|------------|------|
| **Temp tables (basic)** | `temp_*` prefix → drop after testing |
| **Temp tables (stress)** | `stress_*` prefix → drop after testing |
| **Temp views** | `test_view_*` prefix |
| **Temp schemas** | `test_schema_*` prefix |
| **Temp functions** | `test_func_*` prefix |
| **Reporting** | ❌ Fail, ⚠️ Issue, 📦 Payload. ✅ inline only, omit from final summary. |
| **Error testing** | Every tool: (a) domain error + (b) Zod `{}` error. Must return enriched `ErrorResponse` (`{success, error, code, category, suggestion, recoverable}`), NOT raw MCP error. Zod errors must say `"Validation error: ..."`, NOT raw JSON array. |
| **Error items in checklists** | Marked with 🔴 prefix |
| **P154 pattern** | All tools must return structured errors for nonexistent tables/schemas via `formatHandlerError` |
| **Split Schema** | Verify `inputSchema` exposes parameters; verify aliases work via direct MCP calls |
| **Code mode** | Test both `pg_execute_code` and direct tool calls |
| **Post-test** | Clean up → plan fixes → implement → lint+typecheck → changelog → commit (no push) → re-test fixes via live MCP |
| **Database reset** | Run `.\reset-database.ps1` after migration/partman testing or data pollution |

## Agent Workflow

1. Read `postgres://help` resource (via MCP — critical gotchas, aliases, Code Mode API) and relevant group help (`postgres://help/{group}`).
2. Read `test-tools.md` for protocol, schema, and error pattern details.
3. Copy target group from `test-group-tools.md`. 
4. Run checklist + explicit 🔴 error path and alias tests.
5. Clean up temp tables (`DROP TABLE IF EXISTS`).
6. Report findings returning proper handler errors (`{success: false, error: "..."}`).
7. (Optional) Run stress tests from `advanced-test-tools.md`.
