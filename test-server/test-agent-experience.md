# Agent Experience Test — postgres-mcp

> **Purpose:** Validate that the slim `instructions` field + `postgres://help` resources are sufficient for an agent to operate the server cold — with **zero** schema info, tool hints, or checklists in the prompt.

## How to Run

Run **each pass** as a separate conversation with the corresponding `--tool-filter`. Each pass tests whether the agent can complete realistic tasks using only the tools + help resources available under that filter.

| Pass   | `--tool-filter`                | Tools                                  | Scenarios |
| ------ | ------------------------------ | -------------------------------------- | --------- |
| Pass 1 | `starter`                      | Core, Trans, JSONB, Schema (~60)       | 1–13      |
| Pass 2 | `dev-analytics`                | Core, Trans, Stats, Partitioning (~54) | 14–19     |
| Pass 3 | `ai-data`                      | Core, JSONB, Text, Trans (~61)         | 20–22     |
| Pass 4 | `ai-vector`                    | Core, Vector, Trans, Part (~51)        | 23–25     |
| Pass 5 | `geo`                          | Core, PostGIS, Trans (~44)             | 26–28     |
| Pass 6 | `dba-monitor`                  | Core, Monitoring, Perf, Trans (~64)    | 29–31     |
| Pass 7 | `dba-infra`                    | Core, Admin, Backup, Part (~46)        | 32–36, 44 |
| Pass 8 | `core,introspection,migration` | Core, Introspection, Migration (~33)   | 37–39     |
| Pass 9 | `codemode`                     | Code Mode only (1+3)                   | 40–43     |

> **Important:** Do NOT combine passes. Each pass is a fresh conversation with a clean context. The agent has never seen this database before.

## Rules

1. **Do NOT read** `test-tools.md`, `test-group-tools.md`, or any other test documentation before running these scenarios
2. **Do NOT read** source code files (`src/`) — you are a user, not a developer
3. **DO** use the MCP instructions you received during initialization + `postgres://help` resources
4. **DO** discover the database schema via `postgres://schema` or `postgres://tables` resources
5. **DO** read group-specific help (`postgres://help/{group}`) when you need reference for unfamiliar tools
6. The test database is already connected (Docker container `postgres-server`, database `postgres`)

## Success Criteria

| Symbol | Meaning                                                               |
| ------ | --------------------------------------------------------------------- |
| ✅     | Agent completed the task correctly without external help              |
| ⚠️     | Agent completed but needed multiple retries or used wrong tools first |
| ❌     | Agent failed or produced incorrect results                            |
| 📖     | Agent had to read help resources — note which ones                    |

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

## Pass 1: `starter`

**Tool groups under test:** `core` (21), `transactions` (9), `jsonb` (20), `schema` (13), `codemode` (1)

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

#### Scenario 10 — JSONB formatting

Pretty-print the JSONB metadata for the first document in `test_jsonb_docs` in a human-readable format. Can the agent present nested JSON structures readably?

### Phase 4 — Schema Management

#### Scenario 11 — Schema exploration

List all schemas, views, sequences, and functions in the database. How many are user-created vs system?

#### Scenario 12 — View management

Create a view called `test_view_order_summary` that joins products and orders. Query it. Clean up after.

#### Scenario 13 — Constraint analysis

List all constraints on `test_orders`. What types are they (PK, FK, CHECK, UNIQUE)?

---

## Pass 2: `dev-analytics`

**Tool groups under test:** `core` (21), `transactions` (9), `stats` (20), `partitioning` (7), `codemode` (1)

### Phase 5 — Statistics

#### Scenario 14 — Descriptive stats

Compute descriptive statistics (mean, median, std dev, min, max) for the `temperature` column in `test_measurements`. Break it down by `sensor_id`.

#### Scenario 15 — Correlation

Is there a correlation between temperature and humidity in `test_measurements`? How strong?

#### Scenario 16 — Window function analysis

Rank all sensors by their average temperature. For each sensor, show a running total of temperature readings over time. Which sensor shows the most temperature variation?

#### Scenario 17 — Outlier detection

Are there any anomalous temperature readings in `test_measurements`? Identify statistical outliers and explain what makes them unusual compared to the overall distribution.

#### Scenario 18 — Multi-column summary

Give me a quick statistical overview of all numeric columns in `test_measurements`. Which columns have the highest variance? How many distinct sensor IDs are there?

#### Scenario 19 — Partition inspection

How are `test_events` partitioned? List the partitions, their ranges, and row counts.

---

## Pass 3: `ai-data`

**Tool groups under test:** `core` (21), `jsonb` (20), `text` (14), `transactions` (9), `codemode` (1)

### Phase 6 — Text & Full-Text Search

#### Scenario 20 — Full-text search

Search `test_articles` for articles about "database" and "index". Rank results by relevance using the tsvector column.

#### Scenario 21 — Fuzzy matching

Find users in `test_users` whose names are similar to "jon" (case-insensitive, fuzzy). Did citext affect the results?

#### Scenario 22 — JSONB + Text combo

Find events in `test_events` where the JSONB `payload` contains a specific key, and filter by event_type using text matching.

---

## Pass 4: `ai-vector`

**Tool groups under test:** `core` (21), `vector` (17), `transactions` (9), `partitioning` (7), `codemode` (1)

