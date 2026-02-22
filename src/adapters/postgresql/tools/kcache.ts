/**
 * PostgreSQL pg_stat_kcache Extension Tools
 *
 * OS-level performance visibility: CPU, memory, and I/O statistics per query.
 * 7 tools total.
 *
 * pg_stat_kcache extends pg_stat_statements with kernel-level resource metrics:
 * - CPU time (user and system)
 * - Filesystem reads/writes
 * - Page faults (memory pressure indicators)
 *
 * Requires pg_stat_statements to be installed.
 */

import type { PostgresAdapter } from "../PostgresAdapter.js";
import type { ToolDefinition, RequestContext } from "../../../types/index.js";
import { z } from "zod";
import { readOnly, write, destructive } from "../../../utils/annotations.js";
import { getToolIcons } from "../../../utils/icons.js";
import { formatPostgresError } from "./core/error-helpers.js";
import {
  KcacheQueryStatsSchemaBase,
  KcacheQueryStatsSchema,
  KcacheTopCpuSchemaBase,
  KcacheTopIoSchemaBase,
  KcacheDatabaseStatsSchemaBase,
  KcacheDatabaseStatsSchema,
  KcacheResourceAnalysisSchemaBase,
  KcacheResourceAnalysisSchema,
  // Output schemas
  KcacheCreateExtensionOutputSchema,
  KcacheQueryStatsOutputSchema,
  KcacheTopCpuOutputSchema,
  KcacheTopIoOutputSchema,
  KcacheDatabaseStatsOutputSchema,
  KcacheResourceAnalysisOutputSchema,
  KcacheResetOutputSchema,
} from "../schemas/index.js";

/**
 * Column naming in pg_stat_kcache changed in version 2.2:
 * - Old (< 2.2): user_time, system_time, reads, writes
 * - New (>= 2.2): exec_user_time, exec_system_time, exec_reads, exec_writes
 *
 * These column names are shared between the pg_stat_kcache VIEW and
 * the pg_stat_kcache() FUNCTION. The VIEW also has _blks variants,
 * but the byte-based names work for both contexts.
 */
interface KcacheColumns {
  userTime: string;
  systemTime: string;
  reads: string; // bytes (not blocks!)
  writes: string; // bytes (not blocks!)
  minflts: string;
  majflts: string;
}

