/**
 * PostgreSQL Performance Tools - Catalog Statistics
 *
 * Index stats, table stats, and vacuum stats tools.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerError } from "../core/error-helpers.js";
import {
  IndexStatsOutputSchema,
  TableStatsOutputSchema,
  VacuumStatsOutputSchema,
} from "../../schemas/index.js";
import {
  defaultToEmpty,
  toNum,
  validatePerformanceTableExists,
} from "./helpers.js";

export function createIndexStatsTool(adapter: PostgresAdapter): ToolDefinition {
  // Define schema locally with limit parameter
  const IndexStatsSchemaLocalBase = z.object({
    table: z.string().optional().describe("Table name to filter indexes"),
    schema: z.string().optional().describe("Schema name to filter indexes"),
    limit: z
      .any()
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
        const rawLimit = Number(parsed.limit);
        const limit =
          parsed.limit === undefined
            ? 50
            : isNaN(rawLimit)
              ? 50
              : rawLimit === 0
                ? null
                : rawLimit;

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
        return formatHandlerError(error, { tool: "pg_index_stats" });
      }
    },
  };
}

export function createTableStatsTool(adapter: PostgresAdapter): ToolDefinition {
  const TableStatsSchemaLocalBase = z.object({
    table: z.string().optional().describe("Table name (all tables if omitted)"),
    schema: z.string().optional().describe("Schema name"),
    limit: z
      .any()
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
        const rawLimit = Number(parsed.limit);
        const limit =
          parsed.limit === undefined
            ? 50
            : isNaN(rawLimit)
              ? 50
              : rawLimit === 0
                ? null
                : rawLimit;

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
        return formatHandlerError(error, { tool: "pg_table_stats" });
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
    limit: z
      .any()
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
        const rawLimit = Number(parsed.limit);
        const limit =
          parsed.limit === undefined
            ? 50
            : isNaN(rawLimit)
              ? 50
              : rawLimit === 0
                ? null
                : rawLimit;
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
        return formatHandlerError(error, { tool: "pg_vacuum_stats" });
      }
    },
  };
}
