/**
 * PostgreSQL Text Tools - Core Full-Text Search
 *
 * Core FTS tools: search, rank, headline, and index creation.
 * 4 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly, write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { ValidationError } from "../../../../types/errors.js";
import {
  sanitizeIdentifier,
  sanitizeIdentifiers,
  sanitizeTableName,
} from "../../../../utils/identifiers.js";
import { sanitizeFtsConfig } from "../../../../utils/fts-config.js";
import {
  coerceLimit,
  buildLimitClause,
} from "../../../../utils/query-helpers.js";
import {
  TextSearchSchema,
  TextSearchSchemaBase,
  preprocessTextParams,
  // Output schemas
  TextRowsOutputSchema,
  FtsIndexOutputSchema,
} from "../../schemas/index.js";

// =============================================================================
// pg_text_search
// =============================================================================

export function createTextSearchTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_text_search",
    description: "Full-text search using tsvector and tsquery.",
    group: "text",
    inputSchema: TextSearchSchemaBase, // Base schema for MCP visibility
    outputSchema: TextRowsOutputSchema,
    annotations: readOnly("Full-Text Search"),
    icons: getToolIcons("text", readOnly("Full-Text Search")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = TextSearchSchema.parse(params);
        const cfg = sanitizeFtsConfig(parsed.config ?? "english");

        // Handle both column (string) and columns (array) parameters
        // The preprocessor converts column → columns, but we handle both for safety
        let cols: string[];
        if (parsed.columns !== undefined && parsed.columns.length > 0) {
          cols = parsed.columns;
        } else if (parsed.column !== undefined) {
          cols = [parsed.column];
        } else {
          throw new ValidationError("Either 'columns' (array) or 'column' (string) is required");
        }

        // Build qualified table name with schema support
        // The preprocessor guarantees table is set (converts tableName → table)
        const resolvedTable = parsed.table ?? parsed.tableName;
        if (!resolvedTable) {
          throw new ValidationError("Either 'table' or 'tableName' is required");
        }
        const tableName = sanitizeTableName(resolvedTable, parsed.schema);
        const sanitizedCols = sanitizeIdentifiers(cols);
        const selectCols =
          parsed.select !== undefined && parsed.select.length > 0
            ? sanitizeIdentifiers(parsed.select).join(", ")
            : "*";
        const tsvector = sanitizedCols
          .map((c) => `coalesce(${c}, '')`)
          .join(" || ' ' || ");
        const limitVal = coerceLimit(parsed.limit);
        const limitClause = buildLimitClause(limitVal);

        const sql = `SELECT ${selectCols}, ts_rank_cd(to_tsvector('${cfg}', ${tsvector}), plainto_tsquery('${cfg}', $1)) as rank
                        FROM ${tableName}
                        WHERE to_tsvector('${cfg}', ${tsvector}) @@ plainto_tsquery('${cfg}', $1)
                        ORDER BY rank DESC${limitClause}`;

        const result = await adapter.executeQuery(sql, [parsed.query]);
        const count = result.rows?.length ?? 0;
        const truncated = limitVal !== null && count === limitVal;
        return {
          rows: result.rows,
          count,
          ...(truncated
            ? {
                truncated: true,
                hint: `Results limited to ${String(limitVal)}. Use limit: 0 for all rows.`,
              }
            : {}),
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_text_search",
          });
      }
    },
  };
}

// =============================================================================
// pg_text_rank
// =============================================================================

export function createTextRankTool(adapter: PostgresAdapter): ToolDefinition {
  // Base schema for MCP visibility (no preprocess)
  const TextRankSchemaBase = z.object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Table name (alias for table)"),
    column: z.string().optional().describe("Single column to search"),
    columns: z
      .array(z.string())
      .optional()
      .describe("Multiple columns to search (alternative to column)"),
    query: z.string().optional(),
    config: z.string().optional(),
    normalization: z.any().optional(),
    select: z.array(z.string()).optional().describe("Columns to return"),
    limit: z.any().optional().describe("Max results"),
    schema: z.string().optional().describe("Schema name (default: public)"),
  });

  // Full schema with preprocess for handler parsing
  const TextRankSchema = z.preprocess(preprocessTextParams, TextRankSchemaBase);

  return {
    name: "pg_text_rank",
    description:
      "Get relevance ranking for full-text search results. Returns matching rows only with rank score.",
    group: "text",
    inputSchema: TextRankSchemaBase, // Base schema for MCP visibility
    outputSchema: TextRowsOutputSchema,
    annotations: readOnly("Text Rank"),
    icons: getToolIcons("text", readOnly("Text Rank")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = TextRankSchema.parse(params);
        const cfg = sanitizeFtsConfig(parsed.config ?? "english");
        const rawNorm = Number(parsed.normalization);
        const norm =
          parsed.normalization === undefined ? 0 : isNaN(rawNorm) ? 0 : rawNorm;

        // Handle both column (string) and columns (array) parameters
        let cols: string[];
        if (parsed.columns !== undefined && parsed.columns.length > 0) {
          cols = parsed.columns;
        } else if (parsed.column !== undefined) {
          cols = [parsed.column];
        } else {
          throw new ValidationError("Either column or columns parameter is required");
        }

        // The preprocessor guarantees table is set (converts tableName → table)
        const resolvedTable = parsed.table ?? parsed.tableName;
        if (!resolvedTable) {
          throw new ValidationError("Either 'table' or 'tableName' is required");
        }
        const tableName = sanitizeTableName(resolvedTable, parsed.schema);
        const sanitizedCols = sanitizeIdentifiers(cols);
        const selectCols =
          parsed.select !== undefined && parsed.select.length > 0
            ? sanitizeIdentifiers(parsed.select).join(", ")
            : "*";
        const tsvector = sanitizedCols
          .map((c) => `coalesce(${c}, '')`)
          .join(" || ' ' || ");
        const limitVal = coerceLimit(parsed.limit);
        const limitClause = buildLimitClause(limitVal);

        const sql = `SELECT ${selectCols}, ts_rank_cd(to_tsvector('${cfg}', ${tsvector}), plainto_tsquery('${cfg}', $1), ${String(norm)}) as rank
                        FROM ${tableName}
                        WHERE to_tsvector('${cfg}', ${tsvector}) @@ plainto_tsquery('${cfg}', $1)
                        ORDER BY rank DESC${limitClause}`;

        const result = await adapter.executeQuery(sql, [parsed.query]);
        const count = result.rows?.length ?? 0;
        const truncated = limitVal !== null && count === limitVal;
        return {
          rows: result.rows,
          count,
          ...(truncated
            ? {
                truncated: true,
                hint: `Results limited to ${String(limitVal)}. Use limit: 0 for all rows.`,
              }
            : {}),
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_text_rank",
          });
      }
    },
  };
}

// =============================================================================
// pg_text_headline
// =============================================================================

export function createTextHeadlineTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  // Base schema for MCP visibility (no preprocess)
  const HeadlineSchemaBase = z.object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Table name (alias for table)"),
    column: z.string().optional(),
    query: z.string().optional(),
    config: z.string().optional(),
    options: z
      .string()
      .optional()
      .describe(
        'Headline options (e.g., "MaxWords=20, MinWords=5"). Note: MinWords must be < MaxWords.',
      ),
    startSel: z
      .string()
      .optional()
      .describe("Start selection marker (default: <b>)"),
    stopSel: z
      .string()
      .optional()
      .describe("Stop selection marker (default: </b>)"),
    maxWords: z.any().optional().describe("Maximum words in headline"),
    minWords: z.any().optional().describe("Minimum words in headline"),
    select: z
      .array(z.string())
      .optional()
      .describe('Columns to return for row identification (e.g., ["id"])'),
    limit: z.any().optional().describe("Max results"),
    schema: z.string().optional().describe("Schema name (default: public)"),
  });

  // Full schema with preprocess for handler parsing
  const HeadlineSchema = z.preprocess(preprocessTextParams, HeadlineSchemaBase);

  return {
    name: "pg_text_headline",
    description:
      "Generate highlighted snippets from full-text search matches. Use select param for stable row identification (e.g., primary key).",
    group: "text",
    inputSchema: HeadlineSchemaBase, // Base schema for MCP visibility
    outputSchema: TextRowsOutputSchema,
    annotations: readOnly("Text Headline"),
    icons: getToolIcons("text", readOnly("Text Headline")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = HeadlineSchema.parse(params);
        const cfg = sanitizeFtsConfig(parsed.config ?? "english");

        // Build options string from individual params or use provided options
        let opts: string;
        if (parsed.options) {
          opts = parsed.options;
        } else {
          const optParts: string[] = [];
          optParts.push(`StartSel=${parsed.startSel ?? "<b>"}`);
          optParts.push(`StopSel=${parsed.stopSel ?? "</b>"}`);
          // Coerce maxWords/minWords with NaN fallback
          const rawMaxWords = Number(parsed.maxWords);
          const maxWords =
            parsed.maxWords === undefined
              ? 35
              : isNaN(rawMaxWords)
                ? 35
                : rawMaxWords;
          const rawMinWords = Number(parsed.minWords);
          const minWords =
            parsed.minWords === undefined
              ? 15
              : isNaN(rawMinWords)
                ? 15
                : rawMinWords;
          optParts.push(`MaxWords=${String(maxWords)}`);
          optParts.push(`MinWords=${String(minWords)}`);
          opts = optParts.join(", ");
        }

        // The preprocessor guarantees table is set (converts tableName → table)
        const resolvedTable = parsed.table ?? parsed.tableName;
        if (!resolvedTable) {
          throw new ValidationError("Either 'table' or 'tableName' is required");
        }
        const tableName = sanitizeTableName(resolvedTable, parsed.schema);
        if (!parsed.column || !parsed.query) {
          throw new ValidationError("column and query are required");
        }
        const columnName = sanitizeIdentifier(parsed.column);
        // Use provided select columns, or default to * (user should specify PK for stable identification)
        const selectCols =
          parsed.select !== undefined && parsed.select.length > 0
            ? sanitizeIdentifiers(parsed.select).join(", ") + ", "
            : "";
        const limitVal = coerceLimit(parsed.limit);
        const limitClause = buildLimitClause(limitVal);

        const sql = `SELECT ${selectCols}ts_headline('${cfg}', ${columnName}, plainto_tsquery('${cfg}', $1), '${opts}') as headline
                        FROM ${tableName}
                        WHERE to_tsvector('${cfg}', ${columnName}) @@ plainto_tsquery('${cfg}', $1)${limitClause}`;

        const result = await adapter.executeQuery(sql, [parsed.query]);
        const count = result.rows?.length ?? 0;
        const truncated = limitVal !== null && count === limitVal;
        return {
          rows: result.rows,
          count,
          ...(truncated
            ? {
                truncated: true,
                hint: `Results limited to ${String(limitVal)}. Use limit: 0 for all rows.`,
              }
            : {}),
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_text_headline",
          });
      }
    },
  };
}

// =============================================================================
// pg_create_fts_index
// =============================================================================

export function createFtsIndexTool(adapter: PostgresAdapter): ToolDefinition {
  // Base schema for MCP visibility (no preprocess)
  const FtsIndexSchemaBase = z.object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Table name (alias for table)"),
    column: z.string().optional(),
    name: z.string().optional(),
    config: z.string().optional(),
    ifNotExists: z
      .boolean()
      .optional()
      .describe("Skip if index already exists (default: true)"),
    schema: z.string().optional().describe("Schema name (default: public)"),
  });

  // Full schema with preprocess for handler parsing
  const FtsIndexSchema = z.preprocess(preprocessTextParams, FtsIndexSchemaBase);

  return {
    name: "pg_create_fts_index",
    description: "Create a GIN index for full-text search on a column.",
    group: "text",
    inputSchema: FtsIndexSchemaBase, // Base schema for MCP visibility
    outputSchema: FtsIndexOutputSchema,
    annotations: write("Create FTS Index"),
    icons: getToolIcons("text", write("Create FTS Index")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = FtsIndexSchema.parse(params);
        const cfg = sanitizeFtsConfig(parsed.config ?? "english");
        // The preprocessor guarantees table is set (converts tableName → table)
        const resolvedTable = parsed.table ?? parsed.tableName;
        if (!resolvedTable) {
          throw new ValidationError("Either 'table' or 'tableName' is required");
        }
        if (!parsed.column) {
          throw new ValidationError("column is required");
        }
        const defaultIndexName = `idx_${resolvedTable}_${parsed.column}_fts`;
        const resolvedIndexName = parsed.name ?? defaultIndexName;
        const indexName = sanitizeIdentifier(resolvedIndexName);
        // Default to IF NOT EXISTS for safer operation (skip existing indexes)
        const useIfNotExists = parsed.ifNotExists !== false;
        const ifNotExists = useIfNotExists ? "IF NOT EXISTS " : "";

        // Build qualified table name with schema support
        const tableName = sanitizeTableName(resolvedTable, parsed.schema);
        const columnName = sanitizeIdentifier(parsed.column);

        // Check if index exists before creation (to accurately report 'skipped')
        let existedBefore = false;
        if (useIfNotExists) {
          const checkResult = await adapter.executeQuery(
            `SELECT 1 FROM pg_indexes WHERE indexname = $1 LIMIT 1`,
            [resolvedIndexName],
          );
          existedBefore = (checkResult.rows?.length ?? 0) > 0;
        }

        const sql = `CREATE INDEX ${ifNotExists}${indexName} ON ${tableName} USING gin(to_tsvector('${cfg}', ${columnName}))`;
        await adapter.executeQuery(sql);

        return {
          success: true,
          index: resolvedIndexName,
          config: cfg,
          skipped: existedBefore,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_create_fts_index",
          });
      }
    },
  };
}
