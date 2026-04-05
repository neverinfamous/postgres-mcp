/**
 * PostgreSQL Core Tools - Health Analysis
 *
 * Database health analysis and index recommendation tools.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { formatHandlerErrorResponse } from "./error-helpers.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { logger } from "../../../../utils/logger.js";
import {
  AnalyzeDbHealthSchemaBase,
  AnalyzeDbHealthSchema,
  AnalyzeQueryIndexesSchema,
  AnalyzeQueryIndexesSchemaBase,
  HealthAnalysisOutputSchema,
  QueryIndexAnalysisOutputSchema,
} from "./schemas/index.js";

/**
 * Analyze database health
 */
export function createAnalyzeDbHealthTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_analyze_db_health",
    description:
      "Comprehensive database health analysis including cache hit ratio, bloat, replication, and connection stats.",
    group: "core",
    inputSchema: AnalyzeDbHealthSchemaBase,
    outputSchema: HealthAnalysisOutputSchema,
    annotations: readOnly("Analyze Database Health"),
    icons: getToolIcons("core", readOnly("Analyze Database Health")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { includeIndexes, includeVacuum, includeConnections } =
          AnalyzeDbHealthSchema.parse(params);

        interface DbHealthReport {
          cacheHitRatio?:
            | {
                ratio: number | null; // Primary numeric value
                heap: number | null;
                index: number | null;
                status: string;
              }
            | undefined;
          databaseSize?: string | undefined;
          tableStats?: Record<string, unknown> | undefined;
          unusedIndexes?: number | undefined;
          tablesNeedingVacuum?: number | undefined;
          connections?: Record<string, unknown> | undefined;
          isReplica?: boolean | undefined;
          overallScore?: number | undefined;
          overallStatus?: string | undefined;
          bloat?:
            | {
                tableBloatBytes: number;
                indexBloatBytes: number;
                totalBloatBytes: number;
                tablesWithBloat: number;
              }
            | undefined;
        }

        const health: DbHealthReport = {};

        // Cache hit ratio
        const cacheQuery = `
                SELECT
                    sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0) as heap_hit_ratio,
                    sum(idx_blks_hit) / NULLIF(sum(idx_blks_hit) + sum(idx_blks_read), 0) as index_hit_ratio
                FROM pg_statio_user_tables
            `;
        const cacheResult = await adapter.executeQuery(cacheQuery);
        const cacheRow = cacheResult.rows?.[0] as
          | { heap_hit_ratio: number | null; index_hit_ratio: number | null }
          | undefined;

        if (cacheRow) {
          const heapRatio =
            cacheRow.heap_hit_ratio !== null
              ? Number((cacheRow.heap_hit_ratio * 100).toFixed(2))
              : null;
          health.cacheHitRatio = {
            ratio: heapRatio, // Primary numeric value for easy access
            heap: heapRatio,
            index:
              cacheRow.index_hit_ratio !== null
                ? Number((cacheRow.index_hit_ratio * 100).toFixed(2))
                : null,
            status:
              (cacheRow.heap_hit_ratio ?? 0) > 0.95
                ? "good"
                : (cacheRow.heap_hit_ratio ?? 0) > 0.8
                  ? "fair"
                  : "poor",
          };
        }

        // Database size
        const sizeQuery = `SELECT pg_size_pretty(pg_database_size(current_database())) as size`;
        const sizeResult = await adapter.executeQuery(sizeQuery);
        if (sizeResult.rows && sizeResult.rows.length > 0) {
          health.databaseSize = (sizeResult.rows[0] as { size: string }).size;
        }

        // Table count and total rows estimate
        const statsQuery = `
                SELECT
                    COUNT(*) as table_count,
                    SUM(n_live_tup) as total_rows
                FROM pg_stat_user_tables
            `;
        const statsResult = await adapter.executeQuery(statsQuery);
        if (statsResult.rows && statsResult.rows.length > 0) {
          health.tableStats = statsResult.rows[0];
        }

        if (includeIndexes !== false) {
          const unusedQuery = `
                    SELECT COUNT(*) as unused_count
                    FROM pg_stat_user_indexes
                    WHERE idx_scan = 0 AND idx_tup_read = 0
                `;
          const unusedResult = await adapter.executeQuery(unusedQuery);
          if (unusedResult.rows && unusedResult.rows.length > 0) {
            health.unusedIndexes = (
              unusedResult.rows[0] as { unused_count: number }
            ).unused_count;
          }
        }

        if (includeVacuum !== false) {
          const vacuumQuery = `
                    SELECT COUNT(*) as tables_needing_vacuum
                    FROM pg_stat_user_tables
                    WHERE n_dead_tup > n_live_tup * 0.1
                    AND n_dead_tup > 1000
                `;
          const vacuumResult = await adapter.executeQuery(vacuumQuery);
          if (vacuumResult.rows && vacuumResult.rows.length > 0) {
            health.tablesNeedingVacuum = (
              vacuumResult.rows[0] as { tables_needing_vacuum: number }
            ).tables_needing_vacuum;
          }
        }

        if (includeConnections !== false) {
          const connQuery = `
                    SELECT
                        COUNT(*) as total,
                        COUNT(*) FILTER (WHERE state = 'active') as active,
                        COUNT(*) FILTER (WHERE state = 'idle') as idle,
                        COUNT(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction,
                        current_setting('max_connections')::int as max_connections
                    FROM pg_stat_activity
                    WHERE backend_type = 'client backend'
                `;
          const connResult = await adapter.executeQuery(connQuery);
          if (connResult.rows && connResult.rows.length > 0) {
            health.connections = connResult.rows[0];
          }
        }

        // Bloat analysis (estimate based on dead tuples)
        const bloatQuery = `
                SELECT
                    COALESCE(SUM(pg_relation_size(c.oid) * GREATEST(0, 1 - n_live_tup::float / NULLIF(reltuples, 0))), 0)::bigint as table_bloat_bytes,
                    COALESCE(SUM(pg_indexes_size(c.oid) * GREATEST(0, 1 - n_live_tup::float / NULLIF(reltuples, 0))), 0)::bigint as index_bloat_bytes,
                    COUNT(*) FILTER (WHERE n_dead_tup > 1000) as tables_with_bloat
                FROM pg_stat_user_tables s
                JOIN pg_class c ON c.relname = s.relname
                JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = s.schemaname
            `;
        try {
          const bloatResult = await adapter.executeQuery(bloatQuery);
          if (bloatResult.rows && bloatResult.rows.length > 0) {
            const row = bloatResult.rows[0] as {
              table_bloat_bytes: bigint;
              index_bloat_bytes: bigint;
              tables_with_bloat: number;
            };
            const tableBloat = Number(row.table_bloat_bytes) || 0;
            const indexBloat = Number(row.index_bloat_bytes) || 0;
            health.bloat = {
              tableBloatBytes: tableBloat,
              indexBloatBytes: indexBloat,
              totalBloatBytes: tableBloat + indexBloat,
              tablesWithBloat: row.tables_with_bloat,
            };
          }
        } catch (error: unknown) {
          logger.warn("Bloat estimation unavailable", {
            error: error instanceof Error ? error.message : String(error),
          });
        }

        // Replication status
        const replQuery = `SELECT pg_is_in_recovery() as is_replica`;
        const replResult = await adapter.executeQuery(replQuery);
        if (replResult.rows && replResult.rows.length > 0) {
          health.isReplica = (
            replResult.rows[0] as { is_replica: boolean }
          ).is_replica;
        }

        // Overall health score
        let score = 100;
        if (
          health.cacheHitRatio?.heap !== null &&
          health.cacheHitRatio?.heap !== undefined &&
          (health.cacheHitRatio?.heap ?? 100) < 95
        )
          score -= 20;
        if ((health.unusedIndexes ?? 0) > 10) score -= 10;
        if ((health.tablesNeedingVacuum ?? 0) > 5) score -= 15;

        health.overallScore = Math.max(0, score);
        health.overallStatus =
          score >= 80
            ? "healthy"
            : score >= 60
              ? "needs_attention"
              : "critical";

        return health;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_analyze_db_health",
        });
      }
    },
  };
}

