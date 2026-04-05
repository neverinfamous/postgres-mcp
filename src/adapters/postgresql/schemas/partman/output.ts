/**
 * postgres-mcp - pg_partman Output Schemas
 *
 * Output validation schemas for MCP 2025-11-25 structured content compliance.
 */

import { z } from "zod";

/**
 * Output schema for pg_partman_create_extension
 */
export const PartmanCreateExtensionOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether extension was enabled"),
    message: z.string().optional().describe("Status message"),
  })
  .describe("pg_partman extension creation result");

/**
 * Output schema for pg_partman_create_parent
 */
export const PartmanCreateParentOutputSchema = z
  .object({
    success: z.boolean().describe("Whether partition set was created"),
    parentTable: z.string().optional().describe("Parent table name"),
    controlColumn: z.string().optional().describe("Control column name"),
    interval: z.string().optional().describe("Partition interval"),
    premake: z.number().optional().describe("Number of premake partitions"),
    maintenanceRan: z
      .boolean()
      .optional()
      .describe("Whether initial maintenance ran"),
    message: z.string().optional().describe("Status message"),
    hint: z.string().optional().describe("Helpful hint"),
    error: z.string().optional().describe("Error message"),
    aliases: z
      .record(z.string(), z.string())
      .optional()
      .describe("Parameter aliases"),
  })
  .describe("Partition set creation result");

/**
 * Output schema for pg_partman_run_maintenance
 */
export const PartmanRunMaintenanceOutputSchema = z
  .object({
    success: z.boolean().describe("Whether maintenance succeeded"),
    partial: z.boolean().optional().describe("Some tables had errors"),
    parentTable: z.string().optional().describe("Table or 'all'"),
    analyze: z.boolean().optional().describe("ANALYZE ran on new partitions"),
    maintained: z.array(z.string()).optional().describe("Tables maintained"),
    orphaned: z
      .object({
        count: z.number().describe("Number of orphaned configs"),
        tables: z.array(z.string()).describe("Orphaned table names"),
        hint: z.string().describe("Cleanup hint"),
      })
      .optional()
      .describe("Orphaned configurations"),
    errors: z
      .array(
        z.object({
          table: z.string().describe("Table name"),
          reason: z.string().describe("Error reason"),
        }),
      )
      .optional()
      .describe("Maintenance errors"),
    message: z.string().optional().describe("Status message"),
    error: z.string().optional().describe("Error message"),
    hint: z.string().optional().describe("Helpful hint"),
  })
  .describe("Partition maintenance result");

/**
 * Output schema for pg_partman_show_partitions
 */
export const PartmanShowPartitionsOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether operation succeeded"),
    parentTable: z.string().optional().describe("Parent table name"),
    partitions: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Child partitions"),
    count: z.number().optional().describe("Number of partitions"),
    truncated: z.boolean().optional().describe("Results were truncated"),
    totalCount: z.number().optional().describe("Total available count"),
    error: z.string().optional().describe("Error message"),
    hint: z.string().optional().describe("Helpful hint"),
  })
  .describe("Partition list result");

/**
 * Output schema for pg_partman_show_config
 */
export const PartmanShowConfigOutputSchema = z
  .object({
    configs: z
      .array(
        z.record(z.string(), z.unknown()).and(
          z.object({
            orphaned: z.boolean().optional().describe("Config is orphaned"),
          }),
        ),
      )
      .optional()
      .describe("Partition configurations"),
    count: z.number().optional().describe("Number of configs returned"),
    truncated: z.boolean().optional().describe("Results were truncated"),
    totalCount: z.number().optional().describe("Total available count"),
    orphanedCount: z.number().optional().describe("Number of orphaned configs"),
    hint: z.string().optional().describe("Helpful hint"),
  })
  .describe("Partition configuration result");

/**
 * Output schema for pg_partman_check_default
 */
