/**
 * postgres-mcp - citext Extension Schemas
 *
 * Input validation and output schemas for citext tools.
 */

import { z } from "zod";
import { normalizeOptionalParams } from "./shared.js";

// =============================================================================
// Compare Schema
// =============================================================================

/**
 * Base schema for MCP visibility - shows parameters with optional types for framework passthrough.
 */
export const CitextCompareSchemaBase = z.object({
  value1: z.string().optional().describe("First value to compare"),
  value2: z.string().optional().describe("Second value to compare"),
});

/**
 * Handler-side schema for compare tool.
 * Validates required fields within try/catch.
 */
export const CitextCompareSchema = z
  .preprocess(normalizeOptionalParams, CitextCompareSchemaBase)
  .refine((data) => typeof data.value1 === "string" && data.value1.length > 0, {
    message: "value1 is required",
  })
  .refine((data) => typeof data.value2 === "string" && data.value2.length > 0, {
    message: "value2 is required",
  });

// =============================================================================
// Preprocessors
// =============================================================================

/**
 * Preprocess citext table parameters:
 * - Alias: tableName -> table
 * - Alias: col -> column
 * - Parse schema.table format
 */
export function preprocessCitextTableParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const obj = input as Record<string, unknown>;
  const result = { ...obj };

  // Alias: tableName -> table
  if (result["table"] === undefined && result["tableName"] !== undefined) {
    result["table"] = result["tableName"];
  }

  // Alias: col -> column
  if (result["col"] !== undefined && result["column"] === undefined) {
    result["column"] = result["col"];
  }

  // Parse schema.table format
  if (
    typeof result["table"] === "string" &&
    result["table"].includes(".") &&
    result["schema"] === undefined
  ) {
    const parts = result["table"].split(".");
    if (parts.length === 2) {
      result["schema"] = parts[0];
      result["table"] = parts[1];
    }
  }

  return result;
}

// =============================================================================
// Input Schemas
// =============================================================================

/**
 * Base schema for MCP visibility (shows all parameters including aliases).
 */
export const CitextConvertColumnSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  column: z.string().optional().describe("Text column to convert to citext"),
  col: z.string().optional().describe("Alias for column"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

/**
 * Transformed schema for converting a text column to citext.
 * Resolves aliases, parses schema.table format, and validates required fields.
 */
export const CitextConvertColumnSchema = z
  .preprocess(preprocessCitextTableParams, CitextConvertColumnSchemaBase)
  .transform((data) => ({
    table: data.table ?? "",
    column: data.column ?? data.col ?? "",
    schema: data.schema,
  }))
  .refine((data) => data.table !== "", {
    message: "table is required",
  })
  .refine((data) => data.column !== "", {
    message: "column (or col alias) is required",
  });

/**
 * Base schema for MCP visibility - shows all parameters for listColumns.
 */
export const CitextListColumnsSchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Schema name to filter (all schemas if omitted)"),
  limit: z
    .any()
    .optional()
    .describe("Maximum number of columns to return (default: 100, 0 for all)"),
});

/**
 * Schema for listing citext columns.
 * Preprocesses to handle empty/null params.
 */
export const CitextListColumnsSchema = z.preprocess(
  normalizeOptionalParams,
  CitextListColumnsSchemaBase,
);

/**
 * Base schema for MCP visibility - shows all parameters for analyzeCandidates.
 */
export const CitextAnalyzeCandidatesSchemaBase = z.object({
  patterns: z
    .array(z.string())
    .optional()
    .describe(
      "Column name patterns to match (default: email, username, name, etc.)",
    ),
  schema: z.string().optional().describe("Schema name to filter"),
  table: z
    .string()
    .optional()
    .describe("Table name to filter (analyzes single table)"),
  limit: z.coerce.number().optional().describe("Maximum number of candidates to return"),
  excludeSystemSchemas: z
    .boolean()
    .optional()
    .describe(
      "Exclude extension/system schemas like cron, topology, partman (default: true)",
    ),
});

/**
 * Schema for analyzing candidate columns for citext conversion.
 * Preprocesses to handle empty/null params.
 */
export const CitextAnalyzeCandidatesSchema = z.preprocess(
  (input) => preprocessCitextTableParams(normalizeOptionalParams(input)),
  CitextAnalyzeCandidatesSchemaBase,
);

/**
 * Base schema for MCP visibility (shows all parameters including aliases).
 */
