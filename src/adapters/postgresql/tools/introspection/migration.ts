/**
 * PostgreSQL Introspection Tools - Migration Tracking
 *
 * Migration init, record, apply, rollback, history, and status tools.
 * 6 tools total.
 */

import { createHash } from "node:crypto";
import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly, write, destructive } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatPostgresError } from "../core/error-helpers.js";
import {
  MigrationInitSchemaBase,
  MigrationInitSchema,
  MigrationRecordSchemaBase,
  MigrationRecordSchema,
  MigrationApplySchemaBase,
  MigrationApplySchema,
  MigrationRollbackSchemaBase,
  MigrationRollbackSchema,
  MigrationHistorySchemaBase,
  MigrationHistorySchema,
  MigrationStatusSchemaBase,
  MigrationStatusSchema,
  // Output schemas
  MigrationInitOutputSchema,
  MigrationRecordOutputSchema,
  MigrationApplyOutputSchema,
  MigrationRollbackOutputSchema,
  MigrationHistoryOutputSchema,
  MigrationStatusOutputSchema,
} from "../../schemas/index.js";

// =============================================================================
// Migration tracking — shared helpers
// =============================================================================

const TRACKING_TABLE = "_mcp_schema_versions";

const CREATE_TRACKING_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
  id SERIAL PRIMARY KEY,
  version VARCHAR(50) NOT NULL,
  description TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by VARCHAR(255),
  migration_hash VARCHAR(64) NOT NULL,
  migration_sql TEXT NOT NULL,
  source_system VARCHAR(50),
  rollback_sql TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'applied',
  CONSTRAINT valid_status CHECK (status IN ('applied', 'rolled_back', 'failed'))
)`;

/**
 * Ensure the _mcp_schema_versions table exists.
 * Returns true if the table was newly created, false if it already existed.
 */
async function ensureTrackingTable(adapter: PostgresAdapter): Promise<boolean> {
  const check = await adapter.executeQuery(
    `SELECT EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = $1
    ) AS "table_exists"`,
    [TRACKING_TABLE],
  );
  const firstRow = (check.rows ?? [])[0];
  const existed = firstRow?.["table_exists"] === true;

  if (!existed) {
    await adapter.executeQuery(CREATE_TRACKING_TABLE_SQL);
  }
  return !existed;
}

function hashMigrationSql(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

interface FormattedRecord {
  id: number;
  version: string;
  description: string | null;
  appliedAt: string;
  appliedBy: string | null;
  migrationHash: string;
  sourceSystem: string | null;
  status: string;
}

function formatRecord(row: Record<string, unknown>): FormattedRecord {
  const appliedAt = row["applied_at"];
  const appliedAtStr =
    appliedAt instanceof Date
      ? appliedAt.toISOString()
      : ((appliedAt as string | null) ?? "");
  return {
    id: row["id"] as number,
    version: row["version"] as string,
    description: (row["description"] as string | null) ?? null,
    appliedAt: appliedAtStr,
    appliedBy: (row["applied_by"] as string | null) ?? null,
    migrationHash: row["migration_hash"] as string,
    sourceSystem: (row["source_system"] as string | null) ?? null,
    status: row["status"] as string,
  };
}

// =============================================================================
// pg_migration_init
// =============================================================================

export function createMigrationInitTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  const annotations = write("Initialize migration tracking");
  return {
    name: "pg_migration_init",
    description:
      "Initialize or verify the schema version tracking table (_mcp_schema_versions). " +
      "Idempotent — safe to call repeatedly. Returns current tracking state.",
    group: "introspection",
    inputSchema: MigrationInitSchemaBase,
    outputSchema: MigrationInitOutputSchema,
    annotations,
    icons: getToolIcons("introspection", annotations),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = MigrationInitSchema.parse(params);
        const targetSchema = parsed.schema ?? "public";

        // Create table in target schema
        const createSql =
          targetSchema === "public"
            ? CREATE_TRACKING_TABLE_SQL
            : CREATE_TRACKING_TABLE_SQL.replace(
                TRACKING_TABLE,
                `${targetSchema}.${TRACKING_TABLE}`,
              );

        const check = await adapter.executeQuery(
          `SELECT EXISTS (
          SELECT 1 FROM pg_tables
          WHERE schemaname = $1 AND tablename = $2
        ) AS "table_exists"`,
          [targetSchema, TRACKING_TABLE],
        );
        const firstRow = (check.rows ?? [])[0];
        const existed = firstRow?.["table_exists"] === true;

        if (!existed) {
          await adapter.executeQuery(createSql);
        }

        const qualifiedTable =
          targetSchema === "public"
            ? TRACKING_TABLE
            : `${targetSchema}.${TRACKING_TABLE}`;

        const countResult = await adapter.executeQuery(
          `SELECT COUNT(*)::int AS count FROM ${qualifiedTable}`,
        );
        const countRow = (countResult.rows ?? [])[0];
        const existingRecords = (countRow?.["count"] as number | null) ?? 0;

        return {
          success: true,
          tableCreated: !existed,
          tableName: qualifiedTable,
          existingRecords,
        };
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, {
            tool: "pg_migration_init",
          }),
        };
      }
    },
  };
}

// =============================================================================
// pg_migration_record
// =============================================================================

export function createMigrationRecordTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  const annotations = write("Record migration");
  return {
    name: "pg_migration_record",
    description:
      "Record a migration in the schema version tracking table. " +
      "Auto-provisions the tracking table on first use. " +
      "Computes SHA-256 hash for idempotency detection.",
    group: "introspection",
    inputSchema: MigrationRecordSchemaBase,
    outputSchema: MigrationRecordOutputSchema,
    annotations,
    icons: getToolIcons("introspection", annotations),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        let parsed;
        try {
          parsed = MigrationRecordSchema.parse(params);
        } catch (error: unknown) {
          if (
            error !== null &&
            typeof error === "object" &&
            "issues" in error &&
            Array.isArray((error as { issues: unknown[] }).issues)
          ) {
            const issues = (error as { issues: { message: string }[] }).issues;
            const messages = issues.map((i) => i.message).join("; ");
            return {
              success: false,
              error: `Validation error: ${messages}`,
            };
          }
          throw error;
        }
        await ensureTrackingTable(adapter);

        const migrationHash = hashMigrationSql(parsed.migrationSql);

        // Check for duplicate hash
        const dupCheck = await adapter.executeQuery(
          `SELECT id, version, status FROM ${TRACKING_TABLE}
         WHERE migration_hash = $1 AND status = 'applied'`,
          [migrationHash],
        );
        const dupRows = dupCheck.rows ?? [];
        if (dupRows.length > 0) {
          const dup = dupRows[0] ?? {};
          const dupId = dup["id"] as number;
          const dupVersion = dup["version"] as string;
          return {
            success: false,
            error:
              `Duplicate migration detected: version "${dupVersion}" (id: ${String(dupId)}) has the same SQL hash. ` +
              `Use a different migration SQL or roll back the existing one first.`,
          };
        }

        const result = await adapter.executeQuery(
          `INSERT INTO ${TRACKING_TABLE}
         (version, description, applied_by, migration_hash, migration_sql, source_system, rollback_sql)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
          [
            parsed.version,
            parsed.description ?? null,
            parsed.appliedBy ?? null,
            migrationHash,
            parsed.migrationSql,
            parsed.sourceSystem ?? null,
            parsed.rollbackSql ?? null,
          ],
        );

        const resultRows = result.rows ?? [];
        if (resultRows.length === 0) {
          return {
            success: false,
            error: "Failed to insert migration record.",
          };
        }
        const row = resultRows[0] ?? {};
        return {
          success: true,
          record: formatRecord(row),
        };
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, {
            tool: "pg_migration_record",
          }),
        };
      }
    },
  };
}

