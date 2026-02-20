/**
 * postgres-mcp - JSONB Tool Schemas
 *
 * Input validation schemas for JSONB operations.
 *
 * DUAL-SCHEMA PATTERN:
 * Base schemas are exported for MCP (visible parameters).
 * Preprocess functions are exported for handlers to normalize inputs.
 * This ensures MCP clients see parameters while handlers get normalized data.
 *
 * PATH FORMAT NORMALIZATION:
 * All tools now accept BOTH formats for paths:
 * - STRING: 'a.b[0]' or 'a.b.0' (dot notation)
 * - ARRAY: ['a', 'b', '0']
 */

import { z } from "zod";

/**
 * Convert a string path to array format
 * 'a.b[0].c' → ['a', 'b', '0', 'c']
 * 'a.b.0' → ['a', 'b', '0']
 * '[-1]' → ['-1'] (supports negative indices)
 */
export function stringPathToArray(path: string): string[] {
  // Handle JSONPath format ($.a.b) - strip leading $. if present
  let normalized = path.startsWith("$.") ? path.slice(2) : path;
  // Remove leading $ if present
  if (normalized.startsWith("$")) normalized = normalized.slice(1);
  if (normalized.startsWith(".")) normalized = normalized.slice(1);

  // Replace array notation [0] or [-1] with .0 or .-1 (supports negative indices)
  normalized = normalized.replace(/\[(-?\d+)\]/g, ".$1");

  // Split by dot and filter empty strings
  return normalized.split(".").filter((p) => p !== "");
}

/**
 * Convert array path to string format for extract
 * ['a', 'b', '0'] → 'a.b.0'
 */
export function arrayPathToString(path: string[]): string {
  return path.join(".");
}

/**
 * Normalize path to array format (for set/insert handlers)
 * Accepts both string paths and arrays with mixed string/number elements
 */
export function normalizePathToArray(
  path: string | (string | number)[],
): string[] {
  if (typeof path === "string") {
    return stringPathToArray(path);
  }
  // Convert all elements to strings
  return path.map((p) => String(p));
}

/**
 * Normalize path for jsonb_insert - converts numeric path segments to numbers
 * PostgreSQL jsonb_insert requires integer indices for array access
 * 'tags.0' → ['tags', 0] (number, not string)
 * 0 → [0] (bare number wrapped in array)
 */
export function normalizePathForInsert(
  path: string | number | (string | number)[],
): (string | number)[] {
  // Handle bare numbers (e.g., 0, -1 for array positions)
  if (typeof path === "number") {
    return [path];
  }
  if (typeof path === "string") {
    const segments = stringPathToArray(path);
    // Convert numeric strings to numbers for array access
    return segments.map((p) => (/^-?\d+$/.test(p) ? parseInt(p, 10) : p));
  }
  // Already mixed types - ensure numbers stay as numbers
  return path.map((p) =>
    typeof p === "number" ? p : /^-?\d+$/.test(p) ? parseInt(p, 10) : p,
  );
}

/**
 * Normalize path to string format (for extract handler)
 * Accepts both string paths and arrays with mixed string/number elements
 */
export function normalizePathToString(
  path: string | (string | number)[],
): string {
  if (Array.isArray(path)) {
    return path.map((p) => String(p)).join(".");
  }
  return path;
}

/**
 * Parse JSON string values for JSONB value parameters
 * MCP clients may send objects as JSON strings
 */
export function parseJsonbValue(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value; // Keep as string if not valid JSON
    }
  }
  return value;
}

/**
 * Preprocess JSONB tool parameters to normalize common input patterns.
 * Handles aliases and schema.table format parsing.
 * Exported so tools can apply it in their handlers.
 *
 * SPLIT SCHEMA PATTERN:
 * - Base schemas use optional table/tableName with .refine() for MCP visibility
 * - Handlers use z.preprocess(preprocessJsonbParams, BaseSchema) for alias resolution
 */
