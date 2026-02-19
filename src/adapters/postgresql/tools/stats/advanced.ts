/**
 * PostgreSQL Statistics Tools - Advanced Statistics
 *
 * Advanced statistical analysis tools: time series, distribution, hypothesis testing, sampling.
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
  StatsTimeSeriesSchemaBase,
  StatsDistributionSchemaBase,
  StatsHypothesisSchemaBase,
  StatsSamplingSchemaBase,
  // Preprocessed schemas for handler parsing
  StatsTimeSeriesSchema,
  StatsDistributionSchema,
  StatsHypothesisSchema,
  StatsSamplingSchema,
  // Output schemas for MCP structured content
  TimeSeriesOutputSchema,
  DistributionOutputSchema,
  HypothesisOutputSchema,
  SamplingOutputSchema,
} from "../../schemas/index.js";

// =============================================================================
// P-Value Calculation Utilities
// =============================================================================

/**
 * Log gamma function using Lanczos approximation.
 * Used for computing the incomplete beta function.
 */
function logGamma(x: number): number {
  // Lanczos coefficients (truncated to 14 significant digits for JS precision)
  const c0 = 76.18009172947;
  const c1 = -86.50532032942;
  const c2 = 24.01409824083;
  const c3 = -1.2317395724502;
  const c4 = 0.0012086509738662;
  const c5 = -0.000005395239385;

  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;

  y += 1;
  ser += c0 / y;
  y += 1;
  ser += c1 / y;
  y += 1;
  ser += c2 / y;
  y += 1;
  ser += c3 / y;
  y += 1;
  ser += c4 / y;
  y += 1;
  ser += c5 / y;

  return -tmp + Math.log((2.506628274631 * ser) / x);
}

/**
 * Regularized incomplete beta function using continued fraction expansion.
 * I_x(a,b) = B_x(a,b) / B(a,b)
 *
 * This is used to compute the CDF of the t-distribution.
 */
function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use symmetry relation if x > (a+1)/(a+b+2)
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - incompleteBeta(b, a, 1 - x);
  }

  // Compute the prefactor
  const lnBeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(
    Math.log(x) * a + Math.log(1 - x) * b - lnBeta - Math.log(a),
  );

  // Lentz's algorithm for continued fraction
  const maxIterations = 200;
  const epsilon = 1e-14;
  const tiny = 1e-30;

  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m;

    // Even step
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;

    // Odd step
    aa = -((a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;

    if (Math.abs(delta - 1) < epsilon) break;
  }

  return front * h;
}

/**
 * Cumulative distribution function for the t-distribution.
 * Uses the relationship between t-distribution and incomplete beta function.
 *
 * @param t - The t-statistic
 * @param df - Degrees of freedom
 * @returns Probability P(T <= t) for a t-distributed random variable
 */
function tDistributionCDF(t: number, df: number): number {
  const x = df / (df + t * t);
  const beta = incompleteBeta(df / 2, 0.5, x);

  if (t >= 0) {
    return 1 - 0.5 * beta;
  } else {
    return 0.5 * beta;
  }
}

/**
 * Calculate two-tailed p-value for a t-test.
 *
 * @param t - The t-statistic
 * @param df - Degrees of freedom
 * @returns Two-tailed p-value
 */
function calculateTTestPValue(t: number, df: number): number {
  // Two-tailed: P(|T| > |t|) = 2 * P(T > |t|) = 2 * (1 - CDF(|t|))
  const absT = Math.abs(t);
  return 2 * (1 - tDistributionCDF(absT, df));
}

/**
 * Cumulative distribution function for the standard normal distribution.
 * Uses the error function approximation.
 *
 * @param z - The z-statistic
 * @returns Probability P(Z <= z) for a standard normal random variable
 */
function normalCDF(z: number): number {
  // Approximation using the error function
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);

  const t = 1 / (1 + p * x);
  const y =
    1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1 + sign * y);
}

/**
 * Calculate two-tailed p-value for a z-test.
 *
 * @param z - The z-statistic
 * @returns Two-tailed p-value
 */
function calculateZTestPValue(z: number): number {
  // Two-tailed: P(|Z| > |z|) = 2 * P(Z > |z|) = 2 * (1 - CDF(|z|))
  const absZ = Math.abs(z);
  return 2 * (1 - normalCDF(absZ));
}

