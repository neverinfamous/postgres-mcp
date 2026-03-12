/**
 * PostgreSQL PostGIS Extension Tools - Setup & DDL
 *
 * Extension enable, geometry column add, spatial index create.
 * 3 tools total.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z, ZodError } from "zod";
import { write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  sanitizeIdentifier,
  sanitizeTableName,
} from "../../../../utils/identifiers.js";
import {
  GeometryColumnSchemaBase,
  GeometryColumnSchema,
  SpatialIndexSchemaBase,
  SpatialIndexSchema,
  // Output schemas
  PostgisCreateExtensionOutputSchema,
  GeometryColumnOutputSchema,
  SpatialIndexOutputSchema,
} from "../../schemas/index.js";

export function createPostgisExtensionTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_postgis_create_extension",
    description: "Enable the PostGIS extension for geospatial operations.",
    group: "postgis",
    inputSchema: z.object({}),
    outputSchema: PostgisCreateExtensionOutputSchema,
    annotations: write("Create PostGIS Extension"),
    icons: getToolIcons("postgis", write("Create PostGIS Extension")),
    handler: async (_params: unknown, _context: RequestContext) => {
      await adapter.executeQuery("CREATE EXTENSION IF NOT EXISTS postgis");
      return { success: true, message: "PostGIS extension enabled" };
    },
  };
}

export function createGeometryColumnTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_geometry_column",
    description:
      "Add a geometry column to a table. Returns alreadyExists: true if column exists.",
    group: "postgis",
    inputSchema: GeometryColumnSchemaBase, // Base schema for MCP visibility
    outputSchema: GeometryColumnOutputSchema,
    annotations: write("Add Geometry Column"),
    icons: getToolIcons("postgis", write("Add Geometry Column")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = GeometryColumnSchema.parse(params ?? {});

        const schemaName = parsed.schema ?? "public";
        const srid = parsed.srid ?? 4326;
        const geomType = parsed.type ?? "GEOMETRY";

        // Always check if column already exists (for accurate response message)
        const checkSql = `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`;
        const checkResult = await adapter.executeQuery(checkSql, [
          schemaName,
          parsed.table,
          parsed.column,
        ]);
        const columnExists =
          checkResult.rows !== undefined && checkResult.rows.length > 0;

        if (columnExists) {
          if (parsed.ifNotExists === true) {
            return {
              success: true,
              alreadyExists: true,
              table: parsed.table,
              column: parsed.column,
            };
          }
          // Without ifNotExists: true, this should be an error
          return {
            success: false,
            error: `Column "${parsed.column}" already exists in table "${parsed.table}".`,
            table: parsed.table,
            column: parsed.column,
            suggestion:
              "Use ifNotExists: true to skip this error if the column already exists.",
          };
        }

        // Check if table exists before trying to add column
        const tableCheckSql = `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`;
        const tableCheckResult = await adapter.executeQuery(tableCheckSql, [
          schemaName,
          parsed.table,
        ]);
        if ((tableCheckResult.rows?.length ?? 0) === 0) {
          return {
            success: false,
            error: `Table "${parsed.table}" does not exist in schema "${schemaName}".`,
            table: parsed.table,
            schema: schemaName,
            suggestion: "Create the table first, then add the geometry column.",
          };
        }

        const sql = `SELECT AddGeometryColumn($1, $2, $3, $4, $5, 2)`;
        await adapter.executeQuery(sql, [
          schemaName,
          parsed.table,
          parsed.column,
          srid,
          geomType,
        ]);

        return {
          success: true,
          table: parsed.table,
          column: parsed.column,
          srid,
          type: geomType,
        };
      } catch (error: unknown) {
        if (error instanceof ZodError) {
          return {
            success: false as const,
            error: error.issues.map((i) => i.message).join("; "),
          };
        }
        return formatHandlerErrorResponse(error, {
            tool: "pg_geometry_column",
            table:
              ((params as Record<string, unknown>)?.["table"] as string) ??
              undefined,
          });
      }
    },
  };
}

export function createSpatialIndexTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_spatial_index",
    description:
      "Create a GiST spatial index for geometry column. Uses IF NOT EXISTS to avoid errors on duplicate names.",
    group: "postgis",
    inputSchema: SpatialIndexSchemaBase, // Base schema for MCP visibility
    outputSchema: SpatialIndexOutputSchema,
    annotations: write("Create Spatial Index"),
    icons: getToolIcons("postgis", write("Create Spatial Index")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { table, column, name, ifNotExists, schema } =
          SpatialIndexSchema.parse(params);
        const schemaName = schema ?? "public";
        const indexNameRaw = name ?? `idx_${table}_${column}_gist`;

        // Check if index already exists (for accurate response message)
        const checkSql = `SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = $2) as exists`;
        const checkResult = await adapter.executeQuery(checkSql, [
          schemaName,
          indexNameRaw,
        ]);
        const indexExists = checkResult.rows?.[0]?.["exists"] as boolean;

        if (indexExists) {
          if (ifNotExists === true) {
            return {
              success: true,
              alreadyExists: true,
              index: indexNameRaw,
              table,
              column,
            };
          }
          // Use IF NOT EXISTS to return friendly message instead of PostgreSQL error
          return {
            success: true,
            alreadyExists: true,
            index: indexNameRaw,
            table,
            column,
            note: "Index already exists. Use ifNotExists: true to suppress this note.",
          };
        }

        const qualifiedTable = sanitizeTableName(
          table,
          schemaName !== "public" ? schemaName : undefined,
        );
        const columnName = sanitizeIdentifier(column);
        const indexName = sanitizeIdentifier(indexNameRaw);

        // Check if table exists before trying to create index
        const tableCheckSql = `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`;
        const tableCheckResult = await adapter.executeQuery(tableCheckSql, [
          schemaName,
          table,
        ]);
        if ((tableCheckResult.rows?.length ?? 0) === 0) {
          return {
            success: false,
            error: `Table "${table}" does not exist in schema "${schemaName}".`,
            table,
            schema: schemaName,
            suggestion: "Create the table first, then add the spatial index.",
          };
        }

        // Always use IF NOT EXISTS to prevent unclear PostgreSQL errors
        const sql = `CREATE INDEX IF NOT EXISTS ${indexName} ON ${qualifiedTable} USING GIST (${columnName})`;
        await adapter.executeQuery(sql);
        return { success: true, index: indexNameRaw, table, column };
      } catch (error: unknown) {
        if (error instanceof ZodError) {
          return {
            success: false as const,
            error: error.issues.map((i) => i.message).join("; "),
          };
        }
        return formatHandlerErrorResponse(error, {
            tool: "pg_spatial_index",
            table:
              ((params as Record<string, unknown>)?.["table"] as string) ??
              undefined,
          });
      }
    },
  };
}
