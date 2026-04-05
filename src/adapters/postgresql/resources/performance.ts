/**
 * Performance Resource
 *
 * Query performance metrics from pg_stat_statements.
 */

import type { PostgresAdapter } from "../postgres-adapter.js";
import type {
  ResourceDefinition,
  RequestContext,
} from "../../../types/index.js";
import { MEDIUM_PRIORITY } from "../../../utils/resource-annotations.js";

export function createPerformanceResource(
  adapter: PostgresAdapter,
): ResourceDefinition {
  return {
    uri: "postgres://performance",
    name: "Query Performance",
    description: "Query performance metrics from pg_stat_statements",
    mimeType: "application/json",
    annotations: MEDIUM_PRIORITY,
    handler: async (_uri: string, _context: RequestContext) => {
      // Check if pg_stat_statements is available
      const extResult = await adapter.executeQuery(`
                SELECT COUNT(*) as count 
                FROM pg_extension 
                WHERE extname = 'pg_stat_statements'
            `);
      const countValue = extResult.rows?.[0]?.["count"];
      const hasPgStat = Number(countValue ?? 0) > 0;

      if (!hasPgStat) {
        return {
          extensionStatus: "not_installed",
          error: "pg_stat_statements extension not installed",
          recommendation: "Run: CREATE EXTENSION pg_stat_statements;",
          benefits: [
            "Track query performance and identify slow queries",
            "Optimize workload based on actual usage patterns",
            "Enable all performance intelligence tools",
            "Critical for production database monitoring",
          ],
        };
      }

      try {
        // Configurable thresholds
        const SLOW_QUERY_THRESHOLD_MS = 1000; // 1 second mean time
        const HIGH_COST_THRESHOLD_MS = 5000; // 5 seconds total time

        // Get top queries by total time (filter out queries with 0 calls - no useful data)
        const topQueries = await adapter.executeQuery(`
                    SELECT 
                        LEFT(query, 200) as query_preview,
                        calls,
                        round(total_exec_time::numeric, 2) as total_time_ms,
                        round(mean_exec_time::numeric, 2) as mean_time_ms,
                        round(stddev_exec_time::numeric, 2) as stddev_time_ms,
                        rows,
                        round(100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0), 2) as cache_hit_pct
                    FROM pg_stat_statements
                    WHERE userid = (SELECT oid FROM pg_roles WHERE rolname = current_user)
                      AND calls > 0
                    ORDER BY total_exec_time DESC
                    LIMIT 20
                `);

        // Get slow queries (high mean execution time)
        const slowQueries = await adapter.executeQuery(`
                    SELECT 
                        LEFT(query, 200) as query_preview,
                        calls,
                        round(mean_exec_time::numeric, 2) as mean_time_ms,
                        round(total_exec_time::numeric, 2) as total_time_ms
                    FROM pg_stat_statements
                    WHERE userid = (SELECT oid FROM pg_roles WHERE rolname = current_user)
                      AND calls > 0
                      AND mean_exec_time > ${String(SLOW_QUERY_THRESHOLD_MS)}
                    ORDER BY mean_exec_time DESC
                    LIMIT 10
                `);

        // Get high-cost queries (high total execution time)
        const highCostQueries = await adapter.executeQuery(`
                    SELECT 
                        LEFT(query, 200) as query_preview,
                        calls,
                        round(total_exec_time::numeric, 2) as total_time_ms,
                        round(mean_exec_time::numeric, 2) as mean_time_ms
                    FROM pg_stat_statements
                    WHERE userid = (SELECT oid FROM pg_roles WHERE rolname = current_user)
                      AND calls > 0
                      AND total_exec_time > ${String(HIGH_COST_THRESHOLD_MS)}
                    ORDER BY total_exec_time DESC
                    LIMIT 10
                `);

        // Get summary statistics
        const summary = await adapter.executeQuery(`
                    SELECT 
                        COUNT(*) as total_queries,
                        SUM(calls) as total_calls,
                        round(SUM(total_exec_time)::numeric, 2) as total_time_ms,
                        round(AVG(mean_exec_time)::numeric, 2) as avg_time_ms
                    FROM pg_stat_statements
                    WHERE userid = (SELECT oid FROM pg_roles WHERE rolname = current_user)
                      AND calls > 0
                `);

        const recommendations: string[] = [
          "Use pg_explain_analyze for detailed query analysis",
          "Consider pg_query_plan_compare for optimization testing",
        ];

        // Add context-aware recommendations
        const slowCount = slowQueries.rows?.length ?? 0;
        const highCostCount = highCostQueries.rows?.length ?? 0;

        if (slowCount > 0) {
          recommendations.unshift(
            `${String(slowCount)} queries with mean time > ${String(SLOW_QUERY_THRESHOLD_MS)}ms detected. Consider adding indexes or query optimization.`,
          );
        }
        if (highCostCount > 0) {
          recommendations.unshift(
            `${String(highCostCount)} high-cost queries detected (total time > ${String(HIGH_COST_THRESHOLD_MS)}ms).`,
          );
        }

        // Check if we have any meaningful data
        const hasData = (topQueries.rows?.length ?? 0) > 0;

        // Check if ANY stats exist (even for other users) to provide better context
        let anyStatsExist = false;
        try {
          const anyStatsResult = await adapter.executeQuery(`
                        SELECT EXISTS(SELECT 1 FROM pg_stat_statements WHERE calls > 0 LIMIT 1) as has_any
                    `);
          anyStatsExist = Boolean(anyStatsResult.rows?.[0]?.["has_any"]);
        } catch {
          /* ignore - permission may be limited */
        }

        const noQueryData = !hasData
          ? {
              reason: anyStatsExist
                ? "Query statistics exist but no queries found for current user"
                : "No query statistics with calls > 0 found",
              suggestions: anyStatsExist
                ? [
                    "Other users may have query data - check with superuser privileges",
                    "Run some queries as the current user and check again",
                  ]
                : [
                    "Statistics may have been recently reset",
                    "Run some queries and check again",
                    "Use SELECT pg_stat_statements_reset() to clear stale data if needed",
                  ],
            }
          : undefined;

        return {
          extensionStatus: "installed",
          summary: summary.rows?.[0] ?? {},
          topQueries: topQueries.rows ?? [],
          slowQueries: slowQueries.rows ?? [],
          highCostQueries: highCostQueries.rows ?? [],
          thresholds: {
            slowQueryMs: SLOW_QUERY_THRESHOLD_MS,
            highCostMs: HIGH_COST_THRESHOLD_MS,
          },
          recommendations,
          noQueryData,
        };
      } catch {
        // Extension is installed but data queries failed (likely permission issue)
        return {
          extensionStatus: "installed",
          error:
            "Error querying pg_stat_statements data. Check permissions or ensure pg_stat_statements is in shared_preload_libraries.",
          summary: {},
          topQueries: [],
          slowQueries: [],
          highCostQueries: [],
          recommendations: [
            "Grant SELECT on pg_stat_statements to current user",
            "Verify pg_stat_statements is in shared_preload_libraries",
          ],
        };
      }
    },
  };
}