// =============================================================================
// Validation Helpers
// =============================================================================

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
 * Validate that a table exists (for tools that don't require a specific column).
 * Throws user-friendly error message for missing table.
 */
async function validateTableExists(
  adapter: PostgresAdapter,
  table: string,
  schema: string,
): Promise<void> {
  const tableCheckQuery = `
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = '${schema}' AND table_name = '${table}'
  `;
  const tableResult = await adapter.executeQuery(tableCheckQuery);
  if (tableResult.rows?.length === 0) {
    throw new Error(`Table "${schema}.${table}" not found`);
  }
}

// =============================================================================
// Tool Implementations
// =============================================================================

/**
 * Time series analysis
 */
export function createStatsTimeSeriesTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stats_time_series",
    description:
      "Aggregate data into time buckets for time series analysis. Use groupBy to get separate time series per category.",
    group: "stats",
    inputSchema: StatsTimeSeriesSchemaBase, // Base schema for MCP visibility
    outputSchema: TimeSeriesOutputSchema,
    annotations: readOnly("Time Series Analysis"),
    icons: getToolIcons("stats", readOnly("Time Series Analysis")),
    handler: async (params: unknown, _context: RequestContext) => {
      const {
        table,
        valueColumn,
        timeColumn,
        interval,
        aggregation,
        schema,
        where,
        params: queryParams,
        limit,
        groupBy,
        groupLimit,
      } = StatsTimeSeriesSchema.parse(params) as {
        table: string;
        valueColumn: string;
        timeColumn: string;
        interval: string;
        aggregation?: string;
        schema?: string;
        where?: string;
        params?: unknown[];
        limit?: number;
        groupBy?: string;
        groupLimit?: number;
      };

      const schemaPrefix = schema ? `"${schema}".` : "";
      const whereClause = where ? `WHERE ${where}` : "";
      const agg = aggregation ?? "avg";

      // Handle limit: undefined uses default (100), 0 means no limit
      // Track whether user explicitly provided a limit
      const userProvidedLimit = limit !== undefined;
      const DEFAULT_LIMIT = 100;
      // limit === 0 means "no limit", otherwise use provided limit or default
      const effectiveLimit = limit === 0 ? undefined : (limit ?? DEFAULT_LIMIT);
      const usingDefaultLimit =
        !userProvidedLimit && effectiveLimit !== undefined;

      // First check if table exists
      const schemaName = schema ?? "public";
      const tableCheckQuery = `
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = '${schemaName}' AND table_name = '${table}'
      `;
      const tableCheckResult = await adapter.executeQuery(tableCheckQuery);
      if (tableCheckResult.rows?.length === 0) {
        throw new Error(`Table "${schemaName}.${table}" not found`);
      }

      // Validate timeColumn is a timestamp/date type
      const typeCheckQuery = `
                SELECT data_type 
                FROM information_schema.columns 
                WHERE table_schema = '${schemaName}' 
                AND table_name = '${table}'
                AND column_name = '${timeColumn}'
            `;
      const typeResult = await adapter.executeQuery(typeCheckQuery);
      const typeRow = typeResult.rows?.[0] as { data_type: string } | undefined;

      if (!typeRow) {
        throw new Error(
          `Column "${timeColumn}" not found in table "${schemaName}.${table}"`,
        );
      }

      const validTypes = [
        "timestamp without time zone",
        "timestamp with time zone",
        "date",
        "time",
        "time without time zone",
        "time with time zone",
      ];
      if (!validTypes.includes(typeRow.data_type)) {
        throw new Error(
          `Column "${timeColumn}" is type "${typeRow.data_type}" but must be a timestamp or date type for time series analysis`,
        );
      }

      // Note: schemaName already defined above for table check

      // Validate valueColumn exists and is numeric
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
      const valueTypeQuery = `
        SELECT data_type 
        FROM information_schema.columns 
        WHERE table_schema = '${schemaName}' 
        AND table_name = '${table}'
        AND column_name = '${valueColumn}'
      `;
      const valueTypeResult = await adapter.executeQuery(valueTypeQuery);
      const valueTypeRow = valueTypeResult.rows?.[0] as
        | { data_type: string }
        | undefined;

      if (!valueTypeRow) {
        throw new Error(
          `Column "${valueColumn}" not found in table "${schemaName}.${table}"`,
        );
      }

      if (!numericTypes.includes(valueTypeRow.data_type)) {
        throw new Error(
          `Column "${valueColumn}" is type "${valueTypeRow.data_type}" but must be a numeric type for time series aggregation`,
        );
      }

      // Helper to map bucket row - convert Date to ISO string for JSON Schema
      // Handles both Date objects (from real DB) and strings (from mocks)
      const mapBucket = (
        row: Record<string, unknown>,
      ): { timeBucket: string; value: number; count: number } => {
        const timeBucketValue = row["time_bucket"];
        let timeBucket: string;
        if (timeBucketValue instanceof Date) {
          timeBucket = timeBucketValue.toISOString();
        } else if (typeof timeBucketValue === "string") {
          timeBucket = timeBucketValue;
        } else {
          // Fallback: null, undefined, or unexpected type
          timeBucket = "";
        }
        return {
          timeBucket,
          value: Number(row["value"]),
          count: Number(row["count"]),
        };
      };

      if (groupBy !== undefined) {
        // Handle groupLimit: undefined uses default (20), 0 means no limit
        const DEFAULT_GROUP_LIMIT = 20;
        const userProvidedGroupLimit = groupLimit !== undefined;
        const effectiveGroupLimit =
          groupLimit === 0 ? undefined : (groupLimit ?? DEFAULT_GROUP_LIMIT);

        // First get total count of distinct groups for truncation indicator
        // COUNT(DISTINCT) excludes NULLs per SQL standard, so add 1 if any NULLs exist
        const groupCountSql = `
          SELECT COUNT(DISTINCT "${groupBy}") + 
            CASE WHEN COUNT(*) > COUNT("${groupBy}") THEN 1 ELSE 0 END as total_groups
          FROM ${schemaPrefix}"${table}"
          ${whereClause}
        `;
        const groupCountResult = await adapter.executeQuery(groupCountSql);
        const totalGroupCount = Number(
          (groupCountResult.rows?.[0] as { total_groups: string | number })
            ?.total_groups ?? 0,
        );

        // Grouped time series
        const sql = `
                    SELECT 
                        "${groupBy}" as group_key,
                        DATE_TRUNC('${interval}', "${timeColumn}") as time_bucket,
                        ${agg.toUpperCase()}("${valueColumn}")::numeric(20,6) as value,
                        COUNT(*) as count
                    FROM ${schemaPrefix}"${table}"
                    ${whereClause}
                    GROUP BY "${groupBy}", DATE_TRUNC('${interval}', "${timeColumn}")
                    ORDER BY "${groupBy}", time_bucket DESC
                `;

        const result = await adapter.executeQuery(
          sql,
          ...(queryParams !== undefined && queryParams.length > 0
            ? [queryParams]
            : []),
        );
        const rows = result.rows ?? [];

        // Group results by group_key
        const groupsMap = new Map<
          unknown,
          { timeBucket: string; value: number; count: number }[]
        >();
        const groupsTotalCount = new Map<unknown, number>();
        let groupsProcessed = 0;

        for (const row of rows) {
          const key = row["group_key"];
          if (!groupsMap.has(key)) {
            // Check if we've hit the group limit
            if (
              effectiveGroupLimit !== undefined &&
              groupsProcessed >= effectiveGroupLimit
            ) {
              continue;
            }
            groupsMap.set(key, []);
            groupsTotalCount.set(key, 0);
            groupsProcessed++;
          }
          const currentTotal = groupsTotalCount.get(key) ?? 0;
          groupsTotalCount.set(key, currentTotal + 1);

          const bucketList = groupsMap.get(key);
          // Only add if no limit or under limit
          if (
            bucketList !== undefined &&
            (effectiveLimit === undefined || bucketList.length < effectiveLimit)
          ) {
            bucketList.push(mapBucket(row));
          }
        }

        const groups = Array.from(groupsMap.entries()).map(
          ([key, buckets]) => ({
            groupKey: key,
            buckets,
          }),
        );

        // Build response with truncation indicators
        const response: Record<string, unknown> = {
          table: `${schema ?? "public"}.${table}`,
          valueColumn,
          timeColumn,
          interval,
          aggregation: agg,
          groupBy,
          groups,
          count: groups.length,
        };

        // Add truncation indicators when groups are limited
        const groupsTruncated =
          effectiveGroupLimit !== undefined &&
          totalGroupCount > effectiveGroupLimit;
        if (groupsTruncated || !userProvidedGroupLimit) {
          response["truncated"] = groupsTruncated;
          response["totalGroupCount"] = totalGroupCount;
        }

        return response;
      }

      // Ungrouped time series
      // Build LIMIT clause: no LIMIT if effectiveLimit is undefined (limit: 0)
      const limitClause =
        effectiveLimit !== undefined ? `LIMIT ${String(effectiveLimit)}` : "";

      // Get total count if using default limit (for truncation indicator)
      let totalCount: number | undefined;
      if (usingDefaultLimit) {
        const countSql = `
          SELECT COUNT(DISTINCT DATE_TRUNC('${interval}', "${timeColumn}")) as total_buckets
          FROM ${schemaPrefix}"${table}"
          ${whereClause}
        `;
        const countResult = await adapter.executeQuery(
          countSql,
          ...(queryParams !== undefined && queryParams.length > 0
            ? [queryParams]
            : []),
        );
        const countRow = countResult.rows?.[0] as
          | { total_buckets: string | number }
          | undefined;
        totalCount = countRow ? Number(countRow.total_buckets) : undefined;
      }

      const sql = `
                SELECT 
                    DATE_TRUNC('${interval}', "${timeColumn}") as time_bucket,
                    ${agg.toUpperCase()}("${valueColumn}")::numeric(20,6) as value,
                    COUNT(*) as count
                FROM ${schemaPrefix}"${table}"
                ${whereClause}
                GROUP BY DATE_TRUNC('${interval}', "${timeColumn}")
                ORDER BY time_bucket DESC
                ${limitClause}
            `;

      const result = await adapter.executeQuery(
        sql,
        ...(queryParams !== undefined && queryParams.length > 0
          ? [queryParams]
          : []),
      );

      const buckets = (result.rows ?? []).map((row) => mapBucket(row));

      // Build response
      const response: Record<string, unknown> = {
        table: `${schema ?? "public"}.${table}`,
        valueColumn,
        timeColumn,
        interval,
        aggregation: agg,
        buckets,
      };

      // Add truncation indicators when default limit was applied
      if (usingDefaultLimit && totalCount !== undefined) {
        response["truncated"] = buckets.length < totalCount;
        response["totalCount"] = totalCount;
      }

      return response;
    },
  };
}

