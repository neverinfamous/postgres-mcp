/**
 * PostgreSQL pgvector - Aggregate & Validate Operations
 *
 * Vector aggregation and dimension validation tools.
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
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import { parseVector, truncateVector, checkTableAndColumn } from "./data.js";
import {
  VectorAggregateOutputSchema,
  VectorValidateOutputSchema,
} from "../../schemas/index.js";

export function createVectorAggregateTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  // Base schema exposes all properties to MCP without transform
  const AggregateSchemaBase = z.object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Alias for table"),
    column: z.string().optional().describe("Vector column"),
    col: z.string().optional().describe("Alias for column"),
    where: z.string().optional(),
    groupBy: z.string().optional().describe("Column to group results by"),
    schema: z.string().optional().describe("Database schema (default: public)"),
    excludeNullGroups: z
      .boolean()
      .optional()
      .describe("Filter out groups with NULL average vectors"),
    summarizeVector: z
      .boolean()
      .optional()
      .describe("Truncate large vectors to preview (default: true)"),
  });

  // Transformed schema applies alias resolution
  const AggregateSchema = AggregateSchemaBase.transform((data) => ({
    table: data.table ?? data.tableName ?? "",
    column: data.column ?? data.col ?? "",
    where: data.where,
    groupBy: data.groupBy,
    schema: data.schema,
    excludeNullGroups: data.excludeNullGroups,
    summarizeVector: data.summarizeVector ?? true,
  }));

  return {
    name: "pg_vector_aggregate",
    description:
      "Calculate average vector. Requires: table, column. Optional: groupBy, where.",
    group: "vector",
    inputSchema: AggregateSchemaBase,
    outputSchema: VectorAggregateOutputSchema,
    annotations: readOnly("Vector Aggregate"),
    icons: getToolIcons("vector", readOnly("Vector Aggregate")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = AggregateSchema.parse(params);

        // Validate required params with clear errors
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
            error:
              "column (or col) parameter is required for the vector column name",
            code: 'VALIDATION_ERROR',
            category: 'validation',
            requiredParams: ["table", "column"],
          };
        }

        // Parse schema.table format (embedded schema takes priority over explicit schema param)
        let resolvedTable = parsed.table;
        let resolvedSchema = parsed.schema;
        if (parsed.table.includes(".")) {
          const parts = parsed.table.split(".");
          resolvedSchema = parts[0] ?? parsed.schema ?? "public";
          resolvedTable = parts[1] ?? parsed.table;
        }
        const schemaName = resolvedSchema ?? "public";

        // Two-step existence check: table first, then column
        const existenceCheck = await checkTableAndColumn(
          adapter,
          resolvedTable,
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
          resolvedTable,
          parsed.column,
        ]);
        const udtName = typeResult.rows?.[0]?.["udt_name"] as
          | string
          | undefined;
        if (udtName !== "vector") {
          return {
            success: false,
            error: `Column '${parsed.column}' is not a vector column (type: ${udtName ?? "unknown"})`,
            suggestion:
              "Use a column with vector type, or use pg_vector_add_column to create one",
          };
        }

        const whereClause =
          parsed.where !== undefined
            ? ` WHERE ${sanitizeWhereClause(parsed.where)} `
            : "";

        const tableName = sanitizeTableName(resolvedTable, resolvedSchema);
        const columnName = sanitizeIdentifier(parsed.column);

        // Handle groupBy mode
        if (parsed.groupBy !== undefined) {
          // Validate groupBy is a simple column name, not an expression
          let groupByCol: string;
          try {
            groupByCol = sanitizeIdentifier(parsed.groupBy);
          } catch {
            return {
              success: false,
              error: `Invalid groupBy value: '${parsed.groupBy}' is not a valid column name`,
              suggestion:
                "groupBy only supports simple column names (not expressions like LOWER(column)). Use a direct column reference.",
            };
          }
          const sql = `SELECT ${groupByCol} as group_key, avg(${columnName})::text as average_vector, count(*):: integer as count
                            FROM ${tableName}${whereClause}
                            GROUP BY ${groupByCol}
                            ORDER BY ${groupByCol} `;

          const result = await adapter.executeQuery(sql);
          let groups =
            result.rows?.map((row: Record<string, unknown>) => {
              const vec = parseVector(row["average_vector"]);
              return {
                group_key: row["group_key"],
                average_vector:
                  parsed.summarizeVector && vec !== null
                    ? truncateVector(vec)
                    : (vec ?? row["average_vector"]),
                count:
                  typeof row["count"] === "string"
                    ? parseInt(row["count"], 10)
                    : (row["count"] ?? 0),
              };
            }) ?? [];

          // Check for groups with NULL average vector
          const nullGroups = groups.filter(
            (g) =>
              g.average_vector === null ||
              (typeof g.average_vector === "object" &&
                g.average_vector !== null &&
                "preview" in g.average_vector &&
                g.average_vector.preview === null),
          );

          // Filter out null groups if requested
          if (parsed.excludeNullGroups === true) {
            groups = groups.filter(
              (g) =>
                !(
                  g.average_vector === null ||
                  (typeof g.average_vector === "object" &&
                    g.average_vector !== null &&
                    "preview" in g.average_vector &&
                    g.average_vector.preview === null)
                ),
            );
          }

          const response: Record<string, unknown> = {
            success: true,
            groups,
            count: groups.length,
          };

          if (nullGroups.length > 0 && parsed.excludeNullGroups !== true) {
            response["note"] =
              `${String(nullGroups.length)} group(s) have NULL average_vector. Use excludeNullGroups: true to filter them.`;
          }

          return response;
        }

        // Non-grouped overall average
        const sql = `SELECT avg(${columnName})::text as average_vector, count(*):: integer as count
                        FROM ${tableName}${whereClause} `;

        const result = await adapter.executeQuery(sql);
        const row = result.rows?.[0] ?? {};
        // Ensure count is a number (PostgreSQL returns bigint as string)
        const countVal = row["count"];
        const count: number =
          typeof countVal === "string"
            ? parseInt(countVal, 10)
            : typeof countVal === "number"
              ? countVal
              : 0;
        const vec = parseVector(row["average_vector"]);

        const response: Record<string, unknown> = {
          success: true,
          average_vector:
            parsed.summarizeVector && vec !== null
              ? truncateVector(vec)
              : (vec ?? row["average_vector"]),
          count,
        };

        // Add message for empty/null result
        if (vec === null && count === 0) {
          response["note"] =
            "No vectors found to aggregate (table empty or all vectors are NULL)";
        } else if (vec === null) {
          response["note"] = `All ${String(count)} rows have NULL vectors`;
        }

        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_vector_aggregate" });
      }
    },
  };
}

export function createVectorValidateTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  // Base schema exposes all properties to MCP without transform
  const ValidateSchemaBase = z.object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Alias for table"),
    column: z.string().optional().describe("Vector column"),
    col: z.string().optional().describe("Alias for column"),
    vector: z.array(z.number()).optional().describe("Vector to validate"),
    dimensions: z.number().optional().describe("Expected dimensions"),
    schema: z.string().optional().describe("Database schema (default: public)"),
  });

  // Transformed schema applies alias resolution
  const ValidateSchema = ValidateSchemaBase.transform((data) => ({
    table: data.table ?? data.tableName ?? "",
    column: data.column ?? data.col ?? "",
    vector: data.vector,
    dimensions: data.dimensions,
    schema: data.schema,
  }));

  return {
    name: "pg_vector_validate",
    description:
      "Validate vector dimensions against column. Pass any combination of: vector (to check), table+column (for column dimensions), dimensions (expected).",
    group: "vector",
    inputSchema: ValidateSchemaBase,
    outputSchema: VectorValidateOutputSchema,
    annotations: readOnly("Validate Vector"),
    icons: getToolIcons("vector", readOnly("Validate Vector")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = ValidateSchema.parse(params);

        // Validate that at least one meaningful input is provided
        const hasVector = parsed.vector !== undefined;
        const hasTableColumn = parsed.table !== "" && parsed.column !== "";
        const hasDimensions = parsed.dimensions !== undefined;

        if (!hasVector && !hasTableColumn && !hasDimensions) {
          return {
            success: false,
            error:
              "Validation error: at least one of vector, table+column, or dimensions is required",
            code: 'VALIDATION_ERROR',
            category: 'validation',
            suggestion:
              "Provide a vector to validate, or table+column to check column dimensions, or dimensions to compare against",
          };
        }

        // Get column dimensions if table/column specified
        let columnDimensions: number | undefined;
        if (parsed.table !== "" && parsed.column !== "") {
          const schemaName = parsed.schema ?? "public";

          // First check if table and column exist
          const existsSql = `
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
                `;
          const existsResult = await adapter.executeQuery(existsSql, [
            schemaName,
            parsed.table,
            parsed.column,
          ]);
          if ((existsResult.rows?.length ?? 0) === 0) {
            // Check if table exists at all
            const tableCheckSql = `
                        SELECT 1 FROM information_schema.tables
                        WHERE table_schema = $1 AND table_name = $2
                    `;
            const tableCheckResult = await adapter.executeQuery(tableCheckSql, [
              schemaName,
              parsed.table,
            ]);
            if ((tableCheckResult.rows?.length ?? 0) === 0) {
              return {
                success: false,
                error: `Table '${parsed.table}' does not exist in schema '${schemaName}'`,
                code: "TABLE_NOT_FOUND",
                category: "validation",
                suggestion: "Use pg_list_tables to find available tables",
              };
            }
            return {
              success: false,
              error: `Column '${parsed.column}' does not exist in table '${parsed.table}'`,
              code: "COLUMN_NOT_FOUND",
              category: "validation",
              suggestion: "Use pg_describe_table to find available columns",
            };
          }

          // Check column type before calling vector_dims() to avoid raw PG errors
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
              suggestion:
                "Use a column with vector type, or use pg_vector_add_column to create one",
            };
          }

          // Try to get actual dimensions from a sample row
          const sampleSql = `
                    SELECT vector_dims("${parsed.column}") as dimensions
                    FROM "${schemaName}"."${parsed.table}"
                    WHERE "${parsed.column}" IS NOT NULL
                    LIMIT 1
                `;
          try {
            const sampleResult = await adapter.executeQuery(sampleSql);
            const dims = sampleResult.rows?.[0]?.["dimensions"];
            if (dims !== undefined && dims !== null) {
              columnDimensions =
                typeof dims === "string" ? parseInt(dims, 10) : Number(dims);
            }
          } catch {
            // Table might be empty — columnDimensions remains undefined
          }
        }

        const expectedDimensions = parsed.dimensions ?? columnDimensions;
        const vectorDimensions = parsed.vector?.length;

        // Validation results
        const valid =
          vectorDimensions !== undefined && expectedDimensions !== undefined
            ? vectorDimensions === expectedDimensions
            : true;

        return {
          success: true,
          valid,
          vectorDimensions,
          columnDimensions,
          expectedDimensions,
          ...(parsed.vector !== undefined &&
          expectedDimensions !== undefined &&
          vectorDimensions !== undefined &&
          vectorDimensions !== expectedDimensions
            ? {
                error: `Vector has ${String(vectorDimensions)} dimensions but column expects ${String(expectedDimensions)} `,
                suggestion:
                  vectorDimensions > expectedDimensions
                    ? "Use pg_vector_dimension_reduce to reduce dimensions"
                    : "Ensure your embedding model outputs the correct dimensions",
              }
            : {}),
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_vector_validate" });
      }
    },
  };
}
