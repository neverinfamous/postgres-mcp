/**
 * postgres-mcp - Statistics Base Schemas
 *
 * Base Zod schemas for MCP visibility (input schema declarations).
 * These are the schemas exposed to agents — preprocessing is applied separately.
 */

import { z } from "zod";
import { coerceNumber } from "../../../../utils/query-helpers.js";

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
    .preprocess(coerceNumber, z.number().optional())
    .describe("Max time buckets to return (default: 100, 0 = no limit)"),
  groupBy: z.string().optional().describe("Column to group time series by"),
  groupLimit: z
    .preprocess(coerceNumber, z.number().optional())
    .describe(
      "Max number of groups when using groupBy (default: 20, 0 = no limit). Prevents large payloads with many groups",
    ),
});

export const StatsDistributionSchemaBase = z.object({
  table: z.string().describe("Table name"),
  column: z.string().describe("Numeric column"),
  buckets: z
    .preprocess(coerceNumber, z.number().optional())
    .describe("Number of histogram buckets (default: 10)"),
  schema: z.string().optional().describe("Schema name"),
  where: z.string().optional().describe("Filter condition"),
  params: z
    .array(z.unknown())
    .optional()
    .describe("Parameters for $1, $2 placeholders in where clause"),
  groupBy: z.string().optional().describe("Column to group distribution by"),
  groupLimit: z
    .preprocess(coerceNumber, z.number().optional())
    .describe(
      "Max number of groups when using groupBy (default: 20, 0 = no limit). Prevents large payloads with many groups",
    ),
});

export const StatsHypothesisSchemaBase = z.object({
  table: z.string().describe("Table name"),
  column: z.string().describe("Numeric column"),
  hypothesizedMean: z
    .preprocess(coerceNumber, z.number().optional())
    .describe("Hypothesized population mean (default: 0)"),
  populationStdDev: z
    .preprocess(coerceNumber, z.number().optional())
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
    .preprocess(coerceNumber, z.number().optional())
    .describe("Number of rows for random sampling (default: 100)"),
  percentage: z
    .preprocess(coerceNumber, z.number().optional())
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
