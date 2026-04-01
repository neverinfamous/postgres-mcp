/**
 * PostgreSQL Admin Tools - Configuration & Cluster
 *
 * Configuration management (reload, set, reset stats) and CLUSTER tool.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition, RequestContext } from "../../../../types/index.js";
import { admin } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { sanitizeIdentifier, sanitizeTableName } from "../../../../utils/identifiers.js";
import {
  buildProgressContext,
  sendProgress,
} from "../../../../utils/progress-utils.js";
import { 
  ClusterOutputSchema, 
  ConfigOutputSchema,
  ReloadConfSchemaBase,
  ResetStatsSchemaBase,
  SetConfigSchemaBase,
  SetConfigSchema,
  ClusterSchemaBase,
  ClusterSchema
} from "../../schemas/index.js";

export function createReloadConfTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_reload_conf",
    description: "Reload PostgreSQL configuration without restart.",
    group: "admin",
    inputSchema: ReloadConfSchemaBase,
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
        const parsed = SetConfigSchema.parse(params) as {
          name: string;
          value: string;
          isLocal?: boolean;
        };
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
    inputSchema: ResetStatsSchemaBase,
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
        const tableName = sanitizeTableName(parsed.table, parsed.schema);
        let sql = `CLUSTER ${tableName}`;
        if (parsed.index !== undefined) {
          sql += ` USING ${sanitizeIdentifier(parsed.index)}`;
        }
        await adapter.executeQuery(sql);

        await sendProgress(progress, 2, 2, "CLUSTER complete");

        return {
          success: true,
          message: parsed.index
            ? `Clustered ${parsed.table} using index ${parsed.index}`
            : `Re-clustered ${parsed.table} using its existing clustered index`,
          table: parsed.table,
          ...(parsed.index && { index: parsed.index }),
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_cluster" });
      }
    },
  };
}
