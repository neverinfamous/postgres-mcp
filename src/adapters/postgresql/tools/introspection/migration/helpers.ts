/**
 * PostgreSQL Migration Tools — Shared Helpers
 *
 * Constants, SQL builders, and utilities used by migration tool factories.
 */

import { createHash } from "node:crypto";
import type { PostgresAdapter } from "../../../PostgresAdapter.js";

// =============================================================================
// Migration tracking — shared helpers
// =============================================================================

export const TRACKING_TABLE = "_mcp_schema_versions";

/**
 * Build the CREATE TABLE DDL for the tracking table.
 * Accepts a pre-computed qualified table name (e.g. `_mcp_schema_versions`
 * or `"custom_schema"."_mcp_schema_versions"`) so the caller controls
 * schema qualification without fragile string replacement.
 */
export function buildCreateTrackingTableSql(qualifiedTable: string): string {
  return `
CREATE TABLE IF NOT EXISTS ${qualifiedTable} (
  id SERIAL PRIMARY KEY,
  version VARCHAR(50) NOT NULL,
  description TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by VARCHAR(255),
  migration_hash VARCHAR(64) NOT NULL,
  migration_sql TEXT NOT NULL,
  source_system VARCHAR(50),
  rollback_sql TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'applied',
  CONSTRAINT valid_status CHECK (status IN ('applied', 'recorded', 'rolled_back', 'failed'))
)`;
}

/**
 * Ensure the _mcp_schema_versions table exists in the public schema.
 * Returns true if the table was newly created, false if it already existed.
 */
export async function ensureTrackingTable(
  adapter: PostgresAdapter,
): Promise<boolean> {
  const check = await adapter.executeQuery(
    `SELECT EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = $1
    ) AS "table_exists"`,
    [TRACKING_TABLE],
  );
  const firstRow = (check.rows ?? [])[0];
  const existed = firstRow?.["table_exists"] === true;

  if (!existed) {
    await adapter.executeQuery(buildCreateTrackingTableSql(TRACKING_TABLE));
  }
  return !existed;
}

export function hashMigrationSql(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

/**
 * Check for an already-applied migration with the same SQL hash.
 * Returns an error result object if duplicate found, or null if clear.
 */
export async function checkDuplicateHash(
  adapter: PostgresAdapter,
  migrationSql: string,
): Promise<{
  migrationHash: string;
  duplicateError: null | { success: false; error: string };
}> {
  const migrationHash = hashMigrationSql(migrationSql);
  const dupCheck = await adapter.executeQuery(
    `SELECT id, version, status FROM ${TRACKING_TABLE}
     WHERE migration_hash = $1 AND status = 'applied'`,
    [migrationHash],
  );
  const dupRows = dupCheck.rows ?? [];
  if (dupRows.length > 0) {
    const dup = dupRows[0] ?? {};
    const dupId = dup["id"] as number;
    const dupVersion = dup["version"] as string;
    return {
      migrationHash,
      duplicateError: {
        success: false,
        error:
          `Duplicate migration detected: version "${dupVersion}" (id: ${String(dupId)}) has the same SQL hash. ` +
          `Use a different migration SQL or roll back the existing one first.`,
      },
    };
  }
  return { migrationHash, duplicateError: null };
}

export interface FormattedRecord {
  id: number;
  version: string;
  description: string | null;
  appliedAt: string;
  appliedBy: string | null;
  migrationHash: string;
  sourceSystem: string | null;
  status: string;
}

export function formatRecord(row: Record<string, unknown>): FormattedRecord {
  const appliedAt = row["applied_at"];
  const appliedAtStr =
    appliedAt instanceof Date
      ? appliedAt.toISOString()
      : ((appliedAt as string | null) ?? "");
  return {
    id: row["id"] as number,
    version: row["version"] as string,
    description: (row["description"] as string | null) ?? null,
    appliedAt: appliedAtStr,
    appliedBy: (row["applied_by"] as string | null) ?? null,
    migrationHash: row["migration_hash"] as string,
    sourceSystem: (row["source_system"] as string | null) ?? null,
    status: row["status"] as string,
  };
}
