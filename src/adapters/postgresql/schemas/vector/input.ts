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
  queryVector: FiniteNumberArray.optional().describe("Alias for vector"),
  metric: z
    .string()
    .optional()
    .describe("Distance metric"),
  limit: z.unknown().optional().describe("Number of results"),
  select: z
    .array(z.string())
    .optional()
    .describe("Additional columns to return"),
  where: z.string().optional().describe("Filter condition"),
  filter: z.string().optional().describe("Alias for where"),
  distanceMetric: z.string().optional().describe("Alias for metric"),
  schema: z.string().optional().describe("Database schema (default: public)"),
  excludeNull: z
    .boolean()
    .optional()
    .describe("Exclude rows with NULL vectors (default: false)"),
});

// Transformed schema with alias resolution and schema.table parsing
export const VectorSearchSchema = VectorSearchSchemaBase.transform(
  (data, ctx) => {
    // Parse schema.table format (embedded schema takes priority over explicit schema param)
    let resolvedTable = data.table ?? data.tableName ?? "";
    let resolvedSchema = data.schema;
    if (resolvedTable.includes(".")) {
      const parts = resolvedTable.split(".");
      resolvedSchema = parts[0] ?? data.schema ?? "public";
      resolvedTable = parts[1] ?? resolvedTable;
    }

    const rawLimit = data.limit !== undefined ? Number(data.limit) : undefined;

    if (
      rawLimit !== undefined &&
      (!Number.isFinite(rawLimit) || rawLimit <= 0)
    ) {
      ctx.addIssue({
        code: "custom",
        message: `limit must be a positive number, received: ${String(data.limit)}`,
        path: ["limit"],
      });
      return z.NEVER;
    }

    // Resolve metric vs distanceMetric
    const resolvedMetric =
      data.metric ??
      (data.distanceMetric === "cosine" ||
      data.distanceMetric === "l2" ||
      data.distanceMetric === "inner_product"
        ? data.distanceMetric
        : undefined);

    if (data.distanceMetric && !resolvedMetric) {
      ctx.addIssue({
        code: "custom",
        message: `Invalid distance metric: ${data.distanceMetric}. Must be l2, cosine, or inner_product`,
        path: ["distanceMetric"],
      });
      return z.NEVER;
    }

    return {
      table: resolvedTable,
      column: data.column ?? data.col ?? "",
      vector: data.vector ?? data.queryVector,
      metric: resolvedMetric,
      limit: rawLimit,
      select: data.select,
      where: data.where ?? data.filter,
      schema: resolvedSchema,
      excludeNull: data.excludeNull,
    };
  },
);

// Base schema for MCP exposure
export const VectorCreateIndexSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  column: z.string().optional().describe("Vector column name"),
  col: z.string().optional().describe("Alias for column"),
  type: z.string().optional().describe("Index type"),
  method: z.string().optional().describe("Alias for type"),
  metric: z
    .string()
    .optional()
    .describe("Distance metric (default: l2)"),
  distanceMetric: z.string().optional().describe("Alias for metric"),
  ifNotExists: z
    .boolean()
    .optional()
    .describe("Skip if index already exists (default: false)"),
  lists: z
    .preprocess(coerceNumber, z.number().optional())
    .optional()
    .describe("Number of lists for IVFFlat"),
  m: z
    .preprocess(coerceNumber, z.number().optional())
    .optional()
    .describe("HNSW m parameter"),
  efConstruction: z
    .preprocess(coerceNumber, z.number().optional())
    .optional()
    .describe("HNSW ef_construction parameter"),
  ef_construction: z
    .preprocess(coerceNumber, z.number().optional())
    .optional()
    .describe("Alias for efConstruction"),
  schema: z.string().optional().describe("Database schema (default: public)"),
  indexName: z
    .string()
    .optional()
    .describe(
      "Custom index name (default: auto-generated from table_column_type)",
    ),
  name: z.string().optional().describe("Alias for indexName"),
});

