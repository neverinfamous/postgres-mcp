/**
 * PostgreSQL Text & Full-Text Search Tools
 *
 * Text processing, FTS, trigrams, and fuzzy matching.
 * 13 tools total.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

// Full-text search tools
import {
  createTextSearchTool,
  createTextRankTool,
  createTextHeadlineTool,
  createFtsIndexTool,
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
  createLikeSearchTool,
  createTextSentimentTool,
} from "./matching.js";

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
