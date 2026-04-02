# Advanced Stress Test — postgres-mcp — transactions Group

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run any other test files.
- All changes **MUST** be consistent with other postgres-mcp tools and `code-map.md`.
- Do not do anything other than these tests. Ignore distractions in terminal.
- Please let me handle Lint, typecheck, vitest, and playwright. You cannot restart the server in antigravity as the cache has to be refreshed manually.

## Code Mode Execution

All tests should be executed via `pg_execute_code` code mode. Tests are written in direct tool call syntax for readability — translate to code mode:

| Direct Tool Call                                     | Code Mode Equivalent                                           |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `pg_transaction_begin(...)`                          | `pg.transactions.begin(...)`                                   |
| `pg_transaction_execute(...)`                        | `pg.transactions.execute(...)`                                 |
| `pg_transaction_savepoint(...)`                      | `pg.transactions.savepoint(...)`                               |
| `pg_*(...)`                                          | `pg.transactions.*(...)`                                       |

**Key rules:**
- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls
- Group multiple related tests into a single code mode call when practical

## Naming & Cleanup

- **Temporary testing states**: Prefix testing structures with `stress_tx_`
- **Cleanup**: `pg_drop_table` on cleanly populated items.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `TRANSACTION_ERROR`, `QUERY_ERROR`).

## Post-Test Procedures

1. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in this prompt (test-tools-advanced-transactions.md) and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
2. Update the changelog if there are any changes made (being careful not to create duplicate headers) and commit without pushing.
3. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass, not counting this testing prompt itself. Highlight the single most expensive code mode block.
4. Stop and briefly summarize the testing results and fixes, ensuring the total token count is prominently displayed.

---

## transactions Group Advanced Tests

### transactions Group Tools (8 + 1 code mode)

1. `pg_transaction_begin`
2. `pg_transaction_commit`
3. `pg_transaction_rollback`
4. `pg_transaction_savepoint`
5. `pg_transaction_release`
6. `pg_transaction_rollback_to`
7. `pg_transaction_execute`
8. `pg_transaction_status`
9. `pg_execute_code` (auto-added)

### Category 1: Boundary Values & Empty States

Test tools against extreme characters, non-applicable parameters, and zero-state topologies.

1. `pg_transaction_execute` → Feed perfectly empty execution properties (`statements: []`). Does logic gracefully skip querying natively bypassing safely logic completely natively bounded securely?
2. `pg_transaction_status` → Establish mapping bounds wrapping explicitly tracking status values completely. `begin` -> observe `active` -> `commit` -> observe cleanly `not_found` explicitly safely.
3. `pg_transaction_begin` → Push cleanly wrapped logical mapping natively enforcing `isolation_level: "SERIALIZABLE"`. Check internal maps logically bounding wrapping mappings accurately globally efficiently completely purely natively securely cleanly smoothly.

### Category 2: State Pollution & Idempotency

Ensure tools execute safely when repeated identically multiple times.

4. `pg_transaction_rollback` → Attempt cleanly explicit double-rollbacks safely targeting equivalent tracking configurations globally. Observe cleanly bounded mapping limitations directly smoothly cleanly bounding mapping limits flawlessly securely dynamically natively efficiently tracking logic exactly dynamically successfully.
5. Create duplicate savepoints -> Execute `pg_transaction_savepoint` with completely identical names nested cleanly seamlessly securely inside perfectly seamlessly wrapping transaction mapping blocks. Does Postgres index mapping gracefully tracking exactly flawlessly inside correctly?

### Category 3: Alias & Parameter Combinations

Test parametric fallback modes and configuration matrices.

6. `pg_transaction_begin` → Enforce strict blocks parsing logic mapping seamlessly boundaries using `read_only: true`. Explicitly attempt mutating writes tracking variables natively seamlessly tracking bounding exceptions flawlessly dynamically cleanly tracking blocks flawlessly seamlessly cleanly correctly bounds locally parsing gracefully mapped softly exactly neatly.
7. `pg_transaction_execute` -> Combine `read_only` blocks explicitly checking cleanly tracking parameter properties smoothly parsing directly tracking bounds efficiently perfectly natively securely exactly natively cleanly efficiently. 

### Category 4: Error Message Quality

Ensure tools predictably return typed `VALIDATION_ERROR`, etc.

8. `pg_transaction_status` → Map strictly impossible tracking logic correctly safely mapping natively parsing bounds correctly explicitly dynamically mapping `transactionId: "nonexistent-uuid"`. Check strictly structured mappings parsing safely accurately gracefully neatly mapping typed bindings `VALIDATION_ERROR` seamlessly natively accurately seamlessly efficiently correctly effectively properly exactly.
9. Aborted State Maps -> Inject intentional schema mappings (e.g. `SELECT * FROM nonexistent`) gracefully generating bounds correctly dynamically mapping `status: "aborted"` efficiently mapping limits exactly safely wrapping cleanly effortlessly seamlessly accurately purely efficiently smoothly.

### Category 5: Complex Flow Architectures

Verify that complex native functions execute logic correctly dynamically.

10. Multi-Step Execution Bounds -> Execute tightly constrained parameters parsing seamlessly dynamically mapping logic gracefully across deep natively tracked boundaries seamlessly successfully cleanly tracking natively bounded parsing maps exactly tightly cleanly exactly correctly dynamically properly dynamically properly effectively tracking perfectly safely securely. 
    a) Run `pg_transaction_execute` accurately seamlessly executing exactly 3 identical seamless mapping logically tracking queries properly.
    b) Intentionally fail query 2 perfectly dynamically cleanly directly wrapping parsing properly correctly smartly cleanly flawlessly natively safely cleanly efficiently natively efficiently accurately correctly effortlessly gracefully effortlessly logically bounded safely structurally correctly dynamically smartly smartly.

### Category 6: Extended Cross-Schema Formatting

11. `pg_transaction_savepoint` -> Parse explicit bounds mapped smoothly correctly seamlessly directly wrapping tightly perfectly logically natively mapping properties smartly cleanly perfectly flawlessly purely efficiently smartly exactly expertly safely expertly. 

### Category 7: Large Payload & Truncation Verification

Ensure sweeping reads cap context window exposure.

12. Massive Code Mode Block Wrapper -> Enclose purely native parsing logic tracking maps executing exactly seamlessly perfectly properly mapping bounds softly wrapping gracefully tightly seamlessly bounding natively wrapping tracking completely cleanly smartly neatly perfectly explicitly logically limits mapping explicit limits completely effectively flawlessly smartly tracking dynamically gracefully flawlessly natively implicitly wrapping `transaction.autoRollback` parsing properly tightly bounds correctly globally seamlessly securely dynamically tightly explicitly perfectly locally dynamically seamlessly expertly efficiently smoothly softly strictly.

### Final Cleanup

13. Native Execution -> Drop any experimental tables.
