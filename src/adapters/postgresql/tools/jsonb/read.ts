/**
 * PostgreSQL JSONB Tools - Read Operations
 *
 * Read-only JSONB tools: extract, contains, pathQuery.
 * Also exports shared utilities: toJsonString, resolveJsonbTable, parseSelectAlias.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { ValidationError } from "../../../../types/errors.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import {
  coerceLimit,
  DEFAULT_QUERY_LIMIT,
} from "../../../../utils/query-helpers.js";
import {
  sanitizeTableName,
  sanitizeIdentifier,
} from "../../../../utils/identifiers.js";
import {
  JsonbExtractSchemaBase,
  JsonbContainsSchemaBase,
  JsonbPathQuerySchemaBase,
  JsonbExtractSchema,
  JsonbContainsSchema,
  JsonbPathQuerySchema,
  normalizePathToArray,
  parseJsonbValue,
  JsonbExtractOutputSchema,
  JsonbContainsOutputSchema,
  JsonbPathQueryOutputSchema,
} from "../../schemas/index.js";

/**
 * Convert value to a valid JSON string for PostgreSQL's ::jsonb cast
 * If the value is a string that looks like a JSON object or array, it is parsed and
 * validated to support raw JSON literals, throwing a ValidationError if malformed.
 */
export function toJsonString(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        JSON.parse(trimmed);
        return trimmed;
      } catch {
        throw new ValidationError("Invalid JSON string literal provided");
      }
    }
  }
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
        const limit = coerceLimit(parsed.limit, undefined);
        const whereClause = parsed.where
          ? ` WHERE ${sanitizeWhereClause(parsed.where)}`
          : "";
        const limitClause =
          limit !== null && limit !== undefined
            ? ` LIMIT ${String(limit)}`
            : "";

        // After preprocess and refine, table, column, and path are guaranteed set
        const table = parsed.table ?? parsed.tableName;
        const column = parsed.column ?? parsed.col;
        if (!table || !column) {
          throw new ValidationError("table and column are required");
        }
        if (parsed.path === undefined) {
          throw new ValidationError("path is required");
        }
        // Use normalizePathToArray for PostgreSQL #> operator
        const pathArray = normalizePathToArray(parsed.path);

        // Validate schema and build qualified table name
        const [qualifiedTable, tableError] = await resolveJsonbTable(
          adapter,
          table,
          parsed.schema,
        );
        if (tableError) throw new ValidationError(tableError.error);

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
          const response: {
            success: boolean;
            rows?: unknown;
            count: number;
            hint?: string;
          } = {
            success: true,
            count: rows?.length ?? 0,
          };
          if (rows && rows.length > 0) response.rows = rows;
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
          success: boolean;
          rows?: { value: unknown }[];
          count: number;
          hint?: string;
        } = {
          success: true,
          count: rows?.length ?? 0,
        };
        if (rows && rows.length > 0) response.rows = rows;
        if (allNulls && (rows?.length ?? 0) > 0) {
          response.hint =
            "All values are null - path may not exist in data. Use pg_jsonb_typeof to check.";
        }
        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_jsonb_extract",
        });
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
          throw new ValidationError("table and column are required");
        }

        // Validate schema and build qualified table name
        const [qualifiedTable, tableError] = await resolveJsonbTable(
          adapter,
          table,
          parsed.schema,
        );
        if (tableError) throw new ValidationError(tableError.error);

        const { select, where } = parsed;
        // Parse JSON string values from MCP clients
        const value = parseJsonbValue(parsed.value);

        // Coerce limit (default 100, 0 = unlimited)
        const resolvedLimit = coerceLimit(parsed.limit, DEFAULT_QUERY_LIMIT);
        const effectiveLimit = resolvedLimit ?? 0;

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
          success: boolean;
          rows?: unknown;
          count: number;
          truncated?: boolean;
          totalCount?: number;
          warning?: string;
        } = {
          success: true,
          count: rows.length,
        };
        if (rows.length > 0) response.rows = rows;
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
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_jsonb_contains",
        });
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
        const table = parsed.table ?? parsed.tableName;
        const column = parsed.column ?? parsed.col;
        const json = parsed.json;
        const { path, vars, where } = parsed;
        const varsJson = vars ? JSON.stringify(vars) : "{}";

        // Coerce limit (default 100, 0 = unlimited)
        const resolvedLimit = coerceLimit(parsed.limit, DEFAULT_QUERY_LIMIT);
        const effectiveLimit = resolvedLimit ?? 0;

        let allResults: unknown[] = [];
        let isTruncated = false;
        let exactTotalCount: number | undefined;

        if (json !== undefined) {
          // Query directly against literal JSON
          const baseSql = `SELECT jsonb_path_query($1::jsonb, $2::jsonpath, $3::jsonb) as result`;
          const fetchLimit = effectiveLimit > 0 ? effectiveLimit + 1 : 0;
          const sql =
            fetchLimit > 0 ? `${baseSql} LIMIT ${String(fetchLimit)}` : baseSql;
          const result = await adapter.executeQuery(sql, [
            json,
            path,
            varsJson,
          ]);
          allResults = result.rows?.map((r) => r["result"]) ?? [];
          isTruncated =
            effectiveLimit > 0 && allResults.length > effectiveLimit;
          if (isTruncated) {
            const countSql = `SELECT COUNT(*) as total FROM (SELECT jsonb_path_query($1::jsonb, $2::jsonpath, $3::jsonb)) sub`;
            const countResult = await adapter.executeQuery(countSql, [
              json,
              path,
              varsJson,
            ]);
            exactTotalCount = Number(
              countResult.rows?.[0]?.["total"] ?? allResults.length,
            );
          }
        } else {
          if (!table || !column) {
            throw new ValidationError("table and column are required");
          }

          // Validate schema and build qualified table name
          const [qualifiedTable, tableError] = await resolveJsonbTable(
            adapter,
            table,
            parsed.schema,
          );
          if (tableError) throw new ValidationError(tableError.error);

          const whereClause = where
            ? ` WHERE ${sanitizeWhereClause(where)}`
            : "";
          const baseSql = `SELECT jsonb_path_query("${column}", $1::jsonpath, $2::jsonb) as result FROM ${qualifiedTable}${whereClause}`;

          // Fetch limit+1 rows to detect truncation without a separate count query
          const fetchLimit = effectiveLimit > 0 ? effectiveLimit + 1 : 0;
          const sql =
            fetchLimit > 0 ? `${baseSql} LIMIT ${String(fetchLimit)}` : baseSql;
          const result = await adapter.executeQuery(sql, [path, varsJson]);
          allResults = result.rows?.map((r) => r["result"]) ?? [];
          isTruncated =
            effectiveLimit > 0 && allResults.length > effectiveLimit;

          if (isTruncated) {
            const countSql = `SELECT COUNT(*) as total FROM (SELECT jsonb_path_query("${column}", $1::jsonpath, $2::jsonb) FROM ${qualifiedTable}${whereClause}) sub`;
            const countResult = await adapter.executeQuery(countSql, [
              path,
              varsJson,
            ]);
            exactTotalCount = Number(
              countResult.rows?.[0]?.["total"] ?? allResults.length,
            );
          }
        }

        const results = isTruncated
          ? allResults.slice(0, effectiveLimit)
          : allResults;

        const response: {
          success: boolean;
          results?: unknown[];
          count: number;
          truncated?: boolean;
          totalCount?: number;
        } = { success: true, count: results.length };
        if (results.length > 0) response.results = results;
        if (isTruncated) {
          response.truncated = true;
          if (exactTotalCount !== undefined) {
            response.totalCount = exactTotalCount;
          }
        }
        return response;
      } catch (error: unknown) {
        // JSONPath-specific: invalid syntax
        if (
          error instanceof Error &&
          /syntax error/i.test(error.message) &&
          /jsonpath/i.test(error.message)
        ) {
          return formatHandlerErrorResponse(
            new ValidationError(
              "Invalid JSONPath syntax. Use $.key, $.array[*], or $.* ? (@.field > 10) syntax.",
            ),
            { tool: "pg_jsonb_path_query" },
          );
        }
        return formatHandlerErrorResponse(error, {
          tool: "pg_jsonb_path_query",
        });
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
