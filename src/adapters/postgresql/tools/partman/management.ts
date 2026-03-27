/**
 * PostgreSQL pg_partman Extension Tools - Management & Inspection
 *
 * Runtime management and partition inspection tools.
 * 3 tools: run_maintenance, show_partitions, show_config.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import {
  type ToolDefinition,
  type RequestContext,
  ValidationError,
} from "../../../../types/index.js";
import { readOnly, write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  PartmanRunMaintenanceSchema,
  PartmanRunMaintenanceSchemaBase,
  PartmanShowPartitionsSchema,
  PartmanShowPartitionsSchemaBase,
  PartmanShowConfigSchema,
  PartmanShowConfigSchemaBase,
  // Output schemas
  PartmanRunMaintenanceOutputSchema,
  PartmanShowPartitionsOutputSchema,
  PartmanShowConfigOutputSchema,
} from "../../schemas/index.js";
import { getPartmanSchema, DEFAULT_PARTMAN_LIMIT } from "./helpers.js";

/**
 * Run partition maintenance
 */
export function createPartmanRunMaintenanceTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_partman_run_maintenance",
    description: `Run partition maintenance to create new child partitions and enforce retention policies.
Should be executed regularly (e.g., via pg_cron) to keep partitions current.
Maintains all partition sets if no specific parent table is specified.`,
    group: "partman",
    inputSchema: PartmanRunMaintenanceSchemaBase,
    outputSchema: PartmanRunMaintenanceOutputSchema,
    annotations: write("Run Partition Maintenance"),
    icons: getToolIcons("partman", write("Run Partition Maintenance")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { parentTable, analyze } =
          PartmanRunMaintenanceSchema.parse(params);

        const partmanSchema = await getPartmanSchema(adapter);

        // If specific table provided, validate and run maintenance directly
        if (parentTable !== undefined) {
          // Check if table has a pg_partman configuration
          const configCheck = await adapter.executeQuery(
            `SELECT 1 FROM ${partmanSchema}.part_config WHERE parent_table = $1`,
            [parentTable],
          );

          if ((configCheck.rows?.length ?? 0) === 0) {
            throw new ValidationError(
              `Table '${parentTable}' is not managed by pg_partman.`,
              {
                parentTable,
                hint: "Use pg_partman_create_parent to set up partitioning, or pg_partman_show_config to list managed tables.",
              }
            );
          }

          const args: string[] = [`p_parent_table := '${parentTable}'`];
          if (analyze !== undefined) {
            args.push(`p_analyze := ${String(analyze)}`);
          }

          try {
            const sql = `SELECT ${partmanSchema}.run_maintenance(${args.join(", ")})`;
            await adapter.executeQuery(sql);

            return {
              success: true,
              parentTable,
              analyze: analyze ?? true,
              message: `Maintenance completed for ${parentTable}`,
            };
          } catch (e: unknown) {
            // Extract clean error message (first line only, remove PL/pgSQL context)
            let errorMsg = e instanceof Error ? e.message : String(e);
            const fullError = errorMsg;
            errorMsg = errorMsg.split("\n")[0] ?? errorMsg;
            errorMsg = errorMsg.replace(/\s+CONTEXT:.*$/i, "").trim();

            // Catch pg_partman internal errors about NULL child tables
            if (
              fullError.includes("Child table given does not exist") ||
              fullError.includes("<NULL>")
            ) {
              throw new ValidationError("Partition set has no child partitions yet.", {
                parentTable,
                hint:
                  "For new partition sets, ensure startPartition is valid for your data. " +
                  "Insert data first, then run maintenance, or specify a valid startPartition when creating the parent.",
              });
            }

            // Return clean error response instead of throwing with stack trace
            throw new ValidationError(errorMsg, {
              parentTable,
              hint:
                "Check that the parent table exists, is properly partitioned, and has valid pg_partman configuration. " +
                "Use pg_partman_show_config to verify configuration.",
            });
          }
        }

        // For all partition sets, iterate ourselves to handle orphaned configs gracefully
        const configsResult = await adapter.executeQuery(`
                SELECT parent_table FROM ${partmanSchema}.part_config
            `);

        const configs = configsResult.rows ?? [];
        const maintained: string[] = [];
        const orphanedTables: string[] = [];
        const errors: {
          table: string;
          reason: string;
        }[] = [];

        for (const config of configs) {
          const table = config["parent_table"] as string;

          // Check if table still exists
          const [schema, tableName] = table.includes(".")
            ? [table.split(".")[0], table.split(".")[1]]
            : ["public", table];

          const tableExistsResult = await adapter.executeQuery(
            `
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = $1 AND table_name = $2
                `,
            [schema, tableName],
          );

          if ((tableExistsResult.rows?.length ?? 0) === 0) {
            orphanedTables.push(table);
            continue;
          }

          // Run maintenance for this table
          try {
            const args: string[] = [`p_parent_table := '${table}'`];
            if (analyze !== undefined) {
              args.push(`p_analyze := ${String(analyze)}`);
            }
            const sql = `SELECT ${partmanSchema}.run_maintenance(${args.join(", ")})`;
            await adapter.executeQuery(sql);
            maintained.push(table);
          } catch (error: unknown) {
            // Extract clean error message (first line only, remove PL/pgSQL context)
            let reason =
              error instanceof Error ? error.message : "Unknown error";
            reason = reason.split("\n")[0] ?? reason;
            reason = reason.replace(/\s+CONTEXT:.*$/i, "").trim();

            // Improve NULL child error with actionable guidance
            if (reason.includes("Child table") && reason.includes("NULL")) {
              reason =
                "No child partitions exist yet. For empty tables, ensure startPartition was set when creating the partition set. " +
                'TIP: Use pg_partman_create_parent with startPartition (e.g., "now" or a specific date) to bootstrap partitions.';
            }

            errors.push({
              table,
              reason,
            });
          }
        }

        // Determine success status
        const skippedCount = orphanedTables.length + errors.length;
        const allFailed = maintained.length === 0 && skippedCount > 0;
        const partial = maintained.length > 0 && skippedCount > 0;

        return {
          success: !allFailed,
          partial: partial ? true : undefined,
          parentTable: "all",
          analyze: analyze ?? true,
          maintained,
          orphaned:
            orphanedTables.length > 0
              ? {
                  count: orphanedTables.length,
                  tables: orphanedTables,
                  hint: `Remove orphaned configs: DELETE FROM ${partmanSchema}.part_config WHERE parent_table = '<table_name>';`,
                }
              : undefined,
          errors: errors.length > 0 ? errors : undefined,
          message: allFailed
            ? `Maintenance failed for all ${String(skippedCount)} partition sets due to errors.`
            : skippedCount > 0
              ? `Maintenance completed for ${String(maintained.length)} partition sets. ${String(skippedCount)} skipped (${String(orphanedTables.length)} orphaned, ${String(errors.length)} errors).`
              : `Maintenance completed for all ${String(maintained.length)} partition sets`,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_partman_run_maintenance",
          });
      }
    },
  };
}

