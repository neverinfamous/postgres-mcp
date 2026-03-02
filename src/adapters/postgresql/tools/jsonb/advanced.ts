/**
 * PostgreSQL JSONB Tools - Advanced Operations
 *
 * Advanced JSONB operations including path validation, merge, normalize, diff, index suggestions, security scanning, and statistics.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatPostgresError } from "../core/error-helpers.js";
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
  JsonbIndexSuggestOutputSchema,
  JsonbSecurityScanOutputSchema,
  JsonbStatsOutputSchema,
  // Base schemas for MCP visibility (Split Schema pattern)
  JsonbNormalizeSchemaBase,
  JsonbStatsSchemaBase,
  JsonbIndexSuggestSchemaBase,
  JsonbSecurityScanSchemaBase,
  // Full schemas (with preprocess - for handler parsing)
  JsonbNormalizeSchema,
  JsonbStatsSchema,
  JsonbIndexSuggestSchema,
  JsonbSecurityScanSchema,
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
      path: z.string().describe("JSONPath expression to validate"),
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
        path: string;
        testValue?: unknown;
        vars?: Record<string, unknown>;
      };

      try {
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
      } catch (error) {
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
    throw new Error("pg_jsonb_merge requires base document");
  }
  if (overlay === undefined) {
    throw new Error("pg_jsonb_merge requires overlay document");
  }

  // Validate base and overlay are objects (not primitives or arrays)
  if (typeof base !== "object" || base === null || Array.isArray(base)) {
    throw new Error(
      "pg_jsonb_merge base must be an object. For arrays or primitives, use pg_jsonb_set.",
    );
  }
  if (
    typeof overlay !== "object" ||
    overlay === null ||
    Array.isArray(overlay)
  ) {
    throw new Error(
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
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_jsonb_merge",
          }),
        };
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
      } catch (error) {
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
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_jsonb_normalize",
          }),
        };
      }
    },
  };
}

/**
 * Diff two JSONB documents
 * Note: Uses jsonb_each() which requires object inputs, not arrays or primitives
 */
// Schema for pg_jsonb_diff - requires objects (not arrays or primitives)
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
    inputSchema: JsonbDiffSchema,
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
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_jsonb_diff",
          }),
        };
      }
    },
  };
}

/**
 * Suggest JSONB indexes based on query patterns
 */
export function createJsonbIndexSuggestTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_jsonb_index_suggest",
    description:
      "Analyze JSONB column and suggest indexes. Only works on object-type JSONB (not arrays).",
    group: "jsonb",
    inputSchema: JsonbIndexSuggestSchemaBase,
    outputSchema: JsonbIndexSuggestOutputSchema,
    annotations: readOnly("JSONB Index Suggest"),
    icons: getToolIcons("jsonb", readOnly("JSONB Index Suggest")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Parse with preprocess schema to resolve aliases (tableName→table, col→column, filter→where)
        const parsed = JsonbIndexSuggestSchema.parse(params);
        const table = parsed.table;
        const column = parsed.column;
        if (!table || !column) {
          return { success: false, error: "table and column are required" };
        }
        const sample = parsed.sampleSize ?? 1000;
        const whereClause = parsed.where
          ? ` WHERE ${sanitizeWhereClause(parsed.where)}`
          : "";

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

        const keySql = `
                SELECT key, COUNT(*) as frequency,
                       jsonb_typeof(value) as value_type
                FROM (SELECT * FROM ${tableName}${whereClause} LIMIT ${String(sample)}) t,
                     jsonb_each(${columnName})
                GROUP BY key, jsonb_typeof(value)
                ORDER BY frequency DESC
                LIMIT 20
            `;

        const keyResult = await adapter.executeQuery(keySql);

        const indexSql = `
                SELECT indexname, indexdef
                FROM pg_indexes
                WHERE tablename = $1
                AND indexdef LIKE '%' || $2 || '%'
            `;

        const indexResult = await adapter.executeQuery(indexSql, [
          parsed.table,
          parsed.column,
        ]);

        const recommendations: string[] = [];
        const keys = (keyResult.rows ?? []).map(
          (row: Record<string, unknown>) => ({
            key: row["key"] as string,
            frequency: Number(row["frequency"]),
            value_type: row["value_type"] as string,
          }),
        );

        if ((indexResult.rows?.length ?? 0) === 0 && keys.length > 0) {
          recommendations.push(
            `CREATE INDEX ON ${tableName} USING GIN (${columnName})`,
          );
        }

        for (const keyInfo of keys.slice(0, 5)) {
          if (keyInfo.frequency > sample * 0.5) {
            recommendations.push(
              `CREATE INDEX ON ${tableName} ((${columnName} ->> '${keyInfo.key.replace(/'/g, "''")}'))`,
            );
          }
        }

        const response: {
          keyDistribution: typeof keys;
          existingIndexes: unknown;
          recommendations: string[];
          hint?: string;
        } = {
          keyDistribution: keys,
          existingIndexes: indexResult.rows,
          recommendations,
        };

        if (recommendations.length === 0) {
          if ((indexResult.rows?.length ?? 0) > 0) {
            response.hint =
              "No new recommendations - existing indexes already cover this column";
          } else if (keys.length === 0) {
            response.hint =
              "No recommendations - table is empty or column has no keys to analyze";
          } else {
            response.hint =
              "No recommendations - no keys appeared in >50% of sampled rows";
          }
        }

        return response;
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.includes("function jsonb_each") ||
            error.message.includes("cannot call jsonb_each"))
        ) {
          return {
            success: false,
            error: `pg_jsonb_index_suggest requires JSONB objects (not arrays). Column may not be JSONB type or contains arrays.`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_jsonb_index_suggest",
          }),
        };
      }
    },
  };
}

