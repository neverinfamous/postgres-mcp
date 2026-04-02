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

All tests should be executed via `pg_execute_code` code mode. Native direct tool calls are not to be used unless explicitly compared. State persists across sequential code mode logic inside a script.

## Test Database Schema

The test database (`postgres`) contains these tables:

| Table               | Rows | Key Columns                                                                        | JSONB Columns            | Tool Groups           |
| ----
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
