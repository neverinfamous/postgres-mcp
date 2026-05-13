/**
 * postgres-mcp - Document Store Tool Schemas
 *
 * Input validation and output schemas for document store tools.
 * 9 tools: list_collections, create_collection, drop_collection,
 * collection_info, find, add, modify, remove, create_index.
 */

import { z } from "zod";
import { ErrorResponseFields } from "./error-response-fields.js";

// Helper to handle undefined params (allows tools to be called without {})
const defaultToEmpty = (val: unknown): unknown => val ?? {};

// =============================================================================
// Input Schemas (Split Schema pattern: Base for MCP, Preprocessed for handler)
// =============================================================================

/**
 * pg_doc_list_collections — list JSONB document collections in a schema
 */
export const ListCollectionsSchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Schema name (defaults to current_schema())"),
});

export const ListCollectionsSchema = z.preprocess(
  defaultToEmpty,
  ListCollectionsSchemaBase,
);

/**
 * pg_doc_create_collection — create a new JSONB document collection
 */
export const CreateCollectionSchemaBase = z.object({
  name: z.string().optional().describe("Collection name"),
  collection: z.string().optional().describe("Alias for name"),
  schema: z
    .unknown()
    .optional()
    .describe("Schema to create in (defaults to current_schema())"),
  ifNotExists: z
    .unknown()
    .optional()
    .describe("Skip without error if collection already exists (default: false)"),
});

export const CreateCollectionSchema = z.preprocess(
  (val: unknown) => {
    if (typeof val === "object" && val !== null) {
      const obj = val as Record<string, unknown>;
      return {
        ...obj,
        name: obj["name"] ?? obj["collection"],
      };
    }
    return val;
  },
  z.object({
    name: z.string().describe("Collection name"),
    schema: z.string().optional(),
    ifNotExists: z.preprocess((val) => val === "true" || val === true, z.boolean().default(false)),
  })
);

/**
 * pg_doc_drop_collection — drop a document collection
 */
export const DropCollectionSchemaBase = z.object({
  name: z.string().optional().describe("Collection name to drop"),
  collection: z.string().optional().describe("Alias for name"),
  schema: z.unknown().optional(),
  ifExists: z
    .unknown()
    .optional()
    .describe("Skip without error if collection does not exist (default: false)"),
});

export const DropCollectionSchema = z.preprocess(
  (val: unknown) => {
    if (typeof val === "object" && val !== null) {
      const obj = val as Record<string, unknown>;
      return {
        ...obj,
        name: obj["name"] ?? obj["collection"],
      };
    }
    return val;
  },
  z.object({
    name: z.string(),
    schema: z.string().optional(),
    ifExists: z.preprocess((val) => val === "true" || val === true, z.boolean().default(false)),
  })
);

/**
 * pg_doc_collection_info — get collection statistics
 */
export const CollectionInfoSchemaBase = z.object({
  collection: z.string().optional().describe("Collection name"),
  schema: z.string().optional(),
});

export const CollectionInfoSchema = z.object({
  collection: z.string(),
  schema: z.string().optional(),
});

/**
 * pg_doc_find — query documents in a collection
 */
export const FindSchemaBase = z.object({
  collection: z.string().optional().describe("Collection name"),
  schema: z.string().optional(),
  filter: z
    .unknown()
    .optional()
    .describe(
      "Filter: _id value (32-char hex), field=value, JSON object filter ({\"field\":\"value\"}), or JSON path existence ($.field)",
    ),
  fields: z
    .unknown()
    .optional()
    .describe("Fields to project (returns full doc if omitted)"),
  limit: z
    .unknown()
    .optional()
    .describe("Maximum documents to return (default: 100)"),
  offset: z
    .unknown()
    .optional()
    .describe("Number of documents to skip (default: 0)"),
});

export const FindSchema = z.object({
  collection: z.string(),
  schema: z.string().optional(),
  filter: z.preprocess((val) => (typeof val === "object" && val !== null ? JSON.stringify(val) : val), z.string().optional()),
  fields: z.array(z.string()).optional(),
  limit: z.preprocess((val) => (val !== undefined ? Number(val) : 50), z.number().default(50)),
  offset: z.preprocess((val) => (val !== undefined ? Number(val) : 0), z.number().default(0)),
});

/**
 * pg_doc_add — add documents to a collection
 */
export const AddDocSchemaBase = z.object({
  collection: z.string().optional().describe("Collection name"),
  schema: z.unknown().optional(),
  documents: z
    .unknown()
    .optional()
    .describe("Documents to add"),
});

export const AddDocSchema = z.object({
  collection: z.string(),
  schema: z.string().optional(),
  documents: z.array(z.record(z.string(), z.unknown())),
});

/**
 * pg_doc_modify — update documents matching a filter
 */
export const ModifyDocSchemaBase = z.object({
  collection: z.string().optional().describe("Collection name"),
  schema: z.string().optional(),
  filter: z
    .unknown()
    .optional()
    .describe(
      "Filter: _id value (32-char hex), field=value, JSON object filter ({\"field\":\"value\"}), or JSON path existence ($.field)",
    ),
  set: z
    .unknown()
    .optional()
    .describe("Fields to set (key→value)"),
  unset: z
    .unknown()
    .optional()
    .describe("Field names to remove from documents"),
});

