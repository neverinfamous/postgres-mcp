# postgis Tool Group Certification Matrix

## Strict Coverage Matrix

| Tool | Direct Call (Happy Path) | Domain Error (Direct Call) | Zod Empty Param (Direct) | Alias Acceptance |
|------|-------------------------|----------------------------|--------------------------|-------------------|
| `pg_postgis_create_extension` | ✅ | N/A | ✅ | N/A |
| `pg_geometry_column` | ✅ | ✅ | ✅ | ✅ (tableName, geom) |
| `pg_point_in_polygon` | ✅ | ✅ | ✅ | ✅ (tableName, geom) |
| `pg_distance` | ✅ | ✅ | ✅ | ✅ (radius, distance alias default) |
| `pg_buffer` | ✅ | ✅ | ✅ | ✅ (tableName, radius, meters) |
| `pg_intersection` | ✅ | ✅ | ✅ | ✅ (tableName) |
| `pg_bounding_box` | ✅ | ✅ | ✅ | ✅ (tableName) |
| `pg_spatial_index` | ✅ | ✅ | ✅ | ✅ (indexName) |
| `pg_geocode` | ✅ | N/A | ✅ | ✅ (latitude, longitude) |
| `pg_geo_transform` | ✅ | ✅ | ✅ | ✅ (tableName, targetSrid) |
| `pg_geo_index_optimize` | ✅ | N/A (tested valid) | ✅ (if params) | N/A |
| `pg_geo_cluster` | ✅ | ✅ | ✅ | ✅ (clusters, k) |
| `pg_geometry_buffer` | ✅ | N/A | ✅ | ✅ (meters, radius) |
| `pg_geometry_intersection` | ✅ | N/A | ✅ | N/A |
| `pg_geometry_transform`| ✅ | N/A | ✅ | ✅ (sourceSrid, targetSrid) |

*(Note: N/A indicates either the tool does not operate on an arbitrary table (Domain Error) or does not have alias bindings listed).*

## Issues Remedied

1. **pg_spatial_index Logic Bug (❌ Bug)**: Calling `pg_spatial_index` on a nonexistent table with an index name that happened to exist somewhere else in the schema incorrectly returned `alreadyExists: true` because it failed to constrain the `pg_indexes` check by `tablename`. It also ran the `pg_indexes` check *before* verifying the table existed. We swapped the order to perform the strict `TABLE_NOT_FOUND` check first and added the `AND tablename` constraint.
2. **Payload Redundancy (📦 Payload)**: Tools like `pg_geometry_buffer`, `pg_geometry_intersection`, `pg_geometry_transform`, and `pg_geocode` return BOTH `geojson` and `wkt` formats in a single payload. This effectively doubles the token size of the geometry representation. For `pg_geometry_buffer`, a buffer is relatively large natively, driving token count to over ~500 for a single shape.
   - *Optimization Hint*: Introduce a `format` parameter (e.g. `format: "geojson" | "wkt"`) defaulting to `geojson`, or truncate redundant representations from the default output.
3. **pg_buffer Array Scaling (📦 Payload)**: The `pg_buffer` tool returns both tabular properties and full `buffer_geojson` polygon strings per row. A table with heavily unsimplified features might overwhelm context despite the limit.
   - *Optimization Hint*: The `simplify` parameter defaults to `10`, which effectively caps circle points at 32 coordinates. This was sufficient for keeping test limits under ~1300 tokens for 25 points, but complex native polygon buffers may still need higher simplification or a lower default limit (e.g. 10 instead of 50).
