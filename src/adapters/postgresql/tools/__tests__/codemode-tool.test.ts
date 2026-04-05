/**
 * Unit tests for Code Mode Tool (pg_execute_code)
 *
 * Tests the tool handler, initialization, and cleanup functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createExecuteCodeTool,
  getCodeModeTools,
  cleanupCodeMode,
} from "../codemode/index.js";
import type { PostgresAdapter } from "../../postgres-adapter.js";

// Shared mock instances — controllable per-test
const mockPoolInstance = {
  initialize: vi.fn(),
  execute: vi.fn().mockResolvedValue({
    success: true,
    result: { test: "result" },
    metrics: { wallTimeMs: 10, cpuTimeMs: 8, memoryUsedMb: 1 },
  }),
  dispose: vi.fn(),
  getStats: vi.fn().mockReturnValue({ available: 5, inUse: 0, max: 5 }),
};

const mockSecurityInstance = {
  validateCode: vi.fn().mockReturnValue({ valid: true, errors: [] }),
  checkRateLimit: vi.fn().mockReturnValue(true),
  sanitizeResult: vi.fn((result: unknown) => result),
  createExecutionRecord: vi.fn().mockReturnValue({}),
  auditLog: vi.fn(),
};

const mockCreatePgApi = vi.fn().mockReturnValue({
  createSandboxBindings: vi
    .fn()
    .mockReturnValue({ core: { listTables: () => [] } }),
});

// Mock the dependencies using shared instances
vi.mock("../../../codemode/sandbox.js", () => ({
  CodeModeSandbox: {},
  SandboxPool: vi.fn().mockImplementation(() => mockPoolInstance),
}));

vi.mock("../../../codemode/security.js", () => ({
  CodeModeSecurityManager: vi
    .fn()
    .mockImplementation(() => mockSecurityInstance),
}));

vi.mock("../../../codemode/api.js", () => ({
  createPgApi: mockCreatePgApi,
}));

vi.mock("../../../utils/icons.js", () => ({
  getToolIcons: vi.fn().mockReturnValue([]),
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

/**
 * Create a mock PostgresAdapter for testing
 */
function createMockAdapter(): Partial<PostgresAdapter> {
  return {
    type: "postgresql" as const,
    name: "PostgreSQL Adapter",
    version: "0.1.0",
    executeQuery: vi
      .fn()
      .mockResolvedValue({ rows: [], rowsAffected: 0, executionTimeMs: 1 }),
    executeReadQuery: vi
      .fn()
      .mockResolvedValue({ rows: [], rowsAffected: 0, executionTimeMs: 1 }),
    executeWriteQuery: vi
      .fn()
      .mockResolvedValue({ rows: [], rowsAffected: 0, executionTimeMs: 1 }),
    getToolDefinitions: vi.fn().mockReturnValue([]),
    getAuditInterceptor: vi.fn().mockReturnValue(null),
    // Transaction cleanup for code mode error recovery
    getActiveTransactionIds: vi.fn().mockReturnValue([]),
    cleanupTransaction: vi.fn().mockResolvedValue(false),
  };
}

