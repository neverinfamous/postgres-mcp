/**
 * PostgreSQL Statistics Tools - Advanced Analysis
 *
 * Top-N, distinct values, frequency distribution, and multi-column summary.
 * 4 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import {
  StatsTopNSchemaBase,
  StatsTopNSchema,
  StatsDistinctSchemaBase,
  StatsDistinctSchema,
  StatsFrequencySchemaBase,
  StatsFrequencySchema,
  StatsSummarySchemaBase,
  StatsSummarySchema,
  StatsTopNOutputSchema,
  StatsDistinctOutputSchema,
  StatsFrequencyOutputSchema,
  StatsSummaryOutputSchema,
} from "../../schemas/stats/advanced.js";

// =============================================================================
// Constants
// =============================================================================

/** Column types that typically contain long content (auto-excluded from top_n) */
const LONG_CONTENT_TYPES = new Set([
  "text",
  "character varying",
  "varchar",
  "bytea",
  "json",
  "jsonb",
  "xml",
]);

/** Numeric types for summary detection */
const NUMERIC_TYPES = new Set([
  "integer",
  "bigint",
  "smallint",
  "numeric",
  "decimal",
  "real",
  "double precision",
  "money",
]);

// =============================================================================
// TOP N
// =============================================================================

export function createStatsTopNTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stats_top_n",
    description:
      "Get the top N rows ranked by a column. Auto-excludes long-content columns (text, json, bytea) from output unless selectColumns is specified.",
    group: "stats",
    inputSchema: StatsTopNSchemaBase.partial(),
    outputSchema: StatsTopNOutputSchema,
    annotations: readOnly("Top N Values"),
    icons: getToolIcons("stats", readOnly("Top N Values")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = StatsTopNSchema.parse(params) as {
          table: string;
          column: string;
          n?: number;
          orderDirection?: "asc" | "desc";
          selectColumns?: string[];
          schema?: string;
          where?: string;
        };

        const {
          table,
          column,
          schema,
          where,
          selectColumns,
        } = parsed;
        const n =
          parsed.n === undefined || Number.isNaN(parsed.n) ? 10 : parsed.n;
        const direction = parsed.orderDirection ?? "desc";
        const schemaName = schema ?? "public";
        const schemaPrefix = schema ? `"${schema}".` : "";
        const whereClause = where
          ? `WHERE ${sanitizeWhereClause(where)}`
          : "";

        let columnList: string;
        let hint: string | undefined;

        if (selectColumns && selectColumns.length > 0) {
          // User-specified columns
          columnList = selectColumns.map((c) => `"${c}"`).join(", ");
        } else {
          // Auto-exclude long content columns
          const colQuery = `
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = $2
            ORDER BY ordinal_position
          `;
          const colResult = await adapter.executeQuery(colQuery, [
            schemaName,
            table,
          ]);
          const allCols = (colResult.rows ?? []) as {
            column_name: string;
            data_type: string;
          }[];

          const excluded: string[] = [];
          const included: string[] = [];

          for (const col of allCols) {
            if (LONG_CONTENT_TYPES.has(col.data_type.toLowerCase())) {
              excluded.push(col.column_name);
            } else {
              included.push(col.column_name);
            }
          }

          if (excluded.length > 0) {
            hint = `Auto-excluded long-content columns: ${excluded.join(", ")}. Use selectColumns to override.`;
          }

          columnList =
            included.length > 0
              ? included.map((c) => `"${c}"`).join(", ")
              : "*";
        }

        const sql = `
          SELECT ${columnList}
          FROM ${schemaPrefix}"${table}"
          ${whereClause}
          ORDER BY "${column}" ${direction.toUpperCase()}
          LIMIT ${String(n)}
        `;

        const result = await adapter.executeQuery(sql);
        const rows = result.rows ?? [];

        const response: Record<string, unknown> = {
          success: true,
          column,
          direction,
          count: rows.length,
          rows,
        };

        if (hint) {
          response["hint"] = hint;
        }

        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_stats_top_n" });
      }
    },
  };
}

// =============================================================================
// DISTINCT VALUES
// =============================================================================

export function createStatsDistinctTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stats_distinct",
    description:
      "Get distinct values from a column with count. Useful for understanding cardinality and unique value distribution.",
    group: "stats",
    inputSchema: StatsDistinctSchemaBase.partial(),
    outputSchema: StatsDistinctOutputSchema,
    annotations: readOnly("Distinct Values"),
    icons: getToolIcons("stats", readOnly("Distinct Values")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = StatsDistinctSchema.parse(params) as {
          table: string;
          column: string;
          schema?: string;
          where?: string;
          limit?: number;
        };

        const { table, column, schema, where } = parsed;
        const limit =
          parsed.limit === undefined || Number.isNaN(parsed.limit)
            ? 100
            : parsed.limit;
        const schemaPrefix = schema ? `"${schema}".` : "";
        const whereClause = where
          ? `WHERE ${sanitizeWhereClause(where)}`
          : "";

        const sql = `
          SELECT DISTINCT "${column}" AS value
          FROM ${schemaPrefix}"${table}"
          ${whereClause}
          ORDER BY "${column}"
          LIMIT ${String(limit)}
        `;

        const result = await adapter.executeQuery(sql);
        const values = (result.rows ?? []).map(
          (row) => (row as { value: unknown }).value,
        );

        // Get total distinct count
        const countSql = `
          SELECT COUNT(DISTINCT "${column}") AS cnt
          FROM ${schemaPrefix}"${table}"
          ${whereClause}
        `;
        const countResult = await adapter.executeQuery(countSql);
        const distinctCount = Number(
          (countResult.rows?.[0] as { cnt: string } | undefined)?.cnt ?? 0,
        );

        return {
          success: true,
          column,
          distinctCount,
          values,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_stats_distinct",
        });
      }
    },
  };
}

