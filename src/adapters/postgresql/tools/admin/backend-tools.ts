/**
 * PostgreSQL Admin Tools - Backend Management
 *
 * REINDEX, terminate backend, and cancel backend tools.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition, RequestContext } from "../../../../types/index.js";
import { admin, destructive } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { sanitizeIdentifier } from "../../../../utils/identifiers.js";
import {
  buildProgressContext,
  sendProgress,
} from "../../../../utils/progress-utils.js";
import {
  ReindexSchema,
  ReindexSchemaBase,
  ReindexOutputSchema,
  TerminateBackendSchema,
  TerminateBackendSchemaBase,
  CancelBackendSchema,
  CancelBackendSchemaBase,
  BackendOutputSchema,
} from "../../schemas/index.js";

export function createReindexTool(adapter: PostgresAdapter): ToolDefinition {
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

export function createTerminateBackendTool(adapter: PostgresAdapter): ToolDefinition {
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

export function createCancelBackendTool(adapter: PostgresAdapter): ToolDefinition {
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
