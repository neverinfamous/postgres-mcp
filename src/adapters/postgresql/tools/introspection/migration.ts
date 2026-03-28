/**
 * PostgreSQL Migration Tools — Schema Version Tracking
 *
 * Migration init, record, and apply tools.
 * 3 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { QueryError } from "../../../../types/index.js";
import { write, destructive } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse, formatPostgresError } from "../core/error-helpers.js";
import { sanitizeIdentifier } from "../../../../utils/identifiers.js";
import {
  MigrationInitSchemaBase,
  MigrationInitSchema,
  MigrationRecordSchemaBase,
  MigrationRecordSchema,
  MigrationApplySchemaBase,
  MigrationApplySchema,
  // Output schemas
  MigrationInitOutputSchema,
  MigrationRecordOutputSchema,
  MigrationApplyOutputSchema,
} from "../../schemas/index.js";
import {
  TRACKING_TABLE,
  buildCreateTrackingTableSql,
  ensureTrackingTable,
  checkDuplicateHash,
  formatRecord,
} from "./migration/helpers.js";

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
    group: "migration",
    inputSchema: MigrationInitSchemaBase,
    outputSchema: MigrationInitOutputSchema,
    annotations,
    icons: getToolIcons("migration", annotations),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = MigrationInitSchema.parse(params);
        const targetSchema = parsed.schema ?? "public";

        // Sanitize schema to prevent SQL injection via identifier interpolation
        const sanitizedSchema = sanitizeIdentifier(targetSchema);

        // Compute qualified table name once, reuse for DDL and queries
        const qualifiedTable =
          targetSchema === "public"
            ? TRACKING_TABLE
            : `${sanitizedSchema}."${TRACKING_TABLE}"`;

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
          await adapter.executeQuery(
            buildCreateTrackingTableSql(qualifiedTable),
          );
        }

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
        return formatHandlerErrorResponse(error, {
            tool: "pg_migration_init",
          });
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
      "Record a migration in the schema version tracking table with status 'recorded' (metadata only, SQL not executed). " +
      "Use pg_migration_apply instead to execute SQL and record with status 'applied'. " +
      "Auto-provisions the tracking table on first use. " +
      "Computes SHA-256 hash for idempotency detection.",
    group: "migration",
    inputSchema: MigrationRecordSchemaBase,
    outputSchema: MigrationRecordOutputSchema,
    annotations,
    icons: getToolIcons("migration", annotations),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = MigrationRecordSchema.parse(params);
        await ensureTrackingTable(adapter);

        const { migrationHash, duplicateError } = await checkDuplicateHash(
          adapter,
          parsed.migrationSql,
        );
        if (duplicateError) return duplicateError;

        const result = await adapter.executeQuery(
          `INSERT INTO ${TRACKING_TABLE}
         (version, description, applied_by, migration_hash, migration_sql, source_system, rollback_sql, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'recorded')
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
        return formatHandlerErrorResponse(error, {
            tool: "pg_migration_record",
          });
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
    group: "migration",
    inputSchema: MigrationApplySchemaBase,
    outputSchema: MigrationApplyOutputSchema,
    annotations,
    icons: getToolIcons("migration", annotations),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = MigrationApplySchema.parse(params);
        await ensureTrackingTable(adapter);

        const { migrationHash, duplicateError } = await checkDuplicateHash(
          adapter,
          parsed.migrationSql,
        );
        if (duplicateError) return duplicateError;

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

          const message = formatPostgresError(err, { tool: "pg_migration_apply" });

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

          throw new QueryError(`Migration "${parsed.version}" failed: ${message}. Transaction was rolled back.`);
        }
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_migration_apply",
          });
      }
    },
  };
}
