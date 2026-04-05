/**
 * PostgreSQL Performance Tools - Index Analysis
 *
 * Unused indexes and duplicate indexes detection tools.
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
import {
  UnusedIndexesOutputSchema,
  DuplicateIndexesOutputSchema,
} from "../../schemas/index.js";
import {
  defaultToEmpty,
  toNum,
  coerceNumber,
  validatePerformanceTableExists,
} from "./helpers.js";

export function createUnusedIndexesTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  const UnusedIndexesSchemaBase = z.object({
    schema: z
      .string()
      .optional()
      .describe("Schema to filter (default: all user schemas)"),
    minSize: z
      .string()
      .optional()
      .describe('Minimum index size to include (e.g., "1 MB")'),
    limit: z
      .number()
      .optional()
      .describe("Max indexes to return (default: 20, use 0 for all)"),
    summary: z
      .boolean()
      .optional()
      .describe("Return aggregated summary instead of full list"),
  });

  const UnusedIndexesSchema = z.preprocess(
    defaultToEmpty,
    z.object({
      schema: z.string().optional(),
      minSize: z.string().optional(),
      limit: z.preprocess(coerceNumber, z.number().optional()),
      summary: z.boolean().optional(),
    }),
  );

  return {
    name: "pg_unused_indexes",
    description:
      "Find indexes that have never been used (idx_scan = 0). Candidates for removal.",
    group: "performance",
    inputSchema: UnusedIndexesSchemaBase,
    outputSchema: UnusedIndexesOutputSchema,
    annotations: readOnly("Unused Indexes"),
    icons: getToolIcons("performance", readOnly("Unused Indexes")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = UnusedIndexesSchema.parse(params);
        const rawLimit = parsed.limit;
        const limit =
          rawLimit === undefined ? 20 : rawLimit === 0 ? null : rawLimit;

        // P154: Validate schema existence before querying (throws ValidationError on failure)
        if (parsed.schema !== undefined) {
          await validatePerformanceTableExists(
            adapter,
            undefined,
            parsed.schema,
          );
        }

        let whereClause =
          "schemaname NOT IN ('pg_catalog', 'information_schema') AND idx_scan = 0";
        const queryParams: string[] = [];
        if (parsed.schema !== undefined) {
          queryParams.push(parsed.schema);
          whereClause += ` AND schemaname = $${String(queryParams.length)}`;
        }

        // Summary mode - return aggregated stats
        if (parsed.summary === true) {
          const summarySql = `SELECT schemaname,
                              COUNT(*) as unused_count,
                              pg_size_pretty(SUM(pg_relation_size(indexrelid))) as total_size,
                              SUM(pg_relation_size(indexrelid)) as total_size_bytes
                              FROM pg_stat_user_indexes
                              WHERE ${whereClause}
                              ${parsed.minSize !== undefined ? `AND pg_relation_size(indexrelid) >= pg_size_bytes('${parsed.minSize}')` : ""}
                              GROUP BY schemaname
                              ORDER BY SUM(pg_relation_size(indexrelid)) DESC`;
          const summaryResult = await adapter.executeQuery(
            summarySql,
            queryParams,
          );
          const bySchema = (summaryResult.rows ?? []).map(
            (row: Record<string, unknown>) => ({
              schema: row["schemaname"],
              unusedCount: toNum(row["unused_count"]),
              totalSize: row["total_size"],
              totalSizeBytes: toNum(row["total_size_bytes"]),
            }),
          );
          const totalCount = bySchema.reduce(
            (sum, s) => sum + (s.unusedCount ?? 0),
            0,
          );
          const totalBytes = bySchema.reduce(
            (sum, s) => sum + (s.totalSizeBytes ?? 0),
            0,
          );
          return {
            success: true as const,
            summary: true,
            bySchema,
            totalCount,
            totalSizeBytes: totalBytes,
            hint: "Use summary=false or omit to see individual indexes.",
          };
        }

        const sql = `SELECT schemaname, relname as table_name, indexrelname as index_name,
                        idx_scan as scans, idx_tup_read as tuples_read,
                        pg_size_pretty(pg_relation_size(indexrelid)) as size,
                        pg_relation_size(indexrelid) as size_bytes
                        FROM pg_stat_user_indexes
                        WHERE ${whereClause}
                        ${parsed.minSize !== undefined ? `AND pg_relation_size(indexrelid) >= pg_size_bytes('${parsed.minSize}')` : ""}
                        ORDER BY pg_relation_size(indexrelid) DESC
                        ${limit !== null ? `LIMIT ${String(limit)}` : ""}`;

        const result = await adapter.executeQuery(sql, queryParams);
        // Coerce numeric fields to JavaScript numbers
        const unusedIndexes = (result.rows ?? []).map(
          (row: Record<string, unknown>) => ({
            ...row,
            scans: toNum(row["scans"]),
            tuples_read: toNum(row["tuples_read"]),
            size_bytes: toNum(row["size_bytes"]),
          }),
        );

        const response: Record<string, unknown> = {
          success: true as const,
          unusedIndexes,
          count: unusedIndexes.length,
          hint: "These indexes have never been used. Consider removing them to save disk space and improve write performance.",
        };

        // Add totalCount if results were limited
        if (limit !== null && unusedIndexes.length === limit) {
          const countSql = `SELECT COUNT(*) as total FROM pg_stat_user_indexes WHERE ${whereClause}
                          ${parsed.minSize !== undefined ? `AND pg_relation_size(indexrelid) >= pg_size_bytes('${parsed.minSize}')` : ""}`;
          const countResult = await adapter.executeQuery(countSql, queryParams);
          response["totalCount"] = toNum(countResult.rows?.[0]?.["total"]);
          response["truncated"] = true;
        }
        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_unused_indexes" });
      }
    },
  };
}

export function createDuplicateIndexesTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  const DuplicateIndexesSchemaBase = z.object({
    schema: z
      .string()
      .optional()
      .describe("Schema to filter (default: all user schemas)"),
    limit: z
      .number()
      .optional()
      .describe("Max rows to return (default: 50, use 0 for all)"),
  });

  const DuplicateIndexesSchema = z.preprocess(
    defaultToEmpty,
    z.object({
      schema: z.string().optional(),
      limit: z.preprocess(coerceNumber, z.number().optional()),
    }),
  );

  return {
    name: "pg_duplicate_indexes",
    description:
      "Find duplicate or overlapping indexes (same leading columns). Candidates for consolidation.",
    group: "performance",
    inputSchema: DuplicateIndexesSchemaBase,
    outputSchema: DuplicateIndexesOutputSchema,
    annotations: readOnly("Duplicate Indexes"),
    icons: getToolIcons("performance", readOnly("Duplicate Indexes")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = DuplicateIndexesSchema.parse(params);
        const rawLimit = parsed.limit;
        const limit =
          rawLimit === undefined ? 50 : rawLimit === 0 ? null : rawLimit;

        // P154: Validate schema existence before querying (throws ValidationError on failure)
        if (parsed.schema !== undefined) {
          await validatePerformanceTableExists(
            adapter,
            undefined,
            parsed.schema,
          );
        }

        const queryParams: string[] = [];
        const schemaFilter =
          parsed.schema !== undefined
            ? (queryParams.push(parsed.schema),
              `AND n.nspname = $${String(queryParams.length)}`)
            : "AND n.nspname NOT IN ('pg_catalog', 'information_schema')";

        // Find indexes with the same leading column(s) on the same table
        const sql = `WITH index_cols AS (
                SELECT
                    n.nspname as schemaname,
                    t.relname as tablename,
                    i.relname as indexname,
                    array_agg(a.attname ORDER BY k.n) as columns,
                    pg_relation_size(i.oid) as size_bytes,
                    pg_size_pretty(pg_relation_size(i.oid)) as size
                FROM pg_class t
                JOIN pg_namespace n ON t.relnamespace = n.oid
                JOIN pg_index idx ON t.oid = idx.indrelid
                JOIN pg_class i ON idx.indexrelid = i.oid
                CROSS JOIN LATERAL unnest(idx.indkey) WITH ORDINALITY AS k(attnum, n)
                JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
                WHERE t.relkind = 'r' ${schemaFilter}
                GROUP BY n.nspname, t.relname, i.relname, i.oid
            )
            SELECT
                a.schemaname, a.tablename,
                a.indexname as index1, a.columns as index1_columns, a.size as index1_size,
                b.indexname as index2, b.columns as index2_columns, b.size as index2_size,
                CASE
                    WHEN a.columns = b.columns THEN 'EXACT_DUPLICATE'
                    WHEN a.columns[1:array_length(b.columns, 1)] = b.columns THEN 'OVERLAPPING'
                    ELSE 'SUBSET'
                END as duplicate_type
            FROM index_cols a
            JOIN index_cols b ON a.schemaname = b.schemaname
                AND a.tablename = b.tablename
                AND a.indexname < b.indexname
                AND (a.columns = b.columns
                    OR a.columns[1:array_length(b.columns, 1)] = b.columns
                    OR b.columns[1:array_length(a.columns, 1)] = a.columns)
            ORDER BY a.schemaname, a.tablename, a.size_bytes DESC
            ${limit !== null ? `LIMIT ${String(limit)}` : ""}`;

        const result = await adapter.executeQuery(sql, queryParams);
        const duplicates = result.rows ?? [];

        const response: Record<string, unknown> = {
          success: true as const,
          duplicateIndexes: duplicates,
          count: duplicates.length,
          hint: "EXACT_DUPLICATE: Remove one. OVERLAPPING/SUBSET: Smaller index may be redundant.",
        };

        // Add totalCount if results were limited
        if (limit !== null && duplicates.length === limit) {
          const countSql = `WITH index_cols AS (
                  SELECT
                      n.nspname as schemaname,
                      t.relname as tablename,
                      i.relname as indexname,
                      array_agg(a.attname ORDER BY k.n) as columns,
                      pg_relation_size(i.oid) as size_bytes
                  FROM pg_class t
                  JOIN pg_namespace n ON t.relnamespace = n.oid
                  JOIN pg_index idx ON t.oid = idx.indrelid
                  JOIN pg_class i ON idx.indexrelid = i.oid
                  CROSS JOIN LATERAL unnest(idx.indkey) WITH ORDINALITY AS k(attnum, n)
                  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
                  WHERE t.relkind = 'r' ${schemaFilter}
                  GROUP BY n.nspname, t.relname, i.relname, i.oid
              )
              SELECT COUNT(*) as total
              FROM index_cols a
              JOIN index_cols b ON a.schemaname = b.schemaname
                  AND a.tablename = b.tablename
                  AND a.indexname < b.indexname
                  AND (a.columns = b.columns
                      OR a.columns[1:array_length(b.columns, 1)] = b.columns
                      OR b.columns[1:array_length(a.columns, 1)] = a.columns)`;
          const countResult = await adapter.executeQuery(countSql, queryParams);
          response["totalCount"] = toNum(countResult.rows?.[0]?.["total"]);
          response["truncated"] = true;
        }
        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
          tool: "pg_duplicate_indexes",
        });
      }
    },
  };
}
