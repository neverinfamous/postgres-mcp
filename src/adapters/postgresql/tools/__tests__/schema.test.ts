/**
 * postgres-mcp - Schema Tools Unit Tests
 *
 * Tests for PostgreSQL schema management tools with focus on
 * schemas, sequences, views, functions, triggers, and constraints.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSchemaTools } from "../schema/index.js";
import type { PostgresAdapter } from "../../postgres-adapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../__tests__/mocks/index.js";

describe("getSchemaTools", () => {
  let adapter: PostgresAdapter;
  let tools: ReturnType<typeof getSchemaTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockPostgresAdapter() as unknown as PostgresAdapter;
    tools = getSchemaTools(adapter);
  });

  it("should return 12 schema tools", () => {
    expect(tools).toHaveLength(12);
  });

  it("should have all expected tool names", () => {
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("pg_list_schemas");
    expect(toolNames).toContain("pg_create_schema");
    expect(toolNames).toContain("pg_drop_schema");
    expect(toolNames).toContain("pg_list_sequences");
    expect(toolNames).toContain("pg_create_sequence");
    expect(toolNames).toContain("pg_drop_sequence");
    expect(toolNames).toContain("pg_list_views");
    expect(toolNames).toContain("pg_create_view");
    expect(toolNames).toContain("pg_drop_view");
    expect(toolNames).toContain("pg_list_functions");
    expect(toolNames).toContain("pg_list_triggers");
    expect(toolNames).toContain("pg_list_constraints");
  });

  it("should have group set to schema for all tools", () => {
    for (const tool of tools) {
      expect(tool.group).toBe("schema");
    }
  });
});

describe("pg_list_schemas", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getSchemaTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getSchemaTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should list all schemas", async () => {
    mockAdapter.listSchemas.mockResolvedValueOnce(["public", "app", "auth"]);

    const tool = tools.find((t) => t.name === "pg_list_schemas")!;
    const result = (await tool.handler({}, mockContext)) as {
      schemas: string[];
      count: number;
    };

    expect(mockAdapter.listSchemas).toHaveBeenCalled();
    expect(result.schemas).toEqual(["public", "app", "auth"]);
    expect(result.count).toBe(3);
  });
});

describe("pg_create_schema", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getSchemaTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getSchemaTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should create a schema", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_schema")!;
    const result = (await tool.handler({ name: "app" }, mockContext)) as {
      success: boolean;
      schema: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'CREATE SCHEMA "app"',
    );
    expect(result.success).toBe(true);
    expect(result.schema).toBe("app");
  });

  it("should create schema with IF NOT EXISTS", async () => {
    // First call: existence check, second call: create
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_schema")!;
    await tool.handler({ name: "app", ifNotExists: true }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      'CREATE SCHEMA IF NOT EXISTS "app"',
    );
  });

  it("should return alreadyExists: false when schema does not exist", async () => {
    // First call: existence check returns empty, second call: create
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_schema")!;
    const result = (await tool.handler(
      { name: "new_schema", ifNotExists: true },
      mockContext,
    )) as {
      success: boolean;
      schema: string;
      alreadyExists: boolean;
    };

    expect(result.success).toBe(true);
    expect(result.alreadyExists).toBe(false);
  });

  it("should return alreadyExists: true when schema already exists", async () => {
    // First call: existence check returns row, second call: create (no-op)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_schema")!;
    const result = (await tool.handler(
      { name: "existing_schema", ifNotExists: true },
      mockContext,
    )) as {
      success: boolean;
      schema: string;
      alreadyExists: boolean;
    };

    expect(result.success).toBe(true);
    expect(result.alreadyExists).toBe(true);
  });

  it("should create schema with authorization", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_schema")!;
    await tool.handler(
      { name: "app", authorization: "admin_user" },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'CREATE SCHEMA "app" AUTHORIZATION "admin_user"',
    );
  });
});

describe("pg_drop_schema", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getSchemaTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getSchemaTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should drop a schema", async () => {
    // First call: existence check, second call: drop
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_drop_schema")!;
    const result = (await tool.handler({ name: "old_app" }, mockContext)) as {
      success: boolean;
      schema: string;
      existed: boolean;
    };

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      'DROP SCHEMA "old_app"',
    );
    expect(result.success).toBe(true);
    expect(result.schema).toBe("old_app");
    expect(result.existed).toBe(true);
  });

  it("should drop schema with IF EXISTS", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_drop_schema")!;
    await tool.handler({ name: "old_app", ifExists: true }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      'DROP SCHEMA IF EXISTS "old_app"',
    );
  });

  it("should drop schema with CASCADE", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_drop_schema")!;
    await tool.handler({ name: "old_app", cascade: true }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      'DROP SCHEMA "old_app" CASCADE',
    );
  });

  it("should indicate when schema did not exist with ifExists", async () => {
    // First call: existence check returns no rows
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_drop_schema")!;
    const result = (await tool.handler(
      { name: "nonexistent_schema", ifExists: true },
      mockContext,
    )) as {
      success: boolean;
      schema: string;
      existed: boolean;
      note: string;
    };

    expect(result.success).toBe(true);
    expect(result.schema).toBe("nonexistent_schema");
    expect(result.existed).toBe(false);
    expect(result.note).toContain("did not exist");
  });
});

describe("pg_list_sequences", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getSchemaTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getSchemaTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should list all sequences", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { schema: "public", name: "users_id_seq", owned_by: "public.users.id" },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_list_sequences")!;
    const result = (await tool.handler({}, mockContext)) as {
      sequences: unknown[];
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("c.relkind = 'S'"),
    );
    expect(result.sequences).toHaveLength(1);
  });

  it("should filter by schema", async () => {
    // First call: schema existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Second call: main query
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_sequences")!;
    await tool.handler({ schema: "app" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("n.nspname = $1"),
      ["app"],
    );
  });

  it("should return structured error for nonexistent schema", async () => {
    // Schema existence check returns empty
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_sequences")!;
    const result = (await tool.handler(
      { schema: "nonexistent_schema" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("nonexistent_schema");
    expect(result.error).toContain("does not exist");
  });
});

describe("pg_create_sequence", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getSchemaTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getSchemaTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should create a basic sequence", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_sequence")!;
    const result = (await tool.handler(
      { name: "order_num_seq" },
      mockContext,
    )) as {
      success: boolean;
      sequence: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'CREATE SEQUENCE "order_num_seq"',
    );
    expect(result.success).toBe(true);
    expect(result.sequence).toBe("public.order_num_seq");
  });

  it("should create sequence with options", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_sequence")!;
    await tool.handler(
      {
        name: "custom_seq",
        schema: "app",
        start: 100,
        increment: 10,
        minValue: 1,
        maxValue: 10000,
        cycle: true,
      },
      mockContext,
    );

    const call = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(call).toContain('"app"."custom_seq"');
    expect(call).toContain("START WITH 100");
    expect(call).toContain("INCREMENT BY 10");
    expect(call).toContain("MINVALUE 1");
    expect(call).toContain("MAXVALUE 10000");
    expect(call).toContain("CYCLE");
  });

  it("should accept sequenceName as alias for name parameter", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_sequence")!;
    const result = (await tool.handler(
      {
        sequenceName: "aliased_seq", // Using alias
      },
      mockContext,
    )) as {
      success: boolean;
      sequence: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'CREATE SEQUENCE "aliased_seq"',
    );
    expect(result.success).toBe(true);
    expect(result.sequence).toBe("public.aliased_seq");
  });

  it("should return error for invalid ownedBy format", async () => {
    const tool = tools.find((t) => t.name === "pg_create_sequence")!;
    const result = (await tool.handler(
      { name: "bad_seq", ownedBy: "invalid_format" },
      mockContext,
    )) as any;

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid ownedBy format");
  });

  it("should return alreadyExists: false when sequence does not exist", async () => {
    // First call: existence check returns empty, second call: create
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_sequence")!;
    const result = (await tool.handler(
      { name: "new_seq", ifNotExists: true },
      mockContext,
    )) as {
      success: boolean;
      sequence: string;
      alreadyExists: boolean;
    };

    expect(result.success).toBe(true);
    expect(result.alreadyExists).toBe(false);
  });

  it("should return alreadyExists: true when sequence already exists", async () => {
    // First call: existence check returns row, second call: create (no-op)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_sequence")!;
    const result = (await tool.handler(
      { name: "existing_seq", ifNotExists: true },
      mockContext,
    )) as {
      success: boolean;
      sequence: string;
      alreadyExists: boolean;
    };

    expect(result.success).toBe(true);
    expect(result.alreadyExists).toBe(true);
  });

  it("should accept valid string for ownedBy and apply to sequence", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_sequence")!;
    const result = (await tool.handler(
      { name: "table_seq", ownedBy: "public.users.id" },
      mockContext,
    )) as any;

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('OWNED BY "public"."users"."id"'),
    );
    expect(result.success).toBe(true);
  });
});

describe("pg_list_sequences extra edge cases", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getSchemaTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getSchemaTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should trigger truncated flag with schema filter", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    }); // schema check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ name: "seq1" }, { name: "seq2" }, { name: "seq3" }],
    }); // the sequences query
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ total: 10 }] }); // the count query

    const tool = tools.find((t) => t.name === "pg_list_sequences")!;
    const result = (await tool.handler(
      { schema: "public", limit: 2 },
      mockContext,
    )) as any;

    expect(result.truncated).toBe(true);
    expect(result.totalCount).toBe(10);
    expect(result.sequences).toHaveLength(2);
    expect(result.note).toContain("Results limited to 2");
  });
});

describe("pg_drop_sequence", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getSchemaTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getSchemaTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should drop a sequence", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_drop_sequence")!;
    const result = (await tool.handler(
      { name: "old_seq" },
      mockContext,
    )) as any;

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      'DROP SEQUENCE "public"."old_seq"',
    );
    expect(result.success).toBe(true);
    expect(result.sequence).toBe("public.old_seq");
    expect(result.existed).toBe(true);
  });

  it("should drop sequence with IF EXISTS and CASCADE", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_drop_sequence")!;
    await tool.handler(
      { name: "old_seq", ifExists: true, cascade: true },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      'DROP SEQUENCE IF EXISTS "public"."old_seq" CASCADE',
    );
  });
});

describe("pg_list_views", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getSchemaTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getSchemaTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should list views and materialized views", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          name: "active_users",
          type: "view",
          definition: "SELECT * FROM users WHERE active",
        },
        {
          schema: "public",
          name: "user_stats",
          type: "materialized_view",
          definition: "SELECT count(*) FROM users",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_list_views")!;
    const result = (await tool.handler({}, mockContext)) as {
      views: unknown[];
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("IN ('v', 'm')"),
    );
    expect(result.views).toHaveLength(2);
  });

  it("should filter by schema", async () => {
    // First call: schema existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // Second call: main query
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_views")!;
    await tool.handler({ schema: "reports" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("n.nspname = $1"),
      ["reports"],
    );
  });

  it("should return structured error for nonexistent schema", async () => {
    // Schema existence check returns empty
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_views")!;
    const result = (await tool.handler(
      { schema: "nonexistent_schema" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("nonexistent_schema");
    expect(result.error).toContain("does not exist");
  });

  it("should exclude materialized views when requested", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_views")!;
    await tool.handler({ includeMaterialized: false }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("= 'v'"),
    );
  });

  it("should include hasMatViews in response", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { schema: "public", name: "v1", type: "view" },
        { schema: "public", name: "mv1", type: "materialized_view" },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_list_views")!;
    const result = (await tool.handler({}, mockContext)) as {
      views: unknown[];
      hasMatViews: boolean;
    };

    expect(result.hasMatViews).toBe(true);
  });

  it("should set hasMatViews to false when no materialized views exist", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ schema: "public", name: "v1", type: "view" }],
    });

    const tool = tools.find((t) => t.name === "pg_list_views")!;
    const result = (await tool.handler({}, mockContext)) as {
      hasMatViews: boolean;
    };

    expect(result.hasMatViews).toBe(false);
  });

  it("should truncate long view definitions by default (500 chars)", async () => {
    const longDef = "SELECT " + "a".repeat(1500);
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { schema: "public", name: "v1", type: "view", definition: longDef },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_list_views")!;
    const result = (await tool.handler({}, mockContext)) as {
      views: Array<{ definition: string; definitionTruncated?: boolean }>;
      truncatedDefinitions: number;
    };

    expect(result.views[0].definition.length).toBeLessThanOrEqual(503); // 500 + "..."
    expect(result.views[0].definition.endsWith("...")).toBe(true);
    expect(result.views[0].definitionTruncated).toBe(true);
    expect(result.truncatedDefinitions).toBe(1);
  });

  it("should not truncate definitions when truncateDefinition is 0", async () => {
    const longDef = "SELECT " + "a".repeat(1500);
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { schema: "public", name: "v1", type: "view", definition: longDef },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_list_views")!;
    const result = (await tool.handler(
      { truncateDefinition: 0 },
      mockContext,
    )) as {
      views: Array<{ definition: string; definitionTruncated?: boolean }>;
      truncatedDefinitions?: number;
    };

    expect(result.views[0].definition).toBe(longDef);
    expect(result.views[0].definitionTruncated).toBeUndefined();
    expect(result.truncatedDefinitions).toBeUndefined();
  });

  it("should use custom truncateDefinition limit", async () => {
    const longDef = "SELECT " + "a".repeat(500);
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { schema: "public", name: "v1", type: "view", definition: longDef },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_list_views")!;
    const result = (await tool.handler(
      { truncateDefinition: 100 },
      mockContext,
    )) as {
      views: Array<{ definition: string; definitionTruncated?: boolean }>;
      truncatedDefinitions: number;
    };

    expect(result.views[0].definition.length).toBeLessThanOrEqual(103); // 100 + "..."
    expect(result.views[0].definitionTruncated).toBe(true);
    expect(result.truncatedDefinitions).toBe(1);
  });
});

describe("pg_create_view", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getSchemaTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getSchemaTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should create a view", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_view")!;
    const result = (await tool.handler(
      {
        name: "active_users",
        query: "SELECT * FROM users WHERE active = true",
      },
      mockContext,
    )) as {
      success: boolean;
      view: string;
      materialized: boolean;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'CREATE VIEW "active_users" AS SELECT * FROM users WHERE active = true',
    );
    expect(result.success).toBe(true);
    expect(result.materialized).toBe(false);
  });

  it("should create a materialized view", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_view")!;
    const result = (await tool.handler(
      {
        name: "user_counts",
        query: "SELECT count(*) FROM users",
        materialized: true,
      },
      mockContext,
    )) as {
      materialized: boolean;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'CREATE MATERIALIZED VIEW "user_counts" AS SELECT count(*) FROM users',
    );
    expect(result.materialized).toBe(true);
  });

  it("should create or replace a view", async () => {
    // First call: existence check, second call: create
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_view")!;
    await tool.handler(
      {
        name: "my_view",
        query: "SELECT 1",
        orReplace: true,
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      'CREATE OR REPLACE VIEW "my_view" AS SELECT 1',
    );
  });

  it("should return alreadyExists: false when view does not exist with orReplace", async () => {
    // First call: existence check returns empty, second call: create
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_view")!;
    const result = (await tool.handler(
      { name: "new_view", query: "SELECT 1", orReplace: true },
      mockContext,
    )) as {
      success: boolean;
      view: string;
      alreadyExists: boolean;
    };

    expect(result.success).toBe(true);
    expect(result.alreadyExists).toBe(false);
  });

  it("should return alreadyExists: true when view already exists with orReplace", async () => {
    // First call: existence check returns row, second call: create/replace
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_view")!;
    const result = (await tool.handler(
      { name: "existing_view", query: "SELECT 1", orReplace: true },
      mockContext,
    )) as {
      success: boolean;
      view: string;
      alreadyExists: boolean;
    };

    expect(result.success).toBe(true);
    expect(result.alreadyExists).toBe(true);
  });

  it("should accept viewName as alias for name parameter", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_view")!;
    const result = (await tool.handler(
      {
        viewName: "aliased_view", // Using alias
        query: "SELECT * FROM users",
      },
      mockContext,
    )) as {
      success: boolean;
      view: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'CREATE VIEW "aliased_view" AS SELECT * FROM users',
    );
    expect(result.success).toBe(true);
  });
});

describe("pg_list_functions", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getSchemaTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getSchemaTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should list user-defined functions", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          name: "calculate_total",
          arguments: "integer, integer",
          returns: "integer",
          language: "plpgsql",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_list_functions")!;
    const result = (await tool.handler({}, mockContext)) as {
      functions: unknown[];
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("pg_proc"),
    );
    expect(result.functions).toHaveLength(1);
  });

  it("should filter functions by schema", async () => {
    // First call: schema existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    // Second call: main query
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_functions")!;
    await tool.handler({ schema: "utils" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("n.nspname = $"),
      expect.arrayContaining(["utils"]),
    );
  });

  it("should return structured error for nonexistent schema", async () => {
    // Schema existence check returns empty
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_functions")!;
    const result = (await tool.handler(
      { schema: "nonexistent_schema" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("nonexistent_schema");
    expect(result.error).toContain("does not exist");
  });
});

describe("pg_list_triggers", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getSchemaTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getSchemaTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should list all triggers", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "users",
          name: "update_timestamp",
          timing: "BEFORE",
          event: "UPDATE",
          function_name: "set_timestamp",
          enabled: true,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_list_triggers")!;
    const result = (await tool.handler({}, mockContext)) as {
      triggers: unknown[];
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("pg_trigger"),
    );
    expect(result.triggers).toHaveLength(1);
  });

  it("should filter triggers by table", async () => {
    // First call: table existence check (parameterized)
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    // Second call: main query
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_triggers")!;
    await tool.handler({ table: "orders" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("c.relname = $"),
      expect.arrayContaining(["orders"]),
    );
  });

  it("should return structured error for nonexistent table", async () => {
    // Table existence check returns empty
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_triggers")!;
    const result = (await tool.handler(
      { table: "nonexistent_table" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("nonexistent_table");
    expect(result.error).toContain("not found");
  });

  it("should return structured error for nonexistent schema", async () => {
    // Schema existence check returns empty
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_triggers")!;
    const result = (await tool.handler(
      { schema: "nonexistent_schema" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("nonexistent_schema");
    expect(result.error).toContain("does not exist");
  });
});

describe("pg_list_constraints", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getSchemaTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getSchemaTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should list all constraints", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "users",
          name: "users_pkey",
          type: "primary_key",
          definition: "PRIMARY KEY (id)",
        },
        {
          schema: "public",
          table_name: "users",
          name: "users_email_key",
          type: "unique",
          definition: "UNIQUE (email)",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_list_constraints")!;
    const result = (await tool.handler({}, mockContext)) as {
      constraints: unknown[];
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("pg_constraint"),
    );
    expect(result.constraints).toHaveLength(2);
  });

  it("should filter constraints by table", async () => {
    // First call: table existence check (parameterized)
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    // Second call: main query
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_constraints")!;
    await tool.handler({ table: "orders" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("c.relname = $"),
      expect.arrayContaining(["orders"]),
    );
  });

  it("should return structured error for nonexistent table", async () => {
    // Table existence check returns empty
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_constraints")!;
    const result = (await tool.handler(
      { table: "nonexistent_table" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("nonexistent_table");
    expect(result.error).toContain("not found");
  });

  it("should return structured error for nonexistent schema", async () => {
    // Schema existence check returns empty
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_constraints")!;
    const result = (await tool.handler(
      { schema: "nonexistent_schema" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("nonexistent_schema");
    expect(result.error).toContain("does not exist");
  });

  it("should filter constraints by type", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_constraints")!;
    await tool.handler({ type: "foreign_key" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("con.contype = $1"),
      ["f"],
    );
  });
});

/**
 * Parameter Smoothing Tests
 *
 * Tests for code mode compatibility - tools should work when called
 * without explicit parameters (using undefined instead of {})
 */
