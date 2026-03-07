/**
 * PostgreSQL Performance Tools - Statistics
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
import {
  IndexStatsOutputSchema,
  TableStatsOutputSchema,
  StatStatementsOutputSchema,
  StatActivityOutputSchema,
  UnusedIndexesOutputSchema,
  DuplicateIndexesOutputSchema,
  VacuumStatsOutputSchema,
  QueryPlanStatsOutputSchema,
} from "../../schemas/index.js";

// Helper to handle undefined params (allows tools to be called without {})
const defaultToEmpty = (val: unknown): unknown => val ?? {};

// Helper to coerce string numbers to JavaScript numbers (PostgreSQL returns BIGINT as strings)
const toNum = (val: unknown): number | null =>
  val === null || val === undefined ? null : Number(val);

/**
 * P154: Validate that a table exists before executing performance queries.
 * When a specific table/schema is provided, checks existence first to return
 * a structured error instead of silently returning empty results.
 */
async function validatePerformanceTableExists(
  adapter: PostgresAdapter,
  table?: string,
  schema?: string,
): Promise<string | null> {
  // Only validate when a specific table or schema is requested
  if (!table && !schema) return null;

  // Check schema existence first for granular error messages
  if (schema) {
    const schemaResult = await adapter.executeQuery(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
      [schema],
    );
    if (!schemaResult.rows || schemaResult.rows.length === 0) {
      return `Schema '${schema}' does not exist. Use pg_list_objects with type 'table' to see available schemas.`;
    }
  }

  // Check table existence within the schema
  if (table) {
    const targetSchema = schema ?? "public";
    const tableResult = await adapter.executeQuery(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
      [targetSchema, table],
    );
    if (!tableResult.rows || tableResult.rows.length === 0) {
      return `Table '${targetSchema}.${table}' not found. Use pg_list_tables to see available tables.`;
    }
  }

  return null;
}

export function createIndexStatsTool(adapter: PostgresAdapter): ToolDefinition {
  // Define schema locally with limit parameter
  const IndexStatsSchemaLocalBase = z.object({
    table: z.string().optional().describe("Table name to filter indexes"),
    schema: z.string().optional().describe("Schema name to filter indexes"),
    limit: z.coerce
      .number()
      .optional()
      .describe("Max rows to return (default: 50, use 0 for all)"),
  });

  const IndexStatsSchemaLocal = z.preprocess(
    defaultToEmpty,
    IndexStatsSchemaLocalBase,
  );

  return {
    name: "pg_index_stats",
    description: "Get index usage statistics.",
    group: "performance",
    inputSchema: IndexStatsSchemaLocalBase,
    outputSchema: IndexStatsOutputSchema,
    annotations: readOnly("Index Stats"),
    icons: getToolIcons("performance", readOnly("Index Stats")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = IndexStatsSchemaLocal.parse(params);
        let { table, schema } = parsed;
        // Parse schema from table if it contains a dot (e.g., 'myschema.orders')
        if (table?.includes(".")) {
          const parts = table.split(".");
          schema = schema ?? parts[0];
          table = parts[1] ?? table;
        }
        const limit = parsed.limit === 0 ? null : (parsed.limit ?? 50);

        // P154: Validate table/schema existence before querying
        const validationError = await validatePerformanceTableExists(
          adapter,
          table,
          schema,
        );
        if (validationError !== null) {
          return { success: false, error: validationError };
        }

        let whereClause =
          "schemaname NOT IN ('pg_catalog', 'information_schema')";
        const queryParams: string[] = [];
        if (schema) {
          queryParams.push(schema);
          whereClause += ` AND schemaname = $${String(queryParams.length)}`;
        }
        if (table) {
          queryParams.push(table);
          whereClause += ` AND relname = $${String(queryParams.length)}`;
        }

        const sql = `SELECT schemaname, relname as table_name, indexrelname as index_name,
                        idx_scan as scans, idx_tup_read as tuples_read, idx_tup_fetch as tuples_fetched,
                        pg_size_pretty(pg_relation_size(indexrelid)) as size
                        FROM pg_stat_user_indexes
                        WHERE ${whereClause}
                        ORDER BY idx_scan DESC
                        ${limit !== null ? `LIMIT ${String(limit)}` : ""}`;

        const result = await adapter.executeQuery(sql, queryParams);
        // Coerce numeric fields to JavaScript numbers
        const indexes = (result.rows ?? []).map(
          (row: Record<string, unknown>) => ({
            ...row,
            scans: toNum(row["scans"]),
            tuples_read: toNum(row["tuples_read"]),
            tuples_fetched: toNum(row["tuples_fetched"]),
          }),
        );

        const response: Record<string, unknown> = {
          indexes,
          count: indexes.length,
        };

        // Add totalCount if results were limited
        if (limit !== null && indexes.length === limit) {
          const countSql = `SELECT COUNT(*) as total FROM pg_stat_user_indexes WHERE ${whereClause}`;
          const countResult = await adapter.executeQuery(countSql, queryParams);
          response["totalCount"] = toNum(countResult.rows?.[0]?.["total"]);
          response["truncated"] = true;
        } else {
          response["truncated"] = false;
          response["totalCount"] = indexes.length;
        }
        return response;
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_index_stats" }),
        };
      }
    },
  };
}

