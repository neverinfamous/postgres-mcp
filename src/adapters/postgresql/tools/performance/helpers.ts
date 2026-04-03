/**
 * PostgreSQL Performance Tools - Shared Helpers
 *
 * Common utilities shared across performance stat modules.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import { ValidationError } from "../../../../types/errors.js";

/** Helper to handle undefined params (allows tools to be called without {}) */
export const defaultToEmpty = (val: unknown): unknown => val ?? {};

/** Helper to coerce string numbers to JavaScript numbers (PostgreSQL returns BIGINT as strings) */
export const toNum = (val: unknown): number | null =>
  val === null || val === undefined ? null : Number(val);

/**
 * P154: Validate that a table/schema exists before executing performance queries.
 * Throws a ValidationError so the handler's catch block routes through
 * formatHandlerErrorResponse(), ensuring code/category/recoverable fields
 * are included in the structured error response.
 *
 * Call inside the handler's try/catch BEFORE executing the main query.
 */
export async function validatePerformanceTableExists(
  adapter: PostgresAdapter,
  table?: string,
  schema?: string,
): Promise<void> {
  // Only validate when a specific table or schema is requested
  if (!table && !schema) return;

  // Check schema existence first for granular error messages
  if (schema) {
    const schemaResult = await adapter.executeQuery(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
      [schema],
    );
    if (!schemaResult.rows || schemaResult.rows.length === 0) {
      throw new ValidationError(
        `Schema '${schema}' does not exist. Use pg_list_objects with type 'table' to see available schemas.`,
      );
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
      throw new ValidationError(
        `Table '${targetSchema}.${table}' not found. Use pg_list_tables to see available tables.`,
      );
    }
  }
}
