/**
 * Schema Resource
 *
 * Full database schema including tables, views, indexes, and constraints.
 * Enhanced with statsStale detection based on modification percentage.
 */

import type { PostgresAdapter } from "../postgres-adapter.js";
import type {
  ResourceDefinition,
  RequestContext,
  TableInfo,
} from "../../../types/index.js";
import { HIGH_PRIORITY } from "../../../utils/resource-annotations.js";

interface TableStatsModification {
  schemaname: string;
  relname: string;
  n_mod_since_analyze: number;
  n_live_tup: number;
}

/** Safely convert unknown value to string */
function toStr(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value.toString();
  return "";
}

/** Safely convert unknown value to number */
function toNum(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

export function createSchemaResource(
  adapter: PostgresAdapter,
): ResourceDefinition {
  return {
    uri: "postgres://schema",
    name: "Database Schema",
    description:
      "Comprehensive database schema: tables with columns/constraints/indexes, views, and statsStale detection. Use postgres://tables for a lightweight table listing.",
    mimeType: "application/json",
    annotations: HIGH_PRIORITY,
    handler: async (_uri: string, _context: RequestContext) => {
      const schema = await adapter.getSchema();

      // Get modification statistics to determine statsStale based on >10% modified
      const statsResult = await adapter.executeQuery(`
                SELECT schemaname, relname, 
                       COALESCE(n_mod_since_analyze, 0) as n_mod_since_analyze,
                       COALESCE(n_live_tup, 0) as n_live_tup
                FROM pg_stat_user_tables
            `);
      const statsMap = new Map<string, TableStatsModification>();
      for (const row of statsResult.rows ?? []) {
        const schemaname = toStr(row["schemaname"]);
        const relname = toStr(row["relname"]);
        const key = `${schemaname}.${relname}`;
        statsMap.set(key, {
          schemaname,
          relname,
          n_mod_since_analyze: toNum(row["n_mod_since_analyze"]),
          n_live_tup: toNum(row["n_live_tup"]),
        });
      }

      // Enhance tables with statsStale based on modification percentage
      const enhancedTables = (schema.tables ?? []).map((table: TableInfo) => {
        const key = `${table.schema ?? "public"}.${table.name}`;
        const stats = statsMap.get(key);

        // statsStale is true if:
        // 1. Already marked stale (reltuples = -1)
        // 2. OR modification percentage > 10%
        let statsStale = table.statsStale === true;
        if (stats && stats.n_live_tup > 0) {
          const pctModified =
            (stats.n_mod_since_analyze / stats.n_live_tup) * 100;
          if (pctModified > 10) {
            statsStale = true;
          }
        }

        return {
          ...table,
          statsStale,
        };
      });

      return {
        ...schema,
        tables: enhancedTables,
      };
    },
  };
}
