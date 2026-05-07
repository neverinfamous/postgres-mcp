/**
 * postgres-mcp - Introspection Output Schemas
 *
 * Output validation schemas for introspection and migration tool results.
 */

import { z } from "zod";
import { ErrorResponseFields } from "../error-response-fields.js";

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
  constraint: z.string().optional(),
  columns: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
  onDelete: z.string().optional(),
  onUpdate: z.string().optional(),
});

export const DependencyGraphOutputSchema = z
  .object({
    nodes: z.array(DependencyNodeSchema).optional(),
    edges: z.array(DependencyEdgeSchema).optional(),
    circularDependencies: z.array(z.array(z.string())).optional(),
    stats: z
      .object({
        totalTables: z.number(),
        totalRelationships: z.number(),
        maxDepth: z.number(),
        rootTables: z.array(z.string()).optional(),
        leafTables: z.array(z.string()).optional(),
      })
      .optional(),
    hint: z.string().optional(),
    success: z.boolean(),
    error: z.string().optional(),
  })
  .extend(ErrorResponseFields.shape);

export const TopologicalSortOutputSchema = z
  .object({
    order: z
      .array(
        z.object({
          table: z.string(),
          schema: z.string(),
          level: z.number(),
          dependencies: z.array(z.string()).optional(),
        }),
      )
      .optional(),
    direction: z.string().optional(),
    hasCycles: z.boolean().optional(),
    cycles: z.array(z.array(z.string())).optional(),
    hint: z.string().optional(),
    success: z.boolean(),
    error: z.string().optional(),
  })
  .extend(ErrorResponseFields.shape);

export const CascadeSimulatorOutputSchema = z
  .object({
    sourceTable: z.string().optional(),
    operation: z.string().optional(),
    affectedTables: z
      .array(
        z.object({
          table: z.string(),
          schema: z.string(),
          action: z.string(),
          estimatedRows: z.number().optional(),
          path: z.array(z.string()),
          depth: z.number(),
        }),
      )
      .optional(),
    severity: z.enum(["low", "medium", "high", "critical"]).optional(),
    stats: z
      .object({
        totalTablesAffected: z.number(),
        cascadeActions: z.number(),
        blockingActions: z.number(),
        setNullActions: z.number(),
        maxDepth: z.number(),
      })
      .optional(),
    success: z.boolean(),
    error: z.string().optional(),
  })
  .extend(ErrorResponseFields.shape);

export const SchemaSnapshotOutputSchema = z
  .object({
    snapshot: z.record(z.string(), z.unknown()).optional(),
    stats: z
      .object({
        tables: z.number().optional(),
        views: z.number().optional(),
        indexes: z.number().optional(),
        constraints: z.number().optional(),
        functions: z.number().optional(),
        triggers: z.number().optional(),
        sequences: z.number().optional(),
        customTypes: z.number().optional(),
        extensions: z.number().optional(),
      })
      .optional(),
    generatedAt: z.string().optional(),
    compact: z.boolean().optional(),
    hint: z.string().optional(),
    success: z.boolean(),
    error: z.string().optional(),
  })
  .extend(ErrorResponseFields.shape);

export const ConstraintAnalysisOutputSchema = z
  .object({
    findings: z
      .array(
        z.object({
          type: z.string(),
          severity: z.enum(["info", "warning", "error"]),
          table: z.string(),
          description: z.string(),
          suggestion: z.string().optional(),
        }),
      )
      .optional(),
    summary: z
      .object({
        totalFindings: z.number(),
        byType: z.record(z.string(), z.number()).optional(),
        bySeverity: z.record(z.string(), z.number()).optional(),
      })
      .optional(),
    hint: z.string().optional(),
    success: z.boolean(),
    error: z.string().optional(),
  })
  .extend(ErrorResponseFields.shape);

export const MigrationRisksOutputSchema = z
  .object({
    risks: z
      .array(
        z.object({
          statement: z.string(),
          statementIndex: z.number(),
          severity: z.enum(["low", "medium", "high", "critical"]),
          category: z.string(),
          description: z.string(),
          mitigation: z.string().optional(),
        }),
      )
      .optional(),
    summary: z
      .object({
        totalStatements: z.number(),
        totalRisks: z.number(),
        highestSeverity: z.string(),
        requiresDowntime: z.boolean(),
        estimatedLockImpact: z.string(),
      })
      .optional(),
    success: z.boolean(),
    error: z.string().optional(),
  })
  .extend(ErrorResponseFields.shape);


