/**
 * postgres-mcp - Migration Schemas Barrel
 *
 * Re-exports all migration input and output schemas.
 */

export {
  MigrationInitSchemaBase,
  MigrationInitSchema,
  MigrationRecordSchemaBase,
  MigrationRecordSchema,
  MigrationApplySchemaBase,
  MigrationApplySchema,
  MigrationRollbackSchemaBase,
  MigrationRollbackSchema,
  MigrationHistorySchemaBase,
  MigrationHistorySchema,
  MigrationStatusSchemaBase,
  MigrationStatusSchema,
} from "./input.js";

export {
  MigrationInitOutputSchema,
  MigrationRecordOutputSchema,
  MigrationApplyOutputSchema,
  MigrationRollbackOutputSchema,
  MigrationHistoryOutputSchema,
  MigrationStatusOutputSchema,
} from "./output.js";
