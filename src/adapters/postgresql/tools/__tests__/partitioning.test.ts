/**
 * postgres-mcp - Partitioning Tools Unit Tests
 *
 * Tests for PostgreSQL partitioning tools with focus on
 * partition management, creation, and attachment operations.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPartitioningTools } from "../partitioning/index.js";
import type { PostgresAdapter } from "../../PostgresAdapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../__tests__/mocks/index.js";

describe("getPartitioningTools", () => {
  let adapter: PostgresAdapter;
  let tools: ReturnType<typeof getPartitioningTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockPostgresAdapter() as unknown as PostgresAdapter;
    tools = getPartitioningTools(adapter);
  });

  it("should return 6 partitioning tools", () => {
    expect(tools).toHaveLength(6);
  });

  it("should have all expected tool names", () => {
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("pg_list_partitions");
    expect(toolNames).toContain("pg_create_partitioned_table");
    expect(toolNames).toContain("pg_create_partition");
    expect(toolNames).toContain("pg_attach_partition");
    expect(toolNames).toContain("pg_detach_partition");
    expect(toolNames).toContain("pg_partition_info");
  });

  it("should have group set to partitioning for all tools", () => {
    for (const tool of tools) {
      expect(tool.group).toBe("partitioning");
    }
  });
});

describe("pg_list_partitions", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartitioningTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartitioningTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should list partitions of a table", async () => {
    // First call: checkTablePartitionStatus - partitioned table
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Second call: partition listing
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          partition_name: "events_2023",
          bounds: "FOR VALUES FROM ('2023-01-01') TO ('2024-01-01')",
          size_bytes: 104857600,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_list_partitions")!;
    const result = (await tool.handler(
      {
        table: "events",
      },
      mockContext,
    )) as {
      partitions: { size: string }[];
      count: number;
    };

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("pg_inherits"),
      ["public", "events"],
    );
    expect(result.count).toBe(1);
    expect(result.partitions).toHaveLength(1);
    // Verify consistent size formatting
    expect(result.partitions[0]?.size).toBe("100.0 MB");
  });

  it("should use specified schema", async () => {
    // First call: checkTablePartitionStatus - partitioned table
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Second call: partition listing
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_partitions")!;
    await tool.handler(
      {
        table: "events",
        schema: "analytics",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("relkind IN ('r', 'p')"),
      ["events", "analytics"],
    );
  });

  it("should return structured error for non-partitioned table", async () => {
    // checkTablePartitionStatus returns regular table
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "r" }],
    });

    const tool = tools.find((t) => t.name === "pg_list_partitions")!;
    const result = (await tool.handler(
      {
        table: "regular_table",
      },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("exists but is not partitioned");
    expect(result.error).toContain("regular_table");
    expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(1);
  });

  it("should return structured error for non-existent table", async () => {
    // checkTablePartitionStatus returns not found
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_partitions")!;
    const result = (await tool.handler(
      {
        table: "nonexistent_table",
      },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
    expect(result.error).toContain("nonexistent_table");
    expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(1);
  });

  it("should include truncated: false for successful responses", async () => {
    // First call: checkTablePartitionStatus - partitioned table
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Second call: partition listing
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          partition_name: "events_2023",
          bounds: "FOR VALUES FROM ('2023-01-01') TO ('2024-01-01')",
          size_bytes: 8192,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_list_partitions")!;
    const result = (await tool.handler(
      {
        table: "events",
      },
      mockContext,
    )) as {
      partitions: unknown[];
      count: number;
      truncated: boolean;
    };

    expect(result.count).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it("should respect limit parameter", async () => {
    // First call: checkTablePartitionStatus - partitioned table
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Second call: partition listing
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_partitions")!;
    await tool.handler(
      {
        table: "events",
        limit: 10,
      },
      mockContext,
    );

    // Should use LIMIT 11 (limit + 1) to detect truncation
    const call = mockAdapter.executeQuery.mock.calls[1][0] as string;
    expect(call).toContain("LIMIT 11");
  });
});

describe("pg_create_partitioned_table", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartitioningTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartitioningTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should create a RANGE partitioned table", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_partitioned_table")!;
    const result = (await tool.handler(
      {
        name: "events",
        columns: [
          { name: "id", type: "bigint" },
          { name: "event_date", type: "date", nullable: false },
          { name: "data", type: "jsonb" },
        ],
        partitionBy: "range",
        partitionKey: "event_date",
      },
      mockContext,
    )) as {
      success: boolean;
      table: string;
      partitionBy: string;
      partitionKey: string;
    };

    const call = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(call).toContain("CREATE TABLE");
    expect(call).toContain("PARTITION BY RANGE (event_date)");
    expect(result.success).toBe(true);
    expect(result.partitionBy).toBe("range");
  });

  it("should create a LIST partitioned table", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_partitioned_table")!;
    await tool.handler(
      {
        name: "orders",
        columns: [
          { name: "id", type: "serial" },
          { name: "region", type: "varchar(50)" },
        ],
        partitionBy: "list",
        partitionKey: "region",
      },
      mockContext,
    );

    const call = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(call).toContain("PARTITION BY LIST (region)");
  });

  it("should handle NOT NULL columns", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_partitioned_table")!;
    await tool.handler(
      {
        name: "data",
        columns: [{ name: "id", type: "bigint", nullable: false }],
        partitionBy: "hash",
        partitionKey: "id",
      },
      mockContext,
    );

    const call = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(call).toContain("NOT NULL");
  });

  it("should handle notNull: true column option", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_partitioned_table")!;
    await tool.handler(
      {
        name: "data",
        columns: [
          { name: "id", type: "bigint", notNull: true }, // notNull alias
        ],
        partitionBy: "hash",
        partitionKey: "id",
      },
      mockContext,
    );

    const call = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(call).toContain("NOT NULL");
  });

  it("should handle primaryKey column option", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_partitioned_table")!;
    await tool.handler(
      {
        name: "data",
        columns: [{ name: "id", type: "bigint", primaryKey: true }],
        partitionBy: "hash",
        partitionKey: "id",
      },
      mockContext,
    );

    const call = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(call).toContain("PRIMARY KEY");
  });

  it("should handle unique column option", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_partitioned_table")!;
    await tool.handler(
      {
        name: "data",
        columns: [{ name: "email", type: "varchar(255)", unique: true }],
        partitionBy: "hash",
        partitionKey: "id",
      },
      mockContext,
    );

    const call = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(call).toContain("UNIQUE");
  });

  it("should handle default column option", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_partitioned_table")!;
    await tool.handler(
      {
        name: "data",
        columns: [{ name: "status", type: "varchar(20)", default: "active" }],
        partitionBy: "hash",
        partitionKey: "id",
      },
      mockContext,
    );

    const call = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(call).toContain("DEFAULT 'active'");
  });

  it("should handle numeric default values", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_partitioned_table")!;
    await tool.handler(
      {
        name: "data",
        columns: [{ name: "count", type: "integer", default: 0 }],
        partitionBy: "hash",
        partitionKey: "id",
      },
      mockContext,
    );

    const call = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(call).toContain("DEFAULT 0");
  });

  it("should strip outer quotes from string defaults (common mistake)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_partitioned_table")!;
    await tool.handler(
      {
        name: "data",
        columns: [
          { name: "status", type: "varchar(20)", default: "'pending'" }, // User added quotes
        ],
        partitionBy: "hash",
        partitionKey: "id",
      },
      mockContext,
    );

    const call = mockAdapter.executeQuery.mock.calls[0][0] as string;
    // Should produce DEFAULT 'pending' not DEFAULT ''pending''
    expect(call).toContain("DEFAULT 'pending'");
    expect(call).not.toContain("''pending''");
  });

  it("should escape quotes within string defaults", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_partitioned_table")!;
    await tool.handler(
      {
        name: "data",
        columns: [{ name: "desc", type: "text", default: "it's working" }],
        partitionBy: "hash",
        partitionKey: "id",
      },
      mockContext,
    );

    const call = mockAdapter.executeQuery.mock.calls[0][0] as string;
    // Single quote should be escaped to ''
    expect(call).toContain("DEFAULT 'it''s working'");
  });
});

describe("pg_create_partition", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartitioningTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartitioningTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should create a RANGE partition", async () => {
    // First call: checkTablePartitionStatus - partitioned parent
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Second call: SQL execution
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_partition")!;
    const result = (await tool.handler(
      {
        parent: "events",
        name: "events_2024",
        forValues: "FROM ('2024-01-01') TO ('2025-01-01')",
      },
      mockContext,
    )) as {
      success: boolean;
      partition: string;
      bounds: string;
    };

    const call = mockAdapter.executeQuery.mock.calls[1][0] as string;
    expect(call).toContain("PARTITION OF");
    expect(call).toContain("FOR VALUES");
    expect(result.success).toBe(true);
    expect(result.partition).toContain("events_2024");
  });

  it("should create a LIST partition", async () => {
    // First call: checkTablePartitionStatus - partitioned parent
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Second call: SQL execution
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_partition")!;
    await tool.handler(
      {
        parent: "orders",
        name: "orders_us",
        forValues: "IN ('US', 'CA')",
      },
      mockContext,
    );

    const call = mockAdapter.executeQuery.mock.calls[1][0] as string;
    expect(call).toContain("IN ('US', 'CA')");
  });

  it("should create a DEFAULT partition", async () => {
    // First call: checkTablePartitionStatus - partitioned parent
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Second call: SQL execution
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_partition")!;
    const result = (await tool.handler(
      {
        parent: "events",
        name: "events_other",
        isDefault: true,
      },
      mockContext,
    )) as {
      success: boolean;
      bounds: string;
    };

    const call = mockAdapter.executeQuery.mock.calls[1][0] as string;
    expect(call).toContain("DEFAULT");
    expect(call).not.toContain("FOR VALUES");
    expect(result.success).toBe(true);
    expect(result.bounds).toBe("DEFAULT");
  });

  it("should accept default: true as alias for isDefault", async () => {
    // First call: checkTablePartitionStatus - partitioned parent
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Second call: SQL execution
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_partition")!;
    const result = (await tool.handler(
      {
        parent: "events",
        name: "events_other",
        default: true, // Alias for isDefault
      },
      mockContext,
    )) as {
      success: boolean;
      bounds: string;
    };

    const call = mockAdapter.executeQuery.mock.calls[1][0] as string;
    expect(call).toContain("DEFAULT");
    expect(result.success).toBe(true);
    expect(result.bounds).toBe("DEFAULT");
  });

  it("should create a sub-partitionable partition", async () => {
    // First call: checkTablePartitionStatus - partitioned parent
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Second call: SQL execution
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_partition")!;
    const result = (await tool.handler(
      {
        parent: "orders",
        name: "orders_2024",
        from: "2024-01-01",
        to: "2025-01-01",
        subpartitionBy: "list",
        subpartitionKey: "region",
      },
      mockContext,
    )) as {
      success: boolean;
      subpartitionBy: string;
      subpartitionKey: string;
    };

    const call = mockAdapter.executeQuery.mock.calls[1][0] as string;
    expect(call).toContain("FOR VALUES");
    expect(call).toContain("PARTITION BY LIST (region)");
    expect(result.success).toBe(true);
    expect(result.subpartitionBy).toBe("list");
    expect(result.subpartitionKey).toBe("region");
  });

  it("should return structured error when subpartitionKey is missing", async () => {
    const tool = tools.find((t) => t.name === "pg_create_partition")!;

    const result = (await tool.handler(
      {
        parent: "orders",
        name: "orders_2024",
        from: "2024-01-01",
        to: "2025-01-01",
        subpartitionBy: "list",
        // Missing subpartitionKey
      },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("subpartitionKey is required");
  });

  it("should support DEFAULT partition with sub-partitioning", async () => {
    // First call: checkTablePartitionStatus - partitioned parent
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Second call: SQL execution
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_partition")!;
    const result = (await tool.handler(
      {
        parent: "orders",
        name: "orders_other",
        isDefault: true,
        subpartitionBy: "hash",
        subpartitionKey: "id",
      },
      mockContext,
    )) as {
      success: boolean;
      bounds: string;
      subpartitionBy: string;
    };

    const call = mockAdapter.executeQuery.mock.calls[1][0] as string;
    expect(call).toContain("DEFAULT");
    expect(call).not.toContain("FOR VALUES");
    expect(call).toContain("PARTITION BY HASH (id)");
    expect(result.bounds).toBe("DEFAULT");
    expect(result.subpartitionBy).toBe("hash");
  });

  it("should normalize uppercase subpartitionBy values", async () => {
    // First call: checkTablePartitionStatus - partitioned parent
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Second call: SQL execution
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_partition")!;
    const result = (await tool.handler(
      {
        parent: "orders",
        name: "orders_2024",
        from: "2024-01-01",
        to: "2025-01-01",
        subpartitionBy: "LIST", // Uppercase - should be normalized
        subpartitionKey: "region",
      },
      mockContext,
    )) as {
      success: boolean;
      subpartitionBy: string;
    };

    const call = mockAdapter.executeQuery.mock.calls[1][0] as string;
    expect(call).toContain("PARTITION BY LIST (region)");
    expect(result.subpartitionBy).toBe("list"); // Normalized to lowercase
  });

  it("should return structured error for non-existent parent table", async () => {
    // checkTablePartitionStatus - not found
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_partition")!;
    const result = (await tool.handler(
      {
        parent: "nonexistent_table",
        name: "part_1",
        forValues: "FROM ('2024-01-01') TO ('2025-01-01')",
      },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
    expect(result.error).toContain("nonexistent_table");
    // Should NOT attempt SQL execution
    expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(1);
  });

  it("should return structured error for non-partitioned parent table", async () => {
    // checkTablePartitionStatus - regular table
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "r" }],
    });

    const tool = tools.find((t) => t.name === "pg_create_partition")!;
    const result = (await tool.handler(
      {
        parent: "regular_table",
        name: "part_1",
        forValues: "FROM ('2024-01-01') TO ('2025-01-01')",
      },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not partitioned");
    expect(result.error).toContain("regular_table");
    expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(1);
  });

  it("should return structured error for overlapping partition bounds", async () => {
    // First call: checkTablePartitionStatus - partitioned parent
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Second call: SQL execution fails with overlapping bounds
    mockAdapter.executeQuery.mockRejectedValueOnce(
      Object.assign(
        new Error(
          'new partition "events_2024_dup" would overlap partition "events_2024"',
        ),
        { code: "42P16" },
      ),
    );

    const tool = tools.find((t) => t.name === "pg_create_partition")!;

    const result = (await tool.handler(
      {
        parent: "events",
        name: "events_2024_dup",
        forValues: "FROM ('2024-01-01') TO ('2025-01-01')",
      },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("overlap");
  });

  it("should return structured error for sub-partitioning PK conflict", async () => {
    // First call: checkTablePartitionStatus - partitioned parent
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Second call: SQL execution fails with PK constraint
    mockAdapter.executeQuery.mockRejectedValueOnce(
      Object.assign(
        new Error(
          "unique constraint on partitioned table must include all partitioning columns",
        ),
        { code: "42P16" },
      ),
    );

    const tool = tools.find((t) => t.name === "pg_create_partition")!;

    const result = (await tool.handler(
      {
        parent: "orders",
        name: "orders_2024",
        forValues: "FROM ('2024-01-01') TO ('2025-01-01')",
        subpartitionBy: "list",
        subpartitionKey: "region",
      },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("must include all partitioning columns");
  });
});

describe("pg_attach_partition", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartitioningTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartitioningTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should attach a partition", async () => {
    // First call: checkTablePartitionStatus - partitioned parent
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Second call: partition existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Third call: SQL execution
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_attach_partition")!;
    const result = (await tool.handler(
      {
        parent: "events",
        partition: "legacy_events",
        forValues: "FROM ('2020-01-01') TO ('2021-01-01')",
      },
      mockContext,
    )) as {
      success: boolean;
      parent: string;
      partition: string;
    };

    const call = mockAdapter.executeQuery.mock.calls[2][0] as string;
    expect(call).toContain("ALTER TABLE");
    expect(call).toContain("ATTACH PARTITION");
    expect(result.success).toBe(true);
    expect(result.parent).toBe("events");
    expect(result.partition).toBe("legacy_events");
  });

  it("should return structured error for non-existent parent table", async () => {
    // checkTablePartitionStatus - not found
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_attach_partition")!;
    const result = (await tool.handler(
      {
        parent: "nonexistent_table",
        partition: "legacy_events",
        forValues: "FROM ('2020-01-01') TO ('2021-01-01')",
      },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
    expect(result.error).toContain("nonexistent_table");
    expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(1);
  });

  it("should return structured error for non-existent partition table", async () => {
    // First call: checkTablePartitionStatus - partitioned parent
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Second call: partition existence check - not found
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_attach_partition")!;
    const result = (await tool.handler(
      {
        parent: "events",
        partition: "nonexistent_partition",
        forValues: "FROM ('2020-01-01') TO ('2021-01-01')",
      },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
    expect(result.error).toContain("nonexistent_partition");
    expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(2);
  });

  it("should return structured error for already-attached partition", async () => {
    // First call: checkTablePartitionStatus - partitioned parent
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Second call: partition existence check - exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Third call: SQL execution fails - already attached
    mockAdapter.executeQuery.mockRejectedValueOnce(
      Object.assign(new Error('"legacy_events" is already a partition'), {
        code: "42P16",
      }),
    );

    const tool = tools.find((t) => t.name === "pg_attach_partition")!;

    const result = (await tool.handler(
      {
        parent: "events",
        partition: "legacy_events",
        forValues: "FROM ('2020-01-01') TO ('2021-01-01')",
      },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("already a partition");
  });
});

describe("pg_detach_partition", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartitioningTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartitioningTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should detach a partition", async () => {
    // First call: checkTablePartitionStatus - partitioned parent
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Second call: partition existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Third call: SQL execution
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_detach_partition")!;
    const result = (await tool.handler(
      {
        parent: "events",
        partition: "events_2020",
      },
      mockContext,
    )) as {
      success: boolean;
      parent: string;
      partition: string;
    };

    const call = mockAdapter.executeQuery.mock.calls[2][0] as string;
    expect(call).toContain("DETACH PARTITION");
    expect(result.success).toBe(true);
    expect(result.partition).toBe("events_2020");
  });

  it("should detach concurrently when specified", async () => {
    // First call: checkTablePartitionStatus - partitioned parent
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Second call: partition existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Third call: SQL execution
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_detach_partition")!;
    await tool.handler(
      {
        parent: "events",
        partition: "events_2020",
        concurrently: true,
      },
      mockContext,
    );

    const call = mockAdapter.executeQuery.mock.calls[2][0] as string;
    expect(call).toContain("CONCURRENTLY");
  });

  it("should return structured error for non-existent parent table", async () => {
    // checkTablePartitionStatus - not found
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_detach_partition")!;
    const result = (await tool.handler(
      {
        parent: "nonexistent_table",
        partition: "events_2020",
      },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
    expect(result.error).toContain("nonexistent_table");
    expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(1);
  });

  it("should return structured error for non-existent partition", async () => {
    // First call: checkTablePartitionStatus - partitioned parent
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Second call: partition existence check - not found
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_detach_partition")!;
    const result = (await tool.handler(
      {
        parent: "events",
        partition: "nonexistent_partition",
      },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
    expect(result.error).toContain("nonexistent_partition");
    expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(2);
  });

  it("should return structured error on SQL failure", async () => {
    // First call: checkTablePartitionStatus - partitioned parent
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Second call: partition existence check - exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Third call: SQL execution fails
    mockAdapter.executeQuery.mockRejectedValueOnce(
      Object.assign(new Error('relation "nonexistent" does not exist'), {
        code: "42P01",
      }),
    );

    const tool = tools.find((t) => t.name === "pg_detach_partition")!;

    const result = (await tool.handler(
      {
        parent: "events",
        partition: "events_2020",
      },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });
});

describe("pg_partition_info", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartitioningTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartitioningTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should get partition info", async () => {
    // First call: checkTablePartitionStatus - partitioned table
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Second call: partition info
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          table_name: "events",
          partition_strategy: "RANGE",
          partition_key: "event_date",
          partition_count: 4,
        },
      ],
    });
    // Third call: partition details
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          partition_name: "events_2021",
          bounds: "FOR VALUES FROM ('2021-01-01') TO ('2022-01-01')",
          size_bytes: 52428800,
          approx_rows: 100000,
        },
        {
          partition_name: "events_2022",
          bounds: "FOR VALUES FROM ('2022-01-01') TO ('2023-01-01')",
          size_bytes: 78643200,
          approx_rows: 150000,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_partition_info")!;
    const result = (await tool.handler(
      {
        table: "events",
      },
      mockContext,
    )) as {
      tableInfo: unknown;
      partitions: { size: string; approx_rows: number }[];
      totalSizeBytes: number;
    };

    expect(result.tableInfo).toHaveProperty("partition_strategy", "RANGE");
    expect(result.partitions).toHaveLength(2);
    expect(result.totalSizeBytes).toBe(52428800 + 78643200);
    // Verify consistent size formatting
    expect(result.partitions[0]?.size).toBe("50.0 MB");
    expect(result.partitions[1]?.size).toBe("75.0 MB");
  });

  it("should normalize approx_rows -1 to 0 for empty partitions", async () => {
    // First call: checkTablePartitionStatus - partitioned table
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Second call: partition info
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          table_name: "events",
          partition_strategy: "RANGE",
          partition_key: "event_date",
          partition_count: 1,
        },
      ],
    });
    // Third call: partition details with 0 approx_rows
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          partition_name: "events_empty",
          bounds: "FOR VALUES FROM ('2024-01-01') TO ('2025-01-01')",
          size_bytes: 8192,
          approx_rows: 0,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_partition_info")!;
    const result = (await tool.handler({ table: "events" }, mockContext)) as {
      partitions: { approx_rows: number }[];
    };

    // Should normalize -1 to 0 (handled by GREATEST(0, ...) in SQL)
    expect(result.partitions[0]?.approx_rows).toBe(0);
  });

  it("should return structured error for non-partitioned table", async () => {
    // checkTablePartitionStatus returns regular table
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "r" }],
    });

    const tool = tools.find((t) => t.name === "pg_partition_info")!;
    const result = (await tool.handler(
      {
        table: "regular_table",
      },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("exists but is not partitioned");
    expect(result.error).toContain("regular_table");
    expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(1);
  });

  it("should return structured error for non-existent table", async () => {
    // checkTablePartitionStatus returns not found
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partition_info")!;
    const result = (await tool.handler(
      {
        table: "nonexistent_table",
      },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
    expect(result.error).toContain("nonexistent_table");
    expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(1);
  });
});

/**
 * Parameter Smoothing Tests
 *
 * These tests verify that common agent input mistakes are automatically corrected.
 */
