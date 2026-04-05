/**
 * Tables Resource
 *
 * List of all tables with metadata (sizes, row counts, etc.).
 */

import type { PostgresAdapter } from "../postgres-adapter.js";
import type {
  ResourceDefinition,
  RequestContext,
} from "../../../types/index.js";
import { MEDIUM_PRIORITY } from "../../../utils/resource-annotations.js";

export function createTablesResource(
  adapter: PostgresAdapter,
): ResourceDefinition {
  return {
    uri: "postgres://tables",
    name: "Tables List",
    description:
      "Lightweight table listing with sizes and row counts. Use postgres://schema for full DDL structure with columns, constraints, and indexes.",
    mimeType: "application/json",
    annotations: MEDIUM_PRIORITY,
    handler: async (_uri: string, _context: RequestContext) => {
      const tables = await adapter.listTables();
      return { tables, count: tables.length };
    },
  };
}
