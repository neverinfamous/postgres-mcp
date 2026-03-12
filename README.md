# postgres-mcp

<!-- mcp-name: io.github.neverinfamous/postgres-mcp -->

**Last Updated March 10, 2026**

**PostgreSQL MCP Server** enabling AI assistants (AntiGravity, Claude, Cursor, etc.) to interact with PostgreSQL databases through the Model Context Protocol. Features **Code Mode** — a revolutionary approach that provides access to all 232 tools through a single, secure JavaScript sandbox, eliminating the massive token overhead of multi-step tool calls. Also includes schema introspection, migration tracking, smart tool filtering, deterministic error handling, connection pooling, HTTP/SSE Transport, OAuth 2.1 authentication, and extension support for citext, ltree, pgcrypto, pg_cron, pg_stat_kcache, pgvector, PostGIS, and HypoPG.

**232 Specialized Tools** · **20 Resources** · **19 AI-Powered Prompts**

[![GitHub](https://img.shields.io/badge/GitHub-neverinfamous/postgres--mcp-blue?logo=github)](https://github.com/neverinfamous/postgres-mcp)
![GitHub Release](https://img.shields.io/github/v/release/neverinfamous/postgres-mcp)
[![Docker Pulls](https://img.shields.io/docker/pulls/writenotenow/postgres-mcp)](https://hub.docker.com/r/writenotenow/postgres-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/MCP-Registry-green.svg)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.neverinfamous/postgres-mcp)
[![npm](https://img.shields.io/npm/v/@neverinfamous/postgres-mcp)](https://www.npmjs.com/package/@neverinfamous/postgres-mcp)
[![Security](https://img.shields.io/badge/Security-Enhanced-green.svg)](https://github.com/neverinfamous/postgres-mcp/blob/main/SECURITY.md)
![Status](https://img.shields.io/badge/status-Production%2FStable-brightgreen)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://github.com/neverinfamous/postgres-mcp)
[![E2E](https://github.com/neverinfamous/postgres-mcp/actions/workflows/e2e.yml/badge.svg)](https://github.com/neverinfamous/postgres-mcp/actions/workflows/e2e.yml)
[![Tests](https://img.shields.io/badge/Tests-3750_passed-success.svg)](https://github.com/neverinfamous/postgres-mcp)
[![Coverage](https://img.shields.io/badge/Coverage-96.18%25-brightgreen.svg)](https://github.com/neverinfamous/postgres-mcp)

**[Docker Hub](https://hub.docker.com/r/writenotenow/postgres-mcp)** • **[npm Package](https://www.npmjs.com/package/@neverinfamous/postgres-mcp)** • **[MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.neverinfamous/postgres-mcp)** • **[Wiki](https://github.com/neverinfamous/postgres-mcp/wiki)** • **[Tool Reference](https://github.com/neverinfamous/postgres-mcp/wiki/Tool-Reference)** • **[Changelog](https://github.com/neverinfamous/postgres-mcp/blob/main/CHANGELOG.md)**

## 🎯 What Sets Us Apart

| Feature                                | Description                                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **232 Specialized Tools**              | The largest PostgreSQL tool collection for MCP — from core CRUD and native JSONB to pgvector, PostGIS, pg_cron, ltree, pgcrypto, introspection analysis, migration tracking, and 8 extension ecosystems                                                                                                      |
| **20 Observability Resources**         | Real-time schema, performance metrics, connection pool status, replication lag, vacuum stats, lock contention, and extension diagnostics                                                                                                                                                                     |
| **19 AI-Powered Prompts**              | Guided workflows for query building, schema design, performance tuning, and extension setup                                                                                                                                                                                                                  |
| **Code Mode**                          | **Massive Token Savings:** Execute complex, multi-step operations inside a fast, secure JavaScript sandbox. Instead of spending thousands of tokens on back-and-forth tool calls, Code Mode exposes all 232 capabilities locally, reducing token overhead by up to 90% and supercharging AI agent reasoning. |
| **Token-Optimized Payloads**           | Every tool response is designed for minimal token footprint. Tools include `limit`, `summary`, and `compact` parameters where applicable — letting agents control response size without losing data access. Monitoring tools default to bounded results, and large datasets include `limited`/`totalAvailable` metadata so agents always know the full picture. |
| **OAuth 2.1 + Access Control**         | Enterprise-ready security with RFC 9728/8414 compliance, granular scopes (`read`, `write`, `admin`, `full`, `db:*`, `table:*:*`), and Keycloak integration                                                                                                                                                   |
| **Smart Tool Filtering**               | 22 tool groups + 16 shortcuts let you stay within IDE limits while exposing exactly what you need                                                                                                                                                                                                            |
| **Dual HTTP Transport**                | Streamable HTTP (`/mcp`) for modern clients + legacy SSE (`/sse`) for backward compatibility — both protocols supported simultaneously                                                                                                                                                                       |
| **High-Performance Pooling**           | Built-in connection pooling with health checks for efficient, concurrent database access                                                                                                                                                                                                                     |
| **8 Extension Ecosystems**             | First-class support for **pgvector**, **PostGIS**, **pg_cron**, **pg_partman**, **pg_stat_kcache**, **citext**, **ltree**, and **pgcrypto**                                                                                                                                                                  |
| **Introspection & Migration Tracking** | Simulate cascade impacts, generate safe DDL ordering, analyze constraint health, and track schema migrations with SHA-256 dedup — 12 agent-optimized tools split into read-only analysis and migration management groups                                                                                     |
| **Deterministic Error Handling**       | Every tool returns structured `{success, error}` responses — no raw exceptions, no silent failures, no misleading messages. Agents get actionable context instead of cryptic PostgreSQL codes                                                                                                                |
| **Production-Ready Security**          | SQL injection protection, parameterized queries, input validation, sandboxed code execution, SSL certificate verification by default, HTTP body size enforcement, 7 security headers, server timeouts (slowloris protection), Retry-After rate limiting, `trustProxy` for reverse proxy deployments, and opt-in HSTS |
| **Benchmarked Performance**            | 93+ [Vitest benchmarks](https://github.com/neverinfamous/postgres-mcp/wiki/Performance) across 10 domains: tool dispatch at 6.9M ops/sec, identifier sanitization at 4.4M ops/sec, auth checks at 5.3M ops/sec, and schema parsing at 2.1M ops/sec                                                           |
| **Strict TypeScript**                  | 100% type-safe codebase with 3448 tests and 95.09% coverage                                                                                                                                                                                                                                                  |
| **MCP 2025-11-25 Compliant**           | Full protocol support with tool safety hints, resource priorities, and progress notifications                                                                                                                                                                                                                |

## 🚀 Quick Start

### Prerequisites

- PostgreSQL 12-18 (tested with PostgreSQL 18.1)
- **Docker** (recommended) or Node.js 24+ (LTS)

### Docker (Recommended)

```bash
docker pull writenotenow/postgres-mcp:latest
```

```json
{
  "mcpServers": {
    "postgres-mcp": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-e",
        "POSTGRES_HOST",
        "-e",
        "POSTGRES_PORT",
        "-e",
        "POSTGRES_USER",
        "-e",
        "POSTGRES_PASSWORD",
        "-e",
        "POSTGRES_DATABASE",
        "writenotenow/postgres-mcp:latest",
        "--tool-filter",
        "starter"
      ],
      "env": {
        "POSTGRES_HOST": "host.docker.internal",
        "POSTGRES_PORT": "5432",
        "POSTGRES_USER": "your_username",
        "POSTGRES_PASSWORD": "your_password",
        "POSTGRES_DATABASE": "your_database"
      }
    }
  }
}
```

**Customization Notes:**

- Update credentials (`your_username`, `your_password`, etc.) with your PostgreSQL credentials
- **Extension tools** gracefully handle cases where extensions are not installed

> **Note for Docker**: Use `host.docker.internal` to connect to PostgreSQL running on your host machine.

📖 **Full Docker guide:** [DOCKER_README.md](DOCKER_README.md) · [Docker Hub](https://hub.docker.com/r/writenotenow/postgres-mcp)

### npm

```bash
npm install -g @neverinfamous/postgres-mcp
postgres-mcp --transport stdio --postgres postgres://user:password@localhost:5432/database
```

### From Source

```bash
git clone https://github.com/neverinfamous/postgres-mcp.git
cd postgres-mcp
npm install
npm run build
node dist/cli.js --transport stdio --postgres postgres://user:password@localhost:5432/database
```

---

## Code Mode: Maximum Efficiency

Code Mode (`pg_execute_code`) dramatically reduces token usage (70–90%) and is included by default in all presets.

Code executes in a **sandboxed VM context** with multiple layers of security. All `pg.*` API calls execute against the database within the sandbox, providing:

- **Static code validation** — blocked patterns include `require()`, `process`, `eval()`, and filesystem access
- **Rate limiting** — 60 executions per minute per client
- **Hard timeouts** — configurable execution limit (default 30s)
- **Full API access** — all 22 tool groups are available via `pg.*` (e.g., `pg.core.readQuery()`, `pg.jsonb.extract()`, `pg.introspection.dependencyGraph()`, `pg.migration.migrationStatus()`)
- **Requires `admin` OAuth scope** — execution is logged for audit

### ⚡ Code Mode Only (Maximum Token Savings)

If you control your own setup, you can run with **only Code Mode enabled** — a single tool that provides access to all 232 tools' worth of capability through the `pg.*` API:

```json
{
  "mcpServers": {
    "postgres-mcp": {
      "command": "node",
      "args": [
        "/path/to/postgres-mcp/dist/cli.js",
        "--transport",
        "stdio",
        "--tool-filter",
        "codemode"
      ],
      "env": {
        "POSTGRES_HOST": "localhost",
        "POSTGRES_PORT": "5432",
        "POSTGRES_USER": "your_user",
        "POSTGRES_PASSWORD": "your_password",
        "POSTGRES_DATABASE": "your_database"
      }
    }
  }
}
```

This exposes just `pg_execute_code`. The agent writes JavaScript against the typed `pg.*` SDK — composing queries, chaining operations across all 22 tool groups, and returning exactly the data it needs — in one execution. This mirrors the [Code Mode pattern](https://blog.cloudflare.com/code-mode-mcp/) pioneered by Cloudflare for their entire API: fixed token cost regardless of how many capabilities exist.

#### Disabling Code Mode (Non-Admin Users)

If you don't have admin access or prefer individual tool calls, exclude codemode:

```json
{
  "args": ["--tool-filter", "starter,-codemode"]
}
```

📖 **Full documentation:** [docs/CODE_MODE.md](docs/CODE_MODE.md)

---

## Development

See **[From Source](#from-source)** above for setup. After cloning:

```bash
npm run lint && npm run typecheck  # Run checks
npm run bench                      # Run performance benchmarks
node dist/cli.js info              # Test CLI
node dist/cli.js list-tools        # List available tools
```

### Benchmarks

Run `npm run bench` to execute the performance benchmark suite (10 files, 93+ scenarios) powered by [Vitest Bench](https://vitest.dev/guide/features.html#benchmarking). Use `npm run bench:verbose` for detailed table output.

**Performance Highlights** (Node.js 24, Windows 11):

| Area                        | Benchmark                                | Throughput    |
| --------------------------- | ---------------------------------------- | ------------- |
| **Tool Dispatch**           | Map.get() single tool lookup             | ~6.9M ops/sec |
| **WHERE Validation**        | Simple clause (combined regex fast-path) | ~3.7M ops/sec |
| **Identifier Sanitization** | validateIdentifier()                     | ~4.4M ops/sec |
| **Auth — Token Extraction** | extractBearerToken()                     | ~2.7M ops/sec |
| **Auth — Scope Checking**   | hasScope()                               | ~5.3M ops/sec |
| **Rate Limiting**           | Single IP check                          | ~2.3M ops/sec |
| **Logger**                  | Filtered debug (no-op path)              | ~5.4M ops/sec |
| **Schema Parsing**          | MigrationInitSchema.parse()              | ~2.1M ops/sec |
| **Metadata Cache**          | Cache hit + miss pattern                 | ~1.7M ops/sec |
| **Sandbox Creation**        | CodeModeSandbox.create() cold start      | ~863 ops/sec  |

> Full benchmark results and methodology are available on the [Performance wiki page](https://github.com/neverinfamous/postgres-mcp/wiki/Performance).

---

## 🔗 Database Connection Scenarios

| Scenario                       | Host to Use                           | Example Connection String                         |
| ------------------------------ | ------------------------------------- | ------------------------------------------------- |
| **PostgreSQL on host machine** | `localhost` or `host.docker.internal` | `postgres://user:pass@localhost:5432/db`          |
| **PostgreSQL in Docker**       | Container name or network             | `postgres://user:pass@postgres-container:5432/db` |
| **Remote/Cloud PostgreSQL**    | Hostname or IP                        | `postgres://user:pass@db.example.com:5432/db`     |

| Provider           | Example Hostname                                 |
| ------------------ | ------------------------------------------------ |
| AWS RDS PostgreSQL | `your-instance.xxxx.us-east-1.rds.amazonaws.com` |
| Google Cloud SQL   | `project:region:instance` (via Cloud SQL Proxy)  |
| Azure PostgreSQL   | `your-server.postgres.database.azure.com`        |
| Supabase           | `db.xxxx.supabase.co`                            |
| Neon               | `ep-xxx.us-east-1.aws.neon.tech`                 |

---

## 🛠️ Tool Filtering

> [!IMPORTANT]
> All shortcuts and tool groups include **Code Mode** (`pg_execute_code`) by default for token-efficient operations. To exclude it, add `-codemode` to your filter: `--tool-filter cron,pgcrypto,-codemode`

### What Can You Filter?

The `--tool-filter` argument accepts **shortcuts**, **groups**, or **tool names** — mix and match freely:

| Filter Pattern   | Example                   | Tools | Description               |
| ---------------- | ------------------------- | ----- | ------------------------- |
| Shortcut only    | `starter`                 | 60    | Use a predefined bundle   |
| Groups only      | `core,jsonb,transactions` | 48    | Combine individual groups |
| Shortcut + Group | `starter,+text`           | 73    | Extend a shortcut         |
| Shortcut - Tool  | `starter,-pg_drop_table`  | 59    | Remove specific tools     |

### Shortcuts (Predefined Bundles)

| Shortcut        | Tools  | Use Case                 | What's Included                                          |
| --------------- | ------ | ------------------------ | -------------------------------------------------------- |
| `starter`       | **60** | Standard Package         | Core, trans, JSONB, schema, codemode                     |
| `essential`     | 48     | Minimal footprint        | Core, trans, JSONB, codemode                             |
| `dev-schema`    | 53     | Dev Schema & Migrations  | Core, trans, schema, introspection, migration, codemode  |
| `dev-analytics` | 43     | Dev Analytics            | Core, trans, stats, partitioning, codemode               |
| `ai-data`       | 61     | AI Data Analyst          | Core, JSONB, text, trans, codemode                       |
| `ai-vector`     | 51     | AI/ML with pgvector      | Core, vector, trans, part, codemode                      |
| `dba-monitor`   | 64     | DBA Monitoring           | Core, monitoring, perf, trans, codemode                  |
| `dba-schema`    | 45     | DBA Schema & Migrations  | Core, schema, introspection, migration, codemode         |
| `dba-infra`     | 46     | DBA Infrastructure       | Core, admin, backup, partitioning, codemode              |
| `dba-stats`     | 58     | DBA Stats                | Core, admin, monitoring, trans, stats, codemode          |
| `geo`           | 44     | Geospatial Workloads     | Core, PostGIS, trans, codemode                           |
| `base-ops`      | 51     | Operations Block         | Admin, monitoring, backup, part, stats, citext, codemode |
| `ext-ai`        | 26     | Extension: AI/Security   | pgvector, pgcrypto, codemode                             |
| `ext-geo`       | 24     | Extension: Spatial       | PostGIS, ltree, codemode                                 |
| `ext-schedule`  | 19     | Extension: Scheduling    | pg_cron, pg_partman, codemode                            |
| `ext-perf`      | 32     | Extension: Perf/Analysis | pg_stat_kcache, performance, codemode                    |

### Tool Groups (22 Available)

| Group           | Tools | Description                                                           |
| --------------- | ----- | --------------------------------------------------------------------- |
| `codemode`      | 1     | Code Mode (sandboxed code execution) 🌟 **Recommended**               |
| `core`          | 21    | Read/write queries, tables, indexes, convenience/drop tools           |
| `transactions`  | 9     | BEGIN, COMMIT, ROLLBACK, savepoints, status                           |
| `jsonb`         | 20    | JSONB manipulation and queries                                        |
| `text`          | 14    | Full-text search, fuzzy matching                                      |
| `performance`   | 25    | EXPLAIN, query analysis, optimization, diagnostics, anomaly detection |
| `admin`         | 11    | VACUUM, ANALYZE, REINDEX                                              |
| `monitoring`    | 12    | Database sizes, connections, status                                   |
| `backup`        | 10    | pg_dump, COPY, restore                                                |
| `schema`        | 13    | Schemas, views, sequences, functions, triggers                        |
| `introspection` | 7     | Dependency graphs, cascade simulation, schema analysis                |
| `migration`     | 7     | Schema migration tracking and management                              |
| `partitioning`  | 7     | Native partition management                                           |
| `stats`         | 9     | Statistical analysis                                                  |
| `vector`        | 17    | pgvector (AI/ML similarity search)                                    |
| `postgis`       | 16    | PostGIS (geospatial)                                                  |
| `cron`          | 9     | pg_cron (job scheduling)                                              |
| `partman`       | 11    | pg_partman (auto-partitioning)                                        |
| `kcache`        | 8     | pg_stat_kcache (OS-level stats)                                       |
| `citext`        | 7     | citext (case-insensitive text)                                        |
| `ltree`         | 9     | ltree (hierarchical data)                                             |
| `pgcrypto`      | 10    | pgcrypto (encryption, UUIDs)                                          |

---

### Syntax Reference

| Prefix   | Target   | Example          | Effect                                        |
| -------- | -------- | ---------------- | --------------------------------------------- |
| _(none)_ | Shortcut | `starter`        | **Whitelist Mode:** Enable ONLY this shortcut |
| _(none)_ | Group    | `core`           | **Whitelist Mode:** Enable ONLY this group    |
| `+`      | Group    | `+vector`        | Add tools from this group to current set      |
| `-`      | Group    | `-admin`         | Remove tools in this group from current set   |
| `+`      | Tool     | `+pg_explain`    | Add one specific tool                         |
| `-`      | Tool     | `-pg_drop_table` | Remove one specific tool                      |

**Legacy Syntax (still supported):**
If you start with a negative filter (e.g., `-base,-extensions`), it assumes you want to start with _all_ tools enabled and then subtract.

---

## 🌐 HTTP/SSE Transport (Remote Access)

For remote access, web-based clients, or HTTP-compatible MCP hosts, use the HTTP transport:

```bash
node dist/cli.js \
  --transport http \
  --port 3000 \
  --postgres "postgres://user:pass@localhost:5432/db"
```

**Docker:**

```bash
docker run --rm -p 3000:3000 \
  -e POSTGRES_URL=postgres://user:pass@host:5432/db \
  writenotenow/postgres-mcp:latest \
  --transport http --port 3000
```

The server supports **two MCP transport protocols simultaneously**, enabling both modern and legacy clients to connect:

### Streamable HTTP (Recommended)

Modern protocol (MCP 2025-03-26) — single endpoint, session-based:

| Method   | Endpoint | Purpose                                          |
| -------- | -------- | ------------------------------------------------ |
| `POST`   | `/mcp`   | JSON-RPC requests (initialize, tools/list, etc.) |
| `GET`    | `/mcp`   | SSE stream for server notifications              |
| `DELETE` | `/mcp`   | Session termination                              |

Sessions are managed via the `Mcp-Session-Id` header.

### Legacy SSE (Backward Compatibility)

Legacy protocol (MCP 2024-11-05) — for clients like Python `mcp.client.sse`:

| Method | Endpoint                   | Purpose                                                       |
| ------ | -------------------------- | ------------------------------------------------------------- |
| `GET`  | `/sse`                     | Opens SSE stream, returns `/messages?sessionId=<id>` endpoint |
| `POST` | `/messages?sessionId=<id>` | Send JSON-RPC messages to the session                         |

### Utility Endpoints

| Method | Endpoint  | Purpose                                          |
| ------ | --------- | ------------------------------------------------ |
| `GET`  | `/health` | Health check (bypasses rate limiting, always available for monitoring) |

---

## 🔐 OAuth 2.1 Authentication

When using HTTP/SSE transport, oauth 2.1 authentication can protect your MCP endpoints.

### Configuration

**CLI Options:**

```bash
node dist/cli.js \
  --transport http \
  --port 3000 \
  --postgres "postgres://user:pass@localhost:5432/db" \
  --oauth-enabled \
  --oauth-issuer http://localhost:8080/realms/postgres-mcp \
  --oauth-audience postgres-mcp-client
```

**Environment Variables (Required):**

```bash
OAUTH_ENABLED=true
OAUTH_ISSUER=http://localhost:8080/realms/postgres-mcp
OAUTH_AUDIENCE=postgres-mcp-client
```

**Environment Variables (Optional — auto-discovered from issuer):**

```bash
OAUTH_JWKS_URI=http://localhost:8080/realms/postgres-mcp/protocol/openid-connect/certs
OAUTH_CLOCK_TOLERANCE=60
```

### OAuth Scopes

Access control is managed through OAuth scopes:

| Scope                    | Access Level                        |
| ------------------------ | ----------------------------------- |
| `read`                   | Read-only queries (SELECT, EXPLAIN) |
| `write`                  | Read + write operations             |
| `admin`                  | Full administrative access          |
| `full`                   | Grants all access                   |
| `db:{name}`              | Access to specific database         |
| `schema:{name}`          | Access to specific schema           |
| `table:{schema}:{table}` | Access to specific table            |

### RFC Compliance

This implementation follows:

- **RFC 9728** — OAuth 2.0 Protected Resource Metadata
- **RFC 8414** — OAuth 2.0 Authorization Server Metadata
- **RFC 7591** — OAuth 2.0 Dynamic Client Registration

The server exposes metadata at `/.well-known/oauth-protected-resource`.

> **Note for Keycloak users:** Add an **Audience mapper** to your client (Client → Client scopes → dedicated scope → Add mapper → Audience) to include the correct `aud` claim in tokens.

> [!NOTE]
> **Per-tool scope enforcement:** Scopes are enforced at the tool level — each tool group maps to a required scope (`read`, `write`, or `admin`). When OAuth is enabled, every tool invocation checks the calling token's scopes before execution. When OAuth is not configured, scope checks are skipped entirely.

> [!WARNING]
> **HTTP without OAuth:** When using `--transport http` without enabling OAuth, all clients have full unrestricted access. Always enable OAuth for production HTTP deployments. See [SECURITY.md](SECURITY.md) for details.

---

## ⚡ Performance Tuning

| Variable                | Default     | Description                                        |
| ----------------------- | ----------- | -------------------------------------------------- |
| `MCP_HOST`              | `localhost` | Server bind host (`0.0.0.0` for containers)        |
| `METADATA_CACHE_TTL_MS` | `30000`     | Cache TTL for schema metadata (milliseconds)       |
| `LOG_LEVEL`             | `info`      | Log verbosity: `debug`, `info`, `warning`, `error` |

> **Tip:** Lower `METADATA_CACHE_TTL_MS` for development (e.g., `5000`), or increase it for production with stable schemas (e.g., `300000` = 5 min).

> **Pool Tuning for IAM Auth:** For cloud-managed databases with IAM authentication (e.g., AWS RDS, Google Cloud SQL), set `POSTGRES_POOL_MIN=2` to keep warm connections and reduce authentication latency.

---

## 🤖 AI-Powered Prompts

Prompts provide step-by-step guidance for complex database tasks. Instead of figuring out which tools to use and in what order, simply invoke a prompt and follow its workflow — great for learning PostgreSQL best practices or automating repetitive DBA tasks.

This server includes **19 intelligent prompts** for guided workflows:

| Prompt                     | Description                                        | Required Groups               | Shortcut       |
| -------------------------- | -------------------------------------------------- | ----------------------------- | -------------- |
| `pg_query_builder`         | Construct queries with CTEs and window functions   | core                          | `starter`      |
| `pg_schema_design`         | Design schemas with constraints and indexes        | core                          | `starter`      |
| `pg_performance_analysis`  | Analyze queries with EXPLAIN and optimization      | core, performance             | `dba-monitor`  |
| `pg_migration`             | Generate migration scripts with rollback support   | core                          | `starter`      |
| `pg_tool_index`            | Lazy hydration - compact index of all tools        | —                             | any            |
| `pg_quick_query`           | Quick SQL query guidance for common operations     | core                          | `starter`      |
| `pg_quick_schema`          | Quick reference for exploring database schema      | core                          | `starter`      |
| `pg_database_health_check` | Comprehensive database health assessment           | core, performance, monitoring | `dba-monitor`  |
| `pg_backup_strategy`       | Enterprise backup planning with RTO/RPO            | core, monitoring, backup      | `dba-infra`    |
| `pg_index_tuning`          | Index analysis and optimization workflow           | core, performance             | `dba-monitor`  |
| `pg_extension_setup`       | Extension installation and configuration guide     | core                          | `starter`      |
| `pg_setup_pgvector`        | Complete pgvector setup for semantic search        | core, vector                  | `ai-vector`    |
| `pg_setup_postgis`         | Complete PostGIS setup for geospatial operations   | core, postgis                 | `geo`          |
| `pg_setup_pgcron`          | Complete pg_cron setup for job scheduling          | core                          | `ext-schedule` |
| `pg_setup_partman`         | Complete pg_partman setup for partition management | core, partman                 | `ext-schedule` |
| `pg_setup_kcache`          | Complete pg_stat_kcache setup for OS monitoring    | core, kcache                  | `ext-perf`     |
| `pg_setup_citext`          | Complete citext setup for case-insensitive text    | core, citext                  | `base-ops`     |
| `pg_setup_ltree`           | Complete ltree setup for hierarchical data         | core, ltree                   | `ext-geo`      |
| `pg_setup_pgcrypto`        | Complete pgcrypto setup for cryptographic funcs    | core, pgcrypto                | `ext-ai`       |

---

## 📦 Resources

Resources give you instant snapshots of database state without writing queries. Perfect for quickly checking schema, health, or performance metrics — the AI can read these to understand your database context before suggesting changes.

This server provides **20 resources** for structured data access:

| Resource     | URI                       | Description                                        |
| ------------ | ------------------------- | -------------------------------------------------- |
| Schema       | `postgres://schema`       | Full database schema                               |
| Tables       | `postgres://tables`       | Table listing with sizes                           |
| Settings     | `postgres://settings`     | PostgreSQL configuration                           |
| Statistics   | `postgres://stats`        | Database statistics with stale detection           |
| Activity     | `postgres://activity`     | Current connections                                |
| Pool         | `postgres://pool`         | Connection pool status                             |
| Capabilities | `postgres://capabilities` | Server version, extensions, tool categories        |
| Performance  | `postgres://performance`  | pg_stat_statements query metrics                   |
| Health       | `postgres://health`       | Comprehensive database health status               |
| Extensions   | `postgres://extensions`   | Extension inventory with recommendations           |
| Indexes      | `postgres://indexes`      | Index usage with unused detection                  |
| Replication  | `postgres://replication`  | Replication status and lag monitoring              |
| Vacuum       | `postgres://vacuum`       | Vacuum stats and wraparound warnings               |
| Locks        | `postgres://locks`        | Lock contention detection                          |
| Cron         | `postgres://cron`         | pg_cron job status and execution history           |
| Partman      | `postgres://partman`      | pg_partman partition configuration and health      |
| Kcache       | `postgres://kcache`       | pg_stat_kcache CPU/I/O metrics summary             |
| Vector       | `postgres://vector`       | pgvector columns, indexes, and recommendations     |
| PostGIS      | `postgres://postgis`      | PostGIS spatial columns and index status           |
| Crypto       | `postgres://crypto`       | pgcrypto availability and security recommendations |

---

## 🔧 Extension Support

| Extension            | Purpose                        | Tools                      |
| -------------------- | ------------------------------ | -------------------------- |
| `pg_stat_statements` | Query performance tracking     | `pg_stat_statements`       |
| `pg_trgm`            | Text similarity                | `pg_trigram_similarity`    |
| `fuzzystrmatch`      | Fuzzy matching                 | `pg_fuzzy_match`           |
| `hypopg`             | Hypothetical indexes           | `pg_index_recommendations` |
| `pgvector`           | Vector similarity search       | 16 vector tools            |
| `PostGIS`            | Geospatial operations          | 15 postgis tools           |
| `pg_cron`            | Job scheduling                 | 8 cron tools               |
| `pg_partman`         | Automated partition management | 10 partman tools           |
| `pg_stat_kcache`     | OS-level CPU/memory/I/O stats  | 7 kcache tools             |
| `citext`             | Case-insensitive text          | 6 citext tools             |
| `ltree`              | Hierarchical tree labels       | 8 ltree tools              |
| `pgcrypto`           | Hashing, encryption, UUIDs     | 9 pgcrypto tools           |

> Extension tools gracefully handle cases where extensions are not installed. Extension tool counts include `create_extension` helpers but exclude Code Mode; the [Tool Groups](#-tool-filtering) table above adds +1 per group for Code Mode.

---

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting a pull request.

## Security

For security concerns, please see our [Security Policy](SECURITY.md).

> **⚠️ Never commit credentials** - Store secrets in environment variables

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating in this project.
