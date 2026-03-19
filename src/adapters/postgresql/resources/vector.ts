/**
 * pgvector Status Resource
 *
 * Provides pgvector extension status, vector columns, and index information.
 */

import type { PostgresAdapter } from "../postgres-adapter.js";
import type { ResourceDefinition } from "../../../types/index.js";
import { LOW_PRIORITY } from "../../../utils/resource-annotations.js";
import {
  toStr,
  SMALL_TABLE_THRESHOLD,
} from "../../../utils/query-helpers.js";



interface VectorColumn {
  schema: string;
  table: string;
  column: string;
  dimensions: number;
  rowCount: number;
}

interface VectorIndex {
  schema: string;
  table: string;
  indexName: string;
  indexType: string;
  column: string;
  size: string;
  options: string | null;
}

interface UnindexedVectorColumn {
  column: string;
  suggestedHnswSql: string;
  suggestedIvfflatSql: string;
}

interface VectorResourceData {
  extensionInstalled: boolean;
  extensionVersion: string | null;
  vectorColumns: VectorColumn[];
  columnCount: number;
  indexes: VectorIndex[];
  indexCount: number;
  hnswIndexCount: number;
  ivfflatIndexCount: number;
  unindexedColumns: UnindexedVectorColumn[];
  indexTypeGuidance?: {
    hnsw: string;
    ivfflat: string;
    recommendation: string;
  };
  recommendations: string[];
}

