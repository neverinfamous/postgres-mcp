/**
 * postgres-mcp - Introspection Input Schemas
 *
 * Input validation schemas for agent-optimized introspection and migration tools.
 */

import { z } from "zod";
import { coerceNumber } from "../../../../utils/query-helpers.js";

// =============================================================================
// Input Schemas
// =============================================================================

/**
 * pg_dependency_graph input
 */
export const DependencyGraphSchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Schema to analyze (default: all user schemas)"),
  includeRowCounts: z
    .boolean()
    .optional()
    .describe("Include estimated row counts (default: true)"),
  excludeExtensionSchemas: z
    .boolean()
    .optional()
    .describe(
      "Exclude known extension schemas (cron, topology, tiger, tiger_data) from graph (default: true)",
    ),
});

export const DependencyGraphSchema = DependencyGraphSchemaBase.default({});

/**
 * pg_topological_sort input
 */
export const TopologicalSortSchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Schema to analyze (default: all user schemas)"),
  direction: z
    .string()
    .optional()
    .describe(
      "Sort direction: 'create' = dependencies first, 'drop' = dependents first (default: create)",
    ),
  excludeExtensionSchemas: z
    .boolean()
    .optional()
    .describe(
      "Exclude known extension schemas (cron, topology, tiger, tiger_data) from sort (default: true)",
    ),
});

export const TopologicalSortSchema = z
  .object({
    schema: z.string().optional(),
    direction: z.enum(["create", "drop"]).optional(),
    excludeExtensionSchemas: z.boolean().optional(),
  })
  .default({});

/**
 * pg_cascade_simulator input
 */
export const CascadeSimulatorSchemaBase = z.object({
  table: z
    .string()
    .optional()
    .describe("Table name to simulate deletion from (supports schema.table)"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  operation: z
    .string()
    .optional()
    .describe("Operation to simulate (default: DELETE)"),
});

const CascadeSimulatorInnerSchema = z.object({
  table: z.string(),
  schema: z.string().optional(),
  operation: z.enum(["DELETE", "DROP", "TRUNCATE"]).optional(),
});

export const CascadeSimulatorSchema = z.preprocess((input: unknown) => {
  if (typeof input === "string") return { table: input };
  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    // Parse schema.table format
    if (
      typeof obj["table"] === "string" &&
      obj["table"].includes(".") &&
      typeof obj["schema"] === "undefined"
    ) {
      const parts = obj["table"].split(".");
      if (parts.length === 2 && parts[0] && parts[1]) {
        return { ...obj, schema: parts[0], table: parts[1] };
      }
    }
  }
  return input;
}, CascadeSimulatorInnerSchema);

/**
 * pg_schema_snapshot input
 */
export const SchemaSnapshotSchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Schema to snapshot (default: all user schemas)"),
  includeSystem: z
    .boolean()
    .optional()
    .describe("Include system schemas like pg_catalog (default: false)"),
  excludeExtensionSchemas: z
    .boolean()
    .optional()
    .describe(
      "Exclude known extension schemas (cron, topology, tiger, tiger_data) from snapshot (default: true)",
    ),
  sections: z
    .array(z.string())
    .optional()
    .describe("Specific sections to include (default: all)"),
  compact: z
    .boolean()
    .optional()
    .describe(
      "Omit column details from tables section for reduced payload size (default: false). Use pg_describe_table to drill into specific tables",
    ),
});

export const SchemaSnapshotSchema = z
  .object({
    schema: z.string().optional(),
    includeSystem: z.boolean().optional(),
    excludeExtensionSchemas: z.boolean().optional(),
    sections: z
      .array(
        z.enum([
          "tables",
          "views",
          "indexes",
          "constraints",
          "functions",
          "triggers",
          "sequences",
          "types",
          "extensions",
        ]),
      )
      .optional(),
    compact: z.boolean().optional(),
  })
  .default({});

/**
 * pg_constraint_analysis input
 */
export const ConstraintAnalysisSchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Schema to analyze (default: all user schemas)"),
  table: z
    .string()
    .optional()
    .describe("Analyze constraints for a specific table only"),
  checks: z
    .array(z.string())
    .optional()
    .describe("Specific checks to run (default: all)"),
  excludeExtensionSchemas: z
    .boolean()
    .optional()
    .describe(
      "Exclude known extension schemas (cron, topology, tiger, tiger_data) from analysis (default: true)",
    ),
});

const ConstraintAnalysisInnerSchema = z.object({
  schema: z.string().optional(),
  table: z.string().optional(),
  checks: z
    .array(
      z.enum([
        "redundant",
        "missing_fk",
        "missing_not_null",
        "missing_pk",
        "unindexed_fk",
      ]),
    )
    .optional(),
  excludeExtensionSchemas: z.boolean().optional(),
});

