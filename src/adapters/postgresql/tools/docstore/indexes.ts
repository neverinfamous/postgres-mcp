/**
 * PostgreSQL Document Store - Index Tools
 *
 * Tools for creating expression indexes on document fields.
 * 1 tool total.
 */

import { ZodError } from "zod";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import {
  IDENTIFIER_RE,
  checkCollectionExists,
  escapeTableRef,
} from "./helpers.js";
import {
  CreateDocIndexSchema,
  CreateDocIndexSchemaBase,
  CreateDocIndexOutputSchema,
} from "../../schemas/index.js";

/** Map docstore field types to PostgreSQL cast expressions */
const TYPE_CAST_MAP: Record<string, string> = {
  TEXT: "TEXT",
  INT: "INTEGER",
  DOUBLE: "DOUBLE PRECISION",
  DATE: "DATE",
  TIMESTAMP: "TIMESTAMP",
  BOOLEAN: "BOOLEAN",
};

// =============================================================================
// pg_doc_create_index
// =============================================================================

export function createDocIndexTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_doc_create_index",
    description:
      "Create an expression index on document fields for faster queries. Uses PostgreSQL expression indexes on JSONB paths.",
    group: "docstore",
    inputSchema: CreateDocIndexSchemaBase,
    outputSchema: CreateDocIndexOutputSchema,
    annotations: write("Create Doc Index"),
    icons: getToolIcons("docstore", write("Create Doc Index")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { collection, schema, name, fields, unique } =
          CreateDocIndexSchema.parse(params);
        if (fields.length === 0) {
          return formatHandlerErrorResponse(
            new Error("Validation error: fields array must not be empty"),
            { tool: "pg_doc_create_index" },
          );
        }
        if (!IDENTIFIER_RE.test(collection)) {
          return formatHandlerErrorResponse(
            new Error("Invalid collection name"),
            { tool: "pg_doc_create_index" },
          );
        }
        if (schema && !IDENTIFIER_RE.test(schema)) {
          return formatHandlerErrorResponse(new Error("Invalid schema name"), {
            tool: "pg_doc_create_index",
          });
        }
        if (!IDENTIFIER_RE.test(name)) {
          return formatHandlerErrorResponse(new Error("Invalid index name"), {
            tool: "pg_doc_create_index",
          });
        }

        const idxCheck = await checkCollectionExists(
          adapter,
          collection,
          schema,
        );
        if (!idxCheck.exists) {
          return idxCheck.reason === "schema"
            ? formatHandlerErrorResponse(
                new Error(`Schema '${idxCheck.name}' does not exist`),
                { tool: "pg_doc_create_index" },
              )
            : formatHandlerErrorResponse(
                new Error(`Collection '${collection}' does not exist`),
                { tool: "pg_doc_create_index" },
              );
        }

        // Validate all field paths
        for (const field of fields) {
          const pathParts = field.path.split(".");
          for (const part of pathParts) {
            if (!IDENTIFIER_RE.test(part)) {
              return formatHandlerErrorResponse(
                new Error(
                  `Invalid field path: "${field.path}". Path segments must be valid identifiers.`,
                ),
                { tool: "pg_doc_create_index" },
              );
            }
          }
        }

        // Build expression index columns
        // For TEXT: (doc->>'field')
        // For typed: ((doc->>'field')::INTEGER)
        const expressions = fields.map((field) => {
          // Build the JSONB extraction chain
          // For nested paths like "address.city": (doc->'address'->>'city')
          const pathParts = field.path.split(".");
          let expr: string;
          if (pathParts.length === 1) {
            const part = pathParts[0] ?? "";
            expr = `(doc->>'${part}')`;
          } else {
            // Navigate with -> for intermediate, ->> for last
            const intermediate = pathParts
              .slice(0, -1)
              .map((p) => `'${p}'`)
              .join("->");
            const last = pathParts[pathParts.length - 1] ?? "";
            expr = `(doc->${intermediate}->>'${last}')`;
          }

          // Apply type cast if not TEXT
          const castType = TYPE_CAST_MAP[field.type];
          if (field.type !== "TEXT" && castType) {
            expr = `(${expr}::${castType})`;
          }

          return expr;
        });

        const tableRef = escapeTableRef(collection, schema);
        const uniqueClause = unique ? "UNIQUE " : "";
        const cols = expressions.join(", ");

        await adapter.executeQuery(
          `CREATE ${uniqueClause}INDEX "${name}" ON ${tableRef} (${cols})`,
        );

        adapter.invalidateSchemaCache();
        return { success: true, index: name };
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, {
            tool: "pg_doc_create_index",
          });
        }
        return formatHandlerErrorResponse(err, {
          tool: "pg_doc_create_index",
        });
      }
    },
  };
}
