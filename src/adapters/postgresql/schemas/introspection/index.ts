/**
 * postgres-mcp - Introspection Schemas Barrel
 *
 * Re-exports all introspection input and output schemas.
 */

export {
  DependencyGraphSchemaBase,
  DependencyGraphSchema,
  TopologicalSortSchemaBase,
  TopologicalSortSchema,
  CascadeSimulatorSchemaBase,
  CascadeSimulatorSchema,
  SchemaSnapshotSchemaBase,
  SchemaSnapshotSchema,
  ConstraintAnalysisSchemaBase,
  ConstraintAnalysisSchema,
  MigrationRisksSchemaBase,
  MigrationRisksSchema,
} from "./input.js";

export {
  DependencyGraphOutputSchema,
  TopologicalSortOutputSchema,
  CascadeSimulatorOutputSchema,
  SchemaSnapshotOutputSchema,
  ConstraintAnalysisOutputSchema,
  MigrationRisksOutputSchema,
} from "./output.js";
