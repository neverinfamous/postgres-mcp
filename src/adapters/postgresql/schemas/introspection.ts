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
export const DependencyGraphSchemaBase = z
  .object({
    schema: z
      .string()
      .optional()
      .describe("Schema to analyze (default: all user schemas)"),
    includeRowCounts: z
      .boolean()
      .optional()
      .describe("Include estimated row counts (default: true)"),
    includeIndexes: z
      .boolean()
      .optional()
      .describe("Include index information on edges (default: false)"),
  })
  .default({});

export const DependencyGraphSchema = DependencyGraphSchemaBase;

/**
 * pg_topological_sort input
 */
export const TopologicalSortSchemaBase = z
  .object({
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
  })
  .default({});

export const TopologicalSortSchema = TopologicalSortSchemaBase;

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
export const SchemaSnapshotSchemaBase = z
  .object({
    schema: z
      .string()
      .optional()
      .describe("Schema to snapshot (default: all user schemas)"),
    includeSystem: z
      .boolean()
      .optional()
      .describe("Include system schemas like pg_catalog (default: false)"),
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
  })
  .default({});

export const SchemaSnapshotSchema = SchemaSnapshotSchemaBase;

/**
 * pg_constraint_analysis input
 */
export const ConstraintAnalysisSchemaBase = z
  .object({
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
  })
  .default({});

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
}, ConstraintAnalysisSchemaBase);

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
    restrictActions: z.number(),
    setNullActions: z.number(),
    maxDepth: z.number(),
  }),
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