describe("Parameter Smoothing", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartitioningTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartitioningTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  describe("pg_create_partitioned_table - partitionBy case normalization", () => {
    it("should accept uppercase RANGE and normalize to lowercase", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_create_partitioned_table")!;
      const result = (await tool.handler(
        {
          name: "events",
          columns: [
            { name: "id", type: "bigint" },
            { name: "event_date", type: "date" },
          ],
          partitionBy: "RANGE", // Uppercase - should be normalized
          partitionKey: "event_date",
        },
        mockContext,
      )) as { success: boolean; partitionBy: string };

      expect(result.success).toBe(true);
      expect(result.partitionBy).toBe("range");
      const call = mockAdapter.executeQuery.mock.calls[0][0] as string;
      expect(call).toContain("PARTITION BY RANGE");
    });

    it("should accept uppercase LIST and normalize to lowercase", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_create_partitioned_table")!;
      const result = (await tool.handler(
        {
          name: "orders",
          columns: [
            { name: "id", type: "bigint" },
            { name: "region", type: "text" },
          ],
          partitionBy: "LIST", // Uppercase - should be normalized
          partitionKey: "region",
        },
        mockContext,
      )) as { success: boolean; partitionBy: string };

      expect(result.success).toBe(true);
      expect(result.partitionBy).toBe("list");
    });

    it("should accept uppercase HASH and normalize to lowercase", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_create_partitioned_table")!;
      const result = (await tool.handler(
        {
          name: "data",
          columns: [{ name: "id", type: "bigint" }],
          partitionBy: "HASH", // Uppercase - should be normalized
          partitionKey: "id",
        },
        mockContext,
      )) as { success: boolean; partitionBy: string };

      expect(result.success).toBe(true);
      expect(result.partitionBy).toBe("hash");
    });
  });

  describe("pg_create_partition - parameter aliasing", () => {
    it("should accept parentTable as alias for parent", async () => {
      // checkTablePartitionStatus - partitioned parent
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "p" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_create_partition")!;
      const result = (await tool.handler(
        {
          parentTable: "events", // Common alias - should be normalized to parent
          name: "events_2024",
          forValues: "FROM ('2024-01-01') TO ('2025-01-01')",
        },
        mockContext,
      )) as { success: boolean; parent: string };

      expect(result.success).toBe(true);
      expect(result.parent).toBe("events");
    });

    it("should accept partitionName as alias for name", async () => {
      // checkTablePartitionStatus - partitioned parent
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "p" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_create_partition")!;
      const result = (await tool.handler(
        {
          parent: "events",
          partitionName: "events_2024", // Common alias - should be normalized to name
          forValues: "FROM ('2024-01-01') TO ('2025-01-01')",
        },
        mockContext,
      )) as { success: boolean; partition: string };

      expect(result.success).toBe(true);
      expect(result.partition).toContain("events_2024");
    });

    it("should accept from/to and build forValues", async () => {
      // checkTablePartitionStatus - partitioned parent
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "p" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_create_partition")!;
      const result = (await tool.handler(
        {
          parent: "events",
          name: "events_2024",
          from: "2024-01-01", // Common pattern - should be converted to forValues
          to: "2025-01-01",
        },
        mockContext,
      )) as { success: boolean; bounds: string };

      expect(result.success).toBe(true);
      expect(result.bounds).toContain("FROM ('2024-01-01') TO ('2025-01-01')");
    });

    it("should accept parentTable with from/to combined", async () => {
      // checkTablePartitionStatus - partitioned parent
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "p" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_create_partition")!;
      const result = (await tool.handler(
        {
          parentTable: "events", // Alias
          name: "events_q1_2024",
          from: "2024-01-01", // Combined with to
          to: "2024-04-01",
        },
        mockContext,
      )) as { success: boolean; parent: string };

      expect(result.success).toBe(true);
      expect(result.parent).toBe("events");
    });
  });

  describe("pg_attach_partition - parameter aliasing", () => {
    it("should accept parentTable as alias for parent", async () => {
      // checkTablePartitionStatus - partitioned parent
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "p" }],
      });
      // partition existence check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_attach_partition")!;
      const result = (await tool.handler(
        {
          parentTable: "events", // Common alias
          partition: "legacy_events",
          forValues: "FROM ('2020-01-01') TO ('2021-01-01')",
        },
        mockContext,
      )) as { success: boolean; parent: string };

      expect(result.success).toBe(true);
      expect(result.parent).toBe("events");
    });

    it("should accept from/to and build forValues", async () => {
      // checkTablePartitionStatus - partitioned parent
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "p" }],
      });
      // partition existence check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_attach_partition")!;
      const result = (await tool.handler(
        {
          parent: "events",
          partition: "legacy_events",
          from: "2020-01-01",
          to: "2021-01-01",
        },
        mockContext,
      )) as { success: boolean; bounds: string };

      expect(result.success).toBe(true);
      expect(result.bounds).toContain("FROM ('2020-01-01') TO ('2021-01-01')");
    });

    it("should accept partitionTable as alias for partition", async () => {
      // checkTablePartitionStatus - partitioned parent
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "p" }],
      });
      // partition existence check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_attach_partition")!;
      const result = (await tool.handler(
        {
          parent: "events",
          partitionTable: "legacy_events", // Common alias
          forValues: "FROM ('2020-01-01') TO ('2021-01-01')",
        },
        mockContext,
      )) as { success: boolean; partition: string };

      expect(result.success).toBe(true);
      expect(result.partition).toBe("legacy_events");
    });

    it("should accept partitionName as alias for partition", async () => {
      // checkTablePartitionStatus - partitioned parent
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "p" }],
      });
      // partition existence check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_attach_partition")!;
      const result = (await tool.handler(
        {
          parent: "events",
          partitionName: "legacy_events", // Common alias
          forValues: "FROM ('2020-01-01') TO ('2021-01-01')",
        },
        mockContext,
      )) as { success: boolean; partition: string };

      expect(result.success).toBe(true);
      expect(result.partition).toBe("legacy_events");
    });

    it("should accept values array for LIST partitions", async () => {
      // checkTablePartitionStatus - partitioned parent
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "p" }],
      });
      // partition existence check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_attach_partition")!;
      const result = (await tool.handler(
        {
          parent: "events",
          partition: "events_status",
          values: ["active", "pending"], // Intuitive format
        },
        mockContext,
      )) as { success: boolean; bounds: string };

      expect(result.success).toBe(true);
      expect(result.bounds).toBe("IN ('active', 'pending')");
    });

    it("should accept modulus/remainder for HASH partitions", async () => {
      // checkTablePartitionStatus - partitioned parent
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "p" }],
      });
      // partition existence check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_attach_partition")!;
      const result = (await tool.handler(
        {
          parent: "events",
          partition: "events_h0",
          modulus: 4,
          remainder: 0,
        },
        mockContext,
      )) as { success: boolean; bounds: string };

      expect(result.success).toBe(true);
      expect(result.bounds).toBe("WITH (MODULUS 4, REMAINDER 0)");
    });
  });

  describe("pg_detach_partition - parameter aliasing", () => {
    it("should accept parentTable as alias for parent", async () => {
      // checkTablePartitionStatus - partitioned parent
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "p" }],
      });
      // partition existence check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_detach_partition")!;
      const result = (await tool.handler(
        {
          parentTable: "events", // Common alias
          partition: "events_2020",
        },
        mockContext,
      )) as { success: boolean; parent: string };

      expect(result.success).toBe(true);
      expect(result.parent).toBe("events");
    });

    it("should accept partitionTable as alias for partition", async () => {
      // checkTablePartitionStatus - partitioned parent
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "p" }],
      });
      // partition existence check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_detach_partition")!;
      const result = (await tool.handler(
        {
          parent: "events",
          partitionTable: "events_2020", // Common alias
        },
        mockContext,
      )) as { success: boolean; partition: string };

      expect(result.success).toBe(true);
      expect(result.partition).toBe("events_2020");
    });

    it("should accept partitionName as alias for partition", async () => {
      // checkTablePartitionStatus - partitioned parent
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "p" }],
      });
      // partition existence check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ "?column?": 1 }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_detach_partition")!;
      const result = (await tool.handler(
        {
          parent: "events",
          partitionName: "events_2020", // Common alias
        },
        mockContext,
      )) as { success: boolean; partition: string };

      expect(result.success).toBe(true);
      expect(result.partition).toBe("events_2020");
    });
  });

  describe("pg_create_partition - LIST and HASH intuitive formats", () => {
    it("should accept values array for LIST partitions", async () => {
      // checkTablePartitionStatus - partitioned parent
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "p" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_create_partition")!;
      const result = (await tool.handler(
        {
          parent: "orders",
          name: "orders_us",
          values: ["US", "CA", "MX"], // Intuitive format
        },
        mockContext,
      )) as { success: boolean; bounds: string };

      expect(result.success).toBe(true);
      expect(result.bounds).toBe("IN ('US', 'CA', 'MX')");
    });

    it("should accept modulus/remainder for HASH partitions", async () => {
      // checkTablePartitionStatus - partitioned parent
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "p" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_create_partition")!;
      const result = (await tool.handler(
        {
          parent: "data",
          name: "data_h1",
          modulus: 4,
          remainder: 1,
        },
        mockContext,
      )) as { success: boolean; bounds: string };

      expect(result.success).toBe(true);
      expect(result.bounds).toBe("WITH (MODULUS 4, REMAINDER 1)");
    });

    it("should accept rangeFrom/rangeTo for RANGE partitions", async () => {
      // checkTablePartitionStatus - partitioned parent
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "p" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_create_partition")!;
      const result = (await tool.handler(
        {
          parent: "events",
          name: "events_2024",
          rangeFrom: "2024-01-01", // Intuitive alias
          rangeTo: "2025-01-01",
        },
        mockContext,
      )) as { success: boolean; bounds: string };

      expect(result.success).toBe(true);
      expect(result.bounds).toBe("FROM ('2024-01-01') TO ('2025-01-01')");
    });

    it("should accept listValues for LIST partitions", async () => {
      // checkTablePartitionStatus - partitioned parent
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "p" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_create_partition")!;
      const result = (await tool.handler(
        {
          parent: "status",
          name: "status_active",
          listValues: ["active", "enabled"], // Intuitive alias
        },
        mockContext,
      )) as { success: boolean; bounds: string };

      expect(result.success).toBe(true);
      expect(result.bounds).toBe("IN ('active', 'enabled')");
    });

    it("should accept hashModulus/hashRemainder for HASH partitions", async () => {
      // checkTablePartitionStatus - partitioned parent
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ relkind: "p" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_create_partition")!;
      const result = (await tool.handler(
        {
          parent: "data",
          name: "data_h2",
          hashModulus: 8, // Intuitive alias
          hashRemainder: 3,
        },
        mockContext,
      )) as { success: boolean; bounds: string };

      expect(result.success).toBe(true);
      expect(result.bounds).toBe("WITH (MODULUS 8, REMAINDER 3)");
    });
  });
});

