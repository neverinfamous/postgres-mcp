/**
 * postgres-mcp - Schema Management Tool Schemas
 *
 * Input validation schemas for schema, sequence, and view management.
 */

import { z } from "zod";
import { ErrorResponseFields } from "./error-response-fields.js";
import { coerceNumber, coerceStrictNumber } from "../../../utils/query-helpers.js";

// Base schema for MCP visibility — name is optional so MCP framework
// doesn't reject {} calls; handler validates via the full schema.
export const CreateSchemaSchemaBase = z.object({
  name: z.string().optional().describe("Schema name"),
  schema: z.string().optional().describe("Alias for name"),
  authorization: z.string().optional().describe("Owner role"),
  ifNotExists: z.boolean().optional().describe("Use IF NOT EXISTS"),
});

function preprocessCreateSchemaParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const result = { ...(input as Record<string, unknown>) };

  if (result["name"] === undefined && result["schema"] !== undefined) {
    result["name"] = result["schema"];
  }
  return result;
}

// Full schema parsed inside the handler
export const CreateSchemaSchema = z
  .preprocess(preprocessCreateSchemaParams, CreateSchemaSchemaBase)
  .transform((data) => ({
    name: data.name ?? data.schema ?? "",
    authorization: data.authorization,
    ifNotExists: data.ifNotExists,
  }))
  .refine((data) => data.name !== "", {
    message: "name (or schema alias) is required",
  });

// Base schema for MCP visibility — name is optional
export const DropSchemaSchemaBase = z.object({
  name: z.string().optional().describe("Schema name"),
  cascade: z.boolean().optional().describe("Drop objects in schema"),
  ifExists: z.boolean().optional().describe("Use IF EXISTS"),
});

// Full schema parsed inside the handler
export const DropSchemaSchema = z
  .preprocess((val: unknown) => val ?? {}, DropSchemaSchemaBase)
  .refine((data) => typeof data.name === "string" && data.name.length > 0, {
    message: "name is required",
  });

