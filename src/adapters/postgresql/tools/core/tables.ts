/**
 * PostgreSQL Core Tools - Table Operations
 *
 * Table listing, description, creation, and deletion tools.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly, write, destructive } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerError } from "./error-helpers.js";
import {
  ListTablesSchemaBase,
  ListTablesSchema,
  DescribeTableSchemaBase,
  DescribeTableSchema,
  CreateTableSchemaBase,
  CreateTableSchema,
  DropTableSchemaBase,
  DropTableSchema,
} from "../../schemas/index.js";
import {
  TableListOutputSchema,
  TableDescribeOutputSchema,
  TableOperationOutputSchema,
} from "./schemas.js";

/**
 * List all tables in the database
 */
export function createListTablesTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_list_tables",
    description:
      "List all tables, views, and materialized views with metadata. Use limit to restrict results.",
    group: "core",
    inputSchema: ListTablesSchemaBase,
    outputSchema: TableListOutputSchema,
    annotations: readOnly("List Tables"),
    icons: getToolIcons("core", readOnly("List Tables")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { schema, limit, exclude } = ListTablesSchema.parse(params);
        let tables = await adapter.listTables();

        if (schema) {
          tables = tables.filter((t) => t.schema === schema);
        }

        // Filter out excluded schemas/extensions
        if (exclude !== undefined && exclude.length > 0) {
          tables = tables.filter((t) => !exclude.includes(t.schema ?? ""));
        }

        // totalCount reflects filtered results (after schema/exclude), before limit
        const totalCount = tables.length;

        // Apply default limit of 100 if not specified; limit: 0 means "no limit" (return all)
        const effectiveLimit = limit === 0 ? undefined : (limit ?? 100);
        const truncated =
          effectiveLimit !== undefined && tables.length > effectiveLimit;
        if (truncated && effectiveLimit !== undefined) {
          tables = tables.slice(0, effectiveLimit);
        }

        return {
          tables,
          count: tables.length,
          totalCount,
          ...(truncated && {
            truncated: true,
            hint: `Showing ${String(effectiveLimit)} of ${String(totalCount)} tables. Use 'limit' to see more, 'schema' to filter, or 'exclude' to hide extension schemas.`,
          }),
        };
      } catch (error: unknown) {
        return formatHandlerError(error, { tool: "pg_list_tables" });
      }
    },
  };
}

/**
 * Describe a table's structure
 */
export function createDescribeTableTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_describe_table",
    description:
      "Get detailed table structure including columns, types, and constraints. For tables/views only, not sequences.",
    group: "core",
    inputSchema: DescribeTableSchemaBase, // Base schema for MCP visibility (table required)
    outputSchema: TableDescribeOutputSchema,
    annotations: readOnly("Describe Table"),
    icons: getToolIcons("core", readOnly("Describe Table")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { table, schema } = DescribeTableSchema.parse(params);
        const schemaName = schema ?? "public";

        // Check object type first to give better error messages for non-tables
        const typeCheck = await adapter.executeQuery(
          `
                SELECT c.relkind
                FROM pg_catalog.pg_class c
                LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relname = $1 AND n.nspname = $2
            `,
          [table, schemaName],
        );

        if (!typeCheck.rows || typeCheck.rows.length === 0) {
          return {
            success: false,
            error: `Object '${schemaName}.${table}' not found. Use pg_list_tables to see available tables.`,
          };
        }

        const relkind = typeCheck.rows[0]?.["relkind"] as string;

        // Sequences have relkind 'S'
        if (relkind === "S") {
          return {
            success: false,
            error: `'${schemaName}.${table}' is a sequence, not a table. Use pg_read_query with "SELECT * FROM ${schemaName}.${table}" to see sequence state, or pg_list_objects to discover objects.`,
          };
        }

        // Only allow tables, views, materialized views, foreign tables, partitioned tables
        const validKinds = ["r", "v", "m", "f", "p"];
        if (!validKinds.includes(relkind)) {
          const kindNames: Record<string, string> = {
            i: "index",
            S: "sequence",
            I: "partitioned index",
            t: "TOAST table",
            c: "composite type",
          };
          const typeName = kindNames[relkind] ?? `unknown type (${relkind})`;
          return {
            success: false,
            error: `'${schemaName}.${table}' is a ${typeName}, not a table. Use pg_list_objects to discover database objects.`,
          };
        }

        return await adapter.describeTable(table, schemaName);
      } catch (error: unknown) {
        return formatHandlerError(error, { tool: "pg_describe_table" });
      }
    },
  };
}

/**
 * Create a new table
 */
