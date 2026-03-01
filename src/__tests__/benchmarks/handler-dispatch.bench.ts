/**
 * postgres-mcp - Handler Dispatch Performance Benchmarks
 *
 * Measures the framework overhead between MCP request receipt and
 * handler function invocation: tool lookup, error construction,
 * and progress notification overhead.
 *
 * Run: npm run bench
 */

import { describe, bench, vi } from "vitest";
import type { ToolDefinition } from "../../types/index.js";

// Suppress logger output
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
// Simulated Tool Registry (Map-based lookup, same pattern as DatabaseAdapter)
// ---------------------------------------------------------------------------
const toolRegistry = new Map<string, ToolDefinition>();
const toolNames = [
  "pg_read_query",
  "pg_write_query",
  "pg_list_tables",
  "pg_describe_table",
  "pg_create_table",
  "pg_drop_table",
  "pg_create_index",
  "pg_get_indexes",
  "pg_upsert",
  "pg_count",
  "pg_exists",
  "pg_batch_insert",
  "pg_truncate",
  "pg_jsonb_extract",
  "pg_jsonb_set",
  "pg_jsonb_merge",
  "pg_jsonb_array_append",
  "pg_vec_search",
  "pg_vec_upsert",
  "pg_distance",
  "pg_spatial_relate",
  "pg_execute_code",
  "pg_transaction_begin",
  "pg_transaction_commit",
  "pg_transaction_rollback",
  "pg_explain_analyze",
  "pg_stat_statements",
  "pg_analyze_db_health",
];

for (const name of toolNames) {
  toolRegistry.set(name, {
    name,
    description: `Tool ${name}`,
    group: "core",
    inputSchema: { type: "object", properties: {} },
    handler: () => Promise.resolve({ content: [{ type: "text" as const, text: "ok" }] }),
  });
}

// ---------------------------------------------------------------------------
// Simulated Handler Map (Map<string, Function>)
// ---------------------------------------------------------------------------
const handlerMap = new Map<string, () => unknown>();
for (const name of toolNames) {
  handlerMap.set(name, () => ({
    content: [{ type: "text", text: JSON.stringify({ success: true }) }],
  }));
}

// ---------------------------------------------------------------------------
// 1. Tool Lookup by Name
// ---------------------------------------------------------------------------
describe("Tool Lookup by Name", () => {
  bench(
    "Map.get() single — pg_read_query",
    () => {
      handlerMap.get("pg_read_query");
    },
    { iterations: 50000, warmupIterations: 500 },
  );

  bench(
    "Map.get() x28 tools (full registry scan)",
    () => {
      for (const name of toolNames) {
        handlerMap.get(name);
      }
    },
    { iterations: 10000, warmupIterations: 100 },
  );

  bench(
    "Map.has() unknown tool",
    () => {
      handlerMap.has("pg_nonexistent_tool");
    },
    { iterations: 50000, warmupIterations: 500 },
  );

  bench(
    "toolRegistry.get() → definition access",
    () => {
      const def = toolRegistry.get("pg_read_query");
      if (def) {
        void def.name;
        void def.group;
        void def.inputSchema;
      }
    },
    { iterations: 30000, warmupIterations: 300 },
  );
});

// ---------------------------------------------------------------------------
// 2. Error Response Construction (P154)
// ---------------------------------------------------------------------------
describe("Error Response Construction", () => {
  bench(
    "P154 structured error (simple)",
    () => {
      const error = {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Table not found: nonexistent_table",
              code: "OBJECT_NOT_FOUND",
            }),
          },
        ],
      };
      void error;
    },
    { iterations: 10000, warmupIterations: 100 },
  );

  bench(
    "P154 structured error (with context)",
    () => {
      const error = {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Failed to execute query",
              code: "QUERY_EXECUTION_FAILED",
              details: {
                sql: "SELECT * FROM missing_table",
                pgCode: "42P01",
                pgMessage: 'relation "missing_table" does not exist',
                hint: "Check the table name and schema",
              },
            }),
          },
        ],
      };
      void error;
    },
    { iterations: 5000, warmupIterations: 50 },
  );

  bench(
    "Error.message extraction + stack flattening",
    () => {
      try {
        throw new Error("Test error for benchmarking");
      } catch (e) {
        const err = e as Error;
        const flat = (err.stack ?? "").replace(/\n/g, " → ");
        void flat;
      }
    },
    { iterations: 5000, warmupIterations: 50 },
  );
});

// ---------------------------------------------------------------------------
// 3. Progress Notification Overhead
// ---------------------------------------------------------------------------
describe("Progress Notification Overhead", () => {
  bench(
    "construct progress payload",
    () => {
      const progress = {
        progressToken: "token-123",
        progress: 42,
        total: 100,
        message: "Processing row 42 of 100",
      };
      void JSON.stringify(progress);
    },
    { iterations: 10000, warmupIterations: 100 },
  );

  bench(
    "10 incremental progress updates",
    () => {
      for (let i = 0; i < 10; i++) {
        void JSON.stringify({
          progressToken: "token-123",
          progress: i * 10,
          total: 100,
          message: `Step ${String(i + 1)} of 10`,
        });
      }
    },
    { iterations: 5000, warmupIterations: 50 },
  );
});

// ---------------------------------------------------------------------------
// 4. Full Handler Wrapper Pipeline (Simulated)
// ---------------------------------------------------------------------------
describe("Handler Wrapper Pipeline", () => {
  bench(
    "lookup → handler → serialize (sync simulation)",
    () => {
      // Simulates the hot path: tool lookup + handler call + response serialization
      const handler = handlerMap.get("pg_read_query");
      if (handler) {
        const result = handler();
        void JSON.stringify(result);
      }
    },
    { iterations: 10000, warmupIterations: 100 },
  );

  bench(
    "tool definition list generation (Array.from registry)",
    () => {
      const definitions = Array.from(toolRegistry.values()).map((def) => ({
        name: def.name,
        description: def.description,
        inputSchema: def.inputSchema,
      }));
      void definitions.length;
    },
    { iterations: 3000, warmupIterations: 30 },
  );
});
