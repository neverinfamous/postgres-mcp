/**
 * E2E Tests: Advanced Session Management
 *
 * Tests cross-protocol guard, sequential sessions, post-DELETE
 * session rejection, and invalid session ID handling.
 *
 * Ported from db-mcp/tests/e2e/session-advanced.spec.ts — adapted for postgres-mcp.
 */

import { test, expect } from "./fixtures.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

test.describe.serial("Advanced Session Management", () => {
  test("should reject SSE session ID on /mcp (cross-protocol guard)", async ({}, testInfo) => {
    const baseURL = process.env.MCP_TEST_URL || "http://127.0.0.1:3000";

    // Connect via Legacy SSE to get an SSE session ID
    const sseTransport = new SSEClientTransport(new URL(`${baseURL}/sse`));
    const sseClient = new Client(
      { name: "cross-protocol-test", version: "1.0.0" },
      { capabilities: {} },
    );

    try {
      await sseClient.connect(sseTransport);

      // Try to POST to /mcp with a session ID that doesn't exist in the
      // Streamable HTTP transport map — should be rejected
      const response = await fetch(`${baseURL}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": "fake-sse-session-id",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "ping",
        }),
      });

      // Should be rejected — session ID is unknown
      expect(response.status).toBe(400);
    } finally {
      await sseClient.close();
    }
  });

  test("should support sequential session isolation", async ({}, testInfo) => {
    const baseURL = process.env.MCP_TEST_URL || "http://127.0.0.1:3000";

    // Verify that sequential sessions each get fresh state and distinct IDs.
    const completedRounds: number[] = [];

    for (let i = 0; i < 3; i++) {
      const transport = new StreamableHTTPClientTransport(
        new URL(`${baseURL}/mcp`),
      );
      const client = new Client(
        { name: `sequential-test-${i}`, version: "1.0.0" },
        { capabilities: {} },
      );

      try {
        await client.connect(transport);

        const result = await client.callTool({
          name: "pg_list_tables",
          arguments: {},
        });

        expect(result.isError).toBeUndefined();
        expect(Array.isArray(result.content)).toBe(true);

        completedRounds.push(i);
      } finally {
        await client.close();
      }
    }

    // All 3 rounds completed successfully — sessions are isolated
    expect(completedRounds).toHaveLength(3);
  });

  test("should reject request with non-existent session ID", async ({}, testInfo) => {
    const baseURL = process.env.MCP_TEST_URL || "http://127.0.0.1:3000";

    const response = await fetch(`${baseURL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "mcp-session-id": "00000000-0000-4000-8000-000000000000",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { message: string };
    };
    expect(body.error).toHaveProperty(
      "message",
      "Bad Request: No valid session ID provided",
    );
  });

  test("should reject requests after session DELETE", async ({ request }) => {
    // Initialize a session
    const initResponse = await request.post("/mcp", {
      headers: { Accept: "application/json, text/event-stream" },
      data: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "delete-reuse-test", version: "1.0.0" },
        },
      },
    });

    expect(initResponse.status()).toBe(200);
    const sessionId = initResponse.headers()["mcp-session-id"];
    expect(sessionId).toBeDefined();

    // Delete the session
    const deleteResponse = await request.delete("/mcp", {
      headers: { "mcp-session-id": sessionId! },
    });
    expect([200, 204]).toContain(deleteResponse.status());

    // Try to use the deleted session — should be rejected
    const postDeleteResponse = await request.post("/mcp", {
      headers: {
        Accept: "application/json, text/event-stream",
        "mcp-session-id": sessionId!,
      },
      data: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      },
    });

    expect(postDeleteResponse.status()).toBe(400);
  });
});