// =============================================================================
// FREQUENCY DISTRIBUTION
// =============================================================================

export function createStatsFrequencyTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stats_frequency",
    description:
      "Get value frequency distribution (count per unique value) ordered by frequency descending. Shows the most common values first.",
    group: "stats",
    inputSchema: StatsFrequencySchemaBase.partial(),
    outputSchema: StatsFrequencyOutputSchema,
    annotations: readOnly("Frequency Distribution"),
    icons: getToolIcons("stats", readOnly("Frequency Distribution")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = StatsFrequencySchema.parse(params) as {
          table: string;
          column: string;
          schema?: string;
          where?: string;
          limit?: number;
        };

        const { table, column, schema, where } = parsed;
        const limit =
          parsed.limit === undefined || Number.isNaN(parsed.limit)
            ? 20
            : parsed.limit;
        const schemaPrefix = schema ? `"${schema}".` : "";
        const whereClause = where
          ? `WHERE ${sanitizeWhereClause(where)}`
          : "";

        const sql = `
          SELECT
            "${column}" AS value,
            COUNT(*) AS frequency,
            ROUND(COUNT(*)::numeric * 100.0 / SUM(COUNT(*)) OVER(), 2) AS percentage
          FROM ${schemaPrefix}"${table}"
          ${whereClause}
          GROUP BY "${column}"
          ORDER BY COUNT(*) DESC
          LIMIT ${String(limit)}
        `;

        const result = await adapter.executeQuery(sql);
        const distribution = (result.rows ?? []).map((row) => ({
          value: row["value"],
          frequency: Number(row["frequency"]),
          percentage: Number(row["percentage"]),
        }));

        // Get total distinct count
        const countSql = `
          SELECT COUNT(DISTINCT "${column}") AS cnt
          FROM ${schemaPrefix}"${table}"
          ${whereClause}
        `;
        const countResult = await adapter.executeQuery(countSql);
        const distinctValues = Number(
          (countResult.rows?.[0] as { cnt: string } | undefined)?.cnt ?? 0,
        );

        return {
          success: true,
          column,
          distinctValues,
          distribution,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_stats_frequency",
        });
      }
    },
  };
}

// =============================================================================
// SUMMARY STATISTICS
// =============================================================================

export function createStatsSummaryTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stats_summary",
    description:
      "Get summary statistics (count, avg, min, max, stddev) for multiple numeric columns. Defaults to all numeric columns if none specified.",
    group: "stats",
    inputSchema: StatsSummarySchemaBase.partial(),
    outputSchema: StatsSummaryOutputSchema,
    annotations: readOnly("Summary Statistics"),
    icons: getToolIcons("stats", readOnly("Summary Statistics")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = StatsSummarySchema.parse(params) as {
          table: string;
          columns?: string[];
          schema?: string;
          where?: string;
        };

        const { table, schema, where } = parsed;
        const schemaName = schema ?? "public";
        const schemaPrefix = schema ? `"${schema}".` : "";
        const whereClause = where
          ? `WHERE ${sanitizeWhereClause(where)}`
          : "";

        // Determine columns to summarize
        let targetColumns: string[];

        if (parsed.columns && parsed.columns.length > 0) {
          targetColumns = parsed.columns;
        } else {
          // Auto-detect numeric columns
          const colQuery = `
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = $1
              AND table_name = $2
              AND data_type = ANY($3)
            ORDER BY ordinal_position
          `;
          const colResult = await adapter.executeQuery(colQuery, [
            schemaName,
            table,
            [...NUMERIC_TYPES],
          ]);
          const colRows = (colResult.rows ?? []) as { column_name: string }[];
          targetColumns = colRows.map((row) => row.column_name);
        }

        if (targetColumns.length === 0) {
          // Check if table actually exists or if it just has no numeric columns
          if (!parsed.columns || parsed.columns.length === 0) {
            const tableCheck = await adapter.executeQuery(
              `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
              [schemaName, table],
            );
            if (!tableCheck.rows || tableCheck.rows.length === 0) {
              throw new Error(`Table "${schemaName}.${table}" not found`);
            }
          }

          return {
            success: true,
            table: `${schemaName}.${table}`,
            summaries: [],
          };
        }

        // Build a single query for all columns
        const selectParts = targetColumns.flatMap((col) => [
          `COUNT("${col}") AS "${col}_count"`,
          `AVG("${col}")::float8 AS "${col}_avg"`,
          `MIN("${col}")::float8 AS "${col}_min"`,
          `MAX("${col}")::float8 AS "${col}_max"`,
          `STDDEV_SAMP("${col}")::float8 AS "${col}_stddev"`,
        ]);

        const sql = `
          SELECT ${selectParts.join(",\n            ")}
          FROM ${schemaPrefix}"${table}"
          ${whereClause}
        `;

        const result = await adapter.executeQuery(sql);
        const row = result.rows?.[0];

        const summaries = targetColumns.map((col) => {
          if (!row) {
            return { column: col, error: "No data returned" };
          }
          return {
            column: col,
            count: Number(row[`${col}_count`] ?? 0),
            avg:
              row[`${col}_avg`] !== null ? Number(row[`${col}_avg`]) : null,
            min:
              row[`${col}_min`] !== null ? Number(row[`${col}_min`]) : null,
            max:
              row[`${col}_max`] !== null ? Number(row[`${col}_max`]) : null,
            stddev:
              row[`${col}_stddev`] !== null
                ? Number(row[`${col}_stddev`])
                : null,
          };
        });

        return {
          success: true,
          table: `${schemaName}.${table}`,
          summaries,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_stats_summary",
        });
      }
    },
  };
}
