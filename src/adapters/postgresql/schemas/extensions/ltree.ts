/**
 * postgres-mcp - ltree Extension Schemas
 *
 * Input validation and output schemas for ltree tools.
 */

import { z } from "zod";
import { normalizeOptionalParams } from "./shared.js";

// =============================================================================
// Preprocessors
// =============================================================================

/**
 * Preprocess ltree table parameters:
 * - Alias: tableName/name -> table
 * - Alias: col -> column
 * - Parse schema.table format
 */
function preprocessLtreeTableParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const obj = input as Record<string, unknown>;
  const result = { ...obj };

  // Alias: tableName/name -> table
  if (result["table"] === undefined) {
    if (result["tableName"] !== undefined)
      result["table"] = result["tableName"];
    else if (result["name"] !== undefined) result["table"] = result["name"];
  }

  // Alias: col -> column
  if (result["col"] !== undefined && result["column"] === undefined) {
    result["column"] = result["col"];
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

  return result;
}

// =============================================================================
// Base Schemas (MCP Visibility)
// =============================================================================

/**
 * Base schema for MCP visibility - shows all parameters including aliases.
 */
export const LtreeQuerySchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  name: z.string().optional().describe("Alias for table"),
  column: z.string().optional().describe("ltree column name"),
  col: z.string().optional().describe("Alias for column"),
  path: z
    .string()
    .optional()
    .describe('ltree path to query (e.g., "Top.Science.Astronomy")'),
  pattern: z.string().optional().describe("Alias for path"),
  mode: z
    .enum(["ancestors", "descendants", "exact"])
    .optional()
    .describe("Query mode: ancestors, descendants (default), or exact"),
  type: z
    .enum(["ancestors", "descendants", "exact"])
    .optional()
    .describe("Alias for mode"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  limit: z.number().optional().describe("Maximum results"),
});

/**
 * Base schema for MCP visibility - shows all parameters including aliases.
 */
export const LtreeSubpathSchemaBase = z.object({
  path: z
    .string()
    .optional()
    .describe('ltree path (e.g., "Top.Science.Astronomy.Stars")'),
  offset: z
    .number()
    .optional()
    .describe("Starting position (0-indexed, negative counts from end)"),
  start: z.number().optional().describe("Alias for offset"),
  from: z.number().optional().describe("Alias for offset"),
  length: z
    .number()
    .optional()
    .describe("Number of labels (omit for rest of path)"),
  len: z.number().optional().describe("Alias for length"),
});

/**
 * Base schema for MCP visibility - shows all parameters including aliases.
 */
export const LtreeMatchSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  name: z.string().optional().describe("Alias for table"),
  column: z.string().optional().describe("ltree column name"),
  col: z.string().optional().describe("Alias for column"),
  pattern: z
    .string()
    .optional()
    .describe('lquery pattern (e.g., "*.Science.*" or "Top.*{1,3}.Stars")'),
  query: z.string().optional().describe("Alias for pattern"),
  lquery: z.string().optional().describe("Alias for pattern"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  limit: z.number().optional().describe("Maximum results"),
  maxResults: z.number().optional().describe("Alias for limit"),
});

/**
 * Base schema for MCP visibility - shows all parameters including aliases.
 */
