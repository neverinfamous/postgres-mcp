/**
 * PostgreSQL Partitioning Tools - Management
 *
 * Partition management: list, create table, create partition, attach.
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
  sanitizeIdentifier,
  sanitizeTableName,
} from "../../../../utils/identifiers.js";
import {
  CreatePartitionedTableSchema,
  CreatePartitionedTableSchemaBase,
  CreatePartitionSchema,
  CreatePartitionSchemaBase,
  ListPartitionsSchema,
  ListPartitionsSchemaBase,
  ListPartitionsOutputSchema,
  CreatePartitionedTableOutputSchema,
  CreatePartitionOutputSchema,
} from "../../schemas/index.js";
/**
 * Parse schema.table format identifier
 * Returns { table, schema } with schema extracted from prefix if present
 */

export function parseSchemaTable(
  identifier: string,
  defaultSchema?: string,
): { table: string; schema: string } {
  if (identifier.includes(".")) {
    const parts = identifier.split(".");
    return {
      schema: parts[0] ?? defaultSchema ?? "public",
      table: parts[1] ?? identifier,
    };
  }
  return { table: identifier, schema: defaultSchema ?? "public" };
}

/**
 * Format bytes to human-readable string with consistent formatting
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Check table existence and partition status
 * Returns: 'partitioned' | 'not_partitioned' | 'not_found'
 */
export async function checkTablePartitionStatus(
  adapter: PostgresAdapter,
  table: string,
  schema: string,
): Promise<"partitioned" | "not_partitioned" | "not_found"> {
  // 'r' = regular table, 'p' = partitioned table
  const checkSql = `SELECT c.relkind FROM pg_class c
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relname = $1 AND n.nspname = $2
        AND c.relkind IN ('r', 'p')`;
  const result = await adapter.executeQuery(checkSql, [table, schema]);

  const rows = result.rows ?? [];
  if (rows.length === 0) {
    return "not_found";
  }

  return rows[0]?.["relkind"] === "p" ? "partitioned" : "not_partitioned";
}

