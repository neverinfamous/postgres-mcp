/**
 * postgres-mcp — Schema Operations: Describe
 *
 * Types, pure parsing helpers, and the `queryDescribeTable` function
 * for detailed table inspection (columns, indexes, constraints, foreign keys).
 */

import type {
  QueryResult,
  TableInfo,
  ColumnInfo,
} from "../../../types/index.js";
import { ValidationError } from "../../../types/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A function that executes SQL and returns rows.
 * Matches PostgresAdapter.executeQuery signature.
 */
export type QueryExecutor = (
  sql: string,
  params?: unknown[],
) => Promise<QueryResult>;

/**
 * Cache helpers, matching the getCached/setCache interface on PostgresAdapter.
 */
export interface CacheHelpers {
  getCached(key: string): unknown;
  setCache(key: string, data: unknown): void;
}

// ---------------------------------------------------------------------------
// Pure parsing helpers (no DB access)
// ---------------------------------------------------------------------------

/**
 * Parse columns from PostgreSQL array format.
 * Handles both native arrays and string representations like "{col1,col2}".
 */
export function parseColumnsArray(columns: unknown): string[] {
  if (Array.isArray(columns)) {
    return columns as string[];
  }
  if (typeof columns === "string") {
    // Handle PostgreSQL array string format: "{col1,col2}"
    const trimmed = columns.replace(/^{|}$/g, "");
    if (trimmed === "") return [];
    return trimmed.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  }
  return [];
}

/**
 * Extract expression columns from index definition when column names are NULL.
 * Expression indexes (like LOWER(name)) have attnum=0 which returns NULL from pg_attribute.
 * This parses the index definition to extract the actual expressions.
 */
export function extractIndexColumns(
  columns: string[],
  definition: string,
): string[] {
  // If no NULL columns, return as-is
  if (!columns.some((c) => c === null || c === "NULL" || c === "")) {
    return columns;
  }

  // Find the expression portion with balanced parentheses
  // Format: CREATE [UNIQUE] INDEX name ON table USING method (col1, expr1, ...) [WHERE ...]
  const exprPart = extractIndexExpressionPart(definition);
  if (!exprPart) {
    return columns;
  }

  // Parse the column expressions, handling nested parentheses
  const exprs = parseIndexExpressions(exprPart);

  // If counts don't match, something is off - return original
  if (exprs.length !== columns.length) {
    return columns;
  }

  // Replace NULL columns with the parsed expressions
  return columns.map((col, i) => {
    if (col === null || col === "NULL" || col === "") {
      return exprs[i]?.trim() ?? col;
    }
    return col;
  });
}

/**
 * Extract the column expression part from an index definition, handling nested parentheses.
 * E.g., "CREATE INDEX idx ON tbl USING btree (lower(name))" → "lower(name)"
 */
