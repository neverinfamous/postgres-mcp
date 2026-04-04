# postgres-mcp (PostgreSQL MCP Server)

## Quick Access

| Purpose         | Action                     |
| --------------- | -------------------------- |
| Health check    | `pg_analyze_db_health` tool |
| Server info     | `pg_server_version` tool   |
| Database schema | `postgres://schema` resource |
| Audit & Tokens  | `postgres://audit` resource  |
| Tool help       | `postgres://help` resource   |

## Built-in Tools

`pg_read_query`, `pg_write_query`, `pg_list_tables` — always available.

## Code Mode Sandbox (`pg_execute_code`)

For multi-step data pipelines, complex validations, or token-heavy reads (like vector dimension data or large raw string outputs), ALWAYS use Code Mode. It provides a secure JavaScript execution sandbox with native `pg.*` proxy access, drastically reducing LLM token consumption by up to ~90% for loop operations and eliminating MCP transport latency.

## Tool Groups Showcase (200+ Tools)

All tools are grouped by namespace in Code Mode (e.g. `pg.stats.*`, `pg.vector.*`). 
Some highlights include:
- **Core Operations**: `core`, `transactions`, `migration`, `schema`
- **Data Types**: `jsonb`, `text`, `vector`, `postgis`, `citext`, `ltree`
- **Introspection/Health**: `introspection`, `monitoring`, `performance`, `kcache`
- **Scale/Maintenance**: `partitioning`, `partman`, `cron`, `backup`, `admin`
- **Analytics**: `stats`, `pgcrypto`

Review individual `server-instructions/{group}.md` for deep-dive examples and parameter aliases, or use `postgres://help` directly from the MCP.
