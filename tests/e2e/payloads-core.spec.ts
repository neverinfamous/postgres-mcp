/**
 * Payload Contract Tests: Core
 *
 * Validates response shapes for core tools using a shared MCP client.
 */

import { test, expect } from "@playwright/test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createClient, callToolAndParse, expectSuccess } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Core", () => {
  let client: Client;

  test.beforeAll(async () => {
    client = await createClient();
  });

  test.afterAll(async () => {
    await client.close();
  });

  test("pg_read_query returns { rows, rowCount }", async () => {
    const payload = await callToolAndParse(client, "pg_read_query", {
      sql: "SELECT id, name FROM test_products LIMIT 3",
    });
    expectSuccess(payload);
    expect(Array.isArray(payload.rows)).toBe(true);
    expect(typeof payload.rowCount).toBe("number");
    expect(payload.rowCount as number).toBeLessThanOrEqual(3);
  });

  test("pg_list_tables returns { tables, count, totalCount }", async () => {
    const payload = await callToolAndParse(client, "pg_list_tables", {
      limit: 5,
    });
    expectSuccess(payload);
    expect(Array.isArray(payload.tables)).toBe(true);
    expect(typeof payload.count).toBe("number");
    expect(typeof payload.totalCount).toBe("number");
    expect(payload.count as number).toBeLessThanOrEqual(5);
  });

  test("pg_describe_table returns column info", async () => {
    const payload = await callToolAndParse(client, "pg_describe_table", {
      table: "test_products",
    });
    expectSuccess(payload);
    expect(Array.isArray(payload.columns)).toBe(true);
  });

  test("pg_count returns { count }", async () => {
    const payload = await callToolAndParse(client, "pg_count", {
      table: "test_products",
    });
    expectSuccess(payload);
    expect(typeof payload.count).toBe("number");
  });

  test("pg_get_indexes returns { indexes }", async () => {
    const payload = await callToolAndParse(client, "pg_get_indexes", {
      table: "test_products",
    });
    expectSuccess(payload);
    expect(Array.isArray(payload.indexes)).toBe(true);
  });

  test("pg_list_extensions returns { extensions }", async () => {
    const payload = await callToolAndParse(client, "pg_list_extensions", {});
    expectSuccess(payload);
    expect(Array.isArray(payload.extensions)).toBe(true);
  });

  test("pg_analyze_db_health returns health report", async () => {
    const payload = await callToolAndParse(client, "pg_analyze_db_health", {
      includeIndexes: true,
      includeVacuum: true,
      includeConnections: true,
    });
    expectSuccess(payload);
    expect(typeof payload.overallScore).toBe("number");
    expect(typeof payload.overallStatus).toBe("string");
  });

  test("pg_analyze_workload_indexes returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_analyze_workload_indexes", { sql: "SELECT * FROM test_products" });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_analyze_query_indexes returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_analyze_query_indexes", { sql: "SELECT * FROM test_products" });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });
});
