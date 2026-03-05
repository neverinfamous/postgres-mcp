/**
 * PostgreSQL JSONB Tools - Write Operations
 *
 * Mutation tools: set, insert, delete, object, array, stripNulls.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z, ZodError } from "zod";
import { readOnly, write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatPostgresError } from "../core/error-helpers.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import { toJsonString, resolveJsonbTable } from "./read.js";
import {
  JsonbSetSchemaBase,
  JsonbInsertSchemaBase,
  JsonbDeleteSchemaBase,
  JsonbStripNullsSchemaBase,
  JsonbSetSchema,
  JsonbInsertSchema,
  JsonbDeleteSchema,
  JsonbStripNullsSchema,
  normalizePathToArray,
  normalizePathForInsert,
  JsonbSetOutputSchema,
  JsonbInsertOutputSchema,
  JsonbDeleteOutputSchema,
  JsonbObjectOutputSchema,
  JsonbArrayOutputSchema,
  JsonbStripNullsOutputSchema,
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
          return { success: false, error: "table and column are required" };
        }
        const { value, where, createMissing } = parsed;

        // Validate schema and build qualified table name
        const [qualifiedTable, tableError] = await resolveJsonbTable(
          adapter,
          table,
          parsed.schema,
        );
        if (tableError) return tableError;

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
          const sql = `UPDATE ${qualifiedTable} SET "${column}" = $1::jsonb WHERE ${sanitizeWhereClause(where)}`;
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
          sql = `UPDATE ${qualifiedTable} SET "${column}" = ${expr} WHERE ${sanitizeWhereClause(where)}`;
          const result = await adapter.executeQuery(sql, [toJsonString(value)]);
          return {
            rowsAffected: result.rowsAffected,
            hint: "rowsAffected counts matched rows, not path creations",
          };
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

        // Validate schema and build qualified table name
        const [qualifiedTable, tableError] = await resolveJsonbTable(
          adapter,
          table,
          parsed.schema,
        );
        if (tableError) return tableError;

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
        const checkSql = `SELECT COUNT(*) as null_count FROM ${qualifiedTable} WHERE ${sanitizeWhereClause(parsed.where)} AND "${column}" IS NULL`;
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
          const typeCheckSql = `SELECT jsonb_typeof("${column}") as type FROM ${qualifiedTable} WHERE ${sanitizeWhereClause(parsed.where)} LIMIT 1`;
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
          const typeCheckSql = `SELECT jsonb_typeof("${column}" #> $1) as type FROM ${qualifiedTable} WHERE ${sanitizeWhereClause(parsed.where)} LIMIT 1`;
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

        const sql = `UPDATE ${qualifiedTable} SET "${column}" = jsonb_insert("${column}", $1, $2::jsonb, $3) WHERE ${sanitizeWhereClause(parsed.where)}`;
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

        // Validate schema and build qualified table name
        const [qualifiedTable, tableError] = await resolveJsonbTable(
          adapter,
          table,
          parsed.schema,
        );
        if (tableError) return tableError;

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
        const sql = `UPDATE ${qualifiedTable} SET "${column}" = "${column}" ${pathExpr} WHERE ${sanitizeWhereClause(parsed.where)}`;
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
        // Wrap in try-catch to intercept Zod .refine() errors (e.g., missing WHERE)
        let parsed;
        try {
          parsed = JsonbStripNullsSchema.parse(params);
        } catch (error) {
          if (error instanceof ZodError) {
            const messages = error.issues.map((i) => i.message).join("; ");
            return {
              success: false,
              error: `pg_jsonb_strip_nulls validation error: ${messages}`,
            };
          }
          throw error;
        }
        const table = parsed.table;
        const column = parsed.column;
        const whereClause = parsed.where;
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
          const previewSql = `SELECT "${column}" as before, jsonb_strip_nulls("${column}") as after FROM ${qualifiedTable} WHERE ${sanitizeWhereClause(whereClause)}`;
          const result = await adapter.executeQuery(previewSql);
          return {
            preview: true,
            rows: result.rows,
            count: result.rows?.length ?? 0,
            hint: "No changes made - preview only",
          };
        }

        const sql = `UPDATE ${qualifiedTable} SET "${column}" = jsonb_strip_nulls("${column}") WHERE ${sanitizeWhereClause(whereClause)}`;
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
