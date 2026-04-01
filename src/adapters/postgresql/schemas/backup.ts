/**
 * postgres-mcp - Backup Tool Schemas
 *
 * Input validation schemas for backup and export operations.
 */

import { z } from "zod";
import { ErrorResponseFields } from "./error-response-fields.js";
import { coerceNumber } from "../../../utils/query-helpers.js";

/**
 * Base schema for MCP visibility (shows all parameters in JSON Schema).
 * This schema is used for tool registration so MCP clients can see the parameters.
 */
export const CopyExportSchemaBase = z.object({
  query: z.string().optional().describe("SELECT query for data to export"),
  sql: z.string().optional().describe("Alias for query parameter"),
  table: z
    .string()
    .optional()
    .describe(
      "Table name to export (auto-generates SELECT *). Supports 'schema.table' format",
    ),
  schema: z
    .string()
    .optional()
    .describe("Schema name when using table (default: public)"),
  format: z
    .string()
    .optional()
    .describe("Output format (csv, text, binary) (default: csv)"),
  header: z.boolean().optional().describe("Include header row (default: true)"),
  delimiter: z.string().optional().describe("Field delimiter"),
  limit: z
    .number()
    .optional()
    .describe(
      "Maximum number of rows to export (default: 500 to prevent large payloads). Use 0 for all rows",
    ),
});

/** Default limit for copyExport when not specified */
const DEFAULT_EXPORT_LIMIT = 500;

const CopyExportSchemaParser = CopyExportSchemaBase.extend({
  limit: z.preprocess(coerceNumber, z.number().optional()).optional(),
});

/**
 * Transformed schema with alias resolution, table shortcut, and schema.table parsing.
 */
export const CopyExportSchema = CopyExportSchemaParser.transform((input) => {
  // Apply alias: sql → query
  let query = input.query ?? input.sql;
  let conflictWarning: string | undefined;

  // Check for conflicting parameters
  if (
    (input.query !== undefined || input.sql !== undefined) &&
    input.table !== undefined
  ) {
    conflictWarning =
      "Both query and table parameters provided. Using query parameter (table ignored).";
  }

  // Resolve effective limit:
  // - undefined = use DEFAULT_EXPORT_LIMIT (500)
  // - 0 = no limit (export all rows)
  // - positive number = user-specified limit
  const effectiveLimit =
    input.limit === undefined
      ? DEFAULT_EXPORT_LIMIT
      : input.limit === 0
        ? undefined // 0 means no limit
        : input.limit;

  // Track whether we used the default limit (handler will check actual row count)
  let usedDefaultLimit = false;

  // Auto-generate query from table if provided
  if ((query === undefined || query === "") && input.table !== undefined) {
    // Parse schema.table format (e.g., 'public.users' -> schema='public', table='users')
    // If table contains a dot, always parse it as schema.table (embedded schema takes priority)
    let tableName = input.table;
    let schemaName = input.schema ?? "public";

    if (input.table.includes(".")) {
      const parts = input.table.split(".");
      if (parts.length === 2 && parts[0] && parts[1]) {
        schemaName = parts[0];
        tableName = parts[1];
      }
    }

    // Build query with LIMIT
    query = `SELECT * FROM "${schemaName}"."${tableName}"`;
    if (effectiveLimit !== undefined) {
      query += ` LIMIT ${String(effectiveLimit)}`;
      // Track if we're using the default limit (actual truncation determined in handler)
      if (input.limit === undefined) {
        usedDefaultLimit = true;
      }
    }
  } else if (query !== undefined && effectiveLimit !== undefined) {
    // If a custom query is provided and limit is specified, wrap or append LIMIT
    // Only append if query doesn't already have LIMIT
    if (!/\bLIMIT\s+\d+\s*$/i.test(query)) {
      query += ` LIMIT ${String(effectiveLimit)}`;
      // Track if we're using the default limit (actual truncation determined in handler)
      if (input.limit === undefined) {
        usedDefaultLimit = true;
      }
    }
  }

  if (query === undefined || query === "") {
    throw new Error("Either query/sql or table parameter is required");
  }
  return {
    ...input,
    query,
    conflictWarning,
    usedDefaultLimit,
    effectiveLimit,
  };
});

