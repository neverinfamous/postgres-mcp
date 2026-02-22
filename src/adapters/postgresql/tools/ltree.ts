/**
 * PostgreSQL ltree Extension Tools
 * 8 tools total.
 */

import type { PostgresAdapter } from "../PostgresAdapter.js";
import type { ToolDefinition, RequestContext } from "../../../types/index.js";
import { z } from "zod";
import { readOnly, write } from "../../../utils/annotations.js";
import { getToolIcons } from "../../../utils/icons.js";
import { parsePostgresError } from "./core/error-helpers.js";
import {
  LtreeQuerySchema,
  LtreeQuerySchemaBase,
  LtreeSubpathSchema,
  LtreeSubpathSchemaBase,
  LtreeLcaSchema,
  LtreeMatchSchema,
  LtreeMatchSchemaBase,
  LtreeListColumnsSchemaBase,
  LtreeListColumnsSchema,
  LtreeConvertColumnSchema,
  LtreeConvertColumnSchemaBase,
  LtreeIndexSchema,
  LtreeIndexSchemaBase,
  // Output schemas
  LtreeCreateExtensionOutputSchema,
  LtreeQueryOutputSchema,
  LtreeSubpathOutputSchema,
  LtreeLcaOutputSchema,
  LtreeMatchOutputSchema,
  LtreeListColumnsOutputSchema,
  LtreeConvertColumnOutputSchema,
  LtreeCreateIndexOutputSchema,
} from "../schemas/index.js";

export function getLtreeTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    createLtreeExtensionTool(adapter),
    createLtreeQueryTool(adapter),
    createLtreeSubpathTool(adapter),
    createLtreeLcaTool(adapter),
    createLtreeMatchTool(adapter),
    createLtreeListColumnsTool(adapter),
    createLtreeConvertColumnTool(adapter),
    createLtreeCreateIndexTool(adapter),
  ];
}

function createLtreeExtensionTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_ltree_create_extension",
    description:
      "Enable the ltree extension for hierarchical tree-structured labels.",
    group: "ltree",
    inputSchema: z.object({}),
    outputSchema: LtreeCreateExtensionOutputSchema,
    annotations: write("Create Ltree Extension"),
    icons: getToolIcons("ltree", write("Create Ltree Extension")),
    handler: async (_params: unknown, _context: RequestContext) => {
      await adapter.executeQuery("CREATE EXTENSION IF NOT EXISTS ltree");
      return { success: true, message: "ltree extension enabled" };
    },
  };
}

function createLtreeQueryTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_ltree_query",
    description:
      "Query hierarchical relationships in ltree columns. Supports exact paths (descendants/ancestors) and lquery patterns with wildcards.",
    group: "ltree",
    inputSchema: LtreeQuerySchemaBase, // Base schema for MCP visibility
    outputSchema: LtreeQueryOutputSchema,
    annotations: readOnly("Query Ltree"),
    icons: getToolIcons("ltree", readOnly("Query Ltree")),
    handler: async (params: unknown, _context: RequestContext) => {
      const { table, column, path, mode, schema, limit } =
        LtreeQuerySchema.parse(params);
      const schemaName = schema ?? "public";
      const queryMode = mode ?? "descendants";
      const qualifiedTable = `"${schemaName}"."${table}"`;
      const limitClause = limit !== undefined ? `LIMIT ${String(limit)}` : "";

      // Validate column is ltree type
      const colCheck = await adapter.executeQuery(
        `SELECT udt_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
        [schemaName, table, column],
      );
      if (!colCheck.rows || colCheck.rows.length === 0) {
        // Distinguish table-not-found from column-not-found
        const tableCheck = await adapter.executeQuery(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
          [schemaName, table],
        );
        if (!tableCheck.rows || tableCheck.rows.length === 0) {
          return {
            success: false,
            error: `Table ${qualifiedTable} does not exist.`,
          };
        }
        return {
          success: false,
          error: `Column "${column}" not found in table ${qualifiedTable}.`,
        };
      }
      const udtName = colCheck.rows[0]?.["udt_name"] as string;
      if (udtName !== "ltree") {
        return {
          success: false,
          error: `Column "${column}" is not an ltree type (found: ${udtName}). Use an ltree column or convert with pg_ltree_convert_column.`,
        };
      }

      // Detect if path contains lquery pattern characters
      const isLqueryPattern = /[*?{!@|]/.test(path);

      // Get total count when limit is applied for truncation indicators
      let totalCount: number | undefined;
      if (limit !== undefined) {
        let countSql: string;
        if (isLqueryPattern) {
          countSql = `SELECT COUNT(*)::int as total FROM ${qualifiedTable} WHERE "${column}" ~ $1::lquery`;
        } else {
          let operator: string;
          switch (queryMode) {
            case "ancestors":
              operator = "@>";
              break;
            case "exact":
              operator = "=";
              break;
            default:
              operator = "<@";
          }
          countSql = `SELECT COUNT(*)::int as total FROM ${qualifiedTable} WHERE "${column}" ${operator} $1::ltree`;
        }
        const countResult = await adapter.executeQuery(countSql, [path]);
        totalCount = countResult.rows?.[0]?.["total"] as number;
      }

      let sql: string;
      if (isLqueryPattern) {
        // Use lquery pattern matching with ~ operator
        sql = `SELECT *, nlevel("${column}") as depth FROM ${qualifiedTable} WHERE "${column}" ~ $1::lquery ORDER BY "${column}" ${limitClause}`;
      } else {
        // Use standard ltree hierarchy operators
        // @> means "is ancestor of" (left contains right)
        // <@ means "is descendant of" (left is contained by right)
        let operator: string;
        switch (queryMode) {
          // ancestors: column @> path means column contains path, i.e., column is ancestor of path
          case "ancestors":
            operator = "@>";
            break;
          case "exact":
            operator = "=";
            break;
          // descendants: column <@ path means column is contained by path, i.e., column is descendant of path
          default:
            operator = "<@";
        }
        sql = `SELECT *, nlevel("${column}") as depth FROM ${qualifiedTable} WHERE "${column}" ${operator} $1::ltree ORDER BY "${column}" ${limitClause}`;
      }

      const result = await adapter.executeQuery(sql, [path]);
      const resultCount = result.rows?.length ?? 0;
      const response: Record<string, unknown> = {
        path,
        mode: isLqueryPattern ? "pattern" : queryMode,
        isPattern: isLqueryPattern,
        results: result.rows ?? [],
        count: resultCount,
      };

      // Add truncation indicators when limit is applied
      if (limit !== undefined && totalCount !== undefined) {
        response["truncated"] = resultCount < totalCount;
        response["totalCount"] = totalCount;
      }

      return response;
    },
  };
}

function createLtreeSubpathTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_ltree_subpath",
    description: "Extract a portion of an ltree path.",
    group: "ltree",
    inputSchema: LtreeSubpathSchemaBase, // Base schema for MCP visibility
    outputSchema: LtreeSubpathOutputSchema,
    annotations: readOnly("Ltree Subpath"),
    icons: getToolIcons("ltree", readOnly("Ltree Subpath")),
    handler: async (params: unknown, _context: RequestContext) => {
      const { path, offset, length } = LtreeSubpathSchema.parse(params);

      // First get the path depth for validation
      const depthResult = await adapter.executeQuery(
        `SELECT nlevel($1::ltree) as depth`,
        [path],
      );
      const pathDepth = depthResult.rows?.[0]?.["depth"] as number;

      // Validate offset is within bounds
      const effectiveOffset = offset < 0 ? pathDepth + offset : offset;
      if (effectiveOffset < 0 || effectiveOffset >= pathDepth) {
        return {
          success: false,
          error: `Invalid offset: ${String(offset)}. Path "${path}" has ${String(pathDepth)} labels (valid offset range: 0 to ${String(pathDepth - 1)}, or -${String(pathDepth)} to -1 for negative indexing).`,
          originalPath: path,
          pathDepth,
        };
      }

      const sql =
        length !== undefined
          ? `SELECT subpath($1::ltree, $2, $3) as subpath, nlevel($1::ltree) as original_depth`
          : `SELECT subpath($1::ltree, $2) as subpath, nlevel($1::ltree) as original_depth`;
      const queryParams =
        length !== undefined ? [path, offset, length] : [path, offset];
      const result = await adapter.executeQuery(sql, queryParams);
      const row = result.rows?.[0];
      return {
        originalPath: path,
        offset,
        length: length ?? "to end",
        subpath: row?.["subpath"] as string,
        originalDepth: row?.["original_depth"] as number,
      };
    },
  };
}

function createLtreeLcaTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_ltree_lca",
    description: "Find the longest common ancestor of multiple ltree paths.",
    group: "ltree",
    inputSchema: LtreeLcaSchema,
    outputSchema: LtreeLcaOutputSchema,
    annotations: readOnly("Ltree LCA"),
    icons: getToolIcons("ltree", readOnly("Ltree LCA")),
    handler: async (params: unknown, _context: RequestContext) => {
      const { paths } = LtreeLcaSchema.parse(params);
      const arrayLiteral = paths
        .map((p) => `'${p.replace(/'/g, "''")}'::ltree`)
        .join(", ");
      const sql = `SELECT lca(ARRAY[${arrayLiteral}]) as lca`;
      const result = await adapter.executeQuery(sql);
      const lca = result.rows?.[0]?.["lca"] as string | null;
      return {
        paths,
        longestCommonAncestor: lca ?? "",
        hasCommonAncestor: lca !== null && lca !== "",
      };
    },
  };
}

function createLtreeMatchTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_ltree_match",
    description: "Match ltree paths using lquery pattern syntax.",
    group: "ltree",
    inputSchema: LtreeMatchSchemaBase, // Base schema for MCP visibility
    outputSchema: LtreeMatchOutputSchema,
    annotations: readOnly("Ltree Match"),
    icons: getToolIcons("ltree", readOnly("Ltree Match")),
    handler: async (params: unknown, _context: RequestContext) => {
      const { table, column, pattern, schema, limit } =
        LtreeMatchSchema.parse(params);
      const schemaName = schema ?? "public";
      const qualifiedTable = `"${schemaName}"."${table}"`;
      const limitClause = limit !== undefined ? `LIMIT ${String(limit)}` : "";

      // Validate table exists and column is ltree type
      const colCheck = await adapter.executeQuery(
        `SELECT udt_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
        [schemaName, table, column],
      );
      if (!colCheck.rows || colCheck.rows.length === 0) {
        const tableCheck = await adapter.executeQuery(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
          [schemaName, table],
        );
        if (!tableCheck.rows || tableCheck.rows.length === 0) {
          return {
            success: false,
            error: `Table ${qualifiedTable} does not exist.`,
          };
        }
        return {
          success: false,
          error: `Column "${column}" not found in table ${qualifiedTable}.`,
        };
      }
      const udtName = colCheck.rows[0]?.["udt_name"] as string;
      if (udtName !== "ltree") {
        return {
          success: false,
          error: `Column "${column}" is not an ltree type (found: ${udtName}). Use an ltree column or convert with pg_ltree_convert_column.`,
        };
      }

      try {
        // Get total count when limit is applied for truncation indicators
        let totalCount: number | undefined;
        if (limit !== undefined) {
          const countSql = `SELECT COUNT(*)::int as total FROM ${qualifiedTable} WHERE "${column}" ~ $1::lquery`;
          const countResult = await adapter.executeQuery(countSql, [pattern]);
          totalCount = countResult.rows?.[0]?.["total"] as number;
        }

        const sql = `SELECT *, nlevel("${column}") as depth FROM ${qualifiedTable} WHERE "${column}" ~ $1::lquery ORDER BY "${column}" ${limitClause}`;
        const result = await adapter.executeQuery(sql, [pattern]);
        const resultCount = result.rows?.length ?? 0;
        const response: Record<string, unknown> = {
          pattern,
          results: result.rows ?? [],
          count: resultCount,
        };

        // Add truncation indicators when limit is applied
        if (limit !== undefined && totalCount !== undefined) {
          response["truncated"] = resultCount < totalCount;
          response["totalCount"] = totalCount;
        }

        return response;
      } catch (error) {
        return {
          success: false,
          error: parsePostgresError(error, {
            tool: "pg_ltree_match",
            table,
            schema: schemaName,
          }).message,
        };
      }
    },
  };
}

function createLtreeListColumnsTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_ltree_list_columns",
    description: "List all columns using the ltree type in the database.",
    group: "ltree",
    inputSchema: LtreeListColumnsSchemaBase,
    outputSchema: LtreeListColumnsOutputSchema,
    annotations: readOnly("List Ltree Columns"),
    icons: getToolIcons("ltree", readOnly("List Ltree Columns")),
    handler: async (params: unknown, _context: RequestContext) => {
      const { schema } = LtreeListColumnsSchema.parse(params);
      const conditions: string[] = [
        "udt_name = 'ltree'",
        "table_schema NOT IN ('pg_catalog', 'information_schema')",
      ];
      const queryParams: unknown[] = [];
      if (schema !== undefined) {
        conditions.push(`table_schema = $1`);
        queryParams.push(schema);
      }
      const sql = `SELECT table_schema, table_name, column_name, is_nullable, column_default FROM information_schema.columns WHERE ${conditions.join(" AND ")} ORDER BY table_schema, table_name, ordinal_position`;
      const result = await adapter.executeQuery(sql, queryParams);
      return { columns: result.rows ?? [], count: result.rows?.length ?? 0 };
    },
  };
}

function createLtreeConvertColumnTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_ltree_convert_column",
    description:
      "Convert an existing TEXT column to LTREE type. Note: If views depend on this column, you must drop and recreate them manually before conversion.",
    group: "ltree",
    inputSchema: LtreeConvertColumnSchemaBase, // Base schema for MCP visibility
    outputSchema: LtreeConvertColumnOutputSchema,
    annotations: write("Convert to Ltree"),
    icons: getToolIcons("ltree", write("Convert to Ltree")),
    handler: async (params: unknown, _context: RequestContext) => {
      const { table, column, schema } = LtreeConvertColumnSchema.parse(params);
      const schemaName = schema ?? "public";
      const qualifiedTable = `"${schemaName}"."${table}"`;

      // Check if ltree extension is installed
      const extCheck = await adapter.executeQuery(`
        SELECT EXISTS(
          SELECT 1 FROM pg_extension WHERE extname = 'ltree'
        ) as installed
      `);
      const hasExt = (extCheck.rows?.[0]?.["installed"] as boolean) ?? false;
      if (!hasExt) {
        return {
          success: false,
          error:
            "ltree extension is not installed. Run pg_ltree_create_extension first.",
        };
      }

      const colCheck = await adapter.executeQuery(
        `SELECT data_type, udt_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
        [schemaName, table, column],
      );
      if (!colCheck.rows || colCheck.rows.length === 0) {
        // Distinguish table-not-found from column-not-found
        const tableCheck = await adapter.executeQuery(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
          [schemaName, table],
        );
        if (!tableCheck.rows || tableCheck.rows.length === 0) {
          return {
            success: false,
            error: `Table ${qualifiedTable} does not exist. Verify the table name.`,
          };
        }
        return {
          success: false,
          error: `Column "${column}" not found in table ${qualifiedTable}. Verify the column name.`,
        };
      }

      const dataType = colCheck.rows[0]?.["data_type"] as string;
      const udtName = colCheck.rows[0]?.["udt_name"] as string;
      const currentType = dataType === "USER-DEFINED" ? udtName : dataType;

      if (udtName === "ltree") {
        return {
          success: true,
          message: `Column ${column} is already ltree`,
          table: qualifiedTable,
          previousType: "ltree",
          wasAlreadyLtree: true,
        };
      }

      // Validate source column is text-based (like citext tool does)
      const allowedTypes = ["text", "varchar", "character varying", "bpchar"];
      const normalizedType = dataType.toLowerCase();
      if (!allowedTypes.includes(normalizedType)) {
        return {
          success: false,
          error: `Cannot convert column "${column}" of type "${currentType}" to ltree. Only text-based columns can be converted.`,
          currentType,
          allowedTypes: ["text", "varchar", "character varying"],
          suggestion:
            "Create a new TEXT column with ltree-formatted paths, then convert that column.",
        };
      }

      // Check for dependent views before attempting the conversion
      const depCheck = await adapter.executeQuery(
        `
        SELECT DISTINCT 
          c.relname as dependent_view,
          n.nspname as view_schema
        FROM pg_depend d
        JOIN pg_rewrite r ON d.objid = r.oid
        JOIN pg_class c ON r.ev_class = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        JOIN pg_class t ON d.refobjid = t.oid
        JOIN pg_namespace tn ON t.relnamespace = tn.oid
        JOIN pg_attribute a ON d.refobjid = a.attrelid AND d.refobjsubid = a.attnum
        WHERE c.relkind = 'v'
          AND tn.nspname = $1
          AND t.relname = $2
          AND a.attname = $3
        `,
        [schemaName, table, column],
      );

      const dependentViews = depCheck.rows ?? [];

      if (dependentViews.length > 0) {
        return {
          success: false,
          error:
            "Column has dependent views that must be dropped before conversion",
          dependentViews: dependentViews.map(
            (v) =>
              `${v["view_schema"] as string}.${v["dependent_view"] as string}`,
          ),
          hint: "Drop the listed views, run this conversion, then recreate the views. PostgreSQL cannot ALTER COLUMN TYPE when views depend on it.",
        };
      }

      try {
        await adapter.executeQuery(
          `ALTER TABLE ${qualifiedTable} ALTER COLUMN "${column}" TYPE ltree USING "${column}"::ltree`,
        );
        return {
          success: true,
          message: `Column ${column} converted to ltree`,
          table: qualifiedTable,
          previousType: currentType,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to convert column: ${errorMessage}`,
          hint: "If views depend on this column, they may need to be dropped and recreated",
        };
      }
    },
  };
}

function createLtreeCreateIndexTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_ltree_create_index",
    description:
      "Create a GiST index on an ltree column for efficient tree queries.",
    group: "ltree",
    inputSchema: LtreeIndexSchemaBase, // Base schema for MCP visibility
    outputSchema: LtreeCreateIndexOutputSchema,
    annotations: write("Create Ltree Index"),
    icons: getToolIcons("ltree", write("Create Ltree Index")),
    handler: async (params: unknown, _context: RequestContext) => {
      const { table, column, indexName, schema } =
        LtreeIndexSchema.parse(params);
      const schemaName = schema ?? "public";
      const qualifiedTable = `"${schemaName}"."${table}"`;
      const idxName = indexName ?? `idx_${table}_${column}_ltree`;

      // Validate table exists and column is ltree type
      const colCheck = await adapter.executeQuery(
        `SELECT udt_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
        [schemaName, table, column],
      );
      if (!colCheck.rows || colCheck.rows.length === 0) {
        const tableCheck = await adapter.executeQuery(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
          [schemaName, table],
        );
        if (!tableCheck.rows || tableCheck.rows.length === 0) {
          return {
            success: false,
            error: `Table ${qualifiedTable} does not exist.`,
          };
        }
        return {
          success: false,
          error: `Column "${column}" not found in table ${qualifiedTable}.`,
        };
      }
      const udtName = colCheck.rows[0]?.["udt_name"] as string;
      if (udtName !== "ltree") {
        return {
          success: false,
          error: `Column "${column}" is not an ltree type (found: ${udtName}). Use an ltree column or convert with pg_ltree_convert_column.`,
        };
      }

      try {
        const idxCheck = await adapter.executeQuery(
          `SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = $2) as exists`,
          [schemaName, idxName],
        );
        if (idxCheck.rows?.[0]?.["exists"] as boolean)
          return {
            success: true,
            message: `Index ${idxName} already exists`,
            indexName: idxName,
            table: qualifiedTable,
            column,
            indexType: "gist",
            alreadyExists: true,
          };
        await adapter.executeQuery(
          `CREATE INDEX "${idxName}" ON ${qualifiedTable} USING GIST ("${column}")`,
        );
        return {
          success: true,
          message: `GiST index created`,
          indexName: idxName,
          table: qualifiedTable,
          column,
          indexType: "gist",
        };
      } catch (error) {
        return {
          success: false,
          error: parsePostgresError(error, {
            tool: "pg_ltree_create_index",
            table,
            schema: schemaName,
            index: idxName,
          }).message,
        };
      }
    },
  };
}
