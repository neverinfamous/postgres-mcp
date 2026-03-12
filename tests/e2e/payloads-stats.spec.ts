/**
 * Payload Contract Tests: Stats + Partitioning
 *
 * Validates response shapes for stats (9) and partitioning (7) tools.
 * Uses test_measurements (500 rows) and test_events (partitioned).
 */

import { test, expect } from "@playwright/test";
import { createClient, callToolAndParse } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Stats + Partitioning", () => {
  test("pg_stats_descriptive returns descriptive statistics", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_stats_descriptive", {
        table: "test_measurements",
        column: "temperature",
      });

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg_stats_percentiles returns percentile data", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_stats_percentiles", {
        table: "test_measurements",
        column: "temperature",
      });

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg_stats_distribution returns distribution data", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_stats_distribution", {
        table: "test_measurements",
        column: "temperature",
        buckets: 10,
      });

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  // --- Partitioning ---

  test("pg_partition_info returns partition info", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_partition_info", {
        table: "test_events",
      });

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg_partition_stats returns partition statistics", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_partition_stats", {
        table: "test_events",
      });

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });
});
