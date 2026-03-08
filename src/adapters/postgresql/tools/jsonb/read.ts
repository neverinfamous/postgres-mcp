/**
 * PostgreSQL JSONB Tools - Read Operations
 *
 * Read-only JSONB tools: extract, contains, pathQuery, agg, keys, typeof.
 * Also exports shared utilities: toJsonString, resolveJsonbTable, parseSelectAlias.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatPostgresError } from "../core/error-helpers.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import {
  sanitizeTableName,
  sanitizeIdentifier,
} from "../../../../utils/identifiers.js";
import {
  JsonbExtractSchemaBase,
  JsonbContainsSchemaBase,
  JsonbPathQuerySchemaBase,
  JsonbTypeofSchemaBase,
  JsonbKeysSchemaBase,
  JsonbAggSchemaBase,
  JsonbExtractSchema,
  JsonbContainsSchema,
  JsonbPathQuerySchema,
  JsonbTypeofSchema,
  JsonbKeysSchema,
  JsonbAggSchema,
  normalizePathToArray,
  parseJsonbValue,
  JsonbExtractOutputSchema,
  JsonbContainsOutputSchema,
  JsonbPathQueryOutputSchema,
  JsonbAggOutputSchema,
  JsonbKeysOutputSchema,
  JsonbTypeofOutputSchema,
} from "../../schemas/index.js";

/**
 * Convert value to a valid JSON string for PostgreSQL's ::jsonb cast
 * Always uses JSON.stringify to ensure proper encoding
 */
export function toJsonString(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Resolve table and schema for JSONB tools.
 * Validates schema existence when non-public, returns schema-qualified table name.
 * Returns [qualifiedTable, null] on success, or [null, errorResponse] on failure.
 */
export async function resolveJsonbTable(
  adapter: PostgresAdapter,
  table: string,
  schema?: string,
): Promise<[string, null] | [null, { success: false; error: string }]> {
  const schemaName = schema ?? "public";
  // Validate schema existence for non-public schemas
  if (schemaName !== "public") {
    const schemaResult = await adapter.executeQuery(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
      [schemaName],
    );
    if (!schemaResult.rows || schemaResult.rows.length === 0) {
      return [
        null,
        {
          success: false,
          error: `Schema '${schemaName}' does not exist. Use pg_list_objects with type 'table' to see available schemas.`,
        },
      ];
    }
  }
  return [sanitizeTableName(table, schemaName), null];
}

export function createJsonbExtractTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_jsonb_extract",
    description:
      "Extract value from JSONB at specified path. Returns null if path does not exist in data structure. Use select param to include identifying columns.",
    group: "jsonb",
    inputSchema: JsonbExtractSchemaBase,
    outputSchema: JsonbExtractOutputSchema,
    annotations: readOnly("JSONB Extract"),
    icons: getToolIcons("jsonb", readOnly("JSONB Extract")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = JsonbExtractSchema.parse(params);
        const rawLimit = Number(parsed.limit);
        const limit =
          parsed.limit === undefined
            ? undefined
            : isNaN(rawLimit)
              ? undefined
              : rawLimit;
        const whereClause = parsed.where
          ? ` WHERE ${sanitizeWhereClause(parsed.where)}`
          : "";
        const limitClause =
          limit !== undefined ? ` LIMIT ${String(limit)}` : "";

        // After preprocess and refine, table, column, and path are guaranteed set
        const table = parsed.table ?? parsed.tableName;
        const column = parsed.column ?? parsed.col;
        if (!table || !column) {
          return { success: false, error: "table and column are required" };
        }
        if (parsed.path === undefined) {
          return { success: false, error: "path is required" };
        }
        // Use normalizePathToArray for PostgreSQL #> operator
        const pathArray = normalizePathToArray(parsed.path);

        // Validate schema and build qualified table name
        const [qualifiedTable, tableError] = await resolveJsonbTable(
          adapter,
          table,
          parsed.schema,
        );
        if (tableError) return tableError;

        // Build select expression with optional additional columns
        let selectExpr = `${sanitizeIdentifier(column)} #> $1 as extracted_value`;
        if (parsed.select !== undefined && parsed.select.length > 0) {
          const additionalCols = parsed.select
            .map((c) => {
              // Handle expressions vs simple column names
              const needsQuote =
                !c.includes("->") &&
                !c.includes("(") &&
                !c.includes("::") &&
                /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c);
              return needsQuote ? `"${c}"` : c;
            })
            .join(", ");
          selectExpr = `${additionalCols}, ${selectExpr}`;
        }

        const sql = `SELECT ${selectExpr} FROM ${qualifiedTable}${whereClause}${limitClause}`;
        const result = await adapter.executeQuery(sql, [pathArray]);

        // If select columns were provided, return full row objects
        if (parsed.select !== undefined && parsed.select.length > 0) {
          const rows = result.rows?.map((r) => {
            // Rename extracted_value back to 'value' for consistency
            const row: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(r)) {
              if (key === "extracted_value") {
                row["value"] = val;
              } else {
                row[key] = val;
              }
            }
            return row;
          });
          const allNulls = rows?.every((r) => r["value"] === null) ?? false;
          const response: { rows: unknown; count: number; hint?: string } = {
            rows,
            count: rows?.length ?? 0,
          };
          if (allNulls && (rows?.length ?? 0) > 0) {
            response.hint =
              "All values are null - path may not exist in data. Use pg_jsonb_typeof to check.";
          }
          return response;
        }

        // Original behavior: return just the extracted values
        // Wrap each value in an object with 'value' key for consistency with select mode
        const rows = result.rows?.map((r) => ({ value: r["extracted_value"] }));
        // Check if all results are null (path may not exist)
        const allNulls = rows?.every((r) => r.value === null) ?? false;
        const response: {
          rows: { value: unknown }[] | undefined;
          count: number;
          hint?: string;
        } = {
          rows,
          count: rows?.length ?? 0,
        };
        if (allNulls && (rows?.length ?? 0) > 0) {
          response.hint =
            "All values are null - path may not exist in data. Use pg_jsonb_typeof to check.";
        }
        return response;
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_jsonb_extract",
          }),
        };
      }
    },
  };
}

