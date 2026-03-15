# Reset Prompts Test Database

Run this command to seed the database for testing all 19 postgres-mcp prompts:

docker exec postgres-server psql -U postgres -d postgres -c "DROP TABLE IF EXISTS prompt_order_items CASCADE; DROP TABLE IF EXISTS prompt_orders CASCADE; DROP TABLE IF EXISTS prompt_users CASCADE; DROP TABLE IF EXISTS prompt_transactions CASCADE; DROP TABLE IF EXISTS prompt_sessions CASCADE; DROP TABLE IF EXISTS prompt_audit_log CASCADE; DROP TABLE IF EXISTS prompt_embeddings CASCADE; DROP TABLE IF EXISTS prompt_locations CASCADE; DROP TABLE IF EXISTS prompt_categories CASCADE; DROP TABLE IF EXISTS prompt_accounts CASCADE; DROP TABLE IF EXISTS prompt_secure_users CASCADE; DROP TABLE IF EXISTS prompt_secrets CASCADE; DROP TABLE IF EXISTS prompt_job_log CASCADE; DROP TABLE IF EXISTS prompt_events CASCADE; DROP TABLE IF EXISTS prompt_employees CASCADE; DROP TABLE IF EXISTS prompt_daily_reports CASCADE; DROP TABLE IF EXISTS prompt_weekly_metrics CASCADE;" && docker cp c:\Users\chris\Desktop\postgres-mcp\test-server\test-prompts.sql postgres-server:/tmp/ && docker exec postgres-server psql -U postgres -d postgres -f /tmp/test-prompts.sql

## What This Creates

Tables prefixed with `prompt_*` to support testing:

| Section        | Tables                                                | Supports Prompts                                       |
| -------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| Core           | `prompt_users`, `prompt_orders`, `prompt_order_items` | `pg_query_builder`, `pg_schema_design`, `pg_migration` |
| Performance    | `prompt_transactions` (10K rows)                      | `pg_performance_analysis`, `pg_index_tuning`           |
| Health         | `prompt_sessions`                                     | `pg_database_health_check`                             |
| Backup         | `prompt_audit_log`                                    | `pg_backup_strategy`                                   |
| pgvector       | `prompt_embeddings`                                   | `pg_setup_pgvector`                                    |
| PostGIS        | `prompt_locations`                                    | `pg_setup_postgis`                                     |
| ltree          | `prompt_categories`, `prompt_employees`               | `pg_setup_ltree`                                       |
| citext         | `prompt_accounts`                                     | `pg_setup_citext`                                      |
| pgcrypto       | `prompt_secure_users`, `prompt_secrets`               | `pg_setup_pgcrypto`                                    |
| pg_cron        | `prompt_job_log`                                      | `pg_setup_pgcron`                                      |
| pg_partman     | `prompt_events` (partitioned)                         | `pg_setup_partman`                                     |
| pg_stat_kcache | Uses existing stats                                   | `pg_setup_kcache`                                      |
| Reporting      | `prompt_daily_reports`, `prompt_weekly_metrics`       | `pg_setup_pgcron` (reporting use case)                 |

## Testing Prompts

### No-Argument Prompts (complete immediately)

/pg_tool_index
/pg_quick_schema

### Optional-Argument Prompts

### pg_database_health_check (focus: all, indexes, connections, vacuum, replication, buffer)

/pg_database_health_check
/pg_database_health_check focus:indexes
/pg_database_health_check focus:connections
/pg_database_health_check focus:vacuum
/pg_database_health_check focus:replication
/pg_database_health_check focus:buffer

### pg_backup_strategy (backupType: logical, physical, continuous) (retentionDays: any number)

/pg_backup_strategy
/pg_backup_strategy backupType:physical
/pg_backup_strategy backupType:continuous
/pg_backup_strategy backupType:logical retentionDays:90

### pg_index_tuning (schema: any) (focus: all, unused, missing, duplicate)

/pg_index_tuning
/pg_index_tuning focus:unused
/pg_index_tuning focus:missing
/pg_index_tuning focus:duplicate
/pg_index_tuning schema:test_schema

### pg_setup_pgvector (contentType: documents, products, images) (dimensions: number) (distanceMetric: cosine, l2, inner_product)

/pg_setup_pgvector
/pg_setup_pgvector contentType:products
/pg_setup_pgvector contentType:images
/pg_setup_pgvector distanceMetric:l2
/pg_setup_pgvector distanceMetric:inner_product
/pg_setup_pgvector contentType:documents dimensions:768 distanceMetric:cosine

### pg_setup_postgis (useCase: mapping, distance_calc, spatial_analysis, routing)

