# Advanced Stress Test — postgres-mcp — pgcrypto Group

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run any other test files.
- All changes **MUST** be consistent with other postgres-mcp tools and `code-map.md`.
- Do not do anything other than these tests.
- Please let me handle Lint, typecheck, vitest, and playwright. You cannot restart the server in antigravity as the cache has to be refreshed manually.

## Code Mode Execution

All tests should be executed via `pg_execute_code` code mode.

**Key rules:**
- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls
- Group multiple related tests into a single code mode call when practical

## Naming & Cleanup

- **Temporary tables/schemas**: Prefix with `stress_pgcrypto_`
- **Cleanup**: Attempt to remove all `stress_pgcrypto_*` objects after testing.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `TABLE_NOT_FOUND`).

## Post-Test Procedures

1. Confirm cleanup of all `stress_pgcrypto_*` objects.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements and 📦 Payload problems.
3. Update the changelog with any changes made.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass.
5. Stop and briefly summarize the testing results.

---

## pgcrypto Group Advanced Tests

### Category 1: Boundary Values & Empty States

**1.1 Algorithm Bounds Testing**
1. Call hashing mechanisms with empty string targets. Should successfully return deterministic hash string values.
2. Supply explicitly unsupported algorithms (e.g. `algo: "md-minus-5"`). Note the error envelope ensures a `VALIDATION_ERROR` rather than postgres native syntax failures.

### Category 2: State Pollution & Idempotency

**2.1 Massive Iteration Salts**
3. Create salt generation iterating the hashing load boundary limits. Idempotently trigger 5 independent salt generations inside sandbox code execution to verify process thread stability.

### Category 3: Alias & Parameter Combinations

4. Check default fallback aliases if an algorithm isn't supplied (does it default to `bf` or `sha256` properly?).

### Category 4: Error Message Quality

5. Attempt PGP decryption using an entirely mismatched symmetric key. Ensure the generated native exception code is correctly translated to `CRYPTO_DECRYPTION_ERROR` or similar structured output.

### Category 5: Large Payload & Truncation Verification

**5.1 Heavy Byte Stream Decryption**
6. Feed exceptionally long strings or mock large payload texts (50KB raw buffers) into symmetric encryption loops using `pg_execute_code` dynamically. Monitor `metrics.tokenEstimate` to ascertain token overhead.

### Category 6: Code Mode Parity

7. Verify programmatic hashing (e.g. creating user password salts via Code Mode JS bindings) behaves identically across the RPC bridge dynamically versus native direct function invocation payloads.

### Final Cleanup

Drop all `stress_pgcrypto_*` tables.
