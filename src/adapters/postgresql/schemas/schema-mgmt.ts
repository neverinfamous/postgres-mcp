/**
 * postgres-mcp - Schema Management Tool Schemas
 *
 * Input validation schemas for schema, sequence, and view management.
 */

import { z } from "zod";

export const CreateSchemaSchema = z.object({
  name: z.string().describe("Schema name"),
  authorization: z.string().optional().describe("Owner role"),
  ifNotExists: z.boolean().optional().describe("Use IF NOT EXISTS"),
});

export const DropSchemaSchema = z.object({
  name: z.string().describe("Schema name"),
  cascade: z.boolean().optional().describe("Drop objects in schema"),
  ifExists: z.boolean().optional().describe("Use IF EXISTS"),
});

// Base schema for MCP visibility (shows both name and sequenceName)
// Exported so MCP Direct Tool Calls can show parameter schema
export const CreateSequenceSchemaBase = z.object({
  name: z.string().optional().describe("Sequence name"),
  sequenceName: z.string().optional().describe("Alias for name"),
  schema: z.string().optional().describe("Schema name"),
  start: z.coerce.number().optional().describe("Start value"),
  increment: z.coerce.number().optional().describe("Increment by (default: 1)"),
  minValue: z.coerce.number().optional().describe("Minimum value"),
  maxValue: z.coerce.number().optional().describe("Maximum value"),
  cache: z.coerce
    .number()
    .optional()
    .describe("Number of sequence values to pre-allocate (default: 1)"),
  cycle: z
    .boolean()
    .optional()
    .describe("Cycle when limit reached (default: no cycle)"),
  ownedBy: z
    .string()
    .optional()
    .describe(
      "Column that owns this sequence (format: table.column or schema.table.column)",
    ),
  ifNotExists: z
    .boolean()
    .optional()
    .describe("Use IF NOT EXISTS to avoid error if sequence already exists"),
});

/**
 * Preprocess sequence create params to handle schema.name format
 */
function preprocessCreateSequenceParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const result = { ...(input as Record<string, unknown>) };

  // Get the name from either name or sequenceName
  const nameVal = result["name"] ?? result["sequenceName"];
  if (
    typeof nameVal === "string" &&
    nameVal.includes(".") &&
    result["schema"] === undefined
  ) {
    const parts = nameVal.split(".");
    if (parts.length === 2) {
      result["schema"] = parts[0];
      result["name"] = parts[1];
    }
  }

  return result;
}

// Transformed schema with alias resolution and schema.name preprocessing
export const CreateSequenceSchema = z.preprocess(
  preprocessCreateSequenceParams,
  CreateSequenceSchemaBase.transform((data) => ({
    name: data.name ?? data.sequenceName ?? "",
    schema: data.schema,
    start: data.start,
    increment: data.increment,
    minValue: data.minValue,
    maxValue: data.maxValue,
    cache: data.cache,
    cycle: data.cycle,
    ownedBy: data.ownedBy,
    ifNotExists: data.ifNotExists,
  })).refine((data) => data.name !== "", {
    message: "name (or sequenceName alias) is required",
  }),
);

// Valid checkOption values for views
const CHECK_OPTION_VALUES = ["cascaded", "local", "none"] as const;

// Base schema for MCP visibility (shows both name and viewName, query/sql/definition)
// Exported so MCP Direct Tool Calls can show parameter schema
export const CreateViewSchemaBase = z.object({
  name: z
    .string()
    .optional()
    .describe("View name (supports schema.name format)"),
  viewName: z.string().optional().describe("Alias for name"),
  schema: z.string().optional().describe("Schema name"),
  query: z.string().optional().describe("SELECT query for view"),
  sql: z.string().optional().describe("Alias for query"),
  definition: z.string().optional().describe("Alias for query"),
  materialized: z.boolean().optional().describe("Create materialized view"),
  orReplace: z.boolean().optional().describe("Replace if exists"),
  checkOption: z
    .enum(CHECK_OPTION_VALUES)
    .optional()
    .describe("WITH CHECK OPTION: 'cascaded', 'local', or 'none'"),
});

/**
 * Preprocess view create params to handle schema.name format
 */
function preprocessCreateViewParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const result = { ...(input as Record<string, unknown>) };

  // Get the name from either name or viewName
  const nameVal = result["name"] ?? result["viewName"];
  if (
    typeof nameVal === "string" &&
    nameVal.includes(".") &&
    result["schema"] === undefined
  ) {
    const parts = nameVal.split(".");
    if (parts.length === 2) {
      result["schema"] = parts[0];
      result["name"] = parts[1];
    }
  }

  return result;
}

