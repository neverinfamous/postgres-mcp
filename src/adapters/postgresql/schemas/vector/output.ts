/**
 * postgres-mcp - pgvector Output Schemas
 *
 * Output validation schemas for MCP 2025-11-25 structured content compliance.
 */

import { z } from "zod";
// ============================================================================

/**
 * Output schema for pg_vector_create_extension
 */
export const VectorCreateExtensionOutputSchema = z
  .object({
    success: z.boolean().describe("Whether extension was enabled"),
    message: z.string().describe("Status message"),
  })
  .describe("Vector extension creation result");

/**
 * Output schema for pg_vector_add_column
 */
export const VectorAddColumnOutputSchema = z
  .object({
    success: z.boolean().describe("Whether operation succeeded"),
    table: z.string().optional().describe("Table name"),
    column: z.string().optional().describe("Column name"),
    dimensions: z.number().optional().describe("Vector dimensions"),
    ifNotExists: z.boolean().optional().describe("If NOT EXISTS was used"),
    alreadyExists: z.boolean().optional().describe("Column already existed"),
    message: z.string().optional().describe("Status message"),
    error: z.string().optional().describe("Error message"),
    requiredParams: z
      .array(z.string())
      .optional()
      .describe("Required parameters"),
  })
  .describe("Vector column addition result");

/**
 * Output schema for pg_vector_insert
 */
export const VectorInsertOutputSchema = z
  .object({
    success: z.boolean().describe("Whether insert succeeded"),
    rowsAffected: z.number().optional().describe("Number of rows affected"),
    mode: z
      .enum(["insert", "update"])
      .optional()
      .describe("Operation mode used"),
    columnsUpdated: z
      .number()
      .optional()
      .describe("Number of columns updated (update mode)"),
    error: z.string().optional().describe("Error message"),
    expectedDimensions: z.number().optional().describe("Expected dimensions"),
    providedDimensions: z.number().optional().describe("Provided dimensions"),
    suggestion: z.string().optional().describe("Helpful suggestion"),
    requiredParams: z
      .array(z.string())
      .optional()
      .describe("Required parameters"),
    rawError: z.string().optional().describe("Raw database error"),
    example: z.string().optional().describe("Example usage"),
  })
  .describe("Vector insert/update result");

/**
 * Output schema for pg_vector_search
 */
export const VectorSearchOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether search succeeded"),
    results: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Search results with distance"),
    count: z.number().optional().describe("Number of results"),
    metric: z.string().optional().describe("Distance metric used"),
    hint: z.string().optional().describe("Helpful hint"),
    note: z.string().optional().describe("Additional note"),
    error: z.string().optional().describe("Error message"),
    expectedDimensions: z.number().optional().describe("Expected dimensions"),
    providedDimensions: z.number().optional().describe("Provided dimensions"),
    suggestion: z.string().optional().describe("Helpful suggestion"),
    requiredParams: z
      .array(z.string())
      .optional()
      .describe("Required parameters"),
  })
  .describe("Vector search result");

/**
 * Output schema for pg_vector_create_index
 */
export const VectorCreateIndexOutputSchema = z
  .object({
    success: z.boolean().describe("Whether index creation succeeded"),
    index: z.string().optional().describe("Index name"),
    type: z.string().optional().describe("Index type (ivfflat/hnsw)"),
    metric: z.string().optional().describe("Distance metric"),
    table: z.string().optional().describe("Table name"),
    column: z.string().optional().describe("Column name"),
    appliedParams: z
      .record(z.string(), z.number())
      .optional()
      .describe("Applied index parameters"),
    ifNotExists: z.boolean().optional().describe("If NOT EXISTS was used"),
    alreadyExists: z.boolean().optional().describe("Index already existed"),
    message: z.string().optional().describe("Status message"),
    error: z.string().optional().describe("Error message"),
    requiredParams: z
      .array(z.string())
      .optional()
      .describe("Required parameters"),
  })
  .describe("Vector index creation result");

/**
 * Output schema for pg_vector_distance
 */
export const VectorDistanceOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether calculation succeeded"),
    distance: z.number().nullable().optional().describe("Calculated distance"),
    metric: z.string().optional().describe("Distance metric used"),
    error: z.string().optional().describe("Error message"),
    suggestion: z.string().optional().describe("Helpful suggestion"),
  })
  .describe("Vector distance calculation result");