export function createListPartitionsTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_list_partitions",
    description:
      "List all partitions of a partitioned table. Returns warning if table is not partitioned.",
    group: "partitioning",
    inputSchema: ListPartitionsSchemaBase, // Base schema for MCP visibility with alias support
    outputSchema: ListPartitionsOutputSchema,
    annotations: readOnly("List Partitions"),
    icons: getToolIcons("partitioning", readOnly("List Partitions")),
    handler: async (params: unknown, _context: RequestContext) => {
      // Use preprocessed schema for alias resolution
      let parsed;
      try {
        parsed = ListPartitionsSchema.parse(params) as {
          table: string;
          schema?: string;
          limit?: number;
        };
      } catch (zodError: unknown) {
        return formatHandlerErrorResponse(zodError, {
            tool: "pg_list_partitions",
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
      const resolvedTable = tableName ?? "";
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

      // Resolve limit: default 50, 0 = no limit
      const limit = parsed.limit ?? 50;

      // Build query with optional limit
      let sql = `SELECT
                        c.relname as partition_name,
                        pg_get_expr(c.relpartbound, c.oid) as bounds,
                        pg_table_size(c.oid) as size_bytes,
                        (SELECT relname FROM pg_class WHERE oid = i.inhparent) as parent_table
                        FROM pg_class c
                        JOIN pg_inherits i ON c.oid = i.inhrelid
                        JOIN pg_namespace n ON c.relnamespace = n.oid
                        WHERE i.inhparent = ($1 || '.' || $2)::regclass
                        ORDER BY c.relname`;

      if (limit > 0) {
        sql += ` LIMIT ${String(limit + 1)}`; // Fetch one extra to detect truncation
      }

      const result = await adapter.executeQuery(sql, [
        schemaName,
        resolvedTable,
      ]);

      const allRows = result.rows ?? [];
      const truncated = limit > 0 && allRows.length > limit;
      const rowsToReturn = truncated ? allRows.slice(0, limit) : allRows;

      // Format sizes consistently and coerce size_bytes to number
      const partitions = rowsToReturn.map((row) => {
        const sizeBytes = Number(row["size_bytes"] ?? 0);
        return {
          ...row,
          size_bytes: sizeBytes,
          size: formatBytes(sizeBytes),
        };
      });

      // Build response with truncation indicators
      const response: Record<string, unknown> = {
        success: true,
        partitions,
        count: partitions.length,
        truncated,
      };

      if (truncated) {
        // Get total count when truncated
        const countSql = `SELECT COUNT(*) as total FROM pg_inherits WHERE inhparent = ($1 || '.' || $2)::regclass`;
        const countResult = await adapter.executeQuery(countSql, [
          schemaName,
          resolvedTable,
        ]);
        response["totalCount"] = Number(
          countResult.rows?.[0]?.["total"] ?? partitions.length,
        );
      }

      return response;
    },
  };
}

export function createPartitionedTableTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_create_partitioned_table",
    description:
      "Create a partitioned table. Columns: notNull, primaryKey, unique, default. Note: primaryKey/unique must include the partition key column.",
    group: "partitioning",
    inputSchema: CreatePartitionedTableSchemaBase, // Base schema for MCP visibility
    outputSchema: CreatePartitionedTableOutputSchema,
    annotations: write("Create Partitioned Table"),
    icons: getToolIcons("partitioning", write("Create Partitioned Table")),
    handler: async (params: unknown, _context: RequestContext) => {
      let parsed;
      try {
        parsed = CreatePartitionedTableSchema.parse(params) as {
          name: string;
          schema?: string;
          columns: {
            name: string;
            type: string;
            nullable?: boolean;
            notNull?: boolean;
            primaryKey?: boolean;
            unique?: boolean;
            default?: string | number | boolean | null;
          }[];
          partitionBy: "range" | "list" | "hash";
          partitionKey: string;
          primaryKey?: string[];
          ifNotExists?: boolean;
        };
      } catch (zodError: unknown) {
        return formatHandlerErrorResponse(zodError, {
            tool: "pg_create_partitioned_table",
          });
      }
      const { name, schema, columns, partitionBy, partitionKey, primaryKey, ifNotExists } =
        parsed;

      const tableName = sanitizeTableName(name, schema);

      // Parse partition key columns (may be comma-separated for multi-column keys)
      // Handles: 'col1', 'col1, col2', '(col1, col2)', etc.
      const partitionKeyColumns = partitionKey
        .replace(/^\(|\)$/g, "") // Remove surrounding parentheses if present
        .split(",")
        .map((col) => col.trim())
        .filter((col) => col.length > 0);

      // Validate table-level primaryKey includes ALL partition key columns
      if (primaryKey && primaryKey.length > 0) {
        const missingColumns = partitionKeyColumns.filter(
          (col) => !primaryKey.includes(col),
        );
        if (missingColumns.length > 0) {
          return {
            success: false,
            error:
              `Primary key must include all partition key columns. ` +
              `Missing: [${missingColumns.join(", ")}]. ` +
              `Got primaryKey: [${primaryKey.join(", ")}], partitionKey columns: [${partitionKeyColumns.join(", ")}]. ` +
              `PostgreSQL requires all partition key columns to be part of primary key constraints on partitioned tables.`,
          };
        }
      }

      // Validate column-level primaryKey includes ALL partition key columns
      const columnsWithPK = columns.filter((col) => col.primaryKey === true);
      if (columnsWithPK.length > 0 && !primaryKey) {
        const pkColumnNames = columnsWithPK.map((col) => col.name);
        const missingCols = partitionKeyColumns.filter(
          (col) => !pkColumnNames.includes(col),
        );
        if (missingCols.length > 0) {
          return {
            success: false,
            error:
              `Primary key must include all partition key columns. ` +
              `Missing: [${missingCols.join(", ")}]. ` +
              `Columns with primaryKey: true: [${pkColumnNames.join(", ")}], partitionKey columns: [${partitionKeyColumns.join(", ")}]. ` +
              `PostgreSQL requires all partition key columns to be part of primary key constraints on partitioned tables.`,
          };
        }
      }

      // Determine if we need a table-level PRIMARY KEY constraint
      const useTableLevelPK = primaryKey && primaryKey.length > 0;

      // Build column definitions with full constraint support
      const columnDefs = columns
        .map((col) => {
          let def = `${sanitizeIdentifier(col.name)} ${col.type}`;

          // Handle nullable/notNull (notNull takes precedence as explicit intent)
          if (col.notNull === true || col.nullable === false) {
            def += " NOT NULL";
          }

          // Handle default value
          if (col.default !== undefined) {
            if (col.default === null) {
              def += " DEFAULT NULL";
            } else if (typeof col.default === "string") {
              let defaultVal = col.default;
              // Strip outer quotes if user provided them (common mistake)
              if (
                (defaultVal.startsWith("'") && defaultVal.endsWith("'")) ||
                (defaultVal.startsWith('"') && defaultVal.endsWith('"'))
              ) {
                defaultVal = defaultVal.slice(1, -1);
              }
              // Escape single quotes in the value
              const escapedVal = defaultVal.replace(/'/g, "''");
              def += ` DEFAULT '${escapedVal}'`;
            } else {
              def += ` DEFAULT ${String(col.default)}`;
            }
          }

          // Handle unique constraint (skip if table-level PK will cover this column)
          if (col.unique === true) {
            def += " UNIQUE";
          }

          // Handle column-level primary key (only if NOT using table-level PK)
          if (col.primaryKey === true && !useTableLevelPK) {
            def += " PRIMARY KEY";
          }

          return def;
        })
        .join(",\n  ");

      // Build table-level PRIMARY KEY constraint if primaryKey array provided
      let tableConstraints = "";
      if (primaryKey !== undefined && primaryKey.length > 0) {
        const pkColumnList = primaryKey
          .map((col) => sanitizeIdentifier(col))
          .join(", ");
        tableConstraints = `,\n  PRIMARY KEY (${pkColumnList})`;
      }

      const sql = `CREATE TABLE ${ifNotExists ? "IF NOT EXISTS " : ""}${tableName} (\n  ${columnDefs}${tableConstraints}\n) PARTITION BY ${partitionBy.toUpperCase()} (${partitionKey})`;

      try {
        await adapter.executeQuery(sql);
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_create_partitioned_table",
            table: name,
            ...(schema !== undefined && { schema }),
          });
      }
      return {
        success: true,
        table: `${schema ?? "public"}.${name}`,
        partitionBy,
        partitionKey,
        ...(useTableLevelPK && { primaryKey }),
      };
    },
  };
}

