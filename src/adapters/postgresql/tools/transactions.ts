/**
 * PostgreSQL Transaction Tools
 *
 * Transaction management with savepoints and isolation levels.
 * 7 tools total.
 */

import { type z } from "zod";
import type { PostgresAdapter } from "../PostgresAdapter.js";
import type { ToolDefinition, RequestContext } from "../../../types/index.js";
import { readOnly, write } from "../../../utils/annotations.js";
import { getToolIcons } from "../../../utils/icons.js";
import { formatHandlerErrorResponse } from "./core/error-helpers.js";
import {
  BeginTransactionSchemaBase,
  BeginTransactionSchema,
  TransactionIdSchema,
  TransactionIdSchemaBase,
  SavepointSchema,
  SavepointSchemaBase,
  TransactionExecuteSchema,
  TransactionExecuteSchemaBase,
  // Output schemas
  TransactionBeginOutputSchema,
  TransactionResultOutputSchema,
  TransactionStatusOutputSchema,
  SavepointResultOutputSchema,
  TransactionExecuteOutputSchema,
} from "../schemas/index.js";

/**
 * Get all transaction tools
 */
export function getTransactionTools(
  adapter: PostgresAdapter,
): ToolDefinition[] {
  return [
    createBeginTransactionTool(adapter),
    createTransactionStatusTool(adapter),
    createCommitTransactionTool(adapter),
    createRollbackTransactionTool(adapter),
    createSavepointTool(adapter),
    createReleaseSavepointTool(adapter),
    createRollbackToSavepointTool(adapter),
    createTransactionExecuteTool(adapter),
  ];
}

function createBeginTransactionTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_transaction_begin",
    description:
      "Begin a new transaction. Returns a transaction ID for subsequent operations.",
    group: "transactions",
    inputSchema: BeginTransactionSchemaBase,
    outputSchema: TransactionBeginOutputSchema,
    annotations: write("Begin Transaction"),
    icons: getToolIcons("transactions", write("Begin Transaction")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { isolationLevel } = BeginTransactionSchema.parse(params);
        const transactionId = await adapter.beginTransaction(isolationLevel);
        return {
          transactionId,
          isolationLevel: isolationLevel ?? "READ COMMITTED",
          message:
            "Transaction started. Use this ID for subsequent operations.",
        };
      } catch (error) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_transaction_begin",
          });
      }
    },
  };
}

function createTransactionStatusTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_transaction_status",
    description:
      "Check the status of an active transaction without modifying it. " +
      "Returns whether the transaction is active, aborted (needs rollback), or not found.",
    group: "transactions",
    inputSchema: TransactionIdSchemaBase,
    outputSchema: TransactionStatusOutputSchema,
    annotations: readOnly("Transaction Status"),
    icons: getToolIcons("transactions", readOnly("Transaction Status")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { transactionId } = TransactionIdSchema.parse(params);
        const client = adapter.getTransactionConnection(transactionId);

        if (!client) {
          return {
            status: "not_found",
            transactionId,
            active: false,
            message:
              "Transaction not found — it may have been committed, rolled back, or expired.",
          };
        }

        // Probe the connection to determine if the transaction is healthy
        // or in an aborted state (same technique used in commitTransaction).
        try {
          await adapter.executeOnConnection(client, "SELECT 1");
          return {
            status: "active",
            transactionId,
            active: true,
            message: "Transaction is active and ready for operations.",
          };
        } catch (probeError) {
          const pgCode = (probeError as Record<string, unknown>)["code"] as
            | string
            | undefined;
          if (
            pgCode === "25P02" ||
            (probeError instanceof Error &&
              /current transaction is aborted/i.test(probeError.message))
          ) {
            return {
              status: "aborted",
              transactionId,
              active: true,
              message:
                "Transaction is in an aborted state — only ROLLBACK or ROLLBACK TO SAVEPOINT commands are accepted.",
            };
          }
          return formatHandlerErrorResponse(probeError, {
              tool: "pg_transaction_status",
            });
        }
      } catch (error) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_transaction_status",
          });
      }
    },
  };
}

function createCommitTransactionTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_transaction_commit",
    description: "Commit a transaction, making all changes permanent.",
    group: "transactions",
    inputSchema: TransactionIdSchemaBase, // Use base schema for MCP visibility
    outputSchema: TransactionResultOutputSchema,
    annotations: write("Commit Transaction"),
    icons: getToolIcons("transactions", write("Commit Transaction")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { transactionId } = TransactionIdSchema.parse(params);
        await adapter.commitTransaction(transactionId);
        return {
          success: true,
          transactionId,
          message: "Transaction committed successfully.",
        };
      } catch (error) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_transaction_commit",
          });
      }
    },
  };
}

function createRollbackTransactionTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_transaction_rollback",
    description: "Rollback a transaction, undoing all changes.",
    group: "transactions",
    inputSchema: TransactionIdSchemaBase, // Use base schema for MCP visibility
    outputSchema: TransactionResultOutputSchema,
    annotations: write("Rollback Transaction"),
    icons: getToolIcons("transactions", write("Rollback Transaction")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { transactionId } = TransactionIdSchema.parse(params);
        await adapter.rollbackTransaction(transactionId);
        return {
          success: true,
          transactionId,
          message: "Transaction rolled back successfully.",
        };
      } catch (error) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_transaction_rollback",
          });
      }
    },
  };
}

function createSavepointTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_transaction_savepoint",
    description:
      "Create a savepoint within a transaction for partial rollback.",
    group: "transactions",
    inputSchema: SavepointSchemaBase, // Use base schema for MCP visibility
    outputSchema: SavepointResultOutputSchema,
    annotations: write("Create Savepoint"),
    icons: getToolIcons("transactions", write("Create Savepoint")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { transactionId, name } = SavepointSchema.parse(params);
        await adapter.createSavepoint(transactionId, name);
        return {
          success: true,
          transactionId,
          savepoint: name,
          message: `Savepoint '${name}' created.`,
        };
      } catch (error) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_transaction_savepoint",
          });
      }
    },
  };
}

function createReleaseSavepointTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_transaction_release",
    description:
      "Release a savepoint, keeping all changes since it was created.",
    group: "transactions",
    inputSchema: SavepointSchemaBase, // Use base schema for MCP visibility
    outputSchema: SavepointResultOutputSchema,
    annotations: write("Release Savepoint"),
    icons: getToolIcons("transactions", write("Release Savepoint")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { transactionId, name } = SavepointSchema.parse(params);
        await adapter.releaseSavepoint(transactionId, name);
        return {
          success: true,
          transactionId,
          savepoint: name,
          message: `Savepoint '${name}' released.`,
        };
      } catch (error) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_transaction_release",
          });
      }
    },
  };
}

function createRollbackToSavepointTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_transaction_rollback_to",
    description: "Rollback to a savepoint, undoing changes made after it.",
    group: "transactions",
    inputSchema: SavepointSchemaBase, // Use base schema for MCP visibility
    outputSchema: SavepointResultOutputSchema,
    annotations: write("Rollback to Savepoint"),
    icons: getToolIcons("transactions", write("Rollback to Savepoint")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { transactionId, name } = SavepointSchema.parse(params);
        await adapter.rollbackToSavepoint(transactionId, name);
        return {
          success: true,
          transactionId,
          savepoint: name,
          message: `Rolled back to savepoint '${name}'.`,
        };
      } catch (error) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_transaction_rollback_to",
          });
      }
    },
  };
}

function createTransactionExecuteTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_transaction_execute",
    description:
      "Execute multiple statements atomically in a single transaction.",
    group: "transactions",
    inputSchema: TransactionExecuteSchemaBase, // Use base schema for MCP visibility
    outputSchema: TransactionExecuteOutputSchema,
    annotations: write("Transaction Execute"),
    icons: getToolIcons("transactions", write("Transaction Execute")),
    handler: async (params: unknown, _context: RequestContext) => {
      let parsed: z.infer<typeof TransactionExecuteSchema>;

      try {
        parsed = await TransactionExecuteSchema.parseAsync(params);
      } catch (error) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_transaction_execute",
          });
      }

      const { statements, transactionId, isolationLevel } = parsed;

      // Check if joining an existing transaction or creating a new one
      const isJoiningExisting = transactionId !== undefined;
      const txId = isJoiningExisting
        ? transactionId
        : await adapter.beginTransaction(isolationLevel);

      const results: unknown[] = [];

      try {
        const client = adapter.getTransactionConnection(txId);
        if (!client) {
          throw new Error(
            isJoiningExisting
              ? `Transaction not found: ${txId}`
              : "Transaction connection lost",
          );
        }

        for (const stmt of statements) {
          const result = await adapter.executeOnConnection(
            client,
            stmt.sql,
            stmt.params,
          );
          results.push({
            sql: stmt.sql,
            rowsAffected:
              typeof result.rowsAffected === "string"
                ? parseInt(result.rowsAffected, 10)
                : (result.rowsAffected ?? 0),
            rowCount: result.rows?.length ?? 0,
            // Include returned rows when using RETURNING clause
            ...(result.rows && result.rows.length > 0 && { rows: result.rows }),
          });
        }

        // Only auto-commit if we created a new transaction
        // If joining an existing transaction, let the caller control commit/rollback
        if (!isJoiningExisting) {
          await adapter.commitTransaction(txId);
        }

        return {
          success: true,
          statementsExecuted: statements.length,
          results,
          // Include transactionId in response when joining existing transaction
          // so caller knows transaction is still open
          ...(isJoiningExisting && { transactionId: txId }),
        };
      } catch (error) {
        // Only auto-rollback if we created a new transaction
        // If joining an existing transaction, let the caller control cleanup
        if (!isJoiningExisting) {
          try {
            await adapter.rollbackTransaction(txId);
          } catch {
            // Best effort rollback — connection may already be broken
          }
        }

        // Build structured error response with partial results and rollback context
        const errResponse = formatHandlerErrorResponse(error, {
          tool: "pg_transaction_execute",
        });

        return {
          ...errResponse,
          error: `${errResponse.error}${!isJoiningExisting ? " Transaction was automatically rolled back." : ""}`,
          statementsExecuted: results.length,
          statementsTotal: statements.length,
          failedStatement: statements[results.length]?.sql,
          ...(isJoiningExisting
            ? { transactionId: txId }
            : { autoRolledBack: true }),
        };
      }
    },
  };
}
