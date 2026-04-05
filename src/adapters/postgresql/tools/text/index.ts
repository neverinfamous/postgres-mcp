/**
 * PostgreSQL Text & Full-Text Search Tools
 *
 * Text processing, FTS, trigrams, and fuzzy matching.
 * 13 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

// Core FTS tools
import {
  createTextSearchTool,
  createTextRankTool,
  createTextHeadlineTool,
  createFtsIndexTool,
} from "./fts.js";

// Utility tools
import {
  createTextNormalizeTool,
  createTextToVectorTool,
  createTextToQueryTool,
  createTextSearchConfigTool,
} from "./search.js";

// Pattern matching & similarity tools
import {
  createTrigramSimilarityTool,
  createFuzzyMatchTool,
  createRegexpMatchTool,
} from "./matching.js";

// LIKE search & sentiment tools
import {
  createLikeSearchTool,
  createTextSentimentTool,
} from "./search-tools.js";

/**
 * Get all text processing tools
 */
export function getTextTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    createTextSearchTool(adapter),
    createTextRankTool(adapter),
    createTrigramSimilarityTool(adapter),
    createFuzzyMatchTool(adapter),
    createRegexpMatchTool(adapter),
    createLikeSearchTool(adapter),
    createTextHeadlineTool(adapter),
    createFtsIndexTool(adapter),
    createTextNormalizeTool(adapter),
    createTextSentimentTool(adapter),
    createTextToVectorTool(adapter),
    createTextToQueryTool(adapter),
    createTextSearchConfigTool(adapter),
  ];
}

// Re-export individual tool creators for direct imports
export {
  createTextSearchTool,
  createTextRankTool,
  createTrigramSimilarityTool,
  createFuzzyMatchTool,
  createRegexpMatchTool,
  createLikeSearchTool,
  createTextHeadlineTool,
  createFtsIndexTool,
  createTextNormalizeTool,
  createTextSentimentTool,
  createTextToVectorTool,
  createTextToQueryTool,
  createTextSearchConfigTool,
};