describe("Code Mode Tool", () => {
  let mockAdapter: Partial<PostgresAdapter>;

  beforeEach(() => {
    mockAdapter = createMockAdapter();
    // Clear any existing singleton state
    cleanupCodeMode();
    vi.clearAllMocks();

    // Restore default mock behaviors
    mockPoolInstance.execute.mockResolvedValue({
      success: true,
      result: { test: "result" },
      metrics: { wallTimeMs: 10, cpuTimeMs: 8, memoryUsedMb: 1 },
    });
    mockSecurityInstance.validateCode.mockReturnValue({
      valid: true,
      errors: [],
    });
    mockSecurityInstance.checkRateLimit.mockReturnValue(true);
    mockCreatePgApi.mockReturnValue({
      createSandboxBindings: vi
        .fn()
        .mockReturnValue({ core: { listTables: () => [] } }),
    });
  });

  afterEach(() => {
    cleanupCodeMode();
  });

  describe("createExecuteCodeTool", () => {
    it("should return a valid tool definition", () => {
      const tool = createExecuteCodeTool(mockAdapter as PostgresAdapter);
      expect(tool).toBeDefined();
      expect(tool.name).toBe("pg_execute_code");
    });

    it("should have correct tool group", () => {
      const tool = createExecuteCodeTool(mockAdapter as PostgresAdapter);
      expect(tool.group).toBe("codemode");
    });

    it("should have correct tags", () => {
      const tool = createExecuteCodeTool(mockAdapter as PostgresAdapter);
      expect(tool.tags).toContain("code");
      expect(tool.tags).toContain("execute");
      expect(tool.tags).toContain("sandbox");
    });

    it("should require admin scope", () => {
      const tool = createExecuteCodeTool(mockAdapter as PostgresAdapter);
      expect(tool.requiredScopes).toContain("admin");
    });

    it("should have destructive annotation", () => {
      const tool = createExecuteCodeTool(mockAdapter as PostgresAdapter);
      expect(tool.annotations?.destructiveHint).toBe(true);
    });

    it("should have readOnlyHint as false", () => {
      const tool = createExecuteCodeTool(mockAdapter as PostgresAdapter);
      expect(tool.annotations?.readOnlyHint).toBe(false);
    });

    it("should have description mentioning pg.* API", () => {
      const tool = createExecuteCodeTool(mockAdapter as PostgresAdapter);
      expect(tool.description).toContain("pg.*");
    });

    it("should include input schema", () => {
      const tool = createExecuteCodeTool(mockAdapter as PostgresAdapter);
      expect(tool.inputSchema).toBeDefined();
    });
  });

  describe("getCodeModeTools", () => {
    it("should return array containing pg_execute_code", () => {
      const tools = getCodeModeTools(mockAdapter as PostgresAdapter);
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.some((t) => t.name === "pg_execute_code")).toBe(true);
    });

    it("should return exactly one tool", () => {
      const tools = getCodeModeTools(mockAdapter as PostgresAdapter);
      expect(tools.length).toBe(1);
    });
  });

  describe("cleanupCodeMode", () => {
    it("should dispose pool when called", () => {
      // Initialize by creating a tool and calling handler
      const tool = createExecuteCodeTool(mockAdapter as PostgresAdapter);
      expect(tool).toBeDefined();

      // Cleanup should not throw
      expect(() => cleanupCodeMode()).not.toThrow();
    });

    it("should be idempotent", () => {
      cleanupCodeMode();
      cleanupCodeMode();
      // No error means success
    });

    it("should allow re-initialization after cleanup", () => {
      const tool1 = createExecuteCodeTool(mockAdapter as PostgresAdapter);
      cleanupCodeMode();
      const tool2 = createExecuteCodeTool(mockAdapter as PostgresAdapter);
      expect(tool1.name).toBe(tool2.name);
    });
  });

  describe("tool handler", () => {
    it("should have a handler function", () => {
      const tool = createExecuteCodeTool(mockAdapter as PostgresAdapter);
      expect(typeof tool.handler).toBe("function");
    });

    it("should execute valid code successfully", async () => {
      const tool = createExecuteCodeTool(mockAdapter as PostgresAdapter);
      const result = await tool.handler(
        { code: "return 1 + 1" },
        { timestamp: new Date(), requestId: "test" },
      );

      expect(result).toHaveProperty("success");
    });

    it("should include hint in successful response", async () => {
      const tool = createExecuteCodeTool(mockAdapter as PostgresAdapter);
      const result = (await tool.handler(
        { code: "return 42" },
        { timestamp: new Date(), requestId: "test" },
      )) as { hint: string };

      expect(result.hint).toContain("pg.help()");
    });

    it("should return error when code validation fails", async () => {
      mockSecurityInstance.validateCode.mockReturnValueOnce({
        valid: false,
        errors: ["Forbidden import detected", "eval() is not allowed"],
      });

      const tool = createExecuteCodeTool(mockAdapter as PostgresAdapter);
      const result = (await tool.handler(
        { code: "import fs from 'fs'; eval('bad')" },
        { timestamp: new Date(), requestId: "test" },
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("Code validation failed");
    });

    it("should cleanup orphaned transactions on execution failure", async () => {
      const getActiveIds = mockAdapter.getActiveTransactionIds as ReturnType<
        typeof vi.fn
      >;
      // Before execution: no active transactions
      getActiveIds.mockReturnValueOnce([]);
      // After failed execution: orphaned transactions
      getActiveIds.mockReturnValueOnce(["tx-orphan-1", "tx-orphan-2"]);

      mockPoolInstance.execute.mockResolvedValueOnce({
        success: false,
        error: "Runtime error",
        metrics: { wallTimeMs: 5, cpuTimeMs: 3, memoryUsedMb: 0.5 },
      });

      const tool = createExecuteCodeTool(mockAdapter as PostgresAdapter);
      const result = (await tool.handler(
        { code: "throw new Error('fail')" },
        { timestamp: new Date(), requestId: "test" },
      )) as { success: boolean };

      expect(result.success).toBe(false);
      expect(mockAdapter.cleanupTransaction).toHaveBeenCalledWith(
        "tx-orphan-1",
      );
      expect(mockAdapter.cleanupTransaction).toHaveBeenCalledWith(
        "tx-orphan-2",
      );
    });

    it("should not cleanup transactions on successful execution", async () => {
      const tool = createExecuteCodeTool(mockAdapter as PostgresAdapter);
      await tool.handler(
        { code: "return 1" },
        { timestamp: new Date(), requestId: "test" },
      );

      expect(mockAdapter.cleanupTransaction).not.toHaveBeenCalled();
    });

    it("should include metrics.tokenEstimate alongside existing metrics fields", async () => {
      // Uses the default mock: { success: true, result: { test: "result" },
      //   metrics: { wallTimeMs: 10, cpuTimeMs: 8, memoryUsedMb: 1 } }
      const tool = createExecuteCodeTool(mockAdapter as PostgresAdapter);
      const result = (await tool.handler(
        { code: "return { rows: [1, 2, 3] }" },
        { timestamp: new Date(), requestId: "test" },
      )) as {
        success: boolean;
        metrics?: {
          wallTimeMs: number;
          cpuTimeMs: number;
          memoryUsedMb: number;
          tokenEstimate?: number;
        };
      };

      expect(result.success).toBe(true);
      expect(result.metrics).toBeDefined();
      // tokenEstimate is injected by the handler into the metrics object
      expect(typeof result.metrics?.tokenEstimate).toBe("number");
      expect(result.metrics!.tokenEstimate!).toBeGreaterThan(0);
      // Original metrics fields are preserved alongside tokenEstimate
      expect(typeof result.metrics?.wallTimeMs).toBe("number");
      expect(typeof result.metrics?.cpuTimeMs).toBe("number");
    });
  });
});
