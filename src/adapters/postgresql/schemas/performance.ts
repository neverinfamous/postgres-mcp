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
 * P507: Coerce string-typed numbers to actual numbers for z.preprocess().
 * Returns undefined for non-numeric strings so .optional() defaults kick in.
 * Prevents NaN leaking into SQL via z.coerce.number().
 */
const coerceNumber = (val: unknown): unknown =>
  typeof val === "string"
    ? isNaN(Number(val))
      ? undefined
      : Number(val)
    : val;

/**
 * Preprocess explain params to normalize aliases.
 * Exported so tools can apply it in their handlers.
 */
export function preprocessExplainParams(input: unknown): unknown {
  const normalized = input ?? {};
  if (typeof normalized !== "object" || normalized === null) {
    return normalized;
  }
  const result = { ...(normalized as Record<string, unknown>) };

  // Alias: query → sql
  if (result["query"] !== undefined && result["sql"] === undefined) {
    result["sql"] = result["query"];
  }

  return result;
}

/**
 * Preprocess table params to normalize aliases.
 * Exported so tools can apply it in their handlers.
 */
export function preprocessTableAliasParams(input: unknown): unknown {
  const normalized = input ?? {};
  if (typeof normalized !== "object" || normalized === null) {
    return normalized;
  }
  const result = { ...(normalized as Record<string, unknown>) };

  // Alias: tableName, name → table
  if (result["tableName"] !== undefined && result["table"] === undefined) {
    result["table"] = result["tableName"];
  } else if (result["name"] !== undefined && result["table"] === undefined) {
    result["table"] = result["name"];
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
  tableName: z.string().optional().describe("Alias for table"),
  name: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name"),
  limit: z
    .unknown()
    .optional()
    .describe("Max rows to return (default: 10, max: 100, use 0 for max 100)"),
});

export const IndexStatsSchema = z.preprocess((input) => {
  const tableMapped = preprocessTableAliasParams(input);
  return defaultToEmpty(tableMapped);
}, z.object({
    table: z.string().optional(),
    schema: z.string().optional(),
    limit: z.preprocess(coerceNumber, z.number().optional()),
  })
);

export const TableStatsSchemaBase = z.object({
  table: z.string().optional().describe("Table name (all tables if omitted)"),
  tableName: z.string().optional().describe("Alias for table"),
  name: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name"),
  limit: z
    .unknown()
    .optional()
    .describe("Max rows to return (default: 10, max: 100, use 0 for max 100)"),
});

export const TableStatsSchema = z.preprocess((input) => {
  const tableMapped = preprocessTableAliasParams(input);
  return defaultToEmpty(tableMapped);
}, z.object({
    table: z.string().optional(),
    schema: z.string().optional(),
    limit: z.preprocess(coerceNumber, z.number().optional()),
  })
);

export const VacuumStatsSchemaBase = z.object({
  schema: z.string().optional().describe("Schema to filter"),
  table: z.string().optional().describe("Table name to filter"),
  limit: z
    .unknown()
    .optional()
    .describe("Max rows to return (default: 10, max: 100, use 0 for max 100)"),
});

export const VacuumStatsSchema = z.preprocess(
  defaultToEmpty,
  z.object({
    schema: z.string().optional(),
    table: z.string().optional(),
    limit: z.preprocess(coerceNumber, z.number().optional()),
  }),
);

export const StatStatementsSchemaBase = z.object({
  limit: z
    .unknown()
    .optional()
    .describe(
      "Max statements to return (default: 10, max: 50, use 0 for max 50)",
    ),
  orderBy: z.string().optional().describe("Sort order (default: total_time)"),
  truncateQuery: z
    .unknown()
    .optional()
    .describe("Max query length in chars (default: 100, use 0 for full text)"),
});

export const StatStatementsSchema = z.preprocess(
  defaultToEmpty,
  z.object({
    limit: z.preprocess(coerceNumber, z.number().optional()),
    orderBy: z.string().optional(),
    truncateQuery: z.preprocess(coerceNumber, z.number().optional()),
  }),
);