describe("Parameter Smoothing", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getSchemaTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getSchemaTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("pg_list_sequences should work without params", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_sequences")!;
    // Simulate code mode: params is undefined
    const result = (await tool.handler(undefined, mockContext)) as {
      sequences: unknown[];
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalled();
    expect(result.sequences).toBeDefined();
  });

  it("pg_list_views should work without params", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_views")!;
    const result = (await tool.handler(undefined, mockContext)) as {
      views: unknown[];
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalled();
    expect(result.views).toBeDefined();
  });

  it("pg_list_functions should work without params", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_functions")!;
    const result = (await tool.handler(undefined, mockContext)) as {
      functions: unknown[];
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalled();
    expect(result.functions).toBeDefined();
  });

  it("pg_list_triggers should work without params", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_triggers")!;
    const result = (await tool.handler(undefined, mockContext)) as {
      triggers: unknown[];
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalled();
    expect(result.triggers).toBeDefined();
  });

  it("pg_list_constraints should work without params", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_constraints")!;
    const result = (await tool.handler(undefined, mockContext)) as {
      constraints: unknown[];
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalled();
    expect(result.constraints).toBeDefined();
  });

  it("pg_create_view should accept sql as alias for query", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_view")!;
    const result = (await tool.handler(
      {
        name: "sql_alias_view",
        sql: "SELECT * FROM users WHERE active = true", // Using sql instead of query
      },
      mockContext,
    )) as {
      success: boolean;
      view: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'CREATE VIEW "sql_alias_view" AS SELECT * FROM users WHERE active = true',
    );
    expect(result.success).toBe(true);
  });

  it("pg_create_sequence should accept schema.name format", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_sequence")!;
    const result = (await tool.handler(
      {
        name: "test_schema.order_seq",
      },
      mockContext,
    )) as {
      success: boolean;
      sequence: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'CREATE SEQUENCE "test_schema"."order_seq"',
    );
    expect(result.success).toBe(true);
    expect(result.sequence).toBe("test_schema.order_seq");
  });

  it("pg_list_constraints should exclude NOT NULL constraints", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_constraints")!;
    await tool.handler({}, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("con.contype != 'n'"),
    );
  });

  it("pg_list_functions should filter extension-owned functions via pg_depend", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_functions")!;
    await tool.handler({ exclude: ["ltree"] }, mockContext);

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    const params = mockAdapter.executeQuery.mock.calls[0]?.[1] as unknown[];
    expect(sql).toContain("pg_depend");
    expect(sql).toContain("pg_extension");
    expect(sql).toContain("e.extname IN ($1)");
    expect(params).toContain("ltree");
  });

  it("pg_list_functions should expand well-known extension aliases in exclude", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_functions")!;
    await tool.handler({ exclude: ["pgvector"] }, mockContext);

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    const params = mockAdapter.executeQuery.mock.calls[0]?.[1] as unknown[];
    // "pgvector" should be expanded to include the actual extension name "vector"
    expect(sql).toContain("e.extname IN ($1, $2)");
    expect(sql).toContain("n.nspname NOT IN ($1, $2)");
    expect(params).toContain("pgvector");
    expect(params).toContain("vector");
  });

  it("pg_list_functions should expand partman alias in exclude", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_functions")!;
    await tool.handler({ exclude: ["partman"] }, mockContext);

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    const params = mockAdapter.executeQuery.mock.calls[0]?.[1] as unknown[];
    expect(sql).toContain("e.extname IN ($1, $2)");
    expect(sql).toContain("n.nspname NOT IN ($1, $2)");
    expect(params).toContain("partman");
    expect(params).toContain("pg_partman");
  });

  it("pg_create_view should accept definition as alias for query", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_view")!;
    const result = (await tool.handler(
      {
        name: "def_alias_view",
        definition: "SELECT * FROM users WHERE active = true", // Using definition instead of query
      },
      mockContext,
    )) as {
      success: boolean;
      view: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      'CREATE VIEW "def_alias_view" AS SELECT * FROM users WHERE active = true',
    );
    expect(result.success).toBe(true);
  });

  it("pg_list_functions should expand fuzzymatch alias in exclude", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_functions")!;
    await tool.handler({ exclude: ["fuzzymatch"] }, mockContext);

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    const params = mockAdapter.executeQuery.mock.calls[0]?.[1] as unknown[];
    expect(sql).toContain("e.extname IN ($1, $2)");
    expect(sql).toContain("n.nspname NOT IN ($1, $2)");
    expect(params).toContain("fuzzymatch");
    expect(params).toContain("fuzzystrmatch");
  });

  it("pg_list_functions should expand fuzzy alias in exclude", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_functions")!;
    await tool.handler({ exclude: ["fuzzy"] }, mockContext);

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    const params = mockAdapter.executeQuery.mock.calls[0]?.[1] as unknown[];
    expect(sql).toContain("e.extname IN ($1, $2)");
    expect(sql).toContain("n.nspname NOT IN ($1, $2)");
    expect(params).toContain("fuzzy");
    expect(params).toContain("fuzzystrmatch");
  });

  it("pg_list_triggers should parse schema.table format", async () => {
    // First call: schema existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    // Second call: table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    // Third call: main query
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_triggers")!;
    await tool.handler({ table: "custom_schema.orders" }, mockContext);

    // Schema existence check should use parsed schema (parameterized)
    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("nspname = $1"),
      ["custom_schema"],
    );
    // Table existence check should use parsed table name (parameterized)
    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("table_name = $2"),
      ["custom_schema", "orders"],
    );
    // Main query should filter by parsed table (parameterized)
    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("c.relname = $"),
      expect.arrayContaining(["orders"]),
    );
  });

  it("pg_list_constraints should parse schema.table format", async () => {
    // First call: schema existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    // Second call: table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    // Third call: main query
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_list_constraints")!;
    await tool.handler({ table: "custom_schema.orders" }, mockContext);

    // Schema existence check should use parsed schema (parameterized)
    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("nspname = $1"),
      ["custom_schema"],
    );
    // Table existence check should use parsed table name (parameterized)
    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("table_name = $2"),
      ["custom_schema", "orders"],
    );
    // Main query should filter by parsed table (parameterized)
    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("c.relname = $"),
      expect.arrayContaining(["orders"]),
    );
  });
});

