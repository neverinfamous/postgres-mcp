/**
 * PostgreSQL Text & Full-Text Search Tools
 *
 * Text processing, FTS, trigrams, and fuzzy matching.
 * 14 tools total.
 */

import type { PostgresAdapter } from "../PostgresAdapter.js";
import type { ToolDefinition, RequestContext } from "../../../types/index.js";
import { z, ZodError } from "zod";
import { readOnly, write } from "../../../utils/annotations.js";
import { getToolIcons } from "../../../utils/icons.js";
import { formatPostgresError } from "./core/error-helpers.js";
import {
  sanitizeIdentifier,
  sanitizeIdentifiers,
  sanitizeTableName,
} from "../../../utils/identifiers.js";
import { sanitizeFtsConfig } from "../../../utils/fts-config.js";
import { sanitizeWhereClause } from "../../../utils/where-clause.js";
import {
  TextSearchSchema,
  TextSearchSchemaBase,
  TrigramSimilaritySchema,
  TrigramSimilaritySchemaBase,
  RegexpMatchSchema,
  RegexpMatchSchemaBase,
  preprocessTextParams,
  // Output schemas
  TextRowsOutputSchema,
  FtsIndexOutputSchema,
  TextNormalizeOutputSchema,
  TextSentimentOutputSchema,
  TextToVectorOutputSchema,
  TextToQueryOutputSchema,
  TextSearchConfigOutputSchema,
} from "../schemas/index.js";

// Note: preprocessTextParams is imported from schemas/index.js
// Schema.table parsing is handled within that preprocessor

// Fuzzy match method type (validated by zod enum in schema)
type FuzzyMethod = "levenshtein" | "soundex" | "metaphone";

/**
 * Get all text processing tools
 */
export function getTextTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    createTextSearchTool(adapter),
    createTextRankTool(adapter),
    createTrigramSimilarityTool(adapter),
    createFuzzyMatchTool(adapter),
    createRegexpMatchTool(adapter),
    createLikeSearchTool(adapter),
    createTextHeadlineTool(adapter),
    createFtsIndexTool(adapter),
    createTextNormalizeTool(adapter),
    createTextSentimentTool(adapter),
    createTextToVectorTool(adapter),
    createTextToQueryTool(adapter),
    createTextSearchConfigTool(adapter),
  ];
}

function createTextSearchTool(adapter: PostgresAdapter): ToolDefinition {
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
        // Default limit to 100 to prevent large payloads; limit: 0 means no limit
        const limitVal =
          parsed.limit === 0
            ? null
            : parsed.limit !== undefined && parsed.limit > 0
              ? parsed.limit
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

function createTextRankTool(adapter: PostgresAdapter): ToolDefinition {
  // Base schema for MCP visibility (no preprocess)
  const TextRankSchemaBase = z
    .object({
      table: z.string().optional().describe("Table name"),
      tableName: z.string().optional().describe("Table name (alias for table)"),
      column: z.string().optional().describe("Single column to search"),
      columns: z
        .array(z.string())
        .optional()
        .describe("Multiple columns to search (alternative to column)"),
      query: z.string(),
      config: z.string().optional(),
      normalization: z.number().optional(),
      select: z.array(z.string()).optional().describe("Columns to return"),
      limit: z.number().optional().describe("Max results"),
      schema: z.string().optional().describe("Schema name (default: public)"),
    })
    .refine(
      (data) => data.table !== undefined || data.tableName !== undefined,
      {
        message: "Either 'table' or 'tableName' is required",
      },
    );

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
        const norm = parsed.normalization ?? 0;

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
        // Default limit to 100 to prevent large payloads; limit: 0 means no limit
        const limitVal =
          parsed.limit === 0
            ? null
            : parsed.limit !== undefined && parsed.limit > 0
              ? parsed.limit
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

function createTrigramSimilarityTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_trigram_similarity",
    description:
      "Find similar strings using pg_trgm trigram matching. Returns similarity score (0-1). Default threshold 0.3; use lower (e.g., 0.1) for partial matches.",
    group: "text",
    inputSchema: TrigramSimilaritySchemaBase, // Base schema for MCP visibility
    outputSchema: TextRowsOutputSchema,
    annotations: readOnly("Trigram Similarity"),
    icons: getToolIcons("text", readOnly("Trigram Similarity")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = TrigramSimilaritySchema.parse(params);
        const thresh = parsed.threshold ?? 0.3;
        // Default limit to 100 to prevent large payloads; limit: 0 means no limit
        const limitVal =
          parsed.limit === 0
            ? null
            : parsed.limit !== undefined && parsed.limit > 0
              ? parsed.limit
              : 100;
        const limitClause =
          limitVal !== null ? ` LIMIT ${String(limitVal)}` : "";

        // The preprocessor guarantees table is set (converts tableName → table)
        const resolvedTable = parsed.table ?? parsed.tableName;
        if (!resolvedTable) {
          return {
            success: false,
            error: "Either 'table' or 'tableName' is required",
          };
        }
        const tableName = sanitizeTableName(resolvedTable, parsed.schema);
        const columnName = sanitizeIdentifier(parsed.column);
        const selectCols =
          parsed.select !== undefined && parsed.select.length > 0
            ? sanitizeIdentifiers(parsed.select).join(", ")
            : "*";
        const additionalWhere = parsed.where
          ? ` AND (${sanitizeWhereClause(parsed.where)})`
          : "";

        const sql = `SELECT ${selectCols}, similarity(${columnName}, $1) as similarity
                        FROM ${tableName}
                        WHERE similarity(${columnName}, $1) > ${String(thresh)}${additionalWhere}
                        ORDER BY similarity DESC${limitClause}`;

        const result = await adapter.executeQuery(sql, [parsed.value]);
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
            error: `pg_trigram_similarity validation error: ${error.issues.map((e) => e.message).join(", ")}`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_trigram_similarity",
          }),
        };
      }
    },
  };
}

