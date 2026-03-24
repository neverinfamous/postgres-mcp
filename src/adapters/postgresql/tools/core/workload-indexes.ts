/**
 * PostgreSQL Core Tools - Workload Index Analysis
 *
 * Analyzes database workload using pg_stat_statements
 * to recommend missing indexes.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { formatHandlerErrorResponse } from "./error-helpers.js";
import { getToolIcons } from "../../../../utils/icons.js";
import {
  AnalyzeWorkloadIndexesSchemaBase,
  AnalyzeWorkloadIndexesSchema,
  IndexRecommendationsOutputSchema,
} from "./schemas/index.js";

/**
 * Analyze workload for index recommendations
 */
export function createAnalyzeWorkloadIndexesTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_analyze_workload_indexes",
    description:
      "Analyze database workload using pg_stat_statements to recommend missing indexes.",
    group: "core",
    inputSchema: AnalyzeWorkloadIndexesSchemaBase,
    outputSchema: IndexRecommendationsOutputSchema,
    annotations: readOnly("Analyze Workload Indexes"),
    icons: getToolIcons("core", readOnly("Analyze Workload Indexes")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { topQueries, minCalls, queryPreviewLength } =
          AnalyzeWorkloadIndexesSchema.parse(params);
        const limit = topQueries ?? 20;
        const minCallThreshold = minCalls ?? 10;
        const previewLen = queryPreviewLength ?? 200;

        // Validate non-negative limit
        if (limit < 0) {
          return {
            success: false,
            error: "Validation error: topQueries must be a non-negative number",
            code: "VALIDATION_ERROR",
            category: "validation",
            suggestion: "Use topQueries: 0 to skip analysis, or a positive number.",
            recoverable: false,
          };
        }

        // Check if pg_stat_statements is available
        const extCheck = await adapter.executeQuery(
          `SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'`,
        );

        if (!extCheck.rows || extCheck.rows.length === 0) {
          return {
            success: false,
            error:
              "pg_stat_statements extension is not installed. " +
              "This tool requires pg_stat_statements to analyze query workload. " +
              "Install with: CREATE EXTENSION pg_stat_statements; (requires postgresql.conf: shared_preload_libraries)",
            code: "EXTENSION_MISSING",
            category: "query",
            recoverable: false,
          };
        }

        // Get slow queries with sequential scans
        const sql = `
                SELECT
                    query,
                    calls,
                    mean_exec_time::numeric(10,2) as avg_time_ms,
                    (total_exec_time / 1000)::numeric(10,2) as total_time_sec,
                    rows / NULLIF(calls, 0) as avg_rows
                FROM pg_stat_statements
                WHERE calls >= $1
                AND query NOT LIKE '%pg_stat%'
                AND query NOT LIKE '%pg_catalog%'
                ORDER BY mean_exec_time DESC
                LIMIT $2
            `;

        const result = await adapter.executeQuery(sql, [minCallThreshold, limit]);

        const recommendations: {
          query: string;
          avgTimeMs: number;
          calls: number;
          recommendation: string;
        }[] = [];

        for (const row of result.rows ?? []) {
          const queryRow = row as {
            query: string;
            avg_time_ms: number;
            calls: number;
          };
          const queryLower = queryRow.query.toLowerCase();

          let rec = "";

          // Simple heuristic analysis
          if (
            queryLower.includes("where") &&
            !queryLower.includes("create index")
          ) {
            if (queryLower.includes("like") && queryLower.includes("%")) {
              rec = "Consider GIN index with pg_trgm for LIKE queries";
            } else if (
              queryLower.includes(" = ") ||
              queryLower.includes(" in (")
            ) {
              rec = "Consider B-tree index on filtered columns";
            } else if (
              queryLower.includes(" between ") ||
              queryLower.includes(" > ") ||
              queryLower.includes(" < ")
            ) {
              rec = "Consider B-tree index for range queries";
            }
          }

          if (queryLower.includes("order by") && queryLower.includes("limit")) {
            rec += rec
              ? "; Also consider index for ORDER BY columns"
              : "Consider index for ORDER BY columns";
          }

          if (rec) {
            recommendations.push({
              query:
                queryRow.query.length > previewLen
                  ? queryRow.query.substring(0, previewLen) + "\u2026"
                  : queryRow.query,
              avgTimeMs: queryRow.avg_time_ms,
              calls: queryRow.calls,
              recommendation: rec,
            });
          }
        }

        return {
          analyzedQueries: result.rows?.length ?? 0,
          recommendations,
          summary:
            recommendations.length > 0
              ? `Found ${String(recommendations.length)} queries that may benefit from indexes`
              : "No obvious index recommendations found",
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_analyze_workload_indexes",
          });
      }
    },
  };
}
