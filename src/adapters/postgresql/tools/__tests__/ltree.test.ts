/**
 * postgres-mcp - Ltree Extension Tools Unit Tests
 *
 * Tests for hierarchical tree-structured label tools.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PostgresAdapter } from "../../postgres-adapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../__tests__/mocks/index.js";
import { getLtreeTools } from "../ltree/index.js";

describe("Ltree Tools", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let mockContext: ReturnType<typeof createMockRequestContext>;
  let tools: ReturnType<typeof getLtreeTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    mockContext = createMockRequestContext();
    tools = getLtreeTools(mockAdapter as unknown as PostgresAdapter);
  });

  const findTool = (name: string) => tools.find((t) => t.name === name);

  describe("pg_ltree_create_extension", () => {
    it("should create ltree extension", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_ltree_create_extension");
      const result = (await tool!.handler({}, mockContext)) as {
        success: boolean;
        message: string;
      };

      expect(result.success).toBe(true);
      expect(result.message).toContain("ltree");
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("CREATE EXTENSION IF NOT EXISTS ltree"),
      );
    });
  });

  describe("pg_ltree_query", () => {
    it("should query descendants by default", async () => {
      // Mock column type check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ udt_name: "ltree" }],
      });
      // Mock actual query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, path: "root.child1", depth: 2 },
          { id: 2, path: "root.child1.grandchild", depth: 3 },
        ],
      });

      const tool = findTool("pg_ltree_query");
      const result = (await tool!.handler(
        {
          table: "categories",
          column: "path",
          path: "root.child1",
        },
        mockContext,
      )) as { mode: string; results: unknown[]; count: number };

      expect(result.mode).toBe("descendants");
      expect(result.count).toBe(2);
      // descendants uses <@ operator (column is contained by path)
      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("<@"),
        ["root.child1"],
      );
    });

    it("should query ancestors when mode specified", async () => {
      // Mock column type check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ udt_name: "ltree" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 1, path: "root", depth: 1 }],
      });

      const tool = findTool("pg_ltree_query");
      await tool!.handler(
        {
          table: "categories",
          column: "path",
          path: "root.child1.grandchild",
          mode: "ancestors",
        },
        mockContext,
      );

      // ancestors uses @> operator (column contains path, i.e., column is ancestor of path)
      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("@>"),
        expect.anything(),
      );
    });

    it("should query exact matches", async () => {
      // Mock column type check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ udt_name: "ltree" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 1, path: "root.child1", depth: 2 }],
      });

      const tool = findTool("pg_ltree_query");
      await tool!.handler(
        {
          table: "categories",
          column: "path",
          path: "root.child1",
          mode: "exact",
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringMatching(/= \$1::ltree/),
        expect.anything(),
      );
    });

    it("should apply limit when specified", async () => {
      // Mock column type check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ udt_name: "ltree" }],
      });
      // Mock COUNT query for truncation
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ total: 15 }],
      });
      // Mock actual query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, path: "root.a" },
          { id: 2, path: "root.b" },
        ],
      });

      const tool = findTool("pg_ltree_query");
      const result = (await tool!.handler(
        {
          table: "categories",
          column: "path",
          path: "root",
          limit: 2,
        },
        mockContext,
      )) as { count: number; truncated: boolean; totalCount: number };

      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("LIMIT 2"),
        expect.anything(),
      );
      expect(result.count).toBe(2);
      expect(result.truncated).toBe(true);
      expect(result.totalCount).toBe(15);
    });
  });

  describe("pg_ltree_subpath", () => {
    it("should extract subpath with offset only", async () => {
      // Mock depth check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ depth: 3 }],
      });
      // Mock subpath query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ subpath: "child1.grandchild", original_depth: 3 }],
      });

      const tool = findTool("pg_ltree_subpath");
      const result = (await tool!.handler(
        {
          path: "root.child1.grandchild",
          offset: 1,
        },
        mockContext,
      )) as { subpath: string; originalDepth: number };

      expect(result.subpath).toBe("child1.grandchild");
      expect(result.originalDepth).toBe(3);
    });

    it("should extract subpath with offset and length", async () => {
      // Mock depth check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ depth: 3 }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ subpath: "child1", original_depth: 3 }],
      });

      const tool = findTool("pg_ltree_subpath");
      await tool!.handler(
        {
          path: "root.child1.grandchild",
          offset: 1,
          length: 1,
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("subpath($1::ltree, $2, $3)"),
        ["root.child1.grandchild", 1, 1],
      );
    });

    it("should accept len as alias for length", async () => {
      // Mock depth check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ depth: 3 }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ subpath: "child1", original_depth: 3 }],
      });

      const tool = findTool("pg_ltree_subpath");
      await tool!.handler(
        {
          path: "root.child1.grandchild",
          offset: 1,
          len: 1, // Using len alias instead of length
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("subpath($1::ltree, $2, $3)"),
        ["root.child1.grandchild", 1, 1],
      );
    });

    it("should default offset to 0 when not provided", async () => {
      // Mock depth check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ depth: 3 }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ subpath: "root.child1.grandchild", original_depth: 3 }],
      });

      const tool = findTool("pg_ltree_subpath");
      const result = (await tool!.handler(
        {
          path: "root.child1.grandchild",
          // No offset provided - should default to 0
        },
        mockContext,
      )) as { subpath: string; offset: number };

      expect(result.offset).toBe(0);
      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("subpath($1::ltree, $2)"),
        ["root.child1.grandchild", 0],
      );
    });
  });

  describe("pg_ltree_query type alias", () => {
    it("should accept type as alias for mode", async () => {
      // Mock column type check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ udt_name: "ltree" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 1, path: "root", depth: 1 }],
      });

      const tool = findTool("pg_ltree_query");
      await tool!.handler(
        {
          table: "categories",
          column: "path",
          path: "root.child1.grandchild",
          type: "ancestors", // Using type alias instead of mode
        },
        mockContext,
      );

      // Should use @> operator for ancestors
      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("@>"),
        expect.anything(),
      );
    });
  });

  describe("pg_ltree_lca", () => {
    it("should find lowest common ancestor", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ lca: "root.child1" }],
      });

      const tool = findTool("pg_ltree_lca");
      const result = (await tool!.handler(
        {
          paths: ["root.child1.a", "root.child1.b", "root.child1.c"],
        },
        mockContext,
      )) as { longestCommonAncestor: string; hasCommonAncestor: boolean };

      expect(result.longestCommonAncestor).toBe("root.child1");
      expect(result.hasCommonAncestor).toBe(true);
    });

    it("should handle no common ancestor", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ lca: "" }],
      });

      const tool = findTool("pg_ltree_lca");
      const result = (await tool!.handler(
        {
          paths: ["a.b.c", "x.y.z"],
        },
        mockContext,
      )) as { hasCommonAncestor: boolean };

      expect(result.hasCommonAncestor).toBe(false);
    });
  });

  describe("pg_ltree_match", () => {
    it("should match paths using lquery pattern", async () => {
      // Mock column type check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ udt_name: "ltree" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, path: "root.products.electronics", depth: 3 },
          { id: 2, path: "root.products.clothing", depth: 3 },
        ],
      });

      const tool = findTool("pg_ltree_match");
      const result = (await tool!.handler(
        {
          table: "categories",
          column: "path",
          pattern: "root.products.*",
        },
        mockContext,
      )) as { pattern: string; count: number };

      expect(result.count).toBe(2);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("~ $1::lquery"),
        ["root.products.*"],
      );
    });

    it("should accept query as alias for pattern", async () => {
      // Mock column type check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ udt_name: "ltree" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_ltree_match");
      await tool!.handler(
        {
          table: "categories",
          column: "path",
          query: "root.*", // Using alias
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("~ $1::lquery"),
        ["root.*"],
      );
    });

    it("should accept maxResults as alias for limit", async () => {
      // Mock column type check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ udt_name: "ltree" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_ltree_match");
      await tool!.handler(
        {
          table: "categories",
          column: "path",
          pattern: "root.*",
          maxResults: 5, // Using alias
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT 5"),
        expect.anything(),
      );
    });

    it("should accept lquery as alias for pattern", async () => {
      // Mock column type check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ udt_name: "ltree" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_ltree_match");
      await tool!.handler(
        {
          table: "categories",
          column: "path",
          lquery: "root.*.leaf", // Using lquery alias
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("~ $1::lquery"),
        ["root.*.leaf"],
      );
    });

    it("should return truncation indicators when limit is applied", async () => {
      // Mock column type check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ udt_name: "ltree" }],
      });
      // Mock COUNT query for truncation
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ total: 20 }],
      });
      // Mock actual query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 1, path: "root.a" }],
      });

      const tool = findTool("pg_ltree_match");
      const result = (await tool!.handler(
        {
          table: "categories",
          column: "path",
          pattern: "root.*",
          limit: 1,
        },
        mockContext,
      )) as { count: number; truncated: boolean; totalCount: number };

      expect(result.count).toBe(1);
      expect(result.truncated).toBe(true);
      expect(result.totalCount).toBe(20);
    });
  });

  describe("pg_ltree_list_columns", () => {
    it("should list all ltree columns", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          {
            table_schema: "public",
            table_name: "categories",
            column_name: "path",
          },
        ],
      });

      const tool = findTool("pg_ltree_list_columns");
      const result = (await tool!.handler({}, mockContext)) as {
        columns: unknown[];
        count: number;
      };

      expect(result.count).toBe(1);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("udt_name = 'ltree'"),
        [],
      );
    });

    it("should filter by schema", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_ltree_list_columns");
      await tool!.handler({ schema: "custom" }, mockContext);

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("table_schema = $1"),
        ["custom"],
      );
    });
  });

  describe("pg_ltree_convert_column", () => {
    it("should convert text column to ltree", async () => {
      // Mock extension check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ installed: true }],
      });
      // Mock column check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ data_type: "text", udt_name: "text" }],
      });
      // Mock dependent views check
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Mock ALTER TABLE
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_ltree_convert_column");
      const result = (await tool!.handler(
        {
          table: "categories",
          column: "path",
        },
        mockContext,
      )) as { success: boolean; previousType: string };

      expect(result.success).toBe(true);
      expect(result.previousType).toBe("text");
      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("ALTER TABLE"),
      );
    });

    it("should report column not found", async () => {
      // Mock extension check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ installed: true }],
      });
      // Mock column check - no rows = not found
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_ltree_convert_column");
      const result = (await tool!.handler(
        {
          table: "categories",
          column: "nonexistent",
        },
        mockContext,
      )) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should report already ltree column", async () => {
      // Mock extension check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ installed: true }],
      });
      // Mock column check - already ltree
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ data_type: "USER-DEFINED", udt_name: "ltree" }],
      });

      const tool = findTool("pg_ltree_convert_column");
      const result = (await tool!.handler(
        {
          table: "categories",
          column: "path",
        },
        mockContext,
      )) as { success: boolean; wasAlreadyLtree: boolean };

      expect(result.success).toBe(true);
      expect(result.wasAlreadyLtree).toBe(true);
    });

    it("should reject non-text columns with helpful error", async () => {
      // Mock extension check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ installed: true }],
      });
      // Mock column check - integer column
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ data_type: "integer", udt_name: "int4" }],
      });

      const tool = findTool("pg_ltree_convert_column");
      const result = (await tool!.handler(
        {
          table: "categories",
          column: "id",
        },
        mockContext,
      )) as {
        success: boolean;
        error?: string;
        currentType?: string;
        allowedTypes?: string[];
        suggestion?: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("Only text-based columns");
      expect(result.currentType).toBe("integer");
      expect(result.allowedTypes).toContain("text");
      expect(result.suggestion).toBeDefined();
    });
  });

  describe("pg_ltree_create_index", () => {
    it("should create GiST index on ltree column", async () => {
      // Mock column type check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ udt_name: "ltree" }],
      });
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ exists: false }] })
        .mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_ltree_create_index");
      const result = (await tool!.handler(
        {
          table: "categories",
          column: "path",
        },
        mockContext,
      )) as { success: boolean; indexType: string };

      expect(result.success).toBe(true);
      expect(result.indexType).toBe("gist");
      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("USING GIST"),
      );
    });

    it("should report existing index", async () => {
      // Mock column type check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ udt_name: "ltree" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ exists: true }],
      });

      const tool = findTool("pg_ltree_create_index");
      const result = (await tool!.handler(
        {
          table: "categories",
          column: "path",
        },
        mockContext,
      )) as { success: boolean; alreadyExists: boolean };

      expect(result.success).toBe(true);
      expect(result.alreadyExists).toBe(true);
    });

    it("should use custom index name when provided", async () => {
      // Mock column type check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ udt_name: "ltree" }],
      });
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ exists: false }] })
        .mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_ltree_create_index");
      await tool!.handler(
        {
          table: "categories",
          column: "path",
          indexName: "custom_path_idx",
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringContaining('"custom_path_idx"'),
      );
    });
  });

  // Structured Error Handling (parsePostgresError)
  // ─────────────────────────────────────────────────────
  describe("Structured Error Handling (parsePostgresError)", () => {
    it("pg_ltree_query: should return structured error for nonexistent table", async () => {
      // Mock column check returns no rows (table doesn't exist either)
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Mock table existence check - also no rows
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_ltree_query");
      const result = (await tool!.handler(
        {
          table: "nonexistent_xyz",
          column: "path",
          path: "electronics",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
      expect(result.error).not.toContain("Column");
    });

    it("pg_ltree_convert_column: should return structured error for nonexistent table", async () => {
      // Mock extension check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ installed: true }],
      });
      // Mock column check returns no rows
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Mock table existence check - also no rows
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_ltree_convert_column");
      const result = (await tool!.handler(
        {
          table: "nonexistent_xyz",
          column: "path",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
      expect(result.error).not.toContain("Column");
    });

    it("pg_ltree_match: should return structured error for nonexistent table", async () => {
      // Mock column check - no rows
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Mock table check - no rows
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_ltree_match");
      const result = (await tool!.handler(
        {
          table: "nonexistent_xyz",
          column: "path",
          pattern: "*",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
      expect(result.error).not.toContain("Column");
    });

    it("pg_ltree_match: should return structured error for non-ltree column", async () => {
      // Mock column check - returns varchar type
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ udt_name: "varchar" }],
      });

      const tool = findTool("pg_ltree_match");
      const result = (await tool!.handler(
        {
          table: "categories",
          column: "name",
          pattern: "*",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("not an ltree type");
      expect(result.error).toContain("varchar");
    });

    it("pg_ltree_create_index: should return structured error for nonexistent table", async () => {
      // Mock column check - no rows
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Mock table check - no rows
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_ltree_create_index");
      const result = (await tool!.handler(
        {
          table: "nonexistent_xyz",
          column: "path",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
      expect(result.error).not.toContain("Column");
    });

    it("pg_ltree_create_index: should return structured error for non-ltree column", async () => {
      // Mock column check - returns varchar type
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ udt_name: "varchar" }],
      });

      const tool = findTool("pg_ltree_create_index");
      const result = (await tool!.handler(
        {
          table: "categories",
          column: "name",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("not an ltree type");
      expect(result.error).toContain("varchar");
    });
  });

  describe("ZodError and Edge Case Coverage", () => {
    it("pg_ltree_lca: should catch ZodError for invalid input", async () => {
      const tool = findTool("pg_ltree_lca");
      const result = (await tool!.handler({}, mockContext)) as any;
      expect(result.success).toBe(false);
      expect(result.error).toContain("expected array");
    });

    it("pg_ltree_match: should handle column not found but table exists", async () => {
      // column check fails
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // table check succeeds
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });

      const tool = findTool("pg_ltree_match");
      const result = (await tool!.handler(
        { table: "categories", column: "bad_col", pattern: "*" },
        mockContext,
      )) as any;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Column "bad_col" not found');
    });

    it("pg_ltree_match: should catch ZodError for invalid input", async () => {
      const tool = findTool("pg_ltree_match");
      const result = (await tool!.handler({}, mockContext)) as any;
      expect(result.success).toBe(false);
      expect(result.error).toContain("expected string");
    });

    it("pg_ltree_list_columns: should catch ZodError for invalid input", async () => {
      const tool = findTool("pg_ltree_list_columns");
      const result = (await tool!.handler({ schema: 123 }, mockContext)) as any;
      expect(result.success).toBe(false);
      expect(result.error).toContain("expected string");
    });

    it("pg_ltree_convert_column: should error if ltree extension is missing", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ installed: false }],
      });
      const tool = findTool("pg_ltree_convert_column");
      const result = (await tool!.handler(
        { table: "categories", column: "path" },
        mockContext,
      )) as any;

      expect(result.success).toBe(false);
      expect(result.error).toContain("ltree extension is not installed");
    });

    it("pg_ltree_convert_column: should catch ZodError for invalid input", async () => {
      const tool = findTool("pg_ltree_convert_column");
      const result = (await tool!.handler({}, mockContext)) as any;
      expect(result.success).toBe(false);
      expect(result.error).toContain("expected string");
    });

    it("pg_ltree_convert_column: should error if dependent views prevent conversion", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ installed: true }],
      }); // extension
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ data_type: "text", udt_name: "text" }],
      }); // column
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ dependent_view: "v_categories", view_schema: "public" }],
      }); // dependent views

      const tool = findTool("pg_ltree_convert_column");
      const result = (await tool!.handler(
        { table: "categories", column: "path" },
        mockContext,
      )) as any;

      expect(result.success).toBe(false);
      expect(result.error).toContain("dependent views");
      expect(result.dependentViews).toContain("public.v_categories");
    });

    it("pg_ltree_create_index: should handle column not found but table exists", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // column check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      }); // table check

      const tool = findTool("pg_ltree_create_index");
      const result = (await tool!.handler(
        { table: "categories", column: "bad_col" },
        mockContext,
      )) as any;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Column "bad_col" not found');
    });
  });

  // ==========================================================================
  // Coverage-targeted tests for remaining uncovered lines
  // ==========================================================================

  describe("pg_ltree_query — lquery pattern with limit (count path)", () => {
    it("should detect lquery pattern and use count query with limit", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ udt_name: "ltree" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ total: 50 }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, path: "root.a", depth: 2 },
          { id: 2, path: "root.b", depth: 2 },
        ],
      });

      const tool = findTool("pg_ltree_query");
      const result = (await tool!.handler(
        {
          table: "categories",
          column: "path",
          path: "root.*",
          limit: 2,
        },
        mockContext,
      )) as {
        mode: string;
        isPattern: boolean;
        truncated: boolean;
        totalCount: number;
      };

      expect(result.mode).toBe("pattern");
      expect(result.isPattern).toBe(true);
      expect(result.truncated).toBe(true);
      expect(result.totalCount).toBe(50);
      expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("~ $1::lquery"),
        ["root.*"],
      );
    });

    it("should use ancestors operator in count query with limit", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ udt_name: "ltree" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ total: 5 }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 1, path: "root", depth: 1 }],
      });

      const tool = findTool("pg_ltree_query");
      await tool!.handler(
        {
          table: "categories",
          column: "path",
          path: "root.child1",
          mode: "ancestors",
          limit: 10,
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("@>"),
        ["root.child1"],
      );
    });

    it("should use exact operator in count query with limit", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ udt_name: "ltree" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ total: 1 }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 1, path: "root.child1", depth: 2 }],
      });

      const tool = findTool("pg_ltree_query");
      await tool!.handler(
        {
          table: "categories",
          column: "path",
          path: "root.child1",
          mode: "exact",
          limit: 10,
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("= "),
        ["root.child1"],
      );
    });
  });

  describe("pg_ltree_subpath — offset validation error", () => {
    it("should return error for out-of-bounds offset", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ depth: 3 }],
      });

      const tool = findTool("pg_ltree_subpath");
      const result = (await tool!.handler(
        {
          path: "root.child1.grandchild",
          offset: 5,
        },
        mockContext,
      )) as { success: boolean; error: string; pathDepth: number };

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid offset");
      expect(result.pathDepth).toBe(3);
    });
  });

  describe("pg_ltree_query — adapter error", () => {
    it("should format adapter errors", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ udt_name: "ltree" }],
      });
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error("connection refused"),
      );

      const tool = findTool("pg_ltree_query");
      const result = (await tool!.handler(
        { table: "t", column: "c", path: "x" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("connection refused");
    });
  });

  describe("pg_ltree_subpath — adapter error", () => {
    it("should format adapter errors", async () => {
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error("connection refused"),
      );

      const tool = findTool("pg_ltree_subpath");
      const result = (await tool!.handler(
        { path: "a.b.c", offset: 0 },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("connection refused");
    });
  });

  describe("pg_ltree_lca — adapter error", () => {
    it("should format adapter errors", async () => {
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error("connection refused"),
      );

      const tool = findTool("pg_ltree_lca");
      const result = (await tool!.handler(
        { paths: ["a.b", "c.d"] },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("connection refused");
    });
  });

  describe("pg_ltree_match — adapter error", () => {
    it("should format adapter errors", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ udt_name: "ltree" }],
      });
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error("connection refused"),
      );

      const tool = findTool("pg_ltree_match");
      const result = (await tool!.handler(
        { table: "t", column: "c", pattern: "a.*" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("connection refused");
    });
  });

  describe("pg_ltree_list_columns — adapter error", () => {
    it("should format adapter errors", async () => {
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error("connection refused"),
      );

      const tool = findTool("pg_ltree_list_columns");
      const result = (await tool!.handler({}, mockContext)) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("connection refused");
    });
  });

  describe("pg_ltree_convert_column — adapter error + ltree not installed", () => {
    it("should return error when ltree extension is not installed", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ installed: false }],
      });

      const tool = findTool("pg_ltree_convert_column");
      const result = (await tool!.handler(
        { table: "t", column: "c" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("ltree extension is not installed");
    });

    it("should return error when dependent views exist", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ installed: true }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ data_type: "text", udt_name: "text" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ dependent_view: "my_view", view_schema: "public" }],
      });

      const tool = findTool("pg_ltree_convert_column");
      const result = (await tool!.handler(
        { table: "t", column: "c" },
        mockContext,
      )) as {
        success: boolean;
        error: string;
        dependentViews: string[];
        hint: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("dependent views");
      expect(result.dependentViews).toContain("public.my_view");
      expect(result.hint).toContain("Drop the listed views");
    });

    it("should format adapter errors during ALTER", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ installed: true }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ data_type: "text", udt_name: "text" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error("permission denied"),
      );

      const tool = findTool("pg_ltree_convert_column");
      const result = (await tool!.handler(
        { table: "t", column: "c" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("permission denied");
    });
  });

  describe("pg_ltree_create_index — semantic duplicate detection + adapter error", () => {
    it("should detect semantic duplicate GiST index", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ udt_name: "ltree" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ exists: false }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ indexname: "existing_gist_idx" }],
      });

      const tool = findTool("pg_ltree_create_index");
      const result = (await tool!.handler(
        { table: "t", column: "c" },
        mockContext,
      )) as {
        success: boolean;
        alreadyExists: boolean;
        indexName: string;
      };

      expect(result.success).toBe(true);
      expect(result.alreadyExists).toBe(true);
      expect(result.indexName).toBe("existing_gist_idx");
    });

    it("should format adapter errors during CREATE INDEX", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ udt_name: "ltree" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ exists: false }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error("permission denied"),
      );

      const tool = findTool("pg_ltree_create_index");
      const result = (await tool!.handler(
        { table: "t", column: "c" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("permission denied");
    });
  });

  it("should export all 8 ltree tools", () => {
    expect(tools).toHaveLength(8);
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("pg_ltree_create_extension");
    expect(toolNames).toContain("pg_ltree_query");
    expect(toolNames).toContain("pg_ltree_subpath");
    expect(toolNames).toContain("pg_ltree_lca");
    expect(toolNames).toContain("pg_ltree_match");
    expect(toolNames).toContain("pg_ltree_list_columns");
    expect(toolNames).toContain("pg_ltree_convert_column");
    expect(toolNames).toContain("pg_ltree_create_index");
  });
});