function createFuzzyMatchTool(adapter: PostgresAdapter): ToolDefinition {
  // Base schema for MCP visibility (no preprocess)
  const FuzzyMatchSchemaBase = z
    .object({
      table: z.string().optional().describe("Table name"),
      tableName: z.string().optional().describe("Table name (alias for table)"),
      column: z.string(),
      value: z.string(),
      method: z
        .string()
        .optional()
        .describe(
          "Fuzzy match method (default: levenshtein). Valid: soundex, levenshtein, metaphone",
        ),
      maxDistance: z
        .number()
        .optional()
        .describe(
          "Max Levenshtein distance (default: 3, use 5+ for longer strings)",
        ),
      select: z.array(z.string()).optional().describe("Columns to return"),
      limit: z
        .number()
        .optional()
        .describe("Max results (default: 100 to prevent large payloads)"),
      where: z.string().optional().describe("Additional WHERE clause filter"),
      schema: z.string().optional().describe("Schema name (default: public)"),
    })
    .refine(
      (data) => data.table !== undefined || data.tableName !== undefined,
      {
        message: "Either 'table' or 'tableName' is required",
      },
    );

  // Full schema with preprocess for handler parsing
  const FuzzyMatchSchema = z.preprocess(
    preprocessTextParams,
    FuzzyMatchSchemaBase,
  );

  return {
    name: "pg_fuzzy_match",
    description:
      "Fuzzy string matching using fuzzystrmatch extension. Levenshtein (default): returns distance; use maxDistance=5+ for longer strings. Soundex/metaphone: returns phonetic code for exact matches only.",
    group: "text",
    inputSchema: FuzzyMatchSchemaBase, // Base schema for MCP visibility
    outputSchema: TextRowsOutputSchema,
    annotations: readOnly("Fuzzy Match"),
    icons: getToolIcons("text", readOnly("Fuzzy Match")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = FuzzyMatchSchema.parse(params);

        // Validate method (moved from z.enum to handler for structured error)
        const VALID_METHODS: FuzzyMethod[] = [
          "levenshtein",
          "soundex",
          "metaphone",
        ];
        const rawMethod = parsed.method ?? "levenshtein";
        if (!VALID_METHODS.includes(rawMethod as FuzzyMethod)) {
          return {
            success: false,
            error: `Invalid method "${rawMethod}". Valid methods: ${VALID_METHODS.join(", ")}`,
          };
        }
        const method: FuzzyMethod = rawMethod as FuzzyMethod;

        const maxDist = parsed.maxDistance ?? 3;
        // Default limit to 100 to prevent large payloads; limit: 0 means no limit
        const limitVal =
          parsed.limit === 0
            ? null
            : parsed.limit !== undefined && parsed.limit > 0
              ? parsed.limit
              : 100;
        const limitClause =
          limitVal !== null ? ` LIMIT ${String(limitVal)}` : "";

        // The preprocessor guarantees table is set (converts tableName → table)
        const resolvedTable = parsed.table ?? parsed.tableName;
        if (!resolvedTable) {
          return {
            success: false,
            error: "Either 'table' or 'tableName' is required",
          };
        }
        const tableName = sanitizeTableName(resolvedTable, parsed.schema);
        const columnName = sanitizeIdentifier(parsed.column);
        const selectCols =
          parsed.select !== undefined && parsed.select.length > 0
            ? sanitizeIdentifiers(parsed.select).join(", ")
            : "*";
        const additionalWhere = parsed.where
          ? ` AND (${sanitizeWhereClause(parsed.where)})`
          : "";

        let sql: string;
        if (method === "soundex") {
          sql = `SELECT ${selectCols}, soundex(${columnName}) as code FROM ${tableName} WHERE soundex(${columnName}) = soundex($1)${additionalWhere}${limitClause}`;
        } else if (method === "metaphone") {
          sql = `SELECT ${selectCols}, metaphone(${columnName}, 10) as code FROM ${tableName} WHERE metaphone(${columnName}, 10) = metaphone($1, 10)${additionalWhere}${limitClause}`;
        } else {
          sql = `SELECT ${selectCols}, levenshtein(${columnName}, $1) as distance FROM ${tableName} WHERE levenshtein(${columnName}, $1) <= ${String(maxDist)}${additionalWhere} ORDER BY distance${limitClause}`;
        }

        const result = await adapter.executeQuery(sql, [parsed.value]);
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
            error: `pg_fuzzy_match validation error: ${error.issues.map((e) => e.message).join(", ")}`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_fuzzy_match",
          }),
        };
      }
    },
  };
}

function createRegexpMatchTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_regexp_match",
    description: "Match text using POSIX regular expressions.",
    group: "text",
    inputSchema: RegexpMatchSchemaBase, // Base schema for MCP visibility
    outputSchema: TextRowsOutputSchema,
    annotations: readOnly("Regexp Match"),
    icons: getToolIcons("text", readOnly("Regexp Match")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = RegexpMatchSchema.parse(params);

        // The preprocessor guarantees table is set (converts tableName → table)
        const resolvedTable = parsed.table ?? parsed.tableName;
        if (!resolvedTable) {
          return {
            success: false,
            error: "Either 'table' or 'tableName' is required",
          };
        }
        const tableName = sanitizeTableName(resolvedTable, parsed.schema);
        const columnName = sanitizeIdentifier(parsed.column);
        const selectCols =
          parsed.select !== undefined && parsed.select.length > 0
            ? sanitizeIdentifiers(parsed.select).join(", ")
            : "*";
        const op = parsed.flags?.includes("i") ? "~*" : "~";
        const additionalWhere = parsed.where
          ? ` AND (${sanitizeWhereClause(parsed.where)})`
          : "";
        // Default limit to 100 to prevent large payloads; limit: 0 means no limit
        const limitVal =
          parsed.limit === 0
            ? null
            : parsed.limit !== undefined && parsed.limit > 0
              ? parsed.limit
              : 100;
        const limitClause =
          limitVal !== null ? ` LIMIT ${String(limitVal)}` : "";

        const sql = `SELECT ${selectCols} FROM ${tableName} WHERE ${columnName} ${op} $1${additionalWhere}${limitClause}`;
        const result = await adapter.executeQuery(sql, [parsed.pattern]);
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
            error: `pg_regexp_match validation error: ${error.issues.map((e) => e.message).join(", ")}`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_regexp_match",
          }),
        };
      }
    },
  };
}

