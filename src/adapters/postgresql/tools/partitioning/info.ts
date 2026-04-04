/**
 * PostgreSQL Partitioning Tools - Info
 *
 * Partition info and detach operations.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly, write, destructive } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { sanitizeTableName } from "../../../../utils/identifiers.js";
import {
  DetachPartitionSchema,
  DetachPartitionSchemaBase,
  AttachPartitionSchema,
  AttachPartitionSchemaBase,
  PartitionInfoSchemaBase,
  PartitionInfoSchema,
  DetachPartitionOutputSchema,
  AttachPartitionOutputSchema,
  PartitionInfoOutputSchema,
} from "../../schemas/index.js";
import {
  parseSchemaTable,
  formatBytes,
  checkTablePartitionStatus,
} from "./management.js";

export function createAttachPartitionTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_attach_partition",
    description: "Attach an existing table as a partition.",
    group: "partitioning",
    inputSchema: AttachPartitionSchemaBase, // Base schema for MCP visibility
    outputSchema: AttachPartitionOutputSchema,
    annotations: write("Attach Partition"),
    icons: getToolIcons("partitioning", write("Attach Partition")),
    handler: async (params: unknown, _context: RequestContext) => {
      let parsed;
      try {
        parsed = AttachPartitionSchema.parse(params) as {
          parent: string;
          partition: string;
          forValues: string;
          schema?: string;
        };
      } catch (zodError: unknown) {
        return formatHandlerErrorResponse(zodError, {
            tool: "pg_attach_partition",
          });
      }
      const { parent, partition, forValues, schema } = parsed;

      // Check parent table existence and partition status before SQL execution
      const parsedParentCheck = parseSchemaTable(parent, schema);
      const parentStatus = await checkTablePartitionStatus(
        adapter,
        parsedParentCheck.table,
        parsedParentCheck.schema,
      );
      if (parentStatus === "not_found") {
        return {
          success: false,
          error: `Table "${parsedParentCheck.schema}.${parsedParentCheck.table}" does not exist`,
        };
      }
      if (parentStatus === "not_partitioned") {
        return {
          success: false,
          error: `Table "${parsedParentCheck.schema}.${parsedParentCheck.table}" exists but is not partitioned`,
        };
      }

      // Check partition table exists (it must exist as a standalone table to attach)
      const parsedPartCheck = parseSchemaTable(partition, schema);
      const partCheckSql = `SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE c.relname = $1 AND n.nspname = $2 AND c.relkind IN ('r', 'p')`;
      const partCheckResult = await adapter.executeQuery(partCheckSql, [
        parsedPartCheck.table,
        parsedPartCheck.schema,
      ]);
      if ((partCheckResult.rows ?? []).length === 0) {
        return {
          success: false,
          error: `Partition table "${parsedPartCheck.schema}.${parsedPartCheck.table}" does not exist`,
        };
      }

      // Parse schema.table format from parent and partition (takes priority over explicit schema)
      const parsedParent = parseSchemaTable(parent, schema);
      const parsedPartition = parseSchemaTable(partition, schema);

      // Use parent's schema if partition doesn't have schema prefix and no explicit schema
      const resolvedPartitionSchema = partition.includes(".")
        ? parsedPartition.schema
        : (schema ?? parsedParent.schema);

      const parentName = sanitizeTableName(
        parsedParent.table,
        parsedParent.schema,
      );
      const partitionName = sanitizeTableName(
        parsedPartition.table,
        resolvedPartitionSchema,
      );

      // Handle DEFAULT partition
      // Accept both "__DEFAULT__" (from preprocessor when isDefault: true) and explicit "DEFAULT"
      const isDefaultPartition =
        forValues === "__DEFAULT__" ||
        forValues.toUpperCase() === "DEFAULT" ||
        forValues.toUpperCase().trim() === "DEFAULT";

      let sql: string;
      let boundsDescription: string;
      if (isDefaultPartition) {
        sql = `ALTER TABLE ${parentName} ATTACH PARTITION ${partitionName} DEFAULT`;
        boundsDescription = "DEFAULT";
      } else {
        sql = `ALTER TABLE ${parentName} ATTACH PARTITION ${partitionName} FOR VALUES ${forValues}`;
        boundsDescription = forValues;
      }

      try {
        await adapter.executeQuery(sql);
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_attach_partition",
            table: parsedPartition.table,
          });
      }

      return {
        success: true,
        parent: parsedParent.table,
        partition: parsedPartition.table,
        bounds: boundsDescription,
      };
    },
  };
}

export function createDetachPartitionTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_detach_partition",
    description:
      "Detach a partition. Use concurrently: true for non-blocking. Use finalize: true only after an interrupted CONCURRENTLY detach.",
    group: "partitioning",
    inputSchema: DetachPartitionSchemaBase, // Base schema for MCP visibility
    outputSchema: DetachPartitionOutputSchema,
    annotations: destructive("Detach Partition"),
    icons: getToolIcons("partitioning", destructive("Detach Partition")),
    handler: async (params: unknown, _context: RequestContext) => {
      let parsed;
      try {
        parsed = DetachPartitionSchema.parse(params) as {
          parent: string;
          partition: string;
          concurrently?: boolean;
          finalize?: boolean;
          schema?: string;
        };
      } catch (zodError: unknown) {
        return formatHandlerErrorResponse(zodError, {
            tool: "pg_detach_partition",
          });
      }
      const { parent, partition, concurrently, finalize, schema } = parsed;

      // Check parent table existence and partition status before SQL execution
      const parsedParentCheck = parseSchemaTable(parent, schema);
      const parentStatus = await checkTablePartitionStatus(
        adapter,
        parsedParentCheck.table,
        parsedParentCheck.schema,
      );
      if (parentStatus === "not_found") {
        return {
          success: false,
          error: `Table "${parsedParentCheck.schema}.${parsedParentCheck.table}" does not exist`,
        };
      }
      if (parentStatus === "not_partitioned") {
        return {
          success: false,
          error: `Table "${parsedParentCheck.schema}.${parsedParentCheck.table}" exists but is not partitioned`,
        };
      }

      // Check partition table exists
      const parsedPartCheck = parseSchemaTable(partition, schema);
      const partCheckSql = `SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE c.relname = $1 AND n.nspname = $2`;
      const partCheckResult = await adapter.executeQuery(partCheckSql, [
        parsedPartCheck.table,
        parsedPartCheck.schema,
      ]);
      if ((partCheckResult.rows ?? []).length === 0) {
        return {
          success: false,
          error: `Partition "${parsedPartCheck.schema}.${parsedPartCheck.table}" does not exist`,
        };
      }

      // Parse schema.table format from parent and partition (takes priority over explicit schema)
      const parsedParent = parseSchemaTable(parent, schema);
      const parsedPartition = parseSchemaTable(partition, schema);

      // Use parent's schema if partition doesn't have schema prefix and no explicit schema
      const resolvedPartitionSchema = partition.includes(".")
        ? parsedPartition.schema
        : (schema ?? parsedParent.schema);

      // Verify the partition is actually a child of the named parent (pg_inherits check).
      // This must be done before executing the ALTER TABLE because PG's DETACH PARTITION
      // looks up membership in pg_inherits and raises 42P01 if not found there — which
      // error-parser.ts maps to the misleading "Table does not exist in schema" message.
      const membershipSql = `
        SELECT 1 FROM pg_inherits i
        JOIN pg_class child ON child.oid = i.inhrelid
        JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
        JOIN pg_class parent_rel ON parent_rel.oid = i.inhparent
        JOIN pg_namespace parent_ns ON parent_ns.oid = parent_rel.relnamespace
        WHERE child.relname = $1 AND child_ns.nspname = $2
          AND parent_rel.relname = $3 AND parent_ns.nspname = $4
      `;
      const membershipResult = await adapter.executeQuery(membershipSql, [
        parsedPartition.table,
        resolvedPartitionSchema,
        parsedParent.table,
        parsedParent.schema,
      ]);
      if ((membershipResult.rows ?? []).length === 0) {
        return {
          success: false,
          error: `Table "${resolvedPartitionSchema}.${parsedPartition.table}" is not a partition of "${parsedParent.schema}.${parsedParent.table}". Use pg_list_partitions to see current partitions.`,
          code: "VALIDATION_ERROR",
        };
      }


      const parentName = sanitizeTableName(
        parsedParent.table,
        parsedParent.schema,
      );
      const partitionName = sanitizeTableName(
        parsedPartition.table,
        resolvedPartitionSchema,
      );

      // Build the appropriate clause
      let clause = "";
      if (finalize === true) {
        // FINALIZE is used to complete an interrupted CONCURRENTLY detach
        clause = " FINALIZE";
      } else if (concurrently === true) {
        clause = " CONCURRENTLY";
      }

      const sql = `ALTER TABLE ${parentName} DETACH PARTITION ${partitionName}${clause}`;

      try {
        await adapter.executeQuery(sql);
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_detach_partition",
            table: parsedPartition.table,
          });
      }

      return {
        success: true,
        parent: parsedParent.table,
        partition: parsedPartition.table,
      };
    },
  };
}

export function createPartitionInfoTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_partition_info",
    description:
      "Get detailed information about a partitioned table. Returns warning if table is not partitioned.",
    group: "partitioning",
    inputSchema: PartitionInfoSchemaBase, // Base schema for MCP visibility with alias support
    outputSchema: PartitionInfoOutputSchema,
    annotations: readOnly("Partition Info"),
    icons: getToolIcons("partitioning", readOnly("Partition Info")),
    handler: async (params: unknown, _context: RequestContext) => {
      // Use preprocessed schema for alias resolution
      let parsed;
      try {
        parsed = PartitionInfoSchema.parse(params) as {
          table: string;
          schema?: string;
          limit?: number;
        };
      } catch (zodError: unknown) {
        return formatHandlerErrorResponse(zodError, {
            tool: "pg_partition_info",
          });
      }

      // Parse schema.table format if present
      let tableName = parsed.table;
      let schemaName = parsed.schema ?? "public";
      if (tableName.includes(".")) {
        const parts = tableName.split(".");
        schemaName = parts[0] ?? "public";
        tableName = parts[1] ?? tableName;
      }

      // Check table existence and partition status
      const resolvedTable = tableName;
      const tableStatus = await checkTablePartitionStatus(
        adapter,
        resolvedTable,
        schemaName,
      );
      if (tableStatus === "not_found") {
        return {
          success: false,
          error: `Table "${schemaName}.${resolvedTable}" does not exist`,
        };
      }
      if (tableStatus === "not_partitioned") {
        return {
          success: false,
          error: `Table "${schemaName}.${resolvedTable}" exists but is not partitioned. Use pg_create_partitioned_table to create a partitioned table.`,
        };
      }

      const partInfoSql = `SELECT
                        c.relname as table_name,
                        CASE pt.partstrat
                            WHEN 'r' THEN 'RANGE'
                            WHEN 'l' THEN 'LIST'
                            WHEN 'h' THEN 'HASH'
                        END as partition_strategy,
                        pg_get_partkeydef(c.oid) as partition_key,
                        (SELECT count(*) FROM pg_inherits WHERE inhparent = c.oid) as partition_count
                        FROM pg_class c
                        JOIN pg_partitioned_table pt ON c.oid = pt.partrelid
                        JOIN pg_namespace n ON c.relnamespace = n.oid
                        WHERE c.relname = $1 AND n.nspname = $2`;

      const partInfo = await adapter.executeQuery(partInfoSql, [
        resolvedTable,
        schemaName,
      ]);

      const limit = parsed.limit ?? 50;

      let partitionsSql = `SELECT
                        c.relname as partition_name,
                        pg_get_expr(c.relpartbound, c.oid) as bounds,
                        pg_table_size(c.oid) as size_bytes,
                        GREATEST(0, (SELECT reltuples::bigint FROM pg_class WHERE oid = c.oid)) as approx_rows
                        FROM pg_class c
                        JOIN pg_inherits i ON c.oid = i.inhrelid
                        WHERE i.inhparent = ($1 || '.' || $2)::regclass
                        ORDER BY c.relname`;

      if (limit > 0) {
        partitionsSql += ` LIMIT ${String(limit + 1)}`;
      }

      const partitionsResult = await adapter.executeQuery(partitionsSql, [
        schemaName,
        resolvedTable,
      ]);

      const allRows = partitionsResult.rows ?? [];
      const truncated = limit > 0 && allRows.length > limit;
      const rowsToReturn = truncated ? allRows.slice(0, limit) : allRows;

      // Calculate total size using an aggregate query to ensure accuracy even when truncated
      const totalSizeSql = `SELECT COALESCE(SUM(pg_table_size(inhrelid)), 0) as total_bytes
                            FROM pg_inherits WHERE inhparent = ($1 || '.' || $2)::regclass`;
      const sizeResult = await adapter.executeQuery(totalSizeSql, [
        schemaName,
        resolvedTable,
      ]);
      const totalSizeBytes = Number(sizeResult.rows?.[0]?.["total_bytes"] ?? 0);

      // Format sizes consistently and coerce numeric fields
      const partitions = rowsToReturn.map((row) => {
        const sizeBytes = Number(row["size_bytes"] ?? 0);
        return {
          ...row,
          size_bytes: sizeBytes,
          size: formatBytes(sizeBytes),
          approx_rows: Number(row["approx_rows"] ?? 0),
        };
      });

      // Coerce tableInfo numeric fields
      const tableInfoRaw = partInfo.rows?.[0];
      const tableInfo = tableInfoRaw
        ? {
            ...tableInfoRaw,
            partition_count: Number(tableInfoRaw["partition_count"] ?? 0),
          }
        : null;

      const response: Record<string, unknown> = {
        success: true,
        tableInfo,
        partitions,
        totalSizeBytes,
        truncated,
      };

      if (truncated) {
         response["totalCount"] = tableInfo?.partition_count ?? 0;
      }

      return response;
    },
  };
}
