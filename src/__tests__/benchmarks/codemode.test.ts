/**
 * postgres-mcp - Code Mode Sandbox Performance Benchmarks
 *
 * Measures VM context creation, sandbox pool lifecycle, security
 * validation, and execution overhead.
 *
 * Run: npm test -- --grep="Code Mode Benchmarks"
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { CodeModeSandbox, SandboxPool } from "../../codemode/sandbox.js";
import { CodeModeSecurityManager } from "../../codemode/security.js";

// Suppress logger stderr output during benchmarks
vi.mock("../../utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    notice: vi.fn(),
    critical: vi.fn(),
    alert: vi.fn(),
    emergency: vi.fn(),
    setLevel: vi.fn(),
    setMcpServer: vi.fn(),
  },
}));

/** Run fn N times and return { p50, p95, p99, mean } in µs */
function benchmark(
  fn: () => void,
  iterations = 500,
): { mean: number; p50: number; p95: number; p99: number } {
  const times: number[] = [];
  // Extended warmup to stabilize JIT and reduce noise in µs-level measurements
  for (let i = 0; i < 20; i++) fn();
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push((performance.now() - start) * 1000);
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  return {
    mean: Math.round(mean * 100) / 100,
    p50: Math.round(times[Math.floor(times.length * 0.5)]! * 100) / 100,
    p95: Math.round(times[Math.floor(times.length * 0.95)]! * 100) / 100,
    p99: Math.round(times[Math.floor(times.length * 0.99)]! * 100) / 100,
  };
}

async function benchmarkAsync(
  fn: () => Promise<void>,
  iterations = 200,
): Promise<{ mean: number; p50: number; p95: number; p99: number }> {
  const times: number[] = [];
  for (let i = 0; i < 3; i++) await fn();
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push((performance.now() - start) * 1000);
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  return {
    mean: Math.round(mean * 100) / 100,
    p50: Math.round(times[Math.floor(times.length * 0.5)]! * 100) / 100,
    p95: Math.round(times[Math.floor(times.length * 0.95)]! * 100) / 100,
    p99: Math.round(times[Math.floor(times.length * 0.99)]! * 100) / 100,
  };
}

