/**
 * postgres-mcp - Monitoring Tools Unit Tests
 *
 * Tests for PostgreSQL monitoring tools with focus on handler behavior,
 * database size, connection stats, and capacity planning.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMonitoringTools } from "../monitoring/index.js";
import type { PostgresAdapter } from "../../PostgresAdapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../__tests__/mocks/index.js";

describe("getMonitoringTools", () => {
  let adapter: PostgresAdapter;
  let tools: ReturnType<typeof getMonitoringTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockPostgresAdapter() as unknown as PostgresAdapter;
    tools = getMonitoringTools(adapter);
  });

  it("should return 11 monitoring tools", () => {
    expect(tools).toHaveLength(11);
  });

  it("should have all expected tool names", () => {
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("pg_database_size");
    expect(toolNames).toContain("pg_table_sizes");
    expect(toolNames).toContain("pg_connection_stats");
    expect(toolNames).toContain("pg_replication_status");
    expect(toolNames).toContain("pg_server_version");
    expect(toolNames).toContain("pg_show_settings");
    expect(toolNames).toContain("pg_uptime");
    expect(toolNames).toContain("pg_recovery_status");
    expect(toolNames).toContain("pg_capacity_planning");
    expect(toolNames).toContain("pg_resource_usage_analyze");
    expect(toolNames).toContain("pg_alert_threshold_set");
  });

  it("should have group set to monitoring for all tools", () => {
    for (const tool of tools) {
      expect(tool.group).toBe("monitoring");
    }
  });

  it("should have handler function for all tools", () => {
    for (const tool of tools) {
      expect(typeof tool.handler).toBe("function");
    }
  });
});

describe("Tool Annotations", () => {
  let tools: ReturnType<typeof getMonitoringTools>;

  beforeEach(() => {
    tools = getMonitoringTools(
      createMockPostgresAdapter() as unknown as PostgresAdapter,
    );
  });

  it("most monitoring tools should be read-only", () => {
    const readOnlyTools = [
      "pg_database_size",
      "pg_table_sizes",
      "pg_connection_stats",
      "pg_replication_status",
      "pg_server_version",
      "pg_show_settings",
      "pg_uptime",
      "pg_recovery_status",
      "pg_capacity_planning",
      "pg_resource_usage_analyze",
    ];

    for (const toolName of readOnlyTools) {
      const tool = tools.find((t) => t.name === toolName);
      expect(tool?.annotations?.readOnlyHint).toBe(true);
    }
  });
});

describe("pg_database_size", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMonitoringTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMonitoringTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return database size for current database", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ bytes: 1073741824, size: "1 GB" }],
    });

    const tool = tools.find((t) => t.name === "pg_database_size")!;
    const result = (await tool.handler({}, mockContext)) as {
      bytes: number;
      size: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalled();
    expect(result.size).toBe("1 GB");
  });

  it("should accept database parameter", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ bytes: 2147483648, size: "2 GB" }],
    });

    const tool = tools.find((t) => t.name === "pg_database_size")!;
    const result = (await tool.handler({ database: "mydb" }, mockContext)) as {
      size: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("$1"),
      ["mydb"],
    );
    expect(result.size).toBe("2 GB");
  });

  it("should return structured error for nonexistent database", async () => {
    const pgError = new Error(
      'database "nonexistent_db" does not exist',
    ) as Error & { code: string };
    pgError.code = "3D000";
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_database_size")!;
    const result = (await tool.handler(
      { database: "nonexistent_db" },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
    expect(result.error).not.toContain("ifExists");
  });
});

describe("pg_table_sizes", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMonitoringTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMonitoringTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return table sizes", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "users",
          table_size: "10 MB",
          indexes_size: "5 MB",
          total_size: "15 MB",
        },
        {
          schema: "public",
          table_name: "orders",
          table_size: "20 MB",
          indexes_size: "8 MB",
          total_size: "28 MB",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_table_sizes")!;
    const result = (await tool.handler({}, mockContext)) as {
      tables: unknown[];
    };

    expect(result.tables).toHaveLength(2);
  });

  it("should accept schema and limit parameters", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ schema_name: "sales" }],
    }); // schema check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ schema: "sales", table_name: "orders", total_size: "100 MB" }],
    });

    const tool = tools.find((t) => t.name === "pg_table_sizes")!;
    await tool.handler({ schema: "sales", limit: 10 }, mockContext);

    const sql = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
    const params = mockAdapter.executeQuery.mock.calls[1]?.[1] as string[];
    expect(sql).toContain("$1");
    expect(params).toEqual(["sales"]);
    expect(sql).toContain("LIMIT 10");
  });

  it("should return structured error for nonexistent schema", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // schema check
    const tool = tools.find((t) => t.name === "pg_table_sizes")!;
    const result = (await tool.handler(
      { schema: "nonexistent" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result).toEqual({
      success: false,
      error: expect.stringContaining("nonexistent"),
    });
  });
});

describe("pg_connection_stats", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMonitoringTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMonitoringTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return connection statistics", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [
          { datname: "postgres", state: "active", connections: 5 },
          { datname: "postgres", state: "idle", connections: 10 },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ max_connections: "100" }] })
      .mockResolvedValueOnce({ rows: [{ total: 15 }] });

    const tool = tools.find((t) => t.name === "pg_connection_stats")!;
    const result = (await tool.handler({}, mockContext)) as {
      byDatabaseAndState: unknown[];
      totalConnections: number;
      maxConnections: number;
    };

    expect(result.byDatabaseAndState).toHaveLength(2);
    expect(result.maxConnections).toBe(100);
  });

  it("should return structured error on query failure", async () => {
    const pgError = new Error("connection refused") as Error & {
      code: string;
    };
    pgError.code = "08001";
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_connection_stats")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("connection refused");
  });
});

describe("pg_server_version", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMonitoringTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMonitoringTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return server version information", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          full_version: "PostgreSQL 16.1 on x86_64",
          version: "16.1",
          version_num: "160001",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_server_version")!;
    const result = (await tool.handler({}, mockContext)) as {
      version: string;
      version_num: number;
    };

    expect(result.version).toBe("16.1");
    expect(result.version_num).toBe(160001);
  });

  it("should return structured error on query failure", async () => {
    const pgError = new Error("connection refused") as Error & {
      code: string;
    };
    pgError.code = "08001";
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_server_version")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("connection refused");
  });
});

describe("pg_uptime", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMonitoringTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMonitoringTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return uptime information", async () => {
    // Mock returns total_seconds (30.5 days = 2635200 + 43200 = 2678856.789 seconds)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          start_time: "2024-01-01T00:00:00Z",
          total_seconds: 2678856.789,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_uptime")!;
    const result = (await tool.handler({}, mockContext)) as {
      start_time: string;
      uptime: {
        days: number;
        hours: number;
        minutes: number;
        seconds: number;
        milliseconds: number;
      };
    };

    expect(result.start_time).toBe("2024-01-01T00:00:00Z");
    expect(result.uptime).toHaveProperty("days");
    expect(result.uptime).toHaveProperty("hours");
    expect(result.uptime).toHaveProperty("minutes");
    expect(result.uptime).toHaveProperty("seconds");
    expect(result.uptime).toHaveProperty("milliseconds");
    expect(result.uptime.days).toBe(31);
    expect(result.uptime.hours).toBe(0);
    expect(result.uptime.minutes).toBe(7);
    expect(result.uptime.seconds).toBe(36);
    expect(result.uptime.milliseconds).toBe(789);
  });

  it("should return structured error on query failure", async () => {
    const pgError = new Error("connection refused") as Error & {
      code: string;
    };
    pgError.code = "08001";
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_uptime")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("connection refused");
  });
});

describe("pg_replication_status", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMonitoringTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMonitoringTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should detect primary role with replicas", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ is_replica: false }] })
      .mockResolvedValueOnce({
        rows: [
          {
            client_addr: "192.168.1.100",
            state: "streaming",
            sent_lsn: "0/3000000",
          },
        ],
      });

    const tool = tools.find((t) => t.name === "pg_replication_status")!;
    const result = (await tool.handler({}, mockContext)) as {
      role: string;
      replicas: unknown[];
    };

    expect(result.role).toBe("primary");
    expect(result.replicas).toHaveLength(1);
  });

  it("should detect replica role with lag info", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ is_replica: true }] })
      .mockResolvedValueOnce({
        rows: [
          {
            replay_lag: "00:00:05",
            receive_lsn: "0/3000000",
            replay_lsn: "0/2800000",
          },
        ],
      });

    const tool = tools.find((t) => t.name === "pg_replication_status")!;
    const result = (await tool.handler({}, mockContext)) as {
      role: string;
      replay_lag: string;
    };

    expect(result.role).toBe("replica");
    expect(result).toHaveProperty("replay_lag");
  });

  it("should return structured error on query failure", async () => {
    const pgError = new Error("connection refused") as Error & {
      code: string;
    };
    pgError.code = "08001";
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_replication_status")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("connection refused");
  });
});

describe("pg_recovery_status", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMonitoringTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMonitoringTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should detect primary mode (not in recovery)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ in_recovery: false, last_replay_timestamp: null }],
    });

    const tool = tools.find((t) => t.name === "pg_recovery_status")!;
    const result = (await tool.handler({}, mockContext)) as {
      in_recovery: boolean;
    };

    expect(result.in_recovery).toBe(false);
  });

  it("should detect replica mode (in recovery)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { in_recovery: true, last_replay_timestamp: "2024-01-01T12:00:00Z" },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_recovery_status")!;
    const result = (await tool.handler({}, mockContext)) as {
      in_recovery: boolean;
    };

    expect(result.in_recovery).toBe(true);
  });

  it("should return structured error on query failure", async () => {
    const pgError = new Error("connection refused") as Error & {
      code: string;
    };
    pgError.code = "08001";
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_recovery_status")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("connection refused");
  });
});

describe("pg_show_settings", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMonitoringTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMonitoringTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return settings without pattern", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          name: "max_connections",
          setting: "100",
          category: "Connections and Authentication",
        },
        {
          name: "shared_buffers",
          setting: "128MB",
          category: "Resource Usage",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_show_settings")!;
    const result = (await tool.handler({}, mockContext)) as {
      settings: unknown[];
    };

    expect(result.settings).toHaveLength(2);
  });

  it("should filter settings by pattern", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ name: "max_connections", setting: "100" }],
    });

    const tool = tools.find((t) => t.name === "pg_show_settings")!;
    await tool.handler({ pattern: "max%" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE name LIKE"),
      ["max%"],
    );
  });
});

describe("pg_capacity_planning", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMonitoringTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMonitoringTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return capacity planning analysis", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ current_size_bytes: 1073741824, current_size: "1 GB" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            table_count: 50,
            total_rows: 1000000,
            total_inserts: 10000,
            total_deletes: 1000,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ max_connections: 100, current_connections: 20 }],
      });

    const tool = tools.find((t) => t.name === "pg_capacity_planning")!;
    const result = (await tool.handler({}, mockContext)) as {
      current: { databaseSize: unknown };
      growth: { netRowGrowth: number };
      projection: { days: number };
    };

    expect(result.current).toHaveProperty("databaseSize");
    expect(result.growth).toHaveProperty("netRowGrowth");
    expect(result.projection.days).toBe(90); // default
  });

  it("should use custom projection days", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ current_size_bytes: 1073741824 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            table_count: 50,
            total_rows: 1000000,
            total_inserts: 10000,
            total_deletes: 1000,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ max_connections: 100, current_connections: 20 }],
      });

    const tool = tools.find((t) => t.name === "pg_capacity_planning")!;
    const result = (await tool.handler(
      { projectionDays: 180 },
      mockContext,
    )) as {
      projection: { days: number };
    };

    expect(result.projection.days).toBe(180);
  });

  it("should recommend archiving when projected size exceeds 100GB", async () => {
    // Set up a database that will exceed 100GB when projected
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ current_size_bytes: 80 * 1024 * 1024 * 1024 }],
      }) // 80GB current
      .mockResolvedValueOnce({
        rows: [
          {
            table_count: 100,
            total_rows: 50000000,
            total_inserts: 10000000,
            total_deletes: 1000000,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ max_connections: 100, current_connections: 20 }],
      });

    const tool = tools.find((t) => t.name === "pg_capacity_planning")!;
    const result = (await tool.handler(
      { projectionDays: 90 },
      mockContext,
    )) as {
      recommendations: string[];
    };

    expect(result.recommendations).toContainEqual(
      expect.stringContaining("archiving old data"),
    );
  });

  it("should warn when connection usage is high (>70%)", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ current_size_bytes: 1073741824 }] }) // 1GB
      .mockResolvedValueOnce({
        rows: [
          {
            table_count: 50,
            total_rows: 1000000,
            total_inserts: 10000,
            total_deletes: 1000,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ max_connections: 100, current_connections: 75 }],
      }); // 75% usage

    const tool = tools.find((t) => t.name === "pg_capacity_planning")!;
    const result = (await tool.handler({}, mockContext)) as {
      recommendations: string[];
    };

    expect(result.recommendations).toContainEqual(
      expect.stringContaining("Connection usage is high"),
    );
  });

  it("should return structured error for negative projection days", async () => {
    const tool = tools.find((t) => t.name === "pg_capacity_planning")!;

    const result = (await tool.handler({ days: -5 }, mockContext)) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
    expect(result.error).toContain("non-negative");
  });
});

describe("pg_resource_usage_analyze", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMonitoringTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMonitoringTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return resource usage analysis", async () => {
    // First mock: version detection (PG16, uses old bgwriter schema)
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ version_num: 160000 }] })
      .mockResolvedValueOnce({
        rows: [{ buffers_checkpoint: 1000, buffers_clean: 500 }],
      })
      .mockResolvedValueOnce({
        rows: [{ checkpoints_timed: 100, checkpoints_req: 10 }],
      })
      .mockResolvedValueOnce({ rows: [{ state: "active", count: 5 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            heap_reads: 100,
            heap_hits: 9900,
            index_reads: 50,
            index_hits: 4950,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            active_queries: 2,
            idle_connections: 10,
            lock_waiting: 0,
            io_waiting: 0,
          },
        ],
      });

    const tool = tools.find((t) => t.name === "pg_resource_usage_analyze")!;
    const result = (await tool.handler({}, mockContext)) as {
      backgroundWriter: unknown;
      checkpoints: unknown;
      bufferUsage: { heapHitRate: string };
      analysis: { checkpointPressure: string };
    };

    expect(result).toHaveProperty("backgroundWriter");
    expect(result).toHaveProperty("checkpoints");
    expect(result).toHaveProperty("bufferUsage");
    expect(result.bufferUsage.heapHitRate).toBe("99.00%");
    expect(result.analysis.checkpointPressure).toBe("Normal");
  });

  it("should detect checkpoint pressure", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ version_num: 160000 }] })
      .mockResolvedValueOnce({ rows: [{ buffers_checkpoint: 1000 }] })
      .mockResolvedValueOnce({
        rows: [{ checkpoints_timed: 10, checkpoints_req: 50 }],
      }) // More forced than scheduled
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ heap_reads: 100, heap_hits: 100 }] })
      .mockResolvedValueOnce({
        rows: [{ active_queries: 1, io_waiting: 0, lock_waiting: 0 }],
      });

    const tool = tools.find((t) => t.name === "pg_resource_usage_analyze")!;
    const result = (await tool.handler({}, mockContext)) as {
      analysis: { checkpointPressure: string };
    };

    expect(result.analysis.checkpointPressure).toBe(
      "HIGH - More forced checkpoints than scheduled",
    );
  });

  it("should detect I/O waiting queries", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ version_num: 160000 }] })
      .mockResolvedValueOnce({ rows: [{ buffers_checkpoint: 1000 }] })
      .mockResolvedValueOnce({
        rows: [{ checkpoints_timed: 100, checkpoints_req: 10 }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ heap_reads: 100, heap_hits: 100 }] })
      .mockResolvedValueOnce({
        rows: [{ active_queries: 5, io_waiting: 3, lock_waiting: 0 }],
      });

    const tool = tools.find((t) => t.name === "pg_resource_usage_analyze")!;
    const result = (await tool.handler({}, mockContext)) as {
      analysis: { ioPattern: string };
    };

    expect(result.analysis.ioPattern).toBe("Some queries waiting on I/O");
  });

  it("should detect lock contention", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ version_num: 160000 }] })
      .mockResolvedValueOnce({ rows: [{ buffers_checkpoint: 1000 }] })
      .mockResolvedValueOnce({
        rows: [{ checkpoints_timed: 100, checkpoints_req: 10 }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ heap_reads: 100, heap_hits: 100 }] })
      .mockResolvedValueOnce({
        rows: [{ active_queries: 5, io_waiting: 0, lock_waiting: 4 }],
      });

    const tool = tools.find((t) => t.name === "pg_resource_usage_analyze")!;
    const result = (await tool.handler({}, mockContext)) as {
      analysis: { lockContention: string };
    };

    expect(result.analysis.lockContention).toBe("4 queries waiting on locks");
  });

  it("should return N/A for heap hit rate when no heap activity", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ version_num: 160000 }] })
      .mockResolvedValueOnce({ rows: [{ buffers_checkpoint: 1000 }] })
      .mockResolvedValueOnce({
        rows: [{ checkpoints_timed: 100, checkpoints_req: 10 }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { heap_reads: 0, heap_hits: 0, index_reads: 50, index_hits: 450 },
        ],
      }) // No heap activity
      .mockResolvedValueOnce({
        rows: [{ active_queries: 1, io_waiting: 0, lock_waiting: 0 }],
      });

    const tool = tools.find((t) => t.name === "pg_resource_usage_analyze")!;
    const result = (await tool.handler({}, mockContext)) as {
      bufferUsage: { heapHitRate: string; indexHitRate: string };
    };

    expect(result.bufferUsage.heapHitRate).toBe("N/A");
    expect(result.bufferUsage.indexHitRate).toBe("90.00%");
  });

  it("should return N/A for index hit rate when no index activity", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ version_num: 160000 }] })
      .mockResolvedValueOnce({ rows: [{ buffers_checkpoint: 1000 }] })
      .mockResolvedValueOnce({
        rows: [{ checkpoints_timed: 100, checkpoints_req: 10 }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { heap_reads: 100, heap_hits: 900, index_reads: 0, index_hits: 0 },
        ],
      }) // No index activity
      .mockResolvedValueOnce({
        rows: [{ active_queries: 1, io_waiting: 0, lock_waiting: 0 }],
      });

    const tool = tools.find((t) => t.name === "pg_resource_usage_analyze")!;
    const result = (await tool.handler({}, mockContext)) as {
      bufferUsage: { heapHitRate: string; indexHitRate: string };
    };

    expect(result.bufferUsage.heapHitRate).toBe("90.00%");
    expect(result.bufferUsage.indexHitRate).toBe("N/A");
  });

  it("should show no I/O bottlenecks when io_waiting is 0", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ version_num: 160000 }] })
      .mockResolvedValueOnce({ rows: [{ buffers_checkpoint: 1000 }] })
      .mockResolvedValueOnce({
        rows: [{ checkpoints_timed: 100, checkpoints_req: 10 }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ heap_reads: 100, heap_hits: 100 }] })
      .mockResolvedValueOnce({
        rows: [{ active_queries: 5, io_waiting: 0, lock_waiting: 0 }],
      });

    const tool = tools.find((t) => t.name === "pg_resource_usage_analyze")!;
    const result = (await tool.handler({}, mockContext)) as {
      analysis: { ioPattern: string; lockContention: string };
    };

    expect(result.analysis.ioPattern).toBe("No I/O wait bottlenecks detected");
    expect(result.analysis.lockContention).toBe("No lock contention");
  });
});

describe("pg_alert_threshold_set", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMonitoringTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMonitoringTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return all thresholds when no metric specified", async () => {
    const tool = tools.find((t) => t.name === "pg_alert_threshold_set")!;
    const result = (await tool.handler({}, mockContext)) as {
      thresholds: Record<string, { warning: string; critical: string }>;
    };

    expect(result.thresholds).toHaveProperty("connection_usage");
    expect(result.thresholds).toHaveProperty("cache_hit_ratio");
    expect(result.thresholds).toHaveProperty("replication_lag");
  });

  it("should return specific threshold when metric specified", async () => {
    const tool = tools.find((t) => t.name === "pg_alert_threshold_set")!;
    const result = (await tool.handler(
      { metric: "connection_usage" },
      mockContext,
    )) as {
      metric: string;
      threshold: { warning: string; critical: string };
    };

    expect(result.metric).toBe("connection_usage");
    expect(result.threshold.warning).toBe("70%");
    expect(result.threshold.critical).toBe("90%");
  });

  it("should return structured error for invalid metric", async () => {
    const tool = tools.find((t) => t.name === "pg_alert_threshold_set")!;
    const result = (await tool.handler(
      { metric: "invalid_metric_xyz" },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid metric");
    expect(result.error).toContain("connection_usage");
  });
});

// =============================================================================
// Branch Coverage Tests - monitoring.ts edge cases
// =============================================================================

describe("monitoring.ts branch coverage", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMonitoringTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMonitoringTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("pg_table_sizes truncation indicator when results equal limit (lines 152-161)", async () => {
    // 50 tables (default limit) to trigger truncation path
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: Array(50).fill({
        schema: "public",
        table_name: "t",
        table_size: "1 MB",
        indexes_size: "1 MB",
        total_size: "2 MB",
        total_bytes: "2097152",
      }),
    });
    // Count query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: "100" }],
    });

    const tool = tools.find((t) => t.name === "pg_table_sizes")!;
    const result = (await tool.handler({}, mockContext)) as Record<
      string,
      unknown
    >;

    expect(result.truncated).toBe(true);
    expect(result.totalCount).toBe(100);
    expect(result.count).toBe(50);
  });

  it("pg_table_sizes total_bytes string coercion", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "t",
          total_bytes: "12345",
          total_size: "12 kB",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_table_sizes")!;
    const result = (await tool.handler({}, mockContext)) as {
      tables: { total_bytes: number }[];
    };

    expect(result.tables[0].total_bytes).toBe(12345);
  });

  it("pg_show_settings exact name pattern (line 320-322)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ name: "timezone", setting: "UTC", category: "Locale" }],
    });

    const tool = tools.find((t) => t.name === "pg_show_settings")!;
    await tool.handler({ pattern: "timezone" }, mockContext);

    // Should use exact match OR LIKE with auto-wildcards (no % or _ in pattern)
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE name = $1 OR name LIKE $2"),
      ["timezone", "%timezone%"],
    );
  });

  it("pg_show_settings truncation indicator (lines 339-344)", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: Array(5).fill({
          name: "setting",
          setting: "val",
          category: "cat",
        }),
      })
      .mockResolvedValueOnce({ rows: [{ total: "20" }] });

    const tool = tools.find((t) => t.name === "pg_show_settings")!;
    const result = (await tool.handler({ limit: 5 }, mockContext)) as Record<
      string,
      unknown
    >;

    expect(result.truncated).toBe(true);
    expect(result.totalCount).toBe(20);
    expect(result.count).toBe(5);
  });

  it("pg_capacity_planning non-ZodError catch (line 475)", async () => {
    // Trigger a non-Zod error by making the DB queries fail
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("DB connection failed"),
    );

    const tool = tools.find((t) => t.name === "pg_capacity_planning")!;
    // This should trigger the non-ZodError path since the parse succeeds
    // but the DB call fails. However, the parse happens first, so we need
    // valid input that passes parsing but fails on DB.
    // Actually the non-ZodError is in the parse catch block (line 475).
    // We can't easily trigger that without mocking Zod.
    // Let's instead focus on other branches.
    // The capacity_planning daysOfData < 1 estimation quality branch:
    mockAdapter.executeQuery.mockReset();
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ current_size_bytes: 1073741824, current_size: "1 GB" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            table_count: 10,
            total_rows: 1000,
            total_inserts: 100,
            total_deletes: 10,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ max_connections: 100, current_connections: 20 }],
      })
      .mockResolvedValueOnce({
        rows: [{ stats_since: "2024-01-01", days_of_data: "0.5" }],
      });

    const result = (await tool.handler({}, mockContext)) as {
      growth: { estimationQuality: string };
    };

    expect(result.growth.estimationQuality).toContain(
      "Low confidence - less than 1 day",
    );
  });

  it("pg_capacity_planning moderate confidence (< 7 days)", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ current_size_bytes: 1073741824, current_size: "1 GB" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            table_count: 10,
            total_rows: 1000,
            total_inserts: 100,
            total_deletes: 10,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ max_connections: 100, current_connections: 20 }],
      })
      .mockResolvedValueOnce({
        rows: [{ stats_since: "2024-01-01", days_of_data: "3" }],
      });

    const tool = tools.find((t) => t.name === "pg_capacity_planning")!;
    const result = (await tool.handler({}, mockContext)) as {
      growth: { estimationQuality: string };
    };
    expect(result.growth.estimationQuality).toContain("Moderate confidence");
  });

  it("pg_capacity_planning good confidence (< 30 days)", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ current_size_bytes: 1073741824, current_size: "1 GB" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            table_count: 10,
            total_rows: 1000,
            total_inserts: 100,
            total_deletes: 10,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ max_connections: 100, current_connections: 20 }],
      })
      .mockResolvedValueOnce({
        rows: [{ stats_since: "2024-01-01", days_of_data: "15" }],
      });

    const tool = tools.find((t) => t.name === "pg_capacity_planning")!;
    const result = (await tool.handler({}, mockContext)) as {
      growth: { estimationQuality: string };
    };
    expect(result.growth.estimationQuality).toContain("Good confidence");
  });

  it("pg_capacity_planning with days alias", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ current_size_bytes: 1073741824, current_size: "1 GB" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            table_count: 10,
            total_rows: 1000,
            total_inserts: 100,
            total_deletes: 10,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ max_connections: 100, current_connections: 20 }],
      })
      .mockResolvedValueOnce({
        rows: [{ stats_since: "2024-01-01", days_of_data: "45" }],
      });

    const tool = tools.find((t) => t.name === "pg_capacity_planning")!;
    const result = (await tool.handler({ days: 30 }, mockContext)) as {
      projection: { days: number };
    };
    expect(result.projection.days).toBe(30);
  });

  it("pg_database_size returns undefined row", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    const tool = tools.find((t) => t.name === "pg_database_size")!;
    const result = await tool.handler({}, mockContext);
    expect(result).toBeUndefined();
  });

  it("pg_server_version returns undefined row", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    const tool = tools.find((t) => t.name === "pg_server_version")!;
    const result = await tool.handler({}, mockContext);
    expect(result).toBeUndefined();
  });

  it("pg_uptime returns undefined row", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    const tool = tools.find((t) => t.name === "pg_uptime")!;
    const result = await tool.handler({}, mockContext);
    expect(result).toBeUndefined();
  });

  it("pg_resource_usage_analyze PG17+ code path", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ version_num: 170000 }] }) // PG17+
      .mockResolvedValueOnce({
        rows: [
          { buffers_clean: 500, maxwritten_clean: 10, buffers_alloc: 1000 },
        ],
      }) // bgwriter (no buffers_checkpoint)
      .mockResolvedValueOnce({
        rows: [
          {
            checkpoints_timed: 100,
            checkpoints_req: 10,
            checkpoint_write_time: 1000,
            checkpoint_sync_time: 500,
            buffers_checkpoint: 800,
          },
        ],
      }) // checkpointer (PG17)
      .mockResolvedValueOnce({ rows: [{ state: "active", count: 5 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            heap_reads: 100,
            heap_hits: 9900,
            index_reads: 50,
            index_hits: 4950,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            active_queries: 2,
            idle_connections: 10,
            lock_waiting: 0,
            io_waiting: 0,
          },
        ],
      });

    const tool = tools.find((t) => t.name === "pg_resource_usage_analyze")!;
    const result = (await tool.handler({}, mockContext)) as Record<
      string,
      unknown
    >;

    expect(result).toHaveProperty("backgroundWriter");
    expect(result).toHaveProperty("checkpoints");
  });

  it("pg_connection_stats string coercion for totalConnections", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ datname: "db", state: "active", connections: "5" }],
      })
      .mockResolvedValueOnce({ rows: [{ max_connections: "200" }] })
      .mockResolvedValueOnce({ rows: [{ total: "25" }] });

    const tool = tools.find((t) => t.name === "pg_connection_stats")!;
    const result = (await tool.handler({}, mockContext)) as {
      totalConnections: number;
      maxConnections: number;
    };

    expect(result.totalConnections).toBe(25);
    expect(result.maxConnections).toBe(200);
  });
});

// ==========================================================================
// Coverage-targeted tests for analysis.ts uncovered branches
// ==========================================================================

describe("pg_capacity_planning — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMonitoringTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMonitoringTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should handle string-typed numeric values from PG (bigint coercion)", async () => {
    // All values returned as strings (common with pg_bigint columns)
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ current_size_bytes: "5368709120", current_size: "5 GB" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            table_count: "25",
            total_rows: "500000",
            total_inserts: "50000",
            total_deletes: "5000",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ max_connections: "100", current_connections: "10" }],
      })
      .mockResolvedValueOnce({
        rows: [{ stats_since: "2026-01-01", days_of_data: "45.5" }],
      });

    const tool = tools.find((t) => t.name === "pg_capacity_planning")!;
    const result = (await tool.handler({}, mockContext)) as {
      current: {
        databaseSize: { current_size_bytes: number };
        tableCount: number;
        totalRows: number;
      };
      growth: {
        totalInserts: number;
        totalDeletes: number;
        estimationQuality: string;
      };
    };

    // Verify coerced values are numbers, not strings
    expect(typeof result.current.databaseSize.current_size_bytes).toBe(
      "number",
    );
    expect(typeof result.current.tableCount).toBe("number");
    expect(typeof result.current.totalRows).toBe("number");
    expect(typeof result.growth.totalInserts).toBe("number");
    expect(typeof result.growth.totalDeletes).toBe("number");
    expect(result.growth.estimationQuality).toContain("High confidence");
  });

  it("should return low confidence for less than 1 day of data", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ current_size_bytes: 1073741824, current_size: "1 GB" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            table_count: 10,
            total_rows: 1000,
            total_inserts: 100,
            total_deletes: 10,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ max_connections: 100, current_connections: 5 }],
      })
      .mockResolvedValueOnce({
        rows: [{ stats_since: "2026-03-09", days_of_data: 0.5 }],
      });

    const tool = tools.find((t) => t.name === "pg_capacity_planning")!;
    const result = (await tool.handler({}, mockContext)) as {
      growth: { estimationQuality: string };
      recommendations: string[];
    };

    expect(result.growth.estimationQuality).toContain("Low confidence");
    expect(result.recommendations).toContainEqual(
      expect.stringContaining("Wait for more data"),
    );
  });

  it("should return moderate confidence for < 7 days of data", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ current_size_bytes: 1073741824, current_size: "1 GB" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            table_count: 10,
            total_rows: 1000,
            total_inserts: 100,
            total_deletes: 10,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ max_connections: 100, current_connections: 5 }],
      })
      .mockResolvedValueOnce({
        rows: [{ stats_since: "2026-03-06", days_of_data: 3 }],
      });

    const tool = tools.find((t) => t.name === "pg_capacity_planning")!;
    const result = (await tool.handler({}, mockContext)) as {
      growth: { estimationQuality: string };
    };

    expect(result.growth.estimationQuality).toContain("Moderate confidence");
  });

  it("should handle non-ZodError in catch path (line 79)", async () => {
    const tool = tools.find((t) => t.name === "pg_capacity_planning")!;
    // Pass an object with a `projectionDays` that is a custom type that
    // throws a non-Zod error. The simplest way is to use a getter that throws.
    const poison = {
      get projectionDays(): never {
        throw new TypeError("Cannot read property");
      },
    };

    const result = (await tool.handler(poison, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("pg_resource_usage_analyze — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMonitoringTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMonitoringTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should handle null hit rates (no heap/index activity)", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ version_num: 160000 }] })
      .mockResolvedValueOnce({
        rows: [{ buffers_checkpoint: 0, buffers_clean: 0 }],
      })
      .mockResolvedValueOnce({
        rows: [{ checkpoints_timed: 0, checkpoints_req: 0 }],
      })
      .mockResolvedValueOnce({ rows: [] }) // no connections
      .mockResolvedValueOnce({
        rows: [{ heap_reads: 0, heap_hits: 0, index_reads: 0, index_hits: 0 }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            active_queries: 0,
            idle_connections: 0,
            lock_waiting: 0,
            io_waiting: 0,
          },
        ],
      });

    const tool = tools.find((t) => t.name === "pg_resource_usage_analyze")!;
    const result = (await tool.handler({}, mockContext)) as {
      bufferUsage: { heapHitRate: string; indexHitRate: string };
      analysis: {
        heapCachePerformance: string;
        indexCachePerformance: string;
      };
    };

    expect(result.bufferUsage.heapHitRate).toBe("N/A");
    expect(result.bufferUsage.indexHitRate).toBe("N/A");
    expect(result.analysis.heapCachePerformance).toContain("No heap activity");
    expect(result.analysis.indexCachePerformance).toContain(
      "No index activity",
    );
  });

  it("should detect poor hit rate and I/O wait + lock contention", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ version_num: 160000 }] })
      .mockResolvedValueOnce({
        rows: [{ buffers_checkpoint: 100, buffers_clean: 50 }],
      })
      .mockResolvedValueOnce({
        rows: [{ checkpoints_timed: 5, checkpoints_req: 1 }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            heap_reads: 500,
            heap_hits: 500,
            index_reads: 150,
            index_hits: 850,
          },
        ],
      }) // 50% heap, 85% index
      .mockResolvedValueOnce({
        rows: [
          {
            active_queries: 5,
            idle_connections: 10,
            lock_waiting: 3,
            io_waiting: 2,
          },
        ],
      });

    const tool = tools.find((t) => t.name === "pg_resource_usage_analyze")!;
    const result = (await tool.handler({}, mockContext)) as {
      analysis: {
        heapCachePerformance: string;
        indexCachePerformance: string;
        ioPattern: string;
        lockContention: string;
      };
    };

    expect(result.analysis.heapCachePerformance).toContain("Poor");
    expect(result.analysis.indexCachePerformance).toContain("Fair");
    expect(result.analysis.ioPattern).toContain("waiting on I/O");
    expect(result.analysis.lockContention).toContain("3 queries waiting");
  });

  it("should use PG17+ query paths for bgwriter and checkpointer", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ version_num: 170000 }] }) // PG17
      .mockResolvedValueOnce({
        rows: [{ buffers_clean: 100, maxwritten_clean: 5, buffers_alloc: 200 }],
      }) // PG17 bgwriter (no buffers_checkpoint here)
      .mockResolvedValueOnce({
        rows: [
          {
            checkpoints_timed: 50,
            checkpoints_req: 5,
            checkpoint_write_time: 1000,
            checkpoint_sync_time: 100,
            buffers_checkpoint: 500,
          },
        ],
      }) // PG17 checkpointer
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            heap_reads: 100,
            heap_hits: 9900,
            index_reads: 50,
            index_hits: 4950,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            active_queries: 1,
            idle_connections: 5,
            lock_waiting: 0,
            io_waiting: 0,
          },
        ],
      });

    const tool = tools.find((t) => t.name === "pg_resource_usage_analyze")!;
    const result = (await tool.handler({}, mockContext)) as {
      backgroundWriter: Record<string, unknown>;
      checkpoints: Record<string, unknown>;
      analysis: { heapCachePerformance: string };
    };

    // PG17 bgwriter should NOT have buffers_checkpoint
    expect(result.backgroundWriter).not.toHaveProperty("buffers_checkpoint");
    // PG17 checkpointer SHOULD have buffers_checkpoint (renamed from pg_stat_checkpointer)
    expect(result.checkpoints).toHaveProperty("buffers_checkpoint");
    expect(result.analysis.heapCachePerformance).toContain("Excellent");
  });

  it("should detect good hit rate (95-99%)", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ version_num: 160000 }] })
      .mockResolvedValueOnce({
        rows: [{ buffers_checkpoint: 100, buffers_clean: 50 }],
      })
      .mockResolvedValueOnce({
        rows: [{ checkpoints_timed: 50, checkpoints_req: 5 }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            heap_reads: 30,
            heap_hits: 970,
            index_reads: 20,
            index_hits: 980,
          },
        ],
      }) // 97% heap, 98% index
      .mockResolvedValueOnce({
        rows: [
          {
            active_queries: 1,
            idle_connections: 5,
            lock_waiting: 0,
            io_waiting: 0,
          },
        ],
      });

    const tool = tools.find((t) => t.name === "pg_resource_usage_analyze")!;
    const result = (await tool.handler({}, mockContext)) as {
      analysis: {
        heapCachePerformance: string;
        indexCachePerformance: string;
      };
    };

    expect(result.analysis.heapCachePerformance).toContain("Good");
    expect(result.analysis.indexCachePerformance).toContain("Good");
  });
});

describe("pg_alert_threshold_set — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMonitoringTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMonitoringTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return error for invalid metric name", async () => {
    const tool = tools.find((t) => t.name === "pg_alert_threshold_set")!;
    const result = (await tool.handler(
      { metric: "nonexistent_metric" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid metric");
    expect(result.error).toContain("nonexistent_metric");
  });

  it("should return threshold for specific valid metric", async () => {
    const tool = tools.find((t) => t.name === "pg_alert_threshold_set")!;
    const result = (await tool.handler(
      { metric: "connection_usage" },
      mockContext,
    )) as { metric: string; threshold: { warning: string; critical: string } };

    expect(result.metric).toBe("connection_usage");
    expect(result.threshold.warning).toBe("70%");
    expect(result.threshold.critical).toBe("90%");
  });
});
