/**
 * postgres-mcp - Performance Tools Unit Tests
 *
 * Tests for PostgreSQL performance tools including EXPLAIN,
 * statistics, monitoring, and optimization.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPerformanceTools } from "../index.js";
import type { PostgresAdapter } from "../../../postgres-adapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../../__tests__/mocks/index.js";

describe("getPerformanceTools", () => {
  let adapter: PostgresAdapter;
  let tools: ReturnType<typeof getPerformanceTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockPostgresAdapter() as unknown as PostgresAdapter;
    tools = getPerformanceTools(adapter);
  });

  it("should return 24 performance tools", () => {
    expect(tools).toHaveLength(24);
  });

  it("should have all expected tool names", () => {
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("pg_explain");
    expect(toolNames).toContain("pg_explain_analyze");
    expect(toolNames).toContain("pg_explain_buffers");
    expect(toolNames).toContain("pg_index_stats");
    expect(toolNames).toContain("pg_table_stats");
    expect(toolNames).toContain("pg_stat_statements");
    expect(toolNames).toContain("pg_stat_activity");
    expect(toolNames).toContain("pg_locks");
    expect(toolNames).toContain("pg_bloat_check");
    expect(toolNames).toContain("pg_cache_hit_ratio");
    expect(toolNames).toContain("pg_seq_scan_tables");
    expect(toolNames).toContain("pg_index_recommendations");
    expect(toolNames).toContain("pg_query_plan_compare");
    expect(toolNames).toContain("pg_performance_baseline");
    expect(toolNames).toContain("pg_connection_pool_optimize");
    expect(toolNames).toContain("pg_partition_strategy_suggest");
    // New tools
    expect(toolNames).toContain("pg_unused_indexes");
    expect(toolNames).toContain("pg_duplicate_indexes");
    expect(toolNames).toContain("pg_vacuum_stats");
    expect(toolNames).toContain("pg_query_plan_stats");
    expect(toolNames).toContain("pg_diagnose_database_performance");
    expect(toolNames).toContain("pg_detect_query_anomalies");
    expect(toolNames).toContain("pg_detect_bloat_risk");
    expect(toolNames).toContain("pg_detect_connection_spike");
  });

  it("should have group set to performance for all tools", () => {
    for (const tool of tools) {
      expect(tool.group).toBe("performance");
    }
  });
});

describe("pg_explain", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should explain a query in text format", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          "QUERY PLAN":
            "Seq Scan on users  (cost=0.00..10.50 rows=50 width=100)",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_explain")!;
    const result = (await tool.handler(
      {
        sql: "SELECT * FROM users",
      },
      mockContext,
    )) as {
      plan: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("EXPLAIN"),
      [],
    );
    expect(result.plan).toContain("Seq Scan");
  });

  it("should explain a query in JSON format", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "QUERY PLAN": [{ Plan: { "Node Type": "Seq Scan" } }] }],
    });

    const tool = tools.find((t) => t.name === "pg_explain")!;
    const result = (await tool.handler(
      {
        sql: "SELECT * FROM users",
        format: "json",
      },
      mockContext,
    )) as {
      plan: unknown;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("FORMAT JSON"),
      [],
    );
    expect(result.plan).toBeDefined();
  });

  it("should accept query alias for sql", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          "QUERY PLAN":
            "Seq Scan on users  (cost=0.00..10.50 rows=50 width=100)",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_explain")!;
    const result = (await tool.handler(
      { query: "SELECT * FROM users" },
      mockContext,
    )) as { plan: string };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("EXPLAIN"),
      [],
    );
    expect(result.plan).toContain("Seq Scan");
  });

  it("should return structured error when neither sql nor query provided", async () => {
    const tool = tools.find((t) => t.name === "pg_explain")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain(
      "Missing required parameter: sql (or query alias)",
    );
  });
});

describe("pg_explain_analyze", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should run EXPLAIN ANALYZE", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          "QUERY PLAN":
            "Seq Scan on users (cost=0.00..10.50 rows=50) (actual time=0.015..0.020 rows=50 loops=1)",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_explain_analyze")!;
    const result = (await tool.handler(
      {
        sql: "SELECT * FROM users",
      },
      mockContext,
    )) as {
      plan: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("EXPLAIN (ANALYZE"),
      [],
    );
    expect(result.plan).toContain("actual time");
  });

  it("should accept query alias for sql", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          "QUERY PLAN":
            "Seq Scan on users (cost=0.00..10.50 rows=50) (actual time=0.015..0.020 rows=50 loops=1)",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_explain_analyze")!;
    const result = (await tool.handler(
      { query: "SELECT * FROM users" },
      mockContext,
    )) as { plan: string };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("EXPLAIN (ANALYZE"),
      [],
    );
    expect(result.plan).toContain("actual time");
  });

  it("should return structured error when neither sql nor query provided", async () => {
    const tool = tools.find((t) => t.name === "pg_explain_analyze")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain(
      "Missing required parameter: sql (or query alias)",
    );
  });
});

describe("pg_explain_buffers", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should show buffer usage", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "QUERY PLAN": [{ Plan: { "Shared Hit Blocks": 10 } }] }],
    });

    const tool = tools.find((t) => t.name === "pg_explain_buffers")!;
    await tool.handler(
      {
        sql: "SELECT * FROM users",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("BUFFERS"),
      [],
    );
  });

  it("should accept query alias for sql", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "QUERY PLAN": [{ Plan: { "Shared Hit Blocks": 10 } }] }],
    });

    const tool = tools.find((t) => t.name === "pg_explain_buffers")!;
    await tool.handler({ query: "SELECT * FROM users" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("BUFFERS"),
      [],
    );
  });

  it("should return structured error when neither sql nor query provided", async () => {
    const tool = tools.find((t) => t.name === "pg_explain_buffers")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain(
      "Missing required parameter: sql (or query alias)",
    );
  });
});

describe("pg_index_stats", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return index statistics", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { indexrelname: "users_pkey", idx_scan: 1000, idx_tup_read: 5000 },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_index_stats")!;
    const result = (await tool.handler({}, mockContext)) as {
      indexes: unknown[];
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("pg_stat_user_indexes"),
      expect.any(Array),
    );
    expect(result.indexes).toHaveLength(1);
  });

  it("should filter by schema when provided", async () => {
    // P154: schema existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ indexrelname: "sales_orders_pkey", idx_scan: 500 }],
    });

    const tool = tools.find((t) => t.name === "pg_index_stats")!;
    await tool.handler({ schema: "sales" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("schemaname = $"),
      expect.any(Array),
    );
  });

  it("should filter by table when provided", async () => {
    // P154: table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ indexrelname: "orders_pkey", idx_scan: 300 }],
    });

    const tool = tools.find((t) => t.name === "pg_index_stats")!;
    await tool.handler({ table: "orders" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("relname = $"),
      expect.any(Array),
    );
  });

  it("should filter by both schema and table when provided", async () => {
    // P154: schema existence check + table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ indexrelname: "sales_orders_pkey", idx_scan: 200 }],
    });

    const tool = tools.find((t) => t.name === "pg_index_stats")!;
    await tool.handler({ schema: "sales", table: "orders" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("schemaname = $"),
      expect.any(Array),
    );
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("relname = $"),
      expect.any(Array),
    );
  });

  it("should include truncated: false and totalCount when not limited", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          indexrelname: "users_pkey",
          idx_scan: 1000,
          idx_tup_read: 5000,
          idx_tup_fetch: 3000,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_index_stats")!;
    const result = (await tool.handler({}, mockContext)) as {
      indexes: unknown[];
      count: number;
      truncated: boolean;
      totalCount: number;
    };

    expect(result.truncated).toBe(false);
    expect(result.totalCount).toBe(1);
    expect(result.count).toBe(1);
  });

  it("should split schema.table format", async () => {
    // P154: schema check + table check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ indexrelname: "orders_pkey", idx_scan: 200 }],
    });

    const tool = tools.find((t) => t.name === "pg_index_stats")!;
    await tool.handler({ table: "sales.orders" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("schemaname = $"),
      expect.any(Array),
    );
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("relname = $"),
      expect.any(Array),
    );
  });
});

describe("pg_table_stats", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return table statistics", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relname: "users", seq_scan: 50, idx_scan: 1000 }],
    });

    const tool = tools.find((t) => t.name === "pg_table_stats")!;
    const result = (await tool.handler({}, mockContext)) as {
      tables: unknown[];
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("pg_stat_user_tables"),
      expect.any(Array),
    );
    expect(result.tables).toHaveLength(1);
  });

  it("should filter by schema when provided", async () => {
    // P154: schema existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relname: "orders", seq_scan: 100 }],
    });

    const tool = tools.find((t) => t.name === "pg_table_stats")!;
    await tool.handler({ schema: "sales" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("schemaname = $"),
      expect.any(Array),
    );
  });

  it("should filter by table when provided", async () => {
    // P154: table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relname: "orders", seq_scan: 200 }],
    });

    const tool = tools.find((t) => t.name === "pg_table_stats")!;
    await tool.handler({ table: "orders" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("relname = $"),
      expect.any(Array),
    );
  });

  it("should filter by both schema and table when provided", async () => {
    // P154: schema existence check + table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relname: "orders", seq_scan: 150 }],
    });

    const tool = tools.find((t) => t.name === "pg_table_stats")!;
    await tool.handler({ schema: "sales", table: "orders" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("schemaname = $"),
      expect.any(Array),
    );
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("relname = $"),
      expect.any(Array),
    );
  });

  it("should include truncated: false and totalCount when not limited", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relname: "users", seq_scan: 50, idx_scan: 1000 }],
    });

    const tool = tools.find((t) => t.name === "pg_table_stats")!;
    const result = (await tool.handler({}, mockContext)) as {
      tables: unknown[];
      count: number;
      truncated: boolean;
      totalCount: number;
    };

    expect(result.truncated).toBe(false);
    expect(result.totalCount).toBe(1);
    expect(result.count).toBe(1);
  });

  it("should split schema.table format", async () => {
    // P154: schema check + table check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relname: "orders", seq_scan: 100 }],
    });

    const tool = tools.find((t) => t.name === "pg_table_stats")!;
    await tool.handler({ table: "sales.orders" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("schemaname = $"),
      expect.any(Array),
    );
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("relname = $"),
      expect.any(Array),
    );
  });
});

describe("pg_stat_statements", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return statement statistics", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ query: "SELECT * FROM users", calls: 100, mean_exec_time: 5.2 }],
    });

    const tool = tools.find((t) => t.name === "pg_stat_statements")!;
    const result = (await tool.handler({}, mockContext)) as {
      statements: unknown[];
      count: number;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("pg_stat_statements"),
    );
    expect(result.statements).toHaveLength(1);
    expect(result.count).toBe(1);
  });

  it("should order by calls when specified", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ query: "SELECT 1", calls: 500, mean_exec_time: 1.0 }],
    });

    const tool = tools.find((t) => t.name === "pg_stat_statements")!;
    await tool.handler({ orderBy: "calls" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringMatching(/ORDER BY calls DESC/),
    );
  });

  it("should order by mean_time when specified", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ query: "SELECT 1", calls: 50, mean_exec_time: 10.5 }],
    });

    const tool = tools.find((t) => t.name === "pg_stat_statements")!;
    await tool.handler({ orderBy: "mean_time" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringMatching(/ORDER BY mean_time DESC/),
    );
  });

  it("should order by rows when specified", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ query: "SELECT 1", calls: 100, rows: 10000 }],
    });

    const tool = tools.find((t) => t.name === "pg_stat_statements")!;
    await tool.handler({ orderBy: "rows" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringMatching(/ORDER BY rows DESC/),
    );
  });
});

describe("pg_stat_activity", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return active connections", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ pid: 123, state: "active", query: "SELECT 1" }],
    });

    const tool = tools.find((t) => t.name === "pg_stat_activity")!;
    const result = (await tool.handler({}, mockContext)) as {
      connections: unknown[];
      count: number;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("pg_stat_activity"),
    );
    expect(result.connections).toHaveLength(1);
    expect(result.count).toBe(1);
  });

  it("should exclude idle connections by default", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ pid: 123, state: "active", query: "SELECT 1" }],
    });

    const tool = tools.find((t) => t.name === "pg_stat_activity")!;
    await tool.handler({}, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("state != 'idle'"),
    );
  });

  it("should include idle connections when requested", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { pid: 123, state: "active", query: "SELECT 1" },
        { pid: 124, state: "idle", query: "" },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stat_activity")!;
    const result = (await tool.handler({ includeIdle: true }, mockContext)) as {
      connections: unknown[];
      count: number;
    };

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    expect(sql).not.toContain("state != 'idle'");
    expect(result.count).toBe(2);
  });
});

describe("pg_locks", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return current locks", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ locktype: "relation", mode: "AccessShareLock", granted: true }],
    });

    const tool = tools.find((t) => t.name === "pg_locks")!;
    const result = (await tool.handler({}, mockContext)) as {
      locks: unknown[];
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("pg_locks"),
    );
    expect(result.locks).toHaveLength(1);
  });

  it("should show blocked queries when requested", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ blocked_pid: 123, blocking_pid: 456 }],
    });

    const tool = tools.find((t) => t.name === "pg_locks")!;
    await tool.handler({ showBlocked: true }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("NOT bl.granted"),
    );
  });
});

describe("pg_bloat_check", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should check for bloat", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_name: "users", dead_tuples: 1000, dead_pct: 5.5 }],
    });

    const tool = tools.find((t) => t.name === "pg_bloat_check")!;
    const result = (await tool.handler({}, mockContext)) as {
      tables: unknown[];
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("n_dead_tup"),
      expect.any(Array),
    );
    expect(result.tables).toHaveLength(1);
  });

  it("should split schema.table format", async () => {
    // P154: schema check + table check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_name: "orders", dead_tuples: 50, dead_pct: 2.0 }],
    });

    const tool = tools.find((t) => t.name === "pg_bloat_check")!;
    await tool.handler({ table: "sales.orders" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("schemaname = $"),
      expect.any(Array),
    );
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("relname = $"),
      expect.any(Array),
    );
  });
});

describe("pg_vacuum_stats - schema.table", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should split schema.table format", async () => {
    // P154: schema check + table check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schemaname: "sales",
          table_name: "orders",
          n_live_tup: 100,
          n_dead_tup: 5,
          relfrozenxid: "123",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_vacuum_stats")!;
    await tool.handler({ table: "sales.orders" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("s.schemaname = $"),
      expect.any(Array),
    );
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("s.relname = $"),
      expect.any(Array),
    );
  });
});

describe("pg_cache_hit_ratio", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return cache hit ratio", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ heap_read: 100, heap_hit: 9900, cache_hit_ratio: 99.0 }],
    });

    const tool = tools.find((t) => t.name === "pg_cache_hit_ratio")!;
    const result = (await tool.handler({}, mockContext)) as {
      cache_hit_ratio: number;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("pg_statio_user_tables"),
    );
    expect(result.cache_hit_ratio).toBe(99.0);
  });
});

describe("pg_seq_scan_tables", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should find tables with high seq scans", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relname: "orders", seq_scan: 10000, idx_scan: 100 }],
    });

    const tool = tools.find((t) => t.name === "pg_seq_scan_tables")!;
    const result = (await tool.handler({}, mockContext)) as {
      tables: unknown[];
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("seq_scan"),
      expect.any(Array),
    );
    expect(result.tables).toHaveLength(1);
  });

  it("should filter by schema when provided", async () => {
    // P154: schema existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_seq_scan_tables")!;
    await tool.handler({ schema: "analytics" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("schemaname = $"),
      expect.any(Array),
    );
  });

  it("should return all results when limit=0", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: Array(100).fill({ relname: "test", seq_scan: "500" }),
    });

    const tool = tools.find((t) => t.name === "pg_seq_scan_tables")!;
    const result = (await tool.handler({ limit: 0 }, mockContext)) as {
      tables: unknown[];
    };

    expect(result.tables).toHaveLength(100);
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.not.stringContaining("LIMIT"),
      expect.any(Array),
    );
  });

  it("should add totalCount when results are truncated", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: Array(20).fill({ relname: "test", seq_scan: "500" }),
      })
      .mockResolvedValueOnce({
        rows: [{ total: "150" }],
      });

    const tool = tools.find((t) => t.name === "pg_seq_scan_tables")!;
    const result = (await tool.handler({}, mockContext)) as {
      totalCount: number;
      truncated: boolean;
    };

    expect(result.totalCount).toBe(150);
    expect(result.truncated).toBe(true);
  });

  it("should coerce string numbers to JavaScript numbers", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schemaname: "public",
          table_name: "users",
          seq_scan: "12345",
          seq_tup_read: "67890",
          idx_scan: "1000",
          idx_tup_fetch: "500",
          seq_scan_pct: "92.5",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_seq_scan_tables")!;
    const result = (await tool.handler({}, mockContext)) as {
      tables: { seq_scan: number; seq_tup_read: number; idx_scan: number }[];
    };

    expect(typeof result.tables[0].seq_scan).toBe("number");
    expect(result.tables[0].seq_scan).toBe(12345);
  });
});

describe("pg_index_recommendations", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should recommend indexes based on table statistics", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relname: "orders", seq_scan: 5000 }],
    });

    const tool = tools.find((t) => t.name === "pg_index_recommendations")!;
    const result = (await tool.handler({}, mockContext)) as {
      recommendations: unknown[];
      queryAnalysis: boolean;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalled();
    expect(result.recommendations).toBeDefined();
    expect(result.queryAnalysis).toBe(false);
  });

  it("should analyze SQL query when provided (no HypoPG)", async () => {
    // Check HypoPG - not available
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Get baseline EXPLAIN plan with Seq Scan
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          "QUERY PLAN": [
            {
              Plan: {
                "Node Type": "Seq Scan",
                "Relation Name": "users",
                Filter: "(email = 'test')",
                "Total Cost": 100,
              },
            },
          ],
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_index_recommendations")!;
    const result = (await tool.handler(
      { sql: "SELECT * FROM users WHERE email = 'test'" },
      mockContext,
    )) as {
      queryAnalysis: boolean;
      hypopgAvailable: boolean;
      recommendations: { table: string; column: string }[];
    };

    expect(result.queryAnalysis).toBe(true);
    expect(result.hypopgAvailable).toBe(false);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations[0].table).toBe("users");
    expect(result.recommendations[0].column).toBe("email");
  });

  it("should return no recommendations when query is well-indexed", async () => {
    // Check HypoPG - not available
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Get baseline EXPLAIN plan - index scan, no Seq Scan
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          "QUERY PLAN": [
            {
              Plan: {
                "Node Type": "Index Scan",
                "Relation Name": "users",
                "Total Cost": 10,
              },
            },
          ],
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_index_recommendations")!;
    const result = (await tool.handler(
      { sql: "SELECT * FROM users WHERE id = 1" },
      mockContext,
    )) as {
      queryAnalysis: boolean;
      recommendations: unknown[];
      hint: string;
    };

    expect(result.queryAnalysis).toBe(true);
    expect(result.recommendations).toHaveLength(0);
    expect(result.hint).toContain("well-indexed");
  });

  it("should use query alias for sql parameter", async () => {
    // Check HypoPG
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // EXPLAIN plan
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "QUERY PLAN": [{ Plan: { "Node Type": "Index Scan" } }] }],
    });

    const tool = tools.find((t) => t.name === "pg_index_recommendations")!;
    await tool.handler({ query: "SELECT 1" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("EXPLAIN"),
      [],
    );
  });

  it("should filter by table when provided", async () => {
    // P154: schema existence check + table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_index_recommendations")!;
    await tool.handler({ table: "orders" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("relname = $"),
      expect.any(Array),
    );
  });

  it("should filter by schema when provided", async () => {
    // P154: schema existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_index_recommendations")!;
    await tool.handler({ schema: "sales" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("schemaname = $"),
      expect.any(Array),
    );
  });

  it("should handle HypoPG available and test hypothetical indexes", async () => {
    // Check HypoPG - available
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    // Get baseline EXPLAIN plan with Seq Scan
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          "QUERY PLAN": [
            {
              Plan: {
                "Node Type": "Seq Scan",
                "Relation Name": "orders",
                Filter: "(customer_id = 1)",
                "Total Cost": 1000,
              },
            },
          ],
        },
      ],
    });
    // hypopg_reset
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // hypopg_create_index
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ indexrelid: 12345 }],
    });
    // Re-run EXPLAIN with hypothetical index - improved cost
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          "QUERY PLAN": [
            {
              Plan: {
                "Node Type": "Index Scan",
                "Relation Name": "orders",
                "Total Cost": 50, // Much lower cost
              },
            },
          ],
        },
      ],
    });
    // hypopg_reset after each candidate
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // hypopg_reset in finally
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_index_recommendations")!;
    const result = (await tool.handler(
      { sql: "SELECT * FROM orders WHERE customer_id = 1" },
      mockContext,
    )) as {
      queryAnalysis: boolean;
      hypopgAvailable: boolean;
      recommendations: { improvement: string }[];
    };

    expect(result.queryAnalysis).toBe(true);
    expect(result.hypopgAvailable).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations[0].improvement).toContain("% cost reduction");
  });
});

describe("pg_query_plan_compare", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should compare query plans", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ "QUERY PLAN": [{ Plan: { "Total Cost": 100 } }] }],
      })
      .mockResolvedValueOnce({
        rows: [{ "QUERY PLAN": [{ Plan: { "Total Cost": 50 } }] }],
      });

    const tool = tools.find((t) => t.name === "pg_query_plan_compare")!;
    const result = (await tool.handler(
      {
        query1: "SELECT * FROM users WHERE id = 1",
        query2: "SELECT * FROM users WHERE id = 2",
      },
      mockContext,
    )) as {
      query1: unknown;
      query2: unknown;
      analysis: { recommendation: string };
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(2);
    expect(result.query1).toBeDefined();
    expect(result.query2).toBeDefined();
    expect(result.analysis.recommendation).toBeDefined();
  });

  it("should recommend query2 when it has lower cost (costDifference > 0)", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ "QUERY PLAN": [{ Plan: { "Total Cost": 200 } }] }],
      })
      .mockResolvedValueOnce({
        rows: [{ "QUERY PLAN": [{ Plan: { "Total Cost": 50 } }] }],
      });

    const tool = tools.find((t) => t.name === "pg_query_plan_compare")!;
    const result = (await tool.handler(
      {
        query1: "SELECT * FROM large_table",
        query2: "SELECT * FROM large_table WHERE indexed_col = 1",
      },
      mockContext,
    )) as {
      analysis: { costDifference: number; recommendation: string };
    };

    expect(result.analysis.costDifference).toBe(150); // 200 - 50 > 0
    expect(result.analysis.recommendation).toContain("Query 2 has lower");
  });

  it("should recommend query1 when it has lower cost (costDifference < 0)", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ "QUERY PLAN": [{ Plan: { "Total Cost": 30 } }] }],
      })
      .mockResolvedValueOnce({
        rows: [{ "QUERY PLAN": [{ Plan: { "Total Cost": 100 } }] }],
      });

    const tool = tools.find((t) => t.name === "pg_query_plan_compare")!;
    const result = (await tool.handler(
      {
        query1: "SELECT id FROM users WHERE id = 1",
        query2: "SELECT * FROM users WHERE id = 1",
      },
      mockContext,
    )) as {
      analysis: { costDifference: number; recommendation: string };
    };

    expect(result.analysis.costDifference).toBe(-70); // 30 - 100 < 0
    expect(result.analysis.recommendation).toContain("Query 1 has lower");
  });

  it("should report similar cost when costDifference === 0", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ "QUERY PLAN": [{ Plan: { "Total Cost": 100 } }] }],
      })
      .mockResolvedValueOnce({
        rows: [{ "QUERY PLAN": [{ Plan: { "Total Cost": 100 } }] }],
      });

    const tool = tools.find((t) => t.name === "pg_query_plan_compare")!;
    const result = (await tool.handler(
      {
        query1: "SELECT * FROM users WHERE id = 1",
        query2: "SELECT * FROM users WHERE id = 2",
      },
      mockContext,
    )) as {
      analysis: { costDifference: number; recommendation: string };
    };

    expect(result.analysis.costDifference).toBe(0);
    expect(result.analysis.recommendation).toContain("similar estimated cost");
  });

  it("should handle null costDifference when plans are missing", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "QUERY PLAN": [] }] })
      .mockResolvedValueOnce({ rows: [{ "QUERY PLAN": [] }] });

    const tool = tools.find((t) => t.name === "pg_query_plan_compare")!;
    const result = (await tool.handler(
      {
        query1: "SELECT 1",
        query2: "SELECT 2",
      },
      mockContext,
    )) as {
      analysis: { costDifference: number | null; recommendation: string };
    };

    expect(result.analysis.costDifference).toBeNull();
  });

  it("should use analyze option when provided", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [
          {
            "QUERY PLAN": [
              { Plan: { "Total Cost": 100 }, "Execution Time": 1.5 },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            "QUERY PLAN": [
              { Plan: { "Total Cost": 50 }, "Execution Time": 0.8 },
            ],
          },
        ],
      });

    const tool = tools.find((t) => t.name === "pg_query_plan_compare")!;
    await tool.handler(
      {
        query1: "SELECT * FROM users",
        query2: "SELECT id FROM users",
        analyze: true,
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("ANALYZE"),
      [],
    );
  });
});

describe("pg_performance_baseline", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should create performance baseline", async () => {
    // Mock the 5 parallel queries
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ heap_hits: 1000, heap_reads: 10, cache_hit_ratio: 99 }],
      })
      .mockResolvedValueOnce({
        rows: [{ total_seq_scans: 100, total_idx_scans: 5000 }],
      })
      .mockResolvedValueOnce({ rows: [{ total_indexes: 20 }] })
      .mockResolvedValueOnce({ rows: [{ total_connections: 10 }] })
      .mockResolvedValueOnce({ rows: [{ size_bytes: 1000000 }] });

    const tool = tools.find((t) => t.name === "pg_performance_baseline")!;
    const result = (await tool.handler({}, mockContext)) as {
      name: string;
      metrics: unknown;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalled();
    expect(result.name).toBeDefined();
    expect(result.metrics).toBeDefined();
  });
});

describe("pg_connection_pool_optimize", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should optimize connection pool", async () => {
    // Mock the 3 parallel queries
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [
          {
            total_connections: 20,
            active: 5,
            idle: 10,
            idle_in_transaction: 2,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ max_connections: 100, reserved_connections: 3 }],
      })
      .mockResolvedValueOnce({
        rows: [{ wait_event_type: "Lock", wait_event: "tuple", count: 2 }],
      });

    const tool = tools.find((t) => t.name === "pg_connection_pool_optimize")!;
    const result = (await tool.handler({}, mockContext)) as {
      current: unknown;
      recommendations: string[];
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalled();
    expect(result.current).toBeDefined();
    expect(result.recommendations).toBeDefined();
  });

  it("should warn when connection utilization exceeds 80%", async () => {
    // 85% utilization: 85 connections out of 100 max
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [
          {
            total_connections: 85,
            active: 70,
            idle: 10,
            idle_in_transaction: 2,
            waiting: 3,
            max_connection_age_seconds: 100,
            avg_connection_age_seconds: 50,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ max_connections: 100, reserved_connections: 3 }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_connection_pool_optimize")!;
    const result = (await tool.handler({}, mockContext)) as {
      recommendations: string[];
    };

    expect(result.recommendations).toContainEqual(
      expect.stringContaining("utilization"),
    );
  });

  it("should warn when idle-in-transaction exceeds active", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [
          {
            total_connections: 20,
            active: 3,
            idle: 5,
            idle_in_transaction: 10,
            waiting: 0,
            max_connection_age_seconds: 100,
            avg_connection_age_seconds: 50,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ max_connections: 100, reserved_connections: 3 }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_connection_pool_optimize")!;
    const result = (await tool.handler({}, mockContext)) as {
      recommendations: string[];
    };

    expect(result.recommendations).toContainEqual(
      expect.stringContaining("idle-in-transaction"),
    );
  });

  it("should warn when idle/active ratio is too high", async () => {
    // idle (30) > active (5) * 3
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [
          {
            total_connections: 40,
            active: 5,
            idle: 30,
            idle_in_transaction: 2,
            waiting: 0,
            max_connection_age_seconds: 100,
            avg_connection_age_seconds: 50,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ max_connections: 100, reserved_connections: 3 }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_connection_pool_optimize")!;
    const result = (await tool.handler({}, mockContext)) as {
      recommendations: string[];
    };

    expect(result.recommendations).toContainEqual(
      expect.stringContaining("idle to active"),
    );
  });

  it("should warn when connections are long-lived", async () => {
    // max_connection_age > 3600 seconds (1 hour)
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [
          {
            total_connections: 20,
            active: 5,
            idle: 10,
            idle_in_transaction: 2,
            waiting: 0,
            max_connection_age_seconds: 7200,
            avg_connection_age_seconds: 3600,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ max_connections: 100, reserved_connections: 3 }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_connection_pool_optimize")!;
    const result = (await tool.handler({}, mockContext)) as {
      recommendations: string[];
    };

    expect(result.recommendations).toContainEqual(
      expect.stringContaining("Long-lived connections"),
    );
  });

  it("should return healthy message when no issues", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [
          {
            total_connections: 10,
            active: 5,
            idle: 4,
            idle_in_transaction: 0,
            waiting: 0,
            max_connection_age_seconds: 100,
            avg_connection_age_seconds: 50,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ max_connections: 100, reserved_connections: 3 }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_connection_pool_optimize")!;
    const result = (await tool.handler({}, mockContext)) as {
      recommendations: string[];
    };

    expect(result.recommendations).toContainEqual(
      expect.stringContaining("healthy"),
    );
  });
});

describe("pg_partition_strategy_suggest", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should suggest partition strategy", async () => {
    // Phase 1: validatePerformanceTableExists (2 queries since schema='public')
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

    // Mock the 3 parallel queries
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ relname: "orders", n_live_tup: 50000000 }],
      })
      .mockResolvedValueOnce({
        rows: [
          { column_name: "created_at", data_type: "timestamp", n_distinct: -1 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ table_size: "5 GB", size_bytes: 5000000000 }],
      });

    const tool = tools.find((t) => t.name === "pg_partition_strategy_suggest")!;
    const result = (await tool.handler(
      {
        table: "orders",
      },
      mockContext,
    )) as {
      partitioningRecommended: boolean;
      suggestions: unknown[];
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalled();
    expect(result.partitioningRecommended).toBeDefined();
    expect(result.suggestions).toBeDefined();
  });

  it("should recommend partitioning for tables over 1GB", async () => {
    // Phase 1: validatePerformanceTableExists
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

    // 2GB table with low row count
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ relname: "large_table", n_live_tup: 1000000 }],
      })
      .mockResolvedValueOnce({
        rows: [{ column_name: "id", data_type: "integer", n_distinct: -1 }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_size: "2 GB", size_bytes: 2000000000 }],
      });

    const tool = tools.find((t) => t.name === "pg_partition_strategy_suggest")!;
    const result = (await tool.handler(
      {
        table: "large_table",
      },
      mockContext,
    )) as {
      partitioningRecommended: boolean;
      reason: string;
    };

    expect(result.partitioningRecommended).toBe(true);
    expect(result.reason).toContain("1GB");
  });

  it("should recommend partitioning for tables over 10 million rows", async () => {
    // Phase 1: validatePerformanceTableExists
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [
          {
            relname: "large_table",
            n_live_tup: 15000000,
            n_dead_tup: 100000,
            seq_scan: 50,
            idx_scan: 200,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { column_name: "created_at", data_type: "timestamp", n_distinct: -1 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ table_size: "500 MB", size_bytes: 500000000 }],
      });

    const tool = tools.find((t) => t.name === "pg_partition_strategy_suggest")!;
    const result = (await tool.handler(
      {
        table: "large_table",
      },
      mockContext,
    )) as {
      partitioningRecommended: boolean;
      reason: string;
    };

    expect(result.partitioningRecommended).toBe(true);
    expect(result.reason).toContain("rows");
  });

  it("should suggest RANGE partitioning for timestamp columns", async () => {
    // Phase 1: validatePerformanceTableExists
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ relname: "events", n_live_tup: 1000000 }],
      })
      .mockResolvedValueOnce({
        rows: [
          { column_name: "created_at", data_type: "timestamp", n_distinct: -1 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ table_size: "100 MB", size_bytes: 100000000 }],
      });

    const tool = tools.find((t) => t.name === "pg_partition_strategy_suggest")!;
    const result = (await tool.handler(
      {
        table: "events",
      },
      mockContext,
    )) as {
      suggestions: Array<{ strategy: string; column: string }>;
    };

    const rangeStrategy = result.suggestions.find(
      (s) => s.strategy === "RANGE" && s.column === "created_at",
    );
    expect(rangeStrategy).toBeDefined();
  });

  it("should suggest LIST partitioning for low cardinality columns", async () => {
    // Phase 1: validatePerformanceTableExists
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ relname: "orders", n_live_tup: 1000000 }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            column_name: "status",
            data_type: "varchar",
            n_distinct: 5,
            null_frac: 0,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ table_size: "100 MB", size_bytes: 100000000 }],
      });

    const tool = tools.find((t) => t.name === "pg_partition_strategy_suggest")!;
    const result = (await tool.handler(
      {
        table: "orders",
      },
      mockContext,
    )) as {
      suggestions: Array<{ strategy: string; column: string }>;
    };

    const listStrategy = result.suggestions.find(
      (s) => s.strategy === "LIST" && s.column === "status",
    );
    expect(listStrategy).toBeDefined();
  });

  it("should suggest HASH partitioning for high cardinality integer columns", async () => {
    // Phase 1: validatePerformanceTableExists
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ relname: "users", n_live_tup: 1000000 }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            column_name: "user_id",
            data_type: "bigint",
            n_distinct: -1,
            null_frac: 0,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ table_size: "100 MB", size_bytes: 100000000 }],
      });

    const tool = tools.find((t) => t.name === "pg_partition_strategy_suggest")!;
    const result = (await tool.handler(
      {
        table: "users",
      },
      mockContext,
    )) as {
      suggestions: Array<{ strategy: string; column: string }>;
    };

    const hashStrategy = result.suggestions.find(
      (s) => s.strategy === "HASH" && s.column === "user_id",
    );
    expect(hashStrategy).toBeDefined();
  });

  it("should not recommend partitioning for small tables", async () => {
    // Phase 1: validatePerformanceTableExists
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ relname: "small_table", n_live_tup: 10000 }],
      })
      .mockResolvedValueOnce({
        rows: [{ column_name: "id", data_type: "integer", n_distinct: 100 }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_size: "10 MB", size_bytes: 10000000 }],
      });

    const tool = tools.find((t) => t.name === "pg_partition_strategy_suggest")!;
    const result = (await tool.handler(
      {
        table: "small_table",
      },
      mockContext,
    )) as {
      partitioningRecommended: boolean;
    };

    expect(result.partitioningRecommended).toBe(false);
  });
});

// =============================================================================
// Phase 3: Performance Tools Edge Case Tests
// =============================================================================

describe("Performance Tools Edge Cases", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("pg_stat_statements should default to total_time ordering", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ query: "SELECT 1", calls: 100, total_time: 1000 }],
    });

    const tool = tools.find((t) => t.name === "pg_stat_statements")!;
    await tool.handler({}, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY total_exec_time DESC"),
    );
  });

  it("pg_index_stats should handle empty results", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_index_stats")!;
    const result = (await tool.handler({}, mockContext)) as {
      indexes: unknown[];
    };

    expect(result.indexes).toHaveLength(0);
  });

  it("pg_bloat_check should handle tables with no bloat", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // no bloated tables

    const tool = tools.find((t) => t.name === "pg_bloat_check")!;
    const result = (await tool.handler({}, mockContext)) as {
      tables: unknown[];
    };

    expect(result.tables).toHaveLength(0);
  });

  it("pg_performance_baseline should use custom name when provided", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ heap_hits: 1000, heap_reads: 10 }] })
      .mockResolvedValueOnce({ rows: [{ total_seq_scans: 50 }] })
      .mockResolvedValueOnce({ rows: [{ total_indexes: 10 }] })
      .mockResolvedValueOnce({ rows: [{ total_connections: 5 }] })
      .mockResolvedValueOnce({ rows: [{ size_bytes: 1000000 }] });

    const tool = tools.find((t) => t.name === "pg_performance_baseline")!;
    const result = (await tool.handler(
      { name: "my-custom-baseline" },
      mockContext,
    )) as {
      name: string;
    };

    expect(result.name).toBe("my-custom-baseline");
  });

  it("pg_connection_pool_optimize should handle waiting connections", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [
          {
            total_connections: 50,
            active: 10,
            idle: 15,
            idle_in_transaction: 2,
            waiting: 8,
            max_connection_age_seconds: 100,
            avg_connection_age_seconds: 50,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ max_connections: 100, reserved_connections: 3 }],
      })
      .mockResolvedValueOnce({ rows: [{ wait_event_type: "Lock", count: 5 }] });

    const tool = tools.find((t) => t.name === "pg_connection_pool_optimize")!;
    const result = (await tool.handler({}, mockContext)) as {
      current: { waiting: number };
      recommendations: string[];
    };

    expect(result.current.waiting).toBe(8);
  });
});

// =============================================================================
// Phase 2: EXPLAIN Tools Coverage Tests
// =============================================================================

describe("EXPLAIN Tools (Coverage)", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("pg_explain_analyze should return JSON plan when format is json (line 48)", async () => {
    const jsonPlan = [
      { Plan: { "Node Type": "Seq Scan", "Actual Rows": 100 } },
    ];
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "QUERY PLAN": jsonPlan }],
    });

    const tool = tools.find((t) => t.name === "pg_explain_analyze")!;
    const result = (await tool.handler(
      {
        sql: "SELECT * FROM users",
        format: "json",
      },
      mockContext,
    )) as {
      plan: unknown;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("FORMAT JSON"),
      [],
    );
    expect(result.plan).toEqual(jsonPlan);
  });

  it("pg_explain_buffers should return JSON plan when format is json (line 69-70)", async () => {
    const jsonPlan = [
      { Plan: { "Shared Hit Blocks": 50, "Shared Read Blocks": 10 } },
    ];
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "QUERY PLAN": jsonPlan }],
    });

    const tool = tools.find((t) => t.name === "pg_explain_buffers")!;
    const result = (await tool.handler(
      {
        sql: "SELECT * FROM large_table",
        format: "json",
      },
      mockContext,
    )) as {
      plan: unknown;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("FORMAT JSON"),
      [],
    );
    expect(result.plan).toEqual(jsonPlan);
  });

  it("pg_explain_buffers should return text plan when format is text (line 72)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { "QUERY PLAN": "Seq Scan on users (cost=0.00..10.50 rows=50)" },
        { "QUERY PLAN": "  Buffers: shared hit=10 read=2" },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_explain_buffers")!;
    const result = (await tool.handler(
      {
        sql: "SELECT * FROM users",
        format: "text",
      },
      mockContext,
    )) as {
      plan: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("FORMAT TEXT"),
      [],
    );
    expect(result.plan).toContain("Seq Scan");
    expect(result.plan).toContain("Buffers");
  });
});

// =============================================================================
// Phase 3: No-Arg Calls and Parameter Aliases Tests
// =============================================================================

describe("No-Arg Calls (undefined params)", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("pg_stat_statements should work with undefined params", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ query: "SELECT 1", calls: 100 }],
    });

    const tool = tools.find((t) => t.name === "pg_stat_statements")!;
    const result = (await tool.handler(undefined, mockContext)) as {
      statements: unknown[];
    };

    expect(result.statements).toHaveLength(1);
  });

  it("pg_stat_activity should work with undefined params", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ pid: 123, state: "active" }],
    });

    const tool = tools.find((t) => t.name === "pg_stat_activity")!;
    const result = (await tool.handler(undefined, mockContext)) as {
      connections: unknown[];
    };

    expect(result.connections).toHaveLength(1);
  });

  it("pg_performance_baseline should work with undefined params and auto-generate name", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ cache_hit_ratio: 99 }] })
      .mockResolvedValueOnce({ rows: [{ total_seq_scans: 100 }] })
      .mockResolvedValueOnce({ rows: [{ total_indexes: 20 }] })
      .mockResolvedValueOnce({ rows: [{ total_connections: 10 }] })
      .mockResolvedValueOnce({ rows: [{ size_bytes: 1000000 }] });

    const tool = tools.find((t) => t.name === "pg_performance_baseline")!;
    const result = (await tool.handler(undefined, mockContext)) as {
      name: string;
    };

    expect(result.name).toMatch(/^baseline_\d{4}-\d{2}-\d{2}T/);
  });
});

describe("Parameter Aliases", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("pg_partition_strategy_suggest should accept tableName alias", async () => {
    // Phase 1: validatePerformanceTableExists
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ relname: "orders", n_live_tup: 1000 }],
      })
      .mockResolvedValueOnce({
        rows: [{ column_name: "id", data_type: "integer" }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_size: "1 MB", size_bytes: 1000000 }],
      });

    const tool = tools.find((t) => t.name === "pg_partition_strategy_suggest")!;
    const result = (await tool.handler(
      { tableName: "orders" },
      mockContext,
    )) as { table: string };

    expect(result.table).toBe("public.orders");
  });

  it("pg_partition_strategy_suggest should accept name alias", async () => {
    // Phase 1: validatePerformanceTableExists
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ relname: "events", n_live_tup: 500 }] })
      .mockResolvedValueOnce({
        rows: [{ column_name: "created_at", data_type: "timestamp" }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_size: "500 KB", size_bytes: 500000 }],
      });

    const tool = tools.find((t) => t.name === "pg_partition_strategy_suggest")!;
    const result = (await tool.handler({ name: "events" }, mockContext)) as {
      table: string;
    };

    expect(result.table).toBe("public.events");
  });

  it("pg_query_plan_compare should accept sql1/sql2 aliases", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ "QUERY PLAN": [{ Plan: { "Total Cost": 100 } }] }],
      })
      .mockResolvedValueOnce({
        rows: [{ "QUERY PLAN": [{ Plan: { "Total Cost": 50 } }] }],
      });

    const tool = tools.find((t) => t.name === "pg_query_plan_compare")!;
    await tool.handler(
      {
        sql1: "SELECT * FROM users",
        sql2: "SELECT id FROM users",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(2);
    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("SELECT * FROM users"),
      [],
    );
    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("SELECT id FROM users"),
      [],
    );
  });
});

// =============================================================================
// Phase 4: Statistics Tools Coverage (stats.ts lines 295-489, 517-677)
// =============================================================================

describe("pg_unused_indexes comprehensive", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return unused indexes with default limit", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schemaname: "public",
          table_name: "users",
          index_name: "users_unused_idx",
          scans: "0",
          tuples_read: "0",
          size: "1024 kB",
          size_bytes: "1048576",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_unused_indexes")!;
    const result = (await tool.handler({}, mockContext)) as {
      unusedIndexes: unknown[];
      count: number;
      hint: string;
    };

    expect(result.unusedIndexes).toHaveLength(1);
    expect(result.count).toBe(1);
    expect(result.hint).toContain("never been used");
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("idx_scan = 0"),
      expect.any(Array),
    );
  });

  it("should filter by schema when provided", async () => {
    // P154: schema existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_unused_indexes")!;
    await tool.handler({ schema: "sales" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("schemaname = $"),
      expect.any(Array),
    );
  });

  it("should return structured error for nonexistent schema (P154)", async () => {
    // P154: schema does not exist
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_unused_indexes")!;
    const result = (await tool.handler(
      { schema: "fake_schema" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("fake_schema");
    expect(result.error).toContain("does not exist");
  });

  it("should filter by minSize when provided", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_unused_indexes")!;
    await tool.handler({ minSize: "1 MB" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("pg_size_bytes('1 MB')"),
      expect.any(Array),
    );
  });

  it("should return summary mode with aggregated stats", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schemaname: "public",
          unused_count: "5",
          total_size: "10 MB",
          total_size_bytes: "10485760",
        },
        {
          schemaname: "sales",
          unused_count: "3",
          total_size: "5 MB",
          total_size_bytes: "5242880",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_unused_indexes")!;
    const result = (await tool.handler({ summary: true }, mockContext)) as {
      summary: boolean;
      bySchema: { schema: string; unusedCount: number }[];
      totalCount: number;
      totalSizeBytes: number;
      hint: string;
    };

    expect(result.summary).toBe(true);
    expect(result.bySchema).toHaveLength(2);
    expect(result.totalCount).toBe(8);
    expect(result.totalSizeBytes).toBe(15728640);
    expect(result.hint).toContain("summary=false");
  });

  it("should return all results when limit=0", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: Array(100).fill({
        schemaname: "public",
        table_name: "test",
        index_name: "test_idx",
        scans: "0",
        tuples_read: "0",
        size: "1 kB",
        size_bytes: "1024",
      }),
    });

    const tool = tools.find((t) => t.name === "pg_unused_indexes")!;
    const result = (await tool.handler({ limit: 0 }, mockContext)) as {
      unusedIndexes: unknown[];
    };

    expect(result.unusedIndexes).toHaveLength(100);
    // Should not have LIMIT clause
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.not.stringContaining("LIMIT"),
      expect.any(Array),
    );
  });

  it("should add totalCount when results are truncated", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: Array(20).fill({
          schemaname: "public",
          table_name: "test",
          index_name: "test_idx",
          scans: "0",
          tuples_read: "0",
          size: "1 kB",
          size_bytes: "1024",
        }),
      })
      .mockResolvedValueOnce({
        rows: [{ total: "50" }],
      });

    const tool = tools.find((t) => t.name === "pg_unused_indexes")!;
    const result = (await tool.handler({}, mockContext)) as {
      totalCount: number;
      truncated: boolean;
    };

    expect(result.totalCount).toBe(50);
    expect(result.truncated).toBe(true);
  });

  it("should coerce string numbers to JavaScript numbers", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schemaname: "public",
          table_name: "users",
          index_name: "users_idx",
          scans: "0",
          tuples_read: "12345",
          size: "1 MB",
          size_bytes: "1048576",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_unused_indexes")!;
    const result = (await tool.handler({}, mockContext)) as {
      unusedIndexes: {
        scans: number;
        tuples_read: number;
        size_bytes: number;
      }[];
    };

    expect(typeof result.unusedIndexes[0].scans).toBe("number");
    expect(typeof result.unusedIndexes[0].tuples_read).toBe("number");
    expect(typeof result.unusedIndexes[0].size_bytes).toBe("number");
    expect(result.unusedIndexes[0].tuples_read).toBe(12345);
    expect(result.unusedIndexes[0].size_bytes).toBe(1048576);
  });
});

describe("pg_duplicate_indexes comprehensive", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should find exact duplicate indexes", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schemaname: "public",
          tablename: "users",
          index1: "users_email_idx",
          index1_columns: ["email"],
          index1_size: "1 MB",
          index2: "users_email_idx2",
          index2_columns: ["email"],
          index2_size: "1 MB",
          duplicate_type: "EXACT_DUPLICATE",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_duplicate_indexes")!;
    const result = (await tool.handler({}, mockContext)) as {
      duplicateIndexes: { duplicate_type: string }[];
      count: number;
      hint: string;
    };

    expect(result.duplicateIndexes).toHaveLength(1);
    expect(result.duplicateIndexes[0].duplicate_type).toBe("EXACT_DUPLICATE");
    expect(result.hint).toContain("EXACT_DUPLICATE");
  });

  it("should find overlapping indexes", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schemaname: "public",
          tablename: "orders",
          index1: "orders_customer_date_idx",
          index1_columns: ["customer_id", "created_at"],
          index1_size: "2 MB",
          index2: "orders_customer_idx",
          index2_columns: ["customer_id"],
          index2_size: "1 MB",
          duplicate_type: "OVERLAPPING",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_duplicate_indexes")!;
    const result = (await tool.handler({}, mockContext)) as {
      duplicateIndexes: { duplicate_type: string }[];
    };

    expect(result.duplicateIndexes[0].duplicate_type).toBe("OVERLAPPING");
  });

  it("should filter by schema when provided", async () => {
    // P154: schema existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_duplicate_indexes")!;
    await tool.handler({ schema: "analytics" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("n.nspname = $"),
      expect.any(Array),
    );
  });

  it("should return structured error for nonexistent schema (P154)", async () => {
    // P154: schema does not exist
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_duplicate_indexes")!;
    const result = (await tool.handler(
      { schema: "fake_schema" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("fake_schema");
    expect(result.error).toContain("does not exist");
  });

  it("should exclude system schemas by default", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_duplicate_indexes")!;
    await tool.handler({}, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("NOT IN ('pg_catalog', 'information_schema')"),
      expect.any(Array),
    );
  });

  it("should return all results when limit=0", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: Array(100).fill({
        schemaname: "public",
        tablename: "test",
        index1: "idx1",
        index1_columns: ["col"],
        index1_size: "1 MB",
        index2: "idx2",
        index2_columns: ["col"],
        index2_size: "1 MB",
        duplicate_type: "EXACT_DUPLICATE",
      }),
    });

    const tool = tools.find((t) => t.name === "pg_duplicate_indexes")!;
    const result = (await tool.handler({ limit: 0 }, mockContext)) as {
      duplicateIndexes: unknown[];
    };

    expect(result.duplicateIndexes).toHaveLength(100);
  });

  it("should add totalCount when results are truncated", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: Array(50).fill({
          schemaname: "public",
          tablename: "test",
          index1: "idx1",
          index1_columns: ["col"],
          index1_size: "1 MB",
          index2: "idx2",
          index2_columns: ["col"],
          index2_size: "1 MB",
          duplicate_type: "EXACT_DUPLICATE",
        }),
      })
      .mockResolvedValueOnce({
        rows: [{ total: "200" }],
      });

    const tool = tools.find((t) => t.name === "pg_duplicate_indexes")!;
    const result = (await tool.handler({}, mockContext)) as {
      totalCount: number;
      truncated: boolean;
    };

    expect(result.totalCount).toBe(200);
    expect(result.truncated).toBe(true);
  });
});

describe("pg_vacuum_stats comprehensive", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return vacuum statistics with wraparound risk", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schemaname: "public",
          table_name: "audit_logs",
          live_tuples: "1000000",
          dead_tuples: "50000",
          dead_pct: "5.00",
          last_vacuum: "2024-01-20T10:00:00Z",
          last_autovacuum: "2024-01-21T15:00:00Z",
          vacuum_count: "10",
          autovacuum_count: "50",
          last_analyze: "2024-01-21T16:00:00Z",
          last_autoanalyze: "2024-01-21T16:00:00Z",
          analyze_count: "5",
          autoanalyze_count: "20",
          xid_age: "100000000",
          wraparound_risk: "OK",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_vacuum_stats")!;
    const result = (await tool.handler({}, mockContext)) as {
      tables: {
        live_tuples: number;
        dead_tuples: number;
        dead_pct: number;
        wraparound_risk: string;
      }[];
      count: number;
    };

    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].live_tuples).toBe(1000000);
    expect(result.tables[0].dead_tuples).toBe(50000);
    expect(result.tables[0].dead_pct).toBe(5);
    expect(result.tables[0].wraparound_risk).toBe("OK");
  });

  it("should identify WARNING wraparound risk", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schemaname: "public",
          table_name: "high_traffic",
          live_tuples: "5000000",
          dead_tuples: "2000000",
          dead_pct: "40.00",
          xid_age: "600000000",
          wraparound_risk: "WARNING",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_vacuum_stats")!;
    const result = (await tool.handler({}, mockContext)) as {
      tables: { wraparound_risk: string }[];
    };

    expect(result.tables[0].wraparound_risk).toBe("WARNING");
  });

  it("should identify CRITICAL wraparound risk", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schemaname: "public",
          table_name: "critical_table",
          live_tuples: "10000000",
          dead_tuples: "5000000",
          dead_pct: "50.00",
          xid_age: "1200000000",
          wraparound_risk: "CRITICAL",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_vacuum_stats")!;
    const result = (await tool.handler({}, mockContext)) as {
      tables: { wraparound_risk: string }[];
    };

    expect(result.tables[0].wraparound_risk).toBe("CRITICAL");
  });

  it("should filter by schema when provided", async () => {
    // P154: schema existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_vacuum_stats")!;
    await tool.handler({ schema: "logs" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("s.schemaname = $"),
      expect.any(Array),
    );
  });

  it("should filter by table when provided", async () => {
    // P154: table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_vacuum_stats")!;
    await tool.handler({ table: "events" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("s.relname = $"),
      expect.any(Array),
    );
  });

  it("should filter by both schema and table when provided", async () => {
    // P154: schema existence check + table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_vacuum_stats")!;
    await tool.handler(
      { schema: "analytics", table: "pageviews" },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("s.schemaname = $"),
      expect.any(Array),
    );
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("s.relname = $"),
      expect.any(Array),
    );
  });

  it("should return all results when limit=0", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: Array(75).fill({
        schemaname: "public",
        table_name: "test",
        live_tuples: "100",
        dead_tuples: "10",
        dead_pct: "10.00",
        wraparound_risk: "OK",
      }),
    });

    const tool = tools.find((t) => t.name === "pg_vacuum_stats")!;
    const result = (await tool.handler({ limit: 0 }, mockContext)) as {
      tables: unknown[];
    };

    expect(result.tables).toHaveLength(75);
  });

  it("should add totalCount when results are truncated", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: Array(10).fill({
          schemaname: "public",
          table_name: "test",
          live_tuples: "100",
          dead_tuples: "10",
          dead_pct: "10.00",
          wraparound_risk: "OK",
        }),
      })
      .mockResolvedValueOnce({
        rows: [{ total: "150" }],
      });

    const tool = tools.find((t) => t.name === "pg_vacuum_stats")!;
    const result = (await tool.handler({}, mockContext)) as {
      totalCount: number;
      truncated: boolean;
    };

    expect(result.totalCount).toBe(150);
    expect(result.truncated).toBe(true);
  });

  it("should coerce string numbers to JavaScript numbers", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schemaname: "public",
          table_name: "users",
          live_tuples: "999999",
          dead_tuples: "12345",
          dead_pct: "1.23",
          vacuum_count: "7",
          autovacuum_count: "42",
          analyze_count: "3",
          autoanalyze_count: "15",
          wraparound_risk: "OK",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_vacuum_stats")!;
    const result = (await tool.handler({}, mockContext)) as {
      tables: {
        live_tuples: number;
        dead_tuples: number;
        dead_pct: number;
        vacuum_count: number;
        autovacuum_count: number;
      }[];
    };

    expect(typeof result.tables[0].live_tuples).toBe("number");
    expect(typeof result.tables[0].dead_tuples).toBe("number");
    expect(typeof result.tables[0].dead_pct).toBe("number");
    expect(result.tables[0].live_tuples).toBe(999999);
    expect(result.tables[0].dead_tuples).toBe(12345);
    expect(result.tables[0].dead_pct).toBe(1.23);
    expect(result.tables[0].vacuum_count).toBe(7);
    expect(result.tables[0].autovacuum_count).toBe(42);
  });
});

describe("pg_query_plan_stats comprehensive", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return query plan statistics with planning vs execution time", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          query: "SELECT * FROM users WHERE id = $1",
          calls: "1000",
          total_plan_time: 50.5,
          mean_plan_time: 0.05,
          total_exec_time: 500.0,
          mean_exec_time: 0.5,
          rows: "1000",
          plan_pct: "9.18",
          shared_blks_hit: "50000",
          shared_blks_read: "1000",
          cache_hit_pct: "98.04",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_query_plan_stats")!;
    const result = (await tool.handler({}, mockContext)) as {
      queryPlanStats: {
        query: string;
        calls: number;
        plan_pct: number;
        cache_hit_pct: number;
      }[];
      count: number;
      hint: string;
    };

    expect(result.queryPlanStats).toHaveLength(1);
    expect(result.queryPlanStats[0].calls).toBe(1000);
    expect(result.queryPlanStats[0].plan_pct).toBe(9.18);
    expect(result.queryPlanStats[0].cache_hit_pct).toBe(98.04);
    expect(result.hint).toContain("plan_pct");
  });

  it("should truncate long queries by default", async () => {
    const longQuery = "SELECT " + "a, ".repeat(100) + "b FROM very_long_table";
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          query: longQuery,
          calls: "10",
          total_plan_time: 1.0,
          mean_plan_time: 0.1,
          total_exec_time: 10.0,
          mean_exec_time: 1.0,
          rows: "100",
          plan_pct: "9.09",
          shared_blks_hit: "100",
          shared_blks_read: "10",
          cache_hit_pct: "90.91",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_query_plan_stats")!;
    const result = (await tool.handler({}, mockContext)) as {
      queryPlanStats: { query: string; queryTruncated: boolean }[];
    };

    expect(result.queryPlanStats[0].query.length).toBe(103); // 100 + "..."
    expect(result.queryPlanStats[0].query.endsWith("...")).toBe(true);
    expect(result.queryPlanStats[0].queryTruncated).toBe(true);
  });

  it("should return full query when truncateQuery=0", async () => {
    const longQuery =
      "SELECT " + "column_name, ".repeat(50) + "last_column FROM table";
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          query: longQuery,
          calls: "5",
          total_plan_time: 0.5,
          mean_plan_time: 0.1,
          total_exec_time: 5.0,
          mean_exec_time: 1.0,
          rows: "50",
          plan_pct: "9.09",
          shared_blks_hit: "50",
          shared_blks_read: "5",
          cache_hit_pct: "90.91",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_query_plan_stats")!;
    const result = (await tool.handler({ truncateQuery: 0 }, mockContext)) as {
      queryPlanStats: { query: string; queryTruncated: boolean }[];
    };

    expect(result.queryPlanStats[0].query).toBe(longQuery);
    expect(result.queryPlanStats[0].queryTruncated).toBe(false);
  });

  it("should respect custom truncateQuery length", async () => {
    const query =
      "SELECT id, name, email, created_at FROM users WHERE active = true";
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          query: query,
          calls: "100",
          total_plan_time: 1.0,
          mean_plan_time: 0.01,
          total_exec_time: 10.0,
          mean_exec_time: 0.1,
          rows: "100",
          plan_pct: "9.09",
          shared_blks_hit: "1000",
          shared_blks_read: "0",
          cache_hit_pct: "100.00",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_query_plan_stats")!;
    const result = (await tool.handler({ truncateQuery: 30 }, mockContext)) as {
      queryPlanStats: { query: string; queryTruncated: boolean }[];
    };

    expect(result.queryPlanStats[0].query.length).toBe(33); // 30 + "..."
    expect(result.queryPlanStats[0].queryTruncated).toBe(true);
  });

  it("should return all results when limit=0", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: Array(50).fill({
        query: "SELECT 1",
        calls: "1",
        total_plan_time: 0.1,
        mean_plan_time: 0.1,
        total_exec_time: 1.0,
        mean_exec_time: 1.0,
        rows: "1",
        plan_pct: "9.09",
        shared_blks_hit: "1",
        shared_blks_read: "0",
        cache_hit_pct: "100.00",
      }),
    });

    const tool = tools.find((t) => t.name === "pg_query_plan_stats")!;
    const result = (await tool.handler({ limit: 0 }, mockContext)) as {
      queryPlanStats: unknown[];
    };

    expect(result.queryPlanStats).toHaveLength(50);
  });

  it("should add totalCount when results are truncated", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: Array(10).fill({
          query: "SELECT 1",
          calls: "1",
          total_plan_time: 0.1,
          mean_plan_time: 0.1,
          total_exec_time: 1.0,
          mean_exec_time: 1.0,
          rows: "1",
          plan_pct: "9.09",
          shared_blks_hit: "1",
          shared_blks_read: "0",
          cache_hit_pct: "100.00",
        }),
      })
      .mockResolvedValueOnce({
        rows: [{ total: "100" }],
      });

    const tool = tools.find((t) => t.name === "pg_query_plan_stats")!;
    const result = (await tool.handler({}, mockContext)) as {
      totalCount: number;
      truncated: boolean;
    };

    expect(result.totalCount).toBe(100);
    expect(result.truncated).toBe(true);
  });

  it("should coerce string numbers to JavaScript numbers", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          query: "SELECT 1",
          calls: "999",
          total_plan_time: 1.5,
          mean_plan_time: 0.0015,
          total_exec_time: 15.0,
          mean_exec_time: 0.015,
          rows: "999",
          plan_pct: "9.09",
          shared_blks_hit: "10000",
          shared_blks_read: "500",
          cache_hit_pct: "95.24",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_query_plan_stats")!;
    const result = (await tool.handler({}, mockContext)) as {
      queryPlanStats: {
        calls: number;
        rows: number;
        plan_pct: number;
        cache_hit_pct: number;
        shared_blks_hit: number;
        shared_blks_read: number;
      }[];
    };

    expect(typeof result.queryPlanStats[0].calls).toBe("number");
    expect(typeof result.queryPlanStats[0].rows).toBe("number");
    expect(typeof result.queryPlanStats[0].plan_pct).toBe("number");
    expect(typeof result.queryPlanStats[0].cache_hit_pct).toBe("number");
    expect(result.queryPlanStats[0].calls).toBe(999);
    expect(result.queryPlanStats[0].rows).toBe(999);
    expect(result.queryPlanStats[0].shared_blks_hit).toBe(10000);
    expect(result.queryPlanStats[0].shared_blks_read).toBe(500);
  });

  it("should handle zero total time gracefully (avoid division by zero)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          query: "SELECT 1",
          calls: "1",
          total_plan_time: 0,
          mean_plan_time: 0,
          total_exec_time: 0,
          mean_exec_time: 0,
          rows: "1",
          plan_pct: "0",
          shared_blks_hit: "0",
          shared_blks_read: "0",
          cache_hit_pct: "100",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_query_plan_stats")!;
    const result = (await tool.handler({}, mockContext)) as {
      queryPlanStats: { plan_pct: number; cache_hit_pct: number }[];
    };

    expect(result.queryPlanStats[0].plan_pct).toBe(0);
    expect(result.queryPlanStats[0].cache_hit_pct).toBe(100);
  });
});

// =============================================================================
// Error Handling Tests - Structured {success: false, error} responses
// =============================================================================

describe("pg_explain error handling", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return structured error for nonexistent table", async () => {
    const pgError = new Error('relation "nonexistent" does not exist');
    Object.assign(pgError, { code: "42P01" });
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_explain")!;
    const result = (await tool.handler(
      { sql: "SELECT * FROM nonexistent" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("pg_explain_analyze error handling", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return structured error for nonexistent table", async () => {
    const pgError = new Error('relation "nonexistent" does not exist');
    Object.assign(pgError, { code: "42P01" });
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_explain_analyze")!;
    const result = (await tool.handler(
      { sql: "SELECT * FROM nonexistent" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("pg_explain_buffers error handling", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return structured error for nonexistent table", async () => {
    const pgError = new Error('relation "nonexistent" does not exist');
    Object.assign(pgError, { code: "42P01" });
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_explain_buffers")!;
    const result = (await tool.handler(
      { sql: "SELECT * FROM nonexistent" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("pg_index_recommendations error handling", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return structured error for SQL with nonexistent table", async () => {
    // HypoPG check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // EXPLAIN fails
    const pgError = new Error('relation "nonexistent" does not exist');
    Object.assign(pgError, { code: "42P01" });
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_index_recommendations")!;
    const result = (await tool.handler(
      { sql: "SELECT * FROM nonexistent" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("pg_query_plan_compare error handling", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return structured error for nonexistent table", async () => {
    const pgError = new Error('relation "nonexistent" does not exist');
    Object.assign(pgError, { code: "42P01" });
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_query_plan_compare")!;
    const result = (await tool.handler(
      {
        query1: "SELECT * FROM nonexistent",
        query2: "SELECT 1",
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("pg_partition_strategy_suggest error handling", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return structured error for nonexistent table", async () => {
    const pgError = new Error('relation "nonexistent" does not exist');
    Object.assign(pgError, { code: "42P01" });
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_partition_strategy_suggest")!;
    const result = (await tool.handler(
      { table: "nonexistent" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("pg_vacuum_stats", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should include truncated: false and totalCount when not limited", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schemaname: "public",
          table_name: "users",
          live_tuples: 100,
          dead_tuples: 5,
          dead_pct: 5,
          vacuum_count: 1,
          autovacuum_count: 2,
          analyze_count: 1,
          autoanalyze_count: 2,
          xid_age: 1000,
          wraparound_risk: "OK",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_vacuum_stats")!;
    const result = (await tool.handler({}, mockContext)) as {
      tables: unknown[];
      count: number;
      truncated: boolean;
      totalCount: number;
    };

    expect(result.truncated).toBe(false);
    expect(result.totalCount).toBe(1);
    expect(result.count).toBe(1);
  });
});

// =============================================================================
// P154: Nonexistent Table/Schema Pre-check Tests
// =============================================================================

describe("P154 pre-checks", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("pg_index_stats should return error for nonexistent table", async () => {
    // Table existence check returns empty
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_index_stats")!;
    const result = (await tool.handler(
      { table: "nonexistent_table" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
    expect(result.error).toContain("nonexistent_table");
  });

  it("pg_index_stats should return error for nonexistent schema", async () => {
    // Schema existence check returns empty
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_index_stats")!;
    const result = (await tool.handler(
      { schema: "fake_schema" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
    expect(result.error).toContain("fake_schema");
  });

  it("pg_table_stats should return error for nonexistent table", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_table_stats")!;
    const result = (await tool.handler(
      { table: "nonexistent_table" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("pg_table_stats should return error for nonexistent schema", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_table_stats")!;
    const result = (await tool.handler(
      { schema: "fake_schema" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
  });

  it("pg_vacuum_stats should return error for nonexistent table", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_vacuum_stats")!;
    const result = (await tool.handler(
      { table: "nonexistent_table" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("pg_bloat_check should return error for nonexistent table", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_bloat_check")!;
    const result = (await tool.handler(
      { table: "nonexistent_table" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("pg_index_recommendations should return error for nonexistent table (table mode)", async () => {
    // Schema exists but table does not
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_index_recommendations")!;
    const result = (await tool.handler(
      { table: "nonexistent_table" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("pg_seq_scan_tables should return error for nonexistent schema", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_seq_scan_tables")!;
    const result = (await tool.handler(
      { schema: "fake_schema" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
    expect(result.error).toContain("fake_schema");
  });
});

// =============================================================================
// Wrong-type limit param handling — P507 coerced tools silently default,
// strict z.number() tools return structured VALIDATION_ERROR
// =============================================================================

describe("wrong-type limit param handling", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("pg_table_stats should silently fall back to default limit for non-numeric string", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schemaname: "public",
          relname: "t",
          seq_scan: "1",
          idx_scan: "1",
          n_live_tup: "1",
          n_dead_tup: "0",
          last_vacuum: null,
          last_autovacuum: null,
          last_analyze: null,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_table_stats")!;
    const result = (await tool.handler({ limit: "abc" }, mockContext)) as {
      success: boolean;
      tables: unknown[];
    };

    expect(result.success).toBe(true);
    expect(result.tables.length).toBeGreaterThanOrEqual(0);
  });

  it("pg_index_stats should silently fall back to default limit for non-numeric string", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schemaname: "public",
          relname: "t",
          indexrelname: "idx",
          idx_scan: "1",
          idx_tup_read: "1",
          idx_tup_fetch: "1",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_index_stats")!;
    const result = (await tool.handler({ limit: "abc" }, mockContext)) as {
      success: boolean;
      indexes: unknown[];
    };

    expect(result.success).toBe(true);
    expect(result.indexes.length).toBeGreaterThanOrEqual(0);
  });

  it("pg_stat_statements should silently fall back to default limit for non-numeric string", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          query: "SELECT 1",
          calls: "1",
          total_time: "1",
          mean_time: "1",
          rows: "1",
          shared_blks_hit: "1",
          shared_blks_read: "0",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stat_statements")!;
    const result = (await tool.handler({ limit: "abc" }, mockContext)) as {
      success: boolean;
      statements: unknown[];
    };

    expect(result.success).toBe(true);
    expect(result.statements.length).toBeGreaterThanOrEqual(0);
  });

  it("pg_unused_indexes should silently fall back to default limit for non-numeric string", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schemaname: "public",
          relname: "t",
          indexrelname: "idx",
          scans: "1",
          tuples_read: "1",
          size: "1 MB",
          size_bytes: "1000000",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_unused_indexes")!;
    const result = (await tool.handler({ limit: "abc" }, mockContext)) as {
      success: boolean;
      unusedIndexes: unknown[];
    };

    expect(result.success).toBe(true);
    expect(result.unusedIndexes.length).toBeGreaterThanOrEqual(0);
  });

  it("pg_duplicate_indexes should silently fall back to default limit for non-numeric string", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schemaname: "public",
          tablename: "t",
          index1: "idx1",
          index1_columns: ["a"],
          index1_size: "1 MB",
          index2: "idx2",
          index2_columns: ["a"],
          index2_size: "1 MB",
          duplicate_type: "EXACT_DUPLICATE",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_duplicate_indexes")!;
    const result = (await tool.handler({ limit: "abc" }, mockContext)) as {
      success: boolean;
      duplicateIndexes: unknown[];
    };

    expect(result.success).toBe(true);
    expect(result.duplicateIndexes.length).toBeGreaterThanOrEqual(0);
  });

  it("pg_vacuum_stats should silently fall back to default limit for non-numeric string", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schemaname: "public",
          table_name: "t",
          live_tuples: 1,
          dead_tuples: 0,
          dead_pct: 0,
          vacuum_count: 1,
          autovacuum_count: 1,
          analyze_count: 1,
          autoanalyze_count: 1,
          xid_age: 100,
          wraparound_risk: "OK",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_vacuum_stats")!;
    const result = (await tool.handler({ limit: "abc" }, mockContext)) as {
      success: boolean;
      tables: unknown[];
    };

    expect(result.success).toBe(true);
    expect(result.tables.length).toBeGreaterThanOrEqual(0);
  });

  it("pg_locks should silently fall back to default limit for non-numeric string", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ locktype: "relation", mode: "AccessShareLock", granted: true }],
    });

    const tool = tools.find((t) => t.name === "pg_locks")!;
    const result = (await tool.handler({ limit: "abc" }, mockContext)) as {
      success: boolean;
      locks: unknown[];
    };

    expect(result.success).toBe(true);
    expect(result.locks.length).toBeGreaterThanOrEqual(0);
  });

  it("pg_seq_scan_tables should silently fall back to default limit for non-numeric string", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schemaname: "public",
          table_name: "t",
          seq_scan: "1",
          seq_tup_read: "1",
          idx_scan: "1",
          idx_tup_fetch: "1",
          seq_scan_pct: "50",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_seq_scan_tables")!;
    const result = (await tool.handler({ limit: "abc" }, mockContext)) as {
      success: boolean;
      tables: unknown[];
    };

    expect(result.success).toBe(true);
    expect(result.tables.length).toBeGreaterThanOrEqual(0);
  });

  it("pg_query_plan_stats should silently fall back to default limit for non-numeric string", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          query: "SELECT 1",
          calls: "1",
          total_plan_time: 0.1,
          mean_plan_time: 0.1,
          total_exec_time: 1,
          mean_exec_time: 1,
          rows: "1",
          plan_pct: "9",
          shared_blks_hit: "1",
          shared_blks_read: "0",
          cache_hit_pct: "100",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_query_plan_stats")!;
    const result = (await tool.handler({ limit: "abc" }, mockContext)) as {
      success: boolean;
      queryPlanStats: unknown[];
    };

    expect(result.success).toBe(true);
    expect(result.queryPlanStats.length).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// Empty params validation — structured error responses
// =============================================================================

describe("empty params structured errors", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("pg_query_plan_compare should return structured error for empty params", async () => {
    const tool = tools.find((t) => t.name === "pg_query_plan_compare")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("query1");
    expect(result.error).toContain("query2");
  });

  it("pg_partition_strategy_suggest should return structured error for empty params", async () => {
    const tool = tools.find((t) => t.name === "pg_partition_strategy_suggest")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("table");
  });
});

// =============================================================================
// performance/monitoring.ts and stats.ts — uncovered catch/error branches
// =============================================================================

describe("performance/monitoring.ts — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  const findTool = (name: string) => tools.find((t) => t.name === name)!;

  // monitoring.ts L97-101: pg_locks DB error catch
  it("pg_locks should return error on DB failure", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("connection refused"),
    );
    const tool = findTool("pg_locks");
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // monitoring.ts L41-42: pg_bloat_check schema validation
  it("pg_bloat_check should return error for nonexistent schema", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    const tool = findTool("pg_bloat_check");
    const result = (await tool.handler(
      { schema: "nonexistent" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
  });

  // monitoring.ts L185-189: pg_bloat_check DB error catch
  it("pg_bloat_check should return error on DB failure", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("connection refused"),
    );
    const tool = findTool("pg_bloat_check");
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
  });

  // monitoring.ts L224-228: pg_cache_hit_ratio DB error catch
  it("pg_cache_hit_ratio should return error on DB failure", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("connection refused"),
    );
    const tool = findTool("pg_cache_hit_ratio");
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
  });
});

describe("performance/stats.ts — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPerformanceTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPerformanceTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  const findTool = (name: string) => tools.find((t) => t.name === name)!;

  // stats.ts L162-166: pg_index_stats truncation when results hit limit
  it("pg_index_stats should indicate truncation when results hit limit", async () => {
    const rows = Array(20).fill({
      schemaname: "public",
      relname: "users",
      indexrelname: "idx_users_id",
      idx_scan: "100",
      idx_tup_read: "1000",
      idx_tup_fetch: "500",
    });
    // P154 table check (no schema specified = only table check)
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    // Main query returns exactly 50 rows (default limit)
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows });
    // Count query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: "200" }],
    });

    const tool = findTool("pg_index_stats");
    const result = (await tool.handler(
      { table: "users" },
      mockContext,
    )) as Record<string, unknown>;
    expect(result["truncated"]).toBe(true);
    expect(result["totalCount"]).toBe(200);
  });

  // stats.ts L172-176: pg_index_stats DB error catch
  it("pg_index_stats should return error on DB failure", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("connection refused"),
    );
    const tool = findTool("pg_index_stats");
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
  });

  // stats.ts L279-283: pg_table_stats truncation
  it("pg_table_stats should indicate truncation when results hit limit", async () => {
    const rows = Array(20).fill({
      schemaname: "public",
      relname: "users",
      seq_scan: "10",
      idx_scan: "100",
      n_live_tup: "5000",
      n_dead_tup: "50",
      last_vacuum: null,
      last_autovacuum: null,
      last_analyze: null,
    });
    // Main query
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows });
    // Count query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: "150" }],
    });

    const tool = findTool("pg_table_stats");
    const result = (await tool.handler({}, mockContext)) as Record<
      string,
      unknown
    >;
    expect(result["truncated"]).toBe(true);
    expect(result["totalCount"]).toBe(150);
  });

  // stats.ts L289-293: pg_table_stats DB error catch
  it("pg_table_stats should return error on DB failure", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("connection refused"),
    );
    const tool = findTool("pg_table_stats");
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
  });

  // stats.ts L366-370: pg_stat_statements truncation (default limit is 10)
  it("pg_stat_statements should indicate truncation when results hit limit", async () => {
    const rows = Array(10).fill({
      queryid: "12345",
      query: "SELECT 1",
      calls: "100",
      total_exec_time: "500",
      mean_exec_time: "5",
      min_exec_time: "1",
      max_exec_time: "20",
      rows: "100",
    });
    // Main query
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows });
    // Count query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: "300" }],
    });

    const tool = findTool("pg_stat_statements");
    const result = (await tool.handler({}, mockContext)) as Record<
      string,
      unknown
    >;
    expect(result["truncated"]).toBe(true);
    expect(result["totalCount"]).toBe(300);
  });

  // stats.ts L373-377: pg_stat_statements DB error catch
  it("pg_stat_statements should return error on DB failure", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("connection refused"),
    );
    const tool = findTool("pg_stat_statements");
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
  });
});
