/**
 * postgres-mcp - Zod Schema Parsing Performance Benchmarks
 *
 * Measures the hot path of input schema parsing for every tool call.
 * Covers simple schemas, complex schemas with transforms, alias
 * resolution, large payloads, and validation failure rejection speed.
 *
 * Run: npm run bench
 */

import { describe, bench, vi } from "vitest";
import { z } from "zod";
import {
  ReadQuerySchema,
  ReadQuerySchemaBase,
  WriteQuerySchema,
  CreateTableSchema,
  CreateTableSchemaBase,
  DescribeTableSchema,
  ListTablesSchema,
  CreateIndexSchema,
  BeginTransactionSchema,
  TransactionExecuteSchema,
} from "../../adapters/postgresql/schemas/core/index.js";

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
// Test payloads
// ---------------------------------------------------------------------------
const simpleReadPayload = {
  sql: "SELECT * FROM users WHERE id = $1",
  params: [1],
};
const aliasedReadPayload = { query: "SELECT 1", txId: "abc-123" };
const simpleWritePayload = {
  sql: "INSERT INTO users (name, email) VALUES ($1, $2)",
  params: ["Alice", "alice@example.com"],
};

const describePayload = { tableName: "users" };
const describeSchemaPayload = { table: "public.users" };

const createTablePayload = {
  table: "test_bench_table",
  schema: "public",
  columns: [
    { name: "id", type: "SERIAL", primaryKey: true },
    { name: "name", type: "VARCHAR(100)", notNull: true },
    { name: "email", type: "VARCHAR(255)", unique: true },
    { name: "created_at", type: "TIMESTAMP", default: "now()" },
    { name: "status", type: "VARCHAR(20)", default: "active" },
    {
      name: "user_id",
      type: "INTEGER",
      references: { table: "users", column: "id", onDelete: "CASCADE" },
    },
  ],
  ifNotExists: true,
};

const createIndexPayload = {
  table: "users",
  columns: ["email", "status"],
  unique: true,
  type: "btree" as const,
  concurrently: true,
};

const transactionExecutePayload = {
  statements: [
    { sql: "INSERT INTO users (name) VALUES ($1)", params: ["Bob"] },
    { sql: "INSERT INTO orders (user_id) VALUES ($1)", params: [1] },
    {
      sql: "UPDATE users SET order_count = order_count + 1 WHERE id = $1",
      params: [1],
    },
  ],
  isolationLevel: "SERIALIZABLE" as const,
};

// Large batch payload (100 rows)
const largeBatchRows = Array.from({ length: 100 }, (_, i) => ({
  sql: `INSERT INTO products (name, price) VALUES ($1, $2)`,
  params: [`Product ${String(i)}`, (Math.random() * 100).toFixed(2)],
}));

// ---------------------------------------------------------------------------
// 1. Simple Schema Parsing
// ---------------------------------------------------------------------------
describe("Simple Schema Parsing", () => {
  bench(
    "ReadQuerySchema.parse(simple)",
    () => {
      ReadQuerySchema.parse(simpleReadPayload);
    },
    { iterations: 5000, warmupIterations: 100 },
  );

  bench(
    "ReadQuerySchema.parse(aliased — query + txId)",
    () => {
      ReadQuerySchema.parse(aliasedReadPayload);
    },
    { iterations: 5000, warmupIterations: 50 },
  );

  bench(
    "WriteQuerySchema.parse(simple)",
    () => {
      WriteQuerySchema.parse(simpleWritePayload);
    },
    { iterations: 5000, warmupIterations: 50 },
  );

  bench(
    "ListTablesSchema.parse(undefined → defaultToEmpty)",
    () => {
      ListTablesSchema.parse(undefined);
    },
    { iterations: 5000, warmupIterations: 50 },
  );

  bench(
    "BeginTransactionSchema.parse(shorthand)",
    () => {
      BeginTransactionSchema.parse({ isolationLevel: "rr" });
    },
    { iterations: 5000, warmupIterations: 50 },
  );
});

