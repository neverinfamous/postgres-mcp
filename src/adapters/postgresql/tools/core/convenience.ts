/**
 * PostgreSQL Core Tools - Convenience Operations
 *
 * Tool factories for common database operations:
 * - pg_upsert: INSERT ... ON CONFLICT UPDATE
 * - pg_batch_insert: Multi-row insert
 *
 * Schemas and validation utilities live in ./convenience-schemas.ts
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "./error-helpers.js";
import { WriteQueryOutputSchema } from "./schemas/index.js";
import {
  validateTableExists,
  UpsertSchemaBase,
  UpsertSchema,
  BatchInsertSchemaBase,
  BatchInsertSchema,
} from "./convenience-schemas.js";

// Re-export schemas and utilities so existing barrel imports keep working
export {
  validateTableExists,
  UpsertSchemaBase,
  UpsertSchema,
  BatchInsertSchemaBase,
  BatchInsertSchema,
  CountSchemaBase,
  CountSchema,
  ExistsSchemaBase,
  ExistsSchema,
  TruncateSchemaBase,
  TruncateSchema,
  preprocessTableParams,
} from "./convenience-schemas.js";

// =============================================================================
// Tools
// =============================================================================

/**
 * Upsert (INSERT ... ON CONFLICT UPDATE)
 */
export function createUpsertTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_upsert",
    description:
      "Insert a row or update if it already exists (INSERT ... ON CONFLICT DO UPDATE). Specify conflict columns for uniqueness check. Use data or values for column-value pairs.",
    group: "core",
    inputSchema: UpsertSchemaBase, // Base schema for MCP visibility
    outputSchema: WriteQueryOutputSchema,
    annotations: write("Upsert"),
    icons: getToolIcons("core", write("Upsert")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = UpsertSchema.parse(params);
        const schemaName = parsed.schema ?? "public";
        const validationError = await validateTableExists(
          adapter,
          parsed.table,
          schemaName,
        );
        if (validationError) {
          return { success: false, error: validationError };
        }
        const qualifiedTable = `"${schemaName}"."${parsed.table}"`;

        const columns = Object.keys(parsed.data);
        const values = Object.values(parsed.data);

        // Build INSERT clause
        const columnList = columns.map((c) => `"${c}"`).join(", ");
        const placeholders = columns
          .map((_, i) => `$${String(i + 1)}`)
          .join(", ");

        // Build ON CONFLICT clause
        const conflictCols = parsed.conflictColumns
          .map((c) => `"${c}"`)
          .join(", ");

        // Determine columns to update (default: all except conflict columns)
        const updateCols =
          parsed.updateColumns ??
          columns.filter((c) => !parsed.conflictColumns.includes(c));

        let conflictAction: string;
        if (updateCols.length === 0) {
          // No columns to update, just do nothing
          conflictAction = "DO NOTHING";
        } else {
          const updateSet = updateCols
            .map((c) => `"${c}" = EXCLUDED."${c}"`)
            .join(", ");
          conflictAction = `DO UPDATE SET ${updateSet}`;
        }

        // Build RETURNING clause - always include xmax to detect insert vs update
        const returningCols = parsed.returning ?? [];
        const hasReturning = returningCols.length > 0;
        // Always add xmax to detect if it was insert (xmax=0) or update (xmax>0)
        const xmaxClause = "xmax::text::int as _xmax";
        const returningClause = hasReturning
          ? ` RETURNING ${returningCols.map((c) => `"${c}"`).join(", ")}, ${xmaxClause}`
          : ` RETURNING ${xmaxClause}`;

        const sql = `INSERT INTO ${qualifiedTable} (${columnList}) VALUES (${placeholders}) ON CONFLICT (${conflictCols}) ${conflictAction}${returningClause}`;

        try {
          const result = await adapter.executeQuery(sql, values);
          // Determine if it was an insert or update from xmax
          // xmax = 0 means INSERT, xmax > 0 means UPDATE
          const firstRow = result.rows?.[0];
          const xmaxValue = Number(firstRow?.["_xmax"] ?? 0);
          const operation = xmaxValue === 0 ? "insert" : "update";

          // Remove _xmax from returned rows if not explicitly requested
          const cleanedRows = result.rows?.map((row) => {
            return Object.fromEntries(
              Object.entries(row).filter(([key]) => key !== "_xmax"),
            );
          });

          return {
            success: true,
            operation, // 'insert' or 'update'
            rowsAffected: result.rowsAffected ?? 0,
            affectedRows: result.rowsAffected ?? 0, // Alias for common API naming
            rowCount: 1, // Upsert always affects one row
            // Only include rows when RETURNING clause was explicitly requested
            ...(hasReturning &&
              cleanedRows &&
              cleanedRows.length > 0 && { rows: cleanedRows }),
          };
        } catch (error: unknown) {
          // Provide clearer error message for constraint issues
          if (error instanceof Error) {
            const msg = error.message.toLowerCase();
            if (msg.includes("no unique or exclusion constraint")) {
              return {
                success: false,
                error:
                  `conflictColumns [${parsed.conflictColumns.join(", ")}] must reference columns with a UNIQUE constraint or PRIMARY KEY. ` +
                  `Create a unique constraint first: ALTER TABLE ${qualifiedTable} ADD CONSTRAINT unique_name UNIQUE (${conflictCols})`,
              };
            }
          }
          return formatHandlerErrorResponse(error, {
              tool: "pg_upsert",
              table: parsed.table,
              schema: schemaName,
            });
        }
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_upsert" });
      }
    },
  };
}