/**
 * Analyze specific query for index recommendations
 */
export function createAnalyzeQueryIndexesTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_analyze_query_indexes",
    description:
      "Analyze a specific query for index recommendations using EXPLAIN ANALYZE.",
    group: "core",
    inputSchema: AnalyzeQueryIndexesSchemaBase,
    outputSchema: QueryIndexAnalysisOutputSchema,
    annotations: readOnly("Analyze Query Indexes"),
    icons: getToolIcons("core", readOnly("Analyze Query Indexes")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const {
          sql,
          params: queryParams,
          verbosity,
        } = AnalyzeQueryIndexesSchema.parse(params);

        // Validate verbosity (handler-side since Base schema uses z.string())
        const VALID_VERBOSITY = ["summary", "full"] as const;
        if (!(VALID_VERBOSITY as readonly string[]).includes(verbosity)) {
          return {
            success: false,
            error: `Validation error: Invalid verbosity "${verbosity}". Valid options: ${VALID_VERBOSITY.join(", ")}`,
            code: "VALIDATION_ERROR",
            category: "validation",
            suggestion: "Check the input parameters match the expected schema.",
            recoverable: false,
          };
        }

        // CRITICAL: Block write queries - EXPLAIN ANALYZE executes them!
        const sqlUpper = sql.trim().toUpperCase();
        const isWriteQuery =
          sqlUpper.startsWith("INSERT") ||
          sqlUpper.startsWith("UPDATE") ||
          sqlUpper.startsWith("DELETE") ||
          sqlUpper.startsWith("TRUNCATE") ||
          sqlUpper.startsWith("DROP") ||
          sqlUpper.startsWith("ALTER") ||
          sqlUpper.startsWith("CREATE");

        if (isWriteQuery) {
          return {
            sql,
            error:
              "Write queries not allowed - EXPLAIN ANALYZE executes the query",
            hint: "Use pg_explain for write queries (no ANALYZE option) or wrap in a transaction and rollback",
          };
        }

        // Get query plan
        const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`;
        let result;
        try {
          result = await adapter.executeQuery(explainSql, queryParams);
        } catch (error: unknown) {
          return formatHandlerErrorResponse(error, {
            tool: "pg_analyze_query_indexes",
            sql,
          });
        }

        if (!result.rows || result.rows.length === 0) {
          return { sql, error: "No query plan returned" };
        }

        const plan = (result.rows[0] as { "QUERY PLAN": unknown[] })[
          "QUERY PLAN"
        ][0] as Record<string, unknown>;
        const rootPlan = plan["Plan"] as Record<string, unknown>;

        const recommendations: string[] = [];
        const issues: string[] = [];

        // Recursive function to analyze plan nodes
        function analyzePlanNode(
          node: Record<string, unknown>,
          depth = 0,
        ): void {
          const nodeType = node["Node Type"] as string;
          const actualRows = node["Actual Rows"] as number;
          const plannedRows = node["Plan Rows"] as number;

          // Check for sequential scans
          if (nodeType === "Seq Scan") {
            const tableName = node["Relation Name"] as string;
            const filter = node["Filter"] as string;
            if (actualRows > 1000 && filter) {
              issues.push(
                `Sequential scan on ${tableName} with filter: ${filter}`,
              );
              recommendations.push(
                `Consider creating an index on ${tableName} for the filtered columns`,
              );
            }
          }

          // Check for row estimation issues
          if (plannedRows > 0 && actualRows > 0) {
            const ratio = actualRows / plannedRows;
            if (ratio > 10 || ratio < 0.1) {
              issues.push(
                `Row estimation off by ${ratio.toFixed(1)}x at ${nodeType}`,
              );
              recommendations.push(
                "Run ANALYZE on affected tables to update statistics",
              );
            }
          }

          // Check for sorts
          if (nodeType === "Sort" && node["Sort Method"] === "external sort") {
            issues.push("External sort detected (spilling to disk)");
            recommendations.push(
              "Consider increasing work_mem or adding index for ORDER BY columns",
            );
          }

          // Recurse into child plans
          const plans = node["Plans"] as Record<string, unknown>[] | undefined;
          if (plans) {
            for (const childPlan of plans) {
              analyzePlanNode(childPlan, depth + 1);
            }
          }
        }

        analyzePlanNode(rootPlan);

        // Create summary plan for compact response
        function createSummaryPlan(
          node: Record<string, unknown>,
        ): Record<string, unknown> {
          const summary: Record<string, unknown> = {
            "Node Type": node["Node Type"],
            "Actual Rows": node["Actual Rows"],
            "Actual Total Time": node["Actual Total Time"],
          };

          // Include relevant details based on node type
          if (node["Relation Name"] !== undefined)
            summary["Relation Name"] = node["Relation Name"];
          if (node["Index Name"] !== undefined)
            summary["Index Name"] = node["Index Name"];
          if (node["Filter"] !== undefined) summary["Filter"] = node["Filter"];
          if (node["Index Cond"] !== undefined)
            summary["Index Cond"] = node["Index Cond"];
          if (node["Join Type"] !== undefined)
            summary["Join Type"] = node["Join Type"];

          // Recursively summarize child plans
          const childPlans = node["Plans"] as
            | Record<string, unknown>[]
            | undefined;
          if (childPlans !== undefined && childPlans.length > 0) {
            summary["Plans"] = childPlans.map(createSummaryPlan);
          }

          return summary;
        }

        // Return based on verbosity
        const baseResult = {
          sql,
          executionTime: plan["Execution Time"] as number,
          planningTime: plan["Planning Time"] as number,
          issues,
          recommendations,
        };

        if (verbosity === "full") {
          return {
            ...baseResult,
            plan: rootPlan,
          };
        }

        // Default: summary mode with condensed plan
        return {
          ...baseResult,
          plan: createSummaryPlan(rootPlan),
          verbosity: "summary",
          hint: "Use verbosity: 'full' to include complete plan with all metrics",
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_analyze_query_indexes",
        });
      }
    },
  };
}
