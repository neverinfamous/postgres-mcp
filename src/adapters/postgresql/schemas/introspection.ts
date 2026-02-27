/**
 * postgres-mcp - Introspection Tool Schemas
 *
 * Input/output validation schemas for agent-optimized introspection tools.
 */

import { z } from "zod";

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
    .enum(["create", "drop"])
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

export const TopologicalSortSchema = TopologicalSortSchemaBase.default({});

/**
 * pg_cascade_simulator input
 */
export const CascadeSimulatorSchemaBase = z.object({
  table: z
    .string()
    .describe("Table name to simulate deletion from (supports schema.table)"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  operation: z
    .enum(["DELETE", "DROP", "TRUNCATE"])
    .optional()
    .describe("Operation to simulate (default: DELETE)"),
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
}, CascadeSimulatorSchemaBase);

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
    .optional()
    .describe("Specific sections to include (default: all)"),
  compact: z
    .boolean()
    .optional()
    .describe(
      "Omit column details from tables section for reduced payload size (default: false). Use pg_describe_table to drill into specific tables",
    ),
});

export const SchemaSnapshotSchema = SchemaSnapshotSchemaBase.default({});

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
    .array(
      z.enum([
        "redundant",
        "missing_fk",
        "missing_not_null",
        "missing_pk",
        "unindexed_fk",
      ]),
    )
    .optional()
    .describe("Specific checks to run (default: all)"),
  excludeExtensionSchemas: z
    .boolean()
    .optional()
    .describe(
      "Exclude known extension schemas (cron, topology, tiger, tiger_data) from analysis (default: true)",
    ),
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
}, ConstraintAnalysisSchemaBase.default({}));

/**
 * pg_migration_risks input
 */
export const MigrationRisksSchemaBase = z.object({
  statements: z
    .array(z.string())
    .describe("Array of DDL statements to analyze for risks"),
  schema: z
    .string()
    .optional()
    .describe("Target schema context (default: public)"),
});

export const MigrationRisksSchema = MigrationRisksSchemaBase;

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
  id: z.number().optional().describe("Migration ID to roll back"),
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
    .enum(["applied", "rolled_back", "failed"])
    .optional()
    .describe("Filter by status"),
  sourceSystem: z.string().optional().describe("Filter by source system"),
  limit: z
    .number()
    .optional()
    .describe("Maximum records to return (default: 50)"),
  offset: z.number().optional().describe("Offset for pagination (default: 0)"),
});

export const MigrationHistorySchema = MigrationHistorySchemaBase.default({});

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

// =============================================================================
// Output Schemas
// =============================================================================

const DependencyNodeSchema = z.object({
  table: z.string(),
  schema: z.string(),
  rowCount: z.number().optional(),
  sizeBytes: z.number().optional(),
});

const DependencyEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  constraint: z.string(),
  columns: z.array(z.object({ from: z.string(), to: z.string() })),
  onDelete: z.string(),
  onUpdate: z.string(),
});

export const DependencyGraphOutputSchema = z.object({
  nodes: z.array(DependencyNodeSchema),
  edges: z.array(DependencyEdgeSchema),
  circularDependencies: z.array(z.array(z.string())),
  stats: z.object({
    totalTables: z.number(),
    totalRelationships: z.number(),
    maxDepth: z.number(),
    rootTables: z.array(z.string()),
    leafTables: z.array(z.string()),
  }),
  hint: z.string().optional(),
});

export const TopologicalSortOutputSchema = z.object({
  order: z.array(
    z.object({
      table: z.string(),
      schema: z.string(),
      level: z.number(),
      dependencies: z.array(z.string()),
    }),
  ),
  direction: z.string(),
  hasCycles: z.boolean(),
  cycles: z.array(z.array(z.string())).optional(),
  hint: z.string().optional(),
});

export const CascadeSimulatorOutputSchema = z.object({
  sourceTable: z.string(),
  operation: z.string(),
  affectedTables: z.array(
    z.object({
      table: z.string(),
      schema: z.string(),
      action: z.string(),
      estimatedRows: z.number().optional(),
      path: z.array(z.string()),
      depth: z.number(),
    }),
  ),
  severity: z.enum(["low", "medium", "high", "critical"]),
  stats: z.object({
    totalTablesAffected: z.number(),
    cascadeActions: z.number(),
    blockingActions: z.number(),
    setNullActions: z.number(),
    maxDepth: z.number(),
  }),
  error: z.string().optional(),
});

export const SchemaSnapshotOutputSchema = z.object({
  snapshot: z.record(z.string(), z.unknown()),
  stats: z.object({
    tables: z.number(),
    views: z.number(),
    indexes: z.number(),
    constraints: z.number(),
    functions: z.number(),
    triggers: z.number(),
    sequences: z.number(),
    customTypes: z.number(),
    extensions: z.number(),
  }),
  generatedAt: z.string(),
  compact: z.boolean().optional(),
  hint: z.string().optional(),
});

export const ConstraintAnalysisOutputSchema = z.object({
  findings: z.array(
    z.object({
      type: z.string(),
      severity: z.enum(["info", "warning", "error"]),
      table: z.string(),
      description: z.string(),
      suggestion: z.string().optional(),
    }),
  ),
  summary: z.object({
    totalFindings: z.number(),
    byType: z.record(z.string(), z.number()),
    bySeverity: z.record(z.string(), z.number()),
  }),
  hint: z.string().optional(),
});

export const MigrationRisksOutputSchema = z.object({
  risks: z.array(
    z.object({
      statement: z.string(),
      statementIndex: z.number(),
      riskLevel: z.enum(["low", "medium", "high", "critical"]),
      category: z.string(),
      description: z.string(),
      mitigation: z.string().optional(),
    }),
  ),
  summary: z.object({
    totalStatements: z.number(),
    totalRisks: z.number(),
    highestRisk: z.string(),
    requiresDowntime: z.boolean(),
    estimatedLockImpact: z.string(),
  }),
});

// =============================================================================
// Migration Tracking Output Schemas
// =============================================================================

const MigrationRecordOutputEntry = z.object({
  id: z.number(),
  version: z.string(),
  description: z.string().nullable(),
  appliedAt: z.string(),
  appliedBy: z.string().nullable(),
  migrationHash: z.string(),
  sourceSystem: z.string().nullable(),
  status: z.string(),
});

export const MigrationInitOutputSchema = z.object({
  success: z.boolean(),
  tableCreated: z.boolean(),
  tableName: z.string(),
  existingRecords: z.number(),
});

export const MigrationRecordOutputSchema = z.object({
  success: z.boolean(),
  record: MigrationRecordOutputEntry.optional(),
  error: z.string().optional(),
});

export const MigrationApplyOutputSchema = z.object({
  success: z.boolean(),
  record: MigrationRecordOutputEntry.optional(),
  error: z.string().optional(),
});

export const MigrationRollbackOutputSchema = z.object({
  success: z.boolean(),
  dryRun: z.boolean().optional(),
  rollbackSql: z.string().nullable().optional(),
  record: MigrationRecordOutputEntry.optional(),
  error: z.string().optional(),
});

export const MigrationHistoryOutputSchema = z.object({
  records: z.array(MigrationRecordOutputEntry),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export const MigrationStatusOutputSchema = z.object({
  initialized: z.boolean(),
  latestVersion: z.string().nullable(),
  latestAppliedAt: z.string().nullable(),
  counts: z.object({
    total: z.number(),
    applied: z.number(),
    rolledBack: z.number(),
    failed: z.number(),
  }),
  sourceSystems: z.array(z.string()),
});
