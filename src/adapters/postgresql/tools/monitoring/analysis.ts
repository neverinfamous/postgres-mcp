/**
 * PostgreSQL Monitoring Tools - Advanced Analysis
 *
 * Capacity planning, resource usage analysis, and alert thresholds.
 * 3 tools total.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly } from "../../../../utils/annotations.js";
import { formatPostgresError } from "../core/error-helpers.js";
import { getToolIcons } from "../../../../utils/icons.js";
import {
  CapacityPlanningOutputSchema,
  ResourceUsageAnalyzeOutputSchema,
  AlertThresholdOutputSchema,
} from "../../schemas/index.js";

// =============================================================================
// pg_capacity_planning
// =============================================================================

export function createCapacityPlanningTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  // Schema with alias support and validation for non-negative days
  const CapacityPlanningSchema = z
    .object({
      projectionDays: z
        .number()
        .optional()
        .describe("Days to project growth (default: 90)"),
      days: z.number().optional().describe("Alias for projectionDays"),
    })
    .refine(
      (data) => {
        const val = data.projectionDays ?? data.days;
        return val === undefined || val >= 0;
      },
      {
        message: "Projection days must be a non-negative number",
        path: ["days"],
      },
    )
    .transform((data) => ({
      projectionDays: data.projectionDays ?? data.days ?? 90,
    }));

  return {
    name: "pg_capacity_planning",
    description:
      "Analyze database growth trends and provide capacity planning forecasts. Note: Growth estimates are based on pg_stat_user_tables counters since last stats reset; accuracy depends on how long stats have been accumulating.",
    group: "monitoring",
    inputSchema: z.object({
      projectionDays: z
        .number()
        .optional()
        .describe("Days to project growth (default: 90)"),
      days: z.number().optional().describe("Alias for projectionDays"),
    }),
    outputSchema: CapacityPlanningOutputSchema,
    annotations: readOnly("Capacity Planning"),
    icons: getToolIcons("monitoring", readOnly("Capacity Planning")),
    handler: async (params: unknown, _context: RequestContext) => {
      let parsed;
      try {
        parsed = CapacityPlanningSchema.parse(params ?? {});
      } catch (err) {
        if (err instanceof z.ZodError) {
          return {
            success: false,
            error: err.issues.map((i) => i.message).join("; "),
          };
        }
        return {
          success: false,
          error: formatPostgresError(err, { tool: "pg_capacity_planning" }),
        };
      }
      const projectionDays = parsed.projectionDays;

      const [dbSize, tableStats, connStats, statsAge] = await Promise.all([
        adapter.executeQuery(`
                    SELECT
                        pg_database_size(current_database()) as current_size_bytes,
                        pg_size_pretty(pg_database_size(current_database())) as current_size
                `),
        adapter.executeQuery(`
                    SELECT
                        count(*) as table_count,
                        sum(n_live_tup) as total_rows,
                        sum(n_tup_ins) as total_inserts,
                        sum(n_tup_del) as total_deletes
                    FROM pg_stat_user_tables
                `),
        adapter.executeQuery(`
                    SELECT
                        current_setting('max_connections')::int as max_connections,
                        count(*) as current_connections
                    FROM pg_stat_activity
                    WHERE backend_type = 'client backend'
                `),
        // Get time since stats reset for accurate daily rate calculation
        // Use pg_stat_database.stats_reset (works in all PG versions including 17+)
        // Fall back to server start time if stats_reset is NULL
        adapter.executeQuery(`
                    SELECT
                        COALESCE(
                            (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()),
                            pg_postmaster_start_time()
                        ) as stats_since,
                        EXTRACT(EPOCH FROM (now() - COALESCE(
                            (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()),
                            pg_postmaster_start_time()
                        ))) / 86400.0 as days_of_data
                `),
      ]);

      const currentBytes = Number(
        dbSize.rows?.[0]?.["current_size_bytes"] ?? 0,
      );
      const tableData = tableStats.rows?.[0];
      const connData = connStats.rows?.[0];
      const ageData = statsAge.rows?.[0];

      const totalInserts = Number(tableData?.["total_inserts"] ?? 0);
      const totalDeletes = Number(tableData?.["total_deletes"] ?? 0);
      const netRowGrowth = totalInserts - totalDeletes;

      const totalRows = Number(tableData?.["total_rows"] ?? 1);
      const avgRowSize = currentBytes / Math.max(totalRows, 1);

      // Use actual days of data for accurate daily growth rate
      const daysOfData = Number(ageData?.["days_of_data"] ?? 1);
      const dailyRowGrowth = daysOfData > 0.01 ? netRowGrowth / daysOfData : 0;
      const dailyGrowthBytes = dailyRowGrowth * avgRowSize;
      const projectedGrowthBytes = dailyGrowthBytes * projectionDays;
      const projectedTotalBytes = currentBytes + projectedGrowthBytes;

      // Determine estimation quality based on data availability
      const estimationQuality =
        daysOfData < 1
          ? "Low confidence - less than 1 day of data"
          : daysOfData < 7
            ? "Moderate confidence - less than 1 week of data"
            : daysOfData < 30
              ? "Good confidence - more than 1 week of data"
              : "High confidence - more than 30 days of data";

      // Coerce numeric fields
      const dbSizeRow = dbSize.rows?.[0] as
        | { current_size_bytes: string | number; current_size: string }
        | undefined;
      const coercedDbSize = dbSizeRow
        ? {
            current_size_bytes:
              typeof dbSizeRow.current_size_bytes === "number"
                ? dbSizeRow.current_size_bytes
                : typeof dbSizeRow.current_size_bytes === "string"
                  ? parseInt(dbSizeRow.current_size_bytes, 10)
                  : 0,
            current_size: dbSizeRow.current_size,
          }
        : undefined;

      const tableCountRaw = tableData?.["table_count"];
      const totalRowsRaw = tableData?.["total_rows"];
      const totalInsertsRaw = tableData?.["total_inserts"];
      const totalDeletesRaw = tableData?.["total_deletes"];

      return {
        current: {
          databaseSize: coercedDbSize,
          tableCount:
            typeof tableCountRaw === "number"
              ? tableCountRaw
              : typeof tableCountRaw === "string"
                ? parseInt(tableCountRaw, 10)
                : 0,
          totalRows:
            typeof totalRowsRaw === "number"
              ? totalRowsRaw
              : typeof totalRowsRaw === "string"
                ? parseInt(totalRowsRaw, 10)
                : 0,
          connections: `${String(Number(connData?.["current_connections"] ?? 0))}/${String(Number(connData?.["max_connections"] ?? 0))}`,
        },
        growth: {
          totalInserts:
            typeof totalInsertsRaw === "number"
              ? totalInsertsRaw
              : typeof totalInsertsRaw === "string"
                ? parseInt(totalInsertsRaw, 10)
                : 0,
          totalDeletes:
            typeof totalDeletesRaw === "number"
              ? totalDeletesRaw
              : typeof totalDeletesRaw === "string"
                ? parseInt(totalDeletesRaw, 10)
                : 0,
          netRowGrowth,
          daysOfData: parseFloat(daysOfData.toFixed(1)),
          statsSince: ageData?.["stats_since"],
          estimatedDailyRowGrowth: Math.round(dailyRowGrowth),
          estimatedDailyGrowthBytes: Math.round(dailyGrowthBytes),
          estimationQuality,
        },
        projection: {
          days: projectionDays,
          projectedSizeBytes: Math.round(projectedTotalBytes),
          projectedSizePretty: `${(projectedTotalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`,
          growthPercentage:
            currentBytes > 0
              ? parseFloat(
                  ((projectedGrowthBytes / currentBytes) * 100).toFixed(1),
                )
              : 0.0,
        },
        recommendations: [
          projectedTotalBytes > 100 * 1024 * 1024 * 1024
            ? "Consider archiving old data or implementing table partitioning"
            : null,
          Number(connData?.["current_connections"] ?? 0) >
          Number(connData?.["max_connections"] ?? 100) * 0.7
            ? "Connection usage is high, consider increasing max_connections"
            : null,
          daysOfData < 7
            ? "Wait for more data accumulation for more accurate projections"
            : null,
        ].filter(Boolean),
      };
    },
  };
}

// =============================================================================
// pg_resource_usage_analyze
// =============================================================================

export function createResourceUsageAnalyzeTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_resource_usage_analyze",
    description:
      "Analyze current resource usage including CPU, memory, and I/O patterns.",
    group: "monitoring",
    inputSchema: z.object({}),
    outputSchema: ResourceUsageAnalyzeOutputSchema,
    annotations: readOnly("Resource Usage Analysis"),
    icons: getToolIcons("monitoring", readOnly("Resource Usage Analysis")),
    handler: async (_params: unknown, _context: RequestContext) => {
      // Detect PostgreSQL version for checkpoint stats compatibility
      const versionResult = await adapter.executeQuery(
        `SELECT current_setting('server_version_num')::int as version_num`,
      );
      const versionNum = Number(versionResult.rows?.[0]?.["version_num"] ?? 0);
      const isPg17Plus = versionNum >= 170000;

      const [bgWriter, checkpoints, connections, buffers, activity] =
        await Promise.all([
          // PG17+ moved buffers_checkpoint to pg_stat_checkpointer as buffers_written
          isPg17Plus
            ? adapter.executeQuery(`
                        SELECT
                            buffers_clean, maxwritten_clean, buffers_alloc
                        FROM pg_stat_bgwriter
                    `)
            : adapter.executeQuery(`
                        SELECT
                            buffers_checkpoint, buffers_clean, buffers_backend,
                            maxwritten_clean, buffers_alloc
                        FROM pg_stat_bgwriter
                    `),
          // PG17+ moved checkpoint stats to pg_stat_checkpointer with renamed columns
          isPg17Plus
            ? adapter.executeQuery(`
                        SELECT
                            num_timed as checkpoints_timed,
                            num_requested as checkpoints_req,
                            write_time as checkpoint_write_time,
                            sync_time as checkpoint_sync_time,
                            buffers_written as buffers_checkpoint
                        FROM pg_stat_checkpointer
                    `)
            : adapter.executeQuery(`
                        SELECT
                            checkpoints_timed, checkpoints_req,
                            checkpoint_write_time, checkpoint_sync_time
                        FROM pg_stat_bgwriter
                    `),
          adapter.executeQuery(`
                    SELECT
                        state, wait_event_type, wait_event,
                        count(*) as count
                    FROM pg_stat_activity
                    WHERE backend_type = 'client backend'
                    GROUP BY state, wait_event_type, wait_event
                `),
          adapter.executeQuery(`
                    SELECT
                        sum(heap_blks_read) as heap_reads,
                        sum(heap_blks_hit) as heap_hits,
                        sum(idx_blks_read) as index_reads,
                        sum(idx_blks_hit) as index_hits
                    FROM pg_statio_user_tables
                `),
          adapter.executeQuery(`
                    SELECT
                        count(*) FILTER (WHERE state = 'active') as active_queries,
                        count(*) FILTER (WHERE state = 'idle') as idle_connections,
                        count(*) FILTER (WHERE wait_event_type = 'Lock') as lock_waiting,
                        count(*) FILTER (WHERE wait_event_type = 'IO') as io_waiting
                    FROM pg_stat_activity
                    WHERE backend_type = 'client backend'
                `),
        ]);

      const bufferData = buffers.rows?.[0];
      const heapHits = Number(bufferData?.["heap_hits"] ?? 0);
      const heapReads = Number(bufferData?.["heap_reads"] ?? 0);
      const indexHits = Number(bufferData?.["index_hits"] ?? 0);
      const indexReads = Number(bufferData?.["index_reads"] ?? 0);

      // Calculate hit rates
      const heapHitRate =
        heapHits + heapReads > 0
          ? (heapHits / (heapHits + heapReads)) * 100
          : null;
      const indexHitRate =
        indexHits + indexReads > 0
          ? (indexHits / (indexHits + indexReads)) * 100
          : null;

      // Interpret buffer hit rates
      const getHitRateAnalysis = (
        rate: number | null,
        type: string,
      ): string => {
        if (rate === null)
          return `No ${type} activity recorded yet - run some queries first`;
        if (rate >= 99)
          return `Excellent (${rate.toFixed(2)}%) - nearly all ${type} data served from cache`;
        if (rate >= 95)
          return `Good (${rate.toFixed(2)}%) - most ${type} reads from cache`;
        if (rate >= 80)
          return `Fair (${rate.toFixed(2)}%) - consider increasing shared_buffers`;
        return `Poor (${rate.toFixed(2)}%) - significant disk I/O; increase shared_buffers or optimize queries`;
      };

      // Helper to coerce value to number
      const toNum = (val: unknown): number =>
        typeof val === "number"
          ? val
          : typeof val === "string"
            ? parseInt(val, 10)
            : 0;

      // Coerce backgroundWriter fields
      const bgWriterRaw = bgWriter.rows?.[0];
      const coercedBgWriter = bgWriterRaw
        ? {
            buffers_clean: toNum(bgWriterRaw["buffers_clean"]),
            maxwritten_clean: toNum(bgWriterRaw["maxwritten_clean"]),
            buffers_alloc: toNum(bgWriterRaw["buffers_alloc"]),
            ...(bgWriterRaw["buffers_checkpoint"] !== undefined && {
              buffers_checkpoint: toNum(bgWriterRaw["buffers_checkpoint"]),
            }),
            ...(bgWriterRaw["buffers_backend"] !== undefined && {
              buffers_backend: toNum(bgWriterRaw["buffers_backend"]),
            }),
          }
        : undefined;

      // Coerce checkpoints fields
      const checkpointsRaw = checkpoints.rows?.[0];
      const coercedCheckpoints = checkpointsRaw
        ? {
            checkpoints_timed: toNum(checkpointsRaw["checkpoints_timed"]),
            checkpoints_req: toNum(checkpointsRaw["checkpoints_req"]),
            checkpoint_write_time: toNum(
              checkpointsRaw["checkpoint_write_time"],
            ),
            checkpoint_sync_time: toNum(checkpointsRaw["checkpoint_sync_time"]),
            ...(checkpointsRaw["buffers_checkpoint"] !== undefined && {
              buffers_checkpoint: toNum(checkpointsRaw["buffers_checkpoint"]),
            }),
          }
        : undefined;

      // Coerce connectionDistribution count fields
      const coercedConnDist = (connections.rows ?? []).map(
        (row: Record<string, unknown>) => ({
          ...row,
          count: toNum(row["count"]),
        }),
      );

      // Coerce activity fields
      const activityRaw = activity.rows?.[0];
      const coercedActivity = activityRaw
        ? {
            active_queries: toNum(activityRaw["active_queries"]),
            idle_connections: toNum(activityRaw["idle_connections"]),
            lock_waiting: toNum(activityRaw["lock_waiting"]),
            io_waiting: toNum(activityRaw["io_waiting"]),
          }
        : undefined;

      return {
        backgroundWriter: coercedBgWriter,
        checkpoints: coercedCheckpoints,
        connectionDistribution: coercedConnDist,
        bufferUsage: {
          heap_reads: heapReads,
          heap_hits: heapHits,
          index_reads: indexReads,
          index_hits: indexHits,
          heapHitRate:
            heapHitRate !== null ? heapHitRate.toFixed(2) + "%" : "N/A",
          indexHitRate:
            indexHitRate !== null ? indexHitRate.toFixed(2) + "%" : "N/A",
        },
        activity: coercedActivity,
        analysis: {
          heapCachePerformance: getHitRateAnalysis(heapHitRate, "heap"),
          indexCachePerformance: getHitRateAnalysis(indexHitRate, "index"),
          checkpointPressure:
            (coercedCheckpoints?.checkpoints_req ?? 0) >
            (coercedCheckpoints?.checkpoints_timed ?? 0)
              ? "HIGH - More forced checkpoints than scheduled"
              : "Normal",
          ioPattern:
            (coercedActivity?.io_waiting ?? 0) > 0
              ? "Some queries waiting on I/O"
              : "No I/O wait bottlenecks detected",
          lockContention:
            (coercedActivity?.lock_waiting ?? 0) > 0
              ? `${String(coercedActivity?.lock_waiting ?? 0)} queries waiting on locks`
              : "No lock contention",
        },
      };
    },
  };
}

// =============================================================================
// pg_alert_threshold_set
// =============================================================================

/**
 * Alert threshold recommendations (informational)
 */
