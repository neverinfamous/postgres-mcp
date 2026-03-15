# Agent Experience Test — postgres-mcp

> **Purpose:** Validate that the slim `instructions` field + `postgres://help` resources are sufficient for an agent to operate the server cold — with **zero** schema info, tool hints, or checklists in the prompt.

## How to Run

Run **each pass** as a separate conversation with the corresponding `--tool-filter`. Each pass tests whether the agent can complete realistic tasks using only the tools + help resources available under that filter.

| Pass | `--tool-filter` | Tools | Scenarios |
|------|-----------------|-------|-----------|
| Pass 1 | `starter` | Core, Trans, JSONB, Schema (~60) | 1–12 |
| Pass 2 | `dev-analytics` | Core, Trans, Stats, Partitioning (~43) | 13–16 |
| Pass 3 | `ai-data` | Core, JSONB, Text, Trans (~61) | 17–19 |
| Pass 4 | `ai-vector` | Core, Vector, Trans, Part (~51) | 20–22 |
| Pass 5 | `geo` | Core, PostGIS, Trans (~44) | 23–25 |
| Pass 6 | `dba-monitor` | Core, Monitoring, Perf, Trans (~64) | 26–28 |
| Pass 7 | `dba-infra` | Core, Admin, Backup, Part (~46) | 29–31 |
| Pass 8 | `core,introspection,migration` | Core, Introspection, Migration (~33) | 32–34 |
| Pass 9 | `codemode` | Code Mode only (1+3) | 35–37 |

> **Important:** Do NOT combine passes. Each pass is a fresh conversation with a clean context. The agent has never seen this database before.

## Rules

1. **Do NOT read** `test-tools.md`, `test-group-tools.md`, or any other test documentation before running these scenarios
2. **Do NOT read** source code files (`src/`) — you are a user, not a developer
3. **DO** use the MCP instructions you received during initialization + `postgres://help` resources
4. **DO** discover the database schema via `postgres://schema` or `postgres://tables` resources
5. **DO** read group-specific help (`postgres://help/{group}`) when you need reference for unfamiliar tools
6. The test database is already connected (Docker container `postgres-server`, database `postgres`)

## Success Criteria

| Symbol | Meaning |
|--------|---------|
| ✅ | Agent completed the task correctly without external help |
| ⚠️ | Agent completed but needed multiple retries or used wrong tools first |
| ❌ | Agent failed or produced incorrect results |
| 📖 | Agent had to read help resources — note which ones |

Track **every** help resource read and whether it provided what was needed. Gaps are the actionable finding.

## Reporting Format

For each scenario, report:

```
### Scenario N: [title]
**Result:** ✅/⚠️/❌
**Resources read:** postgres://help, postgres://help/jsonb (or "none beyond instructions")
**Tools used:** pg_read_query, pg_jsonb_extract, ...
**Issues:** (any gaps in help content, confusing tool names, missing examples)
```

---

## Pass 1: `starter` (Core, Trans, JSONB, Schema)

### Phase 1 — Discovery

#### Scenario 1 — What's in this database?
List all tables and briefly describe what each one contains, including any partitioned tables and special column types.

#### Scenario 2 — Table deep dive
Pick the most interesting table and fully characterize it: row count, column types, indexes, constraints, and any foreign key relationships.

#### Scenario 3 — Health check
Is the database healthy? What PostgreSQL version is running? What are the key settings (shared_buffers, work_mem, etc.)?

### Phase 2 — Core Operations

#### Scenario 4 — Filtered read
Find all products priced above $50, sorted by price descending.

#### Scenario 5 — Aggregation
What is the total revenue (sum of total_price) per order status? Which status has the highest revenue?

#### Scenario 6 — Write and verify
Create a new product called "Test Widget" priced at $29.99, then verify it was inserted. Clean up after.

### Phase 3 — JSONB Operations

#### Scenario 7 — JSONB extraction
Extract the `name` field from the JSONB `metadata` column in `test_jsonb_docs`. What keys exist at the top level?

#### Scenario 8 — Nested JSONB
Query for documents where `metadata->'nested'->'key'` has a specific value. Does the agent navigate JSONB paths correctly?

#### Scenario 9 — JSONB analysis
Analyze the structure of the `settings` column in `test_jsonb_docs`. What field types and nesting patterns exist?

### Phase 4 — Schema Management

#### Scenario 10 — Schema exploration
List all schemas, views, sequences, and functions in the database. How many are user-created vs system?

#### Scenario 11 — View management
Create a view called `test_view_order_summary` that joins products and orders. Query it. Clean up after.

#### Scenario 12 — Constraint analysis
List all constraints on `test_orders`. What types are they (PK, FK, CHECK, UNIQUE)?

---

## Pass 2: `dev-analytics` (Core, Trans, Stats, Partitioning)

