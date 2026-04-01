/**
 * PostgreSQL JSONB Tools - Analytics Operations
 *
 * JSONB analytics tools: index suggestions, security scanning, and statistics.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import {
  sanitizeIdentifier,
  sanitizeTableName,
} from "../../../../utils/identifiers.js";
import {
  JsonbIndexSuggestOutputSchema,
  JsonbSecurityScanOutputSchema,
  JsonbStatsOutputSchema,
  JsonbStatsSchemaBase,
  JsonbIndexSuggestSchemaBase,
  JsonbSecurityScanSchemaBase,
  JsonbStatsSchema,
  JsonbIndexSuggestSchema,
  JsonbSecurityScanSchema,
} from "../../schemas/index.js";

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
        const rawSample = Number(parsed.sampleSize);
        const sample = isNaN(rawSample) ? 1000 : rawSample;
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
          keyDistribution?: typeof keys;
          existingIndexes?: unknown;
          recommendations?: string[];
          hint?: string;
        } = {};
        if (keys.length > 0) response.keyDistribution = keys;
        if ((indexResult.rows?.length ?? 0) > 0) {
          response.existingIndexes = indexResult.rows;
        }
        if (recommendations.length > 0) {
          response.recommendations = recommendations;
        }

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
      } catch (error: unknown) {
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
        return formatHandlerErrorResponse(error, {
            tool: "pg_jsonb_index_suggest",
          });
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
        const rawSample = Number(parsed.sampleSize);
        const sample = isNaN(rawSample) ? 100 : rawSample;
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

        const response: {
          scannedRows: number;
          issues?: { type: string; key: string; count: number }[];
          riskLevel: string;
        } = {
          scannedRows: actualRowsScanned,
          riskLevel:
            issues.length === 0 ? "low" : issues.length < 3 ? "medium" : "high",
        };
        if (issues.length > 0) response.issues = issues;
        return response;
      } catch (error: unknown) {
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
        return formatHandlerErrorResponse(error, {
            tool: "pg_jsonb_security_scan",
          });
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
        const rawSample = Number(parsed.sampleSize);
        const sample = isNaN(rawSample) ? 1000 : rawSample;
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

        const rawKeyLimit = Number(parsed.topKeysLimit);
        const keyLimit = isNaN(rawKeyLimit) ? 20 : rawKeyLimit;
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
        } catch (error: unknown) {
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

        const response: {
          basics?: typeof basicsNormalized;
          topKeys?: typeof topKeys;
          typeDistribution?: typeof typeDistribution;
          sqlNullCount: number;
          hint?: string;
        } = {
          sqlNullCount,
        };
        if (basicsNormalized) response.basics = basicsNormalized;
        if (topKeys.length > 0) response.topKeys = topKeys;
        if (typeDistribution.length > 0) response.typeDistribution = typeDistribution;
        if (hint) response.hint = hint;

        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_jsonb_stats",
          });
      }
    },
  };
}
