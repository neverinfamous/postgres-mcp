/**
 * postgres-mcp — Schema Operations: List
 *
 * Schema query functions for listing tables, indexes, schemas,
 * and checking extension availability.
 */

import type {
  SchemaInfo,
  TableInfo,
  IndexInfo,
} from "../../../types/index.js";
import type { QueryExecutor, CacheHelpers } from "./describe.js";
import {
  parseColumnsArray,
  extractIndexColumns,
} from "./describe.js";

// ---------------------------------------------------------------------------
// Schema query functions
// ---------------------------------------------------------------------------

/**
 * Get full schema info: tables, views, materialized views, and indexes.
 */
export async function getSchemaInfo(
  executeQuery: QueryExecutor,
  cache: CacheHelpers,
): Promise<SchemaInfo> {
  const tables = await queryListTables(executeQuery, cache);
  const views = tables.filter((t) => t.type === "view");
  const materializedViews = tables.filter(
    (t) => t.type === "materialized_view",
  );
  const realTables = tables.filter(
    (t) => t.type === "table" || t.type === "partitioned_table",
  );

  // Performance optimization: fetch all indexes in a single query instead of N+1
  const indexes = await queryAllIndexes(executeQuery, cache);

  return {
    tables: realTables,
    views,
    materializedViews,
    indexes,
  };
}

/**
 * Get all indexes across all user tables in a single query.
 * Performance optimization: eliminates N+1 query pattern.
 */
export async function queryAllIndexes(
  executeQuery: QueryExecutor,
  cache: CacheHelpers,
): Promise<IndexInfo[]> {
  // Check cache first
  const cached = cache.getCached("all_indexes") as IndexInfo[] | undefined;
  if (cached) return cached;

  const result = await executeQuery(`
            SELECT
                i.relname as name,
                t.relname as table_name,
                n.nspname as schema_name,
                am.amname as type,
                ix.indisunique as is_unique,
                pg_get_indexdef(ix.indexrelid) as definition,
                array_agg(a.attname ORDER BY x.ordinality) as columns,
                pg_relation_size(i.oid) as size_bytes,
                COALESCE(pg_stat_get_numscans(i.oid), 0) as num_scans,
                COALESCE(pg_stat_get_tuples_returned(i.oid), 0) as tuples_read,
                COALESCE(pg_stat_get_tuples_fetched(i.oid), 0) as tuples_fetched
            FROM pg_index ix
            JOIN pg_class t ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_am am ON am.oid = i.relam
            CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, ordinality)
            LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
            WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
              AND n.nspname !~ '^pg_toast'
            GROUP BY i.relname, t.relname, n.nspname, am.amname, ix.indisunique, ix.indexrelid, i.oid
            ORDER BY n.nspname, t.relname, i.relname
        `);

  const indexes = (result.rows ?? []).map((row) => {
    const rawColumns = parseColumnsArray(row["columns"]);
    const definition = row["definition"] as string;
    const indexType = row["type"] as IndexInfo["type"];
    return {
      name: row["name"] as string,
      tableName: row["table_name"] as string,
      schemaName: row["schema_name"] as string,
      columns: extractIndexColumns(rawColumns, definition),
      unique: row["is_unique"] as boolean,
      type: indexType,
      sizeBytes: Number(row["size_bytes"]) || undefined,
      numberOfScans: Number(row["num_scans"]) || undefined,
      tuplesRead: Number(row["tuples_read"]) || undefined,
      tuplesFetched: Number(row["tuples_fetched"]) || undefined,
    };
  });

  cache.setCache("all_indexes", indexes);
  return indexes;
}

/**
 * List all user tables, views, and materialized views.
 */
