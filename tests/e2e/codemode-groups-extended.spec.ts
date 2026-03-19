/**
 * E2E Tests: Code Mode Tool Groups (Extended)
 *
 * Exercises codemode groups NOT covered by codemode-groups.spec.ts.
 * Only includes groups that work without extension dependencies.
 *
 * Already covered: core, jsonb, stats, text, performance, introspection,
 * migration, monitoring, schema, admin.
 *
 * Added here: transactions, backup.
 */

import { test, expect } from "@playwright/test";
import {
  createClient,
  getBaseURL,
  callToolAndParse,
  expectSuccess,
} from "./helpers.js";

test.describe.configure({ mode: "serial" });

// =============================================================================
// Transactions Group via Code Mode
// =============================================================================

test.describe("Code Mode Groups: Transactions", () => {
  test("pg.transactions.begin() + commit()", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: `
          const begin = await pg.transactions.begin({});
          const txnId = begin.transactionId;
          const commit = await pg.transactions.commit({ transactionId: txnId });
          return { begun: !!txnId, committed: commit.success };
        `,
      });
      expectSuccess(p);
      const result = p.result as Record<string, unknown>;
      expect(result.begun).toBe(true);
      expect(result.committed).toBe(true);
    } finally {
      await client.close();
    }
  });

  test("pg.transactions.status()", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: `
          const begin = await pg.transactions.begin({});
          const txnId = begin.transactionId;
          const result = await pg.transactions.status({ transactionId: txnId });
          await pg.transactions.commit({ transactionId: txnId });
          return { status: result.status, active: result.active };
        `,
      });
      expectSuccess(p);
      const result = p.result as Record<string, unknown>;
      expect(result.status).toBe("active");
      expect(result.active).toBe(true);
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// Backup Group via Code Mode
// =============================================================================

test.describe("Code Mode Groups: Backup", () => {
  test("pg.backup.dumpTable()", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: `
          const result = await pg.backup.dumpTable({ table: "test_products" });
          return { success: result.success };
        `,
      });
      expectSuccess(p);
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// Partitioning Group via Code Mode (uses core PG features, no extension needed)
// =============================================================================

test.describe("Code Mode Groups: Partitioning", () => {
  test("pg.partitioning.partitionInfo()", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: `
          const result = await pg.partitioning.partitionInfo({ table: "test_events" });
          return { hasResult: typeof result === "object" };
        `,
      });
      expectSuccess(p);
    } finally {
      await client.close();
    }
  });
});
