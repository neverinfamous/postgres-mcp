/**
 * PostgreSQL Core Tools - Input Schemas
 *
 * Input validation schemas for core tool parameters:
 * ListObjects, ObjectDetails, AnalyzeDbHealth, AnalyzeWorkloadIndexes,
 * AnalyzeQueryIndexes.
 */

import { z } from "zod";

// Helper to handle undefined params (allows tools to be called without {})
const defaultToEmpty = (val: unknown): unknown => val ?? {};

/**
 * Preprocess list objects params for type/types alias handling
 */
function preprocessListObjectsParams(input: unknown): unknown {
  if (input === undefined || input === null) return {};
  if (typeof input !== "object") return input;
  const result = { ...(input as Record<string, unknown>) };

  // Handle 'type' as alias for 'types' (support singular form)
  if (result["types"] === undefined && result["type"] !== undefined) {
    const typeValue = result["type"];
    // Convert single string to array
    if (typeof typeValue === "string") {
      result["types"] = [typeValue];
    } else if (Array.isArray(typeValue)) {
      result["types"] = typeValue;
    }
    delete result["type"];
  }

  // If types is a single string, wrap in array
  if (typeof result["types"] === "string") {
    result["types"] = [result["types"]];
  }

  return result;
}

// Base schema for MCP visibility - exposes all parameters without transform
// Valid object types for ListObjects
export const VALID_OBJECT_TYPES = [
  "table",
  "view",
  "materialized_view",
  "function",
  "procedure",
  "sequence",
  "index",
  "trigger",
] as const;

export const ListObjectsSchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Schema name (default: all user schemas)"),
  types: z
    .array(z.string())
    .optional()
    .describe("Object types to include"),
  type: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe("Alias for types (singular or array)"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of objects to return (default: 100)"),
});

// Transformed schema with preprocess for handler parsing
export const ListObjectsSchema = z.preprocess(
  preprocessListObjectsParams,
  ListObjectsSchemaBase,
);

// Inner schema for ObjectDetails (used by preprocess and as base for MCP visibility)
// Valid object types for ObjectDetails
export const VALID_OBJECT_DETAIL_TYPES = [
  "table",
  "view",
  "materialized_view",
  "partitioned_table",
  "function",
  "sequence",
  "index",
] as const;

const ObjectDetailsInnerSchema = z.object({
  name: z
    .string()
    .optional()
    .describe("Object name (supports schema.name format)"),
  object: z.string().optional().describe("Alias for name"),
  objectName: z.string().optional().describe("Alias for name (Code Mode API)"),
  table: z.string().optional().describe("Alias for name"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  type: z.string().optional().describe("Object type hint (case-insensitive)"),
  objectType: z.string().optional().describe("Alias for type"),
});

// Preprocess function for ObjectDetails
function preprocessObjectDetailsParams(val: unknown): unknown {
  const obj = (val ?? {}) as Record<string, unknown>;
  // Support 'table', 'object', and 'objectName' as aliases for 'name'
  if (obj["name"] === undefined) {
    if (obj["table"] !== undefined) obj["name"] = obj["table"];
    else if (obj["object"] !== undefined) obj["name"] = obj["object"];
    else if (obj["objectName"] !== undefined) obj["name"] = obj["objectName"];
  }
  // Parse schema.name format if schema not explicitly provided
  if (
    typeof obj["name"] === "string" &&
    obj["name"].includes(".") &&
    obj["schema"] === undefined
  ) {
    const parts = obj["name"].split(".");
    if (parts.length === 2) {
      obj["schema"] = parts[0];
      obj["name"] = parts[1];
    }
  }
  // Normalize 'type' and 'objectType' to lowercase for case-insensitivity
  if (typeof obj["type"] === "string") {
    obj["type"] = obj["type"].toLowerCase();
  }
  if (typeof obj["objectType"] === "string") {
    obj["objectType"] = obj["objectType"].toLowerCase();
  }
  return obj;
}

// Base schema for MCP visibility - exported directly without preprocess wrapper
// so MCP clients can see all input parameters
export const ObjectDetailsSchemaBase = z.object({
  name: z
    .string()
    .optional()
    .describe("Object name (supports schema.name format)"),
  object: z.string().optional().describe("Alias for name"),
  objectName: z.string().optional().describe("Alias for name (Code Mode API)"),
  table: z.string().optional().describe("Alias for name"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  type: z.string().optional().describe("Object type hint (case-insensitive)"),
  objectType: z.string().optional().describe("Alias for type"),
});

// Full schema with transform for handler parsing
export const ObjectDetailsSchema = z
  .preprocess(preprocessObjectDetailsParams, ObjectDetailsInnerSchema)
  .transform((data) => ({
    name: data.name ?? data.object ?? data.objectName ?? data.table ?? "",
    schema: data.schema,
    type: data.type ?? data.objectType,
  }))
  .refine((data) => data.name !== "", {
    message: "name (or object/objectName/table alias) is required",
  });

export const AnalyzeDbHealthSchemaBase = z.object({
  includeIndexes: z
    .boolean()
    .optional()
    .describe("Include unused indexes analysis (default: true)"),
  includeVacuum: z
    .boolean()
    .optional()
    .describe("Include tables needing vacuum analysis (default: true)"),
  includeConnections: z
    .boolean()
    .optional()
    .describe("Include connection stats (default: true)"),
});

export const AnalyzeDbHealthSchema = z.preprocess(
  defaultToEmpty,
  AnalyzeDbHealthSchemaBase,
);

export const AnalyzeWorkloadIndexesSchemaBase = z.object({
  topQueries: z
    .number()
    .optional()
    .describe("Number of top queries to analyze (default: 20)"),
  minCalls: z.number().optional().describe("Minimum call count threshold"),
  queryPreviewLength: z
    .number()
    .optional()
    .describe(
      "Maximum characters for query preview (default: 200). Truncated queries end with '…'",
    ),
});

export const AnalyzeWorkloadIndexesSchema = z.preprocess(
  defaultToEmpty,
  AnalyzeWorkloadIndexesSchemaBase,
);

// Base schema for MCP visibility - exported so tool can use it for inputSchema
export const AnalyzeQueryIndexesSchemaBase = z.object({
  sql: z
    .string()
    .optional()
    .describe("Query to analyze for index recommendations"),
  query: z.string().optional().describe("Alias for sql"),
  params: z.array(z.unknown()).optional().describe("Query parameters"),
  verbosity: z
    .string()
    .optional()
    .describe(
      "Response detail level: 'summary' (compact), 'full' (include full plan). Default: summary",
    ),
});

// Transformed schema with alias resolution
export const AnalyzeQueryIndexesSchema =
  AnalyzeQueryIndexesSchemaBase.transform((data) => ({
    sql: data.sql ?? data.query ?? "",
    params: data.params,
    verbosity: data.verbosity ?? "summary",
  })).refine((data) => data.sql !== "", {
    message: "sql (or query alias) is required",
  });
