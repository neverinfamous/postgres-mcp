/**
 * PostgreSQL Admin Tools - Vacuum & Analyze
 *
 * VACUUM, VACUUM ANALYZE, and ANALYZE tools for storage reclaim and statistics update.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition, RequestContext } from "../../../../types/index.js";
import { admin } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  sanitizeIdentifiers,
  sanitizeTableName,
} from "../../../../utils/identifiers.js";
import {
  buildProgressContext,
  sendProgress,
} from "../../../../utils/progress-utils.js";
import {
  VacuumSchema,
  VacuumSchemaBase,
  VacuumOutputSchema,
  AnalyzeSchema,
  AnalyzeSchemaBase,
  AnalyzeOutputSchema,
} from "../../schemas/index.js";

export function createVacuumTool(adapter: PostgresAdapter): ToolDefinition {
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

export function createVacuumAnalyzeTool(adapter: PostgresAdapter): ToolDefinition {
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

export function createAnalyzeTool(adapter: PostgresAdapter): ToolDefinition {
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
