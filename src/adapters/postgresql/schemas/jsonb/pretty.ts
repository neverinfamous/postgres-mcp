/**
 * postgres-mcp - JSONB Pretty Schema
 *
 * Input and output schemas for pg_jsonb_pretty tool.
 */

import { z } from "zod";
import { ErrorResponseFields } from "../error-response-fields.js";
import { coerceNumber } from "../../../../utils/query-helpers.js";
import { preprocessJsonbParams } from "./utils.js";

// =============================================================================
// Base Schema (for MCP visibility)
// =============================================================================

export const JsonbPrettySchemaBase = z.object({
  json: z
    .string()
    .optional()
    .describe("Raw JSON string to format (use this OR table+column)"),
  table: z.string().optional().describe("Table name (for formatting column data)"),
  tableName: z.string().optional().describe("Table name (alias for table)"),
  column: z.string().optional().describe("JSONB column name"),
  col: z.string().optional().describe("JSONB column name (alias for column)"),
  where: z.string().optional().describe("WHERE clause to filter rows"),
  filter: z.string().optional().describe("WHERE clause (alias for where)"),
  limit: z.union([z.number(), z.string()]).optional().describe("Maximum rows to format (default: 10)"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

// Preprocessed schema for handler parsing
export const JsonbPrettySchema = z.preprocess(
  preprocessJsonbParams,
  JsonbPrettySchemaBase.extend({
    limit: z.preprocess(coerceNumber, z.number().optional()).optional(),
  }),
);

// =============================================================================
// Output Schema
// =============================================================================

export const JsonbPrettyOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    formatted: z
      .string()
      .optional()
      .describe("Formatted JSON string (raw mode)"),
    rows: z
      .array(
        z.object({
          formatted: z.string().describe("Pretty-printed JSONB value"),
        }),
      )
      .optional()
      .describe("Formatted rows (table mode)"),
    count: z.number().optional().describe("Number of formatted values"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape)
  .describe("JSONB pretty-print output");
