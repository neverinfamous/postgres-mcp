/**
 * postgres-mcp - Logger & Sanitization Performance Benchmarks
 *
 * Measures the overhead of Enterprise Security Level 4 logging:
 * sanitizeMessage(), sanitizeStack(), sanitizeContext(), writeToStderr(),
 * and high-frequency log call throughput.
 *
 * Note: Logger methods (sanitize*) are private, so we benchmark
 * through the public Logger API. We create a fresh Logger instance
 * and intercept console.error to measure overhead without I/O noise.
 *
 * Run: npm run bench
 */

import { describe, bench, vi, beforeAll } from "vitest";

// We need to NOT mock the logger here — we want to benchmark the real Logger.
// Instead, suppress console.error output to avoid noise.
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = vi.fn();
  return () => {
    console.error = originalConsoleError;
  };
});

// Import the real logger
import { logger } from "../../utils/logger.js";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const shortMessage = "Query executed successfully";
const longMessage = "A".repeat(1000);
const controlCharMessage =
  "Normal text\x00with\x01control\x02chars\x03and\ttabs\nand\nnewlines\x7Fand\x1Bescapes";
const stackTrace = `Error: Connection refused
    at ConnectionPool.connect (c:\\postgres-mcp\\src\\pool\\ConnectionPool.ts:45:11)
    at async DatabaseAdapter.query (c:\\postgres-mcp\\src\\adapters\\postgresql\\DatabaseAdapter.ts:123:5)
    at async Object.handler (c:\\postgres-mcp\\src\\adapters\\postgresql\\tools\\core.ts:89:20)
    at async McpServer.handleToolCall (c:\\postgres-mcp\\node_modules\\@modelcontextprotocol\\sdk\\server.js:234:12)
    at async processTicksAndRejections (node:internal/process/task_queues:95:5)`;

const simpleContext = {
  module: "ADAPTER" as const,
  operation: "readQuery",
  entityId: "users",
};

const sensitiveContext = {
  module: "AUTH" as const,
  code: "AUTH_TOKEN_INVALID",
  operation: "validateToken",
  token: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9",
  password: "super_secret_password",
  client_secret: "oauth-client-secret-value",
  issuer: "http://localhost:8080/realms/postgres-mcp",
  audience: "postgres-mcp-client",
  jwks_uri: "http://localhost:8080/certs",
  bearer_format: "JWT",
  nested: {
    api_key: "nested-secret-key-123",
    normalField: "visible",
    deep: {
      access_token: "deeply-nested-token",
      safeValue: 42,
    },
  },
};

const nestedContext = {
  module: "QUERY" as const,
  operation: "batchInsert",
  entityId: "products",
  details: {
    rowCount: 100,
    schema: "public",
    table: "products",
    metadata: {
      duration: 234,
      plan: "INSERT",
    },
  },
};

// ---------------------------------------------------------------------------
// 1. Log Call Overhead (includes all sanitization)
// ---------------------------------------------------------------------------
describe("Log Call Overhead", () => {
  // Set to info level so debug calls are filtered pre-sanitization
  logger.setLevel("info");

  bench(
    "logger.info(short message, no context)",
    () => {
      logger.info(shortMessage);
    },
    { iterations: 5000, warmupIterations: 50 },
  );

  bench(
    "logger.info(short message, simple context)",
    () => {
      logger.info(shortMessage, simpleContext);
    },
    { iterations: 5000, warmupIterations: 50 },
  );

  bench(
    "logger.info(long message — 1KB)",
    () => {
      logger.info(longMessage);
    },
    { iterations: 3000, warmupIterations: 30 },
  );

  bench(
    "logger.debug(filtered — below minLevel)",
    () => {
      logger.debug("This message should be filtered before sanitization");
    },
    { iterations: 50000, warmupIterations: 500 },
  );
});

// ---------------------------------------------------------------------------
// 2. Message Sanitization (exercised through logger.info)
// ---------------------------------------------------------------------------
describe("Message Sanitization", () => {
  bench(
    "message with control characters",
    () => {
      logger.info(controlCharMessage);
    },
    { iterations: 3000, warmupIterations: 30 },
  );

  bench(
    'message with no special chars ("clean" path)',
    () => {
      logger.info("Clean message without any special characters at all");
    },
    { iterations: 5000, warmupIterations: 50 },
  );
});

// ---------------------------------------------------------------------------
// 3. Stack Trace Processing (exercised through logger.error)
// ---------------------------------------------------------------------------
describe("Stack Trace Processing", () => {
  bench(
    "logger.error(with stack trace)",
    () => {
      logger.error("Connection failed", {
        module: "POOL",
        code: "PG_CONNECT_FAILED",
        stack: stackTrace,
      });
    },
    { iterations: 2000, warmupIterations: 20 },
  );

  bench(
    "logger.error(without stack trace)",
    () => {
      logger.error("Generic error", {
        module: "ADAPTER",
        code: "QUERY_FAILED",
      });
    },
    { iterations: 3000, warmupIterations: 30 },
  );
});

// ---------------------------------------------------------------------------
// 4. Sensitive Data Redaction
// ---------------------------------------------------------------------------
describe("Sensitive Data Redaction", () => {
  bench(
    "context with 8+ sensitive fields (deep nested)",
    () => {
      logger.info("Auth operation", sensitiveContext);
    },
    { iterations: 1000, warmupIterations: 10 },
  );

  bench(
    "context with nested safe objects",
    () => {
      logger.info("Batch operation", nestedContext);
    },
    { iterations: 3000, warmupIterations: 30 },
  );
});

// ---------------------------------------------------------------------------
// 5. High-Frequency Logging
// ---------------------------------------------------------------------------
describe("High-Frequency Logging", () => {
  bench(
    "100 sequential log calls",
    () => {
      for (let i = 0; i < 100; i++) {
        logger.info(`Processing item ${String(i)}`, {
          module: "TOOLS",
          operation: "batchProcess",
          entityId: `item-${String(i)}`,
        });
      }
    },
    { iterations: 100, warmupIterations: 5 },
  );

  bench(
    "100 filtered debug calls (no-op path)",
    () => {
      for (let i = 0; i < 100; i++) {
        logger.debug(`Debug item ${String(i)}`);
      }
    },
    { iterations: 5000, warmupIterations: 50 },
  );
});
