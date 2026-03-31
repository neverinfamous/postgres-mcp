/**
 * postgres-mcp - Admin Tool Schemas
 *
 * Input validation schemas for database administration operations.
 *
 * DUAL-SCHEMA PATTERN:
 * Base schemas (*SchemaBase) are exported for MCP visibility (shows parameters).
 * Preprocess schemas (*Schema) are used by handlers for validation + alias resolution.
 */

import { z } from "zod";
import { ErrorResponseFields } from "./error-response-fields.js";

/**
 * Preprocess vacuum/analyze parameters:
 * - Alias: tableName → table
 * - Parse schema.table format (e.g., 'public.users' → { schema: 'public', table: 'users' })
 */
function preprocessTableParams(input: unknown): unknown {
  if (input === null || input === undefined) {
    return {};
  }
  if (typeof input !== "object") {
    return input;
  }
  const result = { ...(input as Record<string, unknown>) };

  // Alias: tableName → table
  if (result["tableName"] !== undefined && result["table"] === undefined) {
    result["table"] = result["tableName"];
  }

  // Parse schema.table format
  const tableVal = result["table"];
  if (typeof tableVal === "string" && tableVal.includes(".")) {
    const parts = tableVal.split(".");
    if (parts.length === 2 && parts[0] !== "" && parts[1] !== "") {
      // Only override schema if not explicitly provided
      if (result["schema"] === undefined) {
        result["schema"] = parts[0];
      }
      result["table"] = parts[1];
    }
  }

  return result;
}

// ============== VACUUM SCHEMA ==============
// Base schema for MCP visibility
export const VacuumSchemaBase = z.object({
  table: z.string().optional().describe("Table name (all tables if omitted)"),
  tableName: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name"),
  full: z.boolean().optional().describe("Full vacuum (rewrites table)"),
  analyze: z.boolean().optional().describe("Update statistics"),
  verbose: z.boolean().optional().describe("Print progress"),
});

// Preprocess schema for handlers (resolves aliases and parses schema.table)
export const VacuumSchema = z.preprocess(
  preprocessTableParams,
  z.object({
    table: z.string().optional().describe("Table name (all tables if omitted)"),
    schema: z.string().optional().describe("Schema name"),
    full: z.boolean().optional().describe("Full vacuum (rewrites table)"),
    analyze: z.boolean().optional().describe("Update statistics"),
    verbose: z.boolean().optional().describe("Print progress"),
  }),
);

// Output schema for MCP 2025-11-25 structuredContent
export const VacuumOutputSchema = z.object({
  success: z.boolean().describe("Whether the vacuum operation succeeded"),
  message: z.string().optional().describe("Human-readable result message"),
  error: z.string().optional().describe("Error message if operation failed"),
  table: z.string().optional().describe("Table that was vacuumed"),
  schema: z.string().optional().describe("Schema of the table"),
  hint: z.string().optional().describe("Additional information"),
}).extend(ErrorResponseFields.shape);

// ============== ANALYZE SCHEMA ==============
// Base schema for MCP visibility
export const AnalyzeSchemaBase = z.object({
  table: z.string().optional().describe("Table name (all tables if omitted)"),
  tableName: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name"),
  columns: z
    .array(z.string())
    .optional()
    .describe("Specific columns to analyze"),
});

// Preprocess schema for handlers (resolves aliases and parses schema.table)
export const AnalyzeSchema = z.preprocess(
  preprocessTableParams,
  z.object({
    table: z.string().optional().describe("Table name (all tables if omitted)"),
    schema: z.string().optional().describe("Schema name"),
    columns: z
      .array(z.string())
      .optional()
      .describe("Specific columns to analyze"),
  }),
);

// ============== REINDEX SCHEMA ==============
/**
 * Preprocess reindex parameters:
 * - Alias: tableName/table/indexName → name
 */
function preprocessReindexParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  const result = { ...(input as Record<string, unknown>) };
  // Alias: tableName → name
  if (result["tableName"] !== undefined && result["name"] === undefined) {
    result["name"] = result["tableName"];
  }
  // Alias: table → name (when target is 'table')
  if (result["table"] !== undefined && result["name"] === undefined) {
    result["name"] = result["table"];
  }
  // Alias: indexName → name (when target is 'index')
  if (result["indexName"] !== undefined && result["name"] === undefined) {
    result["name"] = result["indexName"];
  }
  return result;
}

// Base schema for MCP visibility (shows all parameters including aliases)
export const ReindexSchemaBase = z.object({
  target: z
    .string()
    .optional()
    .describe("What to reindex (table, index, schema, database)"),
  name: z
    .string()
    .optional()
    .describe(
      "Name of table/index/schema (defaults to current database when target is database)",
    ),
  table: z
    .string()
    .optional()
    .describe("Alias for name (when target is table)"),
  tableName: z.string().optional().describe("Alias for name"),
  indexName: z
    .string()
    .optional()
    .describe("Alias for name (when target is index)"),
  concurrently: z.boolean().optional().describe("Reindex concurrently"),
});

