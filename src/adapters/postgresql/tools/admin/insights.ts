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
import { z } from "zod";
import { ErrorResponseFields } from "../../schemas/error-response-fields.js";

// =============================================================================
// Schemas
// =============================================================================

export const AppendInsightSchemaBase = z.object({
  insight: z.string().describe("Business insight to record"),
});

export const AppendInsightSchema = AppendInsightSchemaBase;

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
          return {
            success: false,
            error: "Insight text cannot be empty",
          };
        }

        insightsManager.append(parsed.insight);

        return {
          success: true,
          insightCount: insightsManager.count(),
          message: `Insight recorded (${String(insightsManager.count())} total)`,
        };
      } catch (error: unknown) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to append insight",
        };
      }
    },
  };
}
