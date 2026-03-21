/**
 * postgres-mcp - Advanced Statistics Schemas
 *
 * Schemas for outlier detection, top-N, distinct, frequency, and summary tools.
 */

import { z } from "zod";
import { ErrorResponseFields } from "../error-response-fields.js";
import { preprocessBasicStatsParams } from "./preprocessing.js";
import { coerceNumber } from "../../../../utils/query-helpers.js";

// =============================================================================
// Base Schemas (for MCP visibility)
// =============================================================================

export const StatsOutliersSchemaBase = z.object({
  table: z.string().describe("Table name"),
  column: z.string().describe("Numeric column to analyze"),
  method: z
    .enum(["iqr", "zscore"])
    .optional()
    .describe("Detection method (default: iqr)"),
  threshold: z
    .number()
    .optional()
    .describe("IQR multiplier (default 1.5) or Z-score threshold (default 3)"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  where: z.string().optional().describe("Filter condition"),
  limit: z
    .preprocess(coerceNumber, z.number().optional())
    .describe("Maximum rows to scan (default: 10000)"),
  maxOutliers: z
    .preprocess(coerceNumber, z.number().optional())
    .describe(
      "Maximum outliers to return (default: 50). Reduces payload for large datasets.",
    ),
});

export const StatsTopNSchemaBase = z.object({
  table: z.string().describe("Table name"),
  column: z.string().describe("Column to rank by"),
  n: z
    .preprocess(coerceNumber, z.number().optional())
    .describe("Number of top values (default: 10)"),
  orderDirection: z
    .enum(["asc", "desc"])
    .optional()
    .describe("Sort direction (default: desc)"),
  selectColumns: z
    .array(z.string())
    .optional()
    .describe("Columns to include (default: auto-exclude long text)"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  where: z.string().optional().describe("Filter condition"),
});

export const StatsDistinctSchemaBase = z.object({
  table: z.string().describe("Table name"),
  column: z.string().describe("Column to get distinct values from"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  where: z.string().optional().describe("Filter condition"),
  limit: z
    .preprocess(coerceNumber, z.number().optional())
    .describe("Maximum values to return (default: 100)"),
});

export const StatsFrequencySchemaBase = z.object({
  table: z.string().describe("Table name"),
  column: z.string().describe("Column to count frequency"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  where: z.string().optional().describe("Filter condition"),
  limit: z
    .preprocess(coerceNumber, z.number().optional())
    .describe("Maximum frequency entries (default: 20)"),
});

export const StatsSummarySchemaBase = z.object({
  table: z.string().describe("Table name"),
  columns: z
    .array(z.string())
    .optional()
    .describe("Columns to summarize (default: all numeric)"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  where: z.string().optional().describe("Filter condition"),
});

// =============================================================================
// Preprocessed Schemas (for handler parsing with alias support)
// =============================================================================

export const StatsOutliersSchema = z.preprocess(
  preprocessBasicStatsParams,
  StatsOutliersSchemaBase,
);

export const StatsTopNSchema = z.preprocess(
  preprocessBasicStatsParams,
  StatsTopNSchemaBase,
);

export const StatsDistinctSchema = z.preprocess(
  preprocessBasicStatsParams,
  StatsDistinctSchemaBase,
);

export const StatsFrequencySchema = z.preprocess(
  preprocessBasicStatsParams,
  StatsFrequencySchemaBase,
);

export const StatsSummarySchema = z.preprocess(
  preprocessBasicStatsParams,
  StatsSummarySchemaBase,
);

// =============================================================================
// Output Schemas
// =============================================================================

const OutlierStatsSchema = z.union([
  z.object({
    mean: z.number().describe("Mean value"),
    stdDev: z.number().describe("Standard deviation"),
    lowerBound: z.number().describe("Lower bound"),
    upperBound: z.number().describe("Upper bound"),
  }),
  z.object({
    q1: z.number().describe("First quartile"),
    q3: z.number().describe("Third quartile"),
    iqr: z.number().describe("Interquartile range"),
    lowerBound: z.number().describe("Lower bound"),
    upperBound: z.number().describe("Upper bound"),
  }),
]);

export const StatsOutliersOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    method: z
      .string()
      .optional()
      .describe("Detection method used (iqr or zscore)"),
    stats: OutlierStatsSchema.optional().describe(
      "Statistical parameters used for detection",
    ),
    outlierCount: z.number().optional().describe("Number of outliers found"),
    totalRows: z.number().optional().describe("Total rows analyzed"),
    outliers: z
      .array(
        z.object({
          value: z.number().describe("Outlier value"),
          ctid: z.string().optional().describe("Row physical location"),
        }),
      )
      .optional()
      .describe("Detected outlier values"),
    truncated: z
      .boolean()
      .optional()
      .describe("Whether outlier list was truncated"),
    totalOutliers: z
      .number()
      .optional()
      .describe("Total outliers before truncation"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape)
  .describe("Outlier detection output");

export const StatsTopNOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    column: z.string().optional().describe("Column ranked by"),
    direction: z.string().optional().describe("Sort direction used"),
    count: z.number().optional().describe("Number of rows returned"),
    rows: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Top N rows"),
    hint: z
      .string()
      .optional()
      .describe("Hint about excluded columns"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape)
  .describe("Top N values output");

export const StatsDistinctOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    column: z.string().optional().describe("Column analyzed"),
    distinctCount: z.number().optional().describe("Number of distinct values"),
    values: z
      .array(z.unknown())
      .optional()
      .describe("Distinct values"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape)
  .describe("Distinct values output");

export const StatsFrequencyOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    column: z.string().optional().describe("Column analyzed"),
    distinctValues: z.number().optional().describe("Number of distinct values"),
    distribution: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Frequency distribution rows"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape)
  .describe("Frequency distribution output");

export const StatsSummaryOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    table: z.string().optional().describe("Table analyzed"),
    summaries: z
      .array(
        z.object({
          column: z.string().describe("Column name"),
          count: z.number().optional().describe("Non-null value count"),
          avg: z.number().nullable().optional().describe("Average value"),
          min: z.number().nullable().optional().describe("Minimum value"),
          max: z.number().nullable().optional().describe("Maximum value"),
          stddev: z.number().nullable().optional().describe("Standard deviation"),
          error: z.string().optional().describe("Error for non-numeric columns"),
        }),
      )
      .optional()
      .describe("Per-column summaries"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape)
  .describe("Summary statistics output");