export const StatActivitySchemaBase = z.object({
  includeIdle: z
    .unknown()
    .optional()
    .describe("Include idle connections (default: false)"),
  truncateQuery: z
    .unknown()
    .optional()
    .describe("Max query length in chars (default: 100, use 0 for full text)"),
  limit: z
    .unknown()
    .optional()
    .describe("Max connections to return (default: 100, use 0 for all)"),
});

export const StatActivitySchema = z.preprocess(
  defaultToEmpty,
  z.object({
    includeIdle: z.boolean().optional(),
    truncateQuery: z.preprocess(coerceNumber, z.number().optional()),
    limit: z.preprocess(coerceNumber, z.number().optional()),
  }),
);

export const QueryPlanStatsSchemaBase = z.object({
  limit: z
    .unknown()
    .optional()
    .describe(
      "Number of queries to return (default: 10, max: 50, use 0 for max 50)",
    ),
  truncateQuery: z
    .unknown()
    .optional()
    .describe("Max query length in chars (default: 100, use 0 for full text)"),
});

export const QueryPlanStatsSchema = z.preprocess(
  defaultToEmpty,
  z.object({
    limit: z.preprocess(coerceNumber, z.number().optional()),
    truncateQuery: z.preprocess(coerceNumber, z.number().optional()),
  }),
);

export const LocksSchemaBase = z.object({
  showBlocked: z
    .unknown()
    .optional()
    .describe("Show only blocked queries (default: false)"),
  limit: z
    .unknown()
    .optional()
    .describe("Max locks to return (default: 100, use 0 for all)"),
});

export const LocksSchema = z.preprocess(
  defaultToEmpty,
  z.object({
    showBlocked: z.boolean().optional(),
    limit: z.preprocess(coerceNumber, z.number().optional()),
  }),
);

export const BloatCheckSchemaBase = z.object({
  table: z
    .string()
    .optional()
    .describe("Table name to check (all tables if omitted)"),
  schema: z.string().optional().describe("Schema name to filter"),
  limit: z
    .unknown()
    .optional()
    .describe("Max rows to return (default: 20, use 0 for all)"),
});

export const BloatCheckSchema = z.preprocess(
  defaultToEmpty,
  z.object({
    table: z.string().optional(),
    schema: z.string().optional(),
    limit: z.preprocess(coerceNumber, z.number().optional()),
  }),
);

export const CacheHitRatioInputSchema = z.object({});

export const DiagnoseInputSchemaBase = z.object({
  schema: z
    .unknown()
    .optional()
    .describe("Filter top tables to a specific schema"),
  topN: z
    .unknown()
    .optional()
    .describe("Number of top tables to return (default: 5, max: 100)"),
});

export const DiagnoseInputSchema = z.preprocess(
  defaultToEmpty,
  z.object({
    schema: z.string().optional(),
    topN: z.preprocess(coerceNumber, z.number().optional()),
  }),
);

export const SeqScanTablesSchemaBase = z.object({
  minScans: z
    .unknown()
    .optional()
    .describe("Minimum seq scans to include (default: 10)"),
  schema: z.string().optional().describe("Schema to filter"),
  limit: z
    .unknown()
    .optional()
    .describe("Max rows to return (default: 50, use 0 for all)"),
});

export const SeqScanTablesSchema = z.preprocess(
  defaultToEmpty,
  z.object({
    minScans: z.preprocess(coerceNumber, z.number().optional()),
    schema: z.string().optional(),
    limit: z.preprocess(coerceNumber, z.number().optional()),
  }),
);

export const IndexRecommendationsInputSchemaBase = z.object({
  table: z.unknown().optional().describe("Table name to analyze"),
  sql: z
    .unknown()
    .optional()
    .describe("SQL query to analyze for index recommendations"),
  query: z.unknown().optional().describe("Alias for sql - SQL query to analyze"),
  params: z
    .unknown()
    .optional()
    .describe("Query parameters for $1, $2, etc. placeholders"),
  schema: z.unknown().optional().describe("Schema name (default: public)"),
});

export const IndexRecommendationsInputSchema = z.preprocess((input) => {
  const normalized = (input ?? {}) as Record<string, unknown>;
  const result = { ...normalized };
  if (result["sql"] === undefined && result["query"] !== undefined) {
    result["sql"] = result["query"];
  }
  return result;
}, IndexRecommendationsInputSchemaBase);

