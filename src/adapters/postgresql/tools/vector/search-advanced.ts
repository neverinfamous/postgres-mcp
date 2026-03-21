/**
 * PostgreSQL pgvector - Search & Analysis
 *
 * High-level search and analysis: hybridSearch, performance.
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
import { checkTableAndColumn } from "./data.js";
import {
  HybridSearchOutputSchema,
  VectorPerformanceOutputSchema,
} from "../../schemas/index.js";
import { coerceNumber } from "../../../../utils/query-helpers.js";

export function createHybridSearchTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  // Schema with parameter smoothing
  const HybridSearchSchemaBase = z.object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Alias for table"),
    vectorColumn: z.string().optional().describe("Vector column"),
    vectorCol: z.string().optional().describe("Alias for vectorColumn"),
    textColumn: z.string().describe("Text column for FTS"),
    vector: z.array(z.number()).describe("Query vector"),
    textQuery: z.string().describe("Text search query"),
    vectorWeight: z.preprocess(coerceNumber, z.number().optional())
      .describe("Weight for vector score (0-1, default: 0.5)"),
    limit: z.preprocess(coerceNumber, z.number().optional()).describe("Max results"),
    select: z
      .array(z.string())
      .optional()
      .describe("Columns to return (defaults to non-vector columns)"),
  });

  const HybridSearchSchema = HybridSearchSchemaBase.transform((data) => ({
    table: data.table ?? data.tableName ?? "",
    vectorColumn: data.vectorColumn ?? data.vectorCol ?? "",
    textColumn: data.textColumn,
    vector: data.vector,
    textQuery: data.textQuery,
    vectorWeight: data.vectorWeight,
    limit: data.limit,
    select: data.select,
  }));

  return {
    name: "pg_hybrid_search",
    description:
      "Combined vector similarity and full-text search with weighted scoring.",
    group: "vector",
    inputSchema: HybridSearchSchemaBase,
    outputSchema: HybridSearchOutputSchema,
    annotations: readOnly("Hybrid Search"),
    icons: getToolIcons("vector", readOnly("Hybrid Search")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = HybridSearchSchema.parse(params);

        // Validate required parameters before using them
        if (parsed.table === "") {
          return {
            success: false,
            error: "table (or tableName) parameter is required",
            requiredParams: [
              "table",
              "vectorColumn",
              "textColumn",
              "vector",
              "textQuery",
            ],
          };
        }
        if (parsed.vectorColumn === "") {
          return {
            success: false,
            error: "vectorColumn (or vectorCol) parameter is required",
            requiredParams: [
              "table",
              "vectorColumn",
              "textColumn",
              "vector",
              "textQuery",
            ],
          };
        }

        // Parse schema.table format (embedded schema takes priority)
        let resolvedTable = parsed.table;
        let resolvedSchema: string | undefined;
        if (parsed.table.includes(".")) {
          const parts = parsed.table.split(".");
          resolvedSchema = parts[0];
          resolvedTable = parts[1] ?? parsed.table;
        }
        const schemaName = resolvedSchema ?? "public";
        const tableName = sanitizeTableName(resolvedTable, schemaName);

        // P154: Verify table and vectorColumn exist before querying
        const existenceError = await checkTableAndColumn(
          adapter,
          resolvedTable,
          parsed.vectorColumn,
          schemaName,
        );
        if (existenceError !== null) {
          return { success: false, ...existenceError };
        }

        // Check column type - reject if it's a tsvector
        const colTypeSql = `
                SELECT data_type, udt_name
                FROM information_schema.columns
                WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
            `;
        const colTypeResult = await adapter.executeQuery(colTypeSql, [
          schemaName,
          resolvedTable,
          parsed.vectorColumn,
        ]);
        const colType = colTypeResult.rows?.[0] as
          | { data_type?: string; udt_name?: string }
          | undefined;

        if (
          colType?.udt_name === "tsvector" ||
          colType?.data_type === "tsvector"
        ) {
          return {
            success: false,
            error: `Column '${parsed.vectorColumn}' is tsvector, not vector. For hybrid search, vectorColumn must be a pgvector column (type 'vector'). Use textColumn for text search.`,
            suggestion: `Specify a different vector column, or check your table structure with pg_describe_table`,
          };
        }

        if (colType?.udt_name !== "vector" && colType !== undefined) {
          const actualType = colType.udt_name ?? colType.data_type ?? "unknown";
          return {
            success: false,
            error: `Column '${parsed.vectorColumn}' has type '${actualType}', not 'vector'. Hybrid search requires a pgvector column.`,
            columnType: actualType,
          };
        }

        // Check textColumn type to determine if we need to_tsvector() wrapping
        const textColTypeResult = await adapter.executeQuery(colTypeSql, [
          schemaName,
          resolvedTable,
          parsed.textColumn,
        ]);
        const textColType = textColTypeResult.rows?.[0] as
          | { data_type?: string; udt_name?: string }
          | undefined;
        const isTextColumnTsvector =
          textColType?.udt_name === "tsvector" ||
          textColType?.data_type === "tsvector";

        // Use tsvector column directly, otherwise wrap with to_tsvector()
        const textExpr = isTextColumnTsvector
          ? `"${parsed.textColumn}"`
          : `to_tsvector('english', "${parsed.textColumn}")`;

        const vectorWeight = parsed.vectorWeight ?? 0.5;
        // Fix floating point precision (e.g., 0.30000000000000004 -> 0.3)
        const textWeight = Math.round((1 - vectorWeight) * 1000) / 1000;
        const limitVal = parsed.limit ?? 10;
        const vectorStr = `[${parsed.vector.join(",")}]`;

        // Build select clause - use specified columns, excluding vector column if using t.*
        let selectCols: string;
        if (parsed.select !== undefined && parsed.select.length > 0) {
          // Use only the explicitly selected columns
          selectCols = parsed.select.map((c) => `t."${c}"`).join(", ");
        } else {
          // Get all columns except vector columns to avoid token waste
          const colsSql = `
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = $1 AND table_name = $2
                    AND udt_name != 'vector'
                    ORDER BY ordinal_position
                `;
          const colsResult = await adapter.executeQuery(colsSql, [
            schemaName,
            resolvedTable,
          ]);
          const cols = (colsResult.rows ?? []).map(
            (r: Record<string, unknown>) => r["column_name"] as string,
          );
          selectCols =
            cols.length > 0 ? cols.map((c) => `t."${c}"`).join(", ") : "t.*";
        }

        const sql = `
                WITH vector_scores AS (
                    SELECT
                        ctid,
                        1 - ("${parsed.vectorColumn}" <=> '${vectorStr}'::vector) as vector_score
                    FROM ${tableName}
                    WHERE "${parsed.vectorColumn}" IS NOT NULL
                    ORDER BY "${parsed.vectorColumn}" <=> '${vectorStr}'::vector
                    LIMIT ${String(limitVal * 3)}
                ),
                text_scores AS (
                    SELECT
                        ctid,
                        ts_rank(${textExpr}, plainto_tsquery($1)) as text_score
                    FROM ${tableName}
                    WHERE ${textExpr} @@ plainto_tsquery($1)
                )
                SELECT
                    ${selectCols},
                    COALESCE(v.vector_score, 0) * ${String(vectorWeight)} +
                    COALESCE(ts.text_score, 0) * ${String(textWeight)} as combined_score,
                    COALESCE(v.vector_score, 0) as vector_score,
                    COALESCE(ts.text_score, 0) as text_score
                FROM ${tableName} t
                LEFT JOIN vector_scores v ON t.ctid = v.ctid
                LEFT JOIN text_scores ts ON t.ctid = ts.ctid
                WHERE v.ctid IS NOT NULL OR ts.ctid IS NOT NULL
                ORDER BY combined_score DESC
                LIMIT ${String(limitVal)}
            `;

        try {
          const result = await adapter.executeQuery(sql, [parsed.textQuery]);
          return {
            results: result.rows,
            count: result.rows?.length ?? 0,
            vectorWeight,
            textWeight,
          };
        } catch (error: unknown) {
          if (error instanceof Error) {
            // Parse column not found errors
            const colMatch = /column "([^"]+)" does not exist/.exec(
              error.message,
            );
            if (colMatch) {
              const missingCol = colMatch[1] ?? "";
              // Determine which parameter has the issue
              let paramName = "column";
              if (missingCol === parsed.textColumn) {
                paramName = "textColumn";
              } else if (missingCol === parsed.vectorColumn) {
                paramName = "vectorColumn";
              }
              return {
                success: false,
                error: `Column '${missingCol}' does not exist in table '${resolvedTable}'`,
                parameterWithIssue: paramName,
                suggestion: "Use pg_describe_table to find available columns",
              };
            }

            // Parse dimension mismatch errors
            const dimMatch = /different vector dimensions (\d+) and (\d+)/.exec(
              error.message,
            );
            if (dimMatch) {
              const expectedDim = dimMatch[1] ?? "0";
              const providedDim = dimMatch[2] ?? "0";
              return {
                success: false,
                error: `Vector dimension mismatch: column expects ${expectedDim} dimensions, but you provided ${providedDim} dimensions.`,
                expectedDimensions: parseInt(expectedDim, 10),
                providedDimensions: parseInt(providedDim, 10),
                suggestion:
                  "Ensure your query vector has the same dimensions as the column.",
              };
            }

            // Parse relation not found errors
            const relationMatch = /relation "([^"]+)" does not exist/.exec(
              error.message,
            );
            if (relationMatch) {
              const missingRelation = relationMatch[1] ?? "";
              return {
                success: false,
                error: `Table '${missingRelation}' does not exist in schema '${schemaName}'`,
                suggestion: "Use pg_list_tables to find available tables",
              };
            }

            // Return generic database error as {success: false} instead of throwing
            return {
              success: false,
              error: error.message,
              suggestion: "Check your query parameters and table structure",
            };
          }
          // For non-Error exceptions, return generic error
          return {
            success: false,
            error: "An unexpected error occurred",
            details: String(error),
          };
        }
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_hybrid_search" });
      }
    },
  };
}

export function createVectorPerformanceTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  // Schema with parameter smoothing
  const PerformanceSchemaBase = z.object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Alias for table"),
    column: z.string().optional().describe("Vector column"),
    col: z.string().optional().describe("Alias for column"),
    testVector: z
      .array(z.number())
      .optional()
      .describe("Test vector for benchmarking"),
    schema: z.string().optional().describe("Database schema (default: public)"),
  });

  const PerformanceSchema = PerformanceSchemaBase.transform((data) => ({
    table: data.table ?? data.tableName ?? "",
    column: data.column ?? data.col ?? "",
    testVector: data.testVector,
    schema: data.schema,
  }));

  return {
    name: "pg_vector_performance",
    description:
      "Analyze vector search performance and index effectiveness. Provide testVector for benchmarking (recommended).",
    group: "vector",
    inputSchema: PerformanceSchemaBase,
    outputSchema: VectorPerformanceOutputSchema,
    annotations: readOnly("Vector Performance"),
    icons: getToolIcons("vector", readOnly("Vector Performance")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = PerformanceSchema.parse(params);

        // Validate required params
        if (parsed.table === "") {
          return {
            success: false,
            error: "table (or tableName) parameter is required",
            requiredParams: ["table", "column"],
          };
        }
        if (parsed.column === "") {
          return {
            success: false,
            error:
              "column (or col) parameter is required for the vector column name",
            requiredParams: ["table", "column"],
          };
        }

        const tableName = sanitizeTableName(parsed.table, parsed.schema);
        const columnName = sanitizeIdentifier(parsed.column);
        const schemaName = parsed.schema ?? "public";

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

        const indexSql = `
                SELECT
                    i.indexname,
                    i.indexdef,
                    pg_size_pretty(pg_relation_size((i.schemaname || '.' || i.indexname)::regclass)) as index_size,
                    s.idx_scan,
                    s.idx_tup_read
                FROM pg_indexes i
                LEFT JOIN pg_stat_user_indexes s ON s.indexrelname = i.indexname AND s.schemaname = i.schemaname
                WHERE i.tablename = $1 AND i.schemaname = $2
                AND i.indexdef LIKE '%vector%'
            `;
        const indexResult = await adapter.executeQuery(indexSql, [
          parsed.table,
          schemaName,
        ]);

        const statsSql = `
                SELECT
                    reltuples::bigint as estimated_rows,
                    pg_size_pretty(pg_relation_size('${tableName}'::regclass)) as table_size
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
          estimated_rows?: string | number;
          table_size?: string;
        };

        let benchmark = null;
        let testVectorSource: string | undefined;
        let testVector = parsed.testVector;

        // Auto-generate test vector from first row if not provided
        if (testVector === undefined) {
          try {
            const sampleSql = `SELECT ${columnName}::text as vec FROM ${tableName} WHERE ${columnName} IS NOT NULL LIMIT 1`;
            const sampleResult = await adapter.executeQuery(sampleSql);
            const sampleRow = sampleResult.rows?.[0] as
              | { vec?: string }
              | undefined;
            if (sampleRow?.vec !== undefined) {
              // Parse vector string like "[0.1,0.2,0.3]" to array
              const vecStr = sampleRow.vec.replace(/[[\]]/g, "");
              testVector = vecStr.split(",").map(Number);
              testVectorSource = "auto-generated from first row";
            }
          } catch {
            // Silently ignore - benchmark just won't be available
          }
        } else {
          testVectorSource = "user-provided";
        }

        if (testVector !== undefined && testVector.length > 0) {
          const vectorStr = `[${testVector.join(",")}]`;
          const benchSql = `
                    EXPLAIN ANALYZE
                    SELECT * FROM ${tableName}
                    ORDER BY ${columnName} <-> '${vectorStr}'::vector
                    LIMIT 10
                `;
          const benchResult = await adapter.executeQuery(benchSql);

          // Truncate large vectors in EXPLAIN output to reduce payload size
          // Pattern matches vector literals like '[0.1,0.2,...,0.9]'::vector
          const vectorPattern = /\[[\d.,\s-e]+\]'::vector/g;
          const truncatedRows = (benchResult.rows ?? []).map(
            (row: Record<string, unknown>) => {
              const planLine = row["QUERY PLAN"] as string | undefined;
              if (planLine && planLine.length > 200) {
                // Truncate long vector literals in query plan
                const truncated = planLine.replace(
                  vectorPattern,
                  `[...${String(testVector.length)} dims]'::vector`,
                );
                return { "QUERY PLAN": truncated };
              }
              return row;
            },
          );
          benchmark = truncatedRows;
        }

        // Convert PostgreSQL bigint strings to numbers for output schema compliance
        const estimatedRows = Number(stats.estimated_rows ?? 0);
        // Map indexes to convert bigint stats to numbers (idx_scan, idx_tup_read)
        const indexes = (indexResult.rows ?? []).map(
          (row: Record<string, unknown>) => ({
            ...row,
            idx_scan: row["idx_scan"] != null ? Number(row["idx_scan"]) : null,
            idx_tup_read:
              row["idx_tup_read"] != null ? Number(row["idx_tup_read"]) : null,
          }),
        );

        const response: Record<string, unknown> = {
          table: parsed.table,
          column: parsed.column,
          tableSize: stats.table_size,
          // PostgreSQL returns -1 for tables that haven't been analyzed; normalize to 0
          estimatedRows: estimatedRows < 0 ? 0 : estimatedRows,
          indexes,
          benchmark,
          recommendations:
            (indexResult.rows?.length ?? 0) === 0
              ? [
                  "No vector index found - consider creating one for better performance",
                ]
              : [],
        };

        if (testVectorSource !== undefined) {
          response["testVectorSource"] = testVectorSource;
        }
        if (benchmark === null) {
          response["hint"] =
            "No vectors in table to auto-generate test. Provide testVector param for benchmarking.";
        }

        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_vector_performance" });
      }
    },
  };
}
