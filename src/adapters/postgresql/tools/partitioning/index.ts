/**
 * PostgreSQL Partitioning Tools
 *
 * Table partitioning management. 6 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

import {
  createListPartitionsTool,
  createPartitionedTableTool,
  createPartitionTool,
} from "./management.js";

import {
  createAttachPartitionTool,
  createDetachPartitionTool,
  createPartitionInfoTool,
} from "./info.js";

/**
 * Get all partitioning tools
 */
export function getPartitioningTools(
  adapter: PostgresAdapter,
): ToolDefinition[] {
  return [
    createListPartitionsTool(adapter),
    createPartitionedTableTool(adapter),
    createPartitionTool(adapter),
    createAttachPartitionTool(adapter),
    createDetachPartitionTool(adapter),
    createPartitionInfoTool(adapter),
  ];
}

// Re-export individual tool creators
export {
  createListPartitionsTool,
  createPartitionedTableTool,
  createPartitionTool,
  createAttachPartitionTool,
  createDetachPartitionTool,
  createPartitionInfoTool,
};
