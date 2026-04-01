/**
 * PostgreSQL Audit Backup Tools
 *
 * 3 tools for managing pre-mutation backup snapshots:
 * - pg_audit_list_backups: List available snapshots (read)
 * - pg_audit_restore_backup: Restore a snapshot (admin)
 * - pg_audit_diff_backup: Compare snapshot vs live schema (read)
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition, RequestContext } from "../../../../types/index.js";
// import { z } from "zod";
import { readOnly, admin } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse, formatPostgresError } from "../core/error-helpers.js";
import { ValidationError } from "../../../../types/index.js";
import type { BackupManager } from "../../../../audit/backup-manager.js";
import {
  AuditListBackupsSchemaBase,
  AuditListBackupsSchema,
  AuditRestoreBackupSchema,
  AuditDiffBackupSchema,
  AuditListBackupsOutputSchema,
  AuditRestoreBackupOutputSchema,
  AuditDiffBackupOutputSchema,
} from "../../schemas/index.js";

/**
 * Create pg_audit_list_backups tool — lists available pre-mutation snapshots.
 */
export function createAuditListBackupsTool(
  _adapter: PostgresAdapter,
  backupManager: BackupManager | null,
): ToolDefinition {
  return {
    name: "pg_audit_list_backups",
    description:
      "List available pre-mutation backup snapshots with metadata (tool, target, timestamp, type, size).",
    group: "backup",
    inputSchema: AuditListBackupsSchemaBase,
    outputSchema: AuditListBackupsOutputSchema,
    annotations: readOnly("Audit List Backups"),
    icons: getToolIcons("backup", readOnly("Audit List Backups")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        if (!backupManager) {
          throw new ValidationError("Audit backup not enabled. Start with --audit-log <path> --audit-backup to enable.");
        }

        const parsed = AuditListBackupsSchema.parse(params);
        let snapshots = await backupManager.listSnapshots();

        // Apply optional filters
        if (parsed.tool) {
          snapshots = snapshots.filter((s) => s.tool === parsed.tool);
        }
        if (parsed.target) {
          const targetFilter = parsed.target.toLowerCase();
          snapshots = snapshots.filter((s) =>
            s.target.toLowerCase().includes(targetFilter),
          );
        } else if (!parsed.tool) {
          // Default: filter out verbose anonymous snapshots from Code Mode tracking
          snapshots = snapshots.filter((s) => s.target !== "unknown");
        }
        
        if (parsed.limit !== undefined && (parsed.limit < 0 || parsed.limit > 500)) {
          throw new ValidationError("limit must be between 0 (no limit, capped at 500) and 500");
        }

        const count = snapshots.length;
        const requestedLimit = parsed.limit ?? 50;
        const limit = requestedLimit === 0 ? 500 : requestedLimit;
        
        let truncated = false;
        if (snapshots.length > limit) {
          snapshots = snapshots.slice(0, limit);
          truncated = true;
        }

        return {
          success: true,
          snapshots,
          count,
          limit,
          ...(truncated && { truncated: true }),
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_audit_list_backups" });
      }
    },
  };
}

/**
 * Create pg_audit_restore_backup tool — restores DDL from a snapshot.
 */