export async function queryListTables(
  executeQuery: QueryExecutor,
  cache: CacheHelpers,
): Promise<TableInfo[]> {
  // Performance optimization: return cached result if within TTL
  const cached = cache.getCached("list_tables") as TableInfo[] | undefined;
  if (cached) return cached;

  const result = await executeQuery(`
            SELECT
                c.relname as name,
                n.nspname as schema,
                CASE c.relkind
                    WHEN 'r' THEN 'table'
                    WHEN 'v' THEN 'view'
                    WHEN 'm' THEN 'materialized_view'
                    WHEN 'f' THEN 'foreign_table'
                    WHEN 'p' THEN 'partitioned_table'
                END as type,
                pg_catalog.pg_get_userbyid(c.relowner) as owner,
                CASE WHEN c.reltuples = -1 THEN NULL ELSE c.reltuples END::bigint as row_count,
                COALESCE(s.n_live_tup, 0)::bigint as live_row_estimate,
                (c.reltuples = -1) as stats_stale,
                pg_catalog.pg_table_size(c.oid) as size_bytes,
                pg_catalog.pg_total_relation_size(c.oid) as total_size_bytes,
                obj_description(c.oid, 'pg_class') as comment
            FROM pg_catalog.pg_class c
            LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
            WHERE c.relkind IN ('r', 'v', 'm', 'f', 'p')
              AND n.nspname NOT IN ('pg_catalog', 'information_schema')
              AND n.nspname !~ '^pg_toast'
            ORDER BY n.nspname, c.relname
        `);

  const tables = (result.rows ?? []).map((row) => {
    const rowCount = row["row_count"];
    const liveRowEstimate = Number(row["live_row_estimate"]) || 0;
    const statsStale = row["stats_stale"] === true;

    // Use live_row_estimate as fallback when stats are stale
    const effectiveRowCount =
      rowCount !== null ? Number(rowCount) : liveRowEstimate;

    return {
      name: row["name"] as string,
      schema: row["schema"] as string,
      type: row["type"] as TableInfo["type"],
      owner: row["owner"] as string,
      rowCount: effectiveRowCount,
      sizeBytes: Number(row["size_bytes"]) || undefined,
      totalSizeBytes: Number(row["total_size_bytes"]) || undefined,
      comment: row["comment"] as string | undefined,
      statsStale,
    };
  });

  cache.setCache("list_tables", tables);
  return tables;
}

/**
 * List all user schemas.
 */
export async function queryListSchemas(
  executeQuery: QueryExecutor,
): Promise<string[]> {
  const result = await executeQuery(`
            SELECT nspname
            FROM pg_catalog.pg_namespace
            WHERE nspname NOT IN ('pg_catalog', 'information_schema')
              AND nspname !~ '^pg_toast'
              AND nspname !~ '^pg_temp'
            ORDER BY nspname
        `);
  return (result.rows ?? []).map((row) => row["nspname"] as string);
}

/**
 * Get indexes for a specific table.
 */
export async function queryTableIndexes(
  executeQuery: QueryExecutor,
  tableName: string,
  schemaName = "public",
): Promise<IndexInfo[]> {
  const result = await executeQuery(
    `
            SELECT
                i.relname as name,
                am.amname as type,
                ix.indisunique as is_unique,
                pg_get_indexdef(ix.indexrelid) as definition,
                array_agg(a.attname ORDER BY x.ordinality) as columns,
                pg_relation_size(i.oid) as size_bytes,
                COALESCE(pg_stat_get_numscans(i.oid), 0) as num_scans,
                COALESCE(pg_stat_get_tuples_returned(i.oid), 0) as tuples_read,
                COALESCE(pg_stat_get_tuples_fetched(i.oid), 0) as tuples_fetched
            FROM pg_index ix
            JOIN pg_class t ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_am am ON am.oid = i.relam
            CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, ordinality)
            LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
            WHERE t.relname = $1
              AND n.nspname = $2
            GROUP BY i.relname, am.amname, ix.indisunique, ix.indexrelid, i.oid
            ORDER BY i.relname
        `,
    [tableName, schemaName],
  );

  return (result.rows ?? []).map((row) => {
    const rawColumns = parseColumnsArray(row["columns"]);
    const definition = row["definition"] as string;
    const indexType = row["type"] as IndexInfo["type"];
    return {
      name: row["name"] as string,
      tableName,
      schemaName,
      columns: extractIndexColumns(rawColumns, definition),
      unique: row["is_unique"] as boolean,
      type: indexType,
      sizeBytes: Number(row["size_bytes"]) || undefined,
      numberOfScans: Number(row["num_scans"]) || undefined,
      tuplesRead: Number(row["tuples_read"]) || undefined,
      tuplesFetched: Number(row["tuples_fetched"]) || undefined,
    };
  });
}

/**
 * Check if a PostgreSQL extension is installed.
 */
export async function queryIsExtensionAvailable(
  executeQuery: QueryExecutor,
  extensionName: string,
): Promise<boolean> {
  const result = await executeQuery(
    `
            SELECT EXISTS(
                SELECT 1 FROM pg_extension WHERE extname = $1
            ) as available
        `,
    [extensionName],
  );
  return (result.rows?.[0]?.["available"] as boolean) ?? false;
}
