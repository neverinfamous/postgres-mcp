/**
 * PostgreSQL pg_partman Extension Tools - Management
 *
 * Core partition management tools: extension, create_parent, run_maintenance, show_partitions, show_config.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly, write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import {
  PartmanCreateParentSchema,
  PartmanRunMaintenanceSchema,
  PartmanShowPartitionsSchema,
  // Output schemas
  PartmanCreateExtensionOutputSchema,
  PartmanCreateParentOutputSchema,
  PartmanRunMaintenanceOutputSchema,
  PartmanShowPartitionsOutputSchema,
  PartmanShowConfigOutputSchema,
} from "../../schemas/index.js";

/**
 * Detect the schema where pg_partman is installed.
 * Newer versions install to 'public' by default, older versions use 'partman'.
 */
async function getPartmanSchema(adapter: PostgresAdapter): Promise<string> {
  const result = await adapter.executeQuery(`
        SELECT table_schema FROM information_schema.tables 
        WHERE table_name = 'part_config' 
        AND table_schema IN ('partman', 'public')
        LIMIT 1
    `);
  return (result.rows?.[0]?.["table_schema"] as string) ?? "partman";
}

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
      await adapter.executeQuery("CREATE EXTENSION IF NOT EXISTS pg_partman");
      return { success: true, message: "pg_partman extension enabled" };
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
    inputSchema: PartmanCreateParentSchema,
    outputSchema: PartmanCreateParentOutputSchema,
    annotations: write("Create Partition Parent"),
    icons: getToolIcons("partman", write("Create Partition Parent")),
    handler: async (params: unknown, _context: RequestContext) => {
      const {
        parentTable,
        controlColumn,
        interval,
        premake,
        startPartition,
        templateTable,
        epochType,
        defaultPartition,
      } = PartmanCreateParentSchema.parse(params);

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

      if (premake !== undefined) {
        args.push(`p_premake := ${String(premake)}`);
      }
      if (startPartition !== undefined) {
        args.push(`p_start_partition := '${startPartition}'`);
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

        throw e; // Re-throw other errors
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
        premake: premake ?? 4,
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
    },
  };
}

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
    inputSchema: PartmanRunMaintenanceSchema,
    outputSchema: PartmanRunMaintenanceOutputSchema,
    annotations: write("Run Partition Maintenance"),
    icons: getToolIcons("partman", write("Run Partition Maintenance")),
    handler: async (params: unknown, _context: RequestContext) => {
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
          return {
            success: false,
            parentTable,
            error: `Table '${parentTable}' is not managed by pg_partman.`,
            hint: "Use pg_partman_create_parent to set up partitioning, or pg_partman_show_config to list managed tables.",
          };
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
        } catch (e) {
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
            return {
              success: false,
              parentTable,
              error: "Partition set has no child partitions yet.",
              hint:
                "For new partition sets, ensure startPartition is valid for your data. " +
                "Insert data first, then run maintenance, or specify a valid startPartition when creating the parent.",
            };
          }

          // Return clean error response instead of throwing with stack trace
          return {
            success: false,
            parentTable,
            error: errorMsg,
            hint:
              "Check that the parent table exists, is properly partitioned, and has valid pg_partman configuration. " +
              "Use pg_partman_show_config to verify configuration.",
          };
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
        } catch (error) {
          // Extract clean error message (first line only, remove PL/pgSQL context)
          let reason = error instanceof Error ? error.message : "Unknown error";
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
  const DEFAULT_PARTITION_LIMIT = 50;

  return {
    name: "pg_partman_show_partitions",
    description:
      "List all child partitions for a partition set managed by pg_partman.",
    group: "partman",
    inputSchema: PartmanShowPartitionsSchema,
    outputSchema: PartmanShowPartitionsOutputSchema,
    annotations: readOnly("Show Partman Partitions"),
    icons: getToolIcons("partman", readOnly("Show Partman Partitions")),
    handler: async (params: unknown, _context: RequestContext) => {
      const parsed = PartmanShowPartitionsSchema.parse(params);
      const { parentTable, includeDefault, order } = parsed;
      const limit =
        (parsed as { limit?: number }).limit ?? DEFAULT_PARTITION_LIMIT;

      // parentTable is required - provide clear error if missing
      if (!parentTable) {
        return {
          success: false,
          error:
            'parentTable parameter is required. Specify the parent table (e.g., "public.events") to list its partitions.',
          hint: "Use pg_partman_show_config to list all partition sets first.",
        };
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
        return {
          success: false,
          error: `Table '${parentTable}' is not managed by pg_partman.`,
          hint: "Use pg_partman_create_parent to set up partitioning, or pg_partman_show_config to list managed tables.",
        };
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
        truncated: truncated ? true : undefined,
        totalCount: truncated ? totalCount : undefined,
      };
    },
  };
}

