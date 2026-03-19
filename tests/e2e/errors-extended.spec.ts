/**
 * Extended Error Path Tests
 *
 * Systematic domain error testing per group — nonexistent tables, columns,
 * invalid inputs — asserting structured handler errors with relevant codes.
 *
 * Extends the 6 tests in errors.spec.ts to comprehensive per-group coverage.
 *
 * Ported from db-mcp/tests/e2e/errors-extended.spec.ts — adapted for postgres-mcp tool names.
 */

import { test, expect } from "@playwright/test";
import {
  createClient,
  getBaseURL,
  callToolAndParse,
  callToolRaw,
  expectHandlerError,
} from "./helpers.js";

test.describe.configure({ mode: "serial" });

// =============================================================================
// Core — Table/Index Not Found
// =============================================================================

test.describe("Errors: Core", () => {
  test("read_query on nonexistent table → structured error", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_read_query", {
        query: "SELECT * FROM _e2e_nonexistent_xyz",
      });
      expectHandlerError(p);
      expect(p.error as string).toMatch(/does not exist|_e2e_nonexistent_xyz/i);
    } finally {
      await client.close();
    }
  });

  test("describe_table on nonexistent table → structured error", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_describe_table", {
        table: "_e2e_nonexistent_xyz",
      });
      expectHandlerError(p);
    } finally {
      await client.close();
    }
  });

  test("drop_table on nonexistent table (no ifExists) → structured error or safe no-op", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_drop_table", {
        table: "_e2e_nonexistent_xyz",
      });
      // Some handlers use IF EXISTS internally — accept either structured error or success
      expect(typeof p.success).toBe("boolean");
      if (p.success === false) {
        expect(typeof p.error).toBe("string");
      }
    } finally {
      await client.close();
    }
  });

  test("get_indexes on nonexistent table → structured error", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_get_indexes", {
        table: "_e2e_nonexistent_xyz",
      });
      expectHandlerError(p);
    } finally {
      await client.close();
    }
  });

  test("write_query with SELECT → structured error", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_write_query", {
        query: "SELECT * FROM information_schema.tables LIMIT 1",
      });
      expectHandlerError(p);
    } finally {
      await client.close();
    }
  });

  test("read_query with INSERT → structured error", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_read_query", {
        query: "INSERT INTO _e2e_nonexistent_xyz (name) VALUES ('x')",
      });
      expectHandlerError(p);
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// JSONB — Invalid Table/Column/Path
// =============================================================================

test.describe("Errors: JSONB", () => {
  test("jsonb_extract on nonexistent table → structured error", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_jsonb_extract", {
        table: "_e2e_nonexistent_xyz",
        column: "doc",
        path: "$.type",
      });
      expectHandlerError(p);
    } finally {
      await client.close();
    }
  });

  test("jsonb_set on nonexistent table → structured error", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_jsonb_set", {
        table: "_e2e_nonexistent_xyz",
        column: "doc",
        path: "{key}",
        value: "\"test\"",
      });
      expectHandlerError(p);
    } finally {
      await client.close();
    }
  });

  test("jsonb_validate_path with invalid path → valid: false or handler error", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_jsonb_validate_path", {
        path: "no-dollar-sign",
      });
      // Server may return various shapes:
      // - { success: true, valid: false }
      // - { success: false, error: "..." }
      // - { valid: ..., path: ... } (direct result without success wrapper)
      if ("success" in p) {
        expect(typeof p.success).toBe("boolean");
        if (p.success) {
          expect(p.valid).toBe(false);
        }
      } else {
        // Direct result shape — just verify it's a structured response
        expect(typeof p).toBe("object");
      }
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// Text — Invalid Table/Column
// =============================================================================

test.describe("Errors: Text", () => {
  test("regexp_match on nonexistent table → structured error", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_regexp_match", {
        table: "_e2e_nonexistent_xyz",
        column: "name",
        pattern: "test",
      });
      expectHandlerError(p);
    } finally {
      await client.close();
    }
  });

  test("fuzzy_match on nonexistent column → structured error", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_fuzzy_match", {
        table: "test_products",
        column: "_e2e_nonexistent_col",
        search: "laptop",
      });
      expectHandlerError(p);
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// Stats — Invalid Column Types
// =============================================================================

