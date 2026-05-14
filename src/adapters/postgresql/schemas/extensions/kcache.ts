/**
 * postgres-mcp - pg_stat_kcache Extension Schemas
 *
 * Input validation and output schemas for pg_stat_kcache tools.
 */

import { z } from "zod";


// =============================================================================
// Input Schemas
// =============================================================================

/**
 * Schema for querying enhanced statistics with kcache data.
 * Joins pg_stat_statements with pg_stat_kcache for full picture.
 */
export const KcacheQueryStatsSchema = z.object({
  limit: z
    .unknown()
    .optional()
    .describe(
      "Maximum number of queries to return (default: 5, min: 1, max: 100).",
    ),
  dbname: z
    .unknown()
    .optional()
    .describe("Filter by database name"),
  username: z
    .unknown()
    .optional()
    .describe("Filter by username"),
  orderBy: z
    .unknown()
    .optional()
    .describe(
      "Order results by metric (default: total_time). Valid: total_time, cpu_time, reads, writes",
    ),
  minCalls: z
    .unknown()
    .optional()
    .describe("Minimum call count to include"),
  queryPreviewLength: z
    .unknown()
    .optional()
    .describe(
      "Characters for query preview (default: 100, max: 500, 0 for full)",
    ),
  compact: z
    .unknown()
    .optional()
    .describe("If true, omits 0/empty fields to save output tokens"),
});


/**
 * Base schema for MCP visibility - pg_kcache_top_cpu parameters.
 */
export const KcacheTopCpuSchema = z.object({
  limit: z
    .unknown()
    .optional()
    .describe(
      "Number of top queries to return (default: 5, min: 1, max: 100).",
    ),
  queryPreviewLength: z
    .unknown()
    .optional()
    .describe(
      "Characters for query preview (default: 100, max: 500, 0 for full)",
    ),
  compact: z
    .unknown()
    .optional()
    .describe("If true, omits 0/empty fields to save output tokens"),
});


/**
 * Base schema for MCP visibility - pg_kcache_top_io parameters.
 */
export const KcacheTopIoSchema = z.object({
  type: z.unknown().optional().describe("I/O type to rank by (default: both)"),
  ioType: z.unknown().optional().describe("Alias for type"),
  limit: z
    .unknown()
    .optional()
    .describe(
      "Number of top queries to return (default: 5, min: 1, max: 100).",
    ),
  queryPreviewLength: z
    .unknown()
    .optional()
    .describe(
      "Characters for query preview (default: 100, max: 500, 0 for full)",
    ),
  compact: z
    .unknown()
    .optional()
    .describe("If true, omits 0/empty fields to save output tokens"),
});


/**
 * Schema for database-level aggregation.
 */
export const KcacheDatabaseStatsSchema = z.object({
  database: z
    .unknown()
    .optional()
    .describe("Database name (all databases if omitted)"),
  compact: z
    .unknown()
    .optional()
    .describe("If true, omits 0/empty fields to save output tokens"),
});


/**
 * Schema for identifying resource-bound queries.
 */
export const KcacheResourceAnalysisSchema = z.object({
  queryId: z
    .unknown()
    .optional()
    .describe("Specific query ID to analyze (all if omitted)"),
  threshold: z
    .unknown()
    .optional()
    .describe("CPU/IO ratio threshold for classification (default: 0.5)"),
  limit: z
    .unknown()
    .optional()
    .describe(
      "Maximum number of queries to return (default: 5, min: 1, max: 100).",
    ),
  minCalls: z
    .unknown()
    .optional()
    .describe("Minimum call count to include"),
  queryPreviewLength: z
    .unknown()
    .optional()
    .describe(
      "Characters for query preview (default: 100, max: 500, 0 for full)",
    ),
  compact: z
    .unknown()
    .optional()
    .describe("If true, omits 0/empty fields to save output tokens"),
});

/**
 * Base schema for MCP visibility - pg_kcache_create_extension parameters.
 */
export const KcacheCreateExtensionSchema = z.object({});

/**
 * Base schema for MCP visibility - pg_kcache_reset parameters.
 */
export const KcacheResetSchema = z.object({});

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
    queries: z
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
    queries: z
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
    stats: z
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