export function createCreateTableTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_create_table",
    description:
      "Create a new table with specified columns and constraints. Supports composite primary keys and table-level constraints.",
    group: "core",
    inputSchema: CreateTableSchemaBase,
    outputSchema: TableOperationOutputSchema,
    annotations: write("Create Table"),
    icons: getToolIcons("core", write("Create Table")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { name, schema, columns, primaryKey, constraints, ifNotExists } =
          CreateTableSchema.parse(params);

        const schemaPrefix = schema ? `"${schema}".` : "";
        const ifNotExistsClause = ifNotExists ? "IF NOT EXISTS " : "";

        // Determine primary key: prefer explicit primaryKey array, else column-level
        const explicitPK =
          primaryKey && primaryKey.length > 0 ? primaryKey : null;
        const pkColumns = explicitPK
          ? columns.filter((col) => explicitPK.includes(col.name))
          : columns.filter((col) => col.primaryKey === true);
        const isCompositePK = pkColumns.length > 1 || explicitPK !== null;

        const columnDefs = columns.map((col) => {
          const parts = [`"${col.name}"`, col.type];

          // Only add inline PRIMARY KEY for single-column PKs defined at column level (not explicitPK)
          if (col.primaryKey && !isCompositePK && explicitPK === null) {
            parts.push("PRIMARY KEY");
          }
          if (col.unique && !col.primaryKey) {
            parts.push("UNIQUE");
          }
          if (col.nullable === false) {
            parts.push("NOT NULL");
          }
          if (col.default !== undefined) {
            parts.push(`DEFAULT ${col.default}`);
          }
          if (col.check !== undefined) {
            parts.push(`CHECK (${col.check})`);
          }
          if (col.references) {
            let ref = `REFERENCES "${col.references.table}"("${col.references.column}")`;
            if (col.references.onDelete) {
              ref += ` ON DELETE ${col.references.onDelete}`;
            }
            if (col.references.onUpdate) {
              ref += ` ON UPDATE ${col.references.onUpdate}`;
            }
            parts.push(ref);
          }

          return parts.join(" ");
        });

        // Add table-level PRIMARY KEY constraint
        if (explicitPK && explicitPK.length > 0) {
          const pkColumnNames = explicitPK.map((c) => `"${c}"`).join(", ");
          columnDefs.push(`PRIMARY KEY (${pkColumnNames})`);
        } else if (isCompositePK && pkColumns.length > 0) {
          const pkColumnNames = pkColumns
            .map((col) => `"${col.name}"`)
            .join(", ");
          columnDefs.push(`PRIMARY KEY (${pkColumnNames})`);
        }

        // Add table-level constraints (CHECK, UNIQUE)
        if (constraints && constraints.length > 0) {
          for (const constraint of constraints) {
            if (constraint.type === "check" && constraint.expression) {
              const constraintName = constraint.name
                ? `CONSTRAINT "${constraint.name}" `
                : "";
              columnDefs.push(
                `${constraintName}CHECK (${constraint.expression})`,
              );
            } else if (
              constraint.type === "unique" &&
              constraint.columns &&
              constraint.columns.length > 0
            ) {
              const constraintName = constraint.name
                ? `CONSTRAINT "${constraint.name}" `
                : "";
              const uniqueCols = constraint.columns
                .map((c) => `"${c}"`)
                .join(", ");
              columnDefs.push(`${constraintName}UNIQUE (${uniqueCols})`);
            }
          }
        }

        const sql = `CREATE TABLE ${ifNotExistsClause}${schemaPrefix}"${name}" (\n  ${columnDefs.join(",\n  ")}\n)`;

        try {
          await adapter.executeQuery(sql);
        } catch (error: unknown) {
          return formatHandlerError(error, {
              tool: "pg_create_table",
              table: name,
              schema: schema ?? "public",
            });
        }

        return {
          success: true,
          table: `${schema ?? "public"}.${name}`,
          sql,
          // Add hint about composite primary key if used
          ...(isCompositePK && {
            compositePrimaryKey: pkColumns.map((c) => c.name),
          }),
        };
      } catch (error: unknown) {
        return formatHandlerError(error, { tool: "pg_create_table" });
      }
    },
  };
}

/**
 * Drop a table
 */
export function createDropTableTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_drop_table",
    description: "Drop a table from the database.",
    group: "core",
    inputSchema: DropTableSchemaBase,
    outputSchema: TableOperationOutputSchema,
    annotations: destructive("Drop Table"),
    icons: getToolIcons("core", destructive("Drop Table")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { table, schema, ifExists, cascade } =
          DropTableSchema.parse(params);

        const schemaName = schema ?? "public";
        const schemaPrefix = schema ? `"${schema}".` : "";
        const ifExistsClause = ifExists ? "IF EXISTS " : "";
        const cascadeClause = cascade ? " CASCADE" : "";

        // Check if table exists before dropping (for existed property)
        const existsCheck = await adapter.executeQuery(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
          [schemaName, table],
        );
        const existed = (existsCheck.rows?.length ?? 0) > 0;

        const sql = `DROP TABLE ${ifExistsClause}${schemaPrefix}"${table}"${cascadeClause}`;

        try {
          await adapter.executeQuery(sql);
        } catch (error: unknown) {
          return formatHandlerError(error, {
              tool: "pg_drop_table",
              table,
              schema: schemaName,
            });
        }

        return {
          success: true,
          dropped: `${schemaName}.${table}`,
          existed,
        };
      } catch (error: unknown) {
        return formatHandlerError(error, { tool: "pg_drop_table" });
      }
    },
  };
}
