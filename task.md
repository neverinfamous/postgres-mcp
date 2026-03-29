# Postgres Partitioning Tool Group Re-Testing

## Deterministic Checklist

- [ ] `pg_list_partitions({table: "test_events"})`
- [ ] `pg_partition_info({table: "test_events"})`
- [ ] `pg_list_partitions({table: "test_events", limit: 2})`
- [ ] 🔴 `pg_list_partitions({table: "nonexistent_table_xyz"})`
- [ ] 🔴 `pg_partition_info({})`

## Strict Coverage Matrix

| Tool | Direct Call (Happy Path) | Domain Error (Direct) | Zod Empty Param (Direct) | Alias Acceptance |
| :--- | :--- | :--- | :--- | :--- |
| `pg_list_partitions` | | | | |
| `pg_create_partition` | | | | |
| `pg_attach_partition` | | | | |
| `pg_detach_partition` | | | | |
| `pg_partition_info` | | | | |
| `pg_create_partitioned_table` | | | | |

## Findings

### Failures (❌)
*None yet*

### Issues (⚠️)
*None yet*

### Payload Optimizations (📦)
*None yet*
