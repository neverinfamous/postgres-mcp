/**
 * postgres-mcp - Index Schemas
 *
 * Input validation schemas for index operations (get + create).
 */

import { z } from "zod";
import { preprocessTableParams } from "./queries.js";

// =============================================================================
// Index Schemas
// =============================================================================

// Base schema for MCP visibility - exported for inputSchema (Split Schema pattern)
export const GetIndexesSchemaBase = z.object({
  table: z
    .string()
    .optional()
    .describe(
      "Table name (supports schema.table format). Omit to list all indexes.",
    ),
  tableName: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  limit: z
    .number()
    .optional()
    .describe(
      "Maximum indexes to return (default: 100 when no table specified)",
    ),
});

// Transformed schema with alias resolution and schema.table parsing
// Note: table is now optional - when omitted, lists all indexes in database
export const GetIndexesSchema = z
  .preprocess((val: unknown) => {
    // First apply default empty object, then preprocess table params
    const result = preprocessTableParams(val ?? {});
    return result;
  }, GetIndexesSchemaBase)
  .transform((data) => ({
    table: data.table ?? data.tableName,
    schema: data.schema,
    limit: data.limit,
  }));

/**
 * Preprocess create index params:
 * - Alias: tableName → table
 * - Parse schema.table format (e.g., 'public.users' → schema: 'public', table: 'users')
 * - Parse JSON-encoded columns array
 * - Handle single column string → array
 */
function preprocessCreateIndexParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const result = { ...(input as Record<string, unknown>) };

  // Alias: tableName → table
  if (result["table"] === undefined && result["tableName"] !== undefined) {
    result["table"] = result["tableName"];
  }

  // Parse schema.table format
  if (
    typeof result["table"] === "string" &&
    result["table"].includes(".") &&
    result["schema"] === undefined
  ) {
    const parts = result["table"].split(".");
    if (parts.length === 2) {
      result["schema"] = parts[0];
      result["table"] = parts[1];
    }
  }

  // Parse JSON-encoded columns array
  if (typeof result["columns"] === "string") {
    try {
      const parsed: unknown = JSON.parse(result["columns"]);
      if (
        Array.isArray(parsed) &&
        parsed.every((item): item is string => typeof item === "string")
      ) {
        result["columns"] = parsed;
      }
    } catch {
      // Not JSON, might be single column - let schema handle it
    }
  }

  // Support 'method' as alias for 'type' (common terminology)
  if (result["method"] !== undefined && result["type"] === undefined) {
    result["type"] = result["method"];
  }

  // Normalize type to lowercase
  if (typeof result["type"] === "string") {
    result["type"] = result["type"].toLowerCase();
  }

  return result;
}

// Base schema for MCP visibility - exported for inputSchema
export const CreateIndexSchemaBase = z.object({
  table: z
    .string()
    .optional()
    .describe("Table name (supports schema.table format)"),
  tableName: z.string().optional().describe("Alias for table"),
  name: z.string().optional().describe("Index name"),
  indexName: z.string().optional().describe("Alias for name"),
  index: z.string().optional().describe("Alias for name"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  columns: z.array(z.string()).optional().describe("Columns to index"),
  column: z
    .string()
    .optional()
    .describe("Single column (auto-wrapped to array)"),
  unique: z.boolean().optional().describe("Create a unique index"),
  type: z
    .enum(["btree", "hash", "gist", "gin", "spgist", "brin"])
    .optional()
    .describe("Index type"),
  method: z
    .enum(["btree", "hash", "gist", "gin", "spgist", "brin"])
    .optional()
    .describe("Alias for type"),
  where: z.string().optional().describe("Partial index condition"),
  concurrently: z.boolean().optional().describe("Create index concurrently"),
  ifNotExists: z
    .boolean()
    .optional()
    .describe("Use IF NOT EXISTS (silently succeeds if index exists)"),
});

// Transformed schema with alias resolution and preprocessing
export const CreateIndexSchema = z
  .preprocess(preprocessCreateIndexParams, CreateIndexSchemaBase)
  .transform((data) => {
    // Resolve table from aliases: table, tableName
    const table = data.table ?? data.tableName ?? "";

    // Handle column → columns smoothing (wrap string in array)
    const columns = data.columns ?? (data.column ? [data.column] : []);

    // Resolve index name from all aliases: name, indexName, index
    let name = data.name ?? data.indexName ?? data.index ?? "";

    // Auto-generate index name if not provided: idx_{table}_{columns}
    if (name === "" && table !== "" && columns.length > 0) {
      name = `idx_${table}_${columns.join("_")}`;
    }

    return {
      name,
      table,
      schema: data.schema,
      columns,
      unique: data.unique,
      type: data.type,
      where: data.where,
      concurrently: data.concurrently,
      ifNotExists: data.ifNotExists,
    };
  })
  .refine((data) => data.table !== "", {
    message: "table (or tableName alias) is required",
  })
  .refine((data) => data.name !== "", {
    message:
      "name (or indexName/index alias) is required (or provide table and columns to auto-generate)",
  })
  .refine((data) => data.columns.length > 0, {
    message: "columns (or column alias) is required",
  });
