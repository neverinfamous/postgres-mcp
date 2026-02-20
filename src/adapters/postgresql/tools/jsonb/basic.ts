/**
 * PostgreSQL JSONB Tools - Basic Operations
 *
 * Core JSONB operations including extract, set, insert, delete, contains, path query, aggregation, and type checks.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly, write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatPostgresError } from "../core/error-helpers.js";
import {
  // Base schemas (for MCP inputSchema visibility)
  JsonbExtractSchemaBase,
  JsonbSetSchemaBase,
  JsonbContainsSchemaBase,
  JsonbPathQuerySchemaBase,
  JsonbInsertSchemaBase,
  JsonbDeleteSchemaBase,
  JsonbTypeofSchemaBase,
  JsonbKeysSchemaBase,
  JsonbStripNullsSchemaBase,
  JsonbAggSchemaBase,
  // Full schemas (for handler parsing - with preprocess)
  JsonbExtractSchema,
  JsonbSetSchema,
  JsonbContainsSchema,
  JsonbPathQuerySchema,
  JsonbInsertSchema,
  JsonbDeleteSchema,
  JsonbTypeofSchema,
  JsonbKeysSchema,
  JsonbStripNullsSchema,
  JsonbAggSchema,
  // Path utilities
  normalizePathToArray,
  normalizePathForInsert,
  parseJsonbValue,
  // Output schemas
  JsonbExtractOutputSchema,
  JsonbSetOutputSchema,
  JsonbInsertOutputSchema,
  JsonbDeleteOutputSchema,
  JsonbContainsOutputSchema,
  JsonbPathQueryOutputSchema,
  JsonbAggOutputSchema,
  JsonbObjectOutputSchema,
  JsonbArrayOutputSchema,
  JsonbKeysOutputSchema,
  JsonbStripNullsOutputSchema,
  JsonbTypeofOutputSchema,
} from "../../schemas/index.js";

/**
 * Convert value to a valid JSON string for PostgreSQL's ::jsonb cast
 * Always uses JSON.stringify to ensure proper encoding
 */
function toJsonString(value: unknown): string {
  return JSON.stringify(value);
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
        const whereClause = parsed.where ? ` WHERE ${parsed.where}` : "";
        const limitClause =
          parsed.limit !== undefined ? ` LIMIT ${String(parsed.limit)}` : "";
        // Use normalizePathToArray for PostgreSQL #> operator
        const pathArray = normalizePathToArray(parsed.path);

        // After preprocess and refine, table and column are guaranteed set
        const table = parsed.table ?? parsed.tableName;
        const column = parsed.column ?? parsed.col;
        if (!table || !column) {
          return { success: false, error: "table and column are required" };
        }

        // Build select expression with optional additional columns
        let selectExpr = `"${column}" #> $1 as extracted_value`;
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

        const sql = `SELECT ${selectExpr} FROM "${table}"${whereClause}${limitClause}`;
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

export function createJsonbSetTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_jsonb_set",
    description:
      "Set value in JSONB at path. Uses dot-notation by default; for literal dots in keys use array format [\"key.with.dots\"]. Use empty path ('' or []) to replace entire column value.",
    group: "jsonb",
    inputSchema: JsonbSetSchemaBase,
    outputSchema: JsonbSetOutputSchema,
    annotations: write("JSONB Set"),
    icons: getToolIcons("jsonb", write("JSONB Set")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = JsonbSetSchema.parse(params);
        // Resolve table/column from optional aliases
        const table = parsed.table ?? parsed.tableName;
        const column = parsed.column ?? parsed.col;
        if (!table || !column) {
          return { success: false, error: "table and column are required" };
        }
        const { value, where, createMissing } = parsed;

        // Normalize path to array format
        const path = normalizePathToArray(parsed.path);

        // Validate required 'where' parameter
        if (!where || where.trim() === "") {
          return {
            success: false,
            error:
              'pg_jsonb_set requires a WHERE clause to identify rows to update. Example: where: "id = 1"',
          };
        }

        // Validate value is provided (undefined would set column to null)
        if (value === undefined) {
          return {
            success: false,
            error:
              "pg_jsonb_set requires a value parameter. To remove a key, use pg_jsonb_delete instead.",
          };
        }

        const createFlag = createMissing !== false;

        // Handle empty path - replace entire column value
        if (path.length === 0) {
          const sql = `UPDATE "${table}" SET "${column}" = $1::jsonb WHERE ${where}`;
          const result = await adapter.executeQuery(sql, [toJsonString(value)]);
          return {
            rowsAffected: result.rowsAffected,
            hint: "Replaced entire column value (empty path)",
          };
        }

        // For deep nested paths with createMissing=true, build intermediate objects
        // PostgreSQL's jsonb_set only creates one level, so we nest calls for deep paths
        let sql: string;
        if (createFlag && path.length > 1) {
          // Build nested jsonb_set calls to ensure each intermediate path exists
          // Start with COALESCE to handle NULL columns
          let expr = `COALESCE("${column}", '{}'::jsonb)`;

          // For each intermediate level, wrap in jsonb_set to initialize to {}
          for (let i = 0; i < path.length - 1; i++) {
            const subPath = path.slice(0, i + 1);
            const pathStr = "{" + subPath.join(",") + "}";
            // Use COALESCE on the extraction from current expr, not original column
            // This properly chains the nested creation
            expr = `jsonb_set(${expr}, '${pathStr}'::text[], COALESCE((${expr}) #> '${pathStr}'::text[], '{}'::jsonb), true)`;
          }
          // Final set with actual value
          const fullPathStr = "{" + path.join(",") + "}";
          expr = `jsonb_set(${expr}, '${fullPathStr}'::text[], $1::jsonb, true)`;
          sql = `UPDATE "${table}" SET "${column}" = ${expr} WHERE ${where}`;
          const result = await adapter.executeQuery(sql, [toJsonString(value)]);
          return {
            rowsAffected: result.rowsAffected,
            hint: "rowsAffected counts matched rows, not path creations",
          };
        } else {
          // Use COALESCE to handle NULL columns - initialize to empty object
          sql = `UPDATE "${table}" SET "${column}" = jsonb_set(COALESCE("${column}", '{}'::jsonb), $1, $2::jsonb, $3) WHERE ${where}`;
          const result = await adapter.executeQuery(sql, [
            path,
            toJsonString(value),
            createFlag,
          ]);
          const hint = createFlag
            ? "NULL columns initialized to {}; createMissing creates path if absent"
            : "createMissing=false: path must exist or value won't be set";
          return { rowsAffected: result.rowsAffected, hint };
        }
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_jsonb_set",
          }),
        };
      }
    },
  };
}

