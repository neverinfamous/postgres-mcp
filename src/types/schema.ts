/**
 * postgres-mcp - Schema Types
 *
 * Database schema metadata types for introspection.
 */

import type { TableInfo } from "./database.js";

/**
 * Schema information for a database
 */
export interface SchemaInfo {
  tables: TableInfo[];
  views?: TableInfo[];
  materializedViews?: TableInfo[];
  indexes?: IndexInfo[];
}

/**
 * Index information
 */
export interface IndexInfo {
  name: string;
  tableName: string;
  schemaName?: string | undefined;
  columns: string[];
  unique: boolean;
  type: "btree" | "hash" | "gist" | "gin" | "spgist" | "brin";
  isPartial?: boolean | undefined;
  predicate?: string | undefined;
  sizeBytes?: number | undefined;
  numberOfScans?: number | undefined;
}


