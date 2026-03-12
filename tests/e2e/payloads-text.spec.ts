/**
 * Payload Contract Tests: Text + Search
 *
 * Validates response shapes for text/FTS tools (13 tools).
 */

import { test, expect } from "@playwright/test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createClient, callToolAndParse, expectSuccess } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Text + Search", () => {
  let client: Client;

  test.beforeAll(async () => {
    client = await createClient();
  });

  test.afterAll(async () => {
    await client.close();
  });

  test("pg_text_search returns { rows, rowCount }", async () => {
    const payload = await callToolAndParse(client, "pg_text_search", {
      table: "test_articles",
      query: "database",
    });
    expectSuccess(payload);
    expect(Array.isArray(payload.rows)).toBe(true);
    expect(typeof payload.rowCount).toBe("number");
  });

  test("pg_like_search returns { rows, rowCount }", async () => {
    const payload = await callToolAndParse(client, "pg_like_search", {
      table: "test_articles",
      column: "title",
      pattern: "%guide%",
    });
    expectSuccess(payload);
    expect(Array.isArray(payload.rows)).toBe(true);
    expect(typeof payload.rowCount).toBe("number");
  });

  test("pg_trigram_similarity returns results", async () => {
    const payload = await callToolAndParse(client, "pg_trigram_similarity", {
      table: "test_articles",
      column: "title",
      text: "database guide",
    });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });
});
