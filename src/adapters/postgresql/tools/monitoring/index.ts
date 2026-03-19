/**
 * PostgreSQL Monitoring Tools
 *
 * Database health, sizes, connections, and replication status.
 * 11 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

// Basic monitoring tools
import {
  createDatabaseSizeTool,
  createTableSizesTool,
  createConnectionStatsTool,
  createReplicationStatusTool,
  createServerVersionTool,
  createShowSettingsTool,
  createUptimeTool,
  createRecoveryStatusTool,
} from "./basic.js";

// Advanced analysis tools
import { createCapacityPlanningTool } from "./capacity-planning.js";
import { createResourceUsageAnalyzeTool } from "./resource-usage.js";
import { createAlertThresholdSetTool } from "./alert-thresholds.js";

/**
 * Get all monitoring tools
 */
export function getMonitoringTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    createDatabaseSizeTool(adapter),
    createTableSizesTool(adapter),
    createConnectionStatsTool(adapter),
    createReplicationStatusTool(adapter),
    createServerVersionTool(adapter),
    createShowSettingsTool(adapter),
    createUptimeTool(adapter),
    createRecoveryStatusTool(adapter),
    createCapacityPlanningTool(adapter),
    createResourceUsageAnalyzeTool(adapter),
    createAlertThresholdSetTool(adapter),
  ];
}

// Re-export individual tool creators for direct imports
export {
  createDatabaseSizeTool,
  createTableSizesTool,
  createConnectionStatsTool,
  createReplicationStatusTool,
  createServerVersionTool,
  createShowSettingsTool,
  createUptimeTool,
  createRecoveryStatusTool,
  createCapacityPlanningTool,
  createResourceUsageAnalyzeTool,
  createAlertThresholdSetTool,
};