export function createJsonbInsertTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_jsonb_insert",
    description:
      "Insert value into JSONB array. Index -1 inserts BEFORE last element; use insertAfter:true with -1 to append at end.",
    group: "jsonb",
    inputSchema: JsonbInsertSchemaBase,
    outputSchema: JsonbInsertOutputSchema,
    annotations: write("JSONB Insert"),
    icons: getToolIcons("jsonb", write("JSONB Insert")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = JsonbInsertSchema.parse(params);
        // Resolve table/column from optional aliases
        const table = parsed.table ?? parsed.tableName;
        const column = parsed.column ?? parsed.col;
        if (!table || !column) {
          return { success: false, error: "table and column are required" };
        }

        // Normalize path - convert numeric segments to numbers for PostgreSQL
        const path = normalizePathForInsert(parsed.path);

        // Validate required 'where' parameter
        if (!parsed.where || parsed.where.trim() === "") {
          return {
            success: false,
            error:
              'pg_jsonb_insert requires a WHERE clause to identify rows to update. Example: where: "id = 1"',
          };
        }

        // Check for NULL columns first - jsonb_insert requires existing array context
        const checkSql = `SELECT COUNT(*) as null_count FROM "${table}" WHERE ${parsed.where} AND "${column}" IS NULL`;
        const checkResult = await adapter.executeQuery(checkSql);
        const nullCount = Number(checkResult.rows?.[0]?.["null_count"] ?? 0);
        if (nullCount > 0) {
          return {
            success: false,
            error: `pg_jsonb_insert cannot operate on NULL columns. Use pg_jsonb_set to initialize the column first: pg_jsonb_set({table: "${table}", column: "${column}", path: "myarray", value: [], where: "..."})`,
          };
        }

        // Validate target path points to an array, not an object
        // Get the parent path (one level up from where we're inserting)
        const parentPath = path.slice(0, -1);
        if (parentPath.length === 0) {
          // Inserting at root level - check column type
          const typeCheckSql = `SELECT jsonb_typeof("${column}") as type FROM "${table}" WHERE ${parsed.where} LIMIT 1`;
          const typeResult = await adapter.executeQuery(typeCheckSql);
          const columnType = typeResult.rows?.[0]?.["type"] as
            | string
            | undefined;
          if (columnType && columnType !== "array") {
            return {
              success: false,
              error: `pg_jsonb_insert requires an array target. Column contains '${columnType}'. Use pg_jsonb_set for objects.`,
            };
          }
        } else {
          // Check the parent path type
          const typeCheckSql = `SELECT jsonb_typeof("${column}" #> $1) as type FROM "${table}" WHERE ${parsed.where} LIMIT 1`;
          const parentPathStrings = parentPath.map((p) => String(p));
          const typeResult = await adapter.executeQuery(typeCheckSql, [
            parentPathStrings,
          ]);
          const targetType = typeResult.rows?.[0]?.["type"] as
            | string
            | undefined;
          if (targetType && targetType !== "array") {
            return {
              success: false,
              error: `pg_jsonb_insert requires an array target. Path '${parentPathStrings.join(".")}' contains '${targetType}'. Use pg_jsonb_set for objects.`,
            };
          }
        }

        const sql = `UPDATE "${table}" SET "${column}" = jsonb_insert("${column}", $1, $2::jsonb, $3) WHERE ${parsed.where}`;
        const result = await adapter.executeQuery(sql, [
          path,
          toJsonString(parsed.value),
          parsed.insertAfter ?? false,
        ]);
        return { rowsAffected: result.rowsAffected };
      } catch (error) {
        // Improve specific PostgreSQL error messages
        if (
          error instanceof Error &&
          error.message.includes("cannot replace existing key")
        ) {
          return {
            success: false,
            error: `pg_jsonb_insert is for arrays only. For objects, use pg_jsonb_set. If updating an existing array element, use pg_jsonb_set.`,
          };
        }
        if (
          error instanceof Error &&
          error.message.includes("path element is not an integer")
        ) {
          return {
            success: false,
            error: `pg_jsonb_insert requires numeric index for array position. Use array format with number: ["tags", 0] not ["tags", "0"] or "tags.0"`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_jsonb_insert",
          }),
        };
      }
    },
  };
}