export function preprocessJsonbParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  const result = { ...(input as Record<string, unknown>) };

  // Alias: tableName → table
  if (result["tableName"] !== undefined && result["table"] === undefined) {
    result["table"] = result["tableName"];
  }
  // Alias: name → table (for consistency with other tool groups)
  if (result["name"] !== undefined && result["table"] === undefined) {
    result["table"] = result["name"];
  }
  // Alias: col → column
  if (result["col"] !== undefined && result["column"] === undefined) {
    result["column"] = result["col"];
  }
  // Alias: filter → where
  if (result["filter"] !== undefined && result["where"] === undefined) {
    result["where"] = result["filter"];
  }

  // Parse schema.table format (embedded schema takes priority)
  if (typeof result["table"] === "string" && result["table"].includes(".")) {
    const parts = result["table"].split(".");
    if (parts.length === 2 && parts[0] && parts[1]) {
      // Only override schema if not already explicitly set
      if (result["schema"] === undefined) {
        result["schema"] = parts[0];
      }
      result["table"] = parts[1];
    }
  }

  return result;
}

// ============== EXTRACT SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbExtractSchemaBase = z
  .object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Table name (alias for table)"),
    column: z.string().optional().describe("JSONB column name"),
    col: z.string().optional().describe("JSONB column name (alias for column)"),
    path: z
      .union([
        z.string().describe('Path as string (e.g., "a.b.c" or "a[0].b")'),
        z
          .array(z.union([z.string(), z.number()]))
          .describe('Path as array (e.g., ["a", 0, "b"])'),
      ])
      .describe(
        "Path to extract. Accepts both string and array formats with numeric indices.",
      ),
    select: z
      .array(z.string())
      .optional()
      .describe(
        'Additional columns to include in result for row identification (e.g., ["id"])',
      ),
    where: z.string().optional().describe("WHERE clause"),
    filter: z.string().optional().describe("WHERE clause (alias for where)"),
    limit: z.number().optional().describe("Maximum number of rows to return"),
    schema: z.string().optional().describe("Schema name (default: public)"),
  })
  .refine((data) => data.table !== undefined || data.tableName !== undefined, {
    message: "Either 'table' or 'tableName' is required",
  })
  .refine((data) => data.column !== undefined || data.col !== undefined, {
    message: "Either 'column' or 'col' is required",
  });

// Full schema with preprocess (for handler parsing)
export const JsonbExtractSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbExtractSchemaBase,
);

// ============== SET SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbSetSchemaBase = z
  .object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Table name (alias for table)"),
    column: z.string().optional().describe("JSONB column name"),
    col: z.string().optional().describe("JSONB column name (alias for column)"),
    path: z
      .union([
        z.string().describe('Path as string (e.g., "a.b.c" or "a[0].b")'),
        z
          .array(z.union([z.string(), z.number()]))
          .describe('Path as array (e.g., ["a", 0, "b"])'),
      ])
      .describe(
        "Path to the value. Accepts both string and array formats with numeric indices.",
      ),
    value: z
      .unknown()
      .describe("New value to set at the path (will be converted to JSONB)"),
    where: z
      .string()
      .optional()
      .describe("WHERE clause to identify rows to update"),
    filter: z.string().optional().describe("WHERE clause (alias for where)"),
    createMissing: z
      .boolean()
      .optional()
      .describe(
        "Create intermediate keys if path does not exist (default: true)",
      ),
    schema: z.string().optional().describe("Schema name (default: public)"),
  })
  .refine((data) => data.table !== undefined || data.tableName !== undefined, {
    message: "Either 'table' or 'tableName' is required",
  })
  .refine((data) => data.column !== undefined || data.col !== undefined, {
    message: "Either 'column' or 'col' is required",
  })
  .refine((data) => data.where !== undefined || data.filter !== undefined, {
    message: "Either 'where' or 'filter' is required",
  });

