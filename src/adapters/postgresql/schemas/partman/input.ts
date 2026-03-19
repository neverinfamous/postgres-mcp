/**
 * postgres-mcp - pg_partman Tool Schemas
 *
 * Input validation schemas for automated partition management.
 * Includes parameter preprocessing to smooth common agent input mistakes.
 */

import { z } from "zod";

/**
 * Helper type for raw partman input with common aliases
 */
interface RawPartmanInput {
  parentTable?: string;
  table?: string; // Common alias → parentTable
  parent?: string; // Alias → parentTable (documented in ServerInstructions)
  name?: string; // Alias → parentTable (documented in ServerInstructions)
  controlColumn?: string;
  column?: string; // Common alias → controlColumn
  control?: string; // pg_partman native name → controlColumn
  partitionColumn?: string; // Alias → controlColumn (consistent with other partition tools)
  targetTable?: string;
  target?: string; // Alias → targetTable
  interval?: string;
  partitionInterval?: string; // Alias → interval
  retentionKeepTable?: boolean;
  keepTable?: boolean; // Alias → retentionKeepTable
  [key: string]: unknown;
}

/**
 * Preprocess partman parameters to normalize common input patterns:
 * - table → parentTable (most common agent mistake)
 * - column → controlColumn (for createParent)
 * - Auto-prefix public. for parentTable when no schema specified
 */
/**
 * Deprecated interval keywords that pg_partman no longer accepts.
 * Maps legacy keywords to their PostgreSQL interval equivalents.
 */
export const DEPRECATED_INTERVALS: Record<string, string> = {
  daily: "1 day",
  weekly: "1 week",
  monthly: "1 month",
  quarterly: "3 months",
  yearly: "1 year",
  hourly: "1 hour",
};

function preprocessPartmanParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }

  const raw = input as RawPartmanInput;
  const result = { ...raw };

  // Alias: table → parentTable
  if (result.table && !result.parentTable) {
    result.parentTable = result.table;
  }

  // Alias: parent → parentTable (documented in ServerInstructions)
  if (result.parent && !result.parentTable) {
    result.parentTable = result.parent;
  }

  // Alias: name → parentTable (documented in ServerInstructions)
  if (result.name && !result.parentTable) {
    result.parentTable = result.name;
  }

  // Alias: column → controlColumn
  if (result.column && !result.controlColumn) {
    result.controlColumn = result.column;
  }

  // Alias: control → controlColumn (pg_partman native terminology)
  if (result.control && !result.controlColumn) {
    result.controlColumn = result.control;
  }

  // Alias: partitionColumn → controlColumn (consistent with other partition tools)
  if (result.partitionColumn && !result.controlColumn) {
    result.controlColumn = result.partitionColumn;
  }

  // Alias: target → targetTable
  if (result.target && !result.targetTable) {
    result.targetTable = result.target;
  }

  // Alias: partitionInterval → interval (more intuitive name)
  if (result.partitionInterval && !result.interval) {
    result.interval = result.partitionInterval;
  }

  // Alias: keepTable → retentionKeepTable
  if (
    result.keepTable !== undefined &&
    result.retentionKeepTable === undefined
  ) {
    result.retentionKeepTable = result.keepTable;
  }

  // Auto-prefix public. for parentTable when no schema specified
  if (result.parentTable && !result.parentTable.includes(".")) {
    result.parentTable = `public.${result.parentTable}`;
  }

  return result;
}

/**
 * Schema for creating a partition set with pg_partman.
 * Uses partman.create_parent() function.
 */
export const PartmanCreateParentSchemaBase = z.object({
  parentTable: z
    .string()
    .optional()
    .describe("Parent table name (schema.table format). Required."),
  controlColumn: z
    .string()
    .optional()
    .describe(
      "Column used for partitioning (timestamp or integer). Alias: control. Required.",
    ),
  interval: z
    .string()
    .optional()
    .describe(
      'Partition interval using PostgreSQL syntax (e.g., "1 month", "1 day", "1 week", "10000" for integer). Required.',
    ),
  premake: z
    .any()
    .optional()
    .describe("Number of partitions to create in advance (default: 4)"),
  startPartition: z
    .string()
    .optional()
    .describe("Starting value for first partition (timestamp or integer)"),
  templateTable: z
    .string()
    .optional()
    .describe("Template table for indexes/privileges (schema.table format)"),
  epochType: z
    .enum(["seconds", "milliseconds", "nanoseconds"])
    .optional()
    .describe("If control column is integer representing epoch time"),
  defaultPartition: z
    .boolean()
    .optional()
    .describe("Create a default partition (default: true)"),
});

export const PartmanCreateParentSchema = z
  .preprocess(preprocessPartmanParams, PartmanCreateParentSchemaBase)
  .default({});

/**
 * Schema for running partition maintenance.
 * Uses partman.run_maintenance() or run_maintenance_proc().
 */
