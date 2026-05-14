/**
 * PostgreSQL Document Store Tools
 *
 * NoSQL-style JSONB document collection management.
 * 9 tools total: collection CRUD (4), document CRUD (4), indexing (1).
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

// Import from submodules
import {
  createListCollectionsTool,
  createCreateCollectionTool,
  createDropCollectionTool,
  createCollectionInfoTool,
} from "./collection.js";

import {
  createFindTool,
  createAddTool,
  createModifyTool,
  createRemoveTool,
} from "./documents.js";

import { createDocIndexTool } from "./indexes.js";

/**
 * Get all document store tools
 */
export function getDocStoreTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    createListCollectionsTool(adapter),
    createCreateCollectionTool(adapter),
    createDropCollectionTool(adapter),
    createCollectionInfoTool(adapter),
    createFindTool(adapter),
    createAddTool(adapter),
    createModifyTool(adapter),
    createRemoveTool(adapter),
    createDocIndexTool(adapter),
  ];
}

// Re-export individual tool creators for direct imports
export {
  createListCollectionsTool,
  createCreateCollectionTool,
  createDropCollectionTool,
  createCollectionInfoTool,
  createFindTool,
  createAddTool,
  createModifyTool,
  createRemoveTool,
  createDocIndexTool,
};
