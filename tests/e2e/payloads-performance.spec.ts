/**
 * Payload Contract Tests: Performance
 *
 * Validates response shapes for performance tools (24 tools).
 */

import { test, expect } from "@playwright/test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createClient, callToolAndParse, expectSuccess } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Performance", () => {
  let client: Client;

  test.beforeAll(async () => {
    client = await createClient();
  });

  test.afterAll(async () => {
    await client.close();
  });

  test("pg_explain returns query plan", async () => {
    const payload = await callToolAndParse(client, "pg_explain", {
      sql: "SELECT * FROM test_products WHERE id = 1",
    });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_table_stats returns table statistics", async () => {
    const payload = await callToolAndParse(client, "pg_table_stats", {});
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_index_stats returns index usage data", async () => {
    const payload = await callToolAndParse(client, "pg_index_stats", {});
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_seq_scan_tables returns sequential scan data", async () => {
    const payload = await callToolAndParse(client, "pg_seq_scan_tables", {});
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_bloat_check returns bloat data", async () => {
    const payload = await callToolAndParse(client, "pg_bloat_check", {});
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_cache_hit_ratio returns cache metrics", async () => {
    const payload = await callToolAndParse(client, "pg_cache_hit_ratio", {});
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_vacuum_stats returns vacuum data", async () => {
    const payload = await callToolAndParse(client, "pg_vacuum_stats", {});
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_locks returns lock data", async () => {
    const payload = await callToolAndParse(client, "pg_locks", {});
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_unused_indexes returns unused index data", async () => {
    const payload = await callToolAndParse(client, "pg_unused_indexes", {});
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_diagnose_database_performance returns diagnostic report", async () => {
    const payload = await callToolAndParse(
      client,
      "pg_diagnose_database_performance",
      {},
    );
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });
});