export const DumpSchemaSchema = z.object({
  table: z.string().optional().describe("Table name"),
  schema: z.string().optional().describe("Schema name"),
  filename: z
    .string()
    .optional()
    .describe("Output filename (default: backup.dump)"),
});

export const CreateBackupPlanSchemaBase = z.object({
  frequency: z
    .string()
    .optional()
    .describe("Backup frequency (hourly, daily, weekly) (default: daily)"),
  retention: z
    .number()
    .optional()
    .describe("Number of backups to retain (default: 7)"),
});

export const CreateBackupPlanSchema = z.object({
  frequency: z.string().optional(),
  retention: z.preprocess(coerceNumber, z.number().optional()).optional(),
});

export const PhysicalBackupSchemaBase = z.object({
  targetDir: z.string().optional().describe("Target directory for backup"),
  format: z.string().optional().describe("Backup format (plain, tar)"),
  checkpoint: z
    .string()
    .optional()
    .describe("Checkpoint mode (fast, spread)"),
  compress: z.number().optional().describe("Compression level 0-9"),
});

export const PhysicalBackupSchema = z.object({
  targetDir: z.string().optional(),
  format: z.string().optional(),
  checkpoint: z.string().optional(),
  compress: z.preprocess(coerceNumber, z.number().optional()).optional(),
});

// ============================================================================
// Output Schemas
// ============================================================================

/**
 * pg_dump_table output - DDL for table, sequence, or view
 */
export const DumpTableOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    ddl: z
      .string()
      .optional()
      .describe("DDL statement (CREATE TABLE/SEQUENCE/VIEW)"),
    type: z
      .string()
      .optional()
      .describe(
        "Object type: table, sequence, view, materialized_view, partitioned_table",
      ),
    note: z.string().optional().describe("Usage notes"),
    insertStatements: z
      .string()
      .optional()
      .describe("INSERT statements when includeData=true"),
    warning: z.string().optional().describe("Warning message"),
    error: z.string().optional().describe("Error message if operation failed"),
  })
  .loose();

/**
 * pg_dump_schema output - pg_dump command
 */
