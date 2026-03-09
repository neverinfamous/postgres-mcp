/**
 * PostgreSQL Performance Tools
 *
 * Query analysis, statistics, and performance monitoring.
 * 21 tools total.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

// Import from sub-modules
import {
  createExplainTool,
  createExplainAnalyzeTool,
  createExplainBuffersTool,
} from "./explain.js";
import {
  createIndexStatsTool,
  createTableStatsTool,
  createStatStatementsTool,
  createStatActivityTool,
  createUnusedIndexesTool,
  createDuplicateIndexesTool,
  createVacuumStatsTool,
  createQueryPlanStatsTool,
} from "./stats.js";
import {
  createLocksTool,
  createBloatCheckTool,
  createCacheHitRatioTool,
} from "./monitoring.js";
import {
  createSeqScanTablesTool,
  createIndexRecommendationsTool,
  createQueryPlanCompareTool,
} from "./analysis.js";
import {
  createPerformanceBaselineTool,
  createConnectionPoolOptimizeTool,
  createPartitionStrategySuggestTool,
} from "./optimization.js";
import { createDiagnoseTool } from "./diagnostics.js";

/**
 * Get all performance tools
 */
export function getPerformanceTools(
  adapter: PostgresAdapter,
): ToolDefinition[] {
  return [
    createExplainTool(adapter),
    createExplainAnalyzeTool(adapter),
    createExplainBuffersTool(adapter),
    createIndexStatsTool(adapter),
    createTableStatsTool(adapter),
    createStatStatementsTool(adapter),
    createStatActivityTool(adapter),
    createLocksTool(adapter),
    createBloatCheckTool(adapter),
    createCacheHitRatioTool(adapter),
    createSeqScanTablesTool(adapter),
    createIndexRecommendationsTool(adapter),
    createQueryPlanCompareTool(adapter),
    createPerformanceBaselineTool(adapter),
    createConnectionPoolOptimizeTool(adapter),
    createPartitionStrategySuggestTool(adapter),
    createUnusedIndexesTool(adapter),
    createDuplicateIndexesTool(adapter),
    createVacuumStatsTool(adapter),
    createQueryPlanStatsTool(adapter),
    createDiagnoseTool(adapter),
  ];
}

