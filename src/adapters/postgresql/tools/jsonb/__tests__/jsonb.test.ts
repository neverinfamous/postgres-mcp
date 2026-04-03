/**
 * postgres-mcp - JSONB Tools Unit Tests
 *
 * Tests for JSONB database operations covering tool definitions,
 * schema validation, and handler execution.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getJsonbTools } from "../index.js";
import type { PostgresAdapter } from "../../../postgres-adapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../../__tests__/mocks/index.js";

describe("getJsonbTools", () => {
  let adapter: PostgresAdapter;
  let tools: ReturnType<typeof getJsonbTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockPostgresAdapter() as unknown as PostgresAdapter;
    tools = getJsonbTools(adapter);
  });

  it("should return 20 JSONB tools", () => {
    expect(tools).toHaveLength(20);
  });

  it("should have all expected tool names", () => {
    const toolNames = tools.map((t) => t.name);
    // Basic tools
    expect(toolNames).toContain("pg_jsonb_extract");
    expect(toolNames).toContain("pg_jsonb_set");
    expect(toolNames).toContain("pg_jsonb_insert");
    expect(toolNames).toContain("pg_jsonb_delete");
    expect(toolNames).toContain("pg_jsonb_contains");
    expect(toolNames).toContain("pg_jsonb_path_query");
    expect(toolNames).toContain("pg_jsonb_agg");
    expect(toolNames).toContain("pg_jsonb_object");
    expect(toolNames).toContain("pg_jsonb_array");
    expect(toolNames).toContain("pg_jsonb_keys");
    expect(toolNames).toContain("pg_jsonb_strip_nulls");
    expect(toolNames).toContain("pg_jsonb_typeof");
    // Advanced tools
    expect(toolNames).toContain("pg_jsonb_validate_path");
    expect(toolNames).toContain("pg_jsonb_merge");
    expect(toolNames).toContain("pg_jsonb_normalize");
    expect(toolNames).toContain("pg_jsonb_diff");
    expect(toolNames).toContain("pg_jsonb_index_suggest");
    expect(toolNames).toContain("pg_jsonb_security_scan");
    expect(toolNames).toContain("pg_jsonb_stats");
    expect(toolNames).toContain("pg_jsonb_pretty");
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

  it("should have group set to jsonb for all tools", () => {
    for (const tool of tools) {
      expect(tool.group).toBe("jsonb");
    }
  });
});

describe("Tool Annotations", () => {
  let tools: ReturnType<typeof getJsonbTools>;

  beforeEach(() => {
    tools = getJsonbTools(
      createMockPostgresAdapter() as unknown as PostgresAdapter,
    );
  });

  it("pg_jsonb_extract should be read-only", () => {
    const tool = tools.find((t) => t.name === "pg_jsonb_extract")!;
    expect(tool.annotations?.readOnlyHint).toBe(true);
  });

  it("pg_jsonb_contains should be read-only", () => {
    const tool = tools.find((t) => t.name === "pg_jsonb_contains")!;
    expect(tool.annotations?.readOnlyHint).toBe(true);
  });

  it("pg_jsonb_set should be destructive", () => {
    const tool = tools.find((t) => t.name === "pg_jsonb_set")!;
    expect(tool.annotations?.readOnlyHint).toBe(false);
  });

  it("pg_jsonb_delete should be destructive", () => {
    const tool = tools.find((t) => t.name === "pg_jsonb_delete")!;
    expect(tool.annotations?.readOnlyHint).toBe(false);
  });
});

describe("Handler Execution", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getJsonbTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getJsonbTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  describe("pg_jsonb_extract", () => {
    it("should execute JSONB extraction query", async () => {
      mockAdapter.executeQuery.mockResolvedValue({
        rows: [{ id: 1, extracted_value: "test@example.com" }],
      });

      const tool = tools.find((t) => t.name === "pg_jsonb_extract")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "metadata",
          path: "$.email",
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result).toHaveProperty("rows");
    });
  });

  describe("pg_jsonb_contains", () => {
    it("should execute containment check", async () => {
      mockAdapter.executeQuery.mockResolvedValue({
        rows: [{ id: 1, metadata: { key: "value" } }],
      });

      const tool = tools.find((t) => t.name === "pg_jsonb_contains")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "metadata",
          contains: { role: "admin" },
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("pg_jsonb_keys", () => {
    it("should extract JSONB keys", async () => {
      mockAdapter.executeQuery.mockResolvedValue({
        rows: [{ key: "name" }, { key: "email" }, { key: "age" }],
      });

      const tool = tools.find((t) => t.name === "pg_jsonb_keys")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "metadata",
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("pg_jsonb_typeof", () => {
    it("should return JSONB type information", async () => {
      mockAdapter.executeQuery.mockResolvedValue({
        rows: [{ jsonb_typeof: "object" }],
      });

      const tool = tools.find((t) => t.name === "pg_jsonb_typeof")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "metadata",
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("pg_jsonb_stats", () => {
    it("should return JSONB column statistics", async () => {
      mockAdapter.executeQuery.mockResolvedValue({
        rows: [
          {
            avg_depth: 2.5,
            avg_keys: 5,
            total_rows: 1000,
          },
        ],
      });

      const tool = tools.find((t) => t.name === "pg_jsonb_stats")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "metadata",
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("pg_jsonb_index_suggest", () => {
    it("should suggest indexes for JSONB column", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [], // No existing indexes
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ path: "$.email", count: 500 }],
      });

      const tool = tools.find((t) => t.name === "pg_jsonb_index_suggest")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "metadata",
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("pg_jsonb_security_scan", () => {
    it("should scan JSONB for security issues", async () => {
      mockAdapter.executeQuery.mockResolvedValue({
        rows: [],
      });

      const tool = tools.find((t) => t.name === "pg_jsonb_security_scan")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "metadata",
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("should return medium risk level when 1-2 issues found", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ key: "password", count: 5 }] }) // sensitive key found
        .mockResolvedValueOnce({ rows: [] }); // no injection patterns

      const tool = tools.find((t) => t.name === "pg_jsonb_security_scan")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "metadata",
        },
        mockContext,
      )) as { riskLevel: string; issues: unknown[] };

      expect(result.riskLevel).toBe("medium");
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it("should return high risk level when 3+ issues found", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({
          rows: [
            { key: "password", count: 5 },
            { key: "api_key", count: 3 },
            { key: "secret", count: 2 },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ key: "query_input", count: 1 }] }); // injection pattern

      const tool = tools.find((t) => t.name === "pg_jsonb_security_scan")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "metadata",
        },
        mockContext,
      )) as { riskLevel: string; issues: unknown[] };

      expect(result.riskLevel).toBe("high");
      expect(result.issues.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("pg_jsonb_normalize", () => {
    it("should use array mode with jsonb_array_elements", async () => {
      // First call is idColumn detection, second is the actual query
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [] }) // No 'id' column found
        .mockResolvedValueOnce({
          rows: [{ element: { id: 1 } }, { element: { id: 2 } }],
        });

      const tool = tools.find((t) => t.name === "pg_jsonb_normalize")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "tags",
          mode: "array",
        },
        mockContext,
      )) as { rows: unknown[]; count: number };

      // Check the second call (index 1) for the main query
      const sql = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
      expect(sql).toContain("jsonb_array_elements");
      expect(result.count).toBe(2);
    });

    it("should use flatten mode with jsonb_each", async () => {
      // First call is idColumn detection, second is the actual query
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [] }) // No 'id' column found
        .mockResolvedValueOnce({
          rows: [
            { key: "name", value: '"John"' },
            { key: "age", value: "30" },
          ],
        });

      const tool = tools.find((t) => t.name === "pg_jsonb_normalize")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "metadata",
          mode: "flatten",
        },
        mockContext,
      )) as { rows: unknown[]; count: number };

      // Check the second call (index 1) for the main query
      const sql = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
      expect(sql).toContain("jsonb_each");
      expect(sql).not.toContain("jsonb_each_text");
      expect(result.count).toBe(2);
    });

    it("should use keys mode (default) with jsonb_each_text", async () => {
      // First call is idColumn detection, second is the actual query
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [] }) // No 'id' column found
        .mockResolvedValueOnce({ rows: [{ key: "name", value: "John" }] });

      const tool = tools.find((t) => t.name === "pg_jsonb_normalize")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "metadata",
          // mode defaults to 'keys'
        },
        mockContext,
      )) as { rows: unknown[]; count: number };

      // Check the second call (index 1) for the main query
      const sql = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
      expect(sql).toContain("jsonb_each_text");
      expect(result.count).toBe(1);
    });
  });

  describe("pg_jsonb_index_suggest frequent keys", () => {
    it("should recommend expression index for frequent keys", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({
          rows: [{ key: "email", frequency: 800, value_type: "string" }], // >50% of 1000 sample
        })
        .mockResolvedValueOnce({ rows: [] }); // no existing indexes

      const tool = tools.find((t) => t.name === "pg_jsonb_index_suggest")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "metadata",
          sampleSize: 1000,
        },
        mockContext,
      )) as { recommendations: string[] };

      expect(result.recommendations).toContainEqual(
        expect.stringContaining("email"),
      );
      expect(result.recommendations).toContainEqual(
        expect.stringContaining("->>"),
      );
    });
  });
});

describe("Error Handling", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getJsonbTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getJsonbTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should propagate database errors", async () => {
    const dbError = new Error("JSONB column not found");
    mockAdapter.executeQuery.mockRejectedValue(dbError);

    const tool = tools.find((t) => t.name === "pg_jsonb_extract")!;

    const result = (await tool.handler(
      {
        table: "users",
        column: "nonexistent",
        path: "$.key",
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/JSONB column not found/);
  });

  it("should validate required parameters", async () => {
    const tool = tools.find((t) => t.name === "pg_jsonb_extract")!;

    // Missing required parameters
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("JSONB Validation and Error Paths", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getJsonbTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getJsonbTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  describe("pg_jsonb_set validations", () => {
    it("should reject empty WHERE clause", async () => {
      const tool = tools.find((t) => t.name === "pg_jsonb_set")!;

      const result = (await tool.handler(
        {
          table: "users",
          column: "metadata",
          path: "name",
          value: "test",
          where: "",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/WHERE clause/);
    });

    it("should reject when value is undefined", async () => {
      const tool = tools.find((t) => t.name === "pg_jsonb_set")!;

      const result = (await tool.handler(
        { table: "users", column: "metadata", path: "name", where: "id = 1" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/value parameter/);
    });

    it("should handle empty path - replace entire column", async () => {
      mockAdapter.executeQuery.mockResolvedValue({ rowsAffected: 1 });

      const tool = tools.find((t) => t.name === "pg_jsonb_set")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "metadata",
          path: [],
          value: { new: "data" },
          where: "id = 1",
        },
        mockContext,
      )) as { rowsAffected: number; hint: string };

      expect(result.hint).toContain("empty path");
    });

    it("should handle deep nested path with createMissing", async () => {
      mockAdapter.executeQuery.mockResolvedValue({ rowsAffected: 1 });

      const tool = tools.find((t) => t.name === "pg_jsonb_set")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "metadata",
          path: "a.b.c",
          value: "deep",
          where: "id = 1",
          createMissing: true,
        },
        mockContext,
      )) as { rowsAffected: number };

      expect(result.rowsAffected).toBe(1);
    });
  });

  describe("pg_jsonb_delete validations", () => {
    it("should reject empty WHERE clause", async () => {
      const tool = tools.find((t) => t.name === "pg_jsonb_delete")!;

      const result = (await tool.handler(
        { table: "users", column: "metadata", path: "key", where: "" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/WHERE clause/);
    });

    it("should reject empty path", async () => {
      const tool = tools.find((t) => t.name === "pg_jsonb_delete")!;

      const result = (await tool.handler(
        { table: "users", column: "metadata", path: "", where: "id = 1" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/non-empty path/);
    });

    it("should reject empty array path", async () => {
      const tool = tools.find((t) => t.name === "pg_jsonb_delete")!;

      const result = (await tool.handler(
        { table: "users", column: "metadata", path: [], where: "id = 1" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/non-empty path/);
    });

    it("should handle numeric path (array index)", async () => {
      mockAdapter.executeQuery.mockResolvedValue({ rowsAffected: 1 });

      const tool = tools.find((t) => t.name === "pg_jsonb_delete")!;
      const result = (await tool.handler(
        { table: "users", column: "tags", path: 0, where: "id = 1" },
        mockContext,
      )) as { rowsAffected: number };

      expect(result.rowsAffected).toBe(1);
    });

    it("should handle numeric string path (array index)", async () => {
      mockAdapter.executeQuery.mockResolvedValue({ rowsAffected: 1 });

      const tool = tools.find((t) => t.name === "pg_jsonb_delete")!;
      const result = (await tool.handler(
        { table: "users", column: "tags", path: "0", where: "id = 1" },
        mockContext,
      )) as { rowsAffected: number };

      expect(result.rowsAffected).toBe(1);
    });

    it("should accept path as a dot-separated string that parses into array", async () => {
      mockAdapter.executeQuery.mockResolvedValue({ rowsAffected: 1 });

      const tool = tools.find((t) => t.name === "pg_jsonb_delete")!;
      const result = (await tool.handler(
        { table: "users", column: "tags", path: "a.b.c", where: "id = 1" },
        mockContext,
      )) as { rowsAffected: number };

      expect(result.rowsAffected).toBe(1);
    });

    it("should propagate database error in pg_jsonb_delete", async () => {
      mockAdapter.executeQuery.mockRejectedValue(new Error("db error delete"));
      const tool = tools.find((t) => t.name === "pg_jsonb_delete")!;
      const result = (await tool.handler(
        { table: "users", column: "tags", path: "a", where: "id = 1" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/db error delete/);
    });
  });

  describe("pg_jsonb_insert validations", () => {
    it("should reject empty WHERE clause", async () => {
      const tool = tools.find((t) => t.name === "pg_jsonb_insert")!;

      const result = (await tool.handler(
        {
          table: "users",
          column: "tags",
          path: ["tags", 0],
          value: "new",
          where: "",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/WHERE clause/);
    });

    it("should reject NULL columns", async () => {
      mockAdapter.executeQuery.mockResolvedValue({
        rows: [{ null_count: 1 }],
      });

      const tool = tools.find((t) => t.name === "pg_jsonb_insert")!;

      const result = (await tool.handler(
        {
          table: "users",
          column: "tags",
          path: [0],
          value: "new",
          where: "id = 1",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/NULL columns/);
    });

    it("should reject string index paths that are not numeric", async () => {
      mockAdapter.executeQuery.mockRejectedValue(
        new Error("path element is not an integer"),
      );
      const tool = tools.find((t) => t.name === "pg_jsonb_insert")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "tags",
          path: ["tags", "invalid"],
          value: "new",
          where: "id = 1",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/requires numeric index/);
    });

    it("should improve error when trying to replace existing key (object target)", async () => {
      mockAdapter.executeQuery.mockRejectedValue(
        new Error("cannot replace existing key"),
      );
      const tool = tools.find((t) => t.name === "pg_jsonb_insert")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "tags",
          path: ["tags", 0],
          value: "new",
          where: "id = 1",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Cannot substitute an existing key/);
    });


  });

  describe("pg_jsonb_strip_nulls validations", () => {
    it("should reject empty WHERE clause", async () => {
      const tool = tools.find((t) => t.name === "pg_jsonb_strip_nulls")!;

      const result = (await tool.handler(
        { table: "users", column: "metadata", where: "" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/WHERE clause/);
    });

    it("should handle preview mode", async () => {
      mockAdapter.executeQuery.mockResolvedValue({
        rows: [{ before: { a: null, b: 1 }, after: { b: 1 } }],
      });

      const tool = tools.find((t) => t.name === "pg_jsonb_strip_nulls")!;
      const result = (await tool.handler(
        { table: "users", column: "metadata", where: "id = 1", preview: true },
        mockContext,
      )) as { preview: boolean; rows: unknown[] };

      expect(result.preview).toBe(true);
      expect(result.rows).toBeDefined();
    });

    it("should reject when table or column are missing (Zod validation bypass)", async () => {
      const tool = tools.find((t) => t.name === "pg_jsonb_strip_nulls")!;
      // Casting to bypass inputSchema validation if called directly
      const result = (await tool.handler(
        { table: "users" } as any, // missing column and where
        mockContext,
      )) as { success: boolean; error: string };
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/validation error/i);
    });
  });

  describe("pg_jsonb_keys error handling", () => {
    it("should improve error for array columns", async () => {
      mockAdapter.executeQuery.mockRejectedValue(
        new Error("cannot call jsonb_object_keys on an array"),
      );

      const tool = tools.find((t) => t.name === "pg_jsonb_keys")!;

      const result = (await tool.handler(
        { table: "users", column: "tags" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/array columns/);
    });
  });

  describe("pg_jsonb_contains edge cases", () => {
    it("should warn about empty object matching all rows", async () => {
      mockAdapter.executeQuery.mockResolvedValue({
        rows: [{ id: 1 }, { id: 2 }],
      });

      const tool = tools.find((t) => t.name === "pg_jsonb_contains")!;
      const result = (await tool.handler(
        { table: "users", column: "metadata", value: {} },
        mockContext,
      )) as { warning?: string };

      expect(result.warning).toContain("Empty {}");
    });

    it("should truncate results at default limit (100) and report totalCount", async () => {
      // Simulate 101 rows returned (limit+1 detection pattern)
      const rows = Array.from({ length: 101 }, (_, i) => ({ id: i + 1 }));
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows }) // main query returns 101 (limit+1)
        .mockResolvedValueOnce({ rows: [{ total: 250 }] }); // count query

      const tool = tools.find((t) => t.name === "pg_jsonb_contains")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "metadata",
          value: { role: "admin" },
        },
        mockContext,
      )) as {
        rows: unknown[];
        count: number;
        truncated: boolean;
        totalCount: number;
      };

      expect(result.count).toBe(100);
      expect(result.truncated).toBe(true);
      expect(result.totalCount).toBe(250);
      expect((result.rows as unknown[]).length).toBe(100);
    });

    it("should not truncate when limit is 0", async () => {
      const rows = Array.from({ length: 200 }, (_, i) => ({ id: i + 1 }));
      mockAdapter.executeQuery.mockResolvedValue({ rows });

      const tool = tools.find((t) => t.name === "pg_jsonb_contains")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "metadata",
          value: { role: "admin" },
          limit: 0,
        },
        mockContext,
      )) as { rows: unknown[]; count: number; truncated?: boolean };

      expect(result.count).toBe(200);
      expect(result.truncated).toBeUndefined();
    });
  });

  describe("pg_jsonb_path_query default limit", () => {
    it("should truncate results at default limit (100) and report totalCount", async () => {
      // Simulate 101 results returned (limit+1 detection pattern)
      const rows = Array.from({ length: 101 }, (_, i) => ({
        result: `value_${String(i)}`,
      }));
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows }) // main query returns 101
        .mockResolvedValueOnce({ rows: [{ total: 500 }] }); // count query

      const tool = tools.find((t) => t.name === "pg_jsonb_path_query")!;
      const result = (await tool.handler(
        { table: "users", column: "metadata", path: "$.items[*].name" },
        mockContext,
      )) as {
        results: unknown[];
        count: number;
        truncated: boolean;
        totalCount: number;
      };

      expect(result.count).toBe(100);
      expect(result.truncated).toBe(true);
      expect(result.totalCount).toBe(500);
      expect(result.results.length).toBe(100);
    });

    it("should not truncate when limit is 0", async () => {
      const rows = Array.from({ length: 200 }, (_, i) => ({
        result: `value_${String(i)}`,
      }));
      mockAdapter.executeQuery.mockResolvedValue({ rows });

      const tool = tools.find((t) => t.name === "pg_jsonb_path_query")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "metadata",
          path: "$.items[*].name",
          limit: 0,
        },
        mockContext,
      )) as { results: unknown[]; count: number; truncated?: boolean };

      expect(result.count).toBe(200);
      expect(result.truncated).toBeUndefined();
    });
  });

  describe("pg_jsonb_extract with select columns", () => {
    it("should include select columns in result", async () => {
      mockAdapter.executeQuery.mockResolvedValue({
        rows: [{ id: 1, extracted_value: "test@example.com" }],
      });

      const tool = tools.find((t) => t.name === "pg_jsonb_extract")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "metadata",
          path: "email",
          select: ["id"],
        },
        mockContext,
      )) as { rows: Array<{ id: number; value: string }> };

      expect(result.rows[0]).toHaveProperty("id");
      expect(result.rows[0]).toHaveProperty("value");
    });

    it("should add hint when all values are null", async () => {
      mockAdapter.executeQuery.mockResolvedValue({
        rows: [{ extracted_value: null }],
      });

      const tool = tools.find((t) => t.name === "pg_jsonb_extract")!;
      const result = (await tool.handler(
        {
          table: "users",
          column: "metadata",
          path: "nonexistent",
        },
        mockContext,
      )) as { hint?: string };

      expect(result.hint).toContain("null");
    });
  });

  describe("pg_jsonb_agg groupBy mode", () => {
    it("should return grouped results", async () => {
      mockAdapter.executeQuery.mockResolvedValue({
        rows: [
          { group_key: "admin", items: [{ id: 1 }] },
          { group_key: "user", items: [{ id: 2 }] },
        ],
      });

      const tool = tools.find((t) => t.name === "pg_jsonb_agg")!;
      const result = (await tool.handler(
        { table: "users", groupBy: "role" },
        mockContext,
      )) as { grouped: boolean; result: unknown[] };

      expect(result.grouped).toBe(true);
      expect(result.result.length).toBe(2);
    });

    it("should add hint for empty results", async () => {
      mockAdapter.executeQuery.mockResolvedValue({
        rows: [{ result: [] }],
      });

      const tool = tools.find((t) => t.name === "pg_jsonb_agg")!;
      const result = (await tool.handler(
        { table: "users", where: "1=0" },
        mockContext,
      )) as { hint?: string; grouped: boolean };

      expect(result.grouped).toBe(false);
      expect(result.hint).toContain("No rows");
    });
  });

  // Structured Error Handling (parsePostgresError)
  describe("Structured Error Handling (parsePostgresError)", () => {
    it("should map 42P01 table-not-found for pg_jsonb_extract", async () => {
      const pgError = new Error(
        'relation "nonexistent" does not exist',
      ) as Error & { code: string };
      (pgError as unknown as Record<string, unknown>)["code"] = "42P01";
      mockAdapter.executeQuery.mockRejectedValue(pgError);

      const tool = tools.find((t) => t.name === "pg_jsonb_extract")!;

      const result = (await tool.handler(
        { table: "nonexistent", column: "data", path: "$.key" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/does not exist.*pg_list_tables/i);
    });

    it("should map 42P01 table-not-found for pg_jsonb_set", async () => {
      const pgError = new Error(
        'relation "nonexistent" does not exist',
      ) as Error & { code: string };
      (pgError as unknown as Record<string, unknown>)["code"] = "42P01";
      mockAdapter.executeQuery.mockRejectedValue(pgError);

      const tool = tools.find((t) => t.name === "pg_jsonb_set")!;

      const result = (await tool.handler(
        {
          table: "nonexistent",
          column: "data",
          path: "key",
          value: "test",
          where: "id = 1",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/does not exist.*pg_list_tables/i);
    });

    it("should map 42P01 table-not-found for pg_jsonb_path_query", async () => {
      const pgError = new Error(
        'relation "nonexistent" does not exist',
      ) as Error & { code: string };
      (pgError as unknown as Record<string, unknown>)["code"] = "42P01";
      mockAdapter.executeQuery.mockRejectedValue(pgError);

      const tool = tools.find((t) => t.name === "pg_jsonb_path_query")!;

      const result = (await tool.handler(
        { table: "nonexistent", column: "data", path: "$.key" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/does not exist.*pg_list_tables/i);
    });

    it("should provide JSONPath-specific error for invalid syntax", async () => {
      const pgError = new Error(
        "syntax error at end of jsonpath input",
      ) as Error & { code: string };
      (pgError as unknown as Record<string, unknown>)["code"] = "42601";
      mockAdapter.executeQuery.mockRejectedValue(pgError);

      const tool = tools.find((t) => t.name === "pg_jsonb_path_query")!;

      const result = (await tool.handler(
        { table: "users", column: "data", path: "$[invalid" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Invalid JSONPath syntax/i);
    });

    it("should route non-array errors through parsePostgresError for pg_jsonb_keys", async () => {
      const pgError = new Error(
        'relation "nonexistent" does not exist',
      ) as Error & { code: string };
      (pgError as unknown as Record<string, unknown>)["code"] = "42P01";
      mockAdapter.executeQuery.mockRejectedValue(pgError);

      const tool = tools.find((t) => t.name === "pg_jsonb_keys")!;

      const result = (await tool.handler(
        { table: "nonexistent", column: "data" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/does not exist.*pg_list_tables/i);
    });

    it("should route non-jsonb errors through parsePostgresError for pg_jsonb_normalize", async () => {
      const pgError = new Error(
        'relation "nonexistent" does not exist',
      ) as Error & { code: string };
      (pgError as unknown as Record<string, unknown>)["code"] = "42P01";
      mockAdapter.executeQuery.mockRejectedValue(pgError);

      const tool = tools.find((t) => t.name === "pg_jsonb_normalize")!;

      const result = (await tool.handler(
        { table: "nonexistent", column: "data" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/does not exist.*pg_list_tables/i);
    });

    it("should route table-not-found errors through parsePostgresError for pg_jsonb_strip_nulls", async () => {
      const pgError = new Error(
        'relation "nonexistent" does not exist',
      ) as Error & { code: string };
      (pgError as unknown as Record<string, unknown>)["code"] = "42P01";
      mockAdapter.executeQuery.mockRejectedValue(pgError);

      const tool = tools.find((t) => t.name === "pg_jsonb_strip_nulls")!;

      const result = (await tool.handler(
        { table: "nonexistent", column: "data", where: "id = 1" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/does not exist.*pg_list_tables/i);
    });

    it("should route table-not-found errors through parsePostgresError for pg_jsonb_insert preliminary checks", async () => {
      const pgError = new Error(
        'relation "nonexistent" does not exist',
      ) as Error & { code: string };
      (pgError as unknown as Record<string, unknown>)["code"] = "42P01";
      mockAdapter.executeQuery.mockRejectedValue(pgError);

      const tool = tools.find((t) => t.name === "pg_jsonb_insert")!;

      const result = (await tool.handler(
        {
          table: "nonexistent",
          column: "data",
          path: [0],
          value: "test",
          where: "id = 1",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/does not exist.*pg_list_tables/i);
    });

    it("should return structured error for pg_jsonb_strip_nulls when WHERE is omitted", async () => {
      const tool = tools.find((t) => t.name === "pg_jsonb_strip_nulls")!;

      const result = (await tool.handler(
        { table: "test_table", column: "data" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/WHERE clause/i);
    });

    it("should return structured error for pg_jsonb_extract with fake schema", async () => {
      // Mock: schema check returns empty (schema doesn't exist)
      mockAdapter.executeQuery.mockResolvedValue({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_jsonb_extract")!;

      const result = (await tool.handler(
        {
          table: "test_table",
          column: "data",
          path: "key",
          schema: "fake_schema",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Schema 'fake_schema' does not exist/);
    });

    it("should return structured error for pg_jsonb_normalize with fake schema", async () => {
      // Mock: schema check returns empty (schema doesn't exist)
      mockAdapter.executeQuery.mockResolvedValue({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_jsonb_normalize")!;

      const result = (await tool.handler(
        {
          table: "test_table",
          column: "data",
          schema: "fake_schema",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Schema 'fake_schema' does not exist/);
    });
  });

  describe("wrong-type numeric param coercion", () => {
    it("pg_jsonb_stats should silently default non-numeric sampleSize", async () => {
      const tool = tools.find((t) => t.name === "pg_jsonb_stats")!;
      // Mock the adapter calls that pg_jsonb_stats makes
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          {
            total_rows: 10,
            non_null_count: 10,
            avg_size_bytes: 50,
            max_size_bytes: 100,
          },
        ],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // keys
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ type: "object", count: 10 }],
      }); // type distribution

      const result = (await tool.handler(
        { table: "users", column: "metadata", sampleSize: "abc" },
        mockContext,
      )) as Record<string, unknown>;

      // coerceNumber converts "abc" → undefined → default sampleSize is used
      expect(result).toBeDefined();
      expect(result.success).not.toBe(false);
    });

    it("pg_jsonb_contains should silently default non-numeric limit", async () => {
      const tool = tools.find((t) => t.name === "pg_jsonb_contains")!;
      // Mock the adapter call that pg_jsonb_contains makes
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 1 }],
      });

      const result = (await tool.handler(
        {
          table: "users",
          column: "metadata",
          value: { key: "value" },
          limit: "abc",
        },
        mockContext,
      )) as Record<string, unknown>;

      // coerceNumber converts "abc" → undefined → default limit is used
      expect(result).toBeDefined();
      expect(result.success).not.toBe(false);
    });
  });
});
