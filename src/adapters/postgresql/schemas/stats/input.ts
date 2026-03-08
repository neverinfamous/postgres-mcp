/**
 * postgres-mcp - Statistics Tool Schemas
 *
 * Input validation schemas for statistical analysis tools.
 * Uses Split Schema pattern: Base schemas for MCP visibility, preprocessed schemas for handlers.
 */

import { z } from "zod";

// =============================================================================
// Schema.Table Parsing
// =============================================================================

/**
 * Parse schema.table format from table name.
 * Returns { table, schema } with schema extracted from prefix if present.
 * Embedded schema takes priority over explicit schema parameter.
 */
function parseSchemaTable(
  table: string,
  explicitSchema?: string,
): { table: string; schema: string } {
  if (table.includes(".")) {
    const parts = table.split(".");
    if (parts.length === 2 && parts[0] && parts[1]) {
      return {
        schema: parts[0],
        table: parts[1],
      };
    }
  }
  return { table, schema: explicitSchema ?? "public" };
}

// =============================================================================
// Parameter Preprocessing
// =============================================================================

/**
 * Valid interval units for time series analysis
 */
const VALID_INTERVALS = [
  "second",
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "year",
] as const;

/**
 * Interval shorthand mappings
 */
const INTERVAL_SHORTHANDS: Record<string, string> = {
  daily: "day",
  hourly: "hour",
  weekly: "week",
  monthly: "month",
  yearly: "year",
  minutely: "minute",
};

/**
 * Preprocess basic stats parameters to normalize common input patterns:
 * - tableName → table
 * - col → column
 * - Auto-normalize percentiles from 0-100 to 0-1 format
 * - Replace empty percentiles array with defaults
 */
function preprocessBasicStatsParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  const result = { ...(input as Record<string, unknown>) };
  // Alias: tableName → table
  if (result["tableName"] !== undefined && result["table"] === undefined) {
    result["table"] = result["tableName"];
  }
  // Alias: col → column
  if (result["col"] !== undefined && result["column"] === undefined) {
    result["column"] = result["col"];
  }
  // Alias: filter → where
  if (result["filter"] !== undefined && result["where"] === undefined) {
    result["where"] = result["filter"];
  }
  // Parse schema.table format (embedded schema takes priority)
  if (typeof result["table"] === "string" && result["table"].includes(".")) {
    const parsed = parseSchemaTable(
      result["table"],
      result["schema"] as string | undefined,
    );
    result["table"] = parsed.table;
    result["schema"] = parsed.schema;
  }
  // Handle percentiles: normalize 0-100 to 0-1 and replace empty array
  if (Array.isArray(result["percentiles"])) {
    if (result["percentiles"].length === 0) {
      // Empty array → use defaults
      result["percentiles"] = [0.25, 0.5, 0.75];
    } else {
      // Determine format: if ALL values are in 0-1, treat as already normalized
      // If ANY value > 1 (but <= 100), treat as 0-100 format and divide all by 100
      // If ANY value > 100, it's an error (will be caught by refine validation after normalization)
      const pctiles = result["percentiles"] as number[];
      const hasValuesInZeroToOne = pctiles.some(
        (p) => typeof p === "number" && p > 0 && p <= 1,
      );
      const hasValuesOver1 = pctiles.some(
        (p) => typeof p === "number" && p > 1,
      );
      const hasValuesOver100 = pctiles.some(
        (p) => typeof p === "number" && p > 100,
      );

      // Detect mixed scales: some values in 0-1 range and some in 1-100 range
      // This produces unexpected keys (e.g., [0.1, 50] → p0, p50 not p10, p50)
      if (hasValuesInZeroToOne && hasValuesOver1 && !hasValuesOver100) {
        result["_percentileScaleWarning"] =
          "Mixed percentile scales detected: some values appear to be in 0-1 format while others are in 0-100 format. " +
          "When max > 1, all values are treated as 0-100 scale. For example, [0.1, 50] produces p0 and p50, not p10 and p50. " +
          "Use consistent scale (all 0-1 or all 0-100) for expected results.";
      }

      if (hasValuesOver100) {
        // Leave as-is - will fail validation with clear error
      } else if (hasValuesOver1) {
        // Normalize 0-100 format to 0-1
        result["percentiles"] = pctiles.map((p) =>
          typeof p === "number" ? p / 100 : p,
        );
      }
      // else: already in 0-1 format, no change needed
    }
  }
  return result;
}

