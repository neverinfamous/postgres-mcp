/**
 * postgres-mcp - PostgreSQL Transaction Operations
 *
 * Transaction lifecycle management: begin, commit, rollback,
 * savepoints, and cleanup for the PostgresAdapter.
 */

import type { PoolClient } from "pg";
import {
  ConnectionError,
  TransactionError,
} from "../../types/index.js";
import { logger } from "../../utils/logger.js";
import { quoteIdentifier } from "../../utils/identifiers.js";
import { parsePostgresError } from "./tools/core/error-helpers.js";
import type { ConnectionPool } from "../../pool/ConnectionPool.js";

/**
 * Begin a transaction
 */
export async function beginTransaction(
  pool: ConnectionPool | null,
  activeTransactions: Map<string, PoolClient>,
  isolationLevel?: string,
): Promise<string> {
  if (!pool) {
    throw new ConnectionError("Not connected");
  }

  const client = await pool.getConnection();
  const transactionId = crypto.randomUUID();

  try {
    let beginCmd = "BEGIN";
    if (isolationLevel) {
      beginCmd = `BEGIN ISOLATION LEVEL ${isolationLevel}`;
    }
    await client.query(beginCmd);
    activeTransactions.set(transactionId, client);
    return transactionId;
  } catch (error) {
    client.release();
    throw new TransactionError(
      `Failed to begin transaction: ${String(error)}`,
    );
  }
}

/**
 * Commit a transaction
 */
export async function commitTransaction(
  activeTransactions: Map<string, PoolClient>,
  transactionId: string,
): Promise<void> {
  const client = activeTransactions.get(transactionId);
  if (!client) {
    throw new TransactionError(`Transaction not found: ${transactionId}`);
  }

  try {
    // Probe for aborted transaction state before committing.
    // In PostgreSQL, if any statement in a transaction fails, the transaction
    // enters an "aborted" state where only ROLLBACK is accepted. A COMMIT on
    // an aborted transaction silently performs a ROLLBACK — this probe detects
    // that situation and reports it clearly instead of lying with "committed".
    try {
      await client.query("SELECT 1");
    } catch (probeError) {
      const pgCode = (probeError as Record<string, unknown>)["code"] as
        | string
        | undefined;
      if (
        pgCode === "25P02" ||
        (probeError instanceof Error &&
          /current transaction is aborted/i.test(probeError.message))
      ) {
        // Transaction is aborted — rollback and report accurately.
        // Note: client.release() and Map cleanup are handled by the outer finally block.
        try {
          await client.query("ROLLBACK");
        } catch {
          // Ignore rollback failure — cleanup happens in finally
        }
        throw new TransactionError(
          "Transaction is in an aborted state and cannot be committed. " +
            "PostgreSQL has discarded all changes. " +
            "A previous statement in this transaction failed, putting it into an error state. " +
            "The transaction has been rolled back.",
        );
      }
      // Non-aborted probe error — let it fall through to COMMIT
    }

    await client.query("COMMIT");
  } finally {
    client.release();
    activeTransactions.delete(transactionId);
  }
}

/**
 * Rollback a transaction
 */
export async function rollbackTransaction(
  activeTransactions: Map<string, PoolClient>,
  transactionId: string,
): Promise<void> {
  const client = activeTransactions.get(transactionId);
  if (!client) {
    throw new TransactionError(`Transaction not found: ${transactionId}`);
  }

  try {
    await client.query("ROLLBACK");
  } finally {
    client.release();
    activeTransactions.delete(transactionId);
  }
}

/**
 * Create a savepoint
 */
export async function createSavepoint(
  activeTransactions: Map<string, PoolClient>,
  transactionId: string,
  savepointName: string,
): Promise<void> {
  const client = activeTransactions.get(transactionId);
  if (!client) {
    throw new TransactionError(`Transaction not found: ${transactionId}`);
  }

  try {
    await client.query(`SAVEPOINT ${quoteIdentifier(savepointName)}`);
  } catch (error) {
    throw parsePostgresError(error, {
      tool: "pg_transaction_savepoint",
    });
  }
}

/**
 * Release a savepoint
 */
export async function releaseSavepoint(
  activeTransactions: Map<string, PoolClient>,
  transactionId: string,
  savepointName: string,
): Promise<void> {
  const client = activeTransactions.get(transactionId);
  if (!client) {
    throw new TransactionError(`Transaction not found: ${transactionId}`);
  }

  try {
    await client.query(`RELEASE SAVEPOINT ${quoteIdentifier(savepointName)}`);
  } catch (error) {
    throw parsePostgresError(error, {
      tool: "pg_transaction_release",
    });
  }
}

/**
 * Rollback to a savepoint
 */
export async function rollbackToSavepoint(
  activeTransactions: Map<string, PoolClient>,
  transactionId: string,
  savepointName: string,
): Promise<void> {
  const client = activeTransactions.get(transactionId);
  if (!client) {
    throw new TransactionError(`Transaction not found: ${transactionId}`);
  }

  try {
    await client.query(
      `ROLLBACK TO SAVEPOINT ${quoteIdentifier(savepointName)}`,
    );
  } catch (error) {
    throw parsePostgresError(error, {
      tool: "pg_transaction_rollback_to",
    });
  }
}

/**
 * Rollback and cleanup a specific transaction by ID.
 * Used for cleaning up orphaned transactions after code mode errors.
 *
 * @param transactionId - The transaction ID to cleanup
 * @returns true if transaction was found and cleaned up, false if not found
 */
export async function cleanupTransaction(
  activeTransactions: Map<string, PoolClient>,
  transactionId: string,
): Promise<boolean> {
  const client = activeTransactions.get(transactionId);
  if (!client) {
    return false;
  }

  try {
    await client.query("ROLLBACK");
    client.release();
    activeTransactions.delete(transactionId);
    logger.warn(
      `Cleaned up orphaned transaction during code mode error recovery: ${transactionId}`,
      { module: "CODEMODE" as const },
    );
    return true;
  } catch (error) {
    // Best effort cleanup - log and continue
    logger.error("Failed to cleanup orphaned transaction", {
      module: "CODEMODE" as const,
      error: error instanceof Error ? error.message : String(error),
      transactionId,
    });
    // Still try to release the client
    try {
      client.release(true); // Force release with error
      activeTransactions.delete(transactionId);
    } catch {
      // Ignore - connection may be broken
    }
    return false;
  }
}
