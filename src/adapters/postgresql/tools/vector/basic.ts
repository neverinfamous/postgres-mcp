/**
 * PostgreSQL pgvector - Basic Operations
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly, write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import {
  sanitizeIdentifier,
  sanitizeTableName,
} from "../../../../utils/identifiers.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import {
  // Base schemas for MCP visibility (Split Schema pattern)
  VectorSearchSchemaBase,
  VectorCreateIndexSchemaBase,
  // Transformed schemas for handler validation
  VectorSearchSchema,
  VectorCreateIndexSchema,
  // Output schemas
  VectorCreateExtensionOutputSchema,
  VectorAddColumnOutputSchema,
  VectorInsertOutputSchema,
  VectorSearchOutputSchema,
  VectorCreateIndexOutputSchema,
  VectorDistanceOutputSchema,
  VectorNormalizeOutputSchema,
  VectorAggregateOutputSchema,
  VectorValidateOutputSchema,
} from "../../schemas/index.js";

/**
 * Parse a PostgreSQL vector string to a number array.
 * Handles formats like "[0.1,0.2,0.3]" or "(0.1,0.2,0.3)"
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

/**
 * Truncate a vector for display, showing first/last N values.
 * For vectors <= maxDisplay, returns the full vector.
 */
export function truncateVector(
  vec: number[] | null | undefined,
  maxDisplay = 10,
): {
  preview: number[] | null;
  dimensions: number;
  truncated: boolean;
} {
  if (vec === null || vec === undefined) {
    return { preview: null, dimensions: 0, truncated: false };
  }
  if (vec.length <= maxDisplay) {
    return { preview: vec, dimensions: vec.length, truncated: false };
  }
  // Show first 5 and last 5
  const half = Math.floor(maxDisplay / 2);
  const preview = [...vec.slice(0, half), ...vec.slice(-half)];
  return { preview, dimensions: vec.length, truncated: true };
}

/**
 * Two-step existence check: table first, then column.
 * Returns null if both exist, or {error, suggestion} if either is missing.
 */
export async function checkTableAndColumn(
  adapter: PostgresAdapter,
  table: string,
  column: string,
  schema: string,
): Promise<{ error: string; suggestion: string } | null> {
  // Step 1: check column existence (fast path — covers the common success case)
  const colSql = `
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
  `;
  const colResult = await adapter.executeQuery(colSql, [schema, table, column]);
  if ((colResult.rows?.length ?? 0) > 0) return null; // both exist

  // Step 2: disambiguate — is it the table or the column?
  const tblSql = `
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = $1 AND table_name = $2
  `;
  const tblResult = await adapter.executeQuery(tblSql, [schema, table]);
  if ((tblResult.rows?.length ?? 0) === 0) {
    return {
      error: `Table '${table}' does not exist in schema '${schema}'`,
      suggestion: "Use pg_list_tables to find available tables",
    };
  }
  return {
    error: `Column '${column}' does not exist in table '${table}'`,
    suggestion: "Use pg_describe_table to find available columns",
  };
}

export function createVectorExtensionTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_vector_create_extension",
    description: "Enable the pgvector extension for vector similarity search.",
    group: "vector",
    inputSchema: z.object({}),
    outputSchema: VectorCreateExtensionOutputSchema,
    annotations: write("Create Vector Extension"),
    icons: getToolIcons("vector", write("Create Vector Extension")),
    handler: async (_params: unknown, _context: RequestContext) => {
      await adapter.executeQuery("CREATE EXTENSION IF NOT EXISTS vector");
      return { success: true, message: "pgvector extension enabled" };
    },
  };
}