export const CitextSchemaAdvisorSchemaBase = z.object({
  table: z.string().optional().describe("Table name to analyze (required)"),
  tableName: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

/**
 * Transformed schema for citext schema advisor tool.
 * Resolves aliases, parses schema.table format, and validates required fields.
 */
export const CitextSchemaAdvisorSchema = z
  .preprocess(preprocessCitextTableParams, CitextSchemaAdvisorSchemaBase)
  .transform((data) => ({
    table: data.table ?? data.tableName ?? "",
    schema: data.schema,
  }))
  .refine((data) => data.table !== "", {
    message: "table (or tableName alias) is required",
  });

// =============================================================================
// Output Schemas
// =============================================================================

/**
 * Output schema for pg_citext_create_extension
 */
export const CitextCreateExtensionOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether extension was enabled"),
    message: z.string().optional().describe("Status message"),
    usage: z.string().optional().describe("Usage information"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("citext extension creation result");

/**
 * Output schema for pg_citext_convert_column
 */
export const CitextConvertColumnOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether conversion succeeded"),
    message: z.string().optional().describe("Status message"),
    table: z.string().optional().describe("Qualified table name"),
    previousType: z.string().optional().describe("Previous column type"),
    wasAlreadyCitext: z
      .boolean()
      .optional()
      .describe("Column was already citext"),
    error: z.string().optional().describe("Error message"),
    currentType: z.string().optional().describe("Current column type"),
    allowedTypes: z
      .array(z.string())
      .optional()
      .describe("Allowed source types"),
    suggestion: z.string().optional().describe("Suggestion for resolution"),
    dependentViews: z
      .array(z.string())
      .optional()
      .describe("Views that depend on this column"),
    hint: z.string().optional().describe("Helpful hint"),
    affectedViews: z
      .array(z.string())
      .optional()
      .describe("Views affected by conversion"),
  })
  .describe("Column conversion result");

/**
 * Output schema for pg_citext_list_columns
 */
export const CitextListColumnsOutputSchema = z
  .object({
    columns: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("citext columns"),
    count: z.number().optional().describe("Number of columns returned"),
    totalCount: z.number().optional().describe("Total available count"),
    truncated: z.boolean().optional().describe("Results were truncated"),
    limit: z.number().optional().describe("Limit applied"),
    schema: z.string().optional().describe("Schema filter applied"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("List of citext columns");

/**
 * Output schema for pg_citext_analyze_candidates
 */
export const CitextAnalyzeCandidatesOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether analysis succeeded"),
    candidates: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Candidate columns"),
    count: z.number().optional().describe("Number of candidates returned"),
    totalCount: z.number().optional().describe("Total available count"),
    truncated: z.boolean().optional().describe("Results were truncated"),
    limit: z.number().optional().describe("Limit applied"),
    table: z.string().optional().describe("Table filter applied"),
    schema: z.string().optional().describe("Schema filter applied"),
    summary: z
      .object({
        highConfidence: z.number().describe("High confidence count"),
        mediumConfidence: z.number().describe("Medium confidence count"),
      })
      .optional()
      .describe("Confidence summary"),
    recommendation: z.string().optional().describe("Recommendation"),
    excludedSchemas: z
      .array(z.string())
      .optional()
      .describe("Excluded schemas"),
    patternsUsed: z
      .array(z.string())
      .optional()
      .describe("Search patterns used"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Candidate analysis result");

/**
 * Output schema for pg_citext_compare
 */
export const CitextCompareOutputSchema = z
  .object({
    value1: z.string().optional().describe("First value"),
    value2: z.string().optional().describe("Second value"),
    citextEqual: z.boolean().optional().describe("citext equality result"),
    textEqual: z.boolean().optional().describe("Text equality result"),
    lowerEqual: z.boolean().optional().describe("Lowercase equality result"),
    extensionInstalled: z
      .boolean()
      .optional()
      .describe("Whether citext is installed"),
    hint: z.string().optional().describe("Helpful hint"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Comparison result");

/**
 * Output schema for pg_citext_schema_advisor
 */
export const CitextSchemaAdvisorOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether analysis succeeded"),
    table: z.string().optional().describe("Analyzed table"),
    recommendations: z
      .array(
        z.object({
          column: z.string().describe("Column name"),
          currentType: z.string().describe("Current data type"),
          previousType: z.string().optional().describe("Previous type"),
          recommendation: z
            .enum(["convert", "keep", "already_citext"])
            .describe("Recommendation"),
          confidence: z.enum(["high", "medium", "low"]).describe("Confidence"),
          reason: z.string().describe("Reason for recommendation"),
        }),
      )
      .optional()
      .describe("Column recommendations"),
    summary: z
      .object({
        totalTextColumns: z.number().describe("Total text columns"),
        recommendConvert: z.number().describe("Columns to convert"),
        highConfidence: z.number().describe("High confidence count"),
        alreadyCitext: z.number().describe("Already citext count"),
      })
      .optional()
      .describe("Summary statistics"),
    nextSteps: z.array(z.string()).optional().describe("Suggested next steps"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Schema advisor result");
