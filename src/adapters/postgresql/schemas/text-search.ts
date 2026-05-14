/**
 * postgres-mcp - Text Search Tool Schemas
 *
 * Input validation schemas for full-text search and pattern matching.
 *
 * NOTE: Some tools use the "Split Schema" pattern where a Base schema (without
 * z.preprocess) is used for MCP inputSchema visibility, while the full schema
 * (with preprocess) is used in the handler. This is because z.preprocess() can
 * interfere with JSON Schema generation for direct MCP tool calls.
 */

import { z } from "zod";
import { ErrorResponseFields } from "./error-response-fields.js";

/**
 * Preprocess text tool parameters to normalize common input patterns.
 * Exported so tools can apply it in their handlers.
 */
export function preprocessTextParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  const result = { ...(input as Record<string, unknown>) };

  // Alias: tableName → table
  if (result["tableName"] !== undefined && result["table"] === undefined) {
    result["table"] = result["tableName"];
  }
  // Alias: col → column
  if (result["col"] !== undefined && result["column"] === undefined) {
    result["column"] = result["col"];
  }
  // Alias: filter → where
  if (result["filter"] !== undefined && result["where"] === undefined) {
    result["where"] = result["filter"];
  }
  // Alias: text → value (for trigram/fuzzy tools)
  if (result["text"] !== undefined && result["value"] === undefined) {
    result["value"] = result["text"];
  }
  // Alias: query → value (cross-tool normalization)
  if (result["query"] !== undefined && result["value"] === undefined) {
    result["value"] = result["query"];
  }
  // Alias: value → query (cross-tool normalization)
  if (result["value"] !== undefined && result["query"] === undefined) {
    result["query"] = result["value"];
  }
  // Alias: value → pattern (for like search)
  if (result["value"] !== undefined && result["pattern"] === undefined) {
    result["pattern"] = result["value"];
  }
  // Alias: indexName → name (for FTS index tool)
  if (result["indexName"] !== undefined && result["name"] === undefined) {
    result["name"] = result["indexName"];
  }
  // Alias: column (singular) → columns (array) for text search
  if (
    result["column"] !== undefined &&
    result["columns"] === undefined &&
    typeof result["column"] === "string"
  ) {
    result["columns"] = [result["column"]];
  }

  // Parse schema.table format (embedded schema takes priority)
  if (typeof result["table"] === "string" && result["table"].includes(".")) {
    const parts = result["table"].split(".");
    if (parts.length === 2 && parts[0] && parts[1]) {
      // Only override schema if not already explicitly set
      if (result["schema"] === undefined) {
        result["schema"] = parts[0];
      }
      result["table"] = parts[1];
    }
  }

  return result;
}

// =============================================================================
// Base Schemas (for MCP inputSchema visibility - no preprocess)
// =============================================================================

