/**
 * PostgreSQL Performance Tools - Shared Helpers
 *
 * Common utilities shared across performance stat modules.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";

/** Helper to handle undefined params (allows tools to be called without {}) */
export const defaultToEmpty = (val: unknown): unknown => val ?? {};

/** Helper to coerce string numbers to JavaScript numbers (PostgreSQL returns BIGINT as strings) */
export const toNum = (val: unknown): number | null =>
  val === null || val === undefined ? null : Number(val);

/**
 * P154: Validate that a table exists before executing performance queries.
 * When a specific table/schema is provided, checks existence first to return
 * a structured error instead of silently returning empty results.
 */
export async function validatePerformanceTableExists(
  adapter: PostgresAdapter,
  table?: string,
  schema?: string,
): Promise<string | null> {
  // Only validate when a specific table or schema is requested
  if (!table && !schema) return null;

  // Check schema existence first for granular error messages
  if (schema) {
    const schemaResult = await adapter.executeQuery(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
      [schema],
    );
    if (!schemaResult.rows || schemaResult.rows.length === 0) {
      return `Schema '${schema}' does not exist. Use pg_list_objects with type 'table' to see available schemas.`;
    }
  }

  // Check table existence within the schema
  if (table) {
    const targetSchema = schema ?? "public";
    const tableResult = await adapter.executeQuery(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
      [targetSchema, table],
    );
    if (!tableResult.rows || tableResult.rows.length === 0) {
      return `Table '${targetSchema}.${table}' not found. Use pg_list_tables to see available tables.`;
    }
  }

  return null;
}
