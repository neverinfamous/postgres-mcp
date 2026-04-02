# Advanced Stress Test — postgres-mcp — partitioning Group

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run any other test files.
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
- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls
- Group multiple related tests into a single code mode call when practical

## Test Database Schema

Refer to `test-database.sql` for the baseline. Operations here should focus on expanding upon it and ensuring partition boundaries are respected.

## Naming & Cleanup

- **Temporary tables**: Prefix with `stress_part_`
- **Cleanup**: Attempt to remove all `stress_part_*` objects after testing. If DROP fails, note the leftover objects and move on.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `TABLE_NOT_FOUND`).

## Post-Test Procedures

1. Confirm cleanup of all `stress_part_*` objects.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements and 📦 Payload problems.
3. Update the changelog with any changes made.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass, not counting this testing prompt itself. Highlight the single most expensive code mode block.
5. Stop and briefly summarize the testing results.

---

## partitioning Group Advanced Tests

### partitioning Group Tools

1. pg_create_partitioned_table
2. pg_create_partition
3. pg_attach_partition
4. pg_detach_partition
5. pg_list_partitions
6. pg_partition_info
7. pg_execute_code (auto-added)

### Category 1: Boundary Values & Empty States

**1.1 Overlapping Range Boundaries**
1. `pg_create_partitioned_table` -> Generate `stress_part_range_parent` using range key `id (INT)`.
2. `pg_create_partition` -> Attach child `stress_part_p1` from `100` to `200`. Wait for success.
3. `pg_create_partition` -> Test overlapping boundaries `150` to `250` for child `stress_part_p2`. This should natively fail in PostgreSQL. Expect a properly formatted `VALIDATION_ERROR` rather than a raw syntax exception leak.

**1.2 List Partition Limits**
4. `pg_create_partitioned_table` -> Generate `stress_part_list_parent` by column `category` (TEXT).
5. Attach list values array `["Alpha", "Bravo"]` to child `stress_part_l1`. 
6. Attempt to attach duplicate value `["Alpha"]` to `stress_part_l2`. Expect `VALIDATION_ERROR`.

### Category 2: State Pollution & Idempotency

**2.1 Detach & Re-Attach Workflows**
7. Manually detach `pg_detach_partition` on `stress_part_p1`. Verify payload indicates success.
8. Attempt detachment again. Expect `VALIDATION_ERROR` or safe execution flags indicating already detached.
9. Manually re-attach via `pg_attach_partition`. Verify boundaries restate correctly.

### Category 3: Alias & Parameter Combinations

10. Test partitioning options omitting explicit keys where defaults apply, or test out-of-order parameters (using alias bounds vs discrete bounds if supported).
11. `pg_list_partitions` using `limit: 0` vs `limit: 5`.

### Category 4: Error Message Quality

12. `pg_partition_info` against a completely standard (non-partitioned) table -> Assert expected behavior (`VALIDATION_ERROR` or handled edge case).
13. `pg_create_partition` targeting a missing parent table -> Assert `TABLE_NOT_FOUND` or `VALIDATION_ERROR`.

### Category 5: Large Payload & Truncation Verification

**5.1 High Volume Sub-Partitions**
14. Use Code Mode script to generate 50 micro-range partitions (e.g., bounds of 1 unit each) dynamically.
15. Call `pg_list_partitions` on the parent. Monitor `metrics.tokenEstimate` to ensure token bounds don't explode. Ensure `truncated` flag kicks in successfully if `limit` is explicitly mapped. 

### Category 6: Code Mode Parity

**6.1 API Validation via JS**
16. Programmatically verify `pg_partition_info` payload outputs are deterministic and match structural typing (ensuring nested array objects for child references are correctly formatted without stringification errors).

### Final Cleanup

Ensure all `stress_part_*` partitioned families are forcefully dropped.
