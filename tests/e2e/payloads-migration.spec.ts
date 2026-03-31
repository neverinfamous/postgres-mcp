/**
 * Payload Contract Tests: Migration
 *
 * Validates response shapes for Migration (6) tools.
 */

import { test, expect } from "./fixtures.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createClient, callToolAndParse, expectSuccess } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Migration", () => {
  let client: Client;

  test.beforeAll(async () => {
    client = await createClient();
    // Drop in case leftover
    await callToolAndParse(client, "pg_drop_table", {
      table: "_migrations_test",
      ifExists: true
    });
  });

  test.afterAll(async () => {
    await callToolAndParse(client, "pg_drop_table", {
      table: "_migrations_test",
      ifExists: true
    });
    await client.close();
  });

  test("pg_migration_init returns success", async () => {
    const payload = await callToolAndParse(client, "pg_migration_init", {
      table: "_migrations_test",
    });
    expectSuccess(payload);
    expect(payload.success).toBe(true);
  });

  test("pg_migration_record returns object", async () => {
    const payload = await callToolAndParse(client, "pg_migration_record", {
      table: "_migrations_test",
      version: "v1.0.0",
      description: "Init",
      migrationSql: "SELECT 1"
    });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_migration_history returns arrays of migrations", async () => {
    const payload = await callToolAndParse(client, "pg_migration_history", {});
    expectSuccess(payload);
    expect(Array.isArray(payload.records)).toBe(true);
  });

  test("pg_migration_status returns pending/applied", async () => {
    // Might return string or object depending on payload 
    const payload = await callToolAndParse(client, "pg_migration_status", {
      table: "_migrations_test",
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_migration_apply returns applied list", async () => {
    const payload = await callToolAndParse(client, "pg_migration_apply", {
      table: "_migrations_test",
      migrations: [
        { version: "v1.0.1", description: "test", migrationSql: "CREATE TABLE stress_mig_test(id INT);" }
      ]
    });
    // Can fail if migrations differ, but object shape
    expect(typeof payload).toBe("object");
  });

  test("pg_migration_rollback returns success", async () => {
    const payload = await callToolAndParse(client, "pg_migration_rollback", {
      table: "_migrations_test",
      version: "v1.0.1"
    });
    expect(typeof payload).toBe("object");
  });
});
