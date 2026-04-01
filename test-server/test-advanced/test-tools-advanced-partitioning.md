# Advanced Stress Test — postgres-mcp — partitioning Group

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- All changes **MUST** be consistent with other postgres-mcp tools and `code-map.md`.
- Do not do anything other than these tests.
- Please let me handle Lint, typecheck, vitest, and playwright. You cannot restart the server in antigravity as the cache has to be refreshed manually.

## Code Mode Execution

All tests should be executed via `pg_execute_code` code mode. Tests are written in direct tool call syntax for readability — translate to code mode:

| Direct Tool Call                                     | Code Mode Equivalent                                           |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `pg_create_partitioned_table(...)`                   | `pg.partitioning.createPartitionedTable(...)`                  |
| `pg_create_partition(...)`                           | `pg.partitioning.createPartition(...)`                         |
| `pg_attach_partition(...)`                           | `pg.partitioning.attachPartition(...)`                         |
| `pg_detach_partition(...)`                           | `pg.partitioning.detachPartition(...)`                         |
| `pg_list_partitions(...)`                            | `pg.partitioning.listPartitions(...)`                          |
| `pg_partition_info(...)`                             | `pg.partitioning.partitionInfo(...)`                           |

**Key rules:**

- Group multiple related tests into a single code mode call when practical
- Prefix transient schemas with `stress_`

## Naming & Cleanup

- **Temporary tables**: Prefix with `stress_`
- **Cleanup**: Attempt to remove all `stress_*` objects after testing.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response. **You MUST monitor `metrics.tokenEstimate` for every operation**.
- ✅ Confirmed: Edge case handled correctly

## partitioning Group Advanced Tests

### Category 1: Range Partition Boundary Edge Cases

1. `pg_create_partitioned_table` -> Generate `stress_range_parent` using range key `id`.
2. `pg_create_partition` -> `stress_range_p1` from `100` to `200`. Wait for success.
3. `pg_create_partition` -> Test overlapping boundaries `150` to `250` which should throw a proper formatted DB exception via `VALIDATION_ERROR`, not native syntax failure.
4. Test out-of-order attach. Manually detach `pg_detach_partition`, then use `pg_attach_partition`.

### Category 2: List Partition Limits

5. `pg_create_partitioned_table` -> Generate `stress_list_parent` by `category`.
6. Attach list values array `["A", "B"]` to child `stress_list_p1`. Then try to create a default partition `stress_list_default`. Verify payload returns correct lists.

## Post-Test Procedures

1. Confirm cleanup of all `stress_*` object.
2. **Fix EVERY finding**.
3. Update the changelog with any changes made.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass, not counting this testing prompt itself. Highlight the single most expensive code mode block.
5. Stop and briefly summarize the testing results and fixes.

### Final Cleanup

Confirm any temporary state is cleaned up.