/**
 * Distribution analysis with histogram
 */
export function createStatsDistributionTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stats_distribution",
    description:
      "Analyze data distribution with histogram buckets, skewness, and kurtosis. Use groupBy to get distribution per category.",
    group: "stats",
    inputSchema: StatsDistributionSchemaBase, // Base schema for MCP visibility
    outputSchema: DistributionOutputSchema,
    annotations: readOnly("Distribution Analysis"),
    icons: getToolIcons("stats", readOnly("Distribution Analysis")),
    handler: async (params: unknown, _context: RequestContext) => {
      const parsed = StatsDistributionSchema.parse(params) as {
        table: string;
        column: string;
        buckets?: number;
        schema?: string;
        where?: string;
        params?: unknown[];
        groupBy?: string;
        groupLimit?: number;
      };
      const {
        table,
        column,
        buckets,
        schema,
        where,
        params: queryParams,
        groupBy,
        groupLimit,
      } = parsed;

      const schemaName = schema ?? "public";
      const schemaPrefix = schema ? `"${schema}".` : "";
      const whereClause = where ? `WHERE ${where}` : "";
      const numBuckets = buckets ?? 10;

      // Validate column exists and is numeric
      await validateNumericColumn(adapter, table, column, schemaName);

      // Helper to compute skewness and kurtosis for a given group
      const computeMoments = async (
        groupFilter?: string,
      ): Promise<{
        minVal: number;
        maxVal: number;
        skewness: number | null;
        kurtosis: number | null;
      } | null> => {
        const filterClause = groupFilter
          ? whereClause
            ? `${whereClause} AND ${groupFilter}`
            : `WHERE ${groupFilter}`
          : whereClause;

        const statsQuery = `
                    WITH stats AS (
                        SELECT 
                            MIN("${column}") as min_val,
                            MAX("${column}") as max_val,
                            AVG("${column}") as mean,
                            STDDEV_POP("${column}") as stddev,
                            COUNT("${column}") as n
                        FROM ${schemaPrefix}"${table}"
                        ${filterClause}
                    ),
                    moments AS (
                        SELECT 
                            s.min_val,
                            s.max_val,
                            s.mean,
                            s.stddev,
                            s.n,
                            CASE WHEN s.stddev > 0 AND s.n > 2 THEN
                                (SUM(POWER(("${column}" - s.mean) / s.stddev, 3)) / s.n)::numeric(10,6)
                            ELSE NULL END as skewness,
                            CASE WHEN s.stddev > 0 AND s.n > 3 THEN
                                ((SUM(POWER(("${column}" - s.mean) / s.stddev, 4)) / s.n) - 3)::numeric(10,6)
                            ELSE NULL END as kurtosis
                        FROM ${schemaPrefix}"${table}" t, stats s
                        ${filterClause}
                        GROUP BY s.min_val, s.max_val, s.mean, s.stddev, s.n
                    )
                    SELECT * FROM moments
                `;

        const result = await adapter.executeQuery(
          statsQuery,
          ...(queryParams !== undefined && queryParams.length > 0
            ? [queryParams]
            : []),
        );
        const row = result.rows?.[0];

        if (row?.["min_val"] == null || row["max_val"] == null) {
          return null;
        }

        return {
          minVal: Number(row["min_val"]),
          maxVal: Number(row["max_val"]),
          skewness: row["skewness"] !== null ? Number(row["skewness"]) : null,
          kurtosis: row["kurtosis"] !== null ? Number(row["kurtosis"]) : null,
        };
      };

      // Helper to generate histogram for given min/max
      const generateHistogram = async (
        minVal: number,
        maxVal: number,
        groupFilter?: string,
      ): Promise<
        {
          bucket: number;
          frequency: number;
          rangeMin: number;
          rangeMax: number;
        }[]
      > => {
        const filterClause = groupFilter
          ? whereClause
            ? `${whereClause} AND ${groupFilter}`
            : `WHERE ${groupFilter}`
          : whereClause;

        const histogramQuery = `
                    SELECT 
                        WIDTH_BUCKET("${column}", ${String(minVal)}, ${String(maxVal + 0.0001)}, ${String(numBuckets)}) as bucket,
                        COUNT(*) as frequency,
                        MIN("${column}") as bucket_min,
                        MAX("${column}") as bucket_max
                    FROM ${schemaPrefix}"${table}"
                    ${filterClause}
                    GROUP BY WIDTH_BUCKET("${column}", ${String(minVal)}, ${String(maxVal + 0.0001)}, ${String(numBuckets)})
                    ORDER BY bucket
                `;

        const result = await adapter.executeQuery(
          histogramQuery,
          ...(queryParams !== undefined && queryParams.length > 0
            ? [queryParams]
            : []),
        );
        return (result.rows ?? []).map((row) => ({
          bucket: Number(row["bucket"]),
          frequency: Number(row["frequency"]),
          rangeMin: Number(row["bucket_min"]),
          rangeMax: Number(row["bucket_max"]),
        }));
      };

      if (groupBy !== undefined) {
        // Handle groupLimit: undefined uses default (20), 0 means no limit
        const DEFAULT_GROUP_LIMIT = 20;
        const userProvidedGroupLimit = groupLimit !== undefined;
        const effectiveGroupLimit =
          groupLimit === 0 ? undefined : (groupLimit ?? DEFAULT_GROUP_LIMIT);

        // Get distinct groups first
        const groupsQuery = `
                    SELECT DISTINCT "${groupBy}" as group_key
                    FROM ${schemaPrefix}"${table}"
                    ${whereClause}
                    ORDER BY "${groupBy}"
                `;
        const groupsResult = await adapter.executeQuery(
          groupsQuery,
          ...(queryParams !== undefined && queryParams.length > 0
            ? [queryParams]
            : []),
        );
        const allGroupKeys = (groupsResult.rows ?? []).map(
          (r) => r["group_key"],
        );
        const totalGroupCount = allGroupKeys.length;

        // Apply group limit
        const groupKeys =
          effectiveGroupLimit !== undefined
            ? allGroupKeys.slice(0, effectiveGroupLimit)
            : allGroupKeys;

        // Process each group
        const groups: {
          groupKey: unknown;
          range: { min: number; max: number };
          bucketWidth: number;
          skewness: number | null;
          kurtosis: number | null;
          histogram: {
            bucket: number;
            frequency: number;
            rangeMin: number;
            rangeMax: number;
          }[];
        }[] = [];

        for (const groupKey of groupKeys) {
          const groupFilter =
            typeof groupKey === "string"
              ? `"${groupBy}" = '${groupKey.replace(/'/g, "''")}'`
              : `"${groupBy}" = ${String(groupKey)}`;

          const moments = await computeMoments(groupFilter);
          if (moments === null) continue;

          const { minVal, maxVal, skewness, kurtosis } = moments;
          const bucketWidth =
            Math.round(((maxVal - minVal) / numBuckets) * 1e6) / 1e6;
          const histogram = await generateHistogram(
            minVal,
            maxVal,
            groupFilter,
          );

          groups.push({
            groupKey,
            range: { min: minVal, max: maxVal },
            bucketWidth,
            skewness,
            kurtosis,
            histogram,
          });
        }

        // Build response with truncation indicators
        const response: Record<string, unknown> = {
          table: `${schema ?? "public"}.${table}`,
          column,
          groupBy,
          groups,
          count: groups.length,
        };

        // Add truncation indicators when groups are limited
        const groupsTruncated =
          effectiveGroupLimit !== undefined &&
          totalGroupCount > effectiveGroupLimit;
        if (groupsTruncated || !userProvidedGroupLimit) {
          response["truncated"] = groupsTruncated;
          response["totalGroupCount"] = totalGroupCount;
        }

        return response;
      }

      // Ungrouped distribution (existing logic)
      const moments = await computeMoments();
      if (moments === null) {
        return { error: "No data or all nulls in column" };
      }

      const { minVal, maxVal, skewness, kurtosis } = moments;
      const bucketWidth =
        Math.round(((maxVal - minVal) / numBuckets) * 1e6) / 1e6;
      const histogram = await generateHistogram(minVal, maxVal);

      return {
        table: `${schema ?? "public"}.${table}`,
        column,
        range: { min: minVal, max: maxVal },
        bucketWidth,
        skewness,
        kurtosis,
        histogram,
      };
    },
  };
}

