/**
 * PostgreSQL Core Tools - Utility Operations
 *
 * Lightweight table utilities: count, exists, truncate.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly, write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "./error-helpers.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import {
  CountOutputSchema,
  ExistsOutputSchema,
  TruncateOutputSchema,
} from "./schemas/index.js";
import {
  validateTableExists,
  CountSchema,
  CountSchemaBase,
  ExistsSchema,
  ExistsSchemaBase,
  TruncateSchema,
  TruncateSchemaBase,
  createUpsertTool,
  createBatchInsertTool,
} from "./convenience.js";

// Re-export schemas for barrel file
export {
  CountSchema,
  CountSchemaBase,
  ExistsSchema,
  ExistsSchemaBase,
  TruncateSchema,
  TruncateSchemaBase,
};
/**
 * Count rows
 */
export function createCountTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_count",
    description:
      "Count rows in a table, optionally with a WHERE clause or specific column.",
    group: "core",
    inputSchema: CountSchemaBase, // Base schema for MCP visibility
    outputSchema: CountOutputSchema,
    annotations: readOnly("Count"),
    icons: getToolIcons("core", readOnly("Count")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = CountSchema.parse(params);
        const schemaName = parsed.schema ?? "public";
        const validationError = await validateTableExists(
          adapter,
          parsed.table,
          schemaName,
        );
        if (validationError) {
          return { success: false, error: validationError };
        }
        const qualifiedTable = `"${schemaName}"."${parsed.table}"`;

        const countExpr =
          parsed.column !== undefined ? `"${parsed.column}"` : "*";
        // Treat empty where string as no where clause
        const whereClause =
          parsed.where !== undefined && parsed.where.trim() !== ""
            ? ` WHERE ${sanitizeWhereClause(parsed.where)}`
            : "";

        const sql = `SELECT COUNT(${countExpr}) as count FROM ${qualifiedTable}${whereClause}`;
        let result;
        try {
          result = await adapter.executeQuery(sql, parsed.params);
        } catch (error: unknown) {
          return formatHandlerErrorResponse(error, {
              tool: "pg_count",
              table: parsed.table,
              schema: schemaName,
            });
        }

        const count = Number(result.rows?.[0]?.["count"]) || 0;
        return { count };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_count" });
      }
    },
  };
}

/**
 * Check if row exists
 */
export function createExistsTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_exists",
    description:
      "Check if rows exist in a table. WHERE clause is optional: with WHERE = checks matching rows; without WHERE = checks if table has any rows at all. For table *schema* existence, use pg_list_tables.",
    group: "core",
    inputSchema: ExistsSchemaBase, // Base schema for MCP visibility
    outputSchema: ExistsOutputSchema,
    annotations: readOnly("Exists"),
    icons: getToolIcons("core", readOnly("Exists")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = ExistsSchema.parse(params);
        const schemaName = parsed.schema ?? "public";
        const validationError = await validateTableExists(
          adapter,
          parsed.table,
          schemaName,
        );
        if (validationError) {
          return { success: false, error: validationError };
        }
        const qualifiedTable = `"${schemaName}"."${parsed.table}"`;

        // Build SQL with optional WHERE clause
        const whereValue = parsed.where ?? "";
        const hasWhere = whereValue.trim() !== "";
        const whereClause = hasWhere
          ? ` WHERE ${sanitizeWhereClause(whereValue)}`
          : "";
        const sql = `SELECT EXISTS(SELECT 1 FROM ${qualifiedTable}${whereClause}) as exists`;

        const result = await adapter.executeQuery(sql, parsed.params);

        const exists = result.rows?.[0]?.["exists"] === true;
        return {
          exists,
          table: `${schemaName}.${parsed.table}`,
          // Add clarifying context based on usage
          mode: hasWhere ? "filtered" : "any_rows",
          ...(hasWhere && { where: whereValue }),
          ...(!hasWhere && {
            hint: "No WHERE clause provided. Checked if table has any rows. To check specific conditions, add where/condition/filter parameter.",
          }),
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_exists" });
      }
    },
  };
}

/**
 * Truncate table
 */
export function createTruncateTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_truncate",
    description:
      "Truncate a table, removing all rows quickly. Use cascade to truncate dependent tables.",
    group: "core",
    inputSchema: TruncateSchemaBase, // Base schema for MCP visibility
    outputSchema: TruncateOutputSchema,
    annotations: write("Truncate"),
    icons: getToolIcons("core", write("Truncate")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = TruncateSchema.parse(params);
        const schemaName = parsed.schema ?? "public";
        const validationError = await validateTableExists(
          adapter,
          parsed.table,
          schemaName,
        );
        if (validationError) {
          return { success: false, error: validationError };
        }
        const qualifiedTable = `"${schemaName}"."${parsed.table}"`;

        let sql = `TRUNCATE TABLE ${qualifiedTable}`;

        if (parsed.restartIdentity === true) {
          sql += " RESTART IDENTITY";
        }

        if (parsed.cascade === true) {
          sql += " CASCADE";
        }

        await adapter.executeQuery(sql);
        return {
          success: true,
          table: `${schemaName}.${parsed.table}`,
          cascade: parsed.cascade ?? false,
          restartIdentity: parsed.restartIdentity ?? false,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_truncate" });
      }
    },
  };
}

/**
 * Get all convenience tools
 */
export function getConvenienceTools(
  adapter: PostgresAdapter,
): ToolDefinition[] {
  return [
    createUpsertTool(adapter),
    createBatchInsertTool(adapter),
    createCountTool(adapter),
    createExistsTool(adapter),
    createTruncateTool(adapter),
  ];
}
