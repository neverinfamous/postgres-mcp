/**
 * PostgreSQL JSONB Tools - Advanced Operations
 *
 * Advanced JSONB operations including path validation, merge, normalize, diff, index suggestions, security scanning, and statistics.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { ValidationError } from "../../../../types/errors.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import {
  sanitizeIdentifier,
  sanitizeTableName,
} from "../../../../utils/identifiers.js";
import {
  JsonbValidatePathOutputSchema,
  JsonbMergeOutputSchema,
  JsonbNormalizeOutputSchema,
  JsonbDiffOutputSchema,
  // Base schemas for MCP visibility (Split Schema pattern)
  JsonbNormalizeSchemaBase,
  // Full schemas (with preprocess - for handler parsing)
  JsonbNormalizeSchema,
} from "../../schemas/index.js";

/**
 * Convert value to a valid JSON string for PostgreSQL's ::jsonb cast
 * Always uses JSON.stringify to ensure proper encoding
 */
function toJsonString(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Validate JSON path expression
 */
export function createJsonbValidatePathTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_jsonb_validate_path",
    description:
      "Validate a JSONPath expression and test it against sample data. Supports vars for parameterized paths.",
    group: "jsonb",
    inputSchema: z.object({
      path: z.string().optional().describe("JSONPath expression to validate"),
      testValue: z
        .unknown()
        .optional()
        .describe("Optional JSONB value to test against"),
      vars: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Variables for parameterized paths (e.g., {x: 5})"),
    }),
    outputSchema: JsonbValidatePathOutputSchema,
    annotations: readOnly("JSONB Validate Path"),
    icons: getToolIcons("jsonb", readOnly("JSONB Validate Path")),
    handler: async (params: unknown, _context: RequestContext) => {
      const parsed = params as {
        path?: string;
        testValue?: unknown;
        vars?: Record<string, unknown>;
      };

      try {
        if (
          !parsed.path ||
          typeof parsed.path !== "string" ||
          parsed.path.trim() === ""
        ) {
          return {
            success: false,
            error:
              "Validation error: path is required and must be a non-empty string",
          };
        }
        if (parsed.testValue !== undefined) {
          const varsJson = parsed.vars ? JSON.stringify(parsed.vars) : "{}";
          const sql = `SELECT jsonb_path_query($1::jsonb, $2::jsonpath, $3::jsonb) as result`;
          const result = await adapter.executeQuery(sql, [
            toJsonString(parsed.testValue),
            parsed.path,
            varsJson,
          ]);
          return {
            valid: true,
            path: parsed.path,
            results: result.rows?.map((r) => r["result"]),
            varsUsed: parsed.vars !== undefined,
          };
        } else {
          const sql = `SELECT $1::jsonpath as path`;
          await adapter.executeQuery(sql, [parsed.path]);
          return { valid: true, path: parsed.path };
        }
      } catch (error: unknown) {
        return {
          valid: false,
          path: parsed.path,
          error: error instanceof Error ? error.message : "Invalid path",
        };
      }
    },
  };
}

/**
 * Recursively deep merge two objects
 * @param mergeArrays - If true, concatenate arrays instead of replacing
 */
function deepMergeObjects(
  base: unknown,
  overlay: unknown,
  mergeArrays = false,
): unknown {
  // If both are arrays and mergeArrays is true, concatenate them
  if (Array.isArray(base) && Array.isArray(overlay) && mergeArrays) {
    return [...(base as unknown[]), ...(overlay as unknown[])];
  }
  // If either is not an object, overlay wins
  if (typeof base !== "object" || base === null || Array.isArray(base)) {
    return overlay;
  }
  if (
    typeof overlay !== "object" ||
    overlay === null ||
    Array.isArray(overlay)
  ) {
    return overlay;
  }

  const result: Record<string, unknown> = {
    ...(base as Record<string, unknown>),
  };
  const overlayObj = overlay as Record<string, unknown>;

  for (const key of Object.keys(overlayObj)) {
    const baseVal = result[key];
    const overlayVal = overlayObj[key];

    // Recursively merge if both are objects (pass mergeArrays through)
    if (
      typeof baseVal === "object" &&
      baseVal !== null &&
      typeof overlayVal === "object" &&
      overlayVal !== null
    ) {
      result[key] = deepMergeObjects(baseVal, overlayVal, mergeArrays);
    } else {
      result[key] = overlayVal;
    }
  }

  return result;
}

