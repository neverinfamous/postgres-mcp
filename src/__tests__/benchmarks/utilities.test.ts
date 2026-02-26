/**
 * postgres-mcp - Utility Functions Performance Benchmarks
 *
 * Measures overhead of hot-path utilities: identifier sanitization,
 * WHERE clause validation, logger formatting, and SQL query validation.
 *
 * Run: npm test -- --grep="Utility Benchmarks"
 */

import { describe, it, expect, vi } from "vitest";
import {
  validateIdentifier,
  sanitizeIdentifier,
  quoteIdentifier,
  sanitizeTableName,
  createColumnList,
  needsQuoting,
  generateIndexName,
} from "../../utils/identifiers.js";
import {
  validateWhereClause,
  sanitizeWhereClause,
} from "../../utils/where-clause.js";
import { validateCode } from "./bench-helpers.js";

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

function benchmark(
  fn: () => void,
  iterations = 2000,
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

describe("Utility Benchmarks", () => {
  // -------------------------------------------------------------------------
  // 1. Identifier sanitization — called on every tool that touches table/column names
  // -------------------------------------------------------------------------
  describe("Identifier Sanitization", () => {
    it("validateIdentifier() simple name", () => {
      const result = benchmark(() => {
        validateIdentifier("users");
      }, 10000);

      console.error(
        `[BENCH] validateIdentifier("users"):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      // One regex test + length check; should be < 5µs
      expect(result.p95).toBeLessThan(20);
    });

    it("sanitizeIdentifier() with quoting", () => {
      const result = benchmark(() => {
        sanitizeIdentifier("user_profiles");
      }, 10000);

      console.error(
        `[BENCH] sanitizeIdentifier("user_profiles"):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(20);
    });

    it("quoteIdentifier() reserved keyword", () => {
      const result = benchmark(() => {
        quoteIdentifier("outer");
      }, 10000);

      console.error(
        `[BENCH] quoteIdentifier("outer"):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(20);
    });

    it("sanitizeTableName() schema-qualified", () => {
      const result = benchmark(() => {
        sanitizeTableName("users", "public");
      }, 5000);

      console.error(
        `[BENCH] sanitizeTableName("users","public"):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      // Two sanitizeIdentifier calls + string concat
      expect(result.p95).toBeLessThan(30);
    });

    it("createColumnList() with 10 columns", () => {
      const cols = [
        "id",
        "name",
        "email",
        "created_at",
        "updated_at",
        "status",
        "role",
        "bio",
        "avatar",
        "score",
      ];

      const result = benchmark(() => {
        createColumnList(cols);
      }, 3000);

      console.error(
        `[BENCH] createColumnList(10 cols):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      // 10 x sanitizeIdentifier + join
      expect(result.p95).toBeLessThan(100);
    });

    it("needsQuoting() throughput for various identifiers", () => {
      const identifiers = [
        "users",
        "UserProfile",
        "_private",
        "select",
        "normal_table",
        "create",
      ];

      const result = benchmark(() => {
        for (const id of identifiers) needsQuoting(id);
      }, 5000);

      console.error(
        `[BENCH] needsQuoting() x6:  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      // Set.has + string comparisons; should be < 10µs
      expect(result.p95).toBeLessThan(30);
    });

    it("generateIndexName()", () => {
      const result = benchmark(() => {
        generateIndexName("users", ["email", "status"]);
      }, 3000);

      console.error(
        `[BENCH] generateIndexName():  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(50);
    });
  });

  // -------------------------------------------------------------------------
  // 2. WHERE clause validation — called on every tool with where parameter
  // -------------------------------------------------------------------------
  describe("WHERE Clause Validation", () => {
    it("simple safe clause", () => {
      const result = benchmark(() => {
        validateWhereClause("price > 10");
      }, 10000);

      console.error(
        `[BENCH] validateWhereClause(simple):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      // 13 regex tests on short string; should be < 10µs
      expect(result.p95).toBeLessThan(50);
    });

    it("complex safe clause", () => {
      const clause =
        "status = 'active' AND created_at > '2025-01-01' AND (role = 'admin' OR role = 'moderator') AND deleted_at IS NULL";

      const result = benchmark(() => {
        validateWhereClause(clause);
      }, 5000);

      console.error(
        `[BENCH] validateWhereClause(complex, ${String(clause.length)} chars):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      // 13 regex tests on ~110 chars
      expect(result.p95).toBeLessThan(100);
    });

    it("sanitizeWhereClause() wrapper", () => {
      const result = benchmark(() => {
        sanitizeWhereClause("id = $1 AND active = true");
      }, 5000);

      console.error(
        `[BENCH] sanitizeWhereClause():  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(50);
    });

    it("blocked clause (early rejection)", () => {
      const result = benchmark(() => {
        try {
          validateWhereClause("1=1; DROP TABLE users;--");
        } catch {
          // Expected
        }
      }, 5000);

      console.error(
        `[BENCH] validateWhereClause(blocked):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      // Error path includes exception construction + try/catch overhead
      // Measured: ~50-140µs on Windows
      expect(result.p95).toBeLessThan(500);
    });
  });

  // -------------------------------------------------------------------------
  // 3. SQL query validation (from DatabaseAdapter.validateQuery)
  // -------------------------------------------------------------------------
  describe("SQL Query Validation", () => {
    it("simple SELECT query", () => {
      const result = benchmark(() => {
        validateCode("SELECT * FROM users WHERE id = $1", true);
      }, 5000);

      console.error(
        `[BENCH] validateQuery(SELECT):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(50);
    });

    it("complex SELECT with subquery", () => {
      const sql =
        "SELECT u.id, u.name, (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) as order_count FROM users u WHERE u.active = true ORDER BY u.created_at DESC LIMIT 50";

      const result = benchmark(() => {
        validateCode(sql, true);
      }, 3000);

      console.error(
        `[BENCH] validateQuery(complex SELECT, ${String(sql.length)} chars):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(100);
    });

    it("INSERT query (write mode)", () => {
      const result = benchmark(() => {
        validateCode(
          "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id",
          false,
        );
      }, 5000);

      console.error(
        `[BENCH] validateQuery(INSERT):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(50);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Metadata cache operations (Map-based with TTL)
  // -------------------------------------------------------------------------
  describe("Metadata Cache Operations", () => {
    it("cache hit/miss pattern", () => {
      const cache = new Map<string, { data: unknown; timestamp: number }>();
      const TTL_MS = 30000;

      // Pre-populate
      cache.set("schema", {
        data: { tables: ["users", "orders"] },
        timestamp: Date.now(),
      });
      cache.set("tables", {
        data: [{ name: "users" }, { name: "orders" }],
        timestamp: Date.now(),
      });

      const result = benchmark(() => {
        // Simulate getCached() pattern
        const entry = cache.get("schema");
        if (entry && Date.now() - entry.timestamp <= TTL_MS) {
          // Cache hit
          void entry.data;
        }
        // Cache miss (key not found)
        cache.get("nonexistent");
      }, 10000);

      console.error(
        `[BENCH] cache hit+miss:  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      // Two Map.get + Date.now() + arithmetic; should be < 5µs
      expect(result.p95).toBeLessThan(20);
    });

    it("cache set/clear pattern", () => {
      const cache = new Map<string, { data: unknown; timestamp: number }>();

      const result = benchmark(() => {
        cache.set("key", { data: "value", timestamp: Date.now() });
        cache.delete("key");
      }, 10000);

      console.error(
        `[BENCH] cache set+delete:  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(20);
    });
  });
});