export function createTableStatsTool(adapter: PostgresAdapter): ToolDefinition {
  const TableStatsSchemaLocalBase = z.object({
    table: z.string().optional().describe("Table name (all tables if omitted)"),
    schema: z.string().optional().describe("Schema name"),
    limit: z.coerce
      .number()
      .optional()
      .describe("Max rows to return (default: 50, use 0 for all)"),
  });

  const TableStatsSchemaLocal = z.preprocess(
    defaultToEmpty,
    TableStatsSchemaLocalBase,
  );

  return {
    name: "pg_table_stats",
    description: "Get table access statistics.",
    group: "performance",
    inputSchema: TableStatsSchemaLocalBase,
    outputSchema: TableStatsOutputSchema,
    annotations: readOnly("Table Stats"),
    icons: getToolIcons("performance", readOnly("Table Stats")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = TableStatsSchemaLocal.parse(params);
        let { table, schema } = parsed;
        // Parse schema from table if it contains a dot (e.g., 'myschema.orders')
        if (table?.includes(".")) {
          const parts = table.split(".");
          schema = schema ?? parts[0];
          table = parts[1] ?? table;
        }
        const limit = parsed.limit === 0 ? null : (parsed.limit ?? 50);

        // P154: Validate table/schema existence before querying
        const validationError = await validatePerformanceTableExists(
          adapter,
          table,
          schema,
        );
        if (validationError !== null) {
          return { success: false, error: validationError };
        }

        let whereClause =
          "schemaname NOT IN ('pg_catalog', 'information_schema')";
        const queryParams: string[] = [];
        if (schema) {
          queryParams.push(schema);
          whereClause += ` AND schemaname = $${String(queryParams.length)}`;
        }
        if (table) {
          queryParams.push(table);
          whereClause += ` AND relname = $${String(queryParams.length)}`;
        }

        const sql = `SELECT schemaname, relname as table_name,
                        seq_scan, seq_tup_read, idx_scan, idx_tup_fetch,
                        n_tup_ins as inserts, n_tup_upd as updates, n_tup_del as deletes,
                        n_live_tup as live_tuples, n_dead_tup as dead_tuples,
                        last_vacuum, last_autovacuum, last_analyze, last_autoanalyze
                        FROM pg_stat_user_tables
                        WHERE ${whereClause}
                        ORDER BY seq_scan DESC
                        ${limit !== null ? `LIMIT ${String(limit)}` : ""}`;

        const result = await adapter.executeQuery(sql, queryParams);
        // Coerce numeric fields to JavaScript numbers
        const tables = (result.rows ?? []).map(
          (row: Record<string, unknown>) => ({
            ...row,
            seq_scan: toNum(row["seq_scan"]),
            seq_tup_read: toNum(row["seq_tup_read"]),
            idx_scan: toNum(row["idx_scan"]),
            idx_tup_fetch: toNum(row["idx_tup_fetch"]),
            inserts: toNum(row["inserts"]),
            updates: toNum(row["updates"]),
            deletes: toNum(row["deletes"]),
            live_tuples: toNum(row["live_tuples"]),
            dead_tuples: toNum(row["dead_tuples"]),
          }),
        );

        // Get total count if limited
        const response: Record<string, unknown> = {
          tables,
          count: tables.length,
        };
        if (limit !== null && tables.length === limit) {
          const countSql = `SELECT COUNT(*) as total FROM pg_stat_user_tables WHERE ${whereClause}`;
          const countResult = await adapter.executeQuery(countSql, queryParams);
          response["totalCount"] = toNum(countResult.rows?.[0]?.["total"]);
          response["truncated"] = true;
        } else {
          response["truncated"] = false;
          response["totalCount"] = tables.length;
        }
        return response;
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_table_stats" }),
        };
      }
    },
  };
}

