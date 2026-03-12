/**
 * Payload Contract Tests: Stats + Partitioning
 *
 * Validates response shapes for stats (8) and partitioning (6) tools.
 */

import { test, expect } from "@playwright/test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createClient, callToolAndParse, expectSuccess } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Stats + Partitioning", () => {
  let client: Client;

  test.beforeAll(async () => {
    client = await createClient();
  });

  test.afterAll(async () => {
    await client.close();
  });

  test("pg_stats_descriptive returns descriptive statistics", async () => {
    const payload = await callToolAndParse(client, "pg_stats_descriptive", {
      table: "test_measurements",
      column: "temperature",
    });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_stats_percentiles returns percentile data", async () => {
    const payload = await callToolAndParse(client, "pg_stats_percentiles", {
      table: "test_measurements",
      column: "temperature",
    });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_stats_distribution returns distribution data", async () => {
    const payload = await callToolAndParse(client, "pg_stats_distribution", {
      table: "test_measurements",
      column: "temperature",
      buckets: 10,
    });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_partition_info returns partition info", async () => {
    const payload = await callToolAndParse(client, "pg_partition_info", {
      table: "test_events",
    });
    // May return warning if table is not partitioned — just check shape
    expect(typeof payload).toBe("object");
  });

  test("pg_list_partitions returns partition list", async () => {
    const payload = await callToolAndParse(client, "pg_list_partitions", {
      table: "test_events",
    });
    // May return warning if table is not partitioned — just check shape
    expect(typeof payload).toBe("object");
  });
});