function createLikeSearchTool(adapter: PostgresAdapter): ToolDefinition {
  // Base schema for MCP visibility (no preprocess)
  const LikeSearchSchemaBase = z
    .object({
      table: z.string().optional().describe("Table name"),
      tableName: z.string().optional().describe("Table name (alias for table)"),
      column: z.string(),
      pattern: z.string(),
      caseSensitive: z
        .boolean()
        .optional()
        .describe("Use case-sensitive LIKE (default: false, uses ILIKE)"),
      select: z.array(z.string()).optional(),
      limit: z
        .number()
        .optional()
        .describe("Max results (default: 100 to prevent large payloads)"),
      where: z.string().optional().describe("Additional WHERE clause filter"),
      schema: z.string().optional().describe("Schema name (default: public)"),
    })
    .refine(
      (data) => data.table !== undefined || data.tableName !== undefined,
      {
        message: "Either 'table' or 'tableName' is required",
      },
    );

  // Full schema with preprocess for handler parsing
  const LikeSearchSchema = z.preprocess(
    preprocessTextParams,
    LikeSearchSchemaBase,
  );

  return {
    name: "pg_like_search",
    description:
      "Search text using LIKE patterns. Case-insensitive (ILIKE) by default.",
    group: "text",
    inputSchema: LikeSearchSchemaBase, // Base schema for MCP visibility
    outputSchema: TextRowsOutputSchema,
    annotations: readOnly("LIKE Search"),
    icons: getToolIcons("text", readOnly("LIKE Search")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = LikeSearchSchema.parse(params);

        // The preprocessor guarantees table is set (converts tableName → table)
        const resolvedTable = parsed.table ?? parsed.tableName;
        if (!resolvedTable) {
          return {
            success: false,
            error: "Either 'table' or 'tableName' is required",
          };
        }
        const tableName = sanitizeTableName(resolvedTable, parsed.schema);
        const columnName = sanitizeIdentifier(parsed.column);
        const selectCols =
          parsed.select !== undefined && parsed.select.length > 0
            ? sanitizeIdentifiers(parsed.select).join(", ")
            : "*";
        const op = parsed.caseSensitive === true ? "LIKE" : "ILIKE";
        const additionalWhere = parsed.where
          ? ` AND (${sanitizeWhereClause(parsed.where)})`
          : "";
        // Default limit to 100 to prevent large payloads; limit: 0 means no limit
        const limitVal =
          parsed.limit === 0
            ? null
            : parsed.limit !== undefined && parsed.limit > 0
              ? parsed.limit
              : 100;
        const limitClause =
          limitVal !== null ? ` LIMIT ${String(limitVal)}` : "";

        const sql = `SELECT ${selectCols} FROM ${tableName} WHERE ${columnName} ${op} $1${additionalWhere}${limitClause}`;
        const result = await adapter.executeQuery(sql, [parsed.pattern]);
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
            error: `pg_like_search validation error: ${error.issues.map((e) => e.message).join(", ")}`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_like_search",
          }),
        };
      }
    },
  };
}

