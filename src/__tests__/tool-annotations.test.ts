/**
 * Tool Annotations Invariant Tests
 *
 * Structural enforcement: verifies EVERY registered tool has complete
 * annotations. This prevents regressions when adding new tools.
 *
 * These tests do not require a database connection — they inspect
 * the tool definition metadata returned by the adapter.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PostgresAdapter } from "../adapters/postgresql/postgres-adapter.js";
import type { ToolDefinition } from "../types/index.js";

let tools: ToolDefinition[];

beforeAll(() => {
  const adapter = new PostgresAdapter();
  tools = adapter.getToolDefinitions();
});

describe("Tool Annotations Invariants", () => {
  it("should have at least 200 tools registered", () => {
    expect(tools.length).toBeGreaterThanOrEqual(200);
  });

  it("every tool should have annotations", () => {
    const missing = tools.filter((t) => !t.annotations);
    expect(
      missing.map((t) => t.name),
      `${String(missing.length)} tools missing annotations`,
    ).toEqual([]);
  });

  it("every tool should have a title in annotations", () => {
    const missing = tools.filter((t) => !t.annotations?.title);
    expect(
      missing.map((t) => t.name),
      `${String(missing.length)} tools missing title`,
    ).toEqual([]);
  });

  it("every tool should have an explicit readOnlyHint", () => {
    const missing = tools.filter(
      (t) => t.annotations?.readOnlyHint === undefined,
    );
    expect(
      missing.map((t) => t.name),
      `${String(missing.length)} tools missing readOnlyHint`,
    ).toEqual([]);
  });

  it("every tool should have an explicit destructiveHint", () => {
    const missing = tools.filter(
      (t) => t.annotations?.destructiveHint === undefined,
    );
    expect(
      missing.map((t) => t.name),
      `${String(missing.length)} tools missing destructiveHint`,
    ).toEqual([]);
  });

  it("every tool should have an explicit openWorldHint", () => {
    const missing = tools.filter(
      (t) => t.annotations?.openWorldHint === undefined,
    );
    expect(
      missing.map((t) => t.name),
      `${String(missing.length)} tools missing openWorldHint`,
    ).toEqual([]);
  });

  it("all openWorldHint values should be false (no external API calls)", () => {
    const external = tools.filter((t) => t.annotations?.openWorldHint === true);
    expect(
      external.map((t) => t.name),
      `${String(external.length)} tools have openWorldHint=true (unexpected for a DB server)`,
    ).toEqual([]);
  });

  it("every tool should have a description", () => {
    const missing = tools.filter((t) => !t.description);
    expect(
      missing.map((t) => t.name),
      `${String(missing.length)} tools missing description`,
    ).toEqual([]);
  });

  it("every tool should have a group label", () => {
    const missing = tools.filter((t) => !t.group);
    expect(
      missing.map((t) => t.name),
      `${String(missing.length)} tools missing group`,
    ).toEqual([]);
  });
});
