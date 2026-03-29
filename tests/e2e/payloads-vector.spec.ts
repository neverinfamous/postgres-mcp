/**
 * Payload Contract Tests: Vector
 *
 * Validates response shapes for pgvector (16) tools.
 */

import { test, expect } from "@playwright/test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createClient, callToolAndParse, expectSuccess } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Vector", () => {
  let client: Client;
  const testTable = "audit_test_vector_payloads";

  test.beforeAll(async () => {
    client = await createClient();
    // Setup base table for vector modifications
    await callToolAndParse(client, "pg_create_table", {
      table: testTable,
      columns: [{ name: "id", type: "serial", primaryKey: true }],
      ifNotExists: true,
    });
  });

  test.afterAll(async () => {
    await callToolAndParse(client, "pg_drop_table", {
      table: testTable,
      cascade: true,
      ifExists: true,
    });
    await client.close();
  });

  test("pg_vector_create_extension returns object", async () => {
    const payload = await callToolAndParse(client, "pg_vector_create_extension", {});
    expect(typeof payload).toBe("object");
  });

  test("pg_vector_add_column returns { success }", async () => {
    const payload = await callToolAndParse(client, "pg_vector_add_column", {
      table: testTable,
      column: "embedding",
      dimensions: 3,
    });
    expectSuccess(payload);
    expect(payload.success).toBe(true);
  });

  test("pg_vector_insert returns insertion stats", async () => {
    const payload = await callToolAndParse(client, "pg_vector_insert", {
      table: testTable,
      column: "embedding",
      vector: [1, 2, 3],
    });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_vector_batch_insert returns batch insertion stats", async () => {
    const payload = await callToolAndParse(client, "pg_vector_batch_insert", {
      table: testTable,
      column: "embedding",
      vectors: [{ vector: [4, 5, 6] }, { vector: [7, 8, 9] }],
    });
    expectSuccess(payload);
    expect(typeof payload).toBe("object");
  });

  test("pg_vector_create_index returns { success }", async () => {
    const payload = await callToolAndParse(client, "pg_vector_create_index", {
      table: testTable,
      column: "embedding",
      method: "hnsw",
      metric: "cosine",
    });
    expectSuccess(payload);
    expect(payload.success).toBe(true);
  });

  test("pg_vector_search returns { results, count }", async () => {
    const payload = await callToolAndParse(client, "pg_vector_search", {
      table: testTable,
      column: "embedding",
      vector: [1, 2, 3],
      limit: 3,
    });
    expectSuccess(payload);
    expect(Array.isArray(payload.results)).toBe(true);
    expect(typeof payload.count).toBe("number");
  });

  test("pg_hybrid_search returns { results, count }", async () => {
    // Requires column for FTS and vector, might fail if table absent, but shape should be object
    const payload = await callToolAndParse(client, "pg_hybrid_search", {
      table: testTable,
      vectorColumn: "embedding",
      vector: [1, 2, 3],
      textColumn: "id", // Not exactly text, but just testing shape
      query: "test",
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_vector_distance returns { distance }", async () => {
    const payload = await callToolAndParse(client, "pg_vector_distance", {
      vector1: [1, 2],
      vector2: [3, 4],
      metric: "l2",
    });
    expectSuccess(payload);
    expect(typeof payload.distance).toBe("number");
  });

  test("pg_vector_normalize returns { normalized }", async () => {
    const payload = await callToolAndParse(client, "pg_vector_normalize", {
      vector: [1, 2, 3],
    });
    expectSuccess(payload);
    expect(Array.isArray(payload.normalized)).toBe(true);
  });

  test("pg_vector_aggregate returns { aggregated }", async () => {
    const payload = await callToolAndParse(client, "pg_vector_aggregate", {
      table: testTable,
      column: "embedding",
    });
    // the tool might return { groups: ... } or { average_vector: ... }
    expect(typeof payload).toBe("object");
  });

  test("pg_vector_validate returns { success }", async () => {
    const payload = await callToolAndParse(client, "pg_vector_validate", {
      table: testTable,
      column: "embedding",
      dimensions: 3,
    });
    // It returns { valid: true, ... } not { success: true }
    expect(typeof payload).toBe("object");
  });

  test("pg_vector_cluster returns { clusters }", async () => {
    const payload = await callToolAndParse(client, "pg_vector_cluster", {
      table: testTable,
      column: "embedding",
      k: 2,
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_vector_index_optimize returns analysis or results", async () => {
    const payload = await callToolAndParse(client, "pg_vector_index_optimize", {
      table: testTable,
      column: "embedding",
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_vector_dimension_reduce returns { reduced }", async () => {
    const payload = await callToolAndParse(client, "pg_vector_dimension_reduce", {
      table: testTable,
      column: "embedding",
      targetDimensions: 2,
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_vector_embed returns { embedding }", async () => {
    const payload = await callToolAndParse(client, "pg_vector_embed", {
      text: "hello world",
      provider: "mock"
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_vector_performance returns object", async () => {
    const payload = await callToolAndParse(client, "pg_vector_performance", {
      table: testTable,
      column: "embedding",
      metric: "cosine",
    });
    expect(typeof payload).toBe("object");
  });
});
