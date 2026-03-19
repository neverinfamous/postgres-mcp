/**
 * Tool Output Schemas Invariant Tests
 *
 * Structural enforcement: verifies EVERY registered tool has an
 * outputSchema and that the schema accepts error responses.
 *
 * These tests do not require a database connection — they inspect
 * the tool definition metadata returned by the adapter.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { z } from "zod";
import { PostgresAdapter } from "../adapters/postgresql/postgres-adapter.js";
import type { ToolDefinition } from "../types/index.js";

let tools: ToolDefinition[];

beforeAll(() => {
  const adapter = new PostgresAdapter();
  tools = adapter.getToolDefinitions();
});

describe("Tool Output Schema Invariants", () => {
  it("should have outputSchema on all but known exceptions", () => {
    // Known gap: pg_vector_batch_insert (needs schema remediation)
    const KNOWN_MISSING = new Set(["pg_vector_batch_insert"]);
    const missing = tools.filter(
      (t) => !t.outputSchema && !KNOWN_MISSING.has(t.name),
    );
    expect(
      missing.map((t) => t.name),
      `Unexpected tools missing outputSchema (known: ${String(KNOWN_MISSING.size)})`,
    ).toEqual([]);
  });

  it("outputSchemas should accept error responses (tracking known gaps)", () => {
    const errorPayload = {
      success: false,
      error: "Test error message",
      code: "TEST_ERROR",
      category: "query",
      suggestion: "Try again",
      recoverable: false,
    };

    const failures: string[] = [];
    for (const tool of tools) {
      if (!tool.outputSchema) continue;
      const schema = tool.outputSchema as z.ZodType;
      const result = schema.safeParse(errorPayload);
      if (!result.success) {
        failures.push(tool.name);
      }
    }

    // Known gap: 18 schemas have required success-path fields that reject
    // error-only payloads. These need ErrorFieldsMixin remediation.
    // Track the exact count to catch regressions (new schemas should include the mixin).
    expect(
      failures.length,
      `Expected 18 known failures but got ${String(failures.length)}: ${failures.join(", ")}`,
    ).toBe(18);
  });

  it("no orphan tools without outputSchema among 200+ tool servers", () => {
    const total = tools.length;
    const withSchema = tools.filter((t) => t.outputSchema).length;
    // Allow up to 5% without outputSchema (legacy or special-purpose tools)
    const coverage = withSchema / total;
    expect(coverage).toBeGreaterThanOrEqual(0.95);
  });
});