export function createJsonbDeleteTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_jsonb_delete",
    description:
      "Delete a key or array element from a JSONB column. Accepts path as string or array. Note: rowsAffected reflects matched rows, not whether key existed.",
    group: "jsonb",
    inputSchema: JsonbDeleteSchemaBase,
    outputSchema: JsonbDeleteOutputSchema,
    annotations: write("JSONB Delete"),
    icons: getToolIcons("jsonb", write("JSONB Delete")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = JsonbDeleteSchema.parse(params);
        // Resolve table/column from optional aliases
        const table = parsed.table ?? parsed.tableName;
        const column = parsed.column ?? parsed.col;
        if (!table || !column) {
          return { success: false, error: "table and column are required" };
        }

        // Validate required 'where' parameter
        if (!parsed.where || parsed.where.trim() === "") {
          return {
            success: false,
            error:
              'pg_jsonb_delete requires a WHERE clause to identify rows to update. Example: where: "id = 1"',
          };
        }

        // Validate path is not empty
        if (
          parsed.path === "" ||
          (Array.isArray(parsed.path) && parsed.path.length === 0)
        ) {
          return {
            success: false,
            error:
              "pg_jsonb_delete requires a non-empty path. Provide a key name or path to delete.",
          };
        }

        // Determine if path should be treated as nested (array path) or single key
        let pathForPostgres: string | string[];
        let useArrayOperator: boolean;

        if (typeof parsed.path === "number") {
          pathForPostgres = [String(parsed.path)];
          useArrayOperator = true;
        } else if (Array.isArray(parsed.path)) {
          pathForPostgres = normalizePathToArray(parsed.path);
          useArrayOperator = true;
        } else if (parsed.path.includes(".")) {
          pathForPostgres = parsed.path.split(".").filter((p) => p !== "");
          useArrayOperator = true;
        } else if (/^\d+$/.test(parsed.path)) {
          pathForPostgres = [parsed.path];
          useArrayOperator = true;
        } else {
          pathForPostgres = parsed.path;
          useArrayOperator = false;
        }

        const pathExpr = useArrayOperator ? `#- $1` : `- $1`;
        const sql = `UPDATE "${table}" SET "${column}" = "${column}" ${pathExpr} WHERE ${parsed.where}`;
        const result = await adapter.executeQuery(sql, [pathForPostgres]);
        return {
          rowsAffected: result.rowsAffected,
          hint: "rowsAffected counts matched rows, not whether key existed",
        };
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_jsonb_delete",
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
        const { select, where } = parsed;
        // Parse JSON string values from MCP clients
        const value = parseJsonbValue(parsed.value);

        const selectCols =
          select !== undefined && select.length > 0
            ? select.map((c) => `"${c}"`).join(", ")
            : "*";
        // Build WHERE clause combining containment check with optional filter
        const containsClause = `"${column}" @> $1::jsonb`;
        const whereClause = where ? ` AND ${where}` : "";
        const sql = `SELECT ${selectCols} FROM "${table}" WHERE ${containsClause}${whereClause}`;
        const result = await adapter.executeQuery(sql, [toJsonString(value)]);
        // Warn if empty object was passed (matches all rows)
        const isEmptyObject =
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value) &&
          Object.keys(value).length === 0;
        const response: { rows: unknown; count: number; warning?: string } = {
          rows: result.rows,
          count: result.rows?.length ?? 0,
        };
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
        const { path, vars, where } = parsed;
        const whereClause = where ? ` WHERE ${where}` : "";
        const varsJson = vars ? JSON.stringify(vars) : "{}";
        const sql = `SELECT jsonb_path_query("${column}", $1::jsonpath, $2::jsonb) as result FROM "${table}"${whereClause}`;
        const result = await adapter.executeQuery(sql, [path, varsJson]);
        const results = result.rows?.map((r) => r["result"]);
        return { results, count: results?.length ?? 0 };
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
function parseSelectAlias(selectItem: string): { expr: string; alias: string } {
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

        const whereClause = parsed.where ? ` WHERE ${parsed.where}` : "";
        const orderByClause = parsed.orderBy
          ? ` ORDER BY ${parsed.orderBy}`
          : "";
        const limitClause =
          parsed.limit !== undefined ? ` LIMIT ${String(parsed.limit)}` : "";
        const hasJsonbOperator = parsed.groupBy?.includes("->") ?? false;

        if (parsed.groupBy) {
          const groupExpr = hasJsonbOperator
            ? parsed.groupBy
            : `"${parsed.groupBy}"`;
          const groupClause = ` GROUP BY ${groupExpr}`;
          const aggOrderBy = parsed.orderBy
            ? ` ORDER BY ${parsed.orderBy}`
            : "";
          const sql = `SELECT ${groupExpr} as group_key, jsonb_agg(${selectExpr}${aggOrderBy}) as items FROM "${table}" t${whereClause}${groupClause}${limitClause}`;
          const result = await adapter.executeQuery(sql);
          return {
            result: result.rows,
            count: result.rows?.length ?? 0,
            grouped: true,
          };
        } else {
          const innerSql = `SELECT * FROM "${table}" t${whereClause}${orderByClause}${limitClause}`;
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

// Schema for pg_jsonb_object - accepts 'data', 'object', or 'pairs' parameter containing key-value pairs
// For code mode: pg.jsonb.object({name: "John", age: 30}) - passes through OBJECT_WRAP_MAP → {data: {...}}
// For MCP tools: {data: {name: "John", age: 30}} or {pairs: {...}} or {object: {...}}
const JsonbObjectSchema = z
  .object({
    data: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Key-value pairs to build: {name: "John", age: 30}'),
    object: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Alias for data"),
    pairs: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Alias for data (legacy)"),
  })
  .describe(
    "Build a JSONB object from key-value pairs. Use data: {key: value} or object: {key: value}.",
  );

export function createJsonbObjectTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_jsonb_object",
    description:
      'Build a JSONB object. Use data: {name: "John", age: 30} or object: {name: "John"}. Returns {object: {...}}.',
    group: "jsonb",
    inputSchema: JsonbObjectSchema,
    outputSchema: JsonbObjectOutputSchema,
    annotations: readOnly("JSONB Object"),
    icons: getToolIcons("jsonb", readOnly("JSONB Object")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Parse the input
        const parsed = JsonbObjectSchema.parse(params);

        // Support multiple parameter names: data, object, pairs (in priority order)
        const pairs: Record<string, unknown> =
          parsed.data ?? parsed.object ?? parsed.pairs ?? {};

        const entries = Object.entries(pairs);

        // Handle empty pairs - return empty object
        if (entries.length === 0) {
          return { object: {} };
        }

        const args = entries.flatMap(([k, v]) => [k, toJsonString(v)]);
        const placeholders = entries
          .map(
            (_, i) =>
              `$${String(i * 2 + 1)}::text, $${String(i * 2 + 2)}::jsonb`,
          )
          .join(", ");
        const sql = `SELECT jsonb_build_object(${placeholders}) as result`;
        const result = await adapter.executeQuery(sql, args);
        return { object: result.rows?.[0]?.["result"] ?? {} };
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_jsonb_object",
          }),
        };
      }
    },
  };
}

