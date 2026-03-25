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
import { z } from "zod";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  StatStatementsOutputSchema,
  StatActivityOutputSchema,
  QueryPlanStatsOutputSchema,
} from "../../schemas/index.js";
import { defaultToEmpty, toNum } from "./helpers.js";

export function createStatStatementsTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  const StatStatementsSchemaBase = z.object({
    limit: z
      .any()
      .optional()
      .describe("Max statements to return (default: 20, use 0 for all)"),
    orderBy: z
      .unknown()
      .optional()
      .describe("Sort order (default: total_time)"),
  });

  const StatStatementsSchema = z.preprocess(
    defaultToEmpty,
    StatStatementsSchemaBase,
  );

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
        const rawLimit = Number(parsed.limit);
        const limit =
          parsed.limit === undefined
            ? 20
            : isNaN(rawLimit)
              ? 20
              : rawLimit === 0
                ? null
                : rawLimit;
        const rawOrderBy: unknown = parsed.orderBy;
        let orderBy = "total_time";
        if (typeof rawOrderBy === "string" && ["total_time", "calls", "mean_time", "rows"].includes(rawOrderBy)) {
          orderBy = rawOrderBy;
        }

        const sql = `SELECT query, calls, total_exec_time as total_time,
                        mean_exec_time as mean_time, rows,
                        shared_blks_hit, shared_blks_read
                        FROM pg_stat_statements
                        ORDER BY ${orderBy === "total_time" ? "total_exec_time" : orderBy} DESC
                        ${limit !== null ? `LIMIT ${String(limit)}` : ""}`;

        const result = await adapter.executeQuery(sql);
        // Coerce numeric fields to JavaScript numbers
        const statements = (result.rows ?? []).map(
          (row: Record<string, unknown>) => ({
            ...row,
            calls: toNum(row["calls"]),
            rows: toNum(row["rows"]),
            shared_blks_hit: toNum(row["shared_blks_hit"]),
            shared_blks_read: toNum(row["shared_blks_read"]),
          }),
        );

        const response: Record<string, unknown> = {
          statements,
          count: statements.length,
        };

        // Add totalCount if results were limited
        if (limit !== null && statements.length === limit) {
          const countSql = `SELECT COUNT(*) as total FROM pg_stat_statements`;
          const countResult = await adapter.executeQuery(countSql);
          response["totalCount"] = toNum(countResult.rows?.[0]?.["total"]);
          response["truncated"] = true;
        }
        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_stat_statements" });
      }
    },
  };
}

export function createStatActivityTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  const StatActivitySchemaBase = z.object({
    includeIdle: z.unknown().optional(),
  });

  const StatActivitySchema = z.preprocess(
    defaultToEmpty,
    StatActivitySchemaBase,
  );

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
        const includeIdle = parsed.includeIdle === true || parsed.includeIdle === "true";
        const idleClause = includeIdle ? "" : "AND state != 'idle'";

        const sql = `SELECT pid, usename, datname, client_addr, state,
                        query_start, state_change,
                        now() - query_start as duration,
                        query
                        FROM pg_stat_activity
                        WHERE pid != pg_backend_pid()
                          AND backend_type = 'client backend'
                          ${idleClause}
                        ORDER BY query_start`;

        const result = await adapter.executeQuery(sql);

        // Count background workers for metadata
        const bgResult = await adapter.executeQuery(
          `SELECT COUNT(*)::int as count FROM pg_stat_activity
         WHERE pid != pg_backend_pid() AND backend_type != 'client backend'`,
        );
        const bgCount = (bgResult.rows?.[0]?.["count"] as number) ?? 0;

        return {
          connections: result.rows,
          count: result.rows?.length ?? 0,
          backgroundWorkers: bgCount,
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
  const QueryPlanStatsSchemaBase = z.object({
    limit: z
      .any()
      .optional()
      .describe("Number of queries to return (default: 20, use 0 for all)"),
    truncateQuery: z
      .any()
      .optional()
      .describe(
        "Max query length in chars (default: 100, use 0 for full text)",
      ),
  });

  const QueryPlanStatsSchema = z.preprocess(
    defaultToEmpty,
    QueryPlanStatsSchemaBase,
  );

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
        const rawLimit = Number(parsed.limit);
        const limit =
          parsed.limit === undefined
            ? 20
            : isNaN(rawLimit)
              ? 20
              : rawLimit === 0
                ? null
                : rawLimit;
        const rawTruncate = Number(parsed.truncateQuery);
        const truncateLen =
          parsed.truncateQuery === undefined
            ? 100
            : isNaN(rawTruncate)
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
        return formatHandlerErrorResponse(error, { tool: "pg_query_plan_stats" });
      }
    },
  };
}
