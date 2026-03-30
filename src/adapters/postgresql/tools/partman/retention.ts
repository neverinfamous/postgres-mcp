/**
 * PostgreSQL pg_partman Extension Tools - Retention & Undo
 *
 * Retention policy management and partition reversal tools.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import {
  type ToolDefinition,
  type RequestContext,
  ValidationError,
} from "../../../../types/index.js";
import { write, destructive } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  PartmanRetentionSchema,
  PartmanRetentionSchemaBase,
  PartmanUndoPartitionSchema,
  PartmanUndoPartitionSchemaBase,
  PartmanSetRetentionOutputSchema,
  PartmanUndoPartitionOutputSchema,
} from "../../schemas/index.js";
import { getPartmanSchema, callPartmanProcedure, checkTableExists } from "./helpers.js";

/**
 * Configure retention policies
 */
export function createPartmanSetRetentionTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_partman_set_retention",
    description: `Configure retention policy for a partition set.
Partitions older than the retention period will be dropped or detached during maintenance.`,
    group: "partman",
    inputSchema: PartmanRetentionSchemaBase,
    outputSchema: PartmanSetRetentionOutputSchema,
    annotations: write("Set Partition Retention"),
    icons: getToolIcons("partman", write("Set Partition Retention")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { parentTable, retention, retentionKeepTable } =
          PartmanRetentionSchema.parse(params);

        // Validate required parentTable
        if (!parentTable) {
          throw new ValidationError("Missing required parameter: parentTable.", {
            hint: 'Example: pg_partman_set_retention({ parentTable: "public.events", retention: "30 days" })',
          });
        }

        const validatedParentTable = parentTable;
        const partmanSchema = await getPartmanSchema(adapter);

        // If retention is omitted (undefined), it's required
        if (retention === undefined) {
          throw new ValidationError("Missing required parameter: retention.", {
            hint:
              'Provide a retention period (e.g., "30 days") or pass null to explicitly disable retention. ' +
              'Example: pg_partman_set_retention({ parentTable: "public.events", retention: "30 days" })',
          });
        }

        // Special case: explicit null or empty string means disable/clear retention
        if (retention === null || retention === "") {
          const sql = `
                    UPDATE ${partmanSchema}.part_config
                    SET retention = NULL
                    WHERE parent_table = $1
                `;
          const result = await adapter.executeQuery(sql, [
            validatedParentTable,
          ]);

          if ((result.rowsAffected ?? 0) === 0) {
            throw new ValidationError(`No pg_partman configuration found for ${validatedParentTable}.`, {
              hint: "Use pg_partman_show_config to list existing partition sets.",
            });
          }

          return {
            success: true,
            parentTable: validatedParentTable,
            retention: null,
            message:
              "Retention policy disabled - partitions will no longer be automatically dropped or detached",
          };
        }

        const validatedRetention = retention;

        // Validate retention format - must be valid PostgreSQL interval
        // Try to parse it to catch obvious errors before storing garbage
        const validIntervalPattern =
          /^\d+\s*(second|minute|hour|day|week|month|year)s?$/i;
        const validNumericPattern = /^\d+$/; // Allow pure numeric for integer-based partitions

        if (
          !validIntervalPattern.test(validatedRetention) &&
          !validNumericPattern.test(validatedRetention)
        ) {
          throw new ValidationError(`Invalid retention format '${validatedRetention}'.`, {
            hint:
              "Use PostgreSQL interval syntax (e.g., '30 days', '6 months', '1 year') " +
              "or integer value for integer-based partitions.",
          });
        }

        const updates: string[] = [`retention = '${validatedRetention}'`];
        if (retentionKeepTable !== undefined) {
          updates.push(`retention_keep_table = ${String(retentionKeepTable)}`);
        }

        const sql = `
                UPDATE ${partmanSchema}.part_config
                SET ${updates.join(", ")}
                WHERE parent_table = $1
            `;

        const result = await adapter.executeQuery(sql, [validatedParentTable]);

        if ((result.rowsAffected ?? 0) === 0) {
          throw new ValidationError(`No pg_partman configuration found for ${validatedParentTable}.`, {
            hint: "Use pg_partman_show_config to list existing partition sets.",
          });
        }

        // Check partition type to use appropriate terminology in message
        const configResult = await adapter.executeQuery(
          `SELECT partition_type FROM ${partmanSchema}.part_config WHERE parent_table = $1`,
          [validatedParentTable],
        );
        const partitionTypeRaw = configResult.rows?.[0]?.["partition_type"];
        const partitionType =
          typeof partitionTypeRaw === "string" ? partitionTypeRaw : "range";
        const isIntegerBased =
          validNumericPattern.test(validatedRetention) ||
          partitionType.toLowerCase() === "native" ||
          partitionType.toLowerCase().includes("id");

        // Use "below" for integer-based, "older than" for time-based partitions
        const retentionPhrase = isIntegerBased
          ? `partitions with values below ${validatedRetention}`
          : `partitions older than ${validatedRetention}`;

        return {
          success: true,
          parentTable: validatedParentTable,
          retention: validatedRetention,
          retentionKeepTable: retentionKeepTable ?? false,
          message: `Retention policy set: ${retentionPhrase} will be ${retentionKeepTable === true ? "detached" : "dropped"}`,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_partman_set_retention",
          });
      }
    },
  };
}

