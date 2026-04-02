/**
 * postgres-mcp - Monitoring Tool Schemas
 *
 * Input validation schemas for database monitoring.
 */

import { z } from "zod";
import { ErrorResponseFields } from "./error-response-fields.js";
import { coerceNumber } from "../../../utils/query-helpers.js";

// Helper to handle undefined params (allows tools to be called without {})
const defaultToEmpty = (val: unknown): unknown => val ?? {};

// Base schemas for MCP visibility (Split Schema pattern)
export const DatabaseSizeSchemaBase = z.object({
  database: z
    .string()
    .optional()
    .describe("Database name (current if omitted)"),
});

export const DatabaseSizeSchema = z.preprocess(
  defaultToEmpty,
  DatabaseSizeSchemaBase,
);

export const TableSizesSchemaBase = z.object({
  schema: z.string().optional().describe("Schema name"),
  limit: z.number().optional().describe("Max tables to return"),
});

export const TableSizesSchema = z.preprocess(
  defaultToEmpty,
  TableSizesSchemaBase.extend({
    limit: z.preprocess(coerceNumber, z.number().optional()).optional(),
  })
);

export const ShowSettingsSchemaBase = z.object({
  pattern: z
    .string()
    .optional()
    .describe("Setting name pattern (LIKE syntax with %)"),
  setting: z
    .string()
    .optional()
    .describe("Alias for pattern - setting name or pattern"),
  name: z
    .string()
    .optional()
    .describe("Alias for pattern - setting name or pattern"),
  limit: z.number().optional()
    .describe("Max settings to return (default: 50 when no pattern specified)"),
});

export const ShowSettingsSchema = z.preprocess(
  defaultToEmpty,
  ShowSettingsSchemaBase.extend({
    limit: z.preprocess(coerceNumber, z.number().optional()).optional(),
  }).transform((data) => {
    // Resolve alias: setting or name → pattern
    const pattern = data.pattern ?? data.setting ?? data.name;
    // Default limit to 50 only when NO filter is specified (to avoid 415+ results)
    const limit = data.limit ?? (pattern === undefined ? 50 : undefined);
    return { pattern, limit };
  }),
);

export const AlertThresholdSetSchemaBase = z.object({
  metric: z.string().optional().describe("Specific metric to set thresholds for"),
  warningThreshold: z
    .string()
    .optional()
    .describe("Warning threshold (e.g. '70%')"),
  criticalThreshold: z
    .string()
    .optional()
    .describe("Critical threshold (e.g. '90%')"),
});

export const AlertThresholdSetSchema = z.preprocess(
  defaultToEmpty,
  AlertThresholdSetSchemaBase
);

export const CapacityPlanningSchemaBase = z.object({
  projectionDays: z.number().optional().describe("Days to project growth (default: 90)"),
  days: z.number().optional().describe("Alias for projectionDays"),
});

export const CapacityPlanningSchema = z.preprocess(
  defaultToEmpty,
  CapacityPlanningSchemaBase.extend({
    projectionDays: z.preprocess(coerceNumber, z.number().optional()).optional(),
    days: z.preprocess(coerceNumber, z.number().optional()).optional(),
  })
    .refine(
      (data) => {
        const val = data.projectionDays ?? data.days;
        return val === undefined || val >= 0;
      },
      {
        message: "Projection days must be a non-negative number",
        path: ["days"],
      },
    )
    .transform((data) => ({
      ...data,
      projectionDays: data.projectionDays ?? data.days ?? 90,
    }))
);

// ============================================================================
// Output Schemas
// ============================================================================

/**
 * pg_database_size output
 */
export const DatabaseSizeOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if operation failed"),
    bytes: z.number().optional().describe("Database size in bytes"),
    size: z.string().optional().describe("Human-readable size"),
  })
  .loose();

/**
 * pg_table_sizes output
 */
