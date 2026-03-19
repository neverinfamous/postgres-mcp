/**
 * PostgreSQL Core Tools - Convenience Schemas
 *
 * Zod schemas and preprocessors for convenience operations:
 * Upsert, BatchInsert, Count, Exists, Truncate.
 */

import { z } from "zod";
import type { PostgresAdapter } from "../../postgres-adapter.js";

// =============================================================================
// Table Existence Validation (P154 Pattern)
// =============================================================================

/**
 * Validate that a table exists before executing operations.
 * Throws a high-signal error instead of letting raw PostgreSQL
 * "relation does not exist" errors propagate.
 */
export async function validateTableExists(
  adapter: PostgresAdapter,
  table: string,
  schema: string,
): Promise<string | null> {
  // Check if the schema exists first for granular error messages
  const schemaResult = await adapter.executeQuery(
    `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
    [schema],
  );
  if (!schemaResult.rows || schemaResult.rows.length === 0) {
    return `Schema '${schema}' does not exist. Use pg_list_objects with type 'table' to see available schemas.`;
  }

  const result = await adapter.executeQuery(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
    [schema, table],
  );
  if (!result.rows || result.rows.length === 0) {
    return `Table '${schema}.${table}' not found. Use pg_list_tables to see available tables.`;
  }
  return null;
}

// =============================================================================
// Common Preprocessors
// =============================================================================

/**
 * Preprocess table parameters:
 * - Alias: tableName/name → table
 * - Parse schema.table format
 */
export function preprocessTableParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const result = { ...(input as Record<string, unknown>) };

  // Alias: tableName/name → table
  if (result["table"] === undefined) {
    if (result["tableName"] !== undefined)
      result["table"] = result["tableName"];
    else if (result["name"] !== undefined) result["table"] = result["name"];
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

/**
 * Preprocess upsert params:
 * - All table params from preprocessTableParams
 * - Alias: values → data
 */
function preprocessUpsertParams(input: unknown): unknown {
  const result = preprocessTableParams(input);
  if (typeof result !== "object" || result === null) return result;
  const obj = result as Record<string, unknown>;

  // Alias: values → data
  if (obj["data"] === undefined && obj["values"] !== undefined) {
    obj["data"] = obj["values"];
  }

  return obj;
}

// =============================================================================
// Upsert Schema
// =============================================================================

// MCP visibility schema - table OR tableName required, data OR values required
export const UpsertSchemaBase = z.object({
  table: z
    .string()
    .optional()
    .describe("Table name (supports schema.table format)"),
  tableName: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  data: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Column-value pairs to insert"),
  values: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Alias for data"),
  conflictColumns: z
    .array(z.string())
    .optional()
    .describe("Columns that form the unique constraint (ON CONFLICT)"),
  updateColumns: z
    .array(z.string())
    .optional()
    .describe(
      "Columns to update on conflict (default: all except conflict columns)",
    ),
  returning: z.array(z.string()).optional().describe("Columns to return"),
});

// Internal parsing schema - optional fields for alias resolution
const UpsertParseSchema = z.object({
  table: z
    .string()
    .optional()
    .describe("Table name (supports schema.table format)"),
  tableName: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  data: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Column-value pairs to insert"),
  values: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Alias for data"),
  conflictColumns: z
    .array(z.string())
    .optional()
    .describe("Columns that form the unique constraint (ON CONFLICT)"),
  updateColumns: z
    .array(z.string())
    .optional()
    .describe(
      "Columns to update on conflict (default: all except conflict columns)",
    ),
  returning: z.array(z.string()).optional().describe("Columns to return"),
});

export const UpsertSchema = z
  .preprocess(preprocessUpsertParams, UpsertParseSchema)
  .transform((d) => ({
    ...d,
    table: d.table ?? d.tableName ?? "",
    data: d.data ?? d.values ?? {},
    conflictColumns: d.conflictColumns ?? [],
  }))
  .refine((d) => d.table !== "", {
    message:
      'table (or tableName alias) is required. Usage: pg_upsert({ table: "users", data: { name: "John" }, conflictColumns: ["id"] })',
  })
  .refine((d) => Object.keys(d.data).length > 0, {
    message: "data (or values alias) is required",
  })
  .refine((d) => d.conflictColumns.length > 0, {
    message:
      "conflictColumns must not be empty - specify columns for ON CONFLICT clause",
  });

// =============================================================================
// BatchInsert Schema
// =============================================================================

// MCP visibility schema - table OR tableName required
export const BatchInsertSchemaBase = z.object({
  table: z
    .string()
    .optional()
    .describe("Table name (supports schema.table format)"),
  tableName: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Array of row objects to insert"),
  returning: z.array(z.string()).optional().describe("Columns to return"),
});

// Internal parsing schema - table optional for alias resolution
const BatchInsertParseSchema = z.object({
  table: z
    .string()
    .optional()
    .describe("Table name (supports schema.table format)"),
  tableName: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Array of row objects to insert"),
  returning: z.array(z.string()).optional().describe("Columns to return"),
});

export const BatchInsertSchema = z
  .preprocess(preprocessTableParams, BatchInsertParseSchema)
  .transform((data) => ({
    ...data,
    table: data.table ?? data.tableName ?? "",
    rows: data.rows ?? [],
  }))
  .refine((data) => data.table !== "", {
    message:
      'table (or tableName alias) is required. Usage: pg_batch_insert({ table: "users", rows: [{ name: "John" }, { name: "Jane" }] })',
  })
  .refine((data) => data.rows.length > 0, {
    message:
      'rows must not be empty. Provide at least one row to insert, e.g., rows: [{ column: "value" }]',
  });

// =============================================================================
// Count Schema
// =============================================================================

// MCP visibility schema - table OR tableName required
export const CountSchemaBase = z.object({
  table: z
    .string()
    .optional()
    .describe("Table name (supports schema.table format)"),
  tableName: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  where: z
    .string()
    .optional()
    .describe("WHERE clause (supports $1, $2 placeholders)"),
  params: z
    .array(z.unknown())
    .optional()
    .describe("Parameters for WHERE clause placeholders"),
  condition: z.string().optional().describe("Alias for where"),
  filter: z.string().optional().describe("Alias for where"),
  column: z
    .string()
    .optional()
    .describe("Column to count (default: * for all rows)"),
});

/**
 * Preprocess count params:
 * - All table params from preprocessTableParams
 * - Alias: condition/filter → where
 */
function preprocessCountParams(input: unknown): unknown {
  const result = preprocessTableParams(input);
  if (typeof result !== "object" || result === null) return result;
  const obj = result as Record<string, unknown>;

  // Alias: condition/filter → where
  if (obj["where"] === undefined) {
    if (obj["condition"] !== undefined) obj["where"] = obj["condition"];
    else if (obj["filter"] !== undefined) obj["where"] = obj["filter"];
  }

  return obj;
}

// Internal parsing schema - table optional for alias resolution
const CountParseSchema = z.object({
  table: z
    .string()
    .optional()
    .describe("Table name (supports schema.table format)"),
  tableName: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  where: z
    .string()
    .optional()
    .describe("WHERE clause (supports $1, $2 placeholders)"),
  params: z
    .array(z.unknown())
    .optional()
    .describe("Parameters for WHERE clause placeholders"),
  condition: z.string().optional().describe("Alias for where"),
  filter: z.string().optional().describe("Alias for where"),
  column: z
    .string()
    .optional()
    .describe("Column to count (default: * for all rows)"),
});

export const CountSchema = z
  .preprocess(
    (val: unknown) => preprocessCountParams(val ?? {}),
    CountParseSchema,
  )
  .transform((data) => ({
    ...data,
    table: data.table ?? data.tableName ?? "",
    where: data.where ?? data.condition ?? data.filter,
  }))
  .refine((data) => data.table !== "", {
    message:
      'table (or tableName alias) is required. Usage: pg_count({ table: "users" }) or pg_count({ table: "users", where: "active = true" })',
  });

// =============================================================================
// Exists Schema
// =============================================================================

// MCP visibility schema - table OR tableName required
export const ExistsSchemaBase = z.object({
  table: z
    .string()
    .optional()
    .describe("Table name (supports schema.table format)"),
  tableName: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  where: z
    .string()
    .optional()
    .describe("WHERE clause (supports $1, $2 placeholders)"),
  params: z
    .array(z.unknown())
    .optional()
    .describe("Parameters for WHERE clause placeholders"),
  condition: z.string().optional().describe("Alias for where"),
  filter: z.string().optional().describe("Alias for where"),
});

// Internal parsing schema - table optional for alias resolution
const ExistsParseSchema = z.object({
  table: z
    .string()
    .optional()
    .describe("Table name (supports schema.table format)"),
  tableName: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  where: z
    .string()
    .optional()
    .describe("WHERE clause (supports $1, $2 placeholders)"),
  params: z
    .array(z.unknown())
    .optional()
    .describe("Parameters for WHERE clause placeholders"),
  condition: z.string().optional().describe("Alias for where"),
  filter: z.string().optional().describe("Alias for where"),
});

/**
 * Preprocess exists params:
 * - All table params from preprocessTableParams
 * - Alias: condition/filter → where
 */
function preprocessExistsParams(input: unknown): unknown {
  const result = preprocessTableParams(input);
  if (typeof result !== "object" || result === null) return result;
  const obj = result as Record<string, unknown>;

  // Alias: condition/filter → where
  if (obj["where"] === undefined) {
    if (obj["condition"] !== undefined) obj["where"] = obj["condition"];
    else if (obj["filter"] !== undefined) obj["where"] = obj["filter"];
  }

  return obj;
}

export const ExistsSchema = z
  .preprocess(preprocessExistsParams, ExistsParseSchema)
  .transform((data) => ({
    ...data,
    table: data.table ?? data.tableName ?? "",
    where: data.where ?? data.condition ?? data.filter,
  }))
  .refine((data) => data.table !== "", {
    message:
      'table (or tableName alias) is required. Usage: pg_exists({ table: "users" }) or pg_exists({ table: "users", where: "id = 1" })',
  });

// =============================================================================
// Truncate Schema
// =============================================================================

// MCP visibility schema - table OR tableName required
export const TruncateSchemaBase = z.object({
  table: z
    .string()
    .optional()
    .describe("Table name (supports schema.table format)"),
  tableName: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  cascade: z
    .boolean()
    .optional()
    .describe("Use CASCADE to truncate dependent tables"),
  restartIdentity: z
    .boolean()
    .optional()
    .describe("Restart identity sequences"),
});

// Internal parsing schema - table optional for alias resolution
const TruncateParseSchema = z.object({
  table: z
    .string()
    .optional()
    .describe("Table name (supports schema.table format)"),
  tableName: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  cascade: z
    .boolean()
    .optional()
    .describe("Use CASCADE to truncate dependent tables"),
  restartIdentity: z
    .boolean()
    .optional()
    .describe("Restart identity sequences"),
});

export const TruncateSchema = z
  .preprocess(preprocessTableParams, TruncateParseSchema)
  .transform((data) => ({
    ...data,
    table: data.table ?? data.tableName ?? "",
  }))
  .refine((data) => data.table !== "", {
    message:
      'table (or tableName alias) is required. Usage: pg_truncate({ table: "logs" }) or pg_truncate({ table: "logs", cascade: true })',
  });
