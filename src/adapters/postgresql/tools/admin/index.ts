/**
 * PostgreSQL Admin Tools
 *
 * Database maintenance: VACUUM, ANALYZE, REINDEX, configuration.
 * 10 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

import {
  createVacuumTool,
  createVacuumAnalyzeTool,
  createAnalyzeTool,
} from "./vacuum-tools.js";

import {
  createReindexTool,
  createTerminateBackendTool,
  createCancelBackendTool,
} from "./backend-tools.js";

import {
  createReloadConfTool,
  createSetConfigTool,
  createResetStatsTool,
  createClusterTool,
} from "./config-tools.js";

/**
 * Get all admin tools
 */
export function getAdminTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    createVacuumTool(adapter),
    createVacuumAnalyzeTool(adapter),
    createAnalyzeTool(adapter),
    createReindexTool(adapter),
    createTerminateBackendTool(adapter),
    createCancelBackendTool(adapter),
    createReloadConfTool(adapter),
    createSetConfigTool(adapter),
    createResetStatsTool(adapter),
    createClusterTool(adapter),
  ];
}

// Re-export individual tool creators
export {
  createVacuumTool,
  createVacuumAnalyzeTool,
  createAnalyzeTool,
  createReindexTool,
  createTerminateBackendTool,
  createCancelBackendTool,
  createReloadConfTool,
  createSetConfigTool,
  createResetStatsTool,
  createClusterTool,
};