export const ModifyDocSchema = z.object({
  collection: z.string(),
  schema: z.string().optional(),
  filter: z.preprocess((val) => (typeof val === "object" && val !== null ? JSON.stringify(val) : val), z.string()),
  set: z.record(z.string(), z.unknown()).optional(),
  unset: z.array(z.string()).optional(),
});

/**
 * pg_doc_remove — remove documents matching a filter
 */
export const RemoveDocSchemaBase = z.object({
  collection: z.string().optional().describe("Collection name"),
  schema: z.string().optional(),
  filter: z
    .unknown()
    .optional()
    .describe(
      "Filter: _id value (32-char hex), field=value, JSON object filter ({\"field\":\"value\"}), or JSON path existence ($.field)",
    ),
});

export const RemoveDocSchema = z.object({
  collection: z.string(),
  schema: z.string().optional(),
  filter: z.preprocess((val) => (typeof val === "object" && val !== null ? JSON.stringify(val) : val), z.string()),
});

/**
 * pg_doc_create_index — create an index on document fields
 */
export const CreateDocIndexSchemaBase = z.object({
  collection: z.string().optional().describe("Collection name"),
  schema: z.string().optional(),
  name: z.unknown().optional().describe("Index name (generated if omitted)"),
  fields: z
    .unknown()
    .optional()
    .describe("Fields to index"),
  field: z.unknown().optional().describe("Alias for fields (single path string)"),
  unique: z
    .unknown()
    .optional()
    .describe("Create a UNIQUE index (default: false)"),
});

export const CreateDocIndexSchema = z.preprocess(
  (val: unknown) => {
    if (typeof val === "object" && val !== null) {
      const obj = val as Record<string, unknown>;
      const processed: Record<string, unknown> = { ...obj };
      // Map 'field' to 'fields' array if 'fields' is missing
      if (processed["fields"] === undefined && typeof processed["field"] === "string") {
        processed["fields"] = [{ path: processed["field"], type: "TEXT" }];
      }
      // Auto-generate name if missing, using collection and the first field
      if (
        processed["name"] === undefined &&
        typeof processed["collection"] === "string" &&
        Array.isArray(processed["fields"]) &&
        processed["fields"].length > 0
      ) {
        const firstField = processed["fields"][0] as Record<string, unknown>;
        const pathStr = typeof firstField["path"] === "string" ? firstField["path"] : "unknown";
        processed["name"] = `idx_${processed["collection"]}_${pathStr.replace(/[^a-zA-Z0-9]/g, "_")}`;
      }
      return processed;
    }
    return val;
  },
  z.object({
    collection: z.string(),
    schema: z.string().optional(),
    name: z.string(),
    fields: z.array(
      z.object({
        path: z.string(),
        type: z
          .enum(["TEXT", "INT", "DOUBLE", "DATE", "TIMESTAMP", "BOOLEAN"])
          .default("TEXT"),
      }),
    ),
    unique: z.preprocess((val) => val === "true" || val === true, z.boolean().default(false)),
  })
);

// =============================================================================
// Output Schemas
// =============================================================================

/**
 * pg_doc_list_collections output
 */
export const ListCollectionsOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether operation succeeded"),
    collections: z
      .array(
        z.object({
          name: z.string().describe("Collection (table) name"),
          rowCount: z.number().optional().describe("Estimated row count"),
          size: z.string().optional().describe("Table size (pretty-printed)"),
        }),
      )
      .optional()
      .describe("Document collections found"),
    count: z.number().optional().describe("Number of collections"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_doc_create_collection output
 */
export const CreateCollectionOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether collection was created"),
    collection: z.string().optional().describe("Collection name"),
    skipped: z
      .boolean()
      .optional()
      .describe("True if collection already existed (with ifNotExists)"),
    reason: z.string().optional().describe("Reason for skipping"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_doc_drop_collection output
 */
export const DropCollectionOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether collection was dropped"),
    collection: z.string().optional().describe("Collection name"),
    message: z.string().optional().describe("Status message"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_doc_collection_info output
 */
export const CollectionInfoOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether operation succeeded"),
    collection: z.string().optional().describe("Collection name"),
    stats: z
      .object({
        rowCount: z.number().describe("Exact row count"),
        totalSize: z.string().optional().describe("Total size (pretty-printed)"),
        tableSize: z.string().optional().describe("Table data size"),
        indexSize: z.string().optional().describe("Index size"),
      })
      .optional()
      .describe("Collection statistics"),
    indexes: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Indexes on the collection"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_doc_find output
 */
export const FindOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether operation succeeded"),
    documents: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Matching documents"),
    count: z.number().optional().describe("Number of documents returned"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_doc_add output
 */
export const AddDocOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether documents were added"),
    inserted: z.number().optional().describe("Number of documents inserted"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_doc_modify output
 */
export const ModifyDocOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether documents were modified"),
    modified: z.number().optional().describe("Number of documents modified"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_doc_remove output
 */
export const RemoveDocOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether documents were removed"),
    removed: z.number().optional().describe("Number of documents removed"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_doc_create_index output
 */
export const CreateDocIndexOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether index was created"),
    index: z.string().optional().describe("Index name"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);