// Preprocess schema for handlers (resolves aliases, name is now optional for database target)
export const ReindexSchema = z
  .preprocess(
    preprocessReindexParams,
    z.object({
      target: z
        .string()
        .describe("What to reindex (table, index, schema, database)"),
      name: z
        .string()
        .optional()
        .describe(
          "Name of table/index/schema (defaults to current database when target is database)",
        ),
      concurrently: z.boolean().optional().describe("Reindex concurrently"),
    }),
  )
  .refine(
    (data) => {
      const validTargets = ["table", "index", "schema", "database"];
      const parsed = data as { target: string; name?: string };
      if (!validTargets.includes(parsed.target)) {
        return false;
      }
      return true;
    },
    {
      message: "target must be one of 'table', 'index', 'schema', or 'database'",
    }
  )
  .refine(
    (data) => {
      // name is required for table, index, and schema targets
      const parsed = data as { target: string; name?: string };
      if (parsed.target !== "database" && parsed.name === undefined) {
        return false;
      }
      return true;
    },
    {
      message: "name is required when target is table, index, or schema",
    },
  );

// ============== TERMINATE/CANCEL BACKEND SCHEMAS ==============
/**
 * Preprocess backend PID parameters:
 * - Alias: processId → pid
 */
function preprocessPidParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  const result = { ...(input as Record<string, unknown>) };
  // Alias: processId → pid
  if (result["processId"] !== undefined && result["pid"] === undefined) {
    result["pid"] = result["processId"];
  }
  return result;
}

// Base schema for MCP visibility (shows pid and alias)
export const TerminateBackendSchemaBase = z.object({
  pid: z.number().optional().describe("Process ID to terminate"),
  processId: z.number().optional().describe("Alias for pid"),
});

// Preprocess schema for handlers
export const TerminateBackendSchema = z.preprocess(
  preprocessPidParams,
  z.object({
    pid: z.number().describe("Process ID to terminate"),
  }),
);

// Base schema for MCP visibility (shows pid and alias)
export const CancelBackendSchemaBase = z.object({
  pid: z.number().optional().describe("Process ID to cancel"),
  processId: z.number().optional().describe("Alias for pid"),
});

// Preprocess schema for handlers
export const CancelBackendSchema = z.preprocess(
  preprocessPidParams,
  z.object({
    pid: z.number().describe("Process ID to cancel"),
  }),
);

// ============== CONFIG SCHEMAS ==============
export const ReloadConfSchemaBase = z.object({});
export const ResetStatsSchemaBase = z.object({});

/**
 * Preprocess set_config parameters:
 * - Alias: param/setting → name
 */
function preprocessSetConfigParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  const result = { ...(input as Record<string, unknown>) };
  if (result["param"] !== undefined && result["name"] === undefined) {
    result["name"] = result["param"];
  }
  if (result["setting"] !== undefined && result["name"] === undefined) {
    result["name"] = result["setting"];
  }
  return result;
}

// Base schema for MCP visibility (shows all parameters and aliases)
export const SetConfigSchemaBase = z.object({
  name: z.string().optional().describe("Configuration parameter name"),
  param: z.string().optional().describe("Alias for name"),
  setting: z.string().optional().describe("Alias for name"),
  value: z.string().optional().describe("New value"),
  isLocal: z.boolean().optional().describe("Apply only to current transaction"),
});

// Preprocess schema for handlers
export const SetConfigSchema = z.preprocess(
  preprocessSetConfigParams,
  z.object({
    name: z.string().describe("Configuration parameter name"),
    value: z.string().describe("New value"),
    isLocal: z
      .boolean()
      .optional()
      .describe("Apply only to current transaction"),
  }),
);

// ============== CLUSTER SCHEMA ==============
/**
 * Preprocess cluster parameters:
 * - Alias: tableName → table
 * - Alias: indexName → index
 * - Handle undefined input for database-wide CLUSTER
 */
function preprocessClusterParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return {};
  }
  const result = { ...(input as Record<string, unknown>) };
  if (result["tableName"] !== undefined && result["table"] === undefined) {
    result["table"] = result["tableName"];
  }
  if (result["indexName"] !== undefined && result["index"] === undefined) {
    result["index"] = result["indexName"];
  }

  const tableVal = result["table"];
  if (typeof tableVal === "string" && tableVal.includes(".")) {
    const parts = tableVal.split(".");
    if (parts.length === 2 && parts[0] !== "" && parts[1] !== "") {
      if (result["schema"] === undefined) {
        result["schema"] = parts[0];
      }
      result["table"] = parts[1];
    }
  }

  return result;
}

