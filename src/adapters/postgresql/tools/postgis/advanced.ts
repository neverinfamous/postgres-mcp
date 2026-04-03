/**
 * PostgreSQL PostGIS Extension Tools - Advanced Operations
 *
 * Coordinate tools: geocode and geo_transform.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
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
  GeocodeSchemaBase,
  GeocodeSchema,
  GeoTransformSchemaBase,
  GeoTransformSchema,
  // Output schemas
  GeocodeOutputSchema,
  GeoTransformOutputSchema,
} from "../../schemas/index.js";

export function createGeocodeTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_geocode",
    description:
      "Create a point geometry from latitude/longitude coordinates. The SRID parameter sets output metadata only; input coordinates are always WGS84 lat/lng.",
    group: "postgis",
    inputSchema: GeocodeSchemaBase, // Base schema for MCP visibility
    outputSchema: GeocodeOutputSchema,
    annotations: readOnly("Geocode"),
    icons: getToolIcons("postgis", readOnly("Geocode")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = GeocodeSchema.parse(params ?? {});
        const srid = parsed.srid ?? 4326;

        const sql = `SELECT
                        ST_AsGeoJSON(ST_SetSRID(ST_MakePoint($1, $2), $3)) as geojson,
                        ST_AsText(ST_SetSRID(ST_MakePoint($1, $2), $3)) as wkt`;

        const result = await adapter.executeQuery(sql, [
          parsed.lng,
          parsed.lat,
          srid,
        ]);

        // Add note about SRID for non-4326 cases
        const row = result.rows?.[0];
        if (row === undefined) {
          return { success: true };
        }
        const response: Record<string, unknown> = { success: true, ...row };
        if (srid !== 4326) {
          response["note"] =
            `Coordinates are WGS84 lat/lng with SRID ${String(srid)} metadata. Use pg_geo_transform to convert to target CRS.`;
        }
        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_geocode" });
      }
    },
  };
}

/**
 * Transform geometry between coordinate systems
 */
export function createGeoTransformTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_geo_transform",
    description:
      "Transform geometry from one spatial reference system (SRID) to another.",
    group: "postgis",
    inputSchema: GeoTransformSchemaBase, // Base schema for MCP visibility
    outputSchema: GeoTransformOutputSchema,
    annotations: readOnly("Transform Geometry"),
    icons: getToolIcons("postgis", readOnly("Transform Geometry")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = GeoTransformSchema.parse(params ?? {});

        const schemaName = parsed.schema ?? "public";
        const qualifiedTable = sanitizeTableName(
          parsed.table,
          schemaName !== "public" ? schemaName : undefined,
        );
        const columnName = sanitizeIdentifier(parsed.column);

        // Auto-detect fromSrid from column metadata if not provided
        let fromSrid = parsed.fromSrid;
        if (fromSrid === 0) {
          // Check if table exists before attempting SRID auto-detection
          const tableCheckSql = `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`;
          const tableCheckResult = await adapter.executeQuery(tableCheckSql, [
            schemaName,
            parsed.table,
          ]);
          if ((tableCheckResult.rows?.length ?? 0) === 0) {
            return {
              success: false as const,
              error: `Table "${parsed.table}" does not exist in schema "${schemaName}". Use pg_list_tables to see available tables.`,
              code: "TABLE_NOT_FOUND",
              category: "resource",
              suggestion: "Use pg_list_tables to see available tables.",
              recoverable: false,
            };
          }

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
            fromSrid = Number(sridValue);
          } else {
            return {
              success: false,
              error: `Could not auto-detect SRID for column "${parsed.column}" on table "${parsed.table}". Provide fromSrid (or sourceSrid) explicitly.`,
              suggestion: `Use fromSrid: 4326 for WGS84/GPS coordinates, or fromSrid: 3857 for Web Mercator`,
            };
          }
        }

        const whereClause =
          parsed.where !== undefined
            ? `WHERE ${sanitizeWhereClause(parsed.where)}`
            : "";

        // Default limit of 10 to prevent large payloads, use limit: 0 for all
        const effectiveLimit = parsed.limit ?? 10;
        const limitClause =
          effectiveLimit > 0 ? `LIMIT ${String(effectiveLimit)}` : "";

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
          .map((row) => `"${String(row["column_name"])}"`)
          .join(", ");

        // Select non-geometry columns + transformed geometry representations
        const selectCols =
          nonGeomCols.length > 0
            ? `${nonGeomCols}, ST_AsGeoJSON(ST_Transform(ST_SetSRID(${columnName}, ${String(fromSrid)}), ${String(parsed.toSrid)})) as transformed_geojson, ${String(parsed.toSrid)} as output_srid`
            : `ST_AsGeoJSON(ST_Transform(ST_SetSRID(${columnName}, ${String(fromSrid)}), ${String(parsed.toSrid)})) as transformed_geojson, ${String(parsed.toSrid)} as output_srid`;

        const sql = `SELECT ${selectCols} FROM ${qualifiedTable} ${whereClause} ${limitClause}`;

        const result = await adapter.executeQuery(sql);

        // Build response with truncation indicators if default limit was applied
        const response: Record<string, unknown> = {
          success: true,
          results: result.rows,
          count: result.rows?.length ?? 0,
          fromSrid: fromSrid,
          toSrid: parsed.toSrid,
          ...(parsed.fromSrid === 0 && { autoDetectedSrid: true }),
        };

        // Check if results were truncated (works for both default and explicit limits)
        if (effectiveLimit > 0) {
          const countSql = `SELECT COUNT(*) as cnt FROM ${qualifiedTable} ${whereClause}`;
          const countResult = await adapter.executeQuery(countSql);
          const totalCount = Number(countResult.rows?.[0]?.["cnt"] ?? 0);

          if (totalCount > effectiveLimit) {
            response["truncated"] = true;
            response["totalCount"] = totalCount;
            response["limit"] = effectiveLimit;
          }
        }

        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_geo_transform",
            table:
              ((params as Record<string, unknown>)?.["table"] as string) ??
              undefined,
          });
      }
    },
  };
}

