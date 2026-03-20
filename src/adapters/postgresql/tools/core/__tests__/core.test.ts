/**
 * postgres-mcp - Core Tools Unit Tests
 *
 * Tests for core database operations with focus on tool definitions,
 * schema validation, and handler execution behavior.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCoreTools } from "../index.js";
import type { PostgresAdapter } from "../../../postgres-adapter.js";
import {
  createMockPostgresAdapter,
  createMockQueryResult,
  createMockRequestContext,
} from "../../../../../__tests__/mocks/index.js";
import { parsePostgresError, formatPostgresError } from "../error-helpers.js";

describe("getCoreTools", () => {
  let adapter: PostgresAdapter;
  let tools: ReturnType<typeof getCoreTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockPostgresAdapter() as unknown as PostgresAdapter;
    tools = getCoreTools(adapter);
  });

  it("should return 20 core tools", () => {
    expect(tools).toHaveLength(20);
  });

  it("should have all expected tool names", () => {
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("pg_read_query");
    expect(toolNames).toContain("pg_write_query");
    expect(toolNames).toContain("pg_list_tables");
    expect(toolNames).toContain("pg_describe_table");
    expect(toolNames).toContain("pg_create_table");
    expect(toolNames).toContain("pg_drop_table");
    expect(toolNames).toContain("pg_get_indexes");
    expect(toolNames).toContain("pg_create_index");
    expect(toolNames).toContain("pg_list_objects");
    expect(toolNames).toContain("pg_object_details");
    expect(toolNames).toContain("pg_list_extensions");
  });

  it("should have handler function for all tools", () => {
    for (const tool of tools) {
      expect(typeof tool.handler).toBe("function");
    }
  });

  it("should have inputSchema for all tools", () => {
    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it("should have group set to core for all tools", () => {
    for (const tool of tools) {
      expect(tool.group).toBe("core");
    }
  });
});

describe("Tool Annotations", () => {
  let tools: ReturnType<typeof getCoreTools>;

  beforeEach(() => {
    tools = getCoreTools(
      createMockPostgresAdapter() as unknown as PostgresAdapter,
    );
  });

  it("pg_read_query should be read-only", () => {
    const tool = tools.find((t) => t.name === "pg_read_query")!;
    expect(tool.annotations?.readOnlyHint).toBe(true);
  });

  it("pg_write_query should be destructive", () => {
    const tool = tools.find((t) => t.name === "pg_write_query")!;
    expect(tool.annotations?.readOnlyHint).toBe(false);
  });

  it("pg_drop_table should be destructive", () => {
    const tool = tools.find((t) => t.name === "pg_drop_table")!;
    expect(tool.annotations?.readOnlyHint).toBe(false);
  });

  it("pg_list_tables should be read-only", () => {
    const tool = tools.find((t) => t.name === "pg_list_tables")!;
    expect(tool.annotations?.readOnlyHint).toBe(true);
  });
});

describe("Handler Execution", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  describe("pg_read_query", () => {
    it("should execute read query and return result", async () => {
      const expectedResult = createMockQueryResult([{ id: 1, name: "test" }]);
      mockAdapter.executeReadQuery.mockResolvedValue(expectedResult);

      const tool = tools.find((t) => t.name === "pg_read_query")!;
      const result = (await tool.handler(
        { sql: "SELECT * FROM users" },
        mockContext,
      )) as {
        rows: unknown[];
        rowCount: number;
      };

      expect(mockAdapter.executeReadQuery).toHaveBeenCalledWith(
        "SELECT * FROM users",
        undefined,
      );
      expect(result.rows).toEqual([{ id: 1, name: "test" }]);
      expect(result.rowCount).toBe(1);
    });

    it("should pass query parameters", async () => {
      mockAdapter.executeReadQuery.mockResolvedValue(createMockQueryResult([]));

      const tool = tools.find((t) => t.name === "pg_read_query")!;
      await tool.handler(
        { sql: "SELECT * FROM users WHERE id = $1", params: [42] },
        mockContext,
      );

      expect(mockAdapter.executeReadQuery).toHaveBeenCalledWith(
        "SELECT * FROM users WHERE id = $1",
        [42],
      );
    });

    it("should return 0 rowCount when rows is undefined (line 29 branch)", async () => {
      mockAdapter.executeReadQuery.mockResolvedValue({
        rows: undefined as unknown as Record<string, unknown>[],
        executionTimeMs: 5,
      });

      const tool = tools.find((t) => t.name === "pg_read_query")!;
      const result = (await tool.handler({ sql: "SELECT 1" }, mockContext)) as {
        rows: unknown;
        rowCount: number;
      };

      expect(result.rowCount).toBe(0);
    });

    it("should execute query in transaction when transactionId is provided", async () => {
      const mockClient = { query: vi.fn() };
      (
        mockAdapter.getTransactionConnection as ReturnType<typeof vi.fn>
      ).mockReturnValue(mockClient);
      (
        mockAdapter.executeOnConnection as ReturnType<typeof vi.fn>
      ).mockResolvedValue(createMockQueryResult([{ id: 1 }]));

      const tool = tools.find((t) => t.name === "pg_read_query")!;
      const result = (await tool.handler(
        { sql: "SELECT * FROM users", transactionId: "tx-123" },
        mockContext,
      )) as { rows: unknown[] };

      expect(mockAdapter.getTransactionConnection).toHaveBeenCalledWith(
        "tx-123",
      );
      expect(mockAdapter.executeOnConnection).toHaveBeenCalledWith(
        mockClient,
        "SELECT * FROM users",
        undefined,
      );
      expect(result.rows).toEqual([{ id: 1 }]);
    });

    it("should return structured error for invalid transactionId", async () => {
      (
        mockAdapter.getTransactionConnection as ReturnType<typeof vi.fn>
      ).mockReturnValue(undefined);

      const tool = tools.find((t) => t.name === "pg_read_query")!;

      const result = (await tool.handler(
        { sql: "SELECT 1", transactionId: "invalid-tx" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Invalid or expired transactionId/);
    });

    it("should include fields metadata when available", async () => {
      mockAdapter.executeReadQuery.mockResolvedValue({
        rows: [{ id: 1 }],
        fields: [{ name: "id", dataTypeID: 23 }],
        executionTimeMs: 5,
      });

      const tool = tools.find((t) => t.name === "pg_read_query")!;
      const result = (await tool.handler(
        { sql: "SELECT id FROM users" },
        mockContext,
      )) as { fields: Array<{ name: string; dataTypeID: number }> };

      expect(result.fields).toEqual([{ name: "id", dataTypeID: 23 }]);
    });
  });

  describe("pg_write_query", () => {
    it("should execute write query and return affected rows", async () => {
      mockAdapter.executeWriteQuery.mockResolvedValue({
        rows: [],
        rowsAffected: 5,
        command: "UPDATE",
        executionTimeMs: 10,
      });

      const tool = tools.find((t) => t.name === "pg_write_query")!;
      const result = (await tool.handler(
        {
          sql: "UPDATE users SET active = true",
        },
        mockContext,
      )) as { rowsAffected: number; command: string };

      expect(mockAdapter.executeWriteQuery).toHaveBeenCalled();
      expect(result.rowsAffected).toBe(5);
      expect(result.command).toBe("UPDATE");
    });

    it("should return structured error for SELECT statements", async () => {
      const tool = tools.find((t) => t.name === "pg_write_query")!;

      const result = (await tool.handler(
        { sql: "SELECT * FROM users" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(
        /pg_write_query is for INSERT\/UPDATE\/DELETE only/,
      );
    });

    it("should return structured error for SELECT with leading spaces", async () => {
      const tool = tools.find((t) => t.name === "pg_write_query")!;

      const result = (await tool.handler(
        { sql: "   SELECT * FROM users" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(
        /pg_write_query is for INSERT\/UPDATE\/DELETE only/,
      );
    });

    it("should execute query in transaction when transactionId is provided", async () => {
      const mockClient = { query: vi.fn() };
      (
        mockAdapter.getTransactionConnection as ReturnType<typeof vi.fn>
      ).mockReturnValue(mockClient);
      (
        mockAdapter.executeOnConnection as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        rows: [],
        rowsAffected: 3,
        command: "UPDATE",
        executionTimeMs: 5,
      });

      const tool = tools.find((t) => t.name === "pg_write_query")!;
      const result = (await tool.handler(
        { sql: "UPDATE users SET active = true", transactionId: "tx-456" },
        mockContext,
      )) as { rowsAffected: number };

      expect(mockAdapter.getTransactionConnection).toHaveBeenCalledWith(
        "tx-456",
      );
      expect(mockAdapter.executeOnConnection).toHaveBeenCalled();
      expect(result.rowsAffected).toBe(3);
    });

    it("should return structured error for invalid transactionId in write", async () => {
      (
        mockAdapter.getTransactionConnection as ReturnType<typeof vi.fn>
      ).mockReturnValue(undefined);

      const tool = tools.find((t) => t.name === "pg_write_query")!;

      const result = (await tool.handler(
        { sql: "UPDATE users SET x = 1", transactionId: "bad-tx" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Invalid or expired transactionId/);
    });

    it("should include RETURNING clause rows in result", async () => {
      mockAdapter.executeWriteQuery.mockResolvedValue({
        rows: [{ id: 1, name: "test" }],
        rowsAffected: 1,
        command: "INSERT",
        executionTimeMs: 5,
      });

      const tool = tools.find((t) => t.name === "pg_write_query")!;
      const result = (await tool.handler(
        { sql: "INSERT INTO users (name) VALUES ($1) RETURNING *" },
        mockContext,
      )) as { rows: unknown[] };

      expect(result.rows).toEqual([{ id: 1, name: "test" }]);
    });

    it("should default rowsAffected to 0 for DDL statements", async () => {
      mockAdapter.executeWriteQuery.mockResolvedValue({
        rows: [],
        rowsAffected: undefined,
        command: "CREATE",
        executionTimeMs: 8,
      });

      const tool = tools.find((t) => t.name === "pg_write_query")!;
      const result = (await tool.handler(
        { sql: "CREATE TABLE temp_ddl (id SERIAL)" },
        mockContext,
      )) as { rowsAffected: number; affectedRows: number; command: string };

      expect(result.rowsAffected).toBe(0);
      expect(result.affectedRows).toBe(0);
      expect(result.command).toBe("CREATE");
    });
  });

  describe("pg_list_tables", () => {
    it("should call listTables adapter method", async () => {
      const tool = tools.find((t) => t.name === "pg_list_tables")!;
      await tool.handler({}, mockContext);

      expect(mockAdapter.listTables).toHaveBeenCalled();
    });

    it("should filter by schema when provided", async () => {
      mockAdapter.listTables.mockResolvedValue([
        { name: "users", schema: "public" },
        { name: "orders", schema: "public" },
        { name: "archive", schema: "history" },
      ]);

      const tool = tools.find((t) => t.name === "pg_list_tables")!;
      const result = (await tool.handler(
        { schema: "public" },
        mockContext,
      )) as { tables: Array<{ name: string; schema: string }>; count: number };

      expect(result.tables.length).toBe(2);
      expect(result.tables.every((t) => t.schema === "public")).toBe(true);
    });

    it("should truncate results exceeding limit", async () => {
      // Create 150 mock tables
      const manyTables = Array.from({ length: 150 }, (_, i) => ({
        name: `table_${String(i)}`,
        schema: "public",
      }));
      mockAdapter.listTables.mockResolvedValue(manyTables);

      const tool = tools.find((t) => t.name === "pg_list_tables")!;
      const result = (await tool.handler({}, mockContext)) as {
        tables: unknown[];
        count: number;
        totalCount: number;
        truncated?: boolean;
        hint?: string;
      };

      expect(result.count).toBe(100); // Default limit
      expect(result.totalCount).toBe(150);
      expect(result.truncated).toBe(true);
      expect(result.hint).toContain("100 of 150");
    });

    it("should respect custom limit", async () => {
      const manyTables = Array.from({ length: 50 }, (_, i) => ({
        name: `table_${String(i)}`,
        schema: "public",
      }));
      mockAdapter.listTables.mockResolvedValue(manyTables);

      const tool = tools.find((t) => t.name === "pg_list_tables")!;
      const result = (await tool.handler({ limit: 10 }, mockContext)) as {
        tables: unknown[];
        count: number;
        truncated: boolean;
      };

      expect(result.count).toBe(10);
      expect(result.truncated).toBe(true);
    });

    it("should filter out excluded schemas", async () => {
      mockAdapter.listTables.mockResolvedValue([
        { name: "users", schema: "public" },
        { name: "orders", schema: "public" },
        { name: "job", schema: "cron" },
        { name: "job_run_details", schema: "cron" },
        { name: "layer", schema: "topology" },
      ]);

      const tool = tools.find((t) => t.name === "pg_list_tables")!;
      const result = (await tool.handler(
        { exclude: ["cron", "topology"] },
        mockContext,
      )) as { tables: Array<{ name: string; schema: string }>; count: number };

      expect(result.count).toBe(2);
      expect(result.tables.every((t) => t.schema === "public")).toBe(true);
    });

    it("should combine schema and exclude filters", async () => {
      mockAdapter.listTables.mockResolvedValue([
        { name: "users", schema: "public" },
        { name: "orders", schema: "sales" },
        { name: "job", schema: "cron" },
      ]);

      const tool = tools.find((t) => t.name === "pg_list_tables")!;
      const result = (await tool.handler(
        { schema: "public", exclude: ["cron"] },
        mockContext,
      )) as { tables: Array<{ name: string; schema: string }>; count: number };

      expect(result.count).toBe(1);
      expect(result.tables[0]?.name).toBe("users");
    });

    it("should not filter when exclude is empty array", async () => {
      mockAdapter.listTables.mockResolvedValue([
        { name: "users", schema: "public" },
        { name: "job", schema: "cron" },
      ]);

      const tool = tools.find((t) => t.name === "pg_list_tables")!;
      const result = (await tool.handler({ exclude: [] }, mockContext)) as {
        tables: Array<{ name: string; schema: string }>;
        count: number;
      };

      expect(result.count).toBe(2);
    });
  });

  describe("pg_read_query - query alias", () => {
    it("should accept query as alias for sql parameter", async () => {
      const expectedResult = createMockQueryResult([{ id: 1 }]);
      mockAdapter.executeReadQuery.mockResolvedValue(expectedResult);

      const tool = tools.find((t) => t.name === "pg_read_query")!;
      const result = (await tool.handler(
        { query: "SELECT 1" },
        mockContext,
      )) as {
        rows: unknown[];
      };

      expect(mockAdapter.executeReadQuery).toHaveBeenCalledWith(
        "SELECT 1",
        undefined,
      );
      expect(result.rows).toEqual([{ id: 1 }]);
    });
  });

  describe("pg_write_query - query alias", () => {
    it("should accept query as alias for sql parameter", async () => {
      mockAdapter.executeWriteQuery.mockResolvedValue({
        rows: [],
        rowsAffected: 1,
        command: "INSERT",
        executionTimeMs: 5,
      });

      const tool = tools.find((t) => t.name === "pg_write_query")!;
      const result = (await tool.handler(
        {
          query: "INSERT INTO users (name) VALUES ($1)",
          params: ["test"],
        },
        mockContext,
      )) as { rowsAffected: number };

      expect(mockAdapter.executeWriteQuery).toHaveBeenCalled();
      expect(result.rowsAffected).toBe(1);
    });
  });

  describe("pg_create_index - column alias", () => {
    it("should accept column (singular) as alias for columns (array)", async () => {
      mockAdapter.executeQuery.mockResolvedValue({ rows: [], rowsAffected: 0 });

      const tool = tools.find((t) => t.name === "pg_create_index")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "email", // Singular - should be auto-wrapped to array
          name: "idx_users_email",
        },
        mockContext,
      )) as { success: boolean };

      expect(result.success).toBe(true);
      const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
      expect(sql).toContain('"email"');
    });
  });

  describe("pg_describe_table", () => {
    it("should call describeTable with table name", async () => {
      // Mock the type check query to return a valid table type
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "r" }],
      });

      const tool = tools.find((t) => t.name === "pg_describe_table")!;
      await tool.handler({ table: "users" }, mockContext);

      expect(mockAdapter.describeTable).toHaveBeenCalledWith("users", "public");
    });

    it("should accept schema parameter", async () => {
      // Mock the type check query to return a valid table type
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "r" }],
      });

      const tool = tools.find((t) => t.name === "pg_describe_table")!;
      await tool.handler({ table: "orders", schema: "sales" }, mockContext);

      expect(mockAdapter.describeTable).toHaveBeenCalledWith("orders", "sales");
    });

    it("should return structured error for sequences", async () => {
      // Mock the type check query to return a sequence type
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "S" }],
      });

      const tool = tools.find((t) => t.name === "pg_describe_table")!;

      const result = (await tool.handler(
        { table: "my_sequence" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/is a sequence, not a table/);
    });

    it("should return structured error for non-existent objects", async () => {
      // Mock the type check query to return no rows
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_describe_table")!;

      const result = (await tool.handler(
        { table: "nonexistent" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/);
    });

    it("should return structured error for indexes", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "i" }],
      });

      const tool = tools.find((t) => t.name === "pg_describe_table")!;

      const result = (await tool.handler(
        { table: "idx_users_email" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/is a index, not a table/);
    });

    it("should return structured error for composite types", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "c" }],
      });

      const tool = tools.find((t) => t.name === "pg_describe_table")!;

      const result = (await tool.handler(
        { table: "address_type" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/is a composite type, not a table/);
    });

    it("should return structured error for unknown object types", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "z" }], // Unknown type
      });

      const tool = tools.find((t) => t.name === "pg_describe_table")!;

      const result = (await tool.handler(
        { table: "unknown_obj" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/unknown type \(z\)/);
    });
  });

  describe("pg_get_indexes", () => {
    it("should call getTableIndexes with table name", async () => {
      const tool = tools.find((t) => t.name === "pg_get_indexes")!;
      await tool.handler({ table: "users" }, mockContext);

      expect(mockAdapter.getTableIndexes).toHaveBeenCalledWith(
        "users",
        undefined,
      );
    });
  });

  describe("pg_create_table", () => {
    it("should execute CREATE TABLE with columns", async () => {
      mockAdapter.executeQuery.mockResolvedValue({ rows: [], rowsAffected: 0 });

      const tool = tools.find((t) => t.name === "pg_create_table")!;
      const result = (await tool.handler(
        {
          name: "new_table",
          columns: [
            { name: "id", type: "SERIAL", primaryKey: true },
            { name: "name", type: "VARCHAR(255)" },
          ],
        },
        mockContext,
      )) as { success: boolean; table: string };

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result).toHaveProperty("success", true);
      expect(result.table).toContain("new_table");
    });
  });

  describe("pg_drop_table", () => {
    it("should execute DROP TABLE", async () => {
      mockAdapter.executeQuery.mockResolvedValue({ rows: [], rowsAffected: 0 });

      const tool = tools.find((t) => t.name === "pg_drop_table")!;
      const result = (await tool.handler(
        {
          table: "old_table",
        },
        mockContext,
      )) as { success: boolean };

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("should support IF EXISTS option", async () => {
      mockAdapter.executeQuery.mockResolvedValue({ rows: [], rowsAffected: 0 });

      const tool = tools.find((t) => t.name === "pg_drop_table")!;
      await tool.handler(
        {
          table: "maybe_exists",
          ifExists: true,
        },
        mockContext,
      );

      // First call is existence check, second call is the DROP statement
      const sql = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
      expect(sql).toContain("IF EXISTS");
    });

    it("should return existed: true when table existed", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // Table exists
        .mockResolvedValueOnce({ rows: [], rowsAffected: 0 }); // DROP succeeds

      const tool = tools.find((t) => t.name === "pg_drop_table")!;
      const result = (await tool.handler(
        { table: "existing_table" },
        mockContext,
      )) as { existed: boolean };

      expect(result.existed).toBe(true);
    });

    it("should return existed: false when table did not exist", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [] }) // Table does not exist
        .mockResolvedValueOnce({ rows: [], rowsAffected: 0 }); // DROP succeeds

      const tool = tools.find((t) => t.name === "pg_drop_table")!;
      const result = (await tool.handler(
        { table: "non_existing_table", ifExists: true },
        mockContext,
      )) as { existed: boolean };

      expect(result.existed).toBe(false);
    });
  });

  describe("pg_create_index", () => {
    it("should execute CREATE INDEX", async () => {
      mockAdapter.executeQuery.mockResolvedValue({ rows: [], rowsAffected: 0 });

      const tool = tools.find((t) => t.name === "pg_create_index")!;
      const result = (await tool.handler(
        {
          table: "users",
          columns: ["email"],
          name: "idx_users_email",
        },
        mockContext,
      )) as { success: boolean };

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("should support unique indexes", async () => {
      mockAdapter.executeQuery.mockResolvedValue({ rows: [], rowsAffected: 0 });

      const tool = tools.find((t) => t.name === "pg_create_index")!;
      await tool.handler(
        {
          table: "users",
          columns: ["email"],
          name: "idx_users_email_unique",
          unique: true,
        },
        mockContext,
      );

      const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
      expect(sql).toContain("UNIQUE");
    });

    it("should include schema prefix when schema provided", async () => {
      mockAdapter.executeQuery.mockResolvedValue({ rows: [], rowsAffected: 0 });

      const tool = tools.find((t) => t.name === "pg_create_index")!;
      await tool.handler(
        {
          table: "orders",
          columns: ["created_at"],
          name: "idx_orders_created",
          schema: "sales",
        },
        mockContext,
      );

      const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
      expect(sql).toContain('"sales".');
    });

    it("should include index type when type provided", async () => {
      mockAdapter.executeQuery.mockResolvedValue({ rows: [], rowsAffected: 0 });

      const tool = tools.find((t) => t.name === "pg_create_index")!;
      await tool.handler(
        {
          table: "documents",
          columns: ["content"],
          name: "idx_documents_content",
          type: "gin",
        },
        mockContext,
      );

      const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
      expect(sql).toContain("USING gin");
    });

    it("should include where clause for partial index", async () => {
      mockAdapter.executeQuery.mockResolvedValue({ rows: [], rowsAffected: 0 });

      const tool = tools.find((t) => t.name === "pg_create_index")!;
      await tool.handler(
        {
          table: "orders",
          columns: ["status"],
          name: "idx_orders_pending",
          where: "status = 'pending'",
        },
        mockContext,
      );

      const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
      expect(sql).toContain("WHERE");
      expect(sql).toContain("status = 'pending'");
    });

    it("should include CONCURRENTLY when concurrently is true", async () => {
      mockAdapter.executeQuery.mockResolvedValue({ rows: [], rowsAffected: 0 });

      const tool = tools.find((t) => t.name === "pg_create_index")!;
      await tool.handler(
        {
          table: "large_table",
          columns: ["id"],
          name: "idx_large_id",
          concurrently: true,
        },
        mockContext,
      );

      const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
      expect(sql).toContain("CONCURRENTLY");
    });

    it("should create index with all optional params combined", async () => {
      mockAdapter.executeQuery.mockResolvedValue({ rows: [], rowsAffected: 0 });

      const tool = tools.find((t) => t.name === "pg_create_index")!;
      const result = (await tool.handler(
        {
          table: "orders",
          columns: ["customer_id", "created_at"],
          name: "idx_orders_partial",
          schema: "sales",
          unique: true,
          type: "btree",
          where: "status = 'active'",
          concurrently: true,
        },
        mockContext,
      )) as { success: boolean; sql: string };

      expect(result.success).toBe(true);
      const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
      expect(sql).toContain("UNIQUE");
      expect(sql).toContain('"sales".');
      expect(sql).toContain("CONCURRENTLY");
      expect(sql).toContain("USING btree");
      expect(sql).toContain("WHERE");
    });
  });
});

describe("Error Handling", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return structured error for database errors", async () => {
    const dbError = new Error("Connection refused");
    mockAdapter.executeReadQuery.mockRejectedValue(dbError);

    const tool = tools.find((t) => t.name === "pg_read_query")!;

    const result = (await tool.handler({ sql: "SELECT 1" }, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Connection refused/);
  });

  it("should validate input schema", async () => {
    const tool = tools.find((t) => t.name === "pg_read_query")!;

    // Missing required 'sql' parameter - returns structured error from outer catch
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  describe("Structured PostgreSQL Error Handling (P154)", () => {
    it("pg_read_query should wrap nonexistent table error", async () => {
      const pgError = new Error(
        'relation "nonexistent" does not exist',
      ) as Error & { code: string };
      pgError.code = "42P01";
      mockAdapter.executeReadQuery.mockRejectedValue(pgError);

      const tool = tools.find((t) => t.name === "pg_read_query")!;

      const result = (await tool.handler(
        { sql: "SELECT * FROM nonexistent" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found.*pg_list_tables/i);
    });

    it("pg_create_table should wrap duplicate table error", async () => {
      const pgError = new Error('relation "test" already exists') as Error & {
        code: string;
      };
      pgError.code = "42P07";
      mockAdapter.executeQuery.mockRejectedValue(pgError);

      const tool = tools.find((t) => t.name === "pg_create_table")!;

      const result = (await tool.handler(
        {
          table: "test",
          columns: [{ name: "id", type: "SERIAL", primaryKey: true }],
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/already exists.*ifNotExists/i);
    });

    it("pg_drop_table should wrap nonexistent table error", async () => {
      const pgError = new Error(
        'table "nonexistent" does not exist',
      ) as Error & { code: string };
      pgError.code = "42P01";

      // First call succeeds (exists check), second call throws (DROP)
      mockAdapter.executeQuery
        .mockResolvedValueOnce(createMockQueryResult([]))
        .mockRejectedValueOnce(pgError);

      const tool = tools.find((t) => t.name === "pg_drop_table")!;

      const result = (await tool.handler(
        { table: "nonexistent" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found.*pg_list_tables/i);
    });

    it("pg_drop_index should wrap nonexistent index error", async () => {
      const pgError = new Error(
        'index "nonexistent_idx" does not exist',
      ) as Error & { code: string };
      pgError.code = "42704";

      // First call succeeds (exists check), second call throws (DROP)
      mockAdapter.executeQuery
        .mockResolvedValueOnce(createMockQueryResult([]))
        .mockRejectedValueOnce(pgError);

      const tool = tools.find((t) => t.name === "pg_drop_index")!;

      const result = (await tool.handler(
        { name: "nonexistent_idx" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found.*ifExists/i);
    });

    it("pg_create_index should wrap duplicate index error", async () => {
      const pgError = new Error(
        'relation "idx_test" already exists',
      ) as Error & { code: string };
      pgError.code = "42P07";
      mockAdapter.executeQuery.mockRejectedValue(pgError);

      const tool = tools.find((t) => t.name === "pg_create_index")!;

      const result = (await tool.handler(
        {
          table: "test",
          columns: ["email"],
          name: "idx_test",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/already exists.*ifNotExists/i);
    });

    it("should return structured error for non-PG errors", async () => {
      const connectionError = new Error("Connection refused");
      mockAdapter.executeReadQuery.mockRejectedValue(connectionError);

      const tool = tools.find((t) => t.name === "pg_read_query")!;

      const result = (await tool.handler({ sql: "SELECT 1" }, mockContext)) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Connection refused/);
    });
  });
});

describe("Health Analysis Tools", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  describe("pg_analyze_db_health", () => {
    it("should analyze database health with all components", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({
          rows: [{ heap_hit_ratio: 0.98, index_hit_ratio: 0.95 }],
        })
        .mockResolvedValueOnce({ rows: [{ size: "1 GB" }] })
        .mockResolvedValueOnce({
          rows: [{ table_count: 10, total_rows: 50000 }],
        })
        .mockResolvedValueOnce({ rows: [{ unused_count: 3 }] })
        .mockResolvedValueOnce({ rows: [{ tables_needing_vacuum: 2 }] })
        .mockResolvedValueOnce({
          rows: [{ total: 5, active: 2, idle: 3, max_connections: 100 }],
        })
        .mockResolvedValueOnce({ rows: [{ is_replica: false }] });

      const tool = tools.find((t) => t.name === "pg_analyze_db_health")!;
      const result = (await tool.handler({}, mockContext)) as Record<
        string,
        unknown
      >;

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result).toHaveProperty("databaseSize");
      expect(result).toHaveProperty("overallScore");
    });

    it("should be read-only", () => {
      const tool = tools.find((t) => t.name === "pg_analyze_db_health")!;
      expect(tool.annotations?.readOnlyHint).toBe(true);
    });
  });

  describe("pg_analyze_workload_indexes", () => {
    it("should return structured error when pg_stat_statements not installed", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_analyze_workload_indexes")!;

      const result = (await tool.handler({}, mockContext)) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(
        /pg_stat_statements extension is not installed/,
      );
    });

    it("should analyze queries when extension is available", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ extname: "pg_stat_statements" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              query: "SELECT * FROM users WHERE email = $1",
              calls: 100,
              avg_time_ms: 15.5,
            },
          ],
        });

      const tool = tools.find((t) => t.name === "pg_analyze_workload_indexes")!;
      const result = (await tool.handler({}, mockContext)) as Record<
        string,
        unknown
      >;

      expect(result).toHaveProperty("analyzedQueries");
      expect(result).toHaveProperty("recommendations");
    });
  });

  describe("pg_analyze_query_indexes", () => {
    it("should analyze query plan", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          {
            "QUERY PLAN": [
              {
                Plan: { "Node Type": "Seq Scan" },
                "Execution Time": 0.5,
                "Planning Time": 0.1,
              },
            ],
          },
        ],
      });

      const tool = tools.find((t) => t.name === "pg_analyze_query_indexes")!;
      const result = (await tool.handler(
        { sql: "SELECT * FROM users" },
        mockContext,
      )) as Record<string, unknown>;

      expect(result).toHaveProperty("executionTime");
      expect(result).toHaveProperty("plan");
    });

    it("should return error when no plan returned", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_analyze_query_indexes")!;
      const result = (await tool.handler(
        { sql: "SELECT 1" },
        mockContext,
      )) as Record<string, unknown>;

      expect(result).toHaveProperty("error");
    });

    it("should detect sequential scan with filter and add recommendation", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          {
            "QUERY PLAN": [
              {
                Plan: {
                  "Node Type": "Seq Scan",
                  "Relation Name": "users",
                  Filter: "(email = $1)",
                  "Actual Rows": 5000,
                  "Plan Rows": 100,
                },
                "Execution Time": 150.5,
                "Planning Time": 0.2,
              },
            ],
          },
        ],
      });

      const tool = tools.find((t) => t.name === "pg_analyze_query_indexes")!;
      const result = (await tool.handler(
        { sql: "SELECT * FROM users WHERE email = $1" },
        mockContext,
      )) as {
        issues: string[];
        recommendations: string[];
      };

      expect(result.issues).toContainEqual(
        expect.stringContaining("Sequential scan"),
      );
      expect(result.recommendations).toContainEqual(
        expect.stringContaining("index"),
      );
    });

    it("should detect row estimation issues", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          {
            "QUERY PLAN": [
              {
                Plan: {
                  "Node Type": "Index Scan",
                  "Actual Rows": 10000,
                  "Plan Rows": 100, // 100x off
                },
                "Execution Time": 50.0,
                "Planning Time": 0.1,
              },
            ],
          },
        ],
      });

      const tool = tools.find((t) => t.name === "pg_analyze_query_indexes")!;
      const result = (await tool.handler(
        { sql: "SELECT * FROM orders" },
        mockContext,
      )) as {
        issues: string[];
        recommendations: string[];
      };

      expect(result.issues).toContainEqual(
        expect.stringContaining("estimation"),
      );
      expect(result.recommendations).toContainEqual(
        expect.stringContaining("ANALYZE"),
      );
    });

    it("should detect external sort", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          {
            "QUERY PLAN": [
              {
                Plan: {
                  "Node Type": "Sort",
                  "Sort Method": "external sort",
                  "Actual Rows": 100,
                  "Plan Rows": 100,
                },
                "Execution Time": 500.0,
                "Planning Time": 0.1,
              },
            ],
          },
        ],
      });

      const tool = tools.find((t) => t.name === "pg_analyze_query_indexes")!;
      const result = (await tool.handler(
        { sql: "SELECT * FROM large_table ORDER BY col" },
        mockContext,
      )) as {
        issues: string[];
        recommendations: string[];
      };

      expect(result.issues).toContainEqual(
        expect.stringContaining("External sort"),
      );
      expect(result.recommendations).toContainEqual(
        expect.stringContaining("work_mem"),
      );
    });

    it("should wrap nonexistent table error into structured message", async () => {
      const pgError = new Error(
        'relation "fake_nonexistent_table" does not exist',
      ) as Error & { code: string };
      pgError.code = "42P01";
      mockAdapter.executeQuery.mockRejectedValue(pgError);

      const tool = tools.find((t) => t.name === "pg_analyze_query_indexes")!;

      const result = (await tool.handler(
        { sql: "SELECT * FROM fake_nonexistent_table WHERE id = 1" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found.*pg_list_tables/i);
    });
  });

  describe("pg_analyze_db_health with options", () => {
    it("should skip indexes check when includeIndexes is false", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({
          rows: [{ heap_hit_ratio: 0.98, index_hit_ratio: 0.95 }],
        })
        .mockResolvedValueOnce({ rows: [{ size: "1 GB" }] })
        .mockResolvedValueOnce({
          rows: [{ table_count: 10, total_rows: 50000 }],
        })
        // No unused indexes query
        .mockResolvedValueOnce({ rows: [{ tables_needing_vacuum: 2 }] })
        .mockResolvedValueOnce({
          rows: [{ total: 5, active: 2, idle: 3, max_connections: 100 }],
        })
        .mockResolvedValueOnce({ rows: [{ is_replica: false }] });

      const tool = tools.find((t) => t.name === "pg_analyze_db_health")!;
      const result = (await tool.handler(
        { includeIndexes: false },
        mockContext,
      )) as Record<string, unknown>;

      expect(result).not.toHaveProperty("unusedIndexes");
    });

    it("should skip vacuum check when includeVacuum is false", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({
          rows: [{ heap_hit_ratio: 0.98, index_hit_ratio: 0.95 }],
        })
        .mockResolvedValueOnce({ rows: [{ size: "1 GB" }] })
        .mockResolvedValueOnce({
          rows: [{ table_count: 10, total_rows: 50000 }],
        })
        .mockResolvedValueOnce({ rows: [{ unused_count: 3 }] })
        // No vacuum query
        .mockResolvedValueOnce({
          rows: [{ total: 5, active: 2, idle: 3, max_connections: 100 }],
        })
        .mockResolvedValueOnce({ rows: [{ is_replica: false }] });

      const tool = tools.find((t) => t.name === "pg_analyze_db_health")!;
      const result = (await tool.handler(
        { includeVacuum: false },
        mockContext,
      )) as Record<string, unknown>;

      expect(result).not.toHaveProperty("tablesNeedingVacuum");
    });

    it("should skip connections check when includeConnections is false", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({
          rows: [{ heap_hit_ratio: 0.98, index_hit_ratio: 0.95 }],
        })
        .mockResolvedValueOnce({ rows: [{ size: "1 GB" }] })
        .mockResolvedValueOnce({
          rows: [{ table_count: 10, total_rows: 50000 }],
        })
        .mockResolvedValueOnce({ rows: [{ unused_count: 3 }] })
        .mockResolvedValueOnce({ rows: [{ tables_needing_vacuum: 2 }] })
        // No connections query
        .mockResolvedValueOnce({ rows: [{ is_replica: false }] });

      const tool = tools.find((t) => t.name === "pg_analyze_db_health")!;
      const result = (await tool.handler(
        { includeConnections: false },
        mockContext,
      )) as Record<string, unknown>;

      expect(result).not.toHaveProperty("connections");
    });

    it("should report poor cache hit ratio", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({
          rows: [{ heap_hit_ratio: 0.6, index_hit_ratio: 0.5 }],
        })
        .mockResolvedValueOnce({ rows: [{ size: "1 GB" }] })
        .mockResolvedValueOnce({
          rows: [{ table_count: 10, total_rows: 50000 }],
        })
        .mockResolvedValueOnce({ rows: [{ unused_count: 3 }] })
        .mockResolvedValueOnce({ rows: [{ tables_needing_vacuum: 2 }] })
        .mockResolvedValueOnce({ rows: [{ total: 5 }] })
        .mockResolvedValueOnce({ rows: [{ is_replica: false }] });

      const tool = tools.find((t) => t.name === "pg_analyze_db_health")!;
      const result = (await tool.handler({}, mockContext)) as {
        cacheHitRatio: { status: string };
        overallScore: number;
      };

      expect(result.cacheHitRatio.status).toBe("poor");
      expect(result.overallScore).toBeLessThan(100);
    });
  });

  describe("pg_analyze_workload_indexes recommendations", () => {
    it("should recommend GIN index for LIKE queries with wildcards", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ extname: "pg_stat_statements" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              query: "SELECT * FROM products WHERE name LIKE '%widget%'",
              calls: 500,
              avg_time_ms: 25.0,
            },
          ],
        });

      const tool = tools.find((t) => t.name === "pg_analyze_workload_indexes")!;
      const result = (await tool.handler({}, mockContext)) as {
        recommendations: Array<{ recommendation: string }>;
      };

      expect(result.recommendations).toContainEqual(
        expect.objectContaining({
          recommendation: expect.stringContaining("GIN"),
        }),
      );
    });

    it("should recommend B-tree index for range queries", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ extname: "pg_stat_statements" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              query: "SELECT * FROM orders WHERE created_at BETWEEN $1 AND $2",
              calls: 300,
              avg_time_ms: 15.0,
            },
          ],
        });

      const tool = tools.find((t) => t.name === "pg_analyze_workload_indexes")!;
      const result = (await tool.handler({}, mockContext)) as {
        recommendations: Array<{ recommendation: string }>;
      };

      expect(result.recommendations).toContainEqual(
        expect.objectContaining({
          recommendation: expect.stringContaining("B-tree"),
        }),
      );
    });

    it("should recommend index for ORDER BY with LIMIT", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ extname: "pg_stat_statements" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              query: "SELECT * FROM products ORDER BY price DESC LIMIT 10",
              calls: 1000,
              avg_time_ms: 30.0,
            },
          ],
        });

      const tool = tools.find((t) => t.name === "pg_analyze_workload_indexes")!;
      const result = (await tool.handler({}, mockContext)) as {
        recommendations: Array<{ recommendation: string }>;
      };

      expect(result.recommendations).toContainEqual(
        expect.objectContaining({
          recommendation: expect.stringContaining("ORDER BY"),
        }),
      );
    });
  });
});

describe("Object Tools", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  describe("pg_list_objects", () => {
    it("should list database objects", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          { object_name: "users", object_type: "table", schema_name: "public" },
        ],
      });

      const tool = tools.find((t) => t.name === "pg_list_objects")!;
      const result = (await tool.handler(
        { type: "table" },
        mockContext,
      )) as Record<string, unknown>;

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result).toHaveProperty("objects");
    });

    it("should be read-only", () => {
      const tool = tools.find((t) => t.name === "pg_list_objects")!;
      expect(tool.annotations?.readOnlyHint).toBe(true);
    });

    it("should list indexes when type includes index", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [] }) // First query for tables/views/etc
        .mockResolvedValueOnce({
          // Index query
          rows: [
            {
              type: "index",
              schema: "public",
              name: "idx_users_email",
              owner: "postgres",
            },
          ],
        });

      const tool = tools.find((t) => t.name === "pg_list_objects")!;
      const result = (await tool.handler(
        { types: ["index"] },
        mockContext,
      )) as {
        objects: Array<{ type: string; name: string }>;
        count: number;
        byType: Record<string, number>;
      };

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result.objects).toBeDefined();
    });

    it("should list triggers when type includes trigger", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [] }) // First query
        .mockResolvedValueOnce({
          // Trigger query
          rows: [
            {
              type: "trigger",
              schema: "public",
              name: "audit_trigger",
              owner: "postgres",
            },
          ],
        });

      const tool = tools.find((t) => t.name === "pg_list_objects")!;
      const result = (await tool.handler(
        { types: ["trigger"] },
        mockContext,
      )) as {
        objects: Array<{ type: string; name: string }>;
      };

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result.objects).toBeDefined();
    });

    it("should list functions and procedures", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [] }) // Tables query
        .mockResolvedValueOnce({
          // Functions query
          rows: [
            {
              type: "function",
              schema: "public",
              name: "my_func",
              owner: "postgres",
            },
          ],
        });

      const tool = tools.find((t) => t.name === "pg_list_objects")!;
      const result = (await tool.handler(
        { types: ["function"] },
        mockContext,
      )) as {
        objects: Array<{ type: string; name: string }>;
      };

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result.objects).toBeDefined();
    });

    it("should accept schema filter", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_list_objects")!;
      await tool.handler({ schema: "custom_schema" }, mockContext);

      // Should have schema filter in query
      expect(mockAdapter.executeQuery).toHaveBeenCalled();
    });
  });

  describe("pg_object_details", () => {
    it("should get details for an object", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          { object_name: "users", object_type: "table", schema_name: "public" },
        ],
      });

      const tool = tools.find((t) => t.name === "pg_object_details")!;
      const result = (await tool.handler(
        { name: "users" },
        mockContext,
      )) as Record<string, unknown>;

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("should be read-only", () => {
      const tool = tools.find((t) => t.name === "pg_object_details")!;
      expect(tool.annotations?.readOnlyHint).toBe(true);
    });

    it("should return function details when type is function", async () => {
      // First query detects type as function
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ object_type: "function" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              name: "my_func",
              arguments: "integer",
              return_type: "void",
              source: "BEGIN END;",
              language: "plpgsql",
              volatility: "v",
              owner: "postgres",
            },
          ],
        });

      const tool = tools.find((t) => t.name === "pg_object_details")!;
      const result = (await tool.handler(
        { name: "my_func", type: "function" },
        mockContext,
      )) as Record<string, unknown>;

      expect(result.type).toBe("function");
    });

    it("should return sequence details when type is sequence", async () => {
      // Detection query returns sequence type
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ object_type: "sequence" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              start_value: 1,
              min_value: 1,
              max_value: 9223372036854775807n,
              increment: 1,
              cycle: false,
              cache: 1,
            },
          ],
        });

      const tool = tools.find((t) => t.name === "pg_object_details")!;
      const result = (await tool.handler(
        { name: "my_seq", type: "sequence" },
        mockContext,
      )) as Record<string, unknown>;

      expect(result.type).toBe("sequence");
    });

    it("should return index details when type is index", async () => {
      // Detection query returns index type
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ object_type: "index" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              index_name: "idx_users_email",
              table_name: "users",
              index_type: "btree",
              definition: "CREATE INDEX ...",
              is_unique: true,
              is_primary: false,
              size: "8192 bytes",
            },
          ],
        });

      const tool = tools.find((t) => t.name === "pg_object_details")!;
      const result = (await tool.handler(
        { name: "idx_users_email", type: "index" },
        mockContext,
      )) as Record<string, unknown>;

      expect(result.type).toBe("index");
    });

    it("should return structured error when object not found", async () => {
      // Detection query returns null for object_type
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ object_type: null }],
      });

      const tool = tools.find((t) => t.name === "pg_object_details")!;

      const result = (await tool.handler(
        { name: "nonexistent" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/);
    });

    it("should parse schema.name format correctly", async () => {
      // Detection query returns sequence type
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ object_type: "sequence" }],
      });
      // Sequence details query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          {
            start_value: 1,
            min_value: 1,
            max_value: 9223372036854775807,
            increment: 1,
            cycle: false,
            cache: 1,
          },
        ],
      });

      const tool = tools.find((t) => t.name === "pg_object_details")!;
      const result = (await tool.handler(
        { name: "test_schema.order_seq" },
        mockContext,
      )) as Record<string, unknown>;

      expect(result.schema).toBe("test_schema");
      expect(result.name).toBe("order_seq");
      expect(result.type).toBe("sequence");

      // Verify the detection query was called with parsed schema/name
      const detectCall = mockAdapter.executeQuery.mock.calls[0];
      expect(detectCall?.[1]).toEqual(["order_seq", "test_schema"]);
    });
  });
});

describe("Create Table with Advanced Column Options", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should create table with foreign key references", async () => {
    mockAdapter.executeQuery.mockResolvedValue({ rows: [], rowsAffected: 0 });

    const tool = tools.find((t) => t.name === "pg_create_table")!;
    await tool.handler(
      {
        name: "orders",
        columns: [
          { name: "id", type: "SERIAL", primaryKey: true },
          {
            name: "user_id",
            type: "INTEGER",
            references: {
              table: "users",
              column: "id",
              onDelete: "CASCADE",
              onUpdate: "SET NULL",
            },
          },
        ],
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain("REFERENCES");
    expect(sql).toContain('"users"');
    expect(sql).toContain("ON DELETE CASCADE");
    expect(sql).toContain("ON UPDATE SET NULL");
  });

  it("should create table with unique constraint", async () => {
    mockAdapter.executeQuery.mockResolvedValue({ rows: [], rowsAffected: 0 });

    const tool = tools.find((t) => t.name === "pg_create_table")!;
    await tool.handler(
      {
        name: "profiles",
        columns: [
          { name: "id", type: "SERIAL", primaryKey: true },
          { name: "email", type: "VARCHAR(255)", unique: true },
        ],
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain("UNIQUE");
  });

  it("should create table with NOT NULL constraint", async () => {
    mockAdapter.executeQuery.mockResolvedValue({ rows: [], rowsAffected: 0 });

    const tool = tools.find((t) => t.name === "pg_create_table")!;
    await tool.handler(
      {
        name: "products",
        columns: [
          { name: "id", type: "SERIAL", primaryKey: true },
          { name: "name", type: "VARCHAR(255)", nullable: false },
        ],
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain("NOT NULL");
  });

  it("should create table with default value", async () => {
    mockAdapter.executeQuery.mockResolvedValue({ rows: [], rowsAffected: 0 });

    const tool = tools.find((t) => t.name === "pg_create_table")!;
    await tool.handler(
      {
        name: "settings",
        columns: [
          { name: "id", type: "SERIAL", primaryKey: true },
          { name: "active", type: "BOOLEAN", default: "true" },
        ],
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain("DEFAULT true");
  });

  it("should create table with schema prefix", async () => {
    mockAdapter.executeQuery.mockResolvedValue({ rows: [], rowsAffected: 0 });

    const tool = tools.find((t) => t.name === "pg_create_table")!;
    const result = (await tool.handler(
      {
        name: "audit_logs",
        schema: "audit",
        columns: [{ name: "id", type: "SERIAL", primaryKey: true }],
      },
      mockContext,
    )) as { success: boolean; table: string };

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain('"audit".');
    expect(result.table).toContain("audit.");
  });

  it("should create table with IF NOT EXISTS", async () => {
    mockAdapter.executeQuery.mockResolvedValue({ rows: [], rowsAffected: 0 });

    const tool = tools.find((t) => t.name === "pg_create_table")!;
    await tool.handler(
      {
        name: "idempotent_table",
        ifNotExists: true,
        columns: [{ name: "id", type: "SERIAL", primaryKey: true }],
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain("IF NOT EXISTS");
  });

  it("should create table with foreign key reference only (no onDelete/onUpdate)", async () => {
    mockAdapter.executeQuery.mockResolvedValue({ rows: [], rowsAffected: 0 });

    const tool = tools.find((t) => t.name === "pg_create_table")!;
    await tool.handler(
      {
        name: "comments",
        columns: [
          { name: "id", type: "SERIAL", primaryKey: true },
          {
            name: "post_id",
            type: "INTEGER",
            references: {
              table: "posts",
              column: "id",
            },
          },
        ],
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain('REFERENCES "posts"("id")');
    // Should NOT contain ON DELETE or ON UPDATE since they weren't specified
  });

  it("should create table with composite primary key", async () => {
    mockAdapter.executeQuery.mockResolvedValue({ rows: [], rowsAffected: 0 });

    const tool = tools.find((t) => t.name === "pg_create_table")!;
    const result = (await tool.handler(
      {
        name: "order_items",
        columns: [
          { name: "order_id", type: "INTEGER", primaryKey: true },
          { name: "product_id", type: "INTEGER", primaryKey: true },
          { name: "quantity", type: "INTEGER" },
        ],
      },
      mockContext,
    )) as { compositePrimaryKey: string[] };

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    // Should NOT have inline PRIMARY KEY on individual columns
    expect(sql).not.toMatch(/"order_id" INTEGER PRIMARY KEY/);
    expect(sql).not.toMatch(/"product_id" INTEGER PRIMARY KEY/);
    // Should have table-level constraint
    expect(sql).toContain('PRIMARY KEY ("order_id", "product_id")');
    // Should return composite PK info in response
    expect(result.compositePrimaryKey).toEqual(["order_id", "product_id"]);
  });

  it("should create table with single primary key normally", async () => {
    mockAdapter.executeQuery.mockResolvedValue({ rows: [], rowsAffected: 0 });

    const tool = tools.find((t) => t.name === "pg_create_table")!;
    await tool.handler(
      {
        name: "users",
        columns: [
          { name: "id", type: "SERIAL", primaryKey: true },
          { name: "email", type: "TEXT" },
        ],
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    // Should have inline PRIMARY KEY for single-column PK
    expect(sql).toContain('"id" SERIAL PRIMARY KEY');
    // Should NOT have table-level constraint
    expect(sql).not.toContain('PRIMARY KEY ("id")');
  });
});

describe("Drop Table with Options", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should support CASCADE option", async () => {
    mockAdapter.executeQuery.mockResolvedValue({ rows: [], rowsAffected: 0 });

    const tool = tools.find((t) => t.name === "pg_drop_table")!;
    await tool.handler(
      {
        table: "parent_table",
        cascade: true,
      },
      mockContext,
    );

    // First call is existence check, second call is the DROP statement
    const sql = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
    expect(sql).toContain("CASCADE");
  });

  it("should support schema prefix", async () => {
    mockAdapter.executeQuery.mockResolvedValue({ rows: [], rowsAffected: 0 });

    const tool = tools.find((t) => t.name === "pg_drop_table")!;
    const result = (await tool.handler(
      {
        table: "logs",
        schema: "archive",
      },
      mockContext,
    )) as { success: boolean; dropped: string };

    // First call is existence check, second call is the DROP statement
    const sql = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
    expect(sql).toContain('"archive".');
    expect(result.dropped).toContain("archive.");
  });
});

describe("pg_write_query response fields", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should include affectedRows alias in response", async () => {
    mockAdapter.executeWriteQuery.mockResolvedValue({
      rows: [],
      rowsAffected: 10,
      command: "UPDATE",
      executionTimeMs: 5,
    });

    const tool = tools.find((t) => t.name === "pg_write_query")!;
    const result = (await tool.handler(
      {
        sql: "UPDATE users SET active = true WHERE created_at < NOW()",
      },
      mockContext,
    )) as { rowsAffected: number; affectedRows: number; rowCount: number };

    expect(result.rowsAffected).toBe(10);
    expect(result.affectedRows).toBe(10); // New alias
    expect(result.rowCount).toBe(10);
  });

  it("should include affectedRows for INSERT operations", async () => {
    mockAdapter.executeWriteQuery.mockResolvedValue({
      rows: [],
      rowsAffected: 3,
      command: "INSERT",
      executionTimeMs: 2,
    });

    const tool = tools.find((t) => t.name === "pg_write_query")!;
    const result = (await tool.handler(
      {
        sql: "INSERT INTO logs (message) VALUES ($1), ($2), ($3)",
        params: ["msg1", "msg2", "msg3"],
      },
      mockContext,
    )) as { affectedRows: number };

    expect(result.affectedRows).toBe(3);
  });

  it("should include affectedRows for DELETE operations", async () => {
    mockAdapter.executeWriteQuery.mockResolvedValue({
      rows: [],
      rowsAffected: 5,
      command: "DELETE",
      executionTimeMs: 3,
    });

    const tool = tools.find((t) => t.name === "pg_write_query")!;
    const result = (await tool.handler(
      {
        sql: "DELETE FROM expired_sessions WHERE created_at < NOW()",
      },
      mockContext,
    )) as { affectedRows: number };

    expect(result.affectedRows).toBe(5);
  });
});

describe("pg_exists optional WHERE clause", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should check if table has any rows when WHERE omitted", async () => {
    mockAdapter.executeQuery.mockResolvedValue({
      rows: [{ exists: true }],
    });

    const tool = tools.find((t) => t.name === "pg_exists")!;
    const result = (await tool.handler(
      {
        table: "users",
      },
      mockContext,
    )) as { exists: boolean; hint?: string; mode: string };

    expect(result.exists).toBe(true);
    expect(result.mode).toBe("any_rows");
    expect(result.hint).toContain("any rows");
    expect(result.hint).toContain("where/condition/filter");

    // Verify SQL doesn't have WHERE clause (calls[2] = main query, calls[0] = schema check, calls[1] = table check)
    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).not.toContain("WHERE");
  });

  it("should not include hint when WHERE is provided", async () => {
    mockAdapter.executeQuery.mockResolvedValue({
      rows: [{ exists: false }],
    });

    const tool = tools.find((t) => t.name === "pg_exists")!;
    const result = (await tool.handler(
      {
        table: "users",
        where: "email = 'test@example.com'",
      },
      mockContext,
    )) as { exists: boolean; hint?: string };

    expect(result.exists).toBe(false);
    expect(result.hint).toBeUndefined();

    // Verify SQL has WHERE clause (calls[2] = main query, calls[0] = schema check, calls[1] = table check)
    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain("WHERE");
  });

  it("should accept condition as alias for where", async () => {
    mockAdapter.executeQuery.mockResolvedValue({
      rows: [{ exists: true }],
    });

    const tool = tools.find((t) => t.name === "pg_exists")!;
    const result = (await tool.handler(
      {
        table: "orders",
        condition: "status = 'pending'",
      },
      mockContext,
    )) as { exists: boolean; hint?: string };

    expect(result.exists).toBe(true);
    expect(result.hint).toBeUndefined();

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain("WHERE");
    expect(sql).toContain("pending");
  });

  it("should accept filter as alias for where", async () => {
    mockAdapter.executeQuery.mockResolvedValue({
      rows: [{ exists: true }],
    });

    const tool = tools.find((t) => t.name === "pg_exists")!;
    const result = (await tool.handler(
      {
        table: "products",
        filter: "stock > 0",
      },
      mockContext,
    )) as { exists: boolean; hint?: string };

    expect(result.exists).toBe(true);
    expect(result.hint).toBeUndefined();

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain("WHERE");
    expect(sql).toContain("stock");
  });

  it("should return false when table is empty", async () => {
    mockAdapter.executeQuery.mockResolvedValue({
      rows: [{ exists: false }],
    });

    const tool = tools.find((t) => t.name === "pg_exists")!;
    const result = (await tool.handler(
      {
        table: "empty_table",
      },
      mockContext,
    )) as { exists: boolean; hint?: string };

    expect(result.exists).toBe(false);
    expect(result.hint).toContain("any rows");
  });

  it("should support schema.table format", async () => {
    mockAdapter.executeQuery.mockResolvedValue({
      rows: [{ exists: true }],
    });

    const tool = tools.find((t) => t.name === "pg_exists")!;
    await tool.handler(
      {
        table: "archive.events",
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain('"archive"."events"');
  });
});

// =============================================================================
// Convenience Tools - pg_upsert
// =============================================================================

describe("pg_upsert", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should execute INSERT ON CONFLICT UPDATE", async () => {
    mockAdapter.executeQuery.mockResolvedValue({
      rows: [{ _xmax: 0, id: 1 }],
      rowsAffected: 1,
    });

    const tool = tools.find((t) => t.name === "pg_upsert")!;
    const result = (await tool.handler(
      {
        table: "users",
        data: { email: "test@example.com", name: "Test" },
        conflictColumns: ["email"],
      },
      mockContext,
    )) as { success: boolean; operation: string; rowsAffected: number };

    expect(result.success).toBe(true);
    expect(result.operation).toBe("insert");
    expect(result.rowsAffected).toBe(1);

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain("INSERT INTO");
    expect(sql).toContain("ON CONFLICT");
    expect(sql).toContain("DO UPDATE SET");
  });

  it("should detect update vs insert via xmax", async () => {
    mockAdapter.executeQuery.mockResolvedValue({
      rows: [{ _xmax: 12345 }], // xmax > 0 = update
      rowsAffected: 1,
    });

    const tool = tools.find((t) => t.name === "pg_upsert")!;
    const result = (await tool.handler(
      {
        table: "users",
        data: { id: 1, name: "Updated" },
        conflictColumns: ["id"],
      },
      mockContext,
    )) as { operation: string };

    expect(result.operation).toBe("update");
  });

  it("should accept values as alias for data", async () => {
    mockAdapter.executeQuery.mockResolvedValue({
      rows: [{ _xmax: 0 }],
      rowsAffected: 1,
    });

    const tool = tools.find((t) => t.name === "pg_upsert")!;
    const result = (await tool.handler(
      {
        table: "orders",
        values: { order_id: 123, status: "pending" }, // alias
        conflictColumns: ["order_id"],
      },
      mockContext,
    )) as { success: boolean };

    expect(result.success).toBe(true);
    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain("order_id");
  });

  it("should accept tableName as alias for table", async () => {
    mockAdapter.executeQuery.mockResolvedValue({
      rows: [{ _xmax: 0 }],
      rowsAffected: 1,
    });

    const tool = tools.find((t) => t.name === "pg_upsert")!;
    await tool.handler(
      {
        tableName: "products", // alias
        data: { sku: "ABC123", name: "Product" },
        conflictColumns: ["sku"],
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain('"products"');
  });

  it("should use DO NOTHING when no update columns available", async () => {
    mockAdapter.executeQuery.mockResolvedValue({
      rows: [{ _xmax: 0 }],
      rowsAffected: 1,
    });

    const tool = tools.find((t) => t.name === "pg_upsert")!;
    await tool.handler(
      {
        table: "users",
        data: { id: 1 }, // Only conflict column, nothing to update
        conflictColumns: ["id"],
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain("DO NOTHING");
  });

  it("should support updateColumns to limit updated columns", async () => {
    mockAdapter.executeQuery.mockResolvedValue({
      rows: [{ _xmax: 0 }],
      rowsAffected: 1,
    });

    const tool = tools.find((t) => t.name === "pg_upsert")!;
    await tool.handler(
      {
        table: "users",
        data: { id: 1, name: "New", email: "new@test.com", active: true },
        conflictColumns: ["id"],
        updateColumns: ["name"], // Only update name, not email or active
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain('DO UPDATE SET "name"');
    expect(sql).not.toContain('"email" = EXCLUDED');
    expect(sql).not.toContain('"active" = EXCLUDED');
  });

  it("should support returning clause", async () => {
    mockAdapter.executeQuery.mockResolvedValue({
      rows: [{ id: 1, name: "Test", _xmax: 0 }],
      rowsAffected: 1,
    });

    const tool = tools.find((t) => t.name === "pg_upsert")!;
    const result = (await tool.handler(
      {
        table: "users",
        data: { name: "Test" },
        conflictColumns: ["id"],
        returning: ["id", "name"],
      },
      mockContext,
    )) as { rows: unknown[] };

    expect(result.rows).toBeDefined();
    expect(result.rows[0]).toEqual({ id: 1, name: "Test" }); // _xmax stripped
  });

  it("should parse schema.table format", async () => {
    mockAdapter.executeQuery.mockResolvedValue({
      rows: [{ _xmax: 0 }],
      rowsAffected: 1,
    });

    const tool = tools.find((t) => t.name === "pg_upsert")!;
    await tool.handler(
      {
        table: "archive.events",
        data: { event_id: 1, type: "click" },
        conflictColumns: ["event_id"],
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain('"archive"."events"');
  });

  it("should return structured error for missing unique constraint", async () => {
    // Schema check passes, table check passes, then the actual upsert throws
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // schema check
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table check
      .mockRejectedValueOnce(
        new Error("there is no unique or exclusion constraint"),
      );

    const tool = tools.find((t) => t.name === "pg_upsert")!;

    const result = (await tool.handler(
      {
        table: "users",
        data: { email: "test@test.com" },
        conflictColumns: ["email"],
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/UNIQUE constraint/);
  });

  it("should return structured error for empty conflictColumns", async () => {
    const tool = tools.find((t) => t.name === "pg_upsert")!;

    const result = (await tool.handler(
      {
        table: "users",
        data: { name: "Test" },
        conflictColumns: [],
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/conflictColumns must not be empty/);
  });
});

// =============================================================================
// Convenience Tools - pg_batch_insert
// =============================================================================

describe("pg_batch_insert", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should insert multiple rows in single statement", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // schema check
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table check
      .mockResolvedValueOnce({ rows: [], rowsAffected: 3 }); // INSERT

    const tool = tools.find((t) => t.name === "pg_batch_insert")!;
    const result = (await tool.handler(
      {
        table: "users",
        rows: [
          { name: "Alice", email: "alice@test.com" },
          { name: "Bob", email: "bob@test.com" },
          { name: "Charlie", email: "charlie@test.com" },
        ],
      },
      mockContext,
    )) as { success: boolean; rowsAffected: number; insertedCount: number };

    expect(result.success).toBe(true);
    expect(result.rowsAffected).toBe(3);
    expect(result.insertedCount).toBe(3);

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain("INSERT INTO");
    expect(sql).toContain("VALUES");
    // Should have 3 value groups
    expect((sql.match(/\(/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it("should handle rows with different columns", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // schema check
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table check
      .mockResolvedValueOnce({ rows: [], rowsAffected: 2 }); // INSERT

    const tool = tools.find((t) => t.name === "pg_batch_insert")!;
    await tool.handler(
      {
        table: "users",
        rows: [
          { name: "Alice" }, // Only name
          { name: "Bob", email: "bob@test.com" }, // Name and email
        ],
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain('"name"');
    expect(sql).toContain('"email"');
  });

  it("should serialize objects to JSON for JSONB columns", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // schema check
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table check
      .mockResolvedValueOnce({ rows: [], rowsAffected: 1 }); // INSERT

    const tool = tools.find((t) => t.name === "pg_batch_insert")!;
    await tool.handler(
      {
        table: "documents",
        rows: [{ title: "Doc", metadata: { tags: ["a", "b"] } }],
      },
      mockContext,
    );

    const params = mockAdapter.executeQuery.mock.calls[2]?.[1] as unknown[];
    expect(params).toContainEqual('{"tags":["a","b"]}');
  });

  it("should support returning clause", async () => {
    mockAdapter.executeQuery.mockResolvedValue({
      rows: [{ id: 1 }, { id: 2 }],
      rowsAffected: 2,
    });

    const tool = tools.find((t) => t.name === "pg_batch_insert")!;
    const result = (await tool.handler(
      {
        table: "users",
        rows: [{ name: "Alice" }, { name: "Bob" }],
        returning: ["id"],
      },
      mockContext,
    )) as { rows: unknown[] };

    expect(result.rows).toHaveLength(2);

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain('RETURNING "id"');
  });

  it("should handle SERIAL-only tables with empty objects", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // schema check
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table check
      .mockResolvedValueOnce({ rows: [{ id: 1 }], rowsAffected: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 2 }], rowsAffected: 1 });

    const tool = tools.find((t) => t.name === "pg_batch_insert")!;
    const result = (await tool.handler(
      {
        table: "sequences",
        rows: [{}, {}], // Empty objects (SERIAL-only table)
        returning: ["id"],
      },
      mockContext,
    )) as { success: boolean; hint: string; rowsAffected: number };

    expect(result.success).toBe(true);
    expect(result.hint).toContain("DEFAULT VALUES");
    expect(result.rowsAffected).toBe(2);
  });

  it("should reject empty rows array", async () => {
    const tool = tools.find((t) => t.name === "pg_batch_insert")!;

    const result = (await tool.handler(
      {
        table: "users",
        rows: [], // Empty
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/rows must not be empty/);
  });

  it("should accept tableName as alias for table", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // schema check
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table check
      .mockResolvedValueOnce({ rows: [], rowsAffected: 1 }); // INSERT

    const tool = tools.find((t) => t.name === "pg_batch_insert")!;
    await tool.handler(
      {
        tableName: "products", // alias
        rows: [{ name: "Widget" }],
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain('"products"');
  });

  it("should parse schema.table format", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // schema check
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table check
      .mockResolvedValueOnce({ rows: [], rowsAffected: 1 }); // INSERT

    const tool = tools.find((t) => t.name === "pg_batch_insert")!;
    await tool.handler(
      {
        table: "sales.orders",
        rows: [{ amount: 100 }],
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain('"sales"."orders"');
  });
});

// =============================================================================
// Convenience Tools - pg_count
// =============================================================================

describe("pg_count", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should count all rows in table", async () => {
    mockAdapter.executeQuery.mockResolvedValue({
      rows: [{ count: 42 }],
    });

    const tool = tools.find((t) => t.name === "pg_count")!;
    const result = (await tool.handler({ table: "users" }, mockContext)) as {
      count: number;
    };

    expect(result.count).toBe(42);

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain("COUNT(*)");
    expect(sql).not.toContain("WHERE");
  });

  it("should count with WHERE clause", async () => {
    mockAdapter.executeQuery.mockResolvedValue({
      rows: [{ count: 10 }],
    });

    const tool = tools.find((t) => t.name === "pg_count")!;
    const result = (await tool.handler(
      {
        table: "users",
        where: "active = true",
      },
      mockContext,
    )) as { count: number };

    expect(result.count).toBe(10);

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain("WHERE active = true");
  });

  it("should count with WHERE and params", async () => {
    mockAdapter.executeQuery.mockResolvedValue({
      rows: [{ count: 5 }],
    });

    const tool = tools.find((t) => t.name === "pg_count")!;
    await tool.handler(
      {
        table: "orders",
        where: "status = $1",
        params: ["pending"],
      },
      mockContext,
    );

    const params = mockAdapter.executeQuery.mock.calls[2]?.[1] as unknown[];
    expect(params).toEqual(["pending"]);
  });

  it("should count specific column", async () => {
    mockAdapter.executeQuery.mockResolvedValue({
      rows: [{ count: 30 }],
    });

    const tool = tools.find((t) => t.name === "pg_count")!;
    await tool.handler(
      {
        table: "users",
        column: "email", // Count non-null emails
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain('COUNT("email")');
  });

  it("should ignore empty where string", async () => {
    mockAdapter.executeQuery.mockResolvedValue({
      rows: [{ count: 100 }],
    });

    const tool = tools.find((t) => t.name === "pg_count")!;
    await tool.handler(
      {
        table: "users",
        where: "   ", // Empty/whitespace
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).not.toContain("WHERE");
  });

  it("should handle BigInt count values", async () => {
    mockAdapter.executeQuery.mockResolvedValue({
      rows: [{ count: "1000000000" }], // PostgreSQL returns bigint as string
    });

    const tool = tools.find((t) => t.name === "pg_count")!;
    const result = (await tool.handler({ table: "logs" }, mockContext)) as {
      count: number;
    };

    expect(result.count).toBe(1000000000);
  });

  it("should accept tableName as alias for table", async () => {
    mockAdapter.executeQuery.mockResolvedValue({
      rows: [{ count: 5 }],
    });

    const tool = tools.find((t) => t.name === "pg_count")!;
    await tool.handler({ tableName: "products" }, mockContext);

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain('"products"');
  });
});

// =============================================================================
// Convenience Tools - pg_truncate
// =============================================================================

describe("pg_truncate", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should execute basic TRUNCATE", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // schema check
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table check
      .mockResolvedValueOnce({ rows: [] }); // TRUNCATE

    const tool = tools.find((t) => t.name === "pg_truncate")!;
    const result = (await tool.handler({ table: "logs" }, mockContext)) as {
      success: boolean;
      table: string;
    };

    expect(result.success).toBe(true);
    expect(result.table).toBe("public.logs");

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain("TRUNCATE TABLE");
    expect(sql).not.toContain("CASCADE");
    expect(sql).not.toContain("RESTART IDENTITY");
  });

  it("should support CASCADE option", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // schema check
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table check
      .mockResolvedValueOnce({ rows: [] }); // TRUNCATE

    const tool = tools.find((t) => t.name === "pg_truncate")!;
    const result = (await tool.handler(
      {
        table: "orders",
        cascade: true,
      },
      mockContext,
    )) as { cascade: boolean };

    expect(result.cascade).toBe(true);

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain("CASCADE");
  });

  it("should support RESTART IDENTITY option", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // schema check
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table check
      .mockResolvedValueOnce({ rows: [] }); // TRUNCATE

    const tool = tools.find((t) => t.name === "pg_truncate")!;
    const result = (await tool.handler(
      {
        table: "users",
        restartIdentity: true,
      },
      mockContext,
    )) as { restartIdentity: boolean };

    expect(result.restartIdentity).toBe(true);

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain("RESTART IDENTITY");
  });

  it("should combine CASCADE and RESTART IDENTITY", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // schema check
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table check
      .mockResolvedValueOnce({ rows: [] }); // TRUNCATE

    const tool = tools.find((t) => t.name === "pg_truncate")!;
    await tool.handler(
      {
        table: "events",
        cascade: true,
        restartIdentity: true,
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain("RESTART IDENTITY");
    expect(sql).toContain("CASCADE");
  });

  it("should accept tableName as alias for table", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // schema check
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table check
      .mockResolvedValueOnce({ rows: [] }); // TRUNCATE

    const tool = tools.find((t) => t.name === "pg_truncate")!;
    await tool.handler({ tableName: "sessions" }, mockContext);

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain('"sessions"');
  });

  it("should parse schema.table format", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // schema check
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table check
      .mockResolvedValueOnce({ rows: [] }); // TRUNCATE

    const tool = tools.find((t) => t.name === "pg_truncate")!;
    await tool.handler(
      {
        table: "archive.old_events",
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(sql).toContain('"archive"."old_events"');
  });
});

// =============================================================================
// Index Tools - pg_drop_index
// =============================================================================

describe("pg_drop_index", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should execute DROP INDEX", async () => {
    mockAdapter.executeQuery.mockResolvedValue({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_drop_index")!;
    const result = (await tool.handler(
      { name: "idx_users_email" },
      mockContext,
    )) as { success: boolean; index: string; existed: boolean };

    expect(result.success).toBe(true);
    expect(result.index).toContain("idx_users_email");
    expect(result.existed).toBe(false);

    // mock.calls[0] is the existence check, mock.calls[1] is the DROP INDEX
    const sql = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
    expect(sql).toContain("DROP INDEX");
  });

  it("should support IF EXISTS option", async () => {
    mockAdapter.executeQuery.mockResolvedValue({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_drop_index")!;
    await tool.handler(
      {
        name: "idx_maybe_exists",
        ifExists: true,
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
    expect(sql).toContain("IF EXISTS");
  });

  it("should support CASCADE option", async () => {
    mockAdapter.executeQuery.mockResolvedValue({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_drop_index")!;
    await tool.handler(
      {
        name: "idx_with_deps",
        cascade: true,
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
    expect(sql).toContain("CASCADE");
  });

  it("should support CONCURRENTLY option", async () => {
    mockAdapter.executeQuery.mockResolvedValue({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_drop_index")!;
    await tool.handler(
      {
        name: "idx_large",
        concurrently: true,
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
    expect(sql).toContain("CONCURRENTLY");
  });

  it("should accept index as alias for name", async () => {
    mockAdapter.executeQuery.mockResolvedValue({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_drop_index")!;
    await tool.handler({ index: "idx_alias_test" }, mockContext);

    const sql = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
    expect(sql).toContain('"idx_alias_test"');
  });

  it("should accept indexName as alias for name", async () => {
    mockAdapter.executeQuery.mockResolvedValue({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_drop_index")!;
    await tool.handler({ indexName: "idx_alias_test2" }, mockContext);

    const sql = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
    expect(sql).toContain('"idx_alias_test2"');
  });

  it("should parse schema.name format", async () => {
    mockAdapter.executeQuery.mockResolvedValue({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_drop_index")!;
    await tool.handler({ name: "archive.idx_old_events" }, mockContext);

    const sql = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
    expect(sql).toContain('"archive"."idx_old_events"');
  });

  it("should combine all options", async () => {
    mockAdapter.executeQuery.mockResolvedValue({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_drop_index")!;
    await tool.handler(
      {
        name: "idx_combo",
        ifExists: true,
        cascade: true,
        concurrently: true,
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
    expect(sql).toContain("CONCURRENTLY");
    expect(sql).toContain("IF EXISTS");
    expect(sql).toContain("CASCADE");
  });

  it("should return existed: true when index exists before drop", async () => {
    // First call (existence check) returns a row, second call (DROP) succeeds
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_drop_index")!;
    const result = (await tool.handler(
      { name: "idx_exists" },
      mockContext,
    )) as { success: boolean; existed: boolean };

    expect(result.success).toBe(true);
    expect(result.existed).toBe(true);
  });

  it("should return existed: false when index does not exist", async () => {
    // First call (existence check) returns empty, second call (DROP IF EXISTS) succeeds
    mockAdapter.executeQuery.mockResolvedValue({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_drop_index")!;
    const result = (await tool.handler(
      { name: "idx_nonexistent", ifExists: true },
      mockContext,
    )) as { success: boolean; existed: boolean };

    expect(result.success).toBe(true);
    expect(result.existed).toBe(false);
  });
});

// =============================================================================
// Index Tools - pg_get_indexes (additional tests)
// =============================================================================

describe("pg_get_indexes - additional coverage", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should list all indexes when no table specified", async () => {
    mockAdapter.getAllIndexes.mockResolvedValue([
      { indexName: "idx1", tableName: "users", schemaName: "public" },
      { indexName: "idx2", tableName: "orders", schemaName: "public" },
      { indexName: "idx3", tableName: "events", schemaName: "archive" },
    ]);

    const tool = tools.find((t) => t.name === "pg_get_indexes")!;
    const result = (await tool.handler({}, mockContext)) as {
      indexes: unknown[];
      count: number;
      totalCount: number;
    };

    expect(mockAdapter.getAllIndexes).toHaveBeenCalled();
    expect(result.count).toBe(3);
    expect(result.totalCount).toBe(3);
  });

  it("should filter by schema when listing all indexes", async () => {
    mockAdapter.getAllIndexes.mockResolvedValue([
      { indexName: "idx1", tableName: "users", schemaName: "public" },
      { indexName: "idx2", tableName: "orders", schemaName: "public" },
      { indexName: "idx3", tableName: "events", schemaName: "archive" },
    ]);

    const tool = tools.find((t) => t.name === "pg_get_indexes")!;
    const result = (await tool.handler({ schema: "archive" }, mockContext)) as {
      indexes: unknown[];
      count: number;
    };

    expect(result.count).toBe(1);
  });

  it("should apply limit and show truncation hint", async () => {
    // Create more indexes than default limit
    const manyIndexes = Array.from({ length: 150 }, (_, i) => ({
      indexName: `idx_${i}`,
      tableName: "table",
      schemaName: "public",
    }));
    mockAdapter.getAllIndexes.mockResolvedValue(manyIndexes);

    const tool = tools.find((t) => t.name === "pg_get_indexes")!;
    const result = (await tool.handler({}, mockContext)) as {
      indexes: unknown[];
      count: number;
      totalCount: number;
      truncated: boolean;
      hint: string;
    };

    expect(result.count).toBe(100); // Default limit
    expect(result.totalCount).toBe(150);
    expect(result.truncated).toBe(true);
    expect(result.hint).toContain("limit");
  });

  it("should respect custom limit", async () => {
    mockAdapter.getAllIndexes.mockResolvedValue([
      { indexName: "idx1", tableName: "t1", schemaName: "public" },
      { indexName: "idx2", tableName: "t2", schemaName: "public" },
      { indexName: "idx3", tableName: "t3", schemaName: "public" },
    ]);

    const tool = tools.find((t) => t.name === "pg_get_indexes")!;
    const result = (await tool.handler({ limit: 2 }, mockContext)) as {
      indexes: unknown[];
      count: number;
    };

    expect(result.count).toBe(2);
  });
});

// =============================================================================
// Index Tools - pg_get_indexes (P154 existence checks)
// =============================================================================

describe("pg_get_indexes - P154 existence checks", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return structured error for nonexistent schema", async () => {
    // Schema check returns empty
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_get_indexes")!;
    const result = (await tool.handler(
      { table: "users", schema: "nonexistent" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Schema 'nonexistent' does not exist");
  });

  it("should return structured error for nonexistent table", async () => {
    // Schema check returns a row, table check returns empty
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_get_indexes")!;
    const result = (await tool.handler(
      { table: "nonexistent" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Table 'public.nonexistent' not found");
  });

  it("should not check existence when no table specified", async () => {
    mockAdapter.getAllIndexes.mockResolvedValue([]);

    const tool = tools.find((t) => t.name === "pg_get_indexes")!;
    const result = (await tool.handler({}, mockContext)) as {
      count: number;
    };

    expect(result.count).toBe(0);
    // executeQuery should NOT have been called (no existence check needed)
    expect(mockAdapter.executeQuery).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Index Tools - pg_create_index (additional coverage)
// =============================================================================

describe("pg_create_index - additional coverage", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return alreadyExists when ifNotExists check finds index", async () => {
    // Check query finds existing index
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "1": 1 }],
    });

    const tool = tools.find((t) => t.name === "pg_create_index")!;
    const result = (await tool.handler(
      {
        table: "users",
        columns: ["email"],
        name: "idx_existing",
        ifNotExists: true,
      },
      mockContext,
    )) as { success: boolean; alreadyExists: boolean };

    expect(result.success).toBe(true);
    expect(result.alreadyExists).toBe(true);
    // Should only call once (the check query, not the CREATE)
    expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(1);
  });

  it("should handle race condition with ifNotExists", async () => {
    // Check query says no index, but CREATE fails with already exists
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [] }) // Check passes
      .mockRejectedValueOnce(new Error("relation already exists")); // Race condition

    const tool = tools.find((t) => t.name === "pg_create_index")!;
    const result = (await tool.handler(
      {
        table: "users",
        columns: ["email"],
        name: "idx_race",
        ifNotExists: true,
      },
      mockContext,
    )) as { success: boolean; alreadyExists: boolean };

    expect(result.success).toBe(true);
    expect(result.alreadyExists).toBe(true);
  });

  it("should detect expression indexes and not quote them", async () => {
    mockAdapter.executeQuery.mockResolvedValue({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_index")!;
    await tool.handler(
      {
        table: "users",
        columns: ["lower(email)", "upper(name)"],
        name: "idx_expressions",
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain("lower(email)");
    expect(sql).toContain("upper(name)");
    expect(sql).not.toContain('"lower(email)"'); // Should not be quoted
  });

  it("should detect type cast expressions", async () => {
    mockAdapter.executeQuery.mockResolvedValue({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_index")!;
    await tool.handler(
      {
        table: "documents",
        columns: ["(metadata->>'created_at')::date"],
        name: "idx_cast",
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    // Cast expression should not be quoted
    expect(sql).toContain("(metadata->>'created_at')::date");
  });

  it("should include generatedName flag when name was auto-generated", async () => {
    mockAdapter.executeQuery.mockResolvedValue({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_index")!;
    const result = (await tool.handler(
      {
        table: "users",
        columns: ["email"],
        // No name provided - auto-generate
      },
      mockContext,
    )) as { generatedName: boolean };

    expect(result.generatedName).toBe(true);
  });
});

// =============================================================================
// Structured Error Handling (parsePostgresError)
// =============================================================================

describe("pg_write_query - structured error handling", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter() as unknown as ReturnType<
      typeof createMockPostgresAdapter
    >;
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return structured error for nonexistent table (42P01)", async () => {
    const pgError = new Error(
      'relation "nonexistent_table" does not exist',
    ) as Error & { code: string };
    pgError.code = "42P01";
    (
      mockAdapter as unknown as { executeWriteQuery: ReturnType<typeof vi.fn> }
    ).executeWriteQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_write_query")!;
    const result = (await tool.handler(
      { sql: 'INSERT INTO nonexistent_table VALUES (1, "test")' },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Table or view/i);
  });

  it("should return structured error for undefined column (42703)", async () => {
    const pgError = new Error(
      'column "bad_col" of relation "users" does not exist',
    ) as Error & { code: string };
    pgError.code = "42703";
    (
      mockAdapter as unknown as { executeWriteQuery: ReturnType<typeof vi.fn> }
    ).executeWriteQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_write_query")!;
    const result = (await tool.handler(
      { sql: "INSERT INTO users (bad_col) VALUES (1)" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Column not found/i);
  });
});

describe("pg_analyze_query_indexes - structured error handling", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter() as unknown as ReturnType<
      typeof createMockPostgresAdapter
    >;
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return structured error for syntax errors (42601)", async () => {
    const pgError = new Error('syntax error at or near "SELEC"') as Error & {
      code: string;
    };
    pgError.code = "42601";
    (
      mockAdapter as unknown as { executeQuery: ReturnType<typeof vi.fn> }
    ).executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_analyze_query_indexes")!;
    const result = (await tool.handler(
      { sql: "SELEC * FROM users" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/SQL syntax error/i);
  });
});

// =============================================================================
// Structured Error Handling - parsePostgresError (3B001, 25P02)
// =============================================================================

describe("parsePostgresError - savepoint and aborted transaction codes", () => {
  it("should produce structured error for nonexistent savepoint (3B001)", () => {
    const pgError = new Error('savepoint "my_sp" does not exist') as Error & {
      code: string;
    };
    pgError.code = "3B001";

    expect(() =>
      parsePostgresError(pgError, { tool: "pg_transaction_release" }),
    ).toThrow("Savepoint 'my_sp' does not exist in this transaction");
  });

  it("should produce structured error for aborted transaction (25P02)", () => {
    const pgError = new Error(
      "current transaction is aborted, commands ignored until end of transaction block",
    ) as Error & { code: string };
    pgError.code = "25P02";

    expect(() =>
      parsePostgresError(pgError, { tool: "pg_transaction_savepoint" }),
    ).toThrow("Transaction is in an aborted state");
  });

  it("should handle 25P02 via message pattern without code", () => {
    const pgError = new Error(
      "current transaction is aborted, commands ignored until end of transaction block",
    );

    expect(() =>
      parsePostgresError(pgError, { tool: "pg_transaction_commit" }),
    ).toThrow("aborted state");
  });
});

// =============================================================================
// formatPostgresError - Zod Validation Error Handling
// =============================================================================

describe("formatPostgresError - Zod validation errors", () => {
  it("should extract clean message from ZodError with path", () => {
    // Simulate ZodError structure (duck-typed via .issues array)
    const zodError = new Error("Validation failed") as Error & {
      issues: Array<{ message: string; path: string[]; code: string }>;
    };
    zodError.issues = [
      {
        code: "custom",
        path: ["buckets"],
        message: "buckets must be greater than 0",
      },
    ];

    const result = formatPostgresError(zodError, {
      tool: "pg_stats_distribution",
    });

    expect(result).toBe(
      "Validation error: buckets must be greater than 0 (buckets)",
    );
    expect(result).not.toContain('"code"'); // No raw JSON
  });

  it("should handle ZodError with multiple issues", () => {
    const zodError = new Error("Validation failed") as Error & {
      issues: Array<{ message: string; path: string[]; code: string }>;
    };
    zodError.issues = [
      {
        code: "custom",
        path: ["sampleSize"],
        message: "sampleSize must be greater than 0",
      },
      {
        code: "custom",
        path: ["percentage"],
        message: "percentage must be between 0 and 100",
      },
    ];

    const result = formatPostgresError(zodError, {
      tool: "pg_stats_sampling",
    });

    expect(result).toContain("sampleSize must be greater than 0");
    expect(result).toContain("percentage must be between 0 and 100");
    expect(result).toContain("; "); // Multiple issues joined
  });

  it("should handle ZodError without path", () => {
    const zodError = new Error("Validation failed") as Error & {
      issues: Array<{ message: string; path: string[]; code: string }>;
    };
    zodError.issues = [
      {
        code: "custom",
        path: [],
        message: "Invalid input",
      },
    ];

    const result = formatPostgresError(zodError, { tool: "pg_some_tool" });

    expect(result).toBe("Validation error: Invalid input");
  });
});

// =============================================================================
// Table Tools - pg_describe_table
// =============================================================================

describe("pg_describe_table", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should reject sequences with helpful error", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "S" }],
    });

    const tool = tools.find((t) => t.name === "pg_describe_table")!;
    const result = (await tool.handler(
      { table: "user_id_seq" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("is a sequence");
    expect(result.error).toContain("pg_read_query");
  });

  it("should reject invalid relkind with descriptive error", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "i" }],
    });

    const tool = tools.find((t) => t.name === "pg_describe_table")!;
    const result = (await tool.handler(
      { table: "idx_users_email" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("is a index");
    expect(result.error).toContain("pg_list_objects");
  });

  it("should catch errors and return structured error", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("connection refused"),
    );

    const tool = tools.find((t) => t.name === "pg_describe_table")!;
    const result = (await tool.handler({ table: "users" }, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("connection refused");
  });
});

// =============================================================================
// Table Tools - pg_create_table (constraint branches)
// =============================================================================

describe("pg_create_table", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should generate CHECK and UNIQUE constraints", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_table")!;
    const result = (await tool.handler(
      {
        table: "orders",
        columns: [
          { name: "id", type: "serial", primaryKey: true },
          { name: "amount", type: "numeric" },
          { name: "region", type: "text" },
        ],
        constraints: [
          { type: "check", expression: "amount > 0", name: "chk_amount" },
          {
            type: "unique",
            columns: ["region", "amount"],
            name: "uq_region_amount",
          },
        ],
      },
      mockContext,
    )) as { success: boolean; sql: string };

    expect(result.success).toBe(true);
    expect(result.sql).toContain('CONSTRAINT "chk_amount" CHECK (amount > 0)');
    expect(result.sql).toContain(
      'CONSTRAINT "uq_region_amount" UNIQUE ("region", "amount")',
    );
  });

  it("should generate column with references, onDelete, and onUpdate", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_table")!;
    const result = (await tool.handler(
      {
        table: "orders",
        columns: [
          { name: "id", type: "serial", primaryKey: true },
          {
            name: "user_id",
            type: "integer",
            references: {
              table: "users",
              column: "id",
              onDelete: "CASCADE",
              onUpdate: "SET NULL",
            },
          },
        ],
      },
      mockContext,
    )) as { success: boolean; sql: string };

    expect(result.success).toBe(true);
    expect(result.sql).toContain('REFERENCES "users"("id")');
    expect(result.sql).toContain("ON DELETE CASCADE");
    expect(result.sql).toContain("ON UPDATE SET NULL");
  });

  it("should return structured error on create failure", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error('relation "orders" already exists'),
    );

    const tool = tools.find((t) => t.name === "pg_create_table")!;
    const result = (await tool.handler(
      {
        table: "orders",
        columns: [{ name: "id", type: "serial" }],
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("already exists");
  });

  it("should generate column with CHECK, DEFAULT, and UNIQUE", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_table")!;
    const result = (await tool.handler(
      {
        table: "products",
        columns: [
          { name: "id", type: "serial", primaryKey: true },
          {
            name: "price",
            type: "numeric",
            default: "0",
            check: "price >= 0",
            unique: true,
          },
        ],
      },
      mockContext,
    )) as { success: boolean; sql: string };

    expect(result.success).toBe(true);
    expect(result.sql).toContain("DEFAULT 0");
    expect(result.sql).toContain("CHECK (price >= 0)");
    // unique column that is not primaryKey should get UNIQUE
    expect(result.sql).toContain("UNIQUE");
  });
});

// =============================================================================
// Object Tools - pg_object_details
// =============================================================================

describe("pg_object_details", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return error when type hint mismatches detected type", async () => {
    // Detection returns 'table' but user specified 'view'
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ object_type: "table" }],
    });

    const tool = tools.find((t) => t.name === "pg_object_details")!;
    const result = (await tool.handler(
      { name: "users", type: "view" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("is a table, not a view");
  });

  it("should return error when type specified but object not found", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ object_type: null }],
    });

    const tool = tools.find((t) => t.name === "pg_object_details")!;
    const result = (await tool.handler(
      { name: "nonexistent", type: "table" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("should return view definition for view objects", async () => {
    // Detection returns 'view'
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ object_type: "view" }],
    });
    // describeTable
    mockAdapter.describeTable.mockResolvedValueOnce({
      name: "active_users",
      schema: "public",
      type: "view",
      columns: [{ name: "id", type: "integer", nullable: false }],
    });
    // View definition query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ definition: "SELECT id FROM users WHERE active" }],
    });

    const tool = tools.find((t) => t.name === "pg_object_details")!;
    const result = (await tool.handler(
      { name: "active_users" },
      mockContext,
    )) as { type: string; definition: string; hasDefinition: boolean };

    expect(result.type).toBe("view");
    expect(result.definition).toBe("SELECT id FROM users WHERE active");
    expect(result.hasDefinition).toBe(true);
  });

  it("should return sequence metadata and current value", async () => {
    // Detection returns 'sequence'
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ object_type: "sequence" }],
    });
    // Sequence metadata
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          start_value: 1,
          min_value: 1,
          max_value: 1000,
          increment: 1,
          cycle: false,
          cache: 1,
          owner: "test",
        },
      ],
    });
    // Current value
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ last_value: 42, is_called: true }],
    });

    const tool = tools.find((t) => t.name === "pg_object_details")!;
    const result = (await tool.handler(
      { name: "user_id_seq" },
      mockContext,
    )) as { type: string; last_value: number; current_value: number };

    expect(result.type).toBe("sequence");
    expect(result.last_value).toBe(42);
    expect(result.current_value).toBe(42);
  });

  it("should return index metadata", async () => {
    // Detection returns 'index'
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ object_type: "index" }],
    });
    // Index metadata
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          index_name: "idx_users_email",
          table_name: "users",
          index_type: "btree",
          definition:
            "CREATE INDEX idx_users_email ON users USING btree (email)",
          is_unique: false,
          is_primary: false,
          size: "16 kB",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_object_details")!;
    const result = (await tool.handler(
      { name: "idx_users_email" },
      mockContext,
    )) as { type: string; index_type: string; table_name: string };

    expect(result.type).toBe("index");
    expect(result.index_type).toBe("btree");
    expect(result.table_name).toBe("users");
  });

  it("should catch errors and return structured error", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("permission denied"),
    );

    const tool = tools.find((t) => t.name === "pg_object_details")!;
    const result = (await tool.handler(
      { name: "secret_table" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("permission denied");
  });
});