/**
 * Hypothesis testing (t-test or z-test)
 */
export function createStatsHypothesisTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stats_hypothesis",
    description:
      "Perform one-sample t-test or z-test against a hypothesized mean. For z-test, provide populationStdDev (sigma) for accurate results. Use groupBy to test each group separately.",
    group: "stats",
    inputSchema: StatsHypothesisSchemaBase, // Base schema for MCP visibility
    outputSchema: HypothesisOutputSchema,
    annotations: readOnly("Hypothesis Testing"),
    icons: getToolIcons("stats", readOnly("Hypothesis Testing")),
    handler: async (params: unknown, _context: RequestContext) => {
      const {
        table,
        column,
        testType,
        hypothesizedMean,
        populationStdDev,
        schema,
        where,
        params: queryParams,
        groupBy,
      } = StatsHypothesisSchema.parse(params) as {
        table: string;
        column: string;
        testType: string;
        hypothesizedMean: number;
        populationStdDev?: number;
        groupBy?: string;
        schema?: string;
        where?: string;
        params?: unknown[];
      };

      const schemaName = schema ?? "public";
      const schemaPrefix = schema ? `"${schema}".` : "";
      const whereClause = where ? `WHERE ${where}` : "";

      // Validate column exists and is numeric
      await validateNumericColumn(adapter, table, column, schemaName);

      // Helper to calculate test results from row stats
      const calculateTestResults = (
        n: number,
        sampleMean: number,
        sampleStdDev: number,
      ):
        | {
            sampleSize: number;
            sampleMean: number;
            sampleStdDev: number;
            populationStdDev: number | null;
            standardError: number;
            testStatistic: number;
            pValue: number;
            degreesOfFreedom: number | null;
            interpretation: string;
            note: string;
          }
        | { error: string; sampleSize: number } => {
        if (n < 2 || isNaN(sampleStdDev) || sampleStdDev === 0) {
          return { error: "Insufficient data or zero variance", sampleSize: n };
        }

        let stddevUsed: number;
        let stddevNote: string | undefined;

        if (testType === "z_test") {
          if (populationStdDev !== undefined) {
            stddevUsed = populationStdDev;
          } else {
            stddevUsed = sampleStdDev;
            stddevNote =
              "No populationStdDev provided; using sample stddev (less accurate for z-test)";
          }
        } else {
          stddevUsed = sampleStdDev;
        }

        const standardError = stddevUsed / Math.sqrt(n);
        const testStatistic = (sampleMean - hypothesizedMean) / standardError;
        const degreesOfFreedom = n - 1;

        // Calculate p-value based on test type
        const pValue =
          testType === "z_test"
            ? calculateZTestPValue(testStatistic)
            : calculateTTestPValue(testStatistic, degreesOfFreedom);

        // Round p-value to 6 decimal places for cleaner output
        const pValueRounded = Math.round(pValue * 1e6) / 1e6;

        // Determine significance based on p-value
        let interpretation: string;
        if (pValueRounded < 0.001) {
          interpretation =
            "Highly significant (p < 0.001): Strong evidence against the null hypothesis";
        } else if (pValueRounded < 0.01) {
          interpretation =
            "Very significant (p < 0.01): Strong evidence against the null hypothesis";
        } else if (pValueRounded < 0.05) {
          interpretation =
            "Significant (p < 0.05): Evidence against the null hypothesis at α=0.05 level";
        } else if (pValueRounded < 0.1) {
          interpretation =
            "Marginally significant (p < 0.1): Weak evidence against the null hypothesis";
        } else {
          interpretation =
            "Not significant (p ≥ 0.1): Insufficient evidence to reject the null hypothesis";
        }

        // Build note with warnings
        let noteText =
          stddevNote ??
          "Two-tailed p-value calculated using numerical approximation";
        if (n < 30) {
          noteText =
            `Small sample size (n=${String(n)}): results may be less reliable. ` +
            noteText;
        }

        return {
          sampleSize: n,
          sampleMean,
          sampleStdDev,
          populationStdDev:
            testType === "z_test" ? (populationStdDev ?? null) : null,
          standardError,
          testStatistic,
          pValue: pValueRounded,
          degreesOfFreedom: testType === "t_test" ? degreesOfFreedom : null,
          interpretation,
          note: noteText,
        };
      };

      if (groupBy !== undefined) {
        // Grouped hypothesis tests
        const sql = `
                    SELECT 
                        "${groupBy}" as group_key,
                        COUNT("${column}") as n,
                        AVG("${column}")::numeric(20,6) as mean,
                        STDDEV_SAMP("${column}")::numeric(20,6) as stddev
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

        const groups = rows.map((row) => {
          const n = Number(row["n"]);
          const sampleMean = Number(row["mean"]);
          const sampleStdDev = Number(row["stddev"]);
          return {
            groupKey: row["group_key"],
            results: calculateTestResults(n, sampleMean, sampleStdDev),
          };
        });

        return {
          table: `${schema ?? "public"}.${table}`,
          column,
          testType,
          hypothesizedMean,
          groupBy,
          groups,
          count: groups.length,
        };
      }

      // Ungrouped hypothesis test
      const sql = `
                SELECT 
                    COUNT("${column}") as n,
                    AVG("${column}")::numeric(20,6) as mean,
                    STDDEV_SAMP("${column}")::numeric(20,6) as stddev
                FROM ${schemaPrefix}"${table}"
                ${whereClause}
            `;

      const result = await adapter.executeQuery(
        sql,
        ...(queryParams !== undefined && queryParams.length > 0
          ? [queryParams]
          : []),
      );
      const row = result.rows?.[0] as
        | { n: string | number; mean: string | number; stddev: string | number }
        | undefined;
      if (!row) return { error: "No data found" };

      const n = Number(row.n);
      const sampleMean = Number(row.mean);
      const sampleStdDev = Number(row.stddev);

      const testResults = calculateTestResults(n, sampleMean, sampleStdDev);

      // If error, return at top level (not nested in results)
      if ("error" in testResults) {
        return testResults;
      }

      return {
        table: `${schema ?? "public"}.${table}`,
        column,
        testType,
        hypothesizedMean,
        results: testResults,
      };
    },
  };
}

/**
 * Random sampling
 */
export function createStatsSamplingTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stats_sampling",
    description:
      "Get a random sample of rows. Use sampleSize for exact row count (any method), or percentage for approximate sampling with bernoulli/system methods.",
    group: "stats",
    inputSchema: StatsSamplingSchemaBase, // Base schema for MCP visibility
    outputSchema: SamplingOutputSchema,
    annotations: readOnly("Random Sampling"),
    icons: getToolIcons("stats", readOnly("Random Sampling")),
    handler: async (params: unknown, _context: RequestContext) => {
      const {
        table,
        method,
        sampleSize,
        percentage,
        schema,
        select,
        where,
        params: queryParams,
      } = StatsSamplingSchema.parse(params) as {
        table: string;
        method?: "random" | "bernoulli" | "system";
        sampleSize?: number;
        percentage?: number;
        schema?: string;
        select?: string[];
        where?: string;
        params?: unknown[];
      };

      const schemaName = schema ?? "public";

      // Validate table exists
      await validateTableExists(adapter, table, schemaName);

      const schemaPrefix = schema ? `"${schema}".` : "";
      const columns =
        select && select.length > 0
          ? select.map((c) => `"${c}"`).join(", ")
          : "*";
      const whereClause = where ? `WHERE ${where}` : "";
      const samplingMethod = method ?? "random";

      let sql: string;
      let note: string | undefined;

      // If sampleSize is provided, always use ORDER BY RANDOM() LIMIT n for exact counts
      // TABLESAMPLE BERNOULLI/SYSTEM are percentage-based and cannot guarantee exact row counts
      if (sampleSize !== undefined) {
        const limit = sampleSize;
        sql = `
                    SELECT ${columns}
                    FROM ${schemaPrefix}"${table}"
                    ${whereClause}
                    ORDER BY RANDOM()
                    LIMIT ${String(limit)}
                `;
        if (percentage !== undefined) {
          note = `sampleSize (${String(sampleSize)}) takes precedence over percentage (${String(percentage)}%). Using ORDER BY RANDOM() LIMIT for exact row count.`;
        } else if (samplingMethod !== "random") {
          note = `Using ORDER BY RANDOM() LIMIT for exact ${String(sampleSize)} row count. TABLESAMPLE ${samplingMethod.toUpperCase()} is percentage-based and cannot guarantee exact counts.`;
        }
      } else if (samplingMethod === "random") {
        // Default random sampling with default limit (20 to reduce LLM context usage)
        const limit = 20;
        sql = `
                    SELECT ${columns}
                    FROM ${schemaPrefix}"${table}"
                    ${whereClause}
                    ORDER BY RANDOM()
                    LIMIT ${String(limit)}
                `;
        if (percentage !== undefined) {
          note = `percentage (${String(percentage)}%) is ignored for random method. Use method:'bernoulli' or method:'system' for percentage-based sampling, or use sampleSize for exact row count.`;
        }
      } else {
        // TABLESAMPLE with percentage (approximate row count)
        // Apply default limit to prevent large payloads
        const pct = percentage ?? 10;
        const DEFAULT_TABLESAMPLE_LIMIT = 100;
        sql = `
                    SELECT ${columns}
                    FROM ${schemaPrefix}"${table}"
                    TABLESAMPLE ${samplingMethod.toUpperCase()}(${String(pct)})
                    ${whereClause}
                    LIMIT ${String(DEFAULT_TABLESAMPLE_LIMIT + 1)}
                `;
        // Add hint about system method unreliability for small tables
        const methodHint =
          samplingMethod === "system"
            ? " Consider using 'bernoulli' or 'random' method for more reliable results on small tables."
            : "";
        note = `TABLESAMPLE ${samplingMethod.toUpperCase()}(${String(pct)}%) returns approximately ${String(pct)}% of rows. Actual count varies based on table size and sampling algorithm.${methodHint}`;
      }

      const result = await adapter.executeQuery(
        sql,
        ...(queryParams !== undefined && queryParams.length > 0
          ? [queryParams]
          : []),
      );
      let rows = result.rows ?? [];

      // Check if we need to truncate due to default limit for TABLESAMPLE methods
      let truncated = false;
      let totalSampled: number | undefined;
      const DEFAULT_TABLESAMPLE_LIMIT = 100;
      if (
        sampleSize === undefined &&
        samplingMethod !== "random" &&
        rows.length > DEFAULT_TABLESAMPLE_LIMIT
      ) {
        totalSampled = rows.length;
        rows = rows.slice(0, DEFAULT_TABLESAMPLE_LIMIT);
        truncated = true;
      }

      const response: {
        table: string;
        method: string;
        sampleSize: number;
        rows: unknown[];
        truncated?: boolean;
        totalSampled?: number;
        note?: string;
      } = {
        table: `${schema ?? "public"}.${table}`,
        method: samplingMethod,
        sampleSize: rows.length,
        rows,
      };

      // Add truncation indicators if applicable
      if (truncated && totalSampled !== undefined) {
        response.truncated = truncated;
        response.totalSampled = totalSampled;
      }

      if (note !== undefined) {
        response.note = note;
      }

      // Add note if requested sampleSize exceeded available rows
      if (sampleSize !== undefined && rows.length < sampleSize) {
        const existingNote =
          response.note !== undefined ? response.note + " " : "";
        response.note =
          existingNote +
          `Requested ${String(sampleSize)} rows but only ${String(rows.length)} available.`;
      }

      return response;
    },
  };
}
