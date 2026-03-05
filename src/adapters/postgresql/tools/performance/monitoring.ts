/**
 * PostgreSQL Performance Tools - Monitoring
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
  LocksOutputSchema,
  BloatCheckOutputSchema,
  CacheHitRatioOutputSchema,
} from "../../schemas/index.js";

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
  if (!table && !schema) return null;

  if (schema) {
    const schemaResult = await adapter.executeQuery(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
      [schema],
    );
    if (!schemaResult.rows || schemaResult.rows.length === 0) {
      return `Schema '${schema}' does not exist. Use pg_list_objects with type 'table' to see available schemas.`;
    }
  }

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

export function createLocksTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_locks",
    description: "View current lock information.",
    group: "performance",
    inputSchema: z.object({
      showBlocked: z.boolean().optional(),
    }),
    outputSchema: LocksOutputSchema,
    annotations: readOnly("Lock Information"),
    icons: getToolIcons("performance", readOnly("Lock Information")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = (params ?? {}) as { showBlocked?: boolean };

        let sql: string;
        if (parsed.showBlocked) {
          sql = `SELECT blocked.pid as blocked_pid, blocked.query as blocked_query,
                        blocking.pid as blocking_pid, blocking.query as blocking_query
                        FROM pg_stat_activity blocked
                        JOIN pg_locks bl ON blocked.pid = bl.pid
                        JOIN pg_locks lk ON bl.locktype = lk.locktype
                            AND bl.relation = lk.relation
                            AND bl.pid != lk.pid
                        JOIN pg_stat_activity blocking ON lk.pid = blocking.pid
                        WHERE NOT bl.granted`;
        } else {
          sql = `SELECT l.locktype, l.relation::regclass, l.mode, l.granted,
                        a.pid, a.usename, a.query, a.state
                        FROM pg_locks l
                        JOIN pg_stat_activity a ON l.pid = a.pid
                        WHERE l.pid != pg_backend_pid()
                        ORDER BY l.granted, l.pid`;
        }

        const result = await adapter.executeQuery(sql);
        return { locks: result.rows };
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_locks" }),
        };
      }
    },
  };
}

export function createBloatCheckTool(adapter: PostgresAdapter): ToolDefinition {
  const BloatCheckSchemaBase = z.object({
    table: z
      .string()
      .optional()
      .describe("Table name to check (all tables if omitted)"),
    schema: z.string().optional().describe("Schema name to filter"),
  });

  const BloatCheckSchema = z.preprocess(
    (val) => val ?? {},
    BloatCheckSchemaBase,
  );

  return {
    name: "pg_bloat_check",
    description:
      "Check for table and index bloat. Returns tables with dead tuples.",
    group: "performance",
    inputSchema: BloatCheckSchemaBase,
    outputSchema: BloatCheckOutputSchema,
    annotations: readOnly("Bloat Check"),
    icons: getToolIcons("performance", readOnly("Bloat Check")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = BloatCheckSchema.parse(params);
        // Parse schema from table if it contains a dot (e.g., 'myschema.orders')
        let tableName = parsed.table;
        let schemaName = parsed.schema;
        if (tableName?.includes(".")) {
          const parts = tableName.split(".");
          schemaName = schemaName ?? parts[0];
          tableName = parts[1] ?? tableName;
        }
        let whereClause = "n_dead_tup > 0";
        const queryParams: string[] = [];
        if (schemaName !== undefined) {
          queryParams.push(schemaName);
          whereClause += ` AND schemaname = $${String(queryParams.length)}`;
        }
        if (tableName !== undefined) {
          queryParams.push(tableName);
          whereClause += ` AND relname = $${String(queryParams.length)}`;
        }

        // P154: Validate table/schema existence before querying
        const validationError = await validatePerformanceTableExists(
          adapter,
          tableName,
          schemaName,
        );
        if (validationError !== null) {
          return { success: false, error: validationError };
        }

        const sql = `SELECT schemaname, relname as table_name,
                        n_live_tup as live_tuples, n_dead_tup as dead_tuples,
                        CASE WHEN n_live_tup > 0 THEN round((100.0 * n_dead_tup / n_live_tup)::numeric, 2) ELSE 0 END as dead_pct,
                        pg_size_pretty(pg_table_size(relid)) as table_size
                        FROM pg_stat_user_tables
                        WHERE ${whereClause}
                        ORDER BY n_dead_tup DESC
                        LIMIT 20`;

        const result = await adapter.executeQuery(sql, queryParams);
        // Coerce numeric fields to JavaScript numbers
        const tables = (result.rows ?? []).map(
          (row: Record<string, unknown>) => ({
            ...row,
            live_tuples: toNum(row["live_tuples"]),
            dead_tuples: toNum(row["dead_tuples"]),
            dead_pct: toNum(row["dead_pct"]),
          }),
        );
        return {
          tables,
          count: tables.length,
        };
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_bloat_check" }),
        };
      }
    },
  };
}

export function createCacheHitRatioTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_cache_hit_ratio",
    description: "Get buffer cache hit ratio statistics.",
    group: "performance",
    inputSchema: z.object({}),
    outputSchema: CacheHitRatioOutputSchema,
    annotations: readOnly("Cache Hit Ratio"),
    icons: getToolIcons("performance", readOnly("Cache Hit Ratio")),
    handler: async (_params: unknown, _context: RequestContext) => {
      try {
        const sql = `SELECT
                        sum(heap_blks_read) as heap_read,
                        sum(heap_blks_hit) as heap_hit,
                        CASE WHEN sum(heap_blks_read) + sum(heap_blks_hit) > 0
                            THEN round(100.0 * sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)), 2)
                            ELSE 100 END as cache_hit_ratio
                        FROM pg_statio_user_tables`;

        const result = await adapter.executeQuery(sql);
        const row = result.rows?.[0];
        // Always return an object with nullable fields (never return null)
        return {
          heap_read: row ? toNum(row["heap_read"]) : null,
          heap_hit: row ? toNum(row["heap_hit"]) : null,
          cache_hit_ratio: row ? toNum(row["cache_hit_ratio"]) : null,
        };
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_cache_hit_ratio" }),
        };
      }
    },
  };
}
