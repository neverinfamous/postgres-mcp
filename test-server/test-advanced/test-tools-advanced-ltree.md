# Advanced Stress Test — postgres-mcp — ltree Group

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

- **Temporary tables/schemas**: Prefix with `stress_ltree_`
- **Cleanup**: Attempt to remove all `stress_ltree_*` objects after testing.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `TABLE_NOT_FOUND`).

## Post-Test Procedures

1. Confirm cleanup of all `stress_ltree_*` objects.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements and 📦 Payload problems.
3. Update the changelog with any changes made.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass.
5. Stop and briefly summarize the testing results.

---

## ltree Group Advanced Tests

### Category 1: Boundary Values & Empty States

**1.1 Edge Case Queries**
1. Run `pg_ltree_query` looking for extremely deep nested pathways (e.g. `Top.Science.Astronomy.Astrophysics.Cosmology.Theories.String...`).
2. Supply malformed `lqueries` lacking proper period delimiters. Assert `VALIDATION_ERROR`.

### Category 2: State Pollution & Idempotency

**2.1 Idempotent LCA Derivations**
3. Compute Lowest Common Ancestors (`pg_ltree_lca`) across the exact same array parameters consecutively. Output should strictly remain deterministic.

### Category 3: Alias & Parameter Combinations

4. Test `lquery` versus `ltxtquery` modes verifying proper mapping bindings in Javascript arrays.

### Category 4: Error Message Quality

5. Execute queries against standard text columns rather than ltree designated rows. Assert failure wraps natively into `COLUMN_NOT_FOUND` or typing errors.

### Category 5: Large Payload & Truncation Verification

**5.1 High Volume Path Extractions**
6. Generate 100 paths sequentially natively. Perform subpath querying utilizing explicit `.truncated: true` and ensure boundary limits function to stem payload exhaustion.

### Category 6: Code Mode Parity

7. Verify that direct code-mode JS array handling matches the explicit `pathArray` serialization structure identically for recursive queries.

### Final Cleanup

Drop all `stress_ltree_*` tables.