export const DumpSchemaOutputSchema = z
  .object({
    command: z.string().optional().describe("pg_dump command to run"),
    warning: z
      .string()
      .optional()
      .describe("Warning about schema+table combination"),
    formatWarning: z
      .string()
      .optional()
      .describe("Warning about .sql extension with custom format"),
    notes: z.array(z.string()).optional().describe("Usage notes"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .loose();

/**
 * pg_copy_export output - exported data
 */
export const CopyExportOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    data: z.string().optional().describe("Exported data (CSV or text format)"),
    rowCount: z.number().optional().describe("Number of rows exported"),
    truncated: z
      .boolean()
      .optional()
      .describe("Whether results were truncated"),
    limit: z.number().optional().describe("Limit that was applied"),
    note: z.string().optional().describe("Message when no rows returned"),
    warning: z
      .string()
      .optional()
      .describe("Warning about parameter conflicts"),
    error: z.string().optional().describe("Error message if operation failed"),
  })
  .loose();

/**
 * pg_copy_import output - COPY FROM command
 */
export const CopyImportOutputSchema = z.object({
  command: z.string().optional().describe("COPY FROM command"),
  stdinCommand: z.string().optional().describe("COPY FROM STDIN command"),
  notes: z.string().optional().describe("Usage notes"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

/**
 * pg_create_backup_plan output - backup strategy
 */
export const CreateBackupPlanOutputSchema = z.object({
  strategy: z
    .object({
      fullBackup: z.object({
        command: z.string().describe("pg_dump command with timestamp"),
        frequency: z.string().describe("Backup frequency"),
        cronSchedule: z.string().describe("Cron schedule expression"),
        retention: z.string().describe("Retention policy"),
      }),
      walArchiving: z.object({
        note: z.string().describe("WAL archiving recommendation"),
        configChanges: z
          .array(z.string())
          .describe("PostgreSQL config changes"),
      }),
    })
    .optional(),
  estimates: z
    .object({
      databaseSize: z.string().describe("Current database size"),
      backupSizeEach: z.string().describe("Estimated size per backup"),
      backupsPerDay: z
        .number()
        .optional()
        .describe("Backups per day (for hourly/daily)"),
      backupsPerWeek: z
        .number()
        .optional()
        .describe("Backups per week (for weekly)"),
      totalStorageNeeded: z.string().describe("Total storage needed"),
    })
    .loose()
    .optional(),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

/**
 * pg_restore_command output - pg_restore command
 */
export const RestoreCommandOutputSchema = z.object({
  command: z.string().optional().describe("pg_restore command"),
  warnings: z
    .array(z.string())
    .optional()
    .describe("Warnings about missing parameters"),
  notes: z.array(z.string()).optional().describe("Usage notes"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

/**
 * pg_backup_physical output - pg_basebackup command
 */
export const PhysicalBackupOutputSchema = z.object({
  command: z.string().optional().describe("pg_basebackup command"),
  notes: z.array(z.string()).optional().describe("Usage notes"),
  requirements: z
    .array(z.string())
    .optional()
    .describe("PostgreSQL requirements"),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

/**
 * pg_restore_validate output - validation steps
 */
export const RestoreValidateOutputSchema = z
  .object({
    note: z.string().optional().describe("Default type note"),
    validationSteps: z
      .array(
        z
          .object({
            step: z.number().describe("Step number"),
            name: z.string().describe("Step name"),
            command: z.string().optional().describe("Command to run"),
            commands: z
              .array(z.string())
              .optional()
              .describe("Multiple commands"),
            note: z.string().optional().describe("Step note"),
          })
          .loose(),
      )
      .optional(),
    recommendations: z
      .array(z.string())
      .optional()
      .describe("Best practice recommendations"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .loose();

/**
 * pg_backup_schedule_optimize output - schedule analysis
 */
export const BackupScheduleOptimizeOutputSchema = z.object({
  analysis: z
    .object({
      databaseSize: z.unknown().describe("Database size"),
      totalChanges: z.number().describe("Total DML changes since stats reset"),
      changeVelocity: z.number().describe("Change velocity ratio"),
      changeVelocityRatio: z.string().describe("Change velocity as percentage"),
      activityByHour: z
        .array(
          z.object({
            hour: z.number().describe("Hour of day"),
            connection_count: z.number().describe("Connection count"),
          }),
        )
        .optional()
        .describe("Connection activity by hour"),
      activityNote: z.string().describe("Activity data caveat"),
    })
    .optional(),
  recommendation: z
    .object({
      strategy: z.string().describe("Recommended strategy"),
      fullBackupFrequency: z.string().describe("Full backup frequency"),
      incrementalFrequency: z.string().describe("Incremental/WAL frequency"),
      bestTimeForBackup: z.string().describe("Recommended backup time"),
      retentionPolicy: z.string().describe("Retention policy"),
    })
    .optional(),
  commands: z
    .object({
      cronSchedule: z.string().describe("Sample cron schedule"),
      walArchive: z.string().describe("WAL archive command"),
    })
    .optional(),
  success: z.boolean().optional().describe("Whether operation succeeded"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

/**
 * pg_audit_list_backups input schema
 */
export const AuditListBackupsSchemaBase = z.object({
  tool: z.string().optional().describe("Filter by tool name"),
  target: z.string().optional().describe("Filter by target object name"),
  limit: z.number().optional().describe("Max snapshots to return (default: 50, max: 500, use 0 for unlimited up to 500)"),
  compact: z.boolean().optional().describe("If true, omits full schema/type properties on the payload to save tokens (default: auto if > 20)"),
});

export const AuditListBackupsSchema = z.object({
  tool: z.string().optional(),
  target: z.string().optional(),
  limit: z.preprocess(coerceNumber, z.number().optional()).optional(),
  compact: z.boolean().optional(),
});

/**
 * pg_audit_restore_backup input schema
 */
export const AuditRestoreBackupSchema = z.object({
  filename: z.string().optional().describe("Snapshot filename from pg_audit_list_backups"),
  dryRun: z.boolean().optional().describe("If true, return the DDL without executing it (default: false)"),
  restoreAs: z
    .string()
    .optional()
    .describe(
      "Create snapshot as a new table with this name instead of overwriting the original. " +
      "Enables side-by-side comparison without disrupting live data.",
    ),
  confirm: z.boolean().optional().describe("Required confirmation flag for destructive restore operations"),
});

/**
 * pg_audit_diff_backup input schema
 */
export const AuditDiffBackupSchema = z.object({
  filename: z.string().optional().describe("Snapshot filename from pg_audit_list_backups"),
  compact: z.boolean().optional().default(true).describe("If true, omits full DDL strings from response to save tokens (default: true)"),
});

/**
 * pg_audit_list_backups output - list of snapshots
 */
export const AuditListBackupsOutputSchema = z.object({
  success: z.boolean().optional().describe("Whether the operation succeeded"),
  snapshots: z
    .array(
      z.object({
        timestamp: z.string().describe("ISO 8601 snapshot timestamp"),
        tool: z.string().describe("Tool that triggered the snapshot"),
        target: z.string().describe("Target object"),
        schema: z.string().optional().describe("Schema of target"),
        type: z.enum(["ddl", "ddl+data"]).describe("Snapshot type"),
        requestId: z.string().optional().describe("Audit request ID"),
        sizeBytes: z.number().optional().describe("Snapshot file size"),
        filename: z.string().optional().describe("Snapshot filename for restore/diff"),
      }),
    )
    .optional()
    .describe("Available backup snapshots"),
  count: z.number().optional().describe("Number of snapshots returned"),
  truncated: z.boolean().optional().describe("Whether results were truncated by limit"),
  limit: z.number().optional().describe("Limit that was applied"),
  error: z.string().optional().describe("Error message if failed"),
}).extend(ErrorResponseFields.shape);

/**
 * pg_audit_restore_backup output - restore result
 */
export const AuditRestoreBackupOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    dryRun: z.boolean().optional().describe("Whether this was a dry run"),
    restored: z.boolean().optional().describe("Whether restore was executed"),
    metadata: z.record(z.string(), z.unknown()).optional().describe("Snapshot metadata"),
    ddl: z.string().optional().describe("DDL content (dry run only)"),
    ddlExecuted: z.boolean().optional().describe("Whether DDL was executed"),
    dataStatements: z.number().optional().describe("Number of data INSERT statements"),
    dataRowsInserted: z.number().optional().describe("Number of data rows inserted"),
    restoreAs: z.string().optional().describe("Side-by-side table name (when restoreAs was used)"),
    error: z.string().optional().describe("Error message if failed"),
    hint: z.string().optional().describe("Hint for next steps"),
  })
  .loose()
  .extend(ErrorResponseFields.shape);

/**
 * pg_audit_diff_backup output - schema drift comparison
 */
export const AuditDiffBackupOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    metadata: z.record(z.string(), z.unknown()).optional().describe("Snapshot metadata"),
    objectExists: z.boolean().optional().describe("Whether target object still exists"),
    hasDifferences: z.boolean().optional().describe("Whether schema or volume has drifted"),
    diff: z
      .object({
        additions: z.array(z.string()).optional().describe("Lines added since snapshot"),
        removals: z.array(z.string()).optional().describe("Lines removed since snapshot"),
      })
      .optional()
      .describe("Schema differences"),
    volumeDrift: z
      .object({
        rowCountSnapshot: z.number().optional().describe("Row count at snapshot time"),
        rowCountCurrent: z.number().optional().describe("Current row count"),
        sizeBytesSnapshot: z.number().optional().describe("Size in bytes at snapshot time"),
        sizeBytesCurrent: z.number().optional().describe("Current size in bytes"),
        summary: z.string().describe("Human-readable volume drift summary"),
      })
      .optional()
      .describe("Data volume drift since snapshot"),
    snapshotDdl: z.string().optional().describe("DDL from snapshot"),
    currentDdl: z.string().optional().describe("Current live DDL"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .loose()
  .extend(ErrorResponseFields.shape);
