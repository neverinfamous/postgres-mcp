/**
 * postgres-mcp - Statistics Tool Schemas
 *
 * Preprocessed input schemas for handler parsing.
 * Re-exports base schemas and preprocessing utilities from sub-modules.
 */

import { z } from "zod";

// Re-export base schemas and preprocessing for consumers
export {
  StatsDescriptiveSchemaBase,
  StatsPercentilesSchemaBase,
  StatsCorrelationSchemaBase,
  StatsRegressionSchemaBase,
  StatsTimeSeriesSchemaBase,
  StatsDistributionSchemaBase,
  StatsHypothesisSchemaBase,
  StatsSamplingSchemaBase,
  StatisticsObjectSchema,
} from "./base-schemas.js";

export {
  parseSchemaTable,
  VALID_INTERVALS,
  INTERVAL_SHORTHANDS,
  preprocessBasicStatsParams,
  preprocessCorrelationParams,
  preprocessRegressionParams,
  preprocessTimeSeriesParams,
  preprocessHypothesisParams,
  preprocessDistributionParams,
  preprocessSamplingParams,
} from "./preprocessing.js";

// Import for local use in preprocessed schema definitions
import {
  StatsDescriptiveSchemaBase,
  StatsPercentilesSchemaBase,
  StatsCorrelationSchemaBase,
  StatsRegressionSchemaBase,
  StatsTimeSeriesSchemaBase,
  StatsDistributionSchemaBase,
  StatsHypothesisSchemaBase,
  StatsSamplingSchemaBase,
} from "./base-schemas.js";

import {
  preprocessBasicStatsParams,
  preprocessCorrelationParams,
  preprocessRegressionParams,
  preprocessTimeSeriesParams,
  preprocessHypothesisParams,
  preprocessDistributionParams,
  preprocessSamplingParams,
} from "./preprocessing.js";

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
