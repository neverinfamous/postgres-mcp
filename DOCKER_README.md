# postgres-mcp

**Last Updated February 22, 2026**

**PostgreSQL MCP Server** enabling AI assistants (AntiGravity, Claude, Cursor, etc.) to interact with PostgreSQL databases through the Model Context Protocol. Features deterministic error handling, connection pooling, HTTP/SSE Transport, OAuth 2.1 authentication, Code Mode, tool filtering, and extension support for citext, ltree, pgcrypto, pg_cron, pg_stat_kcache, pgvector, PostGIS, and HypoPG.

**206 specialized tools** · **20 resources** · **19 AI-powered prompts**

[![GitHub](https://img.shields.io/badge/GitHub-neverinfamous/postgres--mcp-blue?logo=github)](https://github.com/neverinfamous/postgresql-mcp)
![GitHub Release](https://img.shields.io/github/v/release/neverinfamous/postgresql-mcp)
[![Docker Pulls](https://img.shields.io/docker/pulls/writenotenow/postgres-mcp)](https://hub.docker.com/r/writenotenow/postgres-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/MCP-Registry-green.svg)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.neverinfamous/postgres-mcp)
[![npm](https://img.shields.io/npm/v/@neverinfamous/postgres-mcp)](https://www.npmjs.com/package/@neverinfamous/postgres-mcp)
[![Security](https://img.shields.io/badge/Security-Enhanced-green.svg)](https://github.com/neverinfamous/postgresql-mcp/blob/master/SECURITY.md)
![Status](https://img.shields.io/badge/status-Production%2FStable-brightgreen)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://github.com/neverinfamous/postgresql-mcp)
[![Tests](https://img.shields.io/badge/Tests-2376_passed-success.svg)](https://github.com/neverinfamous/postgresql-mcp)
[![Coverage](https://img.shields.io/badge/Coverage-85.37%25-green.svg)](https://github.com/neverinfamous/postgresql-mcp)

**[GitHub](https://github.com/neverinfamous/postgresql-mcp)** • **[npm Package](https://www.npmjs.com/package/@neverinfamous/postgres-mcp)** • **[MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.neverinfamous/postgres-mcp)** • **[Wiki](https://github.com/neverinfamous/postgresql-mcp/wiki)** • **[Changelog](https://github.com/neverinfamous/postgresql-mcp/blob/master/CHANGELOG.md)**

### 🎯 What Sets Us Apart

| Feature                          | Description                                                                                                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **206 Specialized Tools**        | The largest PostgreSQL tool collection for MCP — from core CRUD and native JSONB to pgvector, PostGIS, pg_cron, ltree, pgcrypto, and 8 extension ecosystems                                   |
| **20 Observability Resources**   | Real-time schema, performance metrics, connection pool status, replication lag, vacuum stats, lock contention, and extension diagnostics                                                      |
| **19 AI-Powered Prompts**        | Guided workflows for query building, schema design, performance tuning, and extension setup                                                                                                   |
| **Code Mode**                    | Sandboxed JavaScript execution with 70-90% token reduction for multi-step operations                                                                                                          |
| **OAuth 2.1 + Access Control**   | Enterprise-ready security with RFC 9728/8414 compliance, granular scopes (`read`, `write`, `admin`, `full`, `db:*`, `table:*:*`), and Keycloak integration                                    |
| **Smart Tool Filtering**         | 20 tool groups + 15 shortcuts let you stay within IDE limits while exposing exactly what you need                                                                                             |
| **HTTP Streaming Transport**     | SSE-based streaming with `/mcp`, and `/health` endpoints for remote deployments                                                                                                               |
| **High-Performance Pooling**     | Built-in connection pooling with health checks for efficient, concurrent database access                                                                                                      |
| **8 Extension Ecosystems**       | First-class support for **pgvector**, **PostGIS**, **pg_cron**, **pg_partman**, **pg_stat_kcache**, **citext**, **ltree**, and **pgcrypto**                                                   |
| **Deterministic Error Handling** | Every tool returns structured `{success, error}` responses — no raw exceptions, no silent failures, no misleading messages. Agents get actionable context instead of cryptic PostgreSQL codes |
| **Production-Ready Security**    | SQL injection protection, parameterized queries, input validation, and sandboxed code execution                                                                                               |
| **Strict TypeScript**            | 100% type-safe codebase with 2376 tests and 85.37% coverage                                                                                                                                   |
| **MCP 2025-11-25 Compliant**     | Full protocol support with tool safety hints, resource priorities, and progress notifications                                                                                                 |

### Deployment Options

- **[Docker Hub](https://hub.docker.com/r/writenotenow/postgres-mcp)** - Node.js Alpine-based multi-platform support
- **[npm Package](https://www.npmjs.com/package/@neverinfamous/postgres-mcp)** - Simple `npm install -g` for local deployment
- **[MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.neverinfamous/postgres-mcp)**

### Extension Support

| Extension            | Purpose                        |
| -------------------- | ------------------------------ |
| `pg_stat_statements` | Query performance tracking     |
| `pg_trgm`            | Text similarity                |
| `fuzzystrmatch`      | Fuzzy matching                 |
| `hypopg`             | Hypothetical indexes           |
| `pgvector`           | Vector similarity search       |
| `PostGIS`            | Geospatial operations          |
| `pg_cron`            | Job scheduling                 |
| `pg_partman`         | Automated partition management |
| `pg_stat_kcache`     | OS-level CPU/memory/I/O stats  |
| `citext`             | Case-insensitive text          |
| `ltree`              | Hierarchical tree labels       |
| `pgcrypto`           | Hashing, encryption, UUIDs     |

### MCP Resources (20)

Real-time database meta-awareness - AI accesses these automatically:

| Resource                  | Purpose                                       |
| ------------------------- | --------------------------------------------- |
| `postgres://schema`       | Complete schema with tables, columns, indexes |
| `postgres://health`       | Comprehensive health status                   |
| `postgres://performance`  | Query performance metrics                     |
| `postgres://capabilities` | Server features and extensions                |
| `postgres://indexes`      | Index usage statistics                        |
| `postgres://activity`     | Current connections and active queries        |

**[Full resources list →](https://github.com/neverinfamous/postgresql-mcp#resources)**

### MCP Prompts (19)

Guided workflows for complex operations:

| Prompt                     | Purpose                         |
| -------------------------- | ------------------------------- |
| `pg_performance_analysis`  | Step-by-step query optimization |
| `pg_index_tuning`          | Comprehensive index analysis    |
| `pg_database_health_check` | Full health assessment          |
| `pg_setup_pgvector`        | Complete pgvector setup guide   |
| `pg_backup_strategy`       | Design backup strategy          |
| `pg_tool_index`            | Compact tool index reference    |

**[Full prompts list →](https://github.com/neverinfamous/postgresql-mcp#-ai-powered-prompts)**

---

## 🚀 Quick Start (2 Minutes)

### 1. Pull the Image

```bash
docker pull writenotenow/postgres-mcp:latest
```

### 2. Add to MCP Config

Add this to your `~/.cursor/mcp.json`:

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

### 3. Restart & Query!

Restart Cursor or your MCP client and start querying PostgreSQL!

> **Note for Docker**: Use `host.docker.internal` to connect to PostgreSQL running on your host machine.

---

## Code Mode: Maximum Efficiency

Code Mode (`pg_execute_code`) dramatically reduces token usage (70–90%) and is included by default in all presets.

> [!TIP]
> **Maximize Token Savings:** For the best results, instruct your AI agent to prefer Code Mode over individual tool calls. Add a rule like this to your agent's prompt or system configuration:
>
> _"When using postgres-mcp, prefer `pg_execute_code` (Code Mode) for multi-step database operations to minimize token usage."_
>
> This ensures the agent batches operations into single calls instead of making many individual tool calls. See the [Code Mode wiki](https://github.com/neverinfamous/postgresql-mcp/wiki/Code-Mode) for full API documentation.

> [!NOTE]
> **AntiGravity Users:** Server instructions are automatically sent to MCP clients during initialization. However, AntiGravity does not currently support MCP server instructions. For optimal Code Mode usage, manually provide the contents of [`src/constants/ServerInstructions.ts`](https://github.com/neverinfamous/postgresql-mcp/blob/master/src/constants/ServerInstructions.ts) to the agent in your prompt or user rules.

---

## ⚡ Install to Cursor IDE

### One-Click Installation

Click the button below to install directly into Cursor:

[![Install to Cursor](https://img.shields.io/badge/Install%20to%20Cursor-Click%20Here-blue?style=for-the-badge)](cursor://anysphere.cursor-deeplink/mcp/install?name=PostgreSQL%20MCP&config=eyJwb3N0Z3Jlcy1tY3AiOnsiYXJncyI6WyJydW4iLCItLXJtIiwiLWkiLCItZSIsIlBPU1RHUkVTX0hPU1QiLCItZSIsIlBPU1RHUkVTX1BPUlQiLCItZSIsIlBPU1RHUkVTX1VTRVIiLCItZSIsIlBPU1RHUkVTX1BBU1NXT1JEIiwiLWUiLCJQT1NUR1JFU19EQVRBQkFTRSIsIndyaXRlbm90ZW5vdy9wb3N0Z3Jlcy1tY3A6bGF0ZXN0IiwiLS10b29sLWZpbHRlciIsInN0YXJ0ZXIiXSwiY29tbWFuZCI6ImRvY2tlciIsImVudiI6eyJQT1NUR1JFU19IT1NUIjoibG9jYWxob3N0IiwiUE9TVEdSRVNfUE9SVCI6IjU0MzIiLCJQT1NUR1JFU19VU0VSIjoieW91cl91c2VybmFtZSIsIlBPU1RHUkVTX1BBU1NXT1JEIjoieW91cl9wYXNzd29yZCIsIlBPU1RHUkVTX0RBVEFCQVNFIjoieW91cl9kYXRhYmFzZSJ9fX0=)

### Prerequisites

- ✅ Docker installed and running
- ✅ PostgreSQL database accessible

**📖 [See Full Installation Guide →](https://github.com/neverinfamous/postgresql-mcp#readme)**

---

## 🔧 Configuration

### Environment Variables

**PostgreSQL Connection (required):**

```bash
-e POSTGRES_HOST=localhost
-e POSTGRES_PORT=5432
-e POSTGRES_USER=your_user
-e POSTGRES_PASSWORD=your_password
-e POSTGRES_DATABASE=your_database
```

**Or use a connection string:**

```bash
-e POSTGRES_URL=postgres://user:pass@host:5432/database
```

**Performance (optional):**

| Variable                | Default     | Description                                 |
| ----------------------- | ----------- | ------------------------------------------- |
| `MCP_HOST`              | `localhost` | Server bind host (`0.0.0.0` for containers) |
| `METADATA_CACHE_TTL_MS` | `30000`     | Schema cache TTL (ms)                       |
| `LOG_LEVEL`             | `info`      | debug, info, warning, error                 |

## 🛠️ Tool Filtering

> [!IMPORTANT]
> AI IDEs like Cursor have tool limits. With 206 tools available, you MUST use tool filtering to stay within your IDE's limits. We recommend `starter` (59 tools) as a starting point. Code Mode is included in all presets by default for 70-90% token savings on multi-step operations.

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

| Shortcut       | Tools  | Use Case                 | What's Included                                          |
| -------------- | ------ | ------------------------ | -------------------------------------------------------- |
| `starter`      | **59** | 🌟 **Recommended**       | Core, trans, JSONB, schema, codemode                     |
| `essential`    | 47     | Minimal footprint        | Core, trans, JSONB, codemode                             |
| `dev-power`    | 54     | Power Developer          | Core, trans, schema, stats, part, codemode               |
| `ai-data`      | 60     | AI Data Analyst          | Core, JSONB, text, trans, codemode                       |
| `ai-vector`    | 50     | AI/ML with pgvector      | Core, vector, trans, part, codemode                      |
| `dba-monitor`  | 59     | DBA Monitoring           | Core, monitoring, perf, trans, codemode                  |
| `dba-manage`   | 58     | DBA Management           | Core, admin, backup, part, schema, codemode              |
| `dba-stats`    | 57     | DBA Stats/Security       | Core, admin, monitoring, trans, stats, codemode          |
| `geo`          | 43     | Geospatial Workloads     | Core, PostGIS, trans, codemode                           |
| `base-core`    | 59     | Base Building Block      | Core, JSONB, trans, schema, codemode                     |
| `base-ops`     | 51     | Operations Block         | Admin, monitoring, backup, part, stats, citext, codemode |
| `ext-ai`       | 26     | Extension: AI/Security   | pgvector, pgcrypto, codemode                             |
| `ext-geo`      | 24     | Extension: Spatial       | PostGIS, ltree, codemode                                 |
| `ext-schedule` | 19     | Extension: Scheduling    | pg_cron, pg_partman, codemode                            |
| `ext-perf`     | 28     | Extension: Perf/Analysis | pg_stat_kcache, performance, codemode                    |

### Tool Groups (20 Available)

> Tool counts include Code Mode (`pg_execute_code`) which is added to all groups by default.

| Group          | Tools | Description                                                 |
| -------------- | ----- | ----------------------------------------------------------- |
| `core`         | 21    | Read/write queries, tables, indexes, convenience/drop tools |
| `transactions` | 8     | BEGIN, COMMIT, ROLLBACK, savepoints                         |
| `jsonb`        | 20    | JSONB manipulation and queries                              |
| `text`         | 14    | Full-text search, fuzzy matching                            |
| `performance`  | 21    | EXPLAIN, query analysis, optimization                       |
| `admin`        | 11    | VACUUM, ANALYZE, REINDEX                                    |
| `monitoring`   | 12    | Database sizes, connections, status                         |
| `backup`       | 10    | pg_dump, COPY, restore                                      |
| `schema`       | 13    | Schemas, views, sequences, functions, triggers              |
| `partitioning` | 7     | Native partition management                                 |
| `stats`        | 9     | Statistical analysis                                        |
| `vector`       | 17    | pgvector (AI/ML similarity search)                          |
| `postgis`      | 16    | PostGIS (geospatial)                                        |
| `cron`         | 9     | pg_cron (job scheduling)                                    |
| `partman`      | 11    | pg_partman (auto-partitioning)                              |
| `kcache`       | 8     | pg_stat_kcache (OS-level stats)                             |
| `citext`       | 7     | citext (case-insensitive text)                              |
| `ltree`        | 9     | ltree (hierarchical data)                                   |
| `pgcrypto`     | 10    | pgcrypto (encryption, UUIDs)                                |
| `codemode`     | 1     | Code Mode (sandboxed code execution)                        |

---

## 🌐 HTTP/SSE Transport (Remote Access)

For remote access, web-based clients, or HTTP-compatible MCP hosts:

```bash
docker run --rm -p 3000:3000 \
  -e POSTGRES_URL=postgres://user:pass@host:5432/db \
  writenotenow/postgres-mcp:latest \
  --transport http --port 3000
```

**With OAuth 2.1:**

```bash
docker run --rm -p 3000:3000 \
  -e POSTGRES_URL=postgres://user:pass@host:5432/db \
  -e OAUTH_ENABLED=true \
  -e OAUTH_ISSUER=http://keycloak:8080/realms/postgres-mcp \
  -e OAUTH_AUDIENCE=postgres-mcp-client \
  writenotenow/postgres-mcp:latest \
  --transport http --port 3000
```

**Endpoints:**

- `POST /mcp` — JSON-RPC requests
- `GET /mcp` — SSE stream for notifications
- `DELETE /mcp` — Session termination
- `GET /health` — Health check

---

## 🛡️ Supply Chain Security

For enhanced security and reproducible builds, use SHA-pinned images:

**Find SHA tags:** https://hub.docker.com/r/writenotenow/postgres-mcp/tags

**Option 1: Multi-arch manifest (recommended)**

```bash
docker pull writenotenow/postgres-mcp:sha256-<manifest-digest>
```

**Option 2: Direct digest (maximum security)**

```bash
docker pull writenotenow/postgres-mcp@sha256:<manifest-digest>
```

**Security Features:**

- ✅ **Build Provenance** - Cryptographic proof of build process
- ✅ **SBOM Available** - Complete software bill of materials
- ✅ **Supply Chain Attestations** - Verifiable build integrity
- ✅ **Non-root Execution** - Minimal attack surface
- ✅ **No Native Dependencies** - Pure JS stack reduces attack surface

---

## 📦 Image Details

| Platform                  | Features                              |
| ------------------------- | ------------------------------------- |
| **AMD64** (x86_64)        | Complete: all tools, OAuth, Code Mode |
| **ARM64** (Apple Silicon) | Complete: all tools, OAuth, Code Mode |

**TypeScript Image Benefits:**

- **Node.js 24 on Alpine Linux** - Minimal footprint (~80MB compressed)
- **Pure JS Stack** - No native compilation, identical features on all platforms
- **pg driver** - Native PostgreSQL protocol support
- **Instant Startup** - No ML model loading required
- **Production/Stable** - Comprehensive error handling

**Available Tags:**

- `1.2.0` - Specific version (recommended for production)
- `latest` - Always the newest version
- `sha256-<digest>` - SHA-pinned for maximum security

---

## 🏗️ Build from Source

**Step 1: Clone the repository**

```bash
git clone https://github.com/neverinfamous/postgresql-mcp.git
cd postgres-mcp
```

**Step 2: Build the Docker image**

```bash
docker build -f Dockerfile -t postgres-mcp-local .
```

**Step 3: Add to MCP config**

Update your `~/.cursor/mcp.json` to use the local build:

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
        "POSTGRES_URL",
        "postgres-mcp-local",
        "--tool-filter",
        "starter"
      ],
      "env": {
        "POSTGRES_URL": "postgres://user:pass@host.docker.internal:5432/database"
      }
    }
  }
}
```

---

## 📚 Documentation & Resources

- **[GitHub Repository](https://github.com/neverinfamous/postgresql-mcp)** - Source code & full documentation
- **[npm Package](https://www.npmjs.com/package/@neverinfamous/postgres-mcp)** - Node.js distribution
- **[Issues](https://github.com/neverinfamous/postgresql-mcp/issues)** - Bug reports & feature requests

---

## 📄 License

MIT License - See [LICENSE](https://github.com/neverinfamous/postgresql-mcp/blob/master/LICENSE)
