/**
 * PostgreSQL Statistics Tools - Descriptive & Percentiles
 *
 * Descriptive statistics and percentile calculations.
 * 2 tools total.
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
  // Base schemas for MCP visibility
  StatsDescriptiveSchemaBase,
  StatsPercentilesSchemaBase,
  // Preprocessed schemas for handler parsing
  StatsDescriptiveSchema,
  StatsPercentilesSchema,
  // Output schemas for MCP structured content
  DescriptiveOutputSchema,
  PercentilesOutputSchema,
} from "../../schemas/index.js";
import { validateNumericColumn } from "./validators.js";

/**
 * Descriptive statistics: count, min, max, avg, stddev, variance
 */
export function createStatsDescriptiveTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stats_descriptive",
    description:
      "Calculate descriptive statistics (count, min, max, avg, stddev, variance, sum) for a numeric column. Use groupBy to get statistics per category. Warning: using groupBy on high-cardinality columns will result in large JSON payloads.",
    group: "stats",
    inputSchema: StatsDescriptiveSchemaBase.partial(), // Base schema for MCP visibility
    outputSchema: DescriptiveOutputSchema,
    annotations: readOnly("Descriptive Statistics"),
    icons: getToolIcons("stats", readOnly("Descriptive Statistics")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const {
          table,
          column,
          schema,
          where,
          params: queryParams,
          groupBy,
        } = StatsDescriptiveSchema.parse(params) as {
          table: string;
          column: string;
          schema?: string;
          where?: string;
          params?: unknown[];
          groupBy?: string;
        };

        const schemaPrefix = schema ? `"${schema}".` : "";
        const whereClause = where ? `WHERE ${sanitizeWhereClause(where)}` : "";

        // Validate column is numeric type
        const typeCheckQuery = `
                SELECT data_type
                FROM information_schema.columns
                WHERE table_schema = $1
                AND table_name = $2
                AND column_name = $3
            `;
        const typeResult = await adapter.executeQuery(typeCheckQuery, [
          schema ?? "public",
          table,
          column,
        ]);
        const typeRow = typeResult.rows?.[0] as
          | { data_type: string }
          | undefined;

        if (!typeRow) {
          // Check if table exists
          const tableCheckQuery = `
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = $1 AND table_name = $2
                `;
          const tableResult = await adapter.executeQuery(tableCheckQuery, [
            schema ?? "public",
            table,
          ]);
          if (tableResult.rows?.length === 0) {
            throw new ValidationError(
              `Table "${schema ?? "public"}.${table}" does not exist`,
            );
          }
          throw new ValidationError(`Column "${column}" does not exist`);
        }

        const numericTypes = [
          "integer",
          "bigint",
          "smallint",
          "numeric",
          "decimal",
          "real",
          "double precision",
          "money",
        ];
        if (!numericTypes.includes(typeRow.data_type)) {
          throw new ValidationError(
            `Column "${column}" is type "${typeRow.data_type}" but must be a numeric type for statistical analysis`,
          );
        }

        // Helper to map stats row to numeric object
        const mapStats = (
          row: Record<string, unknown>,
        ): {
          count: number;
          min: number | null;
          max: number | null;
          avg: number | null;
          stddev: number | null;
          variance: number | null;
          sum: number | null;
          mode: number | null;
        } => ({
          count: Number(row["count"]),
          min: row["min"] !== null ? Number(row["min"]) : null,
          max: row["max"] !== null ? Number(row["max"]) : null,
          avg: row["avg"] !== null ? Number(row["avg"]) : null,
          stddev: row["stddev"] !== null ? Number(row["stddev"]) : null,
          variance: row["variance"] !== null ? Number(row["variance"]) : null,
          sum: row["sum"] !== null ? Number(row["sum"]) : null,
          mode:
            row["mode"] !== null && row["mode"] !== undefined
              ? Number(row["mode"])
              : null,
        });

        if (groupBy !== undefined) {
          // Grouped statistics
          const sql = `
                    SELECT
                        "${groupBy}" as group_key,
                        COUNT("${column}") as count,
                        MIN("${column}") as min,
                        MAX("${column}") as max,
                        AVG("${column}")::numeric as avg,
                        STDDEV("${column}")::numeric as stddev,
                        VARIANCE("${column}")::numeric as variance,
                        SUM("${column}")::numeric as sum,
                        MODE() WITHIN GROUP (ORDER BY "${column}") as mode
                    FROM ${schemaPrefix}"${table}"
                    ${whereClause}
                    GROUP BY "${groupBy}"
                    ORDER BY "${groupBy}"
                `;

          const result = await adapter.executeQuery(
            sql,
            ...(queryParams !== undefined && queryParams.length > 0
              ? [queryParams]
              : []),
          );
          const rows = result.rows ?? [];

          const groups = rows.map((row) => ({
            groupKey: row["group_key"],
            statistics: mapStats(row),
          }));

          return {
            success: true,
            table: `${schema ?? "public"}.${table}`,
            column,
            groupBy,
            groups,
            count: groups.length,
          };
        }

        // Ungrouped statistics (original behavior)
        const sql = `
                SELECT
                    COUNT("${column}") as count,
                    MIN("${column}") as min,
                    MAX("${column}") as max,
                    AVG("${column}")::numeric as avg,
                    STDDEV("${column}")::numeric as stddev,
                    VARIANCE("${column}")::numeric as variance,
                    SUM("${column}")::numeric as sum,
                    (SELECT MODE() WITHIN GROUP (ORDER BY "${column}") FROM ${schemaPrefix}"${table}" ${whereClause}) as mode
                FROM ${schemaPrefix}"${table}"
                ${whereClause}
            `;

        const result = await adapter.executeQuery(
          sql,
          ...(queryParams !== undefined && queryParams.length > 0
            ? [queryParams]
            : []),
        );
        const stats = result.rows?.[0];

        if (!stats) throw new ValidationError("No stats found");

        return {
          success: true,
          table: `${schema ?? "public"}.${table}`,
          column,
          statistics: mapStats(stats),
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_stats_descriptive",
        });
      }
    },
  };
}

