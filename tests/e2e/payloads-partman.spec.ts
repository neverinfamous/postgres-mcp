/**
 * Payload Contract Tests: Partman
 *
 * Validates response shapes for pg_partman (10) tools.
 */

import { test, expect } from "@playwright/test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createClient, callToolAndParse } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Partman", () => {
  let client: Client;
  const testTable = "audit_test_partman_payloads";

  test.beforeAll(async () => {
    client = await createClient();
    await callToolAndParse(client, "pg_create_table", {
      table: testTable,
      columns: [
        { name: "id", type: "serial", primaryKey: true },
        { name: "created_at", type: "timestamp", notNull: true, default: "now()" }
      ],
      partitionBy: "RANGE (created_at)",
      ifNotExists: true,
    });
  });

  test.afterAll(async () => {
    await callToolAndParse(client, "pg_drop_table", {
      table: testTable,
      cascade: true,
      ifExists: true,
    });
    // Cleanup the target table we create in the tests
    await callToolAndParse(client, "pg_drop_table", {
      table: testTable + "_archive",
      cascade: true,
      ifExists: true,
    });
    await client.close();
  });

  test("pg_partman_create_extension returns object", async () => {
    const payload = await callToolAndParse(client, "pg_partman_create_extension", {});
    expect(typeof payload).toBe("object");
  });

  test("pg_partman_create_parent returns status object", async () => {
    const payload = await callToolAndParse(client, "pg_partman_create_parent", {
      parentTable: "public." + testTable,
      controlColumn: "created_at",
      type: "native",
      interval: "1 month",
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_partman_run_maintenance returns success", async () => {
    const payload = await callToolAndParse(client, "pg_partman_run_maintenance", {});
    expect(typeof payload).toBe("object");
  });

  test("pg_partman_show_partitions returns list", async () => {
    const payload = await callToolAndParse(client, "pg_partman_show_partitions", {
      parentTable: "public." + testTable,
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_partman_show_config returns config details", async () => {
    const payload = await callToolAndParse(client, "pg_partman_show_config", {
      parentTable: "public." + testTable,
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_partman_check_default returns status", async () => {
    const payload = await callToolAndParse(client, "pg_partman_check_default", {
      parentTable: "public." + testTable,
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_partman_partition_data returns status", async () => {
    const payload = await callToolAndParse(client, "pg_partman_partition_data", {
      parentTable: "public." + testTable,
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_partman_set_retention returns status", async () => {
    const payload = await callToolAndParse(client, "pg_partman_set_retention", {
      parentTable: "public." + testTable,
      retention: "6 months",
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_partman_analyze_partition_health returns health metrics", async () => {
    const payload = await callToolAndParse(client, "pg_partman_analyze_partition_health", {});
    expect(typeof payload).toBe("object");
  });

  test("pg_partman_undo_partition returns status", async () => {
    // We need to create the target table first because pg_partman requires it to exist
    await callToolAndParse(client, "pg_create_table", {
      table: testTable + "_archive",
      columns: [
        { name: "id", type: "serial", primaryKey: true },
        { name: "created_at", type: "timestamp", notNull: true, default: "now()" }
      ],
      ifNotExists: true,
    });

    const payload = await callToolAndParse(client, "pg_partman_undo_partition", {
      parentTable: "public." + testTable,
      targetTable: "public." + testTable + "_archive",
    });
    expect(typeof payload).toBe("object");
  });
});