export const LtreeConvertColumnSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  name: z.string().optional().describe("Alias for table"),
  column: z.string().optional().describe("Text column to convert to ltree"),
  col: z.string().optional().describe("Alias for column"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

/**
 * Base schema for MCP visibility - shows all parameters including aliases.
 */
export const LtreeIndexSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  name: z.string().optional().describe("Alias for table"),
  column: z.string().optional().describe("ltree column name"),
  col: z.string().optional().describe("Alias for column"),
  indexName: z
    .string()
    .optional()
    .describe("Custom index name (auto-generated if omitted)"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

// =============================================================================
// Transformed Schemas (Handler Validation)
// =============================================================================

/**
 * Schema for querying ltree hierarchies (ancestors/descendants).
 * Accepts 'pattern' as alias for 'path', 'type' as alias for 'mode', 'col'/'tableName'/'name' aliases.
 */
export const LtreeQuerySchema = z.preprocess(
  (input) => {
    const obj = preprocessLtreeTableParams(input);
    if (typeof obj !== "object" || obj === null) return obj;
    const result = obj as Record<string, unknown>;
    if ("pattern" in result && !("path" in result)) {
      result["path"] = result["pattern"];
    }
    // Alias: type -> mode
    if ("type" in result && !("mode" in result)) {
      result["mode"] = result["type"];
    }
    return result;
  },
  z.object({
    table: z.string().describe("Table name"),
    column: z.string().describe("ltree column name"),
    path: z
      .string()
      .describe('ltree path to query (e.g., "Top.Science.Astronomy")'),
    mode: z
      .enum(["ancestors", "descendants", "exact"])
      .optional()
      .describe(
        "Query mode: ancestors (@>), descendants (<@), or exact (default: descendants)",
      ),
    schema: z.string().optional().describe("Schema name (default: public)"),
    limit: z.number().optional().describe("Maximum results"),
  }),
);

/**
 * Schema for extracting subpath from ltree.
 * Accepts 'start'/'from' as alias for 'offset', 'len'/'end' as alias for 'length'.
 */
export const LtreeSubpathSchema = z.preprocess(
  (input) => {
    if (typeof input !== "object" || input === null) return input;
    const obj = input as Record<string, unknown>;
    const result = { ...obj };
    // Alias: len -> length (PostgreSQL function uses len)
    if ("len" in obj && !("length" in obj)) {
      result["length"] = obj["len"];
    }
    // Alias: start/from -> offset
    if ("start" in obj && !("offset" in obj)) {
      result["offset"] = obj["start"];
    } else if ("from" in obj && !("offset" in obj)) {
      result["offset"] = obj["from"];
    }
    // Default offset to 0 if not provided
    if (result["offset"] === undefined) {
      result["offset"] = 0;
    }
    // Alias: end -> length (calculate length from start/end if both provided)
    if ("end" in obj && !("length" in obj) && !("len" in obj)) {
      const start = (result["offset"] ?? 0) as number;
      const end = obj["end"] as number;
      result["length"] = end - start;
    }
    return result;
  },
  z.object({
    path: z
      .string()
      .describe('ltree path (e.g., "Top.Science.Astronomy.Stars")'),
    offset: z
      .number()
      .describe(
        "Starting position (0-indexed, negative counts from end). Default: 0",
      ),
    length: z
      .number()
      .optional()
      .describe("Number of labels (omit for rest of path). Alias: len"),
  }),
);

/**
 * Base schema for MCP visibility - no min constraint.
 */
export const LtreeLcaSchemaBase = z.object({
  paths: z
    .array(z.string())
    .optional()
    .describe("Array of ltree paths to find common ancestor (minimum 2)"),
});

/**
 * Schema for finding longest common ancestor.
 * Enforces minimum 2 paths; used inside handler try/catch.
 */
export const LtreeLcaSchema = z.object({
  paths: z
    .array(z.string())
    
    .describe("Array of ltree paths to find common ancestor"),
});

/**
 * Schema for pattern matching with lquery.
 * Accepts 'query'/'lquery' as aliases for 'pattern', 'maxResults' as alias for 'limit'.
 */
export const LtreeMatchSchema = z.preprocess(
  (input) => {
    const obj = preprocessLtreeTableParams(input);
    if (typeof obj !== "object" || obj === null) return obj;
    const result = obj as Record<string, unknown>;
    // Alias: query/lquery -> pattern
    if (result["pattern"] === undefined) {
      if (result["query"] !== undefined) result["pattern"] = result["query"];
      else if (result["lquery"] !== undefined)
        result["pattern"] = result["lquery"];
    }
    // Alias: maxResults -> limit
    if (result["maxResults"] !== undefined && result["limit"] === undefined) {
      result["limit"] = result["maxResults"];
    }
    return result;
  },
  z.object({
    table: z.string().describe("Table name"),
    column: z.string().describe("ltree column name"),
    pattern: z
      .string()
      .describe('lquery pattern (e.g., "*.Science.*" or "Top.*{1,3}.Stars")'),
    schema: z.string().optional().describe("Schema name (default: public)"),
    limit: z.number().optional().describe("Maximum results"),
  }),
);

/**
 * Schema for listing ltree columns in the database.
 */
export const LtreeListColumnsSchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Schema name to filter (all schemas if omitted)"),
});

export const LtreeListColumnsSchema = z.preprocess(
  normalizeOptionalParams,
  LtreeListColumnsSchemaBase,
);

/**
 * Schema for converting a text column to ltree.
 * Accepts 'tableName'/'name' as aliases for 'table', 'col' as alias for 'column'.
 */
