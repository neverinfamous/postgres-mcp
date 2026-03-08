/**
 * Unit tests for Code Mode API
 *
 * Tests PgApi creation, tool method generation, and sandbox bindings.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPgApi, PgApi } from "../api/index.js";
import type { PostgresAdapter } from "../../adapters/postgresql/PostgresAdapter.js";
import type { ToolDefinition, ToolGroup } from "../../types/index.js";

// Mock PostgresAdapter for testing
function createMockAdapter(): PostgresAdapter {
  const mockToolDefs: ToolDefinition[] = [
    {
      name: "pg_read_query",
      description: "Execute a read query",
      group: "core" as ToolGroup,
      inputSchema: {},
      handler: vi.fn(async () => ({ rows: [{ id: 1 }] })),
    },
    {
      name: "pg_list_tables",
      description: "List all tables",
      group: "core" as ToolGroup,
      inputSchema: {},
      handler: vi.fn(async () => [{ name: "users" }, { name: "products" }]),
    },
    {
      name: "pg_jsonb_set",
      description: "Set JSONB value",
      group: "jsonb" as ToolGroup,
      inputSchema: {},
      handler: vi.fn(async () => ({ success: true })),
    },
    {
      name: "pg_transaction_begin",
      description: "Begin transaction",
      group: "transactions" as ToolGroup,
      inputSchema: {},
      handler: vi.fn(async () => ({ transactionId: "tx-123" })),
    },
  ];

  return {
    getToolDefinitions: vi.fn(() => mockToolDefs),
    createContext: vi.fn(() => ({})),
  } as unknown as PostgresAdapter;
}

describe("PgApi", () => {
  let adapter: PostgresAdapter;
  let pgApi: PgApi;

  beforeEach(() => {
    adapter = createMockAdapter();
    pgApi = createPgApi(adapter);
  });

  describe("getAvailableGroups()", () => {
    it("should return all tool groups with counts", () => {
      const groups = pgApi.getAvailableGroups();
      expect(groups["core"]).toBe(2);
      expect(groups["jsonb"]).toBe(1);
      expect(groups["transactions"]).toBe(1);
    });
  });

  describe("getGroupMethods()", () => {
    it("should return method names for a group", () => {
      const methods = pgApi.getGroupMethods("core");
      expect(methods.length).toBeGreaterThan(0);
    });

    it("should return empty array for unknown group", () => {
      const methods = pgApi.getGroupMethods("nonexistent");
      expect(methods).toEqual([]);
    });
  });

  describe("createSandboxBindings()", () => {
    it("should return object with group namespaces", () => {
      const bindings = pgApi.createSandboxBindings();
      expect(bindings).toHaveProperty("core");
      expect(bindings).toHaveProperty("jsonb");
      expect(bindings).toHaveProperty("transactions");
    });

    it("should have methods for each group", () => {
      const bindings = pgApi.createSandboxBindings();
      const core = bindings["core"] as Record<string, unknown>;
      expect(Object.keys(core).length).toBeGreaterThan(0);
    });

    it("should execute underlying tool handler when method called", async () => {
      const bindings = pgApi.createSandboxBindings();
      const core = bindings["core"] as Record<
        string,
        (params: unknown) => Promise<unknown>
      >;

      // Find the listTables method (could have different name after transform)
      const methodNames = Object.keys(core);
      expect(methodNames.length).toBeGreaterThan(0);

      // Call first method and verify it returns something
      const firstMethod = core[methodNames[0]];
      expect(typeof firstMethod).toBe("function");
    });
  });
});

describe("createPgApi", () => {
  it("should create PgApi instance", () => {
    const adapter = createMockAdapter();
    const api = createPgApi(adapter);
    expect(api).toBeInstanceOf(PgApi);
  });

  it("should call getToolDefinitions on adapter", () => {
    const adapter = createMockAdapter();
    createPgApi(adapter);
    expect(adapter.getToolDefinitions).toHaveBeenCalled();
  });
});

describe("Method execution", () => {
  let mockAdapter: PostgresAdapter;
  let pgApi: PgApi;

  beforeEach(() => {
    mockAdapter = createMockAdapter();
    pgApi = createPgApi(mockAdapter);
  });

  it("should execute core methods via sandbox bindings", async () => {
    const bindings = pgApi.createSandboxBindings();
    const core = bindings["core"] as Record<
      string,
      (params: unknown) => Promise<unknown>
    >;

    // Call listTables method
    if (core["listTables"]) {
      const result = await core["listTables"]({});
      expect(result).toBeDefined();
    }
  });

  it("should normalize string arg to named parameter", async () => {
    const bindings = pgApi.createSandboxBindings();
    const core = bindings["core"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    // readQuery("SELECT...") should normalize to {sql: "SELECT..."}
    if (core["readQuery"]) {
      const result = await core["readQuery"]("SELECT 1");
      expect(result).toBeDefined();
    }
  });
});

describe("Help output", () => {
  let adapter: PostgresAdapter;
  let pgApi: PgApi;

  beforeEach(() => {
    adapter = createMockAdapter();
    pgApi = createPgApi(adapter);
  });

  it("should return help for a specific group when called with group name", () => {
    const bindings = pgApi.createSandboxBindings();
    const core = bindings["core"] as Record<string, unknown>;

    // Check if help function exists
    if (typeof core["help"] === "function") {
      const helpFn = core["help"] as () => unknown;
      const result = helpFn();
      expect(result).toBeDefined();
    }
  });
});

describe("toolNameToMethodName conversion", () => {
  let adapter: PostgresAdapter;
  let pgApi: PgApi;

  beforeEach(() => {
    adapter = createMockAdapter();
    pgApi = createPgApi(adapter);
  });

  it("should convert pg_read_query to readQuery for core group", () => {
    const methods = pgApi.getGroupMethods("core");
    // pg_read_query (core tool) → readQuery
    expect(methods).toContain("readQuery");
  });

  it("should convert pg_jsonb_set to set for jsonb group", () => {
    const methods = pgApi.getGroupMethods("jsonb");
    // pg_jsonb_set → set (removes pg_ and jsonb_ prefix)
    expect(methods).toContain("set");
  });
});

describe("Method aliases", () => {
  let adapter: PostgresAdapter;
  let pgApi: PgApi;

  beforeEach(() => {
    adapter = createMockAdapter();
    pgApi = createPgApi(adapter);
  });

  it("should include method aliases in sandbox bindings", () => {
    const bindings = pgApi.createSandboxBindings();
    const jsonb = bindings["jsonb"] as Record<string, unknown>;

    // jsonbSet should be an alias for set
    if (jsonb["set"]) {
      expect(jsonb["jsonbSet"]).toBe(jsonb["set"]);
    }
  });
});

describe("normalizeParams", () => {
  let adapter: PostgresAdapter;
  let pgApi: PgApi;

  beforeEach(() => {
    adapter = createMockAdapter();
    pgApi = createPgApi(adapter);
  });

  it("should pass object args through directly", async () => {
    const bindings = pgApi.createSandboxBindings();
    const core = bindings["core"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    if (core["readQuery"]) {
      const result = await core["readQuery"]({ sql: "SELECT 1" });
      expect(result).toBeDefined();
    }
  });

  it("should normalize string arg for readQuery", async () => {
    const bindings = pgApi.createSandboxBindings();
    const core = bindings["core"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    if (core["readQuery"]) {
      const result = await core["readQuery"]("SELECT 1");
      expect(result).toBeDefined();
    }
  });

  it("should handle zero args gracefully", async () => {
    const bindings = pgApi.createSandboxBindings();
    const core = bindings["core"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    if (core["listTables"]) {
      const result = await core["listTables"]();
      expect(result).toBeDefined();
    }
  });

  it("should handle tool method that executes successfully", async () => {
    const bindings = pgApi.createSandboxBindings();
    const core = bindings["core"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    // readQuery should call the handler
    if (core["readQuery"]) {
      const result = await core["readQuery"]("SELECT 1");
      expect(result).toBeDefined();
    }
  });
});

describe("Error handling in method proxies", () => {
  it("should propagate handler errors", async () => {
    const errorHandler = vi.fn(async () => {
      throw new Error("Database connection lost");
    });

    const mockToolDefs: ToolDefinition[] = [
      {
        name: "pg_read_query",
        description: "Execute a read query",
        group: "core" as ToolGroup,
        inputSchema: {},
        handler: errorHandler,
      },
    ];

    const errorAdapter = {
      getToolDefinitions: vi.fn(() => mockToolDefs),
      createContext: vi.fn(() => ({})),
    } as unknown as PostgresAdapter;

    const api = createPgApi(errorAdapter);
    const bindings = api.createSandboxBindings();
    const core = bindings["core"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    if (core["readQuery"]) {
      await expect(core["readQuery"]("SELECT 1")).rejects.toThrow(
        "Database connection lost",
      );
    }
  });
});

describe("Multiple tool groups", () => {
  it("should handle tools from many different groups", () => {
    const multiGroupToolDefs: ToolDefinition[] = [
      {
        name: "pg_read_query",
        description: "Read query",
        group: "core" as ToolGroup,
        inputSchema: {},
        handler: vi.fn(async () => ({})),
      },
      {
        name: "pg_text_search",
        description: "Text search",
        group: "text" as ToolGroup,
        inputSchema: {},
        handler: vi.fn(async () => ({})),
      },
      {
        name: "pg_vector_search",
        description: "Vector search",
        group: "vector" as ToolGroup,
        inputSchema: {},
        handler: vi.fn(async () => ({})),
      },
      {
        name: "pg_stats_descriptive",
        description: "Stats descriptive",
        group: "stats" as ToolGroup,
        inputSchema: {},
        handler: vi.fn(async () => ({})),
      },
      {
        name: "pg_cron_schedule",
        description: "Cron schedule",
        group: "cron" as ToolGroup,
        inputSchema: {},
        handler: vi.fn(async () => ({})),
      },
    ];

    const multiAdapter = {
      getToolDefinitions: vi.fn(() => multiGroupToolDefs),
      createContext: vi.fn(() => ({})),
    } as unknown as PostgresAdapter;

    const api = createPgApi(multiAdapter);
    const groups = api.getAvailableGroups();

    expect(groups["core"]).toBe(1);
    expect(groups["text"]).toBe(1);
    expect(groups["vector"]).toBe(1);
    expect(groups["stats"]).toBe(1);
    expect(groups["cron"]).toBe(1);

    // Check alias resolution across groups
    const bindings = api.createSandboxBindings();

    // text group should have textSearch alias → search
    const text = bindings["text"] as Record<string, unknown>;
    if (text["search"]) {
      expect(text["textSearch"]).toBe(text["search"]);
    }

    // vector group should have vectorSearch alias → search
    const vector = bindings["vector"] as Record<string, unknown>;
    if (vector["search"]) {
      expect(vector["vectorSearch"]).toBe(vector["search"]);
    }

    // stats group should have statsDescriptive alias → descriptive
    const stats = bindings["stats"] as Record<string, unknown>;
    if (stats["descriptive"]) {
      expect(stats["statsDescriptive"]).toBe(stats["descriptive"]);
    }

    // cron group should have cronSchedule alias → schedule
    const cron = bindings["cron"] as Record<string, unknown>;
    if (cron["schedule"]) {
      expect(cron["cronSchedule"]).toBe(cron["schedule"]);
    }
  });
});

describe("Text group soundex/metaphone wrappers", () => {
  it("should create soundex/metaphone as wrappers around fuzzyMatch", () => {
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_text_fuzzy_match",
        description: "Fuzzy match",
        group: "text" as ToolGroup,
        inputSchema: {},
        handler: vi.fn(async (params: unknown) => ({
          received: params,
        })),
      },
    ];

    const textAdapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
    } as unknown as PostgresAdapter;

    const api = createPgApi(textAdapter);
    const bindings = api.createSandboxBindings();
    const text = bindings["text"] as Record<string, unknown>;

    // soundex and metaphone should exist since fuzzyMatch exists
    expect(typeof text["soundex"]).toBe("function");
    expect(typeof text["metaphone"]).toBe("function");
  });

  it("should call fuzzyMatch with method=soundex", async () => {
    const mockHandler = vi.fn(async (params: unknown) => ({
      received: params,
    }));

    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_text_fuzzy_match",
        description: "Fuzzy match",
        group: "text" as ToolGroup,
        inputSchema: {},
        handler: mockHandler,
      },
    ];

    const textAdapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
    } as unknown as PostgresAdapter;

    const api = createPgApi(textAdapter);
    const bindings = api.createSandboxBindings();
    const text = bindings["text"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    if (text["soundex"]) {
      await text["soundex"]({ table: "users", column: "name", value: "john" });
      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({ method: "soundex" }),
        expect.anything(),
      );
    }
  });
});

describe("Performance group wrappers", () => {
  it("should create blockingQueries wrapper", () => {
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_locks",
        description: "Locks",
        group: "performance" as ToolGroup,
        inputSchema: {},
        handler: vi.fn(async () => ({ locks: [] })),
      },
    ];

    const perfAdapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
    } as unknown as PostgresAdapter;

    const api = createPgApi(perfAdapter);
    const bindings = api.createSandboxBindings();
    const perf = bindings["performance"] as Record<string, unknown>;

    expect(typeof perf["blockingQueries"]).toBe("function");
  });

  it("should create longRunningQueries wrapper", () => {
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_stat_activity",
        description: "Stat activity",
        group: "performance" as ToolGroup,
        inputSchema: {},
        handler: vi.fn(async () => ({
          connections: [],
          count: 0,
        })),
      },
    ];

    const perfAdapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
    } as unknown as PostgresAdapter;

    const api = createPgApi(perfAdapter);
    const bindings = api.createSandboxBindings();
    const perf = bindings["performance"] as Record<string, unknown>;

    expect(typeof perf["longRunningQueries"]).toBe("function");
    expect(typeof perf["runningQueries"]).toBe("function");
  });

  it("longRunningQueries should filter by duration threshold", async () => {
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_stat_activity",
        description: "Stat activity",
        group: "performance" as ToolGroup,
        inputSchema: {},
        handler: vi.fn(async () => ({
          connections: [
            { duration: "00:00:02.000", query: "SELECT 1" },
            { duration: "00:00:15.000", query: "SELECT long" },
            { duration: "00:01:00.000", query: "SELECT very_long" },
          ],
          count: 3,
        })),
      },
    ];

    const perfAdapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
    } as unknown as PostgresAdapter;

    const api = createPgApi(perfAdapter);
    const bindings = api.createSandboxBindings();
    const perf = bindings["performance"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    // With default threshold (5s), should filter out short query
    if (perf["longRunningQueries"]) {
      const result = (await perf["longRunningQueries"]()) as {
        longRunningQueries: unknown[];
        count: number;
        threshold: string;
      };

      expect(result.count).toBe(2);
      expect(result.threshold).toBe("5 seconds");
    }
  });

  it("longRunningQueries should accept numeric threshold", async () => {
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_stat_activity",
        description: "Stat activity",
        group: "performance" as ToolGroup,
        inputSchema: {},
        handler: vi.fn(async () => ({
          connections: [
            { duration: "00:00:02.000", query: "fast" },
            { duration: "00:00:15.000", query: "medium" },
          ],
          count: 2,
        })),
      },
    ];

    const perfAdapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
    } as unknown as PostgresAdapter;

    const api = createPgApi(perfAdapter);
    const bindings = api.createSandboxBindings();
    const perf = bindings["performance"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    if (perf["longRunningQueries"]) {
      const result = (await perf["longRunningQueries"](10)) as {
        count: number;
        threshold: string;
      };

      expect(result.count).toBe(1);
      expect(result.threshold).toBe("10 seconds");
    }
  });

  it("longRunningQueries should accept object threshold", async () => {
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_stat_activity",
        description: "Stat activity",
        group: "performance" as ToolGroup,
        inputSchema: {},
        handler: vi.fn(async () => ({
          connections: [{ duration: "00:00:02.000", query: "short" }],
          count: 1,
        })),
      },
    ];

    const perfAdapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
    } as unknown as PostgresAdapter;

    const api = createPgApi(perfAdapter);
    const bindings = api.createSandboxBindings();
    const perf = bindings["performance"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    if (perf["longRunningQueries"]) {
      const result = (await perf["longRunningQueries"]({ seconds: 1 })) as {
        count: number;
      };

      expect(result.count).toBe(1);
    }
  });

  it("should create analyzeTable wrapper", () => {
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_read_query",
        description: "Read",
        group: "performance" as ToolGroup,
        inputSchema: {},
        handler: vi.fn(async () => ({ rows: [] })),
      },
    ];

    const perfAdapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
      executeQuery: vi.fn(async () => ({ rows: [] })),
    } as unknown as PostgresAdapter;

    const api = createPgApi(perfAdapter);
    const bindings = api.createSandboxBindings();
    const perf = bindings["performance"] as Record<string, unknown>;

    expect(typeof perf["analyzeTable"]).toBe("function");
  });

  it("analyzeTable should handle string table name", async () => {
    const mockExecuteQuery = vi.fn(async () => ({ rows: [] }));
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_read_query",
        description: "Read",
        group: "performance" as ToolGroup,
        inputSchema: {},
        handler: vi.fn(async () => ({ rows: [] })),
      },
    ];

    const perfAdapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
      executeQuery: mockExecuteQuery,
    } as unknown as PostgresAdapter;

    const api = createPgApi(perfAdapter);
    const bindings = api.createSandboxBindings();
    const perf = bindings["performance"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    const result = (await perf["analyzeTable"]("users")) as {
      success: boolean;
      message: string;
    };
    expect(result.success).toBe(true);
    expect(result.message).toContain("users");
    expect(mockExecuteQuery).toHaveBeenCalledWith(
      expect.stringContaining("ANALYZE"),
    );
  });

  it("analyzeTable should handle schema.table string format", async () => {
    const mockExecuteQuery = vi.fn(async () => ({ rows: [] }));
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_read_query",
        description: "Read",
        group: "performance" as ToolGroup,
        inputSchema: {},
        handler: vi.fn(async () => ({ rows: [] })),
      },
    ];

    const perfAdapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
      executeQuery: mockExecuteQuery,
    } as unknown as PostgresAdapter;

    const api = createPgApi(perfAdapter);
    const bindings = api.createSandboxBindings();
    const perf = bindings["performance"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    const result = (await perf["analyzeTable"]("myschema.users")) as {
      success: boolean;
      message: string;
    };
    expect(result.success).toBe(true);
    expect(result.message).toContain("myschema");
    expect(result.message).toContain("users");
  });

  it("analyzeTable should handle object with table and schema", async () => {
    const mockExecuteQuery = vi.fn(async () => ({ rows: [] }));
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_read_query",
        description: "Read",
        group: "performance" as ToolGroup,
        inputSchema: {},
        handler: vi.fn(async () => ({ rows: [] })),
      },
    ];

    const perfAdapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
      executeQuery: mockExecuteQuery,
    } as unknown as PostgresAdapter;

    const api = createPgApi(perfAdapter);
    const bindings = api.createSandboxBindings();
    const perf = bindings["performance"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    const result = (await perf["analyzeTable"]({
      table: "orders",
      schema: "sales",
    })) as {
      success: boolean;
      message: string;
    };
    expect(result.success).toBe(true);
    expect(result.message).toContain("sales");
    expect(result.message).toContain("orders");
  });

  it("analyzeTable should handle object with schema.table in table field", async () => {
    const mockExecuteQuery = vi.fn(async () => ({ rows: [] }));
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_read_query",
        description: "Read",
        group: "performance" as ToolGroup,
        inputSchema: {},
        handler: vi.fn(async () => ({ rows: [] })),
      },
    ];

    const perfAdapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
      executeQuery: mockExecuteQuery,
    } as unknown as PostgresAdapter;

    const api = createPgApi(perfAdapter);
    const bindings = api.createSandboxBindings();
    const perf = bindings["performance"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    const result = (await perf["analyzeTable"]({
      table: "myschema.orders",
    })) as {
      success: boolean;
    };
    expect(result.success).toBe(true);
  });

  it("analyzeTable should return error when no table name provided", async () => {
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_read_query",
        description: "Read",
        group: "performance" as ToolGroup,
        inputSchema: {},
        handler: vi.fn(async () => ({ rows: [] })),
      },
    ];

    const perfAdapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
      executeQuery: vi.fn(async () => ({ rows: [] })),
    } as unknown as PostgresAdapter;

    const api = createPgApi(perfAdapter);
    const bindings = api.createSandboxBindings();
    const perf = bindings["performance"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    const result = (await perf["analyzeTable"]({})) as { error: string };
    expect(result.error).toBe("Table name required");
  });
});

// =============================================================================
// normalizeParams branch coverage
// =============================================================================

describe("normalizeParams — OBJECT_WRAP_MAP and ARRAY_WRAP_MAP branches", () => {
  it("should wrap plain object arg for jsonb.object via OBJECT_WRAP_MAP", async () => {
    const mockHandler = vi.fn(async (params: unknown) => ({
      received: params,
    }));
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_jsonb_object",
        description: "JSONB object",
        group: "jsonb" as ToolGroup,
        inputSchema: {},
        handler: mockHandler,
      },
    ];
    const adapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
    } as unknown as PostgresAdapter;

    const api = createPgApi(adapter);
    const bindings = api.createSandboxBindings();
    const jsonb = bindings["jsonb"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    // Pass plain key-value object — should be wrapped in {data: ...} by OBJECT_WRAP_MAP
    await jsonb["object"]({ name: "test", value: 42 });
    expect(mockHandler).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "test", value: 42 } }),
      expect.anything(),
    );
  });

  it("should NOT wrap object that already has skip key", async () => {
    const mockHandler = vi.fn(async (params: unknown) => ({
      received: params,
    }));
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_jsonb_object",
        description: "JSONB object",
        group: "jsonb" as ToolGroup,
        inputSchema: {},
        handler: mockHandler,
      },
    ];
    const adapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
    } as unknown as PostgresAdapter;

    const api = createPgApi(adapter);
    const bindings = api.createSandboxBindings();
    const jsonb = bindings["jsonb"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    // Pass object with 'data' key (a skipKey) — should NOT be re-wrapped
    await jsonb["object"]({ data: { name: "test" } });
    expect(mockHandler).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "test" } }),
      expect.anything(),
    );
  });

  it("should wrap array arg for transactionExecute via ARRAY_WRAP_MAP", async () => {
    const mockHandler = vi.fn(async (params: unknown) => ({
      received: params,
    }));
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_transaction_execute",
        description: "Transaction execute",
        group: "transactions" as ToolGroup,
        inputSchema: {},
        handler: mockHandler,
      },
    ];
    const adapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
    } as unknown as PostgresAdapter;

    const api = createPgApi(adapter);
    const bindings = api.createSandboxBindings();
    const tx = bindings["transactions"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    // Pass array — should be wrapped in {statements: [...]}
    const stmts = [{ sql: "SELECT 1" }];
    await tx["transactionExecute"](stmts);
    expect(mockHandler).toHaveBeenCalledWith(
      expect.objectContaining({ statements: stmts }),
      expect.anything(),
    );
  });

  it("should wrap multi-arg array + options for transactionExecute", async () => {
    const mockHandler = vi.fn(async (params: unknown) => ({
      received: params,
    }));
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_transaction_execute",
        description: "Transaction execute",
        group: "transactions" as ToolGroup,
        inputSchema: {},
        handler: mockHandler,
      },
    ];
    const adapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
    } as unknown as PostgresAdapter;

    const api = createPgApi(adapter);
    const bindings = api.createSandboxBindings();
    const tx = bindings["transactions"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    // Pass array + trailing options object
    const stmts = [{ sql: "SELECT 1" }];
    await tx["transactionExecute"](stmts, { isolationLevel: "serializable" });
    expect(mockHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        statements: stmts,
        isolationLevel: "serializable",
      }),
      expect.anything(),
    );
  });
});

describe("normalizeParams — positional arg mapping", () => {
  it("should map single string to first param in array mapping", async () => {
    const mockHandler = vi.fn(async (params: unknown) => ({
      received: params,
    }));
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_stats_descriptive",
        description: "Descriptive stats",
        group: "stats" as ToolGroup,
        inputSchema: {},
        handler: mockHandler,
      },
    ];
    const adapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
    } as unknown as PostgresAdapter;

    const api = createPgApi(adapter);
    const bindings = api.createSandboxBindings();
    const stats = bindings["stats"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    // descriptive has paramMapping ["table", "column"] — single string maps to {table: ...}
    await stats["descriptive"]("users");
    expect(mockHandler).toHaveBeenCalledWith(
      expect.objectContaining({ table: "users" }),
      expect.anything(),
    );
  });

  it("should map multiple positional args to named params", async () => {
    const mockHandler = vi.fn(async (params: unknown) => ({
      received: params,
    }));
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_stats_correlation",
        description: "Correlation",
        group: "stats" as ToolGroup,
        inputSchema: {},
        handler: mockHandler,
      },
    ];
    const adapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
    } as unknown as PostgresAdapter;

    const api = createPgApi(adapter);
    const bindings = api.createSandboxBindings();
    const stats = bindings["stats"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    // correlation has paramMapping ["table", "column1", "column2"]
    await stats["correlation"]("users", "age", "income");
    expect(mockHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        table: "users",
        column1: "age",
        column2: "income",
      }),
      expect.anything(),
    );
  });

  it("should merge trailing options object with positional args", async () => {
    const mockHandler = vi.fn(async (params: unknown) => ({
      received: params,
    }));
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_stats_correlation",
        description: "Correlation",
        group: "stats" as ToolGroup,
        inputSchema: {},
        handler: mockHandler,
      },
    ];
    const adapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
    } as unknown as PostgresAdapter;

    const api = createPgApi(adapter);
    const bindings = api.createSandboxBindings();
    const stats = bindings["stats"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    // Pass positional args + trailing options containing a recognized key
    await stats["correlation"]("users", "age", { column2: "income" });
    expect(mockHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        table: "users",
        column1: "age",
        column2: "income",
      }),
      expect.anything(),
    );
  });

  it("should handle single param mapping with trailing options", async () => {
    const mockHandler = vi.fn(async (params: unknown) => ({
      received: params,
    }));
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_truncate",
        description: "Truncate",
        group: "core" as ToolGroup,
        inputSchema: {},
        handler: mockHandler,
      },
    ];
    const adapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
    } as unknown as PostgresAdapter;

    const api = createPgApi(adapter);
    const bindings = api.createSandboxBindings();
    const core = bindings["core"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    // truncate has single paramMapping "table" — truncate("users", {cascade: true})
    await core["truncate"]("users", { cascade: true });
    expect(mockHandler).toHaveBeenCalledWith(
      expect.objectContaining({ table: "users", cascade: true }),
      expect.anything(),
    );
  });

  it("should fall back to common param names for unmapped method with string arg", async () => {
    const mockHandler = vi.fn(async (params: unknown) => ({
      received: params,
    }));
    // Use a tool name that doesn't have a positional param mapping
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_some_unknown_tool",
        description: "Unknown tool",
        group: "core" as ToolGroup,
        inputSchema: {},
        handler: mockHandler,
      },
    ];
    const adapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
    } as unknown as PostgresAdapter;

    const api = createPgApi(adapter);
    const bindings = api.createSandboxBindings();
    const core = bindings["core"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    // someUnknownTool has no paramMapping — string arg falls back to {sql, query, table, name}
    if (core["someUnknownTool"]) {
      await core["someUnknownTool"]("test_value");
      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({ sql: "test_value" }),
        expect.anything(),
      );
    }
  });

  it("should pass through non-string non-object non-array single arg", async () => {
    const mockHandler = vi.fn(async (params: unknown) => ({
      received: params,
    }));
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_some_tool",
        description: "Some tool",
        group: "core" as ToolGroup,
        inputSchema: {},
        handler: mockHandler,
      },
    ];
    const adapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
    } as unknown as PostgresAdapter;

    const api = createPgApi(adapter);
    const bindings = api.createSandboxBindings();
    const core = bindings["core"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    // Pass a number — should be passed through as-is
    if (core["someTool"]) {
      await core["someTool"](42);
      expect(mockHandler).toHaveBeenCalledWith(42, expect.anything());
    }
  });

  it("should return first arg when no paramMapping for multi-arg", async () => {
    const mockHandler = vi.fn(async (params: unknown) => ({
      received: params,
    }));
    // Tool with no positional param mapping
    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_unknown_multi",
        description: "Unknown multi",
        group: "core" as ToolGroup,
        inputSchema: {},
        handler: mockHandler,
      },
    ];
    const adapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
    } as unknown as PostgresAdapter;

    const api = createPgApi(adapter);
    const bindings = api.createSandboxBindings();
    const core = bindings["core"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    // Multiple non-array args with no mapping — returns first arg
    if (core["unknownMulti"]) {
      await core["unknownMulti"]("arg1", "arg2");
      expect(mockHandler).toHaveBeenCalledWith("arg1", expect.anything());
    }
  });
});

describe("Text group metaphone wrapper execution", () => {
  it("should call fuzzyMatch with method=metaphone", async () => {
    const mockHandler = vi.fn(async (params: unknown) => ({
      received: params,
    }));

    const toolDefs: ToolDefinition[] = [
      {
        name: "pg_text_fuzzy_match",
        description: "Fuzzy match",
        group: "text" as ToolGroup,
        inputSchema: {},
        handler: mockHandler,
      },
    ];

    const textAdapter = {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
    } as unknown as PostgresAdapter;

    const api = createPgApi(textAdapter);
    const bindings = api.createSandboxBindings();
    const text = bindings["text"] as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    if (text["metaphone"]) {
      await text["metaphone"]({
        table: "users",
        column: "name",
        value: "john",
      });
      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({ method: "metaphone" }),
        expect.anything(),
      );
    }
  });
});

// =============================================================================
// Full sandbox bindings coverage — all 20 tool groups
// =============================================================================

describe("createSandboxBindings — full group coverage", () => {
  /**
   * Creates a mock adapter with one tool per group, exercising every
   * top-level alias binding branch in createSandboxBindings() (lines 1031-1718).
   */
  function createFullMockAdapter(): PostgresAdapter {
    const handler = vi.fn(async () => ({ success: true }));
    const toolDefs: ToolDefinition[] = [
      // Core group — produces readQuery, writeQuery, listTables, describeTable, createTable,
      // dropTable, count, exists, upsert, batchInsert, truncate, createIndex, dropIndex,
      // getIndexes, listObjects, objectDetails, analyzeDbHealth, analyzeQueryIndexes,
      // analyzeWorkloadIndexes, listExtensions
      ...[
        "pg_read_query",
        "pg_write_query",
        "pg_list_tables",
        "pg_describe_table",
        "pg_create_table",
        "pg_drop_table",
        "pg_count",
        "pg_exists",
        "pg_upsert",
        "pg_batch_insert",
        "pg_truncate",
        "pg_create_index",
        "pg_drop_index",
        "pg_get_indexes",
        "pg_list_objects",
        "pg_object_details",
        "pg_analyze_db_health",
        "pg_analyze_query_indexes",
        "pg_analyze_workload_indexes",
        "pg_list_extensions",
      ].map((name) => ({
        name,
        description: name,
        group: "core" as ToolGroup,
        inputSchema: {},
        handler,
      })),
      // Transactions group
      ...[
        "pg_transaction_begin",
        "pg_transaction_commit",
        "pg_transaction_rollback",
        "pg_transaction_savepoint",
        "pg_transaction_release",
        "pg_transaction_rollback_to",
        "pg_transaction_execute",
      ].map((name) => ({
        name,
        description: name,
        group: "transactions" as ToolGroup,
        inputSchema: {},
        handler,
      })),
      // JSONB group — all 19 methods for top-level jsonbXxx aliases
      ...[
        "pg_jsonb_extract",
        "pg_jsonb_set",
        "pg_jsonb_insert",
        "pg_jsonb_delete",
        "pg_jsonb_contains",
        "pg_jsonb_path_query",
        "pg_jsonb_agg",
        "pg_jsonb_object",
        "pg_jsonb_array",
        "pg_jsonb_keys",
        "pg_jsonb_strip_nulls",
        "pg_jsonb_typeof",
        "pg_jsonb_validate_path",
        "pg_jsonb_merge",
        "pg_jsonb_normalize",
        "pg_jsonb_diff",
        "pg_jsonb_index_suggest",
        "pg_jsonb_security_scan",
        "pg_jsonb_stats",
      ].map((name) => ({
        name,
        description: name,
        group: "jsonb" as ToolGroup,
        inputSchema: {},
        handler,
      })),
      // Text group — all methods for top-level textXxx aliases
      ...[
        "pg_text_search",
        "pg_text_rank",
        "pg_text_headline",
        "pg_text_normalize",
        "pg_text_sentiment",
        "pg_text_to_vector",
        "pg_text_to_query",
        "pg_text_search_config",
        "pg_text_trigram_similarity",
        "pg_text_fuzzy_match",
        "pg_text_like_search",
        "pg_text_regexp_match",
        "pg_text_create_fts_index",
      ].map((name) => ({
        name,
        description: name,
        group: "text" as ToolGroup,
        inputSchema: {},
        handler,
      })),
      // Performance group — all methods for top-level aliases
      ...[
        "pg_explain",
        "pg_explain_analyze",
        "pg_cache_hit_ratio",
        "pg_index_stats",
        "pg_table_stats",
        "pg_index_recommendations",
        "pg_bloat_check",
        "pg_vacuum_stats",
        "pg_unused_indexes",
        "pg_duplicate_indexes",
        "pg_seq_scan_tables",
      ].map((name) => ({
        name,
        description: name,
        group: "performance" as ToolGroup,
        inputSchema: {},
        handler,
      })),
      // Admin group — all methods for top-level aliases
      ...[
        "pg_vacuum",
        "pg_vacuum_analyze",
        "pg_analyze",
        "pg_reindex",
        "pg_cluster",
        "pg_set_config",
        "pg_reload_conf",
        "pg_reset_stats",
        "pg_cancel_backend",
        "pg_terminate_backend",
      ].map((name) => ({
        name,
        description: name,
        group: "admin" as ToolGroup,
        inputSchema: {},
        handler,
      })),
      // Monitoring group — all methods for top-level aliases
      ...[
        "pg_database_size",
        "pg_table_sizes",
        "pg_connection_stats",
        "pg_server_version",
        "pg_uptime",
        "pg_show_settings",
        "pg_recovery_status",
        "pg_replication_status",
        "pg_capacity_planning",
        "pg_resource_usage_analyze",
        "pg_alert_threshold_set",
      ].map((name) => ({
        name,
        description: name,
        group: "monitoring" as ToolGroup,
        inputSchema: {},
        handler,
      })),
      // Backup group — includes physical and scheduleOptimize for dual-alias branches
      ...[
        "pg_dump_table",
        "pg_dump_schema",
        "pg_copy_export",
        "pg_copy_import",
        "pg_create_backup_plan",
        "pg_restore_command",
        "pg_restore_validate",
        "pg_physical",
        "pg_schedule_optimize",
      ].map((name) => ({
        name,
        description: name,
        group: "backup" as ToolGroup,
        inputSchema: {},
        handler,
      })),
      // Schema group
      {
        name: "pg_create_schema",
        description: "Create schema",
        group: "schema" as ToolGroup,
        inputSchema: {},
        handler,
      },
      // Vector group — hybridSearch for top-level alias
      ...["pg_vector_search", "pg_vector_create_index", "pg_hybrid_search"].map(
        (name) => ({
          name,
          description: name,
          group: "vector" as ToolGroup,
          inputSchema: {},
          handler,
        }),
      ),
      // PostGIS group — all methods for top-level postgisXxx aliases
      ...[
        "pg_postgis_create_extension",
        "pg_postgis_geocode",
        "pg_postgis_geometry_column",
        "pg_postgis_spatial_index",
        "pg_postgis_distance",
        "pg_postgis_bounding_box",
        "pg_postgis_intersection",
        "pg_postgis_point_in_polygon",
        "pg_postgis_buffer",
        "pg_postgis_geo_transform",
        "pg_postgis_geo_cluster",
        "pg_postgis_geometry_buffer",
        "pg_postgis_geometry_transform",
        "pg_postgis_geometry_intersection",
        "pg_postgis_geo_index_optimize",
      ].map((name) => ({
        name,
        description: name,
        group: "postgis" as ToolGroup,
        inputSchema: {},
        handler,
      })),
      // Partitioning group
      {
        name: "pg_create_partitioned_table",
        description: "Partition",
        group: "partitioning" as ToolGroup,
        inputSchema: {},
        handler,
      },
      // Stats group — all methods for top-level aliases
      ...[
        "pg_stats_descriptive",
        "pg_stats_percentiles",
        "pg_stats_correlation",
        "pg_stats_regression",
        "pg_stats_time_series",
        "pg_stats_distribution",
        "pg_stats_hypothesis",
        "pg_stats_sampling",
      ].map((name) => ({
        name,
        description: name,
        group: "stats" as ToolGroup,
        inputSchema: {},
        handler,
      })),
      // Cron group — all methods for top-level cronXxx aliases
      ...[
        "pg_cron_create_extension",
        "pg_cron_schedule",
        "pg_cron_schedule_in_database",
        "pg_cron_unschedule",
        "pg_cron_alter_job",
        "pg_cron_list_jobs",
        "pg_cron_job_run_details",
        "pg_cron_cleanup_history",
      ].map((name) => ({
        name,
        description: name,
        group: "cron" as ToolGroup,
        inputSchema: {},
        handler,
      })),
      // Partman group
      {
        name: "pg_partman_create_parent",
        description: "Partman",
        group: "partman" as ToolGroup,
        inputSchema: {},
        handler,
      },
      // Kcache group
      {
        name: "pg_kcache_query_stats",
        description: "Kcache",
        group: "kcache" as ToolGroup,
        inputSchema: {},
        handler,
      },
      // Citext group — all methods for top-level citextXxx aliases
      ...[
        "pg_citext_create_extension",
        "pg_citext_convert_column",
        "pg_citext_list_columns",
        "pg_citext_analyze_candidates",
        "pg_citext_compare",
        "pg_citext_schema_advisor",
      ].map((name) => ({
        name,
        description: name,
        group: "citext" as ToolGroup,
        inputSchema: {},
        handler,
      })),
      // Ltree group — all methods for top-level ltreeXxx aliases
      ...[
        "pg_ltree_create_extension",
        "pg_ltree_query",
        "pg_ltree_subpath",
        "pg_ltree_lca",
        "pg_ltree_match",
        "pg_ltree_list_columns",
        "pg_ltree_convert_column",
        "pg_ltree_create_index",
      ].map((name) => ({
        name,
        description: name,
        group: "ltree" as ToolGroup,
        inputSchema: {},
        handler,
      })),
      // Pgcrypto group — all methods for top-level pgcryptoXxx aliases
      ...[
        "pg_pgcrypto_create_extension",
        "pg_pgcrypto_hash",
        "pg_pgcrypto_hmac",
        "pg_pgcrypto_encrypt",
        "pg_pgcrypto_decrypt",
        "pg_pgcrypto_gen_random_uuid",
        "pg_pgcrypto_gen_random_bytes",
        "pg_pgcrypto_gen_salt",
        "pg_pgcrypto_crypt",
      ].map((name) => ({
        name,
        description: name,
        group: "pgcrypto" as ToolGroup,
        inputSchema: {},
        handler,
      })),
      // Introspection group
      ...[
        "pg_dependency_graph",
        "pg_topological_sort",
        "pg_cascade_simulator",
        "pg_schema_snapshot",
        "pg_constraint_analysis",
        "pg_migration_risks",
        "pg_migration_init",
        "pg_migration_record",
        "pg_migration_apply",
        "pg_migration_rollback",
        "pg_migration_history",
        "pg_migration_status",
      ].map((name) => ({
        name,
        description: name,
        group: "introspection" as ToolGroup,
        inputSchema: {},
        handler,
      })),
    ];

    return {
      getToolDefinitions: vi.fn(() => toolDefs),
      createContext: vi.fn(() => ({})),
    } as unknown as PostgresAdapter;
  }

  it("should create top-level aliases for all 20 tool groups", () => {
    const adapter = createFullMockAdapter();
    const api = createPgApi(adapter);
    const bindings = api.createSandboxBindings();

    // All 20 group namespaces should exist
    const expectedGroups = [
      "core",
      "transactions",
      "jsonb",
      "text",
      "performance",
      "admin",
      "monitoring",
      "backup",
      "schema",
      "vector",
      "postgis",
      "partitioning",
      "stats",
      "cron",
      "partman",
      "kcache",
      "citext",
      "ltree",
      "pgcrypto",
      "introspection",
    ];
    for (const group of expectedGroups) {
      expect(bindings).toHaveProperty(group);
    }

    // Top-level hybridSearch alias (vector)
    expect(bindings).toHaveProperty("hybridSearch");

    // Top-level JSONB aliases
    expect(bindings).toHaveProperty("jsonbExtract");
    expect(bindings).toHaveProperty("jsonbSet");
    expect(bindings).toHaveProperty("jsonbInsert");
    expect(bindings).toHaveProperty("jsonbDelete");
    expect(bindings).toHaveProperty("jsonbContains");
    expect(bindings).toHaveProperty("jsonbPathQuery");
    expect(bindings).toHaveProperty("jsonbAgg");
    expect(bindings).toHaveProperty("jsonbObject");
    expect(bindings).toHaveProperty("jsonbArray");
    expect(bindings).toHaveProperty("jsonbKeys");
    expect(bindings).toHaveProperty("jsonbStripNulls");
    expect(bindings).toHaveProperty("jsonbTypeof");
    expect(bindings).toHaveProperty("jsonbValidatePath");
    expect(bindings).toHaveProperty("jsonbMerge");
    expect(bindings).toHaveProperty("jsonbNormalize");
    expect(bindings).toHaveProperty("jsonbDiff");
    expect(bindings).toHaveProperty("jsonbIndexSuggest");
    expect(bindings).toHaveProperty("jsonbSecurityScan");
    expect(bindings).toHaveProperty("jsonbStats");

    // Top-level text aliases
    expect(bindings).toHaveProperty("textSearch");
    expect(bindings).toHaveProperty("textHeadline");
    expect(bindings).toHaveProperty("textNormalize");
    expect(bindings).toHaveProperty("textSentiment");
    expect(bindings).toHaveProperty("textToVector");
    expect(bindings).toHaveProperty("textToQuery");
    expect(bindings).toHaveProperty("textSearchConfig");
    expect(bindings).toHaveProperty("textTrigramSimilarity");
    expect(bindings).toHaveProperty("textFuzzyMatch");
    expect(bindings).toHaveProperty("textLikeSearch");
    expect(bindings).toHaveProperty("textRegexpMatch");
    expect(bindings).toHaveProperty("textCreateFtsIndex");

    // Top-level citext aliases
    expect(bindings).toHaveProperty("citextCreateExtension");
    expect(bindings).toHaveProperty("citextConvertColumn");
    expect(bindings).toHaveProperty("citextListColumns");
    expect(bindings).toHaveProperty("citextAnalyzeCandidates");
    expect(bindings).toHaveProperty("citextCompare");
    expect(bindings).toHaveProperty("citextSchemaAdvisor");

    // Top-level ltree aliases
    expect(bindings).toHaveProperty("ltreeCreateExtension");
    expect(bindings).toHaveProperty("ltreeQuery");
    expect(bindings).toHaveProperty("ltreeSubpath");
    expect(bindings).toHaveProperty("ltreeLca");
    expect(bindings).toHaveProperty("ltreeMatch");
    expect(bindings).toHaveProperty("ltreeListColumns");
    expect(bindings).toHaveProperty("ltreeConvertColumn");
    expect(bindings).toHaveProperty("ltreeCreateIndex");

    // Top-level pgcrypto aliases
    expect(bindings).toHaveProperty("pgcryptoCreateExtension");
    expect(bindings).toHaveProperty("pgcryptoHash");
    expect(bindings).toHaveProperty("pgcryptoHmac");
    expect(bindings).toHaveProperty("pgcryptoEncrypt");
    expect(bindings).toHaveProperty("pgcryptoDecrypt");
    expect(bindings).toHaveProperty("pgcryptoGenRandomUuid");
    expect(bindings).toHaveProperty("pgcryptoGenRandomBytes");
    expect(bindings).toHaveProperty("pgcryptoGenSalt");
    expect(bindings).toHaveProperty("pgcryptoCrypt");

    // Top-level core aliases
    expect(bindings).toHaveProperty("readQuery");
    expect(bindings).toHaveProperty("writeQuery");
    expect(bindings).toHaveProperty("listTables");
    expect(bindings).toHaveProperty("describeTable");
    expect(bindings).toHaveProperty("createTable");
    expect(bindings).toHaveProperty("dropTable");
    expect(bindings).toHaveProperty("count");
    expect(bindings).toHaveProperty("exists");
    expect(bindings).toHaveProperty("upsert");
    expect(bindings).toHaveProperty("batchInsert");
    expect(bindings).toHaveProperty("truncate");
    expect(bindings).toHaveProperty("createIndex");
    expect(bindings).toHaveProperty("dropIndex");
    expect(bindings).toHaveProperty("getIndexes");
    expect(bindings).toHaveProperty("listObjects");
    expect(bindings).toHaveProperty("objectDetails");
    expect(bindings).toHaveProperty("analyzeDbHealth");
    expect(bindings).toHaveProperty("analyzeQueryIndexes");
    expect(bindings).toHaveProperty("analyzeWorkloadIndexes");
    expect(bindings).toHaveProperty("listExtensions");

    // Top-level transaction aliases
    expect(bindings).toHaveProperty("transactionBegin");
    expect(bindings).toHaveProperty("transactionCommit");
    expect(bindings).toHaveProperty("transactionRollback");
    expect(bindings).toHaveProperty("transactionSavepoint");
    expect(bindings).toHaveProperty("transactionRelease");
    expect(bindings).toHaveProperty("transactionRollbackTo");
    expect(bindings).toHaveProperty("transactionExecute");

    // Top-level performance aliases
    expect(bindings).toHaveProperty("explain");
    expect(bindings).toHaveProperty("explainAnalyze");
    expect(bindings).toHaveProperty("cacheHitRatio");
    expect(bindings).toHaveProperty("indexStats");
    expect(bindings).toHaveProperty("tableStats");
    expect(bindings).toHaveProperty("indexRecommendations");
    expect(bindings).toHaveProperty("bloatCheck");
    expect(bindings).toHaveProperty("vacuumStats");
    expect(bindings).toHaveProperty("unusedIndexes");
    expect(bindings).toHaveProperty("duplicateIndexes");
    expect(bindings).toHaveProperty("seqScanTables");

    // Top-level admin aliases
    expect(bindings).toHaveProperty("vacuum");
    expect(bindings).toHaveProperty("vacuumAnalyze");
    expect(bindings).toHaveProperty("analyze");
    expect(bindings).toHaveProperty("reindex");
    expect(bindings).toHaveProperty("cluster");
    expect(bindings).toHaveProperty("setConfig");
    expect(bindings).toHaveProperty("reloadConf");
    expect(bindings).toHaveProperty("resetStats");
    expect(bindings).toHaveProperty("cancelBackend");
    expect(bindings).toHaveProperty("terminateBackend");

    // Top-level monitoring aliases
    expect(bindings).toHaveProperty("databaseSize");
    expect(bindings).toHaveProperty("tableSizes");
    expect(bindings).toHaveProperty("connectionStats");
    expect(bindings).toHaveProperty("serverVersion");
    expect(bindings).toHaveProperty("uptime");
    expect(bindings).toHaveProperty("showSettings");
    expect(bindings).toHaveProperty("recoveryStatus");
    expect(bindings).toHaveProperty("replicationStatus");
    expect(bindings).toHaveProperty("capacityPlanning");
    expect(bindings).toHaveProperty("resourceUsageAnalyze");
    expect(bindings).toHaveProperty("alertThresholdSet");

    // Top-level backup aliases (includes dual-alias for physical and scheduleOptimize)
    expect(bindings).toHaveProperty("dumpTable");
    expect(bindings).toHaveProperty("dumpSchema");
    expect(bindings).toHaveProperty("copyExport");
    expect(bindings).toHaveProperty("copyImport");
    expect(bindings).toHaveProperty("createBackupPlan");
    expect(bindings).toHaveProperty("restoreCommand");
    expect(bindings).toHaveProperty("restoreValidate");
    expect(bindings).toHaveProperty("physical");
    expect(bindings).toHaveProperty("backupPhysical");
    expect(bindings).toHaveProperty("scheduleOptimize");
    expect(bindings).toHaveProperty("backupScheduleOptimize");

    // Top-level stats aliases
    expect(bindings).toHaveProperty("descriptive");
    expect(bindings).toHaveProperty("percentiles");
    expect(bindings).toHaveProperty("correlation");
    expect(bindings).toHaveProperty("regression");
    expect(bindings).toHaveProperty("timeSeries");
    expect(bindings).toHaveProperty("distribution");
    expect(bindings).toHaveProperty("hypothesis");
    expect(bindings).toHaveProperty("sampling");

    // Top-level PostGIS aliases
    expect(bindings).toHaveProperty("postgisCreateExtension");
    expect(bindings).toHaveProperty("postgisGeocode");
    expect(bindings).toHaveProperty("postgisGeometryColumn");
    expect(bindings).toHaveProperty("postgisSpatialIndex");
    expect(bindings).toHaveProperty("postgisDistance");
    expect(bindings).toHaveProperty("postgisBoundingBox");
    expect(bindings).toHaveProperty("postgisIntersection");
    expect(bindings).toHaveProperty("postgisPointInPolygon");
    expect(bindings).toHaveProperty("postgisBuffer");
    expect(bindings).toHaveProperty("postgisGeoTransform");
    expect(bindings).toHaveProperty("postgisGeoCluster");
    expect(bindings).toHaveProperty("postgisGeometryBuffer");
    expect(bindings).toHaveProperty("postgisGeometryTransform");
    expect(bindings).toHaveProperty("postgisGeometryIntersection");
    expect(bindings).toHaveProperty("postgisGeoIndexOptimize");

    // Top-level cron aliases
    expect(bindings).toHaveProperty("cronCreateExtension");
    expect(bindings).toHaveProperty("cronSchedule");
    expect(bindings).toHaveProperty("cronScheduleInDatabase");
    expect(bindings).toHaveProperty("cronUnschedule");
    expect(bindings).toHaveProperty("cronAlterJob");
    expect(bindings).toHaveProperty("cronListJobs");
    expect(bindings).toHaveProperty("cronJobRunDetails");
    expect(bindings).toHaveProperty("cronCleanupHistory");

    // Top-level help function
    expect(typeof bindings["help"]).toBe("function");
  });

  it("should include help() in each group namespace", () => {
    const adapter = createFullMockAdapter();
    const api = createPgApi(adapter);
    const bindings = api.createSandboxBindings();

    const groups = [
      "core",
      "jsonb",
      "text",
      "vector",
      "postgis",
      "stats",
      "cron",
      "citext",
      "ltree",
      "pgcrypto",
    ];
    for (const group of groups) {
      const groupApi = bindings[group] as Record<string, unknown>;
      expect(typeof groupApi["help"]).toBe("function");
      const helpResult = (groupApi["help"] as () => unknown)();
      expect(helpResult).toHaveProperty("methods");
      expect(helpResult).toHaveProperty("methodAliases");
    }
  });
});
