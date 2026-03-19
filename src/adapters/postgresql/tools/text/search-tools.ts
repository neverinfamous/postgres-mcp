/**
 * PostgreSQL Text Tools - LIKE Search & Sentiment
 *
 * LIKE/ILIKE pattern search and basic keyword-based sentiment analysis.
 * 2 tools total.
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
  sanitizeIdentifier,
  sanitizeIdentifiers,
  sanitizeTableName,
} from "../../../../utils/identifiers.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import {
  coerceLimit,
  buildLimitClause,
} from "../../../../utils/query-helpers.js";
import {
  preprocessTextParams,
  // Output schemas
  TextRowsOutputSchema,
  TextSentimentOutputSchema,
} from "../../schemas/index.js";

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
        const limitVal = coerceLimit(parsed.limit);
        const limitClause = buildLimitClause(limitVal);

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
        return formatHandlerErrorResponse(error, {
            tool: "pg_like_search",
          });
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
        return Promise.resolve(
          formatHandlerErrorResponse(error, {
            tool: "pg_text_sentiment",
          }),
        );
      }
    },
  };
}
