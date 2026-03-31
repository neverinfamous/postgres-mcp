import { test, expect } from "./fixtures.js";

test.describe("HTTP Transport Protocols", () => {
  test("should return server metadata on GET /", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("name", "postgres-mcp");
    expect(body).toHaveProperty("endpoints");
    expect(body.endpoints).toHaveProperty("POST /mcp");
    expect(body.endpoints).toHaveProperty("GET /sse");
  });

  test.describe("Streamable HTTP (MCP 2025-11-25)", () => {
    test("should reject generic payload on /mcp without a session ID", async ({
      request,
    }) => {
      // POST without mcp-session-id AND not an 'initialize' request
      const response = await request.post("/mcp", {
        headers: {
          Accept: "application/json, text/event-stream",
        },
        data: {
          jsonrpc: "2.0",
          id: 1,
          method: "ping",
        },
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toHaveProperty(
        "message",
        "Bad Request: No valid session ID provided",
      );
    });

    test("should reject invalid JSON string body on /mcp", async ({
      request,
    }) => {
      const response = await request.post("/mcp", {
        headers: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        data: Buffer.from('{"broken": json}'),
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toHaveProperty("message", "Parse error: Invalid JSON");
    });

    test("should accept initialization and return session ID", async ({
      request,
    }) => {
      const response = await request.post("/mcp", {
        headers: {
          Accept: "application/json, text/event-stream",
        },
        data: {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: {
              name: "playwright-protocol-test",
              version: "1.0.0",
            },
          },
        },
      });

      expect(response.status()).toBe(200);
      const sessionId = response.headers()["mcp-session-id"];
      expect(sessionId).toBeDefined();
    });
  });

  test.describe("Legacy SSE (MCP 2024-11-05)", () => {
    test("should reject message POSTs without a sessionId parameter", async ({
      request,
    }) => {
      const response = await request.post("/messages", {
        data: {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0" },
          },
        },
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error", "Missing sessionId parameter");
    });

    test("should reject message POSTs for an unknown sessionId", async ({
      request,
    }) => {
      const response = await request.post(
        "/messages?sessionId=invalid-session-uuid",
        {
          data: {
            jsonrpc: "2.0",
            id: 1,
            method: "ping",
          },
        },
      );

      expect(response.status()).toBe(404);
      const body = await response.json();
      expect(body).toHaveProperty("error", "No transport found for sessionId");
    });

    test("should complete full SDK client round-trip via Legacy SSE", async () => {
      // Regression test: server.connect() auto-calls start() on SSEServerTransport,
      // so a redundant start() call would throw "already started!" and break SSE entirely.
      const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
      const { SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js");

      const transport = new SSEClientTransport(new URL(`${process.env.MCP_TEST_URL || `${process.env.MCP_TEST_URL || 'http://127.0.0.1:3000'}`}/sse`));
      const client = new Client(
        { name: "playwright-sse-regression", version: "1.0.0" },
        { capabilities: {} },
      );

      try {
        await client.connect(transport);

        const response = await client.callTool({
          name: "pg_list_tables",
          arguments: {},
        });

        expect(response.isError).toBeUndefined();
        expect(Array.isArray(response.content)).toBe(true);
        const text = (response.content[0] as { type: string; text: string }).text;
        expect(text.length).toBeGreaterThan(0);
      } finally {
        await client.close();
      }
    });
  });
});
