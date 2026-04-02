/**
 * E2E Tests: Code Mode (pg_execute_code)
 *
 * Tests sandbox fundamentals, security enforcement, and multi-step workflows.
 * Adapted from db-mcp's sqlite_execute_code tests for postgres-mcp's pg_execute_code.
 *
 * Ported from db-mcp/tests/e2e/codemode.spec.ts — adapted for postgres-mcp.
 */

import { test, expect } from "./fixtures.js";
import {
  createClient,
  getBaseURL,
  callToolAndParse,
  expectSuccess,
  expectHandlerError,
} from "./helpers.js";

test.describe.configure({ mode: "serial" });

// =============================================================================
// Sandbox Basics
// =============================================================================

test.describe("Code Mode: Sandbox Basics", () => {
  test("should return a simple value", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: "return 42;",
      });
      expectSuccess(p);
      expect(p.result).toBe(42);
    } finally {
      await client.close();
    }
  });

  test("should return a string", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: 'return "hello";',
      });
      expectSuccess(p);
      expect(p.result).toBe("hello");
    } finally {
      await client.close();
    }
  });

  test("should return an object", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: 'return { a: 1, b: "two" };',
      });
      expectSuccess(p);
      const result = p.result as Record<string, unknown>;
      expect(result.a).toBe(1);
      expect(result.b).toBe("two");
    } finally {
      await client.close();
    }
  });

  test("should handle async/await", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: `
          const result = await pg.core.readQuery({ query: "SELECT 1 AS val" });
          return result.rows[0].val;
        `,
      });
      expectSuccess(p);
      expect(p.result).toBe(1);
    } finally {
      await client.close();
    }
  });

  test("should return runtime error for invalid code", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: "throw new Error('intentional test error');",
      });
      expectHandlerError(p, "intentional test error");
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// API Discoverability
// =============================================================================

test.describe("Code Mode: API Discoverability", () => {
  test.beforeEach(() => {
    test.setTimeout(90_000);
  });

  test("pg.help() should return documentation", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: "return pg.help();",
      });
      expectSuccess(p);
      // help() returns an object with group info
      expect(typeof p.result).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg.core should be accessible", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: "return typeof pg.core;",
      });
      expectSuccess(p);
      expect(p.result).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg.stats should be accessible", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: "return typeof pg.stats;",
      });
      expectSuccess(p);
      expect(p.result).toBe("object");
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// Security
// =============================================================================

test.describe("Code Mode: Security", () => {
  test("should block require()", async ({}, testInfo) => {
    test.setTimeout(60_000);
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: 'const fs = require("fs"); return fs.readdirSync(".");',
      });
      expectHandlerError(p);
    } finally {
      await client.close();
    }
  });

  test("should block process access", async ({}, testInfo) => {
    test.setTimeout(60_000);
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: "return process.env;",
      });
      expectHandlerError(p);
    } finally {
      await client.close();
    }
  });

  test("should block eval()", async ({}, testInfo) => {
    test.setTimeout(60_000);
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: 'return eval("1 + 1");',
      });
      expectHandlerError(p);
    } finally {
      await client.close();
    }
  });

  test("should enforce timeout", async ({}, testInfo) => {
    test.setTimeout(60_000);
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: "while (true) {}",
        timeout: 2000,
      });
      expectHandlerError(p);
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// Readonly Mode
// =============================================================================

test.describe("Code Mode: Readonly Mode", () => {
  test("readonly should allow reads", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: `
          const result = await pg.core.readQuery({ query: "SELECT COUNT(*) AS cnt FROM test_products" });
          return result.rows[0].cnt;
        `,
        readonly: true,
      });
      expectSuccess(p);
      // PG COUNT returns bigint which may come as string or number
      expect(["number", "string"]).toContain(typeof p.result);
    } finally {
      await client.close();
    }
  });

  test("readonly should block writes", async ({}, testInfo) => {
    test.setTimeout(90_000);
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: `
          await pg.core.writeQuery({ query: "SELECT 1" });
          return "should not reach here";
        `,
        readonly: true,
      });
      // Readonly enforcement blocks write-capable methods at binding level
      expect(p.success).toBe(false);
      expect(typeof p.error).toBe("string");
      expect(p.error).toContain("Readonly mode");
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// Multi-Step Workflows
// =============================================================================

test.describe("Code Mode: Multi-Step Workflows", () => {
  test("ETL pipeline: create → insert → query → cleanup", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: `
          // Create
          await pg.core.createTable({
            table: "_e2e_codemode_etl",
            columns: [
              { name: "id", type: "SERIAL", primaryKey: true },
              { name: "name", type: "TEXT" },
              { name: "value", type: "REAL" },
            ],
            ifNotExists: true,
          });

          // Insert
          await pg.core.writeQuery({
            query: "INSERT INTO _e2e_codemode_etl (name, value) VALUES ('alpha', 10.5), ('beta', 20.3), ('gamma', 30.1)",
          });

          // Query
          const result = await pg.core.readQuery({
            query: "SELECT name, value FROM _e2e_codemode_etl ORDER BY value DESC",
          });

          // Cleanup
          await pg.core.dropTable({ table: "_e2e_codemode_etl" });

          return {
            rowCount: result.rowCount,
            firstItem: result.rows[0]?.name,
          };
        `,
      });
      expectSuccess(p);
      const result = p.result as Record<string, unknown>;
      expect(result.rowCount).toBe(3);
      expect(result.firstItem).toBe("gamma");
    } finally {
      await client.close();
    }
  });

  test("introspection + query: list tables → describe → query", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: `
          // List tables
          const tables = await pg.core.listTables({});
          const hasProducts = tables.tables.some(t => t.name === "test_products");

          // Describe
          const desc = await pg.core.describeTable({ table: "test_products" });

          // Query
          const count = await pg.core.readQuery({
            query: "SELECT COUNT(*) AS cnt FROM test_products",
          });

          return {
            productsExists: hasProducts,
            columnCount: desc.columns.length,
            rowCount: count.rows[0].cnt,
          };
        `,
      });
      expectSuccess(p);
      const result = p.result as Record<string, unknown>;
      expect(result.productsExists).toBe(true);
      expect(typeof result.columnCount).toBe("number");
      expect((result.columnCount as number)).toBeGreaterThan(0);
      // PG COUNT returns bigint which may come as string or number
      expect(["number", "string"]).toContain(typeof result.rowCount);
    } finally {
      await client.close();
    }
  });
});
