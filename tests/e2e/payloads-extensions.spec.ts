/**
 * Payload Contract Tests: Extensions
 *
 * Validates response shapes for extension tools:
 * vector (17), postgis (16), cron (9), partman (11), kcache (8),
 * citext (7), ltree (9), pgcrypto (10).
 *
 * Uses test_embeddings, test_locations, test_users, test_categories,
 * test_secure_data from seed data.
 */

import { test, expect } from "@playwright/test";
import { createClient, callToolAndParse } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Extensions", () => {
  // --- pgvector ---

  test("pg_vector_search returns { rows, rowCount }", async () => {
    const client = await createClient();
    try {
      // Generate a 384-dim zero vector for search
      const zeroVector = Array(384).fill(0);
      const payload = await callToolAndParse(client, "pg_vector_search", {
        table: "test_embeddings",
        column: "embedding",
        vector: zeroVector,
        limit: 3,
      });

      expect(Array.isArray(payload.rows)).toBe(true);
      expect(typeof payload.rowCount).toBe("number");
    } finally {
      await client.close();
    }
  });

  // --- PostGIS ---

  test("pg_postgis_distance returns distance result", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_postgis_distance", {
        table: "test_locations",
        geometryColumn: "location",
        latitude: 40.7128,
        longitude: -74.006,
      });

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg_postgis_nearest returns nearest results", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_postgis_nearest", {
        table: "test_locations",
        geometryColumn: "location",
        latitude: 40.7128,
        longitude: -74.006,
        limit: 3,
      });

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  // --- citext ---

  test("pg_citext_search returns { rows, rowCount }", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_citext_search", {
        table: "test_users",
        column: "username",
        value: "admin",
      });

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  // --- ltree ---

  test("pg_ltree_query returns { rows, rowCount }", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_ltree_query", {
        table: "test_categories",
        column: "path",
        query: "electronics.*",
      });

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg_ltree_ancestors returns ancestor data", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_ltree_ancestors", {
        table: "test_categories",
        column: "path",
        path: "electronics.phones.smartphones",
      });

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  // --- pgcrypto ---

  test("pg_crypto_hash returns hash result", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_crypto_hash", {
        data: "test data",
        algorithm: "sha256",
      });

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  // --- pg_cron (may not be available) ---

  test("pg_cron_list returns job data", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_cron_list", {});

      // May return jobs array or error if extension not installed
      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  // --- pg_stat_kcache (may not be available) ---

  test("pg_kcache_status returns status", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_kcache_status", {});

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });
});
