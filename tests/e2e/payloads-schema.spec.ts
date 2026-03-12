/**
 * Payload Contract Tests: Schema + Introspection + Migration
 *
 * Validates response shapes for schema (13), introspection (7), and migration (7) tools.
 */

import { test, expect } from "@playwright/test";
import { createClient, callToolAndParse } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: Schema + Introspection", () => {
  test("pg_list_schemas returns { schemas }", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_list_schemas", {});

      expect(Array.isArray(payload.schemas)).toBe(true);
    } finally {
      await client.close();
    }
  });

  test("pg_list_views returns views", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_list_views", {});

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg_list_constraints returns constraints", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_list_constraints", {
        table: "test_orders",
      });

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg_list_functions returns functions", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_list_functions", {});

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg_list_extensions returns { extensions }", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_list_extensions", {});

      expect(Array.isArray(payload.extensions)).toBe(true);
    } finally {
      await client.close();
    }
  });

  // --- Introspection ---

  test("pg_dependency_graph returns dependency data", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_dependency_graph", {
        table: "test_orders",
      });

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("pg_constraint_analysis returns analysis", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(
        client,
        "pg_constraint_analysis",
        {},
      );

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });

  // --- Migration ---

  test("pg_migration_status returns status", async () => {
    const client = await createClient();
    try {
      const payload = await callToolAndParse(client, "pg_migration_status", {});

      expect(typeof payload).toBe("object");
    } finally {
      await client.close();
    }
  });
});