export function createVectorAddColumnTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  // Base schema for MCP visibility (Split Schema pattern)
  const AddColumnSchemaBase = z.object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Alias for table"),
    column: z.string().optional().describe("Column name"),
    col: z.string().optional().describe("Alias for column"),
    dimensions: z
      .number()
      .describe("Vector dimensions (e.g., 1536 for OpenAI)"),
    schema: z.string().optional().describe("Database schema (default: public)"),
    ifNotExists: z
      .boolean()
      .optional()
      .describe("Skip if column already exists (default: false)"),
  });

  // Transformed schema with alias resolution for handler
  const AddColumnSchema = AddColumnSchemaBase.transform((data) => ({
    table: data.table ?? data.tableName ?? "",
    column: data.column ?? data.col ?? "",
    dimensions: data.dimensions,
    schema: data.schema,
    ifNotExists: data.ifNotExists ?? false,
  }));

  return {
    name: "pg_vector_add_column",
    description:
      "Add a vector column to a table. Requires: table, column, dimensions.",
    group: "vector",
    // Use base schema for MCP visibility
    inputSchema: AddColumnSchemaBase,
    outputSchema: VectorAddColumnOutputSchema,
    annotations: write("Add Vector Column"),
    icons: getToolIcons("vector", write("Add Vector Column")),
    handler: async (params: unknown, _context: RequestContext) => {
      const parsed = AddColumnSchema.parse(params);

      // Validate required params with clear errors
      if (parsed.table === "") {
        return {
          success: false,
          error: "table (or tableName) parameter is required",
          requiredParams: ["table", "column", "dimensions"],
        };
      }
      if (parsed.column === "") {
        return {
          success: false,
          error: "column (or col) parameter is required",
          requiredParams: ["table", "column", "dimensions"],
        };
      }

      const schemaName = parsed.schema ?? "public";
      const tableName = sanitizeTableName(parsed.table, parsed.schema);
      const columnName = sanitizeIdentifier(parsed.column);

      // Verify table exists before ALTER TABLE
      const tblCheckSql = `
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2
      `;
      const tblCheckResult = await adapter.executeQuery(tblCheckSql, [
        schemaName,
        parsed.table,
      ]);
      if ((tblCheckResult.rows?.length ?? 0) === 0) {
        return {
          success: false,
          error: `Table '${parsed.table}' does not exist in schema '${schemaName}'`,
          suggestion: "Use pg_list_tables to find available tables",
        };
      }

      // Check if column exists when ifNotExists is true
      if (parsed.ifNotExists) {
        const checkSql = `
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
        `;
        const checkResult = await adapter.executeQuery(checkSql, [
          schemaName,
          parsed.table,
          parsed.column,
        ]);
        if (checkResult.rows && checkResult.rows.length > 0) {
          return {
            success: true,
            table: parsed.table,
            column: parsed.column,
            dimensions: parsed.dimensions,
            ifNotExists: true,
            alreadyExists: true,
            message: `Column ${parsed.column} already exists on table ${parsed.table}`,
          };
        }
      }

      const sql = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} vector(${String(parsed.dimensions)})`;
      try {
        await adapter.executeQuery(sql);
        return {
          success: true,
          table: parsed.table,
          column: parsed.column,
          dimensions: parsed.dimensions,
          ifNotExists: parsed.ifNotExists,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // Duplicate column: PG code 42701
        if (msg.includes("already exists")) {
          return {
            success: false,
            error: `Column '${parsed.column}' already exists on table '${parsed.table}'`,
            suggestion:
              "Use ifNotExists: true to skip if column already exists",
          };
        }
        throw err;
      }
    },
  };
}

export function createVectorInsertTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  // Base schema for MCP visibility (Split Schema pattern)
  const VectorInsertSchemaBase = z.object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Alias for table"),
    column: z.string().optional().describe("Column name"),
    col: z.string().optional().describe("Alias for column"),
    vector: z.array(z.number()),
    additionalColumns: z.record(z.string(), z.unknown()).optional(),
    schema: z.string().optional(),
    updateExisting: z
      .boolean()
      .optional()
      .describe(
        "Update vector on existing row (requires conflictColumn and conflictValue)",
      ),
    conflictColumn: z
      .string()
      .optional()
      .describe("Column to match for updates (e.g., id)"),
    conflictValue: z
      .union([z.string(), z.number()])
      .optional()
      .describe("Value of conflictColumn to match (e.g., 123)"),
  });

  // Transformed schema with alias resolution for handler
  const VectorInsertSchema = VectorInsertSchemaBase.transform((data) => ({
    table: data.table ?? data.tableName ?? "",
    column: data.column ?? data.col ?? "",
    vector: data.vector,
    additionalColumns: data.additionalColumns,
    schema: data.schema,
    updateExisting: data.updateExisting,
    conflictColumn: data.conflictColumn,
    conflictValue: data.conflictValue,
  }));

  return {
    name: "pg_vector_insert",
    description:
      "Insert a vector into a table, or update an existing row's vector. For upsert: use updateExisting + conflictColumn + conflictValue to UPDATE existing rows (avoids NOT NULL issues).",
    group: "vector",
    // Use base schema for MCP visibility
    inputSchema: VectorInsertSchemaBase,
    outputSchema: VectorInsertOutputSchema,
    annotations: write("Insert Vector"),
    icons: getToolIcons("vector", write("Insert Vector")),
    handler: async (params: unknown, _context: RequestContext) => {
      // Use transformed schema for alias resolution
      const parsed = VectorInsertSchema.parse(params);

      // Validate required params with clear errors
      if (parsed.table === "") {
        return {
          success: false,
          error: "table (or tableName) parameter is required",
          requiredParams: ["table", "column", "vector"],
        };
      }
      if (parsed.column === "") {
        return {
          success: false,
          error: "column (or col) parameter is required",
          requiredParams: ["table", "column", "vector"],
        };
      }
      if (
        parsed.vector === undefined ||
        !Array.isArray(parsed.vector) ||
        parsed.vector.length === 0
      ) {
        return {
          success: false,
          error:
            "vector parameter is required and must be a non-empty array of numbers",
          requiredParams: ["table", "column", "vector"],
        };
      }

      // Validate upsert mode parameters
      if (parsed.updateExisting === true) {
        if (
          parsed.conflictColumn === undefined ||
          parsed.conflictValue === undefined
        ) {
          return {
            success: false,
            error:
              "updateExisting requires both conflictColumn and conflictValue parameters",
            suggestion:
              'Specify conflictColumn (e.g., "id") and conflictValue (e.g., 123) to identify the row to update',
            example:
              '{ updateExisting: true, conflictColumn: "id", conflictValue: 42, vector: [...] }',
          };
        }
      }

      // Parse schema.table format (embedded schema takes priority over explicit schema param)
      let resolvedTable = parsed.table;
      let resolvedSchema = parsed.schema;
      if (parsed.table.includes(".")) {
        const parts = parsed.table.split(".");
        resolvedSchema = parts[0] ?? parsed.schema ?? "public";
        resolvedTable = parts[1] ?? parsed.table;
      }

      const insertSchemaName = resolvedSchema ?? "public";
      const tableName = sanitizeTableName(resolvedTable, resolvedSchema);
      const columnName = sanitizeIdentifier(parsed.column);
      const vectorStr = `[${parsed.vector.join(",")}]`;

      // Pre-validate table and column exist
      const missing = await checkTableAndColumn(
        adapter,
        resolvedTable,
        parsed.column,
        insertSchemaName,
      );
      if (missing) {
        return { success: false, ...missing };
      }

      // Use direct UPDATE for updateExisting mode (avoids NOT NULL constraint issues)
      if (
        parsed.updateExisting === true &&
        parsed.conflictColumn !== undefined &&
        parsed.conflictValue !== undefined
      ) {
        const conflictCol = sanitizeIdentifier(parsed.conflictColumn);

        // Build SET clause including vector and additionalColumns
        const setClauses: string[] = [`${columnName} = $1::vector`];
        const queryParams: unknown[] = [vectorStr, parsed.conflictValue];
        let paramIndex = 3; // $1 = vector, $2 = conflictValue

        if (parsed.additionalColumns !== undefined) {
          for (const [col, val] of Object.entries(parsed.additionalColumns)) {
            setClauses.push(
              `${sanitizeIdentifier(col)} = $${String(paramIndex)}`,
            );
            queryParams.push(val);
            paramIndex++;
          }
        }

        const sql = `UPDATE ${tableName} SET ${setClauses.join(", ")} WHERE ${conflictCol} = $2`;
        const result = await adapter.executeQuery(sql, queryParams);

        if (result.rowsAffected === 0) {
          return {
            success: false,
            error: `No row found with ${parsed.conflictColumn} = ${String(parsed.conflictValue)}`,
            suggestion:
              "Use insert mode (without updateExisting) to create new rows, or verify the conflictValue exists",
          };
        }

        return {
          success: true,
          rowsAffected: result.rowsAffected,
          mode: "update",
          columnsUpdated: setClauses.length,
        };
      }

      // Standard INSERT mode
      const columns = [columnName];
      const values = [vectorStr];
      const params_: unknown[] = [];
      let paramIndex = 1;

      if (parsed.additionalColumns !== undefined) {
        for (const [col, val] of Object.entries(parsed.additionalColumns)) {
          columns.push(sanitizeIdentifier(col));
          values.push(`$${String(paramIndex++)}`);
          params_.push(val);
        }
      }

      const sql = `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES ('${vectorStr}'${params_.length > 0 ? ", " + values.slice(1).join(", ") : ""})`;
      try {
        const result = await adapter.executeQuery(sql, params_);
        return { success: true, rowsAffected: result.rowsAffected };
      } catch (error: unknown) {
        // Parse dimension mismatch errors for user-friendly message
        if (error instanceof Error) {
          const dimMatch = /expected (\d+) dimensions?, not (\d+)/.exec(
            error.message,
          );
          if (dimMatch) {
            const expectedDim = dimMatch[1] ?? "0";
            const providedDim = dimMatch[2] ?? "0";
            return {
              success: false,
              error: "Vector dimension mismatch",
              expectedDimensions: parseInt(expectedDim, 10),
              providedDimensions: parseInt(providedDim, 10),
              suggestion: `Column expects ${expectedDim} dimensions but vector has ${providedDim}. Resize vector or check embedding model.`,
            };
          }
          // Check for NOT NULL constraint violation
          if (
            error.message.includes("NOT NULL") ||
            error.message.includes("null value in column")
          ) {
            return {
              success: false,
              error: "NOT NULL constraint violation",
              rawError: error.message,
              suggestion:
                "Table has NOT NULL columns that require values. Use additionalColumns param or updateExisting mode to update existing rows.",
            };
          }
          // Catch relation/column not found from UPDATE path
          if (error.message.includes("does not exist")) {
            return {
              success: false,
              error: error.message,
              suggestion:
                "Verify the table and column names using pg_list_tables and pg_describe_table",
            };
          }
        }
        throw error;
      }
    },
  };
}

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
      const udtName = typeResult.rows?.[0]?.["udt_name"] as string | undefined;
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
      const parsed = DistanceSchema.parse(params);

      // Validate dimension match before query
      if (parsed.vector1.length !== parsed.vector2.length) {
        return {
          success: false,
          error: `Vector dimensions must match: vector1 has ${String(parsed.vector1.length)} dimensions, vector2 has ${String(parsed.vector2.length)} dimensions`,
          suggestion: "Ensure both vectors have the same number of dimensions",
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
      const udtName = typeResult.rows?.[0]?.["udt_name"] as string | undefined;
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
    },
  };
}

export function createVectorBatchInsertTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  // Base schema for MCP visibility (Split Schema pattern)
  const BatchInsertSchemaBase = z.object({
    table: z.string().optional().describe("Table name"),
    tableName: z.string().optional().describe("Alias for table"),
    column: z.string().optional().describe("Vector column"),
    col: z.string().optional().describe("Alias for column"),
    vectors: z
      .array(
        z.object({
          vector: z.array(z.number()),
          data: z
            .record(z.string(), z.unknown())
            .optional()
            .describe("Additional column values"),
        }),
      )
      .describe("Array of vectors with optional additional data"),
    schema: z.string().optional().describe("Database schema (default: public)"),
  });

  // Transformed schema with alias resolution for handler
  const BatchInsertSchema = BatchInsertSchemaBase.transform((data) => ({
    table: data.table ?? data.tableName ?? "",
    column: data.column ?? data.col ?? "",
    vectors: data.vectors,
    schema: data.schema,
  }));

  return {
    name: "pg_vector_batch_insert",
    description:
      'Efficiently insert multiple vectors. vectors param expects array of {vector: [...], data?: {...}} objects, NOT raw arrays. Example: vectors: [{vector: [0.1, 0.2], data: {name: "a"}}]',
    group: "vector",
    // Use base schema for MCP visibility
    inputSchema: BatchInsertSchemaBase,
    annotations: write("Batch Insert Vectors"),
    icons: getToolIcons("vector", write("Batch Insert Vectors")),
    handler: async (params: unknown, _context: RequestContext) => {
      const parsed = BatchInsertSchema.parse(params);

      // Parse schema.table format (embedded schema takes priority over explicit schema param)
      let resolvedTable = parsed.table;
      let resolvedSchema = parsed.schema;
      if (parsed.table.includes(".")) {
        const parts = parsed.table.split(".");
        resolvedSchema = parts[0] ?? parsed.schema ?? "public";
        resolvedTable = parts[1] ?? parsed.table;
      }

      const tableName = sanitizeTableName(resolvedTable, resolvedSchema);
      const columnName = sanitizeIdentifier(parsed.column);

      // P154: Pre-validate table and column exist
      const existenceError = await checkTableAndColumn(
        adapter,
        resolvedTable,
        parsed.column,
        resolvedSchema ?? "public",
      );
      if (existenceError !== null) {
        return { success: false, ...existenceError };
      }

      if (parsed.vectors.length === 0) {
        return {
          success: true,
          rowsInserted: 0,
          message: "No vectors to insert",
        };
      }

      // Build batch INSERT with VALUES clause
      const allDataKeys = new Set<string>();
      for (const v of parsed.vectors) {
        if (v.data !== undefined) {
          for (const k of Object.keys(v.data)) {
            allDataKeys.add(k);
          }
        }
      }
      const dataColumns = Array.from(allDataKeys);

      const columns = [
        columnName,
        ...dataColumns.map((c) => sanitizeIdentifier(c)),
      ];
      const valueRows: string[] = [];
      const allParams: unknown[] = [];
      let paramIndex = 1;

      for (const v of parsed.vectors) {
        const vectorStr = `'[${v.vector.join(", ")}]':: vector`;
        const rowValues = [vectorStr];

        for (const col of dataColumns) {
          rowValues.push(`$${String(paramIndex++)} `);
          allParams.push(v.data?.[col] ?? null);
        }

        valueRows.push(`(${rowValues.join(", ")})`);
      }

      const sql = `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES ${valueRows.join(", ")} `;
      const result = await adapter.executeQuery(sql, allParams);

      return {
        success: true,
        rowsInserted: parsed.vectors.length,
        rowsAffected: result.rowsAffected,
      };
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
    dimensions: z.number().optional().describe("Expected dimensions to check"),
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
    },
  };
}
