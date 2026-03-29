# PostGIS Tool Group Testing

## Deterministic Checklist
1. [x] Calculate distance between point 1 (New York) and point 2 (Los Angeles) in `test_locations`. Verified meters value and parameter alias mapping.
2. [x] Run `pg_buffer` at 100km on point 1. Verified GeoJSON truncation payload size and limit evaluation optimizations.
3. [x] Point in polygon (`pg_point_in_polygon`). Validated coordinates successfully process without unhandled JSON limits. 
4. [x] Validate coordinates intersect. Passed spatial queries and correctly returned 0 intersects on empty points.
5. [x] Bounding box retrieval. Passed.
6. [x] Geo transform `pg_geo_transform`. Transformed WGS84 coordinates into target SRID formats successfully.
7. [x] 🔴 Zod parameter bounds tests: Provided generic missing strings/table aliases incorrectly. Fired strict JSON schema assertions successfully isolating P154 domain boundaries. Missing canonical `code` and `category` fields isolated in manual `pg_geometry_column`, `pg_spatial_index`, and `pg_geo_transform` boundaries are fully refactored, resolving legacy schema existence regressions.
8. [x] 🔴 Provided numeric strings (e.g. `distance: "abc"`) into limits evaluating Zod string evaluations — returned strictly clamped internal parameters successfully preventing legacy MCP `-32602` SDK extraction halts natively.

## Strict Coverage Matrix: PostGIS Tool Group

| Tool | Happy Path | Domain Error | Zod Empty Param | Alias Acceptance |
|---|---|---|---|---|
| `pg_postgis_create_extension` | ✅ | N/A | ✅ | N/A |
| `pg_geometry_column` | ✅ | ✅ | ✅ | ✅ |
| `pg_point_in_polygon` | ✅ | ✅ | ✅ | ✅ |
| `pg_distance` | ✅ | ✅ | ✅ | ✅ |
| `pg_buffer` | ✅ | ✅ | ✅ | ✅ |
| `pg_intersection` | ✅ | ✅ | ✅ | ✅ |
| `pg_bounding_box` | ✅ | ✅ | ✅ | ✅ |
| `pg_spatial_index` | ✅ | ✅ | ✅ | ✅ |
| `pg_geocode` | ✅ | N/A | ✅ | ✅ |
| `pg_geo_transform` | ✅ | ✅ | ✅ | ✅ |
| `pg_geo_index_optimize` | ✅ | ✅ | ✅ | ✅ |
| `pg_geo_cluster` | ✅ | ✅ | ✅ | ✅ |
| `pg_geometry_buffer` | ✅ | N/A | ✅ | ✅ |
| `pg_geometry_intersection` | ✅ | N/A | ✅ | ✅ |
| `pg_geometry_transform` | ✅ | N/A | ✅ | ✅ |
