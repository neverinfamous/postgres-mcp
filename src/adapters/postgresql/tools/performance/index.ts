/**
 * PostgreSQL Performance Tools
 *
 * Query analysis, statistics, and performance monitoring.
 * 24 tools total.
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
  createVacuumStatsTool,
} from "./catalog-stats.js";
import {
  createStatStatementsTool,
  createStatActivityTool,
  createQueryPlanStatsTool,
} from "./query-stats.js";
import {
  createUnusedIndexesTool,
  createDuplicateIndexesTool,
} from "./index-analysis.js";
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
import {
  createDetectQueryAnomaliesTool,
  createDetectBloatRiskTool,
} from "./anomaly-detection.js";
import { createDetectConnectionSpikeTool } from "./connection-analysis.js";

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
    createDetectQueryAnomaliesTool(adapter),
    createDetectBloatRiskTool(adapter),
    createDetectConnectionSpikeTool(adapter),
  ];
}
