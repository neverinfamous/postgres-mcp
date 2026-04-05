/**
 * PostgreSQL Backup Tools
 *
 * COPY operations, dump commands, backup planning, and audit backup management.
 * 12 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition } from "../../../../types/index.js";
import type { BackupManager } from "../../../../audit/backup-manager.js";

// Dump operations
import { createDumpTableTool, createDumpSchemaTool } from "./dump.js";

// COPY operations
import { createCopyExportTool, createCopyImportTool } from "./copy.js";

// Backup planning
import {
  createBackupPlanTool,
  createRestoreCommandTool,
  createPhysicalBackupTool,
  createRestoreValidateTool,
  createBackupScheduleOptimizeTool,
} from "./planning.js";

// Audit backup management
import {
  createAuditListBackupsTool,
  createAuditRestoreBackupTool,
  createAuditDiffBackupTool,
} from "./audit-backup.js";

/**
 * Get all backup tools
 */
export function getBackupTools(
  adapter: PostgresAdapter,
  backupManager?: BackupManager | null,
): ToolDefinition[] {
  return [
    createDumpTableTool(adapter),
    createDumpSchemaTool(adapter),
    createCopyExportTool(adapter),
    createCopyImportTool(adapter),
    createBackupPlanTool(adapter),
    createRestoreCommandTool(adapter),
    createPhysicalBackupTool(adapter),
    createRestoreValidateTool(adapter),
    createBackupScheduleOptimizeTool(adapter),
    createAuditListBackupsTool(adapter, backupManager ?? null),
    createAuditRestoreBackupTool(adapter, backupManager ?? null),
    createAuditDiffBackupTool(adapter, backupManager ?? null),
  ];
}

// Re-export individual tool creators
export {
  createDumpTableTool,
  createDumpSchemaTool,
  createCopyExportTool,
  createCopyImportTool,
  createBackupPlanTool,
  createRestoreCommandTool,
  createPhysicalBackupTool,
  createRestoreValidateTool,
  createBackupScheduleOptimizeTool,
  createAuditListBackupsTool,
  createAuditRestoreBackupTool,
  createAuditDiffBackupTool,
};
