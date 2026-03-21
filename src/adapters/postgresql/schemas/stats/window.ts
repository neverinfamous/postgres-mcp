/**
 * postgres-mcp - Window Function Schemas
 *
 * Base, preprocessed, and output schemas for window function tools.
 */

import { z } from "zod";
import { ErrorResponseFields } from "../error-response-fields.js";
import { preprocessBasicStatsParams } from "./preprocessing.js";
import { coerceNumber } from "../../../../utils/query-helpers.js";

// =============================================================================
// Base Schemas (for MCP visibility)
// =============================================================================

export const StatsRowNumberSchemaBase = z.object({
  table: z.string().describe("Table name"),
  orderBy: z.string().describe("Column(s) to order by"),
  partitionBy: z.string().optional().describe("Column(s) to partition by"),
  selectColumns: z
    .array(z.string())
    .optional()
    .describe("Columns to include in result"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  where: z.string().optional().describe("Filter condition"),
  limit: z
    .preprocess(coerceNumber, z.number().optional())
    .describe("Maximum rows to return (default: 100)"),
});

export const StatsRankSchemaBase = z.object({
  table: z.string().describe("Table name"),
  orderBy: z.string().describe("Column(s) to order by (determines rank)"),
  partitionBy: z.string().optional().describe("Column(s) to partition by"),
  selectColumns: z
    .array(z.string())
    .optional()
    .describe("Columns to include in result"),
  rankType: z
    .enum(["rank", "dense_rank", "percent_rank"])
    .optional()
    .describe("Rank function type (default: rank)"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  where: z.string().optional().describe("Filter condition"),
  limit: z
    .preprocess(coerceNumber, z.number().optional())
    .describe("Maximum rows to return (default: 100)"),
});

export const StatsLagLeadSchemaBase = z.object({
  table: z.string().describe("Table name"),
  column: z.string().describe("Column to get lag/lead value from"),
  orderBy: z.string().describe("Column(s) to order by"),
  direction: z
    .enum(["lag", "lead"])
    .describe("LAG (previous row) or LEAD (next row)"),
  offset: z
    .preprocess(coerceNumber, z.number().optional())
    .describe("Number of rows to look back/ahead (default: 1)"),
  defaultValue: z
    .string()
    .optional()
    .describe("Default value if no row exists"),
  partitionBy: z.string().optional().describe("Column(s) to partition by"),
  selectColumns: z
    .array(z.string())
    .optional()
    .describe("Columns to include in result"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  where: z.string().optional().describe("Filter condition"),
  limit: z
    .preprocess(coerceNumber, z.number().optional())
    .describe("Maximum rows to return (default: 100)"),
});

export const StatsRunningTotalSchemaBase = z.object({
  table: z.string().describe("Table name"),
  column: z.string().describe("Numeric column to sum"),
  orderBy: z.string().describe("Column(s) to order by"),
  partitionBy: z
    .string()
    .optional()
    .describe("Reset running total for each partition"),
  selectColumns: z
    .array(z.string())
    .optional()
    .describe("Columns to include in result"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  where: z.string().optional().describe("Filter condition"),
  limit: z
    .preprocess(coerceNumber, z.number().optional())
    .describe("Maximum rows to return (default: 100)"),
});

export const StatsMovingAvgSchemaBase = z.object({
  table: z.string().describe("Table name"),
  column: z.string().describe("Numeric column to average"),
  orderBy: z.string().describe("Column(s) to order by"),
  windowSize: z
    .preprocess(coerceNumber, z.number().optional())
    .describe("Number of rows in the moving window"),
  partitionBy: z.string().optional().describe("Column(s) to partition by"),
  selectColumns: z
    .array(z.string())
    .optional()
    .describe("Columns to include in result"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  where: z.string().optional().describe("Filter condition"),
  limit: z
    .preprocess(coerceNumber, z.number().optional())
    .describe("Maximum rows to return (default: 100)"),
});

export const StatsNtileSchemaBase = z.object({
  table: z.string().describe("Table name"),
  orderBy: z.string().describe("Column(s) to order by"),
  buckets: z
    .preprocess(coerceNumber, z.number().optional())
    .describe("Number of buckets (e.g., 4 for quartiles)"),
  partitionBy: z.string().optional().describe("Column(s) to partition by"),
  selectColumns: z
    .array(z.string())
    .optional()
    .describe("Columns to include in result"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  where: z.string().optional().describe("Filter condition"),
  limit: z
    .preprocess(coerceNumber, z.number().optional())
    .describe("Maximum rows to return (default: 100)"),
});

// =============================================================================
// Preprocessed Schemas (for handler parsing with alias support)
// =============================================================================

export const StatsRowNumberSchema = z.preprocess(
  preprocessBasicStatsParams,
  StatsRowNumberSchemaBase,
);

export const StatsRankSchema = z.preprocess(
  preprocessBasicStatsParams,
  StatsRankSchemaBase,
);

export const StatsLagLeadSchema = z.preprocess(
  preprocessBasicStatsParams,
  StatsLagLeadSchemaBase,
);

export const StatsRunningTotalSchema = z.preprocess(
  preprocessBasicStatsParams,
  StatsRunningTotalSchemaBase,
);

export const StatsMovingAvgSchema = z.preprocess(
  preprocessBasicStatsParams,
  StatsMovingAvgSchemaBase,
);

export const StatsNtileSchema = z.preprocess(
  preprocessBasicStatsParams,
  StatsNtileSchemaBase,
);

// =============================================================================
// Output Schemas
// =============================================================================

export const WindowRowNumberOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    rowCount: z.number().optional().describe("Number of rows returned"),
    rows: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Result rows with row_number column"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape)
  .describe("Window ROW_NUMBER output");

export const WindowRankOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    rankType: z
      .string()
      .optional()
      .describe("Rank function used (rank, dense_rank, percent_rank)"),
    rowCount: z.number().optional().describe("Number of rows returned"),
    rows: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Result rows with rank column"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape)
  .describe("Window RANK output");

export const WindowLagLeadOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    direction: z
      .string()
      .optional()
      .describe("Direction used (lag or lead)"),
    offset: z.number().optional().describe("Offset used"),
    rowCount: z.number().optional().describe("Number of rows returned"),
    rows: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Result rows with lag/lead value column"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape)
  .describe("Window LAG/LEAD output");

export const WindowRunningTotalOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    valueColumn: z.string().optional().describe("Column being summed"),
    rowCount: z.number().optional().describe("Number of rows returned"),
    rows: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Result rows with running_total column"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape)
  .describe("Window running total output");

export const WindowMovingAvgOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    valueColumn: z.string().optional().describe("Column being averaged"),
    windowSize: z.number().optional().describe("Window size used"),
    rowCount: z.number().optional().describe("Number of rows returned"),
    rows: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Result rows with moving_avg column"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape)
  .describe("Window moving average output");

export const WindowNtileOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    buckets: z.number().optional().describe("Number of buckets used"),
    rowCount: z.number().optional().describe("Number of rows returned"),
    rows: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Result rows with ntile column"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape)
  .describe("Window NTILE output");