// Full schema with preprocess (for handler parsing)
export const JsonbSetSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbSetSchemaBase,
);

// ============== CONTAINS SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbContainsSchemaBase = z
  .object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Table name (alias for table)"),
    column: z.string().optional().describe("JSONB column name"),
    col: z.string().optional().describe("JSONB column name (alias for column)"),
    value: z
      .unknown()
      .describe(
        'JSON value to check if contained (e.g., {"status": "active"})',
      ),
    select: z
      .array(z.string())
      .optional()
      .describe("Columns to select in result"),
    where: z.string().optional().describe("Additional WHERE clause filter"),
    filter: z.string().optional().describe("WHERE clause (alias for where)"),
    schema: z.string().optional().describe("Schema name (default: public)"),
  })
  .refine((data) => data.table !== undefined || data.tableName !== undefined, {
    message: "Either 'table' or 'tableName' is required",
  })
  .refine((data) => data.column !== undefined || data.col !== undefined, {
    message: "Either 'column' or 'col' is required",
  });

// Full schema with preprocess (for handler parsing)
export const JsonbContainsSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbContainsSchemaBase,
);

// ============== PATH QUERY SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbPathQuerySchemaBase = z
  .object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Table name (alias for table)"),
    column: z.string().optional().describe("JSONB column name"),
    col: z.string().optional().describe("JSONB column name (alias for column)"),
    path: z
      .string()
      .describe(
        'JSONPath expression (e.g., "$.items[*].name" or "$.* ? (@.price > 10)")',
      ),
    vars: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Variables for JSONPath (access with $var_name)"),
    where: z.string().optional().describe("WHERE clause"),
    filter: z.string().optional().describe("WHERE clause (alias for where)"),
    schema: z.string().optional().describe("Schema name (default: public)"),
  })
  .refine((data) => data.table !== undefined || data.tableName !== undefined, {
    message: "Either 'table' or 'tableName' is required",
  })
  .refine((data) => data.column !== undefined || data.col !== undefined, {
    message: "Either 'column' or 'col' is required",
  });

// Full schema with preprocess (for handler parsing)
export const JsonbPathQuerySchema = z.preprocess(
  preprocessJsonbParams,
  JsonbPathQuerySchemaBase,
);

// ============== INSERT SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbInsertSchemaBase = z
  .object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Table name (alias for table)"),
    column: z.string().optional().describe("JSONB column name"),
    col: z.string().optional().describe("JSONB column name (alias for column)"),
    path: z
      .union([
        z.string().describe('Path as string (e.g., "tags.0")'),
        z.number().describe("Array index position (e.g., 0, -1)"),
        z
          .array(z.union([z.string(), z.number()]))
          .describe('Path as array (e.g., ["tags", 0])'),
      ])
      .describe(
        "Path to insert at (for arrays). Accepts both string and array formats.",
      ),
    value: z.unknown().describe("Value to insert"),
    where: z.string().optional().describe("WHERE clause"),
    filter: z.string().optional().describe("WHERE clause (alias for where)"),
    insertAfter: z
      .boolean()
      .optional()
      .describe("Insert after the specified position (default: false)"),
    schema: z.string().optional().describe("Schema name (default: public)"),
  })
  .refine((data) => data.table !== undefined || data.tableName !== undefined, {
    message: "Either 'table' or 'tableName' is required",
  })
  .refine((data) => data.column !== undefined || data.col !== undefined, {
    message: "Either 'column' or 'col' is required",
  })
  .refine((data) => data.where !== undefined || data.filter !== undefined, {
    message: "Either 'where' or 'filter' is required",
  });

// Full schema with preprocess (for handler parsing)
export const JsonbInsertSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbInsertSchemaBase,
);

