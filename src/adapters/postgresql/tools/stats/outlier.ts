/**
 * PostgreSQL Statistics Tools - Outlier Detection
 *
 * Detect statistical outliers using IQR or Z-score methods.
 * 1 tool total.
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
import { validateNumericColumn } from "./validators.js";
import { ValidationError } from "../../../../types/errors.js";
import {
  StatsOutliersSchemaBase,
  StatsOutliersSchema,
  StatsOutliersOutputSchema,
} from "../../schemas/stats/advanced.js";

/**
 * Outlier detection via IQR or Z-score
 */
export function createStatsOutliersTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stats_outliers",
    description:
      "Detect statistical outliers in a numeric column using IQR (interquartile range) or Z-score method. IQR is robust against non-normal distributions.",
    group: "stats",
    inputSchema: StatsOutliersSchemaBase.partial(),
    outputSchema: StatsOutliersOutputSchema,
    annotations: readOnly("Outlier Detection"),
    icons: getToolIcons("stats", readOnly("Outlier Detection")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = StatsOutliersSchema.parse(params) as {
          table: string;
          column: string;
          method?: "iqr" | "zscore";
          threshold?: number;
          schema?: string;
          where?: string;
          limit?: number;
          maxOutliers?: number;
        };

        const { table, column, schema, where } = parsed;
        const method = parsed.method ?? "iqr";
        const maxOutliers =
          parsed.maxOutliers === undefined || Number.isNaN(parsed.maxOutliers)
            ? 50
            : parsed.maxOutliers;
        if (maxOutliers > 1000) {
          throw new ValidationError(
            "Parameter 'maxOutliers' cannot exceed 1000.",
          );
        }
        const limit =
          parsed.limit === undefined || Number.isNaN(parsed.limit)
            ? 10000
            : parsed.limit;

        const schemaName = schema ?? "public";
        const schemaPrefix = schema ? `"${schema}".` : "";
        const whereClause = where ? `WHERE ${sanitizeWhereClause(where)}` : "";

        // Validate column exists and is numeric
        await validateNumericColumn(adapter, table, column, schemaName);

        if (method === "zscore") {
          return await detectZScoreOutliers(
            adapter,
            { table, column, schemaPrefix, whereClause },
            parsed.threshold ?? 3,
            limit,
            maxOutliers,
          );
        }

        return await detectIqrOutliers(
          adapter,
          { table, column, schemaPrefix, whereClause },
          parsed.threshold ?? 1.5,
          limit,
          maxOutliers,
        );
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_stats_outliers",
        });
      }
    },
  };
}

// =============================================================================
// Z-Score Detection
// =============================================================================

interface QueryParts {
  table: string;
  column: string;
  schemaPrefix: string;
  whereClause: string;
}

