/**
 * Health Resource
 *
 * Comprehensive database health status.
 */

import type { PostgresAdapter } from "../postgres-adapter.js";
import type {
  ResourceDefinition,
  RequestContext,
} from "../../../types/index.js";
import { HIGH_PRIORITY } from "../../../utils/resource-annotations.js";

interface HealthCheck {
  status: "healthy" | "warning" | "critical";
  message: string;
  details?: Record<string, unknown>;
}

export function createHealthResource(
  adapter: PostgresAdapter,
): ResourceDefinition {
  return {
    uri: "postgres://health",
    name: "Database Health",
    description:
      "Comprehensive database health status across multiple dimensions",
    mimeType: "application/json",
    annotations: HIGH_PRIORITY,
    handler: async (_uri: string, _context: RequestContext) => {
      const checks: Record<string, HealthCheck> = {};

      // Execute all health checks in parallel for better performance
      const [
        connResult,
        cacheResult,
        vacuumResult,
        wraparoundResult,
        longQueryResult,
      ] = await Promise.all([
        // 1. Connection health
        adapter.executeQuery(`
                    SELECT 
                        count(*) as active_connections,
                        (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections
                    FROM pg_stat_activity
                    WHERE state IS NOT NULL
                `),
        // 2. Cache health
        adapter.executeQuery(`
                    SELECT 
                        sum(heap_blks_read) as heap_read,
                        sum(heap_blks_hit) as heap_hit,
                        CASE WHEN sum(heap_blks_read) + sum(heap_blks_hit) > 0 
                            THEN round(100.0 * sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)), 2)
                            ELSE 100 
                        END as cache_hit_ratio
                    FROM pg_statio_user_tables
                `),
        // 3. Dead tuples (vacuum health)
        adapter.executeQuery(`
                    SELECT 
                        SUM(n_dead_tup) as total_dead,
                        SUM(n_live_tup) as total_live,
                        CASE WHEN SUM(n_live_tup) > 0 
                            THEN round(100.0 * SUM(n_dead_tup) / SUM(n_live_tup), 2)
                            ELSE 0 
                        END as dead_pct
                    FROM pg_stat_user_tables
                `),
        // 4. Transaction ID wraparound
        adapter.executeQuery(`
                    SELECT 
                        age(datfrozenxid) as xid_age,
                        round(100.0 * age(datfrozenxid) / 2147483648, 2) as percent_toward_wraparound
                    FROM pg_database
                    WHERE datname = current_database()
                `),
        // 5. Long-running queries
        adapter.executeQuery(`
                    SELECT COUNT(*) as count
                    FROM pg_stat_activity
                    WHERE state = 'active'
                      AND query NOT LIKE '%pg_stat_activity%'
                      AND now() - query_start > interval '5 minutes'
                `),
      ]);

      // Process connection health
      const connRow = connResult.rows?.[0];
      const activeConns = Number(connRow?.["active_connections"] ?? 0);
      const maxConns = Number(connRow?.["max_connections"] ?? 100);
      const connPct = (activeConns / maxConns) * 100;
      checks["connections"] = {
        status:
          connPct > 80 ? "critical" : connPct > 60 ? "warning" : "healthy",
        message:
          activeConns.toString() +
          "/" +
          maxConns.toString() +
          " connections (" +
          connPct.toFixed(1) +
          "%)",
        details: { active: activeConns, max: maxConns, percentage: connPct },
      };

      // Process cache health with cold cache detection
      const cacheRow = cacheResult.rows?.[0];
      const cacheRatio = Number(cacheRow?.["cache_hit_ratio"] ?? 100);
      const totalBlocks =
        Number(cacheRow?.["heap_read"] ?? 0) +
        Number(cacheRow?.["heap_hit"] ?? 0);
      const isColdCache = totalBlocks < 1000; // Very little I/O activity indicates cold cache

      // Don't warn about cache ratio for cold caches - insufficient data for meaningful metric
      const cacheStatus = isColdCache
        ? "healthy"
        : cacheRatio < 90
          ? "critical"
          : cacheRatio < 95
            ? "warning"
            : "healthy";

      checks["cache"] = {
        status: cacheStatus,
        message: isColdCache
          ? `${cacheRatio.toString()}% cache hit ratio (cold cache - limited data)`
          : `${cacheRatio.toString()}% cache hit ratio`,
        details: {
          cacheHitRatio: cacheRatio,
          totalBlocks,
          context: isColdCache
            ? "Cold cache - insufficient I/O activity for meaningful ratio. Normal for new/test databases."
            : undefined,
        },
      };

      // Process vacuum health - check both aggregate AND per-table stats
      const deadPct = Number(vacuumResult.rows?.[0]?.["dead_pct"] ?? 0);

      // Query individual tables needing attention (>20% dead tuples)
      let tablesNeedingAttention = 0;
      try {
        const perTableResult = await adapter.executeQuery(`
                    SELECT COUNT(*) as count
                    FROM pg_stat_user_tables
                    WHERE n_live_tup > 0 
                      AND (100.0 * n_dead_tup / n_live_tup) > 20
                `);
        tablesNeedingAttention = Number(
          perTableResult.rows?.[0]?.["count"] ?? 0,
        );
      } catch {
        // Query failed, continue with aggregate check only
      }

      // Status is warning if aggregate > 10% OR any individual table > 20%
      const vacuumStatus =
        deadPct > 20 || tablesNeedingAttention > 0
          ? deadPct > 20
            ? "critical"
            : "warning"
          : deadPct > 10
            ? "warning"
            : "healthy";

      checks["vacuum"] = {
        status: vacuumStatus,
        message:
          tablesNeedingAttention > 0
            ? `${deadPct.toString()}% dead tuples overall, ${tablesNeedingAttention.toString()} tables need attention`
            : `${deadPct.toString()}% dead tuples`,
        details: {
          deadTuples: Number(vacuumResult.rows?.[0]?.["total_dead"] ?? 0),
          liveTuples: Number(vacuumResult.rows?.[0]?.["total_live"] ?? 0),
          tablesNeedingAttention,
        },
      };

      // Process wraparound health
      const wraparoundPct = Number(
        wraparoundResult.rows?.[0]?.["percent_toward_wraparound"] ?? 0,
      );
      checks["wraparound"] = {
        status:
          wraparoundPct > 75
            ? "critical"
            : wraparoundPct > 50
              ? "warning"
              : "healthy",
        message:
          wraparoundPct.toString() + "% toward transaction ID wraparound",
        details: {
          xidAge: Number(wraparoundResult.rows?.[0]?.["xid_age"] ?? 0),
          percentage: wraparoundPct,
        },
      };

      // Process long-running queries
      const longQueries = Number(longQueryResult.rows?.[0]?.["count"] ?? 0);
      checks["longQueries"] = {
        status:
          longQueries > 5
            ? "critical"
            : longQueries > 0
              ? "warning"
              : "healthy",
        message: longQueries.toString() + " queries running > 5 minutes",
        details: { count: longQueries },
      };

      // Overall status
      const statuses = Object.values(checks).map((c) => c.status);
      const overallStatus = statuses.includes("critical")
        ? "critical"
        : statuses.includes("warning")
          ? "warning"
          : "healthy";

      return {
        overallStatus,
        checks,
        timestamp: new Date().toISOString(),
        nextSteps:
          overallStatus !== "healthy"
            ? "Review warnings and use appropriate tools to address issues"
            : "No immediate action required",
      };
    },
  };
}
