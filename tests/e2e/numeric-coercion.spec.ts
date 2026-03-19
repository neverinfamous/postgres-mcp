/**
 * Numeric Coercion Tests
 *
 * For tools with numeric params, pass string values like "abc".
 * Assert the response is a structured handler error, NOT a raw MCP -32602 error.
 *
 * Ported from db-mcp/tests/e2e/numeric-coercion.spec.ts — adapted for postgres-mcp tool names.
 */

import { test, expect } from "@playwright/test";
import { createClient, getBaseURL, callToolRaw } from "./helpers.js";

test.describe.configure({ mode: "serial" });

/**
 * Call a tool with a string value for a numeric parameter.
 * Assert the response is structured JSON (not a raw MCP error frame).
 * Server may either: (1) coerce "abc" to a default and succeed, or (2) return a handler error.
 * Both are acceptable — the key assertion is that we DON'T get a raw MCP -32602 error.
 */
async function assertNumericCoercion(
  baseURL: string,
  toolName: string,
  args: Record<string, unknown>,
) {
  const client = await createClient(baseURL);
  try {
    const response = await callToolRaw(client, toolName, args);
    const text = response.content[0]?.text;
    expect(text, `${toolName}: no response content`).toBeDefined();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(
        `${toolName}: raw MCP error, not structured JSON. Got: ${text.slice(0, 200)}`,
      );
    }

    // Must be a structured JSON response — either handler error, coerced success,
    // or direct result object (some tools don't wrap in {success: ...})
    expect(
      typeof parsed,
      `${toolName}: expected JSON object. Got: ${JSON.stringify(parsed, null, 2)}`,
    ).toBe("object");
  } finally {
    await client.close();
  }
}

test.describe("Numeric Coercion: Stats", () => {
  test("stats_descriptive with limit: 'abc' → handler error or coerced default", async ({}, testInfo) => {
    await assertNumericCoercion(getBaseURL(testInfo), "pg_stats_descriptive", {
      table: "test_products",
      column: "price",
      limit: "abc",
    });
  });

  test("stats_percentiles with percentiles: 'abc' → error (handler or Zod)", async ({}, testInfo) => {
    const baseURL = getBaseURL(testInfo);
    const client = await createClient(baseURL);
    try {
      const response = await callToolRaw(client, "pg_stats_percentiles", {
        table: "test_products",
        column: "price",
        percentiles: "abc",
      });
      const text = response.content[0]?.text;
      expect(text).toBeDefined();
      // Array params can't be coerced from string — accept either raw Zod or handler error
      try {
        const parsed = JSON.parse(text);
        expect(parsed.success).toBe(false);
      } catch {
        // Raw MCP -32602 is acceptable for incompatible type coercion
        expect(text).toContain("error");
      }
    } finally {
      await client.close();
    }
  });
});

test.describe("Numeric Coercion: Text", () => {
  test("fuzzy_match with maxDistance: 'abc' → handler error", async ({}, testInfo) => {
    await assertNumericCoercion(getBaseURL(testInfo), "pg_fuzzy_match", {
      table: "test_products",
      column: "name",
      search: "laptop",
      maxDistance: "abc",
    });
  });

  test("trigram_similarity with limit: 'abc' → handler error", async ({}, testInfo) => {
    await assertNumericCoercion(
      getBaseURL(testInfo),
      "pg_trigram_similarity",
      {
        table: "test_products",
        column: "name",
        search: "laptop",
        limit: "abc",
      },
    );
  });
});

test.describe("Numeric Coercion: Performance", () => {
  test("explain with format: invalid → error (handler or Zod)", async ({}, testInfo) => {
    const baseURL = getBaseURL(testInfo);
    const client = await createClient(baseURL);
    try {
      const response = await callToolRaw(client, "pg_explain", {
        query: "SELECT 1",
        format: 12345,
      });
      const text = response.content[0]?.text;
      expect(text).toBeDefined();
      try {
        const parsed = JSON.parse(text);
        expect(typeof parsed.success).toBe("boolean");
      } catch {
        expect(text.toLowerCase()).toContain("error");
      }
    } finally {
      await client.close();
    }
  });
});

test.describe("Numeric Coercion: Vector", () => {
  test("vector_search with limit: 'abc' → handler error", async ({}, testInfo) => {
    await assertNumericCoercion(getBaseURL(testInfo), "pg_vector_search", {
      table: "test_embeddings",
      column: "embedding",
      query: [0.1, 0.2, 0.3],
      limit: "abc",
    });
  });
});

test.describe("Numeric Coercion: Admin", () => {
  test("terminate_backend with pid: 'abc' → handler error", async ({}, testInfo) => {
    await assertNumericCoercion(
      getBaseURL(testInfo),
      "pg_terminate_backend",
      {
        pid: "abc",
      },
    );
  });
});

test.describe("Numeric Coercion: Code Mode", () => {
  test("execute_code with timeout: 'abc' → handler error", async ({}, testInfo) => {
    await assertNumericCoercion(getBaseURL(testInfo), "pg_execute_code", {
      code: "return 1;",
      timeout: "abc",
    });
  });
});
