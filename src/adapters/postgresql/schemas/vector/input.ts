/**
 * postgres-mcp - pgvector Tool Schemas
 *
 * Input validation schemas for vector similarity search.
 * Supports parameter smoothing: col -> column, tableName -> table
 */

import { z } from "zod";
import { coerceNumber } from "../../../../utils/query-helpers.js";

/**
 * Validates that an array contains only finite numbers (rejects Infinity, -Infinity, NaN).
 * Provides clear error message instead of confusing "expected number, received number".
 */
export const FiniteNumberArray = z
  .array(z.number())
  .superRefine((arr: number[], ctx) => {
    const invalidIndexes: number[] = arr
      .map((n: number, i: number) => (Number.isFinite(n) ? -1 : i))
      .filter((i: number) => i >= 0);

    if (invalidIndexes.length > 0) {
      const invalidValues = invalidIndexes
        .map((i: number) => String(arr[i]))
        .join(", ");
      ctx.addIssue({
        code: "custom",
        message: `Vector contains invalid values at index ${invalidIndexes.join(", ")}: ${invalidValues}. Only finite numbers are allowed (no Infinity or NaN).`,
      });
    }
  });

// Base schema for MCP exposure (shows all accepted parameters)
export const VectorSearchSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  column: z.string().optional().describe("Vector column name"),
  col: z.string().optional().describe("Alias for column"),
  vector: FiniteNumberArray.optional().describe("Query vector"),
  metric: z
    .enum(["l2", "cosine", "inner_product"])
    .optional()
    .describe("Distance metric"),
  limit: z.unknown().optional().describe("Number of results"),
  select: z
    .array(z.string())
    .optional()
    .describe("Additional columns to return"),
  where: z.string().optional().describe("Filter condition"),
  filter: z.string().optional().describe("Alias for where"),
  schema: z.string().optional().describe("Database schema (default: public)"),
  excludeNull: z
    .boolean()
    .optional()
    .describe("Exclude rows with NULL vectors (default: false)"),
});

// Transformed schema with alias resolution and schema.table parsing
export const VectorSearchSchema = VectorSearchSchemaBase.transform((data) => {
  // Parse schema.table format (embedded schema takes priority over explicit schema param)
  let resolvedTable = data.table ?? data.tableName ?? "";
  let resolvedSchema = data.schema;
  if (resolvedTable.includes(".")) {
    const parts = resolvedTable.split(".");
    resolvedSchema = parts[0] ?? data.schema ?? "public";
    resolvedTable = parts[1] ?? resolvedTable;
  }

  const rawLimit = Number(data.limit);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined;
  return {
    table: resolvedTable,
    column: data.column ?? data.col ?? "",
    vector: data.vector,
    metric: data.metric,
    limit,
    select: data.select,
    where: data.where ?? data.filter,
    schema: resolvedSchema,
    excludeNull: data.excludeNull,
  };
});

// Base schema for MCP exposure
export const VectorCreateIndexSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  column: z.string().optional().describe("Vector column name"),
  col: z.string().optional().describe("Alias for column"),
  type: z.enum(["ivfflat", "hnsw"]).optional().describe("Index type"),
  method: z.enum(["ivfflat", "hnsw"]).optional().describe("Alias for type"),
  metric: z
    .enum(["l2", "cosine", "inner_product"])
    .optional()
    .describe("Distance metric (default: l2)"),
  ifNotExists: z
    .boolean()
    .optional()
    .describe("Skip if index already exists (default: false)"),
  lists: z.preprocess(coerceNumber, z.number().optional()).describe("Number of lists for IVFFlat"),
  m: z.preprocess(coerceNumber, z.number().optional()).describe("HNSW m parameter"),
  efConstruction: z.preprocess(coerceNumber, z.number().optional())
    .describe("HNSW ef_construction parameter"),
  schema: z.string().optional().describe("Database schema (default: public)"),
});

// Transformed schema with alias resolution
export const VectorCreateIndexSchema = VectorCreateIndexSchemaBase.transform(
  (data) => {
    const resolvedType = data.type ?? data.method;
    return {
      table: data.table ?? data.tableName ?? "",
      column: data.column ?? data.col ?? "",
      type: resolvedType,
      metric: data.metric ?? "l2",
      ifNotExists: data.ifNotExists,
      lists: data.lists,
      m: data.m,
      efConstruction: data.efConstruction,
      schema: data.schema,
    };
  },
).refine((d) => d.type !== undefined, {
  message: "type (or method alias) is required",
});
