/**
 * Payload Contract Tests: Transactions (Extended)
 *
 * Extended lifecycle tests beyond the basic begin+commit in payloads-backup.spec.ts.
 * Tests savepoints, rollback, execute-within-txn, and status.
 */

import { test, expect } from "./fixtures.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createClient, callToolAndParse, expectSuccess } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Transactions (Extended)", () => {
  let client: Client;

  test.beforeAll(async () => {
    client = await createClient();
  });

  test.afterAll(async () => {
    await client.close();
  });

  test("begin → savepoint → rollback_to → commit lifecycle", async () => {
    // Begin
    const begin = await callToolAndParse(client, "pg_transaction_begin", {});
    expectSuccess(begin);
    const txnId = begin.transactionId as string;
    expect(typeof txnId).toBe("string");

    // Savepoint
    const savepoint = await callToolAndParse(
      client,
      "pg_transaction_savepoint",
      {
        transactionId: txnId,
        name: "sp1",
      },
    );
    expectSuccess(savepoint);

    // Rollback to savepoint
    const rollbackTo = await callToolAndParse(
      client,
      "pg_transaction_rollback_to",
      {
        transactionId: txnId,
        name: "sp1",
      },
    );
    expectSuccess(rollbackTo);

    // Commit
    const commit = await callToolAndParse(client, "pg_transaction_commit", {
      transactionId: txnId,
    });
    expectSuccess(commit);
  });

  test("begin → execute INSERT → rollback → verify row not inserted", async () => {
    // Create a temp table for isolation
    await callToolAndParse(client, "pg_create_table", {
      table: "_e2e_txn_rollback_test",
      columns: [
        { name: "id", type: "SERIAL", primaryKey: true },
        { name: "value", type: "TEXT" },
      ],
      ifNotExists: true,
    });

    try {
      // Begin
      const begin = await callToolAndParse(client, "pg_transaction_begin", {});
      expectSuccess(begin);
      const txnId = begin.transactionId as string;

      // Execute INSERT inside transaction using statements format
      const exec = await callToolAndParse(client, "pg_transaction_execute", {
        transactionId: txnId,
        statements: [
          {
            sql: "INSERT INTO _e2e_txn_rollback_test (value) VALUES ('should_not_persist')",
          },
        ],
      });
      expectSuccess(exec);

      // Rollback
      const rollback = await callToolAndParse(
        client,
        "pg_transaction_rollback",
        {
          transactionId: txnId,
        },
      );
      expectSuccess(rollback);

      // Verify row was NOT inserted
      const check = await callToolAndParse(client, "pg_read_query", {
        query:
          "SELECT COUNT(*) AS cnt FROM _e2e_txn_rollback_test WHERE value = 'should_not_persist'",
      });
      expectSuccess(check);
      const rows = check.rows as Array<{ cnt: number }>;
      expect(Number(rows[0].cnt)).toBe(0);
    } finally {
      // Cleanup
      await callToolAndParse(client, "pg_drop_table", {
        table: "_e2e_txn_rollback_test",
        ifExists: true,
      });
    }
  });

  test("pg_transaction_status returns { status }", async () => {
    // Begin a transaction to check its status
    const begin = await callToolAndParse(client, "pg_transaction_begin", {});
    expectSuccess(begin);
    const txnId = begin.transactionId as string;

    const payload = await callToolAndParse(client, "pg_transaction_status", {
      transactionId: txnId,
    });
    expect(typeof payload.status).toBe("string");
    expect(payload.status).toBe("active");

    // Cleanup — commit the transaction
    await callToolAndParse(client, "pg_transaction_commit", {
      transactionId: txnId,
    });
  });
});
