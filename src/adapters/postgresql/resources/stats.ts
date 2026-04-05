/**
 * Statistics Resource
 *
 * Table and index statistics, cache hit ratios, and stale statistics detection.
 * Enhanced with stale statistics recommendations from legacy server.
 */

import type { PostgresAdapter } from "../postgres-adapter.js";
import type {
  ResourceDefinition,
  RequestContext,
} from "../../../types/index.js";
import { MEDIUM_PRIORITY } from "../../../utils/resource-annotations.js";
import { toStr } from "../../../utils/query-helpers.js";

interface StatsRecommendation {
  priority: "HIGH" | "MEDIUM" | "INFO";
  table?: string;
  percentStale?: number;
  action?: string;
  reason?: string;
  message?: string;
  statsStale?: boolean;
}

interface TableStatsRow {
  schemaname: string;
  table_name: string;
  seq_scan: number;
  idx_scan: number;
  inserts: number;
  updates: number;
  deletes: number;
  live_tuples: number;
  dead_tuples: number;
  n_mod_since_analyze: number;
  percent_modified_since_analyze: number;
  statsStale: boolean;
}

/** Safely convert unknown value to number */
function toNum(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

export function createStatsResource(
  adapter: PostgresAdapter,
): ResourceDefinition {
  return {
    uri: "postgres://stats",
    name: "Database Statistics",
    description:
      "Table and index statistics, cache hit ratios, and stale statistics detection",
    mimeType: "application/json",
    annotations: MEDIUM_PRIORITY,
    handler: async (_uri: string, _context: RequestContext) => {
      // Table stats with statsStale calculation
      const tableStats = await adapter.executeQuery(`
                SELECT schemaname, relname as table_name,
                       seq_scan, idx_scan, n_tup_ins as inserts,
                       n_tup_upd as updates, n_tup_del as deletes,
                       n_live_tup as live_tuples, n_dead_tup as dead_tuples,
                       n_mod_since_analyze,
                       CASE
                           WHEN n_live_tup > 0
                           THEN round(100.0 * n_mod_since_analyze / n_live_tup, 2)
                           ELSE 0
                       END as percent_modified_since_analyze,
                       CASE
                           WHEN n_live_tup > 100 AND (100.0 * n_mod_since_analyze / n_live_tup) > 10
                           THEN true
                           ELSE false
                       END as stats_stale
                FROM pg_stat_user_tables
                ORDER BY n_live_tup DESC
                LIMIT 50
            `);

      // Cache hit ratio
      const cacheStats = await adapter.executeQuery(`
                SELECT 
                    sum(heap_blks_read) as heap_read,
                    sum(heap_blks_hit) as heap_hit,
                    CASE WHEN sum(heap_blks_read) + sum(heap_blks_hit) > 0 
                        THEN round(100.0 * sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)), 2)
                        ELSE 100 
                    END as cache_hit_ratio
                FROM pg_statio_user_tables
            `);

      // Process tables with statsStale field
      const rawTables = tableStats.rows ?? [];
      const tables: TableStatsRow[] = rawTables.map((row) => ({
        schemaname: toStr(row["schemaname"]),
        table_name: toStr(row["table_name"]),
        seq_scan: toNum(row["seq_scan"]),
        idx_scan: toNum(row["idx_scan"]),
        inserts: toNum(row["inserts"]),
        updates: toNum(row["updates"]),
        deletes: toNum(row["deletes"]),
        live_tuples: toNum(row["live_tuples"]),
        dead_tuples: toNum(row["dead_tuples"]),
        n_mod_since_analyze: toNum(row["n_mod_since_analyze"]),
        percent_modified_since_analyze: toNum(
          row["percent_modified_since_analyze"],
        ),
        statsStale: row["stats_stale"] === true,
      }));

      // Generate stale statistics recommendations
      const recommendations: StatsRecommendation[] = [];

      for (const table of tables.slice(0, 10)) {
        const pctStale = table.percent_modified_since_analyze;
        // Only flag tables with sufficient rows (small tables don't benefit from ANALYZE)
        if (table.live_tuples < 100) continue;

        if (pctStale > 20) {
          recommendations.push({
            priority: "HIGH",
            table: table.schemaname + "." + table.table_name,
            percentStale: pctStale,
            statsStale: true,
            action:
              "ANALYZE " + table.schemaname + "." + table.table_name + ";",
            reason: "Stale statistics may lead to poor query plans",
          });
        } else if (pctStale > 10) {
          recommendations.push({
            priority: "MEDIUM",
            table: table.schemaname + "." + table.table_name,
            percentStale: pctStale,
            statsStale: true,
            action:
              "ANALYZE " + table.schemaname + "." + table.table_name + ";",
            reason: "Statistics could be fresher for optimal query planning",
          });
        }
      }

      if (recommendations.length === 0) {
        recommendations.push({
          priority: "INFO",
          message: "Table statistics are up to date",
        });
      }

      return {
        tableStats: tables,
        cacheHitRatio: cacheStats.rows?.[0],
        recommendations,
      };
    },
  };
}