export const TableSizesOutputSchema = z.object({
  tables: z
    .array(
      z.object({
        schema: z.string().describe("Schema name"),
        table_name: z.string().describe("Table name"),
        table_size: z.string().describe("Table data size"),
        indexes_size: z.string().describe("Indexes size"),
        total_size: z.string().describe("Total size including TOAST"),
        total_bytes: z.number().describe("Total size in bytes"),
      }),
    )
    .optional()
    .describe("Table size information"),
  count: z.number().optional().describe("Number of tables returned"),
  totalCount: z.number().optional().describe("Total tables if truncated"),
  truncated: z.boolean().optional().describe("Whether results were truncated"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

/**
 * pg_connection_stats output
 */
export const ConnectionStatsOutputSchema = z.object({
  byDatabaseAndState: z
    .array(
      z.object({
        datname: z.string().nullable().describe("Database name"),
        state: z.string().nullable().describe("Connection state"),
        connections: z.number().describe("Number of connections"),
      }),
    )
    .optional()
    .describe("Connections grouped by database and state"),
  totalConnections: z.number().optional().describe("Total active connections"),
  maxConnections: z.number().optional().describe("Maximum allowed connections"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

/**
 * pg_replication_status output (primary or replica)
 */
export const ReplicationStatusOutputSchema = z
  .object({
    role: z.string().optional().describe("Server role: primary or replica"),
    // Replica-specific fields
    replay_lag: z.unknown().optional().describe("Replication lag interval"),
    receive_lsn: z
      .string()
      .nullable()
      .optional()
      .describe("Last received WAL LSN"),
    replay_lsn: z
      .string()
      .nullable()
      .optional()
      .describe("Last replayed WAL LSN"),
    // Primary-specific fields
    replicas: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Connected replicas"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .loose();

/**
 * pg_server_version output
 */
export const ServerVersionOutputSchema = z.object({
  full_version: z
    .string()
    .optional()
    .describe("Full PostgreSQL version string"),
  version: z.string().optional().describe("PostgreSQL version number"),
  version_num: z.number().optional().describe("Numeric version for comparison"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

/**
 * pg_show_settings output
 */
export const ShowSettingsOutputSchema = z.object({
  settings: z
    .array(
      z.object({
        name: z.string().describe("Setting name"),
        setting: z.string().describe("Current value"),
        unit: z.string().nullable().describe("Unit of measurement"),
        category: z.string().describe("Setting category"),
        short_desc: z.string().describe("Description"),
      }),
    )
    .optional()
    .describe("Configuration settings"),
  count: z.number().optional().describe("Number of settings returned"),
  totalCount: z.number().optional().describe("Total settings if truncated"),
  truncated: z.boolean().optional().describe("Whether results were truncated"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

/**
 * pg_uptime output
 */
export const UptimeOutputSchema = z.object({
  start_time: z.unknown().optional().describe("Server start timestamp"),
  uptime: z
    .object({
      days: z.number().describe("Days since start"),
      hours: z.number().describe("Hours component"),
      minutes: z.number().describe("Minutes component"),
      seconds: z.number().describe("Seconds component"),
      milliseconds: z.number().describe("Milliseconds component"),
    })
    .optional(),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

/**
 * pg_recovery_status output
 */
export const RecoveryStatusOutputSchema = z.object({
  in_recovery: z
    .boolean()
    .optional()
    .describe("Whether server is in recovery mode"),
  last_replay_timestamp: z
    .string()
    .nullable()
    .optional()
    .describe("Last replayed transaction timestamp (null if primary)"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

/**
 * pg_capacity_planning output
 */
export const CapacityPlanningOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if operation failed"),
    current: z
      .object({
        databaseSize: z
          .object({
            current_size_bytes: z.number().describe("Current size in bytes"),
            current_size: z.string().describe("Human-readable size"),
          })
          .optional(),
        tableCount: z.number().describe("Number of tables"),
        totalRows: z.number().describe("Total rows across tables"),
        connections: z.string().describe("Current/max connections"),
      })
      .optional(),
    growth: z
      .object({
        totalInserts: z.number().describe("Total inserts since stats reset"),
        totalDeletes: z.number().describe("Total deletes since stats reset"),
        netRowGrowth: z.number().describe("Net row growth"),
        daysOfData: z.number().describe("Days of statistics collected"),
        statsSince: z.unknown().describe("Statistics reset timestamp"),
        estimatedDailyRowGrowth: z
          .number()
          .describe("Estimated daily row growth"),
        estimatedDailyGrowthBytes: z
          .number()
          .describe("Estimated daily byte growth"),
        estimationQuality: z.string().describe("Confidence level of estimates"),
      })
      .optional(),
    projection: z
      .object({
        days: z.number().describe("Projection period in days"),
        projectedSizeBytes: z
          .number()
          .describe("Projected database size in bytes"),
        projectedSizePretty: z
          .string()
          .describe("Human-readable projected size"),
        growthPercentage: z.number().describe("Projected growth percentage"),
      })
      .optional(),
    recommendations: z
      .array(z.string())
      .optional()
      .describe("Capacity recommendations"),
  })
  .loose();

/**
 * pg_resource_usage_analyze output
 */
export const ResourceUsageAnalyzeOutputSchema = z.object({
  backgroundWriter: z
    .object({
      buffers_clean: z.number().describe("Buffers written by bgwriter"),
      maxwritten_clean: z
        .number()
        .describe("Times bgwriter stopped due to limit"),
      buffers_alloc: z.number().describe("Buffers allocated"),
      buffers_checkpoint: z
        .number()
        .optional()
        .describe("Buffers written at checkpoint"),
      buffers_backend: z
        .number()
        .optional()
        .describe("Buffers written by backends"),
    })
    .optional(),
  checkpoints: z
    .object({
      checkpoints_timed: z.number().describe("Scheduled checkpoints"),
      checkpoints_req: z.number().describe("Requested checkpoints"),
      checkpoint_write_time: z
        .number()
        .describe("Time writing checkpoint files (ms)"),
      checkpoint_sync_time: z
        .number()
        .describe("Time syncing checkpoint files (ms)"),
      buffers_checkpoint: z
        .number()
        .optional()
        .describe("Buffers written at checkpoint"),
    })
    .optional(),
  connectionDistribution: z
    .array(
      z.object({
        state: z.string().nullable().describe("Connection state"),
        wait_event_type: z.string().nullable().describe("Wait event type"),
        wait_event: z.string().nullable().describe("Wait event"),
        count: z.number().describe("Number of connections"),
      }),
    )
    .optional()
    .describe("Connection distribution by state and wait event"),
  bufferUsage: z
    .object({
      heap_reads: z.number().describe("Heap blocks read from disk"),
      heap_hits: z.number().describe("Heap blocks found in cache"),
      index_reads: z.number().describe("Index blocks read from disk"),
      index_hits: z.number().describe("Index blocks found in cache"),
      heapHitRate: z.string().describe("Heap cache hit rate"),
      indexHitRate: z.string().describe("Index cache hit rate"),
    })
    .optional(),
  activity: z
    .object({
      active_queries: z.number().describe("Currently running queries"),
      idle_connections: z.number().describe("Idle connections"),
      lock_waiting: z.number().describe("Queries waiting on locks"),
      io_waiting: z.number().describe("Queries waiting on I/O"),
    })
    .optional(),
  analysis: z
    .object({
      heapCachePerformance: z.string().describe("Heap cache analysis"),
      indexCachePerformance: z.string().describe("Index cache analysis"),
      checkpointPressure: z.string().describe("Checkpoint pressure assessment"),
      ioPattern: z.string().describe("I/O pattern analysis"),
      lockContention: z.string().describe("Lock contention analysis"),
    })
    .optional(),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

/**
 * pg_alert_threshold_set output (single metric or all thresholds)
 */
const ThresholdSchema = z.object({
  warning: z.string().describe("Warning threshold"),
  critical: z.string().describe("Critical threshold"),
  description: z.string().describe("Metric description"),
});

export const AlertThresholdOutputSchema = z
  .object({
    // Single metric response
    metric: z.string().optional().describe("Metric name"),
    threshold: ThresholdSchema.optional().describe("Threshold values"),
    // All thresholds response
    thresholds: z
      .record(z.string(), ThresholdSchema)
      .optional()
      .describe("All metric thresholds"),
    note: z.string().optional().describe("Usage guidance"),
  })
  .loose();