/**
 * Show partitions managed by pg_partman
 */
export function createPartmanShowPartitionsTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  // Default limit for partitions (consistent with other partman tools)
  const DEFAULT_PARTITION_LIMIT = DEFAULT_PARTMAN_LIMIT;

  return {
    name: "pg_partman_show_partitions",
    description:
      "List all child partitions for a partition set managed by pg_partman.",
    group: "partman",
    inputSchema: PartmanShowPartitionsSchemaBase,
    outputSchema: PartmanShowPartitionsOutputSchema,
    annotations: readOnly("Show Partman Partitions"),
    icons: getToolIcons("partman", readOnly("Show Partman Partitions")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = PartmanShowPartitionsSchema.parse(params) as {
          parentTable?: string;
          includeDefault?: boolean;
          order?: string;
          limit?: number;
        };
        const { parentTable, includeDefault, order } = parsed;
        const rawLimit = parsed.limit ?? DEFAULT_PARTITION_LIMIT;
        const limit = isNaN(rawLimit) ? DEFAULT_PARTITION_LIMIT : rawLimit;

        // parentTable is required - provide clear error if missing
        if (!parentTable) {
          throw new ValidationError(
            'parentTable parameter is required. Specify the parent table (e.g., "public.events") to list its partitions.',
            { hint: "Use pg_partman_show_config to list all partition sets first." }
          );
        }

        const orderDir = order === "desc" ? "DESC" : "ASC";
        const includeDefaultVal = includeDefault ?? false;

        const partmanSchema = await getPartmanSchema(adapter);

        // First check if table is managed by pg_partman
        const configCheck = await adapter.executeQuery(
          `SELECT 1 FROM ${partmanSchema}.part_config WHERE parent_table = $1`,
          [parentTable],
        );

        if ((configCheck.rows?.length ?? 0) === 0) {
          throw new ValidationError(
            `Table '${parentTable}' is not managed by pg_partman.`,
            { hint: "Use pg_partman_create_parent to set up partitioning, or pg_partman_show_config to list managed tables." }
          );
        }

        // First get total count for pagination
        const countSql = `
                SELECT COUNT(*) as total FROM ${partmanSchema}.show_partitions(
                    p_parent_table := '${parentTable}',
                    p_include_default := ${String(includeDefaultVal)},
                    p_order := '${orderDir}'
                )
            `;
        const countResult = await adapter.executeQuery(countSql);
        const totalCount = Number(countResult.rows?.[0]?.["total"] ?? 0);

        // Apply limit (0 means no limit)
        const applyLimit = limit > 0;
        let sql = `
                SELECT * FROM ${partmanSchema}.show_partitions(
                    p_parent_table := '${parentTable}',
                    p_include_default := ${String(includeDefaultVal)},
                    p_order := '${orderDir}'
                )
            `;
        if (applyLimit) {
          sql += ` LIMIT ${String(limit)}`;
        }

        const result = await adapter.executeQuery(sql);
        const partitions = result.rows ?? [];
        const truncated = applyLimit && totalCount > limit;

        return {
          success: true,
          parentTable,
          partitions,
          count: partitions.length,
          truncated,
          totalCount,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_partman_show_partitions",
          });
      }
    },
  };
}