/**
 * Output schema for pg_vector_normalize
 */
export const VectorNormalizeOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether normalization succeeded"),
    normalized: z
      .array(z.number())
      .optional()
      .describe("Normalized vector (unit length)"),
    magnitude: z.number().optional().describe("Original vector magnitude"),
    error: z.string().optional().describe("Error message"),
    suggestion: z.string().optional().describe("Helpful suggestion"),
  })
  .describe("Vector normalization result");

/**
 * Output schema for pg_vector_aggregate
 */
export const VectorAggregateOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether aggregation succeeded"),
    table: z.string().optional().describe("Table name"),
    column: z.string().optional().describe("Column name"),
    count: z.number().optional().describe("Number of vectors aggregated"),
    average_vector: z
      .object({
        preview: z.array(z.number()).nullable().describe("Vector preview"),
        dimensions: z.number().describe("Vector dimensions"),
        truncated: z.boolean().describe("Whether vector is truncated"),
      })
      .optional()
      .describe("Average vector"),
    groups: z
      .array(
        z.object({
          group_key: z.unknown().describe("Group key value"),
          count: z.number().describe("Count in group"),
          average_vector: z.object({
            preview: z.array(z.number()).nullable().describe("Vector preview"),
            dimensions: z.number().describe("Vector dimensions"),
            truncated: z.boolean().describe("Whether vector is truncated"),
          }),
        }),
      )
      .optional()
      .describe("Grouped aggregation results"),
    note: z.string().optional().describe("Additional note"),
    error: z.string().optional().describe("Error message"),
    requiredParams: z
      .array(z.string())
      .optional()
      .describe("Required parameters"),
  })
  .describe("Vector aggregation result");

/**
 * Output schema for pg_vector_cluster
 */
export const VectorClusterOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether clustering succeeded"),
    k: z.number().optional().describe("Number of clusters"),
    iterations: z.number().optional().describe("Maximum iterations"),
    sampleSize: z.number().optional().describe("Sample size used"),
    centroids: z
      .array(
        z.object({
          vector: z.array(z.number()).optional().describe("Full centroid"),
          preview: z.array(z.number()).optional().describe("Centroid preview"),
          dimensions: z.number().optional().describe("Dimensions"),
          truncated: z.boolean().optional().describe("Truncated flag"),
        }),
      )
      .optional()
      .describe("Cluster centroids"),
    note: z.string().optional().describe("Additional note"),
    error: z.string().optional().describe("Error message"),
    availableDataPoints: z
      .number()
      .optional()
      .describe("Available data points"),
    suggestion: z.string().optional().describe("Helpful suggestion"),
  })
  .describe("Vector clustering result");

/**
 * Output schema for pg_vector_index_optimize
 */
export const VectorIndexOptimizeOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether analysis succeeded"),
    table: z.string().optional().describe("Table name"),
    column: z.string().optional().describe("Column name"),
    dimensions: z.number().nullable().optional().describe("Vector dimensions"),
    estimatedRows: z.number().optional().describe("Estimated row count"),
    tableSize: z.string().optional().describe("Table size"),
    existingIndexes: z
      .array(
        z.object({
          indexname: z.string().describe("Index name"),
          indexdef: z.string().describe("Index definition"),
        }),
      )
      .optional()
      .describe("Existing vector indexes"),
    recommendations: z
      .array(
        z.object({
          type: z.string().describe("Index type recommendation"),
          lists: z.number().optional().describe("IVFFlat lists parameter"),
          m: z.number().optional().describe("HNSW m parameter"),
          efConstruction: z
            .number()
            .optional()
            .describe("HNSW ef_construction"),
          reason: z.string().describe("Recommendation reason"),
        }),
      )
      .optional()
      .describe("Index recommendations"),
    error: z.string().optional().describe("Error message"),
    suggestion: z.string().optional().describe("Helpful suggestion"),
  })
  .describe("Vector index optimization result");

/**
 * Output schema for pg_hybrid_search
 */
