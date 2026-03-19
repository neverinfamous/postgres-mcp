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
  it("every tool should have an outputSchema", () => {
    const missing = tools.filter((t) => !t.outputSchema);
    expect(
      missing.map((t) => t.name),
      `${String(missing.length)} tools missing outputSchema`,
    ).toEqual([]);
  });

  it("every outputSchema should accept error responses", () => {
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

    expect(
      failures,
      `${String(failures.length)} outputSchemas reject error payloads (ErrorFieldsMixin missing?)`,
    ).toEqual([]);
  });

  it("no orphan tools without outputSchema among 200+ tool servers", () => {
    const total = tools.length;
    const withSchema = tools.filter((t) => t.outputSchema).length;
    // Allow up to 5% without outputSchema (legacy or special-purpose tools)
    const coverage = withSchema / total;
    expect(coverage).toBeGreaterThanOrEqual(0.95);
  });
});
