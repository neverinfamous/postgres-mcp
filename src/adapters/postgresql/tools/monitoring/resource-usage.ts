/**
 * PostgreSQL Monitoring — Resource Usage Analysis
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition, RequestContext } from "../../../../types/index.js";
import { z } from "zod";
import { readOnly } from "../../../../utils/annotations.js";

import { getToolIcons } from "../../../../utils/icons.js";
import { ResourceUsageAnalyzeOutputSchema } from "../../schemas/index.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";

export function createResourceUsageAnalyzeTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_resource_usage_analyze",
    description:
      "Analyze current resource usage including CPU, memory, and I/O patterns.",
    group: "monitoring",
    inputSchema: z.object({}).strict(),
    outputSchema: ResourceUsageAnalyzeOutputSchema,
    annotations: readOnly("Resource Usage Analysis"),
    icons: getToolIcons("monitoring", readOnly("Resource Usage Analysis")),
    handler: async (_params: unknown, _context: RequestContext) => {
      try {
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
        success: true,
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
      } catch (err) {
        return formatHandlerErrorResponse(err, { tool: "pg_resource_usage_analyze" });
      }
    },
  };
}