export const TextSearchSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Table name (alias for table)"),
  columns: z
    .array(z.string())
    .optional()
    .describe("Text columns to search (array)"),
  column: z
    .string()
    .optional()
    .describe("Text column to search (singular, alias for columns)"),
  query: z.string().optional().describe("Search query"),
  config: z
    .string()
    .optional()
    .describe("Text search config (default: english)"),
  select: z.array(z.string()).optional().describe("Columns to return"),
  limit: z.any().optional().describe("Max results"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

export const TrigramSimilaritySchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Table name (alias for table)"),
  column: z.string().optional().describe("Column to compare"),
  value: z.string().optional().describe("Value to compare against"),
  threshold: z
    .any()
    .optional()
    .describe(
      "Similarity threshold (0-1, default 0.3; use 0.1-0.2 for partial matches)",
    ),
  select: z.array(z.string()).optional().describe("Columns to return"),
  limit: z
    .any()
    .optional()
    .describe("Max results (default: 100 to prevent large payloads)"),
  where: z.string().optional().describe("Additional WHERE clause filter"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

export const RegexpMatchSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Table name (alias for table)"),
  column: z.string().optional().describe("Column to match"),
  pattern: z.string().optional().describe("POSIX regex pattern"),
  flags: z.string().optional().describe("Regex flags (i, g, etc.)"),
  select: z.array(z.string()).optional().describe("Columns to return"),
  limit: z
    .any()
    .optional()
    .describe("Max results (default: 100 to prevent large payloads)"),
  where: z.string().optional().describe("Additional WHERE clause filter"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

export const TextRankSchemaBase = z.object({
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

export const HeadlineSchemaBase = z.object({
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

export const FtsIndexSchemaBase = z.object({
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

export const FuzzyMatchSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Table name (alias for table)"),
  column: z.string().optional(),
  value: z.string().optional(),
  method: z
    .string()
    .optional()
    .describe(
      "Fuzzy match method (default: levenshtein). Valid: soundex, levenshtein, damerau-levenshtein, metaphone",
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

export const LikeSearchSchemaBase = z.object({
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

export const SentimentSchemaBase = z.object({
  text: z.string().optional().describe("Text to analyze"),
  returnWords: z
    .boolean()
    .optional()
    .describe("Return matched sentiment words"),
});

export const NormalizeSchemaBase = z.object({
  text: z.string().optional().describe("Text to remove accent marks from"),
});

export const ToVectorSchemaBase = z.object({
  text: z.string().optional().describe("Text to convert to tsvector"),
  config: z
    .string()
    .optional()
    .describe("Text search configuration (default: english)"),
});

export const ToQuerySchemaBase = z.object({
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

export const TextSearchConfigSchemaBase = z.object({}).default({});

// =============================================================================
// Full Schemas (with preprocess - for handler parsing)
// =============================================================================

export const TextSearchSchema = z.preprocess(
  preprocessTextParams,
  TextSearchSchemaBase.extend({
    limit: z.number().optional(),
  }),
);

export const TrigramSimilaritySchema = z.preprocess(
  preprocessTextParams,
  TrigramSimilaritySchemaBase.extend({
    limit: z.number().optional(),
    threshold: z.number().optional(),
  }),
);

export const RegexpMatchSchema = z.preprocess(
  preprocessTextParams,
  RegexpMatchSchemaBase.extend({
    limit: z.number().optional(),
  }),
);

export const TextRankSchema = z.preprocess(
  preprocessTextParams,
  TextRankSchemaBase.extend({
    limit: z.number().optional(),
  }),
);

export const HeadlineSchema = z.preprocess(
  preprocessTextParams,
  HeadlineSchemaBase.extend({
    limit: z.number().optional(),
  }),
);

export const FtsIndexSchema = z.preprocess(
  preprocessTextParams,
  FtsIndexSchemaBase,
);

export const FuzzyMatchSchema = z.preprocess(
  preprocessTextParams,
  FuzzyMatchSchemaBase.extend({
    limit: z.number().optional(),
    maxDistance: z.number().optional(),
  }),
);

export const LikeSearchSchema = z.preprocess(
  preprocessTextParams,
  LikeSearchSchemaBase.extend({
    limit: z.number().optional(),
  }),
);

export const SentimentSchema = z.object({
  text: z.string().describe("Text to analyze"),
  returnWords: z
    .boolean()
    .optional()
    .describe("Return matched sentiment words"),
});

export const NormalizeSchema = z.object({
  text: z.string().describe("Text to remove accent marks from"),
});

export const ToVectorSchema = z.object({
  text: z.string().describe("Text to convert to tsvector"),
  config: z
    .string()
    .optional()
    .describe("Text search configuration (default: english)"),
});

export const ToQuerySchema = z.object({
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

// =============================================================================
// OUTPUT SCHEMAS (MCP 2025-11-25 structuredContent)
// =============================================================================

// Common output schema for text tools that return rows with count
export const TextRowsOutputSchema = z
  .object({
    rows: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Matching rows"),
    count: z.number().optional().describe("Number of rows returned"),
    truncated: z
      .boolean()
      .optional()
      .describe("Whether results were truncated by the default limit"),
    hint: z
      .string()
      .optional()
      .describe("Hint about truncation when results are capped"),
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if operation failed"),
  })
  .extend(ErrorResponseFields.shape);

// Output schema for pg_create_fts_index
export const FtsIndexOutputSchema = z
  .object({
    success: z.boolean().describe("Whether index creation succeeded"),
    index: z.string().optional().describe("Index name"),
    config: z.string().optional().describe("Text search configuration used"),
    skipped: z
      .boolean()
      .optional()
      .describe("Whether index already existed (IF NOT EXISTS)"),
    error: z.string().optional().describe("Error message if operation failed"),
  })
  .extend(ErrorResponseFields.shape);

// Output schema for pg_text_normalize
export const TextNormalizeOutputSchema = z
  .object({
    normalized: z
      .string()
      .optional()
      .describe("Text with accent marks removed"),
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if operation failed"),
  })
  .extend(ErrorResponseFields.shape);

// Output schema for pg_text_sentiment
export const TextSentimentOutputSchema = z
  .object({
    sentiment: z
      .enum([
        "very_positive",
        "positive",
        "neutral",
        "negative",
        "very_negative",
      ])
      .optional()
      .describe("Overall sentiment classification"),
    score: z
      .number()
      .optional()
      .describe("Net sentiment score (positive - negative)"),
    positiveCount: z
      .number()
      .optional()
      .describe("Number of positive words found"),
    negativeCount: z
      .number()
      .optional()
      .describe("Number of negative words found"),
    confidence: z
      .enum(["low", "medium", "high"])
      .optional()
      .describe("Confidence level"),
    matchedPositive: z
      .array(z.string())
      .optional()
      .describe("Matched positive words (if returnWords=true)"),
    matchedNegative: z
      .array(z.string())
      .optional()
      .describe("Matched negative words (if returnWords=true)"),
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if operation failed"),
  })
  .extend(ErrorResponseFields.shape);

// Output schema for pg_text_to_vector
export const TextToVectorOutputSchema = z
  .object({
    vector: z.string().optional().describe("tsvector representation"),
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if operation failed"),
  })
  .extend(ErrorResponseFields.shape);

// Output schema for pg_text_to_query
export const TextToQueryOutputSchema = z
  .object({
    query: z.string().optional().describe("tsquery representation"),
    mode: z.string().optional().describe("Query parsing mode used"),
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if operation failed"),
  })
  .extend(ErrorResponseFields.shape);

// Output schema for pg_text_search_config
export const TextSearchConfigOutputSchema = z
  .object({
    configs: z
      .array(
        z.object({
          name: z.string().describe("Configuration name"),
          schema: z.string().describe("Schema containing the configuration"),
          description: z
            .string()
            .nullable()
            .describe("Configuration description"),
        }),
      )
      .optional()
      .describe("Available text search configurations"),
    count: z.number().optional().describe("Number of configurations"),
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if operation failed"),
  })
  .extend(ErrorResponseFields.shape);