export const PartmanRunMaintenanceSchemaBase = z.object({
  parentTable: z
    .string()
    .optional()
    .describe("Specific parent table to maintain (all if omitted)"),
  analyze: z
    .boolean()
    .optional()
    .describe("Run ANALYZE on new partitions (default: true)"),
});

export const PartmanRunMaintenanceSchema = z
  .preprocess(preprocessPartmanParams, PartmanRunMaintenanceSchemaBase)
  .default({});

/**
 * Schema for listing managed partitions.
 * Uses partman.show_partitions() function.
 */
export const PartmanShowPartitionsSchemaBase = z.object({
  parentTable: z
    .string()
    .optional()
    .describe(
      "Parent table name (schema.table format). Required - specify table to list partitions.",
    ),
  includeDefault: z
    .boolean()
    .optional()
    .describe("Include default partition in results"),
  order: z
    .enum(["asc", "desc"])
    .optional()
    .describe("Order of partitions by boundary"),
  limit: z
    .any()
    .optional()
    .describe(
      "Maximum number of partitions to return (default: 50, use 0 for all)",
    ),
});

export const PartmanShowPartitionsSchema = z
  .preprocess(preprocessPartmanParams, PartmanShowPartitionsSchemaBase)
  .default({});

/**
 * Schema for viewing partition configuration.
 * Queries partman.part_config table.
 */
export const PartmanShowConfigSchemaBase = z.object({
  parentTable: z
    .string()
    .optional()
    .describe("Parent table name (all configs if omitted)"),
  limit: z
    .any()
    .optional()
    .describe(
      "Maximum number of configs to return (default: 50, use 0 for all)",
    ),
});

export const PartmanShowConfigSchema = z
  .preprocess(preprocessPartmanParams, PartmanShowConfigSchemaBase)
  .default({});

/**
 * Schema for checking data in default partition.
 * Uses partman.check_default() function.
 */
export const PartmanCheckDefaultSchemaBase = z.object({
  parentTable: z
    .string()
    .optional()
    .describe(
      "Parent table name to check. Required - specify table to check default partition.",
    ),
});

export const PartmanCheckDefaultSchema = z
  .preprocess(preprocessPartmanParams, PartmanCheckDefaultSchemaBase)
  .default({});

/**
 * Schema for moving data from default to child partitions.
 * Uses partman.partition_data_* functions.
 */
export const PartmanPartitionDataSchemaBase = z.object({
  parentTable: z
    .string()
    .optional()
    .describe(
      "Parent table name (schema.table format). Required - specify table to partition data.",
    ),
  batchSize: z
    .any()
    .optional()
    .describe("Rows to move per batch (default: varies by function)"),
  lockWaitSeconds: z.any().optional().describe("Lock wait timeout in seconds"),
});

export const PartmanPartitionDataSchema = z
  .preprocess(preprocessPartmanParams, PartmanPartitionDataSchemaBase)
  .default({});

/**
 * Schema for configuring retention policies.
 * Updates partman.part_config table.
 */
export const PartmanRetentionSchemaBase = z.object({
  parentTable: z
    .string()
    .optional()
    .describe("Parent table name (schema.table format). Required."),
  retention: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Retention period (e.g., "30 days"). Pass null or omit to disable/clear retention.',
    ),
  retentionKeepTable: z
    .boolean()
    .optional()
    .describe(
      "Keep tables after detaching (true) or drop them (false). Default: false (DROP). Use true to preserve partition data.",
    ),
});

export const PartmanRetentionSchema = z
  .preprocess(preprocessPartmanParams, PartmanRetentionSchemaBase)
  .default({});

/**
 * Schema for undoing partitioning.
 * Converts a partitioned table back to a regular table.
 */
export const PartmanUndoPartitionSchemaBase = z.object({
  parentTable: z
    .string()
    .optional()
    .describe("Parent table to convert back to regular table. Required."),
  targetTable: z
    .string()
    .optional()
    .describe(
      "Target table for consolidated data. Must exist before calling. Alias: target. Required.",
    ),
  batchSize: z.any().optional().describe("Rows to move per batch"),
  keepTable: z
    .boolean()
    .optional()
    .describe("Keep child tables after moving data"),
});

export const PartmanUndoPartitionSchema = z
  .preprocess(preprocessPartmanParams, PartmanUndoPartitionSchemaBase)
  .default({});

/**
 * Schema for updating partition configuration.
 */
export const PartmanUpdateConfigSchema = z.preprocess(
  preprocessPartmanParams,
  z.object({
    parentTable: z.string().describe("Parent table name (schema.table format)"),
    premake: z.number().optional().describe("Number of partitions to pre-make"),
    optimizeTrigger: z
      .number()
      .optional()
      .describe("Trigger optimization threshold"),
    optimizeConstraint: z
      .number()
      .optional()
      .describe("Constraint optimization threshold"),
    inheritFk: z
      .boolean()
      .optional()
      .describe("Inherit foreign keys to children"),
    retention: z.string().optional().describe("Retention period"),
    retentionKeepTable: z
      .boolean()
      .optional()
      .describe("Keep tables after detaching"),
  }),
);
