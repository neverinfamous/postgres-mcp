/**
 * PostgreSQL pgvector - Data Operations
 *
 * Write tools: extension, addColumn, insert, batchInsert.
 * Also exports shared utilities: parseVector, truncateVector, checkTableAndColumn.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatPostgresError } from "../core/error-helpers.js";
import {
  sanitizeIdentifier,
  sanitizeTableName,
} from "../../../../utils/identifiers.js";
import {
  VectorCreateExtensionOutputSchema,
  VectorAddColumnOutputSchema,
  VectorInsertOutputSchema,
} from "../../schemas/index.js";

/**
 * Parse a PostgreSQL vector string to a number array.
 * Handles formats like "[0.1,0.2,0.3]" or "(0.1,0.2,0.3)"
 */
export function parseVector(vecStr: unknown): number[] | null {
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
      try {
        await adapter.executeQuery("CREATE EXTENSION IF NOT EXISTS vector");
        return { success: true, message: "pgvector extension enabled" };
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, {
            tool: "pg_vector_create_extension",
          }),
        };
      }
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
    dimensions: z.coerce
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
      try {
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
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_vector_add_column" }),
        };
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
      try {
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
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_vector_insert" }),
        };
      }
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
      try {
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
        try {
          const result = await adapter.executeQuery(sql, allParams);
          return {
            success: true,
            rowsInserted: parsed.vectors.length,
            rowsAffected: result.rowsAffected,
          };
        } catch (error: unknown) {
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
                suggestion: `Column expects ${expectedDim} dimensions but vectors have ${providedDim}. Resize vectors or check embedding model.`,
              };
            }
          }
          throw error;
        }
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, { tool: "pg_vector_batch_insert" }),
        };
      }
    },
  };
}
