/**
 * PostgreSQL JSONB Tools - Write Operations
 *
 * Mutation tools: set, insert, delete.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";


import { ValidationError } from "../../../../types/errors.js";
import { write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import { toJsonString, resolveJsonbTable } from "./read.js";
import {
  JsonbSetSchemaBase,
  JsonbInsertSchemaBase,
  JsonbDeleteSchemaBase,
  JsonbSetSchema,
  JsonbInsertSchema,
  JsonbDeleteSchema,
  normalizePathToArray,
  normalizePathForInsert,
  JsonbSetOutputSchema,
  JsonbInsertOutputSchema,
  JsonbDeleteOutputSchema,
} from "../../schemas/index.js";

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
          throw new ValidationError("table and column are required");
        }
        const { value, where, createMissing } = parsed;

        // Validate schema and build qualified table name
        const [qualifiedTable, tableError] = await resolveJsonbTable(
          adapter,
          table,
          parsed.schema,
        );
        if (tableError) throw new ValidationError(tableError.error);

        // Normalize path to array format
        if (parsed.path === undefined) {
          throw new ValidationError("path is required");
        }
        const path = normalizePathToArray(parsed.path);

        // Validate required 'where' parameter
        if (!where || where.trim() === "") {
          throw new ValidationError('pg_jsonb_set requires a WHERE clause to identify rows to update. Example: where: "id = 1"');
        }

        // Validate value is provided (undefined would set column to null)
        if (value === undefined) {
          throw new ValidationError("pg_jsonb_set requires a value parameter. To remove a key, use pg_jsonb_delete instead.");
        }

        const createFlag = createMissing !== false;

        // Handle empty path - replace entire column value
        if (path.length === 0) {
          const sql = `UPDATE ${qualifiedTable} SET "${column}" = $1::jsonb WHERE ${sanitizeWhereClause(where)}`;
          const result = await adapter.executeQuery(sql, [toJsonString(value)]);
          const response: {
            success: boolean;
            rowsAffected: number;
            hint?: string;
            warning?: string;
          } = {
            success: true,
            rowsAffected: result.rowsAffected ?? 0,
            hint: "Replaced entire column value (empty path)",
          };
          if ((result.rowsAffected ?? 0) === 0) {
            response.warning = "No rows found matching the WHERE clause";
          }
          return response;
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
          sql = `UPDATE ${qualifiedTable} SET "${column}" = ${expr} WHERE ${sanitizeWhereClause(where)}`;
          const result = await adapter.executeQuery(sql, [toJsonString(value)]);
          const response: {
            success: boolean;
            rowsAffected: number;
            hint?: string;
            warning?: string;
          } = {
            success: true,
            rowsAffected: result.rowsAffected ?? 0,
            hint: "rowsAffected counts matched rows, not path creations",
          };
          if ((result.rowsAffected ?? 0) === 0) {
            response.warning = "No rows found matching the WHERE clause";
          }
          return response;
        } else {
          // Use COALESCE to handle NULL columns - initialize to empty object
          sql = `UPDATE ${qualifiedTable} SET "${column}" = jsonb_set(COALESCE("${column}", '{}'::jsonb), $1, $2::jsonb, $3) WHERE ${sanitizeWhereClause(where)}`;
          const result = await adapter.executeQuery(sql, [
            path,
            toJsonString(value),
            createFlag,
          ]);
          const hint = createFlag
            ? "NULL columns initialized to {}; createMissing creates path if absent"
            : "createMissing=false: path must exist or value won't be set";
          const response: {
            success: boolean;
            rowsAffected: number;
            hint?: string;
            warning?: string;
          } = { success: true, rowsAffected: result.rowsAffected ?? 0, hint };
          if ((result.rowsAffected ?? 0) === 0) {
            response.warning = "No rows found matching the WHERE clause";
          }
          return response;
        }
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_jsonb_set",
          });
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
      "Insert value into JSONB array or object. For arrays, index -1 inserts BEFORE last element (use insertAfter:true to append). For objects, throws error if key already exists.",
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
          throw new ValidationError("table and column are required");
        }

        // Validate schema and build qualified table name
        const [qualifiedTable, tableError] = await resolveJsonbTable(
          adapter,
          table,
          parsed.schema,
        );
        if (tableError) throw new ValidationError(tableError.error);

        // Normalize path - convert numeric segments to numbers for PostgreSQL
        if (parsed.path === undefined) {
          throw new ValidationError("path is required");
        }
        const path = normalizePathForInsert(parsed.path);

        // Validate required 'where' parameter
        if (!parsed.where || parsed.where.trim() === "") {
          throw new ValidationError('pg_jsonb_insert requires a WHERE clause to identify rows to update. Example: where: "id = 1"');
        }

        // Check for NULL columns first - jsonb_insert requires existing array context
        const checkSql = `SELECT COUNT(*) as null_count FROM ${qualifiedTable} WHERE ${sanitizeWhereClause(parsed.where)} AND "${column}" IS NULL`;
        const checkResult = await adapter.executeQuery(checkSql);
        const nullCount = Number(checkResult.rows?.[0]?.["null_count"] ?? 0);
        if (nullCount > 0) {
          throw new ValidationError(`pg_jsonb_insert cannot operate on NULL columns. Use pg_jsonb_set to initialize the column first: pg_jsonb_set({table: "${table}", column: "${column}", path: "myarray", value: [], where: "..."})`);
        }

        // Determine target path type for potential error context later if needed
        // PostgreSQL natively allows jsonb_insert on both arrays and objects (for objects, fails if key exists)


        const sql = `UPDATE ${qualifiedTable} SET "${column}" = jsonb_insert("${column}", $1, $2::jsonb, $3) WHERE ${sanitizeWhereClause(parsed.where)}`;
        const result = await adapter.executeQuery(sql, [
          path,
          toJsonString(parsed.value),
          parsed.insertAfter ?? false,
        ]);
        const response: {
          success: boolean;
          rowsAffected: number;
          warning?: string;
        } = { success: true, rowsAffected: result.rowsAffected ?? 0 };
        if ((result.rowsAffected ?? 0) === 0) {
          response.warning = "No rows found matching the WHERE clause";
        }
        return response;
      } catch (error: unknown) {
        // Improve specific PostgreSQL error messages
        if (
          error instanceof Error &&
          error.message.includes("cannot replace existing key")
        ) {
          return formatHandlerErrorResponse(
            new ValidationError(`Cannot substitute an existing key. For objects, use pg_jsonb_set to update existing keys. For arrays, use pg_jsonb_set to replace an element.`),
            { tool: "pg_jsonb_insert" }
          );
        }
        if (
          error instanceof Error &&
          error.message.includes("is not an integer") &&
          error.message.includes("path element")
        ) {
          return formatHandlerErrorResponse(
            new ValidationError(`pg_jsonb_insert requires numeric index for array position. Use array format with number: ["tags", 0] not ["tags", "0"] or "tags.0"`),
            { tool: "pg_jsonb_insert" }
          );
        }
        return formatHandlerErrorResponse(error, {
            tool: "pg_jsonb_insert",
          });
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
          throw new ValidationError("table and column are required");
        }

        // Validate schema and build qualified table name
        const [qualifiedTable, tableError] = await resolveJsonbTable(
          adapter,
          table,
          parsed.schema,
        );
        if (tableError) throw new ValidationError(tableError.error);

        // Validate required 'where' parameter
        if (!parsed.where || parsed.where.trim() === "") {
          throw new ValidationError('pg_jsonb_delete requires a WHERE clause to identify rows to update. Example: where: "id = 1"');
        }

        // Validate path is not empty
        if (parsed.path === undefined) {
          throw new ValidationError("path is required");
        }
        if (
          parsed.path === "" ||
          (Array.isArray(parsed.path) && parsed.path.length === 0)
        ) {
          throw new ValidationError("pg_jsonb_delete requires a non-empty path. Provide a key name or path to delete.");
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
        const sql = `UPDATE ${qualifiedTable} SET "${column}" = "${column}" ${pathExpr} WHERE ${sanitizeWhereClause(parsed.where)}`;
        const result = await adapter.executeQuery(sql, [pathForPostgres]);
        const response: {
          success: boolean;
          rowsAffected: number;
          hint?: string;
          warning?: string;
        } = {
          success: true,
          rowsAffected: result.rowsAffected ?? 0,
          hint: "rowsAffected counts matched rows, not whether key existed",
        };
        if ((result.rowsAffected ?? 0) === 0) {
          response.warning = "No rows found matching the WHERE clause";
        }
        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_jsonb_delete",
          });
      }
    },
  };
}