// Base schema for MCP visibility (shows both name and sequenceName)
// Exported so MCP Direct Tool Calls can show parameter schema
export const CreateSequenceSchemaBase = z.object({
  name: z.string().optional().describe("Sequence name"),
  sequenceName: z.string().optional().describe("Alias for name"),
  schema: z.string().optional().describe("Schema name"),
  start: z.unknown().optional().describe("Start value (number)"),
  increment: z.unknown().optional().describe("Increment by (number, default: 1)"),
  minValue: z.unknown().optional().describe("Minimum value (number)"),
  maxValue: z.unknown().optional().describe("Maximum value (number)"),
  cache: z
    .unknown()
    .optional()
    .describe("Number of sequence values to pre-allocate (number, default: 1)"),
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
 * Extract schema from dotted name format (e.g., "myschema.myname" → schema="myschema", name="myname").
 * Shared across all schema-mgmt preprocessing functions.
 */
function extractSchemaFromDottedName(
  result: Record<string, unknown>,
  nameField = "name",
): Record<string, unknown> {
  const nameVal = result[nameField];
  if (
    typeof nameVal === "string" &&
    nameVal.includes(".") &&
    result["schema"] === undefined
  ) {
    const parts = nameVal.split(".");
    if (parts.length === 2) {
      result["schema"] = parts[0];
      result[nameField] = parts[1];
    }
  }
  return result;
}

/**
 * Preprocess sequence create params to handle schema.name format
 */
function preprocessCreateSequenceParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const result = { ...(input as Record<string, unknown>) };

  // Resolve sequenceName alias to name before dotted-name extraction
  if (result["name"] === undefined && result["sequenceName"] !== undefined) {
    result["name"] = result["sequenceName"];
  }

  return extractSchemaFromDottedName(result);
}

// Transformed schema with alias resolution and schema.name preprocessing
export const CreateSequenceSchema = z.preprocess(
  preprocessCreateSequenceParams,
  z.object({
    name: z.string().optional(),
    sequenceName: z.string().optional(),
    schema: z.string().optional(),
    start: z.preprocess(coerceStrictNumber, z.number().optional()),
    increment: z.preprocess(coerceStrictNumber, z.number().optional()),
    minValue: z.preprocess(coerceStrictNumber, z.number().optional()),
    maxValue: z.preprocess(coerceStrictNumber, z.number().optional()),
    cache: z.preprocess(coerceStrictNumber, z.number().optional()),
    cycle: z.boolean().optional(),
    ownedBy: z.string().optional(),
    ifNotExists: z.boolean().optional(),
  }).transform((data) => ({
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
  view: z.string().optional().describe("Alias for name"),
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

  // Resolve viewName/view alias to name before dotted-name extraction
  if (result["name"] === undefined) {
    if (result["viewName"] !== undefined) {
      result["name"] = result["viewName"];
    } else if (result["view"] !== undefined) {
      result["name"] = result["view"];
    }
  }

  return extractSchemaFromDottedName(result);
}

// Transformed schema with alias resolution and schema.name preprocessing
export const CreateViewSchema = z
  .preprocess(preprocessCreateViewParams, CreateViewSchemaBase)
  .transform((data) => ({
    name: data.name ?? data.viewName ?? data.view ?? "",
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
  name: z
    .string()
    .optional()
    .describe("Sequence name (supports schema.name format)"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  ifExists: z.boolean().optional().describe("Use IF EXISTS to avoid errors"),
  cascade: z.boolean().optional().describe("Drop dependent objects"),
});

/**
 * Preprocess sequence drop params to handle schema.name format
 */
function preprocessDropSequenceParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  return extractSchemaFromDottedName({ ...(input as Record<string, unknown>) });
}

/**
 * Full schema with preprocessing for alias support.
 */
export const DropSequenceSchema = z
  .preprocess(preprocessDropSequenceParams, DropSequenceSchemaBase)
  .refine((data) => typeof data.name === "string" && data.name.length > 0, {
    message: "name is required",
  });

/**
 * Base schema for dropping views - used for MCP inputSchema visibility.
 */
export const DropViewSchemaBase = z.object({
  name: z
    .string()
    .optional()
    .describe("View name (supports schema.name format)"),
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
  return extractSchemaFromDottedName({ ...(input as Record<string, unknown>) });
}

/**
 * Full schema with preprocessing for alias support.
 */
export const DropViewSchema = z
  .preprocess(preprocessDropViewParams, DropViewSchemaBase)
  .refine((data) => typeof data.name === "string" && data.name.length > 0, {
    message: "name is required",
  });

// =============================================================================
// List Functions Schema - Split Schema pattern for MCP visibility
// =============================================================================

export const ListSequencesSchemaBase = z.object({
  schema: z.string().optional().describe("Schema name"),
  limit: z.unknown().optional().describe("Maximum number of sequences to return (number, default: 50). Use 0 for all."),
});

export const ListSequencesSchema = z.preprocess((input: unknown) => {
  const val = input ?? {};
  if (typeof val !== "object" || val === null) return val;
  const result = { ...(val as Record<string, unknown>) };
  return result;
}, z.object({
  schema: z.string().optional(),
  limit: z.preprocess(coerceNumber, z.number().optional()),
}));

export const ListViewsSchemaBase = z.object({
  schema: z.string().optional().describe("Schema name"),
  includeMaterialized: z.boolean().optional().describe("Whether to include materialized views"),
  truncateDefinition: z.unknown().optional().describe("Max length for view definitions (number, default: 500). Use 0 for no truncation."),
  limit: z.unknown().optional().describe("Maximum number of views to return (number, default: 50). Use 0 for all views."),
});

export const ListViewsSchema = z.preprocess((input: unknown) => {
  const val = input ?? {};
  if (typeof val !== "object" || val === null) return val;
  const result = { ...(val as Record<string, unknown>) };
  return result;
}, z.object({
  schema: z.string().optional(),
  includeMaterialized: z.boolean().optional(),
  truncateDefinition: z.preprocess(coerceNumber, z.number().optional()),
  limit: z.preprocess(coerceNumber, z.number().optional()),
}));

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
  limit: z
    .unknown()
    .optional()
    .describe(
      "Max results (number, default: 50). Increase for databases with many extensions.",
    ),
});

/**
 * Full schema with preprocessing that handles null/undefined params.
 * Used in the handler for validation.
 */
export const ListFunctionsSchema = z.preprocess(
  (val: unknown) => val ?? {},
  z.object({
    schema: z.string().optional(),
    exclude: z.array(z.string()).optional(),
    language: z.string().optional(),
    limit: z.preprocess(coerceNumber, z.number().optional()),
  })
);

// =============================================================================
// List Triggers Schema - Split Schema pattern for MCP visibility
// =============================================================================

export const ListTriggersSchemaBase = z.object({
  schema: z.string().optional().describe("Schema name"),
  table: z.string().optional().describe("Table name"),
  limit: z.unknown().optional().describe("Maximum number of triggers to return (number, default: 50). Use 0 for all."),
});

export const ListTriggersSchema = z.preprocess(
  (val: unknown) => val ?? {},
  z.object({
    schema: z.string().optional(),
    table: z.string().optional(),
    limit: z.preprocess(coerceNumber, z.number().optional()),
  })
);

// =============================================================================
// List Constraints Schema - Split Schema pattern for MCP visibility
// =============================================================================

export const ListConstraintsSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  schema: z.string().optional().describe("Schema name"),
  type: z
    .string()
    .optional()
    .describe(
      "Constraint type filter: 'primary_key', 'foreign_key', 'unique', 'check'",
    ),
  limit: z.unknown().optional().describe("Maximum number of constraints to return (number, default: 50). Use 0 for all."),
});

export const ListConstraintsSchema = z.preprocess(
  (val: unknown) => val ?? {},
  z.object({
    table: z.string().optional(),
    schema: z.string().optional(),
    type: z.string().optional(),
    limit: z.preprocess(coerceNumber, z.number().optional()),
  })
);

// ============================================================================
// Output Schemas
// ============================================================================

/**
 * pg_list_schemas output
 */
export const ListSchemasOutputSchema = z.object({
  schemas: z.array(z.string()).optional().describe("Schema names"),
  count: z.number().optional().describe("Number of schemas"),
}).extend(ErrorResponseFields.shape);

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
    limit: z.number().optional().describe("Limit used"),
    note: z.string().optional().describe("Note about truncation"),
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
    limit: z.number().optional().describe("Limit used"),
    note: z.string().optional().describe("Note about truncation"),
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if operation failed"),
  })
  .loose();
