/**
 * PostgreSQL pg_partman Extension Tools - Shared Helpers
 *
 * Common utilities used by partman operation and maintenance tools.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import {
  ValidationError,
  ExtensionNotAvailableError,
} from "../../../../types/index.js";

/**
 * Default row limit for partman list/analysis tools.
 * Shared across show_partitions, show_config, and analyze_partition_health.
 */
export const DEFAULT_PARTMAN_LIMIT = 50;

/**
 * Validate a pg_partman table name before interpolation into SQL.
 *
 * pg_partman's function-call syntax requires string interpolation for named
 * arguments (`p_parent_table := 'schema.table'`), which cannot use $1 params.
 * This helper rejects names containing single quotes or semicolons to mitigate
 * injection risk in that narrow context.
 */
export function sanitizePartmanTableName(tableName: string): string {
  if (tableName.includes("'") || tableName.includes(";")) {
    throw new ValidationError(
      "Table name contains invalid characters for pg_partman operations",
      { tableName },
    );
  }
  return tableName;
}
/**
 * Detect the schema where pg_partman is installed.
 * Newer versions install to 'public' by default, older versions use 'partman'.
 */
export async function getPartmanSchema(
  adapter: PostgresAdapter,
): Promise<string> {
  const result = await adapter.executeQuery(`
        SELECT table_schema FROM information_schema.tables
        WHERE table_name = 'part_config'
        AND table_schema IN ('partman', 'public')
        LIMIT 1
    `);

  const schema = result.rows?.[0]?.["table_schema"] as string | undefined;

  if (!schema) {
    throw new ExtensionNotAvailableError("pg_partman", {
      hint: "Run pg_partman_create_extension() first.",
    });
  }

  return schema;
}

/**
 * Ensure the 'partman' schema alias exists when pg_partman is installed in 'public'.
 *
 * pg_partman's partition_data_time function contains a hardcoded fully-qualified
 * call to 'partman.check_control_type(...)'. When pg_partman is installed in
 * the 'public' schema (the default for newer versions), this fails with
 * 'schema "partman" does not exist'. Since the reference is fully-qualified,
 * SET search_path cannot resolve it.
 *
 * This function creates the 'partman' schema if needed and adds a thin wrapper
 * function that delegates to public.check_control_type().
 */
export async function ensurePartmanSchemaAlias(
  adapter: PostgresAdapter,
): Promise<void> {
  try {
    await adapter.executeQuery("CREATE SCHEMA IF NOT EXISTS partman");
    await adapter.executeQuery(`
      CREATE OR REPLACE FUNCTION partman.check_control_type(
        p_parent_schema text, p_parent_tablename text, p_control text
      ) RETURNS TABLE(general_type text, exact_type text)
      LANGUAGE sql STABLE AS $$
        SELECT * FROM public.check_control_type(p_parent_schema, p_parent_tablename, p_control)
      $$
    `);
  } catch {
    // Schema creation may fail due to permissions — proceed anyway,
    // the actual CALL will produce its own clear error
  }
}

/**
 * Execute a pg_partman PROCEDURE, ensuring schema aliases are in place.
 */
export async function callPartmanProcedure(
  adapter: PostgresAdapter,
  partmanSchema: string,
  sql: string,
): Promise<void> {
  // When pg_partman is installed in 'public', ensure the 'partman' schema alias
  // exists for hardcoded partman.* references inside pg_partman's functions
  if (partmanSchema === "public") {
    await ensurePartmanSchemaAlias(adapter);
  }
  await adapter.executeQuery(sql);
}

/**
 * Check if a table exists in information_schema to provide standard P154 TABLE_NOT_FOUND errors
 */
export async function checkTableExists(
  adapter: PostgresAdapter,
  tableWithSchema: string,
): Promise<boolean> {
  const [schema, tableName] = tableWithSchema.includes(".")
    ? [tableWithSchema.split(".")[0], tableWithSchema.split(".")[1]]
    : ["public", tableWithSchema];

  const result = await adapter.executeQuery(
    `
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2
    `,
    [schema, tableName],
  );

  return (result.rows?.length ?? 0) > 0;
}