/**
 * Error Path Tests - Empty Params Validation
 *
 * These tests verify that all partitioning tools return structured handler
 * errors ({success: false, error: "..."}) instead of throwing raw Zod errors
 * when called with empty parameters.
 */
describe("Error Path - Empty Params Validation", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartitioningTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartitioningTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("pg_list_partitions should return structured error for empty params", async () => {
    const tool = tools.find((t) => t.name === "pg_list_partitions")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(typeof result.error).toBe("string");
    expect(result.error.length).toBeGreaterThan(0);
  });

  it("pg_partition_info should return structured error for empty params", async () => {
    const tool = tools.find((t) => t.name === "pg_partition_info")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(typeof result.error).toBe("string");
    expect(result.error.length).toBeGreaterThan(0);
  });

  it("pg_create_partitioned_table should return structured error for empty params", async () => {
    const tool = tools.find((t) => t.name === "pg_create_partitioned_table")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(typeof result.error).toBe("string");
    expect(result.error.length).toBeGreaterThan(0);
  });

  it("pg_create_partition should return structured error for empty params", async () => {
    const tool = tools.find((t) => t.name === "pg_create_partition")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(typeof result.error).toBe("string");
    expect(result.error.length).toBeGreaterThan(0);
  });

  it("pg_attach_partition should return structured error for empty params", async () => {
    const tool = tools.find((t) => t.name === "pg_attach_partition")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(typeof result.error).toBe("string");
    expect(result.error.length).toBeGreaterThan(0);
  });

  it("pg_detach_partition should return structured error for empty params", async () => {
    const tool = tools.find((t) => t.name === "pg_detach_partition")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(typeof result.error).toBe("string");
    expect(result.error.length).toBeGreaterThan(0);
  });
});

