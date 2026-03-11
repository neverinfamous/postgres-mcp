/**
 * PostgreSQL Statistics Tools
 *
 * Statistical analysis using PostgreSQL aggregate and window functions.
 * 8 tools total.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

// Basic statistics tools
import {
  createStatsDescriptiveTool,
  createStatsPercentilesTool,
  createStatsCorrelationTool,
  createStatsRegressionTool,
} from "./basic.js";

// Advanced statistics tools
import { createStatsTimeSeriesTool } from "./time-series.js";
import { createStatsDistributionTool } from "./distribution.js";
import { createStatsHypothesisTool } from "./hypothesis.js";
import { createStatsSamplingTool } from "./sampling.js";

// Schemas (now centralized in schemas/stats.ts)
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
    createStatsDescriptiveTool(adapter),
    createStatsPercentilesTool(adapter),
    createStatsCorrelationTool(adapter),
    createStatsRegressionTool(adapter),
    createStatsTimeSeriesTool(adapter),
    createStatsDistributionTool(adapter),
    createStatsHypothesisTool(adapter),
    createStatsSamplingTool(adapter),
  ];
}

// Re-export individual tool creators and schemas
export {
  createStatsDescriptiveTool,
  createStatsPercentilesTool,
  createStatsCorrelationTool,
  createStatsRegressionTool,
  createStatsTimeSeriesTool,
  createStatsDistributionTool,
  createStatsHypothesisTool,
  createStatsSamplingTool,
  StatsDescriptiveSchema,
  StatsPercentilesSchema,
  StatsCorrelationSchema,
  StatsRegressionSchema,
  StatsTimeSeriesSchema,
  StatsDistributionSchema,
  StatsHypothesisSchema,
  StatsSamplingSchema,
};
