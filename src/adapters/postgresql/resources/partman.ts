/**
 * pg_partman Status Resource
 *
 * Provides pg_partman partition set status, configuration, and health.
 */

import type { PostgresAdapter } from "../postgres-adapter.js";
import type { ResourceDefinition } from "../../../types/index.js";
import { LOW_PRIORITY } from "../../../utils/resource-annotations.js";

/** Safely convert unknown value to string */
function toStr(value: unknown): string {
  return typeof value === "string" ? value : "";
}

interface PartitionConfig {
  parent_table: string;
  control: string;
  partition_interval: string;
  retention: string | null;
  premake: number;
  datetime_string: string | null;
}

interface PartitionInfo {
  parent_table: string;
  partition_count: number;
  total_size: string;
  has_default: boolean;
  default_rows: number;
}

interface PartmanResourceData {
  extensionInstalled: boolean;
  extensionVersion: string | null;
  partitionSets: PartitionConfig[];
  partitionSetCount: number;
  partitionInfo: PartitionInfo[];
  healthIssues: {
    table: string;
    issue: string;
    severity: "warning" | "critical";
  }[];
  maintenanceScheduled: boolean;
  maintenanceJobCount: number;
  maintenanceMethod?: "pg_cron" | "external_or_none" | "unknown";
  recommendations: string[];
}