/**
 * Scan JSONB for security issues
 */
export function createJsonbSecurityScanTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_jsonb_security_scan",
    description:
      "Scan JSONB for security issues. Only works on object-type JSONB (not arrays). Use larger sampleSize for thorough scans.",
    group: "jsonb",
    inputSchema: JsonbSecurityScanSchemaBase,
    outputSchema: JsonbSecurityScanOutputSchema,
    annotations: readOnly("JSONB Security Scan"),
    icons: getToolIcons("jsonb", readOnly("JSONB Security Scan")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Parse with preprocess schema to resolve aliases (tableName→table, col→column, filter→where)
        const parsed = JsonbSecurityScanSchema.parse(params);
        const table = parsed.table;
        const column = parsed.column;
        if (!table || !column) {
          return { success: false, error: "table and column are required" };
        }
        const sample = parsed.sampleSize ?? 100;
        const whereClause = parsed.where
          ? ` WHERE ${sanitizeWhereClause(parsed.where)}`
          : "";

        const issues: { type: string; key: string; count: number }[] = [];

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

        // Count actual rows scanned
        const countSql = `SELECT COUNT(*) as count FROM (SELECT * FROM ${tableName}${whereClause} LIMIT ${String(sample)}) t`;
        const countResult = await adapter.executeQuery(countSql);
        const actualRowsScanned = Number(countResult.rows?.[0]?.["count"] ?? 0);

        const sensitiveKeysSql = `
                SELECT key, COUNT(*) as count
                FROM (SELECT * FROM ${tableName}${whereClause} LIMIT ${String(sample)}) t,
                     jsonb_each_text(${columnName})
                WHERE lower(key) IN ('password', 'secret', 'token', 'api_key', 'apikey',
                                     'auth', 'credential', 'ssn', 'credit_card', 'cvv')
                GROUP BY key
            `;

        const sensitiveResult = await adapter.executeQuery(sensitiveKeysSql);
        for (const row of (sensitiveResult.rows ?? []) as {
          key: string;
          count: string | number;
        }[]) {
          issues.push({
            type: "sensitive_key",
            key: row.key,
            count: Number(row.count),
          });
        }
        const injectionSql = `
                SELECT key, COUNT(*) as count
                FROM (SELECT * FROM ${tableName}${whereClause} LIMIT ${String(sample)}) t,
                     jsonb_each_text(${columnName})
                WHERE value ~* '(\\bSELECT\\s+.+\\bFROM\\b|\\bINSERT\\s+INTO\\b|\\bUPDATE\\s+.+\\bSET\\b|\\bDELETE\\s+FROM\\b|\\bDROP\\s+(TABLE|DATABASE|INDEX)\\b|\\bUNION\\s+(ALL\\s+)?SELECT\\b|--\\s*$|;\\s*(SELECT|INSERT|UPDATE|DELETE))'
                GROUP BY key
            `;

        const injectionResult = await adapter.executeQuery(injectionSql);
        for (const row of (injectionResult.rows ?? []) as {
          key: string;
          count: string | number;
        }[]) {
          issues.push({
            type: "sql_injection_pattern",
            key: row.key,
            count: Number(row.count),
          });
        }

        // XSS pattern detection
        const xssSql = `
                SELECT key, COUNT(*) as count
                FROM (SELECT * FROM ${tableName}${whereClause} LIMIT ${String(sample)}) t,
                     jsonb_each_text(${columnName})
                WHERE value ~* '(<script|javascript:|on(click|load|error|mouseover)\\s*=|<iframe|<object|<embed|<svg[^>]+on|<img[^>]+onerror)'
                GROUP BY key
            `;

        const xssResult = await adapter.executeQuery(xssSql);
        for (const row of (xssResult.rows ?? []) as {
          key: string;
          count: string | number;
        }[]) {
          issues.push({
            type: "xss_pattern",
            key: row.key,
            count: Number(row.count),
          });
        }

        return {
          scannedRows: actualRowsScanned,
          issues,
          riskLevel:
            issues.length === 0 ? "low" : issues.length < 3 ? "medium" : "high",
        };
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.includes("function jsonb_each") ||
            error.message.includes("cannot call jsonb_each"))
        ) {
          return {
            success: false,
            error: `pg_jsonb_security_scan requires JSONB objects. Column may contain arrays or non-JSONB data.`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_jsonb_security_scan",
          }),
        };
      }
    },
  };
}

