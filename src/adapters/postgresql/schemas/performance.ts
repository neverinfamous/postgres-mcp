/**
 * postgres-mcp - Performance Tool Schemas
 *
 * Input validation schemas for query analysis and performance monitoring.
 */

import { z } from "zod";
import { ErrorResponseFields } from "./error-response-fields.js";

// Helper to handle undefined params (allows tools to be called without {})
const defaultToEmpty = (val: unknown): unknown => val ?? {};

/**
 * Preprocess explain params to normalize aliases.
 * Exported so tools can apply it in their handlers.
 */
export function preprocessExplainParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  const result = { ...(input as Record<string, unknown>) };

  // Alias: query → sql
  if (result["query"] !== undefined && result["sql"] === undefined) {
    result["sql"] = result["query"];
  }

  return result;
}

// =============================================================================
// Base Schema (for MCP inputSchema visibility - no preprocess)
// =============================================================================

/**
 * Base schema for EXPLAIN tools - used for MCP inputSchema visibility.
 * Both sql and query are optional here; the preprocessor maps query → sql,
 * and the handler validates that at least one is provided.
 */
export const ExplainSchemaBase = z.object({
  sql: z.string().optional().describe("Query to explain"),
  query: z.string().optional().describe("Alias for sql"),
  params: z.array(z.unknown()).optional().describe("Query parameters"),
  analyze: z.boolean().optional().describe("Run EXPLAIN ANALYZE"),
  buffers: z.boolean().optional().describe("Include buffer usage"),
  format: z
    .enum(["text", "json", "xml", "yaml"])
    .optional()
    .describe("Output format"),
});

// =============================================================================
// Full Schema (with preprocess - for handler parsing)
// =============================================================================

/**
 * Full schema with preprocessing for alias support.
 * Used in handler to parse params after MCP has collected them.
 */
export const ExplainSchema = z.preprocess(
  preprocessExplainParams,
  ExplainSchemaBase,
);

export const IndexStatsSchemaBase = z.object({
  table: z.string().optional().describe("Table name (all tables if omitted)"),
  schema: z.string().optional().describe("Schema name"),
});

export const IndexStatsSchema = z.preprocess(
  defaultToEmpty,
  IndexStatsSchemaBase,
);

export const TableStatsSchemaBase = z.object({
  table: z.string().optional().describe("Table name (all tables if omitted)"),
  schema: z.string().optional().describe("Schema name"),
});

export const TableStatsSchema = z.preprocess(
  defaultToEmpty,
  TableStatsSchemaBase,
);

// =============================================================================
// Output Schemas
// =============================================================================