// Transformed schema with alias resolution
export const VectorCreateIndexSchema = VectorCreateIndexSchemaBase.transform(
  (data, ctx) => {
    const resolvedType = data.type ?? data.method;

    // Resolve metric vs distanceMetric
    const resolvedMetric =
      data.metric ??
      (data.distanceMetric === "cosine" ||
      data.distanceMetric === "l2" ||
      data.distanceMetric === "inner_product"
        ? data.distanceMetric
        : undefined);

    if (data.distanceMetric && !resolvedMetric) {
      ctx.addIssue({
        code: "custom",
        message: `Invalid distance metric: ${data.distanceMetric}. Must be l2, cosine, or inner_product (distanceMetric)`,
        path: ["distanceMetric"],
      });
      return z.NEVER;
    }

    return {
      table: data.table ?? data.tableName ?? "",
      column: data.column ?? data.col ?? "",
      type: resolvedType,
      metric: resolvedMetric ?? "l2",
      ifNotExists: data.ifNotExists,
      lists: data.lists,
      m: data.m,
      efConstruction: data.efConstruction ?? data.ef_construction,
      schema: data.schema,
      indexName: data.indexName ?? data.name,
    };
  },
);

// Base schema exposure for MCP
export const VectorCreateExtensionSchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Database schema to create the extension in (default: public)"),
});

// Advanced Search schemas
export const HybridSearchSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  vectorColumn: z.string().optional().describe("Vector column"),
  vectorCol: z.string().optional().describe("Alias for vectorColumn"),
  vector_column: z.string().optional().describe("Alias for vectorColumn"),
  column: z.string().optional().describe("Alias for vectorColumn"),
  col: z.string().optional().describe("Alias for vectorColumn"),
  textColumn: z.string().optional().describe("Text column for FTS"),
  searchColumn: z.string().optional().describe("Alias for textColumn"),
  search_column: z.string().optional().describe("Alias for textColumn"),
  vector: FiniteNumberArray.optional().describe("Query vector"),
  queryVector: FiniteNumberArray.optional().describe("Alias for vector"),
  query_vector: FiniteNumberArray.optional().describe("Alias for vector"),
  textQuery: z.string().optional().describe("Text search query"),
  queryText: z.string().optional().describe("Alias for text search query"),
  query: z.string().optional().describe("Alias for text search query"),
  vectorWeight: z
    .preprocess(coerceNumber, z.number().optional())
    .describe("Weight for vector score (0-1, default: 0.5)"),
  limit: z
    .preprocess(coerceNumber, z.number().optional())
    .describe("Max results"),
  select: z
    .array(z.string())
    .optional()
    .describe("Columns to return (defaults to non-vector columns)"),
});

export const HybridSearchSchema = HybridSearchSchemaBase.transform((data) => ({
  table: data.table ?? data.tableName ?? "",
  vectorColumn:
    data.vectorColumn ?? data.vector_column ?? data.vectorCol ?? data.column ?? data.col ?? "",
  textColumn: data.textColumn ?? data.searchColumn ?? data.search_column,
  vector: data.vector ?? data.queryVector ?? data.query_vector,
  textQuery: data.textQuery ?? data.queryText ?? data.query,
  vectorWeight: data.vectorWeight,
  limit: data.limit,
  select: data.select,
}));

export const PerformanceSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  column: z.string().optional().describe("Vector column"),
  col: z.string().optional().describe("Alias for column"),
  testVector: FiniteNumberArray.optional().describe("Test vector for benchmarking"),
  schema: z.string().optional().describe("Database schema (default: public)"),
});

export const PerformanceSchema = PerformanceSchemaBase.transform((data) => ({
  table: data.table ?? data.tableName ?? "",
  column: data.column ?? data.col ?? "",
  testVector: data.testVector,
  schema: data.schema,
}));

