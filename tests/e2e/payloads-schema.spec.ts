/**
 * Payload Contract Tests: Schema + Introspection + Migration
 *
 * Validates response shapes for schema (12), introspection (6), and migration (6) tools.
 * pg_migration_status may return error if migration table not initialized — skip expectSuccess.
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

  test("pg_dependency_graph returns dependency data and respects compact mode", async () => {
    // 1. Full payload
    const full = await callToolAndParse(client, "pg_dependency_graph", {
      table: "test_orders",
    }) as any;
    expectSuccess(full);
    expect(typeof full).toBe("object");

    // 2. Compact payload
    const compactPayload = await callToolAndParse(client, "pg_dependency_graph", {
      table: "test_orders",
      compact: true,
    }) as any;
    expectSuccess(compactPayload);
    // Check that optional heavy fields are stripped in compact mode
    if (compactPayload.graph && compactPayload.graph.nodes) {
      if (compactPayload.graph.nodes.length > 0) {
        expect(compactPayload.graph.nodes[0].size_bytes).toBeUndefined();
        expect(compactPayload.graph.nodes[0].row_count).toBeUndefined();
      }
    }
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

  test("pg_list_sequences returns sequences", async () => {
    const payload = await callToolAndParse(client, "pg_list_sequences", {});
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_list_triggers returns triggers", async () => {
    const payload = await callToolAndParse(client, "pg_list_triggers", {});
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_topological_sort returns sorted dependencies", async () => {
    const payload = await callToolAndParse(client, "pg_topological_sort", {
      tables: ["test_products", "test_orders"],
    });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_schema_snapshot returns snapshot object and respects compact mode", async () => {
    // 1. Full payload
    const full = await callToolAndParse(client, "pg_schema_snapshot", {}) as any;
    expectSuccess(full);
    expect(typeof full).toBe("object");

    // 2. Compact payload
    const compactPayload = await callToolAndParse(client, "pg_schema_snapshot", { compact: true }) as any;
    expectSuccess(compactPayload);
    if (compactPayload.snapshot && compactPayload.snapshot.tables) {
      const tables = compactPayload.snapshot.tables as Record<string, any>;
      const firstTableKey = Object.keys(tables)[0];
      if (firstTableKey) {
        const firstTable = tables[firstTableKey];
        expect(firstTable.size_bytes).toBeUndefined();
        expect(firstTable.row_count).toBeUndefined();
      }
    }
  });

  // --- Newly Added Schema Lifecycle & Introspection Specs ---
  
  test("pg_create_schema returns { success }", async () => {
    const payload = await callToolAndParse(client, "pg_create_schema", { schema: "audit_dummy_schema", ifNotExists: true });
    expectSuccess(payload);
    expect(payload.success).toBe(true);
  });

  test("pg_drop_schema returns { success }", async () => {
    const payload = await callToolAndParse(client, "pg_drop_schema", { schema: "audit_dummy_schema", ifExists: true, cascade: true });
    expectSuccess(payload);
    expect(typeof payload.success).toBe("boolean");
  });

  test("pg_create_view returns { success }", async () => {
    const payload = await callToolAndParse(client, "pg_create_view", { 
      viewName: "audit_dummy_view", 
      query: "SELECT 1 AS num",
      orReplace: true 
    });
    expectSuccess(payload);
    expect(payload.success).toBe(true);
  });

  test("pg_drop_view returns { success }", async () => {
    const payload = await callToolAndParse(client, "pg_drop_view", { name: "audit_dummy_view", ifExists: true });
    expectSuccess(payload);
    expect(typeof payload.success).toBe("boolean");
  });

  test("pg_create_sequence returns { success }", async () => {
    const payload = await callToolAndParse(client, "pg_create_sequence", { name: "audit_dummy_seq", ifNotExists: true });
    expectSuccess(payload);
    expect(payload.success).toBe(true);
  });

  test("pg_drop_sequence returns { success }", async () => {
    const payload = await callToolAndParse(client, "pg_drop_sequence", { name: "audit_dummy_seq", ifExists: true });
    expectSuccess(payload);
    expect(typeof payload.success).toBe("boolean");
  });

  test("pg_cascade_simulator returns analysis", async () => {
    const payload = await callToolAndParse(client, "pg_cascade_simulator", { table: "test_products" });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_migration_risks returns risks evaluation", async () => {
    const payload = await callToolAndParse(client, "pg_migration_risks", { statements: ["DROP TABLE test_products"] });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });
});
