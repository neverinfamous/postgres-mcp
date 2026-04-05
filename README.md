# postgres-mcp

<!-- mcp-name: io.github.neverinfamous/postgres-mcp -->

**PostgreSQL MCP Server** enabling AI assistants to interact with PostgreSQL databases through the Model Context Protocol. Features **Code Mode** — a revolutionary approach that provides access to all 248 tools through a secure, true V8 isolate (`worker_threads`), eliminating the massive token overhead of multi-step tool calls. Also includes schema introspection, migration tracking, smart tool filtering, deterministic error handling, connection pooling, HTTP/SSE Transport, OAuth 2.1 authentication, and extension support for citext, ltree, pgcrypto, pg_cron, pg_stat_kcache, pgvector, PostGIS, and HypoPG.

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

**[Docker Hub](https://hub.docker.com/r/writenotenow/postgres-mcp)** • **[npm Package](https://www.npmjs.com/package/@neverinfamous/postgres-mcp)** • **[MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.neverinfamous/postgres-mcp)** • **[Wiki](https://github.com/neverinfamous/postgres-mcp/wiki)** • **[Tool Reference](https://github.com/neverinfamous/postgres-mcp/wiki/Tool-Reference)** • **[Changelog](https://github.com/neverinfamous/postgres-mcp/blob/main/CHANGELOG.md)**

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

## 🚀 Quick Start

### Prerequisites

- PostgreSQL 12-18 (tested with PostgreSQL 18.1)
- **Docker** (recommended) or Node.js 24+ (LTS)

### Docker (Recommended)

```bash
docker pull writenotenow/postgres-mcp:latest
```

Add to your `~/.cursor/mcp.json` or Claude Desktop config:

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

### Stateless Mode

For serverless/stateless deployments where sessions are not needed:

```bash
node dist/cli.js --transport http --port 3000 --stateless --postgres "postgres://..."
```

In stateless mode: `GET /mcp` returns 405, `DELETE /mcp` returns 204, `/sse` and `/messages` return 404. Each `POST /mcp` creates a fresh transport.

### Legacy SSE (Backward Compatibility)

Legacy protocol (MCP 2024-11-05) — for clients like Python `mcp.client.sse`:

| Method | Endpoint                   | Purpose                                                       |
| ------ | -------------------------- | ------------------------------------------------------------- |
| `GET`  | `/sse`                     | Opens SSE stream, returns `/messages?sessionId=<id>` endpoint |
| `POST` | `/messages?sessionId=<id>` | Send JSON-RPC messages to the session                         |

### Utility Endpoints

| Method | Endpoint  | Purpose                                                                |
| ------ | --------- | ---------------------------------------------------------------------- |
| `GET`  | `/health` | Health check (bypasses rate limiting, always available for monitoring) |

## 🔐 Authentication

postgres-mcp supports two authentication mechanisms for HTTP transport:

### Simple Bearer Token (`--auth-token`)

Lightweight authentication for development or single-tenant deployments:

```bash
node dist/cli.js --transport http --port 3000 --auth-token my-secret --postgres "postgres://..."

# Or via environment variable
export MCP_AUTH_TOKEN=my-secret
node dist/cli.js --transport http --port 3000 --postgres "postgres://..."
```

Clients must include `Authorization: Bearer my-secret` on all requests. `/health` and `/` are exempt. Unauthenticated requests receive `401` with `WWW-Authenticate: Bearer` headers per RFC 6750.

### OAuth 2.1 (Enterprise)

Full OAuth 2.1 with RFC 9728/8414 compliance for production multi-tenant deployments:

```bash
node dist/cli.js \
  --transport http \
  --port 3000 \
  --postgres "postgres://user:pass@localhost:5432/db" \
  --oauth-enabled \
  --oauth-issuer http://localhost:8080/realms/postgres-mcp \
  --oauth-audience postgres-mcp-client
```

> **Additional flags:** `--oauth-jwks-uri <url>` (auto-discovered if omitted), `--oauth-clock-tolerance <seconds>` (default: 60).

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

- **RFC 9728** — OAuth 2.1 Protected Resource Metadata
- **RFC 8414** — OAuth 2.1 Authorization Server Metadata
- **RFC 7591** — OAuth 2.1 Dynamic Client Registration

The server exposes metadata at `/.well-known/oauth-protected-resource`.

> **Note for Keycloak users:** Add an **Audience mapper** to your client (Client → Client scopes → dedicated scope → Add mapper → Audience) to include the correct `aud` claim in tokens.

> [!NOTE]
> **Per-tool scope enforcement:** Scopes are enforced at the tool level — each tool group maps to a required scope (`read`, `write`, or `admin`). When OAuth is enabled, every tool invocation checks the calling token's scopes before execution. When OAuth is not configured, scope checks are skipped entirely.

> [!WARNING]
> **HTTP without authentication:** When using `--transport http` without enabling OAuth or `--auth-token`, all clients have full unrestricted access. Always enable authentication for production HTTP deployments. See [SECURITY.md](SECURITY.md) for details.

> **Priority:** When both `--auth-token` and `--oauth-enabled` are set, OAuth 2.1 takes precedence. If neither is configured, the server warns and runs without authentication.

## 🔧 Configuration

### Environment Variables

| Variable                     | Default     | Description                                                     | CLI Flag                       |
| ---------------------------- | ----------- | --------------------------------------------------------------- | ------------------------------ |
| `POSTGRES_HOST`              | `localhost` | Database host                                                   | `--host`                       |
| `POSTGRES_PORT`              | `5432`      | Database port                                                   | `--pg-port`                    |
| `POSTGRES_USER`              | `postgres`  | Database username                                               | `--user`                       |
| `POSTGRES_PASSWORD`          | _(empty)_   | Database password                                               | `--password`                   |
| `POSTGRES_DATABASE`          | `postgres`  | Database name                                                   | `--database`                   |
| `POSTGRES_URL`               | —           | Connection string (overrides individual vars)                   | `--postgres`                   |
| `MCP_HOST`                   | `localhost` | Server bind host (`0.0.0.0` for containers)                     | `--server-host`                |
| `MCP_TRANSPORT`              | `stdio`     | Transport type: `stdio`, `http`, `sse`                          | `--transport`                  |
| `PORT`                       | `3000`      | HTTP port for http/sse transports                               | `--port`                       |
| `MCP_AUTH_TOKEN`             | —           | Simple bearer token for HTTP auth                               | `--auth-token`                 |
| `LOG_LEVEL`                  | `info`      | Log level: `debug`, `info`, `warning`, `error`                  | `--log-level`                  |
| `METADATA_CACHE_TTL_MS`      | `30000`     | Schema cache TTL (ms)                                           | —                              |
| `POSTGRES_TOOL_FILTER`       | —           | Tool filter string (also `MCP_TOOL_FILTER`)                     | `--tool-filter`                |
| `MCP_RATE_LIMIT_MAX`         | `100`       | Rate limit per IP per 15min window                              | —                              |
| `MCP_REQUEST_TIMEOUT`        | `300000`    | HTTP request timeout (ms) for Slowloris protection              | —                              |
| `MCP_HEADERS_TIMEOUT`        | `60000`     | HTTP headers timeout (ms)                                       | —                              |
| `TRUST_PROXY`                | `false`     | Trust X-Forwarded-For for client IP                             | `--trust-proxy`                |
| `OAUTH_ENABLED`              | `false`     | Enable OAuth 2.1 authentication                                 | `--oauth-enabled`              |
| `OAUTH_ISSUER`               | —           | Authorization server URL                                        | `--oauth-issuer`               |
| `OAUTH_AUDIENCE`             | —           | Expected token audience                                         | `--oauth-audience`             |
| `OAUTH_JWKS_URI`             | _(auto)_    | JWKS URI (auto-discovered from issuer)                          | `--oauth-jwks-uri`             |
| `OAUTH_CLOCK_TOLERANCE`      | `60`        | Clock tolerance in seconds                                      | `--oauth-clock-tolerance`      |
| `AUDIT_LOG_PATH`             | —           | Audit log file path (`stderr` for container logs)               | `--audit-log`                  |
| `AUDIT_REDACT`               | `false`     | Omit tool arguments from audit entries                          | `--audit-redact`               |
| `AUDIT_BACKUP`               | `false`     | Enable pre-mutation DDL snapshots                               | `--audit-backup`               |
| `AUDIT_BACKUP_DATA`          | `false`     | Include sample data rows in snapshots                           | `--audit-backup-data`          |
| `AUDIT_BACKUP_MAX_AGE`       | `30`        | Maximum snapshot age in days                                    | `--audit-backup-max-age`       |
| `AUDIT_BACKUP_MAX_COUNT`     | `1000`      | Maximum number of snapshots to retain                           | `--audit-backup-max-count`     |
| `AUDIT_BACKUP_MAX_DATA_SIZE` | `52428800`  | Maximum table size for data capture (bytes)                     | `--audit-backup-max-data-size` |
| `AUDIT_READS`                | `false`     | Log read-scoped tool calls (compact entries)                    | `--audit-reads`                |
| `AUDIT_LOG_MAX_SIZE`         | `10485760`  | Max log file size before rotation (bytes). Keeps up to 5 files. | `--audit-log-max-size`         |

> **Aliases:** `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` are also supported (standard PostgreSQL client env vars).

> **Pool Tuning for IAM Auth:** For cloud-managed databases with IAM authentication (e.g., AWS RDS, Google Cloud SQL), use `--pool-max` to control pool size.

### CLI Reference

| Flag                                   | Description                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--postgres <url>`                     | Connection string                                                                                                                                 |
| `--host <host>`                        | PostgreSQL host                                                                                                                                   |
| `--pg-port <port>`                     | PostgreSQL port                                                                                                                                   |
| `--user <user>`                        | Username                                                                                                                                          |
| `--password <pw>`                      | Password (prefer `PGPASSWORD`)                                                                                                                    |
| `--database <db>`                      | Database name                                                                                                                                     |
| `--ssl`                                | Enable SSL                                                                                                                                        |
| `--pool-max <n>`                       | Max pool connections (default: 10)                                                                                                                |
| `--transport <type>`                   | `stdio` \| `http` \| `sse`                                                                                                                        |
| `--port <n>`                           | HTTP port                                                                                                                                         |
| `--server-host <host>`                 | Server bind host                                                                                                                                  |
| `--auth-token <token>`                 | Simple bearer token for HTTP auth                                                                                                                 |
| `--stateless`                          | Stateless HTTP mode (no sessions, no SSE)                                                                                                         |
| `--tool-filter <filter>`               | Tool filter string                                                                                                                                |
| `--log-level <level>`                  | Log verbosity                                                                                                                                     |
| `--oauth-enabled`                      | Enable OAuth 2.1                                                                                                                                  |
| `--trust-proxy`                        | Trust reverse proxy headers                                                                                                                       |
| `--audit-log <path>`                   | Enable JSONL audit trail (`stderr` for container logs)                                                                                            |
| `--audit-redact`                       | Omit tool arguments from audit entries                                                                                                            |
| `--audit-backup`                       | Enable pre-mutation DDL snapshots                                                                                                                 |
| `--audit-backup-data`                  | Include sample data rows in snapshots                                                                                                             |
| `--audit-backup-max-age <days>`        | Maximum snapshot age in days (default: 30)                                                                                                        |
| `--audit-backup-max-count <count>`     | Maximum number of snapshots to retain (default: 1000)                                                                                             |
| `--audit-backup-max-data-size <bytes>` | Maximum table size for data capture (default: 52428800)                                                                                           |
| `--audit-reads`                        | Log read-scoped tool calls (compact entries)                                                                                                      |
| `--audit-log-max-size <bytes>`         | Max log file size before rotation (default: 10MB). System retains up to 5 rotated historical archives before oldest deletion (`.1` through `.5`). |

## 🤖 AI-Powered Prompts

Prompts provide step-by-step guidance for complex database tasks. Instead of figuring out which tools to use and in what order, simply invoke a prompt and follow its workflow — great for learning PostgreSQL best practices or automating repetitive DBA tasks.

This server includes **20 intelligent prompts** for guided workflows:

| Prompt                     | Description                                        | Required Groups               |
| -------------------------- | -------------------------------------------------- | ----------------------------- |
| `pg_query_builder`         | Construct queries with CTEs and window functions   | core                          |
| `pg_schema_design`         | Design schemas with constraints and indexes        | core                          |
| `pg_performance_analysis`  | Analyze queries with EXPLAIN and optimization      | core, performance             |
| `pg_migration`             | Generate migration scripts with rollback support   | core                          |
| `pg_tool_index`            | Lazy hydration - compact index of all tools        | —                             |
| `pg_quick_query`           | Quick SQL query guidance for common operations     | core                          |
| `pg_quick_schema`          | Quick reference for exploring database schema      | core                          |
| `pg_database_health_check` | Comprehensive database health assessment           | core, performance, monitoring |
| `pg_backup_strategy`       | Enterprise backup planning with RTO/RPO            | core, monitoring, backup      |
| `pg_index_tuning`          | Index analysis and optimization workflow           | core, performance             |
| `pg_extension_setup`       | Extension installation and configuration guide     | core                          |
| `pg_setup_pgvector`        | Complete pgvector setup for semantic search        | core, vector                  |
| `pg_setup_postgis`         | Complete PostGIS setup for geospatial operations   | core, postgis                 |
| `pg_setup_pgcron`          | Complete pg_cron setup for job scheduling          | core                          |
| `pg_setup_partman`         | Complete pg_partman setup for partition management | core, partman                 |
| `pg_setup_kcache`          | Complete pg_stat_kcache setup for OS monitoring    | core, kcache                  |
| `pg_setup_citext`          | Complete citext setup for case-insensitive text    | core, citext                  |
| `pg_setup_ltree`           | Complete ltree setup for hierarchical data         | core, ltree                   |
| `pg_setup_pgcrypto`        | Complete pgcrypto setup for cryptographic funcs    | core, pgcrypto                |
| `pg_safe_restore_workflow` | 6-step safe restore playbook with `restoreAs`      | backup                        |

## 📦 Resources

Resources give you instant snapshots of database state without writing queries. Perfect for quickly checking schema, health, or performance metrics — the AI can read these to understand your database context before suggesting changes.

This server provides **23 resources** for structured data access:

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
| Insights     | `postgres://insights`     | AI-appended business insights and observations     |
| Audit        | `postgres://audit`        | Audit trail with token summary and top tools       |
| Help         | `postgres://help/{group}` | Group-specific help and workflow documentation     |

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

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting a pull request.

## Security

For security concerns, please see our [Security Policy](SECURITY.md).

> **⚠️ Never commit credentials** - Store secrets in environment variables

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating in this project.
