/**
 * PostgreSQL Performance Tools - Database Diagnostics
 *
 * Consolidates key performance metrics into a single actionable report:
 * slow queries, blocking locks, connection pressure, cache hit ratio,
 * disk usage, and top tables by size/activity.
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
import { validateIdentifier } from "../../../../utils/identifiers.js";

// =============================================================================
// Schemas
// =============================================================================

const DiagnoseInputSchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Filter top tables to a specific schema"),
  topN: z
    .any()
    .optional()
    .describe("Number of top tables to return (default: 10)"),
});

const DiagnoseInputSchema = DiagnoseInputSchemaBase.transform((data) => {
  const raw = data.topN != null ? Number(data.topN) : 10;
  const topN = Number.isFinite(raw) ? raw : 10;
  return {
    schema: data.schema,
    topN: Math.max(1, Math.min(100, topN)),
  };
});

// =============================================================================
// Health Rating Helpers
// =============================================================================

type HealthRating = "healthy" | "warning" | "critical";

interface SectionResult<T> {
  status: HealthRating;
  data: T;
  recommendations: string[];
}

function rateValue(
  value: number,
  warningThreshold: number,
  criticalThreshold: number,
  higherIsBetter: boolean,
): HealthRating {
  if (higherIsBetter) {
    if (value >= warningThreshold) return "healthy";
    if (value >= criticalThreshold) return "warning";
    return "critical";
  }
  if (value <= warningThreshold) return "healthy";
  if (value <= criticalThreshold) return "warning";
  return "critical";
}

const statusWeight: Record<HealthRating, number> = {
  healthy: 100,
  warning: 60,
  critical: 20,
};

// =============================================================================
// Helper: safe numeric coercion
// =============================================================================

const toNum = (val: unknown): number =>
  val === null || val === undefined ? 0 : Number(val);

// =============================================================================
// Diagnostic Sections
// =============================================================================

async function diagnoseSlowQueries(
  adapter: PostgresAdapter,
): Promise<
  SectionResult<{ slowQueries: Record<string, unknown>[]; count: number }>
> {
  const result = await adapter.executeQuery(`
    SELECT pid, usename, datname, state,
           now() - query_start AS duration,
           LEFT(query, 200) AS query_preview,
           wait_event_type, wait_event
    FROM pg_stat_activity
    WHERE state = 'active'
      AND query NOT ILIKE '%pg_stat_activity%'
      AND now() - query_start > interval '1 second'
    ORDER BY duration DESC
    LIMIT 20
  `);

  const queries = result.rows ?? [];
  const count = queries.length;
  const recommendations: string[] = [];

  if (count >= 5) {
    recommendations.push(
      "Multiple slow queries detected — review query plans with pg_explain_analyze",
    );
  }
  if (count >= 10) {
    recommendations.push(
      "High number of slow queries — check for missing indexes with pg_index_recommendations",
    );
  }

  const status = rateValue(count, 2, 5, false);

  return { status, data: { slowQueries: queries, count }, recommendations };
}

async function diagnoseBlockingLocks(
  adapter: PostgresAdapter,
): Promise<
  SectionResult<{ blockedQueries: Record<string, unknown>[]; count: number }>
> {
  const result = await adapter.executeQuery(`
    SELECT
      blocked.pid AS blocked_pid,
      blocked.usename AS blocked_user,
      LEFT(blocked.query, 200) AS blocked_query,
      blocking.pid AS blocking_pid,
      blocking.usename AS blocking_user,
      LEFT(blocking.query, 200) AS blocking_query,
      blocked.wait_event_type
    FROM pg_stat_activity blocked
    JOIN pg_locks bl ON bl.pid = blocked.pid
    JOIN pg_locks kl ON kl.transactionid = bl.transactionid AND kl.pid != bl.pid
    JOIN pg_stat_activity blocking ON blocking.pid = kl.pid
    WHERE NOT bl.granted
    LIMIT 20
  `);

  const blocked = result.rows ?? [];
  const count = blocked.length;
  const recommendations: string[] = [];

  if (count > 0) {
    recommendations.push(
      "Active lock contention detected — use pg_locks({showBlocked: true}) for details",
    );
  }
  if (count >= 3) {
    recommendations.push(
      "Significant blocking — consider shorter transactions or advisory locks",
    );
  }

  const status = rateValue(count, 0, 2, false);

  return { status, data: { blockedQueries: blocked, count }, recommendations };
}

async function diagnoseConnectionPressure(adapter: PostgresAdapter): Promise<
  SectionResult<{
    activeConnections: number;
    maxConnections: number;
    usagePercent: number;
    byState: Record<string, unknown>[];
  }>
> {
  const [connResult, maxResult] = await Promise.all([
    adapter.executeQuery(`
      SELECT state, count(*) AS count
      FROM pg_stat_activity
      GROUP BY state
      ORDER BY count DESC
    `),
    adapter.executeQuery(`SHOW max_connections`),
  ]);

  const byState = connResult.rows ?? [];
  const totalActive = byState.reduce((sum, r) => sum + toNum(r["count"]), 0);
  const maxConnections = toNum(maxResult.rows?.[0]?.["max_connections"]);
  const usagePercent =
    maxConnections > 0
      ? Math.round((totalActive / maxConnections) * 100 * 10) / 10
      : 0;

  const recommendations: string[] = [];
  if (usagePercent > 80) {
    recommendations.push(
      "Connection pool near capacity — consider pg_connection_pool_optimize",
    );
  }
  if (usagePercent > 90) {
    recommendations.push(
      "Critical connection pressure — increase max_connections or use PgBouncer",
    );
  }

  const status = rateValue(usagePercent, 70, 85, false);

  return {
    status,
    data: {
      activeConnections: totalActive,
      maxConnections,
      usagePercent,
      byState,
    },
    recommendations,
  };
}

async function diagnoseCacheHitRatio(
  adapter: PostgresAdapter,
): Promise<
  SectionResult<{ heapRead: number; heapHit: number; ratio: number | null }>
> {
  const result = await adapter.executeQuery(`
    SELECT
      sum(heap_blks_read) AS heap_read,
      sum(heap_blks_hit)  AS heap_hit,
      CASE WHEN sum(heap_blks_hit) + sum(heap_blks_read) > 0
        THEN round(sum(heap_blks_hit)::numeric / (sum(heap_blks_hit) + sum(heap_blks_read)) * 100, 2)
        ELSE NULL
      END AS ratio
    FROM pg_statio_user_tables
  `);

  const row = result.rows?.[0] ?? {};
  const heapRead = toNum(row["heap_read"]);
  const heapHit = toNum(row["heap_hit"]);
  const ratio =
    row["ratio"] !== null && row["ratio"] !== undefined
      ? Number(row["ratio"])
      : null;

  const recommendations: string[] = [];
  if (ratio !== null && ratio < 99) {
    recommendations.push(
      "Cache hit ratio below 99% — consider increasing shared_buffers",
    );
  }
  if (ratio !== null && ratio < 95) {
    recommendations.push(
      "Poor cache hit ratio — working set exceeds memory. Audit large sequential scans",
    );
  }

  const status =
    ratio === null
      ? ("healthy" as HealthRating)
      : rateValue(ratio, 99, 95, true);

  return { status, data: { heapRead, heapHit, ratio }, recommendations };
}

async function diagnoseDiskUsage(
  adapter: PostgresAdapter,
): Promise<SectionResult<{ totalBytes: number; totalSize: string }>> {
  const result = await adapter.executeQuery(`
    SELECT pg_database_size(current_database()) AS total_bytes,
           pg_size_pretty(pg_database_size(current_database())) AS total_size
  `);

  const row = result.rows?.[0] ?? {};
  const totalBytes = toNum(row["total_bytes"]);
  const rawSize = row["total_size"];
  const totalSize = typeof rawSize === "string" ? rawSize : "0 bytes";

  // Disk usage is informational — always healthy (no thresholds)
  return {
    status: "healthy",
    data: { totalBytes, totalSize },
    recommendations: [],
  };
}

async function diagnoseTopTables(
  adapter: PostgresAdapter,
  topN: number,
  schema?: string,
): Promise<
  SectionResult<{
    bySize: Record<string, unknown>[];
    byActivity: Record<string, unknown>[];
  }>
> {
  let schemaFilter: string;
  if (schema) {
    validateIdentifier(schema);
    schemaFilter = `AND schemaname = '${schema}'`;
  } else {
    schemaFilter = `AND schemaname NOT IN ('pg_catalog', 'information_schema', 'cron', 'topology', 'tiger', 'tiger_data')`;
  }

  const [sizeResult, activityResult] = await Promise.all([
    adapter.executeQuery(`
      SELECT schemaname AS schema, relname AS table,
             pg_total_relation_size(schemaname || '.' || relname) AS total_bytes,
             pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)) AS total_size,
             n_live_tup AS estimated_rows
      FROM pg_stat_user_tables
      WHERE TRUE ${schemaFilter}
      ORDER BY pg_total_relation_size(schemaname || '.' || relname) DESC
      LIMIT ${String(topN)}
    `),
    adapter.executeQuery(`
      SELECT schemaname AS schema, relname AS table,
             seq_scan + idx_scan AS total_scans,
             seq_scan, idx_scan,
             n_tup_ins AS inserts, n_tup_upd AS updates, n_tup_del AS deletes,
             n_dead_tup AS dead_tuples
      FROM pg_stat_user_tables
      WHERE TRUE ${schemaFilter}
      ORDER BY (seq_scan + idx_scan) DESC
      LIMIT ${String(topN)}
    `),
  ]);

  const bySize = sizeResult.rows ?? [];
  const byActivity = activityResult.rows ?? [];

  const recommendations: string[] = [];

  // Check for high dead tuple ratios
  for (const row of byActivity) {
    const deadTuples = toNum(row["dead_tuples"]);
    const inserts = toNum(row["inserts"]);
    if (deadTuples > 10000 && inserts > 0 && deadTuples / inserts > 0.5) {
      recommendations.push(
        `Table ${String(row["schema"])}.${String(row["table"])} has high dead tuples (${String(deadTuples)}) — run pg_vacuum_analyze`,
      );
      break; // Only recommend once
    }
  }

  // Check for seq scan dominance
  for (const row of byActivity) {
    const seqScan = toNum(row["seq_scan"]);
    const idxScan = toNum(row["idx_scan"]);
    if (seqScan > 1000 && idxScan === 0) {
      recommendations.push(
        `Table ${String(row["schema"])}.${String(row["table"])} has ${String(seqScan)} seq scans and 0 index scans — add indexes`,
      );
      break;
    }
  }

  return {
    status: recommendations.length > 0 ? "warning" : "healthy",
    data: { bySize, byActivity },
    recommendations,
  };
}

// =============================================================================
// Tool Factory
// =============================================================================

export function createDiagnoseTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_diagnose_database_performance",
    description:
      "Consolidates key performance metrics into a single actionable report: " +
      "slow queries, blocking locks, connection pressure, cache hit ratio, " +
      "disk usage, and top tables by size and activity. Returns per-section " +
      "health ratings and recommendations with an overall health score.",
    inputSchema: DiagnoseInputSchemaBase.shape,
    outputSchema: z.object({
      sections: z.object({
        slowQueries: z.record(z.string(), z.unknown()),
        blockingLocks: z.record(z.string(), z.unknown()),
        connectionPressure: z.record(z.string(), z.unknown()),
        cacheHitRatio: z.record(z.string(), z.unknown()),
        diskUsage: z.record(z.string(), z.unknown()),
        topTables: z.record(z.string(), z.unknown()),
      }).optional(),
      overallScore: z.number().optional(),
      overallStatus: z.enum(["healthy", "warning", "critical"]).optional(),
      totalRecommendations: z.number().optional(),
      allRecommendations: z.array(z.string()).optional(),
    }),
    group: "performance",
    annotations: readOnly("Diagnose database performance"),
    icons: getToolIcons(
      "performance",
      readOnly("Diagnose database performance"),
    ),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = DiagnoseInputSchema.safeParse(params);
        if (!parsed.success) {
          return {
            success: false,
            error: `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          };
        }

        const { schema, topN } = parsed.data;

        // Run all diagnostics in parallel
        const [
          slowQueries,
          blockingLocks,
          connectionPressure,
          cacheHitRatio,
          diskUsage,
          topTables,
        ] = await Promise.all([
          diagnoseSlowQueries(adapter),
          diagnoseBlockingLocks(adapter),
          diagnoseConnectionPressure(adapter),
          diagnoseCacheHitRatio(adapter),
          diagnoseDiskUsage(adapter),
          diagnoseTopTables(adapter, topN, schema),
        ]);

        // Calculate overall score
        const sections = [
          slowQueries,
          blockingLocks,
          connectionPressure,
          cacheHitRatio,
          topTables,
        ];
        const overallScore = Math.round(
          sections.reduce((sum, s) => sum + statusWeight[s.status], 0) /
            sections.length,
        );

        const overallStatus: HealthRating =
          overallScore >= 90
            ? "healthy"
            : overallScore >= 60
              ? "warning"
              : "critical";

        const allRecommendations = sections.flatMap((s) => s.recommendations);

        return {
          sections: {
            slowQueries,
            blockingLocks,
            connectionPressure,
            cacheHitRatio,
            diskUsage,
            topTables,
          },
          overallScore,
          overallStatus,
          totalRecommendations: allRecommendations.length,
          allRecommendations,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_diagnose_database_performance",
          });
      }
    },
  };
}
