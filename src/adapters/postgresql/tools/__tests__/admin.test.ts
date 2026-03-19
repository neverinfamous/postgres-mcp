/**
 * postgres-mcp - Admin Tools Unit Tests
 *
 * Tests for PostgreSQL admin tools with focus on
 * VACUUM, ANALYZE, REINDEX, and configuration operations.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAdminTools } from "../admin/index.js";
import type { PostgresAdapter } from "../../PostgresAdapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../__tests__/mocks/index.js";

describe("getAdminTools", () => {
  let adapter: PostgresAdapter;
  let tools: ReturnType<typeof getAdminTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockPostgresAdapter() as unknown as PostgresAdapter;
    tools = getAdminTools(adapter);
  });

  it("should return 10 admin tools", () => {
    expect(tools).toHaveLength(10);
  });

  it("should have all expected tool names", () => {
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("pg_vacuum");
    expect(toolNames).toContain("pg_vacuum_analyze");
    expect(toolNames).toContain("pg_analyze");
    expect(toolNames).toContain("pg_reindex");
    expect(toolNames).toContain("pg_terminate_backend");
    expect(toolNames).toContain("pg_cancel_backend");
    expect(toolNames).toContain("pg_reload_conf");
    expect(toolNames).toContain("pg_set_config");
    expect(toolNames).toContain("pg_reset_stats");
    expect(toolNames).toContain("pg_cluster");
  });

  it("should have group set to admin for all tools", () => {
    for (const tool of tools) {
      expect(tool.group).toBe("admin");
    }
  });

  it("should have handler function for all tools", () => {
    for (const tool of tools) {
      expect(typeof tool.handler).toBe("function");
    }
  });
});

describe("pg_vacuum", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getAdminTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getAdminTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should vacuum all tables when no params", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_vacuum")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      message: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith("VACUUM ");
    expect(result.success).toBe(true);
    expect(result.message).toContain("completed");
  });

  it("should vacuum specific table", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_vacuum")!;
    const result = (await tool.handler({ table: "users" }, mockContext)) as {
      success: boolean;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith('VACUUM "users"');
    expect(result.success).toBe(true);
  });

  it("should vacuum with schema qualified table", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_vacuum")!;
    await tool.handler({ table: "users", schema: "public" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'VACUUM "public"."users"',
    );
  });

  it("should run VACUUM FULL when full=true", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_vacuum")!;
    const result = (await tool.handler({ full: true }, mockContext)) as {
      success: boolean;
      message: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith("VACUUM FULL ");
    expect(result.message).toContain("FULL");
  });

  it("should run VACUUM VERBOSE when verbose=true", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_vacuum")!;
    await tool.handler({ verbose: true }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith("VACUUM VERBOSE ");
  });

  it("should accept undefined (no args) and vacuum all tables", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_vacuum")!;
    const result = (await tool.handler(undefined, mockContext)) as {
      success: boolean;
      message: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith("VACUUM ");
    expect(result.success).toBe(true);
  });

  it("should reflect analyze flag in message", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_vacuum")!;
    const result = (await tool.handler({ analyze: true }, mockContext)) as {
      success: boolean;
      message: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith("VACUUM ANALYZE ");
    expect(result.message).toBe("VACUUM ANALYZE completed");
  });

  it("should reflect both FULL and ANALYZE in message", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_vacuum")!;
    const result = (await tool.handler(
      { full: true, analyze: true },
      mockContext,
    )) as {
      success: boolean;
      message: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "VACUUM FULL ANALYZE ",
    );
    expect(result.message).toBe("VACUUM FULL ANALYZE completed");
  });

  it("should include verbose hint when verbose=true", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_vacuum")!;
    const result = (await tool.handler({ verbose: true }, mockContext)) as {
      success: boolean;
      hint: string;
    };

    expect(result.hint).toBe(
      "Verbose output written to PostgreSQL server logs",
    );
  });

  it("should echo back table and schema in response", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_vacuum")!;
    const result = (await tool.handler(
      { table: "users", schema: "public" },
      mockContext,
    )) as {
      success: boolean;
      table: string;
      schema: string;
    };

    expect(result.table).toBe("users");
    expect(result.schema).toBe("public");
  });

  it("should expose parameters in schema for MCP visibility", () => {
    const tool = tools.find((t) => t.name === "pg_vacuum")!;
    const schema = tool.inputSchema as { shape?: Record<string, unknown> };

    expect(schema.shape).toBeDefined();
    expect(schema.shape?.["table"]).toBeDefined();
    expect(schema.shape?.["schema"]).toBeDefined();
    expect(schema.shape?.["full"]).toBeDefined();
    expect(schema.shape?.["verbose"]).toBeDefined();
  });
});

describe("pg_vacuum_analyze", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getAdminTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getAdminTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should run VACUUM ANALYZE on all tables", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_vacuum_analyze")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      message: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith("VACUUM ANALYZE ");
    expect(result.success).toBe(true);
    expect(result.message).toBe("VACUUM ANALYZE completed");
  });

  it("should run VACUUM ANALYZE on specific table", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_vacuum_analyze")!;
    await tool.handler({ table: "orders" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'VACUUM ANALYZE "orders"',
    );
  });

  it("should run VACUUM VERBOSE ANALYZE", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_vacuum_analyze")!;
    await tool.handler({ verbose: true, table: "users" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'VACUUM VERBOSE ANALYZE "users"',
    );
  });

  it("should accept undefined (no args) and vacuum analyze all tables", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_vacuum_analyze")!;
    const result = (await tool.handler(undefined, mockContext)) as {
      success: boolean;
      message: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith("VACUUM ANALYZE ");
    expect(result.success).toBe(true);
  });

  it("should run VACUUM FULL ANALYZE when full=true", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_vacuum_analyze")!;
    const result = (await tool.handler({ full: true }, mockContext)) as {
      success: boolean;
      message: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "VACUUM FULL ANALYZE ",
    );
    expect(result.message).toBe("VACUUM FULL ANALYZE completed");
  });
});

describe("pg_analyze", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getAdminTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getAdminTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should analyze all tables", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_analyze")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      message: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith("ANALYZE ");
    expect(result.success).toBe(true);
    expect(result.message).toBe("ANALYZE completed");
  });

  it("should analyze specific table", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_analyze")!;
    await tool.handler({ table: "products" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith('ANALYZE "products"');
  });

  it("should analyze specific columns", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_analyze")!;
    await tool.handler(
      { table: "users", columns: ["email", "created_at"] },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'ANALYZE "users"("email", "created_at")',
    );
  });

  it("should accept undefined (no args) and analyze all tables", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_analyze")!;
    const result = (await tool.handler(undefined, mockContext)) as {
      success: boolean;
      message: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith("ANALYZE ");
    expect(result.success).toBe(true);
  });

  it("should expose parameters in schema for MCP visibility", () => {
    const tool = tools.find((t) => t.name === "pg_analyze")!;
    const schema = tool.inputSchema as { shape?: Record<string, unknown> };

    expect(schema.shape).toBeDefined();
    expect(schema.shape?.["table"]).toBeDefined();
    expect(schema.shape?.["schema"]).toBeDefined();
    expect(schema.shape?.["columns"]).toBeDefined();
  });

  it("should return structured error when columns specified without table", async () => {
    const tool = tools.find((t) => t.name === "pg_analyze")!;

    const result = (await tool.handler(
      { columns: ["email"] },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toBe("table is required when columns is specified");
  });
});

describe("pg_reindex", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getAdminTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getAdminTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should reindex a table", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_reindex")!;
    const result = (await tool.handler(
      { target: "table", name: "users" },
      mockContext,
    )) as {
      success: boolean;
      message: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'REINDEX TABLE "users"',
    );
    expect(result.success).toBe(true);
    expect(result.message).toBe("Reindexed table: users");
  });

  it("should reindex an index", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_reindex")!;
    await tool.handler(
      { target: "index", name: "idx_users_email" },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'REINDEX INDEX "idx_users_email"',
    );
  });

  it("should reindex concurrently", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_reindex")!;
    await tool.handler(
      { target: "table", name: "users", concurrently: true },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'REINDEX TABLE CONCURRENTLY "users"',
    );
  });

  it("should reindex database with auto-default to current database", async () => {
    // First call returns current database name
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ current_database: "testdb" }],
    });
    // Second call is the actual REINDEX
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_reindex")!;
    const result = (await tool.handler(
      { target: "database" },
      mockContext,
    )) as {
      success: boolean;
      message: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "SELECT current_database()",
    );
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'REINDEX DATABASE "testdb"',
    );
    expect(result.success).toBe(true);
    expect(result.message).toBe("Reindexed database: testdb");
  });

  it("should expose parameters in schema for MCP visibility", () => {
    const tool = tools.find((t) => t.name === "pg_reindex")!;
    const schema = tool.inputSchema as { shape?: Record<string, unknown> };

    expect(schema.shape).toBeDefined();
    expect(schema.shape?.["target"]).toBeDefined();
    expect(schema.shape?.["name"]).toBeDefined();
    expect(schema.shape?.["concurrently"]).toBeDefined();
  });
});

describe("pg_terminate_backend", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getAdminTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getAdminTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should terminate a backend", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ pg_terminate_backend: true }],
    });

    const tool = tools.find((t) => t.name === "pg_terminate_backend")!;
    const result = (await tool.handler({ pid: 12345 }, mockContext)) as {
      success: boolean;
      pid: number;
      message: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "SELECT pg_terminate_backend($1)",
      [12345],
    );
    expect(result.success).toBe(true);
    expect(result.pid).toBe(12345);
    expect(result.message).toBe("Backend terminated");
  });

  it("should report failure when backend cannot be terminated", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ pg_terminate_backend: false }],
    });

    const tool = tools.find((t) => t.name === "pg_terminate_backend")!;
    const result = (await tool.handler({ pid: 99999 }, mockContext)) as {
      success: boolean;
      message: string;
    };

    expect(result.success).toBe(false);
    expect(result.message).toBe("Failed to terminate");
  });

  it("should expose parameters in schema for MCP visibility", () => {
    const tool = tools.find((t) => t.name === "pg_terminate_backend")!;
    const schema = tool.inputSchema as { shape?: Record<string, unknown> };

    expect(schema.shape).toBeDefined();
    expect(schema.shape?.["pid"]).toBeDefined();
  });
});

describe("pg_cancel_backend", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getAdminTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getAdminTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should cancel a backend query", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ pg_cancel_backend: true }],
    });

    const tool = tools.find((t) => t.name === "pg_cancel_backend")!;
    const result = (await tool.handler({ pid: 12345 }, mockContext)) as {
      success: boolean;
      pid: number;
      message: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "SELECT pg_cancel_backend($1)",
      [12345],
    );
    expect(result.success).toBe(true);
    expect(result.message).toBe("Query cancelled");
  });

  it("should report failure when query cannot be cancelled", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ pg_cancel_backend: false }],
    });

    const tool = tools.find((t) => t.name === "pg_cancel_backend")!;
    const result = (await tool.handler({ pid: 99999 }, mockContext)) as {
      success: boolean;
      message: string;
    };

    expect(result.success).toBe(false);
    expect(result.message).toBe("Failed to cancel");
  });

  it("should expose parameters in schema for MCP visibility", () => {
    const tool = tools.find((t) => t.name === "pg_cancel_backend")!;
    const schema = tool.inputSchema as { shape?: Record<string, unknown> };

    expect(schema.shape).toBeDefined();
    expect(schema.shape?.["pid"]).toBeDefined();
  });
});

describe("pg_reload_conf", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getAdminTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getAdminTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should reload configuration", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ pg_reload_conf: true }],
    });

    const tool = tools.find((t) => t.name === "pg_reload_conf")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      message: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "SELECT pg_reload_conf()",
    );
    expect(result.success).toBe(true);
    expect(result.message).toBe("Configuration reloaded");
  });
});

describe("pg_set_config", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getAdminTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getAdminTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should set a configuration parameter", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ set_config: "100MB" }],
    });

    const tool = tools.find((t) => t.name === "pg_set_config")!;
    const result = (await tool.handler(
      {
        name: "work_mem",
        value: "100MB",
      },
      mockContext,
    )) as {
      success: boolean;
      parameter: string;
      value: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "SELECT set_config($1, $2, $3)",
      ["work_mem", "100MB", false],
    );
    expect(result.success).toBe(true);
    expect(result.parameter).toBe("work_mem");
    expect(result.value).toBe("100MB");
  });

  it("should set config locally when isLocal=true", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ set_config: "on" }],
    });

    const tool = tools.find((t) => t.name === "pg_set_config")!;
    await tool.handler(
      {
        name: "enable_seqscan",
        value: "on",
        isLocal: true,
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "SELECT set_config($1, $2, $3)",
      ["enable_seqscan", "on", true],
    );
  });

  it("should expose parameters in schema for MCP visibility", () => {
    const tool = tools.find((t) => t.name === "pg_set_config")!;
    const schema = tool.inputSchema as { shape?: Record<string, unknown> };

    expect(schema.shape).toBeDefined();
    expect(schema.shape?.["name"]).toBeDefined();
    expect(schema.shape?.["value"]).toBeDefined();
    expect(schema.shape?.["isLocal"]).toBeDefined();
  });
});

describe("pg_reset_stats", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getAdminTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getAdminTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should reset statistics", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_reset_stats")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      message: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "SELECT pg_stat_reset()",
    );
    expect(result.success).toBe(true);
    expect(result.message).toBe("Statistics reset");
  });

  it("should reset all statistics when type=all", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_reset_stats")!;
    await tool.handler({ type: "all" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "SELECT pg_stat_reset()",
    );
  });
});

describe("pg_cluster", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getAdminTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getAdminTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should cluster a table on an index", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_cluster")!;
    const result = (await tool.handler(
      {
        table: "users",
        index: "idx_users_created",
      },
      mockContext,
    )) as {
      success: boolean;
      message: string;
      table: string;
      index: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'CLUSTER "users" USING "idx_users_created"',
    );
    expect(result.success).toBe(true);
    expect(result.message).toBe(
      "Clustered users using index idx_users_created",
    );
    expect(result.table).toBe("users");
    expect(result.index).toBe("idx_users_created");
  });

  it("should cluster with schema qualified table", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_cluster")!;
    await tool.handler(
      {
        table: "users",
        schema: "app",
        index: "idx_users_email",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'CLUSTER "app"."users" USING "idx_users_email"',
    );
  });

  it("should re-cluster all previously-clustered tables when no args", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_cluster")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      message: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith("CLUSTER");
    expect(result.success).toBe(true);
    expect(result.message).toBe("Re-clustered all previously-clustered tables");
  });

  it("should accept undefined (no args) and re-cluster all tables", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_cluster")!;
    const result = (await tool.handler(undefined, mockContext)) as {
      success: boolean;
      message: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith("CLUSTER");
    expect(result.success).toBe(true);
  });

  it("should expose parameters in schema for MCP visibility", () => {
    const tool = tools.find((t) => t.name === "pg_cluster")!;
    const schema = tool.inputSchema as { shape?: Record<string, unknown> };

    expect(schema.shape).toBeDefined();
    expect(schema.shape?.["table"]).toBeDefined();
    expect(schema.shape?.["index"]).toBeDefined();
    expect(schema.shape?.["schema"]).toBeDefined();
  });

  it("should return structured error when table specified without index", async () => {
    const tool = tools.find((t) => t.name === "pg_cluster")!;

    const result = (await tool.handler({ table: "users" }, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain(
      "table and index must both be specified together",
    );
  });

  it("should return structured error when index specified without table", async () => {
    const tool = tools.find((t) => t.name === "pg_cluster")!;

    const result = (await tool.handler(
      { index: "idx_users_email" },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain(
      "table and index must both be specified together",
    );
  });
});

// =============================================================================
// Structured Error Handling (parsePostgresError)
// =============================================================================

describe("Structured Error Handling (formatPostgresError)", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getAdminTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getAdminTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return structured error for 42P01 table-not-found on pg_vacuum", async () => {
    const pgError = new Error(
      'relation "nonexistent" does not exist',
    ) as Error & { code: string };
    (pgError as unknown as Record<string, unknown>)["code"] = "42P01";
    mockAdapter.executeQuery.mockRejectedValue(pgError);

    const tool = tools.find((t) => t.name === "pg_vacuum")!;

    const result = (await tool.handler(
      { table: "nonexistent" },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found.*pg_list_tables/i);
  });

  it("should return structured error for 42P01 table-not-found on pg_vacuum_analyze", async () => {
    const pgError = new Error(
      'relation "nonexistent" does not exist',
    ) as Error & { code: string };
    (pgError as unknown as Record<string, unknown>)["code"] = "42P01";
    mockAdapter.executeQuery.mockRejectedValue(pgError);

    const tool = tools.find((t) => t.name === "pg_vacuum_analyze")!;

    const result = (await tool.handler(
      { table: "nonexistent" },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found.*pg_list_tables/i);
  });

  it("should return structured error for 42P01 table-not-found on pg_analyze", async () => {
    const pgError = new Error(
      'relation "nonexistent" does not exist',
    ) as Error & { code: string };
    (pgError as unknown as Record<string, unknown>)["code"] = "42P01";
    mockAdapter.executeQuery.mockRejectedValue(pgError);

    const tool = tools.find((t) => t.name === "pg_analyze")!;

    const result = (await tool.handler(
      { table: "nonexistent" },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found.*pg_list_tables/i);
  });

  it("should return structured error for 42P01 table-not-found on pg_reindex", async () => {
    const pgError = new Error(
      'relation "nonexistent" does not exist',
    ) as Error & { code: string };
    (pgError as unknown as Record<string, unknown>)["code"] = "42P01";
    mockAdapter.executeQuery.mockRejectedValue(pgError);

    const tool = tools.find((t) => t.name === "pg_reindex")!;

    const result = (await tool.handler(
      { target: "table", name: "nonexistent" },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found.*pg_list_tables/i);
  });

  it("should return structured error for pg_set_config with invalid parameter", async () => {
    const pgError = new Error(
      'unrecognized configuration parameter "nonexistent_param"',
    ) as Error & { code: string };
    (pgError as unknown as Record<string, unknown>)["code"] = "42704";
    mockAdapter.executeQuery.mockRejectedValue(pgError);

    const tool = tools.find((t) => t.name === "pg_set_config")!;

    const result = (await tool.handler(
      { name: "nonexistent_param", value: "test" },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(
      /unrecognized configuration parameter.*pg_show_settings/i,
    );
  });

  it("should return structured error for 42P01 table-not-found on pg_cluster", async () => {
    const pgError = new Error(
      'relation "nonexistent" does not exist',
    ) as Error & { code: string };
    (pgError as unknown as Record<string, unknown>)["code"] = "42P01";
    mockAdapter.executeQuery.mockRejectedValue(pgError);

    const tool = tools.find((t) => t.name === "pg_cluster")!;

    const result = (await tool.handler(
      { table: "nonexistent", index: "idx_nonexistent" },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found.*pg_list_tables/i);
  });

  it("should return structured error for 42P01 index-not-found on pg_reindex target=index", async () => {
    const pgError = new Error(
      'relation "nonexistent_index" does not exist',
    ) as Error & { code: string };
    (pgError as unknown as Record<string, unknown>)["code"] = "42P01";
    mockAdapter.executeQuery.mockRejectedValue(pgError);

    const tool = tools.find((t) => t.name === "pg_reindex")!;

    const result = (await tool.handler(
      { target: "index", name: "nonexistent_index" },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Index.*not found.*pg_get_indexes/i);
  });

  it("should return cluster-appropriate error for 42704 index-not-found on pg_cluster", async () => {
    const pgError = new Error(
      'index "nonexistent_idx" does not exist',
    ) as Error & { code: string };
    (pgError as unknown as Record<string, unknown>)["code"] = "42704";
    mockAdapter.executeQuery.mockRejectedValue(pgError);

    const tool = tools.find((t) => t.name === "pg_cluster")!;

    const result = (await tool.handler(
      { table: "users", index: "nonexistent_idx" },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Index.*not found.*pg_get_indexes/i);
    expect(result.error).not.toContain("ifExists");
  });
});

// =============================================================================
// Additional Coverage: uncovered branches
// =============================================================================

describe("admin.ts uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getAdminTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getAdminTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  // admin.ts L98: verbose hint in pg_vacuum_analyze response
  it("should include verbose hint in pg_vacuum_analyze response", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_vacuum_analyze")!;
    const result = (await tool.handler(
      { verbose: true, table: "users", schema: "public" },
      mockContext,
    )) as {
      success: boolean;
      hint: string;
      table: string;
      schema: string;
    };

    expect(result.hint).toBe(
      "Verbose output written to PostgreSQL server logs",
    );
    expect(result.table).toBe("users");
    expect(result.schema).toBe("public");
  });

  // admin.ts L248-253: reindex database when current_database returns empty rows
  it("should return error when reindex database gets no current_database result", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [], // empty result - no current_database value
    });

    const tool = tools.find((t) => t.name === "pg_reindex")!;
    const result = (await tool.handler(
      { target: "database" },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    // effectiveName becomes "" → sanitizeIdentifier("") throws
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid identifier");
  });

  // admin.ts L390,394: set_config "param" and "setting" aliases
  it("should use param alias for name in pg_set_config", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ set_config: "256MB" }],
    });

    const tool = tools.find((t) => t.name === "pg_set_config")!;
    const result = (await tool.handler(
      {
        param: "work_mem", // alias for name
        value: "256MB",
      },
      mockContext,
    )) as {
      success: boolean;
      parameter: string;
      value: string;
    };

    expect(result.success).toBe(true);
    expect(result.parameter).toBe("work_mem");
    expect(result.value).toBe("256MB");
  });

  it("should use setting alias for name in pg_set_config", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ set_config: "off" }],
    });

    const tool = tools.find((t) => t.name === "pg_set_config")!;
    const result = (await tool.handler(
      {
        setting: "enable_seqscan", // alias for name
        value: "off",
      },
      mockContext,
    )) as {
      success: boolean;
      parameter: string;
    };

    expect(result.success).toBe(true);
    expect(result.parameter).toBe("enable_seqscan");
  });

  // admin.ts L488-489: cluster preprocessor null/non-object input
  it("should handle null input in cluster preprocessor", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_cluster")!;
    const result = (await tool.handler(null, mockContext)) as {
      success: boolean;
      message: string;
    };

    expect(result.success).toBe(true);
    expect(result.message).toContain("Re-clustered");
  });

  // admin.ts L493-510: cluster tableName/indexName aliases and schema.table parsing
  it("should use tableName and indexName aliases in pg_cluster", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_cluster")!;
    const result = (await tool.handler(
      {
        tableName: "users",
        indexName: "idx_users_created",
      },
      mockContext,
    )) as {
      success: boolean;
      table: string;
      index: string;
    };

    expect(result.success).toBe(true);
    expect(result.table).toBe("users");
    expect(result.index).toBe("idx_users_created");
  });

  it("should parse schema.table format in cluster preprocessor", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_cluster")!;
    const result = (await tool.handler(
      {
        table: "myschema.users",
        index: "idx_users_email",
      },
      mockContext,
    )) as {
      success: boolean;
    };

    expect(result.success).toBe(true);
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'CLUSTER "myschema"."users" USING "idx_users_email"',
    );
  });

  it("should not override explicit schema in cluster preprocessor", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_cluster")!;
    const result = (await tool.handler(
      {
        table: "other.users",
        index: "idx_users_email",
        schema: "explicit",
      },
      mockContext,
    )) as {
      success: boolean;
    };

    expect(result.success).toBe(true);
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'CLUSTER "explicit"."users" USING "idx_users_email"',
    );
  });

  // admin.ts L471-476: reset_stats error path
  it("should handle error in pg_reset_stats", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("permission denied"),
    );

    const tool = tools.find((t) => t.name === "pg_reset_stats")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("permission denied");
  });

  // admin.ts L370-375: reload_conf error path
  it("should handle error in pg_reload_conf", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(new Error("reload failed"));

    const tool = tools.find((t) => t.name === "pg_reload_conf")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("reload failed");
  });

  // admin.ts L309-316: terminate_backend error path
  it("should handle error in pg_terminate_backend", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("insufficient privilege"),
    );

    const tool = tools.find((t) => t.name === "pg_terminate_backend")!;
    const result = (await tool.handler({ pid: 12345 }, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("insufficient privilege");
  });

  // admin.ts L341-348: cancel_backend error path
  it("should handle error in pg_cancel_backend", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("insufficient privilege"),
    );

    const tool = tools.find((t) => t.name === "pg_cancel_backend")!;
    const result = (await tool.handler({ pid: 12345 }, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("insufficient privilege");
  });
});
