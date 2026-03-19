/**
 * Payload Contract Tests: Admin + Monitoring
 *
 * Validates response shapes for admin (11) and monitoring (11) tools.
 */

import { test, expect } from "@playwright/test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createClient, callToolAndParse, expectSuccess } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Admin + Monitoring", () => {
  let client: Client;

  test.beforeAll(async () => {
    client = await createClient();
  });

  test.afterAll(async () => {
    await client.close();
  });

  test("pg_analyze returns { success }", async () => {
    const payload = await callToolAndParse(client, "pg_analyze", {
      table: "test_products",
    });
    expectSuccess(payload);
    expect(payload.success).toBe(true);
  });

  test("pg_database_size returns { bytes, size }", async () => {
    const payload = await callToolAndParse(client, "pg_database_size", {});
    expectSuccess(payload);
    expect(typeof payload.bytes).toBe("number");
    expect(typeof payload.size).toBe("string");
  });

  test("pg_table_sizes returns { tables, count }", async () => {
    const payload = await callToolAndParse(client, "pg_table_sizes", {});
    expectSuccess(payload);
    expect(Array.isArray(payload.tables)).toBe(true);
    expect(typeof payload.count).toBe("number");
  });

  test("pg_connection_stats returns connection data", async () => {
    const payload = await callToolAndParse(client, "pg_connection_stats", {});
    expectSuccess(payload);
    expect(typeof payload.totalConnections).toBe("number");
    expect(typeof payload.maxConnections).toBe("number");
  });

  test("pg_replication_status returns { role }", async () => {
    const payload = await callToolAndParse(
      client,
      "pg_replication_status",
      {},
    );
    expectSuccess(payload);
    expect(typeof payload.role).toBe("string");
  });

  test("pg_server_version returns version info", async () => {
    const payload = await callToolAndParse(client, "pg_server_version", {});
    expectSuccess(payload);
    expect(typeof payload.version).toBe("string");
  });

  test("pg_show_settings returns { settings, count }", async () => {
    const payload = await callToolAndParse(client, "pg_show_settings", {
      pattern: "shared_buffers",
    });
    expectSuccess(payload);
    expect(Array.isArray(payload.settings)).toBe(true);
    expect(typeof payload.count).toBe("number");
  });

  test("pg_uptime returns uptime data", async () => {
    const payload = await callToolAndParse(client, "pg_uptime", {});
    expectSuccess(payload);
    expect(typeof payload.uptime).toBe("object");
  });

  test("pg_recovery_status returns { in_recovery }", async () => {
    const payload = await callToolAndParse(client, "pg_recovery_status", {});
    expectSuccess(payload);
    expect(typeof payload.in_recovery).toBe("boolean");
  });

  test("pg_capacity_planning returns forecast", async () => {
    const payload = await callToolAndParse(client, "pg_capacity_planning", {});
    expectSuccess(payload);
    expect(typeof payload.current).toBe("object");
    expect(typeof payload.growth).toBe("object");
    expect(typeof payload.projection).toBe("object");
  });

  test("pg_append_insight returns { success, insightCount }", async () => {
    const payload = await callToolAndParse(client, "pg_append_insight", {
      insight: "E2E test insight: database is healthy",
    });
    expectSuccess(payload);
    expect(typeof payload.insightCount).toBe("number");
    expect(payload.insightCount).toBeGreaterThan(0);
  });
});