### Phase 5 — Statistics

#### Scenario 13 — Descriptive stats
Compute descriptive statistics (mean, median, std dev, min, max) for the `temperature` column in `test_measurements`. Break it down by `sensor_id`.

#### Scenario 14 — Correlation
Is there a correlation between temperature and humidity in `test_measurements`? How strong?

#### Scenario 15 — Partition inspection
How are `test_events` partitioned? List the partitions, their ranges, and row counts.

#### Scenario 16 — Cross-table analysis
Which products have the most orders? Join the data and present a ranked summary with product name, order count, and total revenue.

---

## Pass 3: `ai-data` (Core, JSONB, Text, Trans)

### Phase 6 — Text & Full-Text Search

#### Scenario 17 — Full-text search
Search `test_articles` for articles about "database" and "index". Rank results by relevance using the tsvector column.

#### Scenario 18 — Fuzzy matching
Find users in `test_users` whose names are similar to "jon" (case-insensitive, fuzzy). Did citext affect the results?

#### Scenario 19 — JSONB + Text combo
Find events in `test_events` where the JSONB `payload` contains a specific key, and filter by event_type using text matching.

---

## Pass 4: `ai-vector` (Core, Vector, Trans, Partitioning)

### Phase 7 — Vector & Semantic Search

#### Scenario 20 — Similarity search
Find the 5 embeddings most similar to the first embedding in `test_embeddings`. What categories are they?

#### Scenario 21 — Filtered vector search
Search for similar embeddings but only within the "tech" category. Can the agent combine metadata filters with vector search?

#### Scenario 22 — Vector stats
What are the dimensions of the embeddings? How many vectors are stored? What index type is used?

---

## Pass 5: `geo` (Core, PostGIS, Trans)

### Phase 8 — Geospatial

#### Scenario 23 — Distance between cities
What is the distance between New York (or NYC) and Tokyo based on the geometry data in `test_locations`?

#### Scenario 24 — Nearby locations
Find all locations within 10,000 km of London. How many are there?

#### Scenario 25 — Spatial query
Find all locations within a bounding box covering North America. Which cities are included?

---

## Pass 6: `dba-monitor` (Core, Monitoring, Perf, Trans)

### Phase 9 — Monitoring & Performance

#### Scenario 26 — Database overview
What are the current database size, active connections, and cache hit ratio?

#### Scenario 27 — Slow query analysis
Are there any long-running queries? What are the top queries by total execution time?

#### Scenario 28 — Table bloat
Check for table bloat across all test tables. Which tables, if any, would benefit from a VACUUM?

---

## Pass 7: `dba-infra` (Core, Admin, Backup, Partitioning)

### Phase 10 — Admin & Infrastructure

#### Scenario 29 — Database maintenance
Run ANALYZE on all test tables. Then check the vacuum and analyze stats — when were tables last maintained?

#### Scenario 30 — Backup
Create a logical dump of the `test_products` table. Verify the dump was created successfully.

#### Scenario 31 — Partition management
Inspect the partitioning setup for `test_events`. Can the agent identify the partition strategy and boundaries?

---

## Pass 8: `core,introspection,migration` (Core, Introspection, Migration)

### Phase 11 — Schema Analysis & Migration

#### Scenario 32 — Dependency graph
Map out the foreign key dependency graph starting from `test_departments`. What's the full cascade chain? Which tables depend on it?

#### Scenario 33 — Cascade simulation
What would happen if `test_departments` row 1 were deleted? Simulate the cascade impact on employees, projects, and assignments.

#### Scenario 34 — Migration workflow
Initialize migration tracking, then create and apply a migration that adds a `description` column to `test_products`. Roll it back after verifying.

---

## Pass 9: `codemode` (Code Mode only)

### Phase 12 — Code Mode Discovery & Efficiency

#### Scenario 35 — Cold-start Code Mode
Using only `pg_execute_code`, list all tables, pick one, and run a query against it. Can the agent discover the `pg.*` API without external help?

#### Scenario 36 — Multi-step workflow
Using only `pg_execute_code`, find the top 5 products by order count with total revenue — in a single code execution.

#### Scenario 37 — Cross-group orchestration
Using only `pg_execute_code`, do a full data quality audit: check for NULLs, orphaned FKs, missing indexes, and table bloat — all in one execution. Compare the token efficiency vs individual tool calls.

---

## Post-Test Summary

Compile findings across all passes into:

1. **Help resource gaps** — scenarios where help content was missing, incomplete, or misleading
2. **Discovery friction** — cases where the agent struggled to find the right tool or resource
3. **Suggested improvements** — specific additions to `src/constants/server-instructions/*.md`

> **Key metric:** How many of the 37 scenarios did the agent complete on the first try with ≤1 help resource read? This measures whether the instructions + tool descriptions are self-sufficient.
