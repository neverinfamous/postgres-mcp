# PostGIS Tools

**Geometry Creation:**

- `pg_geocode`: Create point geometry from lat/lng. Returns `{geojson, wkt}`. ⚠️ Validates bounds: lat ±90°, lng ±180°
- `pg_geometry_column`: Add geometry column to table. `ifNotExists` returns `{alreadyExists: true}`
- `pg_spatial_index`: Create GiST spatial index. Auto-generates name if not provided. `ifNotExists` supported

**Spatial Queries:**

- `pg_distance`: Find geometries within distance from point. Returns `{results, count}` with `distance_meters`. ⚠️ Validates point bounds
- `pg_bounding_box`: Find geometries within lat/lng bounding box. Use `select` array for specific columns
- `pg_intersection`: Find geometries intersecting a WKT/GeoJSON geometry. Auto-detects SRID from column
- `pg_point_in_polygon`: Check if point is within table polygons. Returns `{containingPolygons, count}`. ⚠️ Validates point bounds. Returns `warning` field if column contains non-POLYGON geometry (e.g., POINT)

**Geometry Operations (Table-based):**

- `pg_buffer`: Create buffer zone around table geometries. Default limit: 10 rows. Default simplify: 10m (set `simplify: 0` to disable). Returns `truncated: true` + `totalCount` when results are truncated. Use `limit: 0` for all rows
- `pg_geo_transform`: Transform table geometries between SRIDs. Default limit: 10 rows. Returns `truncated: true` + `totalCount` when results are truncated. Use `limit: 0` for all rows. Auto-detects `fromSrid` from column metadata if not provided (returns `autoDetectedSrid: true`). `fromSrid`/`sourceSrid` and `toSrid`/`targetSrid` aliases
- `pg_geo_cluster`: Spatial clustering (DBSCAN/K-Means). K-Means: If `numClusters` exceeds row count, automatically clamps to available rows with `warning` field. DBSCAN: Returns contextual `hints` array explaining parameter effects (e.g., "All points formed single cluster—decrease eps") and `parameterGuide` explaining eps/minPoints trade-offs

**Geometry Operations (Standalone WKT/GeoJSON):**

- `pg_geometry_buffer`: Create buffer around WKT/GeoJSON. Returns `{buffer_geojson, buffer_wkt, distance_meters}`. Optional `simplify` param (meters) reduces polygon complexity—returns `simplified`, `simplifyTolerance` when applied. ⚠️ Returns `warning` if simplify tolerance is too high and geometry collapses to null
- `pg_geometry_transform`: Transform WKT/GeoJSON between SRIDs. Returns `{transformed_geojson, transformed_wkt, fromSrid, toSrid}`
- `pg_geometry_intersection`: Compute intersection of two geometries. Returns `{intersects, intersection_geojson, intersection_area_sqm}`. Normalizes SRID (4326) automatically—safe to mix GeoJSON and WKT

**Administration:**

- `pg_postgis_create_extension`: Enable PostGIS extension (idempotent). Returns `{alreadyExists: true}` when already installed
- `pg_geo_index_optimize`: Analyze spatial indexes. Without `table` param, analyzes all spatial indexes. Returns structured error (`TABLE_NOT_FOUND`) if specified table has no spatial columns or indexes

**Code Mode Aliases:** `pg.postgis.addColumn()` → `geometryColumn`, `pg.postgis.indexOptimize()` → `geoIndexOptimize`, `pg.postgis.geoCluster()` → `pg_geo_cluster`, `pg.postgis.geoTransform()` → `pg_geo_transform`. Note: `pg.{group}.help()` returns `{methods, methodAliases, examples}`