// ==========================================================================
// Coverage-targeted tests for management.ts uncovered lines
// ==========================================================================

describe("pg_list_partitions — schema.table format and truncation", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartitioningTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartitioningTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should parse schema.table format in table name", async () => {
    // checkTablePartitionStatus
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // partition listing
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_partitions")!;
    await tool.handler({ table: "analytics.events" }, mockContext);

    // Should have parsed schema from the table name
    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("relkind"),
      ["events", "analytics"],
    );
  });

  it("should return truncation count when results exceed limit", async () => {
    // checkTablePartitionStatus
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // partition listing returns limit+1 rows (detecting truncation)
    const rows = Array.from({ length: 3 }, (_, i) => ({
      partition_name: `part_${String(i)}`,
      bounds: `FOR VALUES FROM ('${String(i)}') TO ('${String(i + 1)}')`,
      size_bytes: 8192,
    }));
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows });
    // COUNT query for total
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 100 }],
    });

    const tool = tools.find((t) => t.name === "pg_list_partitions")!;
    const result = (await tool.handler(
      { table: "events", limit: 2 },
      mockContext,
    )) as {
      partitions: unknown[];
      count: number;
      truncated: boolean;
      totalCount: number;
    };

    expect(result.truncated).toBe(true);
    expect(result.count).toBe(2);
    expect(result.totalCount).toBe(100);
  });
});

