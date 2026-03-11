/**
 * PostgreSQL pg_partman Extension Tools
 *
 * Automated partition lifecycle management using pg_partman.
 * 10 tools total.
 *
 * pg_partman provides automated creation, maintenance, and retention
 * of partitioned tables. Supports time-based and integer-based partitioning.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

// Setup & creation tools
import {
  createPartmanExtensionTool,
  createPartmanCreateParentTool,
} from "./create.js";

// Management & inspection tools
import {
  createPartmanRunMaintenanceTool,
  createPartmanShowPartitionsTool,
  createPartmanShowConfigTool,
} from "./management.js";

// Operations tools (check default, partition data)
import {
  createPartmanCheckDefaultTool,
  createPartmanPartitionDataTool,
} from "./operations.js";

// Maintenance tools (retention, undo, analyze health)
import {
  createPartmanSetRetentionTool,
  createPartmanUndoPartitionTool,
  createPartmanAnalyzeHealthTool,
} from "./maintenance.js";

/**
 * Get all pg_partman tools
 */
export function getPartmanTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    createPartmanExtensionTool(adapter),
    createPartmanCreateParentTool(adapter),
    createPartmanRunMaintenanceTool(adapter),
    createPartmanShowPartitionsTool(adapter),
    createPartmanShowConfigTool(adapter),
    createPartmanCheckDefaultTool(adapter),
    createPartmanPartitionDataTool(adapter),
    createPartmanSetRetentionTool(adapter),
    createPartmanUndoPartitionTool(adapter),
    createPartmanAnalyzeHealthTool(adapter),
  ];
}

// Re-export individual tool creators
export {
  createPartmanExtensionTool,
  createPartmanCreateParentTool,
  createPartmanRunMaintenanceTool,
  createPartmanShowPartitionsTool,
  createPartmanShowConfigTool,
  createPartmanCheckDefaultTool,
  createPartmanPartitionDataTool,
  createPartmanSetRetentionTool,
  createPartmanUndoPartitionTool,
  createPartmanAnalyzeHealthTool,
};
