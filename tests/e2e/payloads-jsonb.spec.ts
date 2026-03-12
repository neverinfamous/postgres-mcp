/**
 * Payload Contract Tests: JSONB
 *
 * Validates response shapes for JSONB tools (19 tools).
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

  test("pg_jsonb_extract returns { rows, rowCount }", async () => {
    const payload = await callToolAndParse(client, "pg_jsonb_extract", {
      table: "test_jsonb_docs",
      column: "metadata",
      path: "author",
    });
    expectSuccess(payload);
    expect(Array.isArray(payload.rows)).toBe(true);
    expect(typeof payload.rowCount).toBe("number");
  });

  test("pg_jsonb_contains returns { rows, rowCount }", async () => {
    const payload = await callToolAndParse(client, "pg_jsonb_contains", {
      table: "test_jsonb_docs",
      column: "metadata",
      value: { author: "Alice" },
    });
    expectSuccess(payload);
    expect(Array.isArray(payload.rows)).toBe(true);
    expect(typeof payload.rowCount).toBe("number");
  });

  test("pg_jsonb_keys returns { keys }", async () => {
    const payload = await callToolAndParse(client, "pg_jsonb_keys", {
      table: "test_jsonb_docs",
      column: "metadata",
    });
    expectSuccess(payload);
    expect(Array.isArray(payload.keys)).toBe(true);
  });

  test("pg_jsonb_path_query returns results", async () => {
    const payload = await callToolAndParse(client, "pg_jsonb_path_query", {
      table: "test_jsonb_docs",
      column: "metadata",
      jsonpath: "$.author",
    });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
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
});
