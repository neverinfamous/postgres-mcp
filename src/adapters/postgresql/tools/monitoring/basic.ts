/**
 * PostgreSQL Monitoring Tools - Basic Status & Info
 *
 * Database sizes, connections, replication, version, settings, uptime, recovery.
 * 8 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly } from "../../../../utils/annotations.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { getToolIcons } from "../../../../utils/icons.js";
import {
  DatabaseSizeSchemaBase,
  DatabaseSizeSchema,
  TableSizesSchemaBase,
  TableSizesSchema,
  ConnectionStatsSchemaBase,
  ConnectionStatsSchema,
  ShowSettingsSchemaBase,
  ShowSettingsSchema,
  // Output schemas
  DatabaseSizeOutputSchema,
  TableSizesOutputSchema,
  ConnectionStatsOutputSchema,
  ReplicationStatusOutputSchema,
  ServerVersionOutputSchema,
  ShowSettingsOutputSchema,
  UptimeOutputSchema,
  RecoveryStatusOutputSchema,
} from "../../schemas/index.js";

// =============================================================================
// pg_database_size
// =============================================================================

export function createDatabaseSizeTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_database_size",
    description: "Get the size of a database.",
    group: "monitoring",
    inputSchema: DatabaseSizeSchemaBase,
    outputSchema: DatabaseSizeOutputSchema,
    annotations: readOnly("Database Size"),
    icons: getToolIcons("monitoring", readOnly("Database Size")),
    handler: async (params: unknown, _context: RequestContext) => {
      let database: string | undefined;
      try {
        const parsed = DatabaseSizeSchema.parse(params) as { database?: string };
        database = parsed.database;
      } catch (err) {
        return formatHandlerErrorResponse(err, { tool: "pg_database_size" });
      }

      const sql = database
        ? `SELECT pg_database_size($1) as bytes, pg_size_pretty(pg_database_size($1)) as size`
        : `SELECT pg_database_size(current_database()) as bytes, pg_size_pretty(pg_database_size(current_database())) as size`;
      try {
        const result = await adapter.executeQuery(
          sql,
          database ? [database] : [],
        );
        const row = result.rows?.[0] as
          | { bytes: string | number; size: string }
          | undefined;
        if (!row) return row;
        return {
          ...row,
          bytes: parseInt(String(row.bytes), 10),
        };
      } catch (err) {
        return formatHandlerErrorResponse(err, { tool: "pg_database_size" });
      }
    },
  };
}

// =============================================================================
// pg_table_sizes
// =============================================================================

export function createTableSizesTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_table_sizes",
    description: "Get sizes of all tables with indexes and total.",
    group: "monitoring",
    inputSchema: TableSizesSchemaBase,
    outputSchema: TableSizesOutputSchema,
    annotations: readOnly("Table Sizes"),
    icons: getToolIcons("monitoring", readOnly("Table Sizes")),
    handler: async (params: unknown, _context: RequestContext) => {
      let schema: string | undefined;
      let limit: number | undefined;
      try {
        const parsed = TableSizesSchema.parse(params) as {
          schema?: string;
          limit?: number;
        };
        schema = parsed.schema;
        limit = parsed.limit;
      } catch (err) {
        return formatHandlerErrorResponse(err, { tool: "pg_table_sizes" });
      }

      // P154: Validate schema existence before querying
      if (schema) {
        const schemaCheck = await adapter.executeQuery(
          `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
          [schema],
        );
        if (schemaCheck.rows?.length === 0) {
          return {
            success: false,
            error: `Schema '${schema}' does not exist. Use pg_list_schemas to see available schemas.`,
          };
        }
      }

      const schemaClause = schema ? `AND n.nspname = $1` : "";
      const queryParams: string[] = schema ? [schema] : [];
      // Apply limit (default 10)
      const effectiveLimit = limit !== undefined && limit > 0 ? limit : 10;
      const limitClause = ` LIMIT ${String(effectiveLimit)}`;

      const sql = `SELECT n.nspname as schema, c.relname as table_name,
                        pg_size_pretty(pg_table_size(c.oid)) as table_size,
                        pg_size_pretty(pg_indexes_size(c.oid)) as indexes_size,
                        pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
                        pg_total_relation_size(c.oid) as total_bytes
                        FROM pg_class c
                        LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE c.relkind IN ('r', 'p')
                        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                        ${schemaClause}
                        ORDER BY pg_total_relation_size(c.oid) DESC${limitClause}`;

      const result = await adapter.executeQuery(sql, queryParams);
      // Coerce total_bytes to number for each table row
      const tables = (result.rows ?? []).map((row: Record<string, unknown>) => {
        const totalBytes = row["total_bytes"];
        return {
          ...row,
          total_bytes:
            typeof totalBytes === "number"
              ? totalBytes
              : typeof totalBytes === "string"
                ? parseInt(totalBytes, 10)
                : 0,
        };
      });

      // If limit was applied and we hit the limit, get total count to indicate truncation
      if (tables.length === effectiveLimit) {
        const countSql = `SELECT count(*) as total
                          FROM pg_class c
                          LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
                          WHERE c.relkind IN ('r', 'p')
                          AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                          ${schemaClause}`;
        const countResult = await adapter.executeQuery(countSql, queryParams);
        const totalCount = Number(countResult.rows?.[0]?.["total"] ?? 0);

        return {
          tables,
          count: tables.length,
          totalCount,
          truncated: totalCount > tables.length,
        };
      }

      return { tables, count: tables.length };
    },
  };
}

// =============================================================================
// pg_connection_stats
// =============================================================================

export function createConnectionStatsTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_connection_stats",
    description: "Get connection statistics by database and state.",
    group: "monitoring",
    inputSchema: ConnectionStatsSchemaBase,
    outputSchema: ConnectionStatsOutputSchema,
    annotations: readOnly("Connection Stats"),
    icons: getToolIcons("monitoring", readOnly("Connection Stats")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = ConnectionStatsSchema.parse(params ?? {}) as { database?: string };
        const database = parsed.database;

        // P154: Validate database existence before querying
        if (database) {
          const dbCheck = await adapter.executeQuery(
            `SELECT 1 FROM pg_database WHERE datname = $1`,
            [database]
          );
          if (dbCheck.rows?.length === 0) {
            return {
              success: false,
              error: `Database '${database}' does not exist.`,
            };
          }
        }

        const dbClause = database ? `AND datname = $1` : "";
        const queryParams = database ? [database] : [];

        const sql = `SELECT datname, state, count(*) as connections
                          FROM pg_stat_activity
                          WHERE pid != pg_backend_pid()
                          ${dbClause}
                          GROUP BY datname, state
                          ORDER BY datname, state`;

        const result = await adapter.executeQuery(sql, queryParams);

        const maxResult = await adapter.executeQuery(`SHOW max_connections`);
        const maxConnections = maxResult.rows?.[0]?.["max_connections"];

        let totalQuery = `SELECT count(*) as total FROM pg_stat_activity`;
        if (database) totalQuery += ` WHERE datname = $1`;
        
        const totalResult = await adapter.executeQuery(totalQuery, queryParams);

        // Coerce connection counts to numbers
        const byDatabaseAndState = (result.rows ?? []).map(
          (row: Record<string, unknown>) => {
            const connCount = row["connections"];
            return {
              ...row,
              connections:
                typeof connCount === "number"
                  ? connCount
                  : typeof connCount === "string"
                    ? parseInt(connCount, 10)
                    : 0,
            };
          },
        );

        const totalRaw = totalResult.rows?.[0]?.["total"];
        const maxRaw = maxConnections;

        return {
          byDatabaseAndState,
          totalConnections:
            typeof totalRaw === "number"
              ? totalRaw
              : typeof totalRaw === "string"
                ? parseInt(totalRaw, 10)
                : 0,
          maxConnections:
            typeof maxRaw === "number"
              ? maxRaw
              : typeof maxRaw === "string"
                ? parseInt(maxRaw, 10)
                : 0,
        };
      } catch (err) {
        return formatHandlerErrorResponse(err, { tool: "pg_connection_stats" });
      }
    },
  };
}

// =============================================================================
// pg_replication_status
// =============================================================================

export function createReplicationStatusTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_replication_status",
    description: "Check replication status and lag.",
    group: "monitoring",
    inputSchema: z.object({}).strict(),
    outputSchema: ReplicationStatusOutputSchema,
    annotations: readOnly("Replication Status"),
    icons: getToolIcons("monitoring", readOnly("Replication Status")),
    handler: async (_params: unknown, _context: RequestContext) => {
      try {
        const recoveryResult = await adapter.executeQuery(
          `SELECT pg_is_in_recovery() as is_replica`,
        );
        const isReplica = recoveryResult.rows?.[0]?.["is_replica"];

        if (isReplica === true) {
          const sql = `SELECT
                              now() - pg_last_xact_replay_timestamp() as replay_lag,
                              pg_last_wal_receive_lsn() as receive_lsn,
                              pg_last_wal_replay_lsn() as replay_lsn`;
          const result = await adapter.executeQuery(sql);
          return { role: "replica", ...result.rows?.[0] };
        } else {
          const sql = `SELECT client_addr, state, sent_lsn, write_lsn, flush_lsn, replay_lsn,
                              now() - backend_start as connection_duration
                              FROM pg_stat_replication`;
          const result = await adapter.executeQuery(sql);
          return { role: "primary", replicas: result.rows };
        }
      } catch (err) {
        return formatHandlerErrorResponse(err, { tool: "pg_replication_status" });
      }
    },
  };
}

// =============================================================================
// pg_server_version
// =============================================================================

export function createServerVersionTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_server_version",
    description: "Get PostgreSQL server version information.",
    group: "monitoring",
    inputSchema: z.object({}).strict(),
    outputSchema: ServerVersionOutputSchema,
    annotations: readOnly("Server Version"),
    icons: getToolIcons("monitoring", readOnly("Server Version")),
    handler: async (_params: unknown, _context: RequestContext) => {
      try {
        const sql = `SELECT version() as full_version,
                          current_setting('server_version') as version,
                          current_setting('server_version_num') as version_num`;
        const result = await adapter.executeQuery(sql);
        const row = result.rows?.[0] as
          | { full_version: string; version: string; version_num: string }
          | undefined;
        if (!row) return row;
        return {
          ...row,
          version_num: parseInt(row.version_num, 10),
        };
      } catch (err) {
        return formatHandlerErrorResponse(err, { tool: "pg_server_version" });
      }
    },
  };
}

// =============================================================================
// pg_show_settings
// =============================================================================

export function createShowSettingsTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_show_settings",
    description:
      "Show current PostgreSQL configuration settings. Filter by name pattern or exact setting name. Accepts: pattern, setting, or name parameter.",
    group: "monitoring",
    inputSchema: ShowSettingsSchemaBase,
    outputSchema: ShowSettingsOutputSchema,
    annotations: readOnly("Show Settings"),
    icons: getToolIcons("monitoring", readOnly("Show Settings")),
    handler: async (params: unknown, _context: RequestContext) => {
      let pattern: string | undefined;
      let limit: number | undefined;
      try {
        const parsed = ShowSettingsSchema.parse(params) as {
          pattern?: string;
          limit?: number;
        };
        pattern = parsed.pattern;
        limit = parsed.limit;
      } catch (err) {
        return formatHandlerErrorResponse(err, { tool: "pg_show_settings" });
      }

      // Auto-detect if user passed exact name vs LIKE pattern
      // If no wildcards, try exact match first, fall back to LIKE with wildcards
      let whereClause = "";
      let queryParams: string[] = [];

      if (pattern !== undefined) {
        if (pattern.includes("%") || pattern.includes("_")) {
          // User specified LIKE pattern explicitly
          whereClause = "WHERE name LIKE $1";
          queryParams = [pattern];
        } else {
          // Exact name - try exact match first, or pattern match with auto-wildcards
          whereClause = "WHERE name = $1 OR name LIKE $2";
          queryParams = [pattern, `%${pattern}%`];
        }
      }

      // Build LIMIT clause and clamp to 100 max to prevent unmanageable token payload output
      const maxLimit = 100;
      let appliedLimit = limit !== undefined && limit > 0 ? limit : maxLimit;
      if (appliedLimit > maxLimit) appliedLimit = maxLimit;
      const limitClause = ` LIMIT ${String(appliedLimit)}`;

      const sql = `SELECT name, setting, unit, category, short_desc
                        FROM pg_settings
                        ${whereClause}
                        ORDER BY category, name${limitClause}`;

      const result = await adapter.executeQuery(sql, queryParams);
      const rows = result.rows ?? [];

      // If limit was applied, get total count to indicate truncation
      if (rows.length === appliedLimit) {
        const countSql = `SELECT count(*) as total FROM pg_settings ${whereClause}`;
        const countResult = await adapter.executeQuery(countSql, queryParams);
        const totalCount = Number(countResult.rows?.[0]?.["total"] ?? 0);

        return {
          settings: rows,
          count: rows.length,
          totalCount,
          truncated: totalCount > rows.length,
        };
      }

      return {
        settings: rows,
        count: rows.length,
      };
    },
  };
}

// =============================================================================
// pg_uptime
// =============================================================================

export function createUptimeTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_uptime",
    description: "Get server uptime and startup time.",
    group: "monitoring",
    inputSchema: z.object({}).strict(),
    outputSchema: UptimeOutputSchema,
    annotations: readOnly("Server Uptime"),
    icons: getToolIcons("monitoring", readOnly("Server Uptime")),
    handler: async (_params: unknown, _context: RequestContext) => {
      try {
        const sql = `SELECT
                          pg_postmaster_start_time() as start_time,
                          EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time())) as total_seconds`;
        const result = await adapter.executeQuery(sql);
        const row = result.rows?.[0] as
          | { start_time: string; total_seconds: string | number }
          | undefined;
        if (!row) return row;

        // Parse total seconds into components
        const totalSeconds = Number(row.total_seconds);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const milliseconds = parseFloat(((totalSeconds % 1) * 1000).toFixed(3));

        return {
          start_time: row.start_time,
          uptime: {
            days,
            hours,
            minutes,
            seconds,
            milliseconds,
          },
        };
      } catch (err) {
        return formatHandlerErrorResponse(err, { tool: "pg_uptime" });
      }
    },
  };
}

// =============================================================================
// pg_recovery_status
// =============================================================================

export function createRecoveryStatusTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_recovery_status",
    description: "Check if server is in recovery mode (replica).",
    group: "monitoring",
    inputSchema: z.object({}).strict(),
    outputSchema: RecoveryStatusOutputSchema,
    annotations: readOnly("Recovery Status"),
    icons: getToolIcons("monitoring", readOnly("Recovery Status")),
    handler: async (_params: unknown, _context: RequestContext) => {
      try {
        const sql = `SELECT pg_is_in_recovery() as in_recovery,
                          CASE WHEN pg_is_in_recovery()
                              THEN pg_last_xact_replay_timestamp()
                              ELSE NULL
                          END as last_replay_timestamp`;
        const result = await adapter.executeQuery(sql);
        return result.rows?.[0];
      } catch (err) {
        return formatHandlerErrorResponse(err, { tool: "pg_recovery_status" });
      }
    },
  };
}