export function createJsonbContainsTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_jsonb_contains",
    description:
      "Find rows where JSONB column contains the specified value. Note: Empty object {} matches all rows.",
    group: "jsonb",
    inputSchema: JsonbContainsSchemaBase,
    outputSchema: JsonbContainsOutputSchema,
    annotations: readOnly("JSONB Contains"),
    icons: getToolIcons("jsonb", readOnly("JSONB Contains")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = JsonbContainsSchema.parse(params);
        // Resolve table/column from optional aliases
        const table = parsed.table ?? parsed.tableName;
        const column = parsed.column ?? parsed.col;
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

        const { select, where } = parsed;
        // Parse JSON string values from MCP clients
        const value = parseJsonbValue(parsed.value);

        // Apply default limit (100) to prevent large payloads
        const DEFAULT_LIMIT = 100;
        const rawLimit = Number(parsed.limit);
        const requestedLimit =
          parsed.limit === undefined
            ? undefined
            : isNaN(rawLimit)
              ? undefined
              : rawLimit;
        const effectiveLimit =
          requestedLimit === 0 ? 0 : (requestedLimit ?? DEFAULT_LIMIT);

        const selectCols =
          select !== undefined && select.length > 0
            ? select
                .map((item) => {
                  const { expr, alias } = parseSelectAlias(item);
                  // Simple column names get quoted; expressions pass through
                  const needsQuote =
                    !expr.includes("->") &&
                    !expr.includes("(") &&
                    !expr.includes("::") &&
                    /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(expr);
                  const exprStr = needsQuote ? `"${expr}"` : expr;
                  // Only add AS alias when an explicit alias was provided
                  return alias !== expr &&
                    alias !==
                      expr
                        .replace(/[^\w]/g, "_")
                        .replace(/_+/g, "_")
                        .replace(/^_|_$/g, "")
                    ? `${exprStr} AS "${alias}"`
                    : exprStr;
                })
                .join(", ")
            : "*";
        // Build WHERE clause combining containment check with optional filter
        const containsClause = `"${column}" @> $1::jsonb`;
        const whereClause = where ? ` AND ${sanitizeWhereClause(where)}` : "";
        const baseSql = `SELECT ${selectCols} FROM ${qualifiedTable} WHERE ${containsClause}${whereClause}`;

        // Fetch limit+1 rows to detect truncation without a separate count query
        const fetchLimit = effectiveLimit > 0 ? effectiveLimit + 1 : 0;
        const sql =
          fetchLimit > 0 ? `${baseSql} LIMIT ${String(fetchLimit)}` : baseSql;
        const result = await adapter.executeQuery(sql, [toJsonString(value)]);
        const allRows = result.rows ?? [];
        const isTruncated =
          effectiveLimit > 0 && allRows.length > effectiveLimit;
        const rows = isTruncated ? allRows.slice(0, effectiveLimit) : allRows;

        // Warn if empty object was passed (matches all rows)
        const isEmptyObject =
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value) &&
          Object.keys(value).length === 0;
        const response: {
          rows: unknown;
          count: number;
          truncated?: boolean;
          totalCount?: number;
          warning?: string;
        } = {
          rows,
          count: rows.length,
        };
        if (isTruncated) {
          response.truncated = true;
          // Get exact total count
          const countSql = `SELECT COUNT(*) as total FROM ${qualifiedTable} WHERE ${containsClause}${whereClause}`;
          const countResult = await adapter.executeQuery(countSql, [
            toJsonString(value),
          ]);
          response.totalCount = Number(
            countResult.rows?.[0]?.["total"] ?? rows.length,
          );
        }
        if (isEmptyObject) {
          response.warning =
            "Empty {} matches ALL rows - this is PostgreSQL containment semantics";
        }
        return response;
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_jsonb_contains",
          }),
        };
      }
    },
  };
}

