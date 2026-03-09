/**
 * postgres-mcp - Database Diagnostics Tool Unit Tests
 *
 * Tests for pg_diagnose_database_performance tool covering all
 * diagnostic sections: slow queries, blocking locks, connection
 * pressure, cache hit ratio, disk usage, and top tables.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPerformanceTools } from "../index.js";
import type { PostgresAdapter } from "../../../PostgresAdapter.js";
import type { ToolDefinition } from "../../../../../types/index.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../../__tests__/mocks/index.js";

// Helper to find a tool by name
function findTool(
  tools: ToolDefinition[],
  name: string,
): ToolDefinition {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool;
}

/**
 * Set up mock adapter responses for each parallel diagnostic query.
 * The tool runs 6 diagnostics in parallel via Promise.all:
 *   1. Slow queries (pg_stat_activity)
 *   2. Blocking locks (pg_stat_activity + pg_locks)
 *   3a. Connection pressure by state (pg_stat_activity)
 *   3b. Connection pressure max_connections (SHOW)
 *   4. Cache hit ratio (pg_statio_user_tables)
 *   5. Disk usage (pg_database_size)
 *   6a. Top tables by size
 *   6b. Top tables by activity
 *
 * Since these are Promise.all calls with nested parallel queries,
 * we set up responses for each executeQuery call in order.
 */
function setupHealthyDefaults(
  mockAdapter: ReturnType<typeof createMockPostgresAdapter>,
): void {
  // 1. Slow queries — no slow queries
  mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
  // 2. Blocking locks — no blocked queries
  mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
  // 3a. Connection by state
  mockAdapter.executeQuery.mockResolvedValueOnce({
    rows: [
      { state: "active", count: 5 },
      { state: "idle", count: 10 },
    ],
  });
  // 3b. Max connections
  mockAdapter.executeQuery.mockResolvedValueOnce({
    rows: [{ max_connections: "200" }],
  });
  // 4. Cache hit ratio
  mockAdapter.executeQuery.mockResolvedValueOnce({
    rows: [{ heap_read: 100, heap_hit: 99900, ratio: 99.9 }],
  });
  // 5. Disk usage
  mockAdapter.executeQuery.mockResolvedValueOnce({
    rows: [{ total_bytes: 1073741824, total_size: "1 GB" }],
  });
  // 6a. Top tables by size
  mockAdapter.executeQuery.mockResolvedValueOnce({
    rows: [
      {
        schema: "public",
        table: "users",
        total_bytes: 104857600,
        total_size: "100 MB",
        estimated_rows: 50000,
      },
    ],
  });
  // 6b. Top tables by activity
  mockAdapter.executeQuery.mockResolvedValueOnce({
    rows: [
      {
        schema: "public",
        table: "users",
        total_scans: 5000,
        seq_scan: 100,
        idx_scan: 4900,
        inserts: 1000,
        updates: 500,
        deletes: 200,
        dead_tuples: 50,
      },
    ],
  });
}

