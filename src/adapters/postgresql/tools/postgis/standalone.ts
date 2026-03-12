/**
 * PostgreSQL PostGIS Extension Tools - Standalone Geometry Operations
 *
 * Tools for operating on geometry strings (WKT/GeoJSON) directly,
 * without requiring a table. These complement the table-based tools.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { ZodError } from "zod";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  GeometryBufferSchemaBase,
  GeometryBufferSchema,
  GeometryIntersectionSchemaBase,
  GeometryIntersectionSchema,
  GeometryTransformSchemaBase,
  GeometryTransformSchema,
  // Output schemas
  GeometryBufferOutputSchema,
  GeometryIntersectionOutputSchema,
  GeometryTransformOutputSchema,
} from "../../schemas/index.js";

/**
 * Detect if a geometry string is GeoJSON or WKT
 */
function parseGeometry(geometry: string): { sql: string; isGeoJson: boolean } {
  const trimmed = geometry.trim();
  const isGeoJson = trimmed.startsWith("{");
  return {
    sql: isGeoJson ? "ST_GeomFromGeoJSON($1)" : "ST_GeomFromText($1)",
    isGeoJson,
  };
}

/**
 * Parse geometry with explicit SRID normalization for intersection operations.
 * This ensures both GeoJSON (which has implicit SRID 4326) and WKT (no SRID)
 * use consistent coordinate systems.
 */
function parseGeometryWithSrid(
  geometry: string,
  srid = 4326,
): { sql: string; isGeoJson: boolean } {
  const trimmed = geometry.trim();
  const isGeoJson = trimmed.startsWith("{");
  // GeoJSON uses 4326 implicitly; WKT has no SRID. Normalize both.
  const baseExpr = isGeoJson ? "ST_GeomFromGeoJSON($1)" : "ST_GeomFromText($1)";
  return {
    sql: `ST_SetSRID(${baseExpr}, ${String(srid)})`,
    isGeoJson,
  };
}

/**
 * Create buffer around a standalone geometry
 */
export function createGeometryBufferTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_geometry_buffer",
    description:
      "Create a buffer zone around a WKT or GeoJSON geometry. Returns the buffered geometry as GeoJSON and WKT.",
    group: "postgis",
    inputSchema: GeometryBufferSchemaBase, // Base schema for MCP visibility
    outputSchema: GeometryBufferOutputSchema,
    annotations: readOnly("Geometry Buffer"),
    icons: getToolIcons("postgis", readOnly("Geometry Buffer")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { geometry, distance, srid, simplify } =
          GeometryBufferSchema.parse(params ?? {});
        const sridVal = srid ?? 4326;
        const { sql: geomExpr, isGeoJson } = parseGeometry(geometry);

        // Build buffer expression
        const bufferExpr = `ST_Buffer(ST_SetSRID(${geomExpr}, ${String(sridVal)})::geography, $2)::geometry`;

        // Apply optional simplification
        const outputExpr =
          simplify !== undefined && simplify > 0
            ? `ST_Simplify(${bufferExpr}, ${String(simplify / 111000)})` // Convert meters to degrees approx
            : bufferExpr;

        const sql = `
                SELECT 
                    ST_AsGeoJSON(${outputExpr}) as buffer_geojson,
                    ST_AsText(${outputExpr}) as buffer_wkt,
                    $2 as distance_meters,
                    ${String(sridVal)} as srid
            `;

        let result;
        try {
          result = await adapter.executeQuery(sql, [geometry, distance]);
        } catch (error: unknown) {
          return formatHandlerErrorResponse(error, {
              tool: "pg_geometry_buffer",
            });
        }
        const row = result.rows?.[0];
        const response: Record<string, unknown> = {
          ...row,
          inputFormat: isGeoJson ? "GeoJSON" : "WKT",
        };

        // Include simplification info if applied
        if (simplify !== undefined && simplify > 0) {
          response["simplified"] = true;
          response["simplifyTolerance"] = simplify;

          // Check if simplification caused geometry to collapse to null
          if (
            row?.["buffer_geojson"] === null ||
            row?.["buffer_wkt"] === null
          ) {
            response["warning"] =
              `Simplification tolerance (${String(simplify)}m) is too high relative to buffer distance (${String(distance)}m). The geometry collapsed to null. Reduce simplify value or set simplify: 0 to disable.`;
          }
        }

        return response;
      } catch (error: unknown) {
        if (error instanceof ZodError) {
          return {
            success: false as const,
            error: error.issues.map((i) => i.message).join("; "),
          };
        }
        return formatHandlerErrorResponse(error, {
            tool: "pg_geometry_buffer",
          });
      }
    },
  };
}

