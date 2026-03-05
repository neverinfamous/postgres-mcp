import { test, expect } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

test.describe.configure({ mode: "serial" });

test.describe("E2E Tool Execution (via MCP SDK Client)", () => {
  async function createClient() {
    const transport = new SSEClientTransport(
      new URL("http://localhost:3000/sse"),
    );
    const client = new Client(
      { name: "playwright-test-client", version: "1.0.0" },
      { capabilities: {} },
    );
    await client.connect(transport);
    return client;
  }

  test("should list available tools", async () => {
    const client = await createClient();
    try {
      const listResponse = await client.listTools();

      expect(listResponse.tools).toBeDefined();
      expect(Array.isArray(listResponse.tools)).toBe(true);
      expect(listResponse.tools.length).toBeGreaterThan(0);

      const toolNames = listResponse.tools.map((t) => t.name);
      expect(toolNames).toContain("pg_list_tables");
      expect(toolNames).toContain("pg_read_query");
    } finally {
      await client.close();
    }
  });

  test("should execute a read tool successfully (pg_list_tables)", async () => {
    const client = await createClient();
    try {
      const response = await client.callTool({
        name: "pg_list_tables",
        arguments: {},
      });

      expect(response.isError).toBeUndefined();
      expect(Array.isArray(response.content)).toBe(true);
      if (response.content.length > 0) {
        expect(response.content[0].type).toBe("text");
        const textOutput = (response.content[0] as any).text as string;
        expect(textOutput).toContain("test_");
      }
    } finally {
      await client.close();
    }
  });

  test("should return formatted MCP error for validation failures (pg_read_query)", async () => {
    const client = await createClient();
    try {
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
    } catch (error: any) {
      // If the SDK throws on tool error instead of returning `isError: true`
      expect(error.message.toLowerCase()).toContain("required");
    } finally {
      await client.close();
    }
  });
});
