/**
 * PostgreSQL pgvector - Data Operations
 *
 * Write tools: extension, addColumn.
 * Also exports shared utilities: parseVector, truncateVector, checkTableAndColumn.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  sanitizeIdentifier,
  sanitizeTableName,
} from "../../../../utils/identifiers.js";
import {
  VectorCreateExtensionOutputSchema,
  VectorAddColumnOutputSchema,
} from "../../schemas/index.js";
import { coerceNumber } from "../../../../utils/query-helpers.js";

/**
 * Parse a PostgreSQL vector string to a number array.
 * Handles formats like "[0.1,0.2,0.3]" or "(0.1,0.2,0.3)"
 */
export function parseVector(vecStr: unknown): number[] | null {
  if (typeof vecStr !== "string") return null;
  try {
    const cleaned = vecStr.replace(/[[\]()]/g, "");
    return cleaned.split(",").map(Number);
  } catch {
    return null;
  }
}

/**
 * Truncate a vector for display, showing first/last N values.
 * For vectors <= maxDisplay, returns the full vector.
 */
export function truncateVector(
  vec: number[] | null | undefined,
  maxDisplay = 10,
): {
  preview: number[] | null;
  dimensions: number;
  truncated: boolean;
} {
  if (vec === null || vec === undefined) {
    return { preview: null, dimensions: 0, truncated: false };
  }
  if (vec.length <= maxDisplay) {
    return { preview: vec, dimensions: vec.length, truncated: false };
  }
  // Show first 5 and last 5
  const half = Math.floor(maxDisplay / 2);
  const preview = [...vec.slice(0, half), ...vec.slice(-half)];
  return { preview, dimensions: vec.length, truncated: true };
}

/**
 * Two-step existence check: table first, then column.
 * Returns null if both exist, or {error, suggestion} if either is missing.
 */
export async function checkTableAndColumn(
  adapter: PostgresAdapter,
  table: string,
  column: string,
  schema: string,
): Promise<{ error: string; code: string; category: string; suggestion: string } | null> {
  // Step 1: check column existence (fast path — covers the common success case)
  const colSql = `
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
  `;
  const colResult = await adapter.executeQuery(colSql, [schema, table, column]);
  if ((colResult.rows?.length ?? 0) > 0) return null; // both exist

  // Step 2: disambiguate — is it the table or the column?
  const tblSql = `
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = $1 AND table_name = $2
  `;
  const tblResult = await adapter.executeQuery(tblSql, [schema, table]);
  if ((tblResult.rows?.length ?? 0) === 0) {
    return {
      error: `Table '${table}' does not exist in schema '${schema}'`,
      code: "TABLE_NOT_FOUND",
      category: "validation",
      suggestion: "Use pg_list_tables to find available tables",
    };
  }
  return {
    error: `Column '${column}' does not exist in table '${table}'`,
    code: "COLUMN_NOT_FOUND",
    category: "validation",
    suggestion: "Use pg_describe_table to find available columns",
  };
}

export function createVectorExtensionTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_vector_create_extension",
    description: "Enable the pgvector extension for vector similarity search.",
    group: "vector",
    inputSchema: z.object({}).strict(),
    outputSchema: VectorCreateExtensionOutputSchema,
    annotations: write("Create Vector Extension"),
    icons: getToolIcons("vector", write("Create Vector Extension")),
    handler: async (_params: unknown, _context: RequestContext) => {
      try {
        await adapter.executeQuery("CREATE EXTENSION IF NOT EXISTS vector");
        return { success: true, message: "pgvector extension enabled" };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_vector_create_extension",
          });
      }
    },
  };
}

export function createVectorAddColumnTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  // Base schema for MCP visibility (Split Schema pattern)
  const AddColumnSchemaBase = z.object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Alias for table"),
    column: z.string().optional().describe("Column name"),
    col: z.string().optional().describe("Alias for column"),
    dimensions: z
      .preprocess(coerceNumber, z.number().optional())
      .describe("Vector dimensions (e.g., 1536 for OpenAI)"),
    schema: z.string().optional().describe("Database schema (default: public)"),
    ifNotExists: z
      .boolean()
      .optional()
      .describe("Skip if column already exists (default: false)"),
  });

  // Transformed schema with alias resolution for handler
  const AddColumnSchema = AddColumnSchemaBase.transform((data) => ({
    table: data.table ?? data.tableName ?? "",
    column: data.column ?? data.col ?? "",
    dimensions: data.dimensions,
    schema: data.schema,
    ifNotExists: data.ifNotExists ?? false,
  }));

  return {
    name: "pg_vector_add_column",
    description:
      "Add a vector column to a table. Requires: table, column, dimensions.",
    group: "vector",
    // Use base schema for MCP visibility
    inputSchema: AddColumnSchemaBase,
    outputSchema: VectorAddColumnOutputSchema,
    annotations: write("Add Vector Column"),
    icons: getToolIcons("vector", write("Add Vector Column")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = AddColumnSchema.parse(params);

        // Validate required params with clear errors
        if (parsed.table === "") {
          return {
            success: false,
            error: "table (or tableName) parameter is required",
            requiredParams: ["table", "column", "dimensions"],
          };
        }
        if (parsed.column === "") {
          return {
            success: false,
            error: "column (or col) parameter is required",
            requiredParams: ["table", "column", "dimensions"],
          };
        }

        const schemaName = parsed.schema ?? "public";
        const tableName = sanitizeTableName(parsed.table, parsed.schema);
        const columnName = sanitizeIdentifier(parsed.column);

        // Verify table exists before ALTER TABLE
        const tblCheckSql = `
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2
      `;
        const tblCheckResult = await adapter.executeQuery(tblCheckSql, [
          schemaName,
          parsed.table,
        ]);
        if ((tblCheckResult.rows?.length ?? 0) === 0) {
          return {
            success: false,
            error: `Table '${parsed.table}' does not exist in schema '${schemaName}'`,
            code: "TABLE_NOT_FOUND",
            category: "validation",
            suggestion: "Use pg_list_tables to find available tables",
          };
        }

        // Check if column exists when ifNotExists is true
        if (parsed.ifNotExists) {
          const checkSql = `
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
        `;
          const checkResult = await adapter.executeQuery(checkSql, [
            schemaName,
            parsed.table,
            parsed.column,
          ]);
          if (checkResult.rows && checkResult.rows.length > 0) {
            return {
              success: true,
              table: parsed.table,
              column: parsed.column,
              dimensions: parsed.dimensions,
              ifNotExists: true,
              alreadyExists: true,
              message: `Column ${parsed.column} already exists on table ${parsed.table}`,
            };
          }
        }

        const sql = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} vector(${String(parsed.dimensions)})`;
        try {
          await adapter.executeQuery(sql);
          return {
            success: true,
            table: parsed.table,
            column: parsed.column,
            dimensions: parsed.dimensions,
            ifNotExists: parsed.ifNotExists,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          // Duplicate column: PG code 42701
          if (msg.includes("already exists")) {
            return {
              success: false,
              error: `Column '${parsed.column}' already exists on table '${parsed.table}'`,
              code: "COLUMN_ALREADY_EXISTS",
              category: "validation",
              suggestion:
                "Use ifNotExists: true to skip if column already exists",
            };
          }
          throw err;
        }
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_vector_add_column" });
      }
    },
  };
}
