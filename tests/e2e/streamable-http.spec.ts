/**
 * E2E Tests: Streamable HTTP Transport (MCP 2025-11-25)
 *
 * Validates that the modern Streamable HTTP transport works
 * alongside the legacy SSE transport for all MCP operations.
 */

import { test, expect } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

test.describe.configure({ mode: "serial" });

test.describe("Streamable HTTP Transport (MCP 2025-11-25)", () => {
  let client: Client;

  test.beforeAll(async () => {
    const transport = new StreamableHTTPClientTransport(
      new URL("http://localhost:3000/mcp"),
    );
    client = new Client(
      { name: "playwright-streamable-test", version: "1.0.0" },
      { capabilities: {} },
    );
    await client.connect(transport);
  });

  test.afterAll(async () => {
    await client.close();
  });

  test("should initialize via Streamable HTTP", async () => {
    const listResponse = await client.listTools();

    expect(listResponse.tools).toBeDefined();
    expect(Array.isArray(listResponse.tools)).toBe(true);
    expect(listResponse.tools.length).toBeGreaterThan(0);
  });

  test("should list and execute tools via Streamable HTTP", async () => {
    const response = await client.callTool({
      name: "pg_list_tables",
      arguments: {},
    });

    expect(response.isError).toBeUndefined();
    expect(Array.isArray(response.content)).toBe(true);
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.content[0].type).toBe("text");

    const parsed = JSON.parse((response.content[0] as any).text);
    expect(parsed).toHaveProperty("tables");
  });

  test("should call a read tool via Streamable HTTP", async () => {
    const response = await client.callTool({
      name: "pg_read_query",
      arguments: { query: "SELECT 1 AS test_value" },
    });

    expect(response.isError).toBeUndefined();
    expect(Array.isArray(response.content)).toBe(true);
    expect(response.content.length).toBeGreaterThan(0);
  });

  test("should list resources via Streamable HTTP", async () => {
    const response = await client.listResources();

    expect(response.resources).toBeDefined();
    expect(Array.isArray(response.resources)).toBe(true);
    expect(response.resources.length).toBeGreaterThan(0);
  });

  test("should read a resource via Streamable HTTP", async () => {
    const response = await client.readResource({
      uri: "postgres://schema",
    });

    expect(response.contents).toBeDefined();
    expect(response.contents.length).toBeGreaterThan(0);
  });

  test("should list and get prompts via Streamable HTTP", async () => {
    const listResponse = await client.listPrompts();
    expect(listResponse.prompts).toBeDefined();
    expect(listResponse.prompts.length).toBeGreaterThan(0);

    const response = await client.getPrompt({
      name: "pg_tool_index",
      arguments: {},
    });
    expect(response.messages).toBeDefined();
    expect(response.messages.length).toBeGreaterThan(0);
  });
});
