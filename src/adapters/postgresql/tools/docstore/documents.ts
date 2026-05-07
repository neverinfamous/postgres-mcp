/**
 * PostgreSQL Document Store - Document Tools
 *
 * Tools for finding, adding, modifying, and removing documents.
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
  parseDocFilter,
  checkCollectionExists,
  escapeTableRef,
} from "./helpers.js";
import {
  FindSchema,
  FindSchemaBase,
  AddDocSchema,
  AddDocSchemaBase,
  ModifyDocSchema,
  ModifyDocSchemaBase,
  RemoveDocSchema,
  RemoveDocSchemaBase,
  // Output schemas
  FindOutputSchema,
  AddDocOutputSchema,
  ModifyDocOutputSchema,
  RemoveDocOutputSchema,
} from "../../schemas/index.js";

// =============================================================================
// pg_doc_find
// =============================================================================

export function createFindTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_doc_find",
    description:
      "Query documents in a JSONB collection with optional filter, field projection, and pagination.",
    group: "docstore",
    inputSchema: FindSchemaBase,
    outputSchema: FindOutputSchema,
    annotations: readOnly("Find Documents"),
    icons: getToolIcons("docstore", readOnly("Find Documents")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { collection, schema, filter, fields, limit, offset } =
          FindSchema.parse(params);
        if (!IDENTIFIER_RE.test(collection)) {
          return formatHandlerErrorResponse(
            new Error("Invalid collection name"),
            { tool: "pg_doc_find" },
          );
        }
        if (schema && !IDENTIFIER_RE.test(schema)) {
          return formatHandlerErrorResponse(
            new Error("Invalid schema name"),
            { tool: "pg_doc_find" },
          );
        }

        // P154: Check collection existence
        const findCheck = await checkCollectionExists(
          adapter,
          collection,
          schema,
        );
        if (!findCheck.exists) {
          return findCheck.reason === "schema"
            ? formatHandlerErrorResponse(
                new Error(`Schema '${findCheck.name}' does not exist`),
                { tool: "pg_doc_find" },
              )
            : formatHandlerErrorResponse(
                new Error(`Collection '${collection}' does not exist`),
                { tool: "pg_doc_find" },
              );
        }

        let selectClause = "_id, doc";
        if (fields && fields.length > 0) {
          // Validate all field names
          for (const f of fields) {
            if (!IDENTIFIER_RE.test(f)) {
              return formatHandlerErrorResponse(
                new Error(
                  `Invalid field name: "${f}". Field names must be valid identifiers.`,
                ),
                { tool: "pg_doc_find" },
              );
            }
          }
          // Build a JSONB projection using jsonb_build_object
          selectClause =
            "jsonb_build_object(" +
            fields.map((f) => `'${f}', doc->'${f}'`).join(", ") +
            ") AS doc";
        }

        const tableRef = escapeTableRef(collection, schema);
        let query = `SELECT ${selectClause} FROM ${tableRef}`;
        let queryParams: unknown[] = [];

        if (filter) {
          const { where, params: whereParams } = parseDocFilter(filter);
          query += ` WHERE ${where}`;
          queryParams = whereParams;
        }

        // Add LIMIT and OFFSET using parameterized values
        const limitParamIdx = queryParams.length + 1;
        const offsetParamIdx = queryParams.length + 2;
        query += ` LIMIT $${String(limitParamIdx)} OFFSET $${String(offsetParamIdx)}`;
        queryParams.push(limit, offset);

        const result = await adapter.executeQuery(query, queryParams);
        const docs = (result.rows ?? []).map(
          (r: Record<string, unknown>) => {
            const docValue = r["doc"];
            const idValue = r["_id"];
            const parsed =
              typeof docValue === "string"
                ? (JSON.parse(docValue) as Record<string, unknown>)
                : (docValue as Record<string, unknown>);

            if (
              idValue !== undefined &&
              parsed !== null &&
              typeof parsed === "object" &&
              !Array.isArray(parsed)
            ) {
              if (!("_id" in parsed)) {
                parsed["_id"] = idValue;
              }
            }
            return parsed;
          },
        );

        return { success: true, documents: docs, count: docs.length };
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, { tool: "pg_doc_find" });
        }
        return formatHandlerErrorResponse(err, { tool: "pg_doc_find" });
      }
    },
  };
}

// =============================================================================
// pg_doc_add
// =============================================================================

export function createAddTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_doc_add",
    description: "Add one or more JSON documents to a collection.",
    group: "docstore",
    inputSchema: AddDocSchemaBase,
    outputSchema: AddDocOutputSchema,
    annotations: write("Add Documents"),
    icons: getToolIcons("docstore", write("Add Documents")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { collection, schema, documents } = AddDocSchema.parse(params);
        if (!IDENTIFIER_RE.test(collection)) {
          return formatHandlerErrorResponse(
            new Error("Invalid collection name"),
            { tool: "pg_doc_add" },
          );
        }
        if (schema && !IDENTIFIER_RE.test(schema)) {
          return formatHandlerErrorResponse(
            new Error("Invalid schema name"),
            { tool: "pg_doc_add" },
          );
        }

        const addCheck = await checkCollectionExists(
          adapter,
          collection,
          schema,
        );
        if (!addCheck.exists) {
          return addCheck.reason === "schema"
            ? formatHandlerErrorResponse(
                new Error(`Schema '${addCheck.name}' does not exist`),
                { tool: "pg_doc_add" },
              )
            : formatHandlerErrorResponse(
                new Error(`Collection '${collection}' does not exist`),
                { tool: "pg_doc_add" },
              );
        }

        const tableRef = escapeTableRef(collection, schema);
        let inserted = 0;
        for (const doc of documents) {
          // Generate _id if not present (32-char hex for cross-project consistency)
          doc["_id"] ??= crypto.randomUUID().replace(/-/g, "");
          await adapter.executeQuery(
            `INSERT INTO ${tableRef} (doc) VALUES ($1::jsonb)`,
            [JSON.stringify(doc)],
          );
          inserted++;
        }
        return { success: true, inserted };
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, { tool: "pg_doc_add" });
        }
        return formatHandlerErrorResponse(err, { tool: "pg_doc_add" });
      }
    },
  };
}

// =============================================================================
// pg_doc_modify
// =============================================================================

export function createModifyTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_doc_modify",
    description:
      "Update documents matching a filter. Set fields with 'set' and remove fields with 'unset'.",
    group: "docstore",
    inputSchema: ModifyDocSchemaBase,
    outputSchema: ModifyDocOutputSchema,
    annotations: write("Modify Documents"),
    icons: getToolIcons("docstore", write("Modify Documents")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { collection, schema, filter, set, unset } =
          ModifyDocSchema.parse(params);
        if (!IDENTIFIER_RE.test(collection)) {
          return formatHandlerErrorResponse(
            new Error("Invalid collection name"),
            { tool: "pg_doc_modify" },
          );
        }
        if (schema && !IDENTIFIER_RE.test(schema)) {
          return formatHandlerErrorResponse(
            new Error("Invalid schema name"),
            { tool: "pg_doc_modify" },
          );
        }

        const modCheck = await checkCollectionExists(
          adapter,
          collection,
          schema,
        );
        if (!modCheck.exists) {
          return modCheck.reason === "schema"
            ? formatHandlerErrorResponse(
                new Error(`Schema '${modCheck.name}' does not exist`),
                { tool: "pg_doc_modify" },
              )
            : formatHandlerErrorResponse(
                new Error(`Collection '${collection}' does not exist`),
                { tool: "pg_doc_modify" },
              );
        }

        // Build SET clause using jsonb_set for set operations
        // and #- operator for unset operations
        let docExpr = "doc";
        const updateParams: unknown[] = [];
        let paramIdx = 1;

        if (set) {
          for (const [path, value] of Object.entries(set)) {
            if (!IDENTIFIER_RE.test(path)) {
              return formatHandlerErrorResponse(
                new Error(
                  `Invalid field path: "${path}". Paths must be valid identifiers.`,
                ),
                { tool: "pg_doc_modify" },
              );
            }
            // jsonb_set(doc, '{path}', $N::jsonb, true)
            docExpr = `jsonb_set(${docExpr}, '{${path}}', $${String(paramIdx)}::jsonb, true)`;
            updateParams.push(JSON.stringify(value));
            paramIdx++;
          }
        }

        if (unset) {
          for (const path of unset) {
            if (!IDENTIFIER_RE.test(path)) {
              return formatHandlerErrorResponse(
                new Error(
                  `Invalid field path: "${path}". Paths must be valid identifiers.`,
                ),
                { tool: "pg_doc_modify" },
              );
            }
            // doc #- '{path}'
            docExpr = `${docExpr} #- '{${path}}'`;
          }
        }

        if (docExpr === "doc") {
          return formatHandlerErrorResponse(
            new Error("No modifications specified"),
            { tool: "pg_doc_modify" },
          );
        }

        const { where, params: whereParams } = parseDocFilter(
          filter,
          updateParams.length,
        );
        const allParams = [...updateParams, ...whereParams];

        const tableRef = escapeTableRef(collection, schema);
        const query = `UPDATE ${tableRef} SET doc = ${docExpr} WHERE ${where}`;
        const result = await adapter.executeQuery(query, allParams);
        return { success: true, modified: result.rowsAffected ?? 0 };
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, { tool: "pg_doc_modify" });
        }
        return formatHandlerErrorResponse(err, { tool: "pg_doc_modify" });
      }
    },
  };
}

// =============================================================================
// pg_doc_remove
// =============================================================================

export function createRemoveTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_doc_remove",
    description: "Remove documents matching a filter from a collection.",
    group: "docstore",
    inputSchema: RemoveDocSchemaBase,
    outputSchema: RemoveDocOutputSchema,
    annotations: destructive("Remove Documents"),
    icons: getToolIcons("docstore", destructive("Remove Documents")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { collection, schema, filter } = RemoveDocSchema.parse(params);
        if (!IDENTIFIER_RE.test(collection)) {
          return formatHandlerErrorResponse(
            new Error("Invalid collection name"),
            { tool: "pg_doc_remove" },
          );
        }
        if (schema && !IDENTIFIER_RE.test(schema)) {
          return formatHandlerErrorResponse(
            new Error("Invalid schema name"),
            { tool: "pg_doc_remove" },
          );
        }

        const rmCheck = await checkCollectionExists(
          adapter,
          collection,
          schema,
        );
        if (!rmCheck.exists) {
          return rmCheck.reason === "schema"
            ? formatHandlerErrorResponse(
                new Error(`Schema '${rmCheck.name}' does not exist`),
                { tool: "pg_doc_remove" },
              )
            : formatHandlerErrorResponse(
                new Error(`Collection '${collection}' does not exist`),
                { tool: "pg_doc_remove" },
              );
        }

        const { where, params: whereParams } = parseDocFilter(filter);
        const tableRef = escapeTableRef(collection, schema);
        const query = `DELETE FROM ${tableRef} WHERE ${where}`;
        const result = await adapter.executeQuery(query, whereParams);
        return { success: true, removed: result.rowsAffected ?? 0 };
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, { tool: "pg_doc_remove" });
        }
        return formatHandlerErrorResponse(err, { tool: "pg_doc_remove" });
      }
    },
  };
}