export function createStatStatementsTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  const StatStatementsSchemaBase = z.object({
    limit: z.coerce
      .number()
      .optional()
      .describe("Max statements to return (default: 20, use 0 for all)"),
    orderBy: z
      .enum(["total_time", "calls", "mean_time", "rows"])
      .optional()
      .describe("Sort order (default: total_time)"),
  });

  const StatStatementsSchema = z.preprocess(
    defaultToEmpty,
    StatStatementsSchemaBase,
  );

  return {
    name: "pg_stat_statements",
    description:
      "Get query statistics from pg_stat_statements (requires extension).",
    group: "performance",
    inputSchema: StatStatementsSchemaBase,
    outputSchema: StatStatementsOutputSchema,
    annotations: readOnly("Query Statistics"),
    icons: getToolIcons("performance", readOnly("Query Statistics")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = StatStatementsSchema.parse(params);
        const limit = parsed.limit === 0 ? null : (parsed.limit ?? 20);
        const orderBy = parsed.orderBy ?? "total_time";

        const sql = `SELECT query, calls, total_exec_time as total_time,
                        mean_exec_time as mean_time, rows,
                        shared_blks_hit, shared_blks_read
                        FROM pg_stat_statements
                        ORDER BY ${orderBy === "total_time" ? "total_exec_time" : orderBy} DESC
                        ${limit !== null ? `LIMIT ${String(limit)}` : ""}`;

        const result = await adapter.executeQuery(sql);
        // Coerce numeric fields to JavaScript numbers
        const statements = (result.rows ?? []).map(
          (row: Record<string, unknown>) => ({
            ...row,
            calls: toNum(row["calls"]),
            rows: toNum(row["rows"]),
            shared_blks_hit: toNum(row["shared_blks_hit"]),
            shared_blks_read: toNum(row["shared_blks_read"]),
          }),
        );

        const response: Record<string, unknown> = {
          statements,
          count: statements.length,
        };

        // Add totalCount if results were limited
        if (limit !== null && statements.length === limit) {
          const countSql = `SELECT COUNT(*) as total FROM pg_stat_statements`;
          const countResult = await adapter.executeQuery(countSql);
          response["totalCount"] = toNum(countResult.rows?.[0]?.["total"]);
          response["truncated"] = true;
        }
        return response;
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_stat_statements" }),
        };
      }
    },
  };
}

export function createStatActivityTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  const StatActivitySchemaBase = z.object({
    includeIdle: z.boolean().optional(),
  });

  const StatActivitySchema = z.preprocess(
    defaultToEmpty,
    StatActivitySchemaBase,
  );

  return {
    name: "pg_stat_activity",
    description: "Get currently running queries and connections.",
    group: "performance",
    inputSchema: StatActivitySchemaBase,
    outputSchema: StatActivityOutputSchema,
    annotations: readOnly("Activity Stats"),
    icons: getToolIcons("performance", readOnly("Activity Stats")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = StatActivitySchema.parse(params);
        const idleClause =
          parsed.includeIdle === true ? "" : "AND state != 'idle'";

        const sql = `SELECT pid, usename, datname, client_addr, state,
                        query_start, state_change,
                        now() - query_start as duration,
                        query
                        FROM pg_stat_activity
                        WHERE pid != pg_backend_pid()
                          AND backend_type = 'client backend'
                          ${idleClause}
                        ORDER BY query_start`;

        const result = await adapter.executeQuery(sql);

        // Count background workers for metadata
        const bgResult = await adapter.executeQuery(
          `SELECT COUNT(*)::int as count FROM pg_stat_activity
         WHERE pid != pg_backend_pid() AND backend_type != 'client backend'`,
        );
        const bgCount = (bgResult.rows?.[0]?.["count"] as number) ?? 0;

        return {
          connections: result.rows,
          count: result.rows?.length ?? 0,
          backgroundWorkers: bgCount,
        };
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_stat_activity" }),
        };
      }
    },
  };
}

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
    limit: z.coerce
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
    UnusedIndexesSchemaBase,
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
        const limit = parsed.limit === 0 ? null : (parsed.limit ?? 20);

        // P154: Validate schema existence before querying
        if (parsed.schema !== undefined) {
          const validationError = await validatePerformanceTableExists(
            adapter,
            undefined,
            parsed.schema,
          );
          if (validationError !== null) {
            return { success: false, error: validationError };
          }
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
        return {
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_unused_indexes" }),
        };
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
    limit: z.coerce
      .number()
      .optional()
      .describe("Max rows to return (default: 50, use 0 for all)"),
  });

  const DuplicateIndexesSchema = z.preprocess(
    defaultToEmpty,
    DuplicateIndexesSchemaBase,
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
        const limit = parsed.limit === 0 ? null : (parsed.limit ?? 50);

        // P154: Validate schema existence before querying
        if (parsed.schema !== undefined) {
          const validationError = await validatePerformanceTableExists(
            adapter,
            undefined,
            parsed.schema,
          );
          if (validationError !== null) {
            return { success: false, error: validationError };
          }
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
        return {
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_duplicate_indexes" }),
        };
      }
    },
  };
}

