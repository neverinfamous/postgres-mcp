/**
 * PostgreSQL Performance Tools - Query Statistics
 *
 * pg_stat_statements, pg_stat_activity, and query plan stats tools.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  StatStatementsSchemaBase,
  StatStatementsSchema,
  StatStatementsOutputSchema,
  StatActivitySchemaBase,
  StatActivitySchema,
  StatActivityOutputSchema,
  QueryPlanStatsSchemaBase,
  QueryPlanStatsSchema,
  QueryPlanStatsOutputSchema,
} from "../../schemas/index.js";
import { toNum } from "./helpers.js";
import { ValidationError } from "../../../../types/errors.js";

export function createStatStatementsTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stat_statements",
    description:
      "Get query statistics from pg_stat_statements (requires extension).",
    group: "performance",
    inputSchema: StatStatementsSchemaBase,
    outputSchema: StatStatementsOutputSchema,
    annotations: readOnly("Query Statistics"),
    icons: getToolIcons("performance", readOnly("Query Statistics")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = StatStatementsSchema.parse(params);
        const rawLimit = parsed.limit;
        const userLimit =
          rawLimit === undefined ? 10 : rawLimit === 0 ? null : rawLimit;
        // Cap at 50 to prevent payload blowout from large pg_stat_statements tables
        const limit = userLimit === null ? 50 : Math.min(userLimit, 50);
        const rawOrderBy: unknown = parsed.orderBy;
        let orderBy = "total_time";
        if (typeof rawOrderBy === "string" && rawOrderBy !== "") {
          if (
            ["total_time", "calls", "mean_time", "rows"].includes(rawOrderBy)
          ) {
            orderBy = rawOrderBy;
          } else {
            throw new ValidationError(
              "Validation error: orderBy must be one of: total_time, calls, mean_time, rows",
            );
          }
        }

        const rawTruncate = parsed.truncateQuery;
        const truncateLen =
          rawTruncate === undefined
            ? 100
            : rawTruncate === 0
              ? null
              : rawTruncate;

        const sql = `SELECT query, calls, total_exec_time as total_time,
                        mean_exec_time as mean_time, rows,
                        shared_blks_hit, shared_blks_read
                        FROM pg_stat_statements
                        ORDER BY ${orderBy === "total_time" ? "total_exec_time" : orderBy} DESC
                        ${limit !== null ? `LIMIT ${String(limit)}` : ""}`;

        const result = await adapter.executeQuery(sql);
        // Coerce numeric fields to JavaScript numbers
        const statements = (result.rows ?? []).map(
          (row: Record<string, unknown>) => {
            const queryVal = row["query"];
            const query = typeof queryVal === "string" ? queryVal : "";
            const truncatedQuery =
              truncateLen !== null && query.length > truncateLen
                ? query.substring(0, truncateLen) + "..."
                : query;

            return {
              ...row,
              query: truncatedQuery,
              queryTruncated:
                truncateLen !== null && query.length > truncateLen,
              calls: toNum(row["calls"]),
              rows: toNum(row["rows"]),
              shared_blks_hit: toNum(row["shared_blks_hit"]),
              shared_blks_read: toNum(row["shared_blks_read"]),
            };
          },
        );

        const response: Record<string, unknown> = {
          success: true as const,
          statements,
          count: statements.length,
        };

        // Add totalCount and truncated — always set for consistency
        if (limit !== null && statements.length === limit) {
          const countSql = `SELECT COUNT(*) as total FROM pg_stat_statements`;
          const countResult = await adapter.executeQuery(countSql);
          response["totalCount"] = toNum(countResult.rows?.[0]?.["total"]);
          response["truncated"] = true;
        } else {
          response["truncated"] = false;
          response["totalCount"] = statements.length;
        }
        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_stat_statements",
        });
      }
    },
  };
}

export function createStatActivityTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stat_activity",
    description: "Get currently running queries and connections.",
    group: "performance",
    inputSchema: StatActivitySchemaBase,
    outputSchema: StatActivityOutputSchema,
    annotations: readOnly("Activity Stats"),
    icons: getToolIcons("performance", readOnly("Activity Stats")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = StatActivitySchema.parse(params);
        const includeIdle = parsed.includeIdle === true;
        const idleClause = includeIdle ? "" : "AND state != 'idle'";

        const rawTruncate = parsed.truncateQuery;
        const truncateLen =
          rawTruncate === undefined
            ? 100
            : rawTruncate === 0
              ? null
              : rawTruncate;

        const rawLimit = parsed.limit;
        const userLimit =
          rawLimit === undefined ? 100 : rawLimit === 0 ? null : rawLimit;
        const limit = userLimit === null ? 100 : Math.min(userLimit, 100);

        const sql = `SELECT pid, usename, datname, client_addr, state,
                        query_start, state_change,
                        now() - query_start as duration,
                        query
                        FROM pg_stat_activity
                        WHERE pid != pg_backend_pid()
                          AND backend_type = 'client backend'
                          ${idleClause}
                        ORDER BY query_start
                        ${limit !== null ? `LIMIT ${String(limit)}` : ""}`;

        const result = await adapter.executeQuery(sql);

        const connections = (result.rows ?? []).map(
          (row: Record<string, unknown>) => {
            const queryVal = row["query"];
            const query = typeof queryVal === "string" ? queryVal : "";
            const truncatedQuery =
              truncateLen !== null && query.length > truncateLen
                ? query.substring(0, truncateLen) + "..."
                : query;
            return {
              ...row,
              query: truncatedQuery,
              queryTruncated:
                truncateLen !== null && query.length > truncateLen,
            };
          },
        );

        // Count background workers for metadata
        const bgResult = await adapter.executeQuery(
          `SELECT COUNT(*)::int as count FROM pg_stat_activity
         WHERE pid != pg_backend_pid() AND backend_type != 'client backend'`,
        );
        const bgCount = (bgResult.rows?.[0]?.["count"] as number) ?? 0;

        return {
          success: true as const,
          connections,
          count: connections.length,
          backgroundWorkers: bgCount,
          truncated: limit !== null && connections.length === limit,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_stat_activity" });
      }
    },
  };
}

export function createQueryPlanStatsTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_query_plan_stats",
    description:
      "Get query plan statistics showing planning time vs execution time (requires pg_stat_statements).",
    group: "performance",
    inputSchema: QueryPlanStatsSchemaBase,
    outputSchema: QueryPlanStatsOutputSchema,
    annotations: readOnly("Query Plan Stats"),
    icons: getToolIcons("performance", readOnly("Query Plan Stats")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = QueryPlanStatsSchema.parse(params);
        const rawLimit = parsed.limit;
        const userLimit =
          rawLimit === undefined ? 10 : rawLimit === 0 ? null : rawLimit;
        // Cap at 50 to match pg_stat_statements payload safety
        const limit = userLimit === null ? 50 : Math.min(userLimit, 50);
        const rawTruncate = parsed.truncateQuery;
        const truncateLen =
          rawTruncate === undefined
            ? 100
            : rawTruncate === 0
              ? null
              : rawTruncate;

        // Check if pg_stat_statements is available with planning time columns
        const sql = `SELECT
                query,
                calls,
                total_plan_time,
                mean_plan_time,
                total_exec_time,
                mean_exec_time,
                rows,
                CASE
                    WHEN total_plan_time + total_exec_time > 0
                    THEN round((100.0 * total_plan_time / (total_plan_time + total_exec_time))::numeric, 2)
                    ELSE 0
                END as plan_pct,
                shared_blks_hit,
                shared_blks_read,
                CASE
                    WHEN shared_blks_hit + shared_blks_read > 0
                    THEN round((100.0 * shared_blks_hit / (shared_blks_hit + shared_blks_read))::numeric, 2)
                    ELSE 100
                END as cache_hit_pct
                FROM pg_stat_statements
                ORDER BY total_plan_time + total_exec_time DESC
                ${limit !== null ? `LIMIT ${String(limit)}` : ""}`;

        const result = await adapter.executeQuery(sql);
        // Coerce numeric fields to JavaScript numbers and optionally truncate query
        const queryPlanStats = (result.rows ?? []).map(
          (row: Record<string, unknown>) => {
            const queryVal = row["query"];
            const query = typeof queryVal === "string" ? queryVal : "";
            const truncatedQuery =
              truncateLen !== null && query.length > truncateLen
                ? query.substring(0, truncateLen) + "..."
                : query;
            return {
              query: truncatedQuery,
              queryTruncated:
                truncateLen !== null && query.length > truncateLen,
              calls: toNum(row["calls"]),
              total_plan_time: row["total_plan_time"],
              mean_plan_time: row["mean_plan_time"],
              total_exec_time: row["total_exec_time"],
              mean_exec_time: row["mean_exec_time"],
              rows: toNum(row["rows"]),
              plan_pct: toNum(row["plan_pct"]),
              cache_hit_pct: toNum(row["cache_hit_pct"]),
              shared_blks_hit: toNum(row["shared_blks_hit"]),
              shared_blks_read: toNum(row["shared_blks_read"]),
            };
          },
        );
        const response: Record<string, unknown> = {
          success: true as const,
          queryPlanStats,
          count: queryPlanStats.length,
          hint: "High plan_pct indicates queries spending significant time in planning. Consider prepared statements.",
        };

        // Add totalCount if results were limited
        if (limit !== null && queryPlanStats.length === limit) {
          const countSql = `SELECT COUNT(*) as total FROM pg_stat_statements`;
          const countResult = await adapter.executeQuery(countSql);
          response["totalCount"] = toNum(countResult.rows?.[0]?.["total"]);
          response["truncated"] = true;
        }
        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_query_plan_stats",
        });
      }
    },
  };
}
