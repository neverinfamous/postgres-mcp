/**
 * PostgreSQL pgvector - Query & Analysis Operations
 *
 * Read/analysis tools: search, createIndex, distance, normalize, aggregate, validate.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly, write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatPostgresError } from "../core/error-helpers.js";
import {
  sanitizeIdentifier,
  sanitizeTableName,
} from "../../../../utils/identifiers.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import { parseVector, truncateVector, checkTableAndColumn } from "./data.js";
import {
  // Base schemas for MCP visibility (Split Schema pattern)
  VectorSearchSchemaBase,
  VectorCreateIndexSchemaBase,
  // Transformed schemas for handler validation
  VectorSearchSchema,
  VectorCreateIndexSchema,
  // Output schemas
  VectorSearchOutputSchema,
  VectorCreateIndexOutputSchema,
  VectorDistanceOutputSchema,
  VectorNormalizeOutputSchema,
  VectorAggregateOutputSchema,
  VectorValidateOutputSchema,
} from "../../schemas/index.js";

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
          return {
            success: false,
            error: "table (or tableName) parameter is required",
            requiredParams: ["table", "column", "vector"],
          };
        }
        if (column === "") {
          return {
            success: false,
            error:
              "column (or col) parameter is required for the vector column name",
            requiredParams: ["table", "column", "vector"],
          };
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
            suggestion:
              "Use a column with vector type, or use pg_vector_add_column to create one",
          };
        }
        const vectorStr = `[${vector.join(",")}]`;
        const limitVal = limit !== undefined && limit > 0 ? limit : 10;
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

          const response: Record<string, unknown> = {
            results: result.rows,
            count: result.rows?.length ?? 0,
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
              const expectedDim = dimMatch[1] ?? "0";
              const providedDim = dimMatch[2] ?? "0";
              return {
                success: false,
                error: `Vector dimension mismatch: column '${column}' expects ${expectedDim} dimensions, but you provided ${providedDim} dimensions.`,
                expectedDimensions: parseInt(expectedDim, 10),
                providedDimensions: parseInt(providedDim, 10),
                suggestion:
                  "Ensure your query vector has the same dimensions as the column.",
              };
            }
          }
          throw error;
        }
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_vector_search" }),
        };
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
          return {
            success: false,
            error: "table (or tableName) parameter is required",
            requiredParams: ["table", "column", "type"],
          };
        }
        if (column === "") {
          return {
            success: false,
            error:
              "column (or col) parameter is required for the vector column name",
            requiredParams: ["table", "column", "type"],
          };
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
                suggestion:
                  "Use a column with vector type, or use pg_vector_add_column to create one",
              };
            }
          }
          // Re-throw other errors
          throw error;
        }
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_vector_create_index" }),
        };
      }
    },
  };
}

export function createVectorDistanceTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  const DistanceSchema = z.object({
    vector1: z.array(z.number()),
    vector2: z.array(z.number()),
    metric: z.enum(["l2", "cosine", "inner_product"]).optional(),
  });

  return {
    name: "pg_vector_distance",
    description:
      "Calculate distance between two vectors. Valid metrics: l2 (default), cosine, inner_product.",
    group: "vector",
    inputSchema: DistanceSchema,
    outputSchema: VectorDistanceOutputSchema,
    annotations: readOnly("Vector Distance"),
    icons: getToolIcons("vector", readOnly("Vector Distance")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = DistanceSchema.parse(params);

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
        return {
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_vector_distance" }),
        };
      }
    },
  };
}

export function createVectorNormalizeTool(): ToolDefinition {
  const NormalizeSchema = z.object({
    vector: z.array(z.number()).describe("Vector to normalize to unit length"),
  });

  return {
    name: "pg_vector_normalize",
    description: "Normalize a vector to unit length.",
    group: "vector",
    inputSchema: NormalizeSchema,
    outputSchema: VectorNormalizeOutputSchema,
    annotations: readOnly("Normalize Vector"),
    icons: getToolIcons("vector", readOnly("Normalize Vector")),
    handler: (params: unknown, _context: RequestContext) => {
      try {
        const parsed = NormalizeSchema.parse(params ?? {});

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
        return Promise.resolve({
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_vector_normalize" }),
        });
      }
    },
  };
}

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
        return {
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_vector_aggregate" }),
        };
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
    vector: z
      .array(z.number())
      .optional()
      .describe("Vector to validate dimensions"),
    dimensions: z.coerce
      .number()
      .optional()
      .describe("Expected dimensions to check"),
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
      "Returns `{valid: bool, vectorDimensions}`. Validate vector dimensions against a column or check a vector before operations. Empty vector `[]` returns `{valid: true, vectorDimensions: 0}`.",
    group: "vector",
    inputSchema: ValidateSchemaBase,
    outputSchema: VectorValidateOutputSchema,
    annotations: readOnly("Validate Vector"),
    icons: getToolIcons("vector", readOnly("Validate Vector")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Wrap validation in try-catch for user-friendly errors
        let parsed: {
          table: string;
          column: string;
          vector: number[] | undefined;
          dimensions: number | undefined;
          schema: string | undefined;
        };
        try {
          parsed = ValidateSchema.parse(params);
        } catch (error: unknown) {
          // Return user-friendly error for invalid input types
          if (error instanceof z.ZodError) {
            const firstIssue = error.issues[0];
            if (firstIssue) {
              const path = firstIssue.path.join(".");
              const message = firstIssue.message;
              return {
                valid: false,
                error: `Invalid ${path || "input"}: ${message}`,
                suggestion:
                  path === "vector"
                    ? "Ensure vector is an array of numbers, e.g., [0.1, 0.2, 0.3]"
                    : "Check the parameter types and try again",
              };
            }
          }
          throw error;
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
                valid: false,
                error: `Table '${parsed.table}' does not exist in schema '${schemaName}'`,
                suggestion: "Use pg_list_tables to find available tables",
              };
            }
            return {
              valid: false,
              error: `Column '${parsed.column}' does not exist in table '${parsed.table}'`,
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
              valid: false,
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
        return {
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_vector_validate" }),
        };
      }
    },
  };
}
