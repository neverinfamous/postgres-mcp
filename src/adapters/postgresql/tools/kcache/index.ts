/**
 * PostgreSQL pg_stat_kcache Tools - Barrel Export
 *
 * OS-level performance visibility: CPU, memory, and I/O statistics per query.
 * 7 tools total.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type { ToolDefinition } from "../../../../types/index.js";
import {
  createKcacheQueryStatsTool,
  createKcacheTopCpuTool,
  createKcacheTopIoTool,
} from "./query.js";
import {
  createKcacheExtensionTool,
  createKcacheDatabaseStatsTool,
  createKcacheResourceAnalysisTool,
  createKcacheResetTool,
} from "./admin.js";

/**
 * Get all pg_stat_kcache tools
 */
export function getKcacheTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    createKcacheExtensionTool(adapter),
    createKcacheQueryStatsTool(adapter),
    createKcacheTopCpuTool(adapter),
    createKcacheTopIoTool(adapter),
    createKcacheDatabaseStatsTool(adapter),
    createKcacheResourceAnalysisTool(adapter),
    createKcacheResetTool(adapter),
  ];
}
