/**
 * E2E Tests: MCP Resource Reads via SDK Client
 *
 * Uses the official @modelcontextprotocol/sdk client to connect
 * via Legacy SSE transport and read resources end-to-end.
 */

import { test, expect } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

test.describe.configure({ mode: "serial" });

test.describe("E2E Resource Reads (via MCP SDK Client)", () => {
  let client: Client;

  test.beforeAll(async () => {
    const transport = new SSEClientTransport(
      new URL("http://localhost:3000/sse"),
    );
    client = new Client(
      { name: "playwright-resource-test", version: "1.0.0" },
      { capabilities: {} },
    );
    await client.connect(transport);
  });

  test.afterAll(async () => {
    await client.close();
  });

  test("should list available resources", async () => {
    const listResponse = await client.listResources();

    expect(listResponse.resources).toBeDefined();
    expect(Array.isArray(listResponse.resources)).toBe(true);
    expect(listResponse.resources.length).toBeGreaterThan(0);

    const uris = listResponse.resources.map((r) => r.uri);
    expect(uris).toContain("postgres://schema");
    expect(uris).toContain("postgres://tables");
    expect(uris).toContain("postgres://health");
  });

  test("should read postgres://schema resource", async () => {
    const response = await client.readResource({ uri: "postgres://schema" });

    expect(response.contents).toBeDefined();
    expect(response.contents.length).toBeGreaterThan(0);

    const text = response.contents[0]!.text as string;
    const schema = JSON.parse(text);
    expect(schema).toHaveProperty("tables");
    expect(Array.isArray(schema.tables)).toBe(true);
  });

  test("should read postgres://tables resource", async () => {
    const response = await client.readResource({ uri: "postgres://tables" });

    expect(response.contents).toBeDefined();
    expect(response.contents.length).toBeGreaterThan(0);

    const text = response.contents[0]!.text as string;
    const tables = JSON.parse(text);
    expect(tables).toHaveProperty("tables");
    expect(Array.isArray(tables.tables)).toBe(true);
  });

  test("should read postgres://health resource", async () => {
    const response = await client.readResource({ uri: "postgres://health" });

    expect(response.contents).toBeDefined();
    expect(response.contents.length).toBeGreaterThan(0);

    const text = response.contents[0]!.text as string;
    const health = JSON.parse(text);
    expect(health).toHaveProperty("overallStatus");
    expect(health).toHaveProperty("checks");
  });

  test("should read postgres://extensions resource", async () => {
    const response = await client.readResource({
      uri: "postgres://extensions",
    });

    expect(response.contents).toBeDefined();
    expect(response.contents.length).toBeGreaterThan(0);

    const text = response.contents[0]!.text as string;
    const extensions = JSON.parse(text);
    expect(extensions).toBeDefined();
  });

  test("should read postgres://settings resource", async () => {
    const response = await client.readResource({ uri: "postgres://settings" });

    expect(response.contents).toBeDefined();
    expect(response.contents.length).toBeGreaterThan(0);

    const text = response.contents[0]!.text as string;
    const settings = JSON.parse(text);
    expect(settings).toBeDefined();
  });
});
