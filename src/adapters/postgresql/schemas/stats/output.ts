/**
 * postgres-mcp - Statistics Output Schemas
 *
 * Output validation schemas for statistical analysis results.
 */

import { z } from "zod";

import { StatisticsObjectSchema } from "./input.js";

export const DescriptiveOutputSchema = z
  .object({
    table: z.string().optional().describe("Fully qualified table name"),
    column: z.string().optional().describe("Column analyzed"),
    groupBy: z.string().optional().describe("Grouping column (if grouped)"),
    groups: z
      .array(
        z.object({
          groupKey: z.unknown().describe("Group key value"),
          statistics: StatisticsObjectSchema,
        }),
      )
      .optional()
      .describe("Grouped statistics"),
    statistics: StatisticsObjectSchema.optional().describe(
      "Statistics (ungrouped)",
    ),
    count: z.number().optional().describe("Number of groups (if grouped)"),
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .describe("Descriptive statistics output");

/**
 * Output schema for pg_stats_percentiles
 */
export const PercentilesOutputSchema = z
  .object({
    table: z.string().optional().describe("Fully qualified table name"),
    column: z.string().optional().describe("Column analyzed"),
    groupBy: z.string().optional().describe("Grouping column (if grouped)"),
    groups: z
      .array(
        z.object({
          groupKey: z.unknown().describe("Group key value"),
          percentiles: z
            .record(z.string(), z.number().nullable())
            .describe("Percentile values"),
        }),
      )
      .optional()
      .describe("Grouped percentiles"),
    percentiles: z
      .record(z.string(), z.number().nullable())
      .optional()
      .describe("Percentile values (ungrouped)"),
    count: z.number().optional().describe("Number of groups (if grouped)"),
    warning: z
      .string()
      .optional()
      .describe("Scale warning if mixed scales detected"),
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .describe("Percentiles output");

/**
 * Output schema for pg_stats_correlation
 */
export const CorrelationOutputSchema = z
  .object({
    table: z.string().optional().describe("Fully qualified table name"),
    columns: z.array(z.string()).optional().describe("Columns analyzed"),
    groupBy: z.string().optional().describe("Grouping column (if grouped)"),
    groups: z
      .array(
        z.object({
          groupKey: z.unknown().describe("Group key value"),
          correlation: z
            .number()
            .nullable()
            .describe("Pearson correlation coefficient"),
          interpretation: z.string().describe("Human-readable interpretation"),
          covariancePopulation: z
            .number()
            .nullable()
            .describe("Population covariance"),
          covarianceSample: z.number().nullable().describe("Sample covariance"),
          sampleSize: z.number().describe("Number of data points"),
        }),
      )
      .optional()
      .describe("Grouped correlation results"),
    count: z.number().optional().describe("Number of groups (if grouped)"),
    note: z.string().optional().describe("Additional notes"),
    // Flattened correlation result fields for ungrouped results
    correlation: z
      .number()
      .nullable()
      .optional()
      .describe("Pearson correlation coefficient"),
    interpretation: z
      .string()
      .optional()
      .describe("Human-readable interpretation"),
    covariancePopulation: z
      .number()
      .nullable()
      .optional()
      .describe("Population covariance"),
    covarianceSample: z
      .number()
      .nullable()
      .optional()
      .describe("Sample covariance"),
    sampleSize: z.number().optional().describe("Number of data points"),
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .describe("Correlation analysis output");

/**
 * Regression result schema
 */
const RegressionResultSchema = z.object({
  slope: z.number().nullable().describe("Regression slope (m)"),
  intercept: z.number().nullable().describe("Y-intercept (b)"),
  rSquared: z.number().nullable().describe("Coefficient of determination (R²)"),
  equation: z.string().describe("Regression equation string"),
  avgX: z.number().nullable().describe("Average X value"),
  avgY: z.number().nullable().describe("Average Y value"),
  sampleSize: z.number().describe("Number of data points"),
});

/**
 * Output schema for pg_stats_regression
 */
export const RegressionOutputSchema = z
  .object({
    table: z.string().optional().describe("Fully qualified table name"),
    xColumn: z.string().optional().describe("Independent variable column"),
    yColumn: z.string().optional().describe("Dependent variable column"),
    groupBy: z.string().optional().describe("Grouping column (if grouped)"),
    groups: z
      .array(
        z.object({
          groupKey: z.unknown().describe("Group key value"),
          regression: RegressionResultSchema,
        }),
      )
      .optional()
      .describe("Grouped regression results"),
    regression: RegressionResultSchema.optional().describe(
      "Regression results (ungrouped)",
    ),
    count: z.number().optional().describe("Number of groups (if grouped)"),
    note: z.string().optional().describe("Additional notes"),
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .describe("Linear regression output");

/**
 * Time bucket schema
 */
const TimeBucketSchema = z.object({
  timeBucket: z.string().describe("Time bucket start (ISO 8601 string)"),
  value: z.number().describe("Aggregated value"),
  count: z.number().describe("Number of records in bucket"),
});

/**
 * Output schema for pg_stats_time_series
 */
export const TimeSeriesOutputSchema = z
  .object({
    table: z.string().optional().describe("Fully qualified table name"),
    valueColumn: z.string().optional().describe("Value column aggregated"),
    timeColumn: z.string().optional().describe("Time column used"),
    interval: z.string().optional().describe("Time bucket interval"),
    aggregation: z.string().optional().describe("Aggregation function used"),
    groupBy: z.string().optional().describe("Grouping column (if grouped)"),
    groups: z
      .array(
        z.object({
          groupKey: z.unknown().describe("Group key value"),
          buckets: z.array(TimeBucketSchema).describe("Time buckets for group"),
        }),
      )
      .optional()
      .describe("Grouped time series"),
    buckets: z
      .array(TimeBucketSchema)
      .optional()
      .describe("Time buckets (ungrouped)"),
    count: z.number().optional().describe("Number of groups or buckets"),
    truncated: z
      .boolean()
      .optional()
      .describe("Whether results were truncated"),
    totalCount: z
      .number()
      .optional()
      .describe("Total bucket count before truncation"),
    totalGroupCount: z
      .number()
      .optional()
      .describe("Total group count before truncation"),
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .describe("Time series analysis output");

/**
 * Histogram bucket schema
 */
const HistogramBucketSchema = z.object({
  bucket: z.number().describe("Bucket number"),
  frequency: z.number().describe("Number of values in bucket"),
  rangeMin: z.number().describe("Bucket range minimum"),
  rangeMax: z.number().describe("Bucket range maximum"),
});

/**
 * Output schema for pg_stats_distribution
 */
export const DistributionOutputSchema = z
  .object({
    table: z.string().optional().describe("Fully qualified table name"),
    column: z.string().optional().describe("Column analyzed"),
    groupBy: z.string().optional().describe("Grouping column (if grouped)"),
    groups: z
      .array(
        z.object({
          groupKey: z.unknown().describe("Group key value"),
          range: z.object({
            min: z.number().describe("Minimum value"),
            max: z.number().describe("Maximum value"),
          }),
          bucketWidth: z.number().describe("Width of each bucket"),
          skewness: z.number().nullable().describe("Distribution skewness"),
          kurtosis: z.number().nullable().describe("Distribution kurtosis"),
          histogram: z
            .array(HistogramBucketSchema)
            .describe("Histogram buckets"),
        }),
      )
      .optional()
      .describe("Grouped distributions"),
    range: z
      .object({
        min: z.number().describe("Minimum value"),
        max: z.number().describe("Maximum value"),
      })
      .optional()
      .describe("Value range (ungrouped)"),
    bucketWidth: z
      .number()
      .optional()
      .describe("Width of each bucket (ungrouped)"),
    skewness: z
      .number()
      .nullable()
      .optional()
      .describe("Distribution skewness (ungrouped)"),
    kurtosis: z
      .number()
      .nullable()
      .optional()
      .describe("Distribution kurtosis (ungrouped)"),
    histogram: z
      .array(HistogramBucketSchema)
      .optional()
      .describe("Histogram (ungrouped)"),
    count: z.number().optional().describe("Number of groups (if grouped)"),
    truncated: z.boolean().optional().describe("Whether groups were truncated"),
    totalGroupCount: z
      .number()
      .optional()
      .describe("Total group count before truncation"),
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if no data"),
  })
  .describe("Distribution analysis output");

/**
 * Hypothesis test result schema
 */
const HypothesisResultSchema = z.object({
  sampleSize: z.number().describe("Number of samples"),
  sampleMean: z.number().optional().describe("Sample mean"),
  sampleStdDev: z.number().optional().describe("Sample standard deviation"),
  populationStdDev: z
    .number()
    .nullable()
    .optional()
    .describe("Population std dev (z-test)"),
  standardError: z.number().optional().describe("Standard error of the mean"),
  testStatistic: z.number().optional().describe("Test statistic (t or z)"),
  pValue: z.number().optional().describe("Two-tailed p-value"),
  degreesOfFreedom: z
    .number()
    .nullable()
    .optional()
    .describe("Degrees of freedom (t-test)"),
  interpretation: z.string().optional().describe("Significance interpretation"),
  note: z.string().optional().describe("Additional notes or warnings"),
  error: z.string().optional().describe("Error message if failed"),
});

/**
 * Output schema for pg_stats_hypothesis
 */
export const HypothesisOutputSchema = z
  .object({
    table: z.string().optional().describe("Fully qualified table name"),
    column: z.string().optional().describe("Column analyzed"),
    testType: z.string().optional().describe("Type of test performed"),
    hypothesizedMean: z
      .number()
      .optional()
      .describe("Hypothesized population mean"),
    groupBy: z.string().optional().describe("Grouping column (if grouped)"),
    groups: z
      .array(
        z.object({
          groupKey: z.unknown().describe("Group key value"),
          results: HypothesisResultSchema,
        }),
      )
      .optional()
      .describe("Grouped hypothesis test results"),
    results: HypothesisResultSchema.optional().describe(
      "Test results (ungrouped)",
    ),
    count: z.number().optional().describe("Number of groups (if grouped)"),
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
    sampleSize: z.number().optional().describe("Sample size (for error case)"),
  })
  .describe("Hypothesis test output");

/**
 * Output schema for pg_stats_sampling
 */
export const SamplingOutputSchema = z
  .object({
    table: z.string().optional().describe("Fully qualified table name"),
    method: z.string().optional().describe("Sampling method used"),
    sampleSize: z.number().optional().describe("Number of rows returned"),
    rows: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Sampled rows"),
    truncated: z
      .boolean()
      .optional()
      .describe("Whether results were truncated"),
    totalSampled: z
      .number()
      .optional()
      .describe("Total sampled before truncation"),
    note: z.string().optional().describe("Additional notes about sampling"),
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .describe("Random sampling output");