// ============== DELETE SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbDeleteSchemaBase = z
  .object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Table name (alias for table)"),
    column: z.string().optional().describe("JSONB column name"),
    col: z.string().optional().describe("JSONB column name (alias for column)"),
    path: z
      .union([
        z.string().describe("Key to delete (single key) or dot-notation path"),
        z.number().describe("Array index to delete (e.g., 0, 1, 2)"),
        z
          .array(z.union([z.string(), z.number()]))
          .describe('Path as array (e.g., ["nested", 0])'),
      ])
      .describe("Key or path to delete. Supports numeric indices for arrays."),
    where: z.string().optional().describe("WHERE clause"),
    filter: z.string().optional().describe("WHERE clause (alias for where)"),
    schema: z.string().optional().describe("Schema name (default: public)"),
  })
  .refine((data) => data.table !== undefined || data.tableName !== undefined, {
    message: "Either 'table' or 'tableName' is required",
  })
  .refine((data) => data.column !== undefined || data.col !== undefined, {
    message: "Either 'column' or 'col' is required",
  })
  .refine((data) => data.where !== undefined || data.filter !== undefined, {
    message: "Either 'where' or 'filter' is required",
  });

// Full schema with preprocess (for handler parsing)
export const JsonbDeleteSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbDeleteSchemaBase,
);

// ============== TYPEOF SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbTypeofSchemaBase = z
  .object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Table name (alias for table)"),
    column: z.string().optional().describe("JSONB column name"),
    col: z.string().optional().describe("JSONB column name (alias for column)"),
    path: z
      .union([z.string(), z.array(z.union([z.string(), z.number()]))])
      .optional()
      .describe("Path to check type of nested value (string or array format)"),
    where: z.string().optional().describe("WHERE clause"),
    filter: z.string().optional().describe("WHERE clause (alias for where)"),
  })
  .refine((data) => data.table !== undefined || data.tableName !== undefined, {
    message: "Either 'table' or 'tableName' is required",
  })
  .refine((data) => data.column !== undefined || data.col !== undefined, {
    message: "Either 'column' or 'col' is required",
  });

// Full schema with preprocess (for handler parsing)
export const JsonbTypeofSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbTypeofSchemaBase,
);

// ============== KEYS SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbKeysSchemaBase = z
  .object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Table name (alias for table)"),
    column: z.string().optional().describe("JSONB column name"),
    col: z.string().optional().describe("JSONB column name (alias for column)"),
    where: z.string().optional().describe("WHERE clause"),
    filter: z.string().optional().describe("WHERE clause (alias for where)"),
  })
  .refine((data) => data.table !== undefined || data.tableName !== undefined, {
    message: "Either 'table' or 'tableName' is required",
  })
  .refine((data) => data.column !== undefined || data.col !== undefined, {
    message: "Either 'column' or 'col' is required",
  });

// Full schema with preprocess (for handler parsing)
export const JsonbKeysSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbKeysSchemaBase,
);

// ============== STRIP NULLS SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbStripNullsSchemaBase = z
  .object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Table name (alias for table)"),
    column: z.string().optional().describe("JSONB column name"),
    col: z.string().optional().describe("JSONB column name (alias for column)"),
    where: z.string().optional().describe("WHERE clause"),
    filter: z.string().optional().describe("WHERE clause (alias for where)"),
    preview: z
      .boolean()
      .optional()
      .describe("Preview what would be stripped without modifying data"),
  })
  .refine((data) => data.table !== undefined || data.tableName !== undefined, {
    message: "Either 'table' or 'tableName' is required",
  })
  .refine((data) => data.column !== undefined || data.col !== undefined, {
    message: "Either 'column' or 'col' is required",
  })
  .refine((data) => data.where !== undefined || data.filter !== undefined, {
    message: "Either 'where' or 'filter' is required",
  });

// Full schema with preprocess (for handler parsing)
export const JsonbStripNullsSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbStripNullsSchemaBase,
);

