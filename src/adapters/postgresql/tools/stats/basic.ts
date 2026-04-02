/**
 * PostgreSQL Statistics Tools - Correlation & Regression
 *
 * Two-column statistical analysis tools.
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
  StatsCorrelationSchemaBase,
  StatsRegressionSchemaBase,
  // Preprocessed schemas for handler parsing
  StatsCorrelationSchema,
  StatsRegressionSchema,
  // Output schemas for MCP structured content
  CorrelationOutputSchema,
  RegressionOutputSchema,
} from "../../schemas/index.js";
import { validateNumericColumn } from "./validators.js";

/**
 * Correlation analysis
 */
export function createStatsCorrelationTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stats_correlation",
    description:
      "Calculate Pearson correlation coefficient between two numeric columns. Use groupBy to get correlation per category.",
    group: "stats",
    inputSchema: StatsCorrelationSchemaBase.partial(), // Base schema for MCP visibility
    outputSchema: CorrelationOutputSchema,
    annotations: readOnly("Correlation Analysis"),
    icons: getToolIcons("stats", readOnly("Correlation Analysis")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = StatsCorrelationSchema.parse(params) as {
          table: string;
          column1: string;
          column2: string;
          schema?: string;
          where?: string;
          params?: unknown[];
          groupBy?: string;
        };
        const {
          table,
          column1,
          column2,
          schema,
          where,
          params: queryParams,
          groupBy,
        } = parsed;

        const schemaName = schema ?? "public";
        const schemaPrefix = schema ? `"${schema}".` : "";
        const whereClause = where ? `WHERE ${sanitizeWhereClause(where)}` : "";

        // Validate both columns exist and are numeric (with table-first error checking)
        await validateNumericColumn(adapter, table, column1, schemaName);
        await validateNumericColumn(adapter, table, column2, schemaName);

        // Helper to interpret correlation
        const interpretCorr = (corr: number | null): string => {
          if (corr === null) return "N/A";
          const absCorr = Math.abs(corr);
          let interpretation: string;
          if (absCorr >= 0.9) interpretation = "Very strong";
          else if (absCorr >= 0.7) interpretation = "Strong";
          else if (absCorr >= 0.5) interpretation = "Moderate";
          else if (absCorr >= 0.3) interpretation = "Weak";
          else interpretation = "Very weak or no correlation";
          interpretation += corr < 0 ? " (negative)" : " (positive)";
          return interpretation;
        };

        // Helper to map row to correlation result
        const mapCorrelation = (
          row: Record<string, unknown>,
        ): {
          correlation: number | null;
          interpretation: string;
          covariancePopulation: number | null;
          covarianceSample: number | null;
          sampleSize: number;
        } => {
          const corr =
            row["correlation"] !== null ? Number(row["correlation"]) : null;
          return {
            correlation: corr,
            interpretation: interpretCorr(corr),
            covariancePopulation:
              row["covariance_pop"] !== null
                ? Number(row["covariance_pop"])
                : null,
            covarianceSample:
              row["covariance_sample"] !== null
                ? Number(row["covariance_sample"])
                : null,
            sampleSize: Number(row["sample_size"]),
          };
        };

        if (groupBy !== undefined) {
          // Grouped correlation
          const sql = `
                    SELECT
                        "${groupBy}" as group_key,
                        CORR("${column1}", "${column2}")::numeric(10,6) as correlation,
                        COVAR_POP("${column1}", "${column2}")::numeric(20,6) as covariance_pop,
                        COVAR_SAMP("${column1}", "${column2}")::numeric(20,6) as covariance_sample,
                        COUNT(*) as sample_size
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
            ...mapCorrelation(row),
          }));

          return {
            table: `${schema ?? "public"}.${table}`,
            columns: [column1, column2],
            groupBy,
            groups,
            count: groups.length,
          };
        }

        // Ungrouped correlation
        const sql = `
                SELECT
                    CORR("${column1}", "${column2}")::numeric(10,6) as correlation,
                    COVAR_POP("${column1}", "${column2}")::numeric(20,6) as covariance_pop,
                    COVAR_SAMP("${column1}", "${column2}")::numeric(20,6) as covariance_sample,
                    COUNT(*) as sample_size
                FROM ${schemaPrefix}"${table}"
                ${whereClause}
            `;

        const result = await adapter.executeQuery(
          sql,
          ...(queryParams !== undefined && queryParams.length > 0
            ? [queryParams]
            : []),
        );
        const row = result.rows?.[0];

        if (!row) throw new ValidationError("No correlation data found");

        const response: Record<string, unknown> = {
          table: `${schema ?? "public"}.${table}`,
          columns: [column1, column2],
          ...mapCorrelation(row),
        };

        // Add note for self-correlation
        if (column1 === column2) {
          response["note"] = "Self-correlation always equals 1.0";
        }

        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_stats_correlation" });
      }
    },
  };
}

/**
 * Linear regression
 */
export function createStatsRegressionTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stats_regression",
    description:
      "Perform linear regression analysis (y = mx + b) between two columns. Use groupBy to get regression per category.",
    group: "stats",
    inputSchema: StatsRegressionSchemaBase.partial(), // Base schema for MCP visibility
    outputSchema: RegressionOutputSchema,
    annotations: readOnly("Linear Regression"),
    icons: getToolIcons("stats", readOnly("Linear Regression")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = StatsRegressionSchema.parse(params) as {
          table: string;
          xColumn: string;
          yColumn: string;
          schema?: string;
          where?: string;
          params?: unknown[];
          groupBy?: string;
        };
        const {
          table,
          xColumn,
          yColumn,
          schema,
          where,
          params: queryParams,
          groupBy,
        } = parsed;

        const schemaName = schema ?? "public";
        const schemaPrefix = schema ? `"${schema}".` : "";
        const whereClause = where ? `WHERE ${sanitizeWhereClause(where)}` : "";

        // Validate both columns exist and are numeric
        await validateNumericColumn(adapter, table, xColumn, schemaName);
        await validateNumericColumn(adapter, table, yColumn, schemaName);

        // Helper to map row to regression result
        const mapRegression = (
          row: Record<string, unknown>,
        ): {
          slope: number | null;
          intercept: number | null;
          rSquared: number | null;
          equation: string;
          avgX: number | null;
          avgY: number | null;
          sampleSize: number;
        } => {
          const slope = row["slope"] !== null ? Number(row["slope"]) : null;
          const intercept =
            row["intercept"] !== null ? Number(row["intercept"]) : null;
          const rSquared =
            row["r_squared"] !== null ? Number(row["r_squared"]) : null;

          let equation = "N/A";
          if (slope !== null && intercept !== null) {
            const sign = intercept >= 0 ? "+" : "-";
            equation = `y = ${slope.toFixed(4)}x ${sign} ${Math.abs(intercept).toFixed(4)}`;
          }

          return {
            slope,
            intercept,
            rSquared,
            equation,
            avgX: row["avg_x"] !== null ? Number(row["avg_x"]) : null,
            avgY: row["avg_y"] !== null ? Number(row["avg_y"]) : null,
            sampleSize: Number(row["sample_size"]),
          };
        };

        if (groupBy !== undefined) {
          // Grouped regression
          const sql = `
                    SELECT
                        "${groupBy}" as group_key,
                        REGR_SLOPE("${yColumn}", "${xColumn}")::numeric(20,6) as slope,
                        REGR_INTERCEPT("${yColumn}", "${xColumn}")::numeric(20,6) as intercept,
                        REGR_R2("${yColumn}", "${xColumn}")::numeric(10,6) as r_squared,
                        REGR_AVGX("${yColumn}", "${xColumn}")::numeric(20,6) as avg_x,
                        REGR_AVGY("${yColumn}", "${xColumn}")::numeric(20,6) as avg_y,
                        REGR_COUNT("${yColumn}", "${xColumn}") as sample_size
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
            regression: mapRegression(row),
          }));

          return {
            table: `${schema ?? "public"}.${table}`,
            xColumn,
            yColumn,
            groupBy,
            groups,
            count: groups.length,
          };
        }

        // Ungrouped regression
        const sql = `
                SELECT
                    REGR_SLOPE("${yColumn}", "${xColumn}")::numeric(20,6) as slope,
                    REGR_INTERCEPT("${yColumn}", "${xColumn}")::numeric(20,6) as intercept,
                    REGR_R2("${yColumn}", "${xColumn}")::numeric(10,6) as r_squared,
                    REGR_AVGX("${yColumn}", "${xColumn}")::numeric(20,6) as avg_x,
                    REGR_AVGY("${yColumn}", "${xColumn}")::numeric(20,6) as avg_y,
                    REGR_COUNT("${yColumn}", "${xColumn}") as sample_size,
                    REGR_SXX("${yColumn}", "${xColumn}")::numeric(20,6) as sum_squares_x,
                    REGR_SYY("${yColumn}", "${xColumn}")::numeric(20,6) as sum_squares_y,
                    REGR_SXY("${yColumn}", "${xColumn}")::numeric(20,6) as sum_products
                FROM ${schemaPrefix}"${table}"
                ${whereClause}
            `;

        const result = await adapter.executeQuery(
          sql,
          ...(queryParams !== undefined && queryParams.length > 0
            ? [queryParams]
            : []),
        );
        const row = result.rows?.[0];

        if (!row) throw new ValidationError("No regression data found");

        const response: Record<string, unknown> = {
          table: `${schema ?? "public"}.${table}`,
          xColumn,
          yColumn,
          regression: mapRegression(row),
        };

        // Add note for self-regression
        if (xColumn === yColumn) {
          response["note"] = "Self-regression always returns slope=1, r²=1";
        }

        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_stats_regression" });
      }
    },
  };
}