// Management schemas
export const VectorClusterSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  column: z.string().optional().describe("Vector column"),
  col: z.string().optional().describe("Alias for column"),
  k: z
    .preprocess(coerceNumber, z.number().optional())
    .describe("Number of clusters"),
  clusters: z
    .preprocess(coerceNumber, z.number().optional())
    .describe("Alias for k (number of clusters)"),
  iterations: z
    .preprocess(coerceNumber, z.number().optional())
    .describe("Max iterations (default: 10)"),
  sampleSize: z
    .preprocess(coerceNumber, z.number().optional())
    .describe("Sample size for large tables"),
  schema: z.string().optional().describe("Database schema (default: public)"),
});

export const VectorClusterSchema = VectorClusterSchemaBase.transform((data) => {
  const rawK = (data.k ?? data.clusters) as unknown;
  const rawIterations = data.iterations as unknown;
  const rawSampleSize = data.sampleSize as unknown;
  return {
    table: data.table ?? data.tableName ?? "",
    column: data.column ?? data.col ?? "",
    k: rawK != null ? Number(rawK) : undefined,
    iterations: rawIterations != null ? Number(rawIterations) : undefined,
    sampleSize: rawSampleSize != null ? Number(rawSampleSize) : undefined,
    schema: data.schema,
  };
}).refine((data) => data.k !== undefined, {
  message: "k (or clusters alias) is required",
});

// Management schemas
export const IndexOptimizeSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  column: z.string().optional().describe("Vector column"),
  col: z.string().optional().describe("Alias for column"),
  schema: z.string().optional().describe("Database schema (default: public)"),
});

export const IndexOptimizeSchema = IndexOptimizeSchemaBase.transform((data) => ({
  table: data.table ?? data.tableName ?? "",
  column: data.column ?? data.col ?? "",
  schema: data.schema,
}));

export const VectorDimensionReduceSchemaBase = z.object({
  vector: FiniteNumberArray.optional().describe("Vector to reduce (for direct mode)"),
  table: z.string().optional().describe("Table name (for table mode)"),
  tableName: z.string().optional().describe("Alias for table"),
  column: z.string().optional().describe("Vector column name (for table mode)"),
  col: z.string().optional().describe("Alias for column"),
  idColumn: z.string().optional().describe("ID column to include in results (default: id)"),
  limit: z.preprocess(coerceNumber, z.number().optional()).describe("Max rows to process (default: 5, max: 100)"),
  targetDimensions: z.preprocess(coerceNumber, z.number().optional()).describe("Target number of dimensions"),
  target_dimensions: z.preprocess(coerceNumber, z.number().optional()).describe("Alias for targetDimensions"),
  dimensions: z.preprocess(coerceNumber, z.number().optional()).describe("Alias for targetDimensions"),
  seed: z.preprocess(coerceNumber, z.number().optional()).describe("Random seed for reproducibility"),
  summarize: z.boolean().optional().describe("Summarize reduced vectors to preview format in table mode (default: true)"),
});

export const VectorDimensionReduceSchema = VectorDimensionReduceSchemaBase.transform((data) => {
  const rawTarget = (data.targetDimensions ?? data.target_dimensions ?? data.dimensions) as unknown;
  const rawLimit = data.limit as unknown;
  const rawSeed = data.seed as unknown;
  return {
    ...data,
    table: data.table ?? data.tableName,
    column: data.column ?? data.col,
    targetDimensions: rawTarget != null ? Number(rawTarget) : undefined,
    limit: rawLimit != null ? Number(rawLimit) : undefined,
    seed: rawSeed != null ? Number(rawSeed) : undefined,
  };
}).refine((data) => data.targetDimensions !== undefined, {
  message: "targetDimensions (or dimensions alias) is required",
});

export const EmbedSchemaBase = z.object({
  text: z.string().optional().describe("Text to embed"),
  input: z.string().optional().describe("Alias for text"),
  model: z.string().optional().describe("Model name (ignored, for compatibility)"),
  dimensions: z.preprocess(coerceNumber, z.number().optional()).describe("Vector dimensions (default: 384)"),
  summarize: z.boolean().optional().describe("Truncate embedding for display (default: true)"),
});

export const EmbedSchema = EmbedSchemaBase.transform((data) => ({
  text: data.text ?? data.input,
  model: data.model,
  dimensions: data.dimensions,
  summarize: data.summarize,
}));
