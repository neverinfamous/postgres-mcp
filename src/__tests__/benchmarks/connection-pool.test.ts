/**
 * postgres-mcp - Connection Pool Performance Benchmarks
 *
 * Measures overhead of pool operations using mocked pg internals
 * to isolate framework cost from database latency.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run fn N times and return { p50, p95, p99, mean } in microseconds */
function benchmark(
  fn: () => void,
  iterations = 1000,
): { mean: number; p50: number; p95: number; p99: number } {
  const times: number[] = [];
  for (let i = 0; i < 10; i++) fn();
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

/** Run async fn N times and return { p50, p95, p99, mean } in µs */
async function benchmarkAsync(
  fn: () => Promise<void>,
  iterations = 500,
): Promise<{ mean: number; p50: number; p95: number; p99: number }> {
  const times: number[] = [];
  for (let i = 0; i < 5; i++) await fn();
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

// ---------------------------------------------------------------------------
// Mock pg.Pool using the same pattern as ConnectionPool.test.ts
// ---------------------------------------------------------------------------

const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
const mockPoolConnect = vi.fn();
const mockPoolQuery = vi.fn();
const mockPoolEnd = vi.fn();
const mockPoolOn = vi.fn();

vi.mock("pg", () => {
  const MockPool = function () {
    return {
      connect: mockPoolConnect,
      query: mockPoolQuery,
      end: mockPoolEnd,
      on: mockPoolOn,
      get totalCount() {
        return 5;
      },
      get idleCount() {
        return 3;
      },
      get waitingCount() {
        return 0;
      },
    };
  };
  return { default: { Pool: MockPool } };
});

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

// Import after mocking
import { ConnectionPool } from "../../pool/ConnectionPool.js";

describe("Connection Pool Benchmarks", () => {
  let pool: ConnectionPool;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup mock implementations
    mockClientQuery.mockResolvedValue({
      rows: [{ version: "PostgreSQL 18.1" }],
    });
    mockClientRelease.mockReturnValue(undefined);
    mockPoolConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    });
    mockPoolQuery.mockResolvedValue({
      rows: [{ version: "PostgreSQL 18.1", current_database: "testdb" }],
      rowCount: 1,
      command: "SELECT",
      fields: [],
    });
    mockPoolEnd.mockResolvedValue(undefined);

    pool = new ConnectionPool({
      host: "localhost",
      port: 5432,
      user: "test",
      password: "test",
      database: "testdb",
    });
    await pool.initialize();
  });

  afterEach(async () => {
    if (pool.isInitialized()) {
      await pool.shutdown();
    }
  });

  // -------------------------------------------------------------------------
  // 1. getStats() — called on every query, must be sub-microsecond
  // -------------------------------------------------------------------------
  it("getStats() overhead", () => {
    const result = benchmark(() => {
      pool.getStats();
    }, 10000);

    console.error(
      `[BENCH] getStats():  mean=${String(result.mean)}µs  p50=${String(result.p50)}µs  p95=${String(result.p95)}µs  p99=${String(result.p99)}µs`,
    );

    // getStats() does simple property reads + object spread; should be < 50µs
    expect(result.p95).toBeLessThan(100);
  });

  // -------------------------------------------------------------------------
  // 2. query() wrapper overhead — isolate pool.query from real pg
  // -------------------------------------------------------------------------
  it("query() framework overhead", async () => {
    const result = await benchmarkAsync(async () => {
      await pool.query("SELECT 1");
    }, 1000);

    console.error(
      `[BENCH] query():  mean=${String(result.mean)}µs  p50=${String(result.p50)}µs  p95=${String(result.p95)}µs  p99=${String(result.p99)}µs`,
    );

    // With mocked pg, this measures Date.now() overhead, stats mutation,
    // logging call, and promise plumbing. Should be < 500µs with mocks.
    expect(result.p95).toBeLessThan(1000);
  });

  // -------------------------------------------------------------------------
  // 3. getConnection() + releaseConnection() round trip
  // -------------------------------------------------------------------------
  it("getConnection/releaseConnection round trip", async () => {
    const result = await benchmarkAsync(async () => {
      const client = await pool.getConnection();
      pool.releaseConnection(client);
    }, 1000);

    console.error(
      `[BENCH] acquire/release:  mean=${String(result.mean)}µs  p50=${String(result.p50)}µs  p95=${String(result.p95)}µs  p99=${String(result.p99)}µs`,
    );

    // Acquire/release with mocked pool; measures stats mutation + error handling
    expect(result.p95).toBeLessThan(1000);
  });

  // -------------------------------------------------------------------------
  // 4. checkHealth() overhead (includes a mocked SELECT query)
  // -------------------------------------------------------------------------
  it("checkHealth() overhead", async () => {
    const result = await benchmarkAsync(async () => {
      await pool.checkHealth();
    }, 500);

    console.error(
      `[BENCH] checkHealth():  mean=${String(result.mean)}µs  p50=${String(result.p50)}µs  p95=${String(result.p95)}µs  p99=${String(result.p99)}µs`,
    );

    // checkHealth runs a query + constructs response object
    expect(result.p95).toBeLessThan(2000);
  });

  // -------------------------------------------------------------------------
  // 5. Stats mutation cost per-query (totalQueries increment)
  // -------------------------------------------------------------------------
  it("per-query stats mutation cost", async () => {
    const N = 5000;
    const start = performance.now();
    for (let i = 0; i < N; i++) {
      await pool.query("SELECT 1");
    }
    const totalMs = performance.now() - start;
    const perQueryUs = (totalMs / N) * 1000;

    console.error(
      `[BENCH] ${String(N)} queries in ${String(Math.round(totalMs))}ms  (${String(Math.round(perQueryUs * 100) / 100)}µs/query)`,
    );

    // Verify stats were tracked
    const stats = pool.getStats();
    expect(stats.totalQueries).toBe(N);
  });

  // -------------------------------------------------------------------------
  // 6. isInitialized() / isClosing() — micro-operations used in guards
  // -------------------------------------------------------------------------
  it("isInitialized() and isClosing() are near-zero cost", () => {
    const result = benchmark(() => {
      pool.isInitialized();
      pool.isClosing();
    }, 10000);

    console.error(
      `[BENCH] isInitialized+isClosing:  mean=${String(result.mean)}µs  p50=${String(result.p50)}µs  p95=${String(result.p95)}µs`,
    );

    expect(result.p95).toBeLessThan(50);
  });
});
