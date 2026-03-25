/**
 * PostgreSQL Text Tools - Utility Operations
 *
 * Text normalization, vector/query conversion, and search config listing.
 * 4 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  // Output schemas
  TextNormalizeOutputSchema,
  TextToVectorOutputSchema,
  TextToQueryOutputSchema,
  TextSearchConfigOutputSchema,
} from "../../schemas/index.js";

// =============================================================================
// pg_text_normalize
// =============================================================================

export function createTextNormalizeTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  const NormalizeSchemaBase = z.object({
    text: z.string().optional().describe("Text to remove accent marks from"),
  });

  const NormalizeSchema = z.object({
    text: z.string().describe("Text to remove accent marks from"),
  });

  return {
    name: "pg_text_normalize",
    description:
      "Remove accent marks (diacritics) from text using PostgreSQL unaccent extension. Note: Does NOT lowercase or trim—use LOWER()/TRIM() in a query for those operations.",
    group: "text",
    inputSchema: NormalizeSchemaBase,
    outputSchema: TextNormalizeOutputSchema,
    annotations: readOnly("Text Normalize"),
    icons: getToolIcons("text", readOnly("Text Normalize")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = NormalizeSchema.parse(params ?? {});

        // Ensure unaccent extension is available
        await adapter.executeQuery("CREATE EXTENSION IF NOT EXISTS unaccent");

        const result = await adapter.executeQuery(
          `SELECT unaccent($1) as normalized`,
          [parsed.text],
        );
        return { normalized: result.rows?.[0]?.["normalized"] };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_text_normalize",
          });
      }
    },
  };
}

// =============================================================================
// pg_text_to_vector
// =============================================================================

export function createTextToVectorTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  const ToVectorSchemaBase = z.object({
    text: z.string().optional().describe("Text to convert to tsvector"),
    config: z
      .string()
      .optional()
      .describe("Text search configuration (default: english)"),
  });

  const ToVectorSchema = z.object({
    text: z.string().describe("Text to convert to tsvector"),
    config: z
      .string()
      .optional()
      .describe("Text search configuration (default: english)"),
  });

  return {
    name: "pg_text_to_vector",
    description:
      "Convert text to tsvector representation for full-text search operations.",
    group: "text",
    inputSchema: ToVectorSchemaBase,
    outputSchema: TextToVectorOutputSchema,
    annotations: readOnly("Text to Vector"),
    icons: getToolIcons("text", readOnly("Text to Vector")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = ToVectorSchema.parse(params ?? {});
        const cfg = parsed.config ?? "english";

        const result = await adapter.executeQuery(
          `SELECT to_tsvector($1, $2) as vector`,
          [cfg, parsed.text],
        );
        return { vector: result.rows?.[0]?.["vector"] };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_text_to_vector",
          });
      }
    },
  };
}

// =============================================================================
// pg_text_to_query
// =============================================================================

export function createTextToQueryTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  const ToQuerySchemaBase = z.object({
    text: z.string().optional().describe("Text to convert to tsquery"),
    config: z
      .string()
      .optional()
      .describe("Text search configuration (default: english)"),
    mode: z
      .string()
      .optional()
      .describe(
        "Query parsing mode: plain (default), phrase (proximity), websearch (Google-like)",
      ),
  });

  const ToQuerySchema = z.object({
    text: z.string().describe("Text to convert to tsquery"),
    config: z
      .string()
      .optional()
      .describe("Text search configuration (default: english)"),
    mode: z
      .enum(["plain", "phrase", "websearch"])
      .optional()
      .describe(
        "Query parsing mode: plain (default), phrase (proximity), websearch (Google-like)",
      ),
  });

  return {
    name: "pg_text_to_query",
    description:
      "Convert text to tsquery for full-text search. Modes: plain (default), phrase (proximity matching), websearch (Google-like syntax with AND/OR/-).",
    group: "text",
    inputSchema: ToQuerySchemaBase,
    outputSchema: TextToQueryOutputSchema,
    annotations: readOnly("Text to Query"),
    icons: getToolIcons("text", readOnly("Text to Query")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = ToQuerySchema.parse(params ?? {});
        const cfg = parsed.config ?? "english";
        const mode = parsed.mode ?? "plain";

        let fn: string;
        switch (mode) {
          case "phrase":
            fn = "phraseto_tsquery";
            break;
          case "websearch":
            fn = "websearch_to_tsquery";
            break;
          default:
            fn = "plainto_tsquery";
        }

        const result = await adapter.executeQuery(
          `SELECT ${fn}($1, $2) as query`,
          [cfg, parsed.text],
        );
        return { query: result.rows?.[0]?.["query"], mode };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_text_to_query",
          });
      }
    },
  };
}

// =============================================================================
// pg_text_search_config
// =============================================================================

export function createTextSearchConfigTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_text_search_config",
    description:
      "List available full-text search configurations (e.g., english, german, simple).",
    group: "text",
    inputSchema: z.object({}).strict().default({}),
    outputSchema: TextSearchConfigOutputSchema,
    annotations: readOnly("Search Configurations"),
    icons: getToolIcons("text", readOnly("Search Configurations")),
    handler: async (_params: unknown, _context: RequestContext) => {
      try {
        const result = await adapter.executeQuery(`
                SELECT
                    c.cfgname as name,
                    n.nspname as schema,
                    obj_description(c.oid, 'pg_ts_config') as description
                FROM pg_ts_config c
                JOIN pg_namespace n ON n.oid = c.cfgnamespace
                ORDER BY c.cfgname
            `);
        return {
          configs: result.rows ?? [],
          count: result.rows?.length ?? 0,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_text_search_config",
          });
      }
    },
  };
}
