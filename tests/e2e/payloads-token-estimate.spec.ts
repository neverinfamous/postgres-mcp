/**
 * E2E Payload Contract Tests: _meta.tokenEstimate
 *
 * Asserts that every tool response includes `_meta.tokenEstimate` in its
 * JSON payload and that the Code Mode handler surfaces `metrics.tokenEstimate`
 * in its returned object. These tests provide the end-to-end contract
 * guarantee that the feature works across the full MCP wire path.
 */

import { test, expect } from "./fixtures.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createClient, callToolAndParse, expectSuccess } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: _meta.tokenEstimate", () => {
  let client: Client;

  test.beforeAll(async () => {
    client = await createClient();
  });

  test.afterAll(async () => {
    await client.close();
  });

  // ─── Standard tool responses ─────────────────────────────────────────────

  test("pg_read_query response includes _meta.tokenEstimate", async () => {
    const payload = await callToolAndParse(client, "pg_read_query", {
      sql: "SELECT id, name FROM test_products LIMIT 3",
    });
    expectSuccess(payload);
    const meta = payload._meta as Record<string, unknown> | undefined;
    expect(meta, "Expected _meta to be present in payload").toBeDefined();
    expect(typeof meta?.tokenEstimate).toBe("number");
    expect(meta!.tokenEstimate as number).toBeGreaterThan(0);
  });

  test("pg_list_tables response includes _meta.tokenEstimate", async () => {
    const payload = await callToolAndParse(client, "pg_list_tables", {
      limit: 5,
    });
    expectSuccess(payload);
    const meta = payload._meta as Record<string, unknown> | undefined;
    expect(meta).toBeDefined();
    expect(typeof meta?.tokenEstimate).toBe("number");
    expect(meta!.tokenEstimate as number).toBeGreaterThan(0);
  });

  test("pg_count response includes _meta.tokenEstimate", async () => {
    const payload = await callToolAndParse(client, "pg_count", {
      table: "test_products",
    });
    expectSuccess(payload);
    const meta = payload._meta as Record<string, unknown> | undefined;
    expect(meta).toBeDefined();
    expect(typeof meta?.tokenEstimate).toBe("number");
    expect(meta!.tokenEstimate as number).toBeGreaterThan(0);
  });

  // ─── Error Responses ─────────────────────────────────────────────────────

  test("tool failure response includes _meta.tokenEstimate", async () => {
    // Intentionally cause a database error
    const payload = await callToolAndParse(client, "pg_read_query", {
      sql: "SELECT * FROM non_existent_table_for_token_test",
    });

    // Should be a structured error response, but still have _meta
    expect(payload.success).toBe(false);
    expect(payload.error).toBeDefined();

    const meta = payload._meta as Record<string, unknown> | undefined;
    expect(
      meta,
      "Expected _meta to be present in structured error response payload",
    ).toBeDefined();
    expect(typeof meta?.tokenEstimate).toBe("number");
    expect(meta!.tokenEstimate as number).toBeGreaterThan(0);
  });

  // ─── Proportionality ──────────────────────────────────────────────────────

  test("tokenEstimate is proportional to payload size (LIMIT 1 vs LIMIT 50)", async () => {
    const small = await callToolAndParse(client, "pg_read_query", {
      sql: "SELECT id, name FROM test_products LIMIT 1",
    });
    const large = await callToolAndParse(client, "pg_read_query", {
      sql: "SELECT id, name FROM test_products LIMIT 50",
    });

    expectSuccess(small);
    expectSuccess(large);

    const smallEstimate = (small._meta as Record<string, unknown>)
      ?.tokenEstimate as number;
    const largeEstimate = (large._meta as Record<string, unknown>)
      ?.tokenEstimate as number;

    expect(typeof smallEstimate).toBe("number");
    expect(typeof largeEstimate).toBe("number");

    // Larger payload must have same or higher token estimate.
    // (Equal is acceptable if test_products has exactly 1 row.)
    expect(largeEstimate).toBeGreaterThanOrEqual(smallEstimate);
  });

  // ─── Code Mode ───────────────────────────────────────────────────────────

  test("pg_execute_code response includes metrics.tokenEstimate", async () => {
    const payload = await callToolAndParse(client, "pg_execute_code", {
      code: `
        const result = await pg.core.readQuery({
          sql: "SELECT id, name FROM test_products LIMIT 5"
        });
        return result.rows;
      `,
    });

    expectSuccess(payload);

    // Code Mode returns metrics as a sibling of result/success
    const metrics = payload.metrics as Record<string, unknown> | undefined;
    expect(
      metrics,
      "Expected metrics to be present in pg_execute_code response",
    ).toBeDefined();
    expect(typeof metrics?.tokenEstimate).toBe("number");
    expect(metrics!.tokenEstimate as number).toBeGreaterThan(0);

    // wallTimeMs and cpuTimeMs must also be present (original metrics preserved)
    expect(typeof metrics?.wallTimeMs).toBe("number");
  });

  test("pg_execute_code failure response includes metrics.tokenEstimate", async () => {
    const payload = await callToolAndParse(client, "pg_execute_code", {
      code: `
        // Intentionally throw an error inside the sandbox
        throw new Error("Simulated sandbox failure");
      `,
    });

    expect(payload.success).toBe(false);
    expect(payload.error).toContain("Simulated sandbox failure");

    // Code Mode should still return metrics on failure
    const metrics = payload.metrics as Record<string, unknown> | undefined;
    expect(
      metrics,
      "Expected metrics to be present in failed pg_execute_code response",
    ).toBeDefined();
    expect(typeof metrics?.tokenEstimate).toBe("number");
    expect(metrics!.tokenEstimate as number).toBeGreaterThan(0);
  });
});
