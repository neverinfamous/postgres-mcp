/**
 * postgres-mcp - pg_stat_kcache Extension Schemas
 *
 * Input validation and output schemas for pg_stat_kcache tools.
 */

import { z } from "zod";
import { normalizeOptionalParams } from "./shared.js";

// =============================================================================
// Input Schemas
// =============================================================================

/**
 * Schema for querying enhanced statistics with kcache data.
 * Joins pg_stat_statements with pg_stat_kcache for full picture.
 */
export const KcacheQueryStatsSchemaBase = z.object({
  limit: z
    .number()
    .optional()
    .describe(
      "Maximum number of queries to return (default: 5, min: 1, max: 10).",
    ),
  orderBy: z
    .string()
    .optional()
    .describe(
      "Order results by metric (default: total_time). Valid: total_time, cpu_time, reads, writes",
    ),
  minCalls: z
    .number()
    .optional()
    .describe("Minimum call count to include"),
  queryPreviewLength: z
    .number()
    .optional()
    .describe(
      "Characters for query preview (default: 100, max: 500, 0 for full)",
    ),
  compact: z
    .boolean()
    .optional()
    .describe("If true, omits the query_preview text to save output tokens"),
});

export const KcacheQueryStatsSchema = z.preprocess(
  normalizeOptionalParams,
  KcacheQueryStatsSchemaBase,
);


/**
 * Base schema for MCP visibility - pg_kcache_top_cpu parameters.
 */
export const KcacheTopCpuSchemaBase = z.object({
  limit: z
    .number()
    .optional()
    .describe(
      "Number of top queries to return (default: 5, min: 1, max: 10).",
    ),
  queryPreviewLength: z
    .number()
    .optional()
    .describe(
      "Characters for query preview (default: 100, max: 500, 0 for full)",
    ),
  compact: z
    .boolean()
    .optional()
    .describe("If true, omits the query_preview text to save output tokens"),
});

/**
 * Base schema for MCP visibility - pg_kcache_top_io parameters.
 */
export const KcacheTopIoSchemaBase = z.object({
  type: z.string().optional().describe("I/O type to rank by (default: both)"),
  ioType: z.string().optional().describe("Alias for type"),
  limit: z
    .number()
    .optional()
    .describe(
      "Number of top queries to return (default: 5, min: 1, max: 10).",
    ),
  queryPreviewLength: z
    .number()
    .optional()
    .describe(
      "Characters for query preview (default: 100, max: 500, 0 for full)",
    ),
  compact: z
    .boolean()
    .optional()
    .describe("If true, omits the query_preview text to save output tokens"),
});

/**
 * Schema for database-level aggregation.
 */
export const KcacheDatabaseStatsSchemaBase = z.object({
  database: z
    .string()
    .optional()
    .describe("Database name (current database if omitted)"),
  compact: z
    .boolean()
    .optional()
    .describe("If true, omits 0/empty fields to save output tokens"),
});

export const KcacheDatabaseStatsSchema = z.preprocess(
  normalizeOptionalParams,
  KcacheDatabaseStatsSchemaBase,
);

/**
 * Schema for identifying resource-bound queries.
 */
export const KcacheResourceAnalysisSchemaBase = z.object({
  queryId: z
    .string()
    .optional()
    .describe("Specific query ID to analyze (all if omitted)"),
  threshold: z
    .number()
    .optional()
    .describe("CPU/IO ratio threshold for classification (default: 0.5)"),
  limit: z
    .number()
    .optional()
    .describe(
      "Maximum number of queries to return (default: 5, min: 1, max: 10).",
    ),
  minCalls: z
    .number()
    .optional()
    .describe("Minimum call count to include"),
  queryPreviewLength: z
    .number()
    .optional()
    .describe(
      "Characters for query preview (default: 100, max: 500, 0 for full)",
    ),
  compact: z
    .boolean()
    .optional()
    .describe("If true, omits the query_preview text to save output tokens"),
});

export const KcacheResourceAnalysisSchema = z.preprocess(
  normalizeOptionalParams,
  KcacheResourceAnalysisSchemaBase,
);

// =============================================================================
// Output Schemas
// =============================================================================

/**
 * Output schema for pg_kcache_create_extension
 */
export const KcacheCreateExtensionOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether extension was enabled"),
    message: z.string().optional().describe("Status message"),
    note: z.string().optional().describe("Additional note"),
    error: z.string().optional().describe("Error message"),
    hint: z.string().optional().describe("Helpful hint"),
  })
  .describe("pg_stat_kcache extension creation result");

/**
 * Output schema for pg_kcache_query_stats
 */
export const KcacheQueryStatsOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether query succeeded"),
    queries: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Query statistics with CPU/IO metrics"),
    count: z.number().optional().describe("Number of queries returned"),
    orderBy: z.string().optional().describe("Order by metric"),
    truncated: z.boolean().optional().describe("Results were truncated"),
    totalCount: z.number().optional().describe("Total available count"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Query statistics with OS-level metrics");

/**
 * Output schema for pg_kcache_top_cpu
 */
export const KcacheTopCpuOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether query succeeded"),
    topCpuQueries: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Top CPU-consuming queries"),
    count: z.number().optional().describe("Number of queries returned"),
    description: z.string().optional().describe("Result description"),
    truncated: z.boolean().optional().describe("Results were truncated"),
    totalCount: z.number().optional().describe("Total available count"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Top CPU-consuming queries result");

/**
 * Output schema for pg_kcache_top_io
 */
export const KcacheTopIoOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether query succeeded"),
    topIoQueries: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Top I/O-consuming queries"),
    count: z.number().optional().describe("Number of queries returned"),
    ioType: z
      .enum(["reads", "writes", "both"])
      .optional()
      .describe("I/O type ranked by"),
    description: z.string().optional().describe("Result description"),
    truncated: z.boolean().optional().describe("Results were truncated"),
    totalCount: z.number().optional().describe("Total available count"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Top I/O-consuming queries result");

/**
 * Output schema for pg_kcache_database_stats
 */
export const KcacheDatabaseStatsOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether query succeeded"),
    databaseStats: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Database-level statistics"),
    count: z.number().optional().describe("Number of databases"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Database-level aggregated statistics");

/**
 * Output schema for pg_kcache_resource_analysis
 */
export const KcacheResourceAnalysisOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether analysis succeeded"),
    queries: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Analyzed queries with resource classification"),
    count: z.number().optional().describe("Number of queries analyzed"),
    summary: z
      .object({
        cpuBound: z.number().describe("CPU-bound query count"),
        ioBound: z.number().describe("I/O-bound query count"),
        balanced: z.number().describe("Balanced query count"),
        threshold: z.number().describe("Classification threshold"),
      })
      .optional()
      .describe("Resource classification summary"),
    recommendations: z.array(z.string()).optional().describe("Recommendations"),
    truncated: z.boolean().optional().describe("Results were truncated"),
    totalCount: z.number().optional().describe("Total available count"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Resource classification analysis result");

/**
 * Output schema for pg_kcache_reset
 */
export const KcacheResetOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether reset succeeded"),
    message: z.string().optional().describe("Status message"),
    note: z.string().optional().describe("Additional note"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("pg_stat_kcache reset result");
