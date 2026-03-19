/**
 * postgres-mcp - Connection Pool Performance Benchmarks
 *
 * Measures overhead of pool operations using mocked pg internals
 * to isolate framework cost from database latency.
 *
 * Run: npm run bench
 */

import { describe, bench, beforeEach, afterEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock pg.Pool
// ---------------------------------------------------------------------------

const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
const mockPoolConnect = vi.fn();
const mockPoolQuery = vi.fn();
const mockPoolEnd = vi.fn();
const mockPoolOn = vi.fn();

vi.mock("pg", () => {
  const MockPool = function (): Record<string, unknown> {
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
import { ConnectionPool } from "../../pool/connection-pool.js";

describe("Connection Pool Benchmarks", () => {
  let pool: ConnectionPool;

  beforeEach(async () => {
    vi.clearAllMocks();

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
  bench(
    "getStats() overhead",
    () => {
      pool.getStats();
    },
    { iterations: 10000, warmupIterations: 100 },
  );

  // -------------------------------------------------------------------------
  // 2. query() wrapper overhead — isolate pool.query from real pg
  // -------------------------------------------------------------------------
  bench(
    "query() framework overhead",
    async () => {
      await pool.query("SELECT 1");
    },
    { iterations: 5000, warmupIterations: 50 },
  );

  // -------------------------------------------------------------------------
  // 3. getConnection() + releaseConnection() round trip
  // -------------------------------------------------------------------------
  bench(
    "getConnection/releaseConnection round trip",
    async () => {
      const client = await pool.getConnection();
      pool.releaseConnection(client);
    },
    { iterations: 5000, warmupIterations: 50 },
  );

  // -------------------------------------------------------------------------
  // 4. checkHealth() overhead (includes a mocked SELECT query)
  // -------------------------------------------------------------------------
  bench(
    "checkHealth() overhead",
    async () => {
      await pool.checkHealth();
    },
    { iterations: 2000, warmupIterations: 30 },
  );

  // -------------------------------------------------------------------------
  // 5. isInitialized() / isClosing() — micro-operations used in guards
  // -------------------------------------------------------------------------
  bench(
    "isInitialized + isClosing guards",
    () => {
      pool.isInitialized();
      pool.isClosing();
    },
    { iterations: 10000, warmupIterations: 100 },
  );
});
