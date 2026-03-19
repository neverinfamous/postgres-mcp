/**
 * postgres-mcp - PostGIS Advanced Schemas
 *
 * Advanced geospatial operation schemas: transform, cluster, standalone geometry.
 */

import { z } from "zod";

import { preprocessPostgisParams, convertToMeters } from "./utils.js";

// =============================================================================
// pg_geo_transform
// =============================================================================
export const GeoTransformSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  column: z.string().optional().describe("Geometry column"),
  geom: z.string().optional().describe("Alias for column"),
  geometryColumn: z.string().optional().describe("Alias for column"),
  fromSrid: z.number().optional().describe("Source SRID"),
  sourceSrid: z.number().optional().describe("Alias for fromSrid"),
  toSrid: z.number().optional().describe("Target SRID"),
  targetSrid: z.number().optional().describe("Alias for toSrid"),
  where: z.string().optional().describe("Filter condition"),
  limit: z.number().optional().describe("Maximum rows to return"),
});

export const GeoTransformSchema = z
  .preprocess(preprocessPostgisParams, GeoTransformSchemaBase)
  .transform((data) => ({
    table: data.table ?? data.tableName ?? "",
    schema: data.schema,
    column: data.column ?? data.geom ?? data.geometryColumn ?? "",
    fromSrid: data.fromSrid ?? data.sourceSrid ?? 0,
    toSrid: data.toSrid ?? data.targetSrid ?? 0,
    where: data.where,
    limit: data.limit,
  }))
  .refine((data) => data.table !== "", {
    message: "table (or tableName alias) is required",
  })
  .refine((data) => data.column !== "", {
    message: "column (or geom/geometryColumn alias) is required",
  })
  .refine((data) => data.toSrid > 0, {
    message: "toSrid (or targetSrid alias) is required",
  });

// =============================================================================
// pg_geo_cluster
// =============================================================================
export const GeoClusterSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  column: z.string().optional().describe("Geometry column name"),
  geom: z.string().optional().describe("Alias for column"),
  geometryColumn: z.string().optional().describe("Alias for column"),
  method: z
    .enum(["dbscan", "kmeans"])
    .optional()
    .describe("Clustering method (default: dbscan)"),
  algorithm: z
    .enum(["dbscan", "kmeans"])
    .optional()
    .describe("Alias for method"),
  eps: z.number().optional().describe("DBSCAN: Distance threshold"),
  minPoints: z
    .number()
    .optional()
    .describe("DBSCAN: Minimum points per cluster"),
  numClusters: z.number().optional().describe("K-Means: Number of clusters"),
  k: z.number().optional().describe("Alias for numClusters"),
  clusters: z.number().optional().describe("Alias for numClusters"),
  params: z
    .object({
      eps: z.number().optional(),
      minPoints: z.number().optional(),
      numClusters: z.number().optional(),
      k: z.number().optional(),
    })
    .optional()
    .describe("Algorithm parameters object (top-level params take precedence)"),
  where: z.string().optional().describe("WHERE clause filter"),
  limit: z.number().optional(),
});

export const GeoClusterSchema = z
  .preprocess(preprocessPostgisParams, GeoClusterSchemaBase)
  .transform((data) => {
    const paramsObj = data.params ?? {};
    return {
      table: data.table ?? data.tableName ?? "",
      schema: data.schema,
      column: data.column ?? data.geom ?? data.geometryColumn ?? "",
      method: data.method ?? data.algorithm,
      eps: data.eps ?? paramsObj.eps,
      minPoints: data.minPoints ?? paramsObj.minPoints,
      numClusters:
        data.numClusters ??
        data.k ??
        data.clusters ??
        paramsObj.numClusters ??
        paramsObj.k,
      where: data.where,
      limit: data.limit,
    };
  })
  .refine((data) => data.table !== "", {
    message: "table (or tableName alias) is required",
  })
  .refine((data) => data.column !== "", {
    message: "column (or geom/geometryColumn alias) is required",
  });

// =============================================================================
// Standalone Geometry Tools
// =============================================================================

// pg_geometry_buffer
export const GeometryBufferSchemaBase = z.object({
  geometry: z.string().optional().describe("WKT or GeoJSON geometry string"),
  wkt: z.string().optional().describe("Alias for geometry (WKT format)"),
  geojson: z
    .string()
    .optional()
    .describe("Alias for geometry (GeoJSON format)"),
  distance: z
    .number()
    .optional()
    .describe("Buffer distance (in meters by default)"),
  radius: z.number().optional().describe("Alias for distance"),
  meters: z.number().optional().describe("Alias for distance"),
  unit: z
    .enum(["meters", "m", "kilometers", "km", "miles", "mi"])
    .optional()
    .describe("Distance unit (default: meters)"),
  simplify: z
    .number()
    .optional()
    .describe(
      "Simplification tolerance in meters (default: none). Higher values = fewer points. Set to reduce payload size.",
    ),
  srid: z
    .number()
    .optional()
    .describe("Spatial Reference ID (default: 4326 for WGS84)"),
});

export const GeometryBufferSchema = GeometryBufferSchemaBase.transform(
  (data) => {
    const rawDistance = data.distance ?? data.radius ?? data.meters ?? 0;
    return {
      geometry: data.geometry ?? data.wkt ?? data.geojson ?? "",
      distance: convertToMeters(rawDistance, data.unit),
      unit: data.unit,
      simplify:
        data.simplify !== undefined
          ? convertToMeters(data.simplify, data.unit)
          : undefined,
      srid: data.srid,
    };
  },
)
  .refine((data) => data.geometry !== "", {
    message: "geometry (or wkt/geojson alias) is required",
  })
  .refine((data) => data.distance > 0, {
    message:
      "distance (or radius/meters alias) is required and must be positive",
  })
  .refine((data) => data.simplify === undefined || data.simplify >= 0, {
    message: "simplify must be a non-negative number if provided",
  });

// pg_geometry_intersection
export const GeometryIntersectionSchemaBase = z.object({
  geometry1: z.string().describe("First WKT or GeoJSON geometry"),
  geometry2: z.string().describe("Second WKT or GeoJSON geometry"),
});

export const GeometryIntersectionSchema = GeometryIntersectionSchemaBase;

// pg_geometry_transform
export const GeometryTransformSchemaBase = z.object({
  geometry: z.string().optional().describe("WKT or GeoJSON geometry string"),
  wkt: z.string().optional().describe("Alias for geometry"),
  geojson: z.string().optional().describe("Alias for geometry"),
  fromSrid: z
    .number()
    .optional()
    .describe("Source SRID (e.g., 4326 for WGS84)"),
  sourceSrid: z.number().optional().describe("Alias for fromSrid"),
  toSrid: z
    .number()
    .optional()
    .describe("Target SRID (e.g., 3857 for Web Mercator)"),
  targetSrid: z.number().optional().describe("Alias for toSrid"),
});

export const GeometryTransformSchema = GeometryTransformSchemaBase.transform(
  (data) => ({
    geometry: data.geometry ?? data.wkt ?? data.geojson ?? "",
    fromSrid: data.fromSrid ?? data.sourceSrid ?? 0,
    toSrid: data.toSrid ?? data.targetSrid ?? 0,
  }),
)
  .refine((data) => data.geometry !== "", {
    message: "geometry (or wkt/geojson alias) is required",
  })
  .refine((data) => data.fromSrid > 0, {
    message: "fromSrid (or sourceSrid alias) is required",
  })
  .refine((data) => data.toSrid > 0, {
    message: "toSrid (or targetSrid alias) is required",
  });