describe("Code Mode Benchmarks", () => {
  // -------------------------------------------------------------------------
  // 1. Sandbox creation cost (vm.createContext is the expensive call)
  // -------------------------------------------------------------------------
  describe("Sandbox Creation", () => {
    it("CodeModeSandbox.create() cold start", () => {
      const sandboxes: CodeModeSandbox[] = [];
      const result = benchmark(() => {
        sandboxes.push(CodeModeSandbox.create());
      }, 200);

      // Cleanup
      for (const s of sandboxes) s.dispose();

      console.error(
        `[BENCH] Sandbox.create():  mean=${String(result.mean)}µs  p50=${String(result.p50)}µs  p95=${String(result.p95)}µs  p99=${String(result.p99)}µs`,
      );

      // vm.createContext + sandbox object construction
      // Measured: ~1.5-6ms on Windows, ~0.5ms on Linux
      expect(result.p95).toBeLessThan(15000);
    });

    it("sandbox dispose() cost", () => {
      const sandbox = CodeModeSandbox.create();
      const result = benchmark(() => {
        // Test disposal is idempotent and fast
        sandbox.dispose();
      }, 1000);

      console.error(
        `[BENCH] Sandbox.dispose():  mean=${String(result.mean)}µs  p50=${String(result.p50)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(100);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Sandbox Pool lifecycle
  // -------------------------------------------------------------------------
  describe("SandboxPool Lifecycle", () => {
    let sandboxPool: SandboxPool;

    afterEach(() => {
      sandboxPool?.dispose();
    });

    it("pool initialization (minInstances=2)", () => {
      const result = benchmark(() => {
        const pool = new SandboxPool(
          { minInstances: 2, maxInstances: 10, idleTimeoutMs: 60000 },
          { timeoutMs: 30000, memoryLimitMb: 128, cpuLimitMs: 10000 },
        );
        pool.initialize();
        pool.dispose();
      }, 100);

      console.error(
        `[BENCH] SandboxPool.init(min=2):  mean=${String(result.mean)}µs  p50=${String(result.p50)}µs  p95=${String(result.p95)}µs`,
      );

      // Init creates 2 sandboxes + dispose; allow headroom for Windows
      expect(result.p95).toBeLessThan(25000);
    });

    it("acquire/release round trip", () => {
      sandboxPool = new SandboxPool(
        { minInstances: 2, maxInstances: 10, idleTimeoutMs: 60000 },
        { timeoutMs: 30000, memoryLimitMb: 128, cpuLimitMs: 10000 },
      );
      sandboxPool.initialize();

      const result = benchmark(() => {
        const sandbox = sandboxPool.acquire();
        sandboxPool.release(sandbox);
      }, 1000);

      console.error(
        `[BENCH] Pool acquire/release:  mean=${String(result.mean)}µs  p50=${String(result.p50)}µs  p95=${String(result.p95)}µs  p99=${String(result.p99)}µs`,
      );

      // Pop from array + Set.add/delete; should be < 20µs
      expect(result.p95).toBeLessThan(100);
    });

    it("getStats() overhead", () => {
      sandboxPool = new SandboxPool(
        { minInstances: 2, maxInstances: 10, idleTimeoutMs: 60000 },
        { timeoutMs: 30000, memoryLimitMb: 128, cpuLimitMs: 10000 },
      );
      sandboxPool.initialize();

      const result = benchmark(() => {
        sandboxPool.getStats();
      }, 5000);

      console.error(
        `[BENCH] Pool getStats():  mean=${String(result.mean)}µs  p50=${String(result.p50)}µs  p95=${String(result.p95)}µs`,
      );

      // Set.size reads; allow headroom for OS scheduling jitter
      expect(result.p95).toBeLessThan(100);
    });

    it("pool exhaustion behavior", () => {
      sandboxPool = new SandboxPool(
        { minInstances: 1, maxInstances: 3, idleTimeoutMs: 60000 },
        { timeoutMs: 30000, memoryLimitMb: 128, cpuLimitMs: 10000 },
      );
      sandboxPool.initialize();

      // Acquire all sandboxes
      const held: CodeModeSandbox[] = [];
      for (let i = 0; i < 3; i++) {
        held.push(sandboxPool.acquire());
      }

      // Next acquire should throw
      const start = performance.now();
      expect(() => sandboxPool.acquire()).toThrow("Sandbox pool exhausted");
      const exhaustionLatencyUs = (performance.now() - start) * 1000;

      console.error(
        `[BENCH] Pool exhaustion error latency: ${String(Math.round(exhaustionLatencyUs))}µs`,
      );

      // Cleanup
      for (const s of held) sandboxPool.release(s);

      // Error throw + stack trace construction + sandbox creation attempts
      // Measured: ~3-8ms on Windows
      expect(exhaustionLatencyUs).toBeLessThan(15000);
    });
  });

  // -------------------------------------------------------------------------
  // 3. VM execution overhead (sandbox.execute with trivial code)
  // -------------------------------------------------------------------------
  describe("Sandbox Execution", () => {
    it("trivial code execution overhead", async () => {
      const sandbox = CodeModeSandbox.create();
      const apiBindings = {}; // Empty bindings for overhead measurement

      const result = await benchmarkAsync(async () => {
        await sandbox.execute("return 42;", apiBindings);
      }, 30);

      sandbox.dispose();

      console.error(
        `[BENCH] execute("return 42"):  mean=${String(result.mean)}µs  p50=${String(result.p50)}µs  p95=${String(result.p95)}µs  p99=${String(result.p99)}µs`,
      );

      // vm.Script compile + runInContext + async IIFE + process.memoryUsage()
      // Measured: ~30-70ms on Windows (significant audit finding)
      expect(result.p95).toBeLessThan(200000);
    }, 30000);

    it("execution with API bindings", async () => {
      const sandbox = CodeModeSandbox.create();

      // Simulate realistic API bindings (20 groups with methods)
      const apiBindings: Record<string, Record<string, () => unknown>> = {};
      const groupNames = [
        "core",
        "transactions",
        "jsonb",
        "text",
        "performance",
        "admin",
        "monitoring",
        "backup",
        "schema",
        "partitioning",
        "stats",
        "vector",
        "postgis",
        "cron",
        "partman",
        "kcache",
        "citext",
        "ltree",
        "pgcrypto",
        "codemode",
      ];
      for (const group of groupNames) {
        apiBindings[group] = {
          readQuery: () => ({ rows: [], rowCount: 0 }),
          writeQuery: () => ({ rowsAffected: 0 }),
          help: () => [],
        };
      }

      const result = await benchmarkAsync(async () => {
        await sandbox.execute(
          "const result = pg.core.readQuery(); return result;",
          apiBindings,
        );
      }, 20);

      sandbox.dispose();

      console.error(
        `[BENCH] execute(with 20-group bindings):  mean=${String(result.mean)}µs  p50=${String(result.p50)}µs  p95=${String(result.p95)}µs`,
      );

      // VM script compile + context injection for 20 API groups
      // Measured: ~30-80ms on Windows (significant audit finding)
      expect(result.p95).toBeLessThan(200000);
    }, 30000);

    it("metrics calculation accuracy", async () => {
      const sandbox = CodeModeSandbox.create();

      // Execute code that takes measurable time
      const result = await sandbox.execute(
        "let sum = 0; for (let i = 0; i < 100000; i++) sum += i; return sum;",
        {},
      );

      sandbox.dispose();

      expect(result.success).toBe(true);
      expect(result.metrics.wallTimeMs).toBeGreaterThan(0);
      // cpuTimeMs is the same as wallTimeMs (approximation) — verify documented behavior
      expect(result.metrics.cpuTimeMs).toBe(result.metrics.wallTimeMs);

      console.error(
        `[BENCH] Metrics for 100K loop: wall=${String(result.metrics.wallTimeMs)}ms  mem=${String(result.metrics.memoryUsedMb)}MB`,
      );
    });

    it("console output capture overhead", async () => {
      const sandbox = CodeModeSandbox.create();

      const result = await benchmarkAsync(async () => {
        await sandbox.execute(
          'console.log("test output"); console.warn("warning");',
          {},
        );
        sandbox.clearConsoleOutput();
      }, 30);

      sandbox.dispose();

      console.error(
        `[BENCH] execute(console.log+warn):  mean=${String(result.mean)}µs  p50=${String(result.p50)}µs  p95=${String(result.p95)}µs`,
      );

      // VM execution + console buffer writes
      // Measured: ~30-70ms on Windows (significant audit finding)
      expect(result.p95).toBeLessThan(200000);
    }, 30000);
  });

  // -------------------------------------------------------------------------
  // 4. Security validation overhead
  // -------------------------------------------------------------------------
  describe("Security Validation", () => {
    const security = new CodeModeSecurityManager();

    it("validateCode() with safe short code", () => {
      const code = 'const result = await pg.core.readQuery("SELECT 1");';

      const result = benchmark(() => {
        security.validateCode(code);
      }, 5000);

      console.error(
        `[BENCH] validateCode(safe, 50 chars):  mean=${String(result.mean)}µs  p50=${String(result.p50)}µs  p95=${String(result.p95)}µs`,
      );

      // 14 regex tests on ~50 chars; should be < 20µs
      expect(result.p95).toBeLessThan(200);
    });

    it("validateCode() with safe large code (10KB)", () => {
      // Generate realistic-looking safe code
      const lines: string[] = [];
      for (let i = 0; i < 200; i++) {
        lines.push(
          `const result${String(i)} = await pg.core.readQuery("SELECT * FROM table${String(i)} LIMIT 10");`,
        );
      }
      const code = lines.join("\n");

      const result = benchmark(() => {
        security.validateCode(code);
      }, 1000);

      console.error(
        `[BENCH] validateCode(safe, ${String(code.length)} bytes):  mean=${String(result.mean)}µs  p50=${String(result.p50)}µs  p95=${String(result.p95)}µs`,
      );

      // 14 regex tests on ~10KB; allow headroom for Windows jitter
      expect(result.p95).toBeLessThan(1500);
    });

    it("validateCode() with blocked code (early rejection)", () => {
      const code = 'require("fs").readFileSync("/etc/passwd")';

      const result = benchmark(() => {
        security.validateCode(code);
      }, 5000);

      console.error(
        `[BENCH] validateCode(blocked, early reject):  mean=${String(result.mean)}µs  p50=${String(result.p50)}µs  p95=${String(result.p95)}µs`,
      );

      // First regex should match; should be < 10µs
      expect(result.p95).toBeLessThan(100);
    });

    it("checkRateLimit() throughput", () => {
      const secManager = new CodeModeSecurityManager({
        maxExecutionsPerMinute: 10000,
      });

      const result = benchmark(() => {
        secManager.checkRateLimit("client-1");
      }, 5000);

      console.error(
        `[BENCH] checkRateLimit():  mean=${String(result.mean)}µs  p50=${String(result.p50)}µs  p95=${String(result.p95)}µs`,
      );

      // Map.get + Date.now() + increment; should be < 5µs
      expect(result.p95).toBeLessThan(100);
    });

    it("sanitizeResult() with varying sizes", () => {
      const small = { users: [{ id: 1, name: "test" }] };
      const medium = {
        data: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          name: `user_${String(i)}`,
          email: `user${String(i)}@example.com`,
        })),
      };

      const smallResult = benchmark(() => {
        security.sanitizeResult(small);
      }, 3000);

      const mediumResult = benchmark(() => {
        security.sanitizeResult(medium);
      }, 1000);

      console.error(
        `[BENCH] sanitizeResult(small):  mean=${String(smallResult.mean)}µs  p95=${String(smallResult.p95)}µs`,
      );
      console.error(
        `[BENCH] sanitizeResult(100 rows):  mean=${String(mediumResult.mean)}µs  p95=${String(mediumResult.p95)}µs`,
      );

      expect(smallResult.p95).toBeLessThan(100);
      expect(mediumResult.p95).toBeLessThan(5000);
    });
  });
});
