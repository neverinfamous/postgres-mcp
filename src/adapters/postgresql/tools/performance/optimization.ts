/**
 * PostgreSQL Performance Tools - Optimization
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  PerformanceBaselineOutputSchema,
  ConnectionPoolOptimizeOutputSchema,
  PartitionStrategySuggestOutputSchema,
} from "../../schemas/index.js";

// Helper to handle undefined params (allows tools to be called without {})
const defaultToEmpty = (val: unknown): unknown => val ?? {};

// Helper to coerce string numbers to JavaScript numbers (PostgreSQL returns BIGINT as strings)
const toNum = (val: unknown): number | null =>
  val === null || val === undefined ? null : Number(val);

// Preprocess partition strategy params with tableName/name aliases
function preprocessPartitionStrategyParams(input: unknown): unknown {
  const normalized = defaultToEmpty(input) as Record<string, unknown>;
  const result = { ...normalized };
  // Alias: tableName/name → table
  if (result["table"] === undefined) {
    if (result["tableName"] !== undefined)
      result["table"] = result["tableName"];
    else if (result["name"] !== undefined) result["table"] = result["name"];
  }
  return result;
}

export function createPerformanceBaselineTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  const PerformanceBaselineSchema = z.preprocess(
    defaultToEmpty,
    z.object({
      name: z.string().optional().describe("Baseline name for reference"),
    }),
  );

  return {
    name: "pg_performance_baseline",
    description:
      "Capture current database performance metrics as a baseline for comparison.",
    group: "performance",
    inputSchema: PerformanceBaselineSchema,
    outputSchema: PerformanceBaselineOutputSchema,
    annotations: readOnly("Performance Baseline"),
    icons: getToolIcons("performance", readOnly("Performance Baseline")),
    handler: async (params: unknown, _context: RequestContext) => {
      const parsed = PerformanceBaselineSchema.parse(params);
      const baselineName =
        parsed.name ?? `baseline_${new Date().toISOString()}`;

      const [cacheHit, tableStats, indexStats, connections, dbSize] =
        await Promise.all([
          adapter.executeQuery(`
                    SELECT
                        sum(heap_blks_hit) as heap_hits,
                        sum(heap_blks_read) as heap_reads,
                        round(100.0 * sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) as cache_hit_ratio
                    FROM pg_statio_user_tables
                `),
          adapter.executeQuery(`
                    SELECT
                        sum(seq_scan) as total_seq_scans,
                        sum(idx_scan) as total_idx_scans,
                        sum(n_tup_ins) as total_inserts,
                        sum(n_tup_upd) as total_updates,
                        sum(n_tup_del) as total_deletes,
                        sum(n_live_tup) as total_live_tuples,
                        sum(n_dead_tup) as total_dead_tuples
                    FROM pg_stat_user_tables
                `),
          adapter.executeQuery(`
                    SELECT
                        count(*) as total_indexes,
                        sum(idx_scan) as total_index_scans
                    FROM pg_stat_user_indexes
                `),
          adapter.executeQuery(`
                    SELECT
                        count(*) as total_connections,
                        count(*) FILTER (WHERE state = 'active') as active_connections,
                        count(*) FILTER (WHERE state = 'idle') as idle_connections
                    FROM pg_stat_activity
                    WHERE backend_type = 'client backend'
                `),
          adapter.executeQuery(
            `SELECT pg_database_size(current_database()) as size_bytes`,
          ),
        ]);

      // Helper to coerce all numeric string values in an object to numbers
      const coerceRow = (
        row: Record<string, unknown> | undefined,
      ): Record<string, unknown> | null => {
        if (!row) return null;
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          result[key] = toNum(value) ?? value;
        }
        return result;
      };

      return {
        name: baselineName,
        timestamp: new Date().toISOString(),
        metrics: {
          cache: coerceRow(cacheHit.rows?.[0]),
          tables: coerceRow(tableStats.rows?.[0]),
          indexes: coerceRow(indexStats.rows?.[0]),
          connections: coerceRow(connections.rows?.[0]),
          databaseSize: coerceRow(dbSize.rows?.[0]),
        },
      };
    },
  };
}

export function createConnectionPoolOptimizeTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_connection_pool_optimize",
    description:
      "Analyze connection usage and provide pool optimization recommendations.",
    group: "performance",
    inputSchema: z.object({}),
    outputSchema: ConnectionPoolOptimizeOutputSchema,
    annotations: readOnly("Connection Pool Optimize"),
    icons: getToolIcons("performance", readOnly("Connection Pool Optimize")),
    handler: async (_params: unknown, _context: RequestContext) => {
      const [connStats, settings, waitEvents] = await Promise.all([
        adapter.executeQuery(`
                    SELECT
                        count(*) as total_connections,
                        count(*) FILTER (WHERE state = 'active') as active,
                        count(*) FILTER (WHERE state = 'idle') as idle,
                        count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction,
                        count(*) FILTER (WHERE wait_event_type IS NOT NULL) as waiting,
                        max(EXTRACT(EPOCH FROM (now() - backend_start))) as max_connection_age_seconds,
                        avg(EXTRACT(EPOCH FROM (now() - backend_start))) as avg_connection_age_seconds
                    FROM pg_stat_activity
                    WHERE backend_type = 'client backend'
                `),
        adapter.executeQuery(`
                    SELECT
                        current_setting('max_connections')::int as max_connections,
                        current_setting('superuser_reserved_connections')::int as reserved_connections
                `),
        adapter.executeQuery(`
                    SELECT wait_event_type, wait_event, count(*) as count
                    FROM pg_stat_activity
                    WHERE wait_event IS NOT NULL AND backend_type = 'client backend'
                    GROUP BY wait_event_type, wait_event
                    ORDER BY count DESC
                    LIMIT 10
                `),
      ]);

      const conn = connStats.rows?.[0];
      const config = settings.rows?.[0];

      const recommendations: string[] = [];

      if (conn && config) {
        const totalConnections = Number(conn["total_connections"] ?? 0);
        const maxConnections = Number(config["max_connections"] ?? 1);
        const idleInTransaction = Number(conn["idle_in_transaction"] ?? 0);
        const active = Number(conn["active"] ?? 0);
        const idle = Number(conn["idle"] ?? 0);
        const maxConnectionAge = Number(
          conn["max_connection_age_seconds"] ?? 0,
        );

        const utilization = (totalConnections / maxConnections) * 100;

        if (utilization > 80) {
          recommendations.push(
            "Connection utilization is high (>80%). Consider increasing max_connections or using a connection pooler like PgBouncer.",
          );
        }
        if (idleInTransaction > active) {
          recommendations.push(
            "Many idle-in-transaction connections. Check for uncommitted transactions or application issues.",
          );
        }
        if (idle > active * 3) {
          recommendations.push(
            "High ratio of idle to active connections. Consider reducing pool size or idle timeout.",
          );
        }
        if (maxConnectionAge > 3600) {
          recommendations.push(
            "Long-lived connections detected. Consider connection recycling.",
          );
        }
      }

      // Coerce numeric fields to JavaScript numbers
      const current = conn
        ? {
            total_connections: toNum(conn["total_connections"]),
            active: toNum(conn["active"]),
            idle: toNum(conn["idle"]),
            idle_in_transaction: toNum(conn["idle_in_transaction"]),
            waiting: toNum(conn["waiting"]),
            max_connection_age_seconds: toNum(
              conn["max_connection_age_seconds"],
            ),
            avg_connection_age_seconds: toNum(
              conn["avg_connection_age_seconds"],
            ),
          }
        : null;

      // Coerce waitEvents count to numbers
      const coercedWaitEvents = (waitEvents.rows ?? []).map(
        (row: Record<string, unknown>) => ({
          ...row,
          count: toNum(row["count"]),
        }),
      );

      return {
        current,
        config,
        waitEvents: coercedWaitEvents,
        recommendations:
          recommendations.length > 0
            ? recommendations
            : ["Connection pool appears healthy"],
      };
    },
  };
}

export function createPartitionStrategySuggestTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  // Base schema for MCP visibility (no preprocess)
  const PartitionStrategySchemaBase = z.object({
    table: z.string().optional().describe("Table to analyze"),
    schema: z.string().optional().describe("Schema name"),
  });

  // Full schema with preprocessing for aliases
  const PartitionStrategySchema = z.preprocess(
    preprocessPartitionStrategyParams,
    PartitionStrategySchemaBase,
  );

  return {
    name: "pg_partition_strategy_suggest",
    description: "Analyze a table and suggest optimal partitioning strategy.",
    group: "performance",
    inputSchema: PartitionStrategySchemaBase, // Base schema for MCP visibility
    outputSchema: PartitionStrategySuggestOutputSchema,
    annotations: readOnly("Partition Strategy Suggest"),
    icons: getToolIcons("performance", readOnly("Partition Strategy Suggest")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = PartitionStrategySchema.parse(params);

        // Validate required parameter
        if (!parsed.table) {
          return {
            success: false as const,
            error: "Missing required parameter: table is required",
          };
        }

        // Parse schema from table if it contains a dot (e.g., 'public.users')
        let schemaName = parsed.schema ?? "public";
        let tableName = parsed.table;
        if (tableName.includes(".")) {
          const parts = tableName.split(".");
          schemaName = parts[0] ?? "public";
          tableName = parts[1] ?? tableName;
        }

        const [tableInfo, columnInfo, tableSize] = await Promise.all([
          adapter.executeQuery(
            `
                    SELECT
                        relname, n_live_tup, n_dead_tup,
                        seq_scan, idx_scan
                    FROM pg_stat_user_tables
                    WHERE relname = $1 AND schemaname = $2
                `,
            [tableName, schemaName],
          ),
          adapter.executeQuery(
            `
                    SELECT
                        a.attname as column_name,
                        t.typname as data_type,
                        s.n_distinct,
                        s.null_frac
                    FROM pg_attribute a
                    JOIN pg_class c ON a.attrelid = c.oid
                    JOIN pg_namespace n ON c.relnamespace = n.oid
                    JOIN pg_type t ON a.atttypid = t.oid
                    LEFT JOIN pg_stats s ON s.tablename = c.relname
                        AND s.attname = a.attname
                        AND s.schemaname = n.nspname
                    WHERE c.relname = $1 AND n.nspname = $2
                        AND a.attnum > 0 AND NOT a.attisdropped
                    ORDER BY a.attnum
                `,
            [tableName, schemaName],
          ),
          adapter.executeQuery(
            `
                    SELECT pg_size_pretty(pg_table_size($1::regclass)) as table_size,
                           pg_table_size($1::regclass) as size_bytes
                `,
            [`"${schemaName}"."${tableName}"`],
          ),
        ]);

        const table = tableInfo.rows?.[0];
        const columns = columnInfo.rows;
        const size = tableSize.rows?.[0];

        const suggestions: {
          strategy: string;
          column: string;
          reason: string;
        }[] = [];

        if (columns) {
          for (const col of columns) {
            const colName = col["column_name"] as string;
            const dataType = col["data_type"] as string;
            const nDistinct = col["n_distinct"] as number;

            if (["date", "timestamp", "timestamptz"].includes(dataType)) {
              suggestions.push({
                strategy: "RANGE",
                column: colName,
                reason: `${dataType} column ideal for time-based range partitioning (monthly/yearly)`,
              });
            }

            if (nDistinct > 0 && nDistinct < 20) {
              suggestions.push({
                strategy: "LIST",
                column: colName,
                reason: `Low cardinality (${String(nDistinct)} distinct values) - good for list partitioning`,
              });
            }

            if (
              ["int4", "int8", "integer", "bigint"].includes(dataType) &&
              (nDistinct < 0 || nDistinct > 100)
            ) {
              suggestions.push({
                strategy: "HASH",
                column: colName,
                reason:
                  "High cardinality integer - suitable for hash partitioning to distribute load",
              });
            }
          }
        }

        const rowCount = Number(table?.["n_live_tup"] ?? 0);
        const sizeBytes = Number(size?.["size_bytes"] ?? 0);

        let partitioningRecommended = false;
        let reason = "";

        if (rowCount > 10_000_000) {
          partitioningRecommended = true;
          reason = `Table has ${String(rowCount)} rows - partitioning recommended for manageability`;
        } else if (sizeBytes > 1_000_000_000) {
          partitioningRecommended = true;
          reason =
            "Table is over 1GB - partitioning can improve query performance and maintenance";
        }

        // Coerce tableStats numeric fields
        const coercedTableStats = table
          ? {
              ...table,
              n_live_tup: toNum(table["n_live_tup"]),
              n_dead_tup: toNum(table["n_dead_tup"]),
              seq_scan: toNum(table["seq_scan"]),
              idx_scan: toNum(table["idx_scan"]),
            }
          : null;

        // Coerce tableSize numeric fields
        const coercedTableSize = size
          ? {
              ...size,
              size_bytes: toNum(size["size_bytes"]),
            }
          : null;

        return {
          table: `${schemaName}.${tableName}`,
          tableStats: coercedTableStats,
          tableSize: coercedTableSize,
          partitioningRecommended,
          reason,
          suggestions: suggestions.slice(0, 5),
          note: "Consider your query patterns when choosing partition key. Range partitioning on date columns is most common.",
        };
      } catch (error) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_partition_strategy_suggest",
          });
      }
    },
  };
}
