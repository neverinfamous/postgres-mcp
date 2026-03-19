/**
 * PostgreSQL pgvector - Vector Math Operations
 *
 * Distance calculation and vector normalization tools.
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
  VectorDistanceOutputSchema,
  VectorNormalizeOutputSchema,
} from "../../schemas/index.js";

export function createVectorDistanceTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  // Base schema for MCP visibility — arrays optional to prevent MCP -32602 rejection
  const DistanceSchemaBase = z.object({
    vector1: z.array(z.number()).optional(),
    vector2: z.array(z.number()).optional(),
    metric: z.enum(["l2", "cosine", "inner_product"]).optional(),
  });

  return {
    name: "pg_vector_distance",
    description:
      "Calculate distance between two vectors. Valid metrics: l2 (default), cosine, inner_product.",
    group: "vector",
    inputSchema: DistanceSchemaBase,
    outputSchema: VectorDistanceOutputSchema,
    annotations: readOnly("Vector Distance"),
    icons: getToolIcons("vector", readOnly("Vector Distance")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = DistanceSchemaBase.parse(params ?? {});

        // Validate required params
        if (!parsed.vector1 || !parsed.vector2) {
          return {
            success: false,
            error: "Validation error: vector1 and vector2 are required",
            suggestion:
              "Provide two vectors to calculate distance between them",
          };
        }

        // Validate dimension match before query
        if (parsed.vector1.length !== parsed.vector2.length) {
          return {
            success: false,
            error: `Vector dimensions must match: vector1 has ${String(parsed.vector1.length)} dimensions, vector2 has ${String(parsed.vector2.length)} dimensions`,
            suggestion:
              "Ensure both vectors have the same number of dimensions",
          };
        }

        const v1 = `[${parsed.vector1.join(",")}]`;
        const v2 = `[${parsed.vector2.join(",")}]`;
        const metric = parsed.metric ?? "l2";

        let op: string;
        switch (metric) {
          case "cosine":
            op = "<=>";
            break;
          case "inner_product":
            op = "<#>";
            break;
          default:
            op = "<->"; // l2
        }

        const sql = `SELECT '${v1}'::vector ${op} '${v2}':: vector as distance`;
        const result = await adapter.executeQuery(sql);
        return { distance: result.rows?.[0]?.["distance"], metric };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_vector_distance" });
      }
    },
  };
}

export function createVectorNormalizeTool(): ToolDefinition {
  // Base schema for MCP visibility — array optional to prevent MCP -32602 rejection
  const NormalizeSchemaBase = z.object({
    vector: z
      .array(z.number())
      .optional()
      .describe("Vector to normalize to unit length"),
  });

  return {
    name: "pg_vector_normalize",
    description: "Normalize a vector to unit length.",
    group: "vector",
    inputSchema: NormalizeSchemaBase,
    outputSchema: VectorNormalizeOutputSchema,
    annotations: readOnly("Normalize Vector"),
    icons: getToolIcons("vector", readOnly("Normalize Vector")),
    handler: (params: unknown, _context: RequestContext) => {
      try {
        const parsed = NormalizeSchemaBase.parse(params ?? {});

        // Validate required param
        if (!parsed.vector) {
          return Promise.resolve({
            success: false,
            error: "Validation error: vector is required",
            suggestion: "Provide a vector array to normalize, e.g., [3, 4]",
          });
        }

        const magnitude = Math.sqrt(
          parsed.vector.reduce((sum, x) => sum + x * x, 0),
        );

        // Check for zero vector
        if (magnitude === 0) {
          return Promise.resolve({
            success: false,
            error: "Cannot normalize a zero vector (all values are 0)",
            suggestion: "Provide a vector with at least one non-zero value",
            magnitude: 0,
          });
        }

        const normalized = parsed.vector.map((x) => x / magnitude);

        return Promise.resolve({ normalized, magnitude });
      } catch (error: unknown) {
        return Promise.resolve(formatHandlerErrorResponse(error, { tool: "pg_vector_normalize" }));
      }
    },
  };
}
