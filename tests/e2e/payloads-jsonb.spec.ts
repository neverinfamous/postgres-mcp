/**
 * Payload Contract Tests: JSONB
 *
 * Validates response shapes for JSONB tools (20 tools).
 * Uses test_jsonb_docs table with metadata, settings, and tags JSONB columns.
 */

import { test, expect } from "@playwright/test";
import { createClient, callToolAndParse } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: JSONB", () => {
  test("pg_jsonb_get returns { rows, rowCount }", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_jsonb_get", {
        table: "test_jsonb_docs",
        column: "metadata",
        path: "$.author",
      });

      expect(Array.isArray(payload.rows)).toBe(true);
      expect(typeof payload.rowCount).toBe("number");
    } finally {
      await client.close();
    }
  });

  test("pg_jsonb_query returns { rows, rowCount }", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_jsonb_query", {
        table: "test_jsonb_docs",
        column: "metadata",
        path: "$.author",
        operator: "exists",
      });

      expect(Array.isArray(payload.rows)).toBe(true);
      expect(typeof payload.rowCount).toBe("number");
    } finally {
      await client.close();
    }
  });

  test("pg_jsonb_keys returns { keys }", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_jsonb_keys", {
        table: "test_jsonb_docs",
        column: "metadata",
      });

      expect(Array.isArray(payload.keys)).toBe(true);
    } finally {
      await client.close();
    }
  });

  test("pg_jsonb_path_query returns results", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_jsonb_path_query", {
        table: "test_jsonb_docs",
        column: "metadata",
        jsonpath: "$.author",
      });

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg_jsonb_stats returns statistics", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_jsonb_stats", {
        table: "test_jsonb_docs",
        column: "metadata",
      });

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg_jsonb_validate returns validation result", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_jsonb_validate", {
        table: "test_jsonb_docs",
        column: "metadata",
      });

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });
});
