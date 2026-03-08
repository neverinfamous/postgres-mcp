/**
 * postgres-mcp - Core Transaction Schemas
 *
 * Input validation schemas for transaction operations.
 */

import { z } from "zod";

import { defaultToEmpty } from "./queries.js";

// =============================================================================
// Transaction Schemas
// =============================================================================

/**
 * Preprocess transaction begin params:
 * - Normalize isolationLevel case (serializable → SERIALIZABLE)
 * - Handle shorthand forms (ru → READ UNCOMMITTED, etc.)
 */
function preprocessBeginParams(input: unknown): unknown {
  const normalized = defaultToEmpty(input) as Record<string, unknown>;
  if (typeof normalized["isolationLevel"] === "string") {
    const level = normalized["isolationLevel"].toUpperCase().trim();
    // Map shorthands
    const levelMap: Record<string, string> = {
      RU: "READ UNCOMMITTED",
      RC: "READ COMMITTED",
      RR: "REPEATABLE READ",
      S: "SERIALIZABLE",
      READUNCOMMITTED: "READ UNCOMMITTED",
      READCOMMITTED: "READ COMMITTED",
      REPEATABLEREAD: "REPEATABLE READ",
    };
    normalized["isolationLevel"] = levelMap[level.replace(/\s+/g, "")] ?? level;
  }
  return normalized;
}

// Base schema for MCP visibility — uses z.string() so invalid values reach the
// handler's try/catch instead of being rejected as raw MCP -32602 errors.
export const BeginTransactionSchemaBase = z.object({
  isolationLevel: z.string().optional().describe("Transaction isolation level"),
});

// Internal schema with strict enum validation (used inside handler try/catch)
const BeginTransactionValidationSchema = z.object({
  isolationLevel: z
    .enum([
      "READ UNCOMMITTED",
      "READ COMMITTED",
      "REPEATABLE READ",
      "SERIALIZABLE",
    ])
    .optional()
    .describe("Transaction isolation level"),
});

export const BeginTransactionSchema = z.preprocess(
  preprocessBeginParams,
  BeginTransactionValidationSchema,
);

// Base schema for MCP visibility (shows transactionId and aliases)
export const TransactionIdSchemaBase = z.object({
  transactionId: z
    .string()
    .optional()
    .describe("Transaction ID from pg_transaction_begin"),
  txId: z.string().optional().describe("Alias for transactionId"),
  tx: z.string().optional().describe("Alias for transactionId"),
});

// Transformed schema with alias resolution and undefined handling
export const TransactionIdSchema = z
  .preprocess(defaultToEmpty, TransactionIdSchemaBase)
  .transform((data) => ({
    transactionId: data.transactionId ?? data.txId ?? data.tx ?? "",
  }))
  .refine((data) => data.transactionId !== "", {
    message:
      'transactionId is required. Get one from pg_transaction_begin first, then pass {transactionId: "..."}',
  });

// Base schema for MCP visibility
export const SavepointSchemaBase = z.object({
  transactionId: z.string().optional().describe("Transaction ID"),
  txId: z.string().optional().describe("Alias for transactionId"),
  tx: z.string().optional().describe("Alias for transactionId"),
  name: z.string().optional().describe("Savepoint name"),
  savepoint: z.string().optional().describe("Alias for name"),
});

// Transformed schema with alias resolution and undefined handling
export const SavepointSchema = z
  .preprocess(defaultToEmpty, SavepointSchemaBase)
  .transform((data) => ({
    transactionId: data.transactionId ?? data.txId ?? data.tx ?? "",
    name: data.name ?? data.savepoint ?? "",
  }))
  .refine((data) => data.transactionId !== "" && data.name !== "", {
    message:
      'Both transactionId and name are required. Example: {transactionId: "...", name: "sp1"}',
  })
  .refine(
    (data) => data.name === "" || /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(data.name),
    {
      message:
        "Savepoint name must be a valid SQL identifier (letters, numbers, underscores only)",
    },
  );

// Base schema for MCP visibility
const ExecuteInTransactionSchemaBase = z.object({
  transactionId: z.string().optional().describe("Transaction ID"),
  txId: z.string().optional().describe("Alias for transactionId"),
  tx: z.string().optional().describe("Alias for transactionId"),
  sql: z.string().describe("SQL to execute"),
  params: z.array(z.unknown()).optional().describe("Query parameters"),
});

// Transformed schema with alias resolution
export const ExecuteInTransactionSchema =
  ExecuteInTransactionSchemaBase.transform((data) => ({
    transactionId: data.transactionId ?? data.txId ?? data.tx ?? "",
    sql: data.sql,
    params: data.params,
  })).refine((data) => data.transactionId !== "", {
    message: "transactionId (or txId/tx alias) is required",
  });

