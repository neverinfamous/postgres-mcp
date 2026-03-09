/**
 * PostgreSQL Introspection Tools
 *
 * Agent-optimized read-only database analysis tools for dependency graphs,
 * cascade simulation, schema snapshots, constraint analysis, and
 * migration risk analysis.
 * 6 tools total.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

// Graph analysis tools
import {
  createDependencyGraphTool,
  createTopologicalSortTool,
  createCascadeSimulatorTool,
} from "./graph.js";

// Schema analysis tools
import {
  createSchemaSnapshotTool,
  createConstraintAnalysisTool,
  createMigrationRisksTool,
} from "./analysis.js";

/**
 * Get all introspection tools (read-only analysis)
 */
export function getIntrospectionTools(
  adapter: PostgresAdapter,
): ToolDefinition[] {
  return [
    createDependencyGraphTool(adapter),
    createTopologicalSortTool(adapter),
    createCascadeSimulatorTool(adapter),
    createSchemaSnapshotTool(adapter),
    createConstraintAnalysisTool(adapter),
    createMigrationRisksTool(adapter),
  ];
}

// Re-export individual tool creators for direct imports
export {
  createDependencyGraphTool,
  createTopologicalSortTool,
  createCascadeSimulatorTool,
  createSchemaSnapshotTool,
  createConstraintAnalysisTool,
  createMigrationRisksTool,
};