/**
 * Structured Error Response Tests
 *
 * Verify that create/drop tools return {success: false, error: "..."}
 * instead of throwing raw MCP errors.
 */
describe("Structured Error Responses", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getSchemaTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getSchemaTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("pg_create_schema should return structured error on duplicate", async () => {
    const pgError = new Error('schema "app" already exists');
    (pgError as Record<string, unknown>)["code"] = "42P06";
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_create_schema")!;
    const result = (await tool.handler({ name: "app" }, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe("string");
  });

  it("pg_drop_schema should return structured error on nonexistent schema", async () => {
    // First call: existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Second call: DROP fails
    const pgError = new Error('schema "nonexistent" does not exist');
    (pgError as Record<string, unknown>)["code"] = "3F000";
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_drop_schema")!;
    const result = (await tool.handler(
      { name: "nonexistent" },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe("string");
  });

  it("pg_create_sequence should return structured error on duplicate", async () => {
    const pgError = new Error('relation "dup_seq" already exists');
    (pgError as Record<string, unknown>)["code"] = "42P07";
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_create_sequence")!;
    const result = (await tool.handler({ name: "dup_seq" }, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe("string");
  });

  it("pg_drop_sequence should return structured error on nonexistent", async () => {
    // First call: existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Second call: DROP fails
    const pgError = new Error('sequence "public"."nonexistent" does not exist');
    (pgError as Record<string, unknown>)["code"] = "42P01";
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_drop_sequence")!;
    const result = (await tool.handler(
      { name: "nonexistent" },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe("string");
  });

  it("pg_create_view should return structured error on duplicate without orReplace", async () => {
    const pgError = new Error('relation "dup_view" already exists');
    (pgError as Record<string, unknown>)["code"] = "42P07";
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_create_view")!;
    const result = (await tool.handler(
      { name: "dup_view", query: "SELECT 1" },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe("string");
  });

  it("pg_drop_view should return structured error on nonexistent without ifExists", async () => {
    // First call: existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Second call: DROP fails
    const pgError = new Error('view "public"."nonexistent" does not exist');
    (pgError as Record<string, unknown>)["code"] = "42P01";
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_drop_view")!;
    const result = (await tool.handler(
      { name: "nonexistent" },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe("string");
  });

  it("should catch ZodError for all schema object tools", async () => {
    const toolsToTest = [
      "pg_create_schema",
      "pg_drop_schema",
      "pg_create_sequence",
      "pg_drop_sequence",
      "pg_create_view",
      "pg_drop_view",
    ];

    for (const toolName of toolsToTest) {
      const tool = tools.find((t) => t.name === toolName)!;
      // Provide an invalid structure that will fail Zod (missing required name for all these)
      const result = (await tool.handler(
        { invalidFieldWhichWillFailZodCheck: 123 },
        mockContext,
      )) as any;
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    }
  });

  it("should catch Postgres format errors for list tools", async () => {
    const listTools = [
      "pg_list_functions",
      "pg_list_triggers",
      "pg_list_constraints",
    ];

    for (const toolName of listTools) {
      const pgError = new Error("mock connection error");
      (pgError as any).code = "08006";
      mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

      const tool = tools.find((t) => t.name === toolName)!;
      // Many list tools need some schema/table context or nothing string so pass empty object or specific args
      const result = (await tool.handler(
        toolName === "pg_list_triggers" || toolName === "pg_list_constraints"
          ? {}
          : {},
        mockContext,
      )) as any;

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    }
  });
});

// =============================================================================
// Error-Path Tests: Empty params / Zod validation (Split Schema pattern)
// =============================================================================

describe("schema tools — empty param error paths", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getSchemaTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getSchemaTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("pg_create_schema({}) should return structured handler error", async () => {
    const tool = tools.find((t) => t.name === "pg_create_schema")!;
    const result = (await tool.handler({}, mockContext)) as any;

    expect(result.success).toBe(false);
    expect(result.error).toContain("name");
  });

  it("pg_drop_schema({}) should return structured handler error", async () => {
    const tool = tools.find((t) => t.name === "pg_drop_schema")!;
    const result = (await tool.handler({}, mockContext)) as any;

    expect(result.success).toBe(false);
    expect(result.error).toContain("name");
  });

  it("pg_drop_view({}) should return structured handler error", async () => {
    const tool = tools.find((t) => t.name === "pg_drop_view")!;
    const result = (await tool.handler({}, mockContext)) as any;

    expect(result.success).toBe(false);
    expect(result.error).toContain("name");
  });

  it("pg_drop_sequence({}) should return structured handler error", async () => {
    const tool = tools.find((t) => t.name === "pg_drop_sequence")!;
    const result = (await tool.handler({}, mockContext)) as any;

    expect(result.success).toBe(false);
    expect(result.error).toContain("name");
  });

  it("pg_list_constraints({type: 'invalid'}) should return structured handler error", async () => {
    const tool = tools.find((t) => t.name === "pg_list_constraints")!;
    const result = (await tool.handler(
      { type: "invalid_type" },
      mockContext,
    )) as any;

    expect(result.success).toBe(false);
    expect(result.error).toContain("type must be one of");
  });
});
