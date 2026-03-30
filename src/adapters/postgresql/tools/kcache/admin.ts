/**
 * PostgreSQL pg_stat_kcache - Admin & Analysis Tools
 *
 * Extension management, database stats, resource analysis, and reset tools.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import { type ToolDefinition, type RequestContext, ValidationError } from "../../../../types/index.js";
import { z } from "zod";
import { readOnly, write, destructive } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  KcacheDatabaseStatsSchemaBase,
  KcacheDatabaseStatsSchema,
  KcacheResourceAnalysisSchemaBase,
  KcacheCreateExtensionOutputSchema,
  KcacheDatabaseStatsOutputSchema,
  KcacheResourceAnalysisOutputSchema,
  KcacheResetOutputSchema,
} from "../../schemas/index.js";
import { getKcacheColumnNames } from "./helpers.js";

/**
 * Enable the pg_stat_kcache extension
 */
export function createKcacheExtensionTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_kcache_create_extension",
    description: `Enable the pg_stat_kcache extension for OS-level performance metrics.
Requires pg_stat_statements to be installed first. Both extensions must be in shared_preload_libraries.`,
    group: "kcache",
    inputSchema: z.object({}).strict(),
    outputSchema: KcacheCreateExtensionOutputSchema,
    annotations: write("Create Kcache Extension"),
    icons: getToolIcons("kcache", write("Create Kcache Extension")),
    handler: async (_params: unknown, _context: RequestContext) => {
      const statementsCheck = await adapter.executeQuery(`
                SELECT EXISTS(
                    SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
                ) as installed
            `);

      const hasStatements =
        (statementsCheck.rows?.[0]?.["installed"] as boolean) ?? false;
      if (!hasStatements) {
        return {
          success: false,
          error: "pg_stat_statements must be installed before pg_stat_kcache",
          hint: "Run: CREATE EXTENSION IF NOT EXISTS pg_stat_statements",
        };
      }

      await adapter.executeQuery(
        "CREATE EXTENSION IF NOT EXISTS pg_stat_kcache",
      );
      return {
        success: true,
        message: "pg_stat_kcache extension enabled",
        note: "Ensure pg_stat_kcache is in shared_preload_libraries for full functionality",
      };
    },
  };
}

/**
 * Database-level aggregated stats
 */
export function createKcacheDatabaseStatsTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_kcache_database_stats",
    description: `Get aggregated OS-level statistics for a database.
Shows total CPU time, I/O, and page faults across all queries.`,
    group: "kcache",
    inputSchema: KcacheDatabaseStatsSchemaBase,
    outputSchema: KcacheDatabaseStatsOutputSchema,
    annotations: readOnly("Kcache Database Stats"),
    icons: getToolIcons("kcache", readOnly("Kcache Database Stats")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { database } = KcacheDatabaseStatsSchema.parse(params);
        const cols = await getKcacheColumnNames(adapter);

        let sql: string;
        const queryParams: unknown[] = [];

        if (database !== undefined) {
          sql = `
                    SELECT
                        d.datname as database,
                        SUM(k.${cols.userTime}) as total_user_time,
                        SUM(k.${cols.systemTime}) as total_system_time,
                        SUM(k.${cols.userTime} + k.${cols.systemTime}) as total_cpu_time,
                        SUM(k.${cols.reads}) as total_read_bytes,
                        SUM(k.${cols.writes}) as total_write_bytes,
                        pg_size_pretty(SUM(k.${cols.reads})::bigint) as total_reads_pretty,
                        pg_size_pretty(SUM(k.${cols.writes})::bigint) as total_writes_pretty,
                        SUM(k.${cols.minflts}) as total_minor_faults,
                        SUM(k.${cols.majflts}) as total_major_faults,
                        COUNT(*) as total_statement_entries
                    FROM pg_stat_kcache k
                    JOIN pg_database d ON k.datname = d.datname
                    WHERE d.datname = $1
                    GROUP BY d.datname
                `;
          queryParams.push(database);
        } else {
          sql = `
                    SELECT
                        datname as database,
                        SUM(${cols.userTime}) as total_user_time,
                        SUM(${cols.systemTime}) as total_system_time,
                        SUM(${cols.userTime} + ${cols.systemTime}) as total_cpu_time,
                        SUM(${cols.reads}) as total_read_bytes,
                        SUM(${cols.writes}) as total_write_bytes,
                        pg_size_pretty(SUM(${cols.reads})::bigint) as total_reads_pretty,
                        pg_size_pretty(SUM(${cols.writes})::bigint) as total_writes_pretty,
                        SUM(${cols.minflts}) as total_minor_faults,
                        SUM(${cols.majflts}) as total_major_faults,
                        COUNT(*) as total_statement_entries
                    FROM pg_stat_kcache
                    GROUP BY datname
                    ORDER BY SUM(${cols.userTime} + ${cols.systemTime}) DESC
                `;
        }

        const result = await adapter.executeQuery(sql, queryParams);

        return {
          databaseStats: result.rows ?? [],
          count: result.rows?.length ?? 0,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_kcache_database_stats",
          });
      }
    },
  };
}

