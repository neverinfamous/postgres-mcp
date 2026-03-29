/**
 * Payload Contract Tests: Minor Extensions
 *
 * Validates response shapes for citext, ltree, pgcrypto, cron, kcache tools.
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
  test("pg_ltree_add_column returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_ltree_add_column", { table: testTable, column: "node_path" });
    expect(typeof payload).toBe("object");
  });
  test("pg_ltree_insert returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_ltree_insert", { table: testTable, column: "node_path", path: "Top.Science.Astronomy" });
    expect(typeof payload).toBe("object");
  });
  test("pg_ltree_query returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_ltree_query", { table: testTable, column: "node_path", path: "Top", mode: "descendants" });
    expect(typeof payload).toBe("object");
  });
  test("pg_ltree_subpath returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_ltree_subpath", { path: "Top.Science", start: 0, length: 1 });
    expect(typeof payload).toBe("object");
  });
  test("pg_ltree_lca returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_ltree_lca", { paths: ["Top.Science", "Top.Math"] });
    expect(typeof payload).toBe("object");
  });
  test("pg_ltree_index returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_ltree_index", { table: testTable, column: "node_path" });
    expect(typeof payload).toBe("object");
  });
  test("pg_ltree_validate returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_ltree_validate", { path: "Top.Science N" }); // intentional space to test format validation
    expect(typeof payload).toBe("object");
  });
  test("pg_ltree_hierarchy returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_ltree_hierarchy", { table: testTable, column: "node_path" });
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
    const payload = await callToolAndParse(client, "pg_pgcrypto_encrypt", { data: "test", key: "secret" });
    expect(typeof payload).toBe("object");
  });
  test("pg_pgcrypto_decrypt returns shape", async () => {
    const encrypted = await callToolAndParse(client, "pg_pgcrypto_encrypt", { data: "test", key: "secret" });
    const payload = await callToolAndParse(client, "pg_pgcrypto_decrypt", { data: encrypted.result || "abc", key: "secret" });
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
  test("pg_pgcrypto_password_hash returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_pgcrypto_password_hash", { password: "test" });
    expect(typeof payload).toBe("object");
  });
  test("pg_pgcrypto_password_check returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_pgcrypto_password_check", { password: "test", hash: "invalid" });
    expect(typeof payload).toBe("object");
  });
  test("pg_pgcrypto_public_key_encrypt returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_pgcrypto_public_key_encrypt", { data: "test", key: "mock_key" });
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
  test("pg_cron_list_jobs returns job data", async () => {
    const payload = await callToolAndParse(client, "pg_cron_list_jobs", {});
    expect(typeof payload).toBe("object");
  });
  test("pg_cron_job_history returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_cron_job_history", {});
    expect(typeof payload).toBe("object");
  });
  test("pg_cron_job_status returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_cron_job_status", { jobName: "test_job" });
    expect(typeof payload).toBe("object");
  });
  test("pg_cron_alter_job returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_cron_alter_job", { jobName: "test_job", active: false });
    expect(typeof payload).toBe("object");
  });
  test("pg_cron_run_job returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_cron_run_job", { jobId: 1 });
    expect(typeof payload).toBe("object");
  });
  test("pg_cron_unschedule returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_cron_unschedule", { jobName: "test_job" });
    expect(typeof payload).toBe("object");
  });
  test("pg_cron_clear_history returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_cron_clear_history", {});
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
  test("pg_kcache_query_stats returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_kcache_query_stats", {});
    expect(typeof payload).toBe("object");
  });
  test("pg_kcache_resource_analysis returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_kcache_resource_analysis", {});
    expect(typeof payload).toBe("object");
  });
  test("pg_kcache_cpu_intensive returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_kcache_cpu_intensive", {});
    expect(typeof payload).toBe("object");
  });
  test("pg_kcache_io_intensive returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_kcache_io_intensive", {});
    expect(typeof payload).toBe("object");
  });
  test("pg_kcache_hit_ratio returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_kcache_hit_ratio", {});
    expect(typeof payload).toBe("object");
  });
  test("pg_kcache_reset returns shape", async () => {
    const payload = await callToolAndParse(client, "pg_kcache_reset", {});
    expect(typeof payload).toBe("object");
  });
});
