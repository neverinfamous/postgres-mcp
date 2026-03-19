/**
 * E2E Tests: Code Mode Tool Groups
 *
 * Exercises key tool groups through the pg.* Code Mode API to verify
 * that each group is accessible and functional.
 *
 * Ported from db-mcp/tests/e2e/codemode-groups.spec.ts — adapted for postgres-mcp's 22 groups.
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
// Core Group
// =============================================================================

test.describe("Code Mode Groups: Core", () => {
  test("pg.core.listTables()", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: `
          const result = await pg.core.listTables({});
          return { tableCount: result.tables.length };
        `,
      });
      expectSuccess(p);
      const result = p.result as Record<string, unknown>;
      expect(typeof result.tableCount).toBe("number");
      expect(result.tableCount as number).toBeGreaterThan(0);
    } finally {
      await client.close();
    }
  });

  test("pg.core.readQuery()", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: `
          const result = await pg.core.readQuery({ query: "SELECT 1 + 1 AS sum" });
          return result.rows[0].sum;
        `,
      });
      expectSuccess(p);
      expect(p.result).toBe(2);
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// JSONB Group
// =============================================================================

test.describe("Code Mode Groups: JSONB", () => {
  test("pg.jsonb.typeof()", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: `
          const result = await pg.jsonb.typeof({ value: '{"key": "value"}' });
          return result;
        `,
      });
      expectSuccess(p);
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// Stats Group
// =============================================================================

test.describe("Code Mode Groups: Stats", () => {
  test("pg.stats.descriptive()", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: `
          const result = await pg.stats.descriptive({ table: "test_products", column: "price" });
          return { count: result.stats.count };
        `,
      });
      expectSuccess(p);
      const result = p.result as Record<string, unknown>;
      expect(typeof result.count).toBe("number");
      expect(result.count as number).toBeGreaterThan(0);
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// Text Group
// =============================================================================

test.describe("Code Mode Groups: Text", () => {
  test("pg.text.normalize()", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: `
          const result = await pg.text.normalize({ table: "test_products", column: "name" });
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
// Performance Group
// =============================================================================

test.describe("Code Mode Groups: Performance", () => {
  test("pg.performance.explain()", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: `
          const result = await pg.performance.explain({ query: "SELECT * FROM test_products" });
          return { hasPlan: !!result.plan };
        `,
      });
      expectSuccess(p);
      const result = p.result as Record<string, unknown>;
      expect(result.hasPlan).toBe(true);
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// Introspection Group
// =============================================================================

test.describe("Code Mode Groups: Introspection", () => {
  test("pg.introspection.schemaSnapshot()", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: `
          const result = await pg.introspection.schemaSnapshot({});
          return { hasTables: Array.isArray(result.tables) };
        `,
      });
      expectSuccess(p);
      const result = p.result as Record<string, unknown>;
      expect(result.hasTables).toBe(true);
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// Migration Group
// =============================================================================

test.describe("Code Mode Groups: Migration", () => {
  test("pg.migration.history()", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: `
          const result = await pg.migration.history({});
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
// Monitoring Group
// =============================================================================

test.describe("Code Mode Groups: Monitoring", () => {
  test("pg.monitoring.serverVersion()", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: `
          const result = await pg.monitoring.serverVersion({});
          return { hasVersion: typeof result.version === "string" };
        `,
      });
      expectSuccess(p);
      const result = p.result as Record<string, unknown>;
      expect(result.hasVersion).toBe(true);
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// Schema Group
// =============================================================================

test.describe("Code Mode Groups: Schema", () => {
  test("pg.schema.listViews()", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: `
          const result = await pg.schema.listViews({});
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
// Admin Group
// =============================================================================

test.describe("Code Mode Groups: Admin", () => {
  test("pg.admin.reloadConf()", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: `
          const result = await pg.admin.reloadConf({});
          return { success: result.success };
        `,
      });
      expectSuccess(p);
    } finally {
      await client.close();
    }
  });
});
