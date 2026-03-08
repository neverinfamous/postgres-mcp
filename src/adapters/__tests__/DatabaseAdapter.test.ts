/**
 * Unit tests for DatabaseAdapter abstract class
 *
 * Tests the concrete methods in the abstract base class:
 * - Query validation (SQL injection prevention)
 * - MCP registration methods
 * - Context creation
 * - Adapter info
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { DatabaseAdapter } from "../DatabaseAdapter.js";
import type {
  DatabaseConfig,
  QueryResult,
  SchemaInfo,
  TableInfo,
  HealthStatus,
  AdapterCapabilities,
  ToolDefinition,
  ResourceDefinition,
  PromptDefinition,
  ToolGroup,
  DatabaseType,
} from "../../types/index.js";

// Mock the logger to avoid console output during tests
vi.mock("../../utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

/**
 * Concrete implementation of DatabaseAdapter for testing
 */
class TestAdapter extends DatabaseAdapter {
  readonly type: DatabaseType = "postgresql";
  readonly name = "Test Adapter";
  readonly version = "1.0.0";

  private mockTools: ToolDefinition[] = [];
  private mockResources: ResourceDefinition[] = [];
  private mockPrompts: PromptDefinition[] = [];

  connect(_config: DatabaseConfig): Promise<void> {
    this.connected = true;
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this.connected = false;
    return Promise.resolve();
  }

  getHealth(): Promise<HealthStatus> {
    return Promise.resolve({
      connected: this.connected,
      latencyMs: 5,
      version: "16.1",
    });
  }

  executeReadQuery(_sql: string, _params?: unknown[]): Promise<QueryResult> {
    return Promise.resolve({ rows: [], rowsAffected: 0, executionTimeMs: 1 });
  }

  executeWriteQuery(_sql: string, _params?: unknown[]): Promise<QueryResult> {
    return Promise.resolve({ rows: [], rowsAffected: 1, executionTimeMs: 1 });
  }

  executeQuery(_sql: string, _params?: unknown[]): Promise<QueryResult> {
    return Promise.resolve({ rows: [], rowsAffected: 0, executionTimeMs: 1 });
  }

  getSchema(): Promise<SchemaInfo> {
    return Promise.resolve({ tables: [], views: [], indexes: [] });
  }

  listTables(): Promise<TableInfo[]> {
    return Promise.resolve([]);
  }

  describeTable(_tableName: string): Promise<TableInfo> {
    return Promise.resolve({
      name: "test",
      schema: "public",
      type: "table",
      columns: [],
    });
  }

  listSchemas(): Promise<string[]> {
    return Promise.resolve(["public"]);
  }

  getCapabilities(): AdapterCapabilities {
    return {
      json: true,
      fullTextSearch: true,
      vector: false,
      geospatial: false,
      transactions: true,
      preparedStatements: true,
      connectionPooling: true,
      partitioning: false,
      replication: false,
      cte: true,
      windowFunctions: true,
    };
  }

  getSupportedToolGroups(): ToolGroup[] {
    return ["core", "transactions"];
  }

  getToolDefinitions(): ToolDefinition[] {
    return this.mockTools;
  }

  getResourceDefinitions(): ResourceDefinition[] {
    return this.mockResources;
  }

  getPromptDefinitions(): PromptDefinition[] {
    return this.mockPrompts;
  }

  // Test helpers to set mock definitions
  setMockTools(tools: ToolDefinition[]): void {
    this.mockTools = tools;
  }

  setMockResources(resources: ResourceDefinition[]): void {
    this.mockResources = resources;
  }

  setMockPrompts(prompts: PromptDefinition[]): void {
    this.mockPrompts = prompts;
  }

  // Expose protected method for testing
  testRegisterTool(server: unknown, tool: ToolDefinition): void {
    this.registerTool(server as Parameters<typeof this.registerTool>[0], tool);
  }

  testRegisterResource(server: unknown, resource: ResourceDefinition): void {
    this.registerResource(
      server as Parameters<typeof this.registerResource>[0],
      resource,
    );
  }

  testRegisterPrompt(server: unknown, prompt: PromptDefinition): void {
    this.registerPrompt(
      server as Parameters<typeof this.registerPrompt>[0],
      prompt,
    );
  }
}