// Schema for pg_jsonb_merge - direct schema for MCP visibility
const JsonbMergeSchema = z.object({
  base: z.unknown().describe("Base JSONB document (required)"),
  overlay: z.unknown().describe("JSONB to merge on top (required)"),
  deep: z
    .boolean()
    .optional()
    .describe("Deep merge nested objects (default: true)"),
  mergeArrays: z
    .boolean()
    .optional()
    .describe("Concatenate arrays instead of replacing (default: false)"),
});

/**
 * Preprocess merge params to parse JSON strings and validate objects
 */
function parseMergeParams(params: unknown): {
  base: unknown;
  overlay: unknown;
  deep: boolean | undefined;
  mergeArrays: boolean | undefined;
} {
  const parsed = JsonbMergeSchema.parse(params);
  // Parse JSON strings if needed
  let base = parsed.base;
  let overlay = parsed.overlay;
  if (typeof base === "string") {
    try {
      base = JSON.parse(base);
    } catch {
      /* keep as string */
    }
  }
  if (typeof overlay === "string") {
    try {
      overlay = JSON.parse(overlay);
    } catch {
      /* keep as string */
    }
  }

  if (base === undefined) {
    throw new ValidationError("pg_jsonb_merge requires base document");
  }
  if (overlay === undefined) {
    throw new ValidationError("pg_jsonb_merge requires overlay document");
  }

  // Validate base and overlay are objects (not primitives or arrays)
  if (typeof base !== "object" || base === null || Array.isArray(base)) {
    throw new ValidationError(
      "pg_jsonb_merge base must be an object. For arrays or primitives, use pg_jsonb_set.",
    );
  }
  if (
    typeof overlay !== "object" ||
    overlay === null ||
    Array.isArray(overlay)
  ) {
    throw new ValidationError(
      "pg_jsonb_merge overlay must be an object. For arrays or primitives, use pg_jsonb_set.",
    );
  }

  return { base, overlay, deep: parsed.deep, mergeArrays: parsed.mergeArrays };
}

/**
 * Deep merge two JSONB documents
 */
export function createJsonbMergeTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_jsonb_merge",
    description:
      "Merge two JSONB objects. deep=true (default) recursively merges. mergeArrays=true concatenates arrays.",
    group: "jsonb",
    inputSchema: JsonbMergeSchema,
    outputSchema: JsonbMergeOutputSchema,
    annotations: readOnly("JSONB Merge"),
    icons: getToolIcons("jsonb", readOnly("JSONB Merge")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = parseMergeParams(params);
        const useDeep = parsed.deep !== false;
        const useMergeArrays = parsed.mergeArrays === true;

        if (useDeep) {
          const merged = deepMergeObjects(
            parsed.base,
            parsed.overlay,
            useMergeArrays,
          );
          return { merged, deep: true, mergeArrays: useMergeArrays };
        } else {
          const sql = `SELECT $1::jsonb || $2::jsonb as result`;
          const result = await adapter.executeQuery(sql, [
            toJsonString(parsed.base),
            toJsonString(parsed.overlay),
          ]);
          return { merged: result.rows?.[0]?.["result"], deep: false };
        }
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_jsonb_merge",
          });
      }
    },
  };
}

/**
 * Normalize JSONB to relational form (key-value pairs)
 */
