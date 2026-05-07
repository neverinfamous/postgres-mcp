/**
 * postgres-mcp - Migration Output Schemas
 *
 * Output validation schemas for migration tracking tool results.
 */

import { z } from "zod";
import { ErrorResponseFields } from "../error-response-fields.js";

// =============================================================================
// Migration Tracking Output Schemas
// =============================================================================

const MigrationRecordOutputEntry = z.object({
  id: z.number(),
  version: z.string(),
  description: z.string().nullable(),
  appliedAt: z.string(),
  appliedBy: z.string().nullable(),
  migrationHash: z.string(),
  sourceSystem: z.string().nullable(),
  status: z.string(),
  errorInformation: z.string().nullable().optional(),
});

export const MigrationInitOutputSchema = z
  .object({
    success: z.boolean(),
    tableCreated: z.boolean().optional(),
    tableName: z.string().optional(),
    existingRecords: z.number().optional(),
    error: z.string().optional(),
  })
  .extend(ErrorResponseFields.shape);

export const MigrationRecordOutputSchema = z
  .object({
    success: z.boolean(),
    record: MigrationRecordOutputEntry.optional(),
    error: z.string().optional(),
  })
  .extend(ErrorResponseFields.shape);

export const MigrationApplyOutputSchema = z
  .object({
    success: z.boolean(),
    record: MigrationRecordOutputEntry.optional(),
    error: z.string().optional(),
  })
  .extend(ErrorResponseFields.shape);

export const MigrationRollbackOutputSchema = z
  .object({
    success: z.boolean(),
    dryRun: z.boolean().optional(),
    rollbackSql: z.string().nullable().optional(),
    record: MigrationRecordOutputEntry.optional(),
    error: z.string().optional(),
  })
  .extend(ErrorResponseFields.shape);

export const MigrationHistoryOutputSchema = z
  .object({
    records: z.array(MigrationRecordOutputEntry).optional(),
    total: z.number().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    success: z.boolean(),
    error: z.string().optional(),
  })
  .extend(ErrorResponseFields.shape);

export const MigrationStatusOutputSchema = z
  .object({
    initialized: z.boolean().optional(),
    latestVersion: z.string().nullable().optional(),
    latestAppliedAt: z.string().nullable().optional(),
    counts: z
      .object({
        total: z.number(),
        applied: z.number(),
        recorded: z.number(),
        rolledBack: z.number(),
        failed: z.number(),
      })
      .optional(),
    sourceSystems: z.array(z.string()).optional(),
    success: z.boolean(),
    error: z.string().optional(),
  })
  .extend(ErrorResponseFields.shape);
