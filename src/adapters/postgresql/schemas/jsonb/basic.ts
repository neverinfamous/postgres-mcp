/**
 * postgres-mcp - JSONB Tool Schemas
 *
 * Input validation schemas for JSONB operations.
 *
 * DUAL-SCHEMA PATTERN:
 * Base schemas are exported for MCP (visible parameters).
 * Preprocess functions are exported for handlers to normalize inputs.
 * This ensures MCP clients see parameters while handlers get normalized data.
 */

import { z } from "zod";

import { coerceNumber } from "../../../../utils/query-helpers.js";
import { preprocessJsonbParams } from "./utils.js";

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
      z.number().describe("Array index position (e.g., 0, 1, 2)"),
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
const JsonbExtractSchemaRefined = JsonbExtractSchemaBase.extend({
  limit: z.preprocess(coerceNumber, z.number().optional()),
}).refine(
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
      z.number().describe("Array index position (e.g., 0, 1, 2)"),
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
  limit: z.number().optional().describe(
    "Maximum number of rows to return (default: 100). Use 0 for all rows.",
  ),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

// Internal schema with refine (for handler validation)
const JsonbContainsSchemaRefined = JsonbContainsSchemaBase.extend({
  limit: z.preprocess(coerceNumber, z.number().optional()),
}).refine(
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
  limit: z.number().optional().describe(
    "Maximum number of results to return (default: 100). Use 0 for all results.",
  ),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

// Internal schema with refine (for handler validation)
const JsonbPathQuerySchemaRefined = JsonbPathQuerySchemaBase.extend({
  limit: z.preprocess(coerceNumber, z.number().optional()),
}).refine(
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
    .union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))])
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
const JsonbAggSchemaRefined = JsonbAggSchemaBase.extend({
  limit: z.preprocess(coerceNumber, z.number().optional()),
}).refine(
  (data) => data.table !== undefined || data.tableName !== undefined,
  { message: "Either 'table' or 'tableName' is required" },
);

// Full schema with preprocess (for handler parsing)
export const JsonbAggSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbAggSchemaRefined,
);

// ============== NORMALIZE SCHEMA ==============