export function createVacuumStatsTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  const VacuumStatsSchemaBase = z.object({
    schema: z.string().optional().describe("Schema to filter"),
    table: z.string().optional().describe("Table name to filter"),
    limit: z.coerce
      .number()
      .optional()
      .describe("Max rows to return (default: 50, use 0 for all)"),
  });

  const VacuumStatsSchema = z.preprocess(defaultToEmpty, VacuumStatsSchemaBase);

  return {
    name: "pg_vacuum_stats",
    description:
      "Get detailed vacuum statistics including dead tuples, last vacuum times, and wraparound risk.",
    group: "performance",
    inputSchema: VacuumStatsSchemaBase,
    outputSchema: VacuumStatsOutputSchema,
    annotations: readOnly("Vacuum Stats"),
    icons: getToolIcons("performance", readOnly("Vacuum Stats")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = VacuumStatsSchema.parse(params);
        let table = parsed.table;
        let schema = parsed.schema;
        // Parse schema from table if it contains a dot (e.g., 'myschema.orders')
        if (table?.includes(".")) {
          const parts = table.split(".");
          schema = schema ?? parts[0];
          table = parts[1] ?? table;
        }
        const limit = parsed.limit === 0 ? null : (parsed.limit ?? 50);
        let whereClause =
          "schemaname NOT IN ('pg_catalog', 'information_schema')";
        const queryParams: string[] = [];
        if (schema !== undefined) {
          queryParams.push(schema);
          whereClause += ` AND schemaname = $${String(queryParams.length)}`;
        }
        if (table !== undefined) {
          queryParams.push(table);
          whereClause += ` AND relname = $${String(queryParams.length)}`;
        }

        // P154: Validate table/schema existence before querying
        const validationError = await validatePerformanceTableExists(
          adapter,
          table,
          schema,
        );
        if (validationError !== null) {
          return { success: false, error: validationError };
        }

        const sql = `SELECT
                s.schemaname, s.relname as table_name,
                s.n_live_tup as live_tuples, s.n_dead_tup as dead_tuples,
                CASE WHEN s.n_live_tup > 0 THEN round((100.0 * s.n_dead_tup / s.n_live_tup)::numeric, 2) ELSE 0 END as dead_pct,
                s.last_vacuum, s.last_autovacuum,
                s.vacuum_count, s.autovacuum_count,
                s.last_analyze, s.last_autoanalyze,
                s.analyze_count, s.autoanalyze_count,
                age(c.relfrozenxid) as xid_age,
                CASE
                    WHEN age(c.relfrozenxid) > 1000000000 THEN 'CRITICAL'
                    WHEN age(c.relfrozenxid) > 500000000 THEN 'WARNING'
                    ELSE 'OK'
                END as wraparound_risk
                FROM pg_stat_user_tables s
                JOIN pg_class c ON c.relname = s.relname
                    AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = s.schemaname)
                WHERE ${whereClause.replace(/schemaname/g, "s.schemaname").replace(/relname/g, "s.relname")}
                ORDER BY s.n_dead_tup DESC
                ${limit !== null ? `LIMIT ${String(limit)}` : ""}`;

        const result = await adapter.executeQuery(sql, queryParams);
        // Coerce numeric fields to JavaScript numbers
        const tables = (result.rows ?? []).map(
          (row: Record<string, unknown>) => ({
            ...row,
            live_tuples: toNum(row["live_tuples"]),
            dead_tuples: toNum(row["dead_tuples"]),
            dead_pct: toNum(row["dead_pct"]),
            vacuum_count: toNum(row["vacuum_count"]),
            autovacuum_count: toNum(row["autovacuum_count"]),
            analyze_count: toNum(row["analyze_count"]),
            autoanalyze_count: toNum(row["autoanalyze_count"]),
          }),
        );

        const response: Record<string, unknown> = {
          tables,
          count: tables.length,
        };

        // Add totalCount if results were limited
        if (limit !== null && tables.length === limit) {
          const countSql = `SELECT COUNT(*) as total FROM pg_stat_user_tables WHERE ${whereClause}`;
          const countResult = await adapter.executeQuery(countSql, queryParams);
          response["totalCount"] = toNum(countResult.rows?.[0]?.["total"]);
          response["truncated"] = true;
        } else {
          response["truncated"] = false;
          response["totalCount"] = tables.length;
        }
        return response;
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_vacuum_stats" }),
        };
      }
    },
  };
}