/**
 * Calculate percentiles
 */
export function createStatsPercentilesTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stats_percentiles",
    description:
      "Calculate percentiles (quartiles, custom percentiles) for a numeric column. Use groupBy to get percentiles per category.",
    group: "stats",
    inputSchema: StatsPercentilesSchemaBase.partial(), // Base schema for MCP visibility
    outputSchema: PercentilesOutputSchema,
    annotations: readOnly("Percentiles"),
    icons: getToolIcons("stats", readOnly("Percentiles")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = StatsPercentilesSchema.parse(params) as {
          table: string;
          column: string;
          percentiles?: number[];
          schema?: string;
          where?: string;
          params?: unknown[];
          groupBy?: string;
          _percentileScaleWarning?: string;
        };
        const {
          table,
          column,
          percentiles,
          schema,
          where,
          params: queryParams,
          groupBy,
          _percentileScaleWarning,
        } = parsed;

        const schemaName = schema ?? "public";

        // Validate column exists and is numeric
        await validateNumericColumn(adapter, table, column, schemaName);

        const pctiles = percentiles ?? [0.25, 0.5, 0.75];
        const schemaPrefix = schema ? `"${schema}".` : "";
        const whereClause = where ? `WHERE ${sanitizeWhereClause(where)}` : "";

        const percentileSelects = pctiles
          .map(
            (p) =>
              `PERCENTILE_CONT(${String(p)}) WITHIN GROUP (ORDER BY "${column}") as p${String(Math.round(p * 100))}`,
          )
          .join(",\n                    ");

        // Helper to map row to percentile results (round to 6 decimal places to avoid floating-point artifacts)
        const mapPercentiles = (
          row: Record<string, unknown>,
        ): Record<string, number | null> => {
          const result: Record<string, number | null> = {};
          for (const p of pctiles) {
            const key = `p${String(Math.round(p * 100))}`;
            const val =
              row[key] !== null && row[key] !== undefined
                ? Number(row[key])
                : null;
            result[key] = val !== null ? Math.round(val * 1e6) / 1e6 : null;
          }
          return result;
        };

        if (groupBy !== undefined) {
          // Grouped percentiles
          const sql = `
                    SELECT
                        "${groupBy}" as group_key,
                        ${percentileSelects}
                    FROM ${schemaPrefix}"${table}"
                    ${whereClause}
                    GROUP BY "${groupBy}"
                    ORDER BY "${groupBy}"
                `;

          const result = await adapter.executeQuery(
            sql,
            ...(queryParams !== undefined && queryParams.length > 0
              ? [queryParams]
              : []),
          );
          const rows = result.rows ?? [];

          const groups = rows.map((row) => ({
            groupKey: row["group_key"],
            percentiles: mapPercentiles(row),
          }));

          const response: Record<string, unknown> = {
            success: true,
            table: `${schema ?? "public"}.${table}`,
            column,
            groupBy,
            groups,
            count: groups.length,
          };

          // Include warning if mixed scales were detected
          if (_percentileScaleWarning) {
            response["warning"] = _percentileScaleWarning;
          }

          return response;
        }

        // Ungrouped percentiles
        const sql = `
                SELECT
                    ${percentileSelects}
                FROM ${schemaPrefix}"${table}"
                ${whereClause}
            `;

        const result = await adapter.executeQuery(
          sql,
          ...(queryParams !== undefined && queryParams.length > 0
            ? [queryParams]
            : []),
        );
        const row = result.rows?.[0] ?? {};

        const response: Record<string, unknown> = {
          success: true,
          table: `${schema ?? "public"}.${table}`,
          column,
          percentiles: mapPercentiles(row),
        };

        // Include warning if mixed scales were detected
        if (_percentileScaleWarning) {
          response["warning"] = _percentileScaleWarning;
        }

        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_stats_percentiles",
        });
      }
    },
  };
}