export function createAuditRestoreBackupTool(
  adapter: PostgresAdapter,
  backupManager: BackupManager | null,
): ToolDefinition {
  return {
    name: "pg_audit_restore_backup",
    description:
      "Restore a pre-mutation backup snapshot. Executes the captured DDL (and optional data INSERTs) within a transaction.",
    group: "backup",
    inputSchema: AuditRestoreBackupSchema,
    outputSchema: AuditRestoreBackupOutputSchema,
    annotations: admin("Audit Restore Backup"),
    icons: getToolIcons("backup", admin("Audit Restore Backup")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        if (!backupManager) {
          throw new ValidationError("Audit backup not enabled. Start with --audit-log <path> --audit-backup to enable.");
        }

        const parsed = AuditRestoreBackupSchema.parse(params);
        if (!parsed.filename) {
          throw new ValidationError("filename parameter is required");
        }

        if (!parsed.dryRun && !parsed.restoreAs && !parsed.confirm) {
          throw new ValidationError("confirm: true is required for in-place destructive restores");
        }

        const snapshot = await backupManager.getSnapshot(parsed.filename);
        if (!snapshot) {
          throw new Error(`Query failed: Snapshot not found: ${parsed.filename}`);
        }

        // §2: Rewrite DDL/data for restoreAs (side-by-side restore)
        let ddl = snapshot.ddl;
        let dataStatements = snapshot.data;
        const originalTarget = snapshot.metadata.target;
        const originalSchema = snapshot.metadata.schema;
        const originalQualified = `"${originalSchema}"."${originalTarget}"`;

        if (parsed.restoreAs) {
          const restoreName = parsed.restoreAs;
          const restoreQualified = `"${originalSchema}"."${restoreName}"`;
          // Rewrite DDL: replace table name in CREATE TABLE statement
          ddl = ddl.replaceAll(originalQualified, restoreQualified);

          // Prevent sequence collisions on side-by-side restores by rewriting sequence names
          const safeOriginalTarget = originalTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const seqPattern1 = new RegExp(`${safeOriginalTarget}_id_seq`, 'g');
          const seqPattern2 = new RegExp(`${safeOriginalTarget}_seq`, 'g');
          ddl = ddl.replace(seqPattern1, `${restoreName}_id_seq`);
          ddl = ddl.replace(seqPattern2, `${restoreName}_seq`);
          
          // Rewrite data INSERT statements if present
          if (dataStatements) {
            dataStatements = dataStatements.replaceAll(originalQualified, restoreQualified);
          }
        } else {
          // If we are doing in-place restore (no restoreAs)
          // The target object could be a TABLE, VIEW, MATERIALIZED VIEW, or SEQUENCE.
          // Since we might not know exactly which one, generate conditional drops for all possibilities.
          ddl = `DROP TABLE IF EXISTS ${originalQualified} CASCADE;\n` +
                `DROP VIEW IF EXISTS ${originalQualified} CASCADE;\n` +
                `DROP MATERIALIZED VIEW IF EXISTS ${originalQualified} CASCADE;\n` +
                `DROP SEQUENCE IF EXISTS ${originalQualified} CASCADE;\n` + 
                `DROP SEQUENCE IF EXISTS "${originalSchema}"."${originalTarget}_id_seq" CASCADE;\n` +
                `DROP SEQUENCE IF EXISTS "${originalSchema}"."${originalTarget}_seq" CASCADE;\n` + ddl;
          
          // Inject IF NOT EXISTS into sequence creation to prevent crashes on orphaned sequences
          ddl = ddl.replace(/CREATE SEQUENCE (?!IF NOT EXISTS)/gi, "CREATE SEQUENCE IF NOT EXISTS ");
        }

        // Dry run: return DDL without executing
        if (parsed.dryRun === true) {
          return {
            success: true,
            dryRun: true,
            metadata: snapshot.metadata,
            ddl,
            ...(dataStatements && { dataStatements: dataStatements.split("\n").length }),
            ...(parsed.restoreAs && { restoreAs: parsed.restoreAs }),
          };
        }

        // Execute restore in a transaction
        await adapter.executeQuery("BEGIN");
        try {
          // Execute DDL
          await adapter.executeQuery(ddl);

          // Execute data INSERTs if present
          if (dataStatements) {
            const statements = dataStatements.split("\n").filter((s) => s.trim());
            for (const stmt of statements) {
              await adapter.executeQuery(stmt);
            }
          }

          await adapter.executeQuery("COMMIT");

          // Invalidate cache since we modified table schema/data
          if (parsed.restoreAs) {
            adapter.invalidateTableCache(parsed.restoreAs, snapshot.metadata.schema);
          } else {
            adapter.invalidateTableCache(snapshot.metadata.target, snapshot.metadata.schema);
          }

          return {
            success: true,
            restored: true,
            metadata: snapshot.metadata,
            ddlExecuted: true,
            dataRowsInserted: dataStatements
              ? dataStatements.split("\n").filter((s) => s.trim()).length
              : 0,
            ...(parsed.restoreAs && {
              restoreAs: parsed.restoreAs,
              hint: `Restored as "${originalSchema}"."${parsed.restoreAs}". ` +
                "Use pg_read_query to compare with the live table, then merge needed rows.",
            }),
          };
        } catch (restoreErr) {
          // Rollback on error
          try {
            await adapter.executeQuery("ROLLBACK");
          } catch {
            // Rollback failure is secondary
          }
          const msg = formatPostgresError(restoreErr, { tool: "pg_audit_restore_backup" });
          
          if (msg.includes("already exists") || msg.includes("duplicate") || restoreErr?.toString().includes("already exists")) {
               const err = new ValidationError(`Restore failed: ${msg}`);
               Object.assign(err, { code: "OBJECT_ALREADY_EXISTS" });
               throw err;
          }
          throw new ValidationError(`Restore failed: ${msg}`);
        }
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_audit_restore_backup" });
      }
    },
  };
}