function createTextHeadlineTool(adapter: PostgresAdapter): ToolDefinition {
  // Base schema for MCP visibility (no preprocess)
  const HeadlineSchemaBase = z
    .object({
      table: z.string().optional().describe("Table name"),
      tableName: z.string().optional().describe("Table name (alias for table)"),
      column: z.string(),
      query: z.string(),
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
      maxWords: z.number().optional().describe("Maximum words in headline"),
      minWords: z.number().optional().describe("Minimum words in headline"),
      select: z
        .array(z.string())
        .optional()
        .describe('Columns to return for row identification (e.g., ["id"])'),
      limit: z.number().optional().describe("Max results"),
      schema: z.string().optional().describe("Schema name (default: public)"),
    })
    .refine(
      (data) => data.table !== undefined || data.tableName !== undefined,
      {
        message: "Either 'table' or 'tableName' is required",
      },
    );

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
          optParts.push(`MaxWords=${String(parsed.maxWords ?? 35)}`);
          optParts.push(`MinWords=${String(parsed.minWords ?? 15)}`);
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
        const columnName = sanitizeIdentifier(parsed.column);
        // Use provided select columns, or default to * (user should specify PK for stable identification)
        const selectCols =
          parsed.select !== undefined && parsed.select.length > 0
            ? sanitizeIdentifiers(parsed.select).join(", ") + ", "
            : "";
        // Default limit to 100 to prevent large payloads; limit: 0 means no limit
        const limitVal =
          parsed.limit === 0
            ? null
            : parsed.limit !== undefined && parsed.limit > 0
              ? parsed.limit
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

function createFtsIndexTool(adapter: PostgresAdapter): ToolDefinition {
  // Base schema for MCP visibility (no preprocess)
  const FtsIndexSchemaBase = z
    .object({
      table: z.string().optional().describe("Table name"),
      tableName: z.string().optional().describe("Table name (alias for table)"),
      column: z.string(),
      name: z.string().optional(),
      config: z.string().optional(),
      ifNotExists: z
        .boolean()
        .optional()
        .describe("Skip if index already exists (default: true)"),
      schema: z.string().optional().describe("Schema name (default: public)"),
    })
    .refine(
      (data) => data.table !== undefined || data.tableName !== undefined,
      {
        message: "Either 'table' or 'tableName' is required",
      },
    );

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

function createTextNormalizeTool(adapter: PostgresAdapter): ToolDefinition {
  const NormalizeSchema = z.object({
    text: z.string().describe("Text to remove accent marks from"),
  });

  return {
    name: "pg_text_normalize",
    description:
      "Remove accent marks (diacritics) from text using PostgreSQL unaccent extension. Note: Does NOT lowercase or trim—use LOWER()/TRIM() in a query for those operations.",
    group: "text",
    inputSchema: NormalizeSchema,
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

/**
 * Basic sentiment analysis using word matching
 */
function createTextSentimentTool(_adapter: PostgresAdapter): ToolDefinition {
  const SentimentSchema = z.object({
    text: z.string().describe("Text to analyze"),
    returnWords: z
      .boolean()
      .optional()
      .describe("Return matched sentiment words"),
  });

  return {
    name: "pg_text_sentiment",
    description:
      "Perform basic sentiment analysis on text using keyword matching.",
    group: "text",
    inputSchema: SentimentSchema,
    outputSchema: TextSentimentOutputSchema,
    annotations: readOnly("Text Sentiment"),
    icons: getToolIcons("text", readOnly("Text Sentiment")),
    handler: (params: unknown, _context: RequestContext) => {
      try {
        const parsed = SentimentSchema.parse(params ?? {});
        const text = parsed.text.toLowerCase();

        const positiveWords = [
          "good",
          "great",
          "excellent",
          "amazing",
          "wonderful",
          "fantastic",
          "love",
          "happy",
          "positive",
          "best",
          "beautiful",
          "awesome",
          "perfect",
          "nice",
          "helpful",
          "thank",
          "thanks",
          "pleased",
          "satisfied",
          "recommend",
          "enjoy",
          "impressive",
          "brilliant",
        ];

        const negativeWords = [
          "bad",
          "terrible",
          "awful",
          "horrible",
          "worst",
          "hate",
          "angry",
          "disappointed",
          "poor",
          "wrong",
          "problem",
          "issue",
          "fail",
          "failed",
          "broken",
          "useless",
          "waste",
          "frustrating",
          "annoyed",
          "unhappy",
          "negative",
          "complaint",
          "slow",
        ];

        const words = text.split(/\s+/);
        const matchedPositive = words
          .map((w) => w.replace(/[^a-z]/g, ""))
          .filter((w) => positiveWords.includes(w));
        const matchedNegative = words
          .map((w) => w.replace(/[^a-z]/g, ""))
          .filter((w) => negativeWords.includes(w));

        const positiveScore = matchedPositive.length;
        const negativeScore = matchedNegative.length;
        const totalScore = positiveScore - negativeScore;

        let sentiment: string;
        if (totalScore > 2) sentiment = "very_positive";
        else if (totalScore > 0) sentiment = "positive";
        else if (totalScore < -2) sentiment = "very_negative";
        else if (totalScore < 0) sentiment = "negative";
        else sentiment = "neutral";

        const result: {
          sentiment: string;
          score: number;
          positiveCount: number;
          negativeCount: number;
          confidence: string;
          matchedPositive?: string[];
          matchedNegative?: string[];
        } = {
          sentiment,
          score: totalScore,
          positiveCount: positiveScore,
          negativeCount: negativeScore,
          confidence:
            positiveScore + negativeScore > 3
              ? "high"
              : positiveScore + negativeScore > 1
                ? "medium"
                : "low",
        };

        if (parsed.returnWords) {
          result.matchedPositive = matchedPositive;
          result.matchedNegative = matchedNegative;
        }

        return Promise.resolve(result);
      } catch (error: unknown) {
        if (error instanceof ZodError) {
          return Promise.resolve({
            success: false as const,
            error: `pg_text_sentiment validation error: ${error.issues.map((e) => e.message).join(", ")}`,
          });
        }
        return Promise.resolve({
          success: false as const,
          error:
            error instanceof Error ? error.message : "Unknown error occurred",
        });
      }
    },
  };
}

/**
 * Convert text to tsvector for full-text search
 */
function createTextToVectorTool(adapter: PostgresAdapter): ToolDefinition {
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
    inputSchema: ToVectorSchema,
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

/**
 * Convert text to tsquery for full-text search
 */
function createTextToQueryTool(adapter: PostgresAdapter): ToolDefinition {
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
    inputSchema: ToQuerySchema,
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

/**
 * List available full-text search configurations
 */
function createTextSearchConfigTool(adapter: PostgresAdapter): ToolDefinition {
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
