/**
 * Payload Contract Tests: Text + Search
 *
 * Validates response shapes for text/FTS tools (14 tools).
 * Uses test_articles table with search_vector and GIN index.
 */

import { test, expect } from "@playwright/test";
import { createClient, callToolAndParse } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Text + Search", () => {
  test("pg_fts_search returns { rows, rowCount }", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_fts_search", {
        table: "test_articles",
        query: "database",
      });

      expect(Array.isArray(payload.rows)).toBe(true);
      expect(typeof payload.rowCount).toBe("number");
    } finally {
      await client.close();
    }
  });

  test("pg_text_pattern returns { rows, rowCount }", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_text_pattern", {
        table: "test_articles",
        column: "title",
        pattern: "%guide%",
      });

      expect(Array.isArray(payload.rows)).toBe(true);
      expect(typeof payload.rowCount).toBe("number");
    } finally {
      await client.close();
    }
  });

  test("pg_text_similarity returns similarity results", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_text_similarity", {
        table: "test_articles",
        column: "title",
        text: "database guide",
      });

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });
});