/**
 * Classify queries as CPU-bound vs I/O-bound
 */
export function createKcacheResourceAnalysisTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_kcache_resource_analysis",
    description: `Analyze queries to classify them as CPU-bound, I/O-bound, or balanced.
Helps identify the root cause of performance issues - is the query computation-heavy or disk-heavy?`,
    group: "kcache",
    inputSchema: KcacheResourceAnalysisSchemaBase,
    outputSchema: KcacheResourceAnalysisOutputSchema,
    annotations: readOnly("Kcache Resource Analysis"),
    icons: getToolIcons("kcache", readOnly("Kcache Resource Analysis")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = z
          .object({
            queryId: z.string().optional(),
            threshold: z.number().optional(),
            limit: z.number().optional(),
            minCalls: z.number().optional(),
            queryPreviewLength: z.number().optional(),
            compact: z.boolean().optional(),
          })
          .parse(params ?? {});

        const queryId = parsed.queryId;
        const threshold = parsed.threshold;
        const limit = parsed.limit;

        if (limit !== undefined && (limit < 0 || limit > 100)) {
          throw new ValidationError("limit must be between 0 and 100");
        }
        const minCalls = parsed.minCalls;
        const queryPreviewLength = parsed.queryPreviewLength;

        const thresholdVal = threshold ?? 0.5;
        const DEFAULT_LIMIT = 20;
        const limitVal = limit ?? DEFAULT_LIMIT;
        const effectiveLimit = limitVal === 0 ? 100 : limitVal;
        // Bound queryPreviewLength: 0 = full query, default 100, max 500
        const previewLen =
          queryPreviewLength === 0
            ? 10000
            : Math.min(queryPreviewLength ?? 100, 500);
        const cols = await getKcacheColumnNames(adapter);

        const conditions: string[] = [];
        const queryParams: unknown[] = [];
        let paramIndex = 1;

        if (queryId !== undefined) {
          conditions.push(`s.queryid::text = $${String(paramIndex++)}`);
          queryParams.push(queryId);
        }

        if (minCalls !== undefined) {
          conditions.push(`s.calls >= $${String(paramIndex)}`);
          queryParams.push(minCalls);
        }

        conditions.push(
          `(k.${cols.userTime} + k.${cols.systemTime} + k.${cols.reads} + k.${cols.writes}) > 0`,
        );

        const whereClause =
          conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        // Get total count first for truncation indicator
        const countSql = `
                SELECT COUNT(*) as total
                FROM pg_stat_statements s
                JOIN pg_stat_kcache() k ON s.queryid = k.queryid
                    AND s.userid = k.userid
                    AND s.dbid = k.dbid
                ${whereClause}
            `;
        const countResult = await adapter.executeQuery(countSql, queryParams);
        const totalRaw = countResult.rows?.[0]?.["total"];
        const totalCount = Number(totalRaw) || 0;

        const isCompact = parsed.compact ?? true;
        const previewCol = isCompact
          ? ""
          : `LEFT(s.query, ${String(previewLen)}) as query_preview,`;

        const sql = `
                WITH query_metrics AS (
                    SELECT
                        s.queryid,
                        ${previewCol}
                        s.calls,
                        s.total_exec_time as total_time_ms,
                        (k.${cols.userTime} + k.${cols.systemTime}) as cpu_time,
                        (k.${cols.reads} + k.${cols.writes}) as io_bytes,
                        k.${cols.userTime} as user_time,
                        k.${cols.systemTime} as system_time,
                        k.${cols.reads} as reads,
                        k.${cols.writes} as writes
                    FROM pg_stat_statements s
                    JOIN pg_stat_kcache() k ON s.queryid = k.queryid
                        AND s.userid = k.userid
                        AND s.dbid = k.dbid
                    ${whereClause}
                )
                SELECT
                    queryid,
                    ${isCompact ? '' : 'query_preview,'}
                    calls,
                    total_time_ms,
                    cpu_time,
                    io_bytes,
                    CASE
                        WHEN cpu_time > 0 AND io_bytes > 0 THEN
                            CASE
                                WHEN (cpu_time / NULLIF(io_bytes::float / 1000000, 0)) > ${String(1 / thresholdVal)} THEN 'CPU-bound'
                                WHEN (io_bytes::float / 1000000 / NULLIF(cpu_time, 0)) > ${String(1 / thresholdVal)} THEN 'I/O-bound'
                                ELSE 'Balanced'
                            END
                        WHEN cpu_time > 0 THEN 'CPU-bound'
                        WHEN io_bytes > 0 THEN 'I/O-bound'
                        ELSE 'Unknown'
                    END as resource_classification,
                    user_time,
                    system_time,
                    reads,
                    writes,
                    pg_size_pretty(io_bytes::bigint) as io_pretty
                FROM query_metrics
                ORDER BY total_time_ms DESC
                LIMIT ${String(effectiveLimit)}
            `;

        const result = await adapter.executeQuery(sql, queryParams);
        const rawRows = result.rows ?? [];
        const effectiveTotalCount = Math.max(totalCount, rawRows.length);
        const truncated = rawRows.length < effectiveTotalCount;

        const rows = isCompact
          ? rawRows.map(row => {
              const obj: Record<string, unknown> = {};
              for (const [key, value] of Object.entries(row)) {
                if (value !== 0 && value !== "0" && value !== "0 bytes") {
                  obj[key] = value;
                }
              }
              return obj;
            })
          : rawRows;

        const cpuBound = rows.filter(
          (r: Record<string, unknown>) =>
            r["resource_classification"] === "CPU-bound",
        ).length;
        const ioBound = rows.filter(
          (r: Record<string, unknown>) =>
            r["resource_classification"] === "I/O-bound",
        ).length;
        const balanced = rows.filter(
          (r: Record<string, unknown>) =>
            r["resource_classification"] === "Balanced",
        ).length;

        const response: Record<string, unknown> = {
          queries: rows,
          count: rows.length,
          summary: {
            cpuBound,
            ioBound,
            balanced,
            threshold: thresholdVal,
          },
          recommendations: [
            cpuBound > ioBound
              ? "Most resource-intensive queries are CPU-bound. Consider query optimization or more CPU resources."
              : ioBound > cpuBound
                ? "Most resource-intensive queries are I/O-bound. Consider more memory, faster storage, or better indexing."
                : "Resource usage is balanced between CPU and I/O.",
          ],
          truncated,
          totalCount: effectiveTotalCount,
        };

        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_kcache_resource_analysis",
          });
      }
    },
  };
}

/**
 * Reset kcache statistics
 */
export function createKcacheResetTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_kcache_reset",
    description: `Reset pg_stat_kcache statistics. Use this to start fresh measurements.
Note: This also resets pg_stat_statements statistics.`,
    group: "kcache",
    inputSchema: z.object({}).strict(),
    outputSchema: KcacheResetOutputSchema,
    annotations: destructive("Reset Kcache Stats"),
    icons: getToolIcons("kcache", destructive("Reset Kcache Stats")),
    handler: async (_params: unknown, _context: RequestContext) => {
      try {
        await adapter.executeQuery("SELECT pg_stat_kcache_reset()");
        return {
          success: true,
          message: "pg_stat_kcache statistics reset",
          note: "pg_stat_statements statistics were also reset",
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_kcache_reset" });
      }
    },
  };
}