/**
 * Create pg_audit_diff_backup tool — compares snapshot DDL against live schema.
 */
export function createAuditDiffBackupTool(
  adapter: PostgresAdapter,
  backupManager: BackupManager | null,
): ToolDefinition {
  return {
    name: "pg_audit_diff_backup",
    description:
      "Compare a backup snapshot's DDL against the current live schema to show drift since the snapshot was taken.",
    group: "backup",
    inputSchema: AuditDiffBackupSchema,
    outputSchema: AuditDiffBackupOutputSchema,
    annotations: readOnly("Audit Diff Backup"),
    icons: getToolIcons("backup", readOnly("Audit Diff Backup")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        if (!backupManager) {
          throw new ValidationError("Audit backup not enabled. Start with --audit-log <path> --audit-backup to enable.");
        }

        const parsed = AuditDiffBackupSchema.parse(params);
        if (!parsed.filename) {
          throw new ValidationError("filename parameter is required");
        }

        const snapshot = await backupManager.getSnapshot(parsed.filename);
        if (!snapshot) {
          throw new Error(`Query failed: Snapshot not found: ${parsed.filename}`);
        }

        // Get current live schema for the target object
        const target = snapshot.metadata.target;
        const schema = snapshot.metadata.schema;

        let currentDdl: string;
        let objectExists = true;

        try {
          // Use adapter's describeTable to get current state
          const tableInfo = await adapter.describeTable(target, schema);
          const columns = tableInfo.columns ?? [];

          if (columns.length === 0) {
            objectExists = false;
            currentDdl = `-- Object "${schema}"."${target}" does not exist (dropped?)`;
          } else {
            const ddlLines = columns.map((col) => {
              let line = `    "${col.name}" ${col.type}`;
              if (col.defaultValue !== undefined && col.defaultValue !== null) {
                const defVal = typeof col.defaultValue === "object"
                  ? JSON.stringify(col.defaultValue)
                  : String(col.defaultValue as string | number | boolean);
                line += ` DEFAULT ${defVal}`;
              }
              if (!col.nullable) line += " NOT NULL";
              return line;
            });
            currentDdl = `CREATE TABLE "${schema}"."${target}" (\n${ddlLines.join(",\n")}\n);`;
          }
        } catch {
          objectExists = false;
          currentDdl = `-- Object "${schema}"."${target}" does not exist or cannot be described`;
        }

        // Simple line-based diff
        const snapshotLines = snapshot.ddl.split("\n");
        const currentLines = currentDdl.split("\n");

        const additions: string[] = [];
        const removals: string[] = [];

        // Find lines in current that aren't in snapshot (additions)
        for (const line of currentLines) {
          if (!snapshotLines.includes(line)) {
            additions.push(line.trim());
          }
        }

        // Find lines in snapshot that aren't in current (removals)
        for (const line of snapshotLines) {
          if (!currentLines.includes(line)) {
            removals.push(line.trim());
          }
        }

        const hasDrift = additions.length > 0 || removals.length > 0;

        // §3: Volume drift analysis — compare snapshot metadata against current pg_class stats
        let volumeDrift: {
          rowCountSnapshot?: number;
          rowCountCurrent?: number;
          sizeBytesSnapshot?: number;
          sizeBytesCurrent?: number;
          summary: string;
        } | undefined;

        if (objectExists && (snapshot.metadata.rowCount !== undefined || snapshot.metadata.totalSizeBytes !== undefined)) {
          try {
            const sizeResult = await adapter.executeQuery(
              `SELECT reltuples::bigint AS row_count,
                      relpages * current_setting('block_size')::int AS total_size_bytes
               FROM pg_class c
               JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relname = $1 AND n.nspname = $2`,
              [target, schema],
            );
            const currentStats = sizeResult.rows?.[0] as { row_count?: number | string; total_size_bytes?: number } | undefined;

            if (currentStats) {
              const rowSnapRaw = snapshot.metadata.rowCount;
              const rowSnap = rowSnapRaw === -1 ? undefined : rowSnapRaw;
              // reltuples::bigint is sent as a string by the pg driver — must parse
              // -1 is PostgreSQL's sentinel meaning "statistics not yet collected (unanalyzed)"
              const rowCurrRaw = currentStats.row_count !== undefined ? parseInt(String(currentStats.row_count), 10) : undefined;
              const rowCurr = rowCurrRaw === -1 ? undefined : rowCurrRaw;
              const sizeSnap = snapshot.metadata.totalSizeBytes;
              const sizeCurr = typeof currentStats.total_size_bytes === "number" ? currentStats.total_size_bytes : undefined;

              // Generate human-readable summary
              const parts: string[] = [];
              if (rowSnap !== undefined && rowCurr !== undefined) {
                if (rowCurr === 0 && rowSnap > 0) {
                  parts.push(`Row count dropped from ${String(rowSnap)} → 0`);
                } else if (rowCurr !== rowSnap) {
                  parts.push(`Row count changed from ${String(rowSnap)} → ${String(rowCurr)}`);
                }
              }
              if (sizeSnap !== undefined && sizeCurr !== undefined && sizeCurr !== sizeSnap) {
                const snapMB = (sizeSnap / (1024 * 1024)).toFixed(1);
                const currMB = (sizeCurr / (1024 * 1024)).toFixed(1);
                parts.push(`Size changed from ${snapMB}MB → ${currMB}MB`);
              }

              volumeDrift = {
                ...(rowSnap !== undefined && { rowCountSnapshot: rowSnap }),
                ...(rowCurr !== undefined && { rowCountCurrent: rowCurr }),
                ...(sizeSnap !== undefined && { sizeBytesSnapshot: sizeSnap }),
                ...(sizeCurr !== undefined && { sizeBytesCurrent: sizeCurr }),
                summary: parts.length > 0 ? parts.join("; ") : "No volume change detected",
              };
            }
          } catch {
            // Volume drift is best-effort
          }
        }

        return {
          success: true,
          metadata: snapshot.metadata,
          objectExists,
          hasDrift,
          ...(hasDrift && {
            diff: {
              additions,
              removals,
            },
          }),
          ...(volumeDrift && { volumeDrift }),
          ...(!parsed.compact && {
            snapshotDdl: snapshot.ddl,
            currentDdl,
          }),
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_audit_diff_backup" });
      }
    },
  };
}