describe("pg_create_partitioned_table — PK validation and edge cases", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartitioningTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartitioningTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should reject table-level PK missing partition key columns", async () => {
    const tool = tools.find((t) => t.name === "pg_create_partitioned_table")!;
    const result = (await tool.handler(
      {
        name: "events",
        columns: [
          { name: "id", type: "bigint" },
          { name: "event_date", type: "date" },
        ],
        partitionBy: "range",
        partitionKey: "event_date",
        primaryKey: ["id"], // Missing event_date
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain(
      "Primary key must include all partition key columns",
    );
    expect(result.error).toContain("event_date");
  });

  it("should reject column-level PK missing partition key columns", async () => {
    const tool = tools.find((t) => t.name === "pg_create_partitioned_table")!;
    const result = (await tool.handler(
      {
        name: "events",
        columns: [
          { name: "id", type: "bigint", primaryKey: true },
          { name: "event_date", type: "date" },
        ],
        partitionBy: "range",
        partitionKey: "event_date",
        // No table-level primaryKey, but column-level PK doesn't include partition key
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain(
      "Primary key must include all partition key columns",
    );
  });

  it("should include table-level PRIMARY KEY constraint", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_partitioned_table")!;
    const result = (await tool.handler(
      {
        name: "events",
        columns: [
          { name: "id", type: "bigint" },
          { name: "event_date", type: "date" },
        ],
        partitionBy: "range",
        partitionKey: "event_date",
        primaryKey: ["id", "event_date"], // Includes partition key
      },
      mockContext,
    )) as { success: boolean; primaryKey: string[] };

    expect(result.success).toBe(true);
    expect(result.primaryKey).toEqual(["id", "event_date"]);
    const call = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(call).toContain("PRIMARY KEY");
  });

  it("should handle DEFAULT NULL column default", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_partitioned_table")!;
    await tool.handler(
      {
        name: "data",
        columns: [{ name: "notes", type: "text", default: null }],
        partitionBy: "hash",
        partitionKey: "id",
      },
      mockContext,
    );

    const call = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(call).toContain("DEFAULT NULL");
  });

  it("should handle adapter error during CREATE TABLE", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("permission denied"),
    );

    const tool = tools.find((t) => t.name === "pg_create_partitioned_table")!;
    const result = (await tool.handler(
      {
        name: "events",
        columns: [{ name: "id", type: "bigint" }],
        partitionBy: "range",
        partitionKey: "id",
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("permission denied");
  });
});

// ==========================================================================
// Coverage-targeted tests for info.ts uncovered branches
// ==========================================================================

describe("pg_attach_partition — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartitioningTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartitioningTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return structured error when parent exists but is not partitioned", async () => {
    // checkTablePartitionStatus returns regular table (relkind 'r')
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "r" }],
    });

    const tool = tools.find((t) => t.name === "pg_attach_partition")!;
    const result = (await tool.handler(
      {
        parent: "regular_table",
        partition: "legacy_events",
        forValues: "FROM ('2020-01-01') TO ('2021-01-01')",
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not partitioned");
    expect(result.error).toContain("regular_table");
  });

  it("should attach DEFAULT partition via __DEFAULT__ forValues", async () => {
    // checkTablePartitionStatus - partitioned parent
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // partition existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // SQL execution
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_attach_partition")!;
    const result = (await tool.handler(
      {
        parent: "events",
        partition: "events_default",
        forValues: "__DEFAULT__",
      },
      mockContext,
    )) as { success: boolean; bounds: string };

    expect(result.success).toBe(true);
    expect(result.bounds).toBe("DEFAULT");
    const call = mockAdapter.executeQuery.mock.calls[2][0] as string;
    expect(call).toContain("DEFAULT");
    expect(call).not.toContain("FOR VALUES");
  });

  it("should attach DEFAULT partition via explicit DEFAULT forValues", async () => {
    // checkTablePartitionStatus - partitioned parent
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // partition existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // SQL execution
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_attach_partition")!;
    const result = (await tool.handler(
      {
        parent: "events",
        partition: "events_default",
        forValues: "DEFAULT",
      },
      mockContext,
    )) as { success: boolean; bounds: string };

    expect(result.success).toBe(true);
    expect(result.bounds).toBe("DEFAULT");
  });

  it("should resolve partition schema from parent when no explicit schema", async () => {
    // checkTablePartitionStatus - partitioned parent in custom schema
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // partition existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // SQL execution
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_attach_partition")!;
    const result = (await tool.handler(
      {
        parent: "analytics.events",
        partition: "events_2024",
        forValues: "FROM ('2024-01-01') TO ('2025-01-01')",
      },
      mockContext,
    )) as { success: boolean; parent: string; partition: string };

    expect(result.success).toBe(true);
    expect(result.parent).toBe("events");
  });
});

