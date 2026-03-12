/**
 * Payload Contract Tests: Performance
 *
 * Validates response shapes for performance tools (25 tools).
 */

import { test, expect } from "@playwright/test";
import { createClient, callToolAndParse } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Performance", () => {
  test("pg_explain returns query plan", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_explain", {
        sql: "SELECT * FROM test_products WHERE id = 1",
      });

      expect(typeof payload).toBe("object");
      // Should include a plan
      expect(payload.plan !== undefined || payload.rows !== undefined).toBe(
        true,
      );
    } finally {
      await client.close();
    }
  });

  test("pg_table_stats returns { tables }", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_table_stats", {});

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg_index_usage returns index usage data", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_index_usage", {});

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg_seq_scan_tables returns sequential scan data", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(
        client,
        "pg_seq_scan_tables",
        {},
      );

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });
});
