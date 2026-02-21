/**
 * PostgreSQL pg_partman Extension Tools - Operations
 *
 * Partition operations: check_default, partition_data, set_retention, undo_partition, analyze_health.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly, write, destructive } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import {
  PartmanCheckDefaultSchema,
  PartmanPartitionDataSchema,
  PartmanRetentionSchema,
  PartmanUndoPartitionSchema,
  // Output schemas
  PartmanCheckDefaultOutputSchema,
  PartmanPartitionDataOutputSchema,
  PartmanSetRetentionOutputSchema,
  PartmanUndoPartitionOutputSchema,
  PartmanAnalyzeHealthOutputSchema,
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
 * Ensure the 'partman' schema alias exists when pg_partman is installed in 'public'.
 *
 * pg_partman's partition_data_time function contains a hardcoded fully-qualified
 * call to 'partman.check_control_type(...)'. When pg_partman is installed in
 * the 'public' schema (the default for newer versions), this fails with
 * 'schema "partman" does not exist'. Since the reference is fully-qualified,
 * SET search_path cannot resolve it.
 *
 * This function creates the 'partman' schema if needed and adds a thin wrapper
 * function that delegates to public.check_control_type().
 */
async function ensurePartmanSchemaAlias(
  adapter: PostgresAdapter,
): Promise<void> {
  try {
    await adapter.executeQuery("CREATE SCHEMA IF NOT EXISTS partman");
    await adapter.executeQuery(`
      CREATE OR REPLACE FUNCTION partman.check_control_type(
        p_parent_schema text, p_parent_tablename text, p_control text
      ) RETURNS TABLE(general_type text, exact_type text)
      LANGUAGE sql STABLE AS $$
        SELECT * FROM public.check_control_type(p_parent_schema, p_parent_tablename, p_control)
      $$
    `);
  } catch {
    // Schema creation may fail due to permissions — proceed anyway,
    // the actual CALL will produce its own clear error
  }
}

/**
 * Execute a pg_partman PROCEDURE, ensuring schema aliases are in place.
 */
