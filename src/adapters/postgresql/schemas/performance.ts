/**
 * postgres-mcp - Performance Tool Schemas
 *
 * Input validation schemas for query analysis and performance monitoring.
 */

import { z } from "zod";

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

export const IndexStatsSchema = z.preprocess(
  defaultToEmpty,
  z.object({
    table: z.string().optional().describe("Table name (all tables if omitted)"),
    schema: z.string().optional().describe("Schema name"),
  }),
);

export const TableStatsSchema = z.preprocess(
  defaultToEmpty,
  z.object({
    table: z.string().optional().describe("Table name (all tables if omitted)"),
    schema: z.string().optional().describe("Schema name"),
  }),
);

// =============================================================================
// Output Schemas
// =============================================================================

// Common schema for explain plan output
export const ExplainOutputSchema = z.object({
  plan: z.unknown().describe("Query execution plan"),
});

// Common paginated output with array + count
const PaginatedBase = {
  count: z.number().describe("Number of items returned"),
  totalCount: z
    .number()
    .optional()
    .describe("Total count if results truncated"),
  truncated: z.boolean().optional().describe("Whether results were truncated"),
};

// pg_index_stats
export const IndexStatsOutputSchema = z.object({
  indexes: z
    .array(z.record(z.string(), z.unknown()))
    .describe("Index statistics"),
  ...PaginatedBase,
});

// pg_table_stats
export const TableStatsOutputSchema = z.object({
  tables: z
    .array(z.record(z.string(), z.unknown()))
    .describe("Table statistics"),
  ...PaginatedBase,
});

// pg_stat_statements
export const StatStatementsOutputSchema = z.object({
  statements: z
    .array(z.record(z.string(), z.unknown()))
    .describe("Query statistics"),
  ...PaginatedBase,
});

// pg_stat_activity
export const StatActivityOutputSchema = z.object({
  connections: z
    .array(z.record(z.string(), z.unknown()))
    .describe("Active connections"),
  count: z.number().describe("Number of connections"),
});

// pg_locks
export const LocksOutputSchema = z.object({
  locks: z
    .array(z.record(z.string(), z.unknown()))
    .describe("Lock information"),
});

// pg_bloat_check
export const BloatCheckOutputSchema = z.object({
  tables: z
    .array(z.record(z.string(), z.unknown()))
    .describe("Tables with bloat"),
  count: z.number().describe("Number of tables with bloat"),
});

// pg_cache_hit_ratio
export const CacheHitRatioOutputSchema = z.object({
  heap_read: z.number().nullable().describe("Heap blocks read from disk"),
  heap_hit: z.number().nullable().describe("Heap blocks hit in cache"),
  cache_hit_ratio: z.number().nullable().describe("Cache hit ratio percentage"),
});

// pg_seq_scan_tables
export const SeqScanTablesOutputSchema = z.object({
  tables: z
    .array(z.record(z.string(), z.unknown()))
    .describe("Tables with sequential scans"),
  count: z.number().describe("Number of tables"),
  minScans: z.number().describe("Minimum scan threshold used"),
  hint: z.string().optional().describe("Recommendation hint"),
  totalCount: z
    .number()
    .optional()
    .describe("Total count if results truncated"),
  truncated: z.boolean().optional().describe("Whether results were truncated"),
});

// pg_index_recommendations
export const IndexRecommendationsOutputSchema = z.object({
  queryAnalysis: z.boolean().describe("Whether query was analyzed"),
  recommendations: z
    .array(z.record(z.string(), z.unknown()))
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
});

// pg_query_plan_compare
export const QueryPlanCompareOutputSchema = z.object({
  query1: z.record(z.string(), z.unknown()).describe("Query 1 plan metrics"),
  query2: z.record(z.string(), z.unknown()).describe("Query 2 plan metrics"),
  analysis: z.object({
    costDifference: z
      .number()
      .nullable()
      .describe("Cost difference between plans"),
    recommendation: z.string().describe("Comparison recommendation"),
  }),
  fullPlans: z.object({
    plan1: z.unknown().optional().describe("Full plan for query 1"),
    plan2: z.unknown().optional().describe("Full plan for query 2"),
  }),
});

// pg_performance_baseline
export const PerformanceBaselineOutputSchema = z.object({
  name: z.string().describe("Baseline name"),
  timestamp: z.string().describe("Capture timestamp"),
  metrics: z.object({
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
  }),
});

// pg_connection_pool_optimize
export const ConnectionPoolOptimizeOutputSchema = z.object({
  current: z
    .record(z.string(), z.unknown())
    .nullable()
    .describe("Current connection stats"),
  config: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Connection settings"),
  waitEvents: z
    .array(z.record(z.string(), z.unknown()))
    .describe("Wait event statistics"),
  recommendations: z.array(z.string()).describe("Optimization recommendations"),
});

// pg_partition_strategy_suggest
export const PartitionStrategySuggestOutputSchema = z.object({
  table: z.string().describe("Table analyzed"),
  tableStats: z
    .record(z.string(), z.unknown())
    .nullable()
    .describe("Table statistics"),
  tableSize: z
    .record(z.string(), z.unknown())
    .nullable()
    .describe("Table size info"),
  partitioningRecommended: z
    .boolean()
    .describe("Whether partitioning is recommended"),
  reason: z.string().describe("Reason for recommendation"),
  suggestions: z
    .array(
      z.object({
        strategy: z.string().describe("Partition strategy type"),
        column: z.string().describe("Recommended partition column"),
        reason: z.string().describe("Reason for suggestion"),
      }),
    )
    .describe("Partition strategy suggestions"),
  note: z.string().optional().describe("Additional guidance"),
});

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
});

// pg_duplicate_indexes
export const DuplicateIndexesOutputSchema = z.object({
  duplicateIndexes: z
    .array(z.record(z.string(), z.unknown()))
    .describe("Duplicate index pairs"),
  count: z.number().describe("Number of duplicate pairs"),
  hint: z.string().optional().describe("Guidance hint"),
  totalCount: z.number().optional().describe("Total pairs if truncated"),
  truncated: z.boolean().optional().describe("Whether results were truncated"),
});

// pg_vacuum_stats
export const VacuumStatsOutputSchema = z.object({
  tables: z
    .array(z.record(z.string(), z.unknown()))
    .describe("Vacuum statistics per table"),
  ...PaginatedBase,
});

// pg_query_plan_stats
export const QueryPlanStatsOutputSchema = z.object({
  queryPlanStats: z
    .array(z.record(z.string(), z.unknown()))
    .describe("Query plan statistics"),
  count: z.number().describe("Number of queries"),
  hint: z.string().optional().describe("Interpretation hint"),
  totalCount: z.number().optional().describe("Total if truncated"),
  truncated: z.boolean().optional().describe("Whether results were truncated"),
});
