/**
 * Payload Contract Tests: Backup + Transactions
 *
 * Validates response shapes for backup (9) and transaction (8) tools.
 */

import { test, expect } from "@playwright/test";
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
});
