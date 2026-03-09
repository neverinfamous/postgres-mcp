/**
 * postgres-mcp - JSONB Tools Unit Tests
 *
 * Tests for JSONB basic and advanced operations (19 tools total).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PostgresAdapter } from "../../PostgresAdapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../__tests__/mocks/index.js";
import { getJsonbTools } from "../jsonb/index.js";

describe("JSONB Tools", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let mockContext: ReturnType<typeof createMockRequestContext>;
  let tools: ReturnType<typeof getJsonbTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    mockContext = createMockRequestContext();
    tools = getJsonbTools(mockAdapter as unknown as PostgresAdapter);
  });

  const findTool = (name: string) => tools.find((t) => t.name === name);

  describe("pg_jsonb_extract", () => {
    it("should extract value using path expression", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ extracted_value: "John" }],
      });

      const tool = findTool("pg_jsonb_extract");
      const result = (await tool!.handler(
        {
          table: "users",
          column: "data",
          path: "$.name",
        },
        mockContext,
      )) as { rows: { value: unknown }[] };

      expect(result.rows).toEqual([{ value: "John" }]);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("#>"),
        expect.anything(),
      );
    });

    it("should handle array paths", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ extracted_value: "item1" }],
      });

      const tool = findTool("pg_jsonb_extract");
      await tool!.handler(
        {
          table: "orders",
          column: "items",
          path: "{0,name}",
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
    });
  });

  describe("pg_jsonb_set", () => {
    it("should set value at specified path", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rowsAffected: 1 });

      const tool = findTool("pg_jsonb_set");
      const result = (await tool!.handler(
        {
          table: "users",
          column: "data",
          path: ["name"],
          value: { first: "Jane" }, // Use object to test JSON stringification
          where: "id = 1",
        },
        mockContext,
      )) as { rowsAffected: number };

      expect(result.rowsAffected).toBe(1);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("jsonb_set"),
        expect.arrayContaining([["name"], '{"first":"Jane"}', true]),
      );
    });
  });

  describe("pg_jsonb_insert", () => {
    it("should insert value into JSONB", async () => {
      // First call: NULL column check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ null_count: 0 }],
      });
      // Second call: array type check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ type: "array" }],
      });
      // Third call: actual insert
      mockAdapter.executeQuery.mockResolvedValueOnce({ rowsAffected: 1 });

      const tool = findTool("pg_jsonb_insert");
      const result = (await tool!.handler(
        {
          table: "users",
          column: "data",
          path: ["tags", "0"],
          value: "new-tag",
          where: "id = 1",
        },
        mockContext,
      )) as { rowsAffected: number };

      expect(result.rowsAffected).toBe(1);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("jsonb_insert"),
        expect.anything(),
      );
    });
  });

  describe("pg_jsonb_delete", () => {
    it("should delete key from JSONB", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rowsAffected: 1 });

      const tool = findTool("pg_jsonb_delete");
      const result = (await tool!.handler(
        {
          table: "users",
          column: "data",
          path: "old_key",
          where: "id = 1",
        },
        mockContext,
      )) as { rowsAffected: number };

      expect(result.rowsAffected).toBe(1);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("- $1"),
        ["old_key"],
      );
    });

    it("should delete nested path from JSONB", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rowsAffected: 1 });

      const tool = findTool("pg_jsonb_delete");
      await tool!.handler(
        {
          table: "users",
          column: "data",
          path: ["nested", "key"],
          where: "id = 1",
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("#- $1"),
        [["nested", "key"]],
      );
    });
  });

  describe("pg_jsonb_contains", () => {
    it("should find rows with containment", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 1, data: { role: "admin" } }],
      });

      const tool = findTool("pg_jsonb_contains");
      const result = (await tool!.handler(
        {
          table: "users",
          column: "data",
          value: { role: "admin" },
        },
        mockContext,
      )) as { rows: unknown[]; count: number };

      expect(result.count).toBe(1);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("@>"),
        [JSON.stringify({ role: "admin" })],
      );
    });

    it("should use specific select columns", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const tool = findTool("pg_jsonb_contains");
      await tool!.handler(
        {
          table: "users",
          column: "data",
          value: { active: true },
          select: ["id", "name"],
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('"id", "name"'),
        expect.anything(),
      );
    });
  });

  describe("pg_jsonb_path_query", () => {
    it("should query using SQL/JSON path", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ result: "value1" }, { result: "value2" }],
      });

      const tool = findTool("pg_jsonb_path_query");
      const result = (await tool!.handler(
        {
          table: "documents",
          column: "content",
          path: "$.items[*].name",
        },
        mockContext,
      )) as { results: unknown[] };

      expect(result.results).toHaveLength(2);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("jsonb_path_query"),
        expect.anything(),
      );
    });

    it("should pass variables to path query", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_jsonb_path_query");
      await tool!.handler(
        {
          table: "documents",
          column: "content",
          path: "$.items[*] ? (@.price > $min)",
          vars: { min: 10 },
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([expect.stringContaining("min")]),
      );
    });
  });

  describe("pg_jsonb_agg", () => {
    it("should aggregate rows into JSONB array", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ result: [{ id: 1 }, { id: 2 }] }],
      });

      const tool = findTool("pg_jsonb_agg");
      const result = (await tool!.handler(
        {
          table: "users",
        },
        mockContext,
      )) as { result: unknown[] };

      expect(result.result).toHaveLength(2);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("jsonb_agg"),
      );
    });

    it("should select specific columns", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ result: [{}] }],
      });

      const tool = findTool("pg_jsonb_agg");
      await tool!.handler(
        {
          table: "users",
          select: ["id", "name"],
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("jsonb_build_object"),
      );
    });
  });

  describe("pg_jsonb_object", () => {
    it("should build JSONB object from key-value pairs", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ result: { name: "John", age: 30 } }],
      });

      const tool = findTool("pg_jsonb_object");
      // Use 'data' parameter to pass key-value pairs (MCP tool format)
      const result = (await tool!.handler(
        {
          data: { name: "John", age: 30 },
        },
        mockContext,
      )) as { object: Record<string, unknown> };

      expect(result).toEqual({ object: { name: "John", age: 30 } });
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("jsonb_build_object"),
        expect.anything(),
      );
    });
  });

  describe("pg_jsonb_array", () => {
    it("should build JSONB array from values", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ result: [1, 2, 3] }],
      });

      const tool = findTool("pg_jsonb_array");
      const result = (await tool!.handler(
        {
          values: [1, 2, 3],
        },
        mockContext,
      )) as { array: number[] };

      expect(result.array).toEqual([1, 2, 3]);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("jsonb_build_array"),
        expect.anything(),
      );
    });
  });

  describe("pg_jsonb_keys", () => {
    it("should get all keys from JSONB", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ key: "name" }, { key: "email" }, { key: "age" }],
      });

      const tool = findTool("pg_jsonb_keys");
      const result = (await tool!.handler(
        {
          table: "users",
          column: "data",
        },
        mockContext,
      )) as { keys: string[] };

      expect(result.keys).toEqual(["name", "email", "age"]);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("jsonb_object_keys"),
      );
    });
  });

  describe("pg_jsonb_strip_nulls", () => {
    it("should remove null values from JSONB", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rowsAffected: 5 });

      const tool = findTool("pg_jsonb_strip_nulls");
      const result = (await tool!.handler(
        {
          table: "users",
          column: "data",
          where: "id > 0",
        },
        mockContext,
      )) as { rowsAffected: number };

      expect(result.rowsAffected).toBe(5);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("jsonb_strip_nulls"),
      );
    });
  });

  describe("pg_jsonb_typeof", () => {
    it("should get type of JSONB values", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ type: "object" }, { type: "array" }],
      });

      const tool = findTool("pg_jsonb_typeof");
      const result = (await tool!.handler(
        {
          table: "data",
          column: "content",
        },
        mockContext,
      )) as { types: string[] };

      expect(result.types).toEqual(["object", "array"]);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("jsonb_typeof"),
        [],
      );
    });

    it("should check type at specific path", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ type: "string" }],
      });

      const tool = findTool("pg_jsonb_typeof");
      await tool!.handler(
        {
          table: "data",
          column: "content",
          path: ["nested", "field"],
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("#>"),
        [["nested", "field"]],
      );
    });
  });

  // Advanced JSONB Tools

  describe("pg_jsonb_validate_path", () => {
    it("should validate valid JSONPath", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ path: "$.items[*].name" }],
      });

      const tool = findTool("pg_jsonb_validate_path");
      const result = (await tool!.handler(
        {
          path: "$.items[*].name",
        },
        mockContext,
      )) as { valid: boolean };

      expect(result.valid).toBe(true);
    });

    it("should test path against value", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ result: "apple" }, { result: "banana" }],
      });

      const tool = findTool("pg_jsonb_validate_path");
      const result = (await tool!.handler(
        {
          path: "$.items[*]",
          testValue: { items: ["apple", "banana"] },
        },
        mockContext,
      )) as { valid: boolean; results: string[] };

      expect(result.valid).toBe(true);
      expect(result.results).toHaveLength(2);
    });

    it("should return invalid for bad path", async () => {
      mockAdapter.executeQuery.mockRejectedValueOnce(new Error("Invalid path"));

      const tool = findTool("pg_jsonb_validate_path");
      const result = (await tool!.handler(
        {
          path: "$.invalid[[[",
        },
        mockContext,
      )) as { valid: boolean; error: string };

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("pg_jsonb_merge", () => {
    it("should merge two JSONB documents with deep merge", async () => {
      // Deep merge now happens entirely in TypeScript, no PostgreSQL call needed
      const tool = findTool("pg_jsonb_merge");
      const result = (await tool!.handler(
        {
          base: { a: 1, b: 2 },
          overlay: { c: 3 },
        },
        mockContext,
      )) as { merged: Record<string, number>; deep: boolean };

      expect(result.merged).toEqual({ a: 1, b: 2, c: 3 });
      expect(result.deep).toBe(true);
      // Deep merge no longer calls PostgreSQL
    });

    it("should shallow merge with deep=false", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ result: { a: 1, b: 2, c: 3 } }],
      });

      const tool = findTool("pg_jsonb_merge");
      const result = (await tool!.handler(
        {
          base: { a: 1, b: 2 },
          overlay: { c: 3 },
          deep: false,
        },
        mockContext,
      )) as { merged: Record<string, number>; deep: boolean };

      expect(result.merged).toEqual({ a: 1, b: 2, c: 3 });
      expect(result.deep).toBe(false);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("||"),
        expect.anything(),
      );
    });
  });

  describe("pg_jsonb_normalize", () => {
    it("should normalize JSONB to key-value pairs", async () => {
      // First call: idColumn detection
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // No 'id' column
      // Second call: actual query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          { key: "name", value: "John" },
          { key: "age", value: "30" },
        ],
      });

      const tool = findTool("pg_jsonb_normalize");
      const result = (await tool!.handler(
        {
          table: "users",
          column: "data",
          mode: "keys",
        },
        mockContext,
      )) as { rows: unknown[]; count: number };

      expect(result.count).toBe(2);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("jsonb_each_text"),
      );
    });

    it("should expand arrays to rows", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ element: "a" }, { element: "b" }],
      });

      const tool = findTool("pg_jsonb_normalize");
      await tool!.handler(
        {
          table: "data",
          column: "items",
          mode: "array",
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("jsonb_array_elements"),
      );
    });
  });

  describe("pg_jsonb_diff", () => {
    it("should compare two JSONB documents", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          { key: "name", status: "modified", value1: "John", value2: "Jane" },
          {
            key: "email",
            status: "added",
            value1: null,
            value2: "jane@example.com",
          },
        ],
      });

      const tool = findTool("pg_jsonb_diff");
      const result = (await tool!.handler(
        {
          doc1: { name: "John" },
          doc2: { name: "Jane", email: "jane@example.com" },
        },
        mockContext,
      )) as { differences: unknown[]; hasDifferences: boolean };

      expect(result.hasDifferences).toBe(true);
      expect(result.differences).toHaveLength(2);
    });
  });

  describe("pg_jsonb_index_suggest", () => {
    it("should suggest indexes based on key distribution", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({
          rows: [
            { key: "status", frequency: 800, value_type: "string" },
            { key: "created_at", frequency: 1000, value_type: "string" },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_jsonb_index_suggest");
      const result = (await tool!.handler(
        {
          table: "events",
          column: "data",
        },
        mockContext,
      )) as { recommendations: string[] };

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations[0]).toContain("GIN");
    });
  });

  describe("pg_jsonb_security_scan", () => {
    it("should detect sensitive keys", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ count: 50 }] }) // Count query
        .mockResolvedValueOnce({
          rows: [{ key: "password", count: 5 }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }); // XSS scan

      const tool = findTool("pg_jsonb_security_scan");
      const result = (await tool!.handler(
        {
          table: "users",
          column: "data",
        },
        mockContext,
      )) as {
        issues: Array<{ type: string }>;
        riskLevel: string;
        scannedRows: number;
      };

      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].type).toBe("sensitive_key");
      expect(result.riskLevel).toBe("medium");
      expect(result.scannedRows).toBe(50);
    });

    it("should detect SQL injection patterns", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ count: 100 }] }) // Count query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ key: "comment", count: 2 }],
        })
        .mockResolvedValueOnce({ rows: [] }); // XSS scan

      const tool = findTool("pg_jsonb_security_scan");
      const result = (await tool!.handler(
        {
          table: "posts",
          column: "data",
        },
        mockContext,
      )) as { issues: Array<{ type: string }> };

      expect(
        result.issues.some((i) => i.type === "sql_injection_pattern"),
      ).toBe(true);
    });

    it("should report low risk when no issues", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ count: 100 }] }) // Count query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }); // XSS scan

      const tool = findTool("pg_jsonb_security_scan");
      const result = (await tool!.handler(
        {
          table: "clean_data",
          column: "data",
        },
        mockContext,
      )) as { riskLevel: string };

      expect(result.riskLevel).toBe("low");
    });
  });

  describe("pg_jsonb_stats", () => {
    it("should return JSONB statistics", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({
          rows: [
            {
              total_rows: 1000,
              non_null_count: 950,
              avg_size_bytes: 256,
              max_size_bytes: 2048,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { key: "status", frequency: 950 },
            { key: "type", frequency: 900 },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ type: "object", count: 950 }],
        });

      const tool = findTool("pg_jsonb_stats");
      const result = (await tool!.handler(
        {
          table: "events",
          column: "data",
        },
        mockContext,
      )) as {
        basics: { total_rows: number };
        topKeys: unknown[];
        typeDistribution: unknown[];
      };

      expect(result.basics.total_rows).toBe(1000);
      expect(result.topKeys).toHaveLength(2);
      expect(result.typeDistribution).toHaveLength(1);
    });
  });

  it("should export all 19 JSONB tools", () => {
    expect(tools).toHaveLength(19);
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
  });
});

// =============================================================================
// jsonb/analytics.ts & jsonb/transform.ts - uncovered branches
// =============================================================================

describe("jsonb analytics uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let mockContext: ReturnType<typeof createMockRequestContext>;
  let tools: ReturnType<typeof getJsonbTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    mockContext = createMockRequestContext();
    tools = getJsonbTools(mockAdapter as unknown as PostgresAdapter);
  });

  const findTool = (name: string) => tools.find((t) => t.name === name);

  // analytics.ts L53-54: missing table/column
  it("should return error for pg_jsonb_index_suggest without table/column", async () => {
    const tool = findTool("pg_jsonb_index_suggest")!;
    const result = (await tool.handler(
      { table: "users" }, // missing column
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("column");
  });

  // analytics.ts L64-74: non-public schema validation
  it("should validate non-public schema in pg_jsonb_index_suggest", async () => {
    const tool = findTool("pg_jsonb_index_suggest")!;
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // schema doesn't exist
    const result = (await tool.handler(
      { table: "users", column: "data", schema: "nonexistent" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("nonexistent");
  });

  // analytics.ts L138-148: hint branches (existing indexes, empty keys, low frequency)
  it("should show hint when existing indexes cover column", async () => {
    const tool = findTool("pg_jsonb_index_suggest")!;
    // First: keyResult returns keys but low frequency
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ key: "name", frequency: 10, value_type: "string" }],
    });
    // Second: existing indexes found
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ indexname: "idx_data", indexdef: "CREATE INDEX..." }],
    });

    const result = (await tool.handler(
      { table: "users", column: "data" },
      mockContext,
    )) as { hint: string; recommendations: string[] };
    expect(result.recommendations).toHaveLength(0);
    expect(result.hint).toContain("existing indexes");
  });

  it("should show hint when table is empty (no keys)", async () => {
    const tool = findTool("pg_jsonb_index_suggest")!;
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // no keys
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // no indexes
    const result = (await tool.handler(
      { table: "users", column: "data" },
      mockContext,
    )) as { hint: string };
    expect(result.hint).toContain("empty");
  });

  it("should show hint when no keys exceed 50% frequency", async () => {
    const tool = findTool("pg_jsonb_index_suggest")!;
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ key: "name", frequency: 100, value_type: "string" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // no indexes
    // 100 < 1000 * 0.5, so no per-key index suggestion, but GIN suggestion added
    // This hits the branch where recommendations > 0 (GIN index)
    const result = (await tool.handler(
      { table: "users", column: "data" },
      mockContext,
    )) as { recommendations: string[] };
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  // analytics.ts L152-162: jsonb_each error (array column)
  it("should return structured error for jsonb_each failure in index_suggest", async () => {
    const tool = findTool("pg_jsonb_index_suggest")!;
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("cannot call jsonb_each on an array"),
    );
    const result = (await tool.handler(
      { table: "users", column: "data" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("arrays");
  });

  // analytics.ts L163-168: general error catch
  it("should return formatted error for general failure in index_suggest", async () => {
    const tool = findTool("pg_jsonb_index_suggest")!;
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("permission denied"),
    );
    const result = (await tool.handler(
      { table: "users", column: "data" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // analytics.ts L195-196: missing table/column in security_scan
  it("should return error for pg_jsonb_security_scan without table/column", async () => {
    const tool = findTool("pg_jsonb_security_scan")!;
    const result = (await tool.handler(
      { column: "data" }, // missing table
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("table");
  });

  // analytics.ts L208-218: non-public schema in security_scan
  it("should validate schema in pg_jsonb_security_scan", async () => {
    const tool = findTool("pg_jsonb_security_scan")!;
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // schema doesn't exist
    const result = (await tool.handler(
      { table: "users", column: "data", schema: "bad" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("bad");
  });

  // analytics.ts L296-306: jsonb_each_text error in security_scan
  it("should handle jsonb_each_text error in security_scan", async () => {
    const tool = findTool("pg_jsonb_security_scan")!;
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("cannot call jsonb_each_text on an array"),
    );
    const result = (await tool.handler(
      { table: "users", column: "data" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("JSONB objects");
  });

  // analytics.ts L337-338: missing table/column in stats
  it("should return error for pg_jsonb_stats without table/column", async () => {
    const tool = findTool("pg_jsonb_stats")!;
    const result = (await tool.handler(
      {}, // missing both
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // analytics.ts L348-358: non-public schema in stats
  it("should validate schema in pg_jsonb_stats", async () => {
    const tool = findTool("pg_jsonb_stats")!;
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    const result = (await tool.handler(
      { table: "users", column: "data", schema: "missing" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("missing");
  });

  // analytics.ts L404-413: jsonb_object_keys error in stats (array column)
  it("should handle array column gracefully in pg_jsonb_stats", async () => {
    const tool = findTool("pg_jsonb_stats")!;
    // basic stats query
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
    // key query fails (array column)
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("cannot call jsonb_object_keys on an array"),
    );
    // type distribution query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ type: "array", count: 10 }],
    });

    const result = (await tool.handler(
      { table: "users", column: "tags" },
      mockContext,
    )) as { topKeys: unknown[]; hint: string };
    expect(result.topKeys).toHaveLength(0);
    expect(result.hint).toContain("array");
  });

  // analytics.ts L436-438: SQL NULL hint in stats
  it("should show SQL NULL hint in pg_jsonb_stats", async () => {
    const tool = findTool("pg_jsonb_stats")!;
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          total_rows: 10,
          non_null_count: 8,
          avg_size_bytes: 50,
          max_size_bytes: 100,
        },
      ],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // keys
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { type: null, count: 2 },
        { type: "object", count: 8 },
      ],
    });

    const result = (await tool.handler(
      { table: "users", column: "data" },
      mockContext,
    )) as { hint: string };
    expect(result.hint).toContain("SQL NULL");
  });

  // analytics.ts L451-457: general error in stats
  it("should return formatted error for general failure in stats", async () => {
    const tool = findTool("pg_jsonb_stats")!;
    mockAdapter.executeQuery.mockRejectedValueOnce(new Error("db error"));
    const result = (await tool.handler(
      { table: "users", column: "data" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("jsonb transform uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let mockContext: ReturnType<typeof createMockRequestContext>;
  let tools: ReturnType<typeof getJsonbTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    mockContext = createMockRequestContext();
    tools = getJsonbTools(mockAdapter as unknown as PostgresAdapter);
  });

  const findTool = (name: string) => tools.find((t) => t.name === name);

  // transform.ts L206-210: merge missing base/overlay
  it("should return error for pg_jsonb_merge with base as primitive", async () => {
    const tool = findTool("pg_jsonb_merge")!;
    const result = (await tool.handler(
      { base: "hello", overlay: { a: 1 } },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("object");
  });

  it("should return error for pg_jsonb_merge with overlay as array", async () => {
    const tool = findTool("pg_jsonb_merge")!;
    const result = (await tool.handler(
      { base: { a: 1 }, overlay: [1, 2, 3] },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("overlay must be an object");
  });

  // transform.ts L258-264: shallow merge (deep=false)
  it("should use shallow merge when deep=false", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ result: { a: 1, b: 2 } }],
    });
    const tool = findTool("pg_jsonb_merge")!;
    const result = (await tool.handler(
      { base: { a: 1 }, overlay: { b: 2 }, deep: false },
      mockContext,
    )) as { deep: boolean; merged: unknown };
    expect(result.deep).toBe(false);
    expect(mockAdapter.executeQuery).toHaveBeenCalled();
  });

  // transform.ts L299-300: normalize missing table/column
  it("should return error for pg_jsonb_normalize without table/column", async () => {
    const tool = findTool("pg_jsonb_normalize")!;
    const result = (await tool.handler(
      { table: "users" }, // missing column
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("column");
  });

  // transform.ts L308-314: invalid mode
  it("should return error for invalid normalize mode", async () => {
    const tool = findTool("pg_jsonb_normalize")!;
    const result = (await tool.handler(
      { table: "users", column: "data", mode: "invalid" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // transform.ts L318-328: non-public schema validation in normalize
  it("should validate schema in pg_jsonb_normalize", async () => {
    const tool = findTool("pg_jsonb_normalize")!;
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    const result = (await tool.handler(
      { table: "users", column: "data", schema: "bad" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("bad");
  });

  // transform.ts L358: array mode
  it("should use array mode in normalize", async () => {
    // idColumn check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ column_name: "id" }],
    });
    // actual query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ source_id: 1, element: { a: 1 } }],
    });
    const tool = findTool("pg_jsonb_normalize")!;
    const result = (await tool.handler(
      { table: "users", column: "tags", mode: "array" },
      mockContext,
    )) as { mode: string; rows: unknown[] };
    expect(result.mode).toBe("array");
  });

  // transform.ts L389-390: pairs mode
  it("should use pairs mode in normalize", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ column_name: "id" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ source_id: 1, key: "name", value: '"test"' }],
    });
    const tool = findTool("pg_jsonb_normalize")!;
    const result = (await tool.handler(
      { table: "users", column: "data", mode: "pairs" },
      mockContext,
    )) as { mode: string };
    expect(result.mode).toBe("pairs");
  });

  // transform.ts L397-405: flatten mode with empty results on array column
  it("should detect flatten on array column when results empty", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ column_name: "id" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // flatten returns empty
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ type: "array" }],
    }); // type check
    const tool = findTool("pg_jsonb_normalize")!;
    const result = (await tool.handler(
      { table: "users", column: "data", mode: "flatten" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("array");
  });

  // transform.ts L410-417: jsonb_each error in normalize
  it("should handle jsonb_each error in normalize", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ column_name: "id" }],
    });
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("cannot call jsonb_each on an array"),
    );
    const tool = findTool("pg_jsonb_normalize")!;
    const result = (await tool.handler(
      { table: "users", column: "data" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("object columns");
  });

  // transform.ts L419-427: cannot extract elements error
  it("should handle cannot extract elements error in normalize", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ column_name: "id" }],
    });
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("cannot extract elements from an object"),
    );
    const tool = findTool("pg_jsonb_normalize")!;
    const result = (await tool.handler(
      { table: "users", column: "data", mode: "array" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("array columns");
  });

  // transform.ts L481: diff inner catch (invalid doc format)
  it("should return error for pg_jsonb_diff with invalid format", async () => {
    const tool = findTool("pg_jsonb_diff")!;
    const result = (await tool.handler(
      { doc1: "not an object", doc2: { a: 1 } },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("objects");
  });

  // transform.ts L518-524: diff general error
  it("should return formatted error for pg_jsonb_diff DB failure", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(new Error("db error"));
    const tool = findTool("pg_jsonb_diff")!;
    const result = (await tool.handler(
      { doc1: { a: 1 }, doc2: { b: 2 } },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // transform.ts L337: idColumn parameter in normalize
  it("should use custom idColumn in normalize", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ user_id: 1, key: "name", value: "test" }],
    });
    const tool = findTool("pg_jsonb_normalize")!;
    const result = (await tool.handler(
      { table: "users", column: "data", idColumn: "user_id" },
      mockContext,
    )) as { rows: unknown[]; mode: string };
    expect(result.mode).toBe("keys");
  });

  // transform.ts L351-354: id column check falls back to ctid
  it("should fall back to ctid when id column check fails", async () => {
    // id column check throws
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("permission denied"),
    );
    // actual query still works with ctid
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ source_ctid: "(0,1)", key: "name", value: "test" }],
    });
    const tool = findTool("pg_jsonb_normalize")!;
    const result = (await tool.handler(
      { table: "users", column: "data" },
      mockContext,
    )) as { rows: unknown[] };
    expect(result.rows).toBeDefined();
  });
});

// ==========================================================================
// Coverage-targeted tests for jsonb/read.ts uncovered branches
// ==========================================================================

describe("jsonb/read.ts — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let mockContext: ReturnType<typeof createMockRequestContext>;
  let tools: ReturnType<typeof getJsonbTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    mockContext = createMockRequestContext();
    tools = getJsonbTools(mockAdapter as unknown as PostgresAdapter);
  });

  const findTool = (name: string) => tools.find((t) => t.name === name);

  it("pg_jsonb_extract should handle NaN limit gracefully", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ extracted_value: "test" }],
    });

    const tool = findTool("pg_jsonb_extract")!;
    const result = (await tool.handler(
      { table: "users", column: "data", path: "$.name", limit: "abc" },
      mockContext,
    )) as { rows: unknown[]; count: number };

    // NaN limit → treated as undefined (no LIMIT clause)
    expect(result.count).toBe(1);
  });

  it("pg_jsonb_extract should return error when table is missing", async () => {
    const tool = findTool("pg_jsonb_extract")!;
    const result = (await tool.handler(
      { column: "data", path: "$.name" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("table");
  });

  it("pg_jsonb_extract should return error when path is missing", async () => {
    const tool = findTool("pg_jsonb_extract")!;
    const result = (await tool.handler(
      { table: "users", column: "data" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("path is required");
  });

  it("pg_jsonb_extract should validate non-public schema", async () => {
    // Schema check → not found
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool("pg_jsonb_extract")!;
    const result = (await tool.handler(
      {
        table: "users",
        column: "data",
        path: "$.name",
        schema: "nonexistent",
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
  });

  it("pg_jsonb_extract with select should show all-null hint", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, extracted_value: null },
        { id: 2, extracted_value: null },
      ],
    });

    const tool = findTool("pg_jsonb_extract")!;
    const result = (await tool.handler(
      {
        table: "users",
        column: "data",
        path: "$.nonexistent",
        select: ["id"],
      },
      mockContext,
    )) as { rows: unknown[]; hint: string };

    expect(result.hint).toContain("All values are null");
  });

  it("pg_jsonb_extract without select should show all-null hint", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ extracted_value: null }],
    });

    const tool = findTool("pg_jsonb_extract")!;
    const result = (await tool.handler(
      { table: "users", column: "data", path: "$.nonexistent" },
      mockContext,
    )) as { hint: string };

    expect(result.hint).toContain("All values are null");
  });

  it("pg_jsonb_contains should detect truncated results", async () => {
    // Return limit+1 rows (default limit=100, so need 101 rows)
    const rows = Array.from({ length: 101 }, (_, i) => ({ id: i }));
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows });
    // Count query for totalCount
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 500 }],
    });

    const tool = findTool("pg_jsonb_contains")!;
    const result = (await tool.handler(
      { table: "events", column: "data", value: { type: "click" } },
      mockContext,
    )) as { count: number; truncated: boolean; totalCount: number };

    expect(result.truncated).toBe(true);
    expect(result.totalCount).toBe(500);
    expect(result.count).toBe(100); // limited to 100
  });

  it("pg_jsonb_contains should warn about empty object value", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1 }],
    });

    const tool = findTool("pg_jsonb_contains")!;
    const result = (await tool.handler(
      { table: "events", column: "data", value: {} },
      mockContext,
    )) as { warning: string };

    expect(result.warning).toContain("Empty {} matches ALL rows");
  });

  it("pg_jsonb_path_query should wrap jsonpath syntax error", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("syntax error in jsonpath near end of expression"),
    );

    const tool = findTool("pg_jsonb_path_query")!;
    const result = (await tool.handler(
      {
        table: "docs",
        column: "content",
        path: "$..items",
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid JSONPath syntax");
  });

  it("pg_jsonb_keys should wrap array column error", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("cannot call jsonb_object_keys on array"),
    );

    const tool = findTool("pg_jsonb_keys")!;
    const result = (await tool.handler(
      { table: "events", column: "tags" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("requires object columns");
  });

  it("pg_jsonb_agg should handle grouped results with jsonb operator", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { group_key: "active", items: [{ id: 1 }] },
        { group_key: "inactive", items: [{ id: 2 }] },
      ],
    });

    const tool = findTool("pg_jsonb_agg")!;
    const result = (await tool.handler(
      {
        table: "users",
        groupBy: "data->>'status'",
      },
      mockContext,
    )) as { grouped: boolean; count: number };

    expect(result.grouped).toBe(true);
    expect(result.count).toBe(2);
    // Verify the jsonb operator wasn't quoted
    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain("data->>'status'");
    expect(sql).not.toContain("\"data->>'status'\"");
  });

  it("pg_jsonb_agg should show hint for empty non-grouped result", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ result: null }],
    });

    const tool = findTool("pg_jsonb_agg")!;
    const result = (await tool.handler(
      { table: "empty_table" },
      mockContext,
    )) as { count: number; hint: string };

    expect(result.count).toBe(0);
    expect(result.hint).toContain("No rows matched");
  });

  it("pg_jsonb_path_query should detect truncated results", async () => {
    // Return 101 rows for default limit=100
    const rows = Array.from({ length: 101 }, (_, i) => ({
      result: `item_${String(i)}`,
    }));
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows });
    // Count query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 1000 }],
    });

    const tool = findTool("pg_jsonb_path_query")!;
    const result = (await tool.handler(
      { table: "docs", column: "data", path: "$.items[*]" },
      mockContext,
    )) as { truncated: boolean; totalCount: number; count: number };

    expect(result.truncated).toBe(true);
    expect(result.totalCount).toBe(1000);
    expect(result.count).toBe(100);
  });

  it("pg_jsonb_extract should handle select with expression columns", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          "data->>'status'": "active",
          extracted_value: "John",
        },
      ],
    });

    const tool = findTool("pg_jsonb_extract")!;
    const result = (await tool.handler(
      {
        table: "users",
        column: "data",
        path: "$.name",
        select: ["id", "data->>'status'"],
      },
      mockContext,
    )) as { rows: Record<string, unknown>[] };

    // id should be quoted, but data->>'status' should not be quoted (expression)
    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain('"id"');
    expect(sql).toContain("data->>'status'");
  });

  it("pg_jsonb_typeof should handle column_null detection", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ type: null, column_null: true }],
    });

    const tool = findTool("pg_jsonb_typeof")!;
    const result = (await tool.handler(
      { table: "users", column: "data" },
      mockContext,
    )) as { types: (string | null)[]; columnNull: boolean };

    expect(result.columnNull).toBe(true);
    expect(result.types).toEqual([null]);
  });
});

// ==========================================================================
// Coverage-targeted tests for jsonb/write.ts uncovered branches
// ==========================================================================

describe("jsonb/write.ts — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let mockContext: ReturnType<typeof createMockRequestContext>;
  let tools: ReturnType<typeof getJsonbTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    mockContext = createMockRequestContext();
    tools = getJsonbTools(mockAdapter as unknown as PostgresAdapter);
  });

  const findTool = (name: string) => tools.find((t) => t.name === name);

  // write.ts L54: missing table/column for pg_jsonb_set
  it("pg_jsonb_set should return error when table is missing", async () => {
    const tool = findTool("pg_jsonb_set")!;
    const result = (await tool.handler(
      { column: "data", path: "$.name", value: "test", where: "id = 1" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("table");
  });

  // write.ts L68: missing path for pg_jsonb_set
  it("pg_jsonb_set should return error when path is missing", async () => {
    const tool = findTool("pg_jsonb_set")!;
    const result = (await tool.handler(
      { table: "users", column: "data", value: "test", where: "id = 1" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("path is required");
  });

  // write.ts L171: missing table/column for pg_jsonb_insert
  it("pg_jsonb_insert should return error when table is missing", async () => {
    const tool = findTool("pg_jsonb_insert")!;
    const result = (await tool.handler(
      { column: "data", path: ["0"], value: "v", where: "id = 1" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("table");
  });

  // write.ts L184: missing path for pg_jsonb_insert
  it("pg_jsonb_insert should return error when path is missing", async () => {
    const tool = findTool("pg_jsonb_insert")!;
    // NULL check succeeds
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ null_count: 0 }],
    });
    const result = (await tool.handler(
      { table: "users", column: "data", value: "v", where: "id = 1" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("path is required");
  });

  // write.ts L299: missing table/column for pg_jsonb_delete
  it("pg_jsonb_delete should return error when table is missing", async () => {
    const tool = findTool("pg_jsonb_delete")!;
    const result = (await tool.handler(
      { column: "data", path: "key", where: "id = 1" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
  });

  // write.ts L321: missing path for pg_jsonb_delete
  it("pg_jsonb_delete should return error when path is missing", async () => {
    const tool = findTool("pg_jsonb_delete")!;
    const result = (await tool.handler(
      { table: "users", column: "data", where: "id = 1" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("path is required");
  });

  // write.ts L421: empty path for pg_jsonb_delete
  it("pg_jsonb_delete should return error for empty path", async () => {
    const tool = findTool("pg_jsonb_delete")!;
    const result = (await tool.handler(
      { table: "users", column: "data", path: "", where: "id = 1" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("non-empty path");
  });

  // write.ts L435: empty array path for pg_jsonb_delete
  it("pg_jsonb_delete should return error for empty array path", async () => {
    const tool = findTool("pg_jsonb_delete")!;
    const result = (await tool.handler(
      { table: "users", column: "data", path: [], where: "id = 1" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("non-empty path");
  });

  // write.ts L471: missing values for pg_jsonb_array
  it("pg_jsonb_array should return error when values is missing", async () => {
    const tool = findTool("pg_jsonb_array")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
    expect(result.error).toContain("values");
  });

  // write.ts L478: empty values returns empty array
  it("pg_jsonb_array should return empty array for empty values", async () => {
    const tool = findTool("pg_jsonb_array")!;
    const result = (await tool.handler({ values: [] }, mockContext)) as {
      array: unknown[];
    };
    expect(result.array).toEqual([]);
  });

  // write.ts L490: pg_jsonb_array error handling
  it("pg_jsonb_array should handle query error", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(new Error("boom"));
    const tool = findTool("pg_jsonb_array")!;
    const result = (await tool.handler({ values: [1, 2] }, mockContext)) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
  });

  // write.ts L521: missing table/column for pg_jsonb_strip_nulls
  it("pg_jsonb_strip_nulls should return error when table is missing", async () => {
    const tool = findTool("pg_jsonb_strip_nulls")!;
    const result = (await tool.handler(
      { column: "data", where: "id = 1" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("table");
  });

  // write.ts: pg_jsonb_delete with numeric path (L347-349)
  it("pg_jsonb_delete should handle numeric string path", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rowsAffected: 1 });
    const tool = findTool("pg_jsonb_delete")!;
    const result = (await tool.handler(
      { table: "users", column: "data", path: "0", where: "id = 1" },
      mockContext,
    )) as { rowsAffected: number };
    expect(result.rowsAffected).toBe(1);
    // Numeric string → array operator (#-)
    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain("#-");
  });

  // write.ts: pg_jsonb_delete with dot-notation path (L344-346)
  it("pg_jsonb_delete should split dot-notation path", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rowsAffected: 1 });
    const tool = findTool("pg_jsonb_delete")!;
    const result = (await tool.handler(
      { table: "users", column: "data", path: "nested.key", where: "id = 1" },
      mockContext,
    )) as { rowsAffected: number };
    expect(result.rowsAffected).toBe(1);
    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain("#-");
  });

  // write.ts: pg_jsonb_insert wraps 'cannot replace existing key' (L253)
  it("pg_jsonb_insert should wrap 'cannot replace existing key' error", async () => {
    // NULL check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ null_count: 0 }],
    });
    // Type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ type: "array" }],
    });
    // Insert fails
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("cannot replace existing key"),
    );
    const tool = findTool("pg_jsonb_insert")!;
    const result = (await tool.handler(
      {
        table: "users",
        column: "data",
        path: ["tags", "0"],
        value: "x",
        where: "id = 1",
      },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("arrays only");
  });

  // write.ts: pg_jsonb_insert wraps 'path element is not an integer' (L262)
  it("pg_jsonb_insert should wrap 'path element is not an integer' error", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ null_count: 0 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ type: "array" }],
    });
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("path element is not an integer"),
    );
    const tool = findTool("pg_jsonb_insert")!;
    const result = (await tool.handler(
      {
        table: "users",
        column: "data",
        path: ["tags", "0"],
        value: "x",
        where: "id = 1",
      },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("numeric index");
  });

  // write.ts: pg_jsonb_strip_nulls preview mode (L541-551)
  it("pg_jsonb_strip_nulls should support preview mode", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ before: { a: 1, b: null }, after: { a: 1 } }],
    });
    const tool = findTool("pg_jsonb_strip_nulls")!;
    const result = (await tool.handler(
      { table: "users", column: "data", where: "id = 1", preview: true },
      mockContext,
    )) as { preview: boolean; count: number; hint: string };
    expect(result.preview).toBe(true);
    expect(result.count).toBe(1);
    expect(result.hint).toContain("preview only");
  });

  // write.ts: pg_jsonb_set empty path (L93-100)
  it("pg_jsonb_set should replace entire column with empty path", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rowsAffected: 1 });
    const tool = findTool("pg_jsonb_set")!;
    const result = (await tool.handler(
      {
        table: "users",
        column: "data",
        path: [],
        value: { new: true },
        where: "id = 1",
      },
      mockContext,
    )) as { rowsAffected: number; hint: string };
    expect(result.rowsAffected).toBe(1);
    expect(result.hint).toContain("Replaced entire column");
  });

  // write.ts: pg_jsonb_set createMissing=false (L135-137)
  it("pg_jsonb_set with createMissing=false should include hint", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rowsAffected: 1 });
    const tool = findTool("pg_jsonb_set")!;
    const result = (await tool.handler(
      {
        table: "users",
        column: "data",
        path: ["name"],
        value: "test",
        where: "id = 1",
        createMissing: false,
      },
      mockContext,
    )) as { rowsAffected: number; hint: string };
    expect(result.hint).toContain("createMissing=false");
  });
});

// ==========================================================================
// Coverage-targeted tests for jsonb/transform.ts uncovered branches
// ==========================================================================

describe("jsonb/transform.ts — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let mockContext: ReturnType<typeof createMockRequestContext>;
  let tools: ReturnType<typeof getJsonbTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    mockContext = createMockRequestContext();
    tools = getJsonbTools(mockAdapter as unknown as PostgresAdapter);
  });

  const findTool = (name: string) => tools.find((t) => t.name === name);

  // transform.ts L78: validate_path with empty path
  it("pg_jsonb_validate_path should error for empty path", async () => {
    const tool = findTool("pg_jsonb_validate_path")!;
    const result = (await tool.handler({ path: "" }, mockContext)) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
    expect(result.error).toContain("path is required");
  });

  // transform.ts L125,129: deepMerge with arrays
  it("pg_jsonb_merge should concatenate arrays when mergeArrays=true", async () => {
    const tool = findTool("pg_jsonb_merge")!;
    const result = (await tool.handler(
      {
        base: { items: [1, 2], name: "test" },
        overlay: { items: [3, 4], name: "updated" },
        mergeArrays: true,
      },
      mockContext,
    )) as { merged: { items: number[]; name: string }; mergeArrays: boolean };
    expect(result.merged.items).toEqual([1, 2, 3, 4]);
    expect(result.merged.name).toBe("updated");
    expect(result.mergeArrays).toBe(true);
  });

  // transform.ts L136: overlay is array (non-object)
  it("pg_jsonb_merge should reject array overlay", async () => {
    const tool = findTool("pg_jsonb_merge")!;
    const result = (await tool.handler(
      { base: { a: 1 }, overlay: [1, 2, 3] },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("overlay must be an object");
  });

  // transform.ts L199-200: base is JSON string
  it("pg_jsonb_merge should parse base from JSON string", async () => {
    const tool = findTool("pg_jsonb_merge")!;
    const result = (await tool.handler(
      { base: '{"a": 1}', overlay: { b: 2 } },
      mockContext,
    )) as { merged: { a: number; b: number } };
    expect(result.merged).toEqual({ a: 1, b: 2 });
  });

  // transform.ts L207: base is undefined
  it("pg_jsonb_merge should reject undefined base", async () => {
    const tool = findTool("pg_jsonb_merge")!;
    const result = (await tool.handler({ overlay: { b: 2 } }, mockContext)) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
  });

  // transform.ts L210: overlay is undefined
  it("pg_jsonb_merge should reject undefined overlay", async () => {
    const tool = findTool("pg_jsonb_merge")!;
    const result = (await tool.handler({ base: { a: 1 } }, mockContext)) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
  });

  // transform.ts L300: missing table/column for normalize
  it("pg_jsonb_normalize should error when table is missing", async () => {
    const tool = findTool("pg_jsonb_normalize")!;
    const result = (await tool.handler({ column: "data" }, mockContext)) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
    expect(result.error).toContain("table");
  });

  // transform.ts L310: normalize with invalid mode
  it("pg_jsonb_normalize should error for invalid mode", async () => {
    const tool = findTool("pg_jsonb_normalize")!;
    const result = (await tool.handler(
      { table: "users", column: "data", mode: "invalid" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid option");
  });

  // transform.ts L155: deepMerge recursive on nested objects
  it("pg_jsonb_merge deep merge should recursively merge nested objects", async () => {
    const tool = findTool("pg_jsonb_merge")!;
    const result = (await tool.handler(
      {
        base: { a: { x: 1, y: 2 }, b: 10 },
        overlay: { a: { y: 3, z: 4 }, c: 20 },
      },
      mockContext,
    )) as {
      merged: { a: { x: number; y: number; z: number }; b: number; c: number };
    };
    expect(result.merged.a).toEqual({ x: 1, y: 3, z: 4 });
    expect(result.merged.b).toBe(10);
    expect(result.merged.c).toBe(20);
  });

  // transform.ts: normalize flatten mode with array column (L397-406)
  it("pg_jsonb_normalize flatten should detect array column", async () => {
    // id column check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Flatten returns empty results
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Type check returns 'array'
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ type: "array" }],
    });
    const tool = findTool("pg_jsonb_normalize")!;
    const result = (await tool.handler(
      { table: "users", column: "tags", mode: "flatten" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("array");
  });

  // transform.ts: normalize jsonb_each error (L411-418)
  it("pg_jsonb_normalize should wrap jsonb_each error", async () => {
    // id column check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Main query fails
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("cannot call jsonb_each on a non-object"),
    );
    const tool = findTool("pg_jsonb_normalize")!;
    const result = (await tool.handler(
      { table: "events", column: "tags", mode: "keys" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("object columns");
  });

  // transform.ts: normalize array extraction error (L420-427)
  it("pg_jsonb_normalize should wrap array extraction error", async () => {
    // id column check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Main query fails
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("cannot extract elements from an object"),
    );
    const tool = findTool("pg_jsonb_normalize")!;
    const result = (await tool.handler(
      { table: "events", column: "data", mode: "array" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("array columns");
  });
});
