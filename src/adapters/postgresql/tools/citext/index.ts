/**
 * PostgreSQL citext Extension Tools
 *
 * Case-insensitive text operations. 6 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

import {
  createCitextExtensionTool,
  createCitextConvertColumnTool,
} from "./setup.js";

import {
  createCitextListColumnsTool,
  createCitextCompareTool,
} from "./list-compare.js";

import {
  createCitextAnalyzeCandidatesTool,
  createCitextSchemaAdvisorTool,
} from "./candidates-advisor.js";

/**
 * Get all citext tools
 */
export function getCitextTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    createCitextExtensionTool(adapter),
    createCitextConvertColumnTool(adapter),
    createCitextListColumnsTool(adapter),
    createCitextAnalyzeCandidatesTool(adapter),
    createCitextCompareTool(adapter),
    createCitextSchemaAdvisorTool(adapter),
  ];
}

// Re-export individual tool creators
export {
  createCitextExtensionTool,
  createCitextConvertColumnTool,
  createCitextListColumnsTool,
  createCitextAnalyzeCandidatesTool,
  createCitextCompareTool,
  createCitextSchemaAdvisorTool,
};
