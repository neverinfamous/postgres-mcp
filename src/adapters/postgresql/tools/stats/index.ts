/**
 * PostgreSQL Statistics Tools
 *
 * Statistical analysis using PostgreSQL aggregate and window functions.
 * 19 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

// Descriptive statistics tools
import {
  createStatsDescriptiveTool,
  createStatsPercentilesTool,
} from "./descriptive.js";

// Two-column analysis tools
import {
  createStatsCorrelationTool,
  createStatsRegressionTool,
} from "./basic.js";

// Advanced statistics tools
import { createStatsTimeSeriesTool } from "./time-series.js";
import { createStatsDistributionTool } from "./distribution.js";
import { createStatsHypothesisTool } from "./hypothesis.js";
import { createStatsSamplingTool } from "./sampling.js";

// Window function tools
import {
  createStatsRowNumberTool,
  createStatsRankTool,
  createStatsLagLeadTool,
  createStatsRunningTotalTool,
  createStatsMovingAvgTool,
  createStatsNtileTool,
} from "./window.js";

// Outlier detection
import { createStatsOutliersTool } from "./outlier.js";

// Granular stats (top_n, distinct, frequency, summary)
import {
  createStatsTopNTool,
  createStatsDistinctTool,
  createStatsFrequencyTool,
  createStatsSummaryTool,
} from "./advanced.js";

// Schemas (centralized in schemas/stats/)
import {
  StatsDescriptiveSchema,
  StatsPercentilesSchema,
  StatsCorrelationSchema,
  StatsRegressionSchema,
  StatsTimeSeriesSchema,
  StatsDistributionSchema,
  StatsHypothesisSchema,
  StatsSamplingSchema,
} from "../../schemas/index.js";

/**
 * Get all statistics tools
 */
export function getStatsTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    // Existing tools
    createStatsDescriptiveTool(adapter),
    createStatsPercentilesTool(adapter),
    createStatsCorrelationTool(adapter),
    createStatsRegressionTool(adapter),
    createStatsTimeSeriesTool(adapter),
    createStatsDistributionTool(adapter),
    createStatsHypothesisTool(adapter),
    createStatsSamplingTool(adapter),
    // Window functions
    createStatsRowNumberTool(adapter),
    createStatsRankTool(adapter),
    createStatsLagLeadTool(adapter),
    createStatsRunningTotalTool(adapter),
    createStatsMovingAvgTool(adapter),
    createStatsNtileTool(adapter),
    // Outlier detection
    createStatsOutliersTool(adapter),
    // Granular stats
    createStatsTopNTool(adapter),
    createStatsDistinctTool(adapter),
    createStatsFrequencyTool(adapter),
    createStatsSummaryTool(adapter),
  ];
}

// Re-export individual tool creators and schemas
export {
  // Existing
  createStatsDescriptiveTool,
  createStatsPercentilesTool,
  createStatsCorrelationTool,
  createStatsRegressionTool,
  createStatsTimeSeriesTool,
  createStatsDistributionTool,
  createStatsHypothesisTool,
  createStatsSamplingTool,
  // Window functions
  createStatsRowNumberTool,
  createStatsRankTool,
  createStatsLagLeadTool,
  createStatsRunningTotalTool,
  createStatsMovingAvgTool,
  createStatsNtileTool,
  // Outlier detection
  createStatsOutliersTool,
  // Granular stats
  createStatsTopNTool,
  createStatsDistinctTool,
  createStatsFrequencyTool,
  createStatsSummaryTool,
  // Schemas
  StatsDescriptiveSchema,
  StatsPercentilesSchema,
  StatsCorrelationSchema,
  StatsRegressionSchema,
  StatsTimeSeriesSchema,
  StatsDistributionSchema,
  StatsHypothesisSchema,
  StatsSamplingSchema,
};