/**
 * Preprocess correlation parameters:
 * - tableName → table
 * - col1/col2 → column1/column2
 */
function preprocessCorrelationParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  const result = { ...(input as Record<string, unknown>) };
  // Alias: tableName → table
  if (result["tableName"] !== undefined && result["table"] === undefined) {
    result["table"] = result["tableName"];
  }
  // Alias: x → column1
  if (result["x"] !== undefined && result["column1"] === undefined) {
    result["column1"] = result["x"];
  }
  // Alias: y → column2
  if (result["y"] !== undefined && result["column2"] === undefined) {
    result["column2"] = result["y"];
  }
  // Alias: col1 → column1
  if (result["col1"] !== undefined && result["column1"] === undefined) {
    result["column1"] = result["col1"];
  }
  // Alias: col2 → column2
  if (result["col2"] !== undefined && result["column2"] === undefined) {
    result["column2"] = result["col2"];
  }
  // Alias: filter → where
  if (result["filter"] !== undefined && result["where"] === undefined) {
    result["where"] = result["filter"];
  }
  // Parse schema.table format (embedded schema takes priority)
  if (typeof result["table"] === "string" && result["table"].includes(".")) {
    const parsed = parseSchemaTable(
      result["table"],
      result["schema"] as string | undefined,
    );
    result["table"] = parsed.table;
    result["schema"] = parsed.schema;
  }
  return result;
}

/**
 * Preprocess regression parameters:
 * - tableName → table
 * - x → xColumn
 * - y → yColumn
 * - column1 → xColumn (for consistency with correlation)
 * - column2 → yColumn (for consistency with correlation)
 */
function preprocessRegressionParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  const result = { ...(input as Record<string, unknown>) };
  // Alias: tableName → table
  if (result["tableName"] !== undefined && result["table"] === undefined) {
    result["table"] = result["tableName"];
  }
  // Alias: x → xColumn
  if (result["x"] !== undefined && result["xColumn"] === undefined) {
    result["xColumn"] = result["x"];
  }
  // Alias: y → yColumn
  if (result["y"] !== undefined && result["yColumn"] === undefined) {
    result["yColumn"] = result["y"];
  }
  // Alias: column1 → xColumn (for consistency with correlation)
  if (result["column1"] !== undefined && result["xColumn"] === undefined) {
    result["xColumn"] = result["column1"];
  }
  // Alias: column2 → yColumn (for consistency with correlation)
  if (result["column2"] !== undefined && result["yColumn"] === undefined) {
    result["yColumn"] = result["column2"];
  }
  // Alias: filter → where
  if (result["filter"] !== undefined && result["where"] === undefined) {
    result["where"] = result["filter"];
  }
  // Parse schema.table format (embedded schema takes priority)
  if (typeof result["table"] === "string" && result["table"].includes(".")) {
    const parsed = parseSchemaTable(
      result["table"],
      result["schema"] as string | undefined,
    );
    result["table"] = parsed.table;
    result["schema"] = parsed.schema;
  }
  return result;
}

/**
 * Preprocess time series parameters:
 * - Extract interval unit from PostgreSQL-style intervals ('1 day' → 'day', '2 hours' → 'hour')
 * - Normalize to lowercase
 * - Handle shorthands: daily→day, hourly→hour, weekly→week, monthly→month
 * - Alias: column → valueColumn, time → timeColumn
 * - Alias: tableName → table
 * - Default interval to 'day' if not provided
 */
function preprocessTimeSeriesParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }

  const result = { ...(input as Record<string, unknown>) };

  // Alias: tableName → table
  if (result["tableName"] !== undefined && result["table"] === undefined) {
    result["table"] = result["tableName"];
  }

  // Alias: column → valueColumn
  if (result["column"] !== undefined && result["valueColumn"] === undefined) {
    result["valueColumn"] = result["column"];
  }

  // Alias: value → valueColumn
  if (result["value"] !== undefined && result["valueColumn"] === undefined) {
    result["valueColumn"] = result["value"];
  }

  // Alias: time → timeColumn
  if (result["time"] !== undefined && result["timeColumn"] === undefined) {
    result["timeColumn"] = result["time"];
  }

  // Alias: bucket → interval
  if (result["bucket"] !== undefined && result["interval"] === undefined) {
    result["interval"] = result["bucket"];
  }

  if (typeof result["interval"] === "string") {
    let interval = result["interval"].toLowerCase().trim();

    // Handle shorthands: daily → day, hourly → hour, etc.
    const shorthand = INTERVAL_SHORTHANDS[interval];
    if (shorthand !== undefined) {
      interval = shorthand;
    }

    // Extract unit from PostgreSQL-style interval: '1 day', '2 hours', etc.
    const match = /^\d+\s*(\w+?)s?$/.exec(interval);
    if (match?.[1] !== undefined) {
      interval = match[1];
    }

    // Handle plural forms: 'days' → 'day', 'hours' → 'hour'
    if (
      interval.endsWith("s") &&
      VALID_INTERVALS.includes(
        interval.slice(0, -1) as (typeof VALID_INTERVALS)[number],
      )
    ) {
      interval = interval.slice(0, -1);
    }

    result["interval"] = interval;
  } else if (result["interval"] === undefined) {
    // Default interval to 'day' if not provided
    result["interval"] = "day";
  }

  // Alias: filter → where
  if (result["filter"] !== undefined && result["where"] === undefined) {
    result["where"] = result["filter"];
  }

  // Parse schema.table format (embedded schema takes priority)
  if (typeof result["table"] === "string" && result["table"].includes(".")) {
    const parsed = parseSchemaTable(
      result["table"],
      result["schema"] as string | undefined,
    );
    result["table"] = parsed.table;
    result["schema"] = parsed.schema;
  }

  return result;
}

/**
 * Preprocess hypothesis test parameters:
 * - Normalize testType variants: 'ttest', 't-test', 'T_TEST' → 't_test'
 * - Default testType to 't_test' if not provided
 * - Alias: tableName → table, col → column
 */
function preprocessHypothesisParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }

  const result = { ...(input as Record<string, unknown>) };

  // Alias: tableName → table
  if (result["tableName"] !== undefined && result["table"] === undefined) {
    result["table"] = result["tableName"];
  }

  // Alias: col → column
  if (result["col"] !== undefined && result["column"] === undefined) {
    result["column"] = result["col"];
  }

  if (typeof result["testType"] === "string") {
    const normalized = result["testType"].toLowerCase().trim();

    // t_test variants: t, ttest, t-test, t_test, T_TEST
    if (normalized === "t" || /^t[-_]?test$/.test(normalized)) {
      result["testType"] = "t_test";
    }
    // z_test variants: z, ztest, z-test, z_test, Z_TEST
    else if (normalized === "z" || /^z[-_]?test$/.test(normalized)) {
      result["testType"] = "z_test";
    }
  } else if (result["testType"] === undefined) {
    // Auto-detect: if populationStdDev or sigma provided, default to z_test
    if (
      result["populationStdDev"] !== undefined ||
      result["sigma"] !== undefined
    ) {
      result["testType"] = "z_test";
    } else {
      // Default testType to 't_test' if not provided
      result["testType"] = "t_test";
    }
  }

  // Alias: filter → where
  if (result["filter"] !== undefined && result["where"] === undefined) {
    result["where"] = result["filter"];
  }

  // Parse schema.table format (embedded schema takes priority)
  if (typeof result["table"] === "string" && result["table"].includes(".")) {
    const parsed = parseSchemaTable(
      result["table"],
      result["schema"] as string | undefined,
    );
    result["table"] = parsed.table;
    result["schema"] = parsed.schema;
  }

  return result;
}

/**
 * Preprocess distribution parameters:
 * - Alias: tableName → table, col → column
 */
function preprocessDistributionParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  const result = { ...(input as Record<string, unknown>) };
  // Alias: tableName → table
  if (result["tableName"] !== undefined && result["table"] === undefined) {
    result["table"] = result["tableName"];
  }
  // Alias: col → column
  if (result["col"] !== undefined && result["column"] === undefined) {
    result["column"] = result["col"];
  }
  // Alias: filter → where
  if (result["filter"] !== undefined && result["where"] === undefined) {
    result["where"] = result["filter"];
  }
  // Parse schema.table format (embedded schema takes priority)
  if (typeof result["table"] === "string" && result["table"].includes(".")) {
    const parsed = parseSchemaTable(
      result["table"],
      result["schema"] as string | undefined,
    );
    result["table"] = parsed.table;
    result["schema"] = parsed.schema;
  }
  return result;
}

/**
 * Preprocess sampling parameters:
 * - Alias: tableName → table, columns → select
 */
function preprocessSamplingParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  const result = { ...(input as Record<string, unknown>) };
  // Alias: tableName → table
  if (result["tableName"] !== undefined && result["table"] === undefined) {
    result["table"] = result["tableName"];
  }
  // Alias: columns → select
  if (result["columns"] !== undefined && result["select"] === undefined) {
    result["select"] = result["columns"];
  }
  // Alias: filter → where
  if (result["filter"] !== undefined && result["where"] === undefined) {
    result["where"] = result["filter"];
  }
  // Parse schema.table format (embedded schema takes priority)
  if (typeof result["table"] === "string" && result["table"].includes(".")) {
    const parsed = parseSchemaTable(
      result["table"],
      result["schema"] as string | undefined,
    );
    result["table"] = parsed.table;
    result["schema"] = parsed.schema;
  }
  return result;
}

// =============================================================================
// Base Schemas (for MCP visibility)
// =============================================================================

