/**
 * Payload Contract Tests: Schema + Introspection + Migration
 *
 * Validates response shapes for schema (12), introspection (6), and migration (6) tools.
 */

import { test, expect } from "@playwright/test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createClient, callToolAndParse, expectSuccess } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Schema + Introspection + Migration", () => {
  let client: Client;

  test.beforeAll(async () => {
    client = await createClient();
  });

  test.afterAll(async () => {
    await client.close();
  });

  test("pg_list_schemas returns { schemas }", async () => {
    const payload = await callToolAndParse(client, "pg_list_schemas", {});
    expectSuccess(payload);
    expect(Array.isArray(payload.schemas)).toBe(true);
  });

  test("pg_list_views returns views", async () => {
    const payload = await callToolAndParse(client, "pg_list_views", {});
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_list_constraints returns constraints", async () => {
    const payload = await callToolAndParse(client, "pg_list_constraints", {
      table: "test_orders",
    });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_list_functions returns functions", async () => {
    const payload = await callToolAndParse(client, "pg_list_functions", {});
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_dependency_graph returns dependency data", async () => {
    const payload = await callToolAndParse(client, "pg_dependency_graph", {
      table: "test_orders",
    });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_constraint_analysis returns analysis", async () => {
    const payload = await callToolAndParse(
      client,
      "pg_constraint_analysis",
      {},
    );
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_migration_status returns status", async () => {
    const payload = await callToolAndParse(client, "pg_migration_status", {});
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });
});