// =============================================================================
// Migrated Input Schemas (from handlers)
// =============================================================================

export const PerformanceBaselineSchemaBase = z.object({
  name: z.unknown().optional().describe("Baseline name for reference"),
});

export const PerformanceBaselineSchema = z.preprocess(
  defaultToEmpty,
  PerformanceBaselineSchemaBase,
);

export const ConnectionPoolOptimizeInputSchemaBase = z.object({}).strict();
export const ConnectionPoolOptimizeInputSchema = ConnectionPoolOptimizeInputSchemaBase;

export const PartitionStrategySchemaBase = z.object({
  table: z.unknown().optional().describe("Table to analyze"),
  schema: z.unknown().optional().describe("Schema name"),
});

export const PartitionStrategySchema = z.preprocess(
  (input) => {
    const defaultObj = defaultToEmpty(input);
    return preprocessTableAliasParams(defaultObj);
  },
  PartitionStrategySchemaBase,
);

export const UnusedIndexesSchemaBase = z.object({
  schema: z.unknown().optional().describe("Schema to filter (default: all user schemas)"),
  minSize: z.unknown().optional().describe('Minimum index size to include (e.g., "1 MB")'),
  limit: z.unknown().optional().describe("Max indexes to return (default: 20, use 0 for all)"),
  summary: z.unknown().optional().describe("Return aggregated summary instead of full list"),
});

export const UnusedIndexesSchema = z.preprocess(
  defaultToEmpty,
  z.object({
    schema: z.string().optional(),
    minSize: z.string().optional(),
    limit: z.preprocess(coerceNumber, z.number().optional()),
    summary: z.boolean().optional(),
  }),
);

export const DuplicateIndexesSchemaBase = z.object({
  schema: z.string().optional().describe("Schema to filter (default: all user schemas)"),
  limit: z.number().optional().describe("Max rows to return (default: 50, use 0 for all)"),
});

export const DuplicateIndexesSchema = z.preprocess(
  defaultToEmpty,
  z.object({
    schema: z.string().optional(),
    limit: z.preprocess(coerceNumber, z.number().optional()),
  }),
);

export const ConnectionSpikeInputBase = z.object({
  warningPercent: z.unknown().optional().describe("Percentage threshold for flagging concentration (default: 70)"),
});

export const ConnectionSpikeInput = z.preprocess(
  defaultToEmpty,
  z.object({
    warningPercent: z.preprocess(coerceNumber, z.number().optional()),
  }),
);

export const QueryPlanCompareSchemaBase = z.object({
  query1: z.unknown().optional().describe("First SQL query"),
  query2: z.unknown().optional().describe("Second SQL query"),
  sql1: z.unknown().optional().describe("Alias for query1"),
  sql2: z.unknown().optional().describe("Alias for query2"),
  sqlA: z.unknown().optional().describe("Alias for query1"),
  sqlB: z.unknown().optional().describe("Alias for query2"),
  queryA: z.unknown().optional().describe("Alias for query1"),
  queryB: z.unknown().optional().describe("Alias for query2"),
  params1: z.unknown().optional().describe("Parameters for first query ($1, $2, etc.)"),
  params2: z.unknown().optional().describe("Parameters for second query ($1, $2, etc.)"),
  analyze: z.unknown().optional().describe("Run EXPLAIN ANALYZE (executes queries)"),
  compact: z.unknown().optional().describe("Omit full execution plans from output to save tokens"),
});

export const QueryPlanCompareSchema = z.preprocess((input) => {
  if (typeof input !== "object" || input === null) return input;
  const obj = input as Record<string, unknown>;
  const result = { ...obj };
  if (result["query1"] === undefined) {
    if (result["sql1"] !== undefined) result["query1"] = result["sql1"];
    else if (result["sqlA"] !== undefined) result["query1"] = result["sqlA"];
    else if (result["queryA"] !== undefined) result["query1"] = result["queryA"];
  }
  if (result["query2"] === undefined) {
    if (result["sql2"] !== undefined) result["query2"] = result["sql2"];
    else if (result["sqlB"] !== undefined) result["query2"] = result["sqlB"];
    else if (result["queryB"] !== undefined) result["query2"] = result["queryB"];
  }
  return result;
}, QueryPlanCompareSchemaBase);