async function callPartmanProcedure(
  adapter: PostgresAdapter,
  partmanSchema: string,
  sql: string,
): Promise<void> {
  // When pg_partman is installed in 'public', ensure the 'partman' schema alias
  // exists for hardcoded partman.* references inside pg_partman's functions
  if (partmanSchema === "public") {
    await ensurePartmanSchemaAlias(adapter);
  }
  await adapter.executeQuery(sql);
}

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
    inputSchema: PartmanCheckDefaultSchema,
    outputSchema: PartmanCheckDefaultOutputSchema,
    annotations: readOnly("Check Partman Default"),
    icons: getToolIcons("partman", readOnly("Check Partman Default")),
    handler: async (params: unknown, _context: RequestContext) => {
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

      const result = await adapter.executeQuery(findDefaultSql, [parentTable]);
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
    inputSchema: PartmanPartitionDataSchema,
    outputSchema: PartmanPartitionDataOutputSchema,
    annotations: write("Partition Data"),
    icons: getToolIcons("partman", write("Partition Data")),
    handler: async (params: unknown, _context: RequestContext) => {
      const { parentTable, batchSize, lockWaitSeconds } =
        PartmanPartitionDataSchema.parse(params);

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

      if (batchSize !== undefined) {
        args.push(`p_loop_count := ${String(batchSize)}`);
      }
      if (lockWaitSeconds !== undefined) {
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
    },
  };
}

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
    inputSchema: PartmanRetentionSchema,
    outputSchema: PartmanSetRetentionOutputSchema,
    annotations: write("Set Partition Retention"),
    icons: getToolIcons("partman", write("Set Partition Retention")),
    handler: async (params: unknown, _context: RequestContext) => {
      const { parentTable, retention, retentionKeepTable } =
        PartmanRetentionSchema.parse(params);

      // Validate required parentTable
      if (!parentTable) {
        return {
          success: false,
          error: "Missing required parameter: parentTable.",
          hint: 'Example: pg_partman_set_retention({ parentTable: "public.events", retention: "30 days" })',
        };
      }

      const validatedParentTable = parentTable;
      const partmanSchema = await getPartmanSchema(adapter);

      // If retention is omitted (undefined), it's required
      if (retention === undefined) {
        return {
          success: false,
          error: "Missing required parameter: retention.",
          hint:
            'Provide a retention period (e.g., "30 days") or pass null to explicitly disable retention. ' +
            'Example: pg_partman_set_retention({ parentTable: "public.events", retention: "30 days" })',
        };
      }

      // Special case: explicit null or empty string means disable/clear retention
      if (retention === null || retention === "") {
        const sql = `
                    UPDATE ${partmanSchema}.part_config
                    SET retention = NULL
                    WHERE parent_table = $1
                `;
        const result = await adapter.executeQuery(sql, [validatedParentTable]);

        if ((result.rowsAffected ?? 0) === 0) {
          return {
            success: false,
            error: `No pg_partman configuration found for ${validatedParentTable}.`,
            hint: "Use pg_partman_show_config to list existing partition sets.",
          };
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
        return {
          success: false,
          error: `Invalid retention format '${validatedRetention}'.`,
          hint:
            "Use PostgreSQL interval syntax (e.g., '30 days', '6 months', '1 year') " +
            "or integer value for integer-based partitions.",
        };
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
        return {
          success: false,
          error: `No pg_partman configuration found for ${validatedParentTable}.`,
          hint: "Use pg_partman_show_config to list existing partition sets.",
        };
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
    inputSchema: PartmanUndoPartitionSchema,
    outputSchema: PartmanUndoPartitionOutputSchema,
    annotations: destructive("Undo Partitioning"),
    icons: getToolIcons("partman", destructive("Undo Partitioning")),
    handler: async (params: unknown, _context: RequestContext) => {
      const { parentTable, targetTable, batchSize, keepTable } =
        PartmanUndoPartitionSchema.parse(params);

      // Validate required parameters with clear error messages
      if (!parentTable || !targetTable) {
        const missing: string[] = [];
        if (!parentTable) missing.push("parentTable");
        if (!targetTable) missing.push("targetTable (or target)");
        return {
          success: false,
          error: `Missing required parameters: ${missing.join(", ")}.`,
          hint: 'Example: pg_partman_undo_partition({ parentTable: "public.events", targetTable: "public.events_archive" }). Target table must exist first.',
          aliases: { target: "targetTable" },
        };
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

      // Parse target table name to check existence
      const [targetSchema, targetTableName] = [
        validatedTargetTable.split(".")[0],
        validatedTargetTable.split(".")[1],
      ];

      const tableExistsResult = await adapter.executeQuery(
        `
                SELECT 1 FROM information_schema.tables 
                WHERE table_schema = $1 AND table_name = $2
            `,
        [targetSchema, targetTableName],
      );

      if ((tableExistsResult.rows?.length ?? 0) === 0) {
        return {
          success: false,
          error: `Target table '${validatedTargetTable}' does not exist.`,
          hint:
            "pg_partman's undo_partition requires the target table to exist before consolidating data. " +
            "Create the target table first with the same structure as the parent table.",
        };
      }

      const args: string[] = [
        `p_parent_table := '${validatedParentTable}'`,
        `p_target_table := '${validatedTargetTable}'`,
      ];

      if (batchSize !== undefined) {
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
        const errorMsg = error instanceof Error ? error.message : String(error);
        const firstLine = errorMsg.split("\n")[0] ?? errorMsg;
        return {
          success: false,
          parentTable: validatedParentTable,
          targetTable: validatedTargetTable,
          error: firstLine.includes("No entry in part_config")
            ? `No pg_partman configuration found for '${validatedParentTable}'.`
            : `Failed to undo partition: ${firstLine}`,
          hint: "Use pg_partman_show_config to verify the partition set exists and is properly configured.",
        };
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
    },
  };
}

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
    inputSchema: z
      .preprocess(
        (input) => {
          if (typeof input !== "object" || input === null) return input;
          const raw = input as {
            table?: string;
            parentTable?: string;
            limit?: number;
          };
          const result = { ...raw };

          // Alias: table → parentTable
          if (result.table && !result.parentTable) {
            result.parentTable = result.table;
          }

          // Auto-prefix public. for parentTable when no schema specified
          if (result.parentTable && !result.parentTable.includes(".")) {
            result.parentTable = `public.${result.parentTable}`;
          }

          return result;
        },
        z.object({
          parentTable: z
            .string()
            .optional()
            .describe("Specific parent table to analyze (all if omitted)"),
          limit: z
            .number()
            .optional()
            .describe(
              "Maximum number of partition sets to analyze (default: 50, use 0 for all)",
            ),
        }),
      )
      .default({}),
    outputSchema: PartmanAnalyzeHealthOutputSchema,
    annotations: readOnly("Analyze Partition Health"),
    icons: getToolIcons("partman", readOnly("Analyze Partition Health")),
    handler: async (params: unknown, _context: RequestContext) => {
      const AnalyzeHealthSchema = z
        .preprocess(
          (input) => {
            if (typeof input !== "object" || input === null) return input;
            const raw = input as {
              table?: string;
              parentTable?: string;
              limit?: number;
            };
            const result = { ...raw };

            // Alias: table → parentTable
            if (result.table && !result.parentTable) {
              result.parentTable = result.table;
            }

            // Auto-prefix public. for parentTable when no schema specified
            if (result.parentTable && !result.parentTable.includes(".")) {
              result.parentTable = `public.${result.parentTable}`;
            }

            return result;
          },
          z.object({
            parentTable: z.string().optional(),
            limit: z.number().optional(),
          }),
        )
        .default({});
      const parsed = AnalyzeHealthSchema.parse(params ?? {});
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
      const limit = parsed.limit ?? 50;
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

      // If a specific table was requested but not found, indicate that clearly
      if (parsed.parentTable !== undefined && configs.length === 0) {
        return {
          overallHealth: "not_found",
          partitionSets: [],
          message:
            `No pg_partman configuration found for table '${parsed.parentTable}'. ` +
            `Use pg_partman_show_config to list configured partition sets, or ` +
            `pg_partman_create_parent to configure partitioning for this table.`,
        };
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

        // Check if parent table still exists (handle orphaned configs)
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
          // Orphaned config - table no longer exists
          healthChecks.push({
            parentTable,
            issues: ["Orphaned configuration - parent table no longer exists"],
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
        } catch (e) {
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

        const hasDefaultPartition = (defaultCheckResult.rows?.length ?? 0) > 0;
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
    },
  };
}