/**
 * Get JSONB column statistics
 */
export function createJsonbStatsTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_jsonb_stats",
    description:
      "Get statistics about JSONB column usage. Note: topKeys only applies to object-type JSONB, not arrays.",
    group: "jsonb",
    inputSchema: JsonbStatsSchemaBase,
    outputSchema: JsonbStatsOutputSchema,
    annotations: readOnly("JSONB Stats"),
    icons: getToolIcons("jsonb", readOnly("JSONB Stats")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Parse with preprocess schema to resolve aliases (tableName→table, col→column, filter→where)
        const parsed = JsonbStatsSchema.parse(params);
        const table = parsed.table;
        const column = parsed.column;
        if (!table || !column) {
          return { success: false, error: "table and column are required" };
        }
        const sample = parsed.sampleSize ?? 1000;
        const whereClause = parsed.where
          ? ` WHERE ${sanitizeWhereClause(parsed.where)}`
          : "";

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

        const basicSql = `
                SELECT
                    COUNT(*) as total_rows,
                    COUNT(${columnName}) as non_null_count,
                    AVG(length(${columnName}::text))::int as avg_size_bytes,
                    MAX(length(${columnName}::text)) as max_size_bytes
                FROM (SELECT * FROM ${tableName}${whereClause} LIMIT ${String(sample)}) t
            `;

        const basicResult = await adapter.executeQuery(basicSql);
        const basics = basicResult.rows?.[0];
        const basicsNormalized = basics
          ? {
              total_rows: Number(basics["total_rows"]),
              non_null_count: Number(basics["non_null_count"]),
              avg_size_bytes: Number(basics["avg_size_bytes"]),
              max_size_bytes: Number(basics["max_size_bytes"]),
            }
          : undefined;

        const keyLimit = parsed.topKeysLimit ?? 20;
        const keySql = `
                SELECT key, COUNT(*) as frequency
                FROM (SELECT * FROM ${tableName}${whereClause} LIMIT ${String(sample)}) t,
                     jsonb_object_keys(${columnName}) key
                GROUP BY key
                ORDER BY frequency DESC
                LIMIT ${String(keyLimit)}
            `;

        let topKeys: { key: string; frequency: number }[] = [];
        try {
          const keyResult = await adapter.executeQuery(keySql);
          topKeys = (keyResult.rows ?? []).map(
            (row: Record<string, unknown>) => ({
              key: row["key"] as string,
              frequency: Number(row["frequency"]),
            }),
          );
        } catch (error) {
          // Gracefully handle array columns (jsonb_object_keys fails on arrays)
          if (
            error instanceof Error &&
            error.message.includes("cannot call jsonb_object_keys")
          ) {
            // Leave topKeys empty for array columns - this is valid
          } else {
            throw error; // Re-throw to be caught by outer catch
          }
        }

        const typeSql = `
                SELECT jsonb_typeof(${columnName}) as type, COUNT(*) as count
                FROM (SELECT * FROM ${tableName}${whereClause} LIMIT ${String(sample)}) t
                GROUP BY jsonb_typeof(${columnName})
            `;

        const typeResult = await adapter.executeQuery(typeSql);
        const typeDistribution = (typeResult.rows ?? []).map(
          (row: Record<string, unknown>) => ({
            type: row["type"] as string | null,
            count: Number(row["count"]),
          }),
        );

        const sqlNullCount =
          typeDistribution.find((t) => t.type === null)?.count ?? 0;
        const hasNullColumns = sqlNullCount > 0;
        const isArrayColumn = typeDistribution.some((t) => t.type === "array");

        let hint: string | undefined;
        if (hasNullColumns) {
          hint =
            "typeDistribution null type represents SQL NULL columns, not JSON null values";
        } else if (topKeys.length === 0 && isArrayColumn) {
          hint =
            'topKeys empty for array columns - use pg_jsonb_normalize mode: "array" to analyze elements';
        }

        return {
          basics: basicsNormalized,
          topKeys,
          typeDistribution,
          sqlNullCount,
          hint,
        };
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_jsonb_stats",
          }),
        };
      }
    },
  };
}