// ---------------------------------------------------------------------------
// 2. Complex Schema Parsing (transforms + preprocess)
// ---------------------------------------------------------------------------
describe("Complex Schema Parsing", () => {
  bench(
    "DescribeTableSchema.parse(alias)",
    () => {
      DescribeTableSchema.parse(describePayload);
    },
    { iterations: 3000, warmupIterations: 30 },
  );

  bench(
    "DescribeTableSchema.parse(schema.table split)",
    () => {
      DescribeTableSchema.parse(describeSchemaPayload);
    },
    { iterations: 3000, warmupIterations: 30 },
  );

  bench(
    "CreateTableSchema.parse(6 columns + FK + defaults)",
    () => {
      CreateTableSchema.parse(createTablePayload);
    },
    { iterations: 1000, warmupIterations: 50 },
  );

  bench(
    "CreateIndexSchema.parse(with auto-name generation)",
    () => {
      CreateIndexSchema.parse(createIndexPayload);
    },
    { iterations: 3000, warmupIterations: 30 },
  );

  bench(
    "TransactionExecuteSchema.parse(3 statements)",
    () => {
      TransactionExecuteSchema.parse(transactionExecutePayload);
    },
    { iterations: 2000, warmupIterations: 50 },
  );
});

// ---------------------------------------------------------------------------
// 3. Large Payload Parsing
// ---------------------------------------------------------------------------
describe("Large Payload Parsing", () => {
  bench(
    "TransactionExecuteSchema.parse(100 statements)",
    () => {
      TransactionExecuteSchema.parse({ statements: largeBatchRows });
    },
    { iterations: 200, warmupIterations: 20 },
  );
});

// ---------------------------------------------------------------------------
// 4. Validation Failure (Rejection Speed)
// ---------------------------------------------------------------------------
describe("Validation Failure Paths", () => {
  bench(
    "ReadQuerySchema.parse(missing sql — safeParse)",
    () => {
      ReadQuerySchema.safeParse({});
    },
    { iterations: 5000, warmupIterations: 50 },
  );

  bench(
    "CreateTableSchema.parse(empty columns — safeParse)",
    () => {
      CreateTableSchema.safeParse({ table: "test", columns: [] });
    },
    { iterations: 3000, warmupIterations: 30 },
  );

  bench(
    "CreateIndexSchema.parse(missing all required — safeParse)",
    () => {
      CreateIndexSchema.safeParse({});
    },
    { iterations: 3000, warmupIterations: 30 },
  );

  bench(
    "WriteQuerySchema.parse(wrong param types — safeParse)",
    () => {
      WriteQuerySchema.safeParse({ sql: 123, params: "not-an-array" });
    },
    { iterations: 3000, warmupIterations: 30 },
  );
});

// ---------------------------------------------------------------------------
// 5. JSON Schema Conversion (Registration-time)
// ---------------------------------------------------------------------------
describe("JSON Schema Conversion", () => {
  // zodToJsonSchema is used at tool registration time, not per-call
  // but its speed affects server startup time
  bench(
    "ReadQuerySchemaBase → zodToJsonSchema",
    () => {
      // Simulate what registration does: convert Zod schema to JSON Schema
      // This is the MCP-visible schema (Base variant)
      const shape = ReadQuerySchemaBase.shape;
      const keys = Object.keys(shape);
      // Build a minimal JSON Schema representation
      const properties: Record<string, { type: string; description?: string }> =
        {};
      for (const key of keys) {
        properties[key] = { type: "string" };
      }
      void JSON.stringify({
        type: "object",
        properties,
        required: [],
      });
    },
    { iterations: 5000, warmupIterations: 50 },
  );

  bench(
    "CreateTableSchemaBase → zodToJsonSchema",
    () => {
      const shape = CreateTableSchemaBase.shape;
      const keys = Object.keys(shape);
      const properties: Record<string, { type: string; description?: string }> =
        {};
      for (const key of keys) {
        properties[key] = { type: "string" };
      }
      void JSON.stringify({
        type: "object",
        properties,
        required: [],
      });
    },
    { iterations: 3000, warmupIterations: 30 },
  );
});

// ---------------------------------------------------------------------------
// 6. Raw Zod Overhead Baseline
// ---------------------------------------------------------------------------
describe("Raw Zod Overhead Baseline", () => {
  const trivialSchema = z.object({ x: z.number() });
  const mediumSchema = z.object({
    a: z.string(),
    b: z.number(),
    c: z.boolean().optional(),
    d: z.array(z.string()).optional(),
    e: z.object({ f: z.string(), g: z.number() }).optional(),
  });

  bench(
    "trivial z.object({x: z.number()}).parse()",
    () => {
      trivialSchema.parse({ x: 42 });
    },
    { iterations: 10000, warmupIterations: 100 },
  );

  bench(
    "medium schema (5 fields, nested object)",
    () => {
      mediumSchema.parse({
        a: "hello",
        b: 42,
        c: true,
        d: ["a", "b"],
        e: { f: "nested", g: 1 },
      });
    },
    { iterations: 5000, warmupIterations: 50 },
  );
});
