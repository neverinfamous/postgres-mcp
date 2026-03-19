/**
 * PostgreSQL pg_partman Extension Tools - Operations
 *
 * Partition data operations: check_default, partition_data.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly, write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  PartmanCheckDefaultSchema,
  PartmanCheckDefaultSchemaBase,
  PartmanPartitionDataSchema,
  PartmanPartitionDataSchemaBase,
  PartmanCheckDefaultOutputSchema,
  PartmanPartitionDataOutputSchema,
} from "../../schemas/index.js";
import { getPartmanSchema, callPartmanProcedure } from "./helpers.js";
/**
 * Check for data in default partition
 */
export function createPartmanCheckDefaultTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_partman_check_default",
    description: `Check if any data exists in the default partition that should be moved to child partitions.
Data in default indicates partitions may be missing for certain time/value ranges.`,
    group: "partman",
    inputSchema: PartmanCheckDefaultSchemaBase,
    outputSchema: PartmanCheckDefaultOutputSchema,
    annotations: readOnly("Check Partman Default"),
    icons: getToolIcons("partman", readOnly("Check Partman Default")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { parentTable } = PartmanCheckDefaultSchema.parse(params);

        // parentTable is required - provide clear error if missing
        if (!parentTable) {
          return {
            success: false,
            error:
              'parentTable parameter is required. Specify the parent table (e.g., "public.events") to check its default partition.',
            hint: "Use pg_partman_show_config to list all partition sets first.",
          };
        }

        // Check if parent table exists in pg_class (handles orphaned configs)
        const [tableSchema, tableName] = parentTable.includes(".")
          ? [parentTable.split(".")[0], parentTable.split(".")[1]]
          : ["public", parentTable];

        const tableExistsResult = await adapter.executeQuery(
          `
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = $1 AND table_name = $2
            `,
          [tableSchema, tableName],
        );

        if ((tableExistsResult.rows?.length ?? 0) === 0) {
          return {
            success: false,
            error: `Table '${parentTable}' does not exist. Cannot check default partition for non-existent table.`,
            hint: "Verify the table name or use pg_partman_show_config to list existing partition sets.",
          };
        }

        // First, find the default partition
        const findDefaultSql = `
                SELECT
                    c.relname as default_partition,
                    n.nspname as schema
                FROM pg_inherits i
                JOIN pg_class c ON c.oid = i.inhrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                JOIN pg_class p ON p.oid = i.inhparent
                JOIN pg_namespace pn ON pn.oid = p.relnamespace
                WHERE (pn.nspname || '.' || p.relname) = $1
                  AND c.relname LIKE '%_default'
            `;

        const result = await adapter.executeQuery(findDefaultSql, [
          parentTable,
        ]);
        const defaultInfo = result.rows?.[0];

        if (!defaultInfo) {
          // Check if the table is partitioned at all (has any child tables)
          const hasChildrenResult = await adapter.executeQuery(
            `
                    SELECT 1 FROM pg_inherits i
                    JOIN pg_class p ON p.oid = i.inhparent
                    JOIN pg_namespace pn ON pn.oid = p.relnamespace
                    WHERE (pn.nspname || '.' || p.relname) = $1
                    LIMIT 1
                `,
            [parentTable],
          );

          // Also check if the table is actually a partitioned table (relkind = 'p')
          const [tableSchema, tableName] = parentTable.includes(".")
            ? [parentTable.split(".")[0], parentTable.split(".")[1]]
            : ["public", parentTable];

          const partitionedCheckResult = await adapter.executeQuery(
            `
                    SELECT relkind FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = $1 AND c.relname = $2
                `,
            [tableSchema, tableName],
          );

          const relkind = partitionedCheckResult.rows?.[0]?.["relkind"];
          const isActuallyPartitioned = relkind === "p"; // 'p' means partitioned table

          if ((hasChildrenResult.rows?.length ?? 0) === 0) {
            if (isActuallyPartitioned) {
              return {
                success: true,
                parentTable,
                hasDefault: false,
                isPartitioned: true,
                hasChildPartitions: false,
                message:
                  "Table is partitioned but has no child partitions yet. Run pg_partman_run_maintenance or insert data to create partitions. " +
                  "TIP: For empty tables, configure pg_partman with startPartition before running maintenance.",
              };
            }
            return {
              success: true,
              parentTable,
              hasDefault: false,
              isPartitioned: false,
              hasChildPartitions: false,
              message:
                "Table is not a partitioned table. Create it with PARTITION BY clause to enable partitioning.",
            };
          }

          return {
            success: true,
            parentTable,
            hasDefault: false,
            isPartitioned: true,
            hasChildPartitions: true,
            message:
              "Table is partitioned with child partitions but has no default partition. This is normal if the partition set was created without a default.",
          };
        }

        const defaultPartitionName = `${String(defaultInfo["schema"])}.${String(defaultInfo["default_partition"])}`;

        // Use actual COUNT for accuracy instead of reltuples (which returns -1 before ANALYZE)
        // Limit to 1 for efficiency - we only need to know if ANY data exists
        const countSql = `SELECT COUNT(*) FROM (SELECT 1 FROM ${defaultPartitionName} LIMIT 1) t`;
        let rowCount: number;
        try {
          const countResult = await adapter.executeQuery(countSql);
          rowCount = Number(countResult.rows?.[0]?.["count"] ?? 0);
        } catch {
          // If count fails (rare), fall back to 0
          rowCount = 0;
        }

        const hasData = rowCount > 0;

        return {
          success: true,
          parentTable,
          hasDefault: true,
          defaultPartition: defaultPartitionName,
          hasDataInDefault: hasData,
          recommendation: hasData
            ? "Run pg_partman_partition_data to move data to appropriate child partitions"
            : "Default partition is empty - no action needed",
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_partman_check_default",
          });
      }
    },
  };
}

