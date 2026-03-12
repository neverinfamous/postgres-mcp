/**
 * PostgreSQL pg_partman Extension Tools - Setup & Creation
 *
 * Extension enable and partition parent creation.
 * 2 tools total.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  PartmanCreateParentSchema,
  PartmanCreateParentSchemaBase,
  DEPRECATED_INTERVALS,
  // Output schemas
  PartmanCreateExtensionOutputSchema,
  PartmanCreateParentOutputSchema,
} from "../../schemas/index.js";
import { getPartmanSchema } from "./helpers.js";

/**
 * Enable the pg_partman extension
 */
export function createPartmanExtensionTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_partman_create_extension",
    description:
      "Enable the pg_partman extension for automated partition management. Requires superuser privileges.",
    group: "partman",
    inputSchema: z.object({}),
    outputSchema: PartmanCreateExtensionOutputSchema,
    annotations: write("Create Partman Extension"),
    icons: getToolIcons("partman", write("Create Partman Extension")),
    handler: async (_params: unknown, _context: RequestContext) => {
      try {
        await adapter.executeQuery("CREATE EXTENSION IF NOT EXISTS pg_partman");
        return { success: true, message: "pg_partman extension enabled" };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_partman_create_extension",
          });
      }
    },
  };
}

/**
 * Create a partition set with pg_partman
 */
