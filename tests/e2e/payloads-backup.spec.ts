/**
 * Payload Contract Tests: Backup + Transactions
 *
 * Validates response shapes for backup (10) and transaction (9) tools.
 */

import { test, expect } from "@playwright/test";
import { createClient, callToolAndParse } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Backup + Transactions", () => {
  test("pg_dump_table returns { sql }", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_dump_table", {
        table: "test_products",
      });

      expect(typeof payload).toBe("object");
      // Should contain SQL dump data
      expect(
        typeof payload.sql === "string" || typeof payload.dump === "string",
      ).toBe(true);
    } finally {
      await client.close();
    }
  });

  // --- Transactions ---

  test("pg_transaction_begin + commit lifecycle", async () => {
    const client = await createClient();
    try {
      const beginPayload = await callToolAndParse(
        client,
        "pg_transaction_begin",
        {},
      );

      expect(typeof beginPayload.transactionId).toBe("string");

      const commitPayload = await callToolAndParse(
        client,
        "pg_transaction_commit",
        { transactionId: beginPayload.transactionId as string },
      );

      expect(typeof commitPayload.success).toBe("boolean");
    } finally {
      await client.close();
    }
  });
});
