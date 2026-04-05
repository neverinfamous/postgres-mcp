/**
 * PostgreSQL Statistics Tools - Window Functions
 *
 * SQL window function tools: row_number, rank, lag/lead, running_total, moving_avg, ntile.
 * 6 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { ValidationError } from "../../../../types/errors.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import {
  StatsRowNumberSchemaBase,
  StatsRowNumberSchema,
  StatsRankSchemaBase,
  StatsRankSchema,
  StatsLagLeadSchemaBase,
  StatsLagLeadSchema,
  StatsRunningTotalSchemaBase,
  StatsRunningTotalSchema,
  StatsMovingAvgSchemaBase,
  StatsMovingAvgSchema,
  StatsNtileSchemaBase,
  StatsNtileSchema,
  WindowRowNumberOutputSchema,
  WindowRankOutputSchema,
  WindowLagLeadOutputSchema,
  WindowRunningTotalOutputSchema,
  WindowMovingAvgOutputSchema,
  WindowNtileOutputSchema,
} from "../../schemas/stats/window.js";

// =============================================================================
// Helpers
// =============================================================================

/** Build SQL identifier: "schema"."table" */
function qualifiedTable(table: string, schema?: string): string {
  const schemaPrefix = schema ? `"${schema}".` : "";
  return `${schemaPrefix}"${table}"`;
}

/** Build SELECT column list */
function selectList(
  selectColumns: string[] | undefined,
  windowExpr: string,
  windowAlias: string,
): string {
  const cols =
    selectColumns && selectColumns.length > 0
      ? selectColumns.map((c) => `"${c}"`).join(", ")
      : "*";
  return `${cols}, ${windowExpr} AS "${windowAlias}"`;
}

/** Build PARTITION BY clause */
function partitionClause(partitionBy?: string): string {
  if (!partitionBy) return "";
  return `PARTITION BY "${partitionBy}"`;
}

/** Build WHERE clause */
function whereClause(where?: string): string {
  if (!where) return "";
  return `WHERE ${sanitizeWhereClause(where)}`;
}

/** Coerce limit with default */
function resolveLimit(limit?: number): number {
  if (limit === undefined || limit === null || Number.isNaN(limit)) return 20;
  if (limit <= 0) {
    throw new ValidationError("Parameter 'limit' must be greater than 0.");
  }
  if (limit > 100) {
    throw new ValidationError("Parameter 'limit' cannot exceed 100.");
  }
  return limit;
}

// =============================================================================
// ROW_NUMBER
// =============================================================================

export function createStatsRowNumberTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stats_row_number",
    description:
      "Assign sequential row numbers within an ordered result set. Use partitionBy to restart numbering per group.",
    group: "stats",
    inputSchema: StatsRowNumberSchemaBase.partial(),
    outputSchema: WindowRowNumberOutputSchema,
    annotations: readOnly("Window ROW_NUMBER"),
    icons: getToolIcons("stats", readOnly("Window ROW_NUMBER")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = StatsRowNumberSchema.parse(params) as {
          table: string;
          orderBy: string;
          partitionBy?: string;
          selectColumns?: string[];
          schema?: string;
          where?: string;
          limit?: number;
        };

        const limit = resolveLimit(parsed.limit);
        const partition = partitionClause(parsed.partitionBy);
        const windowExpr = `(ROW_NUMBER() OVER(${partition} ORDER BY "${parsed.orderBy}"))::integer`;

        const sql = `
          SELECT ${selectList(parsed.selectColumns, windowExpr, "row_number")}
          FROM ${qualifiedTable(parsed.table, parsed.schema ?? "public")}
          ${whereClause(parsed.where)}
          ORDER BY "${parsed.orderBy}"
          LIMIT ${String(limit)}
        `;

        const result = await adapter.executeQuery(sql);
        const rows = result.rows ?? [];

        return {
          success: true,
          rowCount: rows.length,
          rows,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_stats_row_number",
        });
      }
    },
  };
}

// =============================================================================
// RANK / DENSE_RANK / PERCENT_RANK
// =============================================================================