describe("DatabaseAdapter", () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    adapter = new TestAdapter();
  });

  describe("isConnected", () => {
    it("should return false initially", () => {
      expect(adapter.isConnected()).toBe(false);
    });

    it("should return true after connect", async () => {
      await adapter.connect({
        type: "postgresql",
        host: "localhost",
        port: 5432,
        database: "test",
      });
      expect(adapter.isConnected()).toBe(true);
    });

    it("should return false after disconnect", async () => {
      await adapter.connect({
        type: "postgresql",
        host: "localhost",
        port: 5432,
        database: "test",
      });
      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe("validateQuery", () => {
    describe("dangerous pattern detection", () => {
      it("should reject queries with ; DROP pattern", () => {
        expect(() =>
          adapter.validateQuery("SELECT 1; DROP TABLE users", false),
        ).toThrow("Query contains potentially dangerous patterns");
      });

      it("should reject queries with ; DELETE pattern", () => {
        expect(() =>
          adapter.validateQuery("SELECT 1; DELETE FROM users", false),
        ).toThrow("Query contains potentially dangerous patterns");
      });

      it("should reject queries with ; TRUNCATE pattern", () => {
        expect(() =>
          adapter.validateQuery("SELECT 1; TRUNCATE users", false),
        ).toThrow("Query contains potentially dangerous patterns");
      });

      it("should reject queries with ; INSERT pattern", () => {
        expect(() =>
          adapter.validateQuery(
            "SELECT 1; INSERT INTO users VALUES (1)",
            false,
          ),
        ).toThrow("Query contains potentially dangerous patterns");
      });

      it("should reject queries with ; UPDATE pattern", () => {
        expect(() =>
          adapter.validateQuery('SELECT 1; UPDATE users SET name = "x"', false),
        ).toThrow("Query contains potentially dangerous patterns");
      });

      it("should reject queries with SQL comment at end of line", () => {
        expect(() =>
          adapter.validateQuery("SELECT * FROM users-- ", false),
        ).toThrow("Query contains potentially dangerous patterns");
      });

      it("should accept safe SELECT queries", () => {
        expect(() =>
          adapter.validateQuery("SELECT * FROM users WHERE id = 1", false),
        ).not.toThrow();
      });

      it("should accept safe INSERT queries when not read-only", () => {
        expect(() =>
          adapter.validateQuery("INSERT INTO users (name) VALUES ($1)", false),
        ).not.toThrow();
      });
    });

    describe("read-only enforcement", () => {
      it("should reject INSERT in read-only mode", () => {
        expect(() =>
          adapter.validateQuery("INSERT INTO users VALUES (1)", true),
        ).toThrow("Read-only mode: INSERT statements are not allowed");
      });

      it("should reject UPDATE in read-only mode", () => {
        expect(() =>
          adapter.validateQuery("UPDATE users SET name = $1", true),
        ).toThrow("Read-only mode: UPDATE statements are not allowed");
      });

      it("should reject DELETE in read-only mode", () => {
        expect(() =>
          adapter.validateQuery("DELETE FROM users WHERE id = 1", true),
        ).toThrow("Read-only mode: DELETE statements are not allowed");
      });

      it("should reject DROP in read-only mode", () => {
        expect(() => adapter.validateQuery("DROP TABLE users", true)).toThrow(
          "Read-only mode: DROP statements are not allowed",
        );
      });

      it("should reject CREATE in read-only mode", () => {
        expect(() =>
          adapter.validateQuery("CREATE TABLE test (id int)", true),
        ).toThrow("Read-only mode: CREATE statements are not allowed");
      });

      it("should reject ALTER in read-only mode", () => {
        expect(() =>
          adapter.validateQuery(
            "ALTER TABLE users ADD COLUMN email text",
            true,
          ),
        ).toThrow("Read-only mode: ALTER statements are not allowed");
      });

      it("should reject TRUNCATE in read-only mode", () => {
        expect(() => adapter.validateQuery("TRUNCATE users", true)).toThrow(
          "Read-only mode: TRUNCATE statements are not allowed",
        );
      });

      it("should reject GRANT in read-only mode", () => {
        expect(() =>
          adapter.validateQuery("GRANT SELECT ON users TO reader", true),
        ).toThrow("Read-only mode: GRANT statements are not allowed");
      });

      it("should reject REVOKE in read-only mode", () => {
        expect(() =>
          adapter.validateQuery("REVOKE SELECT ON users FROM reader", true),
        ).toThrow("Read-only mode: REVOKE statements are not allowed");
      });

      it("should allow SELECT in read-only mode", () => {
        expect(() =>
          adapter.validateQuery("SELECT * FROM users", true),
        ).not.toThrow();
      });

      it("should allow EXPLAIN in read-only mode", () => {
        expect(() =>
          adapter.validateQuery("EXPLAIN SELECT * FROM users", true),
        ).not.toThrow();
      });
    });

    describe("input validation", () => {
      it("should throw for empty string", () => {
        expect(() => adapter.validateQuery("", false)).toThrow(
          "Query must be a non-empty string",
        );
      });

      it("should throw for non-string input", () => {
        expect(() =>
          adapter.validateQuery(null as unknown as string, false),
        ).toThrow("Query must be a non-empty string");
      });

      it("should throw for undefined input", () => {
        expect(() =>
          adapter.validateQuery(undefined as unknown as string, false),
        ).toThrow("Query must be a non-empty string");
      });
    });
  });

  describe("createContext", () => {
    it("should create context with timestamp", () => {
      const context = adapter.createContext();
      expect(context.timestamp).toBeInstanceOf(Date);
    });

    it("should create context with generated requestId", () => {
      const context = adapter.createContext();
      expect(context.requestId).toBeDefined();
      expect(typeof context.requestId).toBe("string");
      expect(context.requestId.length).toBeGreaterThan(0);
    });

    it("should use provided requestId", () => {
      const customId = "custom-request-123";
      const context = adapter.createContext(customId);
      expect(context.requestId).toBe(customId);
    });

    it("should generate unique requestIds for different calls", () => {
      const context1 = adapter.createContext();
      const context2 = adapter.createContext();
      expect(context1.requestId).not.toBe(context2.requestId);
    });
  });




  describe("registerTools", () => {
    it("should register only enabled tools", () => {
      const mockServer = {
        registerTool: vi.fn(),
      };

      const tools: ToolDefinition[] = [
        {
          name: "pg_query",
          description: "Execute query",
          group: "core",
          tags: ["query"],
          inputSchema: {},
          handler: vi.fn(),
        },
        {
          name: "pg_insert",
          description: "Insert data",
          group: "core",
          tags: ["insert"],
          inputSchema: {},
          handler: vi.fn(),
        },
      ];

      adapter.setMockTools(tools);
      const enabledTools = new Set(["pg_query"]);

      adapter.registerTools(
        mockServer as unknown as Parameters<typeof adapter.registerTools>[0],
        enabledTools,
      );

      // Should only register pg_query
      expect(mockServer.registerTool).toHaveBeenCalledTimes(1);
      expect(mockServer.registerTool.mock.calls[0]?.[0]).toBe("pg_query");
    });

    it("should register no tools if none are enabled", () => {
      const mockServer = {
        registerTool: vi.fn(),
      };

      adapter.setMockTools([
        {
          name: "pg_query",
          description: "test",
          group: "core",
          tags: [],
          inputSchema: {},
          handler: vi.fn(),
        },
      ]);

      adapter.registerTools(
        mockServer as unknown as Parameters<typeof adapter.registerTools>[0],
        new Set(),
      );

      expect(mockServer.registerTool).not.toHaveBeenCalled();
    });
  });

  describe("registerTool", () => {
    it("should register tool with correct name and description", () => {
      const mockServer = {
        registerTool: vi.fn(),
      };

      const tool: ToolDefinition = {
        name: "pg_test_tool",
        description: "A test tool",
        group: "core",
        tags: ["test"],
        inputSchema: {},
        handler: vi.fn(),
      };

      adapter.testRegisterTool(mockServer, tool);

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        "pg_test_tool",
        expect.objectContaining({
          description: "A test tool",
        }),
        expect.any(Function),
      );
    });

    it("should include annotations in metadata", () => {
      const mockServer = {
        registerTool: vi.fn(),
      };

      const tool: ToolDefinition = {
        name: "pg_read_tool",
        description: "A read-only tool",
        group: "core",
        tags: ["read"],
        inputSchema: {},
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
        },
        handler: vi.fn(),
      };

      adapter.testRegisterTool(mockServer, tool);

      const options = mockServer.registerTool.mock.calls[0]?.[1] as Record<
        string,
        unknown
      >;
      expect(options["annotations"]).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
      });
    });

    it("should include icons in metadata when present", () => {
      const mockServer = {
        registerTool: vi.fn(),
      };

      const tool: ToolDefinition = {
        name: "pg_icon_tool",
        description: "Tool with icons",
        group: "core",
        tags: [],
        inputSchema: {},
        icons: [
          { src: "data:image/svg+xml;base64,test", mimeType: "image/svg+xml" },
        ],
        handler: vi.fn(),
      };

      adapter.testRegisterTool(mockServer, tool);

      const options = mockServer.registerTool.mock.calls[0]?.[1] as Record<
        string,
        unknown
      >;
      expect(options["icons"]).toEqual([
        { src: "data:image/svg+xml;base64,test", mimeType: "image/svg+xml" },
      ]);
    });
  });

  describe("registerResources", () => {
    it("should register all resources", () => {
      const mockServer = {
        registerResource: vi.fn(),
      };

      const resources: ResourceDefinition[] = [
        {
          name: "schema",
          uri: "postgres://schema",
          description: "Schema info",
          handler: vi.fn(),
        },
        {
          name: "tables",
          uri: "postgres://tables",
          description: "Table list",
          handler: vi.fn(),
        },
      ];

      adapter.setMockResources(resources);
      adapter.registerResources(
        mockServer as unknown as Parameters<
          typeof adapter.registerResources
        >[0],
      );

      expect(mockServer.registerResource).toHaveBeenCalledTimes(2);
    });
  });

  describe("registerResource", () => {
    it("should register resource with correct name and URI", () => {
      const mockServer = {
        registerResource: vi.fn(),
      };

      const resource: ResourceDefinition = {
        name: "test_resource",
        uri: "postgres://test",
        description: "Test resource",
        handler: vi.fn(),
      };

      adapter.testRegisterResource(mockServer, resource);

      expect(mockServer.registerResource).toHaveBeenCalledWith(
        "test_resource",
        "postgres://test",
        expect.objectContaining({
          description: "Test resource",
          mimeType: "application/json",
        }),
        expect.any(Function),
      );
    });

    it("should use custom mimeType when provided", () => {
      const mockServer = {
        registerResource: vi.fn(),
      };

      const resource: ResourceDefinition = {
        name: "text_resource",
        uri: "postgres://text",
        description: "Text resource",
        mimeType: "text/plain",
        handler: vi.fn(),
      };

      adapter.testRegisterResource(mockServer, resource);

      const options = mockServer.registerResource.mock.calls[0]?.[2] as {
        mimeType: string;
      };
      expect(options.mimeType).toBe("text/plain");
    });
  });

  describe("registerPrompts", () => {
    it("should register all prompts", () => {
      const mockServer = {
        registerPrompt: vi.fn(),
      };

      const prompts: PromptDefinition[] = [
        { name: "prompt1", description: "Prompt 1", handler: vi.fn() },
        { name: "prompt2", description: "Prompt 2", handler: vi.fn() },
      ];

      adapter.setMockPrompts(prompts);
      adapter.registerPrompts(
        mockServer as unknown as Parameters<typeof adapter.registerPrompts>[0],
      );

      expect(mockServer.registerPrompt).toHaveBeenCalledTimes(2);
    });
  });

  describe("registerPrompt", () => {
    it("should register prompt with correct name and description", () => {
      const mockServer = {
        registerPrompt: vi.fn(),
      };

      const prompt: PromptDefinition = {
        name: "test_prompt",
        description: "A test prompt",
        handler: vi.fn(),
      };

      adapter.testRegisterPrompt(mockServer, prompt);

      expect(mockServer.registerPrompt).toHaveBeenCalledWith(
        "test_prompt",
        expect.objectContaining({ description: "A test prompt" }),
        expect.any(Function),
      );
    });

    it("should build Zod schema from prompt arguments", () => {
      const mockServer = {
        registerPrompt: vi.fn(),
      };

      const prompt: PromptDefinition = {
        name: "parameterized_prompt",
        description: "Prompt with args",
        arguments: [
          { name: "tableName", description: "Table name", required: true },
          { name: "limit", description: "Row limit", required: false },
        ],
        handler: vi.fn(),
      };

      adapter.testRegisterPrompt(mockServer, prompt);

      const options = mockServer.registerPrompt.mock.calls[0]?.[1] as Record<
        string,
        unknown
      >;
      const zodShape = options["argsSchema"] as Record<string, unknown>;
      expect(zodShape).toHaveProperty("tableName");
      expect(zodShape).toHaveProperty("limit");
    });

    it("should invoke prompt handler and return result as message", async () => {
      const mockServer = {
        registerPrompt: vi.fn(),
      };

      const mockHandler = vi
        .fn()
        .mockResolvedValue({ response: "test result" });
      const prompt: PromptDefinition = {
        name: "invoke_prompt",
        description: "Prompt to invoke",
        arguments: [{ name: "arg1", description: "Arg 1", required: true }],
        handler: mockHandler,
      };

      adapter.testRegisterPrompt(mockServer, prompt);

      // Get the handler that was passed to server.registerPrompt
      const registeredHandler = mockServer.registerPrompt.mock
        .calls[0]?.[2] as (args: Record<string, string>) => Promise<unknown>;
      const result = await registeredHandler({ arg1: "value1" });

      expect(mockHandler).toHaveBeenCalled();
      expect(result).toHaveProperty("messages");
    });

    it("should invoke prompt handler returning string result", async () => {
      const mockServer = {
        registerPrompt: vi.fn(),
      };

      const mockHandler = vi.fn().mockResolvedValue("plain string result");
      const prompt: PromptDefinition = {
        name: "string_prompt",
        description: "Prompt returning string",
        handler: mockHandler,
      };

      adapter.testRegisterPrompt(mockServer, prompt);

      const registeredHandler = mockServer.registerPrompt.mock
        .calls[0]?.[2] as (args: Record<string, string>) => Promise<unknown>;
      const result = await registeredHandler({});

      expect(result).toHaveProperty("messages");
      const messages = (
        result as { messages: Array<{ content: { text: string } }> }
      ).messages;
      expect(messages[0]?.content.text).toBe("plain string result");
    });
  });

  describe("handler invocation", () => {
    it("should invoke tool handler and JSON stringify object results", async () => {
      const mockServer = {
        registerTool: vi.fn(),
      };

      const mockHandler = vi
        .fn()
        .mockResolvedValue({ data: "test", count: 42 });
      const tool: ToolDefinition = {
        name: "pg_object_result",
        description: "Tool returning object",
        group: "core",
        tags: [],
        inputSchema: {},
        handler: mockHandler,
      };

      adapter.testRegisterTool(mockServer, tool);

      // Get the handler that was passed to server.registerTool (3rd argument)
      const registeredHandler = mockServer.registerTool.mock.calls[0]?.[2] as (
        params: unknown,
      ) => Promise<unknown>;
      const result = await registeredHandler({});

      expect(mockHandler).toHaveBeenCalled();
      expect(result).toHaveProperty("content");
      const content = (
        result as { content: Array<{ type: string; text: string }> }
      ).content;
      expect(content[0]?.type).toBe("text");
      expect(content[0]?.text).toContain('"data"');
      expect(content[0]?.text).toContain('"count"');
    });

    it("should invoke tool handler and return string results directly", async () => {
      const mockServer = {
        registerTool: vi.fn(),
      };

      const mockHandler = vi.fn().mockResolvedValue("plain text result");
      const tool: ToolDefinition = {
        name: "pg_string_result",
        description: "Tool returning string",
        group: "core",
        tags: [],
        inputSchema: {},
        handler: mockHandler,
      };

      adapter.testRegisterTool(mockServer, tool);

      const registeredHandler = mockServer.registerTool.mock.calls[0]?.[2] as (
        params: unknown,
      ) => Promise<unknown>;
      const result = await registeredHandler({});

      const content = (
        result as { content: Array<{ type: string; text: string }> }
      ).content;
      expect(content[0]?.text).toBe("plain text result");
    });

    it("should invoke resource handler and JSON stringify object results", async () => {
      const mockServer = {
        registerResource: vi.fn(),
      };

      const mockHandler = vi
        .fn()
        .mockResolvedValue({ tables: ["users", "orders"] });
      const resource: ResourceDefinition = {
        name: "object_resource",
        uri: "postgres://object",
        description: "Resource returning object",
        handler: mockHandler,
      };

      adapter.testRegisterResource(mockServer, resource);

      // Get the handler that was passed to registerResource (4th argument)
      const registeredHandler = mockServer.registerResource.mock
        .calls[0]?.[3] as (uri: URL) => Promise<unknown>;
      const result = await registeredHandler(new URL("postgres://object"));

      expect(mockHandler).toHaveBeenCalled();
      expect(result).toHaveProperty("contents");
      const contents = (result as { contents: Array<{ text: string }> })
        .contents;
      expect(contents[0]?.text).toContain('"tables"');
    });

    it("should invoke resource handler and return string results directly", async () => {
      const mockServer = {
        registerResource: vi.fn(),
      };

      const mockHandler = vi.fn().mockResolvedValue("plain resource text");
      const resource: ResourceDefinition = {
        name: "string_resource",
        uri: "postgres://string",
        description: "Resource returning string",
        handler: mockHandler,
      };

      adapter.testRegisterResource(mockServer, resource);

      const registeredHandler = mockServer.registerResource.mock
        .calls[0]?.[3] as (uri: URL) => Promise<unknown>;
      const result = await registeredHandler(new URL("postgres://string"));

      const contents = (result as { contents: Array<{ text: string }> })
        .contents;
      expect(contents[0]?.text).toBe("plain resource text");
    });
  });

  describe("OAuth scope enforcement", () => {
    it("should allow tool call when token has sufficient scope", async () => {
      const { runWithAuthContext } = await import("../../auth/auth-context.js");

      const mockServer = {
        registerTool: vi.fn(),
      };

      const mockHandler = vi.fn().mockResolvedValue("success");
      const tool: ToolDefinition = {
        name: "pg_read_query", // core group → requires "read" scope
        description: "Read query",
        group: "core",
        tags: [],
        inputSchema: {},
        handler: mockHandler,
      };

      adapter.testRegisterTool(mockServer, tool);

      const registeredHandler = mockServer.registerTool.mock.calls[0]?.[2] as (
        params: unknown,
        extra: unknown,
      ) => Promise<unknown>;

      // Run within auth context that has "read" scope
      const result = await runWithAuthContext(
        { authenticated: true, scopes: ["read"] },
        () => registeredHandler({}, {}),
      );

      expect(mockHandler).toHaveBeenCalled();
      const content = (
        result as { content: Array<{ text: string }>; isError?: boolean }
      ).content;
      expect(content[0]?.text).toBe("success");
    });

    it("should reject tool call when token has insufficient scope", async () => {
      const { runWithAuthContext } = await import("../../auth/auth-context.js");

      const mockServer = {
        registerTool: vi.fn(),
      };

      const mockHandler = vi.fn().mockResolvedValue("should not reach");
      const tool: ToolDefinition = {
        name: "pg_vacuum", // admin group → requires "admin" scope
        description: "Vacuum",
        group: "admin",
        tags: [],
        inputSchema: {},
        handler: mockHandler,
      };

      adapter.testRegisterTool(mockServer, tool);

      const registeredHandler = mockServer.registerTool.mock.calls[0]?.[2] as (
        params: unknown,
        extra: unknown,
      ) => Promise<unknown>;

      // Run within auth context that only has "read" scope
      const result = await runWithAuthContext(
        { authenticated: true, scopes: ["read"] },
        () => registeredHandler({}, {}),
      );

      expect(mockHandler).not.toHaveBeenCalled();
      const response = result as {
        content: Array<{ text: string }>;
        isError?: boolean;
      };
      expect(response.isError).toBe(true);
      expect(response.content[0]?.text).toContain("Insufficient scope");
    });

    it("should allow tool call when OAuth is not configured (no auth context)", async () => {
      const mockServer = {
        registerTool: vi.fn(),
      };

      const mockHandler = vi.fn().mockResolvedValue("no-auth-success");
      const tool: ToolDefinition = {
        name: "pg_vacuum", // admin group → requires "admin" scope
        description: "Vacuum",
        group: "admin",
        tags: [],
        inputSchema: {},
        handler: mockHandler,
      };

      adapter.testRegisterTool(mockServer, tool);

      const registeredHandler = mockServer.registerTool.mock.calls[0]?.[2] as (
        params: unknown,
        extra: unknown,
      ) => Promise<unknown>;

      // Call without any auth context (simulates stdio transport / no OAuth)
      const result = await registeredHandler({}, {});

      expect(mockHandler).toHaveBeenCalled();
      const content = (result as { content: Array<{ text: string }> }).content;
      expect(content[0]?.text).toBe("no-auth-success");
    });
  });
});