export const QueryAnomaliesInputBase = z.object({
  threshold: z.unknown().optional().describe("Standard deviation multiplier for anomaly detection (default: 2.0)"),
  minCalls: z.unknown().optional().describe("Minimum call count to filter noise (default: 10)"),
  limit: z.unknown().optional().describe("Max anomalies to return (default: 20, max: 50)"),
});

export const QueryAnomaliesInput = z.preprocess(
  defaultToEmpty,
  z.object({
    threshold: z.preprocess(coerceNumber, z.number().optional()),
    minCalls: z.preprocess(coerceNumber, z.number().optional()),
    limit: z.preprocess(coerceNumber, z.number().optional()),
  }),
);

export const BloatRiskInputBase = z.object({
  schema: z.string().optional().describe("Filter to a specific schema (default: all user schemas)"),
  minRows: z.unknown().optional().describe("Minimum live rows to include (default: 1000)"),
});

export const BloatRiskInput = z.preprocess(
  defaultToEmpty,
  z.object({
    schema: z.string().optional(),
    minRows: z.preprocess(coerceNumber, z.number().optional()),
  }),
);

// =============================================================================
// Output Schemas
// =============================================================================

// Common schema for explain plan output
export const ExplainOutputSchema = z
  .object({
    plan: z.unknown().optional().describe("Query execution plan"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

// pg_index_stats
export const IndexStatsOutputSchema = z
  .object({
    indexes: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Index statistics"),
    count: z.number().optional().describe("Number of items returned"),
    totalCount: z
      .number()
      .optional()
      .describe("Total count if results truncated"),
    truncated: z
      .boolean()
      .optional()
      .describe("Whether results were truncated"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

// pg_table_stats
export const TableStatsOutputSchema = z
  .object({
    tables: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Table statistics"),
    count: z.number().optional().describe("Number of items returned"),
    totalCount: z
      .number()
      .optional()
      .describe("Total count if results truncated"),
    truncated: z
      .boolean()
      .optional()
      .describe("Whether results were truncated"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

// pg_stat_statements
export const StatStatementsOutputSchema = z
  .object({
    statements: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Query statistics"),
    count: z.number().optional().describe("Number of items returned"),
    totalCount: z
      .number()
      .optional()
      .describe("Total count if results truncated"),
    truncated: z
      .boolean()
      .optional()
      .describe("Whether results were truncated"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

// pg_stat_activity
export const StatActivityOutputSchema = z
  .object({
    connections: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Active connections"),
    count: z.number().optional().describe("Number of connections"),
    truncated: z
      .boolean()
      .optional()
      .describe("Whether results were truncated"),
    backgroundWorkers: z
      .number()
      .optional()
      .describe("Number of filtered background worker processes"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

// pg_locks
export const LocksOutputSchema = z
  .object({
    locks: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Lock information"),
    count: z.number().optional().describe("Number of locks returned"),
    truncated: z
      .boolean()
      .optional()
      .describe("Whether results were truncated"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

// pg_bloat_check
export const BloatCheckOutputSchema = z
  .object({
    tables: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Tables with bloat"),
    count: z.number().optional().describe("Number of tables with bloat"),
    totalCount: z
      .number()
      .optional()
      .describe("Total count if results truncated"),
    truncated: z
      .boolean()
      .optional()
      .describe("Whether results were truncated"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

// pg_cache_hit_ratio
export const CacheHitRatioOutputSchema = z
  .object({
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
  })
  .extend(ErrorResponseFields.shape);

// pg_seq_scan_tables
export const SeqScanTablesOutputSchema = z
  .object({
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
    truncated: z
      .boolean()
      .optional()
      .describe("Whether results were truncated"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

// pg_index_recommendations
export const IndexRecommendationsOutputSchema = z
  .object({
    queryAnalysis: z
      .boolean()
      .optional()
      .describe("Whether query was analyzed"),
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
  })
  .extend(ErrorResponseFields.shape);

// pg_query_plan_compare
export const QueryPlanCompareOutputSchema = z
  .object({
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
  })
  .extend(ErrorResponseFields.shape);

// pg_performance_baseline
export const PerformanceBaselineOutputSchema = z
  .object({
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
  })
  .extend(ErrorResponseFields.shape);

// pg_connection_pool_optimize
export const ConnectionPoolOptimizeOutputSchema = z
  .object({
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
  })
  .extend(ErrorResponseFields.shape);

// pg_partition_strategy_suggest
export const PartitionStrategySuggestOutputSchema = z
  .object({
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
  })
  .extend(ErrorResponseFields.shape);

// pg_unused_indexes (supports both summary and list modes)
export const UnusedIndexesOutputSchema = z
  .object({
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
    truncated: z
      .boolean()
      .optional()
      .describe("Whether results were truncated"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

// pg_duplicate_indexes
export const DuplicateIndexesOutputSchema = z
  .object({
    duplicateIndexes: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Duplicate index pairs"),
    count: z.number().optional().describe("Number of duplicate pairs"),
    hint: z.string().optional().describe("Guidance hint"),
    totalCount: z.number().optional().describe("Total pairs if truncated"),
    truncated: z
      .boolean()
      .optional()
      .describe("Whether results were truncated"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

// pg_vacuum_stats
export const VacuumStatsOutputSchema = z
  .object({
    tables: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Vacuum statistics per table"),
    count: z.number().optional().describe("Number of items returned"),
    totalCount: z
      .number()
      .optional()
      .describe("Total count if results truncated"),
    truncated: z
      .boolean()
      .optional()
      .describe("Whether results were truncated"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

export const QueryPlanStatsOutputSchema = z
  .object({
    queryPlanStats: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Query plan statistics"),
    count: z.number().optional().describe("Number of queries"),
    hint: z.string().optional().describe("Interpretation hint"),
    totalCount: z.number().optional().describe("Total if truncated"),
    truncated: z
      .boolean()
      .optional()
      .describe("Whether results were truncated"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

// pg_diagnose_database_performance
export const DiagnoseOutputSchema = z
  .object({
    sections: z
      .object({
        slowQueries: z.record(z.string(), z.unknown()),
        blockingLocks: z.record(z.string(), z.unknown()),
        connectionPressure: z.record(z.string(), z.unknown()),
        cacheHitRatio: z.record(z.string(), z.unknown()),
        diskUsage: z.record(z.string(), z.unknown()),
        topTables: z.record(z.string(), z.unknown()),
      })
      .optional()
      .describe("Per-section diagnostic results"),
    overallScore: z
      .number()
      .optional()
      .describe("Aggregate health score (0-100)"),
    overallStatus: z
      .enum(["healthy", "warning", "critical"])
      .optional()
      .describe("Overall health status"),
    totalRecommendations: z
      .number()
      .optional()
      .describe("Total recommendation count"),
    allRecommendations: z
      .array(z.string())
      .optional()
      .describe("All recommendations across sections"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

// pg_detect_query_anomalies
export const DetectQueryAnomaliesOutputSchema = z
  .object({
    anomalies: z.array(z.record(z.string(), z.unknown())).optional(),
    riskLevel: z.enum(["low", "moderate", "high", "critical"]).optional(),
    totalAnalyzed: z.number().optional(),
    anomalyCount: z.number().optional(),
    summary: z.string().optional(),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

// pg_detect_bloat_risk
export const DetectBloatRiskOutputSchema = z
  .object({
    tables: z.array(z.record(z.string(), z.unknown())).optional(),
    highRiskCount: z.number().optional(),
    totalAnalyzed: z.number().optional(),
    summary: z.string().optional(),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

// pg_detect_connection_spike
export const DetectConnectionSpikeOutputSchema = z
  .object({
    totalConnections: z.number().optional(),
    maxConnections: z.number().optional(),
    usagePercent: z.number().optional(),
    byState: z.array(z.record(z.string(), z.unknown())).optional(),
    concentrations: z.array(z.record(z.string(), z.unknown())).optional(),
    warnings: z.array(z.string()).optional(),
    riskLevel: z.enum(["low", "moderate", "high", "critical"]).optional(),
    summary: z.string().optional(),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);
