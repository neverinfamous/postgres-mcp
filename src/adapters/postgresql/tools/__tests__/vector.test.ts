/**
 * postgres-mcp - Vector (pgvector) Tools Unit Tests
 *
 * Tests for vector similarity search operations (14 tools total).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PostgresAdapter } from "../../PostgresAdapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../__tests__/mocks/index.js";
import { getVectorTools } from "../vector/index.js";

describe("Vector Tools", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let mockContext: ReturnType<typeof createMockRequestContext>;
  let tools: ReturnType<typeof getVectorTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    mockContext = createMockRequestContext();
    tools = getVectorTools(mockAdapter as unknown as PostgresAdapter);
  });

  const findTool = (name: string) => tools.find((t) => t.name === name);

  describe("pg_vector_create_extension", () => {
    it("should create pgvector extension", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_vector_create_extension");
      const result = (await tool!.handler({}, mockContext)) as {
        success: boolean;
        message: string;
      };

      expect(result.success).toBe(true);
      expect(result.message).toContain("pgvector");
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("CREATE EXTENSION IF NOT EXISTS vector"),
      );
    });
  });

  describe("pg_vector_add_column", () => {
    it("should add vector column with dimensions", async () => {
      // First: table existence check, Second: ALTER TABLE
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // table check
        .mockResolvedValueOnce({ rows: [] }); // ALTER TABLE

      const tool = findTool("pg_vector_add_column");
      const result = (await tool!.handler(
        {
          table: "documents",
          column: "embedding",
          dimensions: 1536,
        },
        mockContext,
      )) as { success: boolean; dimensions: number };

      expect(result.success).toBe(true);
      expect(result.dimensions).toBe(1536);
    });
  });

  describe("pg_vector_insert", () => {
    it("should insert vector data", async () => {
      // First: existence check (column found), Second: INSERT
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockResolvedValueOnce({ rowsAffected: 1 }); // INSERT

      const tool = findTool("pg_vector_insert");
      const result = (await tool!.handler(
        {
          table: "documents",
          column: "embedding",
          vector: [0.1, 0.2, 0.3],
        },
        mockContext,
      )) as { success: boolean; rowsAffected: number };

      expect(result.success).toBe(true);
    });

    it("should insert vector with additional columns", async () => {
      // First: existence check (column found), Second: INSERT
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockResolvedValueOnce({ rowsAffected: 1 }); // INSERT

      const tool = findTool("pg_vector_insert");
      await tool!.handler(
        {
          table: "documents",
          column: "embedding",
          vector: [0.1, 0.2],
          additionalColumns: { title: "Test Doc" },
        },
        mockContext,
      );

      // Second call (INSERT) should contain $1 placeholder
      const sql = mockAdapter.executeQuery.mock.calls[1][0] as string;
      expect(sql).toContain("$1");
    });
  });

  describe("pg_vector_search", () => {
    it("should search using L2 distance by default", async () => {
      // First: existence check (column found), Second: type check, Third: search
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] }) // type check
        .mockResolvedValueOnce({
          rows: [
            { id: 1, distance: 0.1 },
            { id: 2, distance: 0.2 },
          ],
        });

      const tool = findTool("pg_vector_search");
      const result = (await tool!.handler(
        {
          table: "documents",
          column: "embedding",
          vector: [0.1, 0.2, 0.3],
        },
        mockContext,
      )) as { results: unknown[]; metric: string };

      expect(result.results).toHaveLength(2);
      expect(result.metric).toBe("l2");
    });

    it("should search using cosine distance", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] }) // type check
        .mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_vector_search");
      await tool!.handler(
        {
          table: "documents",
          column: "embedding",
          vector: [0.1, 0.2],
          metric: "cosine",
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("<=>"),
      );
    });

    it("should search using inner product", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] }) // type check
        .mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_vector_search");
      await tool!.handler(
        {
          table: "documents",
          column: "embedding",
          vector: [0.1, 0.2],
          metric: "inner_product",
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("<#>"),
      );
    });

    it("should apply where clause and limit", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] }) // type check
        .mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_vector_search");
      await tool!.handler(
        {
          table: "documents",
          column: "embedding",
          vector: [0.1, 0.2],
          where: "category = 'tech'",
          limit: 5,
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringMatching(/category = 'tech'.*LIMIT 5/s),
      );
    });
  });

  describe("pg_vector_create_index", () => {
    it("should create IVFFlat index", async () => {
      // First: existence check (column found), Second: CREATE INDEX
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockResolvedValueOnce({ rows: [] }); // CREATE INDEX

      const tool = findTool("pg_vector_create_index");
      const result = (await tool!.handler(
        {
          table: "documents",
          column: "embedding",
          type: "ivfflat",
          lists: 100,
        },
        mockContext,
      )) as { success: boolean; type: string };

      expect(result.success).toBe(true);
      expect(result.type).toBe("ivfflat");
    });

    it("should create HNSW index", async () => {
      // First: existence check (column found), Second: CREATE INDEX
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockResolvedValueOnce({ rows: [] }); // CREATE INDEX

      const tool = findTool("pg_vector_create_index");
      await tool!.handler(
        {
          table: "documents",
          column: "embedding",
          type: "hnsw",
          m: 32,
          efConstruction: 128,
        },
        mockContext,
      );

      // Second call (index 1) is the CREATE INDEX
      const sql = mockAdapter.executeQuery.mock.calls[1][0] as string;
      expect(sql).toContain("USING hnsw");
      expect(sql).toContain("m = 32");
    });
  });

  describe("pg_vector_distance", () => {
    it("should calculate L2 distance between vectors", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ distance: 0.5 }],
      });

      const tool = findTool("pg_vector_distance");
      const result = (await tool!.handler(
        {
          vector1: [1, 0, 0],
          vector2: [0, 1, 0],
        },
        mockContext,
      )) as { distance: number; metric: string };

      expect(result.distance).toBe(0.5);
      expect(result.metric).toBe("l2");
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("<->"),
      );
    });

    it("should calculate cosine distance", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ distance: 0.3 }],
      });

      const tool = findTool("pg_vector_distance");
      await tool!.handler(
        {
          vector1: [1, 0],
          vector2: [0, 1],
          metric: "cosine",
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("<=>"),
      );
    });
  });

  describe("pg_vector_normalize", () => {
    it("should normalize vector to unit length (in-memory)", async () => {
      const tool = findTool("pg_vector_normalize");
      const result = (await tool!.handler(
        {
          vector: [3, 4],
        },
        mockContext,
      )) as { normalized: number[]; magnitude: number };

      expect(result.magnitude).toBe(5);
      expect(result.normalized[0]).toBeCloseTo(0.6, 5);
      expect(result.normalized[1]).toBeCloseTo(0.8, 5);
      // Should not call database
      expect(mockAdapter.executeQuery).not.toHaveBeenCalled();
    });
  });

  describe("pg_vector_aggregate", () => {
    it("should calculate average vector", async () => {
      // First: existence check, Second: column type check, Third: aggregate query
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] }) // type check
        .mockResolvedValueOnce({
          rows: [{ average_vector: "[0.5,0.5,0.5]", count: 10 }],
        });

      const tool = findTool("pg_vector_aggregate");
      const result = (await tool!.handler(
        {
          table: "documents",
          column: "embedding",
        },
        mockContext,
      )) as { average_vector: unknown; count: number };

      expect(result.count).toBe(10);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("avg("),
      );
    });

    it("should apply where clause", async () => {
      // First: existence check, Second: column type check, Third: aggregate query
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] }) // type check
        .mockResolvedValueOnce({
          rows: [{ average_vector: "[0.1]", count: 1 }],
        });

      const tool = findTool("pg_vector_aggregate");
      await tool!.handler(
        {
          table: "documents",
          column: "embedding",
          where: "category = 'tech'",
        },
        mockContext,
      );

      // Second call should contain the where clause
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("category = 'tech'"),
      );
    });
  });

  // Advanced Vector Tools

  describe("pg_vector_cluster", () => {
    it("should perform K-means clustering", async () => {
      const mockVectors = Array.from({ length: 10 }, (_, i) => ({
        vec: `[${i * 0.1},${i * 0.2}]`,
      }));

      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] }) // type check
        .mockResolvedValueOnce({ rows: mockVectors })
        .mockResolvedValueOnce({
          rows: [
            {
              centroid: "[0.1,0.2]",
              cluster_size: 5,
              new_centroid: "[0.15,0.25]",
            },
            {
              centroid: "[0.5,0.6]",
              cluster_size: 5,
              new_centroid: "[0.55,0.65]",
            },
          ],
        });

      const tool = findTool("pg_vector_cluster");
      const result = (await tool!.handler(
        {
          table: "documents",
          column: "embedding",
          k: 2,
        },
        mockContext,
      )) as { k: number; centroids: unknown[] };

      expect(result.k).toBe(2);
      expect(result.centroids).toBeDefined();
    });

    it("should return error for insufficient vectors", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] }) // type check
        .mockResolvedValueOnce({
          rows: [{ vec: "[0.1,0.2]" }],
        });

      const tool = findTool("pg_vector_cluster");
      const result = (await tool!.handler(
        {
          table: "documents",
          column: "embedding",
          k: 5,
        },
        mockContext,
      )) as { error: string; success: boolean };

      expect(result.success).toBe(false);
      expect(result.error).toContain("Cannot create 5 clusters");
    });
  });

  describe("pg_vector_index_optimize", () => {
    it("should recommend no index for small tables", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check (checkTableAndColumn)
        .mockResolvedValueOnce({
          rows: [{ estimated_rows: 5000, table_size: "1 MB" }],
        }) // stats
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] }) // type check
        .mockResolvedValueOnce({ rows: [{ dimensions: 384 }] }) // dimensions
        .mockResolvedValueOnce({ rows: [] }); // indexes

      const tool = findTool("pg_vector_index_optimize");
      const result = (await tool!.handler(
        {
          table: "documents",
          column: "embedding",
        },
        mockContext,
      )) as { recommendations: Array<{ type: string }> };

      expect(result.recommendations[0].type).toBe("none");
    });

    it("should recommend HNSW for large tables", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check (checkTableAndColumn)
        .mockResolvedValueOnce({
          rows: [{ estimated_rows: 500000, table_size: "500 MB" }],
        }) // stats
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] }) // type check
        .mockResolvedValueOnce({ rows: [{ dimensions: 1536 }] }) // dimensions
        .mockResolvedValueOnce({ rows: [] }); // indexes

      const tool = findTool("pg_vector_index_optimize");
      const result = (await tool!.handler(
        {
          table: "documents",
          column: "embedding",
        },
        mockContext,
      )) as { recommendations: Array<{ type: string }> };

      expect(result.recommendations.some((r) => r.type === "hnsw")).toBe(true);
    });
  });

  describe("pg_hybrid_search", () => {
    it("should combine vector and text search", async () => {
      // Mock: existence check, vectorColumn type check, textColumn type check, column list query, main query
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check (checkTableAndColumn)
        .mockResolvedValueOnce({
          rows: [{ data_type: "USER-DEFINED", udt_name: "vector" }],
        })
        .mockResolvedValueOnce({
          rows: [{ data_type: "text", udt_name: "text" }],
        })
        .mockResolvedValueOnce({
          rows: [{ column_name: "id" }, { column_name: "content" }],
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 1, combined_score: 0.9, vector_score: 0.8, text_score: 1.0 },
          ],
        });

      const tool = findTool("pg_hybrid_search");
      const result = (await tool!.handler(
        {
          table: "documents",
          vectorColumn: "embedding",
          textColumn: "content",
          vector: [0.1, 0.2, 0.3],
          textQuery: "machine learning",
        },
        mockContext,
      )) as { results: unknown[]; vectorWeight: number; textWeight: number };

      expect(result.results).toHaveLength(1);
      expect(result.vectorWeight).toBe(0.5);
      expect(result.textWeight).toBe(0.5);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("ts_rank"),
        ["machine learning"],
      );
    });

    it("should use custom weights", async () => {
      // Mock: existence check, vectorColumn type check, textColumn type check, column list query, main query
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check (checkTableAndColumn)
        .mockResolvedValueOnce({
          rows: [{ data_type: "USER-DEFINED", udt_name: "vector" }],
        })
        .mockResolvedValueOnce({
          rows: [{ data_type: "text", udt_name: "text" }],
        })
        .mockResolvedValueOnce({ rows: [{ column_name: "id" }] })
        .mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_hybrid_search");
      const result = (await tool!.handler(
        {
          table: "docs",
          vectorColumn: "vec",
          textColumn: "text",
          vector: [0.1],
          textQuery: "test",
          vectorWeight: 0.8,
        },
        mockContext,
      )) as { vectorWeight: number; textWeight: number };

      expect(result.vectorWeight).toBe(0.8);
      expect(result.textWeight).toBeCloseTo(0.2, 5);
    });

    it("should use tsvector column directly without to_tsvector wrapping", async () => {
      // Mock: existence check, vectorColumn type check (vector), textColumn type check (tsvector), column list, main query
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check (checkTableAndColumn)
        .mockResolvedValueOnce({
          rows: [{ data_type: "USER-DEFINED", udt_name: "vector" }],
        })
        .mockResolvedValueOnce({
          rows: [{ data_type: "tsvector", udt_name: "tsvector" }],
        })
        .mockResolvedValueOnce({
          rows: [{ column_name: "id" }, { column_name: "content" }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_hybrid_search");
      await tool!.handler(
        {
          table: "documents",
          vectorColumn: "embedding",
          textColumn: "search_vector",
          vector: [0.1, 0.2, 0.3],
          textQuery: "machine learning",
        },
        mockContext,
      );

      // The main SQL query should use the tsvector column directly (5th call, index 4)
      const mainQueryCall = mockAdapter.executeQuery.mock.calls[4];
      const sql = mainQueryCall?.[0] as string;
      expect(sql).toContain('ts_rank("search_vector"');
      expect(sql).not.toContain("to_tsvector('english'");
    });

    it("should wrap plain text column with to_tsvector", async () => {
      // Mock: existence check, vectorColumn type check (vector), textColumn type check (text), column list, main query
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check (checkTableAndColumn)
        .mockResolvedValueOnce({
          rows: [{ data_type: "USER-DEFINED", udt_name: "vector" }],
        })
        .mockResolvedValueOnce({
          rows: [{ data_type: "text", udt_name: "text" }],
        })
        .mockResolvedValueOnce({
          rows: [{ column_name: "id" }, { column_name: "content" }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_hybrid_search");
      await tool!.handler(
        {
          table: "documents",
          vectorColumn: "embedding",
          textColumn: "content",
          vector: [0.1, 0.2, 0.3],
          textQuery: "test query",
        },
        mockContext,
      );

      // The main SQL query should wrap the text column with to_tsvector (5th call, index 4)
      const mainQueryCall = mockAdapter.executeQuery.mock.calls[4];
      const sql = mainQueryCall?.[0] as string;
      expect(sql).toContain("to_tsvector('english', \"content\")");
    });
  });

  describe("pg_vector_performance", () => {
    it("should analyze vector performance", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check (checkTableAndColumn)
        .mockResolvedValueOnce({
          rows: [
            {
              indexname: "idx_embedding",
              indexdef: "USING hnsw",
              index_size: "10 MB",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ estimated_rows: 100000, table_size: "500 MB" }],
        });

      const tool = findTool("pg_vector_performance");
      const result = (await tool!.handler(
        {
          table: "documents",
          column: "embedding",
        },
        mockContext,
      )) as { indexes: unknown[]; tableSize: string; estimatedRows: number };

      expect(result.indexes).toHaveLength(1);
      expect(result.tableSize).toBe("500 MB");
      expect(result.estimatedRows).toBe(100000);
    });

    it("should run benchmark with test vector", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check (checkTableAndColumn)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ estimated_rows: 10000 }] })
        .mockResolvedValueOnce({
          rows: [{ "QUERY PLAN": "Index Scan using idx..." }],
        });

      const tool = findTool("pg_vector_performance");
      const result = (await tool!.handler(
        {
          table: "documents",
          column: "embedding",
          testVector: [0.1, 0.2, 0.3],
        },
        mockContext,
      )) as { benchmark: unknown };

      expect(result.benchmark).toBeDefined();
    });
  });

  describe("pg_vector_dimension_reduce", () => {
    it("should reduce vector dimensions (in-memory)", async () => {
      const tool = findTool("pg_vector_dimension_reduce");
      const result = (await tool!.handler(
        {
          vector: Array(100).fill(0.1),
          targetDimensions: 10,
        },
        mockContext,
      )) as {
        originalDimensions: number;
        targetDimensions: number;
        reduced: number[];
      };

      expect(result.originalDimensions).toBe(100);
      expect(result.targetDimensions).toBe(10);
      expect(result.reduced).toHaveLength(10);
      expect(mockAdapter.executeQuery).not.toHaveBeenCalled();
    });

    it("should return error if target >= original", async () => {
      const tool = findTool("pg_vector_dimension_reduce");
      const result = (await tool!.handler(
        {
          vector: [0.1, 0.2, 0.3],
          targetDimensions: 5,
        },
        mockContext,
      )) as { error: string };

      expect(result.error).toContain("less than original");
    });
  });

  describe("pg_vector_embed", () => {
    it("should generate demo embedding (in-memory)", async () => {
      const tool = findTool("pg_vector_embed");
      const result = (await tool!.handler(
        {
          text: "Hello world",
        },
        mockContext,
      )) as {
        embedding: {
          preview: number[];
          dimensions: number;
          truncated: boolean;
        };
        dimensions: number;
        warning: string;
      };

      expect(result.dimensions).toBe(384);
      // Embedding is summarized by default (preview shows first/last 5 values)
      expect(result.embedding.dimensions).toBe(384);
      expect(result.embedding.truncated).toBe(true);
      expect(result.embedding.preview).toHaveLength(10); // 5 first + 5 last
      expect(result.warning).toContain("demo");
      expect(mockAdapter.executeQuery).not.toHaveBeenCalled();
    });

    it("should use custom dimensions", async () => {
      const tool = findTool("pg_vector_embed");
      const result = (await tool!.handler(
        {
          text: "Test",
          dimensions: 768,
        },
        mockContext,
      )) as {
        dimensions: number;
        embedding: {
          preview: number[];
          dimensions: number;
          truncated: boolean;
        };
      };

      expect(result.dimensions).toBe(768);
      expect(result.embedding.dimensions).toBe(768);
      expect(result.embedding.truncated).toBe(true);
    });

    it("should return raw embedding when summarize is false", async () => {
      const tool = findTool("pg_vector_embed");
      const result = (await tool!.handler(
        {
          text: "Test",
          dimensions: 384,
          summarize: false,
        },
        mockContext,
      )) as {
        dimensions: number;
        embedding: {
          preview: number[];
          dimensions: number;
          truncated: boolean;
        };
      };

      expect(result.dimensions).toBe(384);
      // When summarize: false, embedding is still object format but with full vector
      expect(result.embedding.dimensions).toBe(384);
      expect(result.embedding.truncated).toBe(false);
      expect(result.embedding.preview).toHaveLength(384);
    });
  });

  it("should export all 15 vector tools", () => {
    expect(tools).toHaveLength(16);
    const toolNames = tools.map((t) => t.name);
    // Basic
    expect(toolNames).toContain("pg_vector_create_extension");
    expect(toolNames).toContain("pg_vector_add_column");
    expect(toolNames).toContain("pg_vector_insert");
    expect(toolNames).toContain("pg_vector_search");
    expect(toolNames).toContain("pg_vector_create_index");
    expect(toolNames).toContain("pg_vector_distance");
    expect(toolNames).toContain("pg_vector_normalize");
    expect(toolNames).toContain("pg_vector_aggregate");
    // Advanced
    expect(toolNames).toContain("pg_vector_cluster");
    expect(toolNames).toContain("pg_vector_index_optimize");
    expect(toolNames).toContain("pg_hybrid_search");
    expect(toolNames).toContain("pg_vector_performance");
    expect(toolNames).toContain("pg_vector_dimension_reduce");
    expect(toolNames).toContain("pg_vector_embed");
  });
});