/**
 * Show partition configuration
 */
export function createPartmanShowConfigTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_partman_show_config",
    description:
      "View the configuration for a partition set from part_config table.",
    group: "partman",
    inputSchema: PartmanShowConfigSchemaBase,
    outputSchema: PartmanShowConfigOutputSchema,
    annotations: readOnly("Show Partman Config"),
    icons: getToolIcons("partman", readOnly("Show Partman Config")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = PartmanShowConfigSchema.parse(params);
        const partmanSchema = await getPartmanSchema(adapter);

        // Dynamically detect available columns to handle different pg_partman versions
        const columnsResult = await adapter.executeQuery(
          `
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = $1 AND table_name = 'part_config'
            `,
          [partmanSchema],
        );

        const availableColumns = new Set(
          (columnsResult.rows ?? []).map((r) => r["column_name"] as string),
        );

        // Build column list based on what's available
        const baseColumns = [
          "parent_table",
          "control",
          "partition_interval",
          "partition_type",
          "premake",
          "automatic_maintenance",
          "template_table",
          "retention",
          "retention_keep_table",
          "epoch",
          "default_table",
        ];

        // Add inherit_fk only if it exists (not in all pg_partman versions)
        const columns = baseColumns.filter((c) => availableColumns.has(c));
        if (availableColumns.has("inherit_fk")) {
          columns.push("inherit_fk");
        }

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

        let sql = `SELECT ${columns.join(", ")} FROM ${partmanSchema}.part_config`;

        const queryParams: unknown[] = [];
        if (parsed.parentTable !== undefined) {
          sql += " WHERE parent_table = $1";
          queryParams.push(parsed.parentTable);
        }

        sql += " ORDER BY parent_table";

        if (applyLimit) {
          sql += ` LIMIT ${String(limit)}`;
        }

        const result = await adapter.executeQuery(sql, queryParams);
        const configs = result.rows ?? [];

        // Check each config to see if parent table still exists (orphaned detection)
        const configsWithStatus = await Promise.all(
          configs.map(async (config) => {
            const parentTable = config["parent_table"] as string;
            const [schema, tableName] = parentTable.includes(".")
              ? [parentTable.split(".")[0], parentTable.split(".")[1]]
              : ["public", parentTable];

            const tableExistsResult = await adapter.executeQuery(
              `
                        SELECT 1 FROM information_schema.tables
                        WHERE table_schema = $1 AND table_name = $2
                    `,
              [schema, tableName],
            );

            const orphaned = (tableExistsResult.rows?.length ?? 0) === 0;
            return { ...config, orphaned };
          }),
        );

        const orphanedCount = configsWithStatus.filter(
          (c) => c.orphaned,
        ).length;
        const truncated = applyLimit && totalCount > limit;

        // Provide hint if a specific table was requested but not found
        let notFoundHint: string | undefined;
        if (
          parsed.parentTable !== undefined &&
          configsWithStatus.length === 0
        ) {
          notFoundHint = `Table '${parsed.parentTable}' is not managed by pg_partman. Use pg_partman_create_parent to set up partitioning.`;
        }

        return {
          configs: configsWithStatus,
          count: configsWithStatus.length,
          truncated,
          totalCount,
          orphanedCount: orphanedCount > 0 ? orphanedCount : undefined,
          hint:
            notFoundHint ??
            (orphanedCount > 0
              ? `${String(orphanedCount)} orphaned config(s) found - parent table no longer exists. ` +
                `To clean up, use raw SQL: DELETE FROM ${partmanSchema}.part_config WHERE parent_table = '<table_name>';`
              : undefined),
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_partman_show_config" });
      }
    },
  };
}
