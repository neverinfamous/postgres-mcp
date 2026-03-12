/**
 * PostgreSQL Admin Tools
 *
 * Database maintenance: VACUUM, ANALYZE, REINDEX, configuration.
 * 10 tools total.
 */

import type { PostgresAdapter } from "../PostgresAdapter.js";
import type { ToolDefinition, RequestContext } from "../../../types/index.js";
import { z, ZodError } from "zod";
import { admin, destructive } from "../../../utils/annotations.js";
import { getToolIcons } from "../../../utils/icons.js";
import { formatHandlerErrorResponse } from "./core/error-helpers.js";
import {
  sanitizeIdentifier,
  sanitizeIdentifiers,
  sanitizeTableName,
} from "../../../utils/identifiers.js";
import {
  buildProgressContext,
  sendProgress,
} from "../../../utils/progress-utils.js";
import {
  VacuumSchema,
  VacuumSchemaBase,
  VacuumOutputSchema,
  AnalyzeSchema,
  AnalyzeSchemaBase,
  AnalyzeOutputSchema,
  ReindexSchema,
  ReindexSchemaBase,
  ReindexOutputSchema,
  ClusterOutputSchema,
  TerminateBackendSchema,
  TerminateBackendSchemaBase,
  CancelBackendSchema,
  CancelBackendSchemaBase,
  BackendOutputSchema,
  ConfigOutputSchema,
} from "../schemas/index.js";

/**
 * Get all admin tools
 */
export function getAdminTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    createVacuumTool(adapter),
    createVacuumAnalyzeTool(adapter),
    createAnalyzeTool(adapter),
    createReindexTool(adapter),
    createTerminateBackendTool(adapter),
    createCancelBackendTool(adapter),
    createReloadConfTool(adapter),
    createSetConfigTool(adapter),
    createResetStatsTool(adapter),
    createClusterTool(adapter),
  ];
}

function createVacuumTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_vacuum",
    description:
      "Run VACUUM to reclaim storage and update visibility map. Use analyze: true to also update statistics. Verbose output goes to PostgreSQL server logs.",
    group: "admin",
    inputSchema: VacuumSchemaBase,
    outputSchema: VacuumOutputSchema,
    annotations: admin("Vacuum"),
    icons: getToolIcons("admin", admin("Vacuum")),
    handler: async (params: unknown, context: RequestContext) => {
      try {
        const progress = buildProgressContext(context);
        await sendProgress(progress, 1, 2, "Starting VACUUM...");

        const { table, schema, full, verbose, analyze } =
          VacuumSchema.parse(params);
        const fullClause = full === true ? "FULL " : "";
        const verboseClause = verbose === true ? "VERBOSE " : "";
        const analyzeClause = analyze === true ? "ANALYZE " : "";
        const target =
          table !== undefined ? sanitizeTableName(table, schema) : "";

        const sql = `VACUUM ${fullClause}${verboseClause}${analyzeClause}${target}`;
        await adapter.executeQuery(sql);

        await sendProgress(progress, 2, 2, "VACUUM complete");

        // Build accurate message reflecting all options used
        const parts: string[] = ["VACUUM"];
        if (full === true) parts.push("FULL");
        if (analyze === true) parts.push("ANALYZE");
        const message = `${parts.join(" ")} completed`;

        return {
          success: true,
          message,
          ...(table !== undefined && { table }),
          ...(schema !== undefined && { schema }),
          ...(verbose === true && {
            hint: "Verbose output written to PostgreSQL server logs",
          }),
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_vacuum" });
      }
    },
  };
}

function createVacuumAnalyzeTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_vacuum_analyze",
    description:
      "Run VACUUM and ANALYZE together for optimal performance. Verbose output goes to PostgreSQL server logs.",
    group: "admin",
    inputSchema: VacuumSchemaBase,
    outputSchema: VacuumOutputSchema,
    annotations: admin("Vacuum Analyze"),
    icons: getToolIcons("admin", admin("Vacuum Analyze")),
    handler: async (params: unknown, context: RequestContext) => {
      try {
        const progress = buildProgressContext(context);
        await sendProgress(progress, 1, 2, "Starting VACUUM ANALYZE...");

        const { table, schema, verbose, full } = VacuumSchema.parse(params);
        const fullClause = full === true ? "FULL " : "";
        const verboseClause = verbose === true ? "VERBOSE " : "";
        const target =
          table !== undefined ? sanitizeTableName(table, schema) : "";

        const sql = `VACUUM ${fullClause}${verboseClause}ANALYZE ${target}`;
        await adapter.executeQuery(sql);

        await sendProgress(progress, 2, 2, "VACUUM ANALYZE complete");

        // Build accurate message
        const message =
          full === true
            ? "VACUUM FULL ANALYZE completed"
            : "VACUUM ANALYZE completed";

        return {
          success: true,
          message,
          ...(table !== undefined && { table }),
          ...(schema !== undefined && { schema }),
          ...(verbose === true && {
            hint: "Verbose output written to PostgreSQL server logs",
          }),
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_vacuum_analyze" });
      }
    },
  };
}

function createAnalyzeTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_analyze",
    description: "Update table statistics for the query planner.",
    group: "admin",
    inputSchema: AnalyzeSchemaBase,
    outputSchema: AnalyzeOutputSchema,
    annotations: admin("Analyze"),
    icons: getToolIcons("admin", admin("Analyze")),
    handler: async (params: unknown, context: RequestContext) => {
      try {
        const progress = buildProgressContext(context);
        await sendProgress(progress, 1, 2, "Starting ANALYZE...");

        const { table, schema, columns } = AnalyzeSchema.parse(params);

        // Validate: columns requires table
        if (
          columns !== undefined &&
          columns.length > 0 &&
          table === undefined
        ) {
          return {
            success: false,
            error: "table is required when columns is specified",
          };
        }

        const target =
          table !== undefined ? sanitizeTableName(table, schema) : "";
        const columnClause =
          columns !== undefined && columns.length > 0
            ? `(${sanitizeIdentifiers(columns).join(", ")})`
            : "";

        const sql = `ANALYZE ${target}${columnClause}`;
        await adapter.executeQuery(sql);

        await sendProgress(progress, 2, 2, "ANALYZE complete");

        return {
          success: true,
          message: "ANALYZE completed",
          ...(table !== undefined && { table }),
          ...(schema !== undefined && { schema }),
          ...(columns !== undefined && columns.length > 0 && { columns }),
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_analyze" });
      }
    },
  };
}

function createReindexTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_reindex",
    description:
      "Rebuild indexes to improve performance. For target: database, name defaults to the current database if omitted.",
    group: "admin",
    inputSchema: ReindexSchemaBase,
    outputSchema: ReindexOutputSchema,
    annotations: admin("Reindex"),
    icons: getToolIcons("admin", admin("Reindex")),
    handler: async (params: unknown, context: RequestContext) => {
      let parsedTarget: string | undefined;
      try {
        const progress = buildProgressContext(context);
        await sendProgress(progress, 1, 3, "Starting REINDEX...");

        const parsed = ReindexSchema.parse(params) as {
          target: string;
          name?: string;
          concurrently?: boolean;
        };
        parsedTarget = parsed.target;
        const concurrentlyClause =
          parsed.concurrently === true ? "CONCURRENTLY " : "";

        // Auto-default to current database when target is 'database' and name is not provided
        let effectiveName = parsed.name;
        if (parsed.target === "database" && effectiveName === undefined) {
          const dbResult = await adapter.executeQuery(
            "SELECT current_database()",
          );
          const dbName = dbResult.rows?.[0]?.["current_database"];
          effectiveName = typeof dbName === "string" ? dbName : "";
        }

        await sendProgress(progress, 2, 3, `Reindexing ${parsed.target}...`);

        // name should always be defined at this point (refine ensures it for non-database targets)
        if (effectiveName === undefined) {
          return {
            success: false,
            error: "name is required",
          };
        }

        const sql = `REINDEX ${parsed.target.toUpperCase()} ${concurrentlyClause}${sanitizeIdentifier(effectiveName)}`;
        await adapter.executeQuery(sql);

        await sendProgress(progress, 3, 3, "REINDEX complete");

        return {
          success: true,
          message: `Reindexed ${parsed.target}: ${effectiveName}`,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_reindex",
            ...(parsedTarget !== undefined && { target: parsedTarget }),
          });
      }
    },
  };
}

function createTerminateBackendTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_terminate_backend",
    description:
      "Terminate a database connection (forceful, use with caution).",
    group: "admin",
    inputSchema: TerminateBackendSchemaBase,
    outputSchema: BackendOutputSchema,
    annotations: destructive("Terminate Backend"),
    icons: getToolIcons("admin", destructive("Terminate Backend")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { pid } = TerminateBackendSchema.parse(params);
        const sql = `SELECT pg_terminate_backend($1)`;
        const result = await adapter.executeQuery(sql, [pid]);
        const terminated = result.rows?.[0]?.["pg_terminate_backend"] === true;
        return {
          success: terminated,
          pid,
          message: terminated ? "Backend terminated" : "Failed to terminate",
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_terminate_backend",
          });
      }
    },
  };
}

function createCancelBackendTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_cancel_backend",
    description: "Cancel a running query (graceful, preferred over terminate).",
    group: "admin",
    inputSchema: CancelBackendSchemaBase,
    outputSchema: BackendOutputSchema,
    annotations: admin("Cancel Backend"),
    icons: getToolIcons("admin", admin("Cancel Backend")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { pid } = CancelBackendSchema.parse(params);
        const sql = `SELECT pg_cancel_backend($1)`;
        const result = await adapter.executeQuery(sql, [pid]);
        const cancelled = result.rows?.[0]?.["pg_cancel_backend"] === true;
        return {
          success: cancelled,
          pid,
          message: cancelled ? "Query cancelled" : "Failed to cancel",
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_cancel_backend",
          });
      }
    },
  };
}

function createReloadConfTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_reload_conf",
    description: "Reload PostgreSQL configuration without restart.",
    group: "admin",
    inputSchema: z.object({}),
    outputSchema: ConfigOutputSchema,
    annotations: admin("Reload Configuration"),
    icons: getToolIcons("admin", admin("Reload Configuration")),
    handler: async (_params: unknown, _context: RequestContext) => {
      try {
        const sql = `SELECT pg_reload_conf()`;
        const result = await adapter.executeQuery(sql);
        return {
          success: result.rows?.[0]?.["pg_reload_conf"],
          message: "Configuration reloaded",
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_reload_conf" });
      }
    },
  };
}

/**
 * Preprocess set_config parameters:
 * - Alias: param/setting → name
 */
function preprocessSetConfigParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  const result = { ...(input as Record<string, unknown>) };
  // Alias: param → name
  if (result["param"] !== undefined && result["name"] === undefined) {
    result["name"] = result["param"];
  }
  // Alias: setting → name
  if (result["setting"] !== undefined && result["name"] === undefined) {
    result["name"] = result["setting"];
  }
  return result;
}

// Base schema for MCP visibility (shows all parameters and aliases)
const SetConfigSchemaBase = z.object({
  name: z.string().optional().describe("Configuration parameter name"),
  param: z.string().optional().describe("Alias for name"),
  setting: z.string().optional().describe("Alias for name"),
  value: z.string().describe("New value"),
  isLocal: z.boolean().optional().describe("Apply only to current transaction"),
});

