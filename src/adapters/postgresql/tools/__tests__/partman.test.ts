/**
 * postgres-mcp - Partman Tools Unit Tests
 *
 * Tests for PostgreSQL pg_partman extension management and operations tools.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PostgresAdapter } from "../../PostgresAdapter.js";
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
    expect(result.hint).toBeDefined();
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
    expect(result.hint).toContain("PARTITION BY");
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
    expect(result.examples).toContain("1 day");
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
    expect(result.hint).toContain("NOT NULL");
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
      .mockResolvedValueOnce({ rows: [] }) // CALL returns no rows
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
    expect(result.error).toContain("pg_partman extension not found");
    expect(result.hint).toContain("pg_partman_create_extension");
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
    expect(result.hint).toContain("pg_partman_show_config");
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
    expect(result.hint).toContain("pg_partman_show_config");
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
      .mockResolvedValueOnce({ rows: [{ rows: 5000 }] }); // default has data

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
      expect.stringContaining("5000 rows"),
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
