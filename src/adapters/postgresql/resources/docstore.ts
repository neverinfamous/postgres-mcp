/**
 * PostgreSQL Resource - Document Store
 *
 * Lists JSONB document collections in the current database.
 */
import type { PostgresAdapter } from "../postgres-adapter.js";
import type {
  ResourceDefinition,
  RequestContext,
} from "../../../types/index.js";

export function createDocstoreResource(
  adapter: PostgresAdapter,
): ResourceDefinition {
  return {
    uri: "postgres://docstore",
    name: "Document Store Collections",
    description: "JSONB document collections in the current database",
    mimeType: "application/json",
    annotations: {
      audience: ["user", "assistant"],
      priority: 0.5,
    },
    handler: async (_uri: string, _context: RequestContext) => {
      try {
        const result = await adapter.executeQuery(`
          SELECT
            t.table_name AS collection_name,
            pg_stat_get_live_tuples(c.oid)::int AS row_count,
            pg_size_pretty(pg_total_relation_size(c.oid)) AS size
          FROM information_schema.tables t
          JOIN pg_class c ON c.relname = t.table_name
          JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
          WHERE t.table_schema = current_schema()
            AND EXISTS (
              SELECT 1 FROM information_schema.columns c1
              WHERE c1.table_schema = t.table_schema AND c1.table_name = t.table_name
                AND c1.column_name = 'doc' AND c1.udt_name = 'jsonb'
            )
            AND EXISTS (
              SELECT 1 FROM information_schema.columns c2
              WHERE c2.table_schema = t.table_schema AND c2.table_name = t.table_name
                AND c2.column_name = '_id'
            )
          ORDER BY t.table_name
        `);

        return {
          collectionCount: result.rows?.length ?? 0,
          collections: result.rows ?? [],
          note: "JSONB document collections detected by convention (doc JSONB + _id column)",
        };
      } catch {
        return {
          collectionCount: 0,
          collections: [],
          error: "Unable to retrieve document store information",
        };
      }
    },
  };
}
