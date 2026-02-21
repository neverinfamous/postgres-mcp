/**
 * PostgreSQL Performance Tools - EXPLAIN Operations
 *
 * NOTE: Uses the "Split Schema" pattern where ExplainSchemaBase (without
 * z.preprocess) is used for MCP inputSchema visibility, while ExplainSchema
 * (with preprocess) is used in the handler for alias support.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatPostgresError } from "../core/error-helpers.js";
import {
  ExplainSchema,
  ExplainSchemaBase,
  ExplainOutputSchema,
} from "../../schemas/index.js";

export function createExplainTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_explain",
    description: "Show query execution plan without running the query.",
    group: "performance",
    inputSchema: ExplainSchemaBase, // Base schema for MCP visibility
    outputSchema: ExplainOutputSchema,
    annotations: readOnly("Explain Query"),
    icons: getToolIcons("performance", readOnly("Explain Query")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const {
          sql,
          format,
          params: queryParams,
        } = ExplainSchema.parse(params);
        if (!sql) {
          throw new Error("Missing required parameter: sql (or query alias)");
        }
        const fmt = format ?? "text";
        const explainSql = `EXPLAIN (FORMAT ${fmt.toUpperCase()}) ${sql}`;
        const result = await adapter.executeQuery(
          explainSql,
          queryParams ?? [],
        );

        if (fmt === "json") {
          return { plan: result.rows?.[0]?.["QUERY PLAN"] };
        }
        return {
          plan: result.rows?.map((r) => Object.values(r)[0]).join("\n"),
        };
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, { tool: "pg_explain" }),
        };
      }
    },
  };
}

export function createExplainAnalyzeTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_explain_analyze",
    description: "Run query and show actual execution plan with timing.",
    group: "performance",
    inputSchema: ExplainSchemaBase, // Base schema for MCP visibility
    outputSchema: ExplainOutputSchema,
    annotations: readOnly("Explain Analyze"),
    icons: getToolIcons("performance", readOnly("Explain Analyze")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const {
          sql,
          format,
          params: queryParams,
        } = ExplainSchema.parse(params);
        if (!sql) {
          throw new Error("Missing required parameter: sql (or query alias)");
        }
        const fmt = format ?? "text";
        const explainSql = `EXPLAIN (ANALYZE, FORMAT ${fmt.toUpperCase()}) ${sql}`;
        const result = await adapter.executeQuery(
          explainSql,
          queryParams ?? [],
        );

        if (fmt === "json") {
          return { plan: result.rows?.[0]?.["QUERY PLAN"] };
        }
        return {
          plan: result.rows?.map((r) => Object.values(r)[0]).join("\n"),
        };
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, { tool: "pg_explain_analyze" }),
        };
      }
    },
  };
}

export function createExplainBuffersTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_explain_buffers",
    description: "Show query plan with buffer usage statistics.",
    group: "performance",
    inputSchema: ExplainSchemaBase, // Base schema for MCP visibility
    outputSchema: ExplainOutputSchema,
    annotations: readOnly("Explain Buffers"),
    icons: getToolIcons("performance", readOnly("Explain Buffers")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const {
          sql,
          format,
          params: queryParams,
        } = ExplainSchema.parse(params);
        if (!sql) {
          throw new Error("Missing required parameter: sql (or query alias)");
        }
        const fmt = format ?? "json";
        const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT ${fmt.toUpperCase()}) ${sql}`;
        const result = await adapter.executeQuery(
          explainSql,
          queryParams ?? [],
        );

        if (fmt === "json") {
          return { plan: result.rows?.[0]?.["QUERY PLAN"] };
        }
        return {
          plan: result.rows?.map((r) => Object.values(r)[0]).join("\n"),
        };
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, { tool: "pg_explain_buffers" }),
        };
      }
    },
  };
}