export function createAlertThresholdSetTool(
  _adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_alert_threshold_set",
    description:
      "Get recommended alert thresholds for monitoring key database metrics. Note: This is informational only - returns suggested warning/critical thresholds for external monitoring tools. Does not configure alerts in PostgreSQL itself.",
    group: "monitoring",
    inputSchema: z.object({
      metric: z
        .string()
        .optional()
        .describe(
          "Specific metric to get thresholds for, or all if not specified. Valid: connection_usage, cache_hit_ratio, replication_lag, dead_tuples, long_running_queries, lock_wait_time",
        ),
    }),
    outputSchema: AlertThresholdOutputSchema,
    annotations: readOnly("Get Alert Thresholds"),
    icons: getToolIcons("monitoring", readOnly("Get Alert Thresholds")),
    handler: (params: unknown, _context: RequestContext) => {
      const AlertThresholdSchema = z.object({
        metric: z.string().optional(),
      });

      const parsed = AlertThresholdSchema.parse(params ?? {});

      const validMetrics = [
        "connection_usage",
        "cache_hit_ratio",
        "replication_lag",
        "dead_tuples",
        "long_running_queries",
        "lock_wait_time",
      ];

      if (parsed.metric && !validMetrics.includes(parsed.metric)) {
        return Promise.resolve({
          success: false,
          error: `Invalid metric "${parsed.metric}". Valid metrics: ${validMetrics.join(", ")}`,
        });
      }

      const thresholds: Record<
        string,
        { warning: string; critical: string; description: string }
      > = {
        connection_usage: {
          warning: "70%",
          critical: "90%",
          description: "Percentage of max_connections in use",
        },
        cache_hit_ratio: {
          warning: "< 95%",
          critical: "< 80%",
          description: "Buffer cache hit ratio - lower is worse",
        },
        replication_lag: {
          warning: "> 1 minute",
          critical: "> 5 minutes",
          description: "Replication lag from primary to replica",
        },
        dead_tuples: {
          warning: "> 10% of live tuples",
          critical: "> 25% of live tuples",
          description: "Dead tuples indicating need for VACUUM",
        },
        long_running_queries: {
          warning: "> 5 minutes",
          critical: "> 30 minutes",
          description: "Queries running longer than threshold",
        },
        lock_wait_time: {
          warning: "> 30 seconds",
          critical: "> 5 minutes",
          description: "Time spent waiting for locks",
        },
      };

      if (parsed.metric && thresholds[parsed.metric]) {
        return Promise.resolve({
          metric: parsed.metric,
          threshold: thresholds[parsed.metric],
        });
      }

      return Promise.resolve({
        thresholds,
        note: "These are recommended starting thresholds. Adjust based on your specific workload and requirements.",
      });
    },
  };
}
