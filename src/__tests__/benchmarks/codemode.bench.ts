/**
 * postgres-mcp - Code Mode Sandbox Performance Benchmarks
 *
 * Measures VM context creation, sandbox pool lifecycle, security
 * validation, and execution overhead using vitest bench (tinybench).
 *
 * Run: npm run bench
 */

import { describe, bench, beforeEach, afterEach, vi } from "vitest";
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

// ---------------------------------------------------------------------------
// 1. Sandbox Creation
// ---------------------------------------------------------------------------
describe("Sandbox Creation", () => {
  bench(
    "CodeModeSandbox.create() cold start",
    () => {
      const sandbox = CodeModeSandbox.create();
      sandbox.dispose();
    },
    { iterations: 200, warmupIterations: 5 },
  );

  bench(
    "sandbox dispose() (idempotent)",
    () => {
      const sandbox = CodeModeSandbox.create();
      sandbox.dispose();
      sandbox.dispose(); // Idempotent call
    },
    { iterations: 200, warmupIterations: 5 },
  );
});

// ---------------------------------------------------------------------------
// 2. Sandbox Pool Lifecycle
// ---------------------------------------------------------------------------
describe("SandboxPool Lifecycle", () => {
  bench(
    "pool initialization (minInstances=2)",
    () => {
      const pool = new SandboxPool(
        { minInstances: 2, maxInstances: 10, idleTimeoutMs: 60000 },
        { timeoutMs: 30000, memoryLimitMb: 128, cpuLimitMs: 10000 },
      );
      pool.initialize();
      pool.dispose();
    },
    { iterations: 100, warmupIterations: 3 },
  );

  let sandboxPool: SandboxPool;

  describe("pool operations", () => {
    beforeEach(() => {
      sandboxPool = new SandboxPool(
        { minInstances: 2, maxInstances: 10, idleTimeoutMs: 60000 },
        { timeoutMs: 30000, memoryLimitMb: 128, cpuLimitMs: 10000 },
      );
      sandboxPool.initialize();
    });

    afterEach(() => {
      sandboxPool?.dispose();
    });

    bench(
      "acquire/release round trip",
      () => {
        const sandbox = sandboxPool.acquire();
        sandboxPool.release(sandbox);
      },
      { iterations: 1000, warmupIterations: 10 },
    );

    bench(
      "getStats() overhead",
      () => {
        sandboxPool.getStats();
      },
      { iterations: 5000, warmupIterations: 20 },
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Sandbox Execution
// ---------------------------------------------------------------------------
describe("Sandbox Execution", () => {
  let sandbox: CodeModeSandbox;

  beforeEach(() => {
    sandbox = CodeModeSandbox.create();
  });

  afterEach(() => {
    sandbox?.dispose();
  });

  bench(
    'trivial code execution ("return 42")',
    async () => {
      await sandbox.execute("return 42;", {});
    },
    { iterations: 100, warmupIterations: 10, time: 5000 },
  );

  bench(
    "execution with 20-group API bindings",
    async () => {
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
      await sandbox.execute(
        "const result = pg.core.readQuery(); return result;",
        apiBindings,
      );
    },
    { iterations: 100, warmupIterations: 10, time: 5000 },
  );

  bench(
    "console output capture",
    async () => {
      await sandbox.execute(
        'console.log("test output"); console.warn("warning");',
        {},
      );
      sandbox.clearConsoleOutput();
    },
    { iterations: 100, warmupIterations: 10, time: 5000 },
  );
});

// ---------------------------------------------------------------------------
// 4. Security Validation
// ---------------------------------------------------------------------------
describe("Security Validation", () => {
  const security = new CodeModeSecurityManager();

  bench(
    "validateCode() safe short code (50 chars)",
    () => {
      security.validateCode(
        'const result = await pg.core.readQuery("SELECT 1");',
      );
    },
    { iterations: 5000, warmupIterations: 50 },
  );

  bench(
    "validateCode() safe large code (10KB)",
    () => {
      const lines: string[] = [];
      for (let i = 0; i < 200; i++) {
        lines.push(
          `const result${String(i)} = await pg.core.readQuery("SELECT * FROM table${String(i)} LIMIT 10");`,
        );
      }
      security.validateCode(lines.join("\n"));
    },
    { iterations: 1000, warmupIterations: 10 },
  );

  bench(
    "validateCode() blocked code (early rejection)",
    () => {
      security.validateCode('require("fs").readFileSync("/etc/passwd")');
    },
    { iterations: 5000, warmupIterations: 50 },
  );

  bench(
    "checkRateLimit() throughput",
    () => {
      const secManager = new CodeModeSecurityManager({
        maxExecutionsPerMinute: 10000,
      });
      secManager.checkRateLimit("client-1");
    },
    { iterations: 5000, warmupIterations: 50 },
  );

  bench(
    "sanitizeResult() small payload",
    () => {
      security.sanitizeResult({ users: [{ id: 1, name: "test" }] });
    },
    { iterations: 3000, warmupIterations: 30 },
  );

  bench(
    "sanitizeResult() medium payload (100 rows)",
    () => {
      const medium = {
        data: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          name: `user_${String(i)}`,
          email: `user${String(i)}@example.com`,
        })),
      };
      security.sanitizeResult(medium);
    },
    { iterations: 1000, warmupIterations: 10 },
  );
});
