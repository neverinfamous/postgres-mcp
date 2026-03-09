/**
 * postgres-mcp - Anomaly Detection Tools Unit Tests
 *
 * Tests for pg_detect_query_anomalies, pg_detect_bloat_risk,
 * and pg_detect_connection_spike tools.
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
function findTool(tools: ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool;
}

describe("pg_detect_query_anomalies", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ToolDefinition[];
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should detect anomalous queries with z-score analysis", async () => {
    // Extension exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ 1: 1 }],
    });
    // Total count
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 50 }],
    });
    // Anomalous queries
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          query_preview: "SELECT * FROM big_table",
          calls: 100,
          mean_exec_time_ms: 500.123,
          stddev_exec_time_ms: 50.456,
          z_score: 9.91,
          total_exec_time_ms: 50012.3,
          rows: 10000,
        },
        {
          query_preview: "UPDATE users SET ...",
          calls: 50,
          mean_exec_time_ms: 200.5,
          stddev_exec_time_ms: 30.2,
          z_score: 6.64,
          total_exec_time_ms: 10025.0,
          rows: 5000,
        },
      ],
    });

    const tool = findTool(tools, "pg_detect_query_anomalies");
    const result = (await tool.handler({}, mockContext)) as {
      anomalies: { queryPreview: string; zScore: number }[];
      riskLevel: string;
      totalAnalyzed: number;
      anomalyCount: number;
      summary: string;
    };

    expect(result.anomalies).toHaveLength(2);
    expect(result.anomalyCount).toBe(2);
    expect(result.totalAnalyzed).toBe(50);
    expect(result.anomalies[0]?.queryPreview).toBe("SELECT * FROM big_table");
    expect(result.anomalies[0]?.zScore).toBe(9.91);
    expect(result.summary).toContain("2 anomalous queries");
  });

  it("should return no anomalies for clean database", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ 1: 1 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 30 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_detect_query_anomalies");
    const result = (await tool.handler({}, mockContext)) as {
      anomalies: unknown[];
      riskLevel: string;
      anomalyCount: number;
      summary: string;
    };

    expect(result.anomalies).toHaveLength(0);
    expect(result.anomalyCount).toBe(0);
    expect(result.riskLevel).toBe("low");
    expect(result.summary).toContain("No query anomalies");
  });

  it("should return error when pg_stat_statements not installed", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_detect_query_anomalies");
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
      suggestion: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("pg_stat_statements");
    expect(result.suggestion).toContain("pg_diagnose_database_performance");
  });

  it("should accept custom threshold and minCalls", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ 1: 1 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 10 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_detect_query_anomalies");
    await tool.handler({ threshold: 3.0, minCalls: 50 }, mockContext);

    // Verify threshold and minCalls are used in the query
    const countQuery = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
    expect(countQuery).toContain("50");
    const mainQuery = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(mainQuery).toContain("3");
  });

  it("should clamp threshold and minCalls to valid ranges", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ 1: 1 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 5 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_detect_query_anomalies");
    // Extreme values that should be clamped
    await tool.handler({ threshold: 0.1, minCalls: -5 }, mockContext);

    // threshold clamped to 0.5, minCalls clamped to 1
    const countQuery = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
    expect(countQuery).toContain("1");
  });

  it("should calculate critical risk for many anomalies with high z-scores", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ 1: 1 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 100 }],
    });
    // 12 anomalies with high z-score → anomalyCount >= 10 (+40) and maxZScore >= 10 (+50) = 90 → critical
    const anomalies = Array.from({ length: 12 }, (_, i) => ({
      query_preview: `Query ${String(i)}`,
      calls: 100,
      mean_exec_time_ms: 1000,
      stddev_exec_time_ms: 50,
      z_score: 15.5,
      total_exec_time_ms: 100000,
      rows: 50000,
    }));
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: anomalies });

    const tool = findTool(tools, "pg_detect_query_anomalies");
    const result = (await tool.handler({}, mockContext)) as {
      riskLevel: string;
      anomalyCount: number;
    };

    expect(result.riskLevel).toBe("critical");
    expect(result.anomalyCount).toBe(12);
  });

  it("should calculate high risk for moderate anomaly count with high z-scores", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ 1: 1 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 50 }],
    });
    // 6 anomalies (+25) with z-score >= 5 (+30) = 55 → moderate
    // Adjust: 6 anomalies (+25) with z-score >= 10 (+50) = 75 → high
    const anomalies = Array.from({ length: 6 }, (_, i) => ({
      query_preview: `Query ${String(i)}`,
      calls: 50,
      mean_exec_time_ms: 500,
      stddev_exec_time_ms: 40,
      z_score: 12.5,
      total_exec_time_ms: 25000,
      rows: 5000,
    }));
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: anomalies });

    const tool = findTool(tools, "pg_detect_query_anomalies");
    const result = (await tool.handler({}, mockContext)) as {
      riskLevel: string;
    };

    expect(result.riskLevel).toBe("high");
  });

  it("should calculate moderate risk for small anomaly count with moderate z-scores", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ 1: 1 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 50 }],
    });
    // 6 anomalies (+25) with z-score >= 5 (+30) = 55 → moderate
    const anomalies = Array.from({ length: 6 }, (_, i) => ({
      query_preview: `Query ${String(i)}`,
      calls: 30,
      mean_exec_time_ms: 200,
      stddev_exec_time_ms: 30,
      z_score: 6.5,
      total_exec_time_ms: 6000,
      rows: 2000,
    }));
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: anomalies });

    const tool = findTool(tools, "pg_detect_query_anomalies");
    const result = (await tool.handler({}, mockContext)) as {
      riskLevel: string;
    };

    expect(result.riskLevel).toBe("moderate");
  });

  it("should handle adapter error gracefully", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("connection refused"),
    );

    const tool = findTool(tools, "pg_detect_query_anomalies");
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should handle null/undefined values in query results", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ 1: 1 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: null }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          query_preview: null,
          calls: null,
          mean_exec_time_ms: undefined,
          stddev_exec_time_ms: null,
          z_score: null,
          total_exec_time_ms: null,
          rows: null,
        },
      ],
    });

    const tool = findTool(tools, "pg_detect_query_anomalies");
    const result = (await tool.handler({}, mockContext)) as {
      anomalies: { queryPreview: string; calls: number }[];
      totalAnalyzed: number;
    };

    expect(result.totalAnalyzed).toBe(0);
    expect(result.anomalies[0]?.queryPreview).toBe("");
    expect(result.anomalies[0]?.calls).toBe(0);
  });
});

describe("pg_detect_bloat_risk", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ToolDefinition[];
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should analyze bloat risk for tables", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "orders",
          live_tuples: 100000,
          dead_tuples: 50000,
          dead_pct: 33.33,
          total_size: "500 MB",
          total_bytes: 524288000,
          last_vacuum: null,
          last_autovacuum: null,
          last_analyze: null,
          last_autoanalyze: null,
          vacuum_count: 0,
          autovacuum_count: 0,
          autoanalyze_count: 0,
          seconds_since_vacuum: 0,
        },
      ],
    });

    const tool = findTool(tools, "pg_detect_bloat_risk");
    const result = (await tool.handler({}, mockContext)) as {
      tables: {
        schema: string;
        tableName: string;
        riskScore: number;
        riskLevel: string;
        factors: {
          deadTupleRatio: number;
          vacuumStaleness: number;
          tableSizeImpact: number;
          autovacuumEffectiveness: number;
        };
        recommendations: string[];
      }[];
      highRiskCount: number;
      totalAnalyzed: number;
      summary: string;
    };

    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]?.schema).toBe("public");
    expect(result.tables[0]?.tableName).toBe("orders");
    expect(result.tables[0]?.riskScore).toBeGreaterThan(0);
    expect(result.tables[0]?.factors).toBeDefined();
    expect(result.totalAnalyzed).toBe(1);
  });

  it("should filter by schema when specified", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_detect_bloat_risk");
    await tool.handler({ schema: "sales" }, mockContext);

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain("schemaname = 'sales'");
  });

  it("should exclude system schemas by default", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_detect_bloat_risk");
    await tool.handler({}, mockContext);

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain("pg_catalog");
    expect(sql).toContain("information_schema");
  });

  it("should clamp minRows to valid range", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_detect_bloat_risk");
    await tool.handler({ minRows: -100 }, mockContext);

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain("0"); // clamped to 0
  });

  it("should calculate high risk for table with severe bloat", async () => {
    // Table with: >50% dead tuples, never vacuumed with dead tuples, >1GB, autovacuum never ran
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "bloated_table",
          live_tuples: 50000,
          dead_tuples: 60000,
          dead_pct: 54.55,
          total_size: "2 GB",
          total_bytes: 2147483648,
          last_vacuum: null,
          last_autovacuum: null,
          last_analyze: null,
          last_autoanalyze: null,
          vacuum_count: 0,
          autovacuum_count: 0,
          autoanalyze_count: 0,
          seconds_since_vacuum: 0,
        },
      ],
    });

    const tool = findTool(tools, "pg_detect_bloat_risk");
    const result = (await tool.handler({}, mockContext)) as {
      tables: {
        riskScore: number;
        riskLevel: string;
        recommendations: string[];
      }[];
      highRiskCount: number;
      summary: string;
    };

    // deadTupleScore: 100 * 0.35 = 35
    // vacuumStaleness: 80 * 0.25 = 20 (never vacuumed but has dead tuples)
    // sizeScore: 70 * 0.15 = 10.5 (>1GB)
    // autovacuumScore: 90 * 0.25 = 22.5 (autovacuum never ran but has dead tuples)
    // Total: ~88 → critical
    expect(result.tables[0]?.riskLevel).toBe("critical");
    expect(result.highRiskCount).toBe(1);
    expect(result.summary).toContain("high bloat risk");
    expect(result.tables[0]?.recommendations.length).toBeGreaterThan(0);
  });

  it("should report no high risk for clean tables", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "clean_table",
          live_tuples: 100000,
          dead_tuples: 100,
          dead_pct: 0.1,
          total_size: "50 MB",
          total_bytes: 52428800,
          last_vacuum: "2026-03-09T00:00:00Z",
          last_autovacuum: "2026-03-09T01:00:00Z",
          last_analyze: "2026-03-09T00:00:00Z",
          last_autoanalyze: "2026-03-09T01:00:00Z",
          vacuum_count: 10,
          autovacuum_count: 50,
          autoanalyze_count: 50,
          seconds_since_vacuum: 3600,
        },
      ],
    });

    const tool = findTool(tools, "pg_detect_bloat_risk");
    const result = (await tool.handler({}, mockContext)) as {
      highRiskCount: number;
      summary: string;
    };

    expect(result.highRiskCount).toBe(0);
    expect(result.summary).toContain("No high-risk bloat");
  });

  it("should generate recommendation for stale vacuum (>72h)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "stale_table",
          live_tuples: 50000,
          dead_tuples: 10000,
          dead_pct: 16.67,
          total_size: "100 MB",
          total_bytes: 104857600,
          last_vacuum: null,
          last_autovacuum: null,
          last_analyze: null,
          last_autoanalyze: null,
          vacuum_count: 1,
          autovacuum_count: 1,
          autoanalyze_count: 1,
          seconds_since_vacuum: 345600, // 96 hours
        },
      ],
    });

    const tool = findTool(tools, "pg_detect_bloat_risk");
    const result = (await tool.handler({}, mockContext)) as {
      tables: { recommendations: string[] }[];
    };

    const recs = result.tables[0]?.recommendations ?? [];
    expect(recs.some((r) => r.includes("VACUUM ANALYZE"))).toBe(true);
    expect(recs.some((r) => r.includes("ago"))).toBe(true);
  });

  it("should generate recommendation for autoanalyze never ran on large table", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "unanalyzed",
          live_tuples: 50000,
          dead_tuples: 200,
          dead_pct: 0.4,
          total_size: "100 MB",
          total_bytes: 104857600,
          last_vacuum: null,
          last_autovacuum: null,
          last_analyze: null,
          last_autoanalyze: null,
          vacuum_count: 1,
          autovacuum_count: 1,
          autoanalyze_count: 0,
          seconds_since_vacuum: 7200,
        },
      ],
    });

    const tool = findTool(tools, "pg_detect_bloat_risk");
    const result = (await tool.handler({}, mockContext)) as {
      tables: { factors: { autovacuumEffectiveness: number } }[];
    };

    // autoanalyze_count === 0 && liveTuples > 10000 → autovacuumScore = 60
    expect(result.tables[0]?.factors.autovacuumEffectiveness).toBeGreaterThan(
      0,
    );
  });

  it("should calculate size factor for very large tables (>10GB)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "huge_table",
          live_tuples: 1000000,
          dead_tuples: 5000,
          dead_pct: 0.5,
          total_size: "15 GB",
          total_bytes: 16106127360, // ~15 GB
          last_vacuum: null,
          last_autovacuum: null,
          last_analyze: null,
          last_autoanalyze: null,
          vacuum_count: 5,
          autovacuum_count: 10,
          autoanalyze_count: 10,
          seconds_since_vacuum: 3600,
        },
      ],
    });

    const tool = findTool(tools, "pg_detect_bloat_risk");
    const result = (await tool.handler({}, mockContext)) as {
      tables: { factors: { tableSizeImpact: number } }[];
    };

    // >10GB → sizeScore = 100, * 0.15 = 15
    expect(result.tables[0]?.factors.tableSizeImpact).toBe(15);
  });

  it("should sort tables by risk score descending", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "low_risk",
          live_tuples: 100000,
          dead_tuples: 100,
          dead_pct: 0.1,
          total_size: "10 MB",
          total_bytes: 10485760,
          last_vacuum: null,
          last_autovacuum: null,
          vacuum_count: 5,
          autovacuum_count: 10,
          autoanalyze_count: 10,
          seconds_since_vacuum: 3600,
        },
        {
          schema: "public",
          table_name: "high_risk",
          live_tuples: 50000,
          dead_tuples: 60000,
          dead_pct: 54.55,
          total_size: "500 MB",
          total_bytes: 524288000,
          last_vacuum: null,
          last_autovacuum: null,
          vacuum_count: 0,
          autovacuum_count: 0,
          autoanalyze_count: 0,
          seconds_since_vacuum: 0,
        },
      ],
    });

    const tool = findTool(tools, "pg_detect_bloat_risk");
    const result = (await tool.handler({}, mockContext)) as {
      tables: { tableName: string; riskScore: number }[];
    };

    expect(result.tables[0]?.tableName).toBe("high_risk");
    expect(result.tables[0]?.riskScore).toBeGreaterThan(
      result.tables[1]?.riskScore ?? 0,
    );
  });

  it("should escape single quotes in schema name", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_detect_bloat_risk");
    await tool.handler({ schema: "test'schema" }, mockContext);

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain("test''schema");
  });

  it("should handle adapter error gracefully", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("connection timeout"),
    );

    const tool = findTool(tools, "pg_detect_bloat_risk");
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("pg_detect_connection_spike", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ToolDefinition[];
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should analyze connection patterns with no warnings", async () => {
    // By state
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { state: "active", count: 5 },
        { state: "idle", count: 10 },
      ],
    });
    // By user
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { usename: "app_user", count: 10 },
        { usename: "admin", count: 5 },
      ],
    });
    // By application
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { app_name: "web_app", count: 8 },
        { app_name: "worker", count: 7 },
      ],
    });
    // Max connections
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "100" }],
    });
    // Idle-in-transaction
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_detect_connection_spike");
    const result = (await tool.handler({}, mockContext)) as {
      totalConnections: number;
      maxConnections: number;
      usagePercent: number;
      byState: { state: string; count: number }[];
      concentrations: unknown[];
      warnings: string[];
      riskLevel: string;
      summary: string;
    };

    expect(result.totalConnections).toBe(15);
    expect(result.maxConnections).toBe(100);
    expect(result.usagePercent).toBe(15);
    expect(result.byState).toHaveLength(2);
    expect(result.warnings).toHaveLength(0);
    expect(result.riskLevel).toBe("low");
    expect(result.summary).toContain("No connection anomalies");
  });

  it("should detect user concentration above threshold", async () => {
    // By state
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 10 }],
    });
    // By user — one user holds 80% of connections (>70% default)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { usename: "monopolizer", count: 8 },
        { usename: "normal_user", count: 2 },
      ],
    });
    // By application
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ app_name: "app", count: 10 }],
    });
    // Max connections
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "100" }],
    });
    // Idle-in-transaction
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_detect_connection_spike");
    const result = (await tool.handler({}, mockContext)) as {
      concentrations: { dimension: string; value: string; percent: number }[];
      warnings: string[];
    };

    expect(result.concentrations.length).toBeGreaterThanOrEqual(1);
    expect(result.concentrations[0]?.dimension).toBe("user");
    expect(result.concentrations[0]?.value).toBe("monopolizer");
    expect(result.warnings.some((w) => w.includes("monopolizer"))).toBe(true);
  });

  it("should detect application concentration above threshold", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 10 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { usename: "user1", count: 5 },
        { usename: "user2", count: 5 },
      ],
    });
    // One application holds 80% of connections
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { app_name: "heavy_app", count: 8 },
        { app_name: "light_app", count: 2 },
      ],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "100" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_detect_connection_spike");
    const result = (await tool.handler({}, mockContext)) as {
      concentrations: { dimension: string; value: string }[];
      warnings: string[];
    };

    expect(
      result.concentrations.some((c) => c.dimension === "application"),
    ).toBe(true);
    expect(result.warnings.some((w) => w.includes("heavy_app"))).toBe(true);
  });

  it("should skip empty application names in concentration", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 5 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ usename: "user1", count: 5 }],
    });
    // Empty app name holds 100% of connections but should be skipped
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ app_name: "", count: 5 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "100" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_detect_connection_spike");
    const result = (await tool.handler({}, mockContext)) as {
      concentrations: { dimension: string }[];
    };

    expect(
      result.concentrations.filter((c) => c.dimension === "application"),
    ).toHaveLength(0);
  });

  it("should detect idle-in-transaction connections >5 minutes", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "idle in transaction", count: 3 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ usename: "user1", count: 3 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ app_name: "app", count: 3 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "100" }],
    });
    // 2 connections idle > 5 minutes
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          pid: 1,
          usename: "user1",
          app_name: "app",
          idle_duration: "00:10:00",
          idle_seconds: 600,
        },
        {
          pid: 2,
          usename: "user1",
          app_name: "app",
          idle_duration: "00:08:00",
          idle_seconds: 480,
        },
        {
          pid: 3,
          usename: "user1",
          app_name: "app",
          idle_duration: "00:02:00",
          idle_seconds: 120,
        },
      ],
    });

    const tool = findTool(tools, "pg_detect_connection_spike");
    const result = (await tool.handler({}, mockContext)) as {
      warnings: string[];
    };

    expect(result.warnings.some((w) => w.includes(">5 minutes"))).toBe(true);
  });

  it("should warn about >=5 total idle-in-transaction connections", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "idle in transaction", count: 6 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ usename: "user1", count: 6 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ app_name: "app", count: 6 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "100" }],
    });
    // 6 idle-in-transaction connections (all short)
    const idleRows = Array.from({ length: 6 }, (_, i) => ({
      pid: i + 1,
      usename: "user1",
      app_name: "app",
      idle_duration: "00:01:00",
      idle_seconds: 60,
    }));
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: idleRows });

    const tool = findTool(tools, "pg_detect_connection_spike");
    const result = (await tool.handler({}, mockContext)) as {
      warnings: string[];
    };

    expect(result.warnings.some((w) => w.includes("idle-in-transaction"))).toBe(
      true,
    );
  });

  it("should detect critical connection pressure (>=90%)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 95 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ usename: "user1", count: 95 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ app_name: "app", count: 95 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "100" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_detect_connection_spike");
    const result = (await tool.handler({}, mockContext)) as {
      usagePercent: number;
      warnings: string[];
      riskLevel: string;
    };

    expect(result.usagePercent).toBe(95);
    expect(result.warnings.some((w) => w.includes("Critical"))).toBe(true);
  });

  it("should detect high connection pressure (>=80%)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 85 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ usename: "user1", count: 85 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ app_name: "app", count: 85 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "100" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_detect_connection_spike");
    const result = (await tool.handler({}, mockContext)) as {
      usagePercent: number;
      warnings: string[];
    };

    expect(result.usagePercent).toBe(85);
    expect(result.warnings.some((w) => w.includes("High"))).toBe(true);
  });

  it("should accept custom warningPercent", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 10 }],
    });
    // User holds 60% — below default 70% but above custom 50%
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { usename: "monopolizer", count: 6 },
        { usename: "other", count: 4 },
      ],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ app_name: "app", count: 10 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "100" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_detect_connection_spike");
    const result = (await tool.handler(
      { warningPercent: 50 },
      mockContext,
    )) as {
      concentrations: { dimension: string }[];
    };

    expect(result.concentrations.length).toBeGreaterThanOrEqual(1);
  });

  it("should calculate risk level correctly for combined factors", async () => {
    // 92% usage (+40), 2 concentrations (+30), 6 idle-in-tx (+25) = 95 → critical
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 92 }],
    });
    // Two users above threshold
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { usename: "user1", count: 70 },
        { usename: "user2", count: 22 },
      ],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ app_name: "app", count: 92 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "100" }],
    });
    const idleRows = Array.from({ length: 6 }, (_, i) => ({
      pid: i + 1,
      usename: "user1",
      app_name: "app",
      idle_duration: "00:01:00",
      idle_seconds: 60,
    }));
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: idleRows });

    const tool = findTool(tools, "pg_detect_connection_spike");
    const result = (await tool.handler({}, mockContext)) as {
      riskLevel: string;
    };

    expect(result.riskLevel).toBe("critical");
  });

  it("should handle maxConnections = 0 gracefully", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ state: "active", count: 5 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ usename: "user1", count: 5 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ app_name: "app", count: 5 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ max_connections: "0" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool(tools, "pg_detect_connection_spike");
    const result = (await tool.handler({}, mockContext)) as {
      usagePercent: number;
    };

    expect(result.usagePercent).toBe(0);
  });

  it("should handle adapter error gracefully", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("connection refused"),
    );

    const tool = findTool(tools, "pg_detect_connection_spike");
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
