# postgres-mcp

<!-- mcp-name: io.github.neverinfamous/postgres-mcp -->

**Last Updated February 27, 2026**

**PostgreSQL MCP Server** enabling AI assistants (AntiGravity, Claude, Cursor, etc.) to interact with PostgreSQL databases through the Model Context Protocol. Features **Code Mode** — a revolutionary approach that provides access to all 227 tools through a single, secure JavaScript sandbox, eliminating the massive token overhead of multi-step tool calls. Also includes smart tool filtering, deterministic error handling, connection pooling, HTTP/SSE Transport, OAuth 2.1 authentication, and extension support for citext, ltree, pgcrypto, pg_cron, pg_stat_kcache, pgvector, PostGIS, and HypoPG.

**227 specialized tools** · **20 resources** · **19 AI-powered prompts**

[![GitHub](https://img.shields.io/badge/GitHub-neverinfamous/postgres--mcp-blue?logo=github)](https://github.com/neverinfamous/postgresql-mcp)
![GitHub Release](https://img.shields.io/github/v/release/neverinfamous/postgresql-mcp)
[![Docker Pulls](https://img.shields.io/docker/pulls/writenotenow/postgres-mcp)](https://hub.docker.com/r/writenotenow/postgres-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/MCP-Registry-green.svg)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.neverinfamous/postgres-mcp)
[![npm](https://img.shields.io/npm/v/@neverinfamous/postgres-mcp)](https://www.npmjs.com/package/@neverinfamous/postgres-mcp)
[![Security](https://img.shields.io/badge/Security-Enhanced-green.svg)](https://github.com/neverinfamous/postgresql-mcp/blob/main/SECURITY.md)
![Status](https://img.shields.io/badge/status-Production%2FStable-brightgreen)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://github.com/neverinfamous/postgresql-mcp)
[![Tests](https://img.shields.io/badge/Tests-3000_passed-success.svg)](https://github.com/neverinfamous/postgresql-mcp)
[![Coverage](https://img.shields.io/badge/Coverage-92.10%25-brightgreen.svg)](https://github.com/neverinfamous/postgresql-mcp)

**[Docker Hub](https://hub.docker.com/r/writenotenow/postgres-mcp)** • **[npm Package](https://www.npmjs.com/package/@neverinfamous/postgres-mcp)** • **[MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.neverinfamous/postgres-mcp)** • **[Wiki](https://github.com/neverinfamous/postgresql-mcp/wiki)** • **[Changelog](https://github.com/neverinfamous/postgresql-mcp/blob/main/CHANGELOG.md)**

## 🎯 What Sets Us Apart

| Feature                          | Description                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **227 Specialized Tools**        | The largest PostgreSQL tool collection for MCP — from core CRUD and native JSONB to pgvector, PostGIS, pg_cron, ltree, pgcrypto, introspection analysis, schema version tracking, and 8 extension ecosystems                                                                                                 |
| **20 Observability Resources**   | Real-time schema, performance metrics, connection pool status, replication lag, vacuum stats, lock contention, and extension diagnostics                                                                                                                                                                     |
| **19 AI-Powered Prompts**        | Guided workflows for query building, schema design, performance tuning, and extension setup                                                                                                                                                                                                                  |
| **Code Mode**                    | **Massive Token Savings:** Execute complex, multi-step operations inside a fast, secure JavaScript sandbox. Instead of spending thousands of tokens on back-and-forth tool calls, Code Mode exposes all 227 capabilities locally, reducing token overhead by up to 90% and supercharging AI agent reasoning. |
| **OAuth 2.1 + Access Control**   | Enterprise-ready security with RFC 9728/8414 compliance, granular scopes (`read`, `write`, `admin`, `full`, `db:*`, `table:*:*`), and Keycloak integration                                                                                                                                                   |
| **Smart Tool Filtering**         | 21 tool groups + 16 shortcuts let you stay within IDE limits while exposing exactly what you need                                                                                                                                                                                                            |
| **HTTP Streaming Transport**     | SSE-based streaming with `/mcp`, and `/health` endpoints for remote deployments                                                                                                                                                                                                                              |
| **High-Performance Pooling**     | Built-in connection pooling with health checks for efficient, concurrent database access                                                                                                                                                                                                                     |
| **8 Extension Ecosystems**       | First-class support for **pgvector**, **PostGIS**, **pg_cron**, **pg_partman**, **pg_stat_kcache**, **citext**, **ltree**, and **pgcrypto**                                                                                                                                                                  |
| **Deterministic Error Handling** | Every tool returns structured `{success, error}` responses — no raw exceptions, no silent failures, no misleading messages. Agents get actionable context instead of cryptic PostgreSQL codes                                                                                                                |
| **Production-Ready Security**    | SQL injection protection, parameterized queries, input validation, sandboxed code execution, SSL certificate verification by default, and HTTP body size enforcement                                                                                                                                         |
| **Strict TypeScript**            | 100% type-safe codebase with 3000 tests and 92.10% coverage                                                                                                                                                                                                                                                  |
| **MCP 2025-11-25 Compliant**     | Full protocol support with tool safety hints, resource priorities, and progress notifications                                                                                                                                                                                                                |

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

> **Note for Docker**: Use `host.docker.internal` to connect to PostgreSQL running on your host machine.

📖 **Full Docker guide:** [DOCKER_README.md](DOCKER_README.md) · [Docker Hub](https://hub.docker.com/r/writenotenow/postgres-mcp)

### npm

```bash
npm install -g @neverinfamous/postgres-mcp
postgres-mcp --transport stdio --postgres postgres://user:password@localhost:5432/database
```

### From Source

```bash
git clone https://github.com/neverinfamous/postgresql-mcp.git
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
- **Full API access** — all 20 tool groups are available via `pg.*` (e.g., `pg.core.readQuery()`, `pg.jsonb.extract()`, `pg.introspection.dependencyGraph()`)
- **Requires `admin` OAuth scope** — execution is logged for audit

### ⚡ Code Mode Only (Maximum Token Savings)

If you control your own setup, you can run with **only Code Mode enabled** — a single tool that provides access to all 227 tools' worth of capability through the `pg.*` API:

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

This exposes just `pg_execute_code`. The agent writes JavaScript against the typed `pg.*` SDK — composing queries, chaining operations across all 20 tool groups, and returning exactly the data it needs — in one execution. This mirrors the [Code Mode pattern](https://blog.cloudflare.com/code-mode-mcp/) pioneered by Cloudflare for their entire API: fixed token cost regardless of how many capabilities exist.

> [!TIP]
> **Maximize Token Savings:** Instruct your AI agent to prefer Code Mode over individual tool calls:
>
> _"When using postgres-mcp, prefer `pg_execute_code` (Code Mode) for multi-step database operations to minimize token usage."_
>
> For maximum savings, use `--tool-filter codemode` to run with Code Mode as your only tool. See the [Code Mode wiki](https://github.com/neverinfamous/postgresql-mcp/wiki/Code-Mode) for full API documentation.

> [!NOTE]
> **AntiGravity Users:** Server instructions are automatically sent to MCP clients during initialization. However, AntiGravity does not currently support MCP server instructions. For optimal Code Mode usage in AntiGravity, manually provide the contents of [`src/constants/ServerInstructions.ts`](src/constants/ServerInstructions.ts) to the agent in your prompt or user rules.

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

**Clone and install:**

```bash
git clone https://github.com/neverinfamous/postgresql-mcp.git
cd postgres-mcp
npm install
```

**Build:**

```bash
npm run build
```

**Run checks:**

```bash
npm run lint && npm run typecheck
```

**Test CLI:**

```bash
node dist/cli.js info
node dist/cli.js list-tools
```

---

## ⚡ MCP Client Configuration

### Cursor IDE / Claude Desktop

```json
{
  "mcpServers": {
    "postgres-mcp": {
      "command": "node",
      "args": [
        "C:/path/to/postgres-mcp/dist/cli.js",
        "--postgres",
        "postgres://user:password@localhost:5432/database",
        "--tool-filter",
        "starter"
      ]
    }
  }
}
```

> [!TIP]
> The `starter` shortcut provides 59 tools including **Code Mode** for token-efficient operations. All presets include Code Mode by default. See [Tool Filtering](#-tool-filtering) to customize.

### Using Environment Variables (Recommended)

```json
{
  "mcpServers": {
    "postgres-mcp": {
      "command": "node",
      "args": [
        "C:/path/to/postgres-mcp/dist/cli.js",
        "--tool-filter",
        "starter"
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
> AI IDEs like Cursor have tool limits. With 227 tools available, you MUST use tool filtering to stay within your IDE's limits. We recommend `starter` (59 tools) as a starting point. Code Mode is included in all presets by default for 70-90% token savings on multi-step operations.

### What Can You Filter?

The `--tool-filter` argument accepts **shortcuts**, **groups**, or **tool names** — mix and match freely:

| Filter Pattern   | Example                   | Tools | Description               |
| ---------------- | ------------------------- | ----- | ------------------------- |
| Shortcut only    | `starter`                 | 59    | Use a predefined bundle   |
| Groups only      | `core,jsonb,transactions` | 47    | Combine individual groups |
| Shortcut + Group | `starter,+text`           | 72    | Extend a shortcut         |
| Shortcut - Tool  | `starter,-pg_drop_table`  | 58    | Remove specific tools     |

All shortcuts and tool groups include **Code Mode** (`pg_execute_code`) by default for token-efficient operations. To exclude it, add `-codemode` to your filter: `--tool-filter cron,pgcrypto,-codemode`

### Shortcuts (Predefined Bundles)

> Tool counts include Code Mode (`pg_execute_code`) which is included in all presets by default.

| Shortcut        | Tools  | Use Case                 | What's Included                                          |
| --------------- | ------ | ------------------------ | -------------------------------------------------------- |
| `starter`       | **59** | 🌟 **Recommended**       | Core, trans, JSONB, schema, codemode                     |
| `essential`     | 47     | Minimal footprint        | Core, trans, JSONB, codemode                             |
| `dev-schema`    | 52     | Dev Schema & Migrations  | Core, trans, schema, introspection, codemode             |
| `dev-analytics` | 42     | Dev Analytics            | Core, trans, stats, partitioning, codemode               |
| `ai-data`       | 60     | AI Data Analyst          | Core, JSONB, text, trans, codemode                       |
| `ai-vector`     | 50     | AI/ML with pgvector      | Core, vector, trans, part, codemode                      |
| `dba-monitor`   | 59     | DBA Monitoring           | Core, monitoring, perf, trans, codemode                  |
| `dba-schema`    | 45     | DBA Schema & Migrations  | Core, schema, introspection, codemode                    |
| `dba-infra`     | 46     | DBA Infrastructure       | Core, admin, backup, partitioning, codemode              |
| `dba-stats`     | 57     | DBA Stats                | Core, admin, monitoring, trans, stats, codemode          |
| `geo`           | 43     | Geospatial Workloads     | Core, PostGIS, trans, codemode                           |
| `base-ops`      | 51     | Operations Block         | Admin, monitoring, backup, part, stats, citext, codemode |
| `ext-ai`        | 26     | Extension: AI/Security   | pgvector, pgcrypto, codemode                             |
| `ext-geo`       | 24     | Extension: Spatial       | PostGIS, ltree, codemode                                 |
| `ext-schedule`  | 19     | Extension: Scheduling    | pg_cron, pg_partman, codemode                            |
| `ext-perf`      | 28     | Extension: Perf/Analysis | pg_stat_kcache, performance, codemode                    |

### Tool Groups (21 Available)

> Tool counts include Code Mode (`pg_execute_code`) which is added to all groups by default.

| Group           | Tools | Description                                                 |
| --------------- | ----- | ----------------------------------------------------------- |
| `core`          | 21    | Read/write queries, tables, indexes, convenience/drop tools |
| `transactions`  | 8     | BEGIN, COMMIT, ROLLBACK, savepoints                         |
| `jsonb`         | 20    | JSONB manipulation and queries                              |
| `text`          | 14    | Full-text search, fuzzy matching                            |
| `performance`   | 21    | EXPLAIN, query analysis, optimization                       |
| `admin`         | 11    | VACUUM, ANALYZE, REINDEX                                    |
| `monitoring`    | 12    | Database sizes, connections, status                         |
| `backup`        | 10    | pg_dump, COPY, restore                                      |
| `schema`        | 13    | Schemas, views, sequences, functions, triggers              |
| `introspection` | 13    | Dependency graphs, cascade simulation, migration tracking   |
| `partitioning`  | 7     | Native partition management                                 |
| `stats`         | 9     | Statistical analysis                                        |
| `vector`        | 17    | pgvector (AI/ML similarity search)                          |
| `postgis`       | 16    | PostGIS (geospatial)                                        |
| `cron`          | 9     | pg_cron (job scheduling)                                    |
| `partman`       | 11    | pg_partman (auto-partitioning)                              |
| `kcache`        | 8     | pg_stat_kcache (OS-level stats)                             |
| `citext`        | 7     | citext (case-insensitive text)                              |
| `ltree`         | 9     | ltree (hierarchical data)                                   |
| `pgcrypto`      | 10    | pgcrypto (encryption, UUIDs)                                |
| `codemode`      | 1     | Code Mode (sandboxed code execution)                        |

---

### Quick Start: Recommended IDE Configuration

Add one of these configurations to your IDE's MCP settings file:

#### Option 1: Starter (59 Essential Tools)

**Best for:** General PostgreSQL database work - CRUD operations, JSONB, schema management.

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
        "starter"
      ],
      "env": {
        "POSTGRES_HOST": "localhost",
        "POSTGRES_PORT": "5432",
        "POSTGRES_USER": "your_username",
        "POSTGRES_PASSWORD": "your_password",
        "POSTGRES_DATABASE": "your_database"
      }
    }
  }
}
```

#### Option 2: AI Vector (50 Tools + pgvector)

**Best for:** AI/ML workloads with semantic search and vector similarity.

> **⚠️ Prerequisites:** Requires pgvector extension installed in your PostgreSQL database.

```json
{
  "mcpServers": {
    "postgres-mcp-ai": {
      "command": "node",
      "args": [
        "/path/to/postgres-mcp/dist/cli.js",
        "--transport",
        "stdio",
        "--tool-filter",
        "ai-vector"
      ],
      "env": {
        "POSTGRES_HOST": "localhost",
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

- Replace `/path/to/postgres-mcp/` with your actual installation path
- Update credentials (`your_username`, `your_password`, etc.) with your PostgreSQL credentials
- For Windows: Use forward slashes in paths (e.g., `C:/postgres-mcp/dist/cli.js`) or escape backslashes (`C:\\postgres-mcp\\dist\\cli.js`)
- **Extension tools** gracefully handle cases where extensions are not installed

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

---

## ⚡ Performance Tuning

| Variable                | Default     | Description                                        |
| ----------------------- | ----------- | -------------------------------------------------- |
| `MCP_HOST`              | `localhost` | Server bind host (`0.0.0.0` for containers)        |
| `METADATA_CACHE_TTL_MS` | `30000`     | Cache TTL for schema metadata (milliseconds)       |
| `LOG_LEVEL`             | `info`      | Log verbosity: `debug`, `info`, `warning`, `error` |

> **Tip:** Lower `METADATA_CACHE_TTL_MS` for development (e.g., `5000`), or increase it for production with stable schemas (e.g., `300000` = 5 min).

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
