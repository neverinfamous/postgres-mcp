# Advanced Stress Test — postgres-mcp — postgis Group

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

- **Temporary tables/schemas**: Prefix with `stress_gis_`
- **Cleanup**: Attempt to remove all `stress_gis_*` objects after testing.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `TABLE_NOT_FOUND`).

## Post-Test Procedures

1. Confirm cleanup of all `stress_gis_*` objects.
2. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements and 📦 Payload problems.
3. Update the changelog with any changes made.
4. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass.
5. Stop and briefly summarize the testing results.

---

## postgis Group Advanced Tests

### Category 1: Boundary Values & Empty States

**1.1 Edge Case Polygons**
1. Supply impossible coordinates (e.g. `POINT(999 999)`) to spatial routines. Assert `VALIDATION_ERROR`.
2. Compute distance bounds between directly overlapping geometry blocks resolving cleanly to `0` distance.

### Category 2: State Pollution & Idempotency

**2.1 Idempotent Extractions**
3. Repetitive execution of `pg_postgis_distance` inside tight Code Mode mapping loops to affirm boundary lock logic.

### Category 3: Alias & Parameter Combinations

4. Swap coordinate tracking mappings natively (SRID 4326 vs default SRID formats) to ensure resolution mappings pass dynamically.

### Category 4: Error Message Quality

5. Run intersection calculations on columns completely missing coordinate arrays. Expect `COLUMN_NOT_FOUND`.

### Category 5: Large Payload & Truncation Verification

**5.1 High Volume Points**
6. Return mapping boundaries across massive multipolygon sets. Trace `.truncated: true` and monitor `metrics.tokenEstimate` against extreme token explosions.

### Category 6: Code Mode Parity

7. Verify geojson structural mappings output properly via native `pg_execute_code` arrays versus generic text queries.

### Final Cleanup

Drop all `stress_gis_*` tables.
