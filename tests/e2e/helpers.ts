/**
 * Shared E2E test helpers for payload contract tests.
 *
 * Provides utilities for creating MCP SDK clients via SSE transport
 * and parsing tool responses into typed payloads.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { expect } from "@playwright/test";

/**
 * Create a connected MCP client via SSE transport.
 * Caller is responsible for calling `client.close()` in a finally block.
 */
export async function createClient(): Promise<Client> {
  const transport = new SSEClientTransport(
    new URL("http://localhost:3000/sse"),
  );
  const client = new Client(
    { name: "payload-test-client", version: "1.0.0" },
    { capabilities: {} },
  );
  await client.connect(transport);
  return client;
}

/**
 * Call a tool and parse the JSON response payload.
 * Asserts that the response has text content and returns the parsed object.
 */
export async function callToolAndParse(
  client: Client,
  toolName: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await client.callTool({ name: toolName, arguments: args });

  expect(Array.isArray(response.content)).toBe(true);
  const content = response.content as Array<{ type: string; text?: string }>;
  expect(content.length).toBeGreaterThan(0);

  const first = content[0];
  expect(first.type).toBe("text");

  return JSON.parse(first.text!) as Record<string, unknown>;
}

/**
 * Assert that a payload does not contain an error.
 */
export function expectSuccess(payload: Record<string, unknown>): void {
  if (payload.success === false) {
    throw new Error(`Tool returned error: ${JSON.stringify(payload.error)}`);
  }
}
