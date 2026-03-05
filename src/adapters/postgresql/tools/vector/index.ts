/**
 * PostgreSQL pgvector Extension Tools
 *
 * Vector similarity search operations.
 * 16 tools total.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

// Import from sub-modules
import {
  createVectorExtensionTool,
  createVectorAddColumnTool,
  createVectorInsertTool,
  createVectorBatchInsertTool,
} from "./data.js";

import {
  createVectorSearchTool,
  createVectorCreateIndexTool,
  createVectorDistanceTool,
  createVectorNormalizeTool,
  createVectorAggregateTool,
  createVectorValidateTool,
} from "./query.js";

// Search & analysis operations
import {
  createVectorClusterTool,
  createHybridSearchTool,
  createVectorPerformanceTool,
} from "./search-advanced.js";

// Index & utility management
import {
  createVectorIndexOptimizeTool,
  createVectorDimensionReduceTool,
  createVectorEmbedTool,
} from "./management.js";

/**
 * Get all pgvector tools
 */
export function getVectorTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    createVectorExtensionTool(adapter),
    createVectorAddColumnTool(adapter),
    createVectorInsertTool(adapter),
    createVectorBatchInsertTool(adapter),
    createVectorSearchTool(adapter),
    createVectorCreateIndexTool(adapter),
    createVectorDistanceTool(adapter),
    createVectorNormalizeTool(),
    createVectorAggregateTool(adapter),
    createVectorValidateTool(adapter),
    createVectorClusterTool(adapter),
    createVectorIndexOptimizeTool(adapter),
    createHybridSearchTool(adapter),
    createVectorPerformanceTool(adapter),
    createVectorDimensionReduceTool(adapter),
    createVectorEmbedTool(),
  ];
}
