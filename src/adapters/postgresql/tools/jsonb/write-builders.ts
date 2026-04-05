/**
 * PostgreSQL JSONB Tools - Builder Operations
 *
 * Utility tools: object, array, stripNulls.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { ValidationError } from "../../../../types/errors.js";
import { readOnly, write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import { toJsonString, resolveJsonbTable } from "./read.js";
import {
  JsonbStripNullsSchemaBase,
  JsonbStripNullsSchema,
  JsonbObjectOutputSchema,
  JsonbArrayOutputSchema,
  JsonbStripNullsOutputSchema,
} from "../../schemas/index.js";

// Schema for pg_jsonb_object - accepts 'data', 'object', or 'pairs' parameter containing key-value pairs
// For code mode: pg.jsonb.object({name: "John", age: 30}) - passes through OBJECT_WRAP_MAP → {data: {...}}
// For MCP tools: {data: {name: "John", age: 30}} or {pairs: {...}} or {object: {...}}
// Also supports parallel arrays: {keys: ["a","b"], values: ["1","2"]}
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
    keys: z
      .array(z.string())
      .optional()
      .describe('Key names when using parallel arrays: ["name", "age"]'),
    values: z
      .array(z.unknown())
      .optional()
      .describe('Values when using parallel arrays: ["Alice", 30]'),
  })
  .describe(
    'Build a JSONB object from key-value pairs. Use data: {key: value}, or parallel arrays: keys: ["k"], values: ["v"].',
  );

export function createJsonbObjectTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_jsonb_object",
    description:
      'Build a JSONB object. Use data: {name: "John", age: 30} or parallel arrays keys: ["name"], values: ["John"]. Returns {object: {...}}.',
    group: "jsonb",
    inputSchema: JsonbObjectSchema,
    outputSchema: JsonbObjectOutputSchema,
    annotations: readOnly("JSONB Object"),
    icons: getToolIcons("jsonb", readOnly("JSONB Object")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Parse the input
        const parsed = JsonbObjectSchema.parse(params);

        // Mode 1: parallel arrays (keys + values)
        let pairs: Record<string, unknown>;
        if (parsed.keys !== undefined || parsed.values !== undefined) {
          const keys = parsed.keys ?? [];
          const vals = parsed.values ?? [];
          if (keys.length !== vals.length) {
            throw new ValidationError(
              `pg_jsonb_object: keys and values arrays must have the same length (got ${String(keys.length)} keys, ${String(vals.length)} values).`,
            );
          }
          if (keys.length === 0) {
            throw new ValidationError(
              "pg_jsonb_object requires at least one key-value pair. Use data: {key: value} or keys: [...], values: [...].",
            );
          }
          pairs = Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
        } else {
          // Mode 2: object parameter (data / object / pairs)
          pairs = parsed.data ?? parsed.object ?? parsed.pairs ?? {};
          if (Object.keys(pairs).length === 0) {
            throw new ValidationError(
              "pg_jsonb_object requires at least one key-value pair. Use data: {key: value} or keys: [...], values: [...].",
            );
          }
        }

        const entries = Object.entries(pairs);

        const args = entries.flatMap(([k, v]) => [k, toJsonString(v)]);
        const placeholders = entries
          .map(
            (_, i) =>
              `$${String(i * 2 + 1)}::text, $${String(i * 2 + 2)}::jsonb`,
          )
          .join(", ");
        const sql = `SELECT jsonb_build_object(${placeholders}) as result`;
        const result = await adapter.executeQuery(sql, args);
        return { success: true, object: result.rows?.[0]?.["result"] ?? {} };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_jsonb_object",
        });
      }
    },
  };
}

// Base schema for MCP visibility (no refine - avoids MCP framework Zod rejection)
const JsonbArraySchemaBase = z.object({
  values: z.array(z.unknown()).optional().describe("Array elements to build"),
  elements: z
    .array(z.unknown())
    .optional()
    .describe("Array elements (alias for values)"),
});

export function createJsonbArrayTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_jsonb_array",
    description:
      "Build a JSONB array from values. Accepts {values: [...]} or {elements: [...]}. Returns {array: [...]}.",
    group: "jsonb",
    inputSchema: JsonbArraySchemaBase,
    outputSchema: JsonbArrayOutputSchema,
    annotations: readOnly("JSONB Array"),
    icons: getToolIcons("jsonb", readOnly("JSONB Array")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = params as { values?: unknown[]; elements?: unknown[] };
        // Support both 'values' and 'elements' parameter names
        const values = parsed.values ?? parsed.elements;
        if (values === undefined) {
          throw new ValidationError(
            "Either 'values' or 'elements' must be provided",
          );
        }
        if (!Array.isArray(values)) {
          throw new ValidationError("'values' must be an array");
        }
        if (values.length === 0) {
          return { success: true, array: [] };
        }
        const placeholders = values
          .map((_, i) => `$${String(i + 1)}::jsonb`)
          .join(", ");
        const sql = `SELECT jsonb_build_array(${placeholders}) as result`;
        const result = await adapter.executeQuery(
          sql,
          values.map((v) => toJsonString(v)),
        );
        return { success: true, array: result.rows?.[0]?.["result"] };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_jsonb_array",
        });
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
          throw new ValidationError("table and column are required");
        }

        // Validate schema and build qualified table name
        const [qualifiedTable, tableError] = await resolveJsonbTable(
          adapter,
          table,
          parsed.schema,
        );
        if (tableError) return tableError;

        // Validate required 'where' parameter before SQL execution
        if (
          whereClause === undefined ||
          typeof whereClause !== "string" ||
          whereClause.trim() === ""
        ) {
          throw new ValidationError(
            'pg_jsonb_strip_nulls requires a WHERE clause to identify rows to update. Example: where: "id = 1"',
          );
        }

        if (parsed.preview === true) {
          // Preview mode - show before/after without modifying
          const previewSql = `SELECT "${column}" as before, jsonb_strip_nulls("${column}") as after FROM ${qualifiedTable} WHERE ${sanitizeWhereClause(whereClause)}`;
          const result = await adapter.executeQuery(previewSql);
          return {
            success: true,
            preview: true,
            rows: result.rows,
            count: result.rows?.length ?? 0,
            hint: "No changes made - preview only",
          };
        }

        const sql = `UPDATE ${qualifiedTable} SET "${column}" = jsonb_strip_nulls("${column}") WHERE ${sanitizeWhereClause(whereClause)}`;
        const result = await adapter.executeQuery(sql);
        return { success: true, rowsAffected: result.rowsAffected };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_jsonb_strip_nulls",
        });
      }
    },
  };
}