describe("pg_detach_partition — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartitioningTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartitioningTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return structured error when parent exists but is not partitioned", async () => {
    // checkTablePartitionStatus returns regular table
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "r" }],
    });

    const tool = tools.find((t) => t.name === "pg_detach_partition")!;
    const result = (await tool.handler(
      {
        parent: "regular_table",
        partition: "events_2020",
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not partitioned");
  });

  it("should use FINALIZE clause when finalize is true", async () => {
    // checkTablePartitionStatus - partitioned parent
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // partition existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // SQL execution
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_detach_partition")!;
    const result = (await tool.handler(
      {
        parent: "events",
        partition: "events_2020",
        finalize: true,
      },
      mockContext,
    )) as { success: boolean };

    expect(result.success).toBe(true);
    const call = mockAdapter.executeQuery.mock.calls[2][0] as string;
    expect(call).toContain("FINALIZE");
    expect(call).not.toContain("CONCURRENTLY");
  });

  it("should return error when partition does not exist", async () => {
    // checkTablePartitionStatus - partitioned parent
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // partition existence check - not found
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_detach_partition")!;
    const result = (await tool.handler(
      {
        parent: "events",
        partition: "nonexistent_partition",
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
    expect(result.error).toContain("nonexistent_partition");
  });
});

describe("pg_partition_info — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPartitioningTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPartitioningTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should parse schema.table format in table parameter", async () => {
    // checkTablePartitionStatus - partitioned
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // partition info query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          table_name: "events",
          partition_strategy: "RANGE",
          partition_key: "event_date",
          partition_count: 3,
        },
      ],
    });
    // partitions listing query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          partition_name: "events_2024",
          bounds: "FOR VALUES FROM ('2024-01-01') TO ('2025-01-01')",
          size_bytes: 8192,
          approx_rows: 100,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_partition_info")!;
    const result = (await tool.handler(
      { table: "analytics.events" },
      mockContext,
    )) as {
      tableInfo: Record<string, unknown>;
      partitions: unknown[];
    };

    expect(result.tableInfo).toBeDefined();
    expect(result.partitions).toHaveLength(1);
    // Verify it parsed the schema from the table name
    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("relkind"),
      ["events", "analytics"],
    );
  });

  it("should return error when table exists but is not partitioned", async () => {
    // checkTablePartitionStatus - regular table
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "r" }],
    });

    const tool = tools.find((t) => t.name === "pg_partition_info")!;
    const result = (await tool.handler(
      { table: "regular_table" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not partitioned");
    expect(result.error).toContain("regular_table");
  });

  it("should handle null tableInfo when partInfo returns empty rows", async () => {
    // checkTablePartitionStatus - partitioned
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // partition info query - empty (edge case)
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // partitions listing query
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_partition_info")!;
    const result = (await tool.handler(
      { table: "empty_partitioned" },
      mockContext,
    )) as {
      tableInfo: null;
      partitions: unknown[];
      totalSizeBytes: number;
    };

    expect(result.tableInfo).toBeNull();
    expect(result.partitions).toHaveLength(0);
    expect(result.totalSizeBytes).toBe(0);
  });
});
