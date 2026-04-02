/**
 * PostgreSQL pgvector - Index & Utility Management
 *
 * Management tools: indexOptimize, dimensionReduce, embed.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import {
  ValidationError,
  type ToolDefinition,
  type RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  sanitizeIdentifier,
  sanitizeTableName,
} from "../../../../utils/identifiers.js";
import { checkTableAndColumn, truncateVector } from "./data.js";
import {
  VectorIndexOptimizeOutputSchema,
  VectorDimensionReduceOutputSchema,
  VectorEmbedOutputSchema,
} from "../../schemas/index.js";
import { coerceNumber } from "../../../../utils/query-helpers.js";

export function createVectorIndexOptimizeTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  // Schema with parameter smoothing
  const IndexOptimizeSchemaBase = z.object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Alias for table"),
    column: z.string().optional().describe("Vector column"),
    col: z.string().optional().describe("Alias for column"),
    schema: z.string().optional().describe("Database schema (default: public)"),
  });

  const IndexOptimizeSchema = IndexOptimizeSchemaBase.transform((data) => ({
    table: data.table ?? data.tableName ?? "",
    column: data.column ?? data.col ?? "",
    schema: data.schema,
  }));

  return {
    name: "pg_vector_index_optimize",
    description:
      "Analyze vector column and recommend optimal index parameters for IVFFlat/HNSW.",
    group: "vector",
    inputSchema: IndexOptimizeSchemaBase,
    outputSchema: VectorIndexOptimizeOutputSchema,
    annotations: readOnly("Vector Index Optimize"),
    icons: getToolIcons("vector", readOnly("Vector Index Optimize")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = IndexOptimizeSchema.parse(params ?? {});

        if (parsed.table === "") {
          return {
            success: false,
            error: "table (or tableName) parameter is required",
            code: 'VALIDATION_ERROR',
            category: 'validation',
            requiredParams: ["table", "column"],
          };
        }
        if (parsed.column === "") {
          return {
            success: false,
            error: "column (or col) parameter is required",
            code: 'VALIDATION_ERROR',
            category: 'validation',
            requiredParams: ["table", "column"],
          };
        }

        const tableName = sanitizeTableName(parsed.table, parsed.schema);
        const columnName = sanitizeIdentifier(parsed.column);
        const schemaName = parsed.schema ?? "public";

        // Two-step existence check: table first, then column (must run before stats query)
        const existenceCheck = await checkTableAndColumn(
          adapter,
          parsed.table,
          parsed.column,
          schemaName,
        );
        if (existenceCheck) {
          return { success: false, ...existenceCheck };
        }

        const statsSql = `
                SELECT
                    reltuples::bigint as estimated_rows,
                    pg_size_pretty(pg_total_relation_size('${tableName}'::regclass)) as table_size
                FROM pg_class c
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE c.relname = $1 AND n.nspname = $2
            `;
        const statsResult = await adapter.executeQuery(statsSql, [
          parsed.table,
          schemaName,
        ]);
        // PostgreSQL returns bigint as string, cast as needed
        const stats = (statsResult.rows?.[0] ?? {}) as {
          estimated_rows: string | number;
          table_size: string;
        };

        // Validate column is actually a vector type
        const typeCheckSql = `
        SELECT udt_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
      `;
        const typeResult = await adapter.executeQuery(typeCheckSql, [
          schemaName,
          parsed.table,
          parsed.column,
        ]);
        const udtName = typeResult.rows?.[0]?.["udt_name"] as
          | string
          | undefined;
        if (udtName !== "vector") {
          return {
            success: false,
            error: `Column '${parsed.column}' is not a vector column (type: ${udtName ?? "unknown"})`,
            suggestion: "Use a column with vector type for index optimization",
          };
        }

        const dimSql = `
                SELECT vector_dims(${columnName}) as dimensions
                FROM ${tableName}
                WHERE ${columnName} IS NOT NULL
                LIMIT 1
            `;
        const dimResult = await adapter.executeQuery(dimSql);
        const dimensions = (
          dimResult.rows?.[0] as { dimensions: number } | undefined
        )?.dimensions;

        const indexSql = `
                SELECT i.indexname, i.indexdef
                FROM pg_indexes i
                WHERE i.tablename = $1 AND i.schemaname = $2
                AND i.indexdef LIKE '%vector%'
            `;
        const indexResult = await adapter.executeQuery(indexSql, [
          parsed.table,
          schemaName,
        ]);

        // Convert PostgreSQL bigint string to number for output schema compliance
        const rows = Number(stats.estimated_rows ?? 0);
        const recommendations = [];

        if (rows < 10000) {
          recommendations.push({
            type: "none",
            reason: "Table is small enough for brute force search",
          });
        } else if (rows < 100000) {
          recommendations.push({
            type: "ivfflat",
            lists: Math.min(100, Math.round(Math.sqrt(rows))),
            reason: "IVFFlat recommended for medium tables",
          });
        } else {
          recommendations.push({
            type: "hnsw",
            m: dimensions !== undefined && dimensions > 768 ? 32 : 16,
            efConstruction: 64,
            reason: "HNSW recommended for large tables with high recall",
          });
          recommendations.push({
            type: "ivfflat",
            lists: Math.round(Math.sqrt(rows)),
            reason: "IVFFlat is faster to build but lower recall",
          });
        }

        return {
          table: parsed.table,
          column: parsed.column,
          dimensions,
          estimatedRows: rows,
          tableSize: stats.table_size,
          existingIndexes: indexResult.rows,
          recommendations,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_vector_index_optimize",
          });
      }
    },
  };
}

export function createVectorDimensionReduceTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  // Define base schema that exposes all properties correctly to MCP
  const VectorDimensionReduceSchemaBase = z.object({
    // Direct vector mode
    vector: z
      .array(z.number())
      .optional()
      .describe("Vector to reduce (for direct mode)"),
    // Table-based mode - include aliases for Split Schema compliance
    table: z.string().optional().describe("Table name (for table mode)"),
    tableName: z.string().optional().describe("Alias for table"),
    column: z
      .string()
      .optional()
      .describe("Vector column name (for table mode)"),
    col: z.string().optional().describe("Alias for column"),
    idColumn: z
      .string()
      .optional()
      .describe("ID column to include in results (default: id)"),
    limit: z.preprocess(coerceNumber, z.number().optional()).describe("Max rows to process (default: 100)"),
    // Common parameters - targetDimensions is required
    targetDimensions: z
      .preprocess(coerceNumber, z.number().optional())
      .describe("Target number of dimensions"),
    dimensions: z.preprocess(coerceNumber, z.number().optional()).describe("Alias for targetDimensions"),
    seed: z.preprocess(coerceNumber, z.number().optional()).describe("Random seed for reproducibility"),
    summarize: z
      .boolean()
      .optional()
      .describe(
        "Summarize reduced vectors to preview format in table mode (default: true)",
      ),
  });

  // Schema with alias resolution applied via refinement
  const VectorDimensionReduceSchema = VectorDimensionReduceSchemaBase.transform(
    (data) => {
      // Handle aliases: dimensions -> targetDimensions, tableName -> table, col -> column
      const rawTarget = (data.targetDimensions ?? data.dimensions) as unknown;
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
    },
  ).refine((data) => data.targetDimensions !== undefined, {
    message: "targetDimensions (or dimensions alias) is required",
  });

  // Helper function for dimension reduction
  const reduceVector = (
    vector: number[],
    targetDim: number,
    seed: number,
  ): number[] => {
    const originalDim = vector.length;
    const seededRandom = (s: number): number => {
      const x = Math.sin(s) * 10000;
      return x - Math.floor(x);
    };

    const reduced: number[] = [];
    const scaleFactor = Math.sqrt(originalDim / targetDim);

    for (let i = 0; i < targetDim; i++) {
      let sum = 0;
      for (let j = 0; j < originalDim; j++) {
        const randVal = seededRandom(seed + i * originalDim + j) > 0.5 ? 1 : -1;
        sum += (vector[j] ?? 0) * randVal;
      }
      reduced.push(sum / scaleFactor);
    }
    return reduced;
  };

  return {
    name: "pg_vector_dimension_reduce",
    description:
      "Reduce vector dimensions using random projection. Supports direct vector input OR table-based extraction.",
    group: "vector",
    // Use base schema for MCP so properties are properly exposed in tool schema
    inputSchema: VectorDimensionReduceSchemaBase,
    outputSchema: VectorDimensionReduceOutputSchema,
    annotations: readOnly("Vector Dimension Reduce"),
    icons: getToolIcons("vector", readOnly("Vector Dimension Reduce")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Use transformed schema with alias resolution for validation
        const parsed = VectorDimensionReduceSchema.parse(params);
        // Refine guarantees targetDimensions is defined, but add explicit check for type narrowing
        const targetDim = parsed.targetDimensions;
        if (targetDim === undefined) {
          throw new ValidationError("targetDimensions (or dimensions alias) is required");
        }
        if (isNaN(targetDim) || targetDim <= 0) {
          return {
            success: false,
            error: `Validation error: targetDimensions must be a positive number, received "${String(parsed.targetDimensions)}"`,
            code: 'VALIDATION_ERROR',
            category: 'validation',
            suggestion:
              "Provide a positive numeric value for targetDimensions (e.g., 128, 256)",
          };
        }
        const seed = parsed.seed ?? 42;

        // Direct vector mode
        if (parsed.vector !== undefined) {
          const originalDim = parsed.vector.length;

          if (targetDim >= originalDim) {
            return {
              success: false,
              error: "Target dimensions must be less than original",
              originalDimensions: originalDim,
              targetDimensions: targetDim,
              suggestion: `Reduce from ${String(originalDim)} to a smaller number`,
            };
          }

          return {
            originalDimensions: originalDim,
            targetDimensions: targetDim,
            reduced: reduceVector(parsed.vector, targetDim, seed),
            method: "random_projection",
            note: "For PCA or UMAP, use external libraries",
          };
        }

        // Table-based mode
        if (parsed.table !== undefined && parsed.column !== undefined) {
          // P154: Verify table and column exist before querying
          const existenceError = await checkTableAndColumn(
            adapter,
            parsed.table,
            parsed.column,
            "public",
          );
          if (existenceError !== null) {
            return { success: false, ...existenceError };
          }

          const idCol = parsed.idColumn ?? "id";
          const limitVal = parsed.limit ?? 100;

          // Fetch vectors from table
          const sql = `
                    SELECT "${idCol}" as id, "${parsed.column}"::text as vector_text
                    FROM "${parsed.table}"
                    WHERE "${parsed.column}" IS NOT NULL
                    LIMIT ${String(limitVal)}
                `;
          const result = await adapter.executeQuery(sql);

          if ((result.rows?.length ?? 0) === 0) {
            return {
              success: false,
              error: "No vectors found in table",
              suggestion: "Ensure the table is populated",
            };
          }

          // Determine if we should summarize (default true for table mode)
          const shouldSummarize = parsed.summarize ?? true;

          // Parse and reduce each vector
          const reducedRows: {
            id: unknown;
            original_dimensions: number;
            reduced:
              | number[]
              | {
                  preview: number[] | null;
                  dimensions: number;
                  truncated: boolean;
                };
          }[] = [];
          let originalDim = 0;

          for (const row of result.rows ?? []) {
            const vectorText = row["vector_text"] as string;
            // Parse PostgreSQL vector format: [0.1, 0.2, ...]
            const vectorMatch = /\[([\d.,\s-e]+)\]/.exec(vectorText);
            if (vectorMatch?.[1] === undefined) continue;

            const vector = vectorMatch[1]
              .split(",")
              .map((s) => parseFloat(s.trim()));
            if (originalDim === 0) originalDim = vector.length;

            if (targetDim >= vector.length) continue;

            const reducedVector = reduceVector(vector, targetDim, seed);

            // Apply summarization if requested
            reducedRows.push({
              id: row["id"],
              original_dimensions: vector.length,
              reduced: shouldSummarize
                ? truncateVector(reducedVector)
                : reducedVector,
            });
          }

          const response: Record<string, unknown> = {
            mode: "table",
            table: parsed.table,
            column: parsed.column,
            originalDimensions: originalDim,
            targetDimensions: targetDim,
            processedCount: reducedRows.length,
            rows: reducedRows,
            method: "random_projection",
            note: "For PCA or UMAP, use external libraries",
          };

          // Add summarize indicator when summarization was applied
          if (shouldSummarize) {
            response["summarized"] = true;
            response["hint"] =
              "Vectors summarized to preview format. Use summarize: false for full vectors.";
          }

          return response;
        }

        return {
          success: false,
          error:
            "Either vector (for direct mode) or table+column (for table mode) must be provided",
          code: "VALIDATION_ERROR",
          category: "validation",
          suggestion:
            "Provide vector: [...] OR table: '...' and column: '...'",
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_vector_dimension_reduce",
          });
      }
    },
  };
}

export function createVectorEmbedTool(): ToolDefinition {
  // Base schema for MCP visibility — text optional to prevent MCP -32602 rejection
  const EmbedSchemaBase = z.object({
    text: z.string().optional().describe("Text to embed"),
    dimensions: z.preprocess(coerceNumber, z.number().optional()).describe("Vector dimensions (default: 384)"),
    summarize: z
      .boolean()
      .optional()
      .describe("Truncate embedding for display (default: true)"),
  });

  return {
    name: "pg_vector_embed",
    description:
      "Generate text embeddings. Returns a simple hash-based embedding for demos (use external APIs for production).",
    group: "vector",
    inputSchema: EmbedSchemaBase,
    outputSchema: VectorEmbedOutputSchema,
    annotations: readOnly("Vector Embed"),
    icons: getToolIcons("vector", readOnly("Vector Embed")),
    handler: (params: unknown, _context: RequestContext) => {
      try {
        const parsed = EmbedSchemaBase.parse(params ?? {});

        // Validate required text parameter
        if (!parsed.text || parsed.text === "") {
          return Promise.resolve({
            success: false,
            error:
              "Validation error: text parameter is required and must be non-empty",
            code: 'VALIDATION_ERROR',
            category: 'validation',
            suggestion: "Provide text content to generate an embedding",
          });
        }

        const dims =
          parsed.dimensions ?? 384;

        if (isNaN(dims) || dims <= 0) {
          return Promise.resolve({
            success: false,
            error: `Validation error: dimensions must be a positive number, received "${String(parsed.dimensions)}"`,
            code: 'VALIDATION_ERROR',
            category: 'validation',
            suggestion:
              "Provide a positive numeric value for dimensions (e.g., 384, 768, 1536)",
          });
        }
        const shouldSummarize = parsed.summarize ?? true;

        const vector: number[] = [];

        for (let i = 0; i < dims; i++) {
          let hash = 0;
          for (let j = 0; j < parsed.text.length; j++) {
            hash = ((hash << 5) - hash + parsed.text.charCodeAt(j) + i) | 0;
          }
          vector.push(Math.sin(hash) * 0.5);
        }

        const magnitude = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
        const normalized = vector.map((x) => x / magnitude);

        // Always return object format for output schema compliance
        // When summarized: use truncateVector helper
        // When not summarized: wrap full vector in object format with truncated: false
        const embeddingOutput = shouldSummarize
          ? truncateVector(normalized)
          : {
              preview: normalized,
              dimensions: dims,
              truncated: false,
            };

        return Promise.resolve({
          embedding: embeddingOutput,
          dimensions: dims,
          textLength: parsed.text.length,
          warning:
            "This is a demo embedding using hash functions. For production, use OpenAI, Cohere, or other embedding APIs.",
        });
      } catch (error: unknown) {
        return Promise.resolve(formatHandlerErrorResponse(error, { tool: "pg_vector_embed" }));
      }
    },
  };
}
