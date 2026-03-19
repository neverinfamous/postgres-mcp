/**
 * Zod Validation Sweep
 *
 * Calls every tool that has REQUIRED parameters with empty args ({}).
 * Asserts the response is a structured handler error ({ success: false, error: "..." })
 * and NOT a raw MCP error frame (isError: true with -32602 code).
 *
 * Tools with no required params (e.g., pg_list_tables) are excluded — they succeed on {}.
 *
 * Ported from db-mcp/tests/e2e/zod-sweep.spec.ts — adapted for postgres-mcp tool names.
 */

import { test, expect } from "@playwright/test";
import { createClient, getBaseURL, callToolRaw } from "./helpers.js";

test.describe.configure({ mode: "serial" });

/**
 * Send {} to a tool and assert we get a structured handler error,
 * not a raw MCP error frame.
 */
async function assertZodHandlerError(baseURL: string, toolName: string) {
  const client = await createClient(baseURL);
  try {
    const response = await callToolRaw(client, toolName, {});

    // If the SDK returned isError: true, the response is a raw MCP error.
    // We still parse the text to check if it's structured.
    const text = response.content[0]?.text;
    expect(text, `${toolName}: no response content`).toBeDefined();

    // The response must be valid JSON (not a raw exception string)
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      // If the response isn't JSON, it's a raw MCP error string
      throw new Error(
        `${toolName}: raw MCP error, not structured JSON. Got: ${text.slice(0, 200)}`,
      );
    }

    // Check: must be { success: false, error: "..." }
    expect(
      parsed.success,
      `${toolName}: expected success: false, got: ${JSON.stringify(parsed, null, 2)}`,
    ).toBe(false);
    expect(
      typeof parsed.error,
      `${toolName}: missing error string in: ${JSON.stringify(parsed, null, 2)}`,
    ).toBe("string");
  } finally {
    await client.close();
  }
}

// =============================================================================
// Core Group (tools with required params)
// =============================================================================

test.describe("Zod Sweep: Core", () => {
  const tools = [
    "pg_read_query",
    "pg_write_query",
    "pg_create_table",
    "pg_describe_table",
    "pg_drop_table",
    "pg_create_index",
    "pg_drop_index",
    "pg_upsert",
    "pg_batch_insert",
    "pg_count",
    "pg_exists",
    "pg_truncate",
  ];

  for (const tool of tools) {
    test(`${tool}({}) → handler error`, async ({}, testInfo) => {
      await assertZodHandlerError(getBaseURL(testInfo), tool);
    });
  }
});

// =============================================================================
// JSONB Group (tools with required params)
// =============================================================================

test.describe("Zod Sweep: JSONB", () => {
  const tools = [
    "pg_jsonb_extract",
    "pg_jsonb_contains",
    "pg_jsonb_path_query",
    "pg_jsonb_set",
    "pg_jsonb_insert",
    "pg_jsonb_delete",
    "pg_jsonb_object",
    "pg_jsonb_array",
    "pg_jsonb_strip_nulls",
    "pg_jsonb_validate_path",
    "pg_jsonb_merge",
    "pg_jsonb_normalize",
    "pg_jsonb_diff",
    "pg_jsonb_agg",
    "pg_jsonb_keys",
    "pg_jsonb_typeof",
    "pg_jsonb_index_suggest",
    "pg_jsonb_security_scan",
    "pg_jsonb_stats",
  ];

  for (const tool of tools) {
    test(`${tool}({}) → handler error`, async ({}, testInfo) => {
      await assertZodHandlerError(getBaseURL(testInfo), tool);
    });
  }
});

// =============================================================================
// Text Group (tools with required params)
// =============================================================================

test.describe("Zod Sweep: Text", () => {
  const tools = [
    "pg_text_search",
    "pg_text_rank",
    "pg_text_headline",
    "pg_create_fts_index",
    "pg_trigram_similarity",
    "pg_fuzzy_match",
    "pg_regexp_match",
    "pg_text_normalize",
    "pg_text_to_vector",
    "pg_text_to_query",
    "pg_text_search_config",
    "pg_like_search",
    "pg_text_sentiment",
  ];

  for (const tool of tools) {
    test(`${tool}({}) → handler error`, async ({}, testInfo) => {
      await assertZodHandlerError(getBaseURL(testInfo), tool);
    });
  }
});

// =============================================================================
// Stats Group (tools with required params)
// =============================================================================

test.describe("Zod Sweep: Stats", () => {
  const tools = [
    "pg_stats_correlation",
    "pg_stats_regression",
    "pg_stats_descriptive",
    "pg_stats_percentiles",
    "pg_stats_distribution",
    "pg_stats_hypothesis",
    "pg_stats_sampling",
    "pg_stats_time_series",
  ];

  for (const tool of tools) {
    test(`${tool}({}) → handler error`, async ({}, testInfo) => {
      await assertZodHandlerError(getBaseURL(testInfo), tool);
    });
  }
});

// =============================================================================
// Performance Group (tools with required params)
// =============================================================================

