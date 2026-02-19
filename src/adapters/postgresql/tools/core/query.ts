/**
 * PostgreSQL Core Tools - Query Operations
 *
 * Read and write query tools.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly, write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { parsePostgresError } from "./error-helpers.js";
import {
  ReadQuerySchemaBase,
  ReadQuerySchema,
  WriteQuerySchemaBase,
  WriteQuerySchema,
} from "../../schemas/index.js";
import { ReadQueryOutputSchema, WriteQueryOutputSchema } from "./schemas.js";

/**
 * Execute a read-only SQL query
 */
export function createReadQueryTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_read_query",
    description:
      "Execute a read-only SQL query (SELECT, WITH). Returns rows as JSON. Pass transactionId to execute within a transaction.",
    group: "core",
    inputSchema: ReadQuerySchemaBase, // Base schema for MCP visibility (sql required)
    outputSchema: ReadQueryOutputSchema,
    annotations: readOnly("Read Query"),
    icons: getToolIcons("core", readOnly("Read Query")),
    handler: async (params: unknown, _context: RequestContext) => {
      const {
        sql,
        params: queryParams,
        transactionId,
      } = ReadQuerySchema.parse(params);

      let result;
      if (transactionId !== undefined) {
        const client = adapter.getTransactionConnection(transactionId);
        if (!client) {
          throw new Error(
            `Invalid or expired transactionId: ${transactionId}. Use pg_transaction_begin to start a new transaction.`,
          );
        }
        try {
          result = await adapter.executeOnConnection(client, sql, queryParams);
        } catch (error: unknown) {
          throw parsePostgresError(error, { tool: "pg_read_query", sql });
        }
      } else {
        try {
          result = await adapter.executeReadQuery(sql, queryParams);
        } catch (error: unknown) {
          throw parsePostgresError(error, { tool: "pg_read_query", sql });
        }
      }

      return {
        rows: result.rows,
        rowCount: result.rows?.length ?? 0,
        // Include column metadata if available
        fields: result.fields?.map((f) => ({
          name: f.name,
          dataTypeID: f.dataTypeID,
        })),
        executionTimeMs: result.executionTimeMs,
      };
    },
  };
}

/**
 * Execute a write SQL query
 */
export function createWriteQueryTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_write_query",
    description:
      "Execute a write SQL query (INSERT, UPDATE, DELETE). Returns affected row count. Pass transactionId to execute within a transaction.",
    group: "core",
    inputSchema: WriteQuerySchemaBase, // Base schema for MCP visibility (sql required)
    outputSchema: WriteQueryOutputSchema,
    annotations: write("Write Query"),
    icons: getToolIcons("core", write("Write Query")),
    handler: async (params: unknown, _context: RequestContext) => {
      const {
        sql,
        params: queryParams,
        transactionId,
      } = WriteQuerySchema.parse(params);

      // Block SELECT statements - use pg_read_query instead
      const trimmedUpper = sql.trim().toUpperCase();
      if (trimmedUpper.startsWith("SELECT")) {
        throw new Error(
          "pg_write_query is for INSERT/UPDATE/DELETE only. Use pg_read_query for SELECT statements.",
        );
      }

      let result;
      if (transactionId !== undefined) {
        const client = adapter.getTransactionConnection(transactionId);
        if (!client) {
          throw new Error(
            `Invalid or expired transactionId: ${transactionId}. Use pg_transaction_begin to start a new transaction.`,
          );
        }
        try {
          result = await adapter.executeOnConnection(client, sql, queryParams);
        } catch (error: unknown) {
          throw parsePostgresError(error, { tool: "pg_write_query", sql });
        }
      } else {
        try {
          result = await adapter.executeWriteQuery(sql, queryParams);
        } catch (error: unknown) {
          throw parsePostgresError(error, { tool: "pg_write_query", sql });
        }
      }

      return {
        rowsAffected: result.rowsAffected ?? 0,
        affectedRows: result.rowsAffected ?? 0, // Alias for common API naming
        rowCount: result.rowsAffected ?? 0, // Alias for consistency
        command: result.command,
        executionTimeMs: result.executionTimeMs,
        // Include returned rows when using RETURNING clause
        ...(result.rows && result.rows.length > 0 && { rows: result.rows }),
      };
    },
  };
}
