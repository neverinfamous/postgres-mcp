/**
 * PostgreSQL Performance Tools - Monitoring
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
  LocksOutputSchema,
  BloatCheckOutputSchema,
  CacheHitRatioOutputSchema,
} from "../../schemas/index.js";
import {
  defaultToEmpty,
  toNum,
  coerceNumber,
  validatePerformanceTableExists,
} from "./helpers.js";

// ─── pg_locks ────────────────────────────────────────────────────────────────

const LocksSchemaBase = z.object({
  showBlocked: z.boolean().optional().describe("Show only blocked queries (default: false)"),
  limit: z.preprocess(
    coerceNumber,
    z.number().optional(),
  ).describe("Max locks to return (default: 100, use 0 for all)"),
});

const LocksSchema = z.preprocess(defaultToEmpty, LocksSchemaBase);

export function createLocksTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_locks",
    description: "View current lock information.",
    group: "performance",
    inputSchema: LocksSchemaBase,
    outputSchema: LocksOutputSchema,
    annotations: readOnly("Lock Information"),
    icons: getToolIcons("performance", readOnly("Lock Information")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = LocksSchema.parse(params);

        const showBlocked = parsed.showBlocked === true;
        const rawLimit = parsed.limit;
        const userLimit = rawLimit === undefined ? 100 : rawLimit === 0 ? null : rawLimit;
        const limit = userLimit === null ? 100 : Math.min(userLimit, 100);

        let sql: string;
        if (showBlocked) {
          sql = `SELECT blocked.pid as blocked_pid, blocked.query as blocked_query,
                        blocking.pid as blocking_pid, blocking.query as blocking_query
                        FROM pg_stat_activity blocked
                        JOIN pg_locks bl ON blocked.pid = bl.pid
                        JOIN pg_locks lk ON bl.locktype = lk.locktype
                            AND bl.relation = lk.relation
                            AND bl.pid != lk.pid
                        JOIN pg_stat_activity blocking ON lk.pid = blocking.pid
                        WHERE NOT bl.granted
                        ${limit !== null ? `LIMIT ${String(limit)}` : ""}`;
        } else {
          sql = `SELECT l.locktype, l.relation::regclass, l.mode, l.granted,
                        a.pid, a.usename, a.query, a.state
                        FROM pg_locks l
                        JOIN pg_stat_activity a ON l.pid = a.pid
                        WHERE l.pid != pg_backend_pid()
                        ORDER BY l.granted, l.pid
                        ${limit !== null ? `LIMIT ${String(limit)}` : ""}`;
        }

        const result = await adapter.executeQuery(sql);
        return {
          success: true as const,
          locks: result.rows,
          count: result.rows?.length ?? 0,
          truncated: limit !== null && (result.rows?.length ?? 0) === limit,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_locks" });
      }
    },
  };
}

// ─── pg_bloat_check ──────────────────────────────────────────────────────────

export function createBloatCheckTool(adapter: PostgresAdapter): ToolDefinition {
  const BloatCheckSchemaBase = z.object({
    table: z
      .unknown()
      .optional()
      .describe("Table name to check (all tables if omitted)"),
    schema: z.unknown().optional().describe("Schema name to filter"),
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
        let tableName = typeof parsed.table === "string" || typeof parsed.table === "number" ? String(parsed.table) : undefined;
        let schemaName = typeof parsed.schema === "string" || typeof parsed.schema === "number" ? String(parsed.schema) : undefined;
        if (tableName?.includes(".")) {
          const parts = tableName.split(".");
          schemaName = schemaName ?? parts[0];
          tableName = parts[1] ?? tableName;
        }
        let whereClause = "n_dead_tup > 0";
        if (!schemaName && !tableName) {
          whereClause += " AND schemaname NOT IN ('cron', 'topology', 'tiger', 'tiger_data')";
        }
        const queryParams: string[] = [];
        if (schemaName !== undefined) {
          queryParams.push(schemaName);
          whereClause += ` AND schemaname = $${String(queryParams.length)}`;
        }
        if (tableName !== undefined) {
          queryParams.push(tableName);
          whereClause += ` AND relname = $${String(queryParams.length)}`;
        }

        // P154: Validate table/schema existence before querying (throws ValidationError on failure)
        await validatePerformanceTableExists(adapter, tableName, schemaName);

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
          success: true as const,
          tables,
          count: tables.length,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_bloat_check" });
      }
    },
  };
}

// ─── pg_cache_hit_ratio ──────────────────────────────────────────────────────

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
          success: true as const,
          heap_read: row ? toNum(row["heap_read"]) : null,
          heap_hit: row ? toNum(row["heap_hit"]) : null,
          cache_hit_ratio: row ? toNum(row["cache_hit_ratio"]) : null,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_cache_hit_ratio" });
      }
    },
  };
}