test.describe("Zod Sweep: Performance", () => {
  const tools = [
    "pg_explain",
    "pg_explain_analyze",
    "pg_explain_buffers",
    "pg_seq_scan_tables",
    "pg_index_recommendations",
    "pg_query_plan_compare",
    "pg_detect_query_anomalies",
    "pg_detect_bloat_risk",
  ];

  for (const tool of tools) {
    test(`${tool}({}) → handler error`, async ({}, testInfo) => {
      await assertZodHandlerError(getBaseURL(testInfo), tool);
    });
  }
});

// =============================================================================
// Transactions Group (tools with required params)
// =============================================================================

test.describe("Zod Sweep: Transactions", () => {
  const tools = [
    "pg_transaction_execute",
    "pg_transaction_savepoint",
    "pg_transaction_release",
    "pg_transaction_rollback_to",
  ];

  for (const tool of tools) {
    test(`${tool}({}) → handler error`, async ({}, testInfo) => {
      await assertZodHandlerError(getBaseURL(testInfo), tool);
    });
  }
});

// =============================================================================
// Admin Group (tools with required params)
// =============================================================================

test.describe("Zod Sweep: Admin", () => {
  const tools = [
    "pg_vacuum",
    "pg_vacuum_analyze",
    "pg_analyze",
    "pg_reindex",
    "pg_terminate_backend",
    "pg_cancel_backend",
    "pg_set_config",
    "pg_cluster",
  ];

  for (const tool of tools) {
    test(`${tool}({}) → handler error`, async ({}, testInfo) => {
      await assertZodHandlerError(getBaseURL(testInfo), tool);
    });
  }
});

// =============================================================================
// Schema Group (tools with required params)
// =============================================================================

test.describe("Zod Sweep: Schema", () => {
  const tools = [
    "pg_create_schema",
    "pg_drop_schema",
    "pg_create_sequence",
    "pg_drop_sequence",
    "pg_create_view",
    "pg_drop_view",
  ];

  for (const tool of tools) {
    test(`${tool}({}) → handler error`, async ({}, testInfo) => {
      await assertZodHandlerError(getBaseURL(testInfo), tool);
    });
  }
});

// =============================================================================
// Backup Group (tools with required params)
// =============================================================================

test.describe("Zod Sweep: Backup", () => {
  const tools = [
    "pg_dump_table",
    "pg_dump_schema",
    "pg_copy_export",
    "pg_copy_import",
    "pg_create_backup_plan",
    "pg_restore_command",
  ];

  for (const tool of tools) {
    test(`${tool}({}) → handler error`, async ({}, testInfo) => {
      await assertZodHandlerError(getBaseURL(testInfo), tool);
    });
  }
});

// =============================================================================
// Vector Group (tools with required params)
// =============================================================================

test.describe("Zod Sweep: Vector", () => {
  const tools = [
    "pg_vector_add_column",
    "pg_vector_insert",
    "pg_vector_batch_insert",
    "pg_vector_search",
    "pg_vector_create_index",
    "pg_hybrid_search",
    "pg_vector_distance",
    "pg_vector_normalize",
    "pg_vector_aggregate",
    "pg_vector_validate",
    "pg_vector_cluster",
    "pg_vector_dimension_reduce",
    "pg_vector_embed",
  ];

  for (const tool of tools) {
    test(`${tool}({}) → handler error`, async ({}, testInfo) => {
      await assertZodHandlerError(getBaseURL(testInfo), tool);
    });
  }
});

// =============================================================================
// Introspection Group (tools with required params)
// =============================================================================

test.describe("Zod Sweep: Introspection", () => {
  const tools = [
    "pg_cascade_simulator",
    "pg_migration_risks",
    "pg_migration_record",
    "pg_migration_apply",
    "pg_migration_rollback",
  ];

  for (const tool of tools) {
    test(`${tool}({}) → handler error`, async ({}, testInfo) => {
      await assertZodHandlerError(getBaseURL(testInfo), tool);
    });
  }
});

// =============================================================================
// Partitioning Group (tools with required params)
// =============================================================================

test.describe("Zod Sweep: Partitioning", () => {
  const tools = [
    "pg_attach_partition",
    "pg_detach_partition",
    "pg_create_partitioned_table",
    "pg_create_partition",
  ];

  for (const tool of tools) {
    test(`${tool}({}) → handler error`, async ({}, testInfo) => {
      await assertZodHandlerError(getBaseURL(testInfo), tool);
    });
  }
});

// =============================================================================
// PostGIS Group (tools with required params)
// =============================================================================

test.describe("Zod Sweep: PostGIS", () => {
  const tools = [
    "pg_geometry_column",
    "pg_spatial_index",
    "pg_point_in_polygon",
    "pg_distance",
    "pg_buffer",
    "pg_intersection",
    "pg_bounding_box",
    "pg_geometry_buffer",
    "pg_geometry_intersection",
    "pg_geometry_transform",
  ];

  for (const tool of tools) {
    test(`${tool}({}) → handler error`, async ({}, testInfo) => {
      await assertZodHandlerError(getBaseURL(testInfo), tool);
    });
  }
});

// =============================================================================
// Code Mode
// =============================================================================

test.describe("Zod Sweep: Code Mode", () => {
  test("pg_execute_code({}) → handler error", async ({}, testInfo) => {
    await assertZodHandlerError(getBaseURL(testInfo), "pg_execute_code");
  });
});