export const LtreeConvertColumnSchema = z.preprocess(
  preprocessLtreeTableParams,
  z.object({
    table: z.string().describe("Table name"),
    column: z.string().describe("Text column to convert to ltree"),
    schema: z.string().optional().describe("Schema name (default: public)"),
  }),
);

/**
 * Schema for creating a GiST index on ltree column.
 * Accepts 'tableName'/'name' as aliases for 'table', 'col' as alias for 'column'.
 */
export const LtreeIndexSchema = z.preprocess(
  preprocessLtreeTableParams,
  z.object({
    table: z.string().describe("Table name"),
    column: z.string().describe("ltree column name"),
    indexName: z
      .string()
      .optional()
      .describe("Custom index name (auto-generated if omitted)"),
    schema: z.string().optional().describe("Schema name (default: public)"),
  }),
);

// =============================================================================
// Output Schemas
// =============================================================================

/**
 * Output schema for pg_ltree_create_extension
 */
export const LtreeCreateExtensionOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether extension was enabled"),
    message: z.string().optional().describe("Status message"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("ltree extension creation result");

/**
 * Output schema for pg_ltree_query
 */
export const LtreeQueryOutputSchema = z
  .object({
    path: z.string().optional().describe("Query path"),
    mode: z.string().optional().describe("Query mode"),
    isPattern: z.boolean().optional().describe("Whether query uses patterns"),
    results: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Query results"),
    count: z.number().optional().describe("Number of results"),
    truncated: z.boolean().optional().describe("Results were truncated"),
    totalCount: z.number().optional().describe("Total available count"),
    success: z.boolean().optional().describe("Whether query succeeded"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Ltree query result");

/**
 * Output schema for pg_ltree_subpath
 */
export const LtreeSubpathOutputSchema = z
  .object({
    originalPath: z.string().optional().describe("Original path"),
    offset: z.number().optional().describe("Offset used"),
    length: z
      .union([z.number(), z.string()])
      .optional()
      .describe("Length used"),
    subpath: z.string().optional().describe("Extracted subpath"),
    originalDepth: z.number().optional().describe("Original path depth"),
    pathDepth: z.number().optional().describe("Path depth for error"),
    success: z.boolean().optional().describe("Whether extraction succeeded"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Subpath extraction result");

/**
 * Output schema for pg_ltree_lca
 */
export const LtreeLcaOutputSchema = z
  .object({
    paths: z.array(z.string()).optional().describe("Input paths"),
    longestCommonAncestor: z.string().optional().describe("LCA path"),
    hasCommonAncestor: z.boolean().optional().describe("Whether LCA exists"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Longest common ancestor result");

/**
 * Output schema for pg_ltree_match
 */
export const LtreeMatchOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether match succeeded"),
    pattern: z.string().optional().describe("Query pattern"),
    results: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Matching results"),
    count: z.number().optional().describe("Number of results"),
    truncated: z.boolean().optional().describe("Results were truncated"),
    totalCount: z.number().optional().describe("Total available count"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Pattern match result");

/**
 * Output schema for pg_ltree_list_columns
 */
export const LtreeListColumnsOutputSchema = z
  .object({
    columns: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("ltree columns"),
    count: z.number().optional().describe("Number of columns"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("List of ltree columns");

/**
 * Output schema for pg_ltree_convert_column
 */
export const LtreeConvertColumnOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether conversion succeeded"),
    message: z.string().optional().describe("Status message"),
    table: z.string().optional().describe("Qualified table name"),
    previousType: z.string().optional().describe("Previous column type"),
    wasAlreadyLtree: z
      .boolean()
      .optional()
      .describe("Column was already ltree"),
    error: z.string().optional().describe("Error message"),
    currentType: z.string().optional().describe("Current column type"),
    allowedTypes: z
      .array(z.string())
      .optional()
      .describe("Allowed source types"),
    suggestion: z.string().optional().describe("Suggestion for resolution"),
    dependentViews: z
      .array(z.string())
      .optional()
      .describe("Views that depend on this column"),
    hint: z.string().optional().describe("Helpful hint"),
  })
  .describe("Column conversion result");

/**
 * Output schema for pg_ltree_create_index
 */
export const LtreeCreateIndexOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether index was created"),
    message: z.string().optional().describe("Status message"),
    indexName: z.string().optional().describe("Index name"),
    alreadyExists: z.boolean().optional().describe("Index already existed"),
    table: z.string().optional().describe("Qualified table name"),
    column: z.string().optional().describe("Column name"),
    indexType: z.string().optional().describe("Index type (gist)"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Index creation result");
