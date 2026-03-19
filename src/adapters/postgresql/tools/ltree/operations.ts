/**
 * PostgreSQL ltree Extension Tools — Advanced Operations
 *
 * Contains 3 tool creators for pattern matching, column conversion,
 * and GiST index creation on ltree columns.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition, RequestContext } from "../../../../types/index.js";
import { z } from "zod";
import { readOnly, write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  LtreeMatchSchema,
  LtreeMatchSchemaBase,
  LtreeConvertColumnSchema,
  LtreeConvertColumnSchemaBase,
  LtreeIndexSchema,
  LtreeIndexSchemaBase,
  // Output schemas
  LtreeMatchOutputSchema,
  LtreeConvertColumnOutputSchema,
  LtreeCreateIndexOutputSchema,
} from "../../schemas/index.js";

export function getOperationsTools(
  adapter: PostgresAdapter,
): ToolDefinition[] {
  return [
    createLtreeMatchTool(adapter),
    createLtreeConvertColumnTool(adapter),
    createLtreeCreateIndexTool(adapter),
  ];
}

function createLtreeMatchTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_ltree_match",
    description: "Match ltree paths using lquery pattern syntax.",
    group: "ltree",
    inputSchema: LtreeMatchSchemaBase, // Base schema for MCP visibility
    outputSchema: LtreeMatchOutputSchema,
    annotations: readOnly("Ltree Match"),
    icons: getToolIcons("ltree", readOnly("Ltree Match")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { table, column, pattern, schema, limit } =
          LtreeMatchSchema.parse(params);
        const schemaName = schema ?? "public";
        const qualifiedTable = `"${schemaName}"."${table}"`;
        const limitClause = limit !== undefined ? `LIMIT ${String(limit)}` : "";

        // Validate table exists and column is ltree type
        const colCheck = await adapter.executeQuery(
          `SELECT udt_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
          [schemaName, table, column],
        );
        if (!colCheck.rows || colCheck.rows.length === 0) {
          const tableCheck = await adapter.executeQuery(
            `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
            [schemaName, table],
          );
          if (!tableCheck.rows || tableCheck.rows.length === 0) {
            return {
              success: false,
              error: `Table ${qualifiedTable} does not exist.`,
            };
          }
          return {
            success: false,
            error: `Column "${column}" not found in table ${qualifiedTable}.`,
          };
        }
        const udtName = colCheck.rows[0]?.["udt_name"] as string;
        if (udtName !== "ltree") {
          return {
            success: false,
            error: `Column "${column}" is not an ltree type (found: ${udtName}). Use an ltree column or convert with pg_ltree_convert_column.`,
          };
        }

        // Get total count when limit is applied for truncation indicators
        let totalCount: number | undefined;
        if (limit !== undefined) {
          const countSql = `SELECT COUNT(*)::int as total FROM ${qualifiedTable} WHERE "${column}" ~ $1::lquery`;
          const countResult = await adapter.executeQuery(countSql, [pattern]);
          totalCount = countResult.rows?.[0]?.["total"] as number;
        }

        const sql = `SELECT *, nlevel("${column}") as depth FROM ${qualifiedTable} WHERE "${column}" ~ $1::lquery ORDER BY "${column}" ${limitClause}`;
        const result = await adapter.executeQuery(sql, [pattern]);
        const resultCount = result.rows?.length ?? 0;
        const response: Record<string, unknown> = {
          pattern,
          results: result.rows ?? [],
          count: resultCount,
        };

        // Add truncation indicators when limit is applied
        if (limit !== undefined && totalCount !== undefined) {
          response["truncated"] = resultCount < totalCount;
          response["totalCount"] = totalCount;
        }

        return response;
      } catch (error: unknown) {
        if (error instanceof z.ZodError) {
          return {
            success: false as const,
            error: error.issues.map((i) => i.message).join("; "),
          };
        }
        return formatHandlerErrorResponse(error, {
            tool: "pg_ltree_match",
          });
      }
    },
  };
}

function createLtreeConvertColumnTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_ltree_convert_column",
    description:
      "Convert an existing TEXT column to LTREE type. Note: If views depend on this column, you must drop and recreate them manually before conversion.",
    group: "ltree",
    inputSchema: LtreeConvertColumnSchemaBase, // Base schema for MCP visibility
    outputSchema: LtreeConvertColumnOutputSchema,
    annotations: write("Convert to Ltree"),
    icons: getToolIcons("ltree", write("Convert to Ltree")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { table, column, schema } =
          LtreeConvertColumnSchema.parse(params);
        const schemaName = schema ?? "public";
        const qualifiedTable = `"${schemaName}"."${table}"`;

        // Check if ltree extension is installed
        const extCheck = await adapter.executeQuery(`
          SELECT EXISTS(
            SELECT 1 FROM pg_extension WHERE extname = 'ltree'
          ) as installed
        `);
        const hasExt = (extCheck.rows?.[0]?.["installed"] as boolean) ?? false;
        if (!hasExt) {
          return {
            success: false,
            error:
              "ltree extension is not installed. Run pg_ltree_create_extension first.",
          };
        }

        const colCheck = await adapter.executeQuery(
          `SELECT data_type, udt_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
          [schemaName, table, column],
        );
        if (!colCheck.rows || colCheck.rows.length === 0) {
          // Distinguish table-not-found from column-not-found
          const tableCheck = await adapter.executeQuery(
            `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
            [schemaName, table],
          );
          if (!tableCheck.rows || tableCheck.rows.length === 0) {
            return {
              success: false,
              error: `Table ${qualifiedTable} does not exist. Verify the table name.`,
            };
          }
          return {
            success: false,
            error: `Column "${column}" not found in table ${qualifiedTable}. Verify the column name.`,
          };
        }

        const dataType = colCheck.rows[0]?.["data_type"] as string;
        const udtName = colCheck.rows[0]?.["udt_name"] as string;
        const currentType = dataType === "USER-DEFINED" ? udtName : dataType;

        if (udtName === "ltree") {
          return {
            success: true,
            message: `Column ${column} is already ltree`,
            table: qualifiedTable,
            previousType: "ltree",
            wasAlreadyLtree: true,
          };
        }

        // Validate source column is text-based (like citext tool does)
        const allowedTypes = ["text", "varchar", "character varying", "bpchar"];
        const normalizedType = dataType.toLowerCase();
        if (!allowedTypes.includes(normalizedType)) {
          return {
            success: false,
            error: `Cannot convert column "${column}" of type "${currentType}" to ltree. Only text-based columns can be converted.`,
            currentType,
            allowedTypes: ["text", "varchar", "character varying"],
            suggestion:
              "Create a new TEXT column with ltree-formatted paths, then convert that column.",
          };
        }

        // Check for dependent views before attempting the conversion
        const depCheck = await adapter.executeQuery(
          `
          SELECT DISTINCT
            c.relname as dependent_view,
            n.nspname as view_schema
          FROM pg_depend d
          JOIN pg_rewrite r ON d.objid = r.oid
          JOIN pg_class c ON r.ev_class = c.oid
          JOIN pg_namespace n ON c.relnamespace = n.oid
          JOIN pg_class t ON d.refobjid = t.oid
          JOIN pg_namespace tn ON t.relnamespace = tn.oid
          JOIN pg_attribute a ON d.refobjid = a.attrelid AND d.refobjsubid = a.attnum
          WHERE c.relkind = 'v'
            AND tn.nspname = $1
            AND t.relname = $2
            AND a.attname = $3
          `,
          [schemaName, table, column],
        );

        const dependentViews = depCheck.rows ?? [];

        if (dependentViews.length > 0) {
          return {
            success: false,
            error:
              "Column has dependent views that must be dropped before conversion",
            dependentViews: dependentViews.map(
              (v) =>
                `${v["view_schema"] as string}.${v["dependent_view"] as string}`,
            ),
            hint: "Drop the listed views, run this conversion, then recreate the views. PostgreSQL cannot ALTER COLUMN TYPE when views depend on it.",
          };
        }

        await adapter.executeQuery(
          `ALTER TABLE ${qualifiedTable} ALTER COLUMN "${column}" TYPE ltree USING "${column}"::ltree`,
        );
        return {
          success: true,
          message: `Column ${column} converted to ltree`,
          table: qualifiedTable,
          previousType: currentType,
        };
      } catch (error: unknown) {
        if (error instanceof z.ZodError) {
          return {
            success: false as const,
            error: error.issues.map((i) => i.message).join("; "),
          };
        }
        return formatHandlerErrorResponse(error, {
            tool: "pg_ltree_convert_column",
          });
      }
    },
  };
}

function createLtreeCreateIndexTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_ltree_create_index",
    description:
      "Create a GiST index on an ltree column for efficient tree queries.",
    group: "ltree",
    inputSchema: LtreeIndexSchemaBase, // Base schema for MCP visibility
    outputSchema: LtreeCreateIndexOutputSchema,
    annotations: write("Create Ltree Index"),
    icons: getToolIcons("ltree", write("Create Ltree Index")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { table, column, indexName, schema } =
          LtreeIndexSchema.parse(params);
        const schemaName = schema ?? "public";
        const qualifiedTable = `"${schemaName}"."${table}"`;
        const idxName = indexName ?? `idx_${table}_${column}_ltree`;

        // Validate table exists and column is ltree type
        const colCheck = await adapter.executeQuery(
          `SELECT udt_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
          [schemaName, table, column],
        );
        if (!colCheck.rows || colCheck.rows.length === 0) {
          const tableCheck = await adapter.executeQuery(
            `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
            [schemaName, table],
          );
          if (!tableCheck.rows || tableCheck.rows.length === 0) {
            return {
              success: false,
              error: `Table ${qualifiedTable} does not exist.`,
            };
          }
          return {
            success: false,
            error: `Column "${column}" not found in table ${qualifiedTable}.`,
          };
        }
        const udtName = colCheck.rows[0]?.["udt_name"] as string;
        if (udtName !== "ltree") {
          return {
            success: false,
            error: `Column "${column}" is not an ltree type (found: ${udtName}). Use an ltree column or convert with pg_ltree_convert_column.`,
          };
        }

        // Check for existing index by name
        const idxCheck = await adapter.executeQuery(
          `SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = $2) as exists`,
          [schemaName, idxName],
        );
        if (idxCheck.rows?.[0]?.["exists"] as boolean)
          return {
            success: true,
            message: `Index ${idxName} already exists`,
            indexName: idxName,
            table: qualifiedTable,
            column,
            indexType: "gist",
            alreadyExists: true,
          };

        // Check for existing GiST index on same table+column (semantic duplicate)
        const semanticCheck = await adapter.executeQuery(
          `SELECT indexname FROM pg_indexes
           WHERE schemaname = $1 AND tablename = $2
             AND indexdef ILIKE '%using gist%'
             AND (indexdef ILIKE $3 OR indexdef ILIKE $4)`,
          [schemaName, table, `%(${column})%`, `%("${column}")%`],
        );
        if (semanticCheck.rows && semanticCheck.rows.length > 0) {
          const existingName = semanticCheck.rows[0]?.["indexname"] as string;
          return {
            success: true,
            message: `GiST index already exists on column "${column}" as "${existingName}"`,
            indexName: existingName,
            table: qualifiedTable,
            column,
            indexType: "gist",
            alreadyExists: true,
          };
        }
        await adapter.executeQuery(
          `CREATE INDEX "${idxName}" ON ${qualifiedTable} USING GIST ("${column}")`,
        );
        return {
          success: true,
          message: `GiST index created`,
          indexName: idxName,
          table: qualifiedTable,
          column,
          indexType: "gist",
        };
      } catch (error: unknown) {
        if (error instanceof z.ZodError) {
          return {
            success: false as const,
            error: error.issues.map((i) => i.message).join("; "),
          };
        }
        return formatHandlerErrorResponse(error, {
            tool: "pg_ltree_create_index",
          });
      }
    },
  };
}
