# Advanced Stress Test — postgres-mcp — postgis Group

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
| `pg_point_in_polygon(...)`                           | `pg.postgis.pointInPolygon(...)`                               |
| `pg_geo_cluster(...)`                                | `pg.postgis.geoCluster(...)`                                   |
| `pg_postgis_create_extension(...)`                   | `pg.postgis.createExtension(...)`                              |
| `pg_*(...)`                                          | `pg.postgis.*(...)`                                            |

**Key rules:**
- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls
- Group multiple related tests into a single code mode call when practical

## Naming & Cleanup

- **Temporary testing states**: Prefix testing structures with `stress_gis_`
- **Cleanup**: `pg_drop_table` on cleanly populated items.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `COLUMN_NOT_FOUND`, `TABLE_NOT_FOUND`, `EXTENSION_MISSING`).

## Post-Test Procedures

1. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in this prompt (test-tools-advanced-postgis.md) and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
2. Update the changelog if there are any changes made (being careful not to create duplicate headers) and commit without pushing.
3. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass, not counting this testing prompt itself. Highlight the single most expensive code mode block.
4. Stop and briefly summarize the testing results and fixes, ensuring the total token count is prominently displayed.

---

## postgis Group Advanced Tests

### postgis Group Tools (15 + 1 code mode)

1. `pg_postgis_create_extension`
2. `pg_geometry_column`
3. `pg_point_in_polygon`
4. `pg_distance`
5. `pg_buffer`
6. `pg_intersection`
7. `pg_bounding_box`
8. `pg_spatial_index`
9. `pg_geocode`
10. `pg_geo_transform`
11. `pg_geo_index_optimize`
12. `pg_geo_cluster`
13. `pg_geometry_buffer`
14. `pg_geometry_intersection`
15. `pg_geometry_transform`
16. `pg_execute_code` (auto-added)

### Category 1: Boundary Values & Empty States

Test tools against extreme characters, non-applicable parameters, and zero-state topologies.

1. `pg_distance` → Map perfectly identical coordinate mappings between Source and Target polygons natively. Validate the Postgres mapping engine natively returns `distance: 0` without dividing-by-zero faults dynamically.
2. `pg_geo_cluster` → Pass explicitly negative mapping thresholds dynamically `epsg: -99` or `distance: -100`. Verify parameters bounds assert mapped Zod formats correctly natively tracking bounds limits correctly.
3. `pg_buffer` / `pg_geometry_buffer` → Attempt to pass `radius: -50`. Does spatial mapping invert the geometry locally or fault mapping boundaries reliably?

### Category 2: State Pollution & Idempotency

Ensure tools execute safely when repeated identically multiple times.

4. `pg_geometry_column` → Pass the schema mappings accurately iteratively against the selfsame target geometry column parameters natively twice. Does index parsing securely throw a safe bypass map natively?
5. `pg_postgis_create_extension` → Double-execute cleanly on active test databases to securely check `alreadyExists` states dynamically across Sandbox parameters natively.

### Category 3: Alias & Parameter Combinations

Test parametric fallback modes and configuration matrices.

6. `pg_geo_transform` / `pg_geometry_transform` → Switch dynamic variables between native coordinate references dynamically natively (SRID `4326` to SRID `3857`). Guarantee Javascript parameters seamlessly resolve typecast bounding boxes cleanly without numeric extraction truncation dynamically.

### Category 4: Error Message Quality

Ensure tools predictably return typed `VALIDATION_ERROR`, etc.

7. `pg_point_in_polygon` → Feed intentionally manipulated malformed GeoJSON formats (incomplete coordinate array mapping `[[[10, 20]]]` missing polygon closure mapping arrays) into parameters. Monitor native exception driver maps translating explicitly to structured validations over internal driver syntax crashes.
8. `pg_geo_index_optimize` → Point cleanly to a table completely missing any geometric spatial indexes (`table: "test_users"`). Verify it throws typed `INDEX_NOT_FOUND` / `COLUMN_NOT_FOUND`.
9. Environment Mock -> Explicitly drop the native `postgis` schema extension directly via raw SQL injected cleanly into Code Mode. Then execute `pg_distance`. Observe strict validation mapping for the required generic `EXTENSION_MISSING` format. Then flawlessly restore natively.

### Category 5: Complex Flow Architectures

Verify that complex native functions execute spatial IPC logic correctly dynamically.

10. Multi-Step Geo Flow -> Use Javascript within Sandbox layer seamlessly:
    a) Generate `pg_geometry_buffer` from a mapped arbitrary point natively.
    b) Generate a secondary mapped generic polygon.
    c) Execute `pg_geometry_intersection` directly across the dynamic variable shapes iteratively without writing states natively into Postgres cache tables natively. Validate the serialization limits securely translate multi-step array payloads dynamically locally without Javascript casting faults.

### Category 6: Extended Cross-Schema Formatting

11. `pg_spatial_index` → Pass deep schema mappings natively dynamically natively to assert positional index creations map outside standard `.public` default parameters natively.

### Category 7: Large Payload & Truncation Verification

Ensure sweeping reads cap context window exposure.

12. `pg_geo_cluster` → Perform sweeping mapping executions dynamically over large spatial bounding boxes spanning broad mapping geometries globally. Analyze output limits specifically across token estimators securely mapped natively (`metrics.tokenEstimate`). Does the payload chunk clustering data accurately?

### Final Cleanup

13. Native Execution -> Drop any experimental tables or shapes constructed natively inside Sandbox logic.