// ============== AGG SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbAggSchemaBase = z
  .object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Table name (alias for table)"),
    select: z
      .array(z.string())
      .optional()
      .describe(
        'Columns or expressions to include. Supports AS aliases: ["id", "metadata->\'name\' AS name"]',
      ),
    where: z.string().optional().describe("WHERE clause"),
    filter: z.string().optional().describe("WHERE clause (alias for where)"),
    groupBy: z
      .string()
      .optional()
      .describe(
        "Column or expression to group by. Returns {result: [{group_key, items}], count, grouped: true}",
      ),
    orderBy: z
      .string()
      .optional()
      .describe('ORDER BY clause (e.g., "id DESC", "name ASC")'),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of rows to aggregate"),
  })
  .refine((data) => data.table !== undefined || data.tableName !== undefined, {
    message: "Either 'table' or 'tableName' is required",
  });

// Full schema with preprocess (for handler parsing)
export const JsonbAggSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbAggSchemaBase,
);

// ============== NORMALIZE SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbNormalizeSchemaBase = z
  .object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Table name (alias for table)"),
    column: z.string().optional().describe("JSONB column"),
    col: z.string().optional().describe("JSONB column (alias for column)"),
    mode: z
      .enum(["keys", "array", "pairs", "flatten"])
      .optional()
      .describe(
        "keys: text values (all converted to string). pairs: JSONB types preserved. array: for arrays. flatten: recursive.",
      ),
    where: z.string().optional().describe("WHERE clause"),
    filter: z.string().optional().describe("WHERE clause (alias for where)"),
    idColumn: z
      .string()
      .optional()
      .describe(
        'Column to use for row identification (e.g., "id"). If omitted, defaults to "id" if it exists, else uses ctid.',
      ),
  })
  .refine((data) => data.table !== undefined || data.tableName !== undefined, {
    message: "Either 'table' or 'tableName' is required",
  })
  .refine((data) => data.column !== undefined || data.col !== undefined, {
    message: "Either 'column' or 'col' is required",
  });

// Full schema with preprocess (for handler parsing)
export const JsonbNormalizeSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbNormalizeSchemaBase,
);

// ============== STATS SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbStatsSchemaBase = z
  .object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Table name (alias for table)"),
    column: z.string().optional().describe("JSONB column"),
    col: z.string().optional().describe("JSONB column (alias for column)"),
    sampleSize: z.number().optional().describe("Sample rows to analyze"),
    where: z.string().optional().describe("WHERE clause to filter rows"),
    filter: z
      .string()
      .optional()
      .describe("WHERE clause to filter rows (alias for where)"),
    topKeysLimit: z
      .number()
      .optional()
      .describe("Maximum number of top keys to return (default: 20)"),
  })
  .refine((data) => data.table !== undefined || data.tableName !== undefined, {
    message: "Either 'table' or 'tableName' is required",
  })
  .refine((data) => data.column !== undefined || data.col !== undefined, {
    message: "Either 'column' or 'col' is required",
  });

// Full schema with preprocess (for handler parsing)
export const JsonbStatsSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbStatsSchemaBase,
);

// ============== INDEX SUGGEST SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbIndexSuggestSchemaBase = z
  .object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Table name (alias for table)"),
    column: z.string().optional().describe("JSONB column"),
    col: z.string().optional().describe("JSONB column (alias for column)"),
    sampleSize: z.number().optional().describe("Sample rows to analyze"),
    where: z.string().optional().describe("WHERE clause to filter rows"),
    filter: z
      .string()
      .optional()
      .describe("WHERE clause to filter rows (alias for where)"),
  })
  .refine((data) => data.table !== undefined || data.tableName !== undefined, {
    message: "Either 'table' or 'tableName' is required",
  })
  .refine((data) => data.column !== undefined || data.col !== undefined, {
    message: "Either 'column' or 'col' is required",
  });

// Full schema with preprocess (for handler parsing)
export const JsonbIndexSuggestSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbIndexSuggestSchemaBase,
);