export function createVectorResource(
  adapter: PostgresAdapter,
): ResourceDefinition {
  return {
    uri: "postgres://vector",
    name: "pgvector Status",
    description:
      "pgvector extension status, vector columns, index types, and performance recommendations",
    mimeType: "application/json",
    annotations: LOW_PRIORITY,
    handler: async (): Promise<string> => {
      const result: VectorResourceData = {
        extensionInstalled: false,
        extensionVersion: null,
        vectorColumns: [],
        columnCount: 0,
        indexes: [],
        indexCount: 0,
        hnswIndexCount: 0,
        ivfflatIndexCount: 0,
        unindexedColumns: [],
        recommendations: [],
      };

      // Check if pgvector is installed (outside try-catch for correct error messaging)
      const extCheck = await adapter.executeQuery(
        `SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
      );

      if (!extCheck.rows || extCheck.rows.length === 0) {
        result.recommendations.push(
          "pgvector extension is not installed. Use pg_vector_create_extension to enable vector similarity search.",
        );
        return JSON.stringify(result, null, 2);
      }

      result.extensionInstalled = true;
      const extVersion = extCheck.rows[0]?.["extversion"];
      result.extensionVersion =
        typeof extVersion === "string" ? extVersion : null;

      try {
        // Get all vector columns
        const columnsResult = await adapter.executeQuery(
          `SELECT 
                        n.nspname as schema_name,
                        c.relname as table_name,
                        a.attname as column_name,
                        COALESCE(
                            (regexp_match(format_type(a.atttypid, a.atttypmod), 'vector\\((\\d+)\\)'))[1]::int,
                            0
                        ) as dimensions,
                        COALESCE(s.n_live_tup, 0)::int as row_count
                     FROM pg_attribute a
                     JOIN pg_class c ON a.attrelid = c.oid
                     JOIN pg_namespace n ON c.relnamespace = n.oid
                     LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
                     WHERE format_type(a.atttypid, a.atttypmod) LIKE 'vector%'
                       AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                       AND a.attnum > 0
                       AND NOT a.attisdropped
                     ORDER BY n.nspname, c.relname, a.attname`,
        );

        if (columnsResult.rows) {
          for (const row of columnsResult.rows) {
            result.vectorColumns.push({
              schema: toStr(row["schema_name"]),
              table: toStr(row["table_name"]),
              column: toStr(row["column_name"]),
              dimensions: Number(row["dimensions"] ?? 0),
              rowCount: Number(row["row_count"] ?? 0),
            });
          }
        }
        result.columnCount = result.vectorColumns.length;

        // Get vector indexes
        const indexResult = await adapter.executeQuery(
          `SELECT 
                        n.nspname as schema_name,
                        t.relname as table_name,
                        i.relname as index_name,
                        am.amname as index_type,
                        a.attname as column_name,
                        pg_size_pretty(pg_relation_size(i.oid)) as index_size,
                        pg_get_indexdef(idx.indexrelid) as options
                     FROM pg_index idx
                     JOIN pg_class i ON idx.indexrelid = i.oid
                     JOIN pg_class t ON idx.indrelid = t.oid
                     JOIN pg_namespace n ON t.relnamespace = n.oid
                     JOIN pg_am am ON i.relam = am.oid
                     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(idx.indkey)
                     WHERE am.amname IN ('hnsw', 'ivfflat')
                       AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                     ORDER BY n.nspname, t.relname, i.relname`,
        );

        if (indexResult.rows) {
          for (const row of indexResult.rows) {
            const options = row["options"];
            result.indexes.push({
              schema: toStr(row["schema_name"]),
              table: toStr(row["table_name"]),
              indexName: toStr(row["index_name"]),
              indexType: toStr(row["index_type"]),
              column: toStr(row["column_name"]),
              size: toStr(row["index_size"]) || "0 bytes",
              options: typeof options === "string" ? options : null,
            });
          }
        }
        result.indexCount = result.indexes.length;
        result.hnswIndexCount = result.indexes.filter(
          (i) => i.indexType === "hnsw",
        ).length;
        result.ivfflatIndexCount = result.indexes.filter(
          (i) => i.indexType === "ivfflat",
        ).length;

        // Find unindexed vector columns and generate actionable SQL
        // Skip small tables where indexes provide minimal benefit
        const indexedColumns = new Set(
          result.indexes.map((i) => `${i.schema}.${i.table}.${i.column}`),
        );

        // Get existing index names to avoid conflicts
        const existingIndexResult = await adapter.executeQuery(`
                    SELECT indexname FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
                `);
        const existingIndexNames = new Set(
          (existingIndexResult.rows ?? []).map(
            (r: Record<string, unknown>) => r["indexname"] as string,
          ),
        );

        const unindexedCols = result.vectorColumns.filter(
          (c) =>
            !indexedColumns.has(`${c.schema}.${c.table}.${c.column}`) &&
            c.rowCount >= SMALL_TABLE_THRESHOLD,
        );

        const smallTableCount = result.vectorColumns.filter(
          (c) =>
            !indexedColumns.has(`${c.schema}.${c.table}.${c.column}`) &&
            c.rowCount < SMALL_TABLE_THRESHOLD,
        ).length;

        result.unindexedColumns = unindexedCols.map((c) => {
          // Generate unique index names
          let hnswName = `idx_${c.table}_${c.column}_hnsw`;
          let ivfflatName = `idx_${c.table}_${c.column}_ivfflat`;

          // Add suffix if name already exists
          let suffix = 1;
          while (existingIndexNames.has(hnswName)) {
            hnswName = `idx_${c.table}_${c.column}_hnsw_${String(suffix)}`;
            suffix++;
          }
          suffix = 1;
          while (existingIndexNames.has(ivfflatName)) {
            ivfflatName = `idx_${c.table}_${c.column}_ivfflat_${String(suffix)}`;
            suffix++;
          }

          return {
            column: `${c.schema}.${c.table}.${c.column}`,
            suggestedHnswSql: `CREATE INDEX IF NOT EXISTS "${hnswName}" ON "${c.schema}"."${c.table}" USING hnsw ("${c.column}" vector_cosine_ops);`,
            suggestedIvfflatSql: `CREATE INDEX IF NOT EXISTS "${ivfflatName}" ON "${c.schema}"."${c.table}" USING ivfflat ("${c.column}" vector_l2_ops) WITH (lists = 100);`,
          };
        });

        // Generate recommendations
        if (result.columnCount === 0) {
          result.recommendations.push(
            "No vector columns found. Use pg_vector_add_column to add vector columns to tables.",
          );
        }

        if (result.unindexedColumns.length > 0) {
          const columnNames = result.unindexedColumns
            .slice(0, 3)
            .map((c) => c.column)
            .join(", ");
          result.recommendations.push(
            `${String(result.unindexedColumns.length)} vector column(s) on larger tables without indexes: ${columnNames}${result.unindexedColumns.length > 3 ? "..." : ""}. See unindexedColumns for ready-to-use CREATE INDEX SQL.`,
          );
        }

        // Note about small tables that were skipped
        if (smallTableCount > 0 && result.unindexedColumns.length === 0) {
          result.recommendations.push(
            `${String(smallTableCount)} unindexed vector column(s) on small tables (<${String(SMALL_TABLE_THRESHOLD)} rows). Indexes optional for small tables.`,
          );
        }

        for (const col of result.vectorColumns) {
          const isUnindexed = result.unindexedColumns.some(
            (u) => u.column === `${col.schema}.${col.table}.${col.column}`,
          );
          // pgvector: 100K threshold — sequential vector scans are tolerable
          // on moderate tables unlike spatial queries, so HNSW urging starts later.
          if (col.rowCount > 100000 && isUnindexed) {
            result.recommendations.push(
              `Large unindexed vector column: ${col.table}.${col.column} (${String(col.rowCount)} rows). HNSW index strongly recommended.`,
            );
          }
        }

        if (result.ivfflatIndexCount > 0 && result.hnswIndexCount === 0) {
          result.recommendations.push(
            "Using IVFFlat indexes only. Consider HNSW for better query performance (higher build cost).",
          );
        }

        // Add index type guidance
        result.indexTypeGuidance = {
          hnsw: "HNSW (Hierarchical Navigating Small Worlds): Higher recall, faster queries. Best for most use cases. Higher memory and build time. Recommended for production.",
          ivfflat:
            'IVFFlat (Inverted File with Flat compression): Faster to build, lower memory. Requires tuning "lists" parameter (sqrt(rows) recommended). Better for prototyping or resource-constrained environments.',
          recommendation:
            result.indexCount === 0
              ? "Start with HNSW for best query performance. Use IVFFlat if build time or memory is a constraint."
              : result.hnswIndexCount > 0 && result.ivfflatIndexCount === 0
                ? "Using HNSW indexes - optimal for query performance."
                : "Mixed index types detected. Consider migrating IVFFlat to HNSW for consistent performance.",
        };
      } catch {
        // Extension is installed but data queries failed
        result.recommendations.push(
          "Error querying pgvector data. Check permissions on vector columns and indexes.",
        );
      }

      return JSON.stringify(result, null, 2);
    },
  };
}
