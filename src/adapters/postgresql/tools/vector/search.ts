/**
 * PostgreSQL pgvector - Search & Index Operations
 *
 * Vector similarity search and index creation tools.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly, write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  sanitizeIdentifier,
  sanitizeTableName,
} from "../../../../utils/identifiers.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import { checkTableAndColumn, parseVector, truncateVector } from "./data.js";
import {
  VectorSearchSchemaBase,
  VectorCreateIndexSchemaBase,
  VectorSearchSchema,
  VectorCreateIndexSchema,
  VectorSearchOutputSchema,
  VectorCreateIndexOutputSchema,
} from "../../schemas/index.js";
import { ValidationError } from "../../../../types/errors.js";

export function createVectorSearchTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_vector_search",
    description:
      'Search for similar vectors. Requires: table, column, vector. Use select param to include identifying columns (e.g., select: ["id", "name"]).',
    group: "vector",
    // Use base schema for MCP visibility (Split Schema pattern)
    inputSchema: VectorSearchSchemaBase,
    outputSchema: VectorSearchOutputSchema,
    annotations: readOnly("Vector Search"),
    icons: getToolIcons("vector", readOnly("Vector Search")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Use transformed schema for alias resolution
        const { table, column, vector, metric, limit, select, where, schema } =
          VectorSearchSchema.parse(params);

        // Validate required params with clear errors
        if (table === "") {
          throw new ValidationError("table (or tableName) parameter is required");
        }
        if (column === "") {
          throw new ValidationError("column (or col) parameter is required for the vector column name");
        }
        if (!vector || !Array.isArray(vector)) {
          throw new ValidationError("vector parameter is required and must be an array of numbers");
        }

        const tableName = sanitizeTableName(table, schema);
        const columnName = sanitizeIdentifier(column);
        const schemaName = schema ?? "public";

        // Two-step existence check: table first, then column
        const existenceCheck = await checkTableAndColumn(
          adapter,
          table,
          column,
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
          table,
          column,
        ]);
        const udtName = typeResult.rows?.[0]?.["udt_name"] as
          | string
          | undefined;
        if (udtName !== "vector") {
          return {
            success: false,
            error: `Column '${column}' is not a vector column (type: ${udtName ?? "unknown"})`,
            code: "INVALID_COLUMN_TYPE",
            category: "validation",
            suggestion:
              "Use a column with vector type, or use pg_vector_add_column to create one",
          };
        }
        const vectorStr = `[${vector.join(",")}]`;
        const limitVal = limit ?? 10;
        const selectCols =
          select !== undefined && select.length > 0
            ? select.map((c) => sanitizeIdentifier(c)).join(", ") + ", "
            : "";
        const whereClause = where ? ` AND ${sanitizeWhereClause(where)}` : "";
        const { excludeNull } = VectorSearchSchema.parse(params);
        const nullFilter =
          excludeNull === true ? ` AND ${columnName} IS NOT NULL` : "";

        let distanceExpr: string;
        switch (metric) {
          case "cosine":
            distanceExpr = `${columnName} <=> '${vectorStr}'`;
            break;
          case "inner_product":
            distanceExpr = `${columnName} <#>'${vectorStr}'`;
            break;
          default: // l2
            distanceExpr = `${columnName} <-> '${vectorStr}'`;
        }

        const sql = `SELECT ${selectCols}${distanceExpr} as distance
                        FROM ${tableName}
                        WHERE TRUE${nullFilter}${whereClause}
                        ORDER BY ${distanceExpr}
                        LIMIT ${String(limitVal)} `;

        try {
          const result = await adapter.executeQuery(sql);

          // Check for NULL distance values (from NULL vectors)
          const nullCount = (result.rows ?? []).filter(
            (r: Record<string, unknown>) => r["distance"] === null,
          ).length;

          // Truncate vector columns to prevent giant MCP payloads
          const finalRows = (result.rows ?? []).map((row) => {
            const newRow = { ...row };
            for (const [k, v] of Object.entries(newRow)) {
              if (typeof v === "string" && v.startsWith("[") && v.endsWith("]")) {
                const vec = parseVector(v);
                if (vec) {
                  newRow[k] = truncateVector(vec);
                }
              }
            }
            return newRow;
          });

          const response: Record<string, unknown> = {
            results: finalRows,
            count: finalRows.length,
            metric: metric ?? "l2",
          };

          // Add hint when no select columns specified
          if (select === undefined || select.length === 0) {
            response["hint"] =
              'Results only contain distance. Use select param (e.g., select: ["id", "name"]) to include identifying columns.';
          }

          // Note about NULL vectors
          if (nullCount > 0) {
            response["note"] =
              `${String(nullCount)} result(s) have NULL distance (rows with NULL vectors). Filter with WHERE ${column} IS NOT NULL.`;
          }

          return response;
        } catch (error: unknown) {
          // Parse dimension mismatch errors for user-friendly message
          if (error instanceof Error) {
            const dimMatch = /different vector dimensions (\d+) and (\d+)/.exec(
              error.message,
            );
            if (dimMatch) {
              const dim1 = parseInt(dimMatch[1] ?? "0", 10);
              const dim2 = parseInt(dimMatch[2] ?? "0", 10);
              const providedDim = vector.length;
              const expectedDim = dim1 === providedDim ? dim2 : dim1;
              return {
                success: false,
                error: `Vector dimension mismatch: column '${column}' expects ${String(expectedDim)} dimensions, but you provided ${String(providedDim)} dimensions.`,
                code: "DIMENSION_MISMATCH",
                category: "query",
                expectedDimensions: expectedDim,
                providedDimensions: providedDim,
                suggestion:
                  "Ensure your query vector has the same dimensions as the column.",
              };
            }
          }
          throw error;
        }
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_vector_search" });
      }
    },
  };
}

export function createVectorCreateIndexTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_vector_create_index",
    description:
      "Create vector index. Requires: table, column, type (ivfflat or hnsw).",
    group: "vector",
    // Use base schema for MCP visibility (Split Schema pattern)
    inputSchema: VectorCreateIndexSchemaBase,
    outputSchema: VectorCreateIndexOutputSchema,
    annotations: write("Create Vector Index"),
    icons: getToolIcons("vector", write("Create Vector Index")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Use transformed schema for alias resolution
        const {
          table,
          column,
          type,
          metric,
          ifNotExists,
          lists,
          m,
          efConstruction,
          schema,
        } = VectorCreateIndexSchema.parse(params);

        // Validate required params with clear errors
        if (table === "") {
          throw new ValidationError("table (or tableName) parameter is required");
        }
        if (column === "") {
          throw new ValidationError("column (or col) parameter is required for the vector column name");
        }
        // Refine guarantees type is defined, but TypeScript can't narrow through .refine()
        if (type === undefined) {
          throw new ValidationError("type (or method alias) is required");
        }

        // P154: Verify table and column exist before attempting index creation
        const existenceError = await checkTableAndColumn(
          adapter,
          table,
          column,
          schema ?? "public",
        );
        if (existenceError !== null) {
          return { success: false, ...existenceError };
        }

        const tableName = sanitizeTableName(table, schema);
        const columnName = sanitizeIdentifier(column);

        // Include metric in index name to allow multiple indexes with different metrics
        const metricSuffix = metric !== "l2" ? `_${metric}` : "";
        const indexNameRaw = `idx_${table}_${column}_${type}${metricSuffix}`;
        const indexName = sanitizeIdentifier(indexNameRaw);

        // Map metric to PostgreSQL operator class
        const opsMap: Record<string, string> = {
          l2: "vector_l2_ops",
          cosine: "vector_cosine_ops",
          inner_product: "vector_ip_ops",
        };
        const opsClass = opsMap[metric] ?? "vector_l2_ops";

        // If ifNotExists is true, check if index already exists BEFORE creating
        if (ifNotExists === true) {
          const checkSql = `
                    SELECT 1 FROM pg_indexes
                    WHERE indexname = $1
                `;
          const checkResult = await adapter.executeQuery(checkSql, [
            indexNameRaw,
          ]);
          if (checkResult.rows && checkResult.rows.length > 0) {
            return {
              success: true,
              index: indexNameRaw,
              type,
              metric,
              table,
              column,
              ifNotExists: true,
              alreadyExists: true,
              message: `Index ${indexNameRaw} already exists`,
            };
          }
        }

        let withClause: string;
        let appliedParams: Record<string, number>;
        if (type === "ivfflat") {
          const numLists = lists ?? 100;
          withClause = `WITH(lists = ${String(numLists)})`;
          appliedParams = { lists: numLists };
        } else {
          // hnsw
          const mVal = m ?? 16;
          const efVal = efConstruction ?? 64;
          withClause = `WITH(m = ${String(mVal)}, ef_construction = ${String(efVal)})`;
          appliedParams = { m: mVal, efConstruction: efVal };
        }

        const sql = `CREATE INDEX ${indexName} ON ${tableName} USING ${type} (${columnName} ${opsClass}) ${withClause} `;

        try {
          await adapter.executeQuery(sql);
          return {
            success: true,
            index: indexNameRaw,
            type,
            metric,
            table,
            column,
            appliedParams,
            ifNotExists: ifNotExists ?? false,
          };
        } catch (error: unknown) {
          if (error instanceof Error) {
            // If ifNotExists is true and the error is "already exists", return success with alreadyExists flag
            // (This handles race conditions where index is created between check and create)
            if (ifNotExists === true) {
              const msg = error.message.toLowerCase();
              if (msg.includes("already exists") || msg.includes("duplicate")) {
                return {
                  success: true,
                  index: indexNameRaw,
                  type,
                  table,
                  column,
                  ifNotExists: true,
                  alreadyExists: true,
                  message: `Index ${indexNameRaw} already exists`,
                };
              }
            }
            // Handle non-vector column errors (operator class does not accept data type)
            const opClassMatch = /does not accept data type (\w+)/.exec(
              error.message,
            );
            if (opClassMatch) {
              return {
                success: false,
                error: `Column '${column}' is not a vector column (type: ${opClassMatch[1] ?? "unknown"}). Vector indexes can only be created on vector columns.`,
                code: "INVALID_COLUMN_TYPE",
                category: "validation",
                suggestion:
                  "Use a column with vector type, or use pg_vector_add_column to create one",
              };
            }
          }
          // Re-throw other errors
          throw error;
        }
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_vector_create_index" });
      }
    },
  };
}
