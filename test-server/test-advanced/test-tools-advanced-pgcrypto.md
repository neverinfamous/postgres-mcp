# Advanced Stress Test — postgres-mcp — pgcrypto Group

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
| `pg_pgcrypto_encrypt(...)`                           | `pg.pgcrypto.encrypt(...)`                                     |
| `pg_pgcrypto_hash(...)`                              | `pg.pgcrypto.hash(...)`                                        |
| `pg_pgcrypto_decrypt(...)`                           | `pg.pgcrypto.decrypt(...)`                                     |
| `pg_*(...)`                                          | `pg.pgcrypto.*(...)`                                           |

**Key rules:**
- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls
- Group multiple related tests into a single code mode call when practical

## Naming & Cleanup

- **Temporary testing states**: Prefix testing structures with `stress_pgcrypto_`
- **Cleanup**: `pg_drop_table` on cleanly populated items.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `COLUMN_NOT_FOUND`, `TABLE_NOT_FOUND`, `EXTENSION_MISSING`).

## Post-Test Procedures

1. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in this prompt (test-tools-advanced-pgcrypto.md) and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
2. Update the changelog if there are any changes made (being careful not to create duplicate headers) and commit without pushing.
3. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass, not counting this testing prompt itself. Highlight the single most expensive code mode block.
4. Stop and briefly summarize the testing results and fixes, ensuring the total token count is prominently displayed.

---

## pgcrypto Group Advanced Tests

### pgcrypto Group Tools (9 + 1 code mode)

1. `pg_pgcrypto_create_extension`
2. `pg_pgcrypto_hash`
3. `pg_pgcrypto_hmac`
4. `pg_pgcrypto_encrypt`
5. `pg_pgcrypto_decrypt`
6. `pg_pgcrypto_gen_random_uuid`
7. `pg_pgcrypto_gen_random_bytes`
8. `pg_pgcrypto_gen_salt`
9. `pg_pgcrypto_crypt`
10. `pg_execute_code` (auto-added)

### Category 1: Boundary Values & Empty States

Test tools against extreme characters, non-applicable parameters, and zero-state topologies.

1. `pg_pgcrypto_hash` → Supply a perfect empty string `data: ""` to hashing functions natively. Ensure deterministic zero-state processing executes via DB instead of Zod trapping it prematurely natively.
2. `pg_pgcrypto_encrypt` → Supply a completely empty password key mapping (`password: ""`) vs `data: ""`. Does pgcrypto allow blank symmetrical keys securely natively?
3. `pg_pgcrypto_gen_random_uuid` → Pass extreme boundary generation limits `count: 999999` constraints. Evaluate buffer sizing execution handlers natively.

### Category 2: State Pollution & Idempotency

Ensure tools execute safely when repeated identically multiple times.

4. `pg_pgcrypto_create_extension` → Execute natively consecutively multiple times inside a Code Mode execution. Verify `{success: true}` handles `alreadyExists` natively.

### Category 3: Alias & Parameter Combinations

Test parametric fallback modes and configuration matrices.

5. `pg_pgcrypto_gen_random_bytes` → Parameter matrix encoding test: map through explicitly supported encodings (`hex`, `base64`, `raw`). Validate native type enforcement safely processes inside Javascript payloads cleanly natively across DB string bindings.

### Category 4: Error Message Quality

Ensure tools predictably return typed `VALIDATION_ERROR`, etc.

6. `pg_pgcrypto_decrypt` → Pass absolute structurally invalid garbage strings (`data: "12345!@#$"`) into decrypt parameters mapping natively. Identify exactly how strictly Postgres wraps the parser parsing failure to standard P154 typing formats versus crashing the driver.
7. Environment Mock -> Manually drop the `pgcrypto` extension directly using pure SQL within Code Mode. Then execute `pg_pgcrypto_hmac`. Validate error returned is typed `EXTENSION_MISSING` (or a cleanly handled syntax wrapper natively).
8. Restore the extension via `pg_pgcrypto_create_extension()` directly afterwards.

### Category 5: Complex Flow Architectures

Verify that complex native functions execute mathematical hashes correctly dynamically.

9. Dynamic Flow Check → Encrypt a target string payload via Javascript execution (`pg_pgcrypto_encrypt`), store the output natively cleanly against `stress_pgcrypto_cache`, retrieve the row directly against a database read mechanism, then push the variable purely into `pg_pgcrypto_decrypt` strictly verifying data integrity over the serialization framework manually dynamically without explicit direct inputs.

### Category 6: Large Payload & Truncation Verification

Ensure sweeping reads cap context window exposure.

10. Execute UUID mass generation (`count: 100`) strictly evaluating Javascript token mapping sizing native properties. Ensure returned array handles native mappings strictly to verify bounds.

### Final Cleanup

11. Native Execution -> Drop any experimental tables.
