/**
 * Cross-Group Integration Workflow Tests
 *
 * Exercises realistic multi-group workflows that span tool boundaries
 * to catch inter-group regressions.
 *
 * Workflow 1: Core → JSONB → Stats (Data Pipeline)
 * Workflow 2: Admin → Introspection (Health Check Pipeline)
 * Workflow 3: Core + Stats Cross-Validation
 *
 * All workflows use code mode for multi-step orchestration.
 * Uses _e2e_integration_* prefixed temp tables with cleanup.
 *
 * Ported from db-mcp/tests/e2e/integration-workflows.spec.ts — adapted for postgres-mcp.
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
// Workflow 1: Core → JSONB → Stats (Data Pipeline)
// =============================================================================

test.describe("Integration: Core → JSONB → Stats Pipeline", () => {
  test("create table, insert JSONB data, extract + analyze", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      // Step 1: Create table
      const create = await callToolAndParse(client, "pg_create_table", {
        table: "_e2e_integration_pipeline",
        columns: [
          { name: "id", type: "SERIAL", primaryKey: true },
          { name: "data", type: "JSONB" },
          { name: "score", type: "REAL" },
        ],
        ifNotExists: true,
      });
      expectSuccess(create);

      // Step 2: Insert JSONB + numeric data
      const insert = await callToolAndParse(client, "pg_write_query", {
        query: `INSERT INTO _e2e_integration_pipeline (data, score) VALUES
          ('{"category": "A", "value": 42}'::jsonb, 85.5),
          ('{"category": "B", "value": 17}'::jsonb, 92.3),
          ('{"category": "A", "value": 88}'::jsonb, 71.0),
          ('{"category": "B", "value": 55}'::jsonb, 63.8),
          ('{"category": "A", "value": 31}'::jsonb, 99.1)`,
      });
      expectSuccess(insert);

      // Step 3: Cross-group — JSONB extract
      const extracted = await callToolAndParse(client, "pg_jsonb_extract", {
        table: "_e2e_integration_pipeline",
        column: "data",
        path: "category",
      });
      expectSuccess(extracted);

      // Step 4: Cross-group — Stats descriptive
      const stats = await callToolAndParse(client, "pg_stats_descriptive", {
        table: "_e2e_integration_pipeline",
        column: "score",
      });
      expectSuccess(stats);
      const s = stats.stats as Record<string, unknown>;
      expect(s.count).toBe(5);
      expect(typeof s.min).toBe("number");
      expect(typeof s.max).toBe("number");
    } finally {
      await client.close();
    }
  });

  test("cleanup: drop pipeline table", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      await callToolAndParse(client, "pg_drop_table", {
        table: "_e2e_integration_pipeline",
        ifExists: true,
      });
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// Workflow 2: Admin → Introspection Health Check (via Code Mode)
// =============================================================================

test.describe("Integration: Admin → Introspection Health Check", () => {
  test("schema snapshot → explain → list constraints", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: `
          // Step 1: Schema snapshot
          const snapshot = await pg.introspection.schemaSnapshot({});

          // Step 2: Explain a complex join
          const plan = await pg.performance.explain({
            query: "SELECT p.name, COUNT(o.id) as order_count FROM test_products p LEFT JOIN test_orders o ON o.product_id = p.id GROUP BY p.name",
          });

          // Step 3: List constraints
          const constraints = await pg.schema.listConstraints({ table: "test_products" });

          return {
            tableCount: snapshot.tables.length,
            hasPlan: !!plan.plan,
            constraintCount: constraints.constraints?.length ?? 0,
          };
        `,
      });
      expectSuccess(p);
      const result = p.result as Record<string, unknown>;
      expect(typeof result.tableCount).toBe("number");
      expect((result.tableCount as number)).toBeGreaterThan(0);
      expect(result.hasPlan).toBe(true);
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// Workflow 3: Core + Stats Cross-Validation
// =============================================================================

test.describe("Integration: Core + Stats Cross-Validation", () => {
  test("manual COUNT matches count tool", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_execute_code", {
        code: `
          const table = "test_products";
          const manual = await pg.core.readQuery({ query: "SELECT COUNT(*) as cnt FROM " + table });
          const countResult = await pg.core.count({ table });
          return {
            manualCount: manual.rows[0].cnt,
            toolCount: countResult.count,
            match: manual.rows[0].cnt === countResult.count,
          };
        `,
      });
      expectSuccess(p);
      const result = p.result as Record<string, unknown>;
      expect(result.match).toBe(true);
    } finally {
      await client.close();
    }
  });
});

// =============================================================================
// Data Integrity Verification
// =============================================================================

test.describe("Integration: Data Integrity", () => {
  test("test_products still has rows", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_count", {
        table: "test_products",
      });
      expectSuccess(p);
      expect(typeof p.count).toBe("number");
      expect(p.count as number).toBeGreaterThan(0);
    } finally {
      await client.close();
    }
  });

  test("test_orders still has rows", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const p = await callToolAndParse(client, "pg_count", {
        table: "test_orders",
      });
      expectSuccess(p);
      expect(typeof p.count).toBe("number");
      expect(p.count as number).toBeGreaterThan(0);
    } finally {
      await client.close();
    }
  });
});