async function getKcacheColumnNames(
  adapter: PostgresAdapter,
): Promise<KcacheColumns> {
  const result = await adapter.executeQuery(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'pg_stat_kcache' AND column_name = 'exec_user_time'
    `);
  const isNewVersion = (result.rows?.length ?? 0) > 0;

  if (isNewVersion) {
    return {
      userTime: "exec_user_time",
      systemTime: "exec_system_time",
      reads: "exec_reads", // function returns bytes, not blocks
      writes: "exec_writes", // function returns bytes, not blocks
      minflts: "exec_minflts",
      majflts: "exec_majflts",
    };
  }
  return {
    userTime: "user_time",
    systemTime: "system_time",
    reads: "reads",
    writes: "writes",
    minflts: "minflts",
    majflts: "majflts",
  };
}

/**
 * Get all pg_stat_kcache tools
 */
export function getKcacheTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    createKcacheExtensionTool(adapter),
    createKcacheQueryStatsTool(adapter),
    createKcacheTopCpuTool(adapter),
    createKcacheTopIoTool(adapter),
    createKcacheDatabaseStatsTool(adapter),
    createKcacheResourceAnalysisTool(adapter),
    createKcacheResetTool(adapter),
  ];
}

/**
 * Enable the pg_stat_kcache extension
 */
function createKcacheExtensionTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_kcache_create_extension",
    description: `Enable the pg_stat_kcache extension for OS-level performance metrics. 
Requires pg_stat_statements to be installed first. Both extensions must be in shared_preload_libraries.`,
    group: "kcache",
    inputSchema: z.object({}),
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
 * Query stats with CPU/IO metrics joined from pg_stat_statements
 */
function createKcacheQueryStatsTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_kcache_query_stats",
    description: `Get query statistics with OS-level CPU and I/O metrics. 
Joins pg_stat_statements with pg_stat_kcache to show what SQL did AND what system resources it consumed.

orderBy options: 'total_time' (default), 'cpu_time', 'reads', 'writes'. Use minCalls parameter to filter by call count.`,
    group: "kcache",
    inputSchema: KcacheQueryStatsSchemaBase,
    outputSchema: KcacheQueryStatsOutputSchema,
    annotations: readOnly("Kcache Query Stats"),
    icons: getToolIcons("kcache", readOnly("Kcache Query Stats")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { limit, orderBy, minCalls, queryPreviewLength } =
          KcacheQueryStatsSchema.parse(params);

        // Validate orderBy inside handler for structured error response
        const VALID_ORDER_BY = [
          "total_time",
          "cpu_time",
          "reads",
          "writes",
        ] as const;
        if (
          orderBy !== undefined &&
          !VALID_ORDER_BY.includes(orderBy as (typeof VALID_ORDER_BY)[number])
        ) {
          return {
            success: false,
            error: `Invalid orderBy value "${orderBy}". Valid options: ${VALID_ORDER_BY.join(", ")}`,
          };
        }

        const cols = await getKcacheColumnNames(adapter);

        const DEFAULT_LIMIT = 20;
        // limit: 0 means "no limit" (return all rows), undefined means use default
        const limitVal = limit === 0 ? null : (limit ?? DEFAULT_LIMIT);
        // Bound queryPreviewLength: 0 = full query, default 100, max 500
        const previewLen =
          queryPreviewLength === 0
            ? 10000
            : Math.min(queryPreviewLength ?? 100, 500);

        const orderColumn =
          orderBy === "cpu_time"
            ? `(k.${cols.userTime} + k.${cols.systemTime})`
            : orderBy === "reads"
              ? `k.${cols.reads}`
              : orderBy === "writes"
                ? `k.${cols.writes}`
                : "s.total_exec_time";

        const conditions: string[] = [];
        const queryParams: unknown[] = [];
        const paramIndex = 1;

        if (minCalls !== undefined) {
          conditions.push(`s.calls >= $${String(paramIndex)}`);
          queryParams.push(minCalls);
        }

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

        const sql = `
                SELECT 
                    s.queryid,
                    LEFT(s.query, ${String(previewLen)}) as query_preview,
                    s.calls,
                    s.total_exec_time as total_time_ms,
                    s.mean_exec_time as mean_time_ms,
                    k.${cols.userTime} as user_time,
                    k.${cols.systemTime} as system_time,
                    (k.${cols.userTime} + k.${cols.systemTime}) as total_cpu_time,
                    k.${cols.reads} as read_bytes,
                    k.${cols.writes} as write_bytes,
                    pg_size_pretty(k.${cols.reads}::bigint) as reads_pretty,
                    pg_size_pretty(k.${cols.writes}::bigint) as writes_pretty,
                    k.${cols.minflts} as minor_page_faults,
                    k.${cols.majflts} as major_page_faults
                FROM pg_stat_statements s
                JOIN pg_stat_kcache() k ON s.queryid = k.queryid 
                    AND s.userid = k.userid 
                    AND s.dbid = k.dbid
                ${whereClause}
                ORDER BY ${orderColumn} DESC
                ${limitVal !== null ? `LIMIT ${String(limitVal)}` : ""}
            `;

        const result = await adapter.executeQuery(sql, queryParams);
        const rowCount = result.rows?.length ?? 0;
        const effectiveTotalCount = Math.max(totalCount, rowCount);
        const truncated = rowCount < effectiveTotalCount;

        const response: Record<string, unknown> = {
          queries: result.rows ?? [],
          count: rowCount,
          orderBy: orderBy ?? "total_time",
          truncated,
          totalCount: effectiveTotalCount,
        };

        return response;
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, { tool: "pg_kcache_query_stats" }),
        };
      }
    },
  };
}

/**
 * Top CPU-consuming queries
 */
function createKcacheTopCpuTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_kcache_top_cpu",
    description: `Get top CPU-consuming queries. Shows which queries spend the most time 
in user CPU (application code) vs system CPU (kernel operations).`,
    group: "kcache",
    inputSchema: KcacheTopCpuSchemaBase,
    outputSchema: KcacheTopCpuOutputSchema,
    annotations: readOnly("Kcache Top CPU"),
    icons: getToolIcons("kcache", readOnly("Kcache Top CPU")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = z
          .object({
            limit: z.number().optional(),
            queryPreviewLength: z.number().optional(),
          })
          .parse(params ?? {});
        const DEFAULT_LIMIT = 10;
        // limit: 0 means "no limit" (return all rows), undefined means use default
        const limitVal =
          parsed.limit === 0 ? null : (parsed.limit ?? DEFAULT_LIMIT);
        // Bound queryPreviewLength: 0 = full query, default 100, max 500
        const previewLen =
          parsed.queryPreviewLength === 0
            ? 10000
            : Math.min(parsed.queryPreviewLength ?? 100, 500);
        const cols = await getKcacheColumnNames(adapter);

        // Get total count first for truncation indicator
        const countSql = `
                SELECT COUNT(*) as total
                FROM pg_stat_statements s
                JOIN pg_stat_kcache() k ON s.queryid = k.queryid 
                    AND s.userid = k.userid 
                    AND s.dbid = k.dbid
                WHERE (k.${cols.userTime} + k.${cols.systemTime}) > 0
            `;
        const countResult = await adapter.executeQuery(countSql);
        const totalRaw = countResult.rows?.[0]?.["total"];
        const totalCount = Number(totalRaw) || 0;

        const sql = `
                SELECT 
                    s.queryid,
                    LEFT(s.query, ${String(previewLen)}) as query_preview,
                    s.calls,
                    k.${cols.userTime} as user_time,
                    k.${cols.systemTime} as system_time,
                    (k.${cols.userTime} + k.${cols.systemTime}) as total_cpu_time,
                    CASE 
                        WHEN (k.${cols.userTime} + k.${cols.systemTime}) > 0 
                        THEN ROUND((k.${cols.userTime} / (k.${cols.userTime} + k.${cols.systemTime}) * 100)::numeric, 2)
                        ELSE 0 
                    END as user_cpu_percent,
                    s.total_exec_time as total_time_ms,
                    CASE 
                        WHEN s.total_exec_time > 0 
                        THEN ROUND(((k.${cols.userTime} + k.${cols.systemTime}) / s.total_exec_time * 100)::numeric, 2)
                        ELSE 0 
                    END as cpu_time_percent
                FROM pg_stat_statements s
                JOIN pg_stat_kcache() k ON s.queryid = k.queryid 
                    AND s.userid = k.userid 
                    AND s.dbid = k.dbid
                WHERE (k.${cols.userTime} + k.${cols.systemTime}) > 0
                ORDER BY (k.${cols.userTime} + k.${cols.systemTime}) DESC
                ${limitVal !== null ? `LIMIT ${String(limitVal)}` : ""}
            `;

        const result = await adapter.executeQuery(sql);
        const rowCount = result.rows?.length ?? 0;
        const effectiveTotalCount = Math.max(totalCount, rowCount);
        const truncated = rowCount < effectiveTotalCount;

        const response: Record<string, unknown> = {
          topCpuQueries: result.rows ?? [],
          count: rowCount,
          description: "Queries ranked by total CPU time (user + system)",
          truncated,
          totalCount: effectiveTotalCount,
        };

        return response;
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, { tool: "pg_kcache_top_cpu" }),
        };
      }
    },
  };
}

/**
 * Top I/O-consuming queries
 */
function createKcacheTopIoTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_kcache_top_io",
    description: `Get top I/O-consuming queries. Shows filesystem-level reads and writes, 
which represent actual disk access (not just shared buffer hits).`,
    group: "kcache",
    inputSchema: KcacheTopIoSchemaBase,
    outputSchema: KcacheTopIoOutputSchema,
    annotations: readOnly("Kcache Top IO"),
    icons: getToolIcons("kcache", readOnly("Kcache Top IO")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Apply the same preprocessing as inputSchema
        const preprocessed = (() => {
          const obj = (params ?? {}) as Record<string, unknown>;
          if (obj["ioType"] !== undefined && obj["type"] === undefined) {
            return { ...obj, type: obj["ioType"] };
          }
          return obj;
        })();
        const parsed = z
          .object({
            type: z.enum(["reads", "writes", "both"]).optional(),
            limit: z.number().optional(),
            queryPreviewLength: z.number().optional(),
          })
          .parse(preprocessed);
        const ioType = parsed.type ?? "both";
        const DEFAULT_LIMIT = 10;
        // limit: 0 means "no limit" (return all rows), undefined means use default
        const limitVal =
          parsed.limit === 0 ? null : (parsed.limit ?? DEFAULT_LIMIT);
        // Bound queryPreviewLength: 0 = full query, default 100, max 500
        const previewLen =
          parsed.queryPreviewLength === 0
            ? 10000
            : Math.min(parsed.queryPreviewLength ?? 100, 500);
        const cols = await getKcacheColumnNames(adapter);

        const orderColumn =
          ioType === "reads"
            ? `k.${cols.reads}`
            : ioType === "writes"
              ? `k.${cols.writes}`
              : `(k.${cols.reads} + k.${cols.writes})`;

        // Filter by the type-specific IO column so 'reads' excludes write-only queries
        const ioFilter =
          ioType === "reads"
            ? `k.${cols.reads} > 0`
            : ioType === "writes"
              ? `k.${cols.writes} > 0`
              : `(k.${cols.reads} + k.${cols.writes}) > 0`;

        // Get total count first for truncation indicator
        const countSql = `
                SELECT COUNT(*) as total
                FROM pg_stat_statements s
                JOIN pg_stat_kcache() k ON s.queryid = k.queryid 
                    AND s.userid = k.userid 
                    AND s.dbid = k.dbid
                WHERE ${ioFilter}
            `;
        const countResult = await adapter.executeQuery(countSql);
        const totalRaw = countResult.rows?.[0]?.["total"];
        const totalCount = Number(totalRaw) || 0;

        const sql = `
                SELECT 
                    s.queryid,
                    LEFT(s.query, ${String(previewLen)}) as query_preview,
                    s.calls,
                    k.${cols.reads} as read_bytes,
                    k.${cols.writes} as write_bytes,
                    (k.${cols.reads} + k.${cols.writes}) as total_io_bytes,
                    pg_size_pretty(k.${cols.reads}::bigint) as reads_pretty,
                    pg_size_pretty(k.${cols.writes}::bigint) as writes_pretty,
                    s.total_exec_time as total_time_ms
                FROM pg_stat_statements s
                JOIN pg_stat_kcache() k ON s.queryid = k.queryid 
                    AND s.userid = k.userid 
                    AND s.dbid = k.dbid
                WHERE ${ioFilter}
                ORDER BY ${orderColumn} DESC
                ${limitVal !== null ? `LIMIT ${String(limitVal)}` : ""}
            `;

        const result = await adapter.executeQuery(sql);
        const rowCount = result.rows?.length ?? 0;
        const effectiveTotalCount = Math.max(totalCount, rowCount);
        const truncated = rowCount < effectiveTotalCount;

        const response: Record<string, unknown> = {
          topIoQueries: result.rows ?? [],
          count: rowCount,
          ioType,
          description: `Queries ranked by ${ioType === "both" ? "total I/O" : ioType}`,
          truncated,
          totalCount: effectiveTotalCount,
        };

        return response;
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, { tool: "pg_kcache_top_io" }),
        };
      }
    },
  };
}

/**
 * Database-level aggregated stats
 */
function createKcacheDatabaseStatsTool(
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
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_kcache_database_stats",
          }),
        };
      }
    },
  };
}

/**
 * Classify queries as CPU-bound vs I/O-bound
 */
function createKcacheResourceAnalysisTool(
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
        const { queryId, threshold, limit, minCalls, queryPreviewLength } =
          KcacheResourceAnalysisSchema.parse(params);
        const thresholdVal = threshold ?? 0.5;
        const DEFAULT_LIMIT = 20;
        // limit: 0 means "no limit" (return all rows), undefined means use default
        const limitVal = limit === 0 ? null : (limit ?? DEFAULT_LIMIT);
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

        const sql = `
                WITH query_metrics AS (
                    SELECT 
                        s.queryid,
                        LEFT(s.query, ${String(previewLen)}) as query_preview,
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
                    query_preview,
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
                ${limitVal !== null ? `LIMIT ${String(limitVal)}` : ""}
            `;

        const result = await adapter.executeQuery(sql, queryParams);
        const rows = result.rows ?? [];
        const effectiveTotalCount = Math.max(totalCount, rows.length);
        const truncated = rows.length < effectiveTotalCount;

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
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_kcache_resource_analysis",
          }),
        };
      }
    },
  };
}

/**
 * Reset kcache statistics
 */
function createKcacheResetTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_kcache_reset",
    description: `Reset pg_stat_kcache statistics. Use this to start fresh measurements. 
Note: This also resets pg_stat_statements statistics.`,
    group: "kcache",
    inputSchema: z.object({}),
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
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, { tool: "pg_kcache_reset" }),
        };
      }
    },
  };
}
