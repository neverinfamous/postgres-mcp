# Partitioning Tools

- `pg_create_partitioned_table`: `partitionBy` case-insensitive. Supports `schema.table` format for `name` (auto-parsed). `primaryKey` accepts array (e.g., `['id', 'event_date']`). ⛔ `primaryKey`/`unique` must include partition key—throws validation error otherwise
- `pg_create_partition`: Use `parent`/`table`/`parentTable`. `forValues` is a raw SQL string: `"FROM ('2024-01-01') TO ('2024-07-01')"`, `"IN ('US', 'CA')"`, `"WITH (MODULUS 4, REMAINDER 0)"`. For DEFAULT partition, use `isDefault: true`. Supports `schema.table` format for `parent` (auto-parsed)
- `pg_attach_partition`/`pg_detach_partition`: Support `schema.table` format for `parent` and `partition` (auto-parsed). For DEFAULT partition, use `isDefault: true` or `forValues: "DEFAULT"`
- `pg_list_partitions`: Default `limit: 50` (use `0` for all). Returns `{partitions, count, truncated, totalCount?}`. Uses `bounds` field (consistent with `pg_partition_info`)
- `pg_partition_info`: Returns `{tableInfo, partitions, totalSizeBytes}`. Uses `bounds` field
- Both list/info tools support `schema.table` format (auto-parsed) and accept `table`, `parent`, `parentTable`, or `name` aliases
- Response structures: `pg_create_partitioned_table` → `{success, table, partitionBy, partitionKey, primaryKey?}`. `pg_create_partition` → `{success, partition, parent, bounds, subpartitionBy?, subpartitionKey?}`. `pg_attach_partition` → `{success, parent, partition, bounds}`. `pg_detach_partition` → `{success, parent, partition}`
- ⚠️ Sub-partitioning: `subpartitionBy`/`subpartitionKey` on `pg_create_partition` makes a partition itself partitionable. The parent's `primaryKey` must include the sub-partition key column (PostgreSQL constraint)
- 📍 Code Mode: `pg.partitioning.create()` = `createPartition`, NOT `createPartitionedTable`
