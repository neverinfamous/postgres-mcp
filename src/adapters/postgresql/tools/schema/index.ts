/**
 * PostgreSQL Schema Management Tools
 *
 * Schema DDL operations: schemas, sequences, views, functions, triggers.
 * 12 tools total.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

// Schema & sequence management tools
import {
  createListSchemasTool,
  createCreateSchemaTool,
  createDropSchemaTool,
  createListSequencesTool,
  createCreateSequenceTool,
  createDropSequenceTool,
} from "./objects.js";

// Views CRUD
import {
  createListViewsTool,
  createCreateViewTool,
  createDropViewTool,
} from "./views.js";

// Catalog listing (functions, triggers, constraints)
import {
  createListFunctionsTool,
  createListTriggersTool,
  createListConstraintsTool,
} from "./catalog.js";

/**
 * Get all schema management tools
 */
export function getSchemaTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    createListSchemasTool(adapter),
    createCreateSchemaTool(adapter),
    createDropSchemaTool(adapter),
    createListSequencesTool(adapter),
    createCreateSequenceTool(adapter),
    createDropSequenceTool(adapter),
    createListViewsTool(adapter),
    createCreateViewTool(adapter),
    createDropViewTool(adapter),
    createListFunctionsTool(adapter),
    createListTriggersTool(adapter),
    createListConstraintsTool(adapter),
  ];
}

// Re-export individual tool creators for direct imports
export {
  createListSchemasTool,
  createCreateSchemaTool,
  createDropSchemaTool,
  createListSequencesTool,
  createCreateSequenceTool,
  createDropSequenceTool,
  createListViewsTool,
  createCreateViewTool,
  createDropViewTool,
  createListFunctionsTool,
  createListTriggersTool,
  createListConstraintsTool,
};
