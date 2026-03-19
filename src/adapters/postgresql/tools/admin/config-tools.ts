/**
 * PostgreSQL Admin Tools - Configuration & Cluster
 *
 * Configuration management (reload, set, reset stats) and CLUSTER tool.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type { ToolDefinition, RequestContext } from "../../../../types/index.js";
import { z, ZodError } from "zod";
import { admin } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { sanitizeIdentifier, sanitizeTableName } from "../../../../utils/identifiers.js";
import {
  buildProgressContext,
  sendProgress,
} from "../../../../utils/progress-utils.js";
import { ClusterOutputSchema, ConfigOutputSchema } from "../../schemas/index.js";

export function createReloadConfTool(adapter: PostgresAdapter): ToolDefinition {
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

export function createSetConfigTool(adapter: PostgresAdapter): ToolDefinition {
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

export function createResetStatsTool(adapter: PostgresAdapter): ToolDefinition {
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

export function createClusterTool(adapter: PostgresAdapter): ToolDefinition {
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
