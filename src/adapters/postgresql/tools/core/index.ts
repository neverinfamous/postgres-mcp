/**
 * PostgreSQL Core Database Tools
 *
 * Fundamental database operations: read, write, table management, indexes, and convenience utilities.
 * 20 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

// Import from sub-modules
import { createReadQueryTool, createWriteQueryTool } from "./query.js";
import {
  createListTablesTool,
  createDescribeTableTool,
  createCreateTableTool,
  createDropTableTool,
} from "./tables.js";
import {
  createGetIndexesTool,
  createCreateIndexTool,
  createDropIndexTool,
} from "./indexes.js";
import {
  createListObjectsTool,
  createObjectDetailsTool,
  createListExtensionsTool,
} from "./objects.js";
import {
  createAnalyzeDbHealthTool,
  createAnalyzeQueryIndexesTool,
} from "./health.js";
import { createAnalyzeWorkloadIndexesTool } from "./workload-indexes.js";
import { getConvenienceTools } from "./utility.js";

// Re-export schemas from core tools (moved to schemas dir)
export {
  ListObjectsSchema,
  ObjectDetailsSchema,
  ObjectDetailsSchemaBase,
  AnalyzeDbHealthSchema,
  AnalyzeWorkloadIndexesSchema,
  AnalyzeQueryIndexesSchema,
  AnalyzeQueryIndexesSchemaBase,
} from "./schemas/index.js";
export { UpsertSchema, BatchInsertSchema } from "./convenience.js";
export { CountSchema, ExistsSchema, TruncateSchema } from "./utility.js";

/**
 * Get all core database tools
 */
export function getCoreTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    createReadQueryTool(adapter),
    createWriteQueryTool(adapter),
    createListTablesTool(adapter),
    createDescribeTableTool(adapter),
    createCreateTableTool(adapter),
    createDropTableTool(adapter),
    createGetIndexesTool(adapter),
    createCreateIndexTool(adapter),
    createDropIndexTool(adapter),
    createListObjectsTool(adapter),
    createObjectDetailsTool(adapter),
    createListExtensionsTool(adapter),
    createAnalyzeDbHealthTool(adapter),
    createAnalyzeWorkloadIndexesTool(adapter),
    createAnalyzeQueryIndexesTool(adapter),
    ...getConvenienceTools(adapter),
  ];
}
