/**
 * postgres-mcp - PostGIS Tool Schemas
 *
 * Input validation schemas for geospatial operations.
 * Supports parameter smoothing: tableName -> table, point property aliases
 *
 * Pattern: Export Base schemas for MCP visibility + Transformed schemas for handler validation.
 */

import { z } from "zod";

import {
  preprocessPostgisParams,
  preprocessPoint,
  convertToMeters,
  PointSchemaBase,
} from "./utils.js";


// =============================================================================
// pg_geometry_column
// =============================================================================
export const GeometryColumnSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  column: z.string().optional().describe("Column name for the geometry"),
  geom: z.string().optional().describe("Alias for column"),
  geometryColumn: z.string().optional().describe("Alias for column"),
  srid: z
    .number()
    .optional()
    .describe("Spatial Reference ID (default: 4326 for WGS84)"),
  type: z
    .enum([
      "POINT",
      "LINESTRING",
      "POLYGON",
      "MULTIPOINT",
      "MULTILINESTRING",
      "MULTIPOLYGON",
      "GEOMETRY",
    ])
    .optional(),
  schema: z.string().optional(),
  ifNotExists: z
    .boolean()
    .optional()
    .describe(
      "Skip if column already exists (returns { alreadyExists: true })",
    ),
});

export const GeometryColumnSchema = z
  .preprocess(preprocessPostgisParams, GeometryColumnSchemaBase)
  .transform((data) => ({
    table: data.table ?? data.tableName ?? "",
    column: data.column ?? data.geom ?? data.geometryColumn ?? "",
    srid: data.srid,
    type: data.type,
    schema: data.schema,
    ifNotExists: data.ifNotExists,
  }))
  .refine((data) => data.table !== "", {
    message: "table (or tableName alias) is required",
  })
  .refine((data) => data.column !== "", {
    message: "column (or geom/geometryColumn alias) is required",
  });

