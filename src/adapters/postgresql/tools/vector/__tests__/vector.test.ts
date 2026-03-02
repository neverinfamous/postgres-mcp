/**
 * postgres-mcp - Vector (pgvector) Tools Unit Tests
 *
 * Tests for pgvector operations covering tool definitions,
 * schema validation, and handler execution.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getVectorTools } from "../index.js";
import type { PostgresAdapter } from "../../../PostgresAdapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../../__tests__/mocks/index.js";

describe("getVectorTools", () => {
  let adapter: PostgresAdapter;
  let tools: ReturnType<typeof getVectorTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockPostgresAdapter() as unknown as PostgresAdapter;
    tools = getVectorTools(adapter);
  });

  it("should return 15 vector tools", () => {
    expect(tools).toHaveLength(16);
  });

  it("should have all expected tool names", () => {
    const toolNames = tools.map((t) => t.name);
    // Basic tools
    expect(toolNames).toContain("pg_vector_create_extension");
    expect(toolNames).toContain("pg_vector_add_column");
    expect(toolNames).toContain("pg_vector_insert");
    expect(toolNames).toContain("pg_vector_search");
    expect(toolNames).toContain("pg_vector_create_index");
    expect(toolNames).toContain("pg_vector_distance");
    expect(toolNames).toContain("pg_vector_normalize");
    expect(toolNames).toContain("pg_vector_aggregate");
    // Advanced tools
    expect(toolNames).toContain("pg_vector_cluster");
    expect(toolNames).toContain("pg_vector_index_optimize");
    expect(toolNames).toContain("pg_hybrid_search");
    expect(toolNames).toContain("pg_vector_performance");
    expect(toolNames).toContain("pg_vector_dimension_reduce");
    expect(toolNames).toContain("pg_vector_embed");
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

  it("should have group set to vector for all tools", () => {
    for (const tool of tools) {
      expect(tool.group).toBe("vector");
    }
  });
});

describe("Tool Annotations", () => {
  let tools: ReturnType<typeof getVectorTools>;

  beforeEach(() => {
    tools = getVectorTools(
      createMockPostgresAdapter() as unknown as PostgresAdapter,
    );
  });

  it("pg_vector_search should be read-only", () => {
    const tool = tools.find((t) => t.name === "pg_vector_search")!;
    expect(tool.annotations?.readOnlyHint).toBe(true);
  });

  it("pg_vector_distance should be read-only", () => {
    const tool = tools.find((t) => t.name === "pg_vector_distance")!;
    expect(tool.annotations?.readOnlyHint).toBe(true);
  });

  it("pg_vector_insert should be destructive", () => {
    const tool = tools.find((t) => t.name === "pg_vector_insert")!;
    expect(tool.annotations?.readOnlyHint).toBe(false);
  });

  it("pg_vector_add_column should be destructive", () => {
    const tool = tools.find((t) => t.name === "pg_vector_add_column")!;
    expect(tool.annotations?.readOnlyHint).toBe(false);
  });
});

describe("Handler Execution", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getVectorTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getVectorTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  describe("pg_vector_create_extension", () => {
    it("should check/create vector extension", async () => {
      mockAdapter.executeQuery.mockResolvedValue({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_vector_create_extension")!;
      const result = (await tool.handler({}, mockContext)) as Record<
        string,
        unknown
      >;

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("pg_vector_search", () => {
    it("should execute vector similarity search", async () => {
      // Existence check, type check, then search
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] }) // type check
        .mockResolvedValueOnce({
          rows: [
            { id: 1, distance: 0.1 },
            { id: 2, distance: 0.2 },
          ],
        });

      const tool = tools.find((t) => t.name === "pg_vector_search")!;
      const result = (await tool.handler(
        {
          table: "embeddings",
          column: "embedding",
          vector: [0.1, 0.2, 0.3],
          limit: 10,
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("pg_vector_normalize", () => {
    it("should normalize a vector", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_normalize")!;
      const result = (await tool.handler(
        {
          vector: [3, 4],
        },
        mockContext,
      )) as { normalized: number[] };

      // [3, 4] normalized = [0.6, 0.8]
      expect(result.normalized).toBeDefined();
      expect(result.normalized).toHaveLength(2);
    });
  });

  describe("pg_vector_embed", () => {
    it("should generate embedding placeholder", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_embed")!;
      const result = (await tool.handler(
        {
          text: "Hello world",
          dimensions: 384,
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(result).toBeDefined();
    });
  });

  describe("pg_vector_performance", () => {
    it("should analyze vector index performance", async () => {
      // Existence check, indexes query, stats query
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockResolvedValueOnce({ rows: [{ indexname: "idx_vectors" }] })
        .mockResolvedValueOnce({ rows: [{ size: "10 MB" }] });

      const tool = tools.find((t) => t.name === "pg_vector_performance")!;
      const result = (await tool.handler(
        {
          table: "embeddings",
          column: "embedding",
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });
});

describe("Error Handling", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getVectorTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getVectorTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should propagate database errors", async () => {
    const dbError = new Error('extension "vector" is not available');
    mockAdapter.executeQuery.mockRejectedValue(dbError);

    const tool = tools.find((t) => t.name === "pg_vector_create_extension")!;

    await expect(tool.handler({}, mockContext)).rejects.toThrow(
      'extension "vector" is not available',
    );
  });
});

describe("Bug Fixes", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getVectorTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getVectorTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  describe("pg_vector_create_index ifNotExists option", () => {
    it("should check for existing index and return alreadyExists when ifNotExists is true and index exists", async () => {
      // First: existence check (column found), Second: pg_indexes check (index exists)
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }); // pg_indexes check - index exists

      const tool = tools.find((t) => t.name === "pg_vector_create_index")!;
      const result = (await tool.handler(
        {
          table: "embeddings",
          column: "vector",
          type: "hnsw",
          ifNotExists: true,
        },
        mockContext,
      )) as Record<string, unknown>;

      // Should return alreadyExists flag
      expect(result.success).toBe(true);
      expect(result.alreadyExists).toBe(true);
    });

    it("should create index when ifNotExists is true and index does not exist", async () => {
      // First: existence check (column found), Second: pg_indexes check (not found), Third: CREATE INDEX
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockResolvedValueOnce({ rows: [] }) // pg_indexes check - not found
        .mockResolvedValueOnce({ rows: [] }); // CREATE INDEX

      const tool = tools.find((t) => t.name === "pg_vector_create_index")!;
      const result = (await tool.handler(
        {
          table: "embeddings",
          column: "vector",
          type: "hnsw",
          ifNotExists: true,
        },
        mockContext,
      )) as Record<string, unknown>;

      // Should have made three queries: existence check + pg_indexes check + create
      expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(3);
      // Third call (index 2) should be CREATE INDEX without IF NOT EXISTS
      const createCall = mockAdapter.executeQuery.mock.calls[2][0] as string;
      expect(createCall).toContain("CREATE INDEX");
      expect(createCall).not.toContain("IF NOT EXISTS");
      expect(result.success).toBe(true);
      expect(result.alreadyExists).toBeUndefined();
    });

    it("should not check for existing index when ifNotExists is false or omitted", async () => {
      // First: existence check (column found), Second: CREATE INDEX
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockResolvedValueOnce({ rows: [] }); // CREATE INDEX

      const tool = tools.find((t) => t.name === "pg_vector_create_index")!;
      await tool.handler(
        {
          table: "embeddings",
          column: "vector",
          type: "ivfflat",
        },
        mockContext,
      );

      // Should have two calls: existence check + CREATE INDEX (no pg_indexes check)
      expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(2);
      // Second call (index 1) is the CREATE INDEX
      const sqlCall = mockAdapter.executeQuery.mock.calls[1][0] as string;
      expect(sqlCall).toContain("CREATE INDEX");
      expect(sqlCall).not.toContain("pg_indexes");
    });

    it("should return ifNotExists status in response", async () => {
      // First: existence check (column found), Second: pg_indexes check (not found), Third: CREATE INDEX
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockResolvedValueOnce({ rows: [] }) // pg_indexes check - not found
        .mockResolvedValueOnce({ rows: [] }); // CREATE INDEX

      const tool = tools.find((t) => t.name === "pg_vector_create_index")!;
      const result = (await tool.handler(
        {
          table: "embeddings",
          column: "vector",
          type: "hnsw",
          ifNotExists: true,
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(result.ifNotExists).toBe(true);
    });
  });

  describe("pg_vector_aggregate returns only average_vector", () => {
    it("should return average_vector without duplicate average field", async () => {
      // First: existence check, Second: column type check, Third: aggregate query
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check (checkTableAndColumn - column found)
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] }) // type check
        .mockResolvedValueOnce({
          rows: [{ average_vector: "[0.1, 0.2, 0.3]", count: "5" }],
        });

      const tool = tools.find((t) => t.name === "pg_vector_aggregate")!;
      const result = (await tool.handler(
        {
          table: "embeddings",
          column: "vector",
          summarizeVector: false, // Get raw array for testing
        },
        mockContext,
      )) as Record<string, unknown>;

      // Now returns parsed array instead of string
      expect(result.average_vector).toEqual([0.1, 0.2, 0.3]);
      expect(result.average).toBeUndefined(); // Removed redundant field
    });
  });

  describe("pg_hybrid_search select parameter", () => {
    it("should respect select parameter to limit columns", async () => {
      // Mock: existence check, vectorColumn type check, textColumn type check, then main query (select specified, no column list needed)
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check (checkTableAndColumn)
        .mockResolvedValueOnce({
          rows: [{ data_type: "USER-DEFINED", udt_name: "vector" }],
        }) // vectorColumn type check
        .mockResolvedValueOnce({
          rows: [{ data_type: "text", udt_name: "text" }],
        }) // textColumn type check
        .mockResolvedValueOnce({
          rows: [{ id: 1, title: "test", combined_score: 0.9 }],
        }); // main query

      const tool = tools.find((t) => t.name === "pg_hybrid_search")!;
      await tool.handler(
        {
          table: "documents",
          vectorColumn: "embedding",
          textColumn: "content",
          vector: [0.1, 0.2, 0.3],
          textQuery: "search term",
          select: ["id", "title"],
        },
        mockContext,
      );

      // Main query is the fourth call (after existence check, vectorColumn type check, and textColumn type check)
      const mainQueryCall = mockAdapter.executeQuery.mock.calls[3][0] as string;
      expect(mainQueryCall).toContain('t."id"');
      expect(mainQueryCall).toContain('t."title"');
      expect(mainQueryCall).not.toContain("t.*");
    });

    it("should exclude vector columns when select is not provided", async () => {
      // Mock: existence check, vectorColumn type check, textColumn type check, column list query, then main query
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check (checkTableAndColumn)
        .mockResolvedValueOnce({
          rows: [{ data_type: "USER-DEFINED", udt_name: "vector" }],
        }) // vectorColumn type check
        .mockResolvedValueOnce({
          rows: [{ data_type: "text", udt_name: "text" }],
        }) // textColumn type check
        .mockResolvedValueOnce({
          rows: [{ column_name: "id" }, { column_name: "content" }],
        }) // column list
        .mockResolvedValueOnce({ rows: [] }); // main query

      const tool = tools.find((t) => t.name === "pg_hybrid_search")!;
      await tool.handler(
        {
          table: "documents",
          vectorColumn: "embedding",
          textColumn: "content",
          vector: [0.1, 0.2, 0.3],
          textQuery: "search term",
        },
        mockContext,
      );

      // Main query is the fifth call (after existence check, vectorColumn type, textColumn type, column list)
      const mainQueryCall = mockAdapter.executeQuery.mock.calls[4][0] as string;
      expect(mainQueryCall).toContain('t."id"');
      expect(mainQueryCall).toContain('t."content"');
      // Should NOT use t.* since we now dynamically get non-vector columns
      expect(mainQueryCall).not.toContain("t.*");
    });
  });

  describe("pg_vector_dimension_reduce schema and alias", () => {
    it("should expose targetDimensions in inputSchema", () => {
      const tool = tools.find((t) => t.name === "pg_vector_dimension_reduce")!;
      // Verify schema exists and is properly defined
      expect(tool.inputSchema).toBeDefined();
    });

    it("should accept dimensions alias for targetDimensions", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_dimension_reduce")!;
      const result = (await tool.handler(
        {
          vector: [0.1, 0.2, 0.3, 0.4, 0.5],
          dimensions: 2, // alias for targetDimensions
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(result.targetDimensions).toBe(2);
      expect(result.reduced).toBeDefined();
    });

    it("should work with targetDimensions directly", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_dimension_reduce")!;
      const result = (await tool.handler(
        {
          vector: [0.1, 0.2, 0.3, 0.4, 0.5],
          targetDimensions: 3,
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(result.targetDimensions).toBe(3);
      expect((result.reduced as number[]).length).toBe(3);
    });

    it("should throw error when neither targetDimensions nor dimensions provided", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_dimension_reduce")!;

      await expect(
        tool.handler(
          {
            vector: [0.1, 0.2, 0.3],
          },
          mockContext,
        ),
      ).rejects.toThrow();
    });
  });

  describe("pg_vector_insert update mode", () => {
    it("should generate UPDATE when updateExisting is true with conflictValue", async () => {
      // First: existence check (column found), then UPDATE
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockResolvedValueOnce({ rowsAffected: 1 }); // UPDATE

      const tool = tools.find((t) => t.name === "pg_vector_insert")!;
      const result = (await tool.handler(
        {
          table: "embeddings",
          column: "vector",
          vector: [0.1, 0.2, 0.3],
          updateExisting: true,
          conflictColumn: "id",
          conflictValue: 42,
        },
        mockContext,
      )) as Record<string, unknown>;

      // Second call (index 1) is the UPDATE
      const sql = mockAdapter.executeQuery.mock.calls[1][0] as string;
      expect(sql).toContain("UPDATE");
      expect(sql).toContain("SET");
      expect(sql).toContain("WHERE");
      expect(result.success).toBe(true);
      expect(result.mode).toBe("update");
    });

    it("should return error when updateExisting is true without conflictValue", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_insert")!;
      const result = (await tool.handler(
        {
          table: "embeddings",
          column: "vector",
          vector: [0.1, 0.2, 0.3],
          updateExisting: true,
          conflictColumn: "id",
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toContain("conflictValue");
    });

    it("should return error when update finds no matching row", async () => {
      // First: existence check (column found), then UPDATE returns 0 rows
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockResolvedValueOnce({ rowsAffected: 0 }); // UPDATE

      const tool = tools.find((t) => t.name === "pg_vector_insert")!;
      const result = (await tool.handler(
        {
          table: "embeddings",
          column: "vector",
          vector: [0.1, 0.2, 0.3],
          updateExisting: true,
          conflictColumn: "id",
          conflictValue: 999,
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toContain("No row found");
    });

    it("should parse dimension mismatch error from insert", async () => {
      // First: existence check (column found), then INSERT rejects
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockRejectedValueOnce(new Error("expected 384 dimensions, not 3"));

      const tool = tools.find((t) => t.name === "pg_vector_insert")!;
      const result = (await tool.handler(
        {
          table: "embeddings",
          column: "vector",
          vector: [0.1, 0.2, 0.3],
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toContain("dimension mismatch");
      expect(result.expectedDimensions).toBe(384);
      expect(result.providedDimensions).toBe(3);
    });

    it("should handle NOT NULL constraint violation on insert", async () => {
      // First: existence check (column found), then INSERT rejects
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockRejectedValueOnce(
          new Error('null value in column "id" violates not-null constraint'),
        );

      const tool = tools.find((t) => t.name === "pg_vector_insert")!;
      const result = (await tool.handler(
        {
          table: "embeddings",
          column: "vector",
          vector: [0.1, 0.2, 0.3],
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toContain("NOT NULL");
      expect(result.suggestion).toBeDefined();
    });
  });

  describe("pg_vector_search validation", () => {
    it("should return error when column does not exist", async () => {
      // Two-step check: column query returns empty, table check returns found
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [] }) // column check (checkTableAndColumn)
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }); // table check (checkTableAndColumn)

      const tool = tools.find((t) => t.name === "pg_vector_search")!;
      const result = (await tool.handler(
        {
          table: "embeddings",
          column: "nonexistent",
          vector: [0.1, 0.2, 0.3],
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    it("should return error when column is not vector type", async () => {
      // Existence check passes (column found), but type is not vector
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check (checkTableAndColumn - column found)
        .mockResolvedValueOnce({
          rows: [{ udt_name: "text" }],
        }); // type check - column is text

      const tool = tools.find((t) => t.name === "pg_vector_search")!;
      const result = (await tool.handler(
        {
          table: "embeddings",
          column: "name",
          vector: [0.1, 0.2, 0.3],
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toContain("not a vector column");
    });

    it("should parse dimension mismatch error from search", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check (checkTableAndColumn - column found)
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] }) // type check
        .mockRejectedValueOnce(
          new Error("different vector dimensions 384 and 3"),
        );

      const tool = tools.find((t) => t.name === "pg_vector_search")!;
      const result = (await tool.handler(
        {
          table: "embeddings",
          column: "vector",
          vector: [0.1, 0.2, 0.3],
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toContain("dimension mismatch");
      expect(result.expectedDimensions).toBe(384);
      expect(result.providedDimensions).toBe(3);
    });
  });

  describe("pg_vector_cluster clusters alias", () => {
    it("should accept clusters as alias for k", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] }) // type check
        .mockResolvedValueOnce({
          rows: [
            { vec: "[0.1,0.2,0.3]" },
            { vec: "[0.4,0.5,0.6]" },
            { vec: "[0.7,0.8,0.9]" },
          ],
        });

      const tool = tools.find((t) => t.name === "pg_vector_cluster")!;
      const result = (await tool.handler(
        {
          table: "embeddings",
          column: "vector",
          clusters: 3, // alias for k
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(result.k).toBe(3);
    });

    it("should throw when neither k nor clusters provided", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_cluster")!;

      await expect(
        tool.handler(
          {
            table: "embeddings",
            column: "vector",
          },
          mockContext,
        ),
      ).rejects.toThrow();
    });
  });

  describe("pg_vector_aggregate groupBy", () => {
    it("should generate GROUP BY SQL when groupBy is specified", async () => {
      // First: existence check, Second: column type check, Third: groupBy aggregate query
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check (checkTableAndColumn - column found)
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] }) // type check
        .mockResolvedValueOnce({
          rows: [
            { group_key: "category_a", average_vector: "[0.1,0.2]", count: 5 },
            { group_key: "category_b", average_vector: "[0.3,0.4]", count: 3 },
          ],
        });

      const tool = tools.find((t) => t.name === "pg_vector_aggregate")!;
      const result = (await tool.handler(
        {
          table: "embeddings",
          column: "vector",
          groupBy: "category",
        },
        mockContext,
      )) as Record<string, unknown>;

      // Third call (index 2) should contain GROUP BY
      const sql = mockAdapter.executeQuery.mock.calls[2][0] as string;
      expect(sql).toContain("GROUP BY");
      expect(result.groups).toBeDefined();
      expect((result.groups as unknown[]).length).toBe(2);
      expect(result.count).toBe(2);
    });

    it("should return overall average when groupBy is not specified", async () => {
      // First: existence check, Second: column type check, Third: aggregate query
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check (checkTableAndColumn - column found)
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] }) // type check
        .mockResolvedValueOnce({
          rows: [{ average_vector: "[0.2,0.3]", count: "8" }],
        });

      const tool = tools.find((t) => t.name === "pg_vector_aggregate")!;
      const result = (await tool.handler(
        {
          table: "embeddings",
          column: "vector",
          summarizeVector: false, // Get raw array for testing
        },
        mockContext,
      )) as Record<string, unknown>;

      // Now returns parsed array instead of string
      expect(result.average_vector).toEqual([0.2, 0.3]);
      expect(result.average).toBeUndefined(); // No longer duplicated
      expect(result.groups).toBeUndefined();
    });
  });

  describe("pg_vector_search filter alias", () => {
    it("should accept filter as alias for where", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check (checkTableAndColumn - column found)
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] }) // type check
        .mockResolvedValueOnce({ rows: [{ distance: 0.1 }] }); // search

      const tool = tools.find((t) => t.name === "pg_vector_search")!;
      await tool.handler(
        {
          table: "embeddings",
          column: "vector",
          vector: [0.1, 0.2, 0.3],
          filter: "category = 1", // alias for where
        },
        mockContext,
      );

      // Check the third call (search query) contains the filter
      const sql = mockAdapter.executeQuery.mock.calls[2][0] as string;
      expect(sql).toContain("category = 1");
    });
  });
});

describe("Object Existence Checks (P154)", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getVectorTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getVectorTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  // Helper: mock checkTableAndColumn for table-not-found
  const mockTableNotFound = () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [] }) // column check returns empty
      .mockResolvedValueOnce({ rows: [] }); // table check returns empty
  };

  // Helper: mock checkTableAndColumn for column-not-found (table exists)
  const mockColumnNotFound = () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [] }) // column check returns empty
      .mockResolvedValueOnce({ rows: [{ "1": 1 }] }); // table check returns found
  };

  describe("pg_vector_search", () => {
    it("should return table-not-found error", async () => {
      mockTableNotFound();
      const tool = tools.find((t) => t.name === "pg_vector_search")!;
      const result = (await tool.handler(
        { table: "nonexistent", column: "vec", vector: [0.1] },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("Table 'nonexistent' does not exist");
    });

    it("should return column-not-found error when table exists", async () => {
      mockColumnNotFound();
      const tool = tools.find((t) => t.name === "pg_vector_search")!;
      const result = (await tool.handler(
        { table: "embeddings", column: "bad_col", vector: [0.1] },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("Column 'bad_col' does not exist");
    });
  });

  describe("pg_vector_aggregate", () => {
    it("should return table-not-found error", async () => {
      mockTableNotFound();
      const tool = tools.find((t) => t.name === "pg_vector_aggregate")!;
      const result = (await tool.handler(
        { table: "nonexistent", column: "vec" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("Table 'nonexistent' does not exist");
    });

    it("should return column-not-found error when table exists", async () => {
      mockColumnNotFound();
      const tool = tools.find((t) => t.name === "pg_vector_aggregate")!;
      const result = (await tool.handler(
        { table: "embeddings", column: "bad_col" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("Column 'bad_col' does not exist");
    });
  });

  describe("pg_vector_insert", () => {
    it("should return table-not-found error", async () => {
      mockTableNotFound();
      const tool = tools.find((t) => t.name === "pg_vector_insert")!;
      const result = (await tool.handler(
        { table: "nonexistent", column: "vec", vector: [0.1] },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("Table 'nonexistent' does not exist");
    });

    it("should return column-not-found error when table exists", async () => {
      mockColumnNotFound();
      const tool = tools.find((t) => t.name === "pg_vector_insert")!;
      const result = (await tool.handler(
        { table: "embeddings", column: "bad_col", vector: [0.1] },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("Column 'bad_col' does not exist");
    });

    it("should catch relation-not-found from INSERT execution", async () => {
      // Existence check passes, but INSERT fails (e.g., race condition)
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check passes
        .mockRejectedValueOnce(
          new Error('relation "embeddings" does not exist'),
        );
      const tool = tools.find((t) => t.name === "pg_vector_insert")!;
      const result = (await tool.handler(
        { table: "embeddings", column: "vec", vector: [0.1] },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
    });
  });

  describe("pg_vector_add_column", () => {
    it("should return table-not-found error", async () => {
      // Table check returns empty
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      const tool = tools.find((t) => t.name === "pg_vector_add_column")!;
      const result = (await tool.handler(
        { table: "nonexistent", column: "vec", dimensions: 384 },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("Table 'nonexistent' does not exist");
    });

    it("should return structured error for duplicate column without ifNotExists", async () => {
      // Table exists, then ALTER TABLE fails with duplicate column
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // table check passes
        .mockRejectedValueOnce(
          new Error(
            'column "embedding" of relation "documents" already exists',
          ),
        );

      const tool = tools.find((t) => t.name === "pg_vector_add_column")!;
      const result = (await tool.handler(
        { table: "documents", column: "embedding", dimensions: 384 },
        mockContext,
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toContain("already exists");
      expect(result.suggestion).toContain("ifNotExists");
    });
  });

  describe("pg_vector_batch_insert", () => {
    it("should expose all parameters in inputSchema (Split Schema)", () => {
      const tool = tools.find((t) => t.name === "pg_vector_batch_insert")!;
      const schema = tool.inputSchema as { shape?: Record<string, unknown> };
      // Base schema should have shape property (not stripped by .transform())
      expect(schema.shape).toBeDefined();
      expect(schema.shape!.table).toBeDefined();
      expect(schema.shape!.column).toBeDefined();
      expect(schema.shape!.vectors).toBeDefined();
      expect(schema.shape!.schema).toBeDefined();
    });

    it("should return structured error for dimension mismatch", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockRejectedValueOnce(new Error("expected 384 dimensions, not 3")); // INSERT fails

      const tool = tools.find((t) => t.name === "pg_vector_batch_insert")!;
      const result = (await tool.handler(
        {
          table: "embeddings",
          column: "vector",
          vectors: [{ vector: [0.1, 0.2, 0.3] }],
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toBe("Vector dimension mismatch");
      expect(result.expectedDimensions).toBe(384);
      expect(result.providedDimensions).toBe(3);
      expect(result.suggestion).toContain("384");
    });
  });

  describe("pg_vector_cluster", () => {
    it("should return table-not-found error", async () => {
      mockTableNotFound();
      const tool = tools.find((t) => t.name === "pg_vector_cluster")!;
      const result = (await tool.handler(
        { table: "nonexistent", column: "vec", k: 3 },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("Table 'nonexistent' does not exist");
    });

    it("should return column-not-found error when table exists", async () => {
      mockColumnNotFound();
      const tool = tools.find((t) => t.name === "pg_vector_cluster")!;
      const result = (await tool.handler(
        { table: "embeddings", column: "bad_col", k: 3 },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("Column 'bad_col' does not exist");
    });

    it("should return non-vector-column error", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // checkTableAndColumn: column found
        .mockResolvedValueOnce({ rows: [{ udt_name: "text" }] }); // type check: not vector
      const tool = tools.find((t) => t.name === "pg_vector_cluster")!;
      const result = (await tool.handler(
        { table: "embeddings", column: "content", k: 3 },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("not a vector column");
    });
  });

  describe("pg_vector_index_optimize", () => {
    it("should return table-not-found error", async () => {
      // Existence check runs first now (before stats query)
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [] }) // column check (checkTableAndColumn) - not found
        .mockResolvedValueOnce({ rows: [] }); // table check (checkTableAndColumn) - not found
      const tool = tools.find((t) => t.name === "pg_vector_index_optimize")!;
      const result = (await tool.handler(
        { table: "nonexistent", column: "vec" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("Table 'nonexistent' does not exist");
    });

    it("should return column-not-found error when table exists", async () => {
      // Existence check runs first now (before stats query)
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [] }) // column check (checkTableAndColumn) - not found
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }); // table check - table exists
      const tool = tools.find((t) => t.name === "pg_vector_index_optimize")!;
      const result = (await tool.handler(
        { table: "embeddings", column: "bad_col" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("Column 'bad_col' does not exist");
    });
  });

  describe("pg_vector_performance", () => {
    it("should return table-not-found error", async () => {
      mockTableNotFound();
      const tool = tools.find((t) => t.name === "pg_vector_performance")!;
      const result = (await tool.handler(
        { table: "nonexistent", column: "vec" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("Table 'nonexistent' does not exist");
    });

    it("should return column-not-found error when table exists", async () => {
      mockColumnNotFound();
      const tool = tools.find((t) => t.name === "pg_vector_performance")!;
      const result = (await tool.handler(
        { table: "embeddings", column: "bad_col" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("Column 'bad_col' does not exist");
    });
  });

  describe("pg_vector_create_index", () => {
    it("should return table-not-found error", async () => {
      mockTableNotFound();
      const tool = tools.find((t) => t.name === "pg_vector_create_index")!;
      const result = (await tool.handler(
        {
          table: "nonexistent",
          column: "vec",
          type: "hnsw",
        },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("Table 'nonexistent' does not exist");
    });

    it("should return column-not-found error when table exists", async () => {
      mockColumnNotFound();
      const tool = tools.find((t) => t.name === "pg_vector_create_index")!;
      const result = (await tool.handler(
        {
          table: "embeddings",
          column: "bad_col",
          type: "hnsw",
        },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("Column 'bad_col' does not exist");
    });
  });

  describe("pg_vector_dimension_reduce", () => {
    it("should return table-not-found error in table mode", async () => {
      mockTableNotFound();
      const tool = tools.find((t) => t.name === "pg_vector_dimension_reduce")!;
      const result = (await tool.handler(
        {
          table: "nonexistent",
          column: "vec",
          targetDimensions: 3,
        },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("Table 'nonexistent' does not exist");
    });

    it("should return column-not-found error in table mode when table exists", async () => {
      mockColumnNotFound();
      const tool = tools.find((t) => t.name === "pg_vector_dimension_reduce")!;
      const result = (await tool.handler(
        {
          table: "embeddings",
          column: "bad_col",
          targetDimensions: 3,
        },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("Column 'bad_col' does not exist");
    });
  });

  describe("pg_hybrid_search", () => {
    it("should return table-not-found error", async () => {
      mockTableNotFound();
      const tool = tools.find((t) => t.name === "pg_hybrid_search")!;
      const result = (await tool.handler(
        {
          table: "nonexistent",
          vectorColumn: "vec",
          textColumn: "content",
          vector: [0.1],
          textQuery: "test",
        },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("Table 'nonexistent' does not exist");
    });

    it("should return column-not-found error when table exists", async () => {
      mockColumnNotFound();
      const tool = tools.find((t) => t.name === "pg_hybrid_search")!;
      const result = (await tool.handler(
        {
          table: "embeddings",
          vectorColumn: "bad_col",
          textColumn: "content",
          vector: [0.1],
          textQuery: "test",
        },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("Column 'bad_col' does not exist");
    });
  });

  describe("pg_vector_validate non-vector column", () => {
    it("should return structured error for non-vector column", async () => {
      // Column exists but is not a vector type
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // column exists
        .mockResolvedValueOnce({ rows: [{ udt_name: "text" }] }); // type check: text, not vector

      const tool = tools.find((t) => t.name === "pg_vector_validate")!;
      const result = (await tool.handler(
        { table: "embeddings", column: "name" },
        mockContext,
      )) as Record<string, unknown>;

      expect(result.valid).toBe(false);
      expect(result.error).toContain("not a vector column");
      expect(result.error).toContain("text");
      expect(result.suggestion).toContain("pg_vector_add_column");
    });
  });

  describe("pg_vector_create_index non-vector column", () => {
    it("should return structured error for non-vector column", async () => {
      // Existence checks pass, but CREATE INDEX fails with operator class error
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // checkTableAndColumn: column found
        .mockRejectedValueOnce(
          new Error(
            'operator class "vector_l2_ops" does not accept data type text',
          ),
        );

      const tool = tools.find((t) => t.name === "pg_vector_create_index")!;
      const result = (await tool.handler(
        { table: "embeddings", column: "name", type: "hnsw" },
        mockContext,
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toContain("not a vector column");
      expect(result.error).toContain("text");
      expect(result.suggestion).toContain("pg_vector_add_column");
    });
  });
});

describe("Coverage: Missing Param Validation", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getVectorTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getVectorTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  describe("pg_vector_search", () => {
    it("should return error when table is empty string", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_search")!;
      const result = (await tool.handler(
        { table: "", column: "vec", vector: [0.1] },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("table");
    });

    it("should return error when column is empty string", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_search")!;
      const result = (await tool.handler(
        { table: "t", column: "", vector: [0.1] },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("column");
    });

    it("should use inner_product metric operator", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] })
        .mockResolvedValueOnce({ rows: [{ distance: 0.5 }] });
      const tool = tools.find((t) => t.name === "pg_vector_search")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", vector: [0.1], metric: "inner_product" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.metric).toBe("inner_product");
      const sql = mockAdapter.executeQuery.mock.calls[2][0] as string;
      expect(sql).toContain("<#>");
    });

    it("should apply excludeNull filter", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] })
        .mockResolvedValueOnce({ rows: [] });
      const tool = tools.find((t) => t.name === "pg_vector_search")!;
      await tool.handler(
        { table: "t", column: "vec", vector: [0.1], excludeNull: true },
        mockContext,
      );
      const sql = mockAdapter.executeQuery.mock.calls[2][0] as string;
      expect(sql).toContain("IS NOT NULL");
    });

    it("should add hint when no select columns specified", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] })
        .mockResolvedValueOnce({ rows: [{ distance: 0.1 }] });
      const tool = tools.find((t) => t.name === "pg_vector_search")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", vector: [0.1] },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.hint).toBeDefined();
    });

    it("should note NULL distance values", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] })
        .mockResolvedValueOnce({ rows: [{ distance: null }] });
      const tool = tools.find((t) => t.name === "pg_vector_search")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", vector: [0.1] },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.note).toContain("NULL");
    });
  });

  describe("pg_vector_insert", () => {
    it("should return error when table is empty", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_insert")!;
      const result = (await tool.handler(
        { table: "", column: "vec", vector: [0.1] },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("table");
    });

    it("should return error when column is empty", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_insert")!;
      const result = (await tool.handler(
        { table: "t", column: "", vector: [0.1] },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("column");
    });

    it("should return error when vector is empty array", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_insert")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", vector: [] },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("vector");
    });

    it("should handle schema.table format in insert", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [] });
      const tool = tools.find((t) => t.name === "pg_vector_insert")!;
      const result = (await tool.handler(
        { table: "myschema.mytable", column: "vec", vector: [0.1] },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(true);
    });

    it("should handle additionalColumns in insert mode", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [], rowsAffected: 1 });
      const tool = tools.find((t) => t.name === "pg_vector_insert")!;
      const result = (await tool.handler(
        {
          table: "t",
          column: "vec",
          vector: [0.1],
          additionalColumns: { name: "test" },
        },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(true);
    });

    it("should handle additionalColumns in update mode", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rowsAffected: 1 });
      const tool = tools.find((t) => t.name === "pg_vector_insert")!;
      const result = (await tool.handler(
        {
          table: "t",
          column: "vec",
          vector: [0.1],
          updateExisting: true,
          conflictColumn: "id",
          conflictValue: 1,
          additionalColumns: { name: "updated" },
        },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(result.mode).toBe("update");
      expect(result.columnsUpdated).toBe(2);
    });
  });

  describe("pg_vector_add_column", () => {
    it("should return error when table is empty", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_add_column")!;
      const result = (await tool.handler(
        { column: "vec", dimensions: 3 },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("table");
    });

    it("should return error when column is empty", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_add_column")!;
      const result = (await tool.handler(
        { table: "t", dimensions: 3 },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("column");
    });

    it("should skip when ifNotExists=true and column already exists", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // table exists
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }); // column exists
      const tool = tools.find((t) => t.name === "pg_vector_add_column")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", dimensions: 3, ifNotExists: true },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(result.alreadyExists).toBe(true);
    });

    it("should rethrow non-duplicate-column errors", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockRejectedValueOnce(new Error("permission denied"));
      const tool = tools.find((t) => t.name === "pg_vector_add_column")!;
      await expect(
        tool.handler({ table: "t", column: "vec", dimensions: 3 }, mockContext),
      ).rejects.toThrow("permission denied");
    });
  });

  describe("pg_vector_create_index", () => {
    it("should return error when table is empty", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_create_index")!;
      const result = (await tool.handler(
        { column: "vec", type: "hnsw" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("table");
    });

    it("should return error when column is empty", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_create_index")!;
      const result = (await tool.handler(
        { table: "t", type: "hnsw" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("column");
    });

    it("should handle race condition with ifNotExists=true", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockResolvedValueOnce({ rows: [] }) // pg_indexes check - not found
        .mockRejectedValueOnce(new Error("relation already exists")); // race
      const tool = tools.find((t) => t.name === "pg_vector_create_index")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", type: "hnsw", ifNotExists: true },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(result.alreadyExists).toBe(true);
    });

    it("should use cosine metric operator class", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [] });
      const tool = tools.find((t) => t.name === "pg_vector_create_index")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", type: "hnsw", metric: "cosine" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(result.metric).toBe("cosine");
      const sql = mockAdapter.executeQuery.mock.calls[1][0] as string;
      expect(sql).toContain("vector_cosine_ops");
    });

    it("should use inner_product operator class", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [] });
      const tool = tools.find((t) => t.name === "pg_vector_create_index")!;
      const result = (await tool.handler(
        {
          table: "t",
          column: "vec",
          type: "ivfflat",
          metric: "inner_product",
          lists: 50,
        },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(true);
      const sql = mockAdapter.executeQuery.mock.calls[1][0] as string;
      expect(sql).toContain("vector_ip_ops");
      expect(sql).toContain("lists = 50");
    });
  });

  describe("pg_vector_aggregate", () => {
    it("should return error when table is empty", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_aggregate")!;
      const result = (await tool.handler(
        { column: "vec" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("table");
    });

    it("should return error when column is empty", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_aggregate")!;
      const result = (await tool.handler(
        { table: "t" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("column");
    });

    it("should return non-vector-column error", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [{ udt_name: "text" }] });
      const tool = tools.find((t) => t.name === "pg_vector_aggregate")!;
      const result = (await tool.handler(
        { table: "t", column: "name" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("not a vector column");
    });

    it("should handle schema.table format", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] })
        .mockResolvedValueOnce({
          rows: [{ average_vector: "[0.1,0.2]", count: "3" }],
        });
      const tool = tools.find((t) => t.name === "pg_vector_aggregate")!;
      const result = (await tool.handler(
        { table: "myschema.mytable", column: "vec" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.count).toBe(3);
    });

    it("should handle where clause", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] })
        .mockResolvedValueOnce({
          rows: [{ average_vector: "[0.1]", count: 1 }],
        });
      const tool = tools.find((t) => t.name === "pg_vector_aggregate")!;
      await tool.handler(
        { table: "t", column: "vec", where: "category = 1" },
        mockContext,
      );
      const sql = mockAdapter.executeQuery.mock.calls[2][0] as string;
      expect(sql).toContain("WHERE");
    });

    it("should note empty/null results", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] })
        .mockResolvedValueOnce({ rows: [{ average_vector: null, count: 0 }] });
      const tool = tools.find((t) => t.name === "pg_vector_aggregate")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", summarizeVector: false },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.note).toContain("No vectors found");
    });

    it("should note all-NULL vectors", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] })
        .mockResolvedValueOnce({
          rows: [{ average_vector: null, count: "5" }],
        });
      const tool = tools.find((t) => t.name === "pg_vector_aggregate")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", summarizeVector: false },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.note).toContain("NULL vectors");
    });

    it("should summarize large vectors by default", async () => {
      const bigVec = Array.from({ length: 20 }, (_, i) => i * 0.1).join(",");
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] })
        .mockResolvedValueOnce({
          rows: [{ average_vector: `[${bigVec}]`, count: 1 }],
        });
      const tool = tools.find((t) => t.name === "pg_vector_aggregate")!;
      const result = (await tool.handler(
        { table: "t", column: "vec" },
        mockContext,
      )) as Record<string, unknown>;
      const av = result.average_vector as { truncated: boolean };
      expect(av.truncated).toBe(true);
    });

    it("should handle groupBy with NULL average vectors and excludeNullGroups", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] })
        .mockResolvedValueOnce({
          rows: [
            { group_key: "a", average_vector: "[0.1]", count: 2 },
            { group_key: "b", average_vector: null, count: 1 },
          ],
        });
      const tool = tools.find((t) => t.name === "pg_vector_aggregate")!;

      // Without excludeNullGroups: should include note
      const r1 = (await tool.handler(
        {
          table: "t",
          column: "vec",
          groupBy: "category",
          summarizeVector: false,
        },
        mockContext,
      )) as Record<string, unknown>;
      expect(r1.note).toContain("NULL average_vector");
      expect((r1.groups as unknown[]).length).toBe(2);
    });

    it("should filter out null groups when excludeNullGroups=true", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] })
        .mockResolvedValueOnce({
          rows: [
            { group_key: "a", average_vector: "[0.1]", count: 2 },
            { group_key: "b", average_vector: null, count: 1 },
          ],
        });
      const tool = tools.find((t) => t.name === "pg_vector_aggregate")!;
      const r = (await tool.handler(
        {
          table: "t",
          column: "vec",
          groupBy: "category",
          excludeNullGroups: true,
          summarizeVector: false,
        },
        mockContext,
      )) as Record<string, unknown>;
      expect((r.groups as unknown[]).length).toBe(1);
      expect(r.count).toBe(1);
    });

    it("should handle count as number type", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] })
        .mockResolvedValueOnce({
          rows: [{ average_vector: "[0.1]", count: 5 }],
        });
      const tool = tools.find((t) => t.name === "pg_vector_aggregate")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", summarizeVector: false },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.count).toBe(5);
    });
  });

  describe("pg_vector_distance", () => {
    it("should return error for dimension mismatch", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_distance")!;
      const result = (await tool.handler(
        { vector1: [0.1, 0.2], vector2: [0.1, 0.2, 0.3] },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("dimensions must match");
    });

    it("should use cosine operator", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ distance: 0.5 }],
      });
      const tool = tools.find((t) => t.name === "pg_vector_distance")!;
      await tool.handler(
        { vector1: [0.1], vector2: [0.2], metric: "cosine" },
        mockContext,
      );
      const sql = mockAdapter.executeQuery.mock.calls[0][0] as string;
      expect(sql).toContain("<=>");
    });

    it("should use inner_product operator", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ distance: 0.5 }],
      });
      const tool = tools.find((t) => t.name === "pg_vector_distance")!;
      await tool.handler(
        { vector1: [0.1], vector2: [0.2], metric: "inner_product" },
        mockContext,
      );
      const sql = mockAdapter.executeQuery.mock.calls[0][0] as string;
      expect(sql).toContain("<#>");
    });
  });

  describe("pg_vector_normalize", () => {
    it("should return error for zero vector", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_normalize")!;
      const result = (await tool.handler(
        { vector: [0, 0, 0] },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("zero vector");
    });
  });

  describe("pg_vector_batch_insert", () => {
    it("should return success for empty vectors array", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
      const tool = tools.find((t) => t.name === "pg_vector_batch_insert")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", vectors: [] },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(result.rowsInserted).toBe(0);
    });

    it("should handle schema.table format", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [], rowsAffected: 1 });
      const tool = tools.find((t) => t.name === "pg_vector_batch_insert")!;
      const result = (await tool.handler(
        {
          table: "myschema.mytable",
          column: "vec",
          vectors: [{ vector: [0.1] }],
        },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(true);
    });

    it("should handle vectors with additional data columns", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [], rowsAffected: 2 });
      const tool = tools.find((t) => t.name === "pg_vector_batch_insert")!;
      const result = (await tool.handler(
        {
          table: "t",
          column: "vec",
          vectors: [
            { vector: [0.1], data: { name: "a", score: 1 } },
            { vector: [0.2], data: { name: "b" } },
          ],
        },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(result.rowsInserted).toBe(2);
    });

    it("should rethrow non-dimension errors", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockRejectedValueOnce(new Error("permission denied"));
      const tool = tools.find((t) => t.name === "pg_vector_batch_insert")!;
      await expect(
        tool.handler(
          { table: "t", column: "vec", vectors: [{ vector: [0.1] }] },
          mockContext,
        ),
      ).rejects.toThrow("permission denied");
    });
  });

  describe("pg_vector_validate", () => {
    it("should return table-not-found error", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [] }) // column not found
        .mockResolvedValueOnce({ rows: [] }); // table not found
      const tool = tools.find((t) => t.name === "pg_vector_validate")!;
      const result = (await tool.handler(
        { table: "nonexistent", column: "vec" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Table");
    });

    it("should return column-not-found error", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [] }) // column not found
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }); // table exists
      const tool = tools.find((t) => t.name === "pg_vector_validate")!;
      const result = (await tool.handler(
        { table: "t", column: "bad" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Column");
    });

    it("should detect dimension mismatch", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // column exists
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] }) // type check
        .mockResolvedValueOnce({ rows: [{ dimensions: "384" }] }); // dimension check
      const tool = tools.find((t) => t.name === "pg_vector_validate")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", vector: [0.1, 0.2, 0.3] },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.valid).toBe(false);
      expect(result.error).toContain("dimensions");
      expect(result.suggestion).toContain("embedding model");
    });

    it("should suggest dimension_reduce when vector is too large", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] })
        .mockResolvedValueOnce({ rows: [{ dimensions: 3 }] });
      const tool = tools.find((t) => t.name === "pg_vector_validate")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", vector: [0.1, 0.2, 0.3, 0.4, 0.5] },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.valid).toBe(false);
      expect(result.suggestion).toContain("dimension_reduce");
    });

    it("should handle empty table (no sample row)", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] })
        .mockRejectedValueOnce(new Error("no rows"));
      const tool = tools.find((t) => t.name === "pg_vector_validate")!;
      const result = (await tool.handler(
        { table: "t", column: "vec" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.valid).toBe(true);
    });

    it("should validate with dimensions param only (no table)", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_validate")!;
      const result = (await tool.handler(
        { vector: [0.1, 0.2], dimensions: 3 },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.valid).toBe(false);
    });

    it("should return valid=true when no expected dimensions", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_validate")!;
      const result = (await tool.handler(
        { vector: [0.1, 0.2] },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.valid).toBe(true);
      expect(result.vectorDimensions).toBe(2);
    });

    it("should handle ZodError for invalid vector input", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_validate")!;
      const result = (await tool.handler(
        { vector: "not-an-array" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

describe("Coverage: Hybrid Search Error Paths", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getVectorTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getVectorTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return error when table is empty", async () => {
    const tool = tools.find((t) => t.name === "pg_hybrid_search")!;
    const result = (await tool.handler(
      { vectorColumn: "vec", textColumn: "c", vector: [0.1], textQuery: "t" },
      mockContext,
    )) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain("table");
  });

  it("should return error when vectorColumn is empty", async () => {
    const tool = tools.find((t) => t.name === "pg_hybrid_search")!;
    const result = (await tool.handler(
      { table: "t", textColumn: "c", vector: [0.1], textQuery: "t" },
      mockContext,
    )) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain("vectorColumn");
  });

  it("should reject tsvector column for vectorColumn", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
      .mockResolvedValueOnce({
        rows: [{ data_type: "tsvector", udt_name: "tsvector" }],
      }); // type check
    const tool = tools.find((t) => t.name === "pg_hybrid_search")!;
    const result = (await tool.handler(
      {
        table: "t",
        vectorColumn: "tsv",
        textColumn: "c",
        vector: [0.1],
        textQuery: "t",
      },
      mockContext,
    )) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain("tsvector");
  });

  it("should reject non-vector column type", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
      .mockResolvedValueOnce({
        rows: [{ data_type: "text", udt_name: "text" }],
      });
    const tool = tools.find((t) => t.name === "pg_hybrid_search")!;
    const result = (await tool.handler(
      {
        table: "t",
        vectorColumn: "name",
        textColumn: "c",
        vector: [0.1],
        textQuery: "t",
      },
      mockContext,
    )) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain("text");
  });

  it("should catch column-not-found error from query execution", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
      .mockResolvedValueOnce({
        rows: [{ data_type: "USER-DEFINED", udt_name: "vector" }],
      })
      .mockResolvedValueOnce({
        rows: [{ data_type: "text", udt_name: "text" }],
      })
      .mockResolvedValueOnce({ rows: [{ column_name: "id" }] })
      .mockRejectedValueOnce(new Error('column "content" does not exist'));
    const tool = tools.find((t) => t.name === "pg_hybrid_search")!;
    const result = (await tool.handler(
      {
        table: "t",
        vectorColumn: "vec",
        textColumn: "content",
        vector: [0.1],
        textQuery: "t",
      },
      mockContext,
    )) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
    expect(result.parameterWithIssue).toBe("textColumn");
  });

  it("should catch dimension mismatch from query execution", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
      .mockResolvedValueOnce({
        rows: [{ data_type: "USER-DEFINED", udt_name: "vector" }],
      })
      .mockResolvedValueOnce({
        rows: [{ data_type: "text", udt_name: "text" }],
      })
      .mockResolvedValueOnce({ rows: [{ column_name: "id" }] })
      .mockRejectedValueOnce(
        new Error("different vector dimensions 384 and 3"),
      );
    const tool = tools.find((t) => t.name === "pg_hybrid_search")!;
    const result = (await tool.handler(
      {
        table: "t",
        vectorColumn: "vec",
        textColumn: "c",
        vector: [0.1],
        textQuery: "t",
      },
      mockContext,
    )) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.expectedDimensions).toBe(384);
  });

  it("should catch relation-not-found from query execution", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
      .mockResolvedValueOnce({
        rows: [{ data_type: "USER-DEFINED", udt_name: "vector" }],
      })
      .mockResolvedValueOnce({
        rows: [{ data_type: "text", udt_name: "text" }],
      })
      .mockResolvedValueOnce({ rows: [{ column_name: "id" }] })
      .mockRejectedValueOnce(new Error('relation "t" does not exist'));
    const tool = tools.find((t) => t.name === "pg_hybrid_search")!;
    const result = (await tool.handler(
      {
        table: "t",
        vectorColumn: "vec",
        textColumn: "c",
        vector: [0.1],
        textQuery: "t",
      },
      mockContext,
    )) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
  });

  it("should return generic error for unexpected Error", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
      .mockResolvedValueOnce({
        rows: [{ data_type: "USER-DEFINED", udt_name: "vector" }],
      })
      .mockResolvedValueOnce({
        rows: [{ data_type: "text", udt_name: "text" }],
      })
      .mockResolvedValueOnce({ rows: [{ column_name: "id" }] })
      .mockRejectedValueOnce(new Error("some generic DB error"));
    const tool = tools.find((t) => t.name === "pg_hybrid_search")!;
    const result = (await tool.handler(
      {
        table: "t",
        vectorColumn: "vec",
        textColumn: "c",
        vector: [0.1],
        textQuery: "t",
      },
      mockContext,
    )) as Record<string, unknown>;
    expect(result.success).toBe(false);
  });

  it("should handle non-Error exception", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
      .mockResolvedValueOnce({
        rows: [{ data_type: "USER-DEFINED", udt_name: "vector" }],
      })
      .mockResolvedValueOnce({
        rows: [{ data_type: "text", udt_name: "text" }],
      })
      .mockResolvedValueOnce({ rows: [{ column_name: "id" }] })
      .mockRejectedValueOnce("string error");
    const tool = tools.find((t) => t.name === "pg_hybrid_search")!;
    const result = (await tool.handler(
      {
        table: "t",
        vectorColumn: "vec",
        textColumn: "c",
        vector: [0.1],
        textQuery: "t",
      },
      mockContext,
    )) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toBe("An unexpected error occurred");
  });

  it("should handle schema.table format", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
      .mockResolvedValueOnce({
        rows: [{ data_type: "USER-DEFINED", udt_name: "vector" }],
      })
      .mockResolvedValueOnce({
        rows: [{ data_type: "text", udt_name: "text" }],
      })
      .mockResolvedValueOnce({ rows: [{ column_name: "id" }] })
      .mockResolvedValueOnce({ rows: [] });
    const tool = tools.find((t) => t.name === "pg_hybrid_search")!;
    const result = (await tool.handler(
      {
        table: "myschema.docs",
        vectorColumn: "vec",
        textColumn: "c",
        vector: [0.1],
        textQuery: "t",
      },
      mockContext,
    )) as Record<string, unknown>;
    expect(result.count).toBe(0);
  });

  it("should handle tsvector textColumn type", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
      .mockResolvedValueOnce({
        rows: [{ data_type: "USER-DEFINED", udt_name: "vector" }],
      })
      .mockResolvedValueOnce({
        rows: [{ data_type: "tsvector", udt_name: "tsvector" }],
      })
      .mockResolvedValueOnce({ rows: [{ column_name: "id" }] })
      .mockResolvedValueOnce({ rows: [] });
    const tool = tools.find((t) => t.name === "pg_hybrid_search")!;
    const result = (await tool.handler(
      {
        table: "t",
        vectorColumn: "vec",
        textColumn: "tsv_col",
        vector: [0.1],
        textQuery: "t",
      },
      mockContext,
    )) as Record<string, unknown>;
    expect(result.count).toBe(0);
  });
});

describe("Coverage: Advanced Tool Edge Cases", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getVectorTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getVectorTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  describe("pg_vector_cluster", () => {
    it("should return error for k < 1", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] });
      const tool = tools.find((t) => t.name === "pg_vector_cluster")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", k: 0 },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("at least 1");
    });

    it("should return error when insufficient data for k clusters", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] })
        .mockResolvedValueOnce({ rows: [{ vec: "[0.1,0.2]" }] });
      const tool = tools.find((t) => t.name === "pg_vector_cluster")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", k: 5 },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.availableDataPoints).toBe(1);
    });

    it("should handle iteration errors gracefully", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] })
        .mockResolvedValueOnce({
          rows: [{ vec: "[0.1]" }, { vec: "[0.2]" }],
        })
        .mockRejectedValue(new Error("cluster error")); // iterations fail
      const tool = tools.find((t) => t.name === "pg_vector_cluster")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", k: 2 },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.k).toBe(2);
    });

    it("should handle large vector truncation in centroids", async () => {
      const bigVec = Array.from({ length: 20 }, (_, i) => i * 0.1).join(",");
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] })
        .mockResolvedValueOnce({
          rows: [{ vec: `[${bigVec}]` }, { vec: `[${bigVec}]` }],
        })
        .mockRejectedValue(new Error("break")); // stop iterations
      const tool = tools.find((t) => t.name === "pg_vector_cluster")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", k: 2 },
        mockContext,
      )) as Record<string, unknown>;
      const centroids = result.centroids as { truncated?: boolean }[];
      expect(centroids[0].truncated).toBe(true);
    });

    it("should handle non-parseable centroid vector", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] })
        .mockResolvedValueOnce({ rows: [{ vec: "baddata" }, { vec: "[0.1]" }] })
        .mockRejectedValue(new Error("break"));
      const tool = tools.find((t) => t.name === "pg_vector_cluster")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", k: 2 },
        mockContext,
      )) as Record<string, unknown>;
      const centroids = result.centroids as { vector?: unknown }[];
      // parseVector("baddata") returns [NaN], so it gets wrapped as {vector: [NaN]}
      expect(centroids[0].vector).toBeDefined();
    });
  });

  describe("pg_vector_index_optimize", () => {
    it("should return non-vector-column error", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence
        .mockResolvedValueOnce({
          rows: [{ estimated_rows: "100", table_size: "1 MB" }],
        })
        .mockResolvedValueOnce({ rows: [{ udt_name: "text" }] }); // type check
      const tool = tools.find((t) => t.name === "pg_vector_index_optimize")!;
      const result = (await tool.handler(
        { table: "t", column: "name" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("not a vector column");
    });

    it("should recommend HNSW for large tables", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({
          rows: [{ estimated_rows: "500000", table_size: "2 GB" }],
        })
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] })
        .mockResolvedValueOnce({ rows: [{ dimensions: 384 }] })
        .mockResolvedValueOnce({ rows: [] });
      const tool = tools.find((t) => t.name === "pg_vector_index_optimize")!;
      const result = (await tool.handler(
        { table: "t", column: "vec" },
        mockContext,
      )) as Record<string, unknown>;
      const recs = result.recommendations as { type: string }[];
      expect(recs[0].type).toBe("hnsw");
      expect(recs[1].type).toBe("ivfflat");
    });

    it("should recommend none for small tables", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({
          rows: [{ estimated_rows: "100", table_size: "1 MB" }],
        })
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] })
        .mockResolvedValueOnce({ rows: [{ dimensions: 3 }] })
        .mockResolvedValueOnce({ rows: [] });
      const tool = tools.find((t) => t.name === "pg_vector_index_optimize")!;
      const result = (await tool.handler(
        { table: "t", column: "vec" },
        mockContext,
      )) as Record<string, unknown>;
      const recs = result.recommendations as { type: string }[];
      expect(recs[0].type).toBe("none");
    });

    it("should recommend higher m for high-dim vectors in large tables", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({
          rows: [{ estimated_rows: "500000", table_size: "5 GB" }],
        })
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] })
        .mockResolvedValueOnce({ rows: [{ dimensions: 1536 }] })
        .mockResolvedValueOnce({ rows: [] });
      const tool = tools.find((t) => t.name === "pg_vector_index_optimize")!;
      const result = (await tool.handler(
        { table: "t", column: "vec" },
        mockContext,
      )) as Record<string, unknown>;
      const recs = result.recommendations as { type: string; m?: number }[];
      expect(recs[0].m).toBe(32);
    });
  });

  describe("pg_vector_performance", () => {
    it("should return error when table is empty", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_performance")!;
      const result = (await tool.handler(
        { column: "vec" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
    });

    it("should return error when column is empty", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_performance")!;
      const result = (await tool.handler(
        { table: "t" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
    });

    it("should auto-generate testVector from first row", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence
        .mockResolvedValueOnce({ rows: [{ indexname: "idx" }] }) // indexes
        .mockResolvedValueOnce({
          rows: [{ estimated_rows: "100", table_size: "1 MB" }],
        }) // stats
        .mockResolvedValueOnce({ rows: [{ vec: "[0.1,0.2]" }] }) // sample
        .mockResolvedValueOnce({ rows: [{ "QUERY PLAN": "Seq Scan" }] }); // EXPLAIN
      const tool = tools.find((t) => t.name === "pg_vector_performance")!;
      const result = (await tool.handler(
        { table: "t", column: "vec" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.testVectorSource).toBe("auto-generated from first row");
      expect(result.benchmark).toBeDefined();
    });

    it("should handle hint when no testVector available", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [] }) // no indexes
        .mockResolvedValueOnce({
          rows: [{ estimated_rows: "-1", table_size: "0 bytes" }],
        })
        .mockRejectedValueOnce(new Error("empty table")); // sample fails
      const tool = tools.find((t) => t.name === "pg_vector_performance")!;
      const result = (await tool.handler(
        { table: "t", column: "vec" },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.hint).toContain("testVector");
      expect(result.estimatedRows).toBe(0);
      expect((result.recommendations as string[]).length).toBeGreaterThan(0);
    });

    it("should use user-provided testVector", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ estimated_rows: "50", table_size: "1 MB" }],
        })
        .mockResolvedValueOnce({ rows: [{ "QUERY PLAN": "Seq Scan" }] });
      const tool = tools.find((t) => t.name === "pg_vector_performance")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", testVector: [0.1, 0.2] },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.testVectorSource).toBe("user-provided");
    });

    it("should truncate long QUERY PLAN lines", async () => {
      const longPlan = "a".repeat(250) + "[0.1,0.2,0.3]'::vector something";
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ estimated_rows: "50", table_size: "1 MB" }],
        })
        .mockResolvedValueOnce({ rows: [{ "QUERY PLAN": longPlan }] });
      const tool = tools.find((t) => t.name === "pg_vector_performance")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", testVector: [0.1, 0.2] },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.benchmark).toBeDefined();
    });
  });

  describe("pg_vector_dimension_reduce", () => {
    it("should return error when target >= original dimensions", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_dimension_reduce")!;
      const result = (await tool.handler(
        { vector: [0.1, 0.2], targetDimensions: 5 },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.error).toContain("less than original");
    });

    it("should reduce vectors from table", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 1, vector_text: "[0.1,0.2,0.3,0.4,0.5]" },
            { id: 2, vector_text: "[0.5,0.4,0.3,0.2,0.1]" },
          ],
        });
      const tool = tools.find((t) => t.name === "pg_vector_dimension_reduce")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", targetDimensions: 2, summarize: false },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.mode).toBe("table");
      expect(result.processedCount).toBe(2);
    });

    it("should handle empty table in table mode", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({ rows: [] });
      const tool = tools.find((t) => t.name === "pg_vector_dimension_reduce")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", targetDimensions: 2 },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.error).toContain("No vectors found");
    });

    it("should skip vectors where target >= vector length", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({
          rows: [{ id: 1, vector_text: "[0.1,0.2]" }],
        });
      const tool = tools.find((t) => t.name === "pg_vector_dimension_reduce")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", targetDimensions: 5 },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.processedCount).toBe(0);
    });

    it("should return error when neither vector nor table provided", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_dimension_reduce")!;
      const result = (await tool.handler(
        { targetDimensions: 2 },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.error).toContain("Either vector");
    });

    it("should summarize by default in table mode", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
        .mockResolvedValueOnce({
          rows: [{ id: 1, vector_text: "[0.1,0.2,0.3,0.4,0.5]" }],
        });
      const tool = tools.find((t) => t.name === "pg_vector_dimension_reduce")!;
      const result = (await tool.handler(
        { table: "t", column: "vec", targetDimensions: 2 },
        mockContext,
      )) as Record<string, unknown>;
      expect(result.summarized).toBe(true);
      expect(result.hint).toContain("summarize: false");
    });
  });

  describe("pg_vector_embed", () => {
    it("should return full vector when summarize=false", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_embed")!;
      const result = (await tool.handler(
        { text: "hello", dimensions: 10, summarize: false },
        mockContext,
      )) as Record<string, unknown>;
      const emb = result.embedding as {
        truncated: boolean;
        dimensions: number;
      };
      expect(emb.truncated).toBe(false);
      expect(emb.dimensions).toBe(10);
    });

    it("should return error for empty text", async () => {
      const tool = tools.find((t) => t.name === "pg_vector_embed")!;
      const result = (await tool.handler({ text: "" }, mockContext)) as Record<
        string,
        unknown
      >;
      expect(result.success).toBe(false);
      expect(result.error).toContain("text");
    });
  });
});
