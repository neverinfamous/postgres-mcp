/**
 * postgres-mcp - Backup Tools Unit Tests
 *
 * Tests for PostgreSQL backup tools including dump operations,
 * COPY commands, and backup planning.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getBackupTools } from "../index.js";
import type { PostgresAdapter } from "../../../PostgresAdapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../../__tests__/mocks/index.js";

describe("getBackupTools", () => {
  let adapter: PostgresAdapter;
  let tools: ReturnType<typeof getBackupTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockPostgresAdapter() as unknown as PostgresAdapter;
    tools = getBackupTools(adapter);
  });

  it("should return 9 backup tools", () => {
    expect(tools).toHaveLength(9);
  });

  it("should have all expected tool names", () => {
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("pg_dump_table");
    expect(toolNames).toContain("pg_dump_schema");
    expect(toolNames).toContain("pg_copy_export");
    expect(toolNames).toContain("pg_copy_import");
    expect(toolNames).toContain("pg_create_backup_plan");
    expect(toolNames).toContain("pg_restore_command");
    expect(toolNames).toContain("pg_backup_physical");
    expect(toolNames).toContain("pg_restore_validate");
    expect(toolNames).toContain("pg_backup_schedule_optimize");
  });

  it("should have group set to backup for all tools", () => {
    for (const tool of tools) {
      expect(tool.group).toBe("backup");
    }
  });
});

describe("pg_dump_table", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getBackupTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getBackupTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should generate CREATE TABLE statement", async () => {
    // Mock relkind query (first) - 'r' = regular table
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "r" }],
    });
    mockAdapter.describeTable.mockResolvedValueOnce({
      name: "users",
      schema: "public",
      type: "table",
      columns: [
        { name: "id", type: "integer", nullable: false, primaryKey: true },
        { name: "name", type: "varchar(255)", nullable: true },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = (await tool.handler(
      {
        table: "users",
      },
      mockContext,
    )) as {
      ddl: string;
      note: string;
    };

    expect(result.ddl).toContain("CREATE TABLE");
    expect(result.ddl).toContain('"id" integer');
    expect(result.ddl).toContain("NOT NULL");
    expect(result.note).toContain("pg_get_indexes");
  });

  it("should return ddl field with note about limitations", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "r" }],
    });
    mockAdapter.describeTable.mockResolvedValueOnce({
      name: "products",
      schema: "public",
      type: "table",
      columns: [{ name: "id", type: "integer", nullable: false }],
    });

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = (await tool.handler(
      {
        table: "products",
      },
      mockContext,
    )) as {
      ddl: string;
      note: string;
    };

    expect(result.ddl).toContain("CREATE TABLE");
    expect(result.note).toBeDefined();
    expect(result.note).toContain("constraints");
  });

  it("should include data when requested", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "r" }],
    });
    mockAdapter.describeTable.mockResolvedValueOnce({
      name: "users",
      schema: "public",
      type: "table",
      columns: [{ name: "id", type: "integer", nullable: false }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1 }, { id: 2 }],
    });

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = (await tool.handler(
      {
        table: "users",
        includeData: true,
      },
      mockContext,
    )) as {
      ddl: string;
      insertStatements: string;
    };

    expect(result.insertStatements).toContain("INSERT INTO");
    expect(result.insertStatements).toContain("VALUES");
  });

  it("should handle object-type default values", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "r" }],
    });
    mockAdapter.describeTable.mockResolvedValueOnce({
      name: "settings",
      schema: "public",
      type: "table",
      columns: [
        { name: "id", type: "integer", nullable: false },
        {
          name: "config",
          type: "jsonb",
          nullable: true,
          defaultValue: { key: "value" },
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = (await tool.handler(
      {
        table: "settings",
      },
      mockContext,
    )) as {
      ddl: string;
    };

    expect(result.ddl).toContain("DEFAULT");
    expect(result.ddl).toContain('"config" jsonb');
  });

  it("should handle non-string/number/boolean default values", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "r" }],
    });
    mockAdapter.describeTable.mockResolvedValueOnce({
      name: "test_table",
      schema: "public",
      type: "table",
      columns: [
        { name: "id", type: "integer", nullable: false },
        {
          name: "data",
          type: "text",
          nullable: true,
          defaultValue: Symbol("test"),
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = (await tool.handler(
      {
        table: "test_table",
      },
      mockContext,
    )) as {
      ddl: string;
    };

    // Should stringify unknown types
    expect(result.ddl).toContain("DEFAULT");
  });

  it("should handle string default values", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "r" }],
    });
    mockAdapter.describeTable.mockResolvedValueOnce({
      name: "users",
      schema: "public",
      type: "table",
      columns: [
        {
          name: "status",
          type: "varchar(50)",
          nullable: false,
          defaultValue: "active",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = (await tool.handler(
      {
        table: "users",
      },
      mockContext,
    )) as {
      ddl: string;
    };

    expect(result.ddl).toContain("DEFAULT active");
  });

  it("should handle number default values", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "r" }],
    });
    mockAdapter.describeTable.mockResolvedValueOnce({
      name: "counters",
      schema: "public",
      type: "table",
      columns: [
        { name: "count", type: "integer", nullable: false, defaultValue: 0 },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = (await tool.handler(
      {
        table: "counters",
      },
      mockContext,
    )) as {
      ddl: string;
    };

    expect(result.ddl).toContain("DEFAULT 0");
  });

  it("should handle boolean default values", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "r" }],
    });
    mockAdapter.describeTable.mockResolvedValueOnce({
      name: "flags",
      schema: "public",
      type: "table",
      columns: [
        {
          name: "active",
          type: "boolean",
          nullable: false,
          defaultValue: true,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = (await tool.handler(
      {
        table: "flags",
      },
      mockContext,
    )) as {
      ddl: string;
    };

    expect(result.ddl).toContain("DEFAULT true");
  });

  it("should handle empty data set with includeData: true", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "r" }],
    });
    mockAdapter.describeTable.mockResolvedValueOnce({
      name: "empty_table",
      schema: "public",
      type: "table",
      columns: [{ name: "id", type: "integer", nullable: false }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [],
    });

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = (await tool.handler(
      {
        table: "empty_table",
        includeData: true,
      },
      mockContext,
    )) as {
      ddl: string;
      insertStatements?: string;
    };

    expect(result.ddl).toContain("CREATE TABLE");
    expect(result.insertStatements).toBeUndefined();
  });

  it("should handle undefined first row gracefully", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "r" }],
    });
    mockAdapter.describeTable.mockResolvedValueOnce({
      name: "sparse_table",
      schema: "public",
      type: "table",
      columns: [{ name: "id", type: "integer", nullable: false }],
    });
    // Mock query result with undefined in rows array
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [undefined],
    } as unknown as ReturnType<typeof mockAdapter.executeQuery>);

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = await tool.handler(
      {
        table: "sparse_table",
        includeData: true,
      },
      mockContext,
    );

    expect(result).toBeDefined();
  });

  it("should generate sequence DDL for relkind=S", async () => {
    // First call: relkind check → 'S' (sequence)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "S" }],
    });
    // Second call: pg_sequence info
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          start_value: 1,
          increment_by: 1,
          min_value: 1,
          max_value: 9223372036854775807n,
          cycle: false,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = (await tool.handler(
      { table: "user_id_seq" },
      mockContext,
    )) as { ddl: string; type: string; note: string };

    expect(result.type).toBe("sequence");
    expect(result.ddl).toContain("CREATE SEQUENCE");
    expect(result.ddl).toContain("user_id_seq");
    expect(result.ddl).toContain("START 1");
    expect(result.note).toContain("pg_list_sequences");
  });

  it("should include includeData warning for sequences", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "S" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          start_value: 100,
          increment_by: 10,
          min_value: 1,
          max_value: 1000,
          cycle: true,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = (await tool.handler(
      { table: "counter_seq", includeData: true },
      mockContext,
    )) as { ddl: string; warning: string };

    expect(result.ddl).toContain("INCREMENT 10");
    expect(result.ddl).toContain("CYCLE");
    expect(result.warning).toContain("includeData is ignored");
  });

  it("should fallback sequence DDL when pg_sequence query fails", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "S" }],
    });
    // pg_sequence query fails
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("permission denied"),
    );

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = (await tool.handler({ table: "my_seq" }, mockContext)) as {
      ddl: string;
      type: string;
      note: string;
    };

    expect(result.type).toBe("sequence");
    expect(result.ddl).toContain("CREATE SEQUENCE");
    expect(result.note).toContain("Basic CREATE SEQUENCE");
  });

  it("should generate view DDL for relkind=v", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "v" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ definition: " SELECT id, name FROM users;" }],
    });

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = (await tool.handler(
      { table: "active_users" },
      mockContext,
    )) as { ddl: string; type: string; note: string };

    expect(result.type).toBe("view");
    expect(result.ddl).toContain("CREATE VIEW");
    expect(result.ddl).toContain("SELECT id, name FROM users;");
    expect(result.note).toContain("pg_list_views");
  });

  it("should generate materialized view DDL for relkind=m", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "m" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ definition: " SELECT count(*) FROM orders;" }],
    });

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = (await tool.handler(
      { table: "order_stats" },
      mockContext,
    )) as { ddl: string; type: string };

    expect(result.type).toBe("materialized_view");
    expect(result.ddl).toContain("CREATE MATERIALIZED VIEW");
  });

  it("should fallback view DDL when pg_views query fails", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "v" }],
    });
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("permission denied"),
    );

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = (await tool.handler(
      { table: "broken_view" },
      mockContext,
    )) as { ddl: string; type: string; note: string };

    expect(result.type).toBe("view");
    expect(result.ddl).toContain("Unable to retrieve");
    expect(result.note).toContain("could not be retrieved");
  });

  it("should generate partitioned table DDL with RANGE partition", async () => {
    // relkind='p' (partitioned table)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Partition info query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ partstrat: "r", partition_columns: ["created_at"] }],
    });
    mockAdapter.describeTable.mockResolvedValueOnce({
      name: "events",
      schema: "public",
      type: "table",
      columns: [
        { name: "id", type: "integer", nullable: false },
        { name: "created_at", type: "timestamp", nullable: false },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = (await tool.handler({ table: "events" }, mockContext)) as {
      ddl: string;
      type: string;
      note: string;
    };

    expect(result.type).toBe("partitioned_table");
    expect(result.ddl).toContain("PARTITION BY RANGE");
    expect(result.ddl).toContain('"created_at"');
    expect(result.note).toContain("pg_list_partitions");
  });

  it("should handle LIST partition strategy", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "p" }],
    });
    // Partition info with string array format (PostgreSQL array literal)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ partstrat: "l", partition_columns: "{region}" }],
    });
    mockAdapter.describeTable.mockResolvedValueOnce({
      name: "users",
      schema: "public",
      type: "table",
      columns: [
        { name: "id", type: "integer", nullable: false },
        { name: "region", type: "text", nullable: false },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = (await tool.handler({ table: "users" }, mockContext)) as {
      ddl: string;
    };

    expect(result.ddl).toContain("PARTITION BY LIST");
    expect(result.ddl).toContain('"region"');
  });

  it("should parse schema.table format in table parameter", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "r" }],
    });
    mockAdapter.describeTable.mockResolvedValueOnce({
      name: "users",
      schema: "myschema",
      type: "table",
      columns: [{ name: "id", type: "integer", nullable: false }],
    });

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = (await tool.handler(
      { table: "myschema.users" },
      mockContext,
    )) as { ddl: string };

    expect(result.ddl).toContain('"myschema"."users"');
  });

  it("should return validation error for empty table parameter", async () => {
    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = (await tool.handler({ table: "" }, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("table parameter is required");
  });
});

describe("pg_copy_export — text format edge cases", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getBackupTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getBackupTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should handle empty result in text format", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_copy_export")!;
    const result = (await tool.handler(
      { query: "SELECT * FROM empty", format: "text" },
      mockContext,
    )) as { data: string; rowCount: number };

    expect(result.data).toBe("");
    expect(result.rowCount).toBe(0);
  });

  it("should handle object values in text format", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1, data: { key: "value" } }],
    });

    const tool = tools.find((t) => t.name === "pg_copy_export")!;
    const result = (await tool.handler(
      { query: "SELECT * FROM test", format: "text" },
      mockContext,
    )) as { data: string };

    expect(result.data).toContain('{"key":"value"}');
  });

  it("should handle undefined first row in text format", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [undefined],
    } as unknown as ReturnType<typeof mockAdapter.executeQuery>);

    const tool = tools.find((t) => t.name === "pg_copy_export")!;
    const result = (await tool.handler(
      { query: "SELECT * FROM test", format: "text" },
      mockContext,
    )) as { data: string; rowCount: number };

    expect(result.data).toBe("");
    expect(result.rowCount).toBe(0);
  });

  it("should mark text format results as truncated when limit matches", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: Array.from({ length: 500 }, (_, i) => ({ id: i + 1 })),
    });

    const tool = tools.find((t) => t.name === "pg_copy_export")!;
    const result = (await tool.handler(
      { table: "big_table", format: "text" },
      mockContext,
    )) as { truncated?: boolean; limit?: number };

    expect(result.truncated).toBe(true);
    expect(result.limit).toBe(500);
  });

  it("should exclude header when header=false in text format", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: "Test" }],
    });

    const tool = tools.find((t) => t.name === "pg_copy_export")!;
    const result = (await tool.handler(
      { query: "SELECT * FROM test", format: "text", header: false },
      mockContext,
    )) as { data: string };

    // Should NOT contain header row
    expect(result.data).not.toContain("id\tname");
    expect(result.data).toBe("1\tTest");
  });
});

describe("pg_copy_import — format extensions and options", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getBackupTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getBackupTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should use .txt extension for text format", async () => {
    const tool = tools.find((t) => t.name === "pg_copy_import")!;
    const result = (await tool.handler(
      { table: "users", format: "text" },
      mockContext,
    )) as { command: string };

    expect(result.command).toContain("/path/to/file.txt");
  });

  it("should use .bin extension for binary format", async () => {
    const tool = tools.find((t) => t.name === "pg_copy_import")!;
    const result = (await tool.handler(
      { table: "users", format: "binary" },
      mockContext,
    )) as { command: string };

    expect(result.command).toContain("/path/to/file.bin");
  });

  it("should include header and delimiter options", async () => {
    const tool = tools.find((t) => t.name === "pg_copy_import")!;
    const result = (await tool.handler(
      { table: "users", header: true, delimiter: "|" },
      mockContext,
    )) as { command: string };

    expect(result.command).toContain("HEADER");
    expect(result.command).toContain("DELIMITER '|'");
  });

  it("should support tableName alias", async () => {
    const tool = tools.find((t) => t.name === "pg_copy_import")!;
    const result = (await tool.handler(
      { tableName: "products" },
      mockContext,
    )) as { command: string };

    expect(result.command).toContain('"products"');
  });

  it("should return error when no table provided", async () => {
    const tool = tools.find((t) => t.name === "pg_copy_import")!;

    await expect(tool.handler({}, mockContext)).rejects.toThrow(
      "table parameter is required",
    );
  });

  it("should use custom filePath", async () => {
    const tool = tools.find((t) => t.name === "pg_copy_import")!;
    const result = (await tool.handler(
      { table: "users", filePath: "/data/users.csv" },
      mockContext,
    )) as { command: string };

    expect(result.command).toContain("/data/users.csv");
  });
});

describe("pg_dump_schema", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getBackupTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getBackupTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should generate pg_dump command", async () => {
    const tool = tools.find((t) => t.name === "pg_dump_schema")!;
    const result = (await tool.handler({}, mockContext)) as {
      command: string;
      notes: string[];
    };

    expect(result.command).toContain("pg_dump");
    expect(result.command).toContain("--format=custom");
    expect(result.notes).toBeInstanceOf(Array);
  });

  it("should include schema filter when specified", async () => {
    const tool = tools.find((t) => t.name === "pg_dump_schema")!;
    const result = (await tool.handler(
      {
        schema: "public",
      },
      mockContext,
    )) as {
      command: string;
    };

    expect(result.command).toContain('--schema="public"');
  });

  it("should include table filter when specified", async () => {
    const tool = tools.find((t) => t.name === "pg_dump_schema")!;
    const result = (await tool.handler(
      {
        table: "users",
      },
      mockContext,
    )) as {
      command: string;
    };

    expect(result.command).toContain('--table="users"');
  });
});

describe("pg_copy_export", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getBackupTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getBackupTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should export query results as CSV", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_copy_export")!;
    const result = (await tool.handler(
      {
        query: "SELECT * FROM users",
      },
      mockContext,
    )) as {
      data: string;
      rowCount: number;
    };

    expect(result.data).toContain("id,name");
    expect(result.data).toContain("Alice");
    expect(result.rowCount).toBe(2);
  });

  it("should use custom delimiter", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: "Test" }],
    });

    const tool = tools.find((t) => t.name === "pg_copy_export")!;
    const result = (await tool.handler(
      {
        query: "SELECT * FROM users",
        delimiter: "|",
      },
      mockContext,
    )) as {
      data: string;
    };

    expect(result.data).toContain("id|name");
  });

  it("should exclude header when specified", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1 }],
    });

    const tool = tools.find((t) => t.name === "pg_copy_export")!;
    const result = (await tool.handler(
      {
        query: "SELECT id FROM users",
        header: false,
      },
      mockContext,
    )) as {
      data: string;
    };

    expect(result.data).not.toContain("id,");
    expect(result.data).toBe("1");
  });

  it("should escape values containing delimiter", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1, description: "value,with,commas" }],
    });

    const tool = tools.find((t) => t.name === "pg_copy_export")!;
    const result = (await tool.handler(
      {
        query: "SELECT * FROM test",
      },
      mockContext,
    )) as { data: string };

    // Values with delimiter should be quoted
    expect(result.data).toContain('"value,with,commas"');
  });

  it("should escape values containing quotes", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1, description: 'value "with" quotes' }],
    });

    const tool = tools.find((t) => t.name === "pg_copy_export")!;
    const result = (await tool.handler(
      {
        query: "SELECT * FROM test",
      },
      mockContext,
    )) as { data: string };

    // Quotes should be doubled and value quoted
    expect(result.data).toContain('""with""');
  });

  it("should escape values containing newlines", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1, description: "line1\nline2" }],
    });

    const tool = tools.find((t) => t.name === "pg_copy_export")!;
    const result = (await tool.handler(
      {
        query: "SELECT * FROM test",
      },
      mockContext,
    )) as { data: string };

    // Values with newlines should be quoted
    expect(result.data).toContain('"line1\nline2"');
  });

  it("should handle null values as empty string", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: null }],
    });

    const tool = tools.find((t) => t.name === "pg_copy_export")!;
    const result = (await tool.handler(
      {
        query: "SELECT * FROM test",
      },
      mockContext,
    )) as { data: string };

    expect(result.data).toContain("1,");
  });

  it("should handle object values as JSON", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1, data: { key: "value" } }],
    });

    const tool = tools.find((t) => t.name === "pg_copy_export")!;
    const result = (await tool.handler(
      {
        query: "SELECT * FROM test",
      },
      mockContext,
    )) as { data: string };

    expect(result.data).toContain('{"key":"value"}');
  });

  it("should return tab-delimited data for text format", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, name: "Test" },
        { id: 2, name: "User" },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_copy_export")!;
    const result = (await tool.handler(
      {
        query: "SELECT * FROM test",
        format: "text",
      },
      mockContext,
    )) as { data: string; rowCount: number };

    expect(result.data).toContain("id\tname"); // Tab-delimited header
    expect(result.data).toContain("1\tTest");
    expect(result.data).toContain("2\tUser");
    expect(result.rowCount).toBe(2);
  });

  it("should handle empty result set", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [],
    });

    const tool = tools.find((t) => t.name === "pg_copy_export")!;
    const result = (await tool.handler(
      {
        query: "SELECT * FROM empty_table",
      },
      mockContext,
    )) as { data: string; rowCount: number };

    expect(result.data).toBe("");
    expect(result.rowCount).toBe(0);
  });

  it("should handle undefined rows gracefully", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: undefined,
    } as unknown as ReturnType<typeof mockAdapter.executeQuery>);

    const tool = tools.find((t) => t.name === "pg_copy_export")!;
    const result = (await tool.handler(
      {
        query: "SELECT * FROM test",
      },
      mockContext,
    )) as { data: string; rowCount: number };

    expect(result.data).toBe("");
    expect(result.rowCount).toBe(0);
  });

  it("should fail with clear error when called with empty params", async () => {
    const tool = tools.find((t) => t.name === "pg_copy_export")!;

    const result = await tool.handler({}, mockContext);
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining(
        "Either query/sql or table parameter is required",
      ),
    });
  });

  it("should support table parameter as shortcut", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: "Test" }],
    });

    const tool = tools.find((t) => t.name === "pg_copy_export")!;
    const result = (await tool.handler(
      {
        table: "users",
      },
      mockContext,
    )) as { data: string; rowCount: number };

    expect(result.rowCount).toBe(1);
    // Default limit of 500 is applied
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'SELECT * FROM "public"."users" LIMIT 500',
    );
  });

  it("should support table with schema parameter", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1 }],
    });

    const tool = tools.find((t) => t.name === "pg_copy_export")!;
    const result = (await tool.handler(
      {
        table: "products",
        schema: "inventory",
      },
      mockContext,
    )) as { data: string; rowCount: number };

    expect(result.rowCount).toBe(1);
    // Default limit of 500 is applied
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'SELECT * FROM "inventory"."products" LIMIT 500',
    );
  });

  it("should support sql alias for query parameter", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1 }],
    });

    const tool = tools.find((t) => t.name === "pg_copy_export")!;
    const result = (await tool.handler(
      {
        sql: "SELECT 1 as id",
      },
      mockContext,
    )) as { data: string; rowCount: number };

    expect(result.rowCount).toBe(1);
    // Default limit of 500 is applied to custom queries too
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "SELECT 1 as id LIMIT 500",
    );
  });

  it("should use \\N for NULL in text format", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: null }],
    });

    const tool = tools.find((t) => t.name === "pg_copy_export")!;
    const result = (await tool.handler(
      {
        query: "SELECT * FROM test",
        format: "text",
      },
      mockContext,
    )) as { data: string };

    expect(result.data).toContain("\\N"); // NULL representation in text format
  });

  it("should return structured error for binary format", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: "Test" }],
    });

    const tool = tools.find((t) => t.name === "pg_copy_export")!;
    const result = await tool.handler(
      {
        query: "SELECT * FROM test",
        format: "binary",
      },
      mockContext,
    );
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("Binary format is not supported"),
    });
  });
});

describe("pg_dump_table timestamp serialization", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getBackupTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getBackupTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should format ISO timestamp strings as PostgreSQL timestamps", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "r" }],
    });
    mockAdapter.describeTable.mockResolvedValueOnce({
      name: "events",
      schema: "public",
      type: "table",
      columns: [
        { name: "id", type: "integer", nullable: false },
        { name: "created_at", type: "timestamp", nullable: true },
      ],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1, created_at: "2025-12-22T05:06:15.242Z" }],
    });

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = (await tool.handler(
      {
        table: "events",
        includeData: true,
      },
      mockContext,
    )) as { insertStatements: string };

    // Should NOT have double-quoted timestamp
    expect(result.insertStatements).not.toContain('\\"2025-12-22');
    // Should have properly formatted timestamp
    expect(result.insertStatements).toContain("'2025-12-22 05:06:15");
  });

  it("should format Date objects as PostgreSQL timestamps", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "r" }],
    });
    mockAdapter.describeTable.mockResolvedValueOnce({
      name: "events",
      schema: "public",
      type: "table",
      columns: [
        { name: "id", type: "integer", nullable: false },
        { name: "created_at", type: "timestamp", nullable: true },
      ],
    });
    const testDate = new Date("2025-12-22T10:30:00.000Z");
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1, created_at: testDate }],
    });

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = (await tool.handler(
      {
        table: "events",
        includeData: true,
      },
      mockContext,
    )) as { insertStatements: string };

    // Should have PostgreSQL format: YYYY-MM-DD HH:MM:SS
    expect(result.insertStatements).toContain("'2025-12-22 10:30:00");
  });

  it("should add ::jsonb cast to object values", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ relkind: "r" }],
    });
    mockAdapter.describeTable.mockResolvedValueOnce({
      name: "docs",
      schema: "public",
      type: "table",
      columns: [
        { name: "id", type: "integer", nullable: false },
        { name: "data", type: "jsonb", nullable: true },
      ],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1, data: { key: "value" } }],
    });

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = (await tool.handler(
      {
        table: "docs",
        includeData: true,
      },
      mockContext,
    )) as { insertStatements: string };

    expect(result.insertStatements).toContain("::jsonb");
  });
});

describe("pg_copy_import", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getBackupTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getBackupTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should generate COPY FROM command", async () => {
    const tool = tools.find((t) => t.name === "pg_copy_import")!;
    const result = (await tool.handler(
      {
        table: "users",
      },
      mockContext,
    )) as {
      command: string;
      stdinCommand: string;
    };

    expect(result.command).toContain("COPY");
    expect(result.command).toContain("FROM");
    expect(result.stdinCommand).toContain("STDIN");
  });

  it("should include schema qualifier", async () => {
    const tool = tools.find((t) => t.name === "pg_copy_import")!;
    const result = (await tool.handler(
      {
        table: "users",
        schema: "app",
      },
      mockContext,
    )) as {
      command: string;
    };

    expect(result.command).toContain('"app"."users"');
  });

  it("should include column list", async () => {
    const tool = tools.find((t) => t.name === "pg_copy_import")!;
    const result = (await tool.handler(
      {
        table: "users",
        columns: ["id", "name", "email"],
      },
      mockContext,
    )) as {
      command: string;
    };

    expect(result.command).toContain('"id"');
    expect(result.command).toContain('"name"');
    expect(result.command).toContain('"email"');
  });

  it("should parse schema.table format", async () => {
    const tool = tools.find((t) => t.name === "pg_copy_import")!;
    const result = (await tool.handler(
      {
        table: "inventory.products",
      },
      mockContext,
    )) as {
      command: string;
    };

    expect(result.command).toContain('"inventory"."products"');
    expect(result.command).not.toContain('"inventory.products"');
  });
});

describe("pg_create_backup_plan", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getBackupTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getBackupTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should generate backup plan", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ bytes: 1073741824 }],
    });

    const tool = tools.find((t) => t.name === "pg_create_backup_plan")!;
    const result = (await tool.handler({}, mockContext)) as {
      strategy: { fullBackup: { cronSchedule: string } };
      estimates: { databaseSize: string };
    };

    expect(result.strategy).toBeDefined();
    expect(result.estimates.databaseSize).toBeDefined();
    // Default should be daily cron
    expect(result.strategy.fullBackup.cronSchedule).toBe("0 2 * * *");
  });

  it("should generate hourly cron schedule", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ bytes: 1073741824 }],
    });

    const tool = tools.find((t) => t.name === "pg_create_backup_plan")!;
    const result = (await tool.handler(
      {
        frequency: "hourly",
      },
      mockContext,
    )) as {
      strategy: { fullBackup: { cronSchedule: string; frequency: string } };
    };

    expect(result.strategy.fullBackup.frequency).toBe("hourly");
    expect(result.strategy.fullBackup.cronSchedule).toBe("0 * * * *");
  });

  it("should generate weekly cron schedule", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ bytes: 1073741824 }],
    });

    const tool = tools.find((t) => t.name === "pg_create_backup_plan")!;
    const result = (await tool.handler(
      {
        frequency: "weekly",
      },
      mockContext,
    )) as {
      strategy: { fullBackup: { cronSchedule: string; frequency: string } };
    };

    expect(result.strategy.fullBackup.frequency).toBe("weekly");
    expect(result.strategy.fullBackup.cronSchedule).toBe("0 2 * * 0");
  });
});

describe("pg_restore_command", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getBackupTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getBackupTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should generate pg_restore command", async () => {
    const tool = tools.find((t) => t.name === "pg_restore_command")!;
    const result = (await tool.handler(
      {
        backupFile: "backup.dump",
        database: "mydb",
      },
      mockContext,
    )) as {
      command: string;
    };

    expect(result.command).toContain("pg_restore");
    expect(result.command).toContain("backup.dump");
  });

  it("should include warnings when no database specified", async () => {
    const tool = tools.find((t) => t.name === "pg_restore_command")!;
    const result = (await tool.handler(
      {
        backupFile: "backup.dump",
      },
      mockContext,
    )) as {
      command: string;
      warnings: string[];
    };

    expect(result.command).toContain("pg_restore");
    expect(result.warnings).toBeDefined();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("No database specified");
  });
});

describe("pg_backup_physical", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getBackupTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getBackupTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should generate pg_basebackup command", async () => {
    const tool = tools.find((t) => t.name === "pg_backup_physical")!;
    const result = (await tool.handler(
      {
        targetDir: "/backups",
      },
      mockContext,
    )) as {
      command: string;
    };

    expect(result.command).toContain("pg_basebackup");
    expect(result.command).toContain("/backups");
  });
});

describe("pg_restore_validate", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getBackupTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getBackupTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should validate backup file", async () => {
    const tool = tools.find((t) => t.name === "pg_restore_validate")!;
    const result = (await tool.handler(
      {
        backupFile: "backup.dump",
      },
      mockContext,
    )) as {
      validationSteps: unknown[];
    };

    expect(result.validationSteps).toBeInstanceOf(Array);
  });
});

describe("pg_backup_schedule_optimize", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getBackupTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getBackupTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should optimize backup schedule", async () => {
    // Mock the 3 parallel queries
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ size_bytes: 10737418240, size: "10 GB" }],
      })
      .mockResolvedValueOnce({
        rows: [{ total_changes: 10000, total_rows: 100000 }],
      })
      .mockResolvedValueOnce({ rows: [{ hour: 2, connection_count: 5 }] });

    const tool = tools.find((t) => t.name === "pg_backup_schedule_optimize")!;
    const result = (await tool.handler({}, mockContext)) as {
      analysis: unknown;
      recommendation: { strategy: string };
    };

    expect(result.analysis).toBeDefined();
    expect(result.recommendation).toBeDefined();
  });

  it("should return changeVelocity as number and changeVelocityRatio as string", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ size_bytes: 10737418240, size: "10 GB" }],
      })
      .mockResolvedValueOnce({
        rows: [{ total_changes: 25000, total_rows: 100000 }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_backup_schedule_optimize")!;
    const result = (await tool.handler({}, mockContext)) as {
      analysis: {
        changeVelocity: number;
        changeVelocityRatio: string;
      };
    };

    expect(typeof result.analysis.changeVelocity).toBe("number");
    expect(result.analysis.changeVelocity).toBe(25);
    expect(typeof result.analysis.changeVelocityRatio).toBe("string");
    expect(result.analysis.changeVelocityRatio).toBe("25.00%");
  });

  it("should recommend large database strategy for databases > 100GB", async () => {
    // 150 GB database
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ size_bytes: 161061273600, size: "150 GB" }],
      })
      .mockResolvedValueOnce({
        rows: [{ total_changes: 1000, total_rows: 100000 }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_backup_schedule_optimize")!;
    const result = (await tool.handler({}, mockContext)) as {
      recommendation: {
        strategy: string;
        fullBackupFrequency: string;
        incrementalFrequency: string;
      };
    };

    expect(result.recommendation.strategy).toContain("Large database");
    expect(result.recommendation.fullBackupFrequency).toBe("Weekly");
    expect(result.recommendation.incrementalFrequency).toContain("WAL");
  });

  it("should recommend high change rate strategy for > 50% change rate", async () => {
    // 10 GB database with high change rate (60%)
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ size_bytes: 10737418240, size: "10 GB" }],
      })
      .mockResolvedValueOnce({
        rows: [{ total_changes: 60000, total_rows: 100000 }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_backup_schedule_optimize")!;
    const result = (await tool.handler({}, mockContext)) as {
      recommendation: {
        strategy: string;
        fullBackupFrequency: string;
        incrementalFrequency: string;
      };
    };

    expect(result.recommendation.strategy).toContain("High change rate");
    expect(result.recommendation.fullBackupFrequency).toBe("Daily");
    expect(result.recommendation.incrementalFrequency).toBe("Every 6 hours");
  });

  it("should recommend moderate activity strategy for 10-50% change rate", async () => {
    // 10 GB database with moderate change rate (25%)
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ size_bytes: 10737418240, size: "10 GB" }],
      })
      .mockResolvedValueOnce({
        rows: [{ total_changes: 25000, total_rows: 100000 }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_backup_schedule_optimize")!;
    const result = (await tool.handler({}, mockContext)) as {
      recommendation: {
        strategy: string;
        fullBackupFrequency: string;
        incrementalFrequency: string;
      };
    };

    expect(result.recommendation.strategy).toContain("Moderate activity");
    expect(result.recommendation.fullBackupFrequency).toBe("Daily");
    expect(result.recommendation.incrementalFrequency).toBe("Every 12 hours");
  });

  it("should recommend low activity strategy for < 10% change rate", async () => {
    // 10 GB database with low change rate (5%)
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ size_bytes: 10737418240, size: "10 GB" }],
      })
      .mockResolvedValueOnce({
        rows: [{ total_changes: 5000, total_rows: 100000 }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_backup_schedule_optimize")!;
    const result = (await tool.handler({}, mockContext)) as {
      recommendation: {
        strategy: string;
        fullBackupFrequency: string;
        incrementalFrequency: string;
      };
    };

    expect(result.recommendation.strategy).toContain("Low activity");
    expect(result.recommendation.incrementalFrequency).toBe("Not required");
  });
});

describe("pg_backup_physical extended", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getBackupTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getBackupTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should use plain format when specified", async () => {
    const tool = tools.find((t) => t.name === "pg_backup_physical")!;
    const result = (await tool.handler(
      {
        targetDir: "/backups",
        format: "plain",
      },
      mockContext,
    )) as { command: string };

    expect(result.command).toContain("-Fp");
    expect(result.command).not.toContain("-Ft");
  });

  it("should include fast checkpoint option", async () => {
    const tool = tools.find((t) => t.name === "pg_backup_physical")!;
    const result = (await tool.handler(
      {
        targetDir: "/backups",
        checkpoint: "fast",
      },
      mockContext,
    )) as { command: string };

    expect(result.command).toContain("-c fast");
  });

  it("should include compression with level", async () => {
    const tool = tools.find((t) => t.name === "pg_backup_physical")!;
    const result = (await tool.handler(
      {
        targetDir: "/backups",
        compress: 6,
      },
      mockContext,
    )) as { command: string };

    // Only -Z level is needed, not -z which is redundant
    expect(result.command).toContain("-Z 6");
    expect(result.command).not.toContain("-z "); // Should not include redundant -z
  });

  it("should not include compression when level is 0", async () => {
    const tool = tools.find((t) => t.name === "pg_backup_physical")!;
    const result = (await tool.handler(
      {
        targetDir: "/backups",
        compress: 0,
      },
      mockContext,
    )) as { command: string };

    expect(result.command).not.toContain("-z");
    expect(result.command).not.toContain("-Z");
  });
});

describe("pg_restore_validate extended", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getBackupTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getBackupTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return pg_basebackup validation steps for physical backup", async () => {
    const tool = tools.find((t) => t.name === "pg_restore_validate")!;
    const result = (await tool.handler(
      {
        backupFile: "/backups/base",
        backupType: "pg_basebackup",
      },
      mockContext,
    )) as {
      validationSteps: Array<{ step: number; name: string }>;
      recommendations: string[];
    };

    expect(result.validationSteps).toHaveLength(4);
    expect(result.validationSteps[0]?.name).toContain("pg_verifybackup");
    expect(result.validationSteps[1]?.name).toContain("Verify base backup");
    expect(result.validationSteps[2]?.name).toContain("backup_label");
    expect(result.recommendations).toContainEqual(
      expect.stringContaining("checksums"),
    );
  });

  it("should return pg_dump validation steps by default", async () => {
    const tool = tools.find((t) => t.name === "pg_restore_validate")!;
    const result = (await tool.handler(
      {
        backupFile: "backup.dump",
      },
      mockContext,
    )) as {
      validationSteps: Array<{ step: number; name: string }>;
    };

    expect(result.validationSteps).toHaveLength(3);
    expect(result.validationSteps[0]?.name).toContain("integrity");
  });
});

describe("pg_restore_command extended", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getBackupTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getBackupTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should include database option", async () => {
    const tool = tools.find((t) => t.name === "pg_restore_command")!;
    const result = (await tool.handler(
      {
        backupFile: "backup.dump",
        database: "mydb",
      },
      mockContext,
    )) as { command: string };

    expect(result.command).toContain('--dbname="mydb"');
  });

  it("should include schema option", async () => {
    const tool = tools.find((t) => t.name === "pg_restore_command")!;
    const result = (await tool.handler(
      {
        backupFile: "backup.dump",
        schema: "public",
      },
      mockContext,
    )) as { command: string };

    expect(result.command).toContain('--schema="public"');
  });

  it("should include table option", async () => {
    const tool = tools.find((t) => t.name === "pg_restore_command")!;
    const result = (await tool.handler(
      {
        backupFile: "backup.dump",
        table: "users",
      },
      mockContext,
    )) as { command: string };

    expect(result.command).toContain('--table="users"');
  });

  it("should include data-only flag", async () => {
    const tool = tools.find((t) => t.name === "pg_restore_command")!;
    const result = (await tool.handler(
      {
        backupFile: "backup.dump",
        dataOnly: true,
      },
      mockContext,
    )) as { command: string };

    expect(result.command).toContain("--data-only");
  });

  it("should include schema-only flag", async () => {
    const tool = tools.find((t) => t.name === "pg_restore_command")!;
    const result = (await tool.handler(
      {
        backupFile: "backup.dump",
        schemaOnly: true,
      },
      mockContext,
    )) as { command: string };

    expect(result.command).toContain("--schema-only");
  });
});

describe("pg_create_backup_plan extended", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getBackupTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getBackupTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should use custom frequency", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ bytes: 1073741824 }],
    });

    const tool = tools.find((t) => t.name === "pg_create_backup_plan")!;
    const result = (await tool.handler(
      {
        frequency: "hourly",
      },
      mockContext,
    )) as {
      strategy: { fullBackup: { frequency: string } };
    };

    expect(result.strategy.fullBackup.frequency).toBe("hourly");
  });

  it("should use custom retention", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ bytes: 1073741824 }],
    });

    const tool = tools.find((t) => t.name === "pg_create_backup_plan")!;
    const result = (await tool.handler(
      {
        retention: 14,
      },
      mockContext,
    )) as {
      strategy: { fullBackup: { retention: string } };
    };

    expect(result.strategy.fullBackup.retention).toContain("14");
  });
});

// =============================================================================
// Structured Error Handling (parsePostgresError)
// =============================================================================

describe("pg_dump_table - structured error handling", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getBackupTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getBackupTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return structured error for nonexistent table (42P01)", async () => {
    const pgError = new Error(
      'relation "nonexistent_table" does not exist',
    ) as Error & { code: string };
    pgError.code = "42P01";
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_dump_table")!;
    const result = await tool.handler(
      { table: "nonexistent_table" },
      mockContext,
    );
    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/not found.*pg_list_tables/i),
    });
  });
});

describe("pg_copy_export - structured error handling", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getBackupTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getBackupTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return structured error for invalid SQL (42601)", async () => {
    const pgError = new Error('syntax error at or near "SELEC"') as Error & {
      code: string;
    };
    pgError.code = "42601";
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_copy_export")!;
    const result = await tool.handler(
      { table: "users", query: "SELEC * FROM users" },
      mockContext,
    );
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("SQL syntax error"),
    });
  });
});
