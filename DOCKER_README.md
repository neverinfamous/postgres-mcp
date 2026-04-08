# postgres-mcp

**PostgreSQL MCP Server** binding the Model Context Protocol to a secure PostgreSQL sandbox.

Features **Code Mode** — a revolutionary approach that provides access to all 248 tools through a secure, true V8 isolate (`worker_threads`), eliminating the massive token overhead of multi-step tool calls. Also includes schema introspection, migration tracking, smart tool filtering, deterministic error handling, connection pooling, HTTP/SSE transport, OAuth 2.1 authentication, and support for citext, ltree, pgcrypto, pg_cron, pg_stat_kcache, pgvector, PostGIS, and HypoPG.

**248 Specialized Tools** · **23 Resources** · **20 AI-Powered Prompts**

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
[![Coverage](https://img.shields.io/badge/Coverage-96%25-brightgreen.svg)](https://github.com/neverinfamous/postgres-mcp)

**[GitHub](https://github.com/neverinfamous/postgres-mcp)** • **[npm Package](https://www.npmjs.com/package/@neverinfamous/postgres-mcp)** • **[MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.neverinfamous/postgres-mcp)** • **[Wiki](https://github.com/neverinfamous/postgres-mcp/wiki)** • **[Tool Reference](https://github.com/neverinfamous/postgres-mcp/wiki/Tool-Reference)** • **[Changelog](https://github.com/neverinfamous/postgres-mcp/blob/main/CHANGELOG.md)**

## 🎯 What Sets Us Apart

| Feature                             | Description                                                                                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code Mode (V8 Isolate)**          | **Massive Token Savings:** Execute complex, multi-step operations inside a secure, true V8 isolate (`worker_threads`). Stop burning tokens on back-and-forth tool calls and reduce your AI overhead by up to 90%.   |
| **Deterministic Error Handling**    | No more cryptic database errors causing AI hallucinations. We intercept and translate raw SQL exceptions into clear, actionable advice so your agent knows exactly how to recover without guessing.                 |
| **248 Token-Optimized Tools**       | The largest PostgreSQL toolset on the MCP registry. Every query uses zero-cost token estimation and smart dataset truncation, ensuring agents always see the big picture without blowing their context windows.     |
| **OAuth 2.1 + Granular Control**    | Real enterprise security. Authenticate via OAuth 2.1 and control exactly who can read, write, or administer your database with precision scopes mapped down to the specific tool layer.                             |
| **Audit Trails & Semantic Diffing** | Total accountability. Track exactly what your AI is doing with detailed JSON logs, automatically snapshot schemas before mutations, and confidently review semantic row-by-row diffs before restoring data.         |
| **23 Resources & 20 Prompts**       | Instant database meta-awareness. Agents automatically read real-time health, performance, and replication metrics, and can invoke built-in prompt workflows for query tuning and schema design.                     |
| **Introspection & Migrations**      | Prevent costly mistakes. Let your AI simulate the cascade impact of schema changes, safely order foreign-key updates, and track migration history automatically.                                                    |
| **8 Extension Ecosystems**          | Ready for advanced workloads. First-class API support for **pgvector** (AI search), **PostGIS** (geospatial), **pg_cron**, **pgcrypto**, and more—all strictly typed and validated out of the box.                  |
| **Smart Tool Filtering**            | Give your agent exactly what it needs without overflowing IDE limits. Dynamically compile your server with any combination of our 22 distinct tool groups.                                                          |
| **Enterprise Infrastructure**       | Built for production. Blazing fast (millions of ops/sec), protected against SQL injection, features high-performance connection pooling, and supports both Streamable HTTP and Legacy SSE protocols simultaneously. |

## Suggested Rule (Add to AGENTS.md, GEMINI.md, etc)

**MCP TOKEN MANAGEMENT**:

- **Token Visibility**: When interacting with `postgres-mcp`, always monitor the `_meta.tokenEstimate` (or `metrics.tokenEstimate` in Code Mode) returned in tool responses.
- **Audit Resource**: Use the `postgres://audit` resource to review session-level token consumption and identify high-cost operations.
- **Proactive Efficiency**: If operations are consuming high token counts, prefer code mode and proactively use `limit` parameters.

### Extension Support

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

> Extension tool counts include `create_extension` helpers but exclude Code Mode; the Tool Groups table below adds +1 per group for Code Mode.

### MCP Resources (23)

Real-time database meta-awareness - AI accesses these automatically:

| Resource                  | Purpose                                       |
| ------------------------- | --------------------------------------------- |
| `postgres://schema`       | Complete schema with tables, columns, indexes |
| `postgres://health`       | Comprehensive health status                   |
| `postgres://performance`  | Query performance metrics                     |
| `postgres://capabilities` | Server features and extensions                |
| `postgres://indexes`      | Index usage statistics                        |
| `postgres://activity`     | Current connections and active queries        |
| `postgres://audit`        | Audit trail with token summary                |
| `postgres://help/{group}` | Group-specific help and workflow resources    |

**[Full resources list →](https://github.com/neverinfamous/postgres-mcp#resources)**

### MCP Prompts (20)

Guided workflows for complex operations:

| Prompt                     | Purpose                         |
| -------------------------- | ------------------------------- |
| `pg_performance_analysis`  | Step-by-step query optimization |
| `pg_index_tuning`          | Comprehensive index analysis    |
| `pg_database_health_check` | Full health assessment          |
| `pg_setup_pgvector`        | Complete pgvector setup guide   |
| `pg_backup_strategy`       | Design backup strategy          |
| `pg_tool_index`            | Compact tool index reference    |

**[Full prompts list →](https://github.com/neverinfamous/postgres-mcp#-ai-powered-prompts)**

## 🚀 Quick Start (2 Minutes)

### 1. Pull the Image

```bash
docker pull writenotenow/postgres-mcp:latest
```

### 2. Add to MCP Config

Add this to your MCP client config (e.g., `~/.cursor/mcp.json` for Cursor):

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
        "codemode",
        "--audit-log",
        "/tmp/postgres-logs/audit.jsonl"
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

**Server & Tuning:**

| Variable                     | Default     | Description                                                     |
| ---------------------------- | ----------- | --------------------------------------------------------------- |
| `POSTGRES_HOST`              | `localhost` | Database host                                                   |
| `POSTGRES_PORT`              | `5432`      | Database port                                                   |
| `POSTGRES_USER`              | `postgres`  | Database username                                               |
| `POSTGRES_PASSWORD`          | _(empty)_   | Database password                                               |
| `POSTGRES_DATABASE`          | `postgres`  | Database name                                                   |
| `POSTGRES_URL`               | —           | Connection string (overrides individual vars)                   |
| `MCP_HOST`                   | `localhost` | Server bind host (`0.0.0.0` for containers)                     |
| `MCP_TRANSPORT`              | `stdio`     | Transport type: `stdio`, `http`, `sse`                          |
| `PORT`                       | `3000`      | HTTP port for http/sse transports                               |
| `LOG_LEVEL`                  | `info`      | Log level: `debug`, `info`, `warning`, `error`                  |
| `METADATA_CACHE_TTL_MS`      | `30000`     | Schema cache TTL (ms)                                           |
| `POSTGRES_TOOL_FILTER`       | —           | Tool filter string (also `MCP_TOOL_FILTER`)                     |
| `MCP_RATE_LIMIT_MAX`         | `100`       | Rate limit per IP per 15min window                              |
| `MCP_REQUEST_TIMEOUT`        | `300000`    | HTTP request timeout (ms) for Slowloris protection              |
| `MCP_HEADERS_TIMEOUT`        | `60000`     | HTTP headers timeout (ms)                                       |
| `MCP_AUTH_TOKEN`             | —           | Simple bearer token for HTTP auth                               |
| `TRUST_PROXY`                | `false`     | Trust X-Forwarded-For for client IP                             |
| `OAUTH_ENABLED`              | `false`     | Enable OAuth 2.1 authentication                                 |
| `OAUTH_ISSUER`               | —           | Authorization server URL                                        |
| `OAUTH_AUDIENCE`             | —           | Expected token audience                                         |
| `OAUTH_JWKS_URI`             | _(auto)_    | JWKS URI (auto-discovered from issuer)                          |
| `OAUTH_CLOCK_TOLERANCE`      | `60`        | Clock tolerance in seconds                                      |
| `AUDIT_LOG_PATH`             | —           | Audit log file path (`stderr` for container logs)               |
| `AUDIT_REDACT`               | `false`     | Omit tool arguments from audit entries                          |
| `AUDIT_BACKUP`               | `false`     | Enable pre-mutation DDL snapshots                               |
| `AUDIT_BACKUP_DATA`          | `false`     | Include sample data rows in snapshots                           |
| `AUDIT_BACKUP_MAX_AGE`       | `30`        | Maximum snapshot age in days                                    |
| `AUDIT_BACKUP_MAX_COUNT`     | `1000`      | Maximum number of snapshots to retain                           |
| `AUDIT_BACKUP_MAX_DATA_SIZE` | `52428800`  | Maximum table size for data capture (bytes)                     |
| `AUDIT_READS`                | `false`     | Log read-scoped tool calls (compact entries)                    |
| `AUDIT_LOG_MAX_SIZE`         | `10485760`  | Max log file size before rotation (bytes). Keeps up to 5 files. |

> **Aliases:** `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` are also supported (standard PostgreSQL client env vars).

### 🔗 Database Connection Scenarios

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

### 🛠️ Tool Filtering

> [!IMPORTANT]
> All tool groups include **Code Mode** (`pg_execute_code`) by default. To exclude it, add `-codemode` to your filter: `--tool-filter cron,pgcrypto,-codemode`

> **⭐ Code Mode** (`--tool-filter codemode`) is the recommended configuration — it exposes `pg_execute_code`, a secure, true V8 isolate sandbox providing access to all 248 tools' worth of capability with up to 90% token savings. See [Tool Filtering](#%EF%B8%8F-tool-filtering) for alternatives.

- **Requires `admin` OAuth scope** — execution is logged for audit

**📖 [See Full Installation Guide →](https://github.com/neverinfamous/postgres-mcp#readme)**

### What Can You Filter?

The `--tool-filter` argument accepts **groups** or **tool names** — mix and match freely:

| Filter Pattern | Example                    | Description               |
| -------------- | -------------------------- | ------------------------- |
| Groups only    | `core,jsonb,transactions`  | Combine individual groups |
| Tool names     | `pg_read_query,pg_explain` | Custom tool selection     |
| Group + Tool   | `core,+pg_stat_statements` | Extend a group            |
| Group - Tool   | `core,-pg_drop_table`      | Remove specific tools     |

### Tool Groups (22 Available)

| Group           | Tools | Description                                                           |
| --------------- | ----- | --------------------------------------------------------------------- |
| `codemode`      | 1     | Code Mode (sandboxed code execution) 🌟 **Recommended**               |
| `core`          | 21    | Read/write queries, tables, indexes, convenience/drop tools           |
| `transactions`  | 9     | BEGIN, COMMIT, ROLLBACK, savepoints, status                           |
| `jsonb`         | 21    | JSONB manipulation, queries, and pretty-print                         |
| `text`          | 14    | Full-text search, fuzzy matching                                      |
| `performance`   | 25    | EXPLAIN, query analysis, optimization, diagnostics, anomaly detection |
| `admin`         | 12    | VACUUM, ANALYZE, REINDEX, insights                                    |
| `monitoring`    | 12    | Database sizes, connections, status                                   |
| `backup`        | 13    | pg_dump, COPY, restore, audit backups                                 |
| `schema`        | 13    | Schemas, views, sequences, functions, triggers                        |
| `introspection` | 7     | Dependency graphs, cascade simulation, schema analysis                |
| `migration`     | 7     | Schema migration tracking and management                              |
| `partitioning`  | 7     | Native partition management                                           |
| `stats`         | 20    | Statistical analysis, window functions, outlier detection             |
| `vector`        | 17    | pgvector (AI/ML similarity search)                                    |
| `postgis`       | 16    | PostGIS (geospatial)                                                  |
| `cron`          | 9     | pg_cron (job scheduling)                                              |
| `partman`       | 11    | pg_partman (auto-partitioning)                                        |
| `kcache`        | 8     | pg_stat_kcache (OS-level stats)                                       |
| `citext`        | 7     | citext (case-insensitive text)                                        |
| `ltree`         | 9     | ltree (hierarchical data)                                             |
| `pgcrypto`      | 10    | pgcrypto (encryption, UUIDs)                                          |

### Syntax Reference

| Prefix   | Target | Example          | Effect                                      |
| -------- | ------ | ---------------- | ------------------------------------------- |
| _(none)_ | Group  | `core`           | **Whitelist Mode:** Enable ONLY this group  |
| _(none)_ | Tool   | `pg_read_query`  | **Whitelist Mode:** Enable ONLY this tool   |
| `+`      | Group  | `+vector`        | Add tools from this group to current set    |
| `-`      | Group  | `-admin`         | Remove tools in this group from current set |
| `+`      | Tool   | `+pg_explain`    | Add one specific tool                       |
| `-`      | Tool   | `-pg_drop_table` | Remove one specific tool                    |

## 🌐 HTTP/SSE Transport (Remote Access)

For remote access, web-based clients, or HTTP-compatible MCP hosts:

```bash
docker run --rm -p 3000:3000 \
  -e POSTGRES_URL=postgres://user:pass@host:5432/db \
  writenotenow/postgres-mcp:latest \
  --transport http --port 3000
```

**With simple bearer token authentication:**

```bash
docker run --rm -p 3000:3000 \
  -e POSTGRES_URL=postgres://user:pass@host:5432/db \
  -e MCP_AUTH_TOKEN=my-secret-token \
  writenotenow/postgres-mcp:latest \
  --transport http --port 3000
```

**With OAuth 2.1 (recommended for production):**

```bash
docker run --rm -p 3000:3000 \
  -e POSTGRES_URL=postgres://user:pass@host:5432/db \
  -e OAUTH_ENABLED=true \
  -e OAUTH_ISSUER=http://keycloak:8080/realms/postgres-mcp \
  -e OAUTH_AUDIENCE=postgres-mcp-client \
  writenotenow/postgres-mcp:latest \
  --transport http --port 3000
```

**Stateless mode (serverless, no sessions):**

```bash
docker run --rm -p 3000:3000 \
  -e POSTGRES_URL=postgres://user:pass@host:5432/db \
  writenotenow/postgres-mcp:latest \
  --transport http --port 3000 --stateless
```

> **⚠️ Security:** When using `--transport http` without `--auth-token` or OAuth, all clients have full unrestricted access. Always enable authentication for production HTTP deployments.

> **Priority:** When both `MCP_AUTH_TOKEN` and `OAUTH_ENABLED` are set, OAuth 2.1 takes precedence. If neither is configured, the server warns and runs without authentication.

The server supports **two MCP transport protocols simultaneously**, enabling both modern and legacy clients to connect:

### Streamable HTTP (Recommended)

Modern protocol (MCP 2025-03-26) — single endpoint, session-based:

| Method   | Endpoint | Purpose                                          |
| -------- | -------- | ------------------------------------------------ |
| `POST`   | `/mcp`   | JSON-RPC requests (initialize, tools/list, etc.) |
| `GET`    | `/mcp`   | SSE stream for server notifications              |
| `DELETE` | `/mcp`   | Session termination                              |

Sessions are managed via the `Mcp-Session-Id` header.

**Docker Health Check:** Built-in `HEALTHCHECK` is transport-aware and validates database and HTTP endpoint connectivity.

> For Legacy SSE usage and utility endpoints, see the **[Wiki](https://github.com/neverinfamous/postgres-mcp/wiki)**.

## 🛡️ Supply Chain Security

For reproducible builds, use SHA-pinned images:

```bash
docker pull writenotenow/postgres-mcp@sha256:<manifest-digest>
```

**[Find SHA tags here](https://hub.docker.com/r/writenotenow/postgres-mcp/tags)**

## 📄 License

MIT License - See [LICENSE](https://github.com/neverinfamous/postgres-mcp/blob/main/LICENSE)
