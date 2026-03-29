/**
 * Payload Contract Tests: JSONB
 *
 * Validates response shapes for JSONB tools.
 * JSONB tools return { rows, count } (not rowCount).
 */

import { test, expect } from "@playwright/test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createClient, callToolAndParse, expectSuccess } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: JSONB", () => {
  let client: Client;

  test.beforeAll(async () => {
    client = await createClient();
  });

  test.afterAll(async () => {
    await client.close();
  });

  test("pg_jsonb_extract returns { rows, count }", async () => {
    const payload = await callToolAndParse(client, "pg_jsonb_extract", {
      table: "test_jsonb_docs",
      column: "metadata",
      path: "author",
    });
    expectSuccess(payload);
    expect(Array.isArray(payload.rows)).toBe(true);
    expect(typeof payload.count).toBe("number");
  });

  test("pg_jsonb_contains returns { rows, count }", async () => {
    const payload = await callToolAndParse(client, "pg_jsonb_contains", {
      table: "test_jsonb_docs",
      column: "metadata",
      value: { author: "Alice" },
    });
    expectSuccess(payload);
    expect(Array.isArray(payload.rows)).toBe(true);
    expect(typeof payload.count).toBe("number");
  });

  test("pg_jsonb_keys returns { keys }", async () => {
    const payload = await callToolAndParse(client, "pg_jsonb_keys", {
      table: "test_jsonb_docs",
      column: "metadata",
    });
    expectSuccess(payload);
    expect(Array.isArray(payload.keys)).toBe(true);
  });

  test("pg_jsonb_path_query returns { results, count }", async () => {
    const payload = await callToolAndParse(client, "pg_jsonb_path_query", {
      table: "test_jsonb_docs",
      column: "metadata",
      path: "$.author",
    });
    expectSuccess(payload);
    expect(Array.isArray(payload.results)).toBe(true);
    expect(typeof payload.count).toBe("number");
  });

  test("pg_jsonb_stats returns statistics", async () => {
    const payload = await callToolAndParse(client, "pg_jsonb_stats", {
      table: "test_jsonb_docs",
      column: "metadata",
    });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_jsonb_typeof returns type info", async () => {
    const payload = await callToolAndParse(client, "pg_jsonb_typeof", {
      table: "test_jsonb_docs",
      column: "metadata",
    });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_jsonb_pretty returns { formatted } for raw JSON", async () => {
    const payload = await callToolAndParse(client, "pg_jsonb_pretty", {
      json: '{"name":"Alice","age":30}',
    });
    expectSuccess(payload);
    expect(typeof payload.formatted).toBe("string");
    expect(payload.formatted).toContain("Alice");
  });

  test("pg_jsonb_object returns { object }", async () => {
    const payload = await callToolAndParse(client, "pg_jsonb_object", { keys: ["a", "b"], values: ["1", "2"] });
    expectSuccess(payload);
    expect(typeof payload.object).toBe("object");
  });
});
