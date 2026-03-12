/**
 * Payload Contract Tests: Core
 *
 * Validates response shapes for core tools:
 * read_query, write_query, list_tables, describe_table, server_health,
 * connection_info, database_stats, count_rows, analyze_db_health.
 */

import { test, expect } from "@playwright/test";
import { createClient, callToolAndParse } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Core", () => {
  test("pg_read_query returns { rows, rowCount }", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_read_query", {
        sql: "SELECT id, name FROM test_products LIMIT 3",
      });

      expect(Array.isArray(payload.rows)).toBe(true);
      expect(typeof payload.rowCount).toBe("number");
      expect(payload.rowCount as number).toBeLessThanOrEqual(3);
    } finally {
      await client.close();
    }
  });

  test("pg_list_tables returns { tables, count, totalCount }", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_list_tables", {
        limit: 5,
      });

      expect(Array.isArray(payload.tables)).toBe(true);
      expect(typeof payload.count).toBe("number");
      expect(typeof payload.totalCount).toBe("number");
      expect(payload.count as number).toBeLessThanOrEqual(5);
    } finally {
      await client.close();
    }
  });

  test("pg_describe_table returns column info", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_describe_table", {
        table: "test_products",
      });

      expect(typeof payload).toBe("object");
      expect(Array.isArray(payload.columns)).toBe(true);
    } finally {
      await client.close();
    }
  });

  test("pg_count_rows returns { count }", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_count_rows", {
        table: "test_products",
      });

      expect(typeof payload.count).toBe("number");
    } finally {
      await client.close();
    }
  });

  test("pg_server_health returns { connected, version }", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_server_health", {});

      expect(typeof payload.connected).toBe("boolean");
      expect(typeof payload.version).toBe("string");
    } finally {
      await client.close();
    }
  });

  test("pg_connection_info returns connection details", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_connection_info", {});

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg_database_stats returns statistics", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_database_stats", {});

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg_analyze_db_health returns health report", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_analyze_db_health", {
        includeIndexes: true,
        includeVacuum: true,
        includeConnections: true,
      });

      expect(typeof payload.overallScore).toBe("number");
      expect(typeof payload.overallStatus).toBe("string");
    } finally {
      await client.close();
    }
  });

  test("pg_get_indexes returns { indexes }", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_get_indexes", {
        table: "test_products",
      });

      expect(Array.isArray(payload.indexes)).toBe(true);
    } finally {
      await client.close();
    }
  });
});
