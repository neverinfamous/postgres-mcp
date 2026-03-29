/**
 * Payload Contract Tests: Partitioning
 *
 * Validates response shapes for Partitioning (7) tools.
 */

import { test, expect } from "@playwright/test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createClient, callToolAndParse, expectSuccess } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Partitioning", () => {
  let client: Client;
  const testTable = "audit_test_partitioning_payloads";

  test.beforeAll(async () => {
    client = await createClient();
  });

  test.afterAll(async () => {
    await callToolAndParse(client, "pg_drop_table", {
      table: testTable,
      cascade: true,
      ifExists: true,
    });
    await client.close();
  });

  test("pg_create_partitioned_table returns success", async () => {
    const payload = await callToolAndParse(client, "pg_create_partitioned_table", {
      name: testTable,
      columns: [
        { name: "id", type: "serial" },
        { name: "log_date", type: "date" }
      ],
      partitionBy: "range",
      partitionKey: "log_date",
    });
    expectSuccess(payload);
    expect(payload.success).toBe(true);
  });

  test("pg_create_partition returns success", async () => {
    const payload = await callToolAndParse(client, "pg_create_partition", {
      parent: testTable,
      name: testTable + "_2023",
      forValues: "FROM ('2023-01-01') TO ('2024-01-01')",
    });
    expectSuccess(payload);
    expect(payload.success).toBe(true);
  });

  test("pg_list_partitions returns { partitions, count }", async () => {
    const payload = await callToolAndParse(client, "pg_list_partitions", {
      table: testTable,
    });
    expectSuccess(payload);
    expect(Array.isArray(payload.partitions)).toBe(true);
    expect(typeof payload.count).toBe("number");
  });

  test("pg_partition_info returns info array", async () => {
    const payload = await callToolAndParse(client, "pg_partition_info", {
      table: testTable,
    });
    expectSuccess(payload);
    expect(Array.isArray(payload.partitions)).toBe(true);
  });


  test("pg_detach_partition returns success", async () => {
    const payload = await callToolAndParse(client, "pg_detach_partition", {
      parent: testTable,
      partition: testTable + "_2023",
      concurrently: false,
    });
    expectSuccess(payload);
    expect(payload.success).toBe(true);
  });

  test("pg_attach_partition returns success", async () => {
    const payload = await callToolAndParse(client, "pg_attach_partition", {
      parent: testTable,
      partition: testTable + "_2023",
      forValues: "FROM ('2023-01-01') TO ('2024-01-01')",
    });
    expectSuccess(payload);
    expect(payload.success).toBe(true);
  });
});