### Phase 7 — Vector & Semantic Search

#### Scenario 23 — Similarity search

Find the 5 embeddings most similar to the first embedding in `test_embeddings`. What categories are they?

#### Scenario 24 — Filtered vector search

Search for similar embeddings but only within the "tech" category. Can the agent combine metadata filters with vector search?

#### Scenario 25 — Vector stats

What are the dimensions of the embeddings? How many vectors are stored? What index type is used?

---

## Pass 5: `geo`

**Tool groups under test:** `core` (21), `postgis` (16), `transactions` (9), `codemode` (1)

### Phase 8 — Geospatial

#### Scenario 26 — Distance between cities

What is the distance between New York (or NYC) and Tokyo based on the geometry data in `test_locations`?

#### Scenario 27 — Nearby locations

Find all locations within 10,000 km of London. How many are there?

#### Scenario 28 — Spatial query

Find all locations within a bounding box covering North America. Which cities are included?

---

## Pass 6: `dba-monitor`

**Tool groups under test:** `core` (21), `monitoring` (12), `performance` (25), `transactions` (9), `codemode` (1)

### Phase 9 — Monitoring & Performance

#### Scenario 29 — Database overview

What are the current database size, active connections, and cache hit ratio?

#### Scenario 30 — Slow query analysis

Are there any long-running queries? What are the top queries by total execution time?

#### Scenario 31 — Table bloat

Check for table bloat across all test tables. Which tables, if any, would benefit from a VACUUM?

---

## Pass 7: `dba-infra`

**Tool groups under test:** `core` (21), `admin` (11), `backup` (12), `partitioning` (7), `codemode` (1)

### Phase 10 — Admin & Infrastructure

#### Scenario 32 — Database maintenance

Run ANALYZE on all test tables. Then check the vacuum and analyze stats — when were tables last maintained?

#### Scenario 33 — Backup

Create a logical dump of the `test_products` table. Verify the dump was created successfully.

#### Scenario 34 — Partition management

Inspect the partitioning setup for `test_events`. Can the agent identify the partition strategy and boundaries?

#### Scenario 35 — Insight memo

As you investigate the database health, record your key findings as insights so they can be reviewed later via the insights resource. Append at least 3 observations about the database state, then verify they're accessible.

#### Scenario 36 — Audit trail, recovery, and non-destructive restore

Create a table, insert data, then truncate it (triggering a pre-mutation snapshot). List the snapshot. Add a column to simulate schema drift, then diff the snapshot — can the agent read the `volumeDrift` information without being told it exists? Finally, restore — but use **non-destructive restore** (`restoreAs`) to recover the original schema alongside the current drifted table, rather than overwriting it. Can the agent complete the full "oops → recover safely" workflow using only the backup tools and help resources, without any prior knowledge of `restoreAs` or `volumeDrift`?

#### Scenario 44 — Safe restore workflow prompt

The server provides a prompt called `pg_safe_restore_workflow`. Without being told what it does, invoke it and follow its guidance to recover a table that has diverged from a known-good snapshot. Does the prompt provide enough context for the agent to complete the workflow safely?

---

## Pass 8: `core,introspection,migration`

**Tool groups under test:** `core` (21), `introspection` (7), `migration` (7), `codemode` (1)

### Phase 11 — Schema Analysis & Migration

#### Scenario 37 — Dependency graph

Map out the foreign key dependency graph starting from `test_departments`. What's the full cascade chain? Which tables depend on it?

#### Scenario 38 — Cascade simulation

What would happen if `test_departments` row 1 were deleted? Simulate the cascade impact on employees, projects, and assignments.

#### Scenario 39 — Migration workflow

Initialize migration tracking, then create and apply a migration that adds a `description` column to `test_products`. Roll it back after verifying.

---

## Pass 9: `codemode`

**Tool groups under test:** `codemode` (1) + built-in resources (3)

### Phase 12 — Code Mode Discovery & Efficiency

#### Scenario 40 — Cold-start Code Mode

Using only `pg_execute_code`, list all tables, pick one, and run a query against it. Can the agent discover the `pg.*` API without external help?

#### Scenario 41 — Multi-step workflow

Using only `pg_execute_code`, find the top 5 products by order count with total revenue — in a single code execution.

#### Scenario 42 — Cross-group orchestration

Using only `pg_execute_code`, do a full data quality audit: check for NULLs, orphaned FKs, missing indexes, and table bloat — all in one execution. Compare the token efficiency vs individual tool calls.

#### Scenario 43 — Stats pipeline via Code Mode

Using only `pg_execute_code`, compute outlier detection on `test_measurements.temperature`, then get the frequency distribution of `sensor_id`, and summarize all numeric columns — all in a single execution. Can the agent discover the `pg.stats.*` API methods?

---

## Post-Test Summary

Compile findings across all passes into:

1. **Help resource gaps** — scenarios where help content was missing, incomplete, or misleading (44 scenarios total)
2. **Discovery friction** — cases where the agent struggled to find the right tool or resource
3. **Suggested improvements** — specific additions to `src/constants/server-instructions/*.md`

> **Key metric:** How many of the 44 scenarios did the agent complete on the first try with ≤1 help resource read? This measures whether the instructions + tool descriptions are self-sufficient.