async function detectZScoreOutliers(
  adapter: PostgresAdapter,
  parts: QueryParts,
  threshold: number,
  limit: number,
  maxOutliers: number,
): Promise<Record<string, unknown>> {
  const { table, column, schemaPrefix, whereClause } = parts;

  // Get statistics using PostgreSQL aggregate functions
  const statsSql = `
    SELECT
      AVG("${column}")::float8 AS mean,
      STDDEV_SAMP("${column}")::float8 AS stddev,
      COUNT("${column}") AS total_count
    FROM ${schemaPrefix}"${table}"
    ${whereClause}
  `;
  const statsResult = await adapter.executeQuery(statsSql);
  const statsRow = statsResult.rows?.[0] as
    | { mean: unknown; stddev: unknown; total_count: unknown }
    | undefined;

  if (statsRow?.mean == null || statsRow.stddev == null) {
    return {
      success: true,
      method: "zscore",
      outlierCount: 0,
      totalRows: 0,
      stats: { mean: 0, stdDev: 0, lowerBound: 0, upperBound: 0 },
    };
  }

  const mean = Number(statsRow.mean);
  const stdDev = Number(statsRow.stddev);
  const totalRows = Number(statsRow.total_count);

  if (stdDev === 0) {
    return {
      success: true,
      method: "zscore",
      stats: { mean, stdDev: 0, lowerBound: mean, upperBound: mean },
      outlierCount: 0,
      totalRows,
    };
  }

  const lowerBound = mean - threshold * stdDev;
  const upperBound = mean + threshold * stdDev;

  // Find outliers — values outside threshold standard deviations
  const outlierSql = `
    SELECT "${column}" AS value, ctid::text
    FROM ${schemaPrefix}"${table}"
    ${whereClause ? whereClause + " AND" : "WHERE"}
      ABS(("${column}" - ${String(mean)}) / ${String(stdDev)}) > ${String(threshold)}
    ORDER BY ABS("${column}" - ${String(mean)}) DESC
    LIMIT ${String(limit)}
  `;

  const outlierResult = await adapter.executeQuery(outlierSql);
  const allOutliers = (outlierResult.rows ?? []).map((row) => ({
    value: Number((row as { value: unknown; ctid: string }).value),
    ctid: (row as { value: unknown; ctid: string }).ctid,
  }));

  const truncated = allOutliers.length > maxOutliers;
  const outliers = truncated ? allOutliers.slice(0, maxOutliers) : allOutliers;

  const response: Record<string, unknown> = {
    success: true,
    method: "zscore",
    stats: { mean, stdDev, lowerBound, upperBound },
    outlierCount: outliers.length,
    totalRows,
    outliers,
  };

  if (truncated) {
    response["truncated"] = true;
    response["totalOutliers"] = allOutliers.length;
  }

  return response;
}

// =============================================================================
// IQR Detection
// =============================================================================

async function detectIqrOutliers(
  adapter: PostgresAdapter,
  parts: QueryParts,
  multiplier: number,
  limit: number,
  maxOutliers: number,
): Promise<Record<string, unknown>> {
  const { table, column, schemaPrefix, whereClause } = parts;

  // Get Q1, Q3, and count using PostgreSQL ordered-set aggregate functions
  const statsSql = `
    SELECT
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY "${column}")::float8 AS q1,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY "${column}")::float8 AS q3,
      COUNT("${column}") AS total_count
    FROM ${schemaPrefix}"${table}"
    ${whereClause}
  `;
  const statsResult = await adapter.executeQuery(statsSql);
  const statsRow = statsResult.rows?.[0] as
    | { q1: unknown; q3: unknown; total_count: unknown }
    | undefined;

  if (statsRow?.q1 == null || statsRow.q3 == null) {
    return {
      success: true,
      method: "iqr",
      outlierCount: 0,
      totalRows: 0,
      stats: { q1: 0, q3: 0, iqr: 0, lowerBound: 0, upperBound: 0 },
    };
  }

  const q1 = Number(statsRow.q1);
  const q3 = Number(statsRow.q3);
  const iqr = q3 - q1;
  const totalRows = Number(statsRow.total_count);

  const lowerBound = q1 - multiplier * iqr;
  const upperBound = q3 + multiplier * iqr;

  // Find outliers — values outside IQR fences
  const outlierSql = `
    SELECT "${column}" AS value, ctid::text
    FROM ${schemaPrefix}"${table}"
    ${whereClause ? whereClause + " AND" : "WHERE"}
      ("${column}" < ${String(lowerBound)} OR "${column}" > ${String(upperBound)})
    ORDER BY ABS("${column}" - ${String((q1 + q3) / 2)}) DESC
    LIMIT ${String(limit)}
  `;

  const outlierResult = await adapter.executeQuery(outlierSql);
  const allOutliers = (outlierResult.rows ?? []).map((row) => ({
    value: Number((row as { value: unknown; ctid: string }).value),
    ctid: (row as { value: unknown; ctid: string }).ctid,
  }));

  const truncated = allOutliers.length > maxOutliers;
  const outliers = truncated ? allOutliers.slice(0, maxOutliers) : allOutliers;

  const response: Record<string, unknown> = {
    success: true,
    method: "iqr",
    stats: { q1, q3, iqr, lowerBound, upperBound },
    outlierCount: outliers.length,
    totalRows,
    outliers,
  };

  if (truncated) {
    response["truncated"] = true;
    response["totalOutliers"] = allOutliers.length;
  }

  return response;
}
