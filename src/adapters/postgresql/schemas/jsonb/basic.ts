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
  // Alias: contains → value (for pg_jsonb_contains)
  if (result["contains"] !== undefined && result["value"] === undefined) {
    result["value"] = result["contains"];
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
export const JsonbExtractSchemaBase = z.object({
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
    .optional()
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
});

// Internal schema with refine (for handler validation)
const JsonbExtractSchemaRefined = JsonbExtractSchemaBase.refine(
  (data) => data.table !== undefined || data.tableName !== undefined,
  { message: "Either 'table' or 'tableName' is required" },
)
  .refine((data) => data.column !== undefined || data.col !== undefined, {
    message: "Either 'column' or 'col' is required",
  })
  .refine((data) => data.path !== undefined, {
    message: "path is required",
  });

// Full schema with preprocess (for handler parsing)
export const JsonbExtractSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbExtractSchemaRefined,
);

// ============== SET SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbSetSchemaBase = z.object({
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
    .optional()
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
});

// Internal schema with refine (for handler validation)
const JsonbSetSchemaRefined = JsonbSetSchemaBase.refine(
  (data) => data.table !== undefined || data.tableName !== undefined,
  { message: "Either 'table' or 'tableName' is required" },
)
  .refine((data) => data.column !== undefined || data.col !== undefined, {
    message: "Either 'column' or 'col' is required",
  })
  .refine((data) => data.path !== undefined, {
    message: "path is required",
  })
  .refine((data) => data.where !== undefined || data.filter !== undefined, {
    message: "Either 'where' or 'filter' is required",
  });

// Full schema with preprocess (for handler parsing)
export const JsonbSetSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbSetSchemaRefined,
);

// ============== CONTAINS SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbContainsSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Table name (alias for table)"),
  column: z.string().optional().describe("JSONB column name"),
  col: z.string().optional().describe("JSONB column name (alias for column)"),
  value: z
    .unknown()
    .optional()
    .describe('JSON value to check if contained (e.g., {"status": "active"})'),
  contains: z
    .unknown()
    .optional()
    .describe(
      'Alias for value: JSON value to check if contained (e.g., {"status": "active"})',
    ),
  select: z
    .array(z.string())
    .optional()
    .describe("Columns to select in result"),
  where: z.string().optional().describe("Additional WHERE clause filter"),
  filter: z.string().optional().describe("WHERE clause (alias for where)"),
  limit: z
    .number()
    .optional()
    .describe(
      "Maximum number of rows to return (default: 100). Use 0 for all rows.",
    ),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

// Internal schema with refine (for handler validation)
const JsonbContainsSchemaRefined = JsonbContainsSchemaBase.refine(
  (data) => data.table !== undefined || data.tableName !== undefined,
  { message: "Either 'table' or 'tableName' is required" },
).refine((data) => data.column !== undefined || data.col !== undefined, {
  message: "Either 'column' or 'col' is required",
});

// Full schema with preprocess (for handler parsing)
export const JsonbContainsSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbContainsSchemaRefined,
);

// ============== PATH QUERY SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbPathQuerySchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Table name (alias for table)"),
  column: z.string().optional().describe("JSONB column name"),
  col: z.string().optional().describe("JSONB column name (alias for column)"),
  path: z
    .string()
    .optional()
    .describe(
      'JSONPath expression (e.g., "$.items[*].name" or "$.* ? (@.price > 10)")',
    ),
  vars: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Variables for JSONPath (access with $var_name)"),
  where: z.string().optional().describe("WHERE clause"),
  filter: z.string().optional().describe("WHERE clause (alias for where)"),
  limit: z
    .number()
    .optional()
    .describe(
      "Maximum number of results to return (default: 100). Use 0 for all results.",
    ),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

// Internal schema with refine (for handler validation)
const JsonbPathQuerySchemaRefined = JsonbPathQuerySchemaBase.refine(
  (data) => data.table !== undefined || data.tableName !== undefined,
  { message: "Either 'table' or 'tableName' is required" },
)
  .refine((data) => data.column !== undefined || data.col !== undefined, {
    message: "Either 'column' or 'col' is required",
  })
  .refine((data) => data.path !== undefined, {
    message: "path is required",
  });

// Full schema with preprocess (for handler parsing)
export const JsonbPathQuerySchema = z.preprocess(
  preprocessJsonbParams,
  JsonbPathQuerySchemaRefined,
);