export function createJsonbNormalizeTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_jsonb_normalize",
    description:
      'Normalize JSONB to key-value pairs. Use idColumn to specify row identifier (default: "id" if exists, else ctid).',
    group: "jsonb",
    inputSchema: JsonbNormalizeSchemaBase,
    outputSchema: JsonbNormalizeOutputSchema,
    annotations: readOnly("JSONB Normalize"),
    icons: getToolIcons("jsonb", readOnly("JSONB Normalize")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Parse with preprocess schema to resolve aliases (tableName→table, col→column, filter→where)
        const parsed = JsonbNormalizeSchema.parse(params);
        const table = parsed.table;
        const column = parsed.column;
        if (!table || !column) {
          return { success: false, error: "table and column are required" };
        }
        const whereClause = parsed.where
          ? ` WHERE ${sanitizeWhereClause(parsed.where)}`
          : "";
        const mode = parsed.mode ?? "keys";

        // Validate mode parameter
        const validModes = ["keys", "array", "pairs", "flatten"];
        if (!validModes.includes(mode)) {
          return {
            success: false,
            error: `pg_jsonb_normalize: Invalid mode '${mode}'. Valid modes: ${validModes.join(", ")}`,
          };
        }

        // Validate schema existence for non-public schemas
        const schemaName = parsed.schema ?? "public";
        if (schemaName !== "public") {
          const schemaResult = await adapter.executeQuery(
            `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
            [schemaName],
          );
          if (!schemaResult.rows || schemaResult.rows.length === 0) {
            return {
              success: false,
              error: `Schema '${schemaName}' does not exist. Use pg_list_objects with type 'table' to see available schemas.`,
            };
          }
        }

        const tableName = sanitizeTableName(table, schemaName);
        const columnName = sanitizeIdentifier(column);

        // Determine row identifier column
        let rowIdExpr: string;
        let rowIdAlias = "source_id";
        if (parsed.idColumn) {
          rowIdExpr = sanitizeIdentifier(parsed.idColumn);
        } else {
          try {
            const checkSql = `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = 'id' LIMIT 1`;
            const checkResult = await adapter.executeQuery(checkSql, [
              parsed.table,
            ]);
            if (checkResult.rows && checkResult.rows.length > 0) {
              rowIdExpr = '"id"';
            } else {
              rowIdExpr = "ctid::text";
              rowIdAlias = "source_ctid";
            }
          } catch {
            rowIdExpr = "ctid::text";
            rowIdAlias = "source_ctid";
          }
        }

        let sql: string;
        if (mode === "array") {
          sql = `SELECT ${rowIdExpr} as ${rowIdAlias}, jsonb_array_elements(${columnName}) as element FROM ${tableName}${whereClause}`;
        } else if (mode === "flatten") {
          sql = `
                    WITH RECURSIVE
                    source_rows AS (
                        SELECT ${rowIdExpr} as ${rowIdAlias}, ${columnName} as doc
                        FROM ${tableName}${whereClause}
                    ),
                    flattened AS (
                        SELECT
                            sr.${rowIdAlias},
                            kv.key as path,
                            kv.value,
                            jsonb_typeof(kv.value) as value_type
                        FROM source_rows sr, jsonb_each(sr.doc) kv

                        UNION ALL

                        SELECT
                            f.${rowIdAlias},
                            f.path || '.' || kv.key,
                            kv.value,
                            jsonb_typeof(kv.value)
                        FROM flattened f, jsonb_each(f.value) kv
                        WHERE jsonb_typeof(f.value) = 'object'
                    )
                    SELECT ${rowIdAlias}, path as key, value, value_type FROM flattened
                    WHERE value_type != 'object' OR value = '{}'::jsonb
                    ORDER BY ${rowIdAlias}, path
                `;
        } else if (mode === "pairs") {
          sql = `SELECT ${rowIdExpr} as ${rowIdAlias}, key, value FROM ${tableName}, jsonb_each(${columnName}) ${whereClause}`;
        } else {
          sql = `SELECT ${rowIdExpr} as ${rowIdAlias}, key, value FROM ${tableName}, jsonb_each_text(${columnName}) ${whereClause}`;
        }

        const result = await adapter.executeQuery(sql);
        // Check for empty flatten results on array columns
        if (mode === "flatten" && (result.rows?.length ?? 0) === 0) {
          const typeCheckSql = `SELECT jsonb_typeof(${columnName}) as type FROM ${tableName}${whereClause} LIMIT 1`;
          const typeResult = await adapter.executeQuery(typeCheckSql);
          if (typeResult.rows?.[0]?.["type"] === "array") {
            return {
              success: false,
              error: `pg_jsonb_normalize flatten mode requires object columns. Column appears to contain arrays - use 'array' mode instead.`,
            };
          }
        }
        return { rows: result.rows, count: result.rows?.length ?? 0, mode };
      } catch (error: unknown) {
        // Improve error for array columns with object-only modes
        if (
          error instanceof Error &&
          error.message.includes("cannot call jsonb_each")
        ) {
          return {
            success: false,
            error: `pg_jsonb_normalize requires object columns for this mode. For array columns, use mode: 'array'.`,
          };
        }
        if (
          error instanceof Error &&
          error.message.includes("cannot extract elements from an object")
        ) {
          return {
            success: false,
            error: `pg_jsonb_normalize 'array' mode requires array columns. For object columns, use mode: 'keys' or 'pairs'.`,
          };
        }
        return formatHandlerErrorResponse(error, {
            tool: "pg_jsonb_normalize",
          });
      }
    },
  };
}

/**
 * Diff two JSONB documents
 * Note: Uses jsonb_each() which requires object inputs, not arrays or primitives
 */
// Schema for pg_jsonb_diff - requires objects (not arrays or primitives)
// Base schema for MCP visibility — z.unknown() to avoid SDK-level Zod rejection
// of non-object types (arrays, primitives). Handler validates internally.
const JsonbDiffSchemaBase = z.object({
  doc1: z
    .unknown()
    .optional()
    .describe("First JSONB object to compare"),
  doc2: z
    .unknown()
    .optional()
    .describe("Second JSONB object to compare"),
});

// Internal schema for handler validation (required fields)
const JsonbDiffSchema = z.object({
  doc1: z
    .record(z.string(), z.unknown())
    .describe("First JSONB object to compare"),
  doc2: z
    .record(z.string(), z.unknown())
    .describe("Second JSONB object to compare"),
});

export function createJsonbDiffTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_jsonb_diff",
    description:
      "Compare two JSONB objects. Returns top-level key differences only (shallow comparison, not recursive).",
    group: "jsonb",
    inputSchema: JsonbDiffSchemaBase,
    outputSchema: JsonbDiffOutputSchema,
    annotations: readOnly("JSONB Diff"),
    icons: getToolIcons("jsonb", readOnly("JSONB Diff")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        let parsed;
        try {
          parsed = JsonbDiffSchema.parse(params);
        } catch {
          return {
            success: false,
            error:
              "pg_jsonb_diff requires two JSONB objects. Arrays and primitive values are not supported. Use {} format for both doc1 and doc2.",
          };
        }

        const sql = `
                WITH
                    j1 AS (SELECT key, value FROM jsonb_each($1::jsonb)),
                    j2 AS (SELECT key, value FROM jsonb_each($2::jsonb))
                SELECT
                    COALESCE(j1.key, j2.key) as key,
                    j1.value as value1,
                    j2.value as value2,
                    CASE
                        WHEN j1.key IS NULL THEN 'added'
                        WHEN j2.key IS NULL THEN 'removed'
                        WHEN j1.value = j2.value THEN 'unchanged'
                        ELSE 'modified'
                    END as status
                FROM j1 FULL OUTER JOIN j2 ON j1.key = j2.key
                WHERE j1.value IS DISTINCT FROM j2.value
            `;

        const result = await adapter.executeQuery(sql, [
          toJsonString(parsed.doc1),
          toJsonString(parsed.doc2),
        ]);

        return {
          differences: result.rows,
          hasDifferences: (result.rows?.length ?? 0) > 0,
          comparison: "shallow",
          hint: "Compares top-level keys only. Nested object changes show as modified.",
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_jsonb_diff",
          });
      }
    },
  };
}