/**
 * Show partition configuration
 */
export function createPartmanShowConfigTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  // Preprocess to support table/parent/name aliases and auto-prefix public schema
  const inputSchema = z
    .preprocess(
      (input) => {
        if (typeof input !== "object" || input === null) return input;
        const raw = input as {
          table?: string;
          parent?: string;
          name?: string;
          parentTable?: string;
          limit?: number;
        };
        const result = { ...raw };

        // Alias: table → parentTable
        if (result.table && !result.parentTable) {
          result.parentTable = result.table;
        }

        // Alias: parent → parentTable (documented in ServerInstructions)
        if (result.parent && !result.parentTable) {
          result.parentTable = result.parent;
        }

        // Alias: name → parentTable (documented in ServerInstructions)
        if (result.name && !result.parentTable) {
          result.parentTable = result.name;
        }

        // Auto-prefix public. for parentTable when no schema specified
        // (Consistent with other partman tools)
        if (result.parentTable && !result.parentTable.includes(".")) {
          result.parentTable = `public.${result.parentTable}`;
        }

        return result;
      },
      z.object({
        parentTable: z
          .string()
          .optional()
          .describe("Parent table name (all configs if omitted)"),
        limit: z
          .number()
          .optional()
          .describe(
            "Maximum number of configs to return (default: 50, use 0 for all)",
          ),
      }),
    )
    .default({});

  return {
    name: "pg_partman_show_config",
    description:
      "View the configuration for a partition set from part_config table.",
    group: "partman",
    inputSchema,
    outputSchema: PartmanShowConfigOutputSchema,
    annotations: readOnly("Show Partman Config"),
    icons: getToolIcons("partman", readOnly("Show Partman Config")),
    handler: async (params: unknown, _context: RequestContext) => {
      const parsed = inputSchema.parse(params);
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
      const limit = parsed.limit ?? 50;
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

      const orphanedCount = configsWithStatus.filter((c) => c.orphaned).length;
      const truncated = applyLimit && totalCount > limit;

      // Provide hint if a specific table was requested but not found
      let notFoundHint: string | undefined;
      if (parsed.parentTable !== undefined && configsWithStatus.length === 0) {
        notFoundHint = `Table '${parsed.parentTable}' is not managed by pg_partman. Use pg_partman_create_parent to set up partitioning.`;
      }

      return {
        configs: configsWithStatus,
        count: configsWithStatus.length,
        truncated: truncated ? true : undefined,
        totalCount: truncated ? totalCount : undefined,
        orphanedCount: orphanedCount > 0 ? orphanedCount : undefined,
        hint:
          notFoundHint ??
          (orphanedCount > 0
            ? `${String(orphanedCount)} orphaned config(s) found - parent table no longer exists. ` +
              `To clean up, use raw SQL: DELETE FROM ${partmanSchema}.part_config WHERE parent_table = '<table_name>';`
            : undefined),
      };
    },
  };
}
