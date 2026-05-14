/**
 * PostgreSQL Document Store - Collection Tools
 *
 * Tools for listing, creating, dropping, and inspecting document collections.
 * 4 tools total.
 */

import { ZodError } from "zod";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly, write, destructive } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import {
  IDENTIFIER_RE,
  checkCollectionExists,
  escapeTableRef,
} from "./helpers.js";
import {
  ListCollectionsSchema,
  ListCollectionsSchemaBase,
  CreateCollectionSchema,
  CreateCollectionSchemaBase,
  DropCollectionSchema,
  DropCollectionSchemaBase,
  CollectionInfoSchema,
  CollectionInfoSchemaBase,
  // Output schemas
  ListCollectionsOutputSchema,
  CreateCollectionOutputSchema,
  DropCollectionOutputSchema,
  CollectionInfoOutputSchema,
} from "../../schemas/index.js";

// =============================================================================
// pg_doc_list_collections
// =============================================================================

export function createListCollectionsTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_doc_list_collections",
    description:
      "List JSONB document collections in a schema. Collections are tables with a 'doc' JSONB column and '_id' text column.",
    group: "docstore",
    inputSchema: ListCollectionsSchemaBase,
    outputSchema: ListCollectionsOutputSchema,
    annotations: readOnly("List Collections"),
    icons: getToolIcons("docstore", readOnly("List Collections")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { schema } = ListCollectionsSchema.parse(params) as {
          schema?: string;
        };

        if (schema) {
          const schemaCheck = await adapter.executeQuery(
            "SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1",
            [schema],
          );
          if (!schemaCheck.rows || schemaCheck.rows.length === 0) {
            return formatHandlerErrorResponse(
              new Error(`Schema '${schema}' does not exist`),
              { tool: "pg_doc_list_collections" },
            );
          }
        }

        const query = `
          SELECT
            t.table_name AS name,
            pg_stat_get_live_tuples(c.oid)::int AS "rowCount",
            pg_size_pretty(pg_total_relation_size(c.oid)) AS size
          FROM information_schema.tables t
          JOIN pg_class c ON c.relname = t.table_name
          JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
          WHERE t.table_schema = COALESCE($1, current_schema())
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
          ORDER BY t.table_name`;

        const result = await adapter.executeQuery(query, [schema ?? null]);
        return {
          success: true,
          collections: result.rows ?? [],
          count: result.rows?.length ?? 0,
        };
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, {
            tool: "pg_doc_list_collections",
          });
        }
        return formatHandlerErrorResponse(err, {
          tool: "pg_doc_list_collections",
        });
      }
    },
  };
}

// =============================================================================
// pg_doc_create_collection
// =============================================================================

export function createCreateCollectionTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_doc_create_collection",
    description:
      "Create a new JSONB document collection (table with doc JSONB + generated _id primary key).",
    group: "docstore",
    inputSchema: CreateCollectionSchemaBase,
    outputSchema: CreateCollectionOutputSchema,
    annotations: write("Create Collection"),
    icons: getToolIcons("docstore", write("Create Collection")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { name, schema, ifNotExists } =
          CreateCollectionSchema.parse(params);
        if (!IDENTIFIER_RE.test(name)) {
          return formatHandlerErrorResponse(
            new Error("Invalid collection name"),
            { tool: "pg_doc_create_collection" },
          );
        }
        if (schema && !IDENTIFIER_RE.test(schema)) {
          return formatHandlerErrorResponse(new Error("Invalid schema name"), {
            tool: "pg_doc_create_collection",
          });
        }

        // P154: Pre-check existence
        if (ifNotExists) {
          const check = await checkCollectionExists(adapter, name, schema);
          if (check.exists) {
            return {
              success: true,
              collection: name,
              skipped: true,
              reason: "Collection already exists",
            };
          }
          if (!check.exists && check.reason === "schema") {
            return formatHandlerErrorResponse(
              new Error(`Schema '${check.name}' does not exist`),
              { tool: "pg_doc_create_collection" },
            );
          }
        }

        const tableRef = escapeTableRef(name, schema);
        const createClause = ifNotExists
          ? "CREATE TABLE IF NOT EXISTS"
          : "CREATE TABLE";

        const sql = `${createClause} ${tableRef} (
          doc JSONB NOT NULL,
          _id TEXT GENERATED ALWAYS AS (doc->>'_id') STORED PRIMARY KEY
        )`;

        await adapter.executeQuery(sql);
        adapter.invalidateSchemaCache();
        return { success: true, collection: name };
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, {
            tool: "pg_doc_create_collection",
          });
        }
        const message = err instanceof Error ? err.message : String(err);
        if (message.toLowerCase().includes("already exists")) {
          return formatHandlerErrorResponse(
            new Error(
              `Collection '${(params as { collection?: string })?.collection ?? (params as { name?: string })?.name ?? "unknown"}' already exists`,
            ),
            { tool: "pg_doc_create_collection" },
          );
        }
        return formatHandlerErrorResponse(err, {
          tool: "pg_doc_create_collection",
        });
      }
    },
  };
}

// =============================================================================
// pg_doc_drop_collection
// =============================================================================

