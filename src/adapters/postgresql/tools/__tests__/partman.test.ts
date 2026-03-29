/**
 * postgres-mcp - Partman Tools Unit Tests
 *
 * Tests for PostgreSQL pg_partman extension management and operations tools.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PostgresAdapter } from "../../postgres-adapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../__tests__/mocks/index.js";
import { getPartmanTools } from "../partman/index.js";

describe("getPartmanTools", () => {
  let adapter: PostgresAdapter;
  let tools: ReturnType<typeof getPartmanTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockPostgresAdapter() as unknown as PostgresAdapter;
    tools = getPartmanTools(adapter);
  });

  it("should return 10 partman tools", () => {
    expect(tools).toHaveLength(10);
  });

  it("should have all expected tool names", () => {
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("pg_partman_create_extension");
    expect(toolNames).toContain("pg_partman_create_parent");
    expect(toolNames).toContain("pg_partman_run_maintenance");
    expect(toolNames).toContain("pg_partman_show_partitions");
    expect(toolNames).toContain("pg_partman_show_config");
    expect(toolNames).toContain("pg_partman_check_default");
    expect(toolNames).toContain("pg_partman_partition_data");
    expect(toolNames).toContain("pg_partman_set_retention");
    expect(toolNames).toContain("pg_partman_undo_partition");
    expect(toolNames).toContain("pg_partman_analyze_partition_health");
  });

  it("should have group set to partman for all tools", () => {
    for (const tool of tools) {
      expect(tool.group).toBe("partman");
    }
  });
});

describe("pg_partman_create_extension", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartmanTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartmanTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should enable pg_partman extension", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_create_extension")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      message: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "CREATE EXTENSION IF NOT EXISTS pg_partman",
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain("pg_partman");
  });
});

describe("pg_partman_create_parent", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartmanTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartmanTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should create a partition set with required parameters", async () => {
    // Mock schema detection
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "public" }],
    });
    // Mock create_parent result
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_create_parent")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
        controlColumn: "created_at",
        interval: "1 month",
      },
      mockContext,
    )) as { success: boolean; parentTable: string; controlColumn: string };

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        "create_parent(p_parent_table := 'public.events', p_control := 'created_at', p_interval := '1 month')",
      ),
    );
    expect(result.success).toBe(true);
    expect(result.parentTable).toBe("public.events");
    expect(result.controlColumn).toBe("created_at");
  });

  it("should include premake parameter when specified", async () => {
    // Mock schema detection
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "public" }],
    });
    // Mock create_parent result
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_create_parent")!;
    const result = (await tool.handler(
      {
        parentTable: "public.logs",
        controlColumn: "ts",
        interval: "1 day",
        premake: 10,
      },
      mockContext,
    )) as { premake: number };

    const callArg = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
    expect(callArg).toContain("p_premake := 10");
    expect(result.premake).toBe(10);
  });

  it("should include start partition when specified", async () => {
    // Mock schema detection
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "public" }],
    });
    // Mock create_parent result
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_create_parent")!;
    await tool.handler(
      {
        parentTable: "public.logs",
        controlColumn: "ts",
        interval: "1 day",
        startPartition: "2024-01-01",
      },
      mockContext,
    );

    const callArg = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
    expect(callArg).toContain("p_start_partition := '2024-01-01'");
  });

  it("should handle 'now' as startPartition", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "public" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_create_parent")!;
    await tool.handler(
      {
        parentTable: "public.logs",
        controlColumn: "ts",
        interval: "1 day",
        startPartition: "now",
      },
      mockContext,
    );

    const callArg = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
    expect(callArg).toContain("p_start_partition := NOW()::text");
  });

  it("should include epochType when specified", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "public" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_create_parent")!;
    await tool.handler(
      {
        parentTable: "public.logs",
        controlColumn: "ts",
        interval: "1 day",
        epochType: "seconds",
      },
      mockContext,
    );

    const callArg = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
    expect(callArg).toContain("p_epoch := 'seconds'");
  });

  it("should include template table when specified", async () => {
    // Mock schema detection
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "public" }],
    });
    // Mock create_parent result
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_create_parent")!;
    await tool.handler(
      {
        parentTable: "public.logs",
        controlColumn: "ts",
        interval: "1 day",
        templateTable: "public.logs_template",
      },
      mockContext,
    );

    const callArg = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
    expect(callArg).toContain("p_template_table := 'public.logs_template'");
  });

  it("should include default partition option when specified", async () => {
    // Mock schema detection
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "public" }],
    });
    // Mock create_parent result
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_create_parent")!;
    await tool.handler(
      {
        parentTable: "public.logs",
        controlColumn: "ts",
        interval: "1 day",
        defaultPartition: true,
      },
      mockContext,
    );

    const callArg = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
    expect(callArg).toContain("p_default_table := true");
  });

  it("should accept table and column aliases for parentTable and controlColumn", async () => {
    // Mock schema detection
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "public" }],
    });
    // Mock create_parent result
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_create_parent")!;
    const result = (await tool.handler(
      {
        table: "public.events", // alias for parentTable
        column: "created_at", // alias for controlColumn
        interval: "1 month",
      },
      mockContext,
    )) as { success: boolean; parentTable: string; controlColumn: string };

    const callArg = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
    expect(callArg).toContain("p_parent_table := 'public.events'");
    expect(callArg).toContain("p_control := 'created_at'");
    expect(result.success).toBe(true);
    expect(result.parentTable).toBe("public.events");
    expect(result.controlColumn).toBe("created_at");
  });

  it("should return error for duplicate key (already managed by pg_partman)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "public" }],
    });
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("duplicate key value violates unique constraint"),
    );

    const tool = tools.find((t) => t.name === "pg_partman_create_parent")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
        controlColumn: "created_at",
        interval: "1 month",
      },
      mockContext,
    )) as { success: boolean; error: string; hint: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("already managed by pg_partman");
    expect(result.suggestion).toBeDefined();
  });

  it("should return error when table does not exist", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "public" }],
    });
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error('relation "public.nonexistent" does not exist'),
    );

    const tool = tools.find((t) => t.name === "pg_partman_create_parent")!;
    const result = (await tool.handler(
      {
        parentTable: "public.nonexistent",
        controlColumn: "ts",
        interval: "1 day",
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
  });

  it("should return error when table is not partitioned", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "public" }],
    });
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("table is not partitioned"),
    );

    const tool = tools.find((t) => t.name === "pg_partman_create_parent")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
        controlColumn: "ts",
        interval: "1 day",
      },
      mockContext,
    )) as { success: boolean; error: string; hint: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not a partitioned table");
    expect(result.details?.hint).toContain("PARTITION BY");
  });

  it("should return error for invalid interval format", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "public" }],
    });
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error('invalid input syntax for type interval: "999xyz"'),
    );

    const tool = tools.find((t) => t.name === "pg_partman_create_parent")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
        controlColumn: "ts",
        interval: "999xyz", // Invalid interval format that passes Zod string check
      },
      mockContext,
    )) as { success: boolean; error: string; examples: string[] };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid interval format");
    expect(result.details?.examples).toContain("1 day");
  });

  it("should return error when control column lacks NOT NULL constraint", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "public" }],
    });
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("control column cannot be null"),
    );

    const tool = tools.find((t) => t.name === "pg_partman_create_parent")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
        controlColumn: "ts",
        interval: "1 day",
      },
      mockContext,
    )) as { success: boolean; error: string; hint: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("NOT NULL constraint");
    expect(result.error).toContain("NOT NULL");
  });

  it("should return error when table does not exist globally", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "public" }],
    });
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("relation does not exist"),
    );

    const tool = tools.find((t) => t.name === "pg_partman_create_parent")!;
    const result = (await tool.handler(
      { parentTable: "public.events", controlColumn: "ts", interval: "1 day" },
      mockContext,
    )) as { success: boolean; error: string; hint: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
  });

  it("should return error when table lacks partition setup but exists", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "public" }],
    });
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("Unable to find given parent table"),
    );

    const tool = tools.find((t) => t.name === "pg_partman_create_parent")!;
    const result = (await tool.handler(
      { parentTable: "public.events", controlColumn: "ts", interval: "1 day" },
      mockContext,
    )) as { success: boolean; error: string; hint: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
  });

  it("should return error when partitioning type is wrong", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "public" }],
    });
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error(
        "must have created the given parent table as ranged or list partitioned",
      ),
    );

    const tool = tools.find((t) => t.name === "pg_partman_create_parent")!;
    const result = (await tool.handler(
      { parentTable: "public.events", controlColumn: "ts", interval: "1 day" },
      mockContext,
    )) as { success: boolean; error: string; hint: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain(
      "must be created as RANGE or LIST partitioned",
    );
  });

  it("should handle general pg_partman_create_parent db error", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "public" }],
    });
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("random db error on create parent"),
    );

    const tool = tools.find((t) => t.name === "pg_partman_create_parent")!;
    const result = (await tool.handler(
      { parentTable: "public.events", controlColumn: "ts", interval: "1 day" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("random db error on create parent");
  });
});

describe("pg_partman_run_maintenance", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartmanTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartmanTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should run maintenance for all partition sets", async () => {
    // Mock schema detection
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // Mock config query (new: iterates configs for all)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ parent_table: "public.events" }],
    });
    // Mock table exists check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Mock run_maintenance for the table
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_run_maintenance")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      parentTable: string;
      maintained: string[];
      message: string;
    };

    expect(result.success).toBe(true);
    expect(result.parentTable).toBe("all");
    expect(result.maintained).toContain("public.events");
    expect(result.message).toContain("partition sets");
  });

  it("should run maintenance for specific table", async () => {
    // Mock schema detection
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // Mock config check - table is managed
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Mock run_maintenance
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_run_maintenance")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
      },
      mockContext,
    )) as { parentTable: string; message: string };

    const callArg = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(callArg).toContain("p_parent_table := 'public.events'");
    expect(result.parentTable).toBe("public.events");
    expect(result.message).toContain("public.events");
  });

  it("should include analyze option when specified", async () => {
    // Mock schema detection
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // Mock config check - table is managed
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Mock run_maintenance
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_run_maintenance")!;
    await tool.handler(
      {
        parentTable: "public.events",
        analyze: true,
      },
      mockContext,
    );

    const callArg = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(callArg).toContain("p_analyze := true");
  });

  it("should improve error on missing child partitions (table-specific)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("Child table given does not exist <NULL>"),
    );

    const tool = tools.find((t) => t.name === "pg_partman_run_maintenance")!;
    const result = (await tool.handler(
      { parentTable: "public.events" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(true);
    expect(result.message).toContain(
      "Partition set has no child partitions yet.",
    );
  });

  it("should improve error on missing child partitions (all sets)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ parent_table: "public.events" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("Child table given does not exist <NULL>"),
    );

    const tool = tools.find((t) => t.name === "pg_partman_run_maintenance")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      errors: Array<{ reason: string }>;
    };

    expect(result.success).toBe(true); // Since it treats missing partitions as maintained (idempotent)
    expect((result as any).maintained).toContain("public.events");
  });
});

describe("pg_partman_show_partitions", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartmanTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartmanTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should list partitions for a table", async () => {
    // Mock schema detection
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // Mock config check - table is managed by pg_partman
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Mock COUNT query for pagination
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 2 }],
    });
    // Mock show_partitions result
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          partition_schemaname: "public",
          partition_tablename: "events_p2024_01",
        },
        {
          partition_schemaname: "public",
          partition_tablename: "events_p2024_02",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_partman_show_partitions")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
      },
      mockContext,
    )) as { partitions: unknown[]; count: number; parentTable: string };

    const callArg = mockAdapter.executeQuery.mock.calls[3]?.[0] as string;
    expect(callArg).toContain("show_partitions");
    expect(callArg).toContain("p_parent_table := 'public.events'");
    expect(result.partitions).toHaveLength(2);
    expect(result.count).toBe(2);
    expect(result.parentTable).toBe("public.events");
  });

  it("should include default partition when requested", async () => {
    // Mock schema detection
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // Mock config check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Mock COUNT query for pagination
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 0 }],
    });
    // Mock show_partitions result
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_show_partitions")!;
    await tool.handler(
      {
        parentTable: "public.events",
        includeDefault: true,
      },
      mockContext,
    );

    const callArg = mockAdapter.executeQuery.mock.calls[3]?.[0] as string;
    expect(callArg).toContain("p_include_default := true");
  });

  it("should handle truncation properly", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ total: 60 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: Array.from({ length: 50 }),
    });

    const tool = tools.find((t) => t.name === "pg_partman_show_partitions")!;
    const result = (await tool.handler(
      { parentTable: "public.events" },
      mockContext,
    )) as { truncated: boolean; totalCount: number; count: number };

    expect(result.truncated).toBe(true);
    expect(result.totalCount).toBe(60);
    expect(result.count).toBe(50);
  });

  it("should handle unlimited partitions when limit is 0", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ total: 60 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: Array.from({ length: 60 }),
    });

    const tool = tools.find((t) => t.name === "pg_partman_show_partitions")!;
    const result = (await tool.handler(
      { parentTable: "public.events", limit: 0 },
      mockContext,
    )) as { truncated: boolean; count: number };

    expect(result.truncated).toBe(false);
    expect(result.count).toBe(60);
  });

  it("should propagate error in pg_partman_show_partitions", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("show_partitions error"),
    );
    const tool = tools.find((t) => t.name === "pg_partman_show_partitions")!;
    const result = (await tool.handler(
      { parentTable: "public.events" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("show_partitions error");
  });

  it("should use DESC order when specified", async () => {
    // Mock schema detection
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // Mock config check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Mock COUNT query for pagination
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 0 }],
    });
    // Mock show_partitions result
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_show_partitions")!;
    await tool.handler(
      {
        parentTable: "public.events",
        order: "desc",
      },
      mockContext,
    );

    const callArg = mockAdapter.executeQuery.mock.calls[3]?.[0] as string;
    expect(callArg).toContain("p_order := 'DESC'");
  });

  it("should accept table alias for parentTable", async () => {
    // Mock schema detection
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // Mock config check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Mock COUNT query for pagination
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 1 }],
    });
    // Mock show_partitions result
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { partition_schemaname: "public", partition_tablename: "events_p1" },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_partman_show_partitions")!;
    const result = (await tool.handler(
      {
        table: "public.events", // alias for parentTable
      },
      mockContext,
    )) as { parentTable: string };

    expect(result.parentTable).toBe("public.events");
  });
});

describe("pg_partman_show_config", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartmanTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartmanTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return configuration for all partition sets", async () => {
    // Mock schema detection query first
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // Mock column detection query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { column_name: "parent_table" },
        { column_name: "control" },
        { column_name: "partition_interval" },
        { column_name: "premake" },
        { column_name: "inherit_fk" },
      ],
    });
    // Mock COUNT query for pagination
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 2 }],
    });
    // Mock main config query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          parent_table: "public.events",
          control: "created_at",
          partition_interval: "1 month",
        },
        {
          parent_table: "public.logs",
          control: "ts",
          partition_interval: "1 day",
        },
      ],
    });
    // Mock table exists check for each config (2 configs)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    }); // public.events
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    }); // public.logs

    const tool = tools.find((t) => t.name === "pg_partman_show_config")!;
    const result = (await tool.handler({}, mockContext)) as {
      configs: unknown[];
      count: number;
    };

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("FROM partman.part_config"),
      [],
    );
    expect(result.configs).toHaveLength(2);
    expect(result.count).toBe(2);
  });

  it("should filter by parent table when specified", async () => {
    // Mock schema detection query first
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // Mock column detection query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { column_name: "parent_table" },
        { column_name: "control" },
        { column_name: "partition_interval" },
      ],
    });
    // Mock COUNT query for pagination
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 1 }],
    });
    // Mock main config query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ parent_table: "public.events" }],
    });
    // Mock table exists check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });

    const tool = tools.find((t) => t.name === "pg_partman_show_config")!;
    await tool.handler(
      {
        parentTable: "public.events",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("WHERE parent_table = $1"),
      ["public.events"],
    );
  });

  it("should return inherit_fk if column is available", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ column_name: "parent_table" }, { column_name: "inherit_fk" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ parent_table: "public.events", inherit_fk: true }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });

    const tool = tools.find((t) => t.name === "pg_partman_show_config")!;
    const result = (await tool.handler({}, mockContext)) as { configs: any[] };

    expect(result.configs[0].inherit_fk).toBe(true);
  });

  it("should handle error in show config", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("show_config db error"),
    );
    const tool = tools.find((t) => t.name === "pg_partman_show_config")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("show_config db error");
  });
});

describe("pg_partman_check_default", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartmanTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartmanTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should report when no default partition exists", async () => {
    // Mock table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Mock default partition query - no default found
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Mock child partition check - has children (is partitioned)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Mock relkind check - not needed if has children (we return early)

    const tool = tools.find((t) => t.name === "pg_partman_check_default")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
      },
      mockContext,
    )) as {
      hasDefault: boolean;
      isPartitioned: boolean;
      hasChildPartitions: boolean;
      message: string;
    };

    expect(result.hasDefault).toBe(false);
    expect(result.isPartitioned).toBe(true);
    expect(result.hasChildPartitions).toBe(true);
    expect(result.message).toContain(
      "partitioned with child partitions but has no default",
    );
  });

  it("should report when default partition has no data", async () => {
    // Mock table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Mock default partition query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ default_partition: "events_default", schema: "public" }],
    });
    // Mock COUNT query - no data
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ count: 0 }] });

    const tool = tools.find((t) => t.name === "pg_partman_check_default")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
      },
      mockContext,
    )) as {
      hasDefault: boolean;
      hasDataInDefault: boolean;
      recommendation: string;
    };

    expect(result.hasDefault).toBe(true);
    expect(result.hasDataInDefault).toBe(false);
    expect(result.recommendation).toContain("no action needed");
  });

  it("should report when default partition has data", async () => {
    // Mock table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Mock default partition query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ default_partition: "events_default", schema: "public" }],
    });
    // Mock COUNT query - has data
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ count: 1 }] });

    const tool = tools.find((t) => t.name === "pg_partman_check_default")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
      },
      mockContext,
    )) as {
      hasDefault: boolean;
      hasDataInDefault: boolean;
      recommendation: string;
    };

    expect(result.hasDefault).toBe(true);
    expect(result.hasDataInDefault).toBe(true);
    expect(result.recommendation).toContain("pg_partman_partition_data");
  });

  it("should handle fall back to 0 when counting default fails", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ default_partition: "events_default", schema: "public" }],
    });
    mockAdapter.executeQuery.mockRejectedValueOnce(new Error("count error"));

    const tool = tools.find((t) => t.name === "pg_partman_check_default")!;
    const result = (await tool.handler(
      { parentTable: "public.events" },
      mockContext,
    )) as { hasDataInDefault: boolean };

    expect(result.hasDataInDefault).toBe(false);
  });

  it("should catch errors in pg_partman_check_default", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("check default error"),
    );
    const tool = tools.find((t) => t.name === "pg_partman_check_default")!;
    const result = (await tool.handler(
      { parentTable: "public.events" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("check default error");
  });
});

describe("pg_partman_partition_data", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartmanTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartmanTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should move data from default to child partitions", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // part_config
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ control: "ts" }],
    });
    // rowsBeforeMove count
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ count: 10 }] });
    // the call
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // rowsAfterMove count
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ count: 5 }] });

    const tool = tools.find((t) => t.name === "pg_partman_partition_data")!;
    const result = (await tool.handler(
      { parentTable: "public.events", batchSize: 100, lockWaitSeconds: 10 },
      mockContext,
    )) as { success: boolean; rowsMoved: number };

    expect(result.success).toBe(true);
    expect(result.rowsMoved).toBe(5);
  });

  it("should gracefully handle missing control configuration", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // part_config fails or is empty
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_partition_data")!;
    const result = (await tool.handler(
      { parentTable: "public.events" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("No pg_partman configuration found");
  });

  it("should gracefully handle invalid parentTable or pg_partman not installed", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("relation partman.part_config does not exist"),
    );

    const tool = tools.find((t) => t.name === "pg_partman_partition_data")!;
    const result = (await tool.handler(
      { parentTable: "public.events" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("is not installed or enabled");
  });

  it("should handle partition_data procedure failing", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ control: "ts" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ count: 10 }] });
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("fake call failed"),
    );

    const tool = tools.find((t) => t.name === "pg_partman_partition_data")!;
    const result = (await tool.handler(
      { parentTable: "public.events" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain(
      "Failed to move data from default partition",
    );
  });

  it("should handle error in catch block", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(new Error("random fail"));
    const tool = tools.find((t) => t.name === "pg_partman_partition_data")!;
    const result = (await tool.handler(
      { parentTable: "public.events" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("random fail");
  });
});

describe("pg_partman_set_retention", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartmanTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartmanTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should disable retention when retention is null", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rowsAffected: 1 });

    const tool = tools.find((t) => t.name === "pg_partman_set_retention")!;
    const result = (await tool.handler(
      { parentTable: "public.events", retention: null },
      mockContext,
    )) as { success: boolean; retention: unknown };

    expect(result.success).toBe(true);
    expect(result.retention).toBe(null);
  });

  it("should disable retention when retention is empty string", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rowsAffected: 1 });

    const tool = tools.find((t) => t.name === "pg_partman_set_retention")!;
    const result = (await tool.handler(
      { parentTable: "public.events", retention: "" },
      mockContext,
    )) as { success: boolean; retention: unknown };

    expect(result.success).toBe(true);
    expect(result.retention).toBe(null);
  });

  it("should fail to disable retention if table not found", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rowsAffected: 0 });

    const tool = tools.find((t) => t.name === "pg_partman_set_retention")!;
    const result = (await tool.handler(
      { parentTable: "public.events", retention: null },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("No pg_partman configuration found");
  });

  it("should reject invalid retention formats", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    const tool = tools.find((t) => t.name === "pg_partman_set_retention")!;
    const result = (await tool.handler(
      { parentTable: "public.events", retention: "foo" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid retention format");
  });

  it("should fail updating retention if table not found", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rowsAffected: 0 });

    const tool = tools.find((t) => t.name === "pg_partman_set_retention")!;
    const result = (await tool.handler(
      { parentTable: "public.events", retention: "1 month" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("No pg_partman configuration found");
  });

  it("should update retention for integer-based partition", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rowsAffected: 1 });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ partition_type: "native" }],
    });

    const tool = tools.find((t) => t.name === "pg_partman_set_retention")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
        retention: "100",
        retentionKeepTable: true,
      },
      mockContext,
    )) as { success: boolean; message: string };

    expect(result.success).toBe(true);
    expect(result.message).toContain("below 100 will be detached");
  });

  it("should handle error in catch block", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("random fail retention"),
    );
    const tool = tools.find((t) => t.name === "pg_partman_set_retention")!;
    const result = (await tool.handler(
      { parentTable: "public.events", retention: "30 days" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("random fail retention");
  });
});

describe("pg_partman_undo_partition", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartmanTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartmanTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should require both parentTable and targetTable", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    const tool = tools.find((t) => t.name === "pg_partman_undo_partition")!;

    // Pass as any to bypass zod schema for test
    const result = (await tool.handler(
      { parentTable: "public.events" } as any,
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
  });

  it("should fail if target table does not exist", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // table not found

    const tool = tools.find((t) => t.name === "pg_partman_undo_partition")!;
    const result = (await tool.handler(
      { parentTable: "public.events", targetTable: "public.events_old" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
  });

  it("should successfully run undo partition", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    }); // table found
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // proc call

    const tool = tools.find((t) => t.name === "pg_partman_undo_partition")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
        targetTable: "public.events_old",
        batchSize: 50,
        keepTable: false,
      },
      mockContext,
    )) as { success: boolean; message: string };

    expect(result.success).toBe(true);
    expect(result.message).toContain("Partition set removed");
  });

  it("should handle undo partition procedure failure - No entry", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    }); // table found
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("No entry in part_config"),
    );

    const tool = tools.find((t) => t.name === "pg_partman_undo_partition")!;
    const result = (await tool.handler(
      { parentTable: "public.events", targetTable: "public.events_old" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("No pg_partman configuration found");
  });

  it("should handle error in catch block", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("random fail undo"),
    );
    const tool = tools.find((t) => t.name === "pg_partman_undo_partition")!;
    const result = (await tool.handler(
      { parentTable: "public.events", targetTable: "x" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("random fail undo");
  });
});

describe("pg_partman_analyze_partition_health", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartmanTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartmanTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should process health check with limit 0", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] }); // count
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          parent_table: "public.events",
          premake: 4,
          automatic_maintenance: "on",
        },
      ],
    }); // configs
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    }); // parent exists
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ count: 10 }] }); // partition count
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ default_partition: "d", default_schema: "public" }],
    }); // default partition check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ count: 0 }] }); // data in default count

    const tool = tools.find(
      (t) => t.name === "pg_partman_analyze_partition_health",
    )!;
    const result = (await tool.handler({ limit: 0 }, mockContext)) as {
      partitionSets: any[];
      totalCount: number;
    };

    expect(result.partitionSets).toBeDefined();
    expect(result.totalCount).toBe(1);
  });

  it("should identify a missing parent table", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] }); // count
    // specific table queried: return empty
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find(
      (t) => t.name === "pg_partman_analyze_partition_health",
    )!;
    const result = (await tool.handler(
      { parentTable: "public.events" },
      mockContext,
    )) as { overallHealth: string; message: string };

    expect(result.overallHealth).toBe("not_found");
    expect(result.message).toContain("No pg_partman configuration found");
  });

  it("should identify orphaned configs", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] }); // count
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ parent_table: "public.events" }],
    }); // configs
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // parent DOES NOT exist

    const tool = tools.find(
      (t) => t.name === "pg_partman_analyze_partition_health",
    )!;
    // any cast to skip validation
    const result = (await tool.handler({ limit: 1 }, mockContext)) as any;

    expect(result.partitionSets[0].issues[0]).toContain("Orphaned");
  });

  it("should handle error showing partitions", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] }); // count
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          parent_table: "public.events",
          premake: 4,
          automatic_maintenance: "off",
        },
      ],
    }); // configs
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    }); // parent exists
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("show_partitions failed"),
    ); // partition count fails

    const tool = tools.find(
      (t) => t.name === "pg_partman_analyze_partition_health",
    )!;
    const result = (await tool.handler({ limit: 1 }, mockContext)) as any;

    expect(result.partitionSets[0].issues[0]).toContain(
      "Failed to query partitions",
    );
  });

  it("should find data in default partition", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] }); // count
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          parent_table: "public.events",
          premake: 4,
          automatic_maintenance: "off",
        },
      ],
    }); // configs
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    }); // parent exists
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ count: 10 }] }); // partition count
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ default_partition: "d", default_schema: "public" }],
    }); // default partition check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ count: 1 }] }); // data in default count (hasData)

    const tool = tools.find(
      (t) => t.name === "pg_partman_analyze_partition_health",
    )!;
    const result = (await tool.handler({ limit: 1 }, mockContext)) as any;

    expect(result.partitionSets[0].issues[0]).toContain(
      "Data found in default partition",
    );
  });

  it("should catch outer database errors", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("analyze outer fault"),
    );
    const tool = tools.find(
      (t) => t.name === "pg_partman_analyze_partition_health",
    )!;
    const result = (await tool.handler({ limit: 1 }, mockContext)) as any;

    expect(result.success).toBe(false);
    expect(result.error).toContain("analyze outer fault");
  });
});

describe("pg_partman_partition_data", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartmanTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartmanTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should move data from default to child partitions", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ table_schema: "partman" }] }) // schema detection
      .mockResolvedValueOnce({ rows: [{ control: "created_at", epoch: null }] }) // config check
      .mockResolvedValueOnce({ rows: [{ count: 100 }] }) // COUNT before
      .mockResolvedValueOnce({ rows: [] }) // CALL partition_data_proc
      .mockResolvedValueOnce({ rows: [{ count: 0 }] }); // COUNT after

    const tool = tools.find((t) => t.name === "pg_partman_partition_data")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
      },
      mockContext,
    )) as { success: boolean; message: string; rowsMoved: number };

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("FROM"),
      ["public.events"],
    );
    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("CALL"), // Should use CALL for procedure
    );
    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining(
        "partition_data_proc(p_parent_table := 'public.events')",
      ),
    );
    expect(result.success).toBe(true);
    expect(result.rowsMoved).toBe(100);
    expect(result.message).toContain("100 rows moved");
  });

  it("should fail when no configuration found", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ table_schema: "partman" }] }) // schema detection
      .mockResolvedValueOnce({ rows: [] }); // no config

    const tool = tools.find((t) => t.name === "pg_partman_partition_data")!;
    const result = (await tool.handler(
      {
        parentTable: "public.nonexistent",
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("No pg_partman configuration found");
  });

  it("should return structured error when partman schema not found", async () => {
    // Schema detection returns 'partman' (fallback), but part_config query fails
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [] }) // schema detection returns no rows → fallback to 'partman'
      .mockRejectedValueOnce(new Error('schema "partman" does not exist'));

    const tool = tools.find((t) => t.name === "pg_partman_partition_data")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
      },
      mockContext,
    )) as { success: boolean; error: string; hint: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("is not installed or enabled");
    expect(result.suggestion).toContain("CREATE EXTENSION");
  });

  it("should include batch size parameter when specified", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ table_schema: "partman" }] }) // schema detection
      .mockResolvedValueOnce({ rows: [{ control: "ts", epoch: null }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // COUNT before
      .mockResolvedValueOnce({ rows: [] }) // CALL returns no rows
      .mockResolvedValueOnce({ rows: [{ count: 0 }] }); // COUNT after

    const tool = tools.find((t) => t.name === "pg_partman_partition_data")!;
    await tool.handler(
      {
        parentTable: "public.events",
        batchSize: 500,
      },
      mockContext,
    );

    const callArg = mockAdapter.executeQuery.mock.calls[3]?.[0] as string;
    expect(callArg).toContain("CALL");
    expect(callArg).toContain("p_loop_count := 500");
  });

  it("should include lock wait parameter when specified", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ table_schema: "partman" }] }) // schema detection
      .mockResolvedValueOnce({ rows: [{ control: "ts", epoch: null }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // COUNT before
      .mockResolvedValueOnce({ rows: [] }) // CALL returns no rows
      .mockResolvedValueOnce({ rows: [{ count: 0 }] }); // COUNT after

    const tool = tools.find((t) => t.name === "pg_partman_partition_data")!;
    await tool.handler(
      {
        parentTable: "public.events",
        lockWaitSeconds: 30,
      },
      mockContext,
    );

    const callArg = mockAdapter.executeQuery.mock.calls[3]?.[0] as string;
    expect(callArg).toContain("CALL");
    expect(callArg).toContain("p_lock_wait := 30");
  });

  it("should complete successfully with no specific row count", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ table_schema: "partman" }] }) // schema detection
      .mockResolvedValueOnce({ rows: [{ control: "created_at", epoch: null }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // COUNT before - 0 rows
      .mockResolvedValueOnce({ rows: [] }) // CALL returns no rows
      .mockResolvedValueOnce({ rows: [{ count: 0 }] }); // COUNT after - still 0

    const tool = tools.find((t) => t.name === "pg_partman_partition_data")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
      },
      mockContext,
    )) as { success: boolean; message: string; rowsMoved: number };

    expect(result.success).toBe(true);
    expect(result.rowsMoved).toBe(0);
    expect(result.message).toContain("no rows needed to be moved");
  });
});

describe("pg_partman_set_retention", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartmanTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartmanTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should set retention policy", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ table_schema: "partman" }] }) // schema detection
      .mockResolvedValueOnce({ rows: [], rowsAffected: 1 });

    const tool = tools.find((t) => t.name === "pg_partman_set_retention")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
        retention: "6 months",
      },
      mockContext,
    )) as {
      success: boolean;
      retention: string;
      message: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("retention = '6 months'"),
      ["public.events"],
    );
    expect(result.success).toBe(true);
    expect(result.retention).toBe("6 months");
    expect(result.message).toContain("dropped");
  });

  it("should set retention with keep table option", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ table_schema: "partman" }] }) // schema detection
      .mockResolvedValueOnce({ rows: [], rowsAffected: 1 });

    const tool = tools.find((t) => t.name === "pg_partman_set_retention")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
        retention: "1 year",
        retentionKeepTable: true,
      },
      mockContext,
    )) as {
      retentionKeepTable: boolean;
      message: string;
    };

    const callArg = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
    expect(callArg).toContain("retention_keep_table = true");
    expect(result.retentionKeepTable).toBe(true);
    expect(result.message).toContain("detached");
  });

  it("should return error when no configuration found", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ table_schema: "partman" }] }) // schema detection
      .mockResolvedValueOnce({ rows: [], rowsAffected: 0 });

    const tool = tools.find((t) => t.name === "pg_partman_set_retention")!;
    const result = (await tool.handler(
      {
        parentTable: "public.nonexistent",
        retention: "30 days",
      },
      mockContext,
    )) as { success: boolean; error: string; hint: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("No pg_partman configuration found");
    expect(result.details?.hint).toContain("pg_partman_show_config");
  });
});

describe("pg_partman_undo_partition", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartmanTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartmanTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should undo partitioning for a table", async () => {
    // Mock schema detection
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // Mock target table exists check (new validation)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Mock CALL undo_partition_proc - no result rows for CALL
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_undo_partition")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
        targetTable: "public.events_archive", // required parameter
      },
      mockContext,
    )) as {
      success: boolean;
      message: string;
      targetTable: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("CALL"),
    );
    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("p_target_table := 'public.events_archive'"),
    );
    expect(result.success).toBe(true);
    expect(result.targetTable).toBe("public.events_archive");
  });

  it("should include target table when specified", async () => {
    // Mock schema detection
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // Mock target table exists check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Mock CALL undo_partition_proc
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_undo_partition")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
        targetTable: "public.events_archive",
      },
      mockContext,
    )) as { targetTable: string };

    const callArg = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(callArg).toContain("p_target_table := 'public.events_archive'");
    expect(result.targetTable).toBe("public.events_archive");
  });

  it("should include batch size when specified", async () => {
    // Mock schema detection
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // Mock target table exists check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Mock CALL undo_partition_proc
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_undo_partition")!;
    await tool.handler(
      {
        parentTable: "public.events",
        targetTable: "public.events_archive", // required parameter
        batchSize: 100,
      },
      mockContext,
    );

    const callArg = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(callArg).toContain("p_loop_count := 100");
  });

  it("should include keep table option when specified", async () => {
    // Mock schema detection
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // Mock target table exists check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Mock CALL undo_partition_proc
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_undo_partition")!;
    await tool.handler(
      {
        parentTable: "public.events",
        targetTable: "public.events_archive", // required parameter
        keepTable: true,
      },
      mockContext,
    );

    const callArg = mockAdapter.executeQuery.mock.calls[2]?.[0] as string;
    expect(callArg).toContain("p_keep_table := true");
  });

  it("should return structured error when no partman config found", async () => {
    // Mock schema detection
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // Mock target table exists check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Mock CALL undo_partition_proc fails with no config
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("No entry in part_config found for given table"),
    );

    const tool = tools.find((t) => t.name === "pg_partman_undo_partition")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
        targetTable: "public.events_archive",
      },
      mockContext,
    )) as { success: boolean; error: string; hint: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("No pg_partman configuration found");
    expect(result.details?.hint).toContain("pg_partman_show_config");
  });
});

describe("pg_partman_analyze_partition_health", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartmanTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartmanTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should analyze and report healthy partition set", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ table_schema: "partman" }] }) // schema detection
      .mockResolvedValueOnce({ rows: [{ total: 1 }] }) // COUNT query for pagination
      .mockResolvedValueOnce({
        // config query
        rows: [
          {
            parent_table: "public.events",
            control: "created_at",
            partition_interval: "1 month",
            premake: 4,
            retention: "12 months",
            retention_keep_table: false,
            automatic_maintenance: "on",
            template_table: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table exists check
      .mockResolvedValueOnce({ rows: [{ count: 10 }] }) // partition count
      .mockResolvedValueOnce({ rows: [] }); // default check (no default)

    const tool = tools.find(
      (t) => t.name === "pg_partman_analyze_partition_health",
    )!;
    const result = (await tool.handler({}, mockContext)) as {
      partitionSets: {
        parentTable: string;
        issues: string[];
        warnings: string[];
      }[];
      summary: {
        totalPartitionSets: number;
        totalIssues: number;
        overallHealth: string;
      };
    };

    expect(result.summary.totalPartitionSets).toBe(1);
    expect(result.summary.totalIssues).toBe(0);
    expect(result.summary.overallHealth).toBe("healthy");
    expect(result.partitionSets[0]?.issues).toHaveLength(0);
  });

  it("should detect data in default partition", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ table_schema: "partman" }] }) // schema detection
      .mockResolvedValueOnce({ rows: [{ total: 1 }] }) // COUNT query for pagination
      .mockResolvedValueOnce({
        rows: [
          {
            parent_table: "public.events",
            control: "created_at",
            partition_interval: "1 month",
            premake: 4,
            retention: "12 months",
            automatic_maintenance: "on",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table exists check
      .mockResolvedValueOnce({ rows: [{ count: 10 }] }) // partition count
      .mockResolvedValueOnce({
        rows: [
          { default_partition: "events_default", default_schema: "public" },
        ],
      }) // default partition exists
      .mockResolvedValueOnce({ rows: [{ count: 1 }] }); // COUNT(*) - has data

    const tool = tools.find(
      (t) => t.name === "pg_partman_analyze_partition_health",
    )!;
    const result = (await tool.handler({}, mockContext)) as {
      partitionSets: {
        issues: string[];
        hasDataInDefault: boolean;
        recommendations: string[];
      }[];
      summary: { totalIssues: number; overallHealth: string };
    };

    expect(result.partitionSets[0]?.hasDataInDefault).toBe(true);
    expect(result.partitionSets[0]?.issues).toContainEqual(
      expect.stringContaining("Data found in default partition"),
    );
    expect(result.partitionSets[0]?.recommendations).toContainEqual(
      expect.stringContaining("pg_partman_partition_data"),
    );
    expect(result.summary.totalIssues).toBe(1);
    expect(result.summary.overallHealth).toBe("issues_found");
  });

  it("should not flag missing retention as warning (intentional design for audit tables)", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ table_schema: "partman" }] }) // schema detection
      .mockResolvedValueOnce({ rows: [{ total: 1 }] }) // COUNT query for pagination
      .mockResolvedValueOnce({
        rows: [
          {
            parent_table: "public.logs",
            control: "ts",
            partition_interval: "1 day",
            premake: 4,
            retention: null, // no retention - intentional for audit tables
            automatic_maintenance: "on",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table exists check
      .mockResolvedValueOnce({ rows: [{ count: 10 }] }) // partition count satisfies premake
      .mockResolvedValueOnce({ rows: [] }); // no default partition

    const tool = tools.find(
      (t) => t.name === "pg_partman_analyze_partition_health",
    )!;
    const result = (await tool.handler({}, mockContext)) as {
      partitionSets: { warnings: string[]; recommendations: string[] }[];
      summary: { totalWarnings: number; overallHealth: string };
    };

    // Missing retention should NOT produce a warning (many valid use cases don't need retention)
    expect(result.partitionSets[0]?.warnings).not.toContainEqual(
      expect.stringContaining("retention"),
    );
    expect(result.summary.overallHealth).toBe("healthy");
  });

  it("should detect when automatic maintenance is disabled", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ table_schema: "partman" }] }) // schema detection
      .mockResolvedValueOnce({ rows: [{ total: 1 }] }) // COUNT query for pagination
      .mockResolvedValueOnce({
        rows: [
          {
            parent_table: "public.events",
            control: "created_at",
            partition_interval: "1 month",
            premake: 4,
            retention: "1 year",
            automatic_maintenance: "off", // disabled
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table exists check
      .mockResolvedValueOnce({ rows: [{ count: 10 }] }) // partition count
      .mockResolvedValueOnce({ rows: [] }); // no default

    const tool = tools.find(
      (t) => t.name === "pg_partman_analyze_partition_health",
    )!;
    const result = (await tool.handler({}, mockContext)) as {
      partitionSets: { warnings: string[] }[];
    };

    expect(result.partitionSets[0]?.warnings).toContainEqual(
      expect.stringContaining("Automatic maintenance is not enabled"),
    );
  });

  it("should detect insufficient partition count", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ table_schema: "partman" }] }) // schema detection
      .mockResolvedValueOnce({ rows: [{ total: 1 }] }) // COUNT query for pagination
      .mockResolvedValueOnce({
        rows: [
          {
            parent_table: "public.events",
            control: "created_at",
            partition_interval: "1 month",
            premake: 10, // premake is 10
            retention: "1 year",
            automatic_maintenance: "on",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table exists check
      .mockResolvedValueOnce({ rows: [{ count: 3 }] }) // only 3 partitions
      .mockResolvedValueOnce({ rows: [] });

    const tool = tools.find(
      (t) => t.name === "pg_partman_analyze_partition_health",
    )!;
    const result = (await tool.handler({}, mockContext)) as {
      partitionSets: { warnings: string[]; recommendations: string[] }[];
    };

    expect(result.partitionSets[0]?.warnings).toContainEqual(
      expect.stringContaining("Only 3 partitions"),
    );
    expect(result.partitionSets[0]?.recommendations).toContainEqual(
      expect.stringContaining("pg_partman_run_maintenance"),
    );
  });

  it("should filter by specific table when provided", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ table_schema: "partman" }] }) // schema detection
      .mockResolvedValueOnce({ rows: [{ total: 1 }] }) // COUNT query for pagination
      .mockResolvedValueOnce({
        rows: [
          {
            parent_table: "public.events",
            control: "created_at",
            partition_interval: "1 month",
            premake: 4,
            retention: "1 year",
            automatic_maintenance: "on",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table exists check
      .mockResolvedValueOnce({ rows: [{ count: 10 }] }) // partition count
      .mockResolvedValueOnce({ rows: [] }); // no default

    const tool = tools.find(
      (t) => t.name === "pg_partman_analyze_partition_health",
    )!;
    await tool.handler(
      {
        parentTable: "public.events",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("WHERE parent_table = $1"),
      ["public.events"],
    );
  });

  it("should handle multiple partition sets", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ table_schema: "partman" }] }) // schema detection
      .mockResolvedValueOnce({ rows: [{ total: 2 }] }) // COUNT query for pagination
      .mockResolvedValueOnce({
        rows: [
          {
            parent_table: "public.events",
            control: "created_at",
            partition_interval: "1 month",
            premake: 4,
            retention: "1 year",
            automatic_maintenance: "on",
          },
          {
            parent_table: "public.logs",
            control: "ts",
            partition_interval: "1 day",
            premake: 4,
            retention: null,
            automatic_maintenance: "on",
          },
        ],
      })
      // First partition set checks
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table exists check for public.events
      .mockResolvedValueOnce({ rows: [{ count: 10 }] }) // partition count
      .mockResolvedValueOnce({ rows: [] }) // no default
      // Second partition set checks
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table exists check for public.logs
      .mockResolvedValueOnce({ rows: [{ count: 30 }] }) // partition count
      .mockResolvedValueOnce({ rows: [] }); // no default

    const tool = tools.find(
      (t) => t.name === "pg_partman_analyze_partition_health",
    )!;
    const result = (await tool.handler({}, mockContext)) as {
      partitionSets: { parentTable: string }[];
      summary: { totalPartitionSets: number };
    };

    expect(result.summary.totalPartitionSets).toBe(2);
    expect(result.partitionSets).toHaveLength(2);
    expect(result.partitionSets[0]?.parentTable).toBe("public.events");
    expect(result.partitionSets[1]?.parentTable).toBe("public.logs");
  });
});

// =============================================================================
// partman/helpers.ts uncovered branches
// =============================================================================

describe("partman helpers uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let mockContext: ReturnType<typeof createMockRequestContext>;
  let tools: ReturnType<typeof getPartmanTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    mockContext = createMockRequestContext();
    tools = getPartmanTools(mockAdapter as unknown as PostgresAdapter);
  });

  // helpers.ts L39-52: ensurePartmanSchemaAlias error catch block
  // When schema is 'public', callPartmanProcedure calls ensurePartmanSchemaAlias.
  // If CREATE SCHEMA fails, the error is swallowed (catch block L49-52) and the actual CALL proceeds.
  // undo_partition sequence: getPartmanSchema → table exists → callPartmanProcedure
  it("should handle schema alias creation failure gracefully via undo_partition", async () => {
    mockAdapter.executeQuery
      // 1. getPartmanSchema → returns 'public' (triggers alias path)
      .mockResolvedValueOnce({ rows: [{ table_schema: "public" }] })
      // 2. table exists check
      .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
      // 3. callPartmanProcedure → ensurePartmanSchemaAlias → CREATE SCHEMA fails
      .mockRejectedValueOnce(new Error("permission denied"))
      // 4. The actual CALL proceeds after the catch
      .mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_undo_partition")!;
    const result = (await tool.handler(
      { parentTable: "public.events", targetTable: "public.events_archive" },
      mockContext,
    )) as { success: boolean };

    // Should still succeed because ensurePartmanSchemaAlias catch swallows the error
    expect(result.success).toBe(true);
  });

  // helpers.ts L65-66: callPartmanProcedure when partmanSchema === "public"
  // This triggers ensurePartmanSchemaAlias (CREATE SCHEMA + CREATE FUNCTION)
  it("should call ensurePartmanSchemaAlias when schema is public via undo_partition", async () => {
    mockAdapter.executeQuery
      // 1. getPartmanSchema → returns 'public'
      .mockResolvedValueOnce({ rows: [{ table_schema: "public" }] })
      // 2. table exists check
      .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
      // 3. CREATE SCHEMA IF NOT EXISTS partman (ensurePartmanSchemaAlias)
      .mockResolvedValueOnce({ rows: [] })
      // 4. CREATE OR REPLACE FUNCTION partman.check_control_type
      .mockResolvedValueOnce({ rows: [] })
      // 5. The actual CALL
      .mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_undo_partition")!;
    const result = (await tool.handler(
      { parentTable: "public.events", targetTable: "public.events_archive" },
      mockContext,
    )) as { success: boolean };

    expect(result.success).toBe(true);
    // Verify that ensurePartmanSchemaAlias was called
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "CREATE SCHEMA IF NOT EXISTS partman",
    );
  });

  // helpers.ts L21: getPartmanSchema when schema is NOT found → defaults to 'partman'
  // When schema is 'partman' (not 'public'), callPartmanProcedure skips alias creation
  it("should default to partman schema and skip alias when part_config not found", async () => {
    mockAdapter.executeQuery
      // 1. getPartmanSchema → returns no rows → defaults to 'partman'
      .mockResolvedValueOnce({ rows: [] })
      // 2. table exists check
      .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
      // 3. The actual CALL (no alias needed since schema != 'public')
      .mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_undo_partition")!;
    const result = (await tool.handler(
      { parentTable: "public.events", targetTable: "public.events_archive" },
      mockContext,
    )) as { success: boolean };

    expect(result.success).toBe(true);
    // Should NOT have called ensurePartmanSchemaAlias
    expect(mockAdapter.executeQuery).not.toHaveBeenCalledWith(
      "CREATE SCHEMA IF NOT EXISTS partman",
    );
  });
});

// ==========================================================================
// Coverage-targeted tests for operations.ts uncovered branches
// ==========================================================================

describe("pg_partman_check_default — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartmanTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartmanTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return error when parentTable is missing", async () => {
    const tool = tools.find((t) => t.name === "pg_partman_check_default")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
      hint: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("parentTable");
    expect(result.details?.hint).toBeDefined();
  });

  it("should return error when table does not exist", async () => {
    // table existence check - not found
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_check_default")!;
    const result = (await tool.handler(
      { parentTable: "public.nonexistent" },
      mockContext,
    )) as { success: boolean; error: string; hint: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
    expect(result.details?.hint).toBeDefined();
  });

  it("should report table not partitioned (relkind != 'p', no children)", async () => {
    // table exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ exists: true }],
    });
    // find default partition - none
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // has children - none
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // relkind check - regular table
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "r" }],
    });

    const tool = tools.find((t) => t.name === "pg_partman_check_default")!;
    const result = (await tool.handler(
      { parentTable: "public.events" },
      mockContext,
    )) as {
      success: boolean;
      isPartitioned: boolean;
      hasChildPartitions: boolean;
      message: string;
    };

    expect(result.success).toBe(true);
    expect(result.isPartitioned).toBe(false);
    expect(result.hasChildPartitions).toBe(false);
    expect(result.message).toContain("not a partitioned table");
  });

  it("should report partitioned table with no child partitions", async () => {
    // table exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ exists: true }],
    });
    // find default partition - none
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // has children - none
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // relkind check - partitioned table
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });

    const tool = tools.find((t) => t.name === "pg_partman_check_default")!;
    const result = (await tool.handler(
      { parentTable: "public.events" },
      mockContext,
    )) as {
      success: boolean;
      isPartitioned: boolean;
      hasChildPartitions: boolean;
      message: string;
    };

    expect(result.success).toBe(true);
    expect(result.isPartitioned).toBe(true);
    expect(result.hasChildPartitions).toBe(false);
    expect(result.message).toContain("no child partitions yet");
  });

  it("should report partitioned with children but no default", async () => {
    // table exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ exists: true }],
    });
    // find default partition - none
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // has children - yes
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // relkind check (this path doesn't actually reach when hasChildren > 0, since it returns early)
    // But the code checks isActuallyPartitioned only when hasChildren === 0
    // So this test follows the early return path for hasChildren > 0

    const tool = tools.find((t) => t.name === "pg_partman_check_default")!;
    const result = (await tool.handler(
      { parentTable: "public.events" },
      mockContext,
    )) as {
      success: boolean;
      hasDefault: boolean;
      isPartitioned: boolean;
      hasChildPartitions: boolean;
      message: string;
    };

    expect(result.success).toBe(true);
    expect(result.hasDefault).toBe(false);
    expect(result.isPartitioned).toBe(true);
    expect(result.hasChildPartitions).toBe(true);
    expect(result.message).toContain("no default partition");
  });

  it("should handle count query failure gracefully", async () => {
    // table exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ exists: true }],
    });
    // find default partition - found
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ default_partition: "events_default", schema: "public" }],
    });
    // count query fails
    mockAdapter.executeQuery.mockRejectedValueOnce(new Error("count failed"));

    const tool = tools.find((t) => t.name === "pg_partman_check_default")!;
    const result = (await tool.handler(
      { parentTable: "public.events" },
      mockContext,
    )) as {
      success: boolean;
      hasDefault: boolean;
      hasDataInDefault: boolean;
    };

    expect(result.success).toBe(true);
    expect(result.hasDefault).toBe(true);
    // Count failure falls back to 0
    expect(result.hasDataInDefault).toBe(false);
  });
});

describe("pg_partman_partition_data — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartmanTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartmanTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return error when parentTable is missing", async () => {
    const tool = tools.find((t) => t.name === "pg_partman_partition_data")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
      hint: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("parentTable");
    expect(result.details?.hint).toBeDefined();
  });

  it("should return error when partman extension is not found", async () => {
    // getPartmanSchema
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // config query fails (partman not installed)
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("relation partman.part_config does not exist"),
    );

    const tool = tools.find((t) => t.name === "pg_partman_partition_data")!;
    const result = (await tool.handler(
      { parentTable: "public.events" },
      mockContext,
    )) as { success: boolean; error: string; hint: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("is not installed or enabled");
    expect(result.suggestion).toBeDefined();
  });

  it("should return error when no config found for table", async () => {
    // getPartmanSchema
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // config query returns empty
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_partition_data")!;
    const result = (await tool.handler(
      { parentTable: "public.events" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("No pg_partman configuration found");
  });

  it("should handle callPartmanProcedure failure", async () => {
    // getPartmanSchema
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // config query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ control: "created_at", epoch: null }],
    });
    // before count
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ count: 10 }],
    });
    // callPartmanProcedure via SQL - needs schema alias (partman schema)
    // ensurePartmanSchemaAlias check (table_schema is 'partman', not 'public', so no alias needed)
    // Direct CALL fails
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("partition_data_proc failed: constraint violation"),
    );

    const tool = tools.find((t) => t.name === "pg_partman_partition_data")!;
    const result = (await tool.handler(
      { parentTable: "public.events" },
      mockContext,
    )) as { success: boolean; error: string; hint: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to move data");
    expect(result.details?.hint).toBeDefined();
  });
});

// ==========================================================================
// Coverage-targeted tests for management.ts uncovered branches
// ==========================================================================

describe("pg_partman_create_parent — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartmanTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartmanTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return error for deprecated interval keyword", async () => {
    const tool = tools.find((t) => t.name === "pg_partman_create_parent")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
        controlColumn: "created_at",
        interval: "daily",
      },
      mockContext,
    )) as { success: boolean; error: string; hint: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Deprecated interval");
    expect(result.hint).toContain("Valid examples");
  });

  it("should wrap duplicate key error from create_parent", async () => {
    // getPartmanSchema
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // create_parent fails with duplicate key
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("duplicate key value violates unique constraint"),
    );

    const tool = tools.find((t) => t.name === "pg_partman_create_parent")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
        controlColumn: "created_at",
        interval: "1 month",
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("already managed by pg_partman");
  });

  it("should wrap 'is not partitioned' error", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("table is not partitioned"),
    );

    const tool = tools.find((t) => t.name === "pg_partman_create_parent")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
        controlColumn: "created_at",
        interval: "1 month",
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not a partitioned table");
  });

  it("should wrap NOT NULL constraint error", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("control column cannot be null or NOT NULL constraint"),
    );

    const tool = tools.find((t) => t.name === "pg_partman_create_parent")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
        controlColumn: "created_at",
        interval: "1 month",
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("NOT NULL constraint");
  });

  it("should wrap invalid interval format error", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("invalid input syntax for type interval"),
    );

    const tool = tools.find((t) => t.name === "pg_partman_create_parent")!;
    const result = (await tool.handler(
      {
        parentTable: "public.events",
        controlColumn: "created_at",
        interval: "invalid_interval",
      },
      mockContext,
    )) as { success: boolean; error: string; examples: string[] };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid interval format");
    expect(result.details?.examples).toBeDefined();
  });
});

describe("pg_partman_run_maintenance — all tables with orphaned & errors", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartmanTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartmanTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should handle run_maintenance for all tables with orphaned configs", async () => {
    // getPartmanSchema
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // List all configs
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { parent_table: "public.events" },
        { parent_table: "public.deleted_table" },
      ],
    });
    // Check if public.events exists → yes
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    // Run maintenance for public.events → success
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Check if public.deleted_table exists → no (orphaned)
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partman_run_maintenance")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      maintained: string[];
      orphaned: { count: number; tables: string[] };
      message: string;
    };

    expect(result.success).toBe(true);
    expect(result.maintained).toContain("public.events");
    expect(result.orphaned.count).toBe(1);
    expect(result.orphaned.tables).toContain("public.deleted_table");
    expect(result.message).toContain("skipped");
  });

  it("should handle NULL child table error during maintenance", async () => {
    // getPartmanSchema
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // configCheck - table is managed
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    // run_maintenance fails with NULL child error
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error(
        "Child table given does not exist or is NULL\nCONTEXT: PL/pgSQL function partman.run_maintenance",
      ),
    );

    const tool = tools.find((t) => t.name === "pg_partman_run_maintenance")!;
    const result = (await tool.handler(
      { parentTable: "public.events" },
      mockContext,
    )) as { success: boolean; message: string; hint: string };

    expect(result.success).toBe(true);
    expect(result.message).toContain("no child partitions");
  });
});

// ==========================================================================
// Coverage-targeted tests for maintenance.ts uncovered branches
// ==========================================================================

describe("pg_partman_set_retention — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartmanTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartmanTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return error when parentTable is missing", async () => {
    const tool = tools.find((t) => t.name === "pg_partman_set_retention")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing required parameter: parentTable");
  });

  it("should return error when retention is missing (undefined)", async () => {
    const tool = tools.find((t) => t.name === "pg_partman_set_retention")!;
    const result = (await tool.handler(
      { parentTable: "public.events" },
      mockContext,
    )) as { success: boolean; error: string; hint: string };

    // getPartmanSchema
    // The handler checks parentTable first, then gets partmanSchema, then checks retention === undefined
    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing required parameter: retention");
  });

  it("should disable retention with null (clear path)", async () => {
    // getPartmanSchema
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // UPDATE returns 1 affected row
    mockAdapter.executeQuery.mockResolvedValueOnce({ rowsAffected: 1 });

    const tool = tools.find((t) => t.name === "pg_partman_set_retention")!;
    const result = (await tool.handler(
      { parentTable: "public.events", retention: null },
      mockContext,
    )) as { success: boolean; retention: null; message: string };

    expect(result.success).toBe(true);
    expect(result.retention).toBeNull();
    expect(result.message).toContain("Retention policy disabled");
  });

  it("should return error for invalid retention format", async () => {
    // getPartmanSchema
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });

    const tool = tools.find((t) => t.name === "pg_partman_set_retention")!;
    const result = (await tool.handler(
      { parentTable: "public.events", retention: "garbage&&value" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid retention format");
  });
});

describe("pg_partman_analyze_partition_health — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartmanTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartmanTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should detect orphaned config (parent table no longer exists)", async () => {
    // getPartmanSchema
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // COUNT query for total
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] });
    // Config rows
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          parent_table: "public.old_events",
          control: "created_at",
          partition_interval: "1 month",
          premake: 4,
          retention: null,
          retention_keep_table: false,
          automatic_maintenance: "on",
          template_table: null,
        },
      ],
    });
    // Table existence check → not found
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find(
      (t) => t.name === "pg_partman_analyze_partition_health",
    )!;
    const result = (await tool.handler({}, mockContext)) as {
      partitionSets: {
        parentTable: string;
        issues: string[];
        partitionCount: number;
      }[];
      summary: { overallHealth: string };
    };

    expect(result.partitionSets[0]!.issues).toContainEqual(
      expect.stringContaining("Orphaned configuration"),
    );
    expect(result.partitionSets[0]!.partitionCount).toBe(0);
    expect(result.summary.overallHealth).toBe("issues_found");
  });

  it("should detect data in default partition and disabled auto maintenance", async () => {
    // getPartmanSchema
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // COUNT
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] });
    // Config rows
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          parent_table: "public.events",
          control: "created_at",
          partition_interval: "1 month",
          premake: 4,
          retention: null,
          retention_keep_table: false,
          automatic_maintenance: "off",
          template_table: null,
        },
      ],
    });
    // Table exists
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    // Partition count = 5
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ count: 5 }] });
    // Default partition exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          default_partition: "events_default",
          default_schema: "public",
        },
      ],
    });
    // COUNT(*) on default partition → data found
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ count: 1 }] });

    const tool = tools.find(
      (t) => t.name === "pg_partman_analyze_partition_health",
    )!;
    const result = (await tool.handler({}, mockContext)) as {
      partitionSets: {
        issues: string[];
        warnings: string[];
        hasDataInDefault: boolean;
      }[];
    };

    expect(result.partitionSets[0]!.hasDataInDefault).toBe(true);
    expect(result.partitionSets[0]!.issues).toContainEqual(
      expect.stringContaining("Data found in default"),
    );
    expect(result.partitionSets[0]!.warnings).toContainEqual(
      expect.stringContaining("Automatic maintenance is not enabled"),
    );
  });

  it("should handle show_partitions failure gracefully", async () => {
    // getPartmanSchema
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "partman" }],
    });
    // COUNT
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] });
    // Config rows
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          parent_table: "public.broken_events",
          control: "created_at",
          partition_interval: "1 month",
          premake: 4,
          automatic_maintenance: "on",
        },
      ],
    });
    // Table exists
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    // show_partitions fails
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("function show_partitions does not exist"),
    );

    const tool = tools.find(
      (t) => t.name === "pg_partman_analyze_partition_health",
    )!;
    const result = (await tool.handler({}, mockContext)) as {
      partitionSets: { parentTable: string; issues: string[] }[];
    };

    expect(result.partitionSets[0]!.issues).toContainEqual(
      expect.stringContaining("Failed to query partitions"),
    );
  });
});