// =============================================================================
// pg_distance (GeometryDistance)
// =============================================================================
export const GeometryDistanceSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  column: z.string().optional().describe("Geometry column"),
  geom: z.string().optional().describe("Alias for column"),
  geometry: z.string().optional().describe("Alias for column"),
  geometryColumn: z.string().optional().describe("Alias for column"),
  point: PointSchemaBase.optional().describe(
    "Reference point (supports lat/lng, latitude/longitude, or x/y)",
  ),
  lat: z.number().optional().describe("Latitude (-90 to 90)"),
  latitude: z.number().optional().describe("Alias for lat"),
  lng: z.number().optional().describe("Longitude (-180 to 180)"),
  lon: z.number().optional().describe("Alias for lng"),
  longitude: z.number().optional().describe("Alias for lng"),
  x: z.number().optional().describe("X coordinate"),
  y: z.number().optional().describe("Y coordinate"),
  limit: z.number().optional().describe("Max results"),
  maxDistance: z
    .number()
    .optional()
    .describe("Max distance (in meters by default)"),
  radius: z.number().optional().describe("Alias for maxDistance"),
  distance: z.number().optional().describe("Alias for maxDistance"),
  unit: z
    .enum(["meters", "m", "kilometers", "km", "miles", "mi"])
    .optional()
    .describe("Distance unit (default: meters)"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

export const GeometryDistanceSchema = z
  .preprocess(preprocessPostgisParams, GeometryDistanceSchemaBase)
  .transform((data) => {
    const point = preprocessPoint(data.point);
    const rawDistance = data.maxDistance ?? data.radius ?? data.distance;
    return {
      table: data.table ?? data.tableName ?? "",
      column:
        data.column ?? data.geom ?? data.geometry ?? data.geometryColumn ?? "",
      point: point ?? { lat: 0, lng: 0 },
      limit: data.limit,
      maxDistance:
        rawDistance !== undefined
          ? convertToMeters(rawDistance, data.unit)
          : undefined,
      unit: data.unit,
      schema: data.schema,
    };
  })
  .refine((data) => data.table !== "", {
    message: "table (or tableName alias) is required",
  })
  .refine((data) => data.column !== "", {
    message: "column (or geom/geometry/geometryColumn alias) is required",
  })
  .refine((data) => data.maxDistance === undefined || data.maxDistance >= 0, {
    message: "distance must be a non-negative number",
  });

// =============================================================================
// pg_point_in_polygon
// =============================================================================
export const PointInPolygonSchemaBase = z.object({
  table: z.string().optional().describe("Table with polygons"),
  tableName: z.string().optional().describe("Alias for table"),
  column: z.string().optional().describe("Geometry column"),
  geom: z.string().optional().describe("Alias for column"),
  geometry: z.string().optional().describe("Alias for column"),
  geometryColumn: z.string().optional().describe("Alias for column"),
  point: PointSchemaBase.optional().describe(
    "Point to check (supports lat/lng, latitude/longitude, or x/y)",
  ),
  lat: z.number().optional().describe("Latitude (-90 to 90)"),
  latitude: z.number().optional().describe("Alias for lat"),
  lng: z.number().optional().describe("Longitude (-180 to 180)"),
  lon: z.number().optional().describe("Alias for lng"),
  longitude: z.number().optional().describe("Alias for lng"),
  x: z.number().optional().describe("X coordinate"),
  y: z.number().optional().describe("Y coordinate"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

export const PointInPolygonSchema = z
  .preprocess(preprocessPostgisParams, PointInPolygonSchemaBase)
  .transform((data) => {
    const point = preprocessPoint(data.point);
    return {
      table: data.table ?? data.tableName ?? "",
      column:
        data.column ?? data.geom ?? data.geometry ?? data.geometryColumn ?? "",
      point: point ?? { lat: 0, lng: 0 },
      schema: data.schema,
    };
  })
  .refine((data) => data.table !== "", {
    message: "table (or tableName alias) is required",
  })
  .refine((data) => data.column !== "", {
    message: "column (or geom/geometry/geometryColumn alias) is required",
  });

// =============================================================================
// pg_spatial_index
// =============================================================================
export const SpatialIndexSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  column: z.string().optional().describe("Geometry column"),
  geom: z.string().optional().describe("Alias for column"),
  geometry: z.string().optional().describe("Alias for column"),
  geometryColumn: z.string().optional().describe("Alias for column"),
  name: z.string().optional().describe("Index name"),
  indexName: z.string().optional().describe("Alias for name"),
  ifNotExists: z
    .boolean()
    .optional()
    .describe("Skip if index already exists (returns { alreadyExists: true })"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

export const SpatialIndexSchema = z
  .preprocess(preprocessPostgisParams, SpatialIndexSchemaBase)
  .transform((data) => ({
    table: data.table ?? data.tableName ?? "",
    column:
      data.column ?? data.geom ?? data.geometry ?? data.geometryColumn ?? "",
    name: data.name ?? data.indexName,
    ifNotExists: data.ifNotExists,
    schema: data.schema,
  }))
  .refine((data) => data.table !== "", {
    message: "table (or tableName alias) is required",
  })
  .refine((data) => data.column !== "", {
    message: "column (or geom/geometry/geometryColumn alias) is required",
  });

// =============================================================================
// pg_buffer
// =============================================================================
export const BufferSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  column: z.string().optional().describe("Geometry column"),
  geom: z.string().optional().describe("Alias for column"),
  geometryColumn: z.string().optional().describe("Alias for column"),
  distance: z
    .number()
    .optional()
    .describe("Buffer distance (in meters by default)"),
  meters: z.number().optional().describe("Alias for distance"),
  radius: z.number().optional().describe("Alias for distance"),
  unit: z
    .enum(["meters", "m", "kilometers", "km", "miles", "mi"])
    .optional()
    .describe("Distance unit (default: meters)"),
  simplify: z
    .number()
    .optional()
    .describe(
      "Simplification tolerance in meters (default: 10). Higher values = fewer points. Set to 0 to disable.",
    ),
  limit: z
    .number()
    .optional()
    .describe("Maximum rows to return (default: 50 to prevent large payloads)"),
  where: z.string().optional(),
});

export const BufferSchema = z
  .preprocess(preprocessPostgisParams, BufferSchemaBase)
  .transform((data) => {
    const rawDistance = data.distance ?? data.meters ?? data.radius ?? 0;
    return {
      table: data.table ?? data.tableName ?? "",
      schema: data.schema,
      column: data.column ?? data.geom ?? data.geometryColumn ?? "",
      distance: convertToMeters(rawDistance, data.unit),
      unit: data.unit,
      simplify:
        data.simplify !== undefined
          ? convertToMeters(data.simplify, data.unit)
          : undefined,
      limit: data.limit,
      where: data.where,
    };
  })
  .refine((data) => data.table !== "", {
    message: "table (or tableName alias) is required",
  })
  .refine((data) => data.column !== "", {
    message: "column (or geom/geometryColumn alias) is required",
  })
  .refine((data) => data.distance > 0, {
    message:
      "distance (or radius/meters alias) is required and must be positive",
  })
  .refine((data) => data.simplify === undefined || data.simplify >= 0, {
    message:
      "simplify must be a non-negative number if provided (0 to disable)",
  });

// =============================================================================
// pg_intersection
// =============================================================================

/**
 * Preprocess intersection params:
 * - Handles postgis params (table/schema parsing)
 * - Converts geometry objects to JSON strings (for GeoJSON object support)
 */
function preprocessIntersectionParams(input: unknown): unknown {
  // First apply standard postgis preprocessing
  const processed = preprocessPostgisParams(input);

  if (typeof processed !== "object" || processed === null) {
    return processed;
  }

  const result = { ...(processed as Record<string, unknown>) };

  // Convert geometry object to JSON string if needed
  if (
    typeof result["geometry"] === "object" &&
    result["geometry"] !== null &&
    !Array.isArray(result["geometry"])
  ) {
    result["geometry"] = JSON.stringify(result["geometry"]);
  }

  return result;
}

export const IntersectionSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  column: z.string().optional().describe("Geometry column"),
  geom: z.string().optional().describe("Alias for column"),
  geometryColumn: z.string().optional().describe("Alias for column"),
  geometry: z
    .union([z.string(), z.record(z.string(), z.unknown())])
    .optional()
    .describe(
      'GeoJSON or WKT geometry to check intersection (e.g., "POINT(0 0)" or GeoJSON object)',
    ),
  srid: z
    .number()
    .optional()
    .describe(
      "SRID for input geometry (auto-detected from column if not provided)",
    ),
  select: z.array(z.string()).optional().describe("Columns to select"),
});

export const IntersectionSchema = z
  .preprocess(preprocessIntersectionParams, IntersectionSchemaBase)
  .transform((data) => {
    // Ensure geometry is a string (preprocessor should have converted objects)
    const geometry =
      typeof data.geometry === "object"
        ? JSON.stringify(data.geometry)
        : (data.geometry ?? "");
    return {
      table: data.table ?? data.tableName ?? "",
      schema: data.schema,
      column: data.column ?? data.geom ?? data.geometryColumn ?? "",
      geometry,
      srid: data.srid,
      select: data.select,
    };
  })
  .refine((data) => data.table !== "", {
    message: "table (or tableName alias) is required",
  })
  .refine((data) => data.column !== "", {
    message: "column (or geom/geometryColumn alias) is required",
  })
  .refine((data) => data.geometry !== "", {
    message:
      "geometry is required (WKT like 'POINT(0 0)' or GeoJSON string/object)",
  });

// =============================================================================
// pg_bounding_box
// =============================================================================
export const BoundingBoxSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  column: z.string().optional().describe("Geometry column"),
  geom: z.string().optional().describe("Alias for column"),
  geometryColumn: z.string().optional().describe("Alias for column"),
  minLng: z.number().optional().describe("Minimum longitude"),
  minLat: z.number().optional().describe("Minimum latitude"),
  maxLng: z.number().optional().describe("Maximum longitude"),
  maxLat: z.number().optional().describe("Maximum latitude"),
  select: z.array(z.string()).optional().describe("Columns to select"),
});