/**
 * Undo partitioning - convert back to regular table
 */
export function createPartmanUndoPartitionTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_partman_undo_partition",
    description: `Convert a partitioned table back to a regular table by moving all data from child partitions to a TARGET table.

IMPORTANT: The targetTable parameter is REQUIRED. pg_partman does not consolidate data back to the parent table directly.
You must first create an empty table with the same structure as the parent, then specify it as targetTable.

Example: undoPartition({ parentTable: "public.events", targetTable: "public.events_consolidated" })`,
    group: "partman",
    inputSchema: PartmanUndoPartitionSchemaBase,
    outputSchema: PartmanUndoPartitionOutputSchema,
    annotations: destructive("Undo Partitioning"),
    icons: getToolIcons("partman", destructive("Undo Partitioning")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { parentTable, targetTable, batchSize, keepTable } =
          PartmanUndoPartitionSchema.parse(params) as {
            parentTable?: string;
            targetTable?: string;
            batchSize?: number;
            keepTable?: boolean;
          };

        // Validate required parameters with clear error messages
        if (!parentTable || !targetTable) {
          const missing: string[] = [];
          if (!parentTable) missing.push("parentTable");
          if (!targetTable) missing.push("targetTable (or target)");
          throw new ValidationError(`Missing required parameters: ${missing.join(", ")}.`, {
            hint: 'Example: pg_partman_undo_partition({ parentTable: "public.events", targetTable: "public.events_archive" }). Target table must exist first.',
            aliases: { target: "targetTable" },
          });
        }

        // At this point, parentTable and targetTable are guaranteed to be defined
        // Auto-prefix 'public.' schema when not specified (consistent with parentTable behavior)
        const validatedParentTable = parentTable.includes(".")
          ? parentTable
          : `public.${parentTable}`;
        const validatedTargetTable = targetTable.includes(".")
          ? targetTable
          : `public.${targetTable}`;

        // Pre-validate: Check that target table exists before calling pg_partman
        const partmanSchema = await getPartmanSchema(adapter);

        if (!(await checkTableExists(adapter, validatedTargetTable))) {
          throw new ValidationError(`Target table '${validatedTargetTable}' does not exist.`, {
            hint:
              "pg_partman's undo_partition requires the target table to exist before consolidating data. " +
              "Create the target table first with the same structure as the parent table.",
          });
        }

        const args: string[] = [
          `p_parent_table := '${validatedParentTable}'`,
          `p_target_table := '${validatedTargetTable}'`,
        ];

        if (batchSize !== undefined && !isNaN(batchSize)) {
          args.push(`p_loop_count := ${String(batchSize)}`);
        }
        if (keepTable !== undefined) {
          args.push(`p_keep_table := ${String(keepTable)}`);
        }

        // undo_partition_proc is a PROCEDURE, not a function - use CALL syntax
        // Uses callPartmanProcedure to set search_path, resolving hardcoded
        // 'partman.*' references inside pg_partman's internal functions
        const sql = `CALL ${partmanSchema}.undo_partition_proc(${args.join(", ")})`;
        try {
          await callPartmanProcedure(adapter, partmanSchema, sql);
        } catch (error: unknown) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          const firstLine = errorMsg.split("\n")[0] ?? errorMsg;
          throw new ValidationError(
            firstLine.includes("No entry in part_config")
              ? `No pg_partman configuration found for '${validatedParentTable}'.`
              : `Failed to undo partition: ${firstLine}`,
            {
              parentTable: validatedParentTable,
              targetTable: validatedTargetTable,
              hint: "Use pg_partman_show_config to verify the partition set exists and is properly configured.",
            }
          );
        }

        // Note: pg_partman's undo_partition detaches child partitions but leaves them as standalone tables
        // This allows data recovery if needed, but users should clean up manually
        const keepTableValue = keepTable ?? true;

        return {
          success: true,
          parentTable: validatedParentTable,
          targetTable: validatedTargetTable,
          message: `Partition set removed for ${validatedParentTable}. Data consolidated to ${validatedTargetTable}.`,
          note: keepTableValue
            ? "The parent table and detached child partitions still exist. " +
              `To clean up: DROP TABLE ${validatedParentTable} CASCADE;`
            : `The parent table still exists. To clean up: DROP TABLE ${validatedParentTable} CASCADE;`,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_partman_undo_partition",
          });
      }
    },
  };
}
