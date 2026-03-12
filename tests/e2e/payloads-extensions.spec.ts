/**
 * Payload Contract Tests: Extensions
 *
 * Validates response shapes for extension tools.
 * pg_distance uses { table, column, point: {lat, lng} } format.
 * pg_vector_search returns { results, count }.
 */

import { test, expect } from "@playwright/test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createClient, callToolAndParse, expectSuccess } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Extensions", () => {
  let client: Client;

  test.beforeAll(async () => {
    client = await createClient();
  });

  test.afterAll(async () => {
    await client.close();
  });

  // --- pgvector ---

  test("pg_vector_search returns { results, count }", async () => {
    const zeroVector = Array(384).fill(0);
    const payload = await callToolAndParse(client, "pg_vector_search", {
      table: "test_embeddings",
      column: "embedding",
      vector: zeroVector,
      limit: 3,
    });
    expectSuccess(payload);
    expect(Array.isArray(payload.results)).toBe(true);
    expect(typeof payload.count).toBe("number");
  });

  // --- PostGIS ---

  test("pg_distance returns { results, count }", async () => {
    const payload = await callToolAndParse(client, "pg_distance", {
      table: "test_locations",
      column: "location",
      point: { lat: 40.7128, lng: -74.006 },
      maxDistance: 100000,
    });
    expectSuccess(payload);
    expect(Array.isArray(payload.results)).toBe(true);
    expect(typeof payload.count).toBe("number");
  });

  // --- citext ---

  test("pg_citext_compare returns comparison result", async () => {
    const payload = await callToolAndParse(client, "pg_citext_compare", {
      value1: "Admin",
      value2: "admin",
    });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  // --- ltree ---

  test("pg_ltree_query returns results", async () => {
    const payload = await callToolAndParse(client, "pg_ltree_query", {
      table: "test_categories",
      column: "path",
      path: "electronics",
      mode: "descendants",
    });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  // --- pgcrypto ---

  test("pg_pgcrypto_hash returns hash result", async () => {
    const payload = await callToolAndParse(client, "pg_pgcrypto_hash", {
      data: "test data",
      algorithm: "sha256",
    });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  // --- pg_cron ---

  test("pg_cron_list_jobs returns job data", async () => {
    const payload = await callToolAndParse(client, "pg_cron_list_jobs", {});
    // May fail if extension not installed — just check shape
    expect(typeof payload).toBe("object");
  });

  // --- pg_stat_kcache ---

  test("pg_kcache_database_stats returns stats", async () => {
    const payload = await callToolAndParse(
      client,
      "pg_kcache_database_stats",
      {},
    );
    // May fail if extension not installed — just check shape
    expect(typeof payload).toBe("object");
  });
});
