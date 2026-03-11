import { test, expect } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

test.describe.configure({ mode: "serial" });

test.describe("E2E Tool Execution (via MCP SDK Client)", () => {
  let client: Client;

  test.beforeAll(async () => {
    const transport = new SSEClientTransport(
      new URL("http://localhost:3000/sse"),
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

  test("should execute a read tool successfully (pg_read_query)", async () => {
    const response = await client.callTool({
      name: "pg_read_query",
      arguments: { query: "SELECT 1 AS test_value" },
    });

    expect(response.isError).toBeUndefined();
    expect(Array.isArray(response.content)).toBe(true);
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.content[0].type).toBe("text");
    const textOutput = (response.content[0] as any).text as string;
    const parsed = JSON.parse(textOutput);
    expect(parsed).toHaveProperty("rows");
    expect(Array.isArray(parsed.rows)).toBe(true);
    expect(parsed.rows.length).toBe(1);
  });

  test("should return formatted MCP error for validation failures (pg_read_query)", async () => {
    const response = await client.callTool({
      name: "pg_read_query",
      arguments: {},
    });

    // Based on the adapter's formatError implementation (Pattern P154),
    // validation failures and DB errors return structured JSON with { success: false, error: "..." }
    // rather than using the blunt isError: true protocol flag.
    expect(response.isError).toBeUndefined();
    expect(Array.isArray(response.content)).toBe(true);
    if (response.content.length > 0) {
      expect(response.content[0].type).toBe("text");
      const errorText = (response.content[0] as any).text as string;
      expect(errorText.toLowerCase()).toContain("required");
      expect(errorText).toContain('"success": false');
    }
  });
});
