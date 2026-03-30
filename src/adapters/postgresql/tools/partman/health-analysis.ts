/**
 * PostgreSQL pg_partman Extension Tools - Health Analysis
 *
 * Analyzes partition health and provides recommendations.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { 
  PartmanAnalyzeHealthOutputSchema,
  PartmanAnalyzeHealthSchemaBase,
  PartmanAnalyzeHealthSchema
} from "../../schemas/index.js";
import { getPartmanSchema, DEFAULT_PARTMAN_LIMIT, checkTableExists } from "./helpers.js";

/**
 * Analyze partition health and provide recommendations
 */
export function createPartmanAnalyzeHealthTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_partman_analyze_partition_health",
    description: `Analyze the health of partition sets managed by pg_partman.
Checks for issues like data in default partitions, missing premake partitions,
stale maintenance, and retention configuration.`,
    group: "partman",
    inputSchema: PartmanAnalyzeHealthSchemaBase,
    outputSchema: PartmanAnalyzeHealthOutputSchema,
    annotations: readOnly("Analyze Partition Health"),
    icons: getToolIcons("partman", readOnly("Analyze Partition Health")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = PartmanAnalyzeHealthSchema.parse(params) as {
          parentTable?: string;
          limit?: number;
        };
        const queryParams: unknown[] = [];
        const partmanSchema = await getPartmanSchema(adapter);

        // Get total count first for pagination
        let countSql = `SELECT COUNT(*) as total FROM ${partmanSchema}.part_config`;
        const countParams: unknown[] = [];
        if (parsed.parentTable !== undefined) {
          countSql += " WHERE parent_table = $1";
          countParams.push(parsed.parentTable);
        }
        const countResult = await adapter.executeQuery(countSql, countParams);
        const totalCount = Number(countResult.rows?.[0]?.["total"] ?? 0);

        // Apply limit (default 50, 0 means no limit)
        const rawLimit = parsed.limit ?? DEFAULT_PARTMAN_LIMIT;
        const limit = isNaN(rawLimit) ? DEFAULT_PARTMAN_LIMIT : rawLimit;
        const applyLimit = limit > 0;

        let configSql = `
                SELECT
                    parent_table,
                    control,
                    partition_interval,
                    premake,
                    retention,
                    retention_keep_table,
                    automatic_maintenance,
                    template_table
                FROM ${partmanSchema}.part_config
            `;
        if (parsed.parentTable !== undefined) {
          configSql += " WHERE parent_table = $1";
          queryParams.push(parsed.parentTable);
        }
        configSql += " ORDER BY parent_table";
        if (applyLimit) {
          configSql += ` LIMIT ${String(limit)}`;
        }

        const configResult = await adapter.executeQuery(configSql, queryParams);
        const configs = configResult.rows ?? [];

        // If a specific table was requested
        if (parsed.parentTable !== undefined) {
          // Check if it exists (P154)
          if (!(await checkTableExists(adapter, parsed.parentTable))) {
            return {
              success: false,
              error: `Table '${parsed.parentTable}' does not exist.`,
              code: "TABLE_NOT_FOUND",
              category: "validation",
              suggestion: "Check that you specified the correct schema and table name."
            };
          }

          // If it exists but has no pg_partman config
          if (configs.length === 0) {
            return {
              success: false,
              error: `No pg_partman configuration found for table '${parsed.parentTable}'.`,
              code: "VALIDATION_ERROR",
              category: "validation",
              suggestion: "Use pg_partman_show_config to list configured partition sets, or pg_partman_create_parent to configure partitioning for this table."
            };
          }
        }

        const healthChecks: {
          parentTable: string;
          issues: string[];
          warnings: string[];
          recommendations: string[];
          partitionCount: number;
          hasDefaultPartition: boolean;
          hasDataInDefault: boolean;
        }[] = [];

        for (const config of configs) {
          const parentTable = config["parent_table"] as string;
          const issues: string[] = [];
          const warnings: string[] = [];
          const recommendations: string[] = [];

          const tableExists = await checkTableExists(adapter, parentTable);

          if (!tableExists) {
            // Orphaned config - table no longer exists
            healthChecks.push({
              parentTable,
              issues: [
                "Orphaned configuration - parent table no longer exists",
              ],
              warnings: [],
              recommendations: [
                "Remove orphaned config from part_config table or recreate the table",
              ],
              partitionCount: 0,
              hasDefaultPartition: false,
              hasDataInDefault: false,
            });
            continue;
          }

          let partitionCount: number;
          try {
            const partCountResult = await adapter.executeQuery(
              `
                        SELECT COUNT(*) as count
                        FROM ${partmanSchema}.show_partitions(p_parent_table := $1)
                    `,
              [parentTable],
            );
            partitionCount = Number(partCountResult.rows?.[0]?.["count"] ?? 0);
          } catch (e: unknown) {
            // If show_partitions fails, provide detailed error info
            const errorMsg = e instanceof Error ? e.message : "Unknown error";
            healthChecks.push({
              parentTable,
              issues: [`Failed to query partitions: ${errorMsg}`],
              warnings: [],
              recommendations: [
                "Check that the table exists and is partitioned",
                "Verify pg_partman configuration with pg_partman_show_config",
                "If table was dropped, remove orphaned config from part_config",
              ],
              partitionCount: 0,
              hasDefaultPartition: false,
              hasDataInDefault: false,
            });
            continue;
          }

          const premake = (config["premake"] as number) ?? 4;
          if (partitionCount < premake) {
            warnings.push(
              `Only ${String(partitionCount)} partitions exist, premake is set to ${String(premake)}`,
            );
            recommendations.push(
              "Run pg_partman_run_maintenance to create premake partitions",
            );
          }

          // Check if default partition exists
          const defaultCheckResult = await adapter.executeQuery(
            `
                    SELECT c.relname as default_partition, pn.nspname as default_schema
                    FROM pg_inherits i
                    JOIN pg_class c ON c.oid = i.inhrelid
                    JOIN pg_class p ON p.oid = i.inhparent
                    JOIN pg_namespace pn ON pn.oid = p.relnamespace
                    WHERE (pn.nspname || '.' || p.relname) = $1
                      AND c.relname LIKE '%_default'
                `,
            [parentTable],
          );

          const hasDefaultPartition =
            (defaultCheckResult.rows?.length ?? 0) > 0;
          let hasDataInDefault = false;

          // Use actual COUNT(*) instead of reltuples estimate — reltuples
          // returns 0 or -1 for recently-inserted data before ANALYZE runs
          if (hasDefaultPartition) {
            const defSchema = defaultCheckResult.rows?.[0]?.[
              "default_schema"
            ] as string;
            const defTable = defaultCheckResult.rows?.[0]?.[
              "default_partition"
            ] as string;
            try {
              const countResult = await adapter.executeQuery(
                `SELECT COUNT(*) as count FROM (SELECT 1 FROM ${defSchema}.${defTable} LIMIT 1) t`,
              );
              hasDataInDefault =
                Number(countResult.rows?.[0]?.["count"] ?? 0) > 0;
            } catch {
              // Default partition might not be accessible
            }
          }

          if (hasDataInDefault) {
            issues.push("Data found in default partition");
            recommendations.push(
              "Run pg_partman_partition_data to move data to child partitions",
            );
          }

          // Note: Not having retention configured is often intentional (audit tables, etc.)
          // Don't flag as warning to reduce noise; users can check config directly if needed

          const autoMaint = config["automatic_maintenance"] as string;
          if (autoMaint !== "on") {
            warnings.push("Automatic maintenance is not enabled");
            recommendations.push(
              "Schedule regular maintenance with pg_cron or enable automatic_maintenance",
            );
          }

          healthChecks.push({
            parentTable,
            issues,
            warnings,
            recommendations,
            partitionCount,
            hasDefaultPartition,
            hasDataInDefault,
          });
        }

        const totalIssues = healthChecks.reduce(
          (sum, h) => sum + h.issues.length,
          0,
        );
        const totalWarnings = healthChecks.reduce(
          (sum, h) => sum + h.warnings.length,
          0,
        );

        const truncated = applyLimit && totalCount > limit;

        return {
          partitionSets: healthChecks,
          truncated,
          totalCount,
          summary: {
            totalPartitionSets: truncated ? totalCount : healthChecks.length,
            totalIssues,
            totalWarnings,
            overallHealth:
              totalIssues === 0
                ? totalWarnings === 0
                  ? "healthy"
                  : "warnings"
                : "issues_found",
          },
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_partman_analyze_partition_health",
          });
      }
    },
  };
}
