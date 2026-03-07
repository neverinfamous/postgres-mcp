/**
 * postgres-mcp - JSONB Advanced Schemas
 *
 * Schemas for advanced JSONB operations: normalize, stats, index suggest, security scan.
 * Also includes all JSONB output schemas.
 */

import { z } from "zod";

import { preprocessJsonbParams } from "./basic.js";

// ============== NORMALIZE SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbNormalizeSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Table name (alias for table)"),
  column: z.string().optional().describe("JSONB column"),
  col: z.string().optional().describe("JSONB column (alias for column)"),
  mode: z
    .enum(["keys", "array", "pairs", "flatten"])
    .optional()
    .describe(
      "keys: text values (all converted to string). pairs: JSONB types preserved. array: for arrays. flatten: recursive.",
    ),
  where: z.string().optional().describe("WHERE clause"),
  filter: z.string().optional().describe("WHERE clause (alias for where)"),
  idColumn: z
    .string()
    .optional()
    .describe(
      'Column to use for row identification (e.g., "id"). If omitted, defaults to "id" if it exists, else uses ctid.',
    ),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

// Internal schema with refine (for handler validation)
const JsonbNormalizeSchemaRefined = JsonbNormalizeSchemaBase.refine(
  (data) => data.table !== undefined || data.tableName !== undefined,
  { message: "Either 'table' or 'tableName' is required" },
).refine((data) => data.column !== undefined || data.col !== undefined, {
  message: "Either 'column' or 'col' is required",
});

// Full schema with preprocess (for handler parsing)
export const JsonbNormalizeSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbNormalizeSchemaRefined,
);

// ============== STATS SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbStatsSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Table name (alias for table)"),
  column: z.string().optional().describe("JSONB column"),
  col: z.string().optional().describe("JSONB column (alias for column)"),
  sampleSize: z.coerce.number().optional().describe("Sample rows to analyze"),
  where: z.string().optional().describe("WHERE clause to filter rows"),
  filter: z
    .string()
    .optional()
    .describe("WHERE clause to filter rows (alias for where)"),
  topKeysLimit: z.coerce
    .number()
    .optional()
    .describe("Maximum number of top keys to return (default: 20)"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

// Internal schema with refine (for handler validation)
const JsonbStatsSchemaRefined = JsonbStatsSchemaBase.refine(
  (data) => data.table !== undefined || data.tableName !== undefined,
  { message: "Either 'table' or 'tableName' is required" },
).refine((data) => data.column !== undefined || data.col !== undefined, {
  message: "Either 'column' or 'col' is required",
});

// Full schema with preprocess (for handler parsing)
export const JsonbStatsSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbStatsSchemaRefined,
);

// ============== INDEX SUGGEST SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbIndexSuggestSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Table name (alias for table)"),
  column: z.string().optional().describe("JSONB column"),
  col: z.string().optional().describe("JSONB column (alias for column)"),
  sampleSize: z.coerce.number().optional().describe("Sample rows to analyze"),
  where: z.string().optional().describe("WHERE clause to filter rows"),
  filter: z
    .string()
    .optional()
    .describe("WHERE clause to filter rows (alias for where)"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

// Internal schema with refine (for handler validation)
const JsonbIndexSuggestSchemaRefined = JsonbIndexSuggestSchemaBase.refine(
  (data) => data.table !== undefined || data.tableName !== undefined,
  { message: "Either 'table' or 'tableName' is required" },
).refine((data) => data.column !== undefined || data.col !== undefined, {
  message: "Either 'column' or 'col' is required",
});

// Full schema with preprocess (for handler parsing)
export const JsonbIndexSuggestSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbIndexSuggestSchemaRefined,
);