export const StatsDescriptiveSchemaBase = z.object({
  table: z.string().describe("Table name"),
  column: z.string().describe("Numeric column to analyze"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  where: z.string().optional().describe("Filter condition"),
  params: z
    .array(z.unknown())
    .optional()
    .describe("Parameters for $1, $2 placeholders in where clause"),
  groupBy: z.string().optional().describe("Column to group statistics by"),
});

export const StatsPercentilesSchemaBase = z.object({
  table: z.string().describe("Table name"),
  column: z.string().describe("Numeric column"),
  percentiles: z
    .array(z.number())
    .optional()
    .describe(
      "Percentiles to calculate (0-1 range), default: [0.25, 0.5, 0.75]",
    ),
  schema: z.string().optional().describe("Schema name"),
  where: z.string().optional().describe("Filter condition"),
  params: z
    .array(z.unknown())
    .optional()
    .describe("Parameters for $1, $2 placeholders in where clause"),
  groupBy: z.string().optional().describe("Column to group percentiles by"),
});

export const StatsCorrelationSchemaBase = z.object({
  table: z.string().describe("Table name"),
  column1: z.string().optional().describe("First numeric column"),
  column2: z.string().optional().describe("Second numeric column"),
  x: z.string().optional().describe("Alias for column1"),
  y: z.string().optional().describe("Alias for column2"),
  schema: z.string().optional().describe("Schema name"),
  where: z.string().optional().describe("Filter condition"),
  params: z
    .array(z.unknown())
    .optional()
    .describe("Parameters for $1, $2 placeholders in where clause"),
  groupBy: z.string().optional().describe("Column to group correlation by"),
});

export const StatsRegressionSchemaBase = z.object({
  table: z.string().describe("Table name"),
  xColumn: z.string().optional().describe("Independent variable (X)"),
  yColumn: z.string().optional().describe("Dependent variable (Y)"),
  x: z.string().optional().describe("Alias for xColumn"),
  y: z.string().optional().describe("Alias for yColumn"),
  column1: z
    .string()
    .optional()
    .describe("Alias for xColumn (consistency with correlation)"),
  column2: z
    .string()
    .optional()
    .describe("Alias for yColumn (consistency with correlation)"),
  schema: z.string().optional().describe("Schema name"),
  where: z.string().optional().describe("Filter condition"),
  params: z
    .array(z.unknown())
    .optional()
    .describe("Parameters for $1, $2 placeholders in where clause"),
  groupBy: z.string().optional().describe("Column to group regression by"),
});

export const StatsTimeSeriesSchemaBase = z.object({
  table: z.string().describe("Table name"),
  valueColumn: z.string().optional().describe("Numeric column to aggregate"),
  timeColumn: z.string().optional().describe("Timestamp column"),
  value: z.string().optional().describe("Alias for valueColumn"),
  time: z.string().optional().describe("Alias for timeColumn"),
  interval: z
    .enum(["second", "minute", "hour", "day", "week", "month", "year"])
    .optional()
    .describe("Time bucket size (default: day)"),
  aggregation: z
    .enum(["sum", "avg", "min", "max", "count"])
    .optional()
    .describe("Aggregation function (default: avg)"),
  schema: z.string().optional().describe("Schema name"),
  where: z.string().optional().describe("Filter condition"),
  params: z
    .array(z.unknown())
    .optional()
    .describe("Parameters for $1, $2 placeholders in where clause"),
  limit: z
    .number()
    .optional()
    .describe("Max time buckets to return (default: 100, 0 = no limit)"),
  groupBy: z.string().optional().describe("Column to group time series by"),
  groupLimit: z
    .number()
    .optional()
    .describe(
      "Max number of groups when using groupBy (default: 20, 0 = no limit). Prevents large payloads with many groups",
    ),
});

export const StatsDistributionSchemaBase = z.object({
  table: z.string().describe("Table name"),
  column: z.string().describe("Numeric column"),
  buckets: z
    .number()
    .optional()
    .describe("Number of histogram buckets (default: 10)"),
  schema: z.string().optional().describe("Schema name"),
  where: z.string().optional().describe("Filter condition"),
  params: z
    .array(z.unknown())
    .optional()
    .describe("Parameters for $1, $2 placeholders in where clause"),
  groupBy: z.string().optional().describe("Column to group distribution by"),
  groupLimit: z
    .number()
    .optional()
    .describe(
      "Max number of groups when using groupBy (default: 20, 0 = no limit). Prevents large payloads with many groups",
    ),
});

export const StatsHypothesisSchemaBase = z.object({
  table: z.string().describe("Table name"),
  column: z.string().describe("Numeric column"),
  hypothesizedMean: z
    .number()
    .optional()
    .describe("Hypothesized population mean (default: 0)"),
  populationStdDev: z
    .number()
    .optional()
    .describe(
      "Known population standard deviation (if provided, uses z-test; otherwise uses t-test)",
    ),
  schema: z.string().optional().describe("Schema name"),
  where: z.string().optional().describe("Filter condition"),
  params: z
    .array(z.unknown())
    .optional()
    .describe("Parameters for $1, $2 placeholders in where clause"),
  groupBy: z.string().optional().describe("Column to group hypothesis test by"),
});

export const StatsSamplingSchemaBase = z.object({
  table: z.string().describe("Table name"),
  method: z
    .enum(["random", "bernoulli", "system"])
    .optional()
    .describe(
      "Sampling method (default: random). Note: system uses page-level sampling and may return 0 rows on small tables",
    ),
  sampleSize: z
    .number()
    .optional()
    .describe("Number of rows for random sampling (default: 100)"),
  percentage: z
    .number()
    .optional()
    .describe("Percentage for bernoulli/system sampling (0-100)"),
  schema: z.string().optional().describe("Schema name"),
  select: z.array(z.string()).optional().describe("Columns to select"),
  where: z.string().optional().describe("Filter condition"),
  params: z
    .array(z.unknown())
    .optional()
    .describe("Parameters for $1, $2 placeholders in where clause"),
});

// =============================================================================
// Preprocessed Schemas (for handler parsing with alias support)
// =============================================================================

export const StatsDescriptiveSchema = z.preprocess(
  preprocessBasicStatsParams,
  StatsDescriptiveSchemaBase,
);

export const StatsPercentilesSchema = z.preprocess(
  preprocessBasicStatsParams,
  StatsPercentilesSchemaBase.extend({
    _percentileScaleWarning: z
      .string()
      .optional()
      .describe("Internal: warning about mixed scales"),
  }).refine(
    (data) =>
      data.percentiles === undefined ||
      data.percentiles.every((p) => p >= 0 && p <= 1),
    {
      message: "All percentiles must be between 0 and 1",
      path: ["percentiles"],
    },
  ),
);

export const StatsCorrelationSchema = z.preprocess(
  preprocessCorrelationParams,
  StatsCorrelationSchemaBase.refine((data) => data.column1 !== undefined, {
    message: "column1 (or alias 'x') is required",
    path: ["column1"],
  }).refine((data) => data.column2 !== undefined, {
    message: "column2 (or alias 'y') is required",
    path: ["column2"],
  }),
);

export const StatsRegressionSchema = z.preprocess(
  preprocessRegressionParams,
  StatsRegressionSchemaBase.refine((data) => data.xColumn !== undefined, {
    message: "xColumn (or alias 'x' or 'column1') is required",
    path: ["xColumn"],
  }).refine((data) => data.yColumn !== undefined, {
    message: "yColumn (or alias 'y' or 'column2') is required",
    path: ["yColumn"],
  }),
);

export const StatsTimeSeriesSchema = z.preprocess(
  preprocessTimeSeriesParams,
  StatsTimeSeriesSchemaBase.extend({
    interval: z
      .enum(["second", "minute", "hour", "day", "week", "month", "year"])
      .describe("Time bucket size (default: day)"),
  })
    .refine((data) => data.valueColumn !== undefined, {
      message: "valueColumn (or alias 'value') is required",
      path: ["valueColumn"],
    })
    .refine((data) => data.timeColumn !== undefined, {
      message: "timeColumn (or alias 'time') is required",
      path: ["timeColumn"],
    }),
);

export const StatsDistributionSchema = z.preprocess(
  preprocessDistributionParams,
  StatsDistributionSchemaBase.refine(
    (data) => data.buckets === undefined || data.buckets > 0,
    {
      message: "buckets must be greater than 0",
      path: ["buckets"],
    },
  ),
);

export const StatsHypothesisSchema = z.preprocess(
  preprocessHypothesisParams,
  StatsHypothesisSchemaBase.extend({
    testType: z
      .enum(["t_test", "z_test"])
      .describe(
        "Type of hypothesis test: t_test or z_test (accepts shorthand: t, z, ttest, ztest)",
      ),
    mean: z.number().optional().describe("Alias for hypothesizedMean"),
    expected: z.number().optional().describe("Alias for hypothesizedMean"),
    sigma: z.number().optional().describe("Alias for populationStdDev"),
  })
    .transform((data) => ({
      table: data.table,
      column: data.column,
      testType: data.testType,
      hypothesizedMean:
        data.hypothesizedMean ?? data.mean ?? data.expected ?? 0,
      populationStdDev: data.populationStdDev ?? data.sigma,
      schema: data.schema,
      where: data.where,
      params: data.params, // Preserve params for parameterized WHERE clauses
      groupBy: data.groupBy,
    }))
    .refine(
      (data) => data.hypothesizedMean !== 0 || data.hypothesizedMean === 0,
      {
        // This allows 0 as a valid hypothesized mean - refinement always passes
        message: "hypothesizedMean (or mean/expected alias) is required",
      },
    )
    .refine(
      (data) =>
        data.populationStdDev === undefined || data.populationStdDev > 0,
      {
        message: "populationStdDev must be greater than 0",
        path: ["populationStdDev"],
      },
    ),
);

export const StatsSamplingSchema = z.preprocess(
  preprocessSamplingParams,
  StatsSamplingSchemaBase.refine(
    (data) => data.sampleSize === undefined || data.sampleSize > 0,
    {
      message: "sampleSize must be greater than 0",
      path: ["sampleSize"],
    },
  ).refine(
    (data) =>
      data.percentage === undefined ||
      (data.percentage >= 0 && data.percentage <= 100),
    {
      message: "percentage must be between 0 and 100",
      path: ["percentage"],
    },
  ),
);

// =============================================================================
// Output Schemas (for MCP structured content)
// =============================================================================

/**
 * Statistics object schema for descriptive stats
 */
export const StatisticsObjectSchema = z.object({
  count: z.number().describe("Number of non-null values"),
  min: z.number().nullable().describe("Minimum value"),
  max: z.number().nullable().describe("Maximum value"),
  avg: z.number().nullable().describe("Mean/average value"),
  stddev: z.number().nullable().describe("Standard deviation"),
  variance: z.number().nullable().describe("Variance"),
  sum: z.number().nullable().describe("Sum of all values"),
  mode: z.number().nullable().describe("Most frequent value"),
});
