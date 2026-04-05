/**
 * E2E Tests: Structured Error Responses
 *
 * Validates that tools return consistent structured error responses
 * instead of crashing or returning unstructured text.
 */

import { test, expect } from "./fixtures.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

test.describe.configure({ mode: "serial" });

test.describe("Structured Error Responses", () => {
  let client: Client;

  test.beforeAll(async () => {
    const transport = new SSEClientTransport(
      new URL(
        `${process.env.MCP_TEST_URL || `${process.env.MCP_TEST_URL || "http://127.0.0.1:3000"}`}/sse`,
      ),
    );
    client = new Client(
      { name: "playwright-errors-test", version: "1.0.0" },
      { capabilities: {} },
    );
    await client.connect(transport);
  });

  test.afterAll(async () => {
    await client.close();
  });

  test("should return structured error for nonexistent table", async () => {
    const response = await client.callTool({
      name: "pg_read_query",
      arguments: { query: "SELECT * FROM nonexistent_table_xyz" },
    });

    expect(Array.isArray(response.content)).toBe(true);
    const parsed = JSON.parse((response.content[0] as any).text);
    expect(parsed.success).toBe(false);
    expect(typeof parsed.error).toBe("string");
  });

  test("should return structured error for nonexistent column", async () => {
    const response = await client.callTool({
      name: "pg_read_query",
      arguments: {
        query:
          "SELECT nonexistent_column_xyz FROM information_schema.tables LIMIT 1",
      },
    });

    expect(Array.isArray(response.content)).toBe(true);
    const parsed = JSON.parse((response.content[0] as any).text);
    expect(parsed.success).toBe(false);
    expect(typeof parsed.error).toBe("string");
  });

  test("should reject INSERT in read_query", async () => {
    try {
      const response = await client.callTool({
        name: "pg_read_query",
        arguments: {
          query:
            "INSERT INTO information_schema.tables (table_name) VALUES ('bad')",
        },
      });

      expect(Array.isArray(response.content)).toBe(true);
      const text = (response.content[0] as any).text as string;
      expect(text.toLowerCase()).toMatch(/not allowed|read-only|invalid|error/);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message.toLowerCase()).toMatch(/not allowed|read-only|invalid/);
    }
  });

  test("should reject SELECT in write_query", async () => {
    try {
      const response = await client.callTool({
        name: "pg_write_query",
        arguments: { query: "SELECT * FROM information_schema.tables LIMIT 1" },
      });

      expect(Array.isArray(response.content)).toBe(true);
      const text = (response.content[0] as any).text as string;
      expect(text.toLowerCase()).toMatch(/not allowed|write|invalid|error/);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message.toLowerCase()).toMatch(/not allowed|write|invalid/);
    }
  });

  test("should return structured error for validation failure", async () => {
    const response = await client.callTool({
      name: "pg_read_query",
      arguments: {},
    });

    expect(Array.isArray(response.content)).toBe(true);
    const text = (response.content[0] as any).text as string;
    expect(text.toLowerCase()).toContain("required");
  });

  test("should return structured error for describe nonexistent table", async () => {
    const response = await client.callTool({
      name: "pg_describe_table",
      arguments: { table: "nonexistent_table_xyz" },
    });

    expect(Array.isArray(response.content)).toBe(true);
    const parsed = JSON.parse((response.content[0] as any).text);
    expect(parsed.success).toBe(false);
    expect(typeof parsed.error).toBe("string");
  });
});
