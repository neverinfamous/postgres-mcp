/**
 * postgres-mcp - PostGIS Output Schemas
 *
 * Output validation schemas for MCP 2025-11-25 structured content compliance.
 */

import { z } from "zod";

/**
 * Output schema for pg_postgis_create_extension
 */
export const PostgisCreateExtensionOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether extension was enabled"),
    message: z.string().optional().describe("Status message"),
  })
  .describe("PostGIS extension creation result");

/**
 * Output schema for pg_geometry_column
 */
export const GeometryColumnOutputSchema = z
  .object({
    success: z.boolean().describe("Whether operation succeeded"),
    table: z.string().optional().describe("Table name"),
    column: z.string().optional().describe("Column name"),
    srid: z.number().optional().describe("Spatial Reference ID"),
    type: z.string().optional().describe("Geometry type"),
    schema: z.string().optional().describe("Schema name"),
    alreadyExists: z.boolean().optional().describe("Column already existed"),
    error: z.string().optional().describe("Error message"),
    suggestion: z.string().optional().describe("Helpful suggestion"),
  })
  .describe("Geometry column addition result");

/**
 * Output schema for pg_point_in_polygon
 */
export const PointInPolygonOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether operation succeeded"),
    containingPolygons: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Polygons containing the point"),
    count: z.number().optional().describe("Number of containing polygons"),
    warning: z.string().optional().describe("Geometry type warning"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Point in polygon result");

/**
 * Output schema for pg_distance
 */
export const DistanceOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether operation succeeded"),
    results: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Nearby geometries with distances"),
    count: z.number().optional().describe("Number of results"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Distance search result");

/**
 * Output schema for pg_buffer (table-based)
 */
export const BufferOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether operation succeeded"),
    results: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Buffer results"),
    truncated: z.boolean().optional().describe("Results were truncated"),
    totalCount: z.number().optional().describe("Total available count"),
    limit: z.number().optional().describe("Applied limit"),
    simplified: z.boolean().optional().describe("Simplification applied"),
    simplifyTolerance: z
      .number()
      .optional()
      .describe("Simplification tolerance in meters"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Buffer zone result");

/**
 * Output schema for pg_intersection (table-based)
 */
export const IntersectionOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether operation succeeded"),
    intersecting: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Intersecting geometries"),
    count: z.number().optional().describe("Number of intersecting geometries"),
    sridUsed: z
      .union([z.number(), z.string()])
      .optional()
      .describe("SRID used for comparison"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Intersection search result");

/**
 * Output schema for pg_bounding_box
 */
export const BoundingBoxOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether operation succeeded"),
    results: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Geometries in bounding box"),
    count: z.number().optional().describe("Number of results"),
    note: z.string().optional().describe("Auto-correction note"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Bounding box search result");

/**
 * Output schema for pg_spatial_index
 */
export const SpatialIndexOutputSchema = z
  .object({
    success: z.boolean().describe("Whether index creation succeeded"),
    index: z.string().optional().describe("Index name"),
    table: z.string().optional().describe("Table name"),
    column: z.string().optional().describe("Column name"),
    schema: z.string().optional().describe("Schema name"),
    alreadyExists: z.boolean().optional().describe("Index already existed"),
    note: z.string().optional().describe("Additional note"),
    error: z.string().optional().describe("Error message"),
    suggestion: z.string().optional().describe("Helpful suggestion"),
  })
  .describe("Spatial index creation result");

/**
 * Output schema for pg_geocode
 */
export const GeocodeOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether operation succeeded"),
    geojson: z.string().optional().describe("Point as GeoJSON"),
    wkt: z.string().optional().describe("Point as WKT"),
    note: z.string().optional().describe("SRID note for non-4326"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Geocode result");

/**
 * Output schema for pg_geo_transform (table-based)
 */
export const GeoTransformOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether operation succeeded"),
    results: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Transformed geometries"),
    count: z.number().optional().describe("Number of results"),
    fromSrid: z.number().optional().describe("Source SRID"),
    toSrid: z.number().optional().describe("Target SRID"),
    truncated: z.boolean().optional().describe("Results were truncated"),
    totalCount: z.number().optional().describe("Total available count"),
    limit: z.number().optional().describe("Applied limit"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Geo transform result");

/**
 * Output schema for pg_geo_index_optimize
 */
export const GeoIndexOptimizeOutputSchema = z
  .object({
    spatialIndexes: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Spatial index statistics"),
    tableStats: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Table statistics"),
    recommendations: z
      .array(z.string())
      .optional()
      .describe("Optimization recommendations"),
    tips: z.array(z.string()).optional().describe("General tips"),
    warning: z.string().optional().describe("Warning message"),
    table: z.string().optional().describe("Table name (if specified)"),
    schema: z.string().optional().describe("Schema name"),
  })
  .describe("Geo index optimization result");

/**
 * Output schema for pg_geo_cluster
 */
export const GeoClusterOutputSchema = z
  .object({
    method: z.string().optional().describe("Clustering method used"),
    parameters: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Algorithm parameters"),
    summary: z
      .object({
        num_clusters: z.number().describe("Number of clusters"),
        noise_points: z.number().describe("Points not in clusters"),
        total_points: z.number().describe("Total points processed"),
      })
      .optional()
      .describe("Clustering summary"),
    clusters: z
      .array(
        z.object({
          cluster_id: z.number().nullable().describe("Cluster ID"),
          point_count: z.number().describe("Points in cluster"),
          centroid: z.string().optional().describe("Cluster centroid GeoJSON"),
          hull: z.string().optional().describe("Convex hull GeoJSON"),
        }),
      )
      .optional()
      .describe("Cluster details"),
    warning: z.string().optional().describe("Warning about K adjustment"),
    requestedClusters: z.number().optional().describe("Originally requested K"),
    actualClusters: z.number().optional().describe("Actual K used"),
    notes: z.string().optional().describe("Method-specific notes"),
    hints: z
      .array(z.string())
      .optional()
      .describe("Parameter adjustment hints"),
    parameterGuide: z
      .record(z.string(), z.string())
      .optional()
      .describe("Parameter explanations"),
    error: z.string().optional().describe("Error message"),
    table: z.string().optional().describe("Table name"),
    numClusters: z.number().optional().describe("Requested clusters"),
    rowCount: z.number().optional().describe("Available rows"),
    suggestion: z.string().optional().describe("Helpful suggestion"),
  })
  .describe("Geo clustering result");

/**
 * Output schema for pg_geometry_buffer (standalone)
 */
export const GeometryBufferOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether operation succeeded"),
    buffer_geojson: z
      .string()
      .nullable()
      .optional()
      .describe("Buffer as GeoJSON"),
    buffer_wkt: z.string().nullable().optional().describe("Buffer as WKT"),
    distance_meters: z
      .number()
      .optional()
      .describe("Buffer distance in meters"),
    srid: z.number().optional().describe("SRID used"),
    inputFormat: z.string().optional().describe("Input format (GeoJSON/WKT)"),
    simplified: z.boolean().optional().describe("Simplification applied"),
    simplifyTolerance: z
      .number()
      .optional()
      .describe("Simplification tolerance"),
    warning: z.string().optional().describe("Collapse warning"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Geometry buffer result");

/**
 * Output schema for pg_geometry_intersection (standalone)
 */
export const GeometryIntersectionOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether operation succeeded"),
    intersects: z.boolean().optional().describe("Whether geometries intersect"),
    intersection_geojson: z
      .string()
      .nullable()
      .optional()
      .describe("Intersection as GeoJSON"),
    intersection_wkt: z
      .string()
      .nullable()
      .optional()
      .describe("Intersection as WKT"),
    intersection_area_sqm: z
      .number()
      .nullable()
      .optional()
      .describe("Intersection area in sq meters"),
    geometry1Format: z.string().optional().describe("First geometry format"),
    geometry2Format: z.string().optional().describe("Second geometry format"),
    sridUsed: z.number().optional().describe("SRID used for comparison"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Geometry intersection result");

/**
 * Output schema for pg_geometry_transform (standalone)
 */
export const GeometryTransformOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether operation succeeded"),
    transformed_geojson: z
      .string()
      .optional()
      .describe("Transformed as GeoJSON"),
    transformed_wkt: z.string().optional().describe("Transformed as WKT"),
    fromSrid: z.number().optional().describe("Source SRID"),
    toSrid: z.number().optional().describe("Target SRID"),
    inputFormat: z.string().optional().describe("Input format (GeoJSON/WKT)"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Geometry transform result");