export function createStatsRankTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_stats_rank",
    description:
      "Assign rank within an ordered result set. Supports rank (gaps), dense_rank (no gaps), and percent_rank (0-1). Use partitionBy to rank within groups.",
    group: "stats",
    inputSchema: StatsRankSchemaBase.partial(),
    outputSchema: WindowRankOutputSchema,
    annotations: readOnly("Window RANK"),
    icons: getToolIcons("stats", readOnly("Window RANK")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = StatsRankSchema.parse(params) as {
          table: string;
          orderBy: string;
          partitionBy?: string;
          selectColumns?: string[];
          method?: "rank" | "dense_rank" | "percent_rank";
          schema?: string;
          where?: string;
          limit?: number;
        };

        const rankType = parsed.method ?? "rank";
        const limit = resolveLimit(parsed.limit);
        const partition = partitionClause(parsed.partitionBy);
        const fnName = rankType.toUpperCase();
        const cast = rankType === "percent_rank" ? "::real" : "::integer";
        const windowExpr = `(${fnName}() OVER(${partition} ORDER BY "${parsed.orderBy}"))${cast}`;

        const sql = `
          SELECT ${selectList(parsed.selectColumns, windowExpr, rankType)}
          FROM ${qualifiedTable(parsed.table, parsed.schema ?? "public")}
          ${whereClause(parsed.where)}
          ORDER BY "${parsed.orderBy}"
          LIMIT ${String(limit)}
        `;

        const result = await adapter.executeQuery(sql);
        const rows = result.rows ?? [];

        return {
          success: true,
          rankType,
          rowCount: rows.length,
          rows,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_stats_rank" });
      }
    },
  };
}

// =============================================================================
// LAG / LEAD
// =============================================================================

export function createStatsLagLeadTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stats_lag_lead",
    description:
      "Access data from previous (LAG) or next (LEAD) rows in an ordered set. Useful for comparisons, deltas, and change detection.",
    group: "stats",
    inputSchema: StatsLagLeadSchemaBase.partial(),
    outputSchema: WindowLagLeadOutputSchema,
    annotations: readOnly("Window LAG/LEAD"),
    icons: getToolIcons("stats", readOnly("Window LAG/LEAD")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = StatsLagLeadSchema.parse(params) as {
          table: string;
          column: string;
          orderBy: string;
          direction: "lag" | "lead";
          offset?: number;
          defaultValue?: string;
          partitionBy?: string;
          selectColumns?: string[];
          schema?: string;
          where?: string;
          limit?: number;
        };

        const offset = parsed.offset ?? 1;
        const limit = resolveLimit(parsed.limit);
        const partition = partitionClause(parsed.partitionBy);
        const fnName = parsed.direction.toUpperCase();
        const defaultArg =
          parsed.defaultValue !== undefined
            ? `, '${parsed.defaultValue.replace(/'/g, "''")}'`
            : "";
        const windowExpr = `${fnName}("${parsed.column}", ${String(offset)}${defaultArg}) OVER(${partition} ORDER BY "${parsed.orderBy}")`;
        const alias = `${parsed.direction}_value`;

        const sql = `
          SELECT ${selectList(parsed.selectColumns, windowExpr, alias)}
          FROM ${qualifiedTable(parsed.table, parsed.schema ?? "public")}
          ${whereClause(parsed.where)}
          ORDER BY "${parsed.orderBy}"
          LIMIT ${String(limit)}
        `;

        const result = await adapter.executeQuery(sql);
        const rows = result.rows ?? [];

        return {
          success: true,
          direction: parsed.direction,
          offset,
          rowCount: rows.length,
          rows,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_stats_lag_lead",
        });
      }
    },
  };
}

// =============================================================================
// RUNNING TOTAL
// =============================================================================

