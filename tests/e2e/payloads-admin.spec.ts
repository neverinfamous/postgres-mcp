/**
 * Payload Contract Tests: Admin + Monitoring
 *
 * Validates response shapes for admin (11) and monitoring (12) tools.
 */

import { test, expect } from "@playwright/test";
import { createClient, callToolAndParse } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Admin + Monitoring", () => {
  // --- Admin tools ---

  test("pg_analyze returns { success }", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_analyze", {
        table: "test_products",
      });

      expect(typeof payload.success).toBe("boolean");
    } finally {
      await client.close();
    }
  });

  // --- Monitoring tools ---

  test("pg_show_processlist returns processes", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(
        client,
        "pg_show_processlist",
        {},
      );

      expect(typeof payload).toBe("object");
      // Should have some process-related data
      expect(
        Array.isArray(payload.processes) || Array.isArray(payload.rows),
      ).toBe(true);
    } finally {
      await client.close();
    }
  });

  test("pg_database_size returns size info", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_database_size", {});

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg_table_sizes returns { tables, count }", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_table_sizes", {});

      expect(typeof payload).toBe("object");
      expect(Array.isArray(payload.tables)).toBe(true);
      expect(typeof payload.count).toBe("number");
    } finally {
      await client.close();
    }
  });

  test("pg_lock_info returns lock data", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_lock_info", {});

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg_replication_status returns replication info", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(
        client,
        "pg_replication_status",
        {},
      );

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg_connection_stats returns connection data", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(
        client,
        "pg_connection_stats",
        {},
      );

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg_cache_stats returns cache metrics", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_cache_stats", {});

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg_vacuum_stats returns vacuum info", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_vacuum_stats", {});

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg_show_settings returns settings", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_show_settings", {
        category: "memory",
      });

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });
});