// =============================================================================
// pg_migration_apply
// =============================================================================

export function createMigrationApplyTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  const annotations = destructive("Apply migration");
  return {
    name: "pg_migration_apply",
    description:
      "Execute migration SQL and record it atomically in a single transaction. " +
      "Auto-provisions the tracking table on first use. " +
      "On failure, rolls back and records a 'failed' entry. " +
      "Use pg_migration_record instead if you only need to log an already-applied migration.",
    group: "introspection",
    inputSchema: MigrationApplySchemaBase,
    outputSchema: MigrationApplyOutputSchema,
    annotations,
    icons: getToolIcons("introspection", annotations),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        let parsed;
        try {
          parsed = MigrationApplySchema.parse(params);
        } catch (error: unknown) {
          if (
            error !== null &&
            typeof error === "object" &&
            "issues" in error &&
            Array.isArray((error as { issues: unknown[] }).issues)
          ) {
            const issues = (error as { issues: { message: string }[] }).issues;
            const messages = issues.map((i) => i.message).join("; ");
            return {
              success: false,
              error: `Validation error: ${messages}`,
            };
          }
          throw error;
        }
        await ensureTrackingTable(adapter);

        const migrationHash = hashMigrationSql(parsed.migrationSql);

        // Check for duplicate hash
        const dupCheck = await adapter.executeQuery(
          `SELECT id, version, status FROM ${TRACKING_TABLE}
         WHERE migration_hash = $1 AND status = 'applied'`,
          [migrationHash],
        );
        const dupRows = dupCheck.rows ?? [];
        if (dupRows.length > 0) {
          const dup = dupRows[0] ?? {};
          const dupId = dup["id"] as number;
          const dupVersion = dup["version"] as string;
          return {
            success: false,
            error:
              `Duplicate migration detected: version "${dupVersion}" (id: ${String(dupId)}) has the same SQL hash. ` +
              `Use a different migration SQL or roll back the existing one first.`,
          };
        }

        // Execute migration SQL and record atomically
        try {
          await adapter.executeQuery("BEGIN");

          // Execute the migration SQL
          await adapter.executeQuery(parsed.migrationSql);

          // Record in tracking table
          const result = await adapter.executeQuery(
            `INSERT INTO ${TRACKING_TABLE}
           (version, description, applied_by, migration_hash, migration_sql, source_system, rollback_sql)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
            [
              parsed.version,
              parsed.description ?? null,
              parsed.appliedBy ?? null,
              migrationHash,
              parsed.migrationSql,
              parsed.sourceSystem ?? null,
              parsed.rollbackSql ?? null,
            ],
          );

          await adapter.executeQuery("COMMIT");

          const resultRows = result.rows ?? [];
          if (resultRows.length === 0) {
            return {
              success: false,
              error:
                "Migration was applied but failed to insert tracking record.",
            };
          }
          const row = resultRows[0] ?? {};
          return {
            success: true,
            record: formatRecord(row),
          };
        } catch (err: unknown) {
          // Roll back the entire transaction (migration SQL + INSERT)
          await adapter.executeQuery("ROLLBACK");

          const message = err instanceof Error ? err.message : "Unknown error";

          // Record a 'failed' entry outside the rolled-back transaction
          try {
            await adapter.executeQuery(
              `INSERT INTO ${TRACKING_TABLE}
             (version, description, applied_by, migration_hash, migration_sql, source_system, rollback_sql, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'failed')`,
              [
                parsed.version,
                parsed.description ?? null,
                parsed.appliedBy ?? null,
                migrationHash,
                parsed.migrationSql,
                parsed.sourceSystem ?? null,
                parsed.rollbackSql ?? null,
              ],
            );
          } catch {
            // Best-effort: if we can't record the failure, still return the error
          }

          return {
            success: false,
            error: `Migration "${parsed.version}" failed: ${message}. Transaction was rolled back.`,
          };
        }
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, {
            tool: "pg_migration_apply",
          }),
        };
      }
    },
  };
}

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
    group: "introspection",
    inputSchema: MigrationRollbackSchemaBase,
    outputSchema: MigrationRollbackOutputSchema,
    annotations,
    icons: getToolIcons("introspection", annotations),
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

        // Find the migration
        const whereClause =
          parsed.id !== undefined ? "id = $1" : "version = $1";
        const whereValue = parsed.id ?? parsed.version;

        const findResult = await adapter.executeQuery(
          `SELECT * FROM ${TRACKING_TABLE} WHERE ${whereClause} ORDER BY id DESC LIMIT 1`,
          [whereValue],
        );

        const findRows = findResult.rows ?? [];
        if (findRows.length === 0) {
          const identifier =
            parsed.id !== undefined
              ? `id ${String(parsed.id)}`
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
    group: "introspection",
    inputSchema: MigrationHistorySchemaBase,
    outputSchema: MigrationHistoryOutputSchema,
    annotations,
    icons: getToolIcons("introspection", annotations),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = MigrationHistorySchema.parse(params);
        await ensureTrackingTable(adapter);

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
    group: "introspection",
    inputSchema: MigrationStatusSchemaBase,
    outputSchema: MigrationStatusOutputSchema,
    annotations,
    icons: getToolIcons("introspection", annotations),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = MigrationStatusSchema.parse(params);
        const targetSchema = parsed.schema ?? "public";

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
            : `${targetSchema}.${TRACKING_TABLE}`;

        // Get aggregate status
        const statsResult = await adapter.executeQuery(
          `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'applied')::int AS applied,
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
