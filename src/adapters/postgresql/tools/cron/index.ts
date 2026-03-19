/**
 * PostgreSQL pg_cron Extension Tools
 *
 * Job scheduling and management using pg_cron.
 * 8 tools total.
 *
 * pg_cron enables scheduling of SQL commands using familiar cron syntax.
 * Supports standard cron (minute granularity) and interval scheduling.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

// Scheduling tools
import {
  createCronExtensionTool,
  createCronScheduleTool,
  createCronScheduleInDatabaseTool,
  createCronUnscheduleTool,
} from "./scheduling.js";

// Management tools
import {
  createCronAlterJobTool,
  createCronListJobsTool,
  createCronJobRunDetailsTool,
  createCronCleanupHistoryTool,
} from "./management.js";

/**
 * Get all pg_cron tools
 */
export function getCronTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    createCronExtensionTool(adapter),
    createCronScheduleTool(adapter),
    createCronScheduleInDatabaseTool(adapter),
    createCronUnscheduleTool(adapter),
    createCronAlterJobTool(adapter),
    createCronListJobsTool(adapter),
    createCronJobRunDetailsTool(adapter),
    createCronCleanupHistoryTool(adapter),
  ];
}

// Re-export individual tool creators
export {
  createCronExtensionTool,
  createCronScheduleTool,
  createCronScheduleInDatabaseTool,
  createCronUnscheduleTool,
  createCronAlterJobTool,
  createCronListJobsTool,
  createCronJobRunDetailsTool,
  createCronCleanupHistoryTool,
};
