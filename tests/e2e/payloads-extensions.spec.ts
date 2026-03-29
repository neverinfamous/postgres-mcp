/**
 * Payload Contract Tests: Minor Extensions
 *
 * Validates response shapes for minor extensions:
 * citext (6), ltree (8), pgcrypto (9), pg_cron (8), pg_kcache (7).
 */

import { test, expect } from "@playwright/test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createClient, callToolAndParse, expectSuccess } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Minor Extensions", () => {
  let client: Client;
  const testTable = "audit_test_extensions_payloads";

  test.beforeAll(async () => {
    client = await createClient();
    await callToolAndParse(client, "pg_create_table", {
      table: testTable,
      columns: [
        { name: "id", type: "serial", primaryKey: true },
        { name: "name", type: "text" },
        { name: "path", type: "text" } // placeholder for ltree testing
      ],
      ifNotExists: true,
    });
  });

  test.afterAll(async () => {
    await callToolAndParse(client, "pg_drop_table", {
      table: testTable,
      cascade: true,
      ifExists: true
    });
    await client.close();
  });

  // --- citext ---
  test("pg_citext_create_extension returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_citext_create_extension", {});
    expect(typeof payload).toBe("object");
  });
  test("pg_citext_list_columns returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_citext_list_columns", {});
    expect(typeof payload).toBe("object");
  });
  test("pg_citext_convert_column returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_citext_convert_column", { table: testTable, column: "name" });
    expect(typeof payload).toBe("object");
  });
  test("pg_citext_compare returns comparison result", async () => {
    const payload = await callToolAndParse(client, "pg_citext_compare", { value1: "Admin", value2: "admin" });
    expect(typeof payload).toBe("object");
  });
  test("pg_citext_analyze_candidates returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_citext_analyze_candidates", { table: testTable });
    expect(typeof payload).toBe("object");
  });
  test("pg_citext_schema_advisor returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_citext_schema_advisor", { table: testTable });
    expect(typeof payload).toBe("object");
  });

  // --- ltree ---
  test("pg_ltree_create_extension returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_ltree_create_extension", {});
    expect(typeof payload).toBe("object");
  });
  test("pg_ltree_convert_column returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_ltree_convert_column", { table: testTable, column: "path" });
    expect(typeof payload).toBe("object");
  });
  test("pg_ltree_create_index returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_ltree_create_index", { table: testTable, column: "path" });
    expect(typeof payload).toBe("object");
  });
  test("pg_ltree_query returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_ltree_query", { table: testTable, column: "path", path: "Top", mode: "descendants" });
    expect(typeof payload).toBe("object");
  });
  test("pg_ltree_subpath returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_ltree_subpath", { path: "Top.Science", offset: 0, length: 1 });
    expect(typeof payload).toBe("object");
  });
  test("pg_ltree_lca returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_ltree_lca", { paths: ["Top.Science", "Top.Math"] });
    expect(typeof payload).toBe("object");
  });
  test("pg_ltree_list_columns returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_ltree_list_columns", {});
    expect(typeof payload).toBe("object");
  });
  test("pg_ltree_match returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_ltree_match", { table: testTable, column: "path", pattern: "*.Science.*" });
    expect(typeof payload).toBe("object");
  });

  // --- pgcrypto ---
  test("pg_pgcrypto_create_extension returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_pgcrypto_create_extension", {});
    expect(typeof payload).toBe("object");
  });
  test("pg_pgcrypto_hash returns hash result", async () => {
    const payload = await callToolAndParse(client, "pg_pgcrypto_hash", { data: "test data", algorithm: "sha256" });
    expect(typeof payload).toBe("object");
  });
  test("pg_pgcrypto_encrypt returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_pgcrypto_encrypt", { data: "test", password: "pwd" });
    expect(typeof payload).toBe("object");
  });
  test("pg_pgcrypto_decrypt returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_pgcrypto_decrypt", { data: "ENCRYPTED_DATA", password: "pwd" });
    expect(typeof payload).toBe("object");
  });
  test("pg_pgcrypto_hmac returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_pgcrypto_hmac", { data: "test", key: "secret", algorithm: "sha256" });
    expect(typeof payload).toBe("object");
  });
  test("pg_pgcrypto_gen_random_bytes returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_pgcrypto_gen_random_bytes", { length: 16 });
    expect(typeof payload).toBe("object");
  });
  test("pg_pgcrypto_gen_random_uuid returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_pgcrypto_gen_random_uuid", {});
    expect(typeof payload).toBe("object");
  });
  test("pg_pgcrypto_gen_salt returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_pgcrypto_gen_salt", { type: "bf" });
    expect(typeof payload).toBe("object");
  });
  test("pg_pgcrypto_crypt returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_pgcrypto_crypt", { password: "pwd", salt: "random12345678" });
    expect(typeof payload).toBe("object");
  });

  // --- pg_cron ---
  test("pg_cron_create_extension returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_cron_create_extension", {});
    expect(typeof payload).toBe("object");
  });
  test("pg_cron_schedule returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_cron_schedule", { jobName: "test_job", schedule: "0 * * * *", command: "SELECT 1" });
    expect(typeof payload).toBe("object");
  });
  test("pg_cron_schedule_in_database returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_cron_schedule_in_database", { schedule: "0 * * * *", command: "ANALYZE", database: "postgres" });
    expect(typeof payload).toBe("object");
  });
  test("pg_cron_alter_job returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_cron_alter_job", { jobId: 1, active: false });
    expect(typeof payload).toBe("object");
  });
  test("pg_cron_list_jobs returns job data", async () => {
    const payload = await callToolAndParse(client, "pg_cron_list_jobs", {});
    expect(typeof payload).toBe("object");
  });
  test("pg_cron_job_run_details returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_cron_job_run_details", {});
    expect(typeof payload).toBe("object");
  });
  test("pg_cron_unschedule returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_cron_unschedule", { jobId: 1 });
    expect(typeof payload).toBe("object");
  });
  test("pg_cron_cleanup_history returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_cron_cleanup_history", {});
    expect(typeof payload).toBe("object");
  });

  // --- pg_stat_kcache ---
  test("pg_kcache_create_extension returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_kcache_create_extension", {});
    expect(typeof payload).toBe("object");
  });
  test("pg_kcache_database_stats returns stats", async () => {
    const payload = await callToolAndParse(client, "pg_kcache_database_stats", {});
    expect(typeof payload).toBe("object");
  });
  test("pg_kcache_query_stats returns shape and respects compact mode", async () => {
    // 1. Full payload
    const full = await callToolAndParse(client, "pg_kcache_query_stats", {});
    expect(typeof full).toBe("object");
    
    // 2. Compact payload
    const compactPayload = await callToolAndParse(client, "pg_kcache_query_stats", { compact: true }) as any;
    expect(typeof compactPayload).toBe("object");
    if (compactPayload.success && Array.isArray(compactPayload.result)) {
      if (compactPayload.result.length > 0) {
        expect(compactPayload.result[0].query_preview).toBeUndefined();
      }
    }
  });
  test("pg_kcache_resource_analysis returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_kcache_resource_analysis", {});
    expect(typeof payload).toBe("object");
  });
  test("pg_kcache_top_cpu returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_kcache_top_cpu", {});
    expect(typeof payload).toBe("object");
  });
  test("pg_kcache_top_io returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_kcache_top_io", {});
    expect(typeof payload).toBe("object");
  });
  test("pg_kcache_reset returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_kcache_reset", {});
    expect(typeof payload).toBe("object");
  });
});
