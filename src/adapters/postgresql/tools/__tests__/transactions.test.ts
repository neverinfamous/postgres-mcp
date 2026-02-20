/**
 * postgres-mcp - Transaction Tools Unit Tests
 *
 * Tests for PostgreSQL transaction tools with focus on
 * BEGIN, COMMIT, ROLLBACK, and savepoint operations.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTransactionTools } from "../transactions.js";
import type { PostgresAdapter } from "../../PostgresAdapter.js";
import {
  createMockPostgresAdapter,
  createMockPostgresAdapterWithTransaction,
  createMockRequestContext,
} from "../../../../__tests__/mocks/index.js";

describe("getTransactionTools", () => {
  let adapter: PostgresAdapter;
  let tools: ReturnType<typeof getTransactionTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockPostgresAdapter() as unknown as PostgresAdapter;
    tools = getTransactionTools(adapter);
  });

  it("should return 7 transaction tools", () => {
    expect(tools).toHaveLength(7);
  });

  it("should have all expected tool names", () => {
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("pg_transaction_begin");
    expect(toolNames).toContain("pg_transaction_commit");
    expect(toolNames).toContain("pg_transaction_rollback");
    expect(toolNames).toContain("pg_transaction_savepoint");
    expect(toolNames).toContain("pg_transaction_release");
    expect(toolNames).toContain("pg_transaction_rollback_to");
    expect(toolNames).toContain("pg_transaction_execute");
  });

  it("should have group set to transactions for all tools", () => {
    for (const tool of tools) {
      expect(tool.group).toBe("transactions");
    }
  });

  it("should have handler function for all tools", () => {
    for (const tool of tools) {
      expect(typeof tool.handler).toBe("function");
    }
  });
});

describe("Tool Annotations", () => {
  let tools: ReturnType<typeof getTransactionTools>;

  beforeEach(() => {
    tools = getTransactionTools(
      createMockPostgresAdapter() as unknown as PostgresAdapter,
    );
  });

  it("all transaction tools should be write operations", () => {
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(false);
    }
  });
});

describe("pg_transaction_begin", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTransactionTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTransactionTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should begin a transaction and return transaction ID", async () => {
    (
      mockAdapter.beginTransaction as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce("txn-12345");

    const tool = tools.find((t) => t.name === "pg_transaction_begin")!;
    const result = (await tool.handler({}, mockContext)) as {
      transactionId: string;
      isolationLevel: string;
    };

    expect(mockAdapter.beginTransaction).toHaveBeenCalled();
    expect(result.transactionId).toBe("txn-12345");
    expect(result.isolationLevel).toBe("READ COMMITTED");
  });

  it("should accept isolation level parameter", async () => {
    (
      mockAdapter.beginTransaction as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce("txn-12345");

    const tool = tools.find((t) => t.name === "pg_transaction_begin")!;
    const result = (await tool.handler(
      { isolationLevel: "SERIALIZABLE" },
      mockContext,
    )) as {
      isolationLevel: string;
    };

    expect(mockAdapter.beginTransaction).toHaveBeenCalledWith("SERIALIZABLE");
    expect(result.isolationLevel).toBe("SERIALIZABLE");
  });
});

describe("pg_transaction_commit", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTransactionTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTransactionTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should commit a transaction", async () => {
    const tool = tools.find((t) => t.name === "pg_transaction_commit")!;
    const result = (await tool.handler(
      { transactionId: "txn-12345" },
      mockContext,
    )) as {
      success: boolean;
      transactionId: string;
    };

    expect(mockAdapter.commitTransaction).toHaveBeenCalledWith("txn-12345");
    expect(result.success).toBe(true);
    expect(result.transactionId).toBe("txn-12345");
  });
});

describe("pg_transaction_rollback", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTransactionTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTransactionTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should rollback a transaction", async () => {
    const tool = tools.find((t) => t.name === "pg_transaction_rollback")!;
    const result = (await tool.handler(
      { transactionId: "txn-12345" },
      mockContext,
    )) as {
      success: boolean;
      transactionId: string;
    };

    expect(mockAdapter.rollbackTransaction).toHaveBeenCalledWith("txn-12345");
    expect(result.success).toBe(true);
    expect(result.transactionId).toBe("txn-12345");
  });
});

describe("pg_transaction_savepoint", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTransactionTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTransactionTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should create a savepoint", async () => {
    const tool = tools.find((t) => t.name === "pg_transaction_savepoint")!;
    const result = (await tool.handler(
      {
        transactionId: "txn-12345",
        name: "my_savepoint",
      },
      mockContext,
    )) as {
      success: boolean;
      savepoint: string;
    };

    expect(mockAdapter.createSavepoint).toHaveBeenCalledWith(
      "txn-12345",
      "my_savepoint",
    );
    expect(result.success).toBe(true);
    expect(result.savepoint).toBe("my_savepoint");
  });

  it("should accept savepoint as alias for name", async () => {
    const tool = tools.find((t) => t.name === "pg_transaction_savepoint")!;
    const result = (await tool.handler(
      {
        transactionId: "txn-12345",
        savepoint: "sp1", // Using alias
      },
      mockContext,
    )) as {
      success: boolean;
      savepoint: string;
    };

    expect(mockAdapter.createSavepoint).toHaveBeenCalledWith(
      "txn-12345",
      "sp1",
    );
    expect(result.success).toBe(true);
    expect(result.savepoint).toBe("sp1");
  });
});

describe("pg_transaction_release", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTransactionTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTransactionTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should release a savepoint", async () => {
    const tool = tools.find((t) => t.name === "pg_transaction_release")!;
    const result = (await tool.handler(
      {
        transactionId: "txn-12345",
        name: "my_savepoint",
      },
      mockContext,
    )) as {
      success: boolean;
      savepoint: string;
    };

    expect(mockAdapter.releaseSavepoint).toHaveBeenCalledWith(
      "txn-12345",
      "my_savepoint",
    );
    expect(result.success).toBe(true);
    expect(result.savepoint).toBe("my_savepoint");
  });

  it("should accept savepoint as alias for name", async () => {
    const tool = tools.find((t) => t.name === "pg_transaction_release")!;
    const result = (await tool.handler(
      {
        txId: "txn-12345", // Using txId alias too
        savepoint: "sp1", // Using savepoint alias
      },
      mockContext,
    )) as {
      success: boolean;
      savepoint: string;
    };

    expect(mockAdapter.releaseSavepoint).toHaveBeenCalledWith(
      "txn-12345",
      "sp1",
    );
    expect(result.success).toBe(true);
    expect(result.savepoint).toBe("sp1");
  });
});

describe("pg_transaction_rollback_to", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTransactionTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTransactionTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should rollback to a savepoint", async () => {
    const tool = tools.find((t) => t.name === "pg_transaction_rollback_to")!;
    const result = (await tool.handler(
      {
        transactionId: "txn-12345",
        name: "my_savepoint",
      },
      mockContext,
    )) as {
      success: boolean;
      savepoint: string;
    };

    expect(mockAdapter.rollbackToSavepoint).toHaveBeenCalledWith(
      "txn-12345",
      "my_savepoint",
    );
    expect(result.success).toBe(true);
    expect(result.savepoint).toBe("my_savepoint");
  });

  it("should accept savepoint as alias for name", async () => {
    const tool = tools.find((t) => t.name === "pg_transaction_rollback_to")!;
    const result = (await tool.handler(
      {
        tx: "txn-12345", // Using tx alias
        savepoint: "sp1", // Using savepoint alias
      },
      mockContext,
    )) as {
      success: boolean;
      savepoint: string;
    };

    expect(mockAdapter.rollbackToSavepoint).toHaveBeenCalledWith(
      "txn-12345",
      "sp1",
    );
    expect(result.success).toBe(true);
    expect(result.savepoint).toBe("sp1");
  });
});

describe("pg_transaction_execute", () => {
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockRequestContext();
  });

  it("should execute multiple statements atomically", async () => {
    const mockAdapterWithTxn = createMockPostgresAdapterWithTransaction();
    mockAdapterWithTxn.mockConnection.query.mockResolvedValue({
      rows: [],
      rowCount: 1,
    });

    // Mock executeOnConnection
    (
      mockAdapterWithTxn as unknown as { executeOnConnection: typeof vi.fn }
    ).executeOnConnection = vi
      .fn()
      .mockResolvedValue({ rows: [], rowsAffected: 1 });

    const tools = getTransactionTools(
      mockAdapterWithTxn as unknown as PostgresAdapter,
    );
    const tool = tools.find((t) => t.name === "pg_transaction_execute")!;

    const result = (await tool.handler(
      {
        statements: [
          { sql: "INSERT INTO users (name) VALUES ($1)", params: ["Alice"] },
          { sql: "INSERT INTO users (name) VALUES ($1)", params: ["Bob"] },
        ],
      },
      mockContext,
    )) as {
      success: boolean;
      statementsExecuted: number;
    };

    expect(mockAdapterWithTxn.beginTransaction).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.statementsExecuted).toBe(2);
    expect(mockAdapterWithTxn.commitTransaction).toHaveBeenCalled();
  });

  it("should return structured error on rollback failure", async () => {
    const mockAdapterWithTxn = createMockPostgresAdapterWithTransaction();

    // Mock executeOnConnection to fail on second call
    (
      mockAdapterWithTxn as unknown as { executeOnConnection: typeof vi.fn }
    ).executeOnConnection = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowsAffected: 1 })
      .mockRejectedValueOnce(new Error("Constraint violation"));

    const tools = getTransactionTools(
      mockAdapterWithTxn as unknown as PostgresAdapter,
    );
    const tool = tools.find((t) => t.name === "pg_transaction_execute")!;

    const result = (await tool.handler(
      {
        statements: [
          { sql: "INSERT INTO users (name) VALUES ($1)", params: ["Alice"] },
          { sql: "INSERT INTO users (name) VALUES ($1)", params: ["Bob"] },
        ],
      },
      mockContext,
    )) as { success: boolean; error: string; autoRolledBack: boolean };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Constraint violation");
    expect(result.autoRolledBack).toBe(true);
    expect(mockAdapterWithTxn.rollbackTransaction).toHaveBeenCalled();
  });

  it("should join existing transaction when transactionId provided", async () => {
    const mockAdapterWithTxn = createMockPostgresAdapterWithTransaction();
    (
      mockAdapterWithTxn as unknown as { executeOnConnection: typeof vi.fn }
    ).executeOnConnection = vi
      .fn()
      .mockResolvedValue({ rows: [], rowsAffected: 1 });

    const tools = getTransactionTools(
      mockAdapterWithTxn as unknown as PostgresAdapter,
    );
    const tool = tools.find((t) => t.name === "pg_transaction_execute")!;

    const result = (await tool.handler(
      {
        transactionId: "existing-txn-001",
        statements: [{ sql: "UPDATE users SET name = 'Test' WHERE id = 1" }],
      },
      mockContext,
    )) as {
      success: boolean;
      transactionId: string;
    };

    // Should NOT begin a new transaction
    expect(mockAdapterWithTxn.beginTransaction).not.toHaveBeenCalled();
    // Should NOT auto-commit (caller controls transaction)
    expect(mockAdapterWithTxn.commitTransaction).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.transactionId).toBe("existing-txn-001");
  });

  it("should return structured error when connection is lost", async () => {
    const mockAdapterWithTxn = createMockPostgresAdapterWithTransaction();
    // Return null for connection
    mockAdapterWithTxn.getTransactionConnection = vi.fn().mockReturnValue(null);

    const tools = getTransactionTools(
      mockAdapterWithTxn as unknown as PostgresAdapter,
    );
    const tool = tools.find((t) => t.name === "pg_transaction_execute")!;

    const result = (await tool.handler(
      {
        statements: [{ sql: "SELECT 1" }],
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Transaction connection lost");
  });

  it("should return structured error when joining non-existent transaction", async () => {
    const mockAdapterWithTxn = createMockPostgresAdapterWithTransaction();
    // Return undefined for non-existent transaction
    mockAdapterWithTxn.getTransactionConnection = vi
      .fn()
      .mockReturnValue(undefined);

    const tools = getTransactionTools(
      mockAdapterWithTxn as unknown as PostgresAdapter,
    );
    const tool = tools.find((t) => t.name === "pg_transaction_execute")!;

    const result = (await tool.handler(
      {
        transactionId: "non-existent-txn",
        statements: [{ sql: "SELECT 1" }],
      },
      mockContext,
    )) as { success: boolean; error: string; transactionId: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Transaction not found");
    expect(result.transactionId).toBe("non-existent-txn");
  });

  it("should include rows when RETURNING clause is used", async () => {
    const mockAdapterWithTxn = createMockPostgresAdapterWithTransaction();
    (
      mockAdapterWithTxn as unknown as { executeOnConnection: typeof vi.fn }
    ).executeOnConnection = vi.fn().mockResolvedValue({
      rows: [{ id: 1, name: "Alice" }],
      rowsAffected: 1,
    });

    const tools = getTransactionTools(
      mockAdapterWithTxn as unknown as PostgresAdapter,
    );
    const tool = tools.find((t) => t.name === "pg_transaction_execute")!;

    const result = (await tool.handler(
      {
        statements: [
          {
            sql: "INSERT INTO users (name) VALUES ($1) RETURNING id, name",
            params: ["Alice"],
          },
        ],
      },
      mockContext,
    )) as {
      results: { rows: { id: number; name: string }[] }[];
    };

    expect(result.results[0].rows).toEqual([{ id: 1, name: "Alice" }]);
  });

  it("should parse string rowsAffected to number", async () => {
    const mockAdapterWithTxn = createMockPostgresAdapterWithTransaction();
    (
      mockAdapterWithTxn as unknown as { executeOnConnection: typeof vi.fn }
    ).executeOnConnection = vi.fn().mockResolvedValue({
      rows: [],
      rowsAffected: "5", // String instead of number
    });

    const tools = getTransactionTools(
      mockAdapterWithTxn as unknown as PostgresAdapter,
    );
    const tool = tools.find((t) => t.name === "pg_transaction_execute")!;

    const result = (await tool.handler(
      {
        statements: [{ sql: "UPDATE users SET active = true" }],
      },
      mockContext,
    )) as {
      results: { rowsAffected: number }[];
    };

    expect(result.results[0].rowsAffected).toBe(5);
    expect(typeof result.results[0].rowsAffected).toBe("number");
  });
});

// =============================================================================
// Structured Error Handling - Transaction Not Found
// =============================================================================

describe("Transaction error handling - invalid transactionId", () => {
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockRequestContext();
  });

  it("pg_transaction_commit should return structured error for invalid txId", async () => {
    const mockAdapter = createMockPostgresAdapter();
    const txError = new Error("Transaction not found: bad-txn-id");
    txError.name = "TransactionError";
    (
      mockAdapter.commitTransaction as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(txError);

    const tools = getTransactionTools(
      mockAdapter as unknown as PostgresAdapter,
    );
    const tool = tools.find((t) => t.name === "pg_transaction_commit")!;

    const result = (await tool.handler(
      { transactionId: "bad-txn-id" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Transaction not found");
  });

  it("pg_transaction_rollback should return structured error for invalid txId", async () => {
    const mockAdapter = createMockPostgresAdapter();
    const txError = new Error("Transaction not found: bad-txn-id");
    txError.name = "TransactionError";
    (
      mockAdapter.rollbackTransaction as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(txError);

    const tools = getTransactionTools(
      mockAdapter as unknown as PostgresAdapter,
    );
    const tool = tools.find((t) => t.name === "pg_transaction_rollback")!;

    const result = (await tool.handler(
      { transactionId: "bad-txn-id" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Transaction not found");
  });

  it("pg_transaction_begin should return structured error on adapter failure", async () => {
    const mockAdapter = createMockPostgresAdapter();
    const adapterError = new Error("Connection pool exhausted");
    (
      mockAdapter.beginTransaction as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(adapterError);

    const tools = getTransactionTools(
      mockAdapter as unknown as PostgresAdapter,
    );
    const tool = tools.find((t) => t.name === "pg_transaction_begin")!;

    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Connection pool exhausted");
  });
});

// =============================================================================
// Structured Error Handling - Savepoint Errors
// =============================================================================

describe("Transaction savepoint error handling", () => {
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockRequestContext();
  });

  it("pg_transaction_release should return structured error for nonexistent savepoint", async () => {
    const mockAdapter = createMockPostgresAdapter();
    const pgError = new Error('savepoint "my_sp" does not exist') as Error & {
      code: string;
    };
    pgError.code = "3B001";
    (
      mockAdapter.releaseSavepoint as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(pgError);

    const tools = getTransactionTools(
      mockAdapter as unknown as PostgresAdapter,
    );
    const tool = tools.find((t) => t.name === "pg_transaction_release")!;

    const result = (await tool.handler(
      { transactionId: "txn-123", name: "my_sp" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
  });

  it("pg_transaction_rollback_to should return structured error for nonexistent savepoint", async () => {
    const mockAdapter = createMockPostgresAdapter();
    const pgError = new Error('savepoint "bad_sp" does not exist') as Error & {
      code: string;
    };
    pgError.code = "3B001";
    (
      mockAdapter.rollbackToSavepoint as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(pgError);

    const tools = getTransactionTools(
      mockAdapter as unknown as PostgresAdapter,
    );
    const tool = tools.find((t) => t.name === "pg_transaction_rollback_to")!;

    const result = (await tool.handler(
      { transactionId: "txn-123", name: "bad_sp" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
  });

  it("pg_transaction_savepoint should return structured error for aborted transaction state", async () => {
    const mockAdapter = createMockPostgresAdapter();
    // The real adapter's createSavepoint wraps the PG error via parsePostgresError,
    // so the mock should throw the structured error that the real adapter would produce.
    const structuredError = new Error(
      "Transaction is in an aborted state — only ROLLBACK or ROLLBACK TO SAVEPOINT commands are allowed. " +
        "A previous statement in this transaction failed, putting it into an error state. " +
        "Use pg_transaction_rollback to end it, or pg_transaction_rollback_to to recover to a savepoint.",
    );
    (
      mockAdapter.createSavepoint as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(structuredError);

    const tools = getTransactionTools(
      mockAdapter as unknown as PostgresAdapter,
    );
    const tool = tools.find((t) => t.name === "pg_transaction_savepoint")!;

    const result = (await tool.handler(
      { transactionId: "txn-123", name: "sp1" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("aborted state");
  });
});

// =============================================================================
// Structured Error Handling - Commit After Abort
// =============================================================================

describe("pg_transaction_commit - aborted state detection", () => {
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockRequestContext();
  });

  it("should return structured error when committing an aborted transaction", async () => {
    const mockAdapter = createMockPostgresAdapter();
    const txError = new Error(
      "Transaction is in an aborted state and cannot be committed. " +
        "PostgreSQL has discarded all changes. " +
        "A previous statement in this transaction failed, putting it into an error state. " +
        "The transaction has been rolled back.",
    );
    txError.name = "TransactionError";
    (
      mockAdapter.commitTransaction as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(txError);

    const tools = getTransactionTools(
      mockAdapter as unknown as PostgresAdapter,
    );
    const tool = tools.find((t) => t.name === "pg_transaction_commit")!;

    const result = (await tool.handler(
      { transactionId: "txn-aborted" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("aborted state");
  });
});

// =============================================================================
// Structured Error Handling - Execute Error Path
// =============================================================================

describe("pg_transaction_execute - structured error handling", () => {
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockRequestContext();
  });

  it("should include autoRolledBack and context in error for auto-commit mode", async () => {
    const mockAdapterWithTxn = createMockPostgresAdapterWithTransaction();

    // First statement succeeds, second fails with nonexistent table
    const pgError = new Error(
      'relation "nonexistent_table" does not exist',
    ) as Error & { code: string };
    pgError.code = "42P01";

    (
      mockAdapterWithTxn as unknown as { executeOnConnection: typeof vi.fn }
    ).executeOnConnection = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowsAffected: 1 })
      .mockRejectedValueOnce(pgError);

    const tools = getTransactionTools(
      mockAdapterWithTxn as unknown as PostgresAdapter,
    );
    const tool = tools.find((t) => t.name === "pg_transaction_execute")!;

    const result = (await tool.handler(
      {
        statements: [
          { sql: "INSERT INTO users (name) VALUES ('Alice')" },
          { sql: "INSERT INTO nonexistent_table VALUES (1)" },
        ],
      },
      mockContext,
    )) as {
      success: boolean;
      error: string;
      autoRolledBack: boolean;
      statementsExecuted: number;
      failedStatement: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("automatically rolled back");
    expect(result.autoRolledBack).toBe(true);
    expect(result.statementsExecuted).toBe(1);
    expect(result.failedStatement).toBe(
      "INSERT INTO nonexistent_table VALUES (1)",
    );

    // Should have attempted rollback
    expect(mockAdapterWithTxn.rollbackTransaction).toHaveBeenCalled();
  });

  it("should NOT include autoRolledBack in error for join-existing mode", async () => {
    const mockAdapterWithTxn = createMockPostgresAdapterWithTransaction();

    const pgError = new Error(
      'relation "bad_table" does not exist',
    ) as Error & { code: string };
    pgError.code = "42P01";

    (
      mockAdapterWithTxn as unknown as { executeOnConnection: typeof vi.fn }
    ).executeOnConnection = vi.fn().mockRejectedValueOnce(pgError);

    const tools = getTransactionTools(
      mockAdapterWithTxn as unknown as PostgresAdapter,
    );
    const tool = tools.find((t) => t.name === "pg_transaction_execute")!;

    const result = (await tool.handler(
      {
        transactionId: "existing-txn",
        statements: [{ sql: "INSERT INTO bad_table VALUES (1)" }],
      },
      mockContext,
    )) as {
      success: boolean;
      error: string;
      autoRolledBack?: boolean;
      transactionId?: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
    expect(result.error).not.toContain("automatically rolled back");
    expect(result.autoRolledBack).toBeUndefined();
    expect(result.transactionId).toBe("existing-txn");

    // Should NOT have rolled back the existing transaction
    expect(mockAdapterWithTxn.rollbackTransaction).not.toHaveBeenCalled();
  });
});