// Base schema for MCP visibility (shows all parameters and aliases)
export const ClusterSchemaBase = z.object({
  table: z
    .string()
    .optional()
    .describe("Table name (all previously-clustered tables if omitted)"),
  tableName: z.string().optional().describe("Alias for table"),
  index: z
    .string()
    .optional()
    .describe("Index to cluster on (required when table specified)"),
  indexName: z.string().optional().describe("Alias for index"),
  schema: z.string().optional().describe("Schema name"),
});

// Preprocess schema for handlers (table/index are optional for database-wide CLUSTER)
export const ClusterSchema = z
  .preprocess(
    preprocessClusterParams,
    z.object({
      table: z
        .string()
        .optional()
        .describe("Table name (all previously-clustered tables if omitted)"),
      index: z
        .string()
        .optional()
        .describe("Index to cluster on (required when table specified)"),
      schema: z.string().optional(),
    }),
  )
  .refine(
    (data) => {
      // table and index must both be specified or both be omitted
      const parsed = data as { table?: string; index?: string };
      const hasTable = parsed.table !== undefined;
      const hasIndex = parsed.index !== undefined;
      // Both must be present or both absent
      return hasTable === hasIndex;
    },
    {
      message:
        "table and index must both be specified together, or both omitted for database-wide re-cluster",
    },
  );

// ============== OUTPUT SCHEMAS (MCP 2025-11-25 structuredContent) ==============

// Output schema for ANALYZE operations
export const AnalyzeOutputSchema = z.object({
  success: z.boolean().describe("Whether the analyze operation succeeded"),
  message: z.string().optional().describe("Human-readable result message"),
  error: z.string().optional().describe("Error message if operation failed"),
  table: z.string().optional().describe("Table that was analyzed"),
  schema: z.string().optional().describe("Schema of the table"),
  hint: z.string().optional().describe("Additional information"),
}).extend(ErrorResponseFields.shape);

// Output schema for REINDEX operations
export const ReindexOutputSchema = z.object({
  success: z.boolean().describe("Whether the reindex operation succeeded"),
  message: z.string().optional().describe("Human-readable result message"),
  error: z.string().optional().describe("Error message if operation failed"),
  target: z
    .string()
    .optional()
    .describe("What was reindexed (table/index/schema/database)"),
  name: z.string().optional().describe("Name of the reindexed object"),
  concurrently: z
    .boolean()
    .optional()
    .describe("Whether concurrent reindex was used"),
  hint: z.string().optional().describe("Additional information"),
}).extend(ErrorResponseFields.shape);

// Output schema for CLUSTER operations
export const ClusterOutputSchema = z.object({
  success: z.boolean().describe("Whether the cluster operation succeeded"),
  message: z.string().optional().describe("Human-readable result message"),
  error: z.string().optional().describe("Error message if operation failed"),
  table: z.string().optional().describe("Table that was clustered"),
  index: z.string().optional().describe("Index used for clustering"),
  hint: z.string().optional().describe("Additional information"),
}).extend(ErrorResponseFields.shape);

// Output schema for backend operations (terminate/cancel)
export const BackendOutputSchema = z.object({
  success: z.boolean().describe("Whether the operation succeeded"),
  message: z.string().optional().describe("Human-readable result message"),
  pid: z.number().optional().describe("Process ID that was affected"),
  hint: z.string().optional().describe("Additional information"),
}).extend(ErrorResponseFields.shape);

// Output schema for configuration operations (reload_conf, set_config, reset_stats)
export const ConfigOutputSchema = z.object({
  success: z.boolean().describe("Whether the operation succeeded"),
  message: z.string().optional().describe("Human-readable result message"),
  error: z.string().optional().describe("Error message if operation failed"),
  parameter: z
    .string()
    .optional()
    .describe("Configuration parameter name (set_config)"),
  value: z
    .string()
    .optional()
    .describe("Configuration parameter value (set_config)"),
  hint: z.string().optional().describe("Additional information"),
}).extend(ErrorResponseFields.shape);

// ============== INSIGHT SCHEMAS ==============
// Base schema for MCP visibility
export const AppendInsightSchemaBase = z.object({
  insight: z.string().optional().describe("Business insight to record"),
  text: z.string().optional().describe("Alias for insight"),
});

// Preprocess schema for handlers
export const AppendInsightSchema = z.preprocess(
  (input: unknown) => {
    if (typeof input !== "object" || input === null) return input;
    const result = { ...(input as Record<string, unknown>) };
    if (result["text"] !== undefined && result["insight"] === undefined) {
      result["insight"] = result["text"];
    }
    return result;
  },
  z.object({
    insight: z.string().describe("Business insight to record"),
  })
);

export const AppendInsightOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    insightCount: z
      .number()
      .optional()
      .describe("Total number of insights recorded"),
    message: z.string().optional().describe("Confirmation message"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape)
  .describe("Append insight output");