// Transformed schema with alias resolution and schema.name preprocessing
export const CreateViewSchema = z
  .preprocess(preprocessCreateViewParams, CreateViewSchemaBase)
  .transform((data) => ({
    name: data.name ?? data.viewName ?? "",
    schema: data.schema,
    query: data.query ?? data.sql ?? data.definition ?? "",
    materialized: data.materialized,
    orReplace: data.orReplace,
    checkOption: data.checkOption,
  }))
  .refine((data) => data.name !== "", {
    message: "name (or viewName alias) is required",
  })
  .refine((data) => data.query !== "", {
    message: "query (or sql/definition alias) is required",
  });

// =============================================================================
// Drop Schemas - Split Schema pattern for MCP visibility
// =============================================================================

/**
 * Base schema for dropping sequences - used for MCP inputSchema visibility.
 */
export const DropSequenceSchemaBase = z.object({
  name: z.string().describe("Sequence name (supports schema.name format)"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  ifExists: z.boolean().optional().describe("Use IF EXISTS to avoid errors"),
  cascade: z.boolean().optional().describe("Drop dependent objects"),
});

/**
 * Preprocess sequence drop params to handle schema.name format
 */
function preprocessDropSequenceParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const result = { ...(input as Record<string, unknown>) };

  // Parse schema.name format
  if (
    typeof result["name"] === "string" &&
    result["name"].includes(".") &&
    result["schema"] === undefined
  ) {
    const parts = result["name"].split(".");
    if (parts.length === 2) {
      result["schema"] = parts[0];
      result["name"] = parts[1];
    }
  }

  return result;
}

/**
 * Full schema with preprocessing for alias support.
 */
export const DropSequenceSchema = z.preprocess(
  preprocessDropSequenceParams,
  DropSequenceSchemaBase,
);

/**
 * Base schema for dropping views - used for MCP inputSchema visibility.
 */
export const DropViewSchemaBase = z.object({
  name: z.string().describe("View name (supports schema.name format)"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  materialized: z
    .boolean()
    .optional()
    .describe("Whether the view is materialized"),
  ifExists: z.boolean().optional().describe("Use IF EXISTS to avoid errors"),
  cascade: z.boolean().optional().describe("Drop dependent objects"),
});

/**
 * Preprocess view drop params to handle schema.name format
 */
function preprocessDropViewParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const result = { ...(input as Record<string, unknown>) };

  // Parse schema.name format
  if (
    typeof result["name"] === "string" &&
    result["name"].includes(".") &&
    result["schema"] === undefined
  ) {
    const parts = result["name"].split(".");
    if (parts.length === 2) {
      result["schema"] = parts[0];
      result["name"] = parts[1];
    }
  }

  return result;
}

/**
 * Full schema with preprocessing for alias support.
 */
export const DropViewSchema = z.preprocess(
  preprocessDropViewParams,
  DropViewSchemaBase,
);

// =============================================================================
// List Functions Schema - Split Schema pattern for MCP visibility
// =============================================================================

/**
 * Base schema for listing functions - used for MCP inputSchema visibility.
 * All parameters are visible to MCP clients.
 */
export const ListFunctionsSchemaBase = z.object({
  schema: z.string().optional().describe("Filter to specific schema"),
  exclude: z
    .array(z.string())
    .optional()
    .describe(
      'Array of extension names/schemas to exclude, e.g., ["postgis", "ltree", "pgcrypto", "vector"]',
    ),
  language: z
    .string()
    .optional()
    .describe('Filter by language (e.g., "plpgsql", "sql", "c")'),
  limit: z.coerce
    .number()
    .optional()
    .describe(
      "Max results (default: 500). Increase for databases with many extensions.",
    ),
});

/**
 * Full schema with preprocessing that handles null/undefined params.
 * Used in the handler for validation.
 */
export const ListFunctionsSchema = z.preprocess(
  (val: unknown) => val ?? {},
  ListFunctionsSchemaBase,
);

// ============================================================================
// Output Schemas
// ============================================================================

/**
 * pg_list_schemas output
 */
export const ListSchemasOutputSchema = z.object({
  schemas: z.array(z.string()).describe("Schema names"),
  count: z.number().describe("Number of schemas"),
});

/**
 * pg_create_schema output
 */
