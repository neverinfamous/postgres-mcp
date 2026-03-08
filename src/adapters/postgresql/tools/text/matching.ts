/**
 * PostgreSQL Text Tools - Pattern Matching & Similarity
 *
 * Trigram similarity, fuzzy matching, regex, LIKE search, and sentiment analysis.
 * 5 tools total.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z, ZodError } from "zod";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatPostgresError } from "../core/error-helpers.js";
import {
  sanitizeIdentifier,
  sanitizeIdentifiers,
  sanitizeTableName,
} from "../../../../utils/identifiers.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import {
  TrigramSimilaritySchema,
  TrigramSimilaritySchemaBase,
  RegexpMatchSchema,
  RegexpMatchSchemaBase,
  preprocessTextParams,
  // Output schemas
  TextRowsOutputSchema,
  TextSentimentOutputSchema,
} from "../../schemas/index.js";

// Fuzzy match method type (validated by zod enum in schema)
type FuzzyMethod = "levenshtein" | "soundex" | "metaphone";

// =============================================================================
// pg_trigram_similarity
// =============================================================================

export function createTrigramSimilarityTool(
  adapter: PostgresAdapter,
): ToolDefinition {
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
        // Coerce numeric params: wrong-type values silently default
        const rawThresh = Number(parsed.threshold);
        const thresh =
          parsed.threshold === undefined
            ? 0.3
            : isNaN(rawThresh)
              ? 0.3
              : rawThresh;
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

        // The preprocessor guarantees table is set (converts tableName → table)
        const resolvedTable = parsed.table ?? parsed.tableName;
        if (!resolvedTable) {
          return {
            success: false,
            error: "Either 'table' or 'tableName' is required",
          };
        }
        const tableName = sanitizeTableName(resolvedTable, parsed.schema);
        if (!parsed.column || !parsed.value) {
          return {
            success: false,
            error: "column and value are required",
          };
        }
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

// =============================================================================
// pg_fuzzy_match
// =============================================================================

export function createFuzzyMatchTool(adapter: PostgresAdapter): ToolDefinition {
  // Base schema for MCP visibility (no preprocess)
  const FuzzyMatchSchemaBase = z.object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Table name (alias for table)"),
    column: z.string().optional(),
    value: z.string().optional(),
    method: z
      .string()
      .optional()
      .describe(
        "Fuzzy match method (default: levenshtein). Valid: soundex, levenshtein, metaphone",
      ),
    maxDistance: z
      .any()
      .optional()
      .describe(
        "Max Levenshtein distance (default: 3, use 5+ for longer strings)",
      ),
    select: z.array(z.string()).optional().describe("Columns to return"),
    limit: z
      .any()
      .optional()
      .describe("Max results (default: 100 to prevent large payloads)"),
    where: z.string().optional().describe("Additional WHERE clause filter"),
    schema: z.string().optional().describe("Schema name (default: public)"),
  });

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

        const rawMaxDist = Number(parsed.maxDistance);
        const maxDist =
          parsed.maxDistance === undefined
            ? 3
            : isNaN(rawMaxDist)
              ? 3
              : rawMaxDist;
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

        // The preprocessor guarantees table is set (converts tableName → table)
        const resolvedTable = parsed.table ?? parsed.tableName;
        if (!resolvedTable) {
          return {
            success: false,
            error: "Either 'table' or 'tableName' is required",
          };
        }
        const tableName = sanitizeTableName(resolvedTable, parsed.schema);
        if (!parsed.column || !parsed.value) {
          return {
            success: false,
            error: "column and value are required",
          };
        }
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

// =============================================================================
// pg_regexp_match
// =============================================================================

export function createRegexpMatchTool(
  adapter: PostgresAdapter,
): ToolDefinition {
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
        if (!parsed.column || !parsed.pattern) {
          return {
            success: false,
            error: "column and pattern are required",
          };
        }
        const columnName = sanitizeIdentifier(parsed.column);
        const selectCols =
          parsed.select !== undefined && parsed.select.length > 0
            ? sanitizeIdentifiers(parsed.select).join(", ")
            : "*";
        const op = parsed.flags?.includes("i") ? "~*" : "~";
        const additionalWhere = parsed.where
          ? ` AND (${sanitizeWhereClause(parsed.where)})`
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

// =============================================================================
// pg_like_search
// =============================================================================

export function createLikeSearchTool(adapter: PostgresAdapter): ToolDefinition {
  // Base schema for MCP visibility (no preprocess)
  const LikeSearchSchemaBase = z.object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Table name (alias for table)"),
    column: z.string().optional(),
    pattern: z.string().optional(),
    caseSensitive: z
      .boolean()
      .optional()
      .describe("Use case-sensitive LIKE (default: false, uses ILIKE)"),
    select: z.array(z.string()).optional(),
    limit: z
      .any()
      .optional()
      .describe("Max results (default: 100 to prevent large payloads)"),
    where: z.string().optional().describe("Additional WHERE clause filter"),
    schema: z.string().optional().describe("Schema name (default: public)"),
  });

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
        if (!parsed.column || !parsed.pattern) {
          return {
            success: false,
            error: "column and pattern are required",
          };
        }
        const columnName = sanitizeIdentifier(parsed.column);
        const selectCols =
          parsed.select !== undefined && parsed.select.length > 0
            ? sanitizeIdentifiers(parsed.select).join(", ")
            : "*";
        const op = parsed.caseSensitive === true ? "LIKE" : "ILIKE";
        const additionalWhere = parsed.where
          ? ` AND (${sanitizeWhereClause(parsed.where)})`
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

// =============================================================================
// pg_text_sentiment
// =============================================================================

/**
 * Basic sentiment analysis using word matching
 */
export function createTextSentimentTool(
  _adapter: PostgresAdapter,
): ToolDefinition {
  const SentimentSchemaBase = z.object({
    text: z.string().optional().describe("Text to analyze"),
    returnWords: z
      .boolean()
      .optional()
      .describe("Return matched sentiment words"),
  });

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
    inputSchema: SentimentSchemaBase,
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
