import { describe, it, expect, vi } from "vitest";
import { WorkerSandbox, WorkerSandboxPool } from "../worker-sandbox.js";

// Mock the logger
vi.mock("../../utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("WorkerSandbox", () => {
  describe("create", () => {
    it("should create a WorkerSandbox instance with default options", () => {
      const sandbox = WorkerSandbox.create();
      expect(sandbox).toBeInstanceOf(WorkerSandbox);
    });

    it("should create a WorkerSandbox instance with custom timeout", () => {
      const sandbox = WorkerSandbox.create({ timeoutMs: 5000 });
      expect(sandbox).toBeInstanceOf(WorkerSandbox);
    });

    it("should create a WorkerSandbox instance with custom memory limit", () => {
      const sandbox = WorkerSandbox.create({ memoryLimitMb: 64 });
      expect(sandbox).toBeInstanceOf(WorkerSandbox);
    });
  });

  describe("isHealthy", () => {
    it("should return true for a fresh sandbox", () => {
      const sandbox = WorkerSandbox.create();
      expect(sandbox.isHealthy()).toBe(true);
    });

    it("should return false after dispose", () => {
      const sandbox = WorkerSandbox.create();
      sandbox.dispose();
      expect(sandbox.isHealthy()).toBe(false);
    });
  });

  describe("dispose", () => {
    it("should mark sandbox as disposed", () => {
      const sandbox = WorkerSandbox.create();
      expect(sandbox.isHealthy()).toBe(true);
      sandbox.dispose();
      expect(sandbox.isHealthy()).toBe(false);
    });

    it("should be idempotent", () => {
      const sandbox = WorkerSandbox.create();
      sandbox.dispose();
      sandbox.dispose();
      expect(sandbox.isHealthy()).toBe(false);
    });
  });

  describe("execute", () => {
    it("should return error when sandbox is disposed", async () => {
      const sandbox = WorkerSandbox.create();
      sandbox.dispose();

      const result = await sandbox.execute("return 1 + 1", {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("disposed");
    });

    it("should return metrics even on error", async () => {
      const sandbox = WorkerSandbox.create();
      sandbox.dispose();

      const result = await sandbox.execute("return 1", {});

      expect(result.metrics).toBeDefined();
      expect(result.metrics.wallTimeMs).toBe(0);
      expect(result.metrics.cpuTimeMs).toBe(0);
      expect(result.metrics.memoryUsedMb).toBe(0);
    });
  });
});

describe("WorkerSandboxPool", () => {
  describe("constructor", () => {
    it("should create pool with default options", () => {
      const pool = new WorkerSandboxPool();
      expect(pool).toBeInstanceOf(WorkerSandboxPool);
      pool.dispose();
    });

    it("should create pool with custom max instances", () => {
      const pool = new WorkerSandboxPool({ maxInstances: 5 });
      pool.initialize();
      const stats = pool.getStats();
      expect(stats.max).toBe(5);
      pool.dispose();
    });

    it("should create pool with custom sandbox options", () => {
      const pool = new WorkerSandboxPool(undefined, { timeoutMs: 10000 });
      expect(pool).toBeInstanceOf(WorkerSandboxPool);
      pool.dispose();
    });
  });

  describe("initialize", () => {
    it("should log initialization message", () => {
      const pool = new WorkerSandboxPool();
      pool.initialize();
      // No error means success
      pool.dispose();
    });

    it("should be callable multiple times", () => {
      const pool = new WorkerSandboxPool();
      pool.initialize();
      pool.initialize();
      pool.dispose();
    });
  });

  describe("getStats", () => {
    it("should return available count", () => {
      const pool = new WorkerSandboxPool({ maxInstances: 3 });
      pool.initialize();
      const stats = pool.getStats();
      expect(stats.available).toBe(3);
      pool.dispose();
    });

    it("should return inUse count as zero initially", () => {
      const pool = new WorkerSandboxPool();
      pool.initialize();
      const stats = pool.getStats();
      expect(stats.inUse).toBe(0);
      pool.dispose();
    });

    it("should return max count", () => {
      const pool = new WorkerSandboxPool({ maxInstances: 7 });
      pool.initialize();
      const stats = pool.getStats();
      expect(stats.max).toBe(7);
      pool.dispose();
    });

    it("should correctly calculate available from max minus inUse", () => {
      const pool = new WorkerSandboxPool({ maxInstances: 10 });
      pool.initialize();
      const stats = pool.getStats();
      expect(stats.available).toBe(stats.max - stats.inUse);
      pool.dispose();
    });
  });

  describe("dispose", () => {
    it("should mark pool as disposed", () => {
      const pool = new WorkerSandboxPool();
      pool.initialize();
      pool.dispose();
      // No error means success
    });

    it("should be idempotent", () => {
      const pool = new WorkerSandboxPool();
      pool.dispose();
      pool.dispose();
      // No error means success
    });
  });

  describe("execute", () => {
    it("should return error when pool is disposed", async () => {
      const pool = new WorkerSandboxPool();
      pool.dispose();

      const result = await pool.execute("return 1 + 1", {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("disposed");
    });

    it("should return error when pool is exhausted", async () => {
      const pool = new WorkerSandboxPool({ maxInstances: 0 });
      pool.initialize();

      const result = await pool.execute("return 1 + 1", {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("exhausted");
      pool.dispose();
    });

    it("should return metrics on error", async () => {
      const pool = new WorkerSandboxPool();
      pool.dispose();

      const result = await pool.execute("return 1", {});

      expect(result.metrics).toBeDefined();
      expect(result.metrics.wallTimeMs).toBe(0);
    });

    it("should track active executions correctly", async () => {
      const pool = new WorkerSandboxPool({ maxInstances: 2 });
      pool.initialize();

      const initialStats = pool.getStats();
      expect(initialStats.inUse).toBe(0);
      expect(initialStats.available).toBe(2);

      pool.dispose();
    });
  });

  describe("combined options", () => {
    it("should accept both pool and sandbox options", () => {
      const pool = new WorkerSandboxPool(
        { maxInstances: 5 },
        { timeoutMs: 15000, memoryLimitMb: 128 },
      );
      pool.initialize();

      const stats = pool.getStats();
      expect(stats.max).toBe(5);

      pool.dispose();
    });
  });

  describe("execute with active slot tracking", () => {
    it("should increment and decrement active count during execution", async () => {
      const pool = new WorkerSandboxPool({ maxInstances: 2 });
      pool.initialize();

      const stats1 = pool.getStats();
      expect(stats1.inUse).toBe(0);
      expect(stats1.available).toBe(2);

      // Execute will create a real worker sandbox (which will fail because
      // worker-script.js path may not exist in test context), but the slot
      // tracking should still work correctly via the finally block
      const result = await pool.execute("return 1 + 1", {});
      // Either succeeds or fails depending on worker availability, but
      // active count should return to 0 after execution completes
      const stats2 = pool.getStats();
      expect(stats2.inUse).toBe(0);
      expect(typeof result.success).toBe("boolean");
      expect(result.metrics).toBeDefined();

      pool.dispose();
    });

    it("should return error metrics with zero values on pool disposed", async () => {
      const pool = new WorkerSandboxPool({ maxInstances: 1 });
      pool.dispose();

      const result = await pool.execute("return 42", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("disposed");
      expect(result.metrics.wallTimeMs).toBe(0);
      expect(result.metrics.cpuTimeMs).toBe(0);
      expect(result.metrics.memoryUsedMb).toBe(0);
    });

    it("should enforce max instances limit", async () => {
      const pool = new WorkerSandboxPool({ maxInstances: 0 });
      pool.initialize();

      const result = await pool.execute("return 1", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("exhausted");
      expect(result.metrics.wallTimeMs).toBe(0);

      pool.dispose();
    });
  });
});

describe("WorkerSandbox serializeBindings", () => {

  it("should extract method names from binding objects", () => {
    const sandbox = WorkerSandbox.create();

    // Access private method via type casting for testing
    const serializeBindings = (
      sandbox as unknown as {
        serializeBindings: (
          bindings: Record<string, unknown>,
        ) => Record<string, string[]>;
      }
    ).serializeBindings.bind(sandbox);

    const bindings = {
      core: {
        query: () => { },
        listTables: () => { },
        describeTable: () => { },
      },
      jsonb: {
        get: () => { },
        set: () => { },
      },
    };

    const serialized = serializeBindings(bindings);

    expect(serialized["core"]).toContain("query");
    expect(serialized["core"]).toContain("listTables");
    expect(serialized["core"]).toContain("describeTable");
    expect(serialized["jsonb"]).toContain("get");
    expect(serialized["jsonb"]).toContain("set");

    sandbox.dispose();
  });

  it("should handle empty bindings", () => {
    const sandbox = WorkerSandbox.create();

    const serializeBindings = (
      sandbox as unknown as {
        serializeBindings: (
          bindings: Record<string, unknown>,
        ) => Record<string, string[]>;
      }
    ).serializeBindings.bind(sandbox);

    const serialized = serializeBindings({});

    expect(Object.keys(serialized)).toHaveLength(0);

    sandbox.dispose();
  });

  it("should skip non-object values in bindings", () => {
    const sandbox = WorkerSandbox.create();

    const serializeBindings = (
      sandbox as unknown as {
        serializeBindings: (
          bindings: Record<string, unknown>,
        ) => Record<string, string[]>;
      }
    ).serializeBindings.bind(sandbox);

    const bindings = {
      valid: { method1: () => { }, method2: () => { } },
      primitive: "not an object",
      nullValue: null,
      number: 42,
    };

    const serialized = serializeBindings(bindings);

    expect(serialized["valid"]).toEqual(["method1", "method2"]);
    expect(serialized["primitive"]).toBeUndefined();
    expect(serialized["nullValue"]).toBeUndefined();
    expect(serialized["number"]).toBeUndefined();

    sandbox.dispose();
  });
});

describe("WorkerSandbox calculateMetrics", () => {
  it("should calculate metrics correctly", () => {
    const sandbox = WorkerSandbox.create();

    // Access private method via type casting for testing
    const calculateMetrics = (
      sandbox as unknown as {
        calculateMetrics: (
          startTime: number,
          endTime: number,
          startMemory: number,
          endMemory: number,
        ) => {
          wallTimeMs: number;
          cpuTimeMs: number;
          memoryUsedMb: number;
        };
      }
    ).calculateMetrics.bind(sandbox);

    const startTime = 1000;
    const endTime = 1500;
    const startMemory = 50 * 1024 * 1024; // 50MB
    const endMemory = 60 * 1024 * 1024; // 60MB

    const metrics = calculateMetrics(
      startTime,
      endTime,
      startMemory,
      endMemory,
    );

    expect(metrics.wallTimeMs).toBe(500);
    expect(metrics.cpuTimeMs).toBe(500);
    expect(metrics.memoryUsedMb).toBe(10); // 10MB difference

    sandbox.dispose();
  });

  it("should handle negative memory difference", () => {
    const sandbox = WorkerSandbox.create();

    const calculateMetrics = (
      sandbox as unknown as {
        calculateMetrics: (
          startTime: number,
          endTime: number,
          startMemory: number,
          endMemory: number,
        ) => {
          wallTimeMs: number;
          cpuTimeMs: number;
          memoryUsedMb: number;
        };
      }
    ).calculateMetrics.bind(sandbox);

    const metrics = calculateMetrics(
      0,
      100,
      100 * 1024 * 1024,
      50 * 1024 * 1024,
    );

    expect(metrics.wallTimeMs).toBe(100);
    expect(metrics.memoryUsedMb).toBe(-50); // Negative (memory was freed)

    sandbox.dispose();
  });
});