// Preprocess schema for handlers
const SetConfigSchema = z.preprocess(
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

function createSetConfigTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_set_config",
    description: "Set a configuration parameter for the current session.",
    group: "admin",
    inputSchema: SetConfigSchemaBase,
    outputSchema: ConfigOutputSchema,
    annotations: admin("Set Configuration"),
    icons: getToolIcons("admin", admin("Set Configuration")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = SetConfigSchema.parse(params);
        const local = parsed.isLocal ?? false;
        const sql = `SELECT set_config($1, $2, $3)`;
        const result = await adapter.executeQuery(sql, [
          parsed.name,
          parsed.value,
          local,
        ]);
        const actualValue = result.rows?.[0]?.["set_config"] as string;
        return {
          success: true,
          message: `Set ${parsed.name} = ${actualValue}`,
          parameter: parsed.name,
          value: actualValue,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_set_config" });
      }
    },
  };
}

function createResetStatsTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_reset_stats",
    description: "Reset statistics counters (requires superuser).",
    group: "admin",
    inputSchema: z.object({}),
    outputSchema: ConfigOutputSchema,
    annotations: admin("Reset Statistics"),
    icons: getToolIcons("admin", admin("Reset Statistics")),
    handler: async (_params: unknown, _context: RequestContext) => {
      try {
        await adapter.executeQuery(`SELECT pg_stat_reset()`);
        return { success: true, message: "Statistics reset" };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_reset_stats" });
      }
    },
  };
}

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
  // Alias: tableName → table
  if (result["tableName"] !== undefined && result["table"] === undefined) {
    result["table"] = result["tableName"];
  }
  // Alias: indexName → index
  if (result["indexName"] !== undefined && result["index"] === undefined) {
    result["index"] = result["indexName"];
  }

  // Parse schema.table format (e.g., 'public.users' → { schema: 'public', table: 'users' })
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

// Base schema for MCP visibility (shows all parameters and aliases)
const ClusterSchemaBase = z.object({
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
const ClusterSchema = z
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

function createClusterTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_cluster",
    description:
      "Physically reorder table data based on an index. Call with no args to re-cluster all previously-clustered tables.",
    group: "admin",
    inputSchema: ClusterSchemaBase,
    outputSchema: ClusterOutputSchema,
    annotations: admin("Cluster Table"),
    icons: getToolIcons("admin", admin("Cluster Table")),
    handler: async (params: unknown, context: RequestContext) => {
      try {
        const progress = buildProgressContext(context);
        await sendProgress(progress, 1, 2, "Starting CLUSTER...");

        const parsed = ClusterSchema.parse(params) as {
          table?: string;
          index?: string;
          schema?: string;
        };

        // Database-wide CLUSTER (all previously clustered tables)
        if (parsed.table === undefined) {
          await adapter.executeQuery("CLUSTER");
          await sendProgress(progress, 2, 2, "CLUSTER complete");
          return {
            success: true,
            message: "Re-clustered all previously-clustered tables",
          };
        }

        // Table-specific CLUSTER
        // index is guaranteed by schema refine when table is specified
        if (parsed.index === undefined) {
          return {
            success: false,
            error:
              "table and index must both be specified together, or both omitted for database-wide re-cluster",
          };
        }
        const tableName = sanitizeTableName(parsed.table, parsed.schema);
        const sql = `CLUSTER ${tableName} USING ${sanitizeIdentifier(parsed.index)}`;
        await adapter.executeQuery(sql);

        await sendProgress(progress, 2, 2, "CLUSTER complete");

        return {
          success: true,
          message: `Clustered ${parsed.table} using index ${parsed.index}`,
          table: parsed.table,
          index: parsed.index,
        };
      } catch (error: unknown) {
        if (error instanceof ZodError) {
          return {
            success: false,
            error: error.issues.map((i) => i.message).join("; "),
          };
        }
        return formatHandlerErrorResponse(error, { tool: "pg_cluster" });
      }
    },
  };
}
