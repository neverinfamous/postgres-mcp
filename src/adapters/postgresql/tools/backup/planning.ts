/**
 * PostgreSQL Backup Tools - Planning
 *
 * Backup planning tools: backup_plan, restore_command, physical_backup, restore_validate, backup_schedule_optimize.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatPostgresError } from "../core/error-helpers.js";
import {
  CreateBackupPlanOutputSchema,
  RestoreCommandOutputSchema,
  PhysicalBackupOutputSchema,
  RestoreValidateOutputSchema,
  BackupScheduleOptimizeOutputSchema,
} from "../../schemas/index.js";

export function createBackupPlanTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_create_backup_plan",
    description:
      "Generate a backup strategy recommendation with cron schedule.",
    group: "backup",
    inputSchema: z.object({
      frequency: z
        .enum(["hourly", "daily", "weekly"])
        .optional()
        .describe("Backup frequency (default: daily)"),
      retention: z
        .number()
        .optional()
        .describe("Number of backups to retain (default: 7)"),
    }),
    outputSchema: CreateBackupPlanOutputSchema,
    annotations: readOnly("Create Backup Plan"),
    icons: getToolIcons("backup", readOnly("Create Backup Plan")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Parse params through schema to validate enum values
        const schema = z.object({
          frequency: z.enum(["hourly", "daily", "weekly"]).optional(),
          retention: z.number().optional(),
        });
        const parsed = schema.parse(params);
        const freq = parsed.frequency ?? "daily";

        // Validate retention - must be at least 1
        if (parsed.retention !== undefined && parsed.retention < 1) {
          throw new Error(
            "retention must be at least 1 (cannot retain zero or negative backups)",
          );
        }
        const retention = parsed.retention ?? 7;

        // Generate cron schedule based on frequency
        const getCronSchedule = (frequency: string): string => {
          switch (frequency) {
            case "hourly":
              return "0 * * * *"; // Every hour at minute 0
            case "weekly":
              return "0 2 * * 0"; // Sundays at 2 AM
            default:
              return "0 2 * * *"; // Daily at 2 AM
          }
        };
        const cronSchedule = getCronSchedule(freq);

        const sizeResult = await adapter.executeQuery(
          `SELECT pg_database_size(current_database()) as bytes`,
        );
        const sizeBytes = Number(sizeResult.rows?.[0]?.["bytes"] ?? 0);
        const sizeGB = (sizeBytes / (1024 * 1024 * 1024)).toFixed(2);

        return {
          strategy: {
            fullBackup: {
              // Use timestamp with hours/minutes for hourly backups to prevent overwrites
              command:
                freq === "hourly"
                  ? "pg_dump --format=custom --verbose --file=backup_$(date +%Y%m%d_%H%M).dump $POSTGRES_CONNECTION_STRING"
                  : "pg_dump --format=custom --verbose --file=backup_$(date +%Y%m%d).dump $POSTGRES_CONNECTION_STRING",
              frequency: freq,
              cronSchedule,
              retention: `${String(retention)} backups`,
            },
            walArchiving: {
              note: "Enable archive_mode and archive_command for point-in-time recovery",
              configChanges: [
                "archive_mode = on",
                "archive_command = 'cp %p /path/to/wal_archive/%f'",
              ],
            },
          },
          estimates: {
            databaseSize: `${sizeGB} GB`,
            // Per-backup size is ~30% of database due to compression
            backupSizeEach: `~${(Number(sizeGB) * 0.3).toFixed(2)} GB (compressed)`,
            // Use appropriate frequency label
            ...(freq === "weekly"
              ? { backupsPerWeek: 1 }
              : { backupsPerDay: freq === "hourly" ? 24 : 1 }),
            // Total = size per backup * retention count
            totalStorageNeeded: `~${(Number(sizeGB) * 0.3 * retention).toFixed(2)} GB (${String(retention)} backups retained)`,
          },
        };
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_create_backup_plan" }),
        };
      }
    },
  };
}

export function createRestoreCommandTool(
  _adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_restore_command",
    description: "Generate pg_restore command for restoring backups.",
    group: "backup",
    inputSchema: z.object({
      backupFile: z.string(),
      database: z
        .string()
        .optional()
        .describe("Target database name (required for complete command)"),
      schema: z.string().optional(),
      table: z.string().optional(),
      dataOnly: z.boolean().optional(),
      schemaOnly: z.boolean().optional(),
    }),
    outputSchema: RestoreCommandOutputSchema,
    annotations: readOnly("Restore Command"),
    icons: getToolIcons("backup", readOnly("Restore Command")),
    handler: (params: unknown, _context: RequestContext) => {
      try {
        return Promise.resolve()
          .then(() => {
            const parsed = params as {
              backupFile?: string;
              database?: string;
              schema?: string;
              table?: string;
              dataOnly?: boolean;
              schemaOnly?: boolean;
            };

            // Validate required param
            if (parsed.backupFile === undefined || parsed.backupFile === "") {
              throw new Error("backupFile parameter is required");
            }

            // Validate mutually exclusive options
            if (parsed.dataOnly === true && parsed.schemaOnly === true) {
              throw new Error(
                "dataOnly and schemaOnly cannot both be true - pg_restore only supports one at a time",
              );
            }

            let command = "pg_restore --verbose";
            const warnings: string[] = [];

            if (parsed.database !== undefined) {
              command += ` --dbname="${parsed.database}"`;
            } else {
              warnings.push(
                "No database specified - add --dbname=DBNAME to run this command",
              );
            }
            if (parsed.schema !== undefined)
              command += ` --schema="${parsed.schema}"`;
            if (parsed.table !== undefined)
              command += ` --table="${parsed.table}"`;
            if (parsed.dataOnly === true) command += " --data-only";
            if (parsed.schemaOnly === true) command += " --schema-only";

            command += ` "${parsed.backupFile}"`;

            return {
              command,
              ...(warnings.length > 0 && { warnings }),
              notes: [
                "Add --clean to drop database objects before recreating",
                "Add --if-exists to avoid errors on drop",
                "Add --no-owner to skip ownership commands",
                "Use -j N for parallel restore (N workers)",
                "For remote restores, add -h HOST -p PORT -U USER to the command",
              ],
            };
          })
          .catch((error: unknown) => ({
            success: false as const,
            error: formatPostgresError(error, { tool: "pg_restore_command" }),
          }));
      } catch (error: unknown) {
        return Promise.resolve({
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_restore_command" }),
        });
      }
    },
  };
}

/**
 * Generate pg_basebackup command for physical backup
 */
