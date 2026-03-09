/**
 * PostgreSQL Migration Tools
 *
 * Schema migration tracking and management tools.
 * 6 tools total.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

import {
  createMigrationInitTool,
  createMigrationRecordTool,
  createMigrationApplyTool,
  createMigrationRollbackTool,
  createMigrationHistoryTool,
  createMigrationStatusTool,
} from "../introspection/migration.js";

/**
 * Get all migration tools
 */
export function getMigrationTools(
  adapter: PostgresAdapter,
): ToolDefinition[] {
  return [
    createMigrationInitTool(adapter),
    createMigrationRecordTool(adapter),
    createMigrationApplyTool(adapter),
    createMigrationRollbackTool(adapter),
    createMigrationHistoryTool(adapter),
    createMigrationStatusTool(adapter),
  ];
}

// Re-export individual tool creators for direct imports
export {
  createMigrationInitTool,
  createMigrationRecordTool,
  createMigrationApplyTool,
  createMigrationRollbackTool,
  createMigrationHistoryTool,
  createMigrationStatusTool,
};
