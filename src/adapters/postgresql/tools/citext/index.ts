/**
 * PostgreSQL citext Extension Tools
 *
 * Case-insensitive text operations. 6 tools total.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

import {
  createCitextExtensionTool,
  createCitextConvertColumnTool,
} from "./setup.js";

import {
  createCitextListColumnsTool,
  createCitextAnalyzeCandidatesTool,
  createCitextCompareTool,
  createCitextSchemaAdvisorTool,
} from "./analysis.js";

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
