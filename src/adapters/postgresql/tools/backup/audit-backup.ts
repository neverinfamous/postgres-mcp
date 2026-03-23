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
import { z } from "zod";
import { readOnly, admin } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import type { BackupManager } from "../../../../audit/backup-manager.js";
import {
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
    inputSchema: z.object({
      tool: z.string().optional().describe("Filter by tool name"),
      target: z.string().optional().describe("Filter by target object name"),
    }),
    outputSchema: AuditListBackupsOutputSchema,
    annotations: readOnly("Audit List Backups"),
    icons: getToolIcons("backup", readOnly("Audit List Backups")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        if (!backupManager) {
          return {
            success: false,
            error:
              "Audit backup not enabled. Start with --audit-log <path> --audit-backup to enable.",
          };
        }

        const parsed = params as { tool?: string; target?: string };
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
        }

        return {
          success: true,
          snapshots,
          count: snapshots.length,
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
    inputSchema: z.object({
      filename: z.string().describe("Snapshot filename from pg_audit_list_backups"),
      dryRun: z
        .boolean()
        .optional()
        .describe("If true, return the DDL without executing it (default: false)"),
    }),
    outputSchema: AuditRestoreBackupOutputSchema,
    annotations: admin("Audit Restore Backup"),
    icons: getToolIcons("backup", admin("Audit Restore Backup")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        if (!backupManager) {
          return {
            success: false,
            error:
              "Audit backup not enabled. Start with --audit-log <path> --audit-backup to enable.",
          };
        }

        const parsed = params as { filename?: string; dryRun?: boolean };
        if (!parsed.filename) {
          return {
            success: false,
            error: "filename parameter is required",
          };
        }

        const snapshot = await backupManager.getSnapshot(parsed.filename);
        if (!snapshot) {
          return {
            success: false,
            error: `Snapshot not found: ${parsed.filename}`,
          };
        }

        // Dry run: return DDL without executing
        if (parsed.dryRun === true) {
          return {
            success: true,
            dryRun: true,
            metadata: snapshot.metadata,
            ddl: snapshot.ddl,
            ...(snapshot.data && { dataStatements: snapshot.data.split("\n").length }),
          };
        }

        // Execute restore in a transaction
        await adapter.executeQuery("BEGIN");
        try {
          // Execute DDL
          await adapter.executeQuery(snapshot.ddl);

          // Execute data INSERTs if present
          if (snapshot.data) {
            const statements = snapshot.data.split("\n").filter((s) => s.trim());
            for (const stmt of statements) {
              await adapter.executeQuery(stmt);
            }
          }

          await adapter.executeQuery("COMMIT");

          return {
            success: true,
            restored: true,
            metadata: snapshot.metadata,
            ddlExecuted: true,
            dataRowsInserted: snapshot.data
              ? snapshot.data.split("\n").filter((s) => s.trim()).length
              : 0,
          };
        } catch (restoreErr) {
          // Rollback on error
          try {
            await adapter.executeQuery("ROLLBACK");
          } catch {
            // Rollback failure is secondary
          }
          const msg = restoreErr instanceof Error ? restoreErr.message : String(restoreErr);
          return {
            success: false,
            error: `Restore failed: ${msg}`,
            metadata: snapshot.metadata,
            hint: "Use dryRun: true to inspect the DDL before executing",
          };
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
    inputSchema: z.object({
      filename: z.string().describe("Snapshot filename from pg_audit_list_backups"),
    }),
    outputSchema: AuditDiffBackupOutputSchema,
    annotations: readOnly("Audit Diff Backup"),
    icons: getToolIcons("backup", readOnly("Audit Diff Backup")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        if (!backupManager) {
          return {
            success: false,
            error:
              "Audit backup not enabled. Start with --audit-log <path> --audit-backup to enable.",
          };
        }

        const parsed = params as { filename?: string };
        if (!parsed.filename) {
          return {
            success: false,
            error: "filename parameter is required",
          };
        }

        const snapshot = await backupManager.getSnapshot(parsed.filename);
        if (!snapshot) {
          return {
            success: false,
            error: `Snapshot not found: ${parsed.filename}`,
          };
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
          snapshotDdl: snapshot.ddl,
          currentDdl,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_audit_diff_backup" });
      }
    },
  };
}