// ============== SECURITY SCAN SCHEMA ==============
// Base schema (for MCP inputSchema visibility - no preprocess)
export const JsonbSecurityScanSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Table name (alias for table)"),
  column: z.string().optional().describe("JSONB column"),
  col: z.string().optional().describe("JSONB column (alias for column)"),
  sampleSize: z.coerce.number().optional().describe("Sample rows to scan"),
  where: z.string().optional().describe("WHERE clause to filter rows"),
  filter: z
    .string()
    .optional()
    .describe("WHERE clause to filter rows (alias for where)"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

// Internal schema with refine (for handler validation)
const JsonbSecurityScanSchemaRefined = JsonbSecurityScanSchemaBase.refine(
  (data) => data.table !== undefined || data.tableName !== undefined,
  { message: "Either 'table' or 'tableName' is required" },
).refine((data) => data.column !== undefined || data.col !== undefined, {
  message: "Either 'column' or 'col' is required",
});

// Full schema with preprocess (for handler parsing)
export const JsonbSecurityScanSchema = z.preprocess(
  preprocessJsonbParams,
  JsonbSecurityScanSchemaRefined,
);

// ============== OUTPUT SCHEMAS (MCP 2025-11-25 structuredContent) ==============

// Output schema for pg_jsonb_extract
export const JsonbExtractOutputSchema = z.object({
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Extracted values with optional identifying columns"),
  count: z.number().optional().describe("Number of rows returned"),
  hint: z.string().optional().describe("Hint when all values are null"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_set
export const JsonbSetOutputSchema = z.object({
  rowsAffected: z.number().optional().describe("Number of rows updated"),
  hint: z.string().optional().describe("Additional information"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_insert
export const JsonbInsertOutputSchema = z.object({
  rowsAffected: z.number().optional().describe("Number of rows updated"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_delete
export const JsonbDeleteOutputSchema = z.object({
  rowsAffected: z.number().optional().describe("Number of rows updated"),
  hint: z.string().optional().describe("Note about rowsAffected semantics"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_contains
export const JsonbContainsOutputSchema = z.object({
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Matching rows"),
  count: z.number().optional().describe("Number of matching rows returned"),
  truncated: z
    .boolean()
    .optional()
    .describe("Whether results were truncated by the limit"),
  totalCount: z
    .number()
    .optional()
    .describe("Total matching rows before limit (present when truncated)"),
  warning: z
    .string()
    .optional()
    .describe("Warning for empty object containment"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_path_query
export const JsonbPathQueryOutputSchema = z.object({
  results: z.array(z.unknown()).optional().describe("Query results"),
  count: z.number().optional().describe("Number of results returned"),
  truncated: z
    .boolean()
    .optional()
    .describe("Whether results were truncated by the limit"),
  totalCount: z
    .number()
    .optional()
    .describe("Total results before limit (present when truncated)"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_agg
export const JsonbAggOutputSchema = z.object({
  result: z
    .unknown()
    .optional()
    .describe("Aggregated JSONB array or grouped results"),
  count: z.number().optional().describe("Number of items or groups"),
  grouped: z.boolean().optional().describe("Whether results are grouped"),
  hint: z.string().optional().describe("Empty result hint"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_object
export const JsonbObjectOutputSchema = z.object({
  object: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Built JSONB object"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_array
export const JsonbArrayOutputSchema = z.object({
  array: z.array(z.unknown()).optional().describe("Built JSONB array"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_keys
export const JsonbKeysOutputSchema = z.object({
  keys: z
    .array(z.string())
    .optional()
    .describe("Unique keys from JSONB column"),
  count: z.number().optional().describe("Number of unique keys"),
  hint: z.string().optional().describe("Deduplication note"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_strip_nulls (two modes: update or preview)
// Uses combined schema with optional fields instead of union with z.literal() to avoid Zod validation issues
export const JsonbStripNullsOutputSchema = z.object({
  // Update mode fields
  rowsAffected: z.number().optional().describe("Number of rows updated"),
  // Preview mode fields
  preview: z.boolean().optional().describe("Preview mode indicator"),
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Before/after comparison"),
  count: z.number().optional().describe("Number of rows"),
  hint: z.string().optional().describe("Preview mode note"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_typeof
export const JsonbTypeofOutputSchema = z.object({
  types: z
    .array(z.string().nullable())
    .optional()
    .describe("JSONB types for each row (null if path doesn't exist)"),
  count: z.number().optional().describe("Number of rows"),
  columnNull: z
    .boolean()
    .optional()
    .describe("Whether any column was NULL (uses .some() aggregation)"),
  hint: z.string().optional().describe("Additional information"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// ============== ADVANCED JSONB OUTPUT SCHEMAS ==============

// Output schema for pg_jsonb_validate_path
export const JsonbValidatePathOutputSchema = z.object({
  valid: z.boolean().optional().describe("Whether path is valid"),
  path: z.string().optional().describe("The validated path expression"),
  error: z.string().optional().describe("Error message if invalid"),
  results: z
    .array(z.unknown())
    .optional()
    .describe("Test results if testValue provided"),
  varsUsed: z
    .boolean()
    .optional()
    .describe("Whether vars were used in the query"),
  success: z.boolean().optional().describe("False on error"),
});

// Output schema for pg_jsonb_merge
export const JsonbMergeOutputSchema = z.object({
  merged: z.unknown().optional().describe("Merged JSONB document"),
  deep: z.boolean().optional().describe("Whether deep merge was used"),
  mergeArrays: z
    .boolean()
    .optional()
    .describe("Whether arrays were concatenated"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_normalize
export const JsonbNormalizeOutputSchema = z.object({
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Normalized rows"),
  count: z.number().optional().describe("Number of rows"),
  mode: z.string().optional().describe("Normalization mode used"),
  hint: z.string().optional().describe("Additional information"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_diff
export const JsonbDiffOutputSchema = z.object({
  differences: z
    .array(
      z.object({
        key: z.string().describe("Key that differs"),
        status: z
          .enum(["added", "removed", "modified"])
          .describe("Type of difference"),
        value1: z.unknown().optional().describe("Value in doc1"),
        value2: z.unknown().optional().describe("Value in doc2"),
      }),
    )
    .optional()
    .describe("List of differences"),
  hasDifferences: z
    .boolean()
    .optional()
    .describe("Whether any differences exist"),
  comparison: z.string().optional().describe("Comparison type performed"),
  hint: z.string().optional().describe("Explanation of comparison scope"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_index_suggest
export const JsonbIndexSuggestOutputSchema = z.object({
  recommendations: z
    .array(z.string())
    .optional()
    .describe("Index creation SQL recommendations"),
  analyzed: z
    .object({
      topKeys: z.number().optional().describe("Number of top keys analyzed"),
      existingIndexes: z.number().optional().describe("Existing indexes found"),
    })
    .optional()
    .describe("Analysis details"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_security_scan
export const JsonbSecurityScanOutputSchema = z.object({
  issues: z
    .array(
      z.object({
        type: z.string().describe("Issue type"),
        key: z.string().optional().describe("Affected key"),
        count: z.number().optional().describe("Occurrence count"),
        severity: z.string().optional().describe("Issue severity"),
      }),
    )
    .optional()
    .describe("Security issues found"),
  riskLevel: z
    .enum(["low", "medium", "high"])
    .optional()
    .describe("Overall risk level"),
  scannedRows: z.number().optional().describe("Number of rows scanned"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});

// Output schema for pg_jsonb_stats
export const JsonbStatsOutputSchema = z.object({
  basics: z
    .object({
      total_rows: z.number().describe("Total rows"),
      non_null_count: z.number().optional().describe("Non-null values"),
      avg_size_bytes: z.number().optional().describe("Average size"),
      max_size_bytes: z.number().optional().describe("Maximum size"),
    })
    .optional()
    .describe("Basic statistics"),
  topKeys: z
    .array(
      z.object({
        key: z.string().describe("Key name"),
        frequency: z.number().describe("Occurrence count"),
      }),
    )
    .optional()
    .describe("Most common keys"),
  typeDistribution: z
    .array(
      z.object({
        type: z
          .string()
          .nullable()
          .describe("JSONB type (null = SQL NULL column)"),
        count: z.number().describe("Count"),
      }),
    )
    .optional()
    .describe("Type distribution"),
  sqlNullCount: z
    .number()
    .optional()
    .describe("Count of rows with SQL NULL in the JSONB column"),
  hint: z.string().optional().describe("Usage hints or notes"),
  success: z.boolean().optional().describe("False on error"),
  error: z.string().optional().describe("Error message"),
});
