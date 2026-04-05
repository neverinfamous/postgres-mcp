/**
 * PostgreSQL ltree Extension Tools — Basic Tree CRUD
 *
 * Contains the public entry point `getLtreeTools()` and 5 tool creators
 * for extension setup, querying, subpath extraction, LCA, and column listing.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import {
  type ToolDefinition,
  type RequestContext,
  ValidationError,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly, write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  LtreeQuerySchema,
  LtreeQuerySchemaBase,
  LtreeSubpathSchema,
  LtreeSubpathSchemaBase,
  LtreeLcaSchemaBase,
  LtreeLcaSchema,
  LtreeListColumnsSchemaBase,
  LtreeListColumnsSchema,
  // Output schemas
  LtreeCreateExtensionOutputSchema,
  LtreeQueryOutputSchema,
  LtreeSubpathOutputSchema,
  LtreeLcaOutputSchema,
  LtreeListColumnsOutputSchema,
} from "../../schemas/index.js";
import { getOperationsTools } from "./operations.js";

export function getLtreeTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    createLtreeExtensionTool(adapter),
    createLtreeQueryTool(adapter),
    createLtreeSubpathTool(adapter),
    createLtreeLcaTool(adapter),
    createLtreeListColumnsTool(adapter),
    ...getOperationsTools(adapter),
  ];
}

function createLtreeExtensionTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_ltree_create_extension",
    description:
      "Enable the ltree extension for hierarchical tree-structured labels.",
    group: "ltree",
    inputSchema: z.object({}).strict(),
    outputSchema: LtreeCreateExtensionOutputSchema,
    annotations: write("Create Ltree Extension"),
    icons: getToolIcons("ltree", write("Create Ltree Extension")),
    handler: async (_params: unknown, _context: RequestContext) => {
      try {
        await adapter.executeQuery("CREATE EXTENSION IF NOT EXISTS ltree");
        return { success: true, message: "ltree extension enabled" };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_ltree_create_extension",
        });
      }
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
      try {
        const { table, column, path, mode, schema, limit } =
          LtreeQuerySchema.parse(params);

        if (path === "") {
          throw new ValidationError(
            `Empty path "" is not allowed as it acts as an unconstrained match-all query. Please provide a specific path.`,
            { path },
          );
        }

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
            throw new ValidationError(
              `Table ${qualifiedTable} does not exist.`,
              { table: qualifiedTable },
            );
          }
          throw new ValidationError(
            `Column "${column}" not found in table ${qualifiedTable}.`,
            { column, table: qualifiedTable },
          );
        }
        const udtName = colCheck.rows[0]?.["udt_name"] as string;
        if (udtName !== "ltree") {
          throw new ValidationError(
            `Column "${column}" is not an ltree type (found: ${udtName}). Use an ltree column or convert with pg_ltree_convert_column.`,
            { foundType: udtName, column },
          );
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
          sql = `SELECT *, nlevel("${column}") as depth FROM ${qualifiedTable} WHERE "${column}" ~ $1::lquery ORDER BY "${column}" ${limitClause}`;
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
          sql = `SELECT *, nlevel("${column}") as depth FROM ${qualifiedTable} WHERE "${column}" ${operator} $1::ltree ORDER BY "${column}" ${limitClause}`;
        }

        const result = await adapter.executeQuery(sql, [path]);
        const resultCount = result.rows?.length ?? 0;
        const response: Record<string, unknown> = {
          success: true,
          path,
          mode: isLqueryPattern ? "pattern" : queryMode,
          isPattern: isLqueryPattern,
          count: resultCount,
        };

        if (resultCount > 0) {
          response["results"] = result.rows;
        }

        // Add truncation indicators when limit is applied
        if (limit !== undefined && totalCount !== undefined) {
          response["truncated"] = resultCount < totalCount;
          response["totalCount"] = totalCount;
        }

        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_ltree_query",
        });
      }
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
      try {
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
          throw new ValidationError(
            `Invalid offset: ${String(offset)}. Path "${path}" has ${String(pathDepth)} labels (valid offset range: 0 to ${String(pathDepth - 1)}, or -${String(pathDepth)} to -1 for negative indexing).`,
            { originalPath: path, pathDepth },
          );
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
          success: true,
          originalPath: path,
          offset,
          length: length ?? "to end",
          subpath: row?.["subpath"] as string,
          originalDepth: row?.["original_depth"] as number,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_ltree_subpath",
        });
      }
    },
  };
}

function createLtreeLcaTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_ltree_lca",
    description: "Find the longest common ancestor of multiple ltree paths.",
    group: "ltree",
    inputSchema: LtreeLcaSchemaBase, // Base schema for MCP visibility
    outputSchema: LtreeLcaOutputSchema,
    annotations: readOnly("Ltree LCA"),
    icons: getToolIcons("ltree", readOnly("Ltree LCA")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { paths } = LtreeLcaSchema.parse(params);
        if (paths.length < 1) {
          throw new ValidationError(
            `Minimum 1 path required for lca, received ${String(paths.length)}.`,
            { providedCount: paths.length },
          );
        }

        // If all paths are identical, the LCA is the path itself
        // (Postgres lca() natively returns the parent if given identical paths)
        const allIdentical = paths.every((p) => p === paths[0]);
        if (allIdentical) {
          return {
            success: true,
            paths,
            longestCommonAncestor: paths[0],
            hasCommonAncestor: true,
          };
        }

        const arrayLiteral = paths
          .map((p) => `'${p.replace(/'/g, "''")}'::ltree`)
          .join(", ");
        const sql = `SELECT lca(ARRAY[${arrayLiteral}]) as lca`;
        const result = await adapter.executeQuery(sql);
        const lca = result.rows?.[0]?.["lca"] as string | null;
        return {
          success: true,
          paths,
          longestCommonAncestor: lca ?? "",
          hasCommonAncestor: lca !== null && lca !== "",
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_ltree_lca",
        });
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
      try {
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
        const count = result.rows?.length ?? 0;
        const response: Record<string, unknown> = { success: true, count };
        if (count > 0) {
          response["columns"] = result.rows;
        }
        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_ltree_list_columns",
        });
      }
    },
  };
}