/**
 * Compute intersection of two standalone geometries
 */
export function createGeometryIntersectionTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_geometry_intersection",
    description:
      "Compute the intersection of two WKT or GeoJSON geometries. Returns the intersection geometry and whether they intersect.",
    group: "postgis",
    inputSchema: GeometryIntersectionSchemaBase, // Base schema for MCP visibility
    outputSchema: GeometryIntersectionOutputSchema,
    annotations: readOnly("Geometry Intersection"),
    icons: getToolIcons("postgis", readOnly("Geometry Intersection")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { geometry1, geometry2 } = GeometryIntersectionSchema.parse(
          params ?? {},
        );
        // Use SRID-normalized parsing to prevent mixed SRID errors when combining
        // GeoJSON (implicit SRID 4326) with WKT (no SRID)
        const geom1 = parseGeometryWithSrid(geometry1);
        const geom2 = parseGeometryWithSrid(geometry2);

        // geom1 uses $1 (first parameter), geom2 uses $2 (second parameter)
        const geom1Expr = geom1.sql;
        const geom2Expr = geom2.sql.replace("$1", "$2");

        const sql = `
                SELECT 
                    ST_Intersects(${geom1Expr}, ${geom2Expr}) as intersects,
                    ST_AsGeoJSON(ST_Intersection(${geom1Expr}, ${geom2Expr})) as intersection_geojson,
                    ST_AsText(ST_Intersection(${geom1Expr}, ${geom2Expr})) as intersection_wkt,
                    ST_Area(ST_Intersection(${geom1Expr}, ${geom2Expr})::geography) as intersection_area_sqm
            `;

        let result;
        try {
          result = await adapter.executeQuery(sql, [geometry1, geometry2]);
        } catch (error: unknown) {
          return formatHandlerErrorResponse(error, {
              tool: "pg_geometry_intersection",
            });
        }
        return {
          ...result.rows?.[0],
          geometry1Format: geom1.isGeoJson ? "GeoJSON" : "WKT",
          geometry2Format: geom2.isGeoJson ? "GeoJSON" : "WKT",
          sridUsed: 4326,
        };
      } catch (error: unknown) {
        if (error instanceof ZodError) {
          return {
            success: false as const,
            error: error.issues.map((i) => i.message).join("; "),
          };
        }
        return formatHandlerErrorResponse(error, {
            tool: "pg_geometry_intersection",
          });
      }
    },
  };
}

/**
 * Transform a standalone geometry between coordinate systems
 */
export function createGeometryTransformTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_geometry_transform",
    description:
      "Transform a WKT or GeoJSON geometry from one SRID to another. Common SRIDs: 4326 (WGS84/GPS), 3857 (Web Mercator).",
    group: "postgis",
    inputSchema: GeometryTransformSchemaBase, // Base schema for MCP visibility
    outputSchema: GeometryTransformOutputSchema,
    annotations: readOnly("Geometry Transform"),
    icons: getToolIcons("postgis", readOnly("Geometry Transform")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { geometry, fromSrid, toSrid } = GeometryTransformSchema.parse(
          params ?? {},
        );
        const { sql: geomExpr, isGeoJson } = parseGeometry(geometry);

        const sql = `
                SELECT 
                    ST_AsGeoJSON(ST_Transform(ST_SetSRID(${geomExpr}, ${String(fromSrid)}), ${String(toSrid)})) as transformed_geojson,
                    ST_AsText(ST_Transform(ST_SetSRID(${geomExpr}, ${String(fromSrid)}), ${String(toSrid)})) as transformed_wkt
            `;

        let result;
        try {
          result = await adapter.executeQuery(sql, [geometry]);
        } catch (error: unknown) {
          return formatHandlerErrorResponse(error, {
              tool: "pg_geometry_transform",
            });
        }
        return {
          ...result.rows?.[0],
          fromSrid,
          toSrid,
          inputFormat: isGeoJson ? "GeoJSON" : "WKT",
        };
      } catch (error: unknown) {
        if (error instanceof ZodError) {
          return {
            success: false as const,
            error: error.issues.map((i) => i.message).join("; "),
          };
        }
        return formatHandlerErrorResponse(error, {
            tool: "pg_geometry_transform",
          });
      }
    },
  };
}