export function createJsonbPathQueryTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_jsonb_path_query",
    description:
      "Query JSONB using SQL/JSON path expressions (PostgreSQL 12+). Note: Recursive descent (..) syntax is not supported by PostgreSQL.",
    group: "jsonb",
    inputSchema: JsonbPathQuerySchemaBase,
    outputSchema: JsonbPathQueryOutputSchema,
    annotations: readOnly("JSONB Path Query"),
    icons: getToolIcons("jsonb", readOnly("JSONB Path Query")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = JsonbPathQuerySchema.parse(params);
        // Resolve table/column from optional aliases
        const table = parsed.table ?? parsed.tableName;
        const column = parsed.column ?? parsed.col;
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

        const { path, vars, where } = parsed;
        const whereClause = where ? ` WHERE ${sanitizeWhereClause(where)}` : "";
        const varsJson = vars ? JSON.stringify(vars) : "{}";

        // Apply default limit (100) to prevent large payloads
        const DEFAULT_LIMIT = 100;
        const rawLimit = Number(parsed.limit);
        const requestedLimit =
          parsed.limit === undefined
            ? undefined
            : isNaN(rawLimit)
              ? undefined
              : rawLimit;
        const effectiveLimit =
          requestedLimit === 0 ? 0 : (requestedLimit ?? DEFAULT_LIMIT);

        const baseSql = `SELECT jsonb_path_query("${column}", $1::jsonpath, $2::jsonb) as result FROM ${qualifiedTable}${whereClause}`;

        // Fetch limit+1 rows to detect truncation without a separate count query
        const fetchLimit = effectiveLimit > 0 ? effectiveLimit + 1 : 0;
        const sql =
          fetchLimit > 0 ? `${baseSql} LIMIT ${String(fetchLimit)}` : baseSql;
        const result = await adapter.executeQuery(sql, [path, varsJson]);
        const allResults = result.rows?.map((r) => r["result"]) ?? [];
        const isTruncated =
          effectiveLimit > 0 && allResults.length > effectiveLimit;
        const results = isTruncated
          ? allResults.slice(0, effectiveLimit)
          : allResults;

        const response: {
          results: unknown[];
          count: number;
          truncated?: boolean;
          totalCount?: number;
        } = { results, count: results.length };
        if (isTruncated) {
          response.truncated = true;
          // Get exact total count
          const countSql = `SELECT COUNT(*) as total FROM (SELECT jsonb_path_query("${column}", $1::jsonpath, $2::jsonb) FROM ${qualifiedTable}${whereClause}) sub`;
          const countResult = await adapter.executeQuery(countSql, [
            path,
            varsJson,
          ]);
          response.totalCount = Number(
            countResult.rows?.[0]?.["total"] ?? results.length,
          );
        }
        return response;
      } catch (error) {
        // JSONPath-specific: invalid syntax
        if (
          error instanceof Error &&
          /syntax error/i.test(error.message) &&
          /jsonpath/i.test(error.message)
        ) {
          return {
            success: false,
            error: `Invalid JSONPath syntax. Use $.key, $.array[*], or $.* ? (@.field > 10) syntax.`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_jsonb_path_query",
          }),
        };
      }
    },
  };
}

/**
 * Parse a select expression and extract the alias if present.
 * Handles: "column", "expression AS alias", "expression as alias"
 * Returns: { expr: string, alias: string }
 */
export function parseSelectAlias(selectItem: string): {
  expr: string;
  alias: string;
} {
  // Match " AS " or " as " (case-insensitive) with word boundaries
  const aliasRegex = /^(.+?)\s+[Aa][Ss]\s+([\w]+)$/;
  const aliasMatch = aliasRegex.exec(selectItem);
  if (aliasMatch?.[1] !== undefined && aliasMatch[2] !== undefined) {
    return { expr: aliasMatch[1].trim(), alias: aliasMatch[2].trim() };
  }
  // No alias - use the expression as-is for both
  // For simple column names, use them directly; for expressions, use a sanitized key
  const cleanKey =
    selectItem.includes("->") || selectItem.includes("(")
      ? selectItem
          .replace(/[^\w]/g, "_")
          .replace(/_+/g, "_")
          .replace(/^_|_$/g, "")
      : selectItem;
  return { expr: selectItem, alias: cleanKey };
}

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
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_jsonb_agg",
          }),
        };
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
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_jsonb_keys",
          }),
        };
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
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_jsonb_typeof",
          }),
        };
      }
    },
  };
}
