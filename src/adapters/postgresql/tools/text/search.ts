/**
 * PostgreSQL Text Tools - Full-Text Search
 *
 * FTS, ranking, headlines, indexing, normalization, vectors, queries, and configs.
 * 8 tools total.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z, ZodError } from "zod";
import { readOnly, write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatPostgresError } from "../core/error-helpers.js";
import {
  sanitizeIdentifier,
  sanitizeIdentifiers,
  sanitizeTableName,
} from "../../../../utils/identifiers.js";
import { sanitizeFtsConfig } from "../../../../utils/fts-config.js";
import {
  TextSearchSchema,
  TextSearchSchemaBase,
  preprocessTextParams,
  // Output schemas
  TextRowsOutputSchema,
  FtsIndexOutputSchema,
  TextNormalizeOutputSchema,
  TextToVectorOutputSchema,
  TextToQueryOutputSchema,
  TextSearchConfigOutputSchema,
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
          return {
            success: false,
            error: "Either 'columns' (array) or 'column' (string) is required",
          };
        }

        // Build qualified table name with schema support
        // The preprocessor guarantees table is set (converts tableName → table)
        const resolvedTable = parsed.table ?? parsed.tableName;
        if (!resolvedTable) {
          return {
            success: false,
            error: "Either 'table' or 'tableName' is required",
          };
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
        // Coerce limit with NaN fallback (z.any() passes through strings)
        const rawLimit = Number(parsed.limit);
        const limitRaw =
          parsed.limit === undefined
            ? undefined
            : isNaN(rawLimit)
              ? undefined
              : rawLimit;
        const limitVal =
          limitRaw === 0
            ? null
            : limitRaw !== undefined && limitRaw > 0
              ? limitRaw
              : 100;
        const limitClause =
          limitVal !== null ? ` LIMIT ${String(limitVal)}` : "";

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
        if (error instanceof ZodError) {
          return {
            success: false,
            error: `pg_text_search validation error: ${error.issues.map((e) => e.message).join(", ")}`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_text_search",
          }),
        };
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
          return {
            success: false,
            error: "Either column or columns parameter is required",
          };
        }

        // The preprocessor guarantees table is set (converts tableName → table)
        const resolvedTable = parsed.table ?? parsed.tableName;
        if (!resolvedTable) {
          return {
            success: false,
            error: "Either 'table' or 'tableName' is required",
          };
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
        // Coerce limit with NaN fallback (z.any() passes through strings)
        const rawLimit = Number(parsed.limit);
        const limitRaw =
          parsed.limit === undefined
            ? undefined
            : isNaN(rawLimit)
              ? undefined
              : rawLimit;
        const limitVal =
          limitRaw === 0
            ? null
            : limitRaw !== undefined && limitRaw > 0
              ? limitRaw
              : 100;
        const limitClause =
          limitVal !== null ? ` LIMIT ${String(limitVal)}` : "";

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
        if (error instanceof ZodError) {
          return {
            success: false,
            error: `pg_text_rank validation error: ${error.issues.map((e) => e.message).join(", ")}`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_text_rank",
          }),
        };
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
          return {
            success: false,
            error: "Either 'table' or 'tableName' is required",
          };
        }
        const tableName = sanitizeTableName(resolvedTable, parsed.schema);
        if (!parsed.column || !parsed.query) {
          return {
            success: false,
            error: "column and query are required",
          };
        }
        const columnName = sanitizeIdentifier(parsed.column);
        // Use provided select columns, or default to * (user should specify PK for stable identification)
        const selectCols =
          parsed.select !== undefined && parsed.select.length > 0
            ? sanitizeIdentifiers(parsed.select).join(", ") + ", "
            : "";
        // Coerce limit with NaN fallback (z.any() passes through strings)
        const rawLimit = Number(parsed.limit);
        const limitRaw =
          parsed.limit === undefined
            ? undefined
            : isNaN(rawLimit)
              ? undefined
              : rawLimit;
        const limitVal =
          limitRaw === 0
            ? null
            : limitRaw !== undefined && limitRaw > 0
              ? limitRaw
              : 100;
        const limitClause =
          limitVal !== null ? ` LIMIT ${String(limitVal)}` : "";

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
        if (error instanceof ZodError) {
          return {
            success: false,
            error: `pg_text_headline validation error: ${error.issues.map((e) => e.message).join(", ")}`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_text_headline",
          }),
        };
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
          return {
            success: false,
            error: "Either 'table' or 'tableName' is required",
          };
        }
        if (!parsed.column) {
          return {
            success: false,
            error: "column is required",
          };
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
        if (error instanceof ZodError) {
          return {
            success: false,
            error: `pg_create_fts_index validation error: ${error.issues.map((e) => e.message).join(", ")}`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_create_fts_index",
          }),
        };
      }
    },
  };
}

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
        if (error instanceof ZodError) {
          return {
            success: false,
            error: `pg_text_normalize validation error: ${error.issues.map((e) => e.message).join(", ")}`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_text_normalize",
          }),
        };
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
        if (error instanceof ZodError) {
          return {
            success: false,
            error: `pg_text_to_vector validation error: ${error.issues.map((e) => e.message).join(", ")}`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_text_to_vector",
          }),
        };
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
        if (error instanceof ZodError) {
          return {
            success: false,
            error: `pg_text_to_query validation error: ${error.issues.map((e) => e.message).join(", ")}`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_text_to_query",
          }),
        };
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
    inputSchema: z.object({}).default({}),
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
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_text_search_config",
          }),
        };
      }
    },
  };
}