/**
 * Batch insert (multi-row INSERT)
 */
export function createBatchInsertTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_batch_insert",
    description:
      "Insert multiple rows in a single statement. More efficient than individual inserts. Rows array must not be empty.",
    group: "core",
    inputSchema: BatchInsertSchemaBase, // Base schema for MCP visibility
    outputSchema: WriteQueryOutputSchema,
    annotations: write("Batch Insert"),
    icons: getToolIcons("core", write("Batch Insert")),
    handler: async (params: unknown, _context: RequestContext) => {
      let parsed;
      try {
        parsed = BatchInsertSchema.parse(params);
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_batch_insert" });
      }

      // Validate rows array is not empty
      if (parsed.rows.length === 0) {
        return {
          success: false,
          error:
            "rows must not be empty. Provide at least one row to insert, " +
            'e.g., rows: [{ column: "value" }]',
        };
      }

      const schemaName = parsed.schema ?? "public";
      const validationError = await validateTableExists(
        adapter,
        parsed.table,
        schemaName,
      );
      if (validationError) {
        return { success: false, error: validationError };
      }
      const qualifiedTable = `"${schemaName}"."${parsed.table}"`;

      // Get all unique columns from all rows
      const allColumns = new Set<string>();
      for (const row of parsed.rows) {
        for (const col of Object.keys(row)) {
          allColumns.add(col);
        }
      }
      const columns = Array.from(allColumns);

      // Handle SERIAL-only tables (empty objects)
      if (columns.length === 0) {
        // Use INSERT ... DEFAULT VALUES for each row
        const returningClause =
          parsed.returning !== undefined && parsed.returning.length > 0
            ? ` RETURNING ${parsed.returning.map((c) => `"${c}"`).join(", ")}`
            : "";

        // Execute individual DEFAULT VALUES inserts for each row
        let totalAffected = 0;
        const allRows: Record<string, unknown>[] = [];
        for (const _row of parsed.rows) {
          const sql = `INSERT INTO ${qualifiedTable} DEFAULT VALUES${returningClause}`;
          const result = await adapter.executeQuery(sql);
          totalAffected += result.rowsAffected ?? 1;
          if (result.rows && result.rows.length > 0) {
            allRows.push(...result.rows);
          }
        }
        return {
          success: true,
          rowsAffected: totalAffected,
          affectedRows: totalAffected,
          insertedCount: totalAffected, // Semantic alias for insert operations
          rowCount: parsed.rows.length,
          hint: "Used DEFAULT VALUES for SERIAL-only table (no columns specified)",
          ...(allRows.length > 0 && { rows: allRows }),
        };
      }

      // Build values placeholders
      const values: unknown[] = [];
      const rowPlaceholders: string[] = [];
      let paramIndex = 1;

      for (const row of parsed.rows) {
        const rowValues: string[] = [];
        for (const col of columns) {
          let value = row[col] ?? null;
          // Serialize objects/arrays to JSON strings for JSONB column support
          // PostgreSQL expects JSON data as string literals, not raw objects
          if (value !== null && typeof value === "object") {
            value = JSON.stringify(value);
          }
          values.push(value);
          rowValues.push(`$${String(paramIndex)}`);
          paramIndex++;
        }
        rowPlaceholders.push(`(${rowValues.join(", ")})`);
      }

      const columnList = columns.map((c) => `"${c}"`).join(", ");
      const returningClause =
        parsed.returning !== undefined && parsed.returning.length > 0
          ? ` RETURNING ${parsed.returning.map((c) => `"${c}"`).join(", ")}`
          : "";

      const sql = `INSERT INTO ${qualifiedTable} (${columnList}) VALUES ${rowPlaceholders.join(", ")}${returningClause}`;

      let result;
      try {
        result = await adapter.executeQuery(sql, values);
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_batch_insert",
            table: parsed.table,
            schema: schemaName,
          });
      }
      return {
        success: true,
        rowsAffected: result.rowsAffected ?? 0,
        affectedRows: result.rowsAffected ?? 0, // Alias for common API naming
        insertedCount: result.rowsAffected ?? 0, // Semantic alias for insert operations
        rowCount: parsed.rows.length,
        // Only include returned rows when RETURNING clause is used
        ...(result.rows && result.rows.length > 0 && { rows: result.rows }),
      };
    },
  };
}
