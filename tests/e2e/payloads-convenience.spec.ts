/**
 * Payload Contract Tests: Convenience Tools
 *
 * Tests untested core convenience/utility tools:
 * pg_upsert, pg_batch_insert, pg_exists, pg_list_objects, pg_object_details.
 *
 * Uses _e2e_convenience_* temp tables with cleanup.
 */

import { test, expect } from "./fixtures.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  createClient,
  callToolAndParse,
  expectSuccess,
  expectHandlerError,
} from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Convenience Tools", () => {
  let client: Client;

  test.beforeAll(async () => {
    client = await createClient();

    // Create a temp table for upsert/batch tests
    await callToolAndParse(client, "pg_create_table", {
      table: "_e2e_convenience_ops",
      columns: [
        { name: "id", type: "SERIAL", primaryKey: true },
        { name: "name", type: "TEXT", unique: true },
        { name: "value", type: "INTEGER" },
      ],
      ifNotExists: true,
    });
  });

  test.afterAll(async () => {
    // Cleanup temp table
    try {
      await callToolAndParse(client, "pg_drop_table", {
        table: "_e2e_convenience_ops",
        ifExists: true,
      });
    } finally {
      await client.close();
    }
  });

  test("pg_batch_insert inserts multiple rows", async () => {
    const payload = await callToolAndParse(client, "pg_batch_insert", {
      table: "_e2e_convenience_ops",
      rows: [
        { name: "alpha", value: 10 },
        { name: "beta", value: 20 },
        { name: "gamma", value: 30 },
      ],
    });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_upsert creates then updates a row", async () => {
    // First upsert — should insert
    const insert = await callToolAndParse(client, "pg_upsert", {
      table: "_e2e_convenience_ops",
      data: { name: "delta", value: 40 },
      conflictColumns: ["name"],
    });
    expectSuccess(insert);

    // Second upsert — same name, different value — should update
    const update = await callToolAndParse(client, "pg_upsert", {
      table: "_e2e_convenience_ops",
      data: { name: "delta", value: 99 },
      conflictColumns: ["name"],
    });
    expectSuccess(update);
  });

  test("pg_exists returns true for existing table", async () => {
    const payload = await callToolAndParse(client, "pg_exists", {
      table: "_e2e_convenience_ops",
    });
    expectSuccess(payload);
    expect(payload.exists).toBe(true);
  });

  test("pg_exists on nonexistent table returns structured error", async () => {
    const payload = await callToolAndParse(client, "pg_exists", {
      table: "_e2e_nonexistent_xyz_999",
    });
    // pg_exists checks row existence within a table — nonexistent table is a handler error
    expectHandlerError(payload);
  });

  test("pg_list_objects returns objects array", async () => {
    const payload = await callToolAndParse(client, "pg_list_objects", {});
    expectSuccess(payload);
    expect(Array.isArray(payload.objects)).toBe(true);
    expect((payload.objects as unknown[]).length).toBeGreaterThan(0);
  });

  test("pg_object_details returns detail for a table", async () => {
    const payload = await callToolAndParse(client, "pg_object_details", {
      name: "test_products",
    });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });
});