export function createPartmanResource(
  adapter: PostgresAdapter,
): ResourceDefinition {
  return {
    uri: "postgres://partman",
    name: "pg_partman Status",
    description:
      "pg_partman partition set configuration, partition counts, and health status",
    mimeType: "application/json",
    annotations: LOW_PRIORITY,
    handler: async (): Promise<string> => {
      const result: PartmanResourceData = {
        extensionInstalled: false,
        extensionVersion: null,
        partitionSets: [],
        partitionSetCount: 0,
        partitionInfo: [],
        healthIssues: [],
        maintenanceScheduled: false,
        maintenanceJobCount: 0,
        recommendations: [],
      };

      // Check if pg_partman is installed and get its schema (outside try-catch for correct error messaging)
      const extCheck = await adapter.executeQuery(
        `SELECT e.extversion, n.nspname as schema_name
                 FROM pg_extension e
                 JOIN pg_namespace n ON e.extnamespace = n.oid
                 WHERE e.extname = 'pg_partman'`,
      );

      if (!extCheck.rows || extCheck.rows.length === 0) {
        result.recommendations.push(
          "pg_partman extension is not installed. Use pg_partman_create_extension to enable automated partition management.",
        );
        return JSON.stringify(result, null, 2);
      }

      result.extensionInstalled = true;
      const extVersion = extCheck.rows[0]?.["extversion"];
      result.extensionVersion =
        typeof extVersion === "string" ? extVersion : null;

      // Get the schema where pg_partman is installed (defaults to 'partman' for compatibility)
      const partmanSchemaRaw = extCheck.rows[0]?.["schema_name"];
      const partmanSchema =
        typeof partmanSchemaRaw === "string" ? partmanSchemaRaw : "partman";

      try {
        // Get partition configurations using dynamically detected schema
        const configResult = await adapter.executeQuery(
          `SELECT parent_table, control, partition_interval::text, 
                            retention::text, premake, datetime_string
                     FROM "${partmanSchema}".part_config
                     ORDER BY parent_table`,
        );

        if (configResult.rows) {
          for (const row of configResult.rows) {
            const retentionVal = row["retention"];
            const datetimeVal = row["datetime_string"];
            result.partitionSets.push({
              parent_table: toStr(row["parent_table"]),
              control: toStr(row["control"]),
              partition_interval: toStr(row["partition_interval"]),
              retention: typeof retentionVal === "string" ? retentionVal : null,
              premake: Number(row["premake"] ?? 0),
              datetime_string:
                typeof datetimeVal === "string" ? datetimeVal : null,
            });
          }
          result.partitionSetCount = result.partitionSets.length;
        }

        // Get partition counts and sizes for each parent
        for (const config of result.partitionSets) {
          try {
            const infoResult = await adapter.executeQuery(
              `SELECT COUNT(*)::int as partition_count,
                                    pg_size_pretty(SUM(pg_total_relation_size(inhrelid))) as total_size
                             FROM pg_inherits
                             WHERE inhparent = $1::regclass`,
              [config.parent_table],
            );

            // Check for default partition with data
            const defaultCheck = await adapter.executeQuery(
              `SELECT EXISTS(
                                SELECT 1 FROM pg_partitioned_table pt
                                JOIN pg_class c ON pt.partrelid = c.oid
                                WHERE c.relname = split_part($1, '.', 2)
                                  AND pt.partdefid != 0
                             ) as has_default,
                             COALESCE((
                                SELECT n_live_tup::int FROM pg_stat_user_tables
                                WHERE schemaname || '.' || relname = $1 || '_default'
                             ), 0) as default_rows`,
              [config.parent_table],
            );

            const partitionCount = Number(
              infoResult.rows?.[0]?.["partition_count"] ?? 0,
            );
            const totalSizeVal = infoResult.rows?.[0]?.["total_size"];
            const totalSize =
              typeof totalSizeVal === "string" ? totalSizeVal : "0 bytes";
            const hasDefault = Boolean(defaultCheck.rows?.[0]?.["has_default"]);
            const defaultRows = Number(
              defaultCheck.rows?.[0]?.["default_rows"] ?? 0,
            );

            result.partitionInfo.push({
              parent_table: config.parent_table,
              partition_count: partitionCount,
              total_size: totalSize,
              has_default: hasDefault,
              default_rows: defaultRows,
            });

            // Check for data in default partition
            if (defaultRows > 0) {
              result.healthIssues.push({
                table: config.parent_table,
                issue: `Default partition contains ${String(defaultRows)} rows. Use pg_partman_partition_data to move to child partitions.`,
                severity: defaultRows > 10000 ? "critical" : "warning",
              });
            }

            // Check retention configuration - only warn for tables with many partitions
            // where unlimited retention is more likely to be an oversight
            if (config.retention === null && partitionCount > 12) {
              result.recommendations.push(
                `${config.parent_table}: No retention policy configured (${String(partitionCount)} partitions). Consider pg_partman_set_retention for cleanup, or ignore if unlimited retention is intended.`,
              );
            }
          } catch {
            // Individual table error, continue
          }
        }

        // Generate recommendations
        if (result.partitionSetCount === 0) {
          result.recommendations.push(
            "No partition sets configured. Use pg_partman_create_parent to create managed partitions.",
          );
        }

        // Check for maintenance scheduling with broader pattern matching
        try {
          const cronCheck = await adapter.executeQuery(
            `SELECT COUNT(*)::int as count FROM cron.job 
                         WHERE command ILIKE '%partman%' 
                            OR command ILIKE '%run_maintenance%'
                            OR command ILIKE '%partition%maintenance%'`,
          );

          const cronCount = Number(cronCheck.rows?.[0]?.["count"] ?? 0);
          result.maintenanceScheduled = cronCount > 0;
          result.maintenanceJobCount = cronCount;
          result.maintenanceMethod = cronCount > 0 ? "pg_cron" : "unknown";

          if (cronCount === 0 && result.partitionSetCount > 0) {
            result.recommendations.push(
              "No pg_cron job found for partition maintenance. Setup options:",
              "Option 1 - pg_cron (recommended): SELECT cron.schedule('partman-maintenance', '*/30 * * * *', $$CALL partman.run_maintenance_proc()$$);",
              'Option 2 - External: Add to system cron: */30 * * * * psql -c "CALL partman.run_maintenance_proc()"',
              "Run frequency: Every 30 minutes is typical. Adjust based on partition interval (faster intervals need more frequent runs).",
            );
          }
        } catch {
          // pg_cron not installed
          result.maintenanceMethod = "external_or_none";
          if (result.partitionSetCount > 0) {
            result.recommendations.push(
              "pg_cron not detected. Use external scheduling for maintenance:",
              'System cron example: */30 * * * * psql -d your_database -c "CALL partman.run_maintenance_proc()"',
              "Windows Task Scheduler: Run psql command every 30 minutes",
              "Alternatively, install pg_cron: shared_preload_libraries = 'pg_cron' in postgresql.conf then restart",
            );
          }
        }
      } catch {
        // Extension is installed but data queries failed
        result.recommendations.push(
          "Error querying pg_partman data. Check permissions on partman schema tables.",
        );
      }

      return JSON.stringify(result, null, 2);
    },
  };
}