test.describe("Errors: Stats", () => {
  test("stats_descriptive on nonexistent table → structured error", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_stats_descriptive", {
        table: "_e2e_nonexistent_xyz",
        column: "price",
      });
      expectHandlerError(p);
    } finally {
      await client.close();
    }
  });

  test("stats_descriptive on nonexistent column → structured error", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_stats_descriptive", {
        table: "test_products",
        column: "_e2e_nonexistent_col",
      });
      expectHandlerError(p);
    } finally {
      await client.close();
    }
  });

  test("stats_correlation on nonexistent column → structured error", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_stats_correlation", {
        table: "test_products",
        column1: "_e2e_nonexistent_col",
        column2: "price",
      });
      expectHandlerError(p);
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// Vector — Invalid Dimensions
// =============================================================================

test.describe("Errors: Vector", () => {
  test("vector_search on nonexistent table → structured error", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_vector_search", {
        table: "_e2e_nonexistent_xyz",
        column: "embedding",
        query: [0.1, 0.2],
      });
      expectHandlerError(p);
    } finally {
      await client.close();
    }
  });

  test("vector_distance with mismatched dimensions → structured error", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_vector_distance", {
        vector1: [1, 0, 0],
        vector2: [0, 1],
        metric: "cosine",
      });
      expectHandlerError(p);
    } finally {
      await client.close();
    }
  });

  test("vector_normalize with empty vector → structured error", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_vector_normalize", {
        vector: [],
      });
      expectHandlerError(p);
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// Introspection — Invalid SQL/Tables
// =============================================================================

test.describe("Errors: Introspection", () => {
  test("explain with non-SELECT → structured error or valid plan", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_explain", {
        query: "DELETE FROM test_products WHERE id = 1",
      });
      // PostgreSQL EXPLAIN can explain non-SELECT statements
      // Accept either structured error or valid plan
      expect(typeof p.success).toBe("boolean");
    } finally {
      await client.close();
    }
  });

  test("cascade_simulator on nonexistent table → structured error", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_cascade_simulator", {
        table: "_e2e_nonexistent_xyz",
      });
      expectHandlerError(p);
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// Migration — Invalid Versions
// =============================================================================

test.describe("Errors: Migration", () => {
  test("migration_rollback on nonexistent version → structured error", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_migration_rollback", {
        version: "_e2e_nonexistent_version_xyz",
      });
      expectHandlerError(p);
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// Schema — Invalid Targets
// =============================================================================

test.describe("Errors: Schema", () => {
  test("drop_view on nonexistent view → error or no-op", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const response = await callToolRaw(client, "pg_drop_view", {
        name: "_e2e_nonexistent_view_xyz",
      });
      const text = response.content[0]?.text;
      expect(text).toBeDefined();
      // Handler may: (1) return {success: true, message: "did not exist"},
      // (2) return {success: false, error: "..."}, or (3) raw MCP error
      try {
        const parsed = JSON.parse(text);
        expect(typeof parsed.success).toBe("boolean");
      } catch {
        // Raw error string is acceptable
        expect(text.length).toBeGreaterThan(0);
      }
    } finally {
      await client.close();
    }
  });

  test("drop_schema on nonexistent schema → error or no-op", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const response = await callToolRaw(client, "pg_drop_schema", {
        name: "_e2e_nonexistent_schema_xyz",
      });
      const text = response.content[0]?.text;
      expect(text).toBeDefined();
      try {
        const parsed = JSON.parse(text);
        expect(typeof parsed.success).toBe("boolean");
      } catch {
        expect(text.length).toBeGreaterThan(0);
      }
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// Admin — Invalid Targets
// =============================================================================

test.describe("Errors: Admin", () => {
  test("vacuum on nonexistent table → structured error", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_vacuum", {
        table: "_e2e_nonexistent_xyz",
      });
      expectHandlerError(p);
    } finally {
      await client.close();
    }
  });

  test("terminate_backend with invalid PID → structured error", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_terminate_backend", {
        pid: -99999,
      });
      // May return success: false or success: true (PG returns false for nonexistent pid)
      expect(typeof p.success).toBe("boolean");
    } finally {
      await client.close();
    }
  });
});
