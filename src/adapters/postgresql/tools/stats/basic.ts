/**
 * PostgreSQL Statistics Tools - Basic Statistics
 *
 * Core statistical analysis tools: descriptive statistics, percentiles, correlation, regression.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import {
  // Base schemas for MCP visibility
  StatsDescriptiveSchemaBase,
  StatsPercentilesSchemaBase,
  StatsCorrelationSchemaBase,
  StatsRegressionSchemaBase,
  // Preprocessed schemas for handler parsing
  StatsDescriptiveSchema,
  StatsPercentilesSchema,
  StatsCorrelationSchema,
  StatsRegressionSchema,
  // Output schemas for MCP structured content
  DescriptiveOutputSchema,
  PercentilesOutputSchema,
  CorrelationOutputSchema,
  RegressionOutputSchema,
} from "../../schemas/index.js";

// =============================================================================
// Tool Implementations
// =============================================================================

/**
 * Descriptive statistics: count, min, max, avg, stddev, variance
 */
export function createStatsDescriptiveTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stats_descriptive",
    description:
      "Calculate descriptive statistics (count, min, max, avg, stddev, variance, sum) for a numeric column. Use groupBy to get statistics per category.",
    group: "stats",
    inputSchema: StatsDescriptiveSchemaBase, // Base schema for MCP visibility
    outputSchema: DescriptiveOutputSchema,
    annotations: readOnly("Descriptive Statistics"),
    icons: getToolIcons("stats", readOnly("Descriptive Statistics")),
    handler: async (params: unknown, _context: RequestContext) => {
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
      const whereClause = where ? `WHERE ${where}` : "";

      // Validate column is numeric type
      const typeCheckQuery = `
                SELECT data_type 
                FROM information_schema.columns 
                WHERE table_schema = '${schema ?? "public"}' 
                AND table_name = '${table}'
                AND column_name = '${column}'
            `;
      const typeResult = await adapter.executeQuery(typeCheckQuery);
      const typeRow = typeResult.rows?.[0] as { data_type: string } | undefined;

      if (!typeRow) {
        // Check if table exists
        const tableCheckQuery = `
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_schema = '${schema ?? "public"}' AND table_name = '${table}'
                `;
        const tableResult = await adapter.executeQuery(tableCheckQuery);
        if (tableResult.rows?.length === 0) {
          throw new Error(`Table "${schema ?? "public"}.${table}" not found`);
        }
        throw new Error(
          `Column "${column}" not found in table "${schema ?? "public"}.${table}"`,
        );
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
        throw new Error(
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
                        AVG("${column}")::numeric(20,6) as avg,
                        STDDEV("${column}")::numeric(20,6) as stddev,
                        VARIANCE("${column}")::numeric(20,6) as variance,
                        SUM("${column}")::numeric(20,6) as sum,
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
                    AVG("${column}")::numeric(20,6) as avg,
                    STDDEV("${column}")::numeric(20,6) as stddev,
                    VARIANCE("${column}")::numeric(20,6) as variance,
                    SUM("${column}")::numeric(20,6) as sum,
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

      if (!stats) throw new Error("No stats found");

      return {
        table: `${schema ?? "public"}.${table}`,
        column,
        statistics: mapStats(stats),
      };
    },
  };
}

/**
 * Validate that a table exists and a column is numeric.
 * Throws user-friendly error messages for missing table/column.
 */
async function validateNumericColumn(
  adapter: PostgresAdapter,
  table: string,
  column: string,
  schema: string,
): Promise<void> {
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

  const typeCheckQuery = `
    SELECT data_type 
    FROM information_schema.columns 
    WHERE table_schema = '${schema}' 
    AND table_name = '${table}'
    AND column_name = '${column}'
  `;
  const typeResult = await adapter.executeQuery(typeCheckQuery);
  const typeRow = typeResult.rows?.[0] as { data_type: string } | undefined;

  if (!typeRow) {
    // Check if table exists
    const tableCheckQuery = `
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = '${schema}' AND table_name = '${table}'
    `;
    const tableResult = await adapter.executeQuery(tableCheckQuery);
    if (tableResult.rows?.length === 0) {
      throw new Error(`Table "${schema}.${table}" not found`);
    }
    throw new Error(
      `Column "${column}" not found in table "${schema}.${table}"`,
    );
  }

  if (!numericTypes.includes(typeRow.data_type)) {
    throw new Error(
      `Column "${column}" is type "${typeRow.data_type}" but must be a numeric type for statistical analysis`,
    );
  }
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
    inputSchema: StatsPercentilesSchemaBase, // Base schema for MCP visibility
    outputSchema: PercentilesOutputSchema,
    annotations: readOnly("Percentiles"),
    icons: getToolIcons("stats", readOnly("Percentiles")),
    handler: async (params: unknown, _context: RequestContext) => {
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
      const whereClause = where ? `WHERE ${where}` : "";

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
        table: `${schema ?? "public"}.${table}`,
        column,
        percentiles: mapPercentiles(row),
      };

      // Include warning if mixed scales were detected
      if (_percentileScaleWarning) {
        response["warning"] = _percentileScaleWarning;
      }

      return response;
    },
  };
}

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
    inputSchema: StatsCorrelationSchemaBase, // Base schema for MCP visibility
    outputSchema: CorrelationOutputSchema,
    annotations: readOnly("Correlation Analysis"),
    icons: getToolIcons("stats", readOnly("Correlation Analysis")),
    handler: async (params: unknown, _context: RequestContext) => {
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
      const whereClause = where ? `WHERE ${where}` : "";

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

      if (!row) throw new Error("No correlation data found");

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
    inputSchema: StatsRegressionSchemaBase, // Base schema for MCP visibility
    outputSchema: RegressionOutputSchema,
    annotations: readOnly("Linear Regression"),
    icons: getToolIcons("stats", readOnly("Linear Regression")),
    handler: async (params: unknown, _context: RequestContext) => {
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
      const whereClause = where ? `WHERE ${where}` : "";

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

      if (!row) return { error: "No regression data found" };

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
    },
  };
}
