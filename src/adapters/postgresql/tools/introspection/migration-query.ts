/**
 * PostgreSQL Migration Tools — Query & Rollback
 *
 * Migration rollback, history, and status tools.
 * 3 tools total.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly, destructive } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatPostgresError } from "../core/error-helpers.js";
import {
  MigrationRollbackSchemaBase,
  MigrationRollbackSchema,
  MigrationHistorySchemaBase,
  MigrationHistorySchema,
  MigrationStatusSchemaBase,
  MigrationStatusSchema,
  // Output schemas
  MigrationRollbackOutputSchema,
  MigrationHistoryOutputSchema,
  MigrationStatusOutputSchema,
} from "../../schemas/index.js";
import { sanitizeIdentifier } from "../../../../utils/identifiers.js";
import {
  TRACKING_TABLE,
  ensureTrackingTable,
  formatRecord,
} from "./migration/helpers.js";

// =============================================================================
// pg_migration_rollback
// =============================================================================

export function createMigrationRollbackTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  const annotations = destructive("Roll back migration");
  return {
    name: "pg_migration_rollback",
    description:
      "Roll back a specific migration by ID or version. " +
      "Executes the stored rollback_sql in a transaction and updates status to 'rolled_back'. " +
      "Use dryRun: true to preview the rollback SQL without executing.",
    group: "migration",
    inputSchema: MigrationRollbackSchemaBase,
    outputSchema: MigrationRollbackOutputSchema,
    annotations,
    icons: getToolIcons("migration", annotations),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = MigrationRollbackSchema.parse(params);
        await ensureTrackingTable(adapter);

        if (parsed.id === undefined && parsed.version === undefined) {
          return {
            success: false,
            error:
              "Either 'id' or 'version' is required to identify the migration to roll back.",
          };
        }

        // Coerce id: functional param, return error on wrong type
        let coercedId: number | undefined;
        if (parsed.id !== undefined) {
          const num = parsed.id;
          if (isNaN(num)) {
            return {
              success: false,
              error: `Invalid migration id: expected a number, got "${String(parsed.id)}"`,
            };
          }
          coercedId = num;
        }

        // Find the migration
        const whereClause =
          coercedId !== undefined ? "id = $1" : "version = $1";
        const whereValue = coercedId ?? parsed.version;

        const findResult = await adapter.executeQuery(
          `SELECT * FROM ${TRACKING_TABLE} WHERE ${whereClause} ORDER BY id DESC LIMIT 1`,
          [whereValue],
        );

        const findRows = findResult.rows ?? [];
        if (findRows.length === 0) {
          const identifier =
            coercedId !== undefined
              ? `id ${String(coercedId)}`
              : `version "${parsed.version ?? ""}"`;
          return {
            success: false,
            error: `Migration not found: ${identifier}`,
          };
        }

        const row = findRows[0] ?? {};
        const rowId = row["id"] as number;
        const rowVersion = row["version"] as string;
        const rowStatus = row["status"] as string;
        const rollbackSql = (row["rollback_sql"] as string | null) ?? null;

        if (rowStatus === "rolled_back") {
          return {
            success: false,
            error: `Migration "${rowVersion}" (id: ${String(rowId)}) has already been rolled back.`,
          };
        }

        if (rollbackSql === null) {
          return {
            success: false,
            error: `Migration "${rowVersion}" (id: ${String(rowId)}) has no rollback SQL stored. Manual rollback required.`,
          };
        }

        if (parsed.dryRun === true) {
          return {
            success: true,
            dryRun: true,
            rollbackSql,
            record: formatRecord(row),
          };
        }

        // Execute rollback in a transaction
        try {
          await adapter.executeQuery("BEGIN");
          await adapter.executeQuery(rollbackSql);
          await adapter.executeQuery(
            `UPDATE ${TRACKING_TABLE} SET status = 'rolled_back' WHERE id = $1`,
            [rowId],
          );
          await adapter.executeQuery("COMMIT");

          return {
            success: true,
            dryRun: false,
            rollbackSql,
            record: {
              ...formatRecord(row),
              status: "rolled_back",
            },
          };
        } catch (err: unknown) {
          await adapter.executeQuery("ROLLBACK");
          const message = err instanceof Error ? err.message : "Unknown error";
          return {
            success: false,
            error: `Rollback failed for migration "${rowVersion}" (id: ${String(rowId)}): ${message}. Transaction was rolled back.`,
          };
        }
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, {
            tool: "pg_migration_rollback",
          }),
        };
      }
    },
  };
}

// =============================================================================
// pg_migration_history
// =============================================================================

export function createMigrationHistoryTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  const annotations = readOnly("Migration history");
  return {
    name: "pg_migration_history",
    description:
      "Query migration history with optional filtering by status and source system. " +
      "Returns paginated results ordered by applied_at descending.",
    group: "migration",
    inputSchema: MigrationHistorySchemaBase,
    outputSchema: MigrationHistoryOutputSchema,
    annotations,
    icons: getToolIcons("migration", annotations),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = MigrationHistorySchema.parse(params);
        await ensureTrackingTable(adapter);

        // Coerce limit/offset: wrong-type values silently default
        const limit = parsed.limit ?? 50;
        const offset = parsed.offset ?? 0;

        // Build dynamic WHERE clause
        const conditions: string[] = [];
        const values: unknown[] = [];
        let paramIdx = 1;

        if (parsed.status != null) {
          conditions.push(`status = $${String(paramIdx)}`);
          paramIdx++;
          values.push(parsed.status);
        }
        if (parsed.sourceSystem != null) {
          conditions.push(`source_system = $${String(paramIdx)}`);
          paramIdx++;
          values.push(parsed.sourceSystem);
        }

        const whereClause =
          conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        // Get total count
        const countResult = await adapter.executeQuery(
          `SELECT COUNT(*)::int AS count FROM ${TRACKING_TABLE} ${whereClause}`,
          values.length > 0 ? values : undefined,
        );
        const countRow = (countResult.rows ?? [])[0];
        const total = (countRow?.["count"] as number | null) ?? 0;

        // Get page of results (exclude migration_sql for payload efficiency)
        const limitIdx = String(paramIdx);
        paramIdx++;
        const offsetIdx = String(paramIdx);
        const dataResult = await adapter.executeQuery(
          `SELECT id, version, description, applied_at, applied_by,
                migration_hash, source_system, rollback_sql IS NOT NULL AS has_rollback, status
         FROM ${TRACKING_TABLE}
         ${whereClause}
         ORDER BY applied_at DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
          [...values, limit, offset],
        );

        const records = (dataResult.rows ?? []).map(formatRecord);

        return {
          records,
          total,
          limit,
          offset,
        };
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, {
            tool: "pg_migration_history",
          }),
        };
      }
    },
  };
}

// =============================================================================
// pg_migration_status
// =============================================================================

export function createMigrationStatusTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  const annotations = readOnly("Migration status");
  return {
    name: "pg_migration_status",
    description:
      "Get current migration tracking status: latest version, counts by status, " +
      "and list of source systems. Returns initialized: false if tracking table doesn't exist.",
    group: "migration",
    inputSchema: MigrationStatusSchemaBase,
    outputSchema: MigrationStatusOutputSchema,
    annotations,
    icons: getToolIcons("migration", annotations),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = MigrationStatusSchema.parse(params);
        const targetSchema = parsed.schema ?? "public";

        // Sanitize schema to prevent SQL injection via identifier interpolation
        const sanitizedSchema = sanitizeIdentifier(targetSchema);

        // Check if tracking table exists
        const check = await adapter.executeQuery(
          `SELECT EXISTS (
          SELECT 1 FROM pg_tables
          WHERE schemaname = $1 AND tablename = $2
        ) AS "table_exists"`,
          [targetSchema, TRACKING_TABLE],
        );
        const firstRow = (check.rows ?? [])[0];
        const tableExists = firstRow?.["table_exists"] === true;

        if (!tableExists) {
          return {
            initialized: false,
            latestVersion: null,
            latestAppliedAt: null,
            counts: { total: 0, applied: 0, rolledBack: 0, failed: 0 },
            sourceSystems: [],
          };
        }

        const qualifiedTable =
          targetSchema === "public"
            ? TRACKING_TABLE
            : `${sanitizedSchema}."${TRACKING_TABLE}"`;

        // Get aggregate status
        const statsResult = await adapter.executeQuery(
          `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'applied')::int AS applied,
          COUNT(*) FILTER (WHERE status = 'recorded')::int AS recorded,
          COUNT(*) FILTER (WHERE status = 'rolled_back')::int AS rolled_back,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
        FROM ${qualifiedTable}`,
        );
        const statsRow = (statsResult.rows ?? [])[0] ?? {};

        // Get latest applied migration
        const latestResult = await adapter.executeQuery(
          `SELECT version, applied_at FROM ${qualifiedTable}
         WHERE status = 'applied'
         ORDER BY applied_at DESC LIMIT 1`,
        );
        const latestRow = (latestResult.rows ?? [])[0];

        // Get distinct source systems
        const systemsResult = await adapter.executeQuery(
          `SELECT DISTINCT source_system FROM ${qualifiedTable}
         WHERE source_system IS NOT NULL
         ORDER BY source_system`,
        );
        const sourceSystems = (systemsResult.rows ?? []).map(
          (r) => r["source_system"] as string,
        );

        let latestAppliedAt: string | null = null;
        if (latestRow != null) {
          const appliedAt = latestRow["applied_at"];
          latestAppliedAt =
            appliedAt instanceof Date
              ? appliedAt.toISOString()
              : ((appliedAt as string | null) ?? "");
        }

        return {
          initialized: true,
          latestVersion:
            latestRow != null ? (latestRow["version"] as string) : null,
          latestAppliedAt,
          counts: {
            total: statsRow["total"] as number,
            applied: statsRow["applied"] as number,
            recorded: (statsRow["recorded"] as number | null) ?? 0,
            rolledBack: statsRow["rolled_back"] as number,
            failed: statsRow["failed"] as number,
          },
          sourceSystems,
        };
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, {
            tool: "pg_migration_status",
          }),
        };
      }
    },
  };
}
