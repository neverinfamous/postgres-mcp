/**
 * PostgreSQL Admin Tools
 *
 * Database maintenance: VACUUM, ANALYZE, REINDEX, configuration, insights.
 * 11 tools total.
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

import { createAppendInsightTool } from "./insights.js";

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
    createAppendInsightTool(),
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
  createAppendInsightTool,
};
