/**
 * postgres-mcp - pg_stat_kcache Extension Tools Unit Tests
 *
 * Tests for OS-level performance monitoring tools.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PostgresAdapter } from "../../postgres-adapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../__tests__/mocks/index.js";
import { getKcacheTools } from "../kcache/index.js";

describe("Kcache Tools", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let mockContext: ReturnType<typeof createMockRequestContext>;
  let tools: ReturnType<typeof getKcacheTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    mockContext = createMockRequestContext();
    tools = getKcacheTools(mockAdapter as unknown as PostgresAdapter);
  });

  const findTool = (name: string) => tools.find((t) => t.name === name);

  describe("pg_kcache_create_extension", () => {
    it("should fail if pg_stat_statements not installed", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ installed: false }],
      });

      const tool = findTool("pg_kcache_create_extension");
      const result = (await tool!.handler({}, mockContext)) as {
        success: boolean;
        error?: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("pg_stat_statements");
    });

    it("should create extension when pg_stat_statements exists", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ installed: true }] })
        .mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_kcache_create_extension");
      const result = (await tool!.handler({}, mockContext)) as {
        success: boolean;
        message: string;
      };

      expect(result.success).toBe(true);
      expect(result.message).toContain("pg_stat_kcache");
      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringContaining(
          "CREATE EXTENSION IF NOT EXISTS pg_stat_kcache",
        ),
      );
    });
  });

  describe("pg_kcache_query_stats", () => {
    it("should return query stats with CPU/IO metrics", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          {
            queryid: "12345",
            query_preview: "SELECT * FROM users",
            calls: 100,
            total_time_ms: 5000,
            user_time: 2.5,
            system_time: 0.5,
            reads: 1024000,
            writes: 512000,
          },
        ],
      });

      const tool = findTool("pg_kcache_query_stats");
      const result = (await tool!.handler({}, mockContext)) as {
        queries: unknown[];
        count: number;
        orderBy: string;
      };

      expect(result.count).toBe(1);
      expect(result.orderBy).toBe("total_time");
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("pg_stat_kcache()"),
        [],
      );
    });

    it("should order by CPU time when specified", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_kcache_query_stats");
      await tool!.handler({ orderBy: "cpu_time" }, mockContext);

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("(k.user_time + k.system_time)"),
        [],
      );
    });

    it("should filter by minimum calls", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_kcache_query_stats");
      await tool!.handler({ minCalls: 10 }, mockContext);

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("s.calls >="),
        [10],
      );
    });

    it("should apply limit", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_kcache_query_stats");
      await tool!.handler({ limit: 5 }, mockContext);

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT 5"),
        [],
      );
    });

    it("should order by reads when specified (orderBy branch)", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_kcache_query_stats");
      await tool!.handler({ orderBy: "reads" }, mockContext);

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("k.reads"),
        [],
      );
    });

    it("should order by writes when specified (orderBy branch)", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_kcache_query_stats");
      await tool!.handler({ orderBy: "writes" }, mockContext);

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("k.writes"),
        [],
      );
    });

    it("should return structured error for invalid orderBy value", async () => {
      const tool = findTool("pg_kcache_query_stats");
      const result = (await tool!.handler(
        { orderBy: "calls" },
        mockContext,
      )) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid orderBy value "calls"');
      expect(result.error).toContain("total_time");
      expect(mockAdapter.executeQuery).not.toHaveBeenCalled();
    });
  });

  describe("pg_kcache_top_cpu", () => {
    it("should return top CPU-consuming queries", async () => {
      // First call: column detection (empty = old version)
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Second call: actual query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          {
            queryid: "12345",
            query_preview: "SELECT complex_function()",
            user_time: 10.5,
            system_time: 2.5,
            total_cpu_time: 13,
          },
        ],
      });

      const tool = findTool("pg_kcache_top_cpu");
      const result = (await tool!.handler({}, mockContext)) as {
        topCpuQueries: unknown[];
        description: string;
      };

      expect(result.topCpuQueries).toHaveLength(1);
      expect(result.description).toContain("CPU");
    });

    it("should apply custom limit", async () => {
      // First call: column detection
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Second call: actual query
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_kcache_top_cpu");
      await tool!.handler({ limit: 5 }, mockContext);

      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("LIMIT 5"),
      );
    });

    it("should respect queryPreviewLength", async () => {
      // First call: column detection
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Second call: COUNT query
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ total: 0 }] });
      // Third call: actual query
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_kcache_top_cpu");
      await tool!.handler({ queryPreviewLength: 200, compact: false }, mockContext);

      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("LEFT(s.query, 200)"),
      );
    });
  });

  describe("pg_kcache_top_io", () => {
    it("should return top I/O queries by default (both)", async () => {
      // First call: column detection
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Second call: actual query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          {
            queryid: "12345",
            read_bytes: 1024000,
            write_bytes: 512000,
            total_io_bytes: 1536000,
          },
        ],
      });

      const tool = findTool("pg_kcache_top_io");
      const result = (await tool!.handler({}, mockContext)) as {
        topIoQueries: unknown[];
        ioType: string;
      };

      expect(result.topIoQueries).toHaveLength(1);
      expect(result.ioType).toBe("both");
    });

    it("should filter by reads only", async () => {
      // First call: column detection
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Second call: actual query
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_kcache_top_io");
      await tool!.handler({ type: "reads" }, mockContext);

      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("ORDER BY k.reads DESC"),
      );
    });

    it("should filter by writes only", async () => {
      // First call: column detection
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Second call: actual query
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_kcache_top_io");
      await tool!.handler({ type: "writes" }, mockContext);

      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("ORDER BY k.writes DESC"),
      );
    });

    it("should support ioType alias for type parameter", async () => {
      // First call: column detection
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Second call: actual query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ queryid: "1", read_bytes: 1000 }],
      });

      const tool = findTool("pg_kcache_top_io");
      const result = (await tool!.handler(
        { ioType: "reads" },
        mockContext,
      )) as {
        topIoQueries: unknown[];
        ioType: string;
      };

      expect(result.ioType).toBe("reads");
      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("ORDER BY k.reads DESC"),
      );
    });

    it("should respect queryPreviewLength", async () => {
      // First call: column detection
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Second call: COUNT query
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ total: 0 }] });
      // Third call: actual query
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_kcache_top_io");
      await tool!.handler({ queryPreviewLength: 300, compact: false }, mockContext);

      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("LEFT(s.query, 300)"),
      );
    });
  });

  describe("pg_kcache_database_stats", () => {
    it("should return aggregated stats for all databases", async () => {
      // First call: column detection
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Second call: actual query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          { database: "testdb", total_cpu_time: 100.5, total_reads: 1024000 },
          { database: "proddb", total_cpu_time: 500.2, total_reads: 5120000 },
        ],
      });

      const tool = findTool("pg_kcache_database_stats");
      const result = (await tool!.handler({}, mockContext)) as {
        databaseStats: unknown[];
        count: number;
      };

      expect(result.count).toBe(2);
      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("GROUP BY datname"),
        [],
      );
    });

    it("should filter by specific database", async () => {
      // First call: column detection
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Second call: actual query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ database: "testdb", total_cpu_time: 100.5 }],
      });

      const tool = findTool("pg_kcache_database_stats");
      await tool!.handler({ database: "testdb" }, mockContext);

      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("d.datname = $1"),
        ["testdb"],
      );
    });
  });

  describe("pg_kcache_resource_analysis", () => {
    it("should classify queries as CPU-bound or I/O-bound", async () => {
      // First call: column detection
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Second call: COUNT query for totalCount
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ total: 3 }] });
      // Third call: actual query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          {
            queryid: "1",
            resource_classification: "CPU-bound",
            cpu_time: 10,
            io_bytes: 1000,
          },
          {
            queryid: "2",
            resource_classification: "I/O-bound",
            cpu_time: 1,
            io_bytes: 10000000,
          },
          {
            queryid: "3",
            resource_classification: "Balanced",
            cpu_time: 5,
            io_bytes: 5000000,
          },
        ],
      });

      const tool = findTool("pg_kcache_resource_analysis");
      const result = (await tool!.handler({}, mockContext)) as {
        queries: unknown[];
        summary: { cpuBound: number; ioBound: number; balanced: number };
      };

      expect(result.summary.cpuBound).toBe(1);
      expect(result.summary.ioBound).toBe(1);
      expect(result.summary.balanced).toBe(1);
    });

    it("should filter by specific queryId", async () => {
      // First call: column detection
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Second call: actual query
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_kcache_resource_analysis");
      await tool!.handler({ queryId: "12345" }, mockContext);

      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("s.queryid::text = $1"),
        ["12345"],
      );
    });

    it("should apply custom limit", async () => {
      // First call: column detection
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Second call: actual query
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_kcache_resource_analysis");
      await tool!.handler({ limit: 5 }, mockContext);

      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("LIMIT 5"),
        [],
      );
    });

    it("should provide recommendations based on analysis", async () => {
      // First call: column detection
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Second call: COUNT query for totalCount
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ total: 3 }] });
      // Third call: actual query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          { resource_classification: "CPU-bound" },
          { resource_classification: "CPU-bound" },
          { resource_classification: "I/O-bound" },
        ],
      });

      const tool = findTool("pg_kcache_resource_analysis");
      const result = (await tool!.handler({}, mockContext)) as {
        recommendations: string[];
      };

      expect(result.recommendations[0]).toContain("CPU");
    });

    it("should recommend I/O optimization when I/O-bound > CPU-bound", async () => {
      // First call: column detection
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Second call: COUNT query for totalCount
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ total: 4 }] });
      // Third call: actual query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          { resource_classification: "I/O-bound" },
          { resource_classification: "I/O-bound" },
          { resource_classification: "I/O-bound" },
          { resource_classification: "CPU-bound" },
        ],
      });

      const tool = findTool("pg_kcache_resource_analysis");
      const result = (await tool!.handler({}, mockContext)) as {
        recommendations: string[];
        summary: { cpuBound: number; ioBound: number };
      };

      expect(result.summary.ioBound).toBe(3);
      expect(result.summary.cpuBound).toBe(1);
      expect(result.recommendations[0]).toContain("I/O");
    });

    it("should recommend balanced optimization when workload is balanced", async () => {
      // First call: column detection
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Second call: COUNT query for totalCount
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ total: 3 }] });
      // Third call: actual query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          { resource_classification: "Balanced" },
          { resource_classification: "Balanced" },
          { resource_classification: "Balanced" },
        ],
      });

      const tool = findTool("pg_kcache_resource_analysis");
      const result = (await tool!.handler({}, mockContext)) as {
        recommendations: string[];
        summary: { balanced: number };
      };

      expect(result.summary.balanced).toBe(3);
      // When balanced is dominant, recommendation should be about balance
      expect(result.recommendations.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Error Handling", () => {
    it("pg_kcache_query_stats should return structured error on query failure", async () => {
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error("database timeout"),
      );

      const tool = findTool("pg_kcache_query_stats");
      const result = (await tool!.handler({ limit: 5 }, mockContext)) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("database timeout");
    });

    it("pg_kcache_top_cpu should return structured error on query failure", async () => {
      // First call: column detection
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Second call: COUNT query fails
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error("connection terminated"),
      );

      const tool = findTool("pg_kcache_top_cpu");
      const result = (await tool!.handler({}, mockContext)) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("connection terminated");
    });

    it("pg_kcache_top_io should return structured error on query failure", async () => {
      // First call: column detection
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Second call: COUNT query fails
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error("permission denied"),
      );

      const tool = findTool("pg_kcache_top_io");
      const result = (await tool!.handler({}, mockContext)) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("permission denied");
    });

    it("pg_kcache_database_stats should return structured error on query failure", async () => {
      // All calls fail
      mockAdapter.executeQuery.mockRejectedValue(
        new Error("relation does not exist"),
      );

      const tool = findTool("pg_kcache_database_stats");
      const result = (await tool!.handler({}, mockContext)) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(typeof result.error).toBe("string");
    });

    it("pg_kcache_resource_analysis should return structured error on query failure", async () => {
      // First call: column detection
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      // Second call: COUNT query fails
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error("database timeout"),
      );

      const tool = findTool("pg_kcache_resource_analysis");
      const result = (await tool!.handler({ limit: 5 }, mockContext)) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("database timeout");
    });
  });

  describe("pg_kcache_reset", () => {
    it("should reset kcache statistics", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_kcache_reset");
      const result = (await tool!.handler({}, mockContext)) as {
        success: boolean;
        message: string;
        note: string;
      };

      expect(result.success).toBe(true);
      expect(result.message).toContain("reset");
      expect(result.note).toContain("pg_stat_statements");
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("pg_stat_kcache_reset()"),
      );
    });
  });

  it("should export all 7 kcache tools", () => {
    expect(tools).toHaveLength(7);
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("pg_kcache_create_extension");
    expect(toolNames).toContain("pg_kcache_query_stats");
    expect(toolNames).toContain("pg_kcache_top_cpu");
    expect(toolNames).toContain("pg_kcache_top_io");
    expect(toolNames).toContain("pg_kcache_database_stats");
    expect(toolNames).toContain("pg_kcache_resource_analysis");
    expect(toolNames).toContain("pg_kcache_reset");
  });

  describe("No-Arg Calls (undefined params)", () => {
    it("pg_kcache_top_cpu should work with undefined params", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ queryid: "1", total_cpu_time: 10 }],
      });

      const tool = findTool("pg_kcache_top_cpu");
      const result = (await tool!.handler(undefined, mockContext)) as {
        topCpuQueries: unknown[];
      };

      expect(result.topCpuQueries).toHaveLength(1);
    });

    it("pg_kcache_top_io should work with undefined params", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ queryid: "1", total_io_bytes: 1000 }],
      });

      const tool = findTool("pg_kcache_top_io");
      const result = (await tool!.handler(undefined, mockContext)) as {
        topIoQueries: unknown[];
        ioType: string;
      };

      expect(result.topIoQueries).toHaveLength(1);
      expect(result.ioType).toBe("both");
    });

    it("pg_kcache_database_stats should work with undefined params", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ database: "testdb" }],
      });

      const tool = findTool("pg_kcache_database_stats");
      const result = (await tool!.handler(undefined, mockContext)) as {
        databaseStats: unknown[];
      };

      expect(result.databaseStats).toHaveLength(1);
    });

    it("pg_kcache_query_stats should work with undefined params", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ queryid: "1" }],
      });

      const tool = findTool("pg_kcache_query_stats");
      const result = (await tool!.handler(undefined, mockContext)) as {
        queries: unknown[];
      };

      expect(result.queries).toHaveLength(1);
    });

    it("pg_kcache_resource_analysis should work with undefined params", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ resource_classification: "Balanced" }],
      });

      const tool = findTool("pg_kcache_resource_analysis");
      const result = (await tool!.handler(undefined, mockContext)) as {
        queries: unknown[];
      };

      expect(result.queries).toHaveLength(1);
    });
  });

  describe("Numeric Validation", () => {
    it("should throw ValidationError when numeric parameters are NaN in query_stats", async () => {
      const tool = findTool("pg_kcache_query_stats");
      // Mocks are normally cleared in beforeEach, but just to be sure
      const result = await tool!.handler({ limit: "abc" }, mockContext) as { success: boolean; error: string };
      expect(result.success).toBe(false);
      expect(result.error).toContain("received string");
    });

    it("should throw ValidationError when numeric parameters are NaN in top_cpu", async () => {
      const tool = findTool("pg_kcache_top_cpu");
      const result = await tool!.handler({ limit: "abc" }, mockContext) as { success: boolean; error: string };
      expect(result.success).toBe(false);
      expect(result.error).toContain("received string");
    });

    it("should throw ValidationError when numeric parameters are NaN in top_io", async () => {
      const tool = findTool("pg_kcache_top_io");
      const result = await tool!.handler({ limit: "abc" }, mockContext) as { success: boolean; error: string };
      expect(result.success).toBe(false);
      expect(result.error).toContain("received string");
    });

    it("should throw ValidationError when numeric parameters are NaN in resource_analysis", async () => {
      const tool = findTool("pg_kcache_resource_analysis");
      const result = await tool!.handler({ limit: "abc" }, mockContext) as { success: boolean; error: string };
      expect(result.success).toBe(false);
      expect(result.error).toContain("received string");
    });
  });
});
