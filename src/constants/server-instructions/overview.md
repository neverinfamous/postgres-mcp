# postgres-mcp (PostgreSQL MCP Server)

## Quick Access

| Purpose         | Action                     |
| --------------- | -------------------------- |
| Health check    | `pg_analyze_db_health` tool |
| Server info     | `pg_server_version` tool   |
| Database schema | `postgres://schema` resource |
| Audit log       | `postgres://audit` resource  |
| Tool help       | `postgres://help` resource   |

## Built-in Tools

`pg_read_query`, `pg_write_query`, `pg_list_tables` — always available.

## Help Resources

Read `postgres://help` for gotchas and critical usage patterns.
Read `postgres://help/{group}` for group-specific tool reference (jsonb, text, stats, vector, postgis, admin, etc.).