describe("pg_diagnose_database_performance", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ToolDefinition[];
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return healthy status for a clean database", async () => {
    setupHealthyDefaults(mockAdapter);

    const tool = findTool(tools, "pg_diagnose_database_performance");
    const result = (await tool.handler({}, mockContext)) as {
      sections: Record<string, unknown>;
      overallScore: number;
      overallStatus: string;
      totalRecommendations: number;
      allRecommendations: string[];
    };

    expect(result.overallStatus).toBe("healthy");
    expect(result.overallScore).toBeGreaterThanOrEqual(90);
    expect(result.totalRecommendations).toBe(0);
    expect(result.sections.slowQueries).toBeDefined();
    expect(result.sections.blockingLocks).toBeDefined();
    expect(result.sections.connectionPressure).toBeDefined();
    expect(result.sections.cacheHitRatio).toBeDefined();
    expect(result.sections.diskUsage).toBeDefined();
    expect(result.sections.topTables).toBeDefined();
  });

  it("should detect multiple slow queries and recommend review", async () => {
    // 6 slow queries → >5 recommendation
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: Array.from({ length: 6 }, (_, i) => ({
        pid: i + 1,
        usename: "user",
        datname: "mydb",
        state: "active",
        duration: "00:05:00",
        query_preview: `SELECT * FROM table_${String(i)}`,
        wait_event_type: null,
        wait_event: null,
      })),
    });
    // Rest healthy
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 10 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "200" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ heap_read: 100, heap_hit: 99900, ratio: 99.9 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total_bytes: 1073741824, total_size: "1 GB" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_diagnose_database_performance");
    const result = (await tool.handler({}, mockContext)) as {
      allRecommendations: string[];
      sections: {
        slowQueries: { status: string; recommendations: string[] };
      };
    };

    expect(result.sections.slowQueries.status).not.toBe("healthy");
    expect(
      result.allRecommendations.some((r) => r.includes("review query plans")),
    ).toBe(true);
  });

  it("should detect 10+ slow queries and recommend index check", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: Array.from({ length: 11 }, (_, i) => ({
        pid: i + 1,
        usename: "user",
        datname: "mydb",
        state: "active",
        duration: "00:05:00",
        query_preview: `SELECT * FROM table_${String(i)}`,
        wait_event_type: null,
        wait_event: null,
      })),
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 15 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "200" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ heap_read: 100, heap_hit: 99900, ratio: 99.9 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total_bytes: 1073741824, total_size: "1 GB" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_diagnose_database_performance");
    const result = (await tool.handler({}, mockContext)) as {
      allRecommendations: string[];
    };

    expect(
      result.allRecommendations.some((r) => r.includes("missing indexes")),
    ).toBe(true);
  });

  it("should detect blocking locks", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // 4 blocked queries
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: Array.from({ length: 4 }, (_, i) => ({
        blocked_pid: i + 100,
        blocked_user: "user",
        blocked_query: "UPDATE t SET x = 1",
        blocking_pid: i + 200,
        blocking_user: "other_user",
        blocking_query: "DELETE FROM t",
        wait_event_type: "Lock",
      })),
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 10 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "200" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ heap_read: 100, heap_hit: 99900, ratio: 99.9 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total_bytes: 1073741824, total_size: "1 GB" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_diagnose_database_performance");
    const result = (await tool.handler({}, mockContext)) as {
      allRecommendations: string[];
      sections: {
        blockingLocks: { status: string; data: { count: number } };
      };
    };

    expect(result.sections.blockingLocks.data.count).toBe(4);
    expect(result.sections.blockingLocks.status).not.toBe("healthy");
    expect(
      result.allRecommendations.some((r) =>
        r.includes("shorter transactions"),
      ),
    ).toBe(true);
  });

  it("should detect high connection pressure (>80%)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // 170 out of 200 = 85%
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 170 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "200" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ heap_read: 100, heap_hit: 99900, ratio: 99.9 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total_bytes: 1073741824, total_size: "1 GB" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_diagnose_database_performance");
    const result = (await tool.handler({}, mockContext)) as {
      allRecommendations: string[];
      sections: {
        connectionPressure: {
          status: string;
          data: { usagePercent: number };
        };
      };
    };

    expect(result.sections.connectionPressure.data.usagePercent).toBe(85);
    expect(
      result.allRecommendations.some((r) => r.includes("capacity")),
    ).toBe(true);
  });

  it("should detect critical connection pressure (>90%)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // 190 out of 200 = 95%
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 190 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "200" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ heap_read: 100, heap_hit: 99900, ratio: 99.9 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total_bytes: 1073741824, total_size: "1 GB" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_diagnose_database_performance");
    const result = (await tool.handler({}, mockContext)) as {
      allRecommendations: string[];
      sections: {
        connectionPressure: { status: string };
      };
    };

    expect(result.sections.connectionPressure.status).toBe("critical");
    expect(
      result.allRecommendations.some((r) => r.includes("PgBouncer")),
    ).toBe(true);
  });

  it("should detect poor cache hit ratio (<95%)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 10 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "200" }],
    });
    // Poor cache hit ratio: 90%
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ heap_read: 10000, heap_hit: 90000, ratio: 90.0 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total_bytes: 1073741824, total_size: "1 GB" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_diagnose_database_performance");
    const result = (await tool.handler({}, mockContext)) as {
      allRecommendations: string[];
      sections: {
        cacheHitRatio: { status: string; data: { ratio: number } };
      };
    };

    expect(result.sections.cacheHitRatio.data.ratio).toBe(90);
    expect(result.sections.cacheHitRatio.status).toBe("critical");
    expect(
      result.allRecommendations.some((r) =>
        r.includes("shared_buffers"),
      ),
    ).toBe(true);
    expect(
      result.allRecommendations.some((r) =>
        r.includes("sequential scans"),
      ),
    ).toBe(true);
  });

  it("should handle null cache hit ratio gracefully", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 5 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "200" }],
    });
    // No data → null ratio
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ heap_read: 0, heap_hit: 0, ratio: null }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total_bytes: 0, total_size: "0 bytes" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_diagnose_database_performance");
    const result = (await tool.handler({}, mockContext)) as {
      sections: {
        cacheHitRatio: { status: string; data: { ratio: number | null } };
      };
    };

    expect(result.sections.cacheHitRatio.data.ratio).toBeNull();
    expect(result.sections.cacheHitRatio.status).toBe("healthy");
  });

  it("should report disk usage (informational, always healthy)", async () => {
    setupHealthyDefaults(mockAdapter);

    const tool = findTool(tools, "pg_diagnose_database_performance");
    const result = (await tool.handler({}, mockContext)) as {
      sections: {
        diskUsage: {
          status: string;
          data: { totalBytes: number; totalSize: string };
        };
      };
    };

    expect(result.sections.diskUsage.status).toBe("healthy");
    expect(result.sections.diskUsage.data.totalBytes).toBe(1073741824);
    expect(result.sections.diskUsage.data.totalSize).toBe("1 GB");
  });

  it("should detect high dead tuple ratio in top tables", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 5 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "200" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ heap_read: 100, heap_hit: 99900, ratio: 99.9 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total_bytes: 1073741824, total_size: "1 GB" }],
    });
    // Top by size
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table: "bloated",
          total_bytes: 524288000,
          total_size: "500 MB",
          estimated_rows: 100000,
        },
      ],
    });
    // Top by activity — high dead tuples compared to inserts
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table: "bloated",
          total_scans: 10000,
          seq_scan: 100,
          idx_scan: 9900,
          inserts: 10000,
          updates: 5000,
          deletes: 3000,
          dead_tuples: 50000, // 50000 dead vs 10000 inserts → ratio > 0.5
        },
      ],
    });

    const tool = findTool(tools, "pg_diagnose_database_performance");
    const result = (await tool.handler({}, mockContext)) as {
      allRecommendations: string[];
      sections: {
        topTables: { status: string };
      };
    };

    expect(result.sections.topTables.status).toBe("warning");
    expect(
      result.allRecommendations.some((r) => r.includes("pg_vacuum_analyze")),
    ).toBe(true);
  });

  it("should detect seq scan dominance in top tables", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 5 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "200" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ heap_read: 100, heap_hit: 99900, ratio: 99.9 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total_bytes: 1073741824, total_size: "1 GB" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Table with >1000 seq scans and 0 idx scans
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table: "unindexed",
          total_scans: 5000,
          seq_scan: 5000,
          idx_scan: 0,
          inserts: 100,
          updates: 50,
          deletes: 10,
          dead_tuples: 20,
        },
      ],
    });

    const tool = findTool(tools, "pg_diagnose_database_performance");
    const result = (await tool.handler({}, mockContext)) as {
      allRecommendations: string[];
    };

    expect(
      result.allRecommendations.some((r) => r.includes("add indexes")),
    ).toBe(true);
  });

  it("should pass schema filter to top tables", async () => {
    setupHealthyDefaults(mockAdapter);

    const tool = findTool(tools, "pg_diagnose_database_performance");
    await tool.handler({ schema: "sales" }, mockContext);

    // The top tables queries (calls 6 and 7, 0-indexed) should contain the schema filter
    const sizeQuery = mockAdapter.executeQuery.mock.calls[6]?.[0] as string;
    const activityQuery = mockAdapter.executeQuery.mock.calls[7]?.[0] as string;
    expect(sizeQuery).toContain("schemaname = 'sales'");
    expect(activityQuery).toContain("schemaname = 'sales'");
  });

  it("should accept custom topN parameter", async () => {
    setupHealthyDefaults(mockAdapter);

    const tool = findTool(tools, "pg_diagnose_database_performance");
    await tool.handler({ topN: 5 }, mockContext);

    // The top tables queries should use LIMIT 5
    const sizeQuery = mockAdapter.executeQuery.mock.calls[6]?.[0] as string;
    expect(sizeQuery).toContain("LIMIT 5");
  });

  it("should calculate overall score as weighted average of section scores", async () => {
    // Make all sections unhealthy to verify overall critical status
    // 6 slow queries → warning
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: Array.from({ length: 6 }, (_, i) => ({
        pid: i + 1,
        usename: "user",
        datname: "mydb",
        state: "active",
        duration: "00:05:00",
        query_preview: `SELECT * FROM table_${String(i)}`,
        wait_event_type: null,
        wait_event: null,
      })),
    });
    // 5 blocked queries → critical
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: Array.from({ length: 5 }, (_, i) => ({
        blocked_pid: i + 100,
        blocked_user: "user",
        blocked_query: "SELECT",
        blocking_pid: i + 200,
        blocking_user: "other",
        blocking_query: "DELETE",
        wait_event_type: "Lock",
      })),
    });
    // 95% connection usage → critical
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 190 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "200" }],
    });
    // Poor cache hit ratio → critical
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ heap_read: 50000, heap_hit: 50000, ratio: 50.0 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total_bytes: 1073741824, total_size: "1 GB" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_diagnose_database_performance");
    const result = (await tool.handler({}, mockContext)) as {
      overallScore: number;
      overallStatus: string;
    };

    expect(result.overallStatus).toBe("critical");
    expect(result.overallScore).toBeLessThan(60);
  });

  it("should calculate warning overall status for mixed health", async () => {
    // 3 slow queries → warning
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: Array.from({ length: 3 }, (_, i) => ({
        pid: i + 1,
        usename: "user",
        datname: "mydb",
        state: "active",
        duration: "00:05:00",
        query_preview: `SELECT * FROM table_${String(i)}`,
        wait_event_type: null,
        wait_event: null,
      })),
    });
    // No blocks → healthy
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // connections: 75% → warning
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 150 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "200" }],
    });
    // Good cache → healthy
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ heap_read: 100, heap_hit: 99900, ratio: 99.9 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total_bytes: 1073741824, total_size: "1 GB" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_diagnose_database_performance");
    const result = (await tool.handler({}, mockContext)) as {
      overallScore: number;
      overallStatus: string;
    };

    // Mix of healthy + warning → score between 60-89
    expect(result.overallStatus).toBe("warning");
    expect(result.overallScore).toBeGreaterThanOrEqual(60);
    expect(result.overallScore).toBeLessThan(90);
  });

  it("should handle maxConnections = 0 without division by zero", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 5 }],
    });
    // max_connections = 0
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "0" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ heap_read: 100, heap_hit: 99900, ratio: 99.9 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total_bytes: 0, total_size: "0 bytes" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_diagnose_database_performance");
    const result = (await tool.handler({}, mockContext)) as {
      sections: {
        connectionPressure: {
          data: { usagePercent: number };
        };
      };
    };

    expect(result.sections.connectionPressure.data.usagePercent).toBe(0);
  });

  it("should handle disk usage with non-string total_size", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 5 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "200" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ heap_read: 100, heap_hit: 99900, ratio: 99.9 }],
    });
    // total_size is null/number instead of string
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total_bytes: 0, total_size: null }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_diagnose_database_performance");
    const result = (await tool.handler({}, mockContext)) as {
      sections: {
        diskUsage: { data: { totalSize: string } };
      };
    };

    expect(result.sections.diskUsage.data.totalSize).toBe("0 bytes");
  });

  it("should handle empty pg_statio result", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 5 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "200" }],
    });
    // Empty result → defaults
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total_bytes: 1073741824, total_size: "1 GB" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_diagnose_database_performance");
    const result = (await tool.handler({}, mockContext)) as {
      sections: {
        cacheHitRatio: { data: { heapRead: number; heapHit: number } };
      };
    };

    expect(result.sections.cacheHitRatio.data.heapRead).toBe(0);
    expect(result.sections.cacheHitRatio.data.heapHit).toBe(0);
  });

  it("should handle adapter error gracefully", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("connection refused"),
    );

    const tool = findTool(tools, "pg_diagnose_database_performance");
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should handle cache hit ratio below 99 but above 95", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 5 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "200" }],
    });
    // 97% cache hit → warning, not critical
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ heap_read: 3000, heap_hit: 97000, ratio: 97.0 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total_bytes: 1073741824, total_size: "1 GB" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_diagnose_database_performance");
    const result = (await tool.handler({}, mockContext)) as {
      sections: {
        cacheHitRatio: { status: string; recommendations: string[] };
      };
    };

    expect(result.sections.cacheHitRatio.status).toBe("warning");
    expect(result.sections.cacheHitRatio.recommendations).toHaveLength(1);
    expect(
      result.sections.cacheHitRatio.recommendations[0],
    ).toContain("shared_buffers");
  });

  it("should handle schema escaping in top tables filter", async () => {
    setupHealthyDefaults(mockAdapter);

    const tool = findTool(tools, "pg_diagnose_database_performance");
    await tool.handler({ schema: "test'schema" }, mockContext);

    const sizeQuery = mockAdapter.executeQuery.mock.calls[6]?.[0] as string;
    expect(sizeQuery).toContain("test''schema");
  });
});
