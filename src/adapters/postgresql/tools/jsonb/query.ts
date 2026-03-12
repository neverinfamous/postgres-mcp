/**
 * PostgreSQL JSONB Tools — Query Operations
 *
 * Read-only JSONB tools for aggregation, key listing, and type inspection.
 * Extracted from read.ts for file size compliance.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import {
  JsonbAggSchemaBase,
  JsonbKeysSchemaBase,
  JsonbTypeofSchemaBase,
  JsonbAggSchema,
  JsonbKeysSchema,
  JsonbTypeofSchema,
  normalizePathToArray,
  JsonbAggOutputSchema,
  JsonbKeysOutputSchema,
  JsonbTypeofOutputSchema,
} from "../../schemas/index.js";
import { resolveJsonbTable, parseSelectAlias } from "./read.js";

export function createJsonbAggTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_jsonb_agg",
    description:
      "Aggregate rows into a JSONB array. With groupBy, returns all groups with their aggregated items.",
    group: "jsonb",
    inputSchema: JsonbAggSchemaBase,
    outputSchema: JsonbAggOutputSchema,
    annotations: readOnly("JSONB Aggregate"),
    icons: getToolIcons("jsonb", readOnly("JSONB Aggregate")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Parse with preprocess schema to resolve aliases (tableName→table, filter→where)
        const parsed = JsonbAggSchema.parse(params);
        const table = parsed.table;
        if (!table) {
          return { success: false, error: "table is required" };
        }

        // Validate schema and build qualified table name
        const [qualifiedTable, tableError] = await resolveJsonbTable(
          adapter,
          table,
          parsed.schema,
        );
        if (tableError) return tableError;

        // Build select expression with proper alias handling
        let selectExpr: string;
        if (parsed.select !== undefined && parsed.select.length > 0) {
          const selectParts = parsed.select.map((item) => {
            const { expr, alias } = parseSelectAlias(item);
            const needsQuote =
              !expr.includes("->") &&
              !expr.includes("(") &&
              !expr.includes("::") &&
              /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(expr);
            const exprStr = needsQuote ? `"${expr}"` : expr;
            return `'${alias}', ${exprStr}`;
          });
          selectExpr = `jsonb_build_object(${selectParts.join(", ")})`;
        } else {
          selectExpr = "to_jsonb(t.*)";
        }

        const whereClause = parsed.where
          ? ` WHERE ${sanitizeWhereClause(parsed.where)}`
          : "";
        const orderByClause = parsed.orderBy
          ? ` ORDER BY ${parsed.orderBy}`
          : "";
        const rawLimit = Number(parsed.limit);
        const limit =
          parsed.limit === undefined
            ? undefined
            : isNaN(rawLimit)
              ? undefined
              : rawLimit;
        const limitClause =
          limit !== undefined ? ` LIMIT ${String(limit)}` : "";
        const hasJsonbOperator = parsed.groupBy?.includes("->") ?? false;

        if (parsed.groupBy) {
          const groupExpr = hasJsonbOperator
            ? parsed.groupBy
            : `"${parsed.groupBy}"`;
          const groupClause = ` GROUP BY ${groupExpr}`;
          const aggOrderBy = parsed.orderBy
            ? ` ORDER BY ${parsed.orderBy}`
            : "";
          const sql = `SELECT ${groupExpr} as group_key, jsonb_agg(${selectExpr}${aggOrderBy}) as items FROM ${qualifiedTable} t${whereClause}${groupClause}${limitClause}`;
          const result = await adapter.executeQuery(sql);
          return {
            result: result.rows,
            count: result.rows?.length ?? 0,
            grouped: true,
          };
        } else {
          const innerSql = `SELECT * FROM ${qualifiedTable} t${whereClause}${orderByClause}${limitClause}`;
          const sql = `SELECT jsonb_agg(${selectExpr.replace(/\bt\./g, "sub.")}) as result FROM (${innerSql}) sub`;
          const result = await adapter.executeQuery(sql);
          const arr = result.rows?.[0]?.["result"] ?? [];
          const count = Array.isArray(arr) ? arr.length : 0;
          const response: {
            result: unknown;
            count: number;
            grouped: boolean;
            hint?: string;
          } = { result: arr, count, grouped: false };
          if (count === 0) {
            response.hint = "No rows matched - returns empty array []";
          }
          return response;
        }
      } catch (error) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_jsonb_agg",
          });
      }
    },
  };
}

export function createJsonbKeysTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_jsonb_keys",
    description:
      "Get all unique keys from a JSONB object column (deduplicated across rows).",
    group: "jsonb",
    inputSchema: JsonbKeysSchemaBase,
    outputSchema: JsonbKeysOutputSchema,
    annotations: readOnly("JSONB Keys"),
    icons: getToolIcons("jsonb", readOnly("JSONB Keys")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Parse with preprocess schema to resolve aliases (tableName→table, col→column, filter→where)
        const parsed = JsonbKeysSchema.parse(params);
        const table = parsed.table;
        const column = parsed.column;
        if (!table || !column) {
          return { success: false, error: "table and column are required" };
        }

        // Validate schema and build qualified table name
        const [qualifiedTable, tableError] = await resolveJsonbTable(
          adapter,
          table,
          parsed.schema,
        );
        if (tableError) return tableError;

        const whereClause = parsed.where
          ? ` WHERE ${sanitizeWhereClause(parsed.where)}`
          : "";
        const sql = `SELECT DISTINCT jsonb_object_keys("${column}") as key FROM ${qualifiedTable}${whereClause}`;
        const result = await adapter.executeQuery(sql);
        const keys = result.rows?.map((r) => r["key"]) as string[];
        return {
          keys,
          count: keys?.length ?? 0,
          hint: "Returns unique keys deduplicated across all matching rows",
        };
      } catch (error) {
        // Improve error for array columns
        if (
          error instanceof Error &&
          error.message.includes("cannot call jsonb_object_keys")
        ) {
          return {
            success: false,
            error: `pg_jsonb_keys requires object columns. For array columns, use pg_jsonb_normalize with mode: 'array'.`,
          };
        }
        return formatHandlerErrorResponse(error, {
            tool: "pg_jsonb_keys",
          });
      }
    },
  };
}

export function createJsonbTypeofTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_jsonb_typeof",
    description:
      "Get JSONB type at path. Uses dot-notation (a.b.c), not JSONPath ($). Response includes columnNull to distinguish NULL columns.",
    group: "jsonb",
    inputSchema: JsonbTypeofSchemaBase,
    outputSchema: JsonbTypeofOutputSchema,
    annotations: readOnly("JSONB Typeof"),
    icons: getToolIcons("jsonb", readOnly("JSONB Typeof")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Parse with preprocess schema to resolve aliases (tableName→table, col→column, filter→where)
        const parsed = JsonbTypeofSchema.parse(params);
        const table = parsed.table;
        const column = parsed.column;
        if (!table || !column) {
          return { success: false, error: "table and column are required" };
        }

        // Validate schema and build qualified table name
        const [qualifiedTable, tableError] = await resolveJsonbTable(
          adapter,
          table,
          parsed.schema,
        );
        if (tableError) return tableError;

        const whereClause = parsed.where
          ? ` WHERE ${sanitizeWhereClause(parsed.where)}`
          : "";
        // Normalize path to array format (accepts both string and array)
        const pathArray =
          parsed.path !== undefined
            ? normalizePathToArray(parsed.path)
            : undefined;
        const pathExpr = pathArray !== undefined ? ` #> $1` : "";
        // Include column IS NULL check to disambiguate NULL column vs null path result
        const sql = `SELECT jsonb_typeof("${column}"${pathExpr}) as type, ("${column}" IS NULL) as column_null FROM ${qualifiedTable}${whereClause}`;
        const queryParams = pathArray ? [pathArray] : [];
        const result = await adapter.executeQuery(sql, queryParams);
        const types = result.rows?.map((r) => r["type"]) as (string | null)[];
        const columnNull =
          result.rows?.some((r) => r["column_null"] === true) ?? false;
        return { types, count: types?.length ?? 0, columnNull };
      } catch (error) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_jsonb_typeof",
          });
      }
    },
  };
}
