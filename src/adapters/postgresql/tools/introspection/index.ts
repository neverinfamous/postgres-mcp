/**
 * PostgreSQL Introspection Tools
 *
 * Agent-optimized database analysis tools for dependency graphs,
 * cascade simulation, schema snapshots, migration risk analysis,
 * and schema version tracking.
 * 12 tools total (6 read-only + 6 migration tracking).
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

// Migration tracking tools
import {
  createMigrationInitTool,
  createMigrationRecordTool,
  createMigrationApplyTool,
  createMigrationRollbackTool,
  createMigrationHistoryTool,
  createMigrationStatusTool,
} from "./migration.js";

/**
 * Get all introspection tools
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
    createMigrationInitTool(adapter),
    createMigrationRecordTool(adapter),
    createMigrationApplyTool(adapter),
    createMigrationRollbackTool(adapter),
    createMigrationHistoryTool(adapter),
    createMigrationStatusTool(adapter),
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
  createMigrationInitTool,
  createMigrationRecordTool,
  createMigrationApplyTool,
  createMigrationRollbackTool,
  createMigrationHistoryTool,
  createMigrationStatusTool,
};