export const BoundingBoxSchema = z
  .preprocess(preprocessPostgisParams, BoundingBoxSchemaBase)
  .transform((data) => ({
    table: data.table ?? data.tableName ?? "",
    schema: data.schema,
    column: data.column ?? data.geom ?? data.geometryColumn ?? "",
    minLng: data.minLng,
    minLat: data.minLat,
    maxLng: data.maxLng,
    maxLat: data.maxLat,
    select: data.select,
  }))
  .refine((data) => data.table !== "", {
    message: "table (or tableName alias) is required",
  })
  .refine((data) => data.column !== "", {
    message: "column (or geom/geometryColumn alias) is required",
  })
  .refine((data) => data.minLng !== undefined, {
    message: "minLng is required",
  })
  .refine((data) => data.minLat !== undefined, {
    message: "minLat is required",
  })
  .refine((data) => data.maxLng !== undefined, {
    message: "maxLng is required",
  })
  .refine((data) => data.maxLat !== undefined, {
    message: "maxLat is required",
  });

// =============================================================================
// pg_geocode
// =============================================================================
export const GeocodeSchemaBase = z.object({
  lat: z.number().optional().describe("Latitude (-90 to 90)"),
  latitude: z.number().optional().describe("Alias for lat"),
  lng: z.number().optional().describe("Longitude (-180 to 180)"),
  lon: z.number().optional().describe("Alias for lng"),
  longitude: z.number().optional().describe("Alias for lng"),
  srid: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Spatial Reference ID for output geometry (default: 4326)"),
});

/**
 * Preprocess geocode point to support aliases
 */
function preprocessGeocodeParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  const p = input as Record<string, unknown>;
  const result = { ...p };

  if (result["latitude"] !== undefined && result["lat"] === undefined) {
    result["lat"] = result["latitude"];
  }
  if (
    (result["lon"] !== undefined || result["longitude"] !== undefined) &&
    result["lng"] === undefined
  ) {
    result["lng"] = result["lon"] ?? result["longitude"];
  }

  return result;
}

export const GeocodeSchema = z
  .preprocess(preprocessGeocodeParams, GeocodeSchemaBase)
  .transform((data) => ({
    lat: data.lat ?? data.latitude,
    lng: data.lng ?? data.lon ?? data.longitude,
    srid: data.srid,
  }))
  .refine((data) => data.lat !== undefined, {
    message: "lat (or latitude alias) is required",
  })
  .refine((data) => data.lng !== undefined, {
    message: "lng (or lon/longitude alias) is required",
  })
  .refine(
    (data) => data.lat === undefined || (data.lat >= -90 && data.lat <= 90),
    {
      message: "lat must be between -90 and 90 degrees",
    },
  )
  .refine(
    (data) => data.lng === undefined || (data.lng >= -180 && data.lng <= 180),
    {
      message: "lng must be between -180 and 180 degrees",
    },
  );

// =============================================================================
// pg_geo_transform
