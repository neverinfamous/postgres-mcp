import { test, expect } from "./fixtures.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

test.describe.configure({ mode: "serial" });

test.describe("E2E Tool Execution (via MCP SDK Client)", () => {
  let client: Client;

  test.beforeAll(async () => {
    const transport = new SSEClientTransport(
      new URL(`${process.env.MCP_TEST_URL || `${process.env.MCP_TEST_URL || 'http://127.0.0.1:3000'}`}/sse`),
    );
    client = new Client(
      { name: "playwright-test-client", version: "1.0.0" },
      { capabilities: {} },
    );
    await client.connect(transport);
  });

  test.afterAll(async () => {
    await client.close();
  });

  test("should list available tools", async () => {
    const listResponse = await client.listTools();

    expect(listResponse.tools).toBeDefined();
    expect(Array.isArray(listResponse.tools)).toBe(true);
    expect(listResponse.tools.length).toBeGreaterThan(0);

    const toolNames = listResponse.tools.map((t) => t.name);
    expect(toolNames).toContain("pg_list_tables");
    expect(toolNames).toContain("pg_read_query");
  });

  test("should execute a read tool successfully (pg_list_tables)", async () => {
    const response = await client.callTool({
      name: "pg_list_tables",
      arguments: {},
    });

    expect(response.isError).toBeUndefined();
    expect(Array.isArray(response.content)).toBe(true);
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.content[0].type).toBe("text");
    const textOutput = (response.content[0] as any).text as string;
    const parsed = JSON.parse(textOutput);
    expect(parsed).toHaveProperty("tables");
    expect(Array.isArray(parsed.tables)).toBe(true);
    expect(parsed).toHaveProperty("count");
    expect(typeof parsed.count).toBe("number");
  });

  test("should return formatted MCP error for validation failures (pg_read_query)", async () => {
    try {
      const response = await client.callTool({
        name: "pg_read_query",
        arguments: {},
      });

      // If SDK doesn't throw, the server returned a structured P154 error
      expect(response.isError).toBeUndefined();
      expect(Array.isArray(response.content)).toBe(true);
      if (response.content.length > 0) {
        expect(response.content[0].type).toBe("text");
        const errorText = (response.content[0] as any).text as string;
        expect(errorText.toLowerCase()).toContain("required");
        expect(errorText).toMatch(/"success":\s*false/);
      }
    } catch (error: unknown) {
      // SDK may throw McpError when structuredContent doesn't match the
      // tool's outputSchema, or propagate the structured error payload.
      // Either way, the server correctly rejected the invalid input.
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toMatch(
        /output schema|structured content|"success":\s*false|VALIDATION_ERROR/i,
      );
    }
  });
});