export function createStatsRunningTotalTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stats_running_total",
    description:
      "Calculate cumulative running total (SUM OVER) for a numeric column. Use partitionBy to reset total per group.",
    group: "stats",
    inputSchema: StatsRunningTotalSchemaBase.partial(),
    outputSchema: WindowRunningTotalOutputSchema,
    annotations: readOnly("Window Running Total"),
    icons: getToolIcons("stats", readOnly("Window Running Total")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = StatsRunningTotalSchema.parse(params) as {
          table: string;
          column: string;
          orderBy: string;
          partitionBy?: string;
          selectColumns?: string[];
          schema?: string;
          where?: string;
          limit?: number;
        };

        const limit = resolveLimit(parsed.limit);
        const partition = partitionClause(parsed.partitionBy);
        const windowExpr = `SUM("${parsed.column}") OVER(${partition} ORDER BY "${parsed.orderBy}" ROWS UNBOUNDED PRECEDING)`;

        const sql = `
          SELECT ${selectList(parsed.selectColumns, windowExpr, "running_total")}
          FROM ${qualifiedTable(parsed.table, parsed.schema ?? "public")}
          ${whereClause(parsed.where)}
          ORDER BY "${parsed.orderBy}"
          LIMIT ${String(limit)}
        `;

        const result = await adapter.executeQuery(sql);
        const rows = result.rows ?? [];

        return {
          success: true,
          valueColumn: parsed.column,
          rowCount: rows.length,
          rows,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_stats_running_total",
        });
      }
    },
  };
}

// =============================================================================
// MOVING AVERAGE
// =============================================================================

export function createStatsMovingAvgTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stats_moving_avg",
    description:
      "Calculate moving average (AVG OVER sliding window) for a numeric column. Specify windowSize for the number of preceding rows to include.",
    group: "stats",
    inputSchema: StatsMovingAvgSchemaBase.partial(),
    outputSchema: WindowMovingAvgOutputSchema,
    annotations: readOnly("Window Moving Average"),
    icons: getToolIcons("stats", readOnly("Window Moving Average")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = StatsMovingAvgSchema.parse(params) as {
          table: string;
          column: string;
          orderBy: string;
          windowSize: number;
          partitionBy?: string;
          selectColumns?: string[];
          schema?: string;
          where?: string;
          limit?: number;
        };

        const windowSize = Number.isNaN(parsed.windowSize)
          ? 3
          : parsed.windowSize;
        const limit = resolveLimit(parsed.limit);
        const partition = partitionClause(parsed.partitionBy);
        const preceding = windowSize - 1;
        const windowExpr = `AVG("${parsed.column}") OVER(${partition} ORDER BY "${parsed.orderBy}" ROWS BETWEEN ${String(preceding)} PRECEDING AND CURRENT ROW)`;

        const sql = `
          SELECT ${selectList(parsed.selectColumns, windowExpr, "moving_avg")}
          FROM ${qualifiedTable(parsed.table, parsed.schema ?? "public")}
          ${whereClause(parsed.where)}
          ORDER BY "${parsed.orderBy}"
          LIMIT ${String(limit)}
        `;

        const result = await adapter.executeQuery(sql);
        const rows = result.rows ?? [];

        return {
          success: true,
          valueColumn: parsed.column,
          windowSize,
          rowCount: rows.length,
          rows,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_stats_moving_avg",
        });
      }
    },
  };
}

// =============================================================================
// NTILE
// =============================================================================

export function createStatsNtileTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_stats_ntile",
    description:
      "Divide ordered rows into N equal buckets (e.g., quartiles with buckets=4). Returns bucket assignment per row.",
    group: "stats",
    inputSchema: StatsNtileSchemaBase.partial(),
    outputSchema: WindowNtileOutputSchema,
    annotations: readOnly("Window NTILE"),
    icons: getToolIcons("stats", readOnly("Window NTILE")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = StatsNtileSchema.parse(params) as {
          table: string;
          orderBy: string;
          buckets: number;
          partitionBy?: string;
          selectColumns?: string[];
          schema?: string;
          where?: string;
          limit?: number;
        };

        const buckets = Number.isNaN(parsed.buckets) ? 4 : parsed.buckets;
        const limit = resolveLimit(parsed.limit);
        const partition = partitionClause(parsed.partitionBy);
        const windowExpr = `(NTILE(${String(buckets)}) OVER(${partition} ORDER BY "${parsed.orderBy}"))::integer`;

        const sql = `
          SELECT ${selectList(parsed.selectColumns, windowExpr, "ntile")}
          FROM ${qualifiedTable(parsed.table, parsed.schema ?? "public")}
          ${whereClause(parsed.where)}
          ORDER BY "${parsed.orderBy}"
          LIMIT ${String(limit)}
        `;

        const result = await adapter.executeQuery(sql);
        const rows = result.rows ?? [];

        return {
          success: true,
          buckets,
          rowCount: rows.length,
          rows,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_stats_ntile" });
      }
    },
  };
}