export function createPhysicalBackupTool(
  _adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_backup_physical",
    description: "Generate pg_basebackup command for physical (binary) backup.",
    group: "backup",
    inputSchema: z.object({
      targetDir: z.string().describe("Target directory for backup"),
      format: z.enum(["plain", "tar"]).optional().describe("Backup format"),
      checkpoint: z
        .enum(["fast", "spread"])
        .optional()
        .describe("Checkpoint mode"),
      compress: z.number().optional().describe("Compression level 0-9"),
    }),
    outputSchema: PhysicalBackupOutputSchema,
    annotations: readOnly("Physical Backup"),
    icons: getToolIcons("backup", readOnly("Physical Backup")),
    handler: (params: unknown, _context: RequestContext) => {
      try {
        return Promise.resolve()
          .then(() => {
            // Parse params through schema to validate enum values
            const schema = z.object({
              targetDir: z.string().optional(),
              format: z.enum(["plain", "tar"]).optional(),
              checkpoint: z.enum(["fast", "spread"]).optional(),
              compress: z.number().optional(),
            });
            const parsed = schema.parse(params);

            // Validate required param
            if (parsed.targetDir === undefined || parsed.targetDir === "") {
              throw new Error("targetDir parameter is required");
            }

            // Validate compress range
            if (
              parsed.compress !== undefined &&
              (parsed.compress < 0 || parsed.compress > 9)
            ) {
              throw new Error("compress must be between 0 and 9");
            }

            let command = "pg_basebackup";
            command += ` -D "${parsed.targetDir}"`;
            // Set format flag: plain (-Fp) if specified, otherwise tar (-Ft) as default
            command += parsed.format === "plain" ? " -Fp" : " -Ft";
            command += " -Xs";
            command += " -P";

            if (parsed.checkpoint === "fast") {
              command += " -c fast";
            } else if (parsed.checkpoint === "spread") {
              command += " -c spread";
            }

            if (parsed.compress !== undefined && parsed.compress > 0) {
              // Use only -Z (--compress) with level, not -z (which is redundant)
              command += ` -Z ${String(parsed.compress)}`;
            }

            // Connection flags should be provided by user or via environment
            command +=
              " -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-postgres}";

            return {
              command,
              notes: [
                "Set PGHOST, PGPORT, PGUSER environment variables or replace the placeholders directly",
                "Requires replication connection permission",
                "Modify -h/-U flags above to change connection target",
                "Add --slot=NAME to use a replication slot",
                "Physical backups capture the entire cluster",
                parsed.format === "plain"
                  ? "Plain format (-Fp): Creates directory structure with individual data files"
                  : "Tar format (-Ft): Creates single compressed archive file",
              ],
              requirements: [
                "wal_level = replica (or higher)",
                "max_wal_senders > 0",
                "pg_hba.conf must allow replication connections",
              ],
            };
          })
          .catch((error: unknown) => ({
            success: false as const,
            error: formatPostgresError(error, { tool: "pg_backup_physical" }),
          }));
      } catch (error: unknown) {
        return Promise.resolve({
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_backup_physical" }),
        });
      }
    },
  };
}