/**
 * Move data from default to child partitions
 */
export function createPartmanPartitionDataTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_partman_partition_data",
    description: `Move data from the default partition to appropriate child partitions.
Creates new partitions if needed for the data being moved.`,
    group: "partman",
    inputSchema: PartmanPartitionDataSchemaBase,
    outputSchema: PartmanPartitionDataOutputSchema,
    annotations: write("Partition Data"),
    icons: getToolIcons("partman", write("Partition Data")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { parentTable, batchSize, lockWaitSeconds } =
          PartmanPartitionDataSchema.parse(params) as {
            parentTable?: string;
            batchSize?: number;
            lockWaitSeconds?: number;
          };

        // parentTable is required - provide clear error if missing
        if (!parentTable) {
          return {
            success: false,
            error:
              'parentTable parameter is required. Specify the parent table (e.g., "public.events") to move data from its default partition.',
            hint: "Use pg_partman_show_config to list all partition sets first.",
          };
        }

        const args: string[] = [`p_parent_table := '${parentTable}'`];

        if (batchSize !== undefined && !isNaN(batchSize)) {
          args.push(`p_loop_count := ${String(batchSize)}`);
        }
        if (lockWaitSeconds !== undefined && !isNaN(lockWaitSeconds)) {
          args.push(`p_lock_wait := ${String(lockWaitSeconds)}`);
        }

        const partmanSchema = await getPartmanSchema(adapter);
        let configResult;
        try {
          configResult = await adapter.executeQuery(
            `
                SELECT control, epoch
                FROM ${partmanSchema}.part_config
                WHERE parent_table = $1
            `,
            [parentTable],
          );
        } catch {
          return {
            success: false,
            error: "pg_partman extension not found or not properly installed.",
            hint: "Install pg_partman with pg_partman_create_extension, then configure the partition set with pg_partman_create_parent.",
          };
        }

        const config = configResult.rows?.[0];
        if (!config) {
          return {
            success: false,
            error: `No pg_partman configuration found for ${parentTable}`,
          };
        }

        // Get row count in default partition before moving data
        const [partSchema, partTableName] = parentTable.includes(".")
          ? [
              parentTable.split(".")[0] ?? "public",
              parentTable.split(".")[1] ?? parentTable,
            ]
          : ["public", parentTable];
        const defaultPartitionName = `${partSchema}.${partTableName}_default`;

        let rowsBeforeMove = 0;
        try {
          const beforeResult = await adapter.executeQuery(
            `SELECT COUNT(*)::int as count FROM ${defaultPartitionName}`,
          );
          rowsBeforeMove = Number(beforeResult.rows?.[0]?.["count"] ?? 0);
        } catch {
          // Default partition might not exist - that's okay
        }

        // partition_data_proc is a PROCEDURE, not a function - use CALL syntax
        // Uses callPartmanProcedure to set search_path, resolving hardcoded
        // 'partman.*' references inside pg_partman's internal functions
        const sql = `CALL ${partmanSchema}.partition_data_proc(${args.join(", ")})`;
        try {
          await callPartmanProcedure(adapter, partmanSchema, sql);
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          return {
            success: false,
            parentTable,
            error: `Failed to move data from default partition: ${errorMsg.split("\n")[0] ?? errorMsg}`,
            hint:
              "Ensure pg_partman is properly installed and the partition set is configured correctly. " +
              "Use pg_partman_show_config to verify configuration.",
          };
        }

        // Get row count in default partition after moving data
        let rowsAfterMove = 0;
        try {
          const afterResult = await adapter.executeQuery(
            `SELECT COUNT(*)::int as count FROM ${defaultPartitionName}`,
          );
          rowsAfterMove = Number(afterResult.rows?.[0]?.["count"] ?? 0);
        } catch {
          // Default partition might not exist
        }

        const rowsMoved = rowsBeforeMove - rowsAfterMove;

        return {
          success: true,
          parentTable,
          rowsMoved: rowsMoved > 0 ? rowsMoved : 0,
          rowsRemaining: rowsAfterMove,
          message:
            rowsMoved > 0
              ? `Data partitioning completed - ${String(rowsMoved)} rows moved from default to child partitions`
              : "Data partitioning completed - no rows needed to be moved (default partition empty or already partitioned)",
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_partman_partition_data",
          });
      }
    },
  };
}