export const ConstraintAnalysisSchema = z.preprocess((input: unknown) => {
  if (typeof input === "string") return { table: input };
  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    if (
      typeof obj["table"] === "string" &&
      obj["table"].includes(".") &&
      typeof obj["schema"] === "undefined"
    ) {
      const parts = obj["table"].split(".");
      if (parts.length === 2 && parts[0] && parts[1]) {
        return { ...obj, schema: parts[0], table: parts[1] };
      }
    }
  }
  return input;
}, ConstraintAnalysisInnerSchema.default({}));

/**
 * pg_migration_risks input
 */
export const MigrationRisksSchemaBase = z.object({
  statements: z
    .array(z.string())
    .optional()
    .describe("Array of DDL statements to analyze for risks"),
  schema: z
    .string()
    .optional()
    .describe("Target schema context (default: public)"),
});

export const MigrationRisksSchema = z.preprocess(
  (input: unknown) => {
    if (typeof input === "object" && input !== null) {
      const obj = input as Record<string, unknown>;
      // Accept statement/sql aliases
      if (obj["statement"] !== undefined && obj["statements"] === undefined) {
        return { ...obj, statements: [obj["statement"]] };
      }
    }
    return input;
  },
  MigrationRisksSchemaBase.required({ statements: true }),
);

// =============================================================================
// Migration Tracking Input Schemas (Phase 2: Schema Version Tracking)
// =============================================================================

/**
 * pg_migration_init input
 */
export const MigrationInitSchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Schema to create the tracking table in (default: public)"),
});

export const MigrationInitSchema = MigrationInitSchemaBase.default({});

/**
 * pg_migration_record input
 */
export const MigrationRecordSchemaBase = z.object({
  version: z
    .string()
    .optional()
    .describe("Version identifier (e.g., '1.0.0', '2024-01-15-add-users')"),
  description: z
    .string()
    .optional()
    .describe("Human-readable description of the migration"),
  migrationSql: z
    .string()
    .optional()
    .describe("The DDL/SQL statements applied"),
  rollbackSql: z.string().optional().describe("SQL to reverse this migration"),
  sourceSystem: z
    .string()
    .optional()
    .describe("Origin system (e.g., 'mysql', 'sqlite', 'manual', 'agent')"),
  appliedBy: z
    .string()
    .optional()
    .describe("Who/what applied this migration (e.g., agent name, user)"),
});

// Internal parse schema — version and migrationSql are required
const MigrationRecordParseSchema = z.object({
  version: z
    .string()
    .describe("Version identifier (e.g., '1.0.0', '2024-01-15-add-users')"),
  description: z
    .string()
    .optional()
    .describe("Human-readable description of the migration"),
  migrationSql: z.string().describe("The DDL/SQL statements applied"),
  rollbackSql: z.string().optional().describe("SQL to reverse this migration"),
  sourceSystem: z
    .string()
    .optional()
    .describe("Origin system (e.g., 'mysql', 'sqlite', 'manual', 'agent')"),
  appliedBy: z
    .string()
    .optional()
    .describe("Who/what applied this migration (e.g., agent name, user)"),
});

export const MigrationRecordSchema = MigrationRecordParseSchema;

/**
 * pg_migration_apply input
 * Same fields as pg_migration_record — version and migrationSql required.
 */
export const MigrationApplySchemaBase = MigrationRecordSchemaBase;

// Internal parse schema — version and migrationSql are required
export const MigrationApplySchema = MigrationRecordParseSchema;

/**
 * pg_migration_rollback input
 */
export const MigrationRollbackSchemaBase = z.object({
  id: z.preprocess(coerceNumber, z.number().optional()).describe("Migration ID to roll back"),
  version: z
    .string()
    .optional()
    .describe("Migration version to roll back (alternative to id)"),
  dryRun: z
    .boolean()
    .optional()
    .describe(
      "If true, return the rollback SQL without executing (default: false)",
    ),
});

export const MigrationRollbackSchema = MigrationRollbackSchemaBase;

/**
 * pg_migration_history input
 */
export const MigrationHistorySchemaBase = z.object({
  status: z
    .enum(["applied", "recorded", "rolled_back", "failed"])
    .optional()
    .describe("Filter by status"),
  sourceSystem: z.string().optional().describe("Filter by source system"),
  limit: z.preprocess(coerceNumber, z.number().optional()).describe("Maximum records to return (default: 50)"),
  offset: z.preprocess(coerceNumber, z.number().optional()).describe("Offset for pagination (default: 0)"),
});

// Internal parse schema — coerces limit/offset types to prevent Zod leaks
export const MigrationHistorySchema = z
  .object({
    status: z.enum(["applied", "recorded", "rolled_back", "failed"]).optional(),
    sourceSystem: z.string().optional(),
    limit: z.preprocess(coerceNumber, z.number().optional()),
    offset: z.preprocess(coerceNumber, z.number().optional()),
  })
  .default({});

/**
 * pg_migration_status input
 */
export const MigrationStatusSchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Schema where the tracking table lives (default: public)"),
});

export const MigrationStatusSchema = MigrationStatusSchemaBase.default({});