export function createPartmanCreateParentTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_partman_create_parent",
    description: `Create a new partition set using pg_partman's create_parent() function.
Supports time-based and integer-based partitioning with automatic child partition creation.
The parent table must already exist before calling this function.

Partition type (time vs integer) is automatically detected from the control column's data type.
For non-timestamp/integer columns (text, uuid), use raw pg_partman SQL with timeEncoder/timeDecoder parameters.

IMPORTANT: For empty tables with no data, you MUST provide startPartition (e.g., 'now' for current date, or a specific date like '2024-01-01').
Without startPartition and data, pg_partman cannot determine where to start creating partitions.

TIP: startPartition accepts 'now' as a shorthand for the current date/time.

WARNING: startPartition creates ALL partitions from that date to current date + premake.
A startPartition far in the past (e.g., '2024-01-01' with daily intervals) creates many partitions.`,
    group: "partman",
    inputSchema: PartmanCreateParentSchemaBase,
    outputSchema: PartmanCreateParentOutputSchema,
    annotations: write("Create Partition Parent"),
    icons: getToolIcons("partman", write("Create Partition Parent")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const {
          parentTable,
          controlColumn,
          interval,
          premake,
          startPartition,
          templateTable,
          epochType,
          defaultPartition,
        } = PartmanCreateParentSchema.parse(params) as {
          parentTable?: string;
          controlColumn?: string;
          interval?: string;
          premake?: number;
          startPartition?: string;
          templateTable?: string;
          epochType?: string;
          defaultPartition?: boolean;
        };

        // Validate required parameters with clear error messages
        if (!parentTable || !controlColumn || !interval) {
          const missing: string[] = [];
          if (!parentTable) missing.push("parentTable");
          if (!controlColumn) missing.push("controlColumn (or control)");
          if (!interval) missing.push("interval");
          return {
            success: false,
            error: `Missing required parameters: ${missing.join(", ")}.`,
            hint: 'Example: pg_partman_create_parent({ parentTable: "public.events", controlColumn: "created_at", interval: "1 month" })',
            aliases: { control: "controlColumn" },
          };
        }

        // Check for deprecated interval keywords and return structured error
        const deprecatedReplacement =
          DEPRECATED_INTERVALS[interval.toLowerCase()];
        if (deprecatedReplacement) {
          return {
            success: false,
            error: `Deprecated interval '${interval}'. Use PostgreSQL interval syntax instead: '${deprecatedReplacement}'.`,
            hint: "Valid examples: '1 day', '1 week', '1 month', '3 months', '1 year'. Do NOT use keywords like 'daily' or 'monthly'.",
          };
        }

        // At this point, all required params are guaranteed to be defined
        const validatedParentTable = parentTable;
        const validatedControlColumn = controlColumn;
        const validatedInterval = interval;

        // Note: pg_partman defaults to 'range' type, which is correct for most uses
        const args: string[] = [
          `p_parent_table := '${validatedParentTable}'`,
          `p_control := '${validatedControlColumn}'`,
          `p_interval := '${validatedInterval}'`,
        ];

        // premake is passed directly to pg_partman create_parent
        // Guard against NaN from z.coerce.number("abc")
        if (premake !== undefined && !isNaN(premake)) {
          args.push(`p_premake := ${String(premake)}`);
        }
        if (startPartition !== undefined) {
          // pg_partman 5.x doesn't interpret 'now' as a timestamp literal.
          // Resolve 'now' to NOW()::text so pg_partman receives an actual timestamp string.
          if (startPartition.toLowerCase() === "now") {
            args.push(`p_start_partition := NOW()::text`);
          } else {
            args.push(`p_start_partition := '${startPartition}'`);
          }
        }
        if (templateTable !== undefined) {
          args.push(`p_template_table := '${templateTable}'`);
        }
        if (epochType !== undefined) {
          args.push(`p_epoch := '${epochType}'`);
        }
        if (defaultPartition !== undefined) {
          args.push(`p_default_table := ${String(defaultPartition)}`);
        }

        const partmanSchema = await getPartmanSchema(adapter);
        const sql = `SELECT ${partmanSchema}.create_parent(${args.join(", ")})`;

        try {
          await adapter.executeQuery(sql);
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);

          // Wrap common PostgreSQL/pg_partman errors with clearer messages
          if (
            errorMsg.includes("duplicate key") ||
            errorMsg.includes("already exists in part_config")
          ) {
            return {
              success: false,
              error: `Table '${validatedParentTable}' is already managed by pg_partman.`,
              hint:
                "Use pg_partman_show_config to view existing configuration. " +
                "To recreate: use pg_partman_undo_partition first, or if the table was dropped, clean up with: " +
                `DELETE FROM ${partmanSchema}.part_config WHERE parent_table = '${validatedParentTable}';`,
            };
          }
          if (
            errorMsg.includes("does not exist") &&
            errorMsg.includes("relation")
          ) {
            return {
              success: false,
              error: `Table '${validatedParentTable}' does not exist.`,
              hint: "Create the parent table first with appropriate columns, then call pg_partman_create_parent.",
            };
          }
          if (errorMsg.includes("Unable to find given parent table")) {
            return {
              success: false,
              error: `Table '${validatedParentTable}' does not exist.`,
              hint: "Create the parent table first with PARTITION BY clause, then call pg_partman_create_parent.",
            };
          }
          // Check 'is not partitioned' BEFORE 'NOT NULL' - if table isn't partitioned, that's the primary issue
          if (errorMsg.includes("is not partitioned")) {
            return {
              success: false,
              error: `Table '${validatedParentTable}' is not a partitioned table.`,
              hint: "Create the table with PARTITION BY clause. Example: CREATE TABLE events (ts TIMESTAMPTZ NOT NULL, ...) PARTITION BY RANGE (ts);",
            };
          }
          if (
            errorMsg.includes("cannot be null") ||
            errorMsg.includes("NOT NULL")
          ) {
            return {
              success: false,
              error: `Control column '${validatedControlColumn}' must have a NOT NULL constraint.`,
              hint: "Add NOT NULL constraint to the control column. Example: ALTER TABLE events ALTER COLUMN ts SET NOT NULL;",
            };
          }
          // Catch pg_partman's partition type requirement error
          if (
            errorMsg.includes("ranged or list partitioned") ||
            errorMsg.includes("must have created the given parent table")
          ) {
            return {
              success: false,
              error: `Table '${validatedParentTable}' must be created as RANGE or LIST partitioned before calling createParent.`,
              hint:
                "Create the table with PARTITION BY RANGE or PARTITION BY LIST clause first. " +
                "Example: CREATE TABLE events (ts TIMESTAMPTZ NOT NULL, ...) PARTITION BY RANGE (ts);",
            };
          }
          // Catch invalid interval format error with user-friendly message
          if (errorMsg.includes("invalid input syntax for type interval")) {
            return {
              success: false,
              error: `Invalid interval format: '${validatedInterval}'.`,
              hint:
                "Use PostgreSQL interval syntax. Valid examples: '1 day', '1 week', '1 month', '3 months', '1 year'. " +
                "Do NOT use keywords like 'daily' or 'monthly'.",
              examples: [
                "1 day",
                "1 week",
                "2 weeks",
                "1 month",
                "3 months",
                "1 year",
              ],
            };
          }

          // Re-throw other errors — outer catch will format them
          throw e;
        }

        // pg_partman's create_parent only registers the partition set - it doesn't always create child partitions
        // We call run_maintenance to attempt to create initial partitions, but this may fail in some cases
        // (e.g., when no startPartition is specified and the control column has no existing data to determine ranges)
        let maintenanceRan = false;
        try {
          const maintenanceSql = `SELECT ${partmanSchema}.run_maintenance(p_parent_table := '${validatedParentTable}')`;
          await adapter.executeQuery(maintenanceSql);
          maintenanceRan = true;
        } catch {
          // Maintenance may fail for new partition sets without data - this is expected
        }

        return {
          success: true,
          parentTable: validatedParentTable,
          controlColumn: validatedControlColumn,
          interval: validatedInterval,
          premake: premake !== undefined && !isNaN(premake) ? premake : 4,
          maintenanceRan,
          // Suppress raw maintenanceError - the message/hint explains the situation clearly
          message: maintenanceRan
            ? `Partition set created for ${validatedParentTable} on column ${validatedControlColumn}. Initial partitions created.`
            : `Partition set registered for ${validatedParentTable} on column ${validatedControlColumn}. ` +
              `No child partitions created yet - pg_partman needs data or a startPartition that matches the control column type.`,
          hint: !maintenanceRan
            ? 'For DATE columns, use a date like "2024-01-01". For TIMESTAMP columns, "now" works. ' +
              "Otherwise, insert data first and run pg_partman_run_maintenance."
            : undefined,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_partman_create_parent",
          });
      }
    },
  };
}