export function createQueryPlanStatsTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  const QueryPlanStatsSchemaBase = z.object({
    limit: z.coerce
      .number()
      .optional()
      .describe("Number of queries to return (default: 20, use 0 for all)"),
    truncateQuery: z.coerce
      .number()
      .optional()
      .describe(
        "Max query length in chars (default: 100, use 0 for full text)",
      ),
  });

  const QueryPlanStatsSchema = z.preprocess(
    defaultToEmpty,
    QueryPlanStatsSchemaBase,
  );

  return {
    name: "pg_query_plan_stats",
    description:
      "Get query plan statistics showing planning time vs execution time (requires pg_stat_statements).",
    group: "performance",
    inputSchema: QueryPlanStatsSchemaBase,
    outputSchema: QueryPlanStatsOutputSchema,
    annotations: readOnly("Query Plan Stats"),
    icons: getToolIcons("performance", readOnly("Query Plan Stats")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = QueryPlanStatsSchema.parse(params);
        const limit = parsed.limit === 0 ? null : (parsed.limit ?? 20);
        const truncateLen =
          parsed.truncateQuery === 0 ? null : (parsed.truncateQuery ?? 100);

        // Check if pg_stat_statements is available with planning time columns
        const sql = `SELECT
                query,
                calls,
                total_plan_time,
                mean_plan_time,
                total_exec_time,
                mean_exec_time,
                rows,
                CASE
                    WHEN total_plan_time + total_exec_time > 0
                    THEN round((100.0 * total_plan_time / (total_plan_time + total_exec_time))::numeric, 2)
                    ELSE 0
                END as plan_pct,
                shared_blks_hit,
                shared_blks_read,
                CASE
                    WHEN shared_blks_hit + shared_blks_read > 0
                    THEN round((100.0 * shared_blks_hit / (shared_blks_hit + shared_blks_read))::numeric, 2)
                    ELSE 100
                END as cache_hit_pct
                FROM pg_stat_statements
                ORDER BY total_plan_time + total_exec_time DESC
                ${limit !== null ? `LIMIT ${String(limit)}` : ""}`;

        const result = await adapter.executeQuery(sql);
        // Coerce numeric fields to JavaScript numbers and optionally truncate query
        const queryPlanStats = (result.rows ?? []).map(
          (row: Record<string, unknown>) => {
            const queryVal = row["query"];
            const query = typeof queryVal === "string" ? queryVal : "";
            const truncatedQuery =
              truncateLen !== null && query.length > truncateLen
                ? query.substring(0, truncateLen) + "..."
                : query;
            return {
              query: truncatedQuery,
              queryTruncated:
                truncateLen !== null && query.length > truncateLen,
              calls: toNum(row["calls"]),
              total_plan_time: row["total_plan_time"],
              mean_plan_time: row["mean_plan_time"],
              total_exec_time: row["total_exec_time"],
              mean_exec_time: row["mean_exec_time"],
              rows: toNum(row["rows"]),
              plan_pct: toNum(row["plan_pct"]),
              cache_hit_pct: toNum(row["cache_hit_pct"]),
              shared_blks_hit: toNum(row["shared_blks_hit"]),
              shared_blks_read: toNum(row["shared_blks_read"]),
            };
          },
        );
        const response: Record<string, unknown> = {
          queryPlanStats,
          count: queryPlanStats.length,
          hint: "High plan_pct indicates queries spending significant time in planning. Consider prepared statements.",
        };

        // Add totalCount if results were limited
        if (limit !== null && queryPlanStats.length === limit) {
          const countSql = `SELECT COUNT(*) as total FROM pg_stat_statements`;
          const countResult = await adapter.executeQuery(countSql);
          response["totalCount"] = toNum(countResult.rows?.[0]?.["total"]);
          response["truncated"] = true;
        }
        return response;
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_query_plan_stats" }),
        };
      }
    },
  };
}
