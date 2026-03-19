/**
 * PostgreSQL JSONB Tools
 *
 * JSONB operations including path queries, containment, and aggregation.
 * 19 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

// Read JSONB operations
import {
  createJsonbExtractTool,
  createJsonbContainsTool,
  createJsonbPathQueryTool,
} from "./read.js";
import {
  createJsonbAggTool,
  createJsonbKeysTool,
  createJsonbTypeofTool,
} from "./query.js";

// Write JSONB operations
import {
  createJsonbSetTool,
  createJsonbInsertTool,
  createJsonbDeleteTool,
  createJsonbObjectTool,
  createJsonbArrayTool,
  createJsonbStripNullsTool,
} from "./write.js";

// JSONB transform operations (validate path, merge, normalize, diff)
import {
  createJsonbValidatePathTool,
  createJsonbMergeTool,
  createJsonbNormalizeTool,
  createJsonbDiffTool,
} from "./transform.js";

// JSONB analytics operations (index suggest, security scan, stats)
import {
  createJsonbIndexSuggestTool,
  createJsonbSecurityScanTool,
  createJsonbStatsTool,
} from "./analytics.js";

/**
 * Get all JSONB tools
 */
export function getJsonbTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    createJsonbExtractTool(adapter),
    createJsonbSetTool(adapter),
    createJsonbInsertTool(adapter),
    createJsonbDeleteTool(adapter),
    createJsonbContainsTool(adapter),
    createJsonbPathQueryTool(adapter),
    createJsonbAggTool(adapter),
    createJsonbObjectTool(adapter),
    createJsonbArrayTool(adapter),
    createJsonbKeysTool(adapter),
    createJsonbStripNullsTool(adapter),
    createJsonbTypeofTool(adapter),
    createJsonbValidatePathTool(adapter),
    createJsonbMergeTool(adapter),
    createJsonbNormalizeTool(adapter),
    createJsonbDiffTool(adapter),
    createJsonbIndexSuggestTool(adapter),
    createJsonbSecurityScanTool(adapter),
    createJsonbStatsTool(adapter),
  ];
}

// Re-export individual tool creators for direct imports
export {
  createJsonbExtractTool,
  createJsonbSetTool,
  createJsonbInsertTool,
  createJsonbDeleteTool,
  createJsonbContainsTool,
  createJsonbPathQueryTool,
  createJsonbAggTool,
  createJsonbObjectTool,
  createJsonbArrayTool,
  createJsonbKeysTool,
  createJsonbStripNullsTool,
  createJsonbTypeofTool,
  createJsonbValidatePathTool,
  createJsonbMergeTool,
  createJsonbNormalizeTool,
  createJsonbDiffTool,
  createJsonbIndexSuggestTool,
  createJsonbSecurityScanTool,
  createJsonbStatsTool,
};
