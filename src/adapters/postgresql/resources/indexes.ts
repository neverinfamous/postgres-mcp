/**
 * Indexes Resource
 *
 * Index usage statistics with unused/rarely-used detection and DROP recommendations.
 */

import type { PostgresAdapter } from "../postgres-adapter.js";
import type {
  ResourceDefinition,
  RequestContext,
} from "../../../types/index.js";
import { MEDIUM_PRIORITY } from "../../../utils/resource-annotations.js";

interface IndexRecommendation {
  type:
    | "UNUSED_INDEX"
    | "RARELY_USED"
    | "RECENTLY_CREATED"
    | "EMPTY_TABLE"
    | "HEALTHY";
  priority?: "HIGH" | "MEDIUM" | "LOW" | "INFO";
  index?: string;
  table?: string;
  size?: string;
  scans?: number;
  tableRows?: number;
  action?: string;
  benefit?: string;
  message?: string;
}

interface IndexRow {
  schemaname: string;
  tablename: string;
  indexname: string;
  index_scans: number;
  tuples_read: number;
  tuples_fetched: number;
  index_size: string;
  size_bytes: number;
  last_idx_scan: string | null;
  potentially_new: boolean;
  table_rows: number;
}

export function createIndexesResource(
  adapter: PostgresAdapter,
): ResourceDefinition {
  return {
    uri: "postgres://indexes",
    name: "Index Statistics",
    description:
      "Index usage statistics with unused/rarely-used detection and DROP recommendations",
    mimeType: "application/json",
    annotations: MEDIUM_PRIORITY,
    handler: async (_uri: string, _context: RequestContext) => {
      // Get index usage statistics including last scan time and table row count
      const indexResult = await adapter.executeQuery(`
                SELECT
                    sui.schemaname,
                    sui.relname as tablename,
                    sui.indexrelname as indexname,
                    sui.idx_scan as index_scans,
                    sui.idx_tup_read as tuples_read,
                    sui.idx_tup_fetch as tuples_fetched,
                    pg_size_pretty(pg_relation_size(sui.indexrelid)) as index_size,
                    pg_relation_size(sui.indexrelid) as size_bytes,
                    sui.last_idx_scan,
                    (sui.idx_scan = 0 AND sui.last_idx_scan IS NULL) as potentially_new,
                    COALESCE(sut.n_live_tup, 0) as table_rows
                FROM pg_stat_user_indexes sui
                LEFT JOIN pg_stat_user_tables sut ON sui.relid = sut.relid
                WHERE sui.schemaname NOT IN ('pg_catalog', 'information_schema')
                ORDER BY sui.idx_scan ASC, pg_relation_size(sui.indexrelid) DESC
                LIMIT 50
            `);
      const indexes = (indexResult.rows ?? []) as unknown as IndexRow[];

      // Separate indexes by status with improved categorization
      // Empty table indexes: 0 scans because table has no data
      const emptyTableIndexes = indexes.filter(
        (idx: IndexRow) => idx.index_scans === 0 && idx.table_rows === 0,
      );

      // Potentially new: 0 scans, table has data, no scan history
      const potentiallyNewIndexes = indexes.filter(
        (idx: IndexRow) =>
          idx.index_scans === 0 && idx.potentially_new && idx.table_rows > 0,
      );

      // Truly unused: 0 scans, table has data, has scan history (was used before)
      const trulyUnusedIndexes = indexes.filter(
        (idx: IndexRow) =>
          idx.index_scans === 0 &&
          !idx.potentially_new &&
          idx.table_rows > 0 &&
          idx.size_bytes > 1024 * 1024, // > 1MB
      );

      const rarelyUsed = indexes.filter(
        (idx: IndexRow) =>
          idx.index_scans > 0 &&
          idx.index_scans < 100 &&
          idx.size_bytes > 10 * 1024 * 1024, // > 10MB
      );

      // Generate recommendations
      const recommendations: IndexRecommendation[] = [];

      // Include indexes on empty tables as info
      for (const idx of emptyTableIndexes.slice(0, 3)) {
        recommendations.push({
          type: "EMPTY_TABLE",
          priority: "INFO",
          index: idx.schemaname + "." + idx.indexname,
          table: idx.tablename,
          size: idx.index_size,
          scans: idx.index_scans,
          tableRows: idx.table_rows,
          message:
            "Index has 0 scans because table is empty. Will be used when data is inserted.",
        });
      }

      // Include recently created indexes as info only
      for (const idx of potentiallyNewIndexes.slice(0, 3)) {
        recommendations.push({
          type: "RECENTLY_CREATED",
          priority: "LOW",
          index: idx.schemaname + "." + idx.indexname,
          table: idx.tablename,
          size: idx.index_size,
          scans: idx.index_scans,
          tableRows: idx.table_rows,
          message: `Index has 0 scans on active table (${String(idx.table_rows)} rows). May be newly created or for rarely-run queries.`,
        });
      }

      for (const idx of trulyUnusedIndexes.slice(0, 5)) {
        recommendations.push({
          type: "UNUSED_INDEX",
          priority: "HIGH",
          index: idx.schemaname + "." + idx.indexname,
          table: idx.tablename,
          size: idx.index_size,
          scans: idx.index_scans,
          action:
            "DROP INDEX IF EXISTS " +
            idx.schemaname +
            "." +
            idx.indexname +
            ";",
          benefit: "Reclaim " + idx.index_size + " and reduce write overhead",
        });
      }

      for (const idx of rarelyUsed.slice(0, 3)) {
        recommendations.push({
          type: "RARELY_USED",
          priority: "MEDIUM",
          index: idx.schemaname + "." + idx.indexname,
          table: idx.tablename,
          size: idx.index_size,
          scans: idx.index_scans,
          action:
            "-- Review before dropping: " +
            idx.schemaname +
            "." +
            idx.indexname,
          benefit:
            idx.index_scans.toString() +
            " scans for " +
            idx.index_size +
            " index",
        });
      }

      if (recommendations.length === 0) {
        recommendations.push({
          type: "HEALTHY",
          message: "No obvious index optimization opportunities found",
        });
      }

      return {
        totalIndexes: indexes.length,
        emptyTableIndexes: emptyTableIndexes.length,
        potentiallyNewIndexes: potentiallyNewIndexes.length,
        unusedIndexes: trulyUnusedIndexes.length,
        rarelyUsedIndexes: rarelyUsed.length,
        indexDetails: indexes.slice(0, 20),
        recommendations,
        summary: `Analyzed ${indexes.length.toString()} indexes. Found ${trulyUnusedIndexes.length.toString()} unused on active tables, ${emptyTableIndexes.length.toString()} on empty tables, ${potentiallyNewIndexes.length.toString()} potentially new, and ${rarelyUsed.length.toString()} rarely-used.`,
      };
    },
  };
}
