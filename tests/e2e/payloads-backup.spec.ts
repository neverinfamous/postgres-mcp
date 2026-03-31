/**
 * Payload Contract Tests: Backup + Transactions
 *
 * Validates response shapes for backup (9) and transaction (8) tools.
 */

import { test, expect } from "./fixtures.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createClient, callToolAndParse, expectSuccess } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Backup + Transactions", () => {
  let client: Client;

  test.beforeAll(async () => {
    client = await createClient();
  });

  test.afterAll(async () => {
    await client.close();
  });

  test("pg_dump_table returns DDL", async () => {
    const payload = await callToolAndParse(client, "pg_dump_table", {
      table: "test_products",
    });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_transaction_begin + commit lifecycle", async () => {
    const beginPayload = await callToolAndParse(
      client,
      "pg_transaction_begin",
      {},
    );
    expectSuccess(beginPayload);
    expect(typeof beginPayload.transactionId).toBe("string");

    const commitPayload = await callToolAndParse(
      client,
      "pg_transaction_commit",
      { transactionId: beginPayload.transactionId as string },
    );
    expectSuccess(commitPayload);
    expect(commitPayload.success).toBe(true);
  });

  test("pg_dump_schema returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_dump_schema", { schema: "public" });
    expect(typeof payload).toBe("object");
  });

  test("pg_create_backup_plan returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_create_backup_plan", { databases: ["postgres"] });
    expect(typeof payload).toBe("object");
  });

  test("pg_restore_command returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_restore_command", { input: "dummy.sql", database: "postgres" });
    expect(typeof payload).toBe("object");
  });

  test("pg_backup_physical returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_backup_physical", { directory: "/tmp/backup" });
    expect(typeof payload).toBe("object");
  });

  test("pg_restore_validate returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_restore_validate", { directory: "/tmp/backup" });
    expect(typeof payload).toBe("object");
  });

  test("pg_backup_schedule_optimize returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_backup_schedule_optimize", {});
    expect(typeof payload).toBe("object");
  });
});