export function createDropCollectionTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_doc_drop_collection",
    description: "Drop a document collection (table).",
    group: "docstore",
    inputSchema: DropCollectionSchemaBase,
    outputSchema: DropCollectionOutputSchema,
    annotations: destructive("Drop Collection"),
    icons: getToolIcons("docstore", destructive("Drop Collection")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { name, schema, ifExists } = DropCollectionSchema.parse(params);
        if (!IDENTIFIER_RE.test(name)) {
          return formatHandlerErrorResponse(
            new Error("Invalid collection name"),
            { tool: "pg_doc_drop_collection" },
          );
        }
        if (schema && !IDENTIFIER_RE.test(schema)) {
          return formatHandlerErrorResponse(new Error("Invalid schema name"), {
            tool: "pg_doc_drop_collection",
          });
        }

        // P154: Schema existence check
        if (schema) {
          const schemaCheck = await adapter.executeQuery(
            "SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1",
            [schema],
          );
          if (!schemaCheck.rows || schemaCheck.rows.length === 0) {
            return formatHandlerErrorResponse(
              new Error(`Schema '${schema}' does not exist`),
              { tool: "pg_doc_drop_collection" },
            );
          }
        }

        // Pre-check existence when ifExists is true
        if (ifExists) {
          const check = await checkCollectionExists(adapter, name, schema);
          if (!check.exists) {
            return {
              success: true,
              collection: name,
              message: "Collection did not exist",
            };
          }
        }

        const tableRef = escapeTableRef(name, schema);
        await adapter.executeQuery(
          `DROP TABLE ${ifExists ? "IF EXISTS " : ""}${tableRef}`,
        );
        adapter.invalidateSchemaCache();
        return { success: true, collection: name };
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, {
            tool: "pg_doc_drop_collection",
          });
        }
        const message = err instanceof Error ? err.message : String(err);
        if (message.toLowerCase().includes("does not exist")) {
          return formatHandlerErrorResponse(
            new Error(
              `Collection '${(params as { collection?: string })?.collection ?? (params as { name?: string })?.name ?? "unknown"}' does not exist`,
            ),
            { tool: "pg_doc_drop_collection" },
          );
        }
        return formatHandlerErrorResponse(err, {
          tool: "pg_doc_drop_collection",
        });
      }
    },
  };
}

// =============================================================================
// pg_doc_collection_info
// =============================================================================

export function createCollectionInfoTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_doc_collection_info",
    description:
      "Get document collection statistics: row count, size, and indexes.",
    group: "docstore",
    inputSchema: CollectionInfoSchemaBase,
    outputSchema: CollectionInfoOutputSchema,
    annotations: readOnly("Collection Info"),
    icons: getToolIcons("docstore", readOnly("Collection Info")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { collection, schema } = CollectionInfoSchema.parse(params);
        if (!IDENTIFIER_RE.test(collection)) {
          return formatHandlerErrorResponse(
            new Error("Invalid collection name"),
            { tool: "pg_doc_collection_info" },
          );
        }

        // P154: Check collection existence
        const infoCheck = await checkCollectionExists(
          adapter,
          collection,
          schema,
        );
        if (!infoCheck.exists) {
          return infoCheck.reason === "schema"
            ? formatHandlerErrorResponse(
                new Error(`Schema '${infoCheck.name}' does not exist`),
                { tool: "pg_doc_collection_info" },
              )
            : formatHandlerErrorResponse(
                new Error(`Collection '${collection}' does not exist`),
                { tool: "pg_doc_collection_info" },
              );
        }

        const tableRef = escapeTableRef(collection, schema);

        // Get accurate row count
        const countResult = await adapter.executeQuery(
          `SELECT COUNT(*) AS "rowCount" FROM ${tableRef}`,
        );
        const countRow = countResult.rows?.[0] as
          | { rowCount: string | number }
          | undefined;
        const rowCount =
          typeof countRow?.rowCount === "string"
            ? parseInt(countRow.rowCount, 10)
            : (countRow?.rowCount ?? 0);

        // Get size info
        const sizeResult = await adapter.executeQuery(
          `SELECT
            pg_size_pretty(pg_total_relation_size(c.oid)) AS "totalSize",
            pg_size_pretty(pg_relation_size(c.oid)) AS "tableSize",
            pg_size_pretty(pg_indexes_size(c.oid)) AS "indexSize"
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = $1
            AND n.nspname = COALESCE($2, current_schema())`,
          [collection, schema ?? null],
        );

        const sizeRow = sizeResult.rows?.[0] as
          | Record<string, string>
          | undefined;

        // Get indexes
        const indexResult = await adapter.executeQuery(
          `SELECT
            i.relname AS "indexName",
            ix.indisunique AS "isUnique",
            pg_get_indexdef(ix.indexrelid) AS "definition"
          FROM pg_index ix
          JOIN pg_class i ON i.oid = ix.indexrelid
          JOIN pg_class t ON t.oid = ix.indrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE t.relname = $1
            AND n.nspname = COALESCE($2, current_schema())`,
          [collection, schema ?? null],
        );

        return {
          success: true,
          collection,
          stats: {
            rowCount,
            totalSize: sizeRow?.["totalSize"],
            tableSize: sizeRow?.["tableSize"],
            indexSize: sizeRow?.["indexSize"],
          },
          indexes: indexResult.rows ?? [],
        };
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, {
            tool: "pg_doc_collection_info",
          });
        }
        return formatHandlerErrorResponse(err, {
          tool: "pg_doc_collection_info",
        });
      }
    },
  };
}
