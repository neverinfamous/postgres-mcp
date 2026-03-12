/**
 * PostgreSQL pg_stat_kcache - Query Analysis Tools
 *
 * Query stats, top CPU, and top I/O tools.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type { ToolDefinition, RequestContext } from "../../../../types/index.js";
import { z } from "zod";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  KcacheQueryStatsSchemaBase,
  KcacheTopCpuSchemaBase,
  KcacheTopIoSchemaBase,
  KcacheQueryStatsOutputSchema,
  KcacheTopCpuOutputSchema,
  KcacheTopIoOutputSchema,
} from "../../schemas/index.js";
import { getKcacheColumnNames } from "./helpers.js";

/**
 * Query stats with CPU/IO metrics joined from pg_stat_statements
 */
export function createKcacheQueryStatsTool(adapter: PostgresAdapter): ToolDefinition {
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
        const parsed = z
          .object({
            limit: z.coerce.number().optional(),
            orderBy: z.string().optional(),
            minCalls: z.coerce.number().optional(),
            queryPreviewLength: z.coerce.number().optional(),
          })
          .parse(params ?? {});

        const limit =
          parsed.limit !== undefined && !isNaN(parsed.limit)
            ? parsed.limit
            : undefined;
        const orderBy = parsed.orderBy;
        const minCalls =
          parsed.minCalls !== undefined && !isNaN(parsed.minCalls)
            ? parsed.minCalls
            : undefined;
        const queryPreviewLength =
          parsed.queryPreviewLength !== undefined &&
          !isNaN(parsed.queryPreviewLength)
            ? parsed.queryPreviewLength
            : undefined;

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
        return formatHandlerErrorResponse(error, { tool: "pg_kcache_query_stats" });
      }
    },
  };
}

/**
 * Top CPU-consuming queries
 */
export function createKcacheTopCpuTool(adapter: PostgresAdapter): ToolDefinition {
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
            limit: z.coerce.number().optional(),
            queryPreviewLength: z.coerce.number().optional(),
          })
          .parse(params ?? {});
        const DEFAULT_LIMIT = 10;
        // limit: 0 means "no limit" (return all rows), undefined means use default
        const limitVal =
          parsed.limit === 0 ||
          (parsed.limit !== undefined && isNaN(parsed.limit))
            ? parsed.limit !== undefined && isNaN(parsed.limit)
              ? DEFAULT_LIMIT
              : null
            : (parsed.limit ?? DEFAULT_LIMIT);
        // Bound queryPreviewLength: 0 = full query, default 100, max 500
        const previewLen =
          parsed.queryPreviewLength === 0
            ? 10000
            : Math.min(
                parsed.queryPreviewLength !== undefined &&
                  !isNaN(parsed.queryPreviewLength)
                  ? parsed.queryPreviewLength
                  : 100,
                500,
              );
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
        return formatHandlerErrorResponse(error, { tool: "pg_kcache_top_cpu" });
      }
    },
  };
}

/**
 * Top I/O-consuming queries
 */
export function createKcacheTopIoTool(adapter: PostgresAdapter): ToolDefinition {
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
            type: z.string().optional(),
            limit: z.coerce.number().optional(),
            queryPreviewLength: z.coerce.number().optional(),
          })
          .parse(preprocessed);

        // Validate ioType inside handler for structured error response
        const VALID_IO_TYPES = ["reads", "writes", "both"] as const;
        const rawIoType = parsed.type ?? "both";
        if (
          !VALID_IO_TYPES.includes(rawIoType as (typeof VALID_IO_TYPES)[number])
        ) {
          return {
            success: false,
            error: `Invalid type/ioType value "${rawIoType}". Valid options: ${VALID_IO_TYPES.join(", ")}`,
          };
        }
        const ioType = rawIoType as (typeof VALID_IO_TYPES)[number];
        const DEFAULT_LIMIT = 10;
        // limit: 0 means "no limit" (return all rows), undefined means use default
        const limitVal =
          parsed.limit === 0 ||
          (parsed.limit !== undefined && isNaN(parsed.limit))
            ? parsed.limit !== undefined && isNaN(parsed.limit)
              ? DEFAULT_LIMIT
              : null
            : (parsed.limit ?? DEFAULT_LIMIT);
        // Bound queryPreviewLength: 0 = full query, default 100, max 500
        const previewLen =
          parsed.queryPreviewLength === 0
            ? 10000
            : Math.min(
                parsed.queryPreviewLength !== undefined &&
                  !isNaN(parsed.queryPreviewLength)
                  ? parsed.queryPreviewLength
                  : 100,
                500,
              );
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
        return formatHandlerErrorResponse(error, { tool: "pg_kcache_top_io" });
      }
    },
  };
}