export const HybridSearchOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether search succeeded"),
    results: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Hybrid search results"),
    count: z.number().optional().describe("Number of results"),
    vectorWeight: z.number().optional().describe("Vector score weight"),
    textWeight: z.number().optional().describe("Text score weight"),
    error: z.string().optional().describe("Error message"),
    expectedDimensions: z.number().optional().describe("Expected dimensions"),
    providedDimensions: z.number().optional().describe("Provided dimensions"),
    suggestion: z.string().optional().describe("Helpful suggestion"),
    parameterWithIssue: z.string().optional().describe("Parameter with error"),
    columnType: z.string().optional().describe("Actual column type"),
    requiredParams: z
      .array(z.string())
      .optional()
      .describe("Required parameters"),
    details: z.string().optional().describe("Error details"),
  })
  .describe("Hybrid search result");

/**
 * Output schema for pg_vector_performance
 */
export const VectorPerformanceOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether analysis succeeded"),
    table: z.string().optional().describe("Table name"),
    column: z.string().optional().describe("Column name"),
    tableSize: z.string().optional().describe("Table size"),
    estimatedRows: z.number().optional().describe("Estimated row count"),
    indexes: z
      .array(
        z.object({
          indexname: z.string().describe("Index name"),
          indexdef: z.string().describe("Index definition"),
          index_size: z.string().describe("Index size"),
          idx_scan: z.number().nullable().describe("Index scans"),
          idx_tup_read: z.number().nullable().describe("Tuples read"),
        }),
      )
      .optional()
      .describe("Vector indexes"),
    benchmark: z
      .array(z.record(z.string(), z.unknown()))
      .nullable()
      .optional()
      .describe("EXPLAIN ANALYZE output"),
    recommendations: z
      .array(z.string())
      .optional()
      .describe("Performance recommendations"),
    testVectorSource: z.string().optional().describe("Test vector source"),
    hint: z.string().optional().describe("Helpful hint"),
    error: z.string().optional().describe("Error message"),
    suggestion: z.string().optional().describe("Helpful suggestion"),
    requiredParams: z
      .array(z.string())
      .optional()
      .describe("Required parameters"),
  })
  .describe("Vector performance analysis result");

/**
 * Output schema for pg_vector_dimension_reduce
 */
export const VectorDimensionReduceOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether reduction succeeded"),
    // Direct mode
    originalDimensions: z.number().optional().describe("Original dimensions"),
    targetDimensions: z.number().optional().describe("Target dimensions"),
    reducedVector: z
      .array(z.number())
      .optional()
      .describe("Reduced vector (direct mode)"),
    seed: z.number().optional().describe("Random seed used"),
    note: z.string().optional().describe("Additional note"),
    // Table mode
    table: z.string().optional().describe("Table name"),
    column: z.string().optional().describe("Column name"),
    results: z
      .array(
        z.object({
          id: z.unknown().optional().describe("Row ID"),
          preview: z.array(z.number()).optional().describe("Vector preview"),
          dimensions: z.number().optional().describe("Dimensions"),
          truncated: z.boolean().optional().describe("Truncated flag"),
        }),
      )
      .optional()
      .describe("Reduced vectors (table mode)"),
    rowsProcessed: z.number().optional().describe("Rows processed"),
    // Errors
    error: z.string().optional().describe("Error message"),
    suggestion: z.string().optional().describe("Helpful suggestion"),
  })
  .describe("Vector dimension reduction result");

/**
 * Output schema for pg_vector_embed
 */
export const VectorEmbedOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether embedding succeeded"),
    text: z.string().optional().describe("Input text"),
    dimensions: z.number().optional().describe("Embedding dimensions"),
    embedding: z
      .object({
        preview: z.array(z.number()).nullable().describe("Embedding preview"),
        dimensions: z.number().describe("Full dimensions"),
        truncated: z.boolean().describe("Whether truncated"),
      })
      .optional()
      .describe("Generated embedding"),
    note: z.string().optional().describe("Production usage note"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Vector embedding result");

/**
 * Output schema for pg_vector_validate
 */
export const VectorValidateOutputSchema = z
  .object({
    valid: z.boolean().describe("Whether validation passed"),
    vectorDimensions: z
      .number()
      .optional()
      .describe("Dimensions of provided vector"),
    columnDimensions: z
      .number()
      .optional()
      .describe("Dimensions expected by column"),
    expectedDimensions: z
      .number()
      .optional()
      .describe("Expected dimensions (from column or param)"),
    error: z.string().optional().describe("Error message"),
    suggestion: z.string().optional().describe("Helpful suggestion"),
  })
  .describe("Vector validation result");