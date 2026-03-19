/**
 * PostgreSQL JSONB Tools - Pretty Print
 *
 * Format JSONB data with indentation for readability.
 * Supports both raw JSON string input and table column extraction.
 * 1 tool total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import { resolveJsonbTable } from "./read.js";
import {
  JsonbPrettySchemaBase,
  JsonbPrettySchema,
  JsonbPrettyOutputSchema,
} from "../../schemas/jsonb/pretty.js";

export function createJsonbPrettyTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_jsonb_pretty",
    description:
      "Format JSON/JSONB with indentation for readability. Pass raw JSON string via 'json' param, or extract from a table column via 'table' + 'column'. Uses PostgreSQL's native jsonb_pretty() for table mode.",
    group: "jsonb",
    inputSchema: JsonbPrettySchemaBase,
    outputSchema: JsonbPrettyOutputSchema,
    annotations: readOnly("JSONB Pretty Print"),
    icons: getToolIcons("jsonb", readOnly("JSONB Pretty Print")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = JsonbPrettySchema.parse(params) as {
          json?: string;
          table?: string;
          tableName?: string;
          column?: string;
          col?: string;
          where?: string;
          filter?: string;
          limit?: number;
          schema?: string;
        };

        // Mode 1: Raw JSON string
        if (parsed.json) {
          try {
            const obj: unknown = JSON.parse(parsed.json);
            const pretty = JSON.stringify(obj, null, 2);
            return {
              success: true,
              formatted: pretty,
            };
          } catch {
            return {
              success: false,
              error: "Invalid JSON string",
            };
          }
        }

        // Mode 2: Table column extraction using PostgreSQL's jsonb_pretty()
        const table = parsed.table ?? parsed.tableName;
        const column = parsed.column ?? parsed.col;

        if (!table || !column) {
          return {
            success: false,
            error:
              "Either 'json' (raw string) or 'table' + 'column' (table mode) is required",
          };
        }

        const [qualifiedTable, tableError] = await resolveJsonbTable(
          adapter,
          table,
          parsed.schema,
        );
        if (tableError) return tableError;

        const where = parsed.where ?? parsed.filter;
        const whereClause = where
          ? ` WHERE ${sanitizeWhereClause(where)}`
          : "";
        const limit =
          parsed.limit === undefined || Number.isNaN(parsed.limit)
            ? 10
            : parsed.limit;

        const sql = `SELECT jsonb_pretty("${column}") AS formatted FROM ${qualifiedTable}${whereClause} LIMIT ${String(limit)}`;

        const result = await adapter.executeQuery(sql);
        const rows = (result.rows ?? []).map((row) => ({
          formatted:
            (row as { formatted: string }).formatted ?? "null",
        }));

        return {
          success: true,
          rows,
          count: rows.length,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_jsonb_pretty" });
      }
    },
  };
}