// Common schema for explain plan output
export const ExplainOutputSchema = z.object({
  plan: z.unknown().optional().describe("Query execution plan"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

// Common paginated output with array + count
const PaginatedBase = {
  count: z.number().optional().describe("Number of items returned"),
  totalCount: z
    .number()
    .optional()
    .describe("Total count if results truncated"),
  truncated: z.boolean().optional().describe("Whether results were truncated"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
};

// pg_index_stats
export const IndexStatsOutputSchema = z.object({
  indexes: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Index statistics"),
  count: z.number().optional().describe("Number of items returned"),
  totalCount: z
    .number()
    .optional()
    .describe("Total count if results truncated"),
  truncated: z.boolean().optional().describe("Whether results were truncated"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

// pg_table_stats
export const TableStatsOutputSchema = z.object({
  tables: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Table statistics"),
  count: z.number().optional().describe("Number of items returned"),
  totalCount: z
    .number()
    .optional()
    .describe("Total count if results truncated"),
  truncated: z.boolean().optional().describe("Whether results were truncated"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

// pg_stat_statements
export const StatStatementsOutputSchema = z.object({
  statements: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Query statistics"),
  ...PaginatedBase,
}).extend(ErrorResponseFields.shape);

// pg_stat_activity
export const StatActivityOutputSchema = z.object({
  connections: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Active connections"),
  count: z.number().optional().describe("Number of connections"),
  backgroundWorkers: z
    .number()
    .optional()
    .describe("Number of filtered background worker processes"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

// pg_locks
export const LocksOutputSchema = z.object({
  locks: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Lock information"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

// pg_bloat_check
export const BloatCheckOutputSchema = z.object({
  tables: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Tables with bloat"),
  count: z.number().optional().describe("Number of tables with bloat"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

// pg_cache_hit_ratio
export const CacheHitRatioOutputSchema = z.object({
  heap_read: z
    .number()
    .nullable()
    .optional()
    .describe("Heap blocks read from disk"),
  heap_hit: z
    .number()
    .nullable()
    .optional()
    .describe("Heap blocks hit in cache"),
  cache_hit_ratio: z
    .number()
    .nullable()
    .optional()
    .describe("Cache hit ratio percentage"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

// pg_seq_scan_tables
export const SeqScanTablesOutputSchema = z.object({
  tables: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Tables with sequential scans"),
  count: z.number().optional().describe("Number of tables"),
  minScans: z.number().optional().describe("Minimum scan threshold used"),
  hint: z.string().optional().describe("Recommendation hint"),
  totalCount: z
    .number()
    .optional()
    .describe("Total count if results truncated"),
  truncated: z.boolean().optional().describe("Whether results were truncated"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

// pg_index_recommendations
export const IndexRecommendationsOutputSchema = z.object({
  queryAnalysis: z.boolean().optional().describe("Whether query was analyzed"),
  recommendations: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Index recommendations"),
  hypopgAvailable: z
    .boolean()
    .optional()
    .describe("HypoPG extension available"),
  baselineCost: z
    .number()
    .nullable()
    .optional()
    .describe("Baseline query cost"),
  hint: z.string().optional().describe("Recommendation hint"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

// pg_query_plan_compare
export const QueryPlanCompareOutputSchema = z.object({
  query1: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Query 1 plan metrics"),
  query2: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Query 2 plan metrics"),
  analysis: z
    .object({
      costDifference: z
        .number()
        .nullable()
        .describe("Cost difference between plans"),
      recommendation: z.string().describe("Comparison recommendation"),
    })
    .optional()
    .describe("Plan comparison analysis"),
  fullPlans: z
    .object({
      plan1: z.unknown().optional().describe("Full plan for query 1"),
      plan2: z.unknown().optional().describe("Full plan for query 2"),
    })
    .optional()
    .describe("Full execution plans"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

// pg_performance_baseline
export const PerformanceBaselineOutputSchema = z.object({
  name: z.string().optional().describe("Baseline name"),
  timestamp: z.string().optional().describe("Capture timestamp"),
  metrics: z
    .object({
      cache: z
        .record(z.string(), z.unknown())
        .nullable()
        .describe("Cache metrics"),
      tables: z
        .record(z.string(), z.unknown())
        .nullable()
        .describe("Table metrics"),
      indexes: z
        .record(z.string(), z.unknown())
        .nullable()
        .describe("Index metrics"),
      connections: z
        .record(z.string(), z.unknown())
        .nullable()
        .describe("Connection metrics"),
      databaseSize: z
        .record(z.string(), z.unknown())
        .nullable()
        .describe("Database size"),
    })
    .optional(),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

// pg_connection_pool_optimize
export const ConnectionPoolOptimizeOutputSchema = z.object({
  current: z
    .record(z.string(), z.unknown())
    .nullable()
    .optional()
    .describe("Current connection stats"),
  config: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Connection settings"),
  waitEvents: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Wait event statistics"),
  recommendations: z
    .array(z.string())
    .optional()
    .describe("Optimization recommendations"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

// pg_partition_strategy_suggest
export const PartitionStrategySuggestOutputSchema = z.object({
  table: z.string().optional().describe("Table analyzed"),
  tableStats: z
    .record(z.string(), z.unknown())
    .nullable()
    .optional()
    .describe("Table statistics"),
  tableSize: z
    .record(z.string(), z.unknown())
    .nullable()
    .optional()
    .describe("Table size info"),
  partitioningRecommended: z
    .boolean()
    .optional()
    .describe("Whether partitioning is recommended"),
  reason: z.string().optional().describe("Reason for recommendation"),
  suggestions: z
    .array(
      z.object({
        strategy: z.string().describe("Partition strategy type"),
        column: z.string().describe("Recommended partition column"),
        reason: z.string().describe("Reason for suggestion"),
      }),
    )
    .optional()
    .describe("Partition strategy suggestions"),
  note: z.string().optional().describe("Additional guidance"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

// pg_unused_indexes (supports both summary and list modes)
export const UnusedIndexesOutputSchema = z.object({
  unusedIndexes: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Unused indexes"),
  summary: z.boolean().optional().describe("Summary mode indicator"),
  bySchema: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Summary by schema"),
  totalCount: z.number().optional().describe("Total unused indexes"),
  totalSizeBytes: z.number().optional().describe("Total size in bytes"),
  count: z.number().optional().describe("Number of indexes returned"),
  hint: z.string().optional().describe("Guidance hint"),
  truncated: z.boolean().optional().describe("Whether results were truncated"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

// pg_duplicate_indexes
export const DuplicateIndexesOutputSchema = z.object({
  duplicateIndexes: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Duplicate index pairs"),
  count: z.number().optional().describe("Number of duplicate pairs"),
  hint: z.string().optional().describe("Guidance hint"),
  totalCount: z.number().optional().describe("Total pairs if truncated"),
  truncated: z.boolean().optional().describe("Whether results were truncated"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

// pg_vacuum_stats
export const VacuumStatsOutputSchema = z.object({
  tables: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Vacuum statistics per table"),
  count: z.number().optional().describe("Number of items returned"),
  totalCount: z
    .number()
    .optional()
    .describe("Total count if results truncated"),
  truncated: z.boolean().optional().describe("Whether results were truncated"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

// pg_query_plan_stats
export const QueryPlanStatsOutputSchema = z.object({
  queryPlanStats: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Query plan statistics"),
  count: z.number().optional().describe("Number of queries"),
  hint: z.string().optional().describe("Interpretation hint"),
  totalCount: z.number().optional().describe("Total if truncated"),
  truncated: z.boolean().optional().describe("Whether results were truncated"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);