// ============== INSERT SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbInsertSchemaBase = z.object({
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
    .optional()
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
});

// Internal schema with refine (for handler validation)
const JsonbInsertSchemaRefined = JsonbInsertSchemaBase.refine(
  (data) => data.table !== undefined || data.tableName !== undefined,
  { message: "Either 'table' or 'tableName' is required" },
)
  .refine((data) => data.column !== undefined || data.col !== undefined, {
    message: "Either 'column' or 'col' is required",
  })
  .refine((data) => data.path !== undefined, {
    message: "path is required",
  })
  .refine((data) => data.where !== undefined || data.filter !== undefined, {
    message: "Either 'where' or 'filter' is required",
  });

// Full schema with preprocess (for handler parsing)
export const JsonbInsertSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbInsertSchemaRefined,
);

// ============== DELETE SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbDeleteSchemaBase = z.object({
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
    .optional()
    .describe("Key or path to delete. Supports numeric indices for arrays."),
  where: z.string().optional().describe("WHERE clause"),
  filter: z.string().optional().describe("WHERE clause (alias for where)"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

// Internal schema with refine (for handler validation)
const JsonbDeleteSchemaRefined = JsonbDeleteSchemaBase.refine(
  (data) => data.table !== undefined || data.tableName !== undefined,
  { message: "Either 'table' or 'tableName' is required" },
)
  .refine((data) => data.column !== undefined || data.col !== undefined, {
    message: "Either 'column' or 'col' is required",
  })
  .refine((data) => data.path !== undefined, {
    message: "path is required",
  })
  .refine((data) => data.where !== undefined || data.filter !== undefined, {
    message: "Either 'where' or 'filter' is required",
  });

// Full schema with preprocess (for handler parsing)
export const JsonbDeleteSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbDeleteSchemaRefined,
);

// ============== TYPEOF SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbTypeofSchemaBase = z.object({
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
  schema: z.string().optional().describe("Schema name (default: public)"),
});

// Internal schema with refine (for handler validation)
const JsonbTypeofSchemaRefined = JsonbTypeofSchemaBase.refine(
  (data) => data.table !== undefined || data.tableName !== undefined,
  { message: "Either 'table' or 'tableName' is required" },
).refine((data) => data.column !== undefined || data.col !== undefined, {
  message: "Either 'column' or 'col' is required",
});

// Full schema with preprocess (for handler parsing)
export const JsonbTypeofSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbTypeofSchemaRefined,
);

// ============== KEYS SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbKeysSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Table name (alias for table)"),
  column: z.string().optional().describe("JSONB column name"),
  col: z.string().optional().describe("JSONB column name (alias for column)"),
  where: z.string().optional().describe("WHERE clause"),
  filter: z.string().optional().describe("WHERE clause (alias for where)"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

// Internal schema with refine (for handler validation)
const JsonbKeysSchemaRefined = JsonbKeysSchemaBase.refine(
  (data) => data.table !== undefined || data.tableName !== undefined,
  { message: "Either 'table' or 'tableName' is required" },
).refine((data) => data.column !== undefined || data.col !== undefined, {
  message: "Either 'column' or 'col' is required",
});

// Full schema with preprocess (for handler parsing)
export const JsonbKeysSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbKeysSchemaRefined,
);

// ============== STRIP NULLS SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbStripNullsSchemaBase = z.object({
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
  schema: z.string().optional().describe("Schema name (default: public)"),
});

// Internal schema with refine (for handler validation)
const JsonbStripNullsSchemaRefined = JsonbStripNullsSchemaBase.refine(
  (data) => data.table !== undefined || data.tableName !== undefined,
  { message: "Either 'table' or 'tableName' is required" },
).refine((data) => data.column !== undefined || data.col !== undefined, {
  message: "Either 'column' or 'col' is required",
});

// Full schema with preprocess (for handler parsing)
export const JsonbStripNullsSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbStripNullsSchemaRefined,
);

// ============== AGG SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbAggSchemaBase = z.object({
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
  limit: z.number().optional().describe("Maximum number of rows to aggregate"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

// Internal schema with refine (for handler validation)
const JsonbAggSchemaRefined = JsonbAggSchemaBase.refine(
  (data) => data.table !== undefined || data.tableName !== undefined,
  { message: "Either 'table' or 'tableName' is required" },
);

// Full schema with preprocess (for handler parsing)
export const JsonbAggSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbAggSchemaRefined,
);

// ============== NORMALIZE SCHEMA ==============