// ============== SECURITY SCAN SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbSecurityScanSchemaBase = z
  .object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Table name (alias for table)"),
    column: z.string().optional().describe("JSONB column"),
    col: z.string().optional().describe("JSONB column (alias for column)"),
    sampleSize: z.number().optional().describe("Sample rows to scan"),
    where: z.string().optional().describe("WHERE clause to filter rows"),
    filter: z
      .string()
      .optional()
      .describe("WHERE clause to filter rows (alias for where)"),
  })
  .refine((data) => data.table !== undefined || data.tableName !== undefined, {
    message: "Either 'table' or 'tableName' is required",
  })
  .refine((data) => data.column !== undefined || data.col !== undefined, {
    message: "Either 'column' or 'col' is required",
  });

// Full schema with preprocess (for handler parsing)
export const JsonbSecurityScanSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbSecurityScanSchemaBase,
);

// ============== OUTPUT SCHEMAS (MCP 2025-11-25 structuredContent) ==============

// Output schema for pg_jsonb_extract
export const JsonbExtractOutputSchema = z.object({
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Extracted values with optional identifying columns"),
  count: z.number().optional().describe("Number of rows returned"),
  hint: z.string().optional().describe("Hint when all values are null"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_set
export const JsonbSetOutputSchema = z.object({
  rowsAffected: z.number().optional().describe("Number of rows updated"),
  hint: z.string().optional().describe("Additional information"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_insert
export const JsonbInsertOutputSchema = z.object({
  rowsAffected: z.number().optional().describe("Number of rows updated"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_delete
export const JsonbDeleteOutputSchema = z.object({
  rowsAffected: z.number().optional().describe("Number of rows updated"),
  hint: z.string().optional().describe("Note about rowsAffected semantics"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_contains
export const JsonbContainsOutputSchema = z.object({
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Matching rows"),
  count: z.number().optional().describe("Number of matching rows"),
  warning: z
    .string()
    .optional()
    .describe("Warning for empty object containment"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_path_query
export const JsonbPathQueryOutputSchema = z.object({
  results: z.array(z.unknown()).optional().describe("Query results"),
  count: z.number().optional().describe("Number of results"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_agg
export const JsonbAggOutputSchema = z.object({
  result: z
    .unknown()
    .optional()
    .describe("Aggregated JSONB array or grouped results"),
  count: z.number().optional().describe("Number of items or groups"),
  grouped: z.boolean().optional().describe("Whether results are grouped"),
  hint: z.string().optional().describe("Empty result hint"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_object
export const JsonbObjectOutputSchema = z.object({
  object: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Built JSONB object"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_array
export const JsonbArrayOutputSchema = z.object({
  array: z.array(z.unknown()).optional().describe("Built JSONB array"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_keys
export const JsonbKeysOutputSchema = z.object({
  keys: z
    .array(z.string())
    .optional()
    .describe("Unique keys from JSONB column"),
  count: z.number().optional().describe("Number of unique keys"),
  hint: z.string().optional().describe("Deduplication note"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_strip_nulls (two modes: update or preview)
// Uses combined schema with optional fields instead of union with z.literal() to avoid Zod validation issues
export const JsonbStripNullsOutputSchema = z.object({
  // Update mode fields
  rowsAffected: z.number().optional().describe("Number of rows updated"),
  // Preview mode fields
  preview: z.boolean().optional().describe("Preview mode indicator"),
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Before/after comparison"),
  count: z.number().optional().describe("Number of rows"),
  hint: z.string().optional().describe("Preview mode note"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_typeof
export const JsonbTypeofOutputSchema = z.object({
  types: z
    .array(z.string().nullable())
    .optional()
    .describe("JSONB types for each row (null if path doesn't exist)"),
  count: z.number().optional().describe("Number of rows"),
  columnNull: z
    .boolean()
    .optional()
    .describe("Whether any column was NULL (uses .some() aggregation)"),
  hint: z.string().optional().describe("Additional information"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// ============== ADVANCED JSONB OUTPUT SCHEMAS ==============

// Output schema for pg_jsonb_validate_path
export const JsonbValidatePathOutputSchema = z.object({
  valid: z.boolean().describe("Whether path is valid"),
  error: z.string().optional().describe("Error message if invalid"),
  results: z
    .array(z.unknown())
    .optional()
    .describe("Test results if testValue provided"),
  count: z.number().optional().describe("Number of results"),
});

// Output schema for pg_jsonb_merge
export const JsonbMergeOutputSchema = z.object({
  merged: z.unknown().optional().describe("Merged JSONB document"),
  deep: z.boolean().optional().describe("Whether deep merge was used"),
  mergeArrays: z
    .boolean()
    .optional()
    .describe("Whether arrays were concatenated"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_normalize
export const JsonbNormalizeOutputSchema = z.object({
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Normalized rows"),
  count: z.number().optional().describe("Number of rows"),
  mode: z.string().optional().describe("Normalization mode used"),
  hint: z.string().optional().describe("Additional information"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_diff
export const JsonbDiffOutputSchema = z.object({
  differences: z
    .array(
      z.object({
        key: z.string().describe("Key that differs"),
        status: z
          .enum(["added", "removed", "modified"])
          .describe("Type of difference"),
        value1: z.unknown().optional().describe("Value in doc1"),
        value2: z.unknown().optional().describe("Value in doc2"),
      }),
    )
    .optional()
    .describe("List of differences"),
  hasDifferences: z
    .boolean()
    .optional()
    .describe("Whether any differences exist"),
  comparison: z.string().optional().describe("Comparison type performed"),
  hint: z.string().optional().describe("Explanation of comparison scope"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_index_suggest
export const JsonbIndexSuggestOutputSchema = z.object({
  recommendations: z
    .array(z.string())
    .optional()
    .describe("Index creation SQL recommendations"),
  analyzed: z
    .object({
      topKeys: z.number().optional().describe("Number of top keys analyzed"),
      existingIndexes: z.number().optional().describe("Existing indexes found"),
    })
    .optional()
    .describe("Analysis details"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_security_scan
export const JsonbSecurityScanOutputSchema = z.object({
  issues: z
    .array(
      z.object({
        type: z.string().describe("Issue type"),
        key: z.string().optional().describe("Affected key"),
        count: z.number().optional().describe("Occurrence count"),
        severity: z.string().optional().describe("Issue severity"),
      }),
    )
    .optional()
    .describe("Security issues found"),
  riskLevel: z
    .enum(["low", "medium", "high"])
    .optional()
    .describe("Overall risk level"),
  scannedRows: z.number().optional().describe("Number of rows scanned"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_stats
export const JsonbStatsOutputSchema = z.object({
  basics: z
    .object({
      total_rows: z.number().describe("Total rows"),
      non_null_count: z.number().optional().describe("Non-null values"),
      avg_size_bytes: z.number().optional().describe("Average size"),
      max_size_bytes: z.number().optional().describe("Maximum size"),
    })
    .optional()
    .describe("Basic statistics"),
  topKeys: z
    .array(
      z.object({
        key: z.string().describe("Key name"),
        frequency: z.number().describe("Occurrence count"),
      }),
    )
    .optional()
    .describe("Most common keys"),
  typeDistribution: z
    .array(
      z.object({
        type: z
          .string()
          .nullable()
          .describe("JSONB type (null = SQL NULL column)"),
        count: z.number().describe("Count"),
      }),
    )
    .optional()
    .describe("Type distribution"),
  sqlNullCount: z
    .number()
    .optional()
    .describe("Count of rows with SQL NULL in the JSONB column"),
  hint: z.string().optional().describe("Usage hints or notes"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});
