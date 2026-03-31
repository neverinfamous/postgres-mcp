/**
 * Payload Contract Tests: Stats + Partitioning
 *
 * Validates response shapes for stats (19) and partitioning (6) tools.
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

  // --- Window Functions ---

  test("pg_stats_row_number returns { success, rowCount, rows }", async () => {
    const payload = await callToolAndParse(client, "pg_stats_row_number", {
      table: "test_products",
      orderBy: "price",
      limit: 5,
    });
    expectSuccess(payload);
    expect(typeof payload.rowCount).toBe("number");
    expect(Array.isArray(payload.rows)).toBe(true);
  });

  test("pg_stats_rank returns { success, rankType, rowCount }", async () => {
    const payload = await callToolAndParse(client, "pg_stats_rank", {
      table: "test_products",
      orderBy: "price",
      limit: 5,
    });
    expectSuccess(payload);
    expect(payload.rankType).toBe("rank");
    expect(typeof payload.rowCount).toBe("number");
  });

  // --- Outlier Detection ---

  test("pg_stats_outliers returns { success, method, stats }", async () => {
    const payload = await callToolAndParse(client, "pg_stats_outliers", {
      table: "test_measurements",
      column: "temperature",
    });
    expectSuccess(payload);
    expect(payload.method).toBe("iqr");
    expect(typeof payload.stats).toBe("object");
    expect(typeof payload.outlierCount).toBe("number");
  });

  // --- Advanced Analysis ---

  test("pg_stats_top_n returns { success, column, count, rows }", async () => {
    const payload = await callToolAndParse(client, "pg_stats_top_n", {
      table: "test_products",
      column: "price",
      n: 3,
    });
    expectSuccess(payload);
    expect(payload.column).toBe("price");
    expect(typeof payload.count).toBe("number");
    expect(Array.isArray(payload.rows)).toBe(true);
  });

  test("pg_stats_top_n caps or rejects excessively large 'n' limits", async () => {
    const rawResult = await client.callTool({
      name: "pg_stats_top_n",
      arguments: {
        table: "test_products",
        column: "price",
        n: 5000,
      },
    });

    const first = (rawResult as any).content[0];
    const response = JSON.parse((first as any).text);
    if (response.success === false) {
      expect(response.code).toBe("VALIDATION_ERROR");
      expect(response.error).toContain("cannot exceed 100");
    } else {
      expect(response.success).toBe(true);
      expect(response.rows.length).toBeLessThanOrEqual(100);
    }
  });

  test("pg_stats_frequency returns { success, distribution }", async () => {
    const payload = await callToolAndParse(client, "pg_stats_frequency", {
      table: "test_products",
      column: "name",
    });
    expectSuccess(payload);
    expect(Array.isArray(payload.distribution)).toBe(true);
    expect(typeof payload.distinctValues).toBe("number");
  });

  test("pg_stats_summary returns { success, summaries }", async () => {
    const payload = await callToolAndParse(client, "pg_stats_summary", {
      table: "test_products",
      columns: ["price"],
    });
    expectSuccess(payload);
    expect(Array.isArray(payload.summaries)).toBe(true);
    expect((payload.summaries as any[]).length).toBeGreaterThan(0);
    expect((payload.summaries as any[])[0].column).toBe("price");
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

  test("pg_stats_lag_lead returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_stats_lag_lead", { table: "test_products", column: "price", orderBy: "id" });
    expect(typeof payload).toBe("object");
  });

  test("pg_stats_running_total returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_stats_running_total", { table: "test_products", column: "price", orderBy: "id" });
    expect(typeof payload).toBe("object");
  });

  test("pg_stats_moving_avg returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_stats_moving_avg", { table: "test_products", column: "price", orderBy: "id", window: 3 });
    expect(typeof payload).toBe("object");
  });

  test("pg_stats_ntile returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_stats_ntile", { table: "test_products", orderBy: "id", buckets: 4 });
    expect(typeof payload).toBe("object");
  });

  test("pg_stats_distinct returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_stats_distinct", { table: "test_products", column: "price" });
    expect(typeof payload).toBe("object");
  });
});
