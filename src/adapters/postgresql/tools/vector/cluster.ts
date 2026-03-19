/**
 * PostgreSQL pgvector - Cluster Analysis
 *
 * K-means clustering on vector columns.
 * 1 tool total.
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
  sanitizeTableName,
} from "../../../../utils/identifiers.js";
import { checkTableAndColumn, truncateVector } from "./data.js";
import { VectorClusterOutputSchema } from "../../schemas/index.js";

/**
 * Parse a PostgreSQL vector string to a number array.
 */
function parseVector(vecStr: unknown): number[] | null {
  if (typeof vecStr !== "string") return null;
  try {
    const cleaned = vecStr.replace(/[[\]()]/g, "");
    return cleaned.split(",").map(Number);
  } catch {
    return null;
  }
}

export function createVectorClusterTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  // Schema with parameter smoothing
  const ClusterSchemaBase = z.object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Alias for table"),
    column: z.string().optional().describe("Vector column"),
    col: z.string().optional().describe("Alias for column"),
    k: z.coerce.number().optional().describe("Number of clusters"),
    clusters: z.coerce.number().optional().describe("Alias for k (number of clusters)"),
    iterations: z.coerce.number().optional().describe("Max iterations (default: 10)"),
    sampleSize: z.coerce.number().optional().describe("Sample size for large tables"),
    schema: z.string().optional().describe("Database schema (default: public)"),
  });

  const ClusterSchema = ClusterSchemaBase.transform((data) => {
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

  return {
    name: "pg_vector_cluster",
    description:
      "Perform K-means clustering on vectors. Returns cluster centroids only (not row assignments). To assign rows to clusters, compare row vectors to centroids using pg_vector_distance.",
    group: "vector",
    inputSchema: ClusterSchemaBase,
    outputSchema: VectorClusterOutputSchema,
    annotations: readOnly("Vector Cluster"),
    icons: getToolIcons("vector", readOnly("Vector Cluster")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = ClusterSchema.parse(params);
        // Refine guarantees k is defined, but add explicit check for TypeScript
        const k = parsed.k;
        if (k === undefined) {
          throw new Error("k (or clusters alias) is required");
        }
        if (isNaN(k)) {
          return {
            success: false,
            error: `Validation error: k must be a valid number, received "${String(parsed.k)}"`,
            suggestion: "Provide a numeric value for k (e.g., 3, 5, 10)",
          };
        }
        if (k < 1) {
          return {
            success: false,
            error: "k must be at least 1 (number of clusters)",
            suggestion: "Provide k >= 1, typically between 2 and 20",
          };
        }
        const maxIter = parsed.iterations ?? 10;
        const sample = parsed.sampleSize ?? 10000;
        const schemaName = parsed.schema ?? "public";
        const tableName = sanitizeTableName(parsed.table, parsed.schema);
        const columnName = sanitizeIdentifier(parsed.column);

        // Two-step existence check: table first, then column
        const existenceCheck = await checkTableAndColumn(
          adapter,
          parsed.table,
          parsed.column,
          schemaName,
        );
        if (existenceCheck) {
          return { success: false, ...existenceCheck };
        }

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
            suggestion: "Use a column with vector type for clustering",
          };
        }

        const sampleSql = `
                SELECT ${columnName} as vec
                FROM ${tableName}
                WHERE ${columnName} IS NOT NULL
                ORDER BY RANDOM()
                LIMIT ${String(sample)}
            `;
        const sampleResult = await adapter.executeQuery(sampleSql);
        const vectors = (sampleResult.rows ?? []) as { vec: string }[];

        if (vectors.length < k) {
          return {
            success: false,
            error: `Cannot create ${String(k)} clusters with only ${String(vectors.length)} data points. Reduce k to at most ${String(vectors.length)} or increase sampleSize.`,
            k: k,
            availableDataPoints: vectors.length,
            sampleSize: sample,
          };
        }

        const initialCentroids = vectors.slice(0, k).map((v) => v.vec);

        const clusterSql = `
                WITH sample_vectors AS (
                    SELECT ROW_NUMBER() OVER () as id, ${columnName} as vec
                    FROM ${tableName}
                    WHERE ${columnName} IS NOT NULL
                    LIMIT ${String(sample)}
                ),
                centroids AS (
                    SELECT unnest($1::vector[]) as centroid
                )
                SELECT
                    c.centroid,
                    COUNT(*) as cluster_size,
                    AVG(s.vec) as new_centroid
                FROM sample_vectors s
                CROSS JOIN LATERAL (
                    SELECT centroid, ROW_NUMBER() OVER (ORDER BY s.vec <-> centroid) as rn
                    FROM centroids
                ) c
                WHERE c.rn = 1
                GROUP BY c.centroid
            `;

        let centroids = initialCentroids;
        for (let i = 0; i < maxIter; i++) {
          try {
            const result = await adapter.executeQuery(clusterSql, [centroids]);
            centroids = (result.rows ?? []).map(
              (r: Record<string, unknown>) => r["new_centroid"] as string,
            );
          } catch {
            break;
          }
        }

        // Truncate large centroids for display (like pg_vector_aggregate does)
        const parsedCentroids = centroids.map((c) => {
          const parsed = parseVector(c);
          if (parsed === null) {
            return { vector: c };
          }
          // For large vectors, use preview format (first 10 dimensions)
          if (parsed.length > 10) {
            const truncated = truncateVector(parsed, 10);
            return {
              preview: truncated.preview,
              dimensions: truncated.dimensions,
              truncated: truncated.truncated,
            };
          }
          return { vector: parsed };
        });

        return {
          k: k,
          iterations: maxIter,
          sampleSize: vectors.length,
          centroids: parsedCentroids,
          note: "For production clustering, consider using specialized libraries",
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_vector_cluster" });
      }
    },
  };
}