/**
 * Validate backup restorability
 */
export function createRestoreValidateTool(
  _adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_restore_validate",
    description:
      "Generate commands to validate backup integrity and restorability.",
    group: "backup",
    inputSchema: z.object({
      backupFile: z.string().describe("Path to backup file"),
      backupType: z.enum(["pg_dump", "pg_basebackup"]).optional(),
    }),
    outputSchema: RestoreValidateOutputSchema,
    annotations: readOnly("Restore Validate"),
    icons: getToolIcons("backup", readOnly("Restore Validate")),
    handler: (params: unknown, _context: RequestContext) => {
      try {
        return Promise.resolve()
          .then(() => {
            // Parse params through schema to validate enum values
            const schema = z.object({
              backupFile: z.string().optional(),
              backupType: z.enum(["pg_dump", "pg_basebackup"]).optional(),
            });
            const parsed = schema.parse(params);

            // Validate required param
            if (parsed.backupFile === undefined || parsed.backupFile === "") {
              throw new Error("backupFile parameter is required");
            }

            const backupType = parsed.backupType ?? "pg_dump";
            const defaultUsed = parsed.backupType === undefined;

            if (backupType === "pg_dump") {
              return {
                ...(defaultUsed && {
                  note: "No backupType specified - defaulting to pg_dump validation steps",
                }),
                validationSteps: [
                  {
                    step: 1,
                    name: "Check backup file integrity",
                    command: `pg_restore --list "${parsed.backupFile}"`,
                  },
                  {
                    step: 2,
                    name: "Test restore to temporary database",
                    commands: [
                      "createdb test_restore",
                      `pg_restore --dbname=test_restore "${parsed.backupFile}"`,
                      "-- Run validation queries",
                      "dropdb test_restore",
                    ],
                  },
                  {
                    step: 3,
                    name: "Verify table counts match",
                    note: "Compare pg_class counts between source and restored database",
                  },
                ],
                recommendations: [
                  "Automate validation as part of backup workflow",
                  "Keep validation logs for compliance",
                  "Test restores regularly, not just during incidents",
                ],
              };
            } else {
              return {
                validationSteps: [
                  {
                    step: 1,
                    name: "Verify backup with pg_verifybackup (PostgreSQL 13+)",
                    command: `pg_verifybackup "${parsed.backupFile}"`,
                  },
                  {
                    step: 2,
                    name: "Verify base backup files",
                    command: `ls -la "${parsed.backupFile}"/`,
                  },
                  {
                    step: 3,
                    name: "Check backup_label file",
                    command: `cat "${parsed.backupFile}"/backup_label`,
                  },
                  {
                    step: 4,
                    name: "Test recovery in isolated environment",
                    note: "Configure recovery.conf/recovery.signal and start standby",
                  },
                ],
                recommendations: [
                  "pg_verifybackup validates checksums (requires data checksums enabled)",
                  "Maintain WAL archives for point-in-time recovery testing",
                  "Document recovery procedures and test quarterly",
                ],
              };
            }
          })
          .catch((error: unknown) => ({
            success: false as const,
            error: formatPostgresError(error, { tool: "pg_restore_validate" }),
          }));
      } catch (error: unknown) {
        return Promise.resolve({
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_restore_validate" }),
        });
      }
    },
  };
}

