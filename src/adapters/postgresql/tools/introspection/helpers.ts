/**
 * PostgreSQL Introspection Tools - Shared Helpers
 *
 * Common types, utility functions, and shared database queries
 * used by graph analysis and schema analysis tools.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import { ValidationError } from "../../../../types/index.js";

// =============================================================================
// Internal types
// =============================================================================

export interface FkEdge {
  constraintName: string;
  fromSchema: string;
  fromTable: string;
  fromColumns: string[];
  toSchema: string;
  toTable: string;
  toColumns: string[];
  onDelete: string;
  onUpdate: string;
}

export interface TableNode {
  schema: string;
  table: string;
  rowCount?: number;
  sizeBytes?: number;
}

// =============================================================================
// Shared queries
// =============================================================================

/**
 * Fetch all foreign key relationships across user schemas
 */
export async function fetchForeignKeys(
  adapter: PostgresAdapter,
  schemaFilter?: string,
  excludeExtensionSchemas?: boolean,
): Promise<FkEdge[]> {
  const params: unknown[] = [];
  let schemaClause = "";
  if (schemaFilter) {
    params.push(schemaFilter);
    schemaClause = `AND src_ns.nspname = $${String(params.length)}`;
  }

  const extensionSchemaExclude =
    !schemaFilter && excludeExtensionSchemas !== false
      ? "AND src_ns.nspname NOT IN ('cron', 'topology', 'tiger', 'tiger_data')"
      : "";

  const result = await adapter.executeQuery(
    `SELECT
      c.conname AS constraint_name,
      src_ns.nspname AS from_schema,
      src_t.relname AS from_table,
      array_agg(DISTINCT src_a.attname ORDER BY src_a.attname) AS from_columns,
      ref_ns.nspname AS to_schema,
      ref_t.relname AS to_table,
      array_agg(DISTINCT ref_a.attname ORDER BY ref_a.attname) AS to_columns,
      CASE c.confdeltype
        WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
        WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
      END AS on_delete,
      CASE c.confupdtype
        WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
        WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
      END AS on_update
    FROM pg_constraint c
    JOIN pg_class src_t ON src_t.oid = c.conrelid
    JOIN pg_namespace src_ns ON src_ns.oid = src_t.relnamespace
    JOIN pg_class ref_t ON ref_t.oid = c.confrelid
    JOIN pg_namespace ref_ns ON ref_ns.oid = ref_t.relnamespace
    JOIN pg_attribute src_a ON src_a.attrelid = src_t.oid AND src_a.attnum = ANY(c.conkey)
    JOIN pg_attribute ref_a ON ref_a.attrelid = ref_t.oid AND ref_a.attnum = ANY(c.confkey)
    WHERE c.contype = 'f'
      AND src_ns.nspname NOT IN ('pg_catalog', 'information_schema')
      AND src_ns.nspname !~ '^pg_toast'
      ${extensionSchemaExclude}
      ${schemaClause}
    GROUP BY c.conname, src_ns.nspname, src_t.relname,
             ref_ns.nspname, ref_t.relname, c.confdeltype, c.confupdtype
    ORDER BY src_ns.nspname, src_t.relname, c.conname`,
    params.length > 0 ? params : undefined,
  );

  return (result.rows ?? []).map((row) => ({
    constraintName: row["constraint_name"] as string,
    fromSchema: row["from_schema"] as string,
    fromTable: row["from_table"] as string,
    fromColumns: parseArrayColumn(row["from_columns"]),
    toSchema: row["to_schema"] as string,
    toTable: row["to_table"] as string,
    toColumns: parseArrayColumn(row["to_columns"]),
    onDelete: row["on_delete"] as string,
    onUpdate: row["on_update"] as string,
  }));
}

/**
 * Fetch all user tables with row counts and sizes
 */
export async function fetchTableNodes(
  adapter: PostgresAdapter,
  schemaFilter?: string,
  excludeExtensionSchemas?: boolean,
): Promise<TableNode[]> {
  const params: unknown[] = [];
  let schemaClause = "";
  if (schemaFilter) {
    params.push(schemaFilter);
    schemaClause = `AND n.nspname = $${String(params.length)}`;
  }

  const extensionSchemaExclude =
    !schemaFilter && excludeExtensionSchemas !== false
      ? "AND n.nspname NOT IN ('cron', 'topology', 'tiger', 'tiger_data')"
      : "";

  const result = await adapter.executeQuery(
    `SELECT
      n.nspname AS schema,
      c.relname AS table_name,
      CASE WHEN c.reltuples = -1 THEN COALESCE(s.n_live_tup, 0)
           ELSE c.reltuples END::bigint AS row_count,
      pg_table_size(c.oid) AS size_bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE c.relkind IN ('r', 'p')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname !~ '^pg_toast'
      ${extensionSchemaExclude}
      ${schemaClause}
    ORDER BY n.nspname, c.relname`,
    params.length > 0 ? params : undefined,
  );

  return (result.rows ?? []).map((row) => ({
    schema: row["schema"] as string,
    table: row["table_name"] as string,
    rowCount: Number(row["row_count"]) || 0,
    sizeBytes: Number(row["size_bytes"]) || 0,
  }));
}

// =============================================================================
// Utility functions
// =============================================================================

/**
 * Parse PostgreSQL array column (handles both native arrays and string format)
 */
export function parseArrayColumn(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === "string") {
    const trimmed = value.replace(/^{|}$/g, "");
    if (trimmed === "") return [];
    return trimmed.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  }
  return [];
}

/**
 * Create qualified table name
 */
export function qualifiedName(schema: string, table: string): string {
  return `${schema}.${table}`;
}

/**
 * Check if a schema exists in the database.
 * Returns null if schema exists or no filter specified, or error response if nonexistent.
 */
export async function checkSchemaExists(
  adapter: PostgresAdapter,
  schemaFilter?: string,
): Promise<void> {
  if (!schemaFilter) return;
  const result = await adapter.executeQuery(
    `SELECT 1 FROM pg_namespace WHERE nspname = $1`,
    [schemaFilter],
  );
  if ((result.rows?.length ?? 0) === 0) {
    throw new ValidationError(`Schema '${schemaFilter}' does not exist. Use pg_list_schemas to see available schemas.`);
  }
}

/**
 * Check if a table exists in the database.
 * Returns null if table exists or no filter specified, or error response if nonexistent.
 */
export async function checkTableExists(
  adapter: PostgresAdapter,
  tableFilter?: string,
  schemaFilter?: string,
): Promise<void> {
  if (!tableFilter) return;
  const schema = schemaFilter ?? "public";
  const result = await adapter.executeQuery(
    `SELECT 1 FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = $1 AND n.nspname = $2 AND c.relkind IN ('r', 'p')`,
    [tableFilter, schema],
  );
  if ((result.rows?.length ?? 0) === 0) {
    throw new ValidationError(`Table '${schema}.${tableFilter}' does not exist. Use pg_list_tables to verify.`);
  }
}