export const PartmanCheckDefaultOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Operation success"),
    parentTable: z.string().optional().describe("Parent table name"),
    hasDefault: z.boolean().optional().describe("Has default partition"),
    defaultPartition: z.string().optional().describe("Default partition name"),
    hasDataInDefault: z.boolean().optional().describe("Data in default"),
    isPartitioned: z.boolean().optional().describe("Table is partitioned"),
    hasChildPartitions: z.boolean().optional().describe("Has child partitions"),
    recommendation: z.string().optional().describe("Recommended action"),
    message: z.string().optional().describe("Status message"),
    error: z.string().optional().describe("Error message"),
    hint: z.string().optional().describe("Helpful hint"),
  })
  .describe("Default partition check result");

/**
 * Output schema for pg_partman_partition_data
 */
export const PartmanPartitionDataOutputSchema = z
  .object({
    success: z.boolean().describe("Whether data was partitioned"),
    parentTable: z.string().optional().describe("Parent table name"),
    rowsMoved: z.number().optional().describe("Rows moved to children"),
    rowsRemaining: z.number().optional().describe("Rows still in default"),
    message: z.string().optional().describe("Status message"),
    error: z.string().optional().describe("Error message"),
    hint: z.string().optional().describe("Helpful hint"),
  })
  .describe("Data partitioning result");

/**
 * Output schema for pg_partman_set_retention
 */
export const PartmanSetRetentionOutputSchema = z
  .object({
    success: z.boolean().describe("Whether retention was set"),
    parentTable: z.string().optional().describe("Parent table name"),
    retention: z.string().nullable().optional().describe("Retention period"),
    retentionKeepTable: z
      .boolean()
      .optional()
      .describe("Keep tables when detaching"),
    message: z.string().optional().describe("Status message"),
    error: z.string().optional().describe("Error message"),
    hint: z.string().optional().describe("Helpful hint"),
  })
  .describe("Retention policy result");

/**
 * Output schema for pg_partman_undo_partition
 */
export const PartmanUndoPartitionOutputSchema = z
  .object({
    success: z.boolean().describe("Whether undo succeeded"),
    parentTable: z.string().optional().describe("Parent table name"),
    targetTable: z.string().optional().describe("Target table name"),
    message: z.string().optional().describe("Status message"),
    note: z.string().optional().describe("Additional note"),
    error: z.string().optional().describe("Error message"),
    hint: z.string().optional().describe("Helpful hint"),
    aliases: z
      .record(z.string(), z.string())
      .optional()
      .describe("Parameter aliases"),
  })
  .describe("Partition undo result");

/**
 * Output schema for pg_partman_analyze_partition_health
 */
export const PartmanAnalyzeHealthOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if operation failed"),
    partitionSets: z
      .array(
        z.object({
          parentTable: z.string().describe("Parent table name"),
          issues: z.array(z.string()).describe("Issues found"),
          warnings: z.array(z.string()).describe("Warnings"),
          recommendations: z.array(z.string()).describe("Recommendations"),
          partitionCount: z.number().describe("Number of partitions"),
          hasDefaultPartition: z.boolean().describe("Has default partition"),
          hasDataInDefault: z.boolean().describe("Data in default"),
        }),
      )
      .optional()
      .describe("Health check results"),
    truncated: z.boolean().optional().describe("Results were truncated"),
    totalCount: z.number().optional().describe("Total partition sets"),
    summary: z
      .object({
        totalPartitionSets: z.number().describe("Total sets analyzed"),
        totalIssues: z.number().describe("Total issues found"),
        totalWarnings: z.number().describe("Total warnings"),
        overallHealth: z
          .enum(["healthy", "warnings", "issues_found"])
          .describe("Overall health status"),
      })
      .optional()
      .describe("Health summary"),
    overallHealth: z
      .enum(["healthy", "warnings", "issues_found"])
      .optional()
      .describe("Overall health status"),
    message: z.string().optional().describe("Status message"),
  })
  .describe("Partition health analysis result");
