/**
 * PostgreSQL Backup Tools
 *
 * COPY operations, dump commands, and backup planning.
 * 9 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

// Dump operations
import {
  createDumpTableTool,
  createDumpSchemaTool,
} from "./dump.js";

// COPY operations
import {
  createCopyExportTool,
  createCopyImportTool,
} from "./copy.js";

// Backup planning
import {
  createBackupPlanTool,
  createRestoreCommandTool,
  createPhysicalBackupTool,
  createRestoreValidateTool,
  createBackupScheduleOptimizeTool,
} from "./planning.js";

/**
 * Get all backup tools
 */
export function getBackupTools(adapter: PostgresAdapter): ToolDefinition[] {
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
};