// Base schema for MCP visibility — uses z.record() for statement items and
// z.string() for isolationLevel so invalid values reach the handler's try/catch.
export const TransactionExecuteSchemaBase = z.object({
  statements: z
    .array(z.unknown())
    .optional()
    .describe(
      'Statements to execute atomically. Each must be an object with {sql: "..."} format.',
    ),
  transactionId: z
    .string()
    .optional()
    .describe(
      "Optional: Join existing transaction from pg_transaction_begin. If omitted, creates new auto-commit transaction.",
    ),
  txId: z.string().optional().describe("Alias for transactionId"),
  tx: z.string().optional().describe("Alias for transactionId"),
  isolationLevel: z.string().optional().describe("Transaction isolation level"),
});

// Internal schema with strict validation (used inside handler try/catch)
const TransactionExecuteValidationSchema = z.object({
  statements: z
    .array(
      z.object({
        sql: z.string().optional().describe("SQL statement to execute"),
        query: z.string().optional().describe("Alias for sql"),
        params: z.array(z.unknown()).optional().describe("Query parameters"),
      }),
    )
    .optional()
    .describe(
      'Statements to execute atomically. Each must be an object with {sql: "..."} format.',
    ),
  transactionId: z
    .string()
    .optional()
    .describe(
      "Optional: Join existing transaction from pg_transaction_begin. If omitted, creates new auto-commit transaction.",
    ),
  txId: z.string().optional().describe("Alias for transactionId"),
  tx: z.string().optional().describe("Alias for transactionId"),
  isolationLevel: z
    .enum([
      "READ UNCOMMITTED",
      "READ COMMITTED",
      "REPEATABLE READ",
      "SERIALIZABLE",
    ])
    .optional()
    .describe("Transaction isolation level"),
});

// Schema with undefined handling for pg_transaction_execute
export const TransactionExecuteSchema = z
  .preprocess(
    (val: unknown) => preprocessBeginParams(defaultToEmpty(val)),
    TransactionExecuteValidationSchema,
  )
  .transform((data) => ({
    statements: (data.statements ?? []).map((stmt) => ({
      sql: stmt.sql ?? stmt.query ?? "",
      params: stmt.params,
    })),
    transactionId: data.transactionId ?? data.txId ?? data.tx,
    isolationLevel: data.isolationLevel,
  }))
  .refine((data) => data.statements.length > 0, {
    message:
      'statements is required. Format: {statements: [{sql: "INSERT INTO..."}, {sql: "UPDATE..."}]}. Each statement must be an object with "sql" property, not a raw string.',
  })
  .refine((data) => data.statements.every((s) => s.sql !== ""), {
    message:
      'Each statement must have "sql" (or "query" alias). Format: {statements: [{sql: "INSERT INTO..."}]}',
  });

// =============================================================================
// Transaction Output Schemas
// =============================================================================

// Output schema for pg_transaction_begin
export const TransactionBeginOutputSchema = z.object({
  success: z
    .boolean()
    .optional()
    .describe("False when the operation failed (omitted on success)"),
  error: z.string().optional().describe("Error message when success is false"),
  transactionId: z
    .string()
    .optional()
    .describe("Unique transaction ID for subsequent operations"),
  isolationLevel: z.string().optional().describe("Transaction isolation level"),
  message: z.string().optional().describe("Confirmation message"),
});

// Output schema for pg_transaction_commit, pg_transaction_rollback
export const TransactionResultOutputSchema = z.object({
  success: z.boolean().describe("Whether the operation succeeded"),
  error: z.string().optional().describe("Error message when success is false"),
  transactionId: z
    .string()
    .optional()
    .describe("Transaction ID that was operated on"),
  message: z.string().optional().describe("Result message"),
});

// Output schema for pg_transaction_savepoint, pg_transaction_release, pg_transaction_rollback_to
export const SavepointResultOutputSchema = z.object({
  success: z.boolean().describe("Whether the operation succeeded"),
  error: z.string().optional().describe("Error message when success is false"),
  transactionId: z.string().optional().describe("Transaction ID"),
  savepoint: z.string().optional().describe("Savepoint name"),
  message: z.string().optional().describe("Result message"),
});

// Statement result schema for transaction execute
const StatementResultSchema = z.object({
  sql: z.string().describe("Executed SQL statement"),
  rowsAffected: z.number().describe("Number of rows affected"),
  rowCount: z.number().describe("Number of rows returned"),
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Returned rows (when using RETURNING)"),
});

// Output schema for pg_transaction_execute
export const TransactionExecuteOutputSchema = z.object({
  success: z.boolean().describe("Whether all statements executed successfully"),
  error: z.string().optional().describe("Error message when success is false"),
  statementsExecuted: z
    .number()
    .optional()
    .describe("Number of statements executed"),
  statementsTotal: z
    .number()
    .optional()
    .describe("Total number of statements attempted"),
  failedStatement: z
    .string()
    .optional()
    .describe("SQL of the statement that failed"),
  autoRolledBack: z
    .boolean()
    .optional()
    .describe("Whether the transaction was automatically rolled back"),
  results: z
    .array(StatementResultSchema)
    .optional()
    .describe("Results from each statement"),
  transactionId: z
    .string()
    .optional()
    .describe("Transaction ID (when joining existing transaction)"),
});
