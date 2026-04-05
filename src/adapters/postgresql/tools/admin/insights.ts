/**
 * PostgreSQL Admin Tools - Insights
 *
 * Business insight management tool.
 * 1 tool total.
 */

import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { insightsManager } from "../../../../utils/insights-manager.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { ValidationError } from "../../../../types/errors.js";
import {
  AppendInsightSchemaBase,
  AppendInsightSchema,
  AppendInsightOutputSchema,
} from "../../schemas/index.js";

// =============================================================================
// Tool
// =============================================================================

export function createAppendInsightTool(): ToolDefinition {
  return {
    name: "pg_append_insight",
    description:
      "Append a business insight to the in-memory insights memo. Insights are accessible via the postgres://insights resource. Use to record key findings during database analysis.",
    group: "admin",
    inputSchema: AppendInsightSchemaBase,
    outputSchema: AppendInsightOutputSchema,
    annotations: {
      title: "Append Insight",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    icons: getToolIcons("admin", {
      title: "Append Insight",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    }),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = await Promise.resolve(AppendInsightSchema.parse(params));

        if (!parsed.insight?.trim()) {
          return new ValidationError(
            "Insight text cannot be empty",
          ).toResponse();
        }

        if (parsed.insight.length > 1000) {
          const lenStr = parsed.insight.length.toString(10);
          return new ValidationError(
            `Insight text is too long (${lenStr} chars). Maximum allowed is 1000 characters.`,
          ).toResponse();
        }

        insightsManager.append(parsed.insight);

        return {
          success: true,
          insightCount: insightsManager.count(),
          message: `Insight recorded (${String(insightsManager.count())} total)`,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_append_insight" });
      }
    },
  };
}
