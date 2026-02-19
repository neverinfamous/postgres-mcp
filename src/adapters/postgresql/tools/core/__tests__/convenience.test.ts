/**
 * postgres-mcp - Convenience Tools Unit Tests
 *
 * Tests for table existence pre-checks (P154 pattern) in convenience tools:
 * pg_count, pg_exists, pg_upsert, pg_batch_insert, pg_truncate
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getConvenienceTools } from "../convenience.js";
import type { PostgresAdapter } from "../../../PostgresAdapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../../__tests__/mocks/index.js";

describe("Convenience Tools - Table Existence Pre-checks", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getConvenienceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getConvenienceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  // =========================================================================
  // pg_count
  // =========================================================================

  describe("pg_count", () => {
    it("should throw high-signal error for nonexistent table", async () => {
      // Mock 1: schema check passes
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      // Mock 2: table check returns empty (table not found)
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_count")!;
      await expect(
        tool.handler({ table: "nonexistent" }, mockContext),
      ).rejects.toThrow(
        "Table 'public.nonexistent' not found. Use pg_list_tables to see available tables.",
      );
    });

    it("should throw schema-specific error for nonexistent schema", async () => {
      // Mock 1: schema check returns empty (schema not found)
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_count")!;
      await expect(
        tool.handler({ table: "orders", schema: "fake_schema" }, mockContext),
      ).rejects.toThrow(
        "Schema 'fake_schema' does not exist. Use pg_list_objects with type 'table' to see available schemas.",
      );
    });

    it("should execute normally when table exists", async () => {
      // Mock 1: schema check passes
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      // Mock 2: table check passes
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      // Mock 3: actual COUNT query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ count: 42 }],
      });

      const tool = tools.find((t) => t.name === "pg_count")!;
      const result = (await tool.handler({ table: "users" }, mockContext)) as {
        count: number;
      };

      expect(result.count).toBe(42);
      expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(3);
    });

    it("should use custom schema in existence check", async () => {
      // Mock 1: schema check passes
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      // Mock 2: table check returns empty
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_count")!;
      await expect(
        tool.handler({ table: "orders", schema: "sales" }, mockContext),
      ).rejects.toThrow("Table 'sales.orders' not found");
    });
  });

  // =========================================================================
  // pg_exists
  // =========================================================================

  describe("pg_exists", () => {
    it("should throw high-signal error for nonexistent table", async () => {
      // Mock 1: schema check passes
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      // Mock 2: table check returns empty
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_exists")!;
      await expect(
        tool.handler({ table: "nonexistent" }, mockContext),
      ).rejects.toThrow(
        "Table 'public.nonexistent' not found. Use pg_list_tables to see available tables.",
      );
    });

    it("should throw schema-specific error for nonexistent schema", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_exists")!;
      await expect(
        tool.handler({ table: "users", schema: "fake_schema" }, mockContext),
      ).rejects.toThrow(
        "Schema 'fake_schema' does not exist. Use pg_list_objects with type 'table' to see available schemas.",
      );
    });

    it("should execute normally when table exists", async () => {
      // Mock 1: schema check passes
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      // Mock 2: table check passes
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      // Mock 3: actual EXISTS query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ exists: true }],
      });

      const tool = tools.find((t) => t.name === "pg_exists")!;
      const result = (await tool.handler({ table: "users" }, mockContext)) as {
        exists: boolean;
        mode: string;
      };

      expect(result.exists).toBe(true);
      expect(result.mode).toBe("any_rows");
    });
  });

  // =========================================================================
  // pg_upsert
  // =========================================================================

  describe("pg_upsert", () => {
    it("should throw high-signal error for nonexistent table", async () => {
      // Mock 1: schema check passes
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      // Mock 2: table check returns empty
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_upsert")!;
      await expect(
        tool.handler(
          {
            table: "nonexistent",
            data: { name: "test" },
            conflictColumns: ["id"],
          },
          mockContext,
        ),
      ).rejects.toThrow(
        "Table 'public.nonexistent' not found. Use pg_list_tables to see available tables.",
      );
    });

    it("should throw schema-specific error for nonexistent schema", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_upsert")!;
      await expect(
        tool.handler(
          {
            table: "users",
            schema: "fake_schema",
            data: { name: "test" },
            conflictColumns: ["id"],
          },
          mockContext,
        ),
      ).rejects.toThrow(
        "Schema 'fake_schema' does not exist. Use pg_list_objects with type 'table' to see available schemas.",
      );
    });

    it("should execute normally when table exists", async () => {
      // Mock 1: schema check passes
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      // Mock 2: table check passes
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      // Mock 3: actual UPSERT query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ _xmax: 0 }],
        rowsAffected: 1,
      });

      const tool = tools.find((t) => t.name === "pg_upsert")!;
      const result = (await tool.handler(
        {
          table: "users",
          data: { name: "test" },
          conflictColumns: ["id"],
        },
        mockContext,
      )) as { success: boolean; operation: string };

      expect(result.success).toBe(true);
      expect(result.operation).toBe("insert");
    });
  });

  // =========================================================================
  // pg_batch_insert
  // =========================================================================

  describe("pg_batch_insert", () => {
    it("should throw high-signal error for nonexistent table", async () => {
      // Mock 1: schema check passes
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      // Mock 2: table check returns empty
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_batch_insert")!;
      await expect(
        tool.handler(
          {
            table: "nonexistent",
            rows: [{ name: "test" }],
          },
          mockContext,
        ),
      ).rejects.toThrow(
        "Table 'public.nonexistent' not found. Use pg_list_tables to see available tables.",
      );
    });

    it("should throw schema-specific error for nonexistent schema", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_batch_insert")!;
      await expect(
        tool.handler(
          {
            table: "users",
            schema: "fake_schema",
            rows: [{ name: "test" }],
          },
          mockContext,
        ),
      ).rejects.toThrow(
        "Schema 'fake_schema' does not exist. Use pg_list_objects with type 'table' to see available schemas.",
      );
    });

    it("should execute normally when table exists", async () => {
      // Mock 1: schema check passes
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      // Mock 2: table check passes
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      // Mock 3: actual INSERT query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [],
        rowsAffected: 2,
      });

      const tool = tools.find((t) => t.name === "pg_batch_insert")!;
      const result = (await tool.handler(
        {
          table: "users",
          rows: [{ name: "Alice" }, { name: "Bob" }],
        },
        mockContext,
      )) as { success: boolean; rowsAffected: number };

      expect(result.success).toBe(true);
      expect(result.rowsAffected).toBe(2);
    });
  });

  // =========================================================================
  // pg_truncate
  // =========================================================================

  describe("pg_truncate", () => {
    it("should throw high-signal error for nonexistent table", async () => {
      // Mock 1: schema check passes
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      // Mock 2: table check returns empty
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_truncate")!;
      await expect(
        tool.handler({ table: "nonexistent" }, mockContext),
      ).rejects.toThrow(
        "Table 'public.nonexistent' not found. Use pg_list_tables to see available tables.",
      );
    });

    it("should throw schema-specific error for nonexistent schema", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_truncate")!;
      await expect(
        tool.handler({ table: "events", schema: "fake_schema" }, mockContext),
      ).rejects.toThrow(
        "Schema 'fake_schema' does not exist. Use pg_list_objects with type 'table' to see available schemas.",
      );
    });

    it("should execute normally when table exists", async () => {
      // Mock 1: schema check passes
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      // Mock 2: table check passes
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      // Mock 3: actual TRUNCATE query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [],
        rowsAffected: 0,
      });

      const tool = tools.find((t) => t.name === "pg_truncate")!;
      const result = (await tool.handler({ table: "logs" }, mockContext)) as {
        success: boolean;
        table: string;
      };

      expect(result.success).toBe(true);
      expect(result.table).toBe("public.logs");
    });

    it("should use custom schema in existence check", async () => {
      // Mock 1: schema check passes
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      // Mock 2: table check returns empty
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_truncate")!;
      await expect(
        tool.handler({ table: "events", schema: "analytics" }, mockContext),
      ).rejects.toThrow("Table 'analytics.events' not found");
    });
  });

  // =========================================================================
  // pg_batch_insert - constraint violation structured error
  // =========================================================================

  describe("pg_batch_insert - structured error handling", () => {
    it("should throw structured error for unique constraint violation (23505)", async () => {
      // Mock 1: schema check passes
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      // Mock 2: table check passes
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      // Mock 3: INSERT fails with unique constraint violation
      const pgError = new Error(
        'duplicate key value violates unique constraint "users_email_key"',
      ) as Error & { code: string };
      pgError.code = "23505";
      mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

      const tool = tools.find((t) => t.name === "pg_batch_insert")!;
      await expect(
        tool.handler(
          {
            table: "users",
            rows: [
              { name: "Alice", email: "alice@test.com" },
              { name: "Bob", email: "alice@test.com" },
            ],
          },
          mockContext,
        ),
      ).rejects.toThrow("Unique constraint violated");
    });
  });
});
