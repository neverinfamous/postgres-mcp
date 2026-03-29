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

  test("pg_stat_statements returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_stat_statements", {});
    expect(typeof payload).toBe("object");
  });

  test("pg_stat_activity returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_stat_activity", {});
    expect(typeof payload).toBe("object");
  });

  test("pg_query_plan_stats returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_query_plan_stats", { queryId: "0" });
    expect(typeof payload).toBe("object");
  });

  test("pg_index_recommendations returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_index_recommendations", {});
    expect(typeof payload).toBe("object");
  });

  test("pg_performance_baseline returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_performance_baseline", { duration: "1 hour" });
    expect(typeof payload).toBe("object");
  });

  test("pg_connection_pool_optimize returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_connection_pool_optimize", {});
    expect(typeof payload).toBe("object");
  });

  test("pg_partition_strategy_suggest returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_partition_strategy_suggest", { table: "test_products", thresholdBytes: 10000 });
    expect(typeof payload).toBe("object");
  });

  test("pg_duplicate_indexes returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_duplicate_indexes", {});
    expect(typeof payload).toBe("object");
  });

  test("pg_detect_connection_spike returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_detect_connection_spike", {});
    expect(typeof payload).toBe("object");
  });

  test("pg_detect_query_anomalies returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_detect_query_anomalies", {});
    expect(typeof payload).toBe("object");
  });

  test("pg_detect_bloat_risk returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_detect_bloat_risk", {});
    expect(typeof payload).toBe("object");
  });
});