export function extractIndexExpressionPart(definition: string): string | null {
  // Find "USING method (" or just the first "(" after ON
  const usingMatch = /USING\s+\w+\s*\(/i.exec(definition);
  if (!usingMatch) {
    return null;
  }

  const startIdx = usingMatch.index + usingMatch[0].length - 1; // Position of opening paren
  let depth = 0;
  let endIdx = -1;

  for (let i = startIdx; i < definition.length; i++) {
    if (definition[i] === "(") {
      depth++;
    } else if (definition[i] === ")") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }

  if (endIdx === -1) {
    return null;
  }

  return definition.substring(startIdx + 1, endIdx);
}

/**
 * Parse index expressions from the column list, handling nested parentheses.
 * E.g., "LOWER(name), id, UPPER(TRIM(email))" → ["LOWER(name)", "id", "UPPER(TRIM(email))"]
 */
export function parseIndexExpressions(columnList: string): string[] {
  const result: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of columnList) {
    if (char === "(") {
      depth++;
      current += char;
    } else if (char === ")") {
      depth--;
      current += char;
    } else if (char === "," && depth === 0) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

// ---------------------------------------------------------------------------
// Describe table query function
// ---------------------------------------------------------------------------

/**
 * Describe a single table with columns, indexes, constraints, and foreign keys.
 */
export async function queryDescribeTable(
  executeQuery: QueryExecutor,
  cache: CacheHelpers,
  tableName: string,
  schemaName = "public",
): Promise<TableInfo> {
  // Performance optimization: return cached result if within TTL
  const cacheKey = `describe:${schemaName}.${tableName}`;
  const cached = cache.getCached(cacheKey) as TableInfo | undefined;
  if (cached) return cached;

  // Performance optimization: run all 5 independent queries in parallel.
  // Each query hits different pg_catalog tables with the same (tableName, schemaName)
  // params, so there are no data dependencies between them.
  const [columnsResult, tableResult, indexesResult, constraintsResult, foreignKeysResult] =
    await Promise.all([
      // 1. Column information including foreign key references
      executeQuery(
        `
            SELECT
                a.attname as name,
                pg_catalog.format_type(a.atttypid, a.atttypmod) as type,
                NOT a.attnotnull as nullable,
                COALESCE(
                    (SELECT true FROM pg_constraint c
                     WHERE c.conrelid = a.attrelid
                     AND a.attnum = ANY(c.conkey)
                     AND c.contype = 'p'),
                    false
                ) as primary_key,
                pg_get_expr(d.adbin, d.adrelid) as default_value,
                a.attgenerated != '' as is_generated,
                pg_get_expr(d.adbin, d.adrelid) as generated_expression,
                col_description(a.attrelid, a.attnum) as comment,
                -- Foreign key reference for this column
                (SELECT json_build_object(
                    'table', ref_t.relname,
                    'schema', ref_n.nspname,
                    'column', ref_a.attname
                )
                FROM pg_constraint c
                JOIN pg_class ref_t ON ref_t.oid = c.confrelid
                JOIN pg_namespace ref_n ON ref_n.oid = ref_t.relnamespace
                JOIN pg_attribute ref_a ON ref_a.attrelid = ref_t.oid
                    AND ref_a.attnum = c.confkey[array_position(c.conkey, a.attnum)]
                WHERE c.conrelid = a.attrelid
                  AND a.attnum = ANY(c.conkey)
                  AND c.contype = 'f'
                LIMIT 1
                ) as foreign_key
            FROM pg_catalog.pg_attribute a
            LEFT JOIN pg_catalog.pg_attrdef d ON (a.attrelid, a.attnum) = (d.adrelid, d.adnum)
            WHERE a.attrelid = ($1 || '.' || $2)::regclass
              AND a.attnum > 0
              AND NOT a.attisdropped
            ORDER BY a.attnum
        `,
        [schemaName, tableName],
      ),

      // 2. Table metadata
      executeQuery(
        `
            SELECT
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
                obj_description(c.oid, 'pg_class') as comment,
                c.relkind = 'p' as is_partitioned,
                pg_get_partkeydef(c.oid) as partition_key
            FROM pg_catalog.pg_class c
            LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
            WHERE c.relname = $1
              AND n.nspname = $2
        `,
        [tableName, schemaName],
      ),

      // 3. Indexes
      executeQuery(
        `
            SELECT
                i.relname as name,
                am.amname as type,
                ix.indisunique as is_unique,
                ix.indisprimary as is_primary,
                pg_get_indexdef(ix.indexrelid) as definition,
                array_agg(a.attname ORDER BY x.ordinality) as columns
            FROM pg_index ix
            JOIN pg_class t ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_am am ON am.oid = i.relam
            CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, ordinality)
            LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
            WHERE t.relname = $1 AND n.nspname = $2
            GROUP BY i.relname, am.amname, ix.indisunique, ix.indisprimary, ix.indexrelid
            ORDER BY i.relname
        `,
        [tableName, schemaName],
      ),

      // 4. Constraints (CHECK, UNIQUE, PRIMARY KEY, EXCLUSION - FK handled separately)
      executeQuery(
        `
            SELECT
                c.conname as name,
                CASE c.contype
                    WHEN 'p' THEN 'primary_key'
                    WHEN 'c' THEN 'check'
                    WHEN 'u' THEN 'unique'
                    WHEN 'x' THEN 'exclusion'
                END as type,
                pg_get_constraintdef(c.oid) as definition,
                array_agg(a.attname ORDER BY x.ordinality) FILTER (WHERE a.attname IS NOT NULL) as columns
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            LEFT JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS x(attnum, ordinality) ON true
            LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
            WHERE t.relname = $1
              AND n.nspname = $2
              AND c.contype IN ('p', 'c', 'u', 'x')
            GROUP BY c.conname, c.contype, c.oid
            ORDER BY
                CASE c.contype WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'c' THEN 2 ELSE 3 END,
                c.conname
        `,
        [tableName, schemaName],
      ),

      // 5. Foreign keys
      executeQuery(
        `
            SELECT
                c.conname as name,
                a.attname as column,
                ref_t.relname as referenced_table,
                ref_n.nspname as referenced_schema,
                ref_a.attname as referenced_column,
                CASE c.confupdtype
                    WHEN 'a' THEN 'NO ACTION'
                    WHEN 'r' THEN 'RESTRICT'
                    WHEN 'c' THEN 'CASCADE'
                    WHEN 'n' THEN 'SET NULL'
                    WHEN 'd' THEN 'SET DEFAULT'
                END as on_update,
                CASE c.confdeltype
                    WHEN 'a' THEN 'NO ACTION'
                    WHEN 'r' THEN 'RESTRICT'
                    WHEN 'c' THEN 'CASCADE'
                    WHEN 'n' THEN 'SET NULL'
                    WHEN 'd' THEN 'SET DEFAULT'
                END as on_delete
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
            JOIN pg_class ref_t ON ref_t.oid = c.confrelid
            JOIN pg_namespace ref_n ON ref_n.oid = ref_t.relnamespace
            JOIN pg_attribute ref_a ON ref_a.attrelid = ref_t.oid AND ref_a.attnum = ANY(c.confkey)
            WHERE t.relname = $1
              AND n.nspname = $2
              AND c.contype = 'f'
            ORDER BY c.conname
        `,
        [tableName, schemaName],
      ),
    ]);

  // --- Process results ---

  const columns: ColumnInfo[] = (columnsResult.rows ?? []).map((row) => {
    const isGenerated = row["is_generated"] as boolean;
    const fkRef = row["foreign_key"] as {
      table: string;
      schema: string;
      column: string;
    } | null;
    const nullable = row["nullable"] as boolean;
    return {
      name: row["name"] as string,
      type: row["type"] as string,
      notNull: !nullable,
      // Omit false/null defaults to reduce payload — only include when truthy/present
      ...(row["primary_key"] === true ? { primaryKey: true as const } : {}),
      ...(row["default_value"] != null ? { defaultValue: row["default_value"] } : {}),
      ...(isGenerated ? { isGenerated: true as const } : {}),
      ...(isGenerated && row["generated_expression"] != null
        ? { generatedExpression: row["generated_expression"] as string }
        : {}),
      ...(row["comment"] != null ? { comment: row["comment"] as string } : {}),
      ...(fkRef
        ? {
            foreignKey: {
              table: fkRef.table,
              schema: fkRef.schema,
              column: fkRef.column,
            },
          }
        : {}),
    };
  });

  const tableRow = tableResult.rows?.[0];

  if (!tableRow) {
    throw new ValidationError(
      `Table or view '${schemaName}.${tableName}' not found.`,
      { tableName, schemaName }
    );
  }

  const indexes = (indexesResult.rows ?? []).map((row) => {
    const rawColumns = parseColumnsArray(row["columns"]);
    const definition = row["definition"] as string;
    return {
      name: row["name"] as string,
      type: row["type"] as string,
      isUnique: row["is_unique"] as boolean,
      isPrimary: row["is_primary"] as boolean,
      columns: extractIndexColumns(rawColumns, definition),
      definition,
    };
  });

  const constraints = (constraintsResult.rows ?? []).map((row) => ({
    name: row["name"] as string,
    type: row["type"] as string,
    definition: row["definition"] as string,
    columns: parseColumnsArray(row["columns"]),
  }));

  // Add NOT NULL "constraints" from column info (synthetic constraint entries)
  const notNullConstraints: typeof constraints = [];
  for (const col of columns) {
    if (col.notNull === true && col.primaryKey !== true) {
      // Skip primary key columns as they have inherent NOT NULL
      notNullConstraints.push({
        name: `${col.name}_not_null`,
        type: "not_null",
        definition: `NOT NULL`,
        columns: [col.name],
      });
    }
  }

  const foreignKeys = (foreignKeysResult.rows ?? []).map((row) => ({
    name: row["name"] as string,
    column: row["column"] as string,
    referencedTable: row["referenced_table"] as string,
    referencedSchema: row["referenced_schema"] as string,
    referencedColumn: row["referenced_column"] as string,
    onUpdate: row["on_update"] as string,
    onDelete: row["on_delete"] as string,
  }));

  // Extract primary key columns from constraints for convenience
  const pkConstraint = constraints.find((c) => c.type === "primary_key");
  const primaryKey = pkConstraint?.columns ?? null;

  const tableInfo: TableInfo = {
    name: tableName,
    schema: schemaName,
    type: (tableRow?.["type"] as TableInfo["type"]) ?? "table",
    ...(tableRow?.["owner"] != null ? { owner: tableRow["owner"] as string } : {}),
    rowCount: (() => {
      const rc = tableRow?.["row_count"];
      const liveEst = Number(tableRow?.["live_row_estimate"]) || 0;
      return rc !== null && rc !== undefined ? Number(rc) : liveEst;
    })(),
    // Omit null/false defaults to reduce payload
    ...(tableRow?.["comment"] != null ? { comment: tableRow["comment"] as string } : {}),
    ...(tableRow?.["is_partitioned"] === true ? { isPartitioned: true as const } : {}),
    ...(tableRow?.["partition_key"] != null ? { partitionKey: tableRow["partition_key"] as string } : {}),
    columns,
    primaryKey,
    indexes,
    constraints: [...constraints, ...notNullConstraints],
    foreignKeys,
  };

  cache.setCache(cacheKey, tableInfo);
  return tableInfo;
}