/**
 * Optimize backup schedule
 */
export function createBackupScheduleOptimizeTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_backup_schedule_optimize",
    description:
      "Analyze database activity patterns and recommend optimal backup schedule.",
    group: "backup",
    inputSchema: z.object({}),
    outputSchema: BackupScheduleOptimizeOutputSchema,
    annotations: readOnly("Backup Schedule Optimize"),
    icons: getToolIcons("backup", readOnly("Backup Schedule Optimize")),
    handler: async (_params: unknown, _context: RequestContext) => {
      try {
        const [dbSize, changeRate, connActivity] = await Promise.all([
          adapter.executeQuery(`
                    SELECT
                        pg_database_size(current_database()) as size_bytes,
                        pg_size_pretty(pg_database_size(current_database())) as size
                `),
          adapter.executeQuery(`
                    SELECT
                        sum(n_tup_ins + n_tup_upd + n_tup_del) as total_changes,
                        sum(n_live_tup) as total_rows
                    FROM pg_stat_user_tables
                `),
          adapter.executeQuery(`
                    SELECT
                        extract(hour from backend_start) as hour,
                        count(*) as connection_count
                    FROM pg_stat_activity
                    WHERE backend_type = 'client backend'
                    GROUP BY extract(hour from backend_start)
                    ORDER BY hour
                `),
        ]);

        const sizeBytes = Number(dbSize.rows?.[0]?.["size_bytes"] ?? 0);
        const totalChanges = Number(
          changeRate.rows?.[0]?.["total_changes"] ?? 0,
        );
        const totalRows = Number(changeRate.rows?.[0]?.["total_rows"] ?? 1);
        const changePercent = (totalChanges / Math.max(totalRows, 1)) * 100;

        let strategy: string;
        let fullBackupFrequency: string;
        let incrementalFrequency: string;

        if (sizeBytes > 100 * 1024 * 1024 * 1024) {
          strategy = "Large database - use incremental/WAL-based backups";
          fullBackupFrequency = "Weekly";
          incrementalFrequency = "Continuous WAL archiving";
        } else if (changePercent > 50) {
          strategy = "High change rate - frequent backups recommended";
          fullBackupFrequency = "Daily";
          incrementalFrequency = "Every 6 hours";
        } else if (changePercent > 10) {
          strategy = "Moderate activity - standard backup schedule";
          fullBackupFrequency = "Daily";
          incrementalFrequency = "Every 12 hours";
        } else {
          strategy = "Low activity - conservative backup schedule";
          fullBackupFrequency = "Daily";
          incrementalFrequency = "Not required";
        }

        return {
          analysis: {
            databaseSize: dbSize.rows?.[0]?.["size"],
            totalChanges,
            // This is change velocity (total DML operations / current rows) - can exceed 100% for high-churn tables
            changeVelocity: Number(changePercent.toFixed(2)),
            changeVelocityRatio: changePercent.toFixed(2) + "%",
            activityByHour: connActivity.rows?.map((row) => ({
              hour: Number(row["hour"]),
              connection_count: Number(row["connection_count"]),
            })),
            activityNote:
              "Activity data reflects current session connections only, not historical patterns",
          },
          recommendation: {
            strategy,
            fullBackupFrequency,
            incrementalFrequency,
            bestTimeForBackup: "Off-peak hours (typically 2-4 AM local time)",
            retentionPolicy: "Keep 7 daily, 4 weekly, 12 monthly",
          },
          commands: {
            cronSchedule: `0 2 * * * pg_dump -Fc -f /backups/daily_$(date +\\%Y\\%m\\%d).dump $POSTGRES_CONNECTION_STRING`,
            walArchive:
              "archive_command = 'test ! -f /wal_archive/%f && cp %p /wal_archive/%f'",
          },
        };
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, {
            tool: "pg_backup_schedule_optimize",
          }),
        };
      }
    },
  };
}