// Schema for pg_jsonb_array - accepts values or elements (alias)
const JsonbArraySchema = z
  .object({
    values: z.array(z.unknown()).optional().describe("Array elements to build"),
    elements: z
      .array(z.unknown())
      .optional()
      .describe("Array elements (alias for values)"),
  })
  .refine((data) => data.values !== undefined || data.elements !== undefined, {
    message: "Either 'values' or 'elements' must be provided",
  });

export function createJsonbArrayTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_jsonb_array",
    description:
      "Build a JSONB array from values. Accepts {values: [...]} or {elements: [...]}. Returns {array: [...]}.",
    group: "jsonb",
    inputSchema: JsonbArraySchema,
    outputSchema: JsonbArrayOutputSchema,
    annotations: readOnly("JSONB Array"),
    icons: getToolIcons("jsonb", readOnly("JSONB Array")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = params as { values?: unknown[]; elements?: unknown[] };
        // Support both 'values' and 'elements' parameter names
        const values = parsed.values ?? parsed.elements ?? [];
        if (values.length === 0) {
          return { array: [] };
        }
        const placeholders = values
          .map((_, i) => `$${String(i + 1)}::jsonb`)
          .join(", ");
        const sql = `SELECT jsonb_build_array(${placeholders}) as result`;
        const result = await adapter.executeQuery(
          sql,
          values.map((v) => toJsonString(v)),
        );
        return { array: result.rows?.[0]?.["result"] };
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_jsonb_array",
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
        const whereClause = parsed.where ? ` WHERE ${parsed.where}` : "";
        const sql = `SELECT DISTINCT jsonb_object_keys("${column}") as key FROM "${table}"${whereClause}`;
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

export function createJsonbStripNullsTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_jsonb_strip_nulls",
    description:
      "Remove null values from a JSONB column. Use preview=true to see changes without modifying data.",
    group: "jsonb",
    inputSchema: JsonbStripNullsSchemaBase,
    outputSchema: JsonbStripNullsOutputSchema,
    annotations: write("JSONB Strip Nulls"),
    icons: getToolIcons("jsonb", write("JSONB Strip Nulls")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Parse with preprocess schema to resolve aliases (tableName→table, col→column, filter→where)
        const parsed = JsonbStripNullsSchema.parse(params);
        const table = parsed.table;
        const column = parsed.column;
        const whereClause = parsed.where;
        if (!table || !column) {
          return { success: false, error: "table and column are required" };
        }
        // Validate required 'where' parameter before SQL execution
        if (!whereClause || whereClause.trim() === "") {
          return {
            success: false,
            error:
              'pg_jsonb_strip_nulls requires a WHERE clause to identify rows to update. Example: where: "id = 1"',
          };
        }

        if (parsed.preview === true) {
          // Preview mode - show before/after without modifying
          const previewSql = `SELECT "${column}" as before, jsonb_strip_nulls("${column}") as after FROM "${table}" WHERE ${whereClause}`;
          const result = await adapter.executeQuery(previewSql);
          return {
            preview: true,
            rows: result.rows,
            count: result.rows?.length ?? 0,
            hint: "No changes made - preview only",
          };
        }

        const sql = `UPDATE "${table}" SET "${column}" = jsonb_strip_nulls("${column}") WHERE ${whereClause}`;
        const result = await adapter.executeQuery(sql);
        return { rowsAffected: result.rowsAffected };
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_jsonb_strip_nulls",
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
        const whereClause = parsed.where ? ` WHERE ${parsed.where}` : "";
        // Normalize path to array format (accepts both string and array)
        const pathArray =
          parsed.path !== undefined
            ? normalizePathToArray(parsed.path)
            : undefined;
        const pathExpr = pathArray !== undefined ? ` #> $1` : "";
        // Include column IS NULL check to disambiguate NULL column vs null path result
        const sql = `SELECT jsonb_typeof("${column}"${pathExpr}) as type, ("${column}" IS NULL) as column_null FROM "${table}"${whereClause}`;
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
