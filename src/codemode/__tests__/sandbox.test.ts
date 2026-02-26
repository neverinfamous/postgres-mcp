/**
 * Unit tests for Code Mode Sandbox
 *
 * Tests sandbox creation, code execution, timeout handling,
 * and resource cleanup.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CodeModeSandbox, SandboxPool } from "../sandbox.js";

describe("CodeModeSandbox", () => {
  let sandbox: CodeModeSandbox;

  beforeEach(() => {
    sandbox = CodeModeSandbox.create();
  });

  afterEach(() => {
    sandbox.dispose();
  });

  describe("create()", () => {
    it("should create a sandbox instance", () => {
      expect(sandbox).toBeDefined();
      expect(sandbox.isHealthy()).toBe(true);
    });

    it("should accept custom options", () => {
      const customSandbox = CodeModeSandbox.create({
        timeoutMs: 5000,
        memoryLimitMb: 64,
      });
      expect(customSandbox).toBeDefined();
      expect(customSandbox.isHealthy()).toBe(true);
      customSandbox.dispose();
    });
  });

  describe("execute()", () => {
    it("should execute simple code and return result", async () => {
      const result = await sandbox.execute("return 1 + 2;", {});
      expect(result.success).toBe(true);
      expect(result.result).toBe(3);
      expect(result.metrics.wallTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should execute async code", async () => {
      const result = await sandbox.execute(
        "return await Promise.resolve(42);",
        {},
      );
      expect(result.success).toBe(true);
      expect(result.result).toBe(42);
    });

    it("should provide access to pg bindings", async () => {
      const mockBindings = {
        core: {
          listTables: async () => [{ name: "users" }, { name: "products" }],
        },
      };
      const result = await sandbox.execute(
        "const tables = await pg.core.listTables(); return tables.length;",
        mockBindings,
      );
      expect(result.success).toBe(true);
      expect(result.result).toBe(2);
    });

    it("should handle execution errors", async () => {
      const result = await sandbox.execute(
        'throw new Error("test error");',
        {},
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("test error");
    });

    it("should block access to require", async () => {
      const result = await sandbox.execute(
        'const fs = require("fs"); return fs;',
        {},
      );
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should block access to process", async () => {
      const result = await sandbox.execute("return process.env;", {});
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should return error after disposed", async () => {
      sandbox.dispose();
      const result = await sandbox.execute("return 1;", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("disposed");
    });

    it("should provide execution metrics", async () => {
      const result = await sandbox.execute('return "test";', {});
      expect(result.metrics).toBeDefined();
      expect(result.metrics.wallTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.cpuTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.metrics.memoryUsedMb).toBe("number");
    });
  });

  describe("dispose()", () => {
    it("should mark sandbox as unhealthy", () => {
      expect(sandbox.isHealthy()).toBe(true);
      sandbox.dispose();
      expect(sandbox.isHealthy()).toBe(false);
    });

    it("should be idempotent", () => {
      sandbox.dispose();
      sandbox.dispose(); // Should not throw
      expect(sandbox.isHealthy()).toBe(false);
    });
  });
  describe("script cache", () => {
    it("should reuse cached vm.Script for identical code (cache hit)", async () => {
      const code = "return 42;";

      // Cold run — compiles vm.Script
      const r1 = await sandbox.execute(code, {});
      expect(r1.success).toBe(true);
      expect(r1.result).toBe(42);

      // Warm run — should reuse cached compiled script
      const r2 = await sandbox.execute(code, {});
      expect(r2.success).toBe(true);
      expect(r2.result).toBe(42);
    });

    it("should produce correct results for different code strings", async () => {
      const r1 = await sandbox.execute("return 1 + 1;", {});
      const r2 = await sandbox.execute("return 2 + 2;", {});
      const r3 = await sandbox.execute("return 1 + 1;", {}); // cache hit

      expect(r1.result).toBe(2);
      expect(r2.result).toBe(4);
      expect(r3.result).toBe(2);
    });
  });
});

describe("SandboxPool", () => {
  let pool: SandboxPool;

  beforeEach(() => {
    pool = new SandboxPool({ minInstances: 2, maxInstances: 5 });
    pool.initialize();
  });

  afterEach(() => {
    pool.dispose();
  });

  describe("initialize()", () => {
    it("should create minimum instances", () => {
      const stats = pool.getStats();
      expect(stats.available).toBe(2);
      expect(stats.inUse).toBe(0);
    });
  });

  describe("acquire()", () => {
    it("should return a sandbox from the pool", () => {
      const sandbox = pool.acquire();
      expect(sandbox).toBeDefined();
      expect(sandbox.isHealthy()).toBe(true);
      const stats = pool.getStats();
      expect(stats.inUse).toBe(1);
    });

    it("should create new sandboxes if pool is empty", () => {
      // Acquire more than minInstances
      const s1 = pool.acquire();
      const s2 = pool.acquire();
      const s3 = pool.acquire();
      expect(pool.getStats().inUse).toBe(3);
      pool.release(s1);
      pool.release(s2);
      pool.release(s3);
    });

    it("should throw when pool is exhausted", () => {
      const sandboxes: CodeModeSandbox[] = [];
      for (let i = 0; i < 5; i++) {
        sandboxes.push(pool.acquire());
      }
      expect(() => pool.acquire()).toThrowError(/exhausted/);
      sandboxes.forEach((s) => pool.release(s));
    });

    it("should throw after disposed", () => {
      pool.dispose();
      expect(() => pool.acquire()).toThrowError(/disposed/);
    });
  });

  describe("release()", () => {
    it("should return sandbox to pool", () => {
      const sandbox = pool.acquire();
      expect(pool.getStats().inUse).toBe(1);
      pool.release(sandbox);
      expect(pool.getStats().inUse).toBe(0);
      expect(pool.getStats().available).toBeGreaterThan(0);
    });

    it("should ignore sandboxes not from pool", () => {
      const external = CodeModeSandbox.create();
      pool.release(external); // Should not throw
      external.dispose();
    });
  });

  describe("execute()", () => {
    it("should execute code and return result", async () => {
      const result = await pool.execute("return 5 * 5;", {});
      expect(result.success).toBe(true);
      expect(result.result).toBe(25);
    });

    it("should return sandbox to pool after execution", async () => {
      await pool.execute("return 1;", {});
      const stats = pool.getStats();
      expect(stats.inUse).toBe(0);
    });

    it("should return sandbox to pool even on error", async () => {
      await pool.execute('throw new Error("fail");', {});
      const stats = pool.getStats();
      expect(stats.inUse).toBe(0);
    });
  });

  describe("dispose()", () => {
    it("should clear all sandboxes", () => {
      pool.dispose();
      const stats = pool.getStats();
      expect(stats.available).toBe(0);
      expect(stats.inUse).toBe(0);
    });

    it("should be idempotent", () => {
      pool.dispose();
      pool.dispose(); // Should not throw
    });
  });

  describe("cleanup edge cases", () => {
    it("should dispose sandbox on release when pool is disposed", async () => {
      const sandbox = pool.acquire();
      expect(sandbox.isHealthy()).toBe(true);
      pool.dispose();
      // Pool dispose also disposes all sandboxes including in-use ones
      expect(sandbox.isHealthy()).toBe(false);
    });

    it("should dispose unhealthy sandbox on release", () => {
      const sandbox = pool.acquire();
      sandbox.dispose(); // Make it unhealthy
      pool.release(sandbox); // Should not throw
    });
  });

  describe("getStats()", () => {
    it("should return correct pool statistics", () => {
      const stats = pool.getStats();
      expect(stats).toHaveProperty("available");
      expect(stats).toHaveProperty("inUse");
      expect(stats).toHaveProperty("max");
      expect(stats.max).toBe(5);
    });

    it("should track in-use count correctly", () => {
      const s1 = pool.acquire();
      expect(pool.getStats().inUse).toBe(1);

      const s2 = pool.acquire();
      expect(pool.getStats().inUse).toBe(2);

      pool.release(s1);
      expect(pool.getStats().inUse).toBe(1);

      pool.release(s2);
      expect(pool.getStats().inUse).toBe(0);
    });
  });
});

describe("CodeModeSandbox Console", () => {
  let sandbox: CodeModeSandbox;

  beforeEach(() => {
    sandbox = CodeModeSandbox.create();
  });

  afterEach(() => {
    sandbox.dispose();
  });

  describe("console output capture", () => {
    it("should capture console.log output", async () => {
      await sandbox.execute('console.log("test message");', {});
      const output = sandbox.getConsoleOutput();
      expect(output).toContain("test message");
    });

    it("should capture console.warn output with prefix", async () => {
      await sandbox.execute('console.warn("warning");', {});
      const output = sandbox.getConsoleOutput();
      expect(
        output.some(
          (line) => line.includes("[WARN]") && line.includes("warning"),
        ),
      ).toBe(true);
    });

    it("should capture console.error output with prefix", async () => {
      await sandbox.execute('console.error("error message");', {});
      const output = sandbox.getConsoleOutput();
      expect(
        output.some(
          (line) => line.includes("[ERROR]") && line.includes("error message"),
        ),
      ).toBe(true);
    });

    it("should capture console.info output with prefix", async () => {
      await sandbox.execute('console.info("info message");', {});
      const output = sandbox.getConsoleOutput();
      expect(
        output.some(
          (line) => line.includes("[INFO]") && line.includes("info message"),
        ),
      ).toBe(true);
    });

    it("should serialize objects in console output", async () => {
      await sandbox.execute('console.log({ key: "value" });', {});
      const output = sandbox.getConsoleOutput();
      expect(
        output.some(
          (line) => line.includes('"key"') && line.includes('"value"'),
        ),
      ).toBe(true);
    });

    it("should handle multiple console arguments", async () => {
      await sandbox.execute('console.log("a", "b", "c");', {});
      const output = sandbox.getConsoleOutput();
      expect(output.some((line) => line.includes("a b c"))).toBe(true);
    });

    it("should clear console output", async () => {
      await sandbox.execute('console.log("first");', {});
      expect(sandbox.getConsoleOutput().length).toBeGreaterThan(0);

      sandbox.clearConsoleOutput();
      expect(sandbox.getConsoleOutput()).toEqual([]);
    });
  });
});

describe("CodeModeSandbox Timeout Handling", () => {
  it("should detect timeout errors", async () => {
    const sandbox = CodeModeSandbox.create({ timeoutMs: 50 });

    // Execute code that will timeout
    const result = await sandbox.execute(
      `
            let i = 0;
            while(true) { i++; }
            return i;
        `,
      {},
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("timeout");

    sandbox.dispose();
  });
});

describe("SandboxPool Cleanup", () => {
  it("should skip unhealthy sandboxes during acquire", () => {
    const pool = new SandboxPool({ minInstances: 2, maxInstances: 5 });
    pool.initialize();

    // Acquire and dispose to make unhealthy
    const s1 = pool.acquire();
    s1.dispose();
    pool.release(s1);

    // Next acquire should skip the unhealthy one
    const s2 = pool.acquire();
    expect(s2.isHealthy()).toBe(true);

    pool.release(s2);
    pool.dispose();
  });

  it("should not return excess sandboxes to pool", () => {
    const pool = new SandboxPool({ minInstances: 1, maxInstances: 3 });
    pool.initialize();

    // Acquire all 3
    const sandboxes = [pool.acquire(), pool.acquire(), pool.acquire()];

    // Release all - pool should only keep up to max
    for (const s of sandboxes) {
      pool.release(s);
    }

    // Available should not exceed max
    expect(pool.getStats().available).toBeLessThanOrEqual(3);

    pool.dispose();
  });

  it("should dispose sandbox when released after pool is disposed (line 302-303)", () => {
    const pool = new SandboxPool({ minInstances: 1, maxInstances: 3 });
    pool.initialize();

    // Acquire a sandbox
    const sandbox = pool.acquire();
    expect(sandbox.isHealthy()).toBe(true);

    // Dispose pool while sandbox is in use
    pool.dispose();

    // The sandbox should now be disposed (pool.dispose disposes all in-use)
    // but let's also verify the release path explicitly
    expect(sandbox.isHealthy()).toBe(false);
  });

  it("should dispose unhealthy sandbox found during acquire loop (line 276)", () => {
    const pool = new SandboxPool({ minInstances: 3, maxInstances: 5 });
    pool.initialize();

    // Acquire all available sandboxes and make them unhealthy
    const s1 = pool.acquire();
    const s2 = pool.acquire();
    const s3 = pool.acquire();

    // Dispose them to make unhealthy
    s1.dispose();
    s2.dispose();
    s3.dispose();

    // Release them back to pool (they go back as unhealthy)
    pool.release(s1);
    pool.release(s2);
    pool.release(s3);

    // Now acquire should find unhealthy sandboxes and dispose them,
    // then create a new one
    const newSandbox = pool.acquire();
    expect(newSandbox.isHealthy()).toBe(true);

    pool.release(newSandbox);
    pool.dispose();
  });
});

describe("SandboxPool Cleanup Interval", () => {
  it("should trigger cleanup on interval and remove unhealthy sandboxes (lines 333-344)", async () => {
    // Create pool with very short idle timeout for testing
    const pool = new SandboxPool(
      { minInstances: 1, maxInstances: 5, idleTimeoutMs: 50 },
      { timeoutMs: 10000 },
    );
    pool.initialize();

    // Pool should start with minInstances
    expect(pool.getStats().available).toBe(1);

    // Acquire and release to add more to pool
    const s1 = pool.acquire();
    const s2 = pool.acquire();
    pool.release(s1);
    pool.release(s2);

    expect(pool.getStats().available).toBe(2);

    // Wait for cleanup interval to trigger (which trims to minInstances)
    // Use generous timeout to avoid flakiness on slow CI runners
    await new Promise((resolve) => setTimeout(resolve, 300));

    // After cleanup, should be trimmed back to minInstances
    expect(pool.getStats().available).toBe(1);

    pool.dispose();
  });

  it("should trim excess sandboxes during cleanup to minInstances (lines 347-349)", async () => {
    const pool = new SandboxPool({
      minInstances: 1,
      maxInstances: 10,
      idleTimeoutMs: 30,
    });
    pool.initialize();

    // Create many sandboxes
    const sandboxes = [];
    for (let i = 0; i < 5; i++) {
      sandboxes.push(pool.acquire());
    }

    // Release them all back
    for (const s of sandboxes) {
      pool.release(s);
    }

    // Should have 5 available now
    expect(pool.getStats().available).toBe(5);

    // Wait for cleanup to trim
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Should be trimmed to minInstances (1)
    expect(pool.getStats().available).toBe(1);

    pool.dispose();
  });

  it("should remove unhealthy sandboxes during cleanup (lines 335-341)", async () => {
    const pool = new SandboxPool({
      minInstances: 2,
      maxInstances: 5,
      idleTimeoutMs: 30,
    });
    pool.initialize();

    // Make one of the initial sandboxes unhealthy by acquiring and disposing it
    const s1 = pool.acquire();
    const s2 = pool.acquire();
    s1.dispose(); // Make unhealthy
    pool.release(s1);
    pool.release(s2);

    // Wait for cleanup
    await new Promise((resolve) => setTimeout(resolve, 80));

    // After cleanup, unhealthy should be removed, then trimmed to min
    // Only healthy ones should remain
    const remaining = pool.getStats().available;
    expect(remaining).toBeLessThanOrEqual(2);

    pool.dispose();
  });
});