export const CreateSchemaOutputSchema = z
  .object({
    success: z.boolean().describe("Whether the operation succeeded"),
    schema: z.string().optional().describe("Schema name"),
    alreadyExisted: z
      .boolean()
      .optional()
      .describe("True if schema already existed"),
    error: z.string().optional().describe("Error message if operation failed"),
  })
  .loose();

/**
 * pg_drop_schema output
 */
export const DropSchemaOutputSchema = z
  .object({
    success: z.boolean().describe("Whether the operation succeeded"),
    schema: z.string().optional().describe("Schema name"),
    existed: z
      .boolean()
      .optional()
      .describe("Whether the schema existed before drop"),
    note: z.string().optional().describe("Note when schema did not exist"),
    error: z.string().optional().describe("Error message if operation failed"),
  })
  .loose();

/**
 * pg_list_sequences output
 */
export const ListSequencesOutputSchema = z
  .object({
    sequences: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Sequence list"),
    count: z.number().optional().describe("Number of sequences"),
    truncated: z
      .boolean()
      .optional()
      .describe("Whether results were truncated"),
    totalCount: z
      .number()
      .optional()
      .describe("Total number of sequences when truncated"),
    note: z.string().optional().describe("Note about truncation"),
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if operation failed"),
  })
  .loose();

/**
 * pg_create_sequence output
 */
export const CreateSequenceOutputSchema = z
  .object({
    success: z.boolean().describe("Whether the operation succeeded"),
    sequence: z.string().optional().describe("Sequence name (schema.name)"),
    ifNotExists: z
      .boolean()
      .optional()
      .describe("Whether IF NOT EXISTS was used"),
    alreadyExisted: z
      .boolean()
      .optional()
      .describe("True if sequence already existed"),
    error: z.string().optional().describe("Error message if operation failed"),
  })
  .loose();

/**
 * pg_drop_sequence output
 */
export const DropSequenceOutputSchema = z
  .object({
    success: z.boolean().describe("Whether the operation succeeded"),
    sequence: z.string().optional().describe("Sequence name"),
    existed: z
      .boolean()
      .optional()
      .describe("Whether the sequence existed before drop"),
    error: z.string().optional().describe("Error message if operation failed"),
  })
  .loose();

/**
 * pg_list_views output
 */
export const ListViewsOutputSchema = z
  .object({
    views: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("View list"),
    count: z.number().optional().describe("Number of views"),
    hasMatViews: z
      .boolean()
      .optional()
      .describe("Whether materialized views were found"),
    truncatedDefinitions: z
      .number()
      .optional()
      .describe("Number of truncated definitions"),
    truncated: z
      .boolean()
      .optional()
      .describe("Whether results were truncated"),
    totalCount: z
      .number()
      .optional()
      .describe("Total number of views when truncated"),
    note: z.string().optional().describe("Note about truncation"),
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if operation failed"),
  })
  .loose();

/**
 * pg_create_view output
 */
export const CreateViewOutputSchema = z
  .object({
    success: z.boolean().describe("Whether the operation succeeded"),
    view: z.string().optional().describe("View name (schema.name)"),
    materialized: z
      .boolean()
      .optional()
      .describe("Whether view is materialized"),
    alreadyExisted: z
      .boolean()
      .optional()
      .describe("True if view already existed"),
    error: z.string().optional().describe("Error message if operation failed"),
  })
  .loose();

/**
 * pg_drop_view output
 */
export const DropViewOutputSchema = z
  .object({
    success: z.boolean().describe("Whether the operation succeeded"),
    view: z.string().optional().describe("View name"),
    materialized: z
      .boolean()
      .optional()
      .describe("Whether view was materialized"),
    existed: z
      .boolean()
      .optional()
      .describe("Whether the view existed before drop"),
    error: z.string().optional().describe("Error message if operation failed"),
  })
  .loose();

/**
 * pg_list_functions output
 */
export const ListFunctionsOutputSchema = z
  .object({
    functions: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Function list"),
    count: z.number().optional().describe("Number of functions"),
    limit: z.number().optional().describe("Limit used"),
    note: z.string().optional().describe("Note about truncation"),
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if operation failed"),
  })
  .loose();

/**
 * pg_list_triggers output
 */
export const ListTriggersOutputSchema = z
  .object({
    triggers: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Trigger list"),
    count: z.number().optional().describe("Number of triggers"),
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if operation failed"),
  })
  .loose();

/**
 * pg_list_constraints output
 */
export const ListConstraintsOutputSchema = z
  .object({
    constraints: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Constraint list"),
    count: z.number().optional().describe("Number of constraints"),
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if operation failed"),
  })
  .loose();
