# Postgres MCP Tool Certification Matrix: Monitoring

| Tool | Code Mode (Happy Path) | Code Mode (Domain Error) |
| --- | --- | --- |
| `pg_database_size` | ✅ | ✅ |
| `pg_table_sizes` | ✅ | ✅ |
| `pg_connection_stats` | ✅ | ✅ |
| `pg_replication_status` | ✅ | ✅ |
| `pg_server_version` | ✅ | ✅ |
| `pg_show_settings` | ✅ | ✅ |
| `pg_uptime` | ✅ | ✅ |
| `pg_recovery_status` | ✅ | ✅ |
| `pg_capacity_planning` | ✅ | ✅ |
| `pg_resource_usage_analyze` | ✅ | ✅ |
| `pg_alert_threshold_set` | ✅ | ✅ |

## Testing Notes
- The monitoring tools natively use strict typing and perform well without throwing MCP errors.
- Schema mapping and split-schema validation passed correctly across all tools.
- Payload efficiency is well within bounds, with the largest query using approx 1052 tokens.

## Token Audit
- Total Session Token Estimate: ~2800 tokens.
- Most Expensive Execution Block: `pg.monitoring.tableSizes` and `pg.monitoring.showSettings` block.
