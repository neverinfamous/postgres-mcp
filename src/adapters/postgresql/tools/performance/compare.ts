/**
 * PostgreSQL Performance Tools — Query Plan Comparison
 *
 * Side-by-side EXPLAIN plan comparison for SQL queries.
 * Extracted from analysis.ts for file size compliance.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { QueryPlanCompareOutputSchema } from "../../schemas/index.js";

/**
 * Recursively strip zero-value block stats, empty Triggers arrays,
 * and empty Planning objects from EXPLAIN plan output to reduce payload noise.
 */
function stripZeroValuePlanFields(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    const filtered = obj
      .map(stripZeroValuePlanFields)
      .filter((v) => v !== undefined);
    return filtered.length > 0 ? filtered : undefined;
  }
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Strip zero-value block stats
      if (typeof value === "number" && value === 0 && key.includes("Blocks"))
        continue;
      // Strip empty Triggers arrays
      if (key === "Triggers" && Array.isArray(value) && value.length === 0)
        continue;
      // Strip empty Planning objects
      if (
        key === "Planning" &&
        typeof value === "object" &&
        value !== null &&
        Object.keys(value).length === 0
      )
        continue;
      const cleaned = stripZeroValuePlanFields(value);
      if (cleaned !== undefined) {
        result[key] = cleaned;
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }
  return obj;
}

export function createQueryPlanCompareTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  // Base schema for MCP visibility (no preprocess)
  const QueryPlanCompareSchemaBase = z.object({
    query1: z.string().optional().describe("First SQL query"),
    query2: z.string().optional().describe("Second SQL query"),
    params1: z
      .array(z.unknown())
      .optional()
      .describe("Parameters for first query ($1, $2, etc.)"),
    params2: z
      .array(z.unknown())
      .optional()
      .describe("Parameters for second query ($1, $2, etc.)"),
    analyze: z
      .boolean()
      .optional()
      .describe("Run EXPLAIN ANALYZE (executes queries)"),
  });

  // Preprocess for sql1/sql2 → query1/query2 aliases
  const QueryPlanCompareSchema = z.preprocess((input) => {
    if (typeof input !== "object" || input === null) return input;
    const obj = input as Record<string, unknown>;
    const result = { ...obj };
    // Alias: sql1 → query1, sql2 → query2
    if (result["query1"] === undefined && result["sql1"] !== undefined) {
      result["query1"] = result["sql1"];
    }
    if (result["query2"] === undefined && result["sql2"] !== undefined) {
      result["query2"] = result["sql2"];
    }
    return result;
  }, QueryPlanCompareSchemaBase);

  return {
    name: "pg_query_plan_compare",
    description:
      "Compare execution plans of two SQL queries to identify performance differences.",
    group: "performance",
    inputSchema: QueryPlanCompareSchemaBase, // Base schema for MCP visibility
    outputSchema: QueryPlanCompareOutputSchema,
    annotations: readOnly("Query Plan Compare"),
    icons: getToolIcons("performance", readOnly("Query Plan Compare")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = QueryPlanCompareSchema.parse(params);

        // Validate required parameters
        if (!parsed.query1 || !parsed.query2) {
          return {
            success: false as const,
            error:
              "Missing required parameters: both query1 and query2 are required",
          };
        }

        const explainType =
          parsed.analyze === true
            ? "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)"
            : "EXPLAIN (FORMAT JSON)";

        const [result1, result2] = await Promise.all([
          adapter.executeQuery(
            `${explainType} ${parsed.query1}`,
            parsed.params1 ?? [],
          ),
          adapter.executeQuery(
            `${explainType} ${parsed.query2}`,
            parsed.params2 ?? [],
          ),
        ]);

        const row1 = result1.rows?.[0];
        const row2 = result2.rows?.[0];
        const queryPlan1 = row1?.["QUERY PLAN"] as unknown[] | undefined;
        const queryPlan2 = row2?.["QUERY PLAN"] as unknown[] | undefined;
        const plan1 = queryPlan1?.[0] as Record<string, unknown> | undefined;
        const plan2 = queryPlan2?.[0] as Record<string, unknown> | undefined;

        const comparison = {
          query1: {
            planningTime: plan1?.["Planning Time"],
            executionTime: plan1?.["Execution Time"],
            totalCost: (
              plan1?.["Plan"] as Record<string, unknown> | undefined
            )?.["Total Cost"],
            sharedBuffersHit: plan1?.["Shared Hit Blocks"],
            sharedBuffersRead: plan1?.["Shared Read Blocks"],
          },
          query2: {
            planningTime: plan2?.["Planning Time"],
            executionTime: plan2?.["Execution Time"],
            totalCost: (
              plan2?.["Plan"] as Record<string, unknown> | undefined
            )?.["Total Cost"],
            sharedBuffersHit: plan2?.["Shared Hit Blocks"],
            sharedBuffersRead: plan2?.["Shared Read Blocks"],
          },
          analysis: {
            costDifference:
              plan1 && plan2
                ? Number(
                    (plan1["Plan"] as Record<string, unknown>)?.["Total Cost"],
                  ) -
                  Number(
                    (plan2["Plan"] as Record<string, unknown>)?.["Total Cost"],
                  )
                : null,
            recommendation: "",
          },
          fullPlans: {
            plan1: stripZeroValuePlanFields(plan1),
            plan2: stripZeroValuePlanFields(plan2),
          },
        };

        if (comparison.analysis.costDifference !== null) {
          if (comparison.analysis.costDifference > 0) {
            comparison.analysis.recommendation =
              "Query 2 has lower estimated cost";
          } else if (comparison.analysis.costDifference < 0) {
            comparison.analysis.recommendation =
              "Query 1 has lower estimated cost";
          } else {
            comparison.analysis.recommendation =
              "Both queries have similar estimated cost";
          }
        }

        return comparison;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_query_plan_compare",
          });
      }
    },
  };
}