export function createPartitionTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_create_partition",
    description:
      "Create a partition. Use subpartitionBy/subpartitionKey to make it sub-partitionable for multi-level partitioning.",
    group: "partitioning",
    inputSchema: CreatePartitionSchemaBase, // Base schema for MCP visibility
    outputSchema: CreatePartitionOutputSchema,
    annotations: write("Create Partition"),
    icons: getToolIcons("partitioning", write("Create Partition")),
    handler: async (params: unknown, _context: RequestContext) => {
      // Preprocessing resolves parent from parent/parentTable/table aliases
      let parsed;
      try {
        parsed = CreatePartitionSchema.parse(params) as {
          parent: string;
          name: string;
          schema?: string;
          forValues: string;
          subpartitionBy?: "range" | "list" | "hash";
          subpartitionKey?: string;
          ifNotExists?: boolean;
        };
      } catch (zodError: unknown) {
        return formatHandlerErrorResponse(zodError, {
            tool: "pg_create_partition",
          });
      }
      const {
        parent,
        name,
        schema,
        forValues,
        subpartitionBy,
        subpartitionKey,
        ifNotExists,
      } = parsed;

      // Validate sub-partitioning parameters
      if (subpartitionBy !== undefined && subpartitionKey === undefined) {
        return {
          success: false,
          error: "subpartitionKey is required when subpartitionBy is specified",
        };
      }

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
          error: `Table '${parsedParentCheck.schema}.${parsedParentCheck.table}' does not exist.`,
        };
      }
      if (parentStatus === "not_partitioned") {
        return {
          success: false,
          error: `Table '${parsedParentCheck.schema}.${parsedParentCheck.table}' exists but is not partitioned. Use pg_create_partitioned_table to create a partitioned table first.`,
        };
      }

      // Parse schema.table format from parent (takes priority over explicit schema)
      const parsedParent = parseSchemaTable(parent, schema);
      const resolvedSchema = parsedParent.schema;

      const partitionName = sanitizeTableName(name, resolvedSchema);
      const parentName = sanitizeTableName(
        parsedParent.table,
        parsedParent.schema,
      );

      let sql = `CREATE TABLE ${ifNotExists === true ? "IF NOT EXISTS " : ""}${partitionName} PARTITION OF ${parentName}`;

      // Add partition bounds
      // Handle DEFAULT partition: accept both "__DEFAULT__" (from preprocessor when isDefault: true)
      // and explicit "DEFAULT" string for API consistency with attachPartition
      const isDefaultPartition =
        forValues === "__DEFAULT__" ||
        forValues.toUpperCase() === "DEFAULT" ||
        forValues.toUpperCase().trim() === "DEFAULT";

      let boundsDescription: string;
      if (isDefaultPartition) {
        sql += " DEFAULT";
        boundsDescription = "DEFAULT";
      } else {
        sql += ` FOR VALUES ${forValues}`;
        boundsDescription = forValues;
      }

      // Add sub-partitioning clause if requested
      if (subpartitionBy !== undefined && subpartitionKey !== undefined) {
        sql += ` PARTITION BY ${subpartitionBy.toUpperCase()} (${subpartitionKey})`;
      }

      try {
        await adapter.executeQuery(sql);
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_create_partition",
            table: name,
          });
      }

      const result: Record<string, unknown> = {
        success: true,
        partition: `${resolvedSchema}.${name}`,
        parent: parsedParent.table,
        bounds: boundsDescription,
      };

      // Include sub-partitioning info in response if applicable
      if (subpartitionBy !== undefined) {
        result["subpartitionBy"] = subpartitionBy;
        result["subpartitionKey"] = subpartitionKey;
      }

      return result;
    },
  };
}
