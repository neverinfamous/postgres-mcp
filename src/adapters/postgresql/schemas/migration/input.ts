/**
 * postgres-mcp - Migration Input Schemas
 *
 * Input validation schemas for migration tracking tools.
 */

import { z } from "zod";
import { coerceStrictNumber } from "../../../../utils/query-helpers.js";

// =============================================================================
// Migration Tracking Input Schemas
// =============================================================================

/**
 * pg_migration_init input
 */
export const MigrationInitSchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Schema to create the tracking table in (default: public)"),
});

export const MigrationInitSchema = MigrationInitSchemaBase.default({});

/**
 * pg_migration_record input
 */
export const MigrationRecordSchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Schema where the tracking table lives (default: public)"),
  version: z
    .string()
    .optional()
    .describe("Version identifier (e.g., '1.0.0', '2024-01-15-add-users')"),
  description: z
    .string()
    .optional()
    .describe("Human-readable description of the migration"),
  migrationSql: z
    .string()
    .optional()
    .describe("The DDL/SQL statements applied"),
  sql: z.string().optional().describe("Alias for migrationSql"),
  query: z.string().optional().describe("Alias for migrationSql"),
  rollbackSql: z.string().optional().describe("SQL to reverse this migration"),
  sourceSystem: z
    .string()
    .optional()
    .describe("Origin system (e.g., 'mysql', 'sqlite', 'manual', 'agent')"),
  appliedBy: z
    .string()
    .optional()
    .describe("Who/what applied this migration (e.g., agent name, user)"),
});

// Internal parse schema — version and migrationSql are required
const MigrationRecordParseSchema = z.object({
  schema: z.string().optional(),
  version: z
    .string()
    .describe("Version identifier (e.g., '1.0.0', '2024-01-15-add-users')"),
  description: z
    .string()
    .optional()
    .describe("Human-readable description of the migration"),
  migrationSql: z.string().describe("The DDL/SQL statements applied"),
  rollbackSql: z.string().optional().describe("SQL to reverse this migration"),
  sourceSystem: z
    .string()
    .optional()
    .describe("Origin system (e.g., 'mysql', 'sqlite', 'manual', 'agent')"),
  appliedBy: z
    .string()
    .optional()
    .describe("Who/what applied this migration (e.g., agent name, user)"),
});

export const MigrationRecordSchema = z.preprocess((input: unknown) => {
  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    if (obj["migrationSql"] === undefined) {
      if (obj["sql"] !== undefined) return { ...obj, migrationSql: obj["sql"] };
      if (obj["query"] !== undefined)
        return { ...obj, migrationSql: obj["query"] };
    }
  }
  return input;
}, MigrationRecordParseSchema);

/**
 * pg_migration_apply input
 * Same fields as pg_migration_record — version and migrationSql required.
 */
export const MigrationApplySchemaBase = MigrationRecordSchemaBase;

// Internal parse schema — version and migrationSql are required
export const MigrationApplySchema = MigrationRecordSchema;

/**
 * pg_migration_rollback input
 */
export const MigrationRollbackSchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Schema where the tracking table lives (default: public)"),
  id: z
    .union([z.number(), z.string()])
    .optional()
    .describe("Migration ID to roll back"),
  version: z
    .string()
    .optional()
    .describe("Migration version to roll back (alternative to id)"),
  dryRun: z
    .boolean()
    .optional()
    .describe(
      "If true, return the rollback SQL without executing (default: false)",
    ),
});

export const MigrationRollbackSchema = z.object({
  schema: z.string().optional(),
  id: z.preprocess(coerceStrictNumber, z.number().optional()).optional(),
  version: z.string().optional(),
  dryRun: z.boolean().optional(),
});

/**
 * pg_migration_history input
 */
export const MigrationHistorySchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Schema where the tracking table lives (default: public)"),
  status: z.string().optional().describe("Filter by status"),
  sourceSystem: z.string().optional().describe("Filter by source system"),
  limit: z
    .union([z.number(), z.string()])
    .optional()
    .describe("Maximum records to return (default: 50)"),
  offset: z
    .union([z.number(), z.string()])
    .optional()
    .describe("Offset for pagination (default: 0)"),
});

// Internal parse schema — coerces limit/offset types to prevent Zod leaks
export const MigrationHistorySchema = z
  .object({
    schema: z.string().optional(),
    status: z.enum(["applied", "recorded", "rolled_back", "failed"]).optional(),
    sourceSystem: z.string().optional(),
    limit: z.preprocess(coerceStrictNumber, z.number().optional()).optional(),
    offset: z.preprocess(coerceStrictNumber, z.number().optional()).optional(),
  })
  .default({});

/**
 * pg_migration_status input
 */
export const MigrationStatusSchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Schema where the tracking table lives (default: public)"),
});

export const MigrationStatusSchema = MigrationStatusSchemaBase.default({});
