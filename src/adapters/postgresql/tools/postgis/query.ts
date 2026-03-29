/**
 * PostgreSQL PostGIS Extension Tools - Spatial Queries
 *
 * Read-only spatial query tools: point-in-polygon, distance, buffer, intersection, bounding-box.
 * 5 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import {
  type ToolDefinition,
  type RequestContext,
  ValidationError,
  QueryError,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  sanitizeIdentifier,
  sanitizeTableName,
} from "../../../../utils/identifiers.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import {
  GeometryDistanceSchemaBase,
  GeometryDistanceSchema,
  PointInPolygonSchemaBase,
  PointInPolygonSchema,
  BufferSchemaBase,
  BufferSchema,
  IntersectionSchemaBase,
  IntersectionSchema,
  BoundingBoxSchemaBase,
  BoundingBoxSchema,
  // Output schemas
  PointInPolygonOutputSchema,
  DistanceOutputSchema,
  BufferOutputSchema,
  IntersectionOutputSchema,
  BoundingBoxOutputSchema,
} from "../../schemas/index.js";

export function createPointInPolygonTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_point_in_polygon",
    description:
      "Check if a point is within any polygon in a table. The geometry column should contain POLYGON or MULTIPOLYGON geometries.",
    group: "postgis",
    inputSchema: PointInPolygonSchemaBase, // Base schema for MCP visibility
    outputSchema: PointInPolygonOutputSchema,
    annotations: readOnly("Point in Polygon"),
    icons: getToolIcons("postgis", readOnly("Point in Polygon")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { table, column, point, schema } = PointInPolygonSchema.parse(
          params ?? {},
        );
        const schemaName = schema ?? "public";
        const tableName = sanitizeTableName(
          table,
          schemaName !== "public" ? schemaName : undefined,
        );
        const columnName = sanitizeIdentifier(column);

        // Check geometry type and warn if not polygon
        const typeCheckSql = `SELECT DISTINCT GeometryType(${columnName}) as geom_type FROM ${tableName} WHERE ${columnName} IS NOT NULL LIMIT 1`;
        const typeResult = await adapter.executeQuery(typeCheckSql);
        const geomType = typeResult.rows?.[0]?.["geom_type"] as
          | string
          | undefined;
        const isPolygonType =
          geomType?.toUpperCase()?.includes("POLYGON") ?? false;

        // Get non-geometry columns to avoid returning raw WKB
        const colQuery = `
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          AND udt_name NOT IN ('geometry', 'geography')
          ORDER BY ordinal_position
        `;
        const colResult = await adapter.executeQuery(colQuery, [
          schemaName,
          table,
        ]);
        const nonGeomCols = (colResult.rows ?? [])
          .map((row) => sanitizeIdentifier(String(row["column_name"])))
          .join(", ");

        // Select non-geometry columns + readable geometry representation
        const selectCols =
          nonGeomCols.length > 0
            ? `${nonGeomCols}, ST_AsText(${columnName}) as geometry_text`
            : `ST_AsText(${columnName}) as geometry_text`;

        const sql = `SELECT ${selectCols}
                          FROM ${tableName}
                          WHERE ST_Contains(${columnName}, ST_SetSRID(ST_MakePoint($1, $2), 4326))`;

        const result = await adapter.executeQuery(sql, [point.lng, point.lat]);

        const response: Record<string, unknown> = {
          containingPolygons: result.rows,
          count: result.rows?.length ?? 0,
        };

        // Add warning if geometry type is not polygon
        if (!isPolygonType && geomType !== undefined) {
          response["warning"] =
            `Column "${column}" contains ${geomType} geometries, not polygons. ST_Contains requires polygons to produce meaningful results.`;
        }

        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_point_in_polygon",
            table:
              ((params as Record<string, unknown>)?.["table"] as string) ??
              undefined,
          });
      }
    },
  };
}

export function createDistanceTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_distance",
    description:
      "Find nearby geometries within a distance from a point. Output distance_meters is always in meters; unit parameter only affects the filter threshold.",
    group: "postgis",
    inputSchema: GeometryDistanceSchemaBase, // Base schema for MCP visibility
    outputSchema: DistanceOutputSchema,
    annotations: readOnly("Distance Search"),
    icons: getToolIcons("postgis", readOnly("Distance Search")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { table, column, point, limit, maxDistance, schema } =
          GeometryDistanceSchema.parse(params);
        const schemaName = schema ?? "public";
        const tableName = sanitizeTableName(
          table,
          schemaName !== "public" ? schemaName : undefined,
        );
        let columnName = column ? sanitizeIdentifier(column) : "";

        if (!columnName) {
          const geoColQuery = `
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = $2
            AND udt_name IN ('geometry', 'geography')
          `;
          const geoColResult = await adapter.executeQuery(geoColQuery, [schemaName, table]);
          const geoRows = geoColResult.rows ?? [];
          
          if (geoRows.length === 0) {
            throw new ValidationError(`No geometry/geography column found in table '${table}'.`);
          }
          if (geoRows.length > 1) {
            throw new ValidationError(`Multiple geometry columns found in table '${table}'. Please specify 'column' explicitly.`);
          }
          const detectedCol = geoRows[0]?.["column_name"] as string | undefined;
          columnName = sanitizeIdentifier(detectedCol ?? "");
        }

        const limitVal = limit ?? 10;
        const distanceFilter =
          maxDistance !== undefined && maxDistance > 0
            ? `WHERE distance_meters <= ${String(maxDistance)}`
            : "";

        // Get non-geometry columns to avoid returning raw WKB
        const colQuery = `
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          AND udt_name NOT IN ('geometry', 'geography')
          ORDER BY ordinal_position
        `;
        const colResult = await adapter.executeQuery(colQuery, [
          schemaName,
          table,
        ]);
        const nonGeomCols = (colResult.rows ?? [])
          .map((row) => sanitizeIdentifier(String(row["column_name"])))
          .join(", ");

        // Select non-geometry columns + readable geometry representation + distance
        const selectCols =
          nonGeomCols.length > 0
            ? `${nonGeomCols}, ST_AsText(${columnName}) as geometry_text, ST_Distance(${columnName}::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as distance_meters`
            : `ST_AsText(${columnName}) as geometry_text, ST_Distance(${columnName}::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as distance_meters`;

        // Use CTE for consistent distance calculation and filtering
        const sql = `WITH distances AS (
                SELECT ${selectCols}
                FROM ${tableName}
            )
            SELECT * FROM distances
            ${distanceFilter}
            ORDER BY distance_meters
            LIMIT ${String(limitVal)}`;

        const result = await adapter.executeQuery(sql, [point.lng, point.lat]);
        return { results: result.rows, count: result.rows?.length ?? 0 };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_distance",
            table:
              ((params as Record<string, unknown>)?.["table"] as string) ??
              undefined,
          });
      }
    },
  };
}

export function createBufferTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_buffer",
    description:
      "Create a buffer zone around geometries. Default limit: 10 rows, default simplify: 10m (set simplify: 0 to disable). Simplification reduces polygon point count for LLM-friendly payloads.",
    group: "postgis",
    inputSchema: BufferSchemaBase, // Base schema for MCP visibility
    outputSchema: BufferOutputSchema,
    annotations: readOnly("Buffer Zone"),
    icons: getToolIcons("postgis", readOnly("Buffer Zone")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = BufferSchema.parse(params ?? {});
        const whereClause =
          parsed.where !== undefined
            ? ` WHERE ${sanitizeWhereClause(parsed.where)}`
            : "";

        const schemaName = parsed.schema ?? "public";
        const qualifiedTable = sanitizeTableName(
          parsed.table,
          schemaName !== "public" ? schemaName : undefined,
        );
        const columnName = sanitizeIdentifier(parsed.column);

        // Default limit of 10 to prevent large payloads, use limit: 0 for all
        const effectiveLimit = parsed.limit ?? 10;
        // Get non-geometry columns to avoid returning raw WKB
        const colQuery = `
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          AND udt_name NOT IN ('geometry', 'geography')
          ORDER BY ordinal_position
        `;
        const colResult = await adapter.executeQuery(colQuery, [
          schemaName,
          parsed.table,
        ]);
        const nonGeomCols = (colResult.rows ?? [])
          .map((row) => sanitizeIdentifier(String(row["column_name"])))
          .join(", ");

        // Default simplify of 10m reduces polygon points for LLM-friendly payloads
        // User can set simplify: 0 to disable or higher values for more aggressive reduction
        const effectiveSimplify = parsed.simplify ?? 10;

        // Build buffer expression with simplification (applied by default)
        let bufferExpr = `ST_Buffer(${columnName}::geography, $1)::geometry`;
        if (effectiveSimplify > 0) {
          // SimplifyPreserveTopology maintains valid geometries
          bufferExpr = `ST_SimplifyPreserveTopology(${bufferExpr}, ${String(effectiveSimplify)})`;
        }

        // Select non-geometry columns + readable geometry representations
        const selectCols =
          nonGeomCols.length > 0
            ? `${nonGeomCols}, ST_AsGeoJSON(${bufferExpr}) as buffer_geojson`
            : `ST_AsGeoJSON(${bufferExpr}) as buffer_geojson`;

        const limitClause =
          effectiveLimit > 0 ? ` LIMIT ${String(effectiveLimit)}` : "";
        const sql = `SELECT ${selectCols} FROM ${qualifiedTable}${whereClause}${limitClause}`;

        const result = await adapter.executeQuery(sql, [parsed.distance]);

        // Build response with truncation indicators if default limit was applied
        const response: Record<string, unknown> = { results: result.rows };

        // Check if results were truncated (works for both default and explicit limits)
        if (effectiveLimit > 0) {
          const countSql = `SELECT COUNT(*) as cnt FROM ${qualifiedTable}${whereClause}`;
          const countResult = await adapter.executeQuery(countSql);
          const totalCount = Number(countResult.rows?.[0]?.["cnt"] ?? 0);

          if (totalCount > effectiveLimit) {
            response["truncated"] = true;
            response["totalCount"] = totalCount;
            response["limit"] = effectiveLimit;
          }
        }

        // Add simplify indicator if simplification was applied
        if (effectiveSimplify > 0) {
          response["simplified"] = true;
          response["simplifyTolerance"] = effectiveSimplify;
        }

        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_buffer",
            table:
              ((params as Record<string, unknown>)?.["table"] as string) ??
              undefined,
          });
      }
    },
  };
}

export function createIntersectionTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_intersection",
    description:
      "Find geometries that intersect with a given geometry. Auto-detects SRID from target column if not specified.",
    group: "postgis",
    inputSchema: IntersectionSchemaBase, // Base schema for MCP visibility
    outputSchema: IntersectionOutputSchema,
    annotations: readOnly("Intersection Search"),
    icons: getToolIcons("postgis", readOnly("Intersection Search")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = IntersectionSchema.parse(params ?? {});
        const schemaName = parsed.schema ?? "public";
        const qualifiedTable = sanitizeTableName(
          parsed.table,
          schemaName !== "public" ? schemaName : undefined,
        );
        const columnName = sanitizeIdentifier(parsed.column);
        // Build select columns - user-specified or non-geometry columns to avoid raw WKB
        let selectCols: string;
        if (parsed.select !== undefined && parsed.select.length > 0) {
          selectCols = parsed.select
            .map((c) => sanitizeIdentifier(c))
            .join(", ");
        } else {
          // Get non-geometry columns to avoid returning raw WKB
          const colQuery = `
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = $2
            AND udt_name NOT IN ('geometry', 'geography')
            ORDER BY ordinal_position
          `;
          const colResult = await adapter.executeQuery(colQuery, [
            schemaName,
            parsed.table,
          ]);
          const nonGeomCols = (colResult.rows ?? [])
            .map((row) => sanitizeIdentifier(String(row["column_name"])))
            .join(", ");
          selectCols =
            nonGeomCols.length > 0
              ? `${nonGeomCols}, ST_AsText(${columnName}) as geometry_text`
              : `ST_AsText(${columnName}) as geometry_text`;
        }

        const isGeoJson = parsed.geometry.trim().startsWith("{");

        // Auto-detect SRID from column if not provided and using WKT
        let srid = parsed.srid;
        if (!isGeoJson && srid === undefined) {
          // Query the column's SRID from geometry_columns or geography_columns
          const sridQuery = `
                      SELECT srid FROM geometry_columns
                      WHERE f_table_schema = $1 AND f_table_name = $2 AND f_geometry_column = $3
                      UNION
                      SELECT srid FROM geography_columns
                      WHERE f_table_schema = $1 AND f_table_name = $2 AND f_geography_column = $3
                      LIMIT 1
                  `;
          const sridResult = await adapter.executeQuery(sridQuery, [
            schemaName,
            parsed.table,
            parsed.column,
          ]);
          const sridValue = sridResult.rows?.[0]?.["srid"];
          if (sridValue !== undefined && sridValue !== null) {
            srid = Number(sridValue);
          }
        }

        // Build geometry expression with SRID if available
        let geomExpr: string;
        if (isGeoJson) {
          geomExpr = `ST_GeomFromGeoJSON($1)`;
        } else if (srid !== undefined) {
          geomExpr = `ST_SetSRID(ST_GeomFromText($1), ${String(srid)})`;
        } else {
          geomExpr = `ST_GeomFromText($1)`;
        }

        const limitClause = parsed.limit !== undefined && parsed.limit > 0 ? ` LIMIT ${String(parsed.limit)}` : "";

        const sql = `SELECT ${selectCols}
                          FROM ${qualifiedTable}
                          WHERE ST_Intersects(${columnName}, ${geomExpr})
                          ${limitClause}`;

        const result = await adapter.executeQuery(sql, [parsed.geometry]);
        return {
          intersecting: result.rows,
          count: result.rows?.length ?? 0,
          sridUsed: srid ?? "none (explicit SRID in geometry or GeoJSON)",
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_intersection",
            table:
              ((params as Record<string, unknown>)?.["table"] as string) ??
              undefined,
          });
      }
    },
  };
}

export function createBoundingBoxTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_bounding_box",
    description:
      "Find geometries within a bounding box. Swapped min/max values are auto-corrected.",
    group: "postgis",
    inputSchema: BoundingBoxSchemaBase, // Base schema for MCP visibility
    outputSchema: BoundingBoxOutputSchema,
    annotations: readOnly("Bounding Box Search"),
    icons: getToolIcons("postgis", readOnly("Bounding Box Search")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = BoundingBoxSchema.parse(params ?? {});

        const schemaName = parsed.schema ?? "public";
        const qualifiedTable = sanitizeTableName(
          parsed.table,
          schemaName !== "public" ? schemaName : undefined,
        );
        const columnName = sanitizeIdentifier(parsed.column);
        // Build select columns - user-specified or non-geometry columns to avoid raw WKB
        let selectCols: string;
        if (parsed.select !== undefined && parsed.select.length > 0) {
          selectCols = parsed.select
            .map((c) => sanitizeIdentifier(c))
            .join(", ");
        } else {
          // Get non-geometry columns to avoid returning raw WKB
          const colQuery = `
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = $2
            AND udt_name NOT IN ('geometry', 'geography')
            ORDER BY ordinal_position
          `;
          const colResult = await adapter.executeQuery(colQuery, [
            schemaName,
            parsed.table,
          ]);
          selectCols = (colResult.rows ?? [])
            .map((row) => sanitizeIdentifier(String(row["column_name"])))
            .join(", ");

          // If no columns found, table likely doesn't exist
          if (selectCols.length === 0) {
            throw new QueryError(
              `Table or view '${parsed.table}' not found in schema '${schemaName}'. Use pg_list_tables to see available tables.`,
            );
          }
        }

        // Auto-correct swapped bounds
        const corrections: string[] = [];
        let actualMinLng = Number(parsed.minLng);
        let actualMaxLng = Number(parsed.maxLng);
        let actualMinLat = Number(parsed.minLat);
        let actualMaxLat = Number(parsed.maxLat);

        if (actualMinLng > actualMaxLng) {
          actualMinLng = Number(parsed.maxLng);
          actualMaxLng = Number(parsed.minLng);
          corrections.push("minLng/maxLng were swapped");
        }
        if (actualMinLat > actualMaxLat) {
          actualMinLat = Number(parsed.maxLat);
          actualMaxLat = Number(parsed.minLat);
          corrections.push("minLat/maxLat were swapped");
        }

        const limitClause = parsed.limit !== undefined && parsed.limit > 0 ? ` LIMIT ${String(parsed.limit)}` : "";

        const sql = `SELECT ${selectCols}, ST_AsText(${columnName}) as geometry_text
                          FROM ${qualifiedTable}
                          WHERE ${columnName} && ST_MakeEnvelope($1, $2, $3, $4, 4326)
                          ${limitClause}`;

        const result = await adapter.executeQuery(sql, [
          actualMinLng,
          actualMinLat,
          actualMaxLng,
          actualMaxLat,
        ]);

        const response: Record<string, unknown> = {
          results: result.rows,
          count: result.rows?.length ?? 0,
        };

        if (corrections.length > 0) {
          response["note"] = `Auto-corrected: ${corrections.join(", ")}`;
        }

        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_bounding_box",
            table:
              ((params as Record<string, unknown>)?.["table"] as string) ??
              undefined,
          });
      }
    },
  };
}