/pg_setup_postgis
/pg_setup_postgis useCase:distance_calc
/pg_setup_postgis useCase:spatial_analysis
/pg_setup_postgis useCase:routing

### pg_setup_pgcron (useCase: maintenance, cleanup, reporting, etl, backup)

/pg_setup_pgcron
/pg_setup_pgcron useCase:cleanup
/pg_setup_pgcron useCase:reporting
/pg_setup_pgcron useCase:etl
/pg_setup_pgcron useCase:backup

### pg_setup_partman (partitionType: time, serial, id) (interval: daily, weekly, monthly, yearly)

/pg_setup_partman
/pg_setup_partman partitionType:serial
/pg_setup_partman partitionType:id
/pg_setup_partman partitionType:time interval:weekly
/pg_setup_partman partitionType:time interval:monthly
/pg_setup_partman partitionType:time interval:yearly

### pg_setup_kcache (focus: all, cpu, io, memory)

/pg_setup_kcache
/pg_setup_kcache focus:cpu
/pg_setup_kcache focus:io
/pg_setup_kcache focus:memory

### pg_setup_citext (useCase: email, username, tags, domains)

/pg_setup_citext
/pg_setup_citext useCase:username
/pg_setup_citext useCase:tags
/pg_setup_citext useCase:domains

### pg_setup_ltree (useCase: categories, org_chart, file_paths, taxonomy)

/pg_setup_ltree
/pg_setup_ltree useCase:org_chart
/pg_setup_ltree useCase:file_paths
/pg_setup_ltree useCase:taxonomy

### pg_setup_pgcrypto (useCase: password_hashing, encryption, uuid, hmac)

/pg_setup_pgcrypto
/pg_setup_pgcrypto useCase:encryption
/pg_setup_pgcrypto useCase:uuid
/pg_setup_pgcrypto useCase:hmac

### Required-Argument Prompts

/pg_query_builder tables:prompt_users,prompt_orders operation:JOIN
/pg_query_builder tables:prompt_transactions operation:CTE
/pg_schema_design useCase:e-commerce order management
/pg_performance_analysis query:SELECT \* FROM prompt_transactions WHERE amount > 1000
/pg_migration change:add status column table:prompt_users
/pg_quick_query action:find orders by user
/pg_extension_setup extensionName:pgvector
/pg_extension_setup extensionName:postgis

## Cleanup

To remove all prompt test tables:

DROP TABLE IF EXISTS prompt_order_items CASCADE;
DROP TABLE IF EXISTS prompt_orders CASCADE;
DROP TABLE IF EXISTS prompt_users CASCADE;
DROP TABLE IF EXISTS prompt_transactions CASCADE;
DROP TABLE IF EXISTS prompt_sessions CASCADE;
DROP TABLE IF EXISTS prompt_audit_log CASCADE;
DROP TABLE IF EXISTS prompt_embeddings CASCADE;
DROP TABLE IF EXISTS prompt_locations CASCADE;
DROP TABLE IF EXISTS prompt_categories CASCADE;
DROP TABLE IF EXISTS prompt_accounts CASCADE;
DROP TABLE IF EXISTS prompt_secure_users CASCADE;
DROP TABLE IF EXISTS prompt_secrets CASCADE;
DROP TABLE IF EXISTS prompt_job_log CASCADE;
DROP TABLE IF EXISTS prompt_events CASCADE;
DROP TABLE IF EXISTS prompt_employees CASCADE;
DROP TABLE IF EXISTS prompt_daily_reports CASCADE;
DROP TABLE IF EXISTS prompt_weekly_metrics CASCADE;

## Validation Criteria

### Pass Criteria

Each prompt invocation should:

1. **Return structured markdown** — not empty, not an error, not raw SQL
2. **Include actionable guidance** — step-by-step instructions, example queries, or configuration recommendations
3. **Respect arguments** — when optional/required arguments are provided, the output should reflect them (e.g., `focus:indexes` should emphasize index analysis, not general health)
4. **Extension awareness** — extension setup prompts (pgvector, PostGIS, etc.) should detect whether the extension is installed and adjust guidance accordingly

### Reporting Format

- ✅ **Pass**: Prompt returns well-structured guidance matching the expected use case
- ⚠️ **Partial**: Prompt returns guidance but misses arguments, ignores parameters, or has stale information
- ❌ **Fail**: Prompt errors, returns empty output, or produces irrelevant content

### Final Summary

Provide a summary table of all 19 prompts with their pass/partial/fail status. Separately list any issues requiring code fixes vs. documentation improvements.
