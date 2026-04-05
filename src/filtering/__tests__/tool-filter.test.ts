/**
 * postgres-mcp - ToolFilter Unit Tests
 *
 * Comprehensive tests for the tool filtering system.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  TOOL_GROUPS,
  getAllToolNames,
  getToolGroup,
  parseToolFilter,
  filterTools,
  getFilterSummary,
} from "../tool-filter.js";
import type { ToolDefinition } from "../../types/index.js";

/** Computed total tool count — derived from source of truth */
const TOTAL_TOOLS = Object.values(TOOL_GROUPS).flat().length;

/** Helper to sum sizes of named groups */
function groupSum(...groups: string[]): number {
  return groups.reduce(
    (sum, g) =>
      sum + ((TOOL_GROUPS as Record<string, string[]>)[g]?.length ?? 0),
    0,
  );
}

describe("TOOL_GROUPS", () => {
  it("should contain all 22 tool groups", () => {
    const expectedGroups = [
      "core",
      "transactions",
      "jsonb",
      "text",
      "performance",
      "admin",
      "monitoring",
      "backup",
      "schema",
      "vector",
      "postgis",
      "partitioning",
      "stats",
      "cron",
      "partman",
      "kcache",
      "citext",
      "ltree",
      "introspection",
      "migration",
      "pgcrypto",
      "codemode",
    ];

    expect(Object.keys(TOOL_GROUPS)).toHaveLength(22);
    for (const group of expectedGroups) {
      expect(TOOL_GROUPS).toHaveProperty(group);
    }
  });

  it("should have non-empty groups with no duplicate tools", () => {
    const allTools: string[] = [];
    for (const [group, tools] of Object.entries(TOOL_GROUPS)) {
      expect(
        tools.length,
        `group "${group}" should not be empty`,
      ).toBeGreaterThan(0);
      // Every tool should follow pg_ naming convention
      for (const tool of tools) {
        expect(tool, `tool in "${group}" should start with pg_`).toMatch(
          /^pg_/,
        );
      }
      allTools.push(...tools);
    }
    // No duplicates across groups
    const uniqueTools = new Set(allTools);
    expect(uniqueTools.size).toBe(allTools.length);
  });

  it("should total correctly across all groups", () => {
    const totalTools = Object.values(TOOL_GROUPS).flat().length;
    expect(totalTools).toBe(TOTAL_TOOLS);
  });
});

describe("getAllToolNames", () => {
  it("should return all tool names", () => {
    const tools = getAllToolNames();
    expect(tools).toHaveLength(TOTAL_TOOLS);
  });

  it("should return unique tool names", () => {
    const tools = getAllToolNames();
    const uniqueTools = new Set(tools);
    expect(uniqueTools.size).toBe(tools.length);
  });

  it("should include tools from all groups", () => {
    const tools = getAllToolNames();
    expect(tools).toContain("pg_read_query"); // core
    expect(tools).toContain("pg_jsonb_extract"); // jsonb
    expect(tools).toContain("pg_transaction_begin"); // transactions
    expect(tools).toContain("pg_vector_search"); // vector
    expect(tools).toContain("pg_execute_code"); // codemode
  });
});

describe("getToolGroup", () => {
  it("should return correct group for known tools", () => {
    expect(getToolGroup("pg_read_query")).toBe("core");
    expect(getToolGroup("pg_jsonb_extract")).toBe("jsonb");
    expect(getToolGroup("pg_transaction_begin")).toBe("transactions");
    expect(getToolGroup("pg_vector_search")).toBe("vector");
    expect(getToolGroup("pg_execute_code")).toBe("codemode");
  });

  it("should return undefined for unknown tools", () => {
    expect(getToolGroup("unknown_tool")).toBeUndefined();
    expect(getToolGroup("")).toBeUndefined();
    expect(getToolGroup("pg_fake_tool")).toBeUndefined();
  });
});

describe("parseToolFilter", () => {
  it("should return all tools enabled for empty filter", () => {
    const config = parseToolFilter("");
    expect(config.enabledTools.size).toBe(TOTAL_TOOLS);
    expect(config.rules).toHaveLength(0);
    expect(config.enabledTools.has("pg_read_query")).toBe(true);
  });

  it("should return all tools enabled for undefined filter", () => {
    const config = parseToolFilter(undefined);
    expect(config.enabledTools.size).toBe(TOTAL_TOOLS);
    expect(config.rules).toHaveLength(0);
  });

  it("should disable a single tool", () => {
    const config = parseToolFilter("-pg_read_query");
    expect(config.enabledTools.size).toBe(TOTAL_TOOLS - 1);
    expect(config.enabledTools.has("pg_read_query")).toBe(false);
    expect(config.enabledTools.has("pg_write_query")).toBe(true);
  });

  it("should disable a tool group", () => {
    const config = parseToolFilter("-core");
    expect(config.enabledTools.size).toBe(TOTAL_TOOLS - groupSum("core"));
    expect(config.enabledTools.has("pg_read_query")).toBe(false);
    expect(config.enabledTools.has("pg_jsonb_extract")).toBe(true);
  });

  it("should enable tools with + prefix", () => {
    const config = parseToolFilter("-core,+pg_read_query");
    // Disabled all 20 core tools, re-enabled 1
    expect(config.enabledTools.has("pg_read_query")).toBe(true);
    expect(config.enabledTools.has("pg_write_query")).toBe(false);
  });

  it("should process rules left-to-right", () => {
    // First enable core, then disable pg_read_query
    // core(20) - 1 + codemode(1) = 20 (codemode auto-injected in whitelist mode)
    const config = parseToolFilter("+core,-pg_read_query");
    expect(config.enabledTools.has("pg_read_query")).toBe(false);
    expect(config.enabledTools.has("pg_write_query")).toBe(true);
    expect(config.enabledTools.size).toBe(20); // core(20) - 1 + codemode(1)
  });

  it("should handle whitespace in filter string", () => {
    const config = parseToolFilter(" -core , +pg_read_query ");
    expect(config.enabledTools.has("pg_read_query")).toBe(true);
    expect(config.enabledTools.has("pg_write_query")).toBe(false);
  });

  // Codemode auto-injection tests
  it("should auto-inject codemode when using a raw group filter", () => {
    const config = parseToolFilter("core");
    expect(config.enabledTools.has("pg_execute_code")).toBe(true);
    expect(config.enabledTools.size).toBe(21); // core(20) + codemode(1)
  });

  it("should not inject codemode when explicitly excluded with -codemode", () => {
    const config = parseToolFilter("core,-codemode");
    expect(config.enabledTools.has("pg_execute_code")).toBe(false);
    expect(config.enabledTools.size).toBe(20); // core(20) only
  });

  it("should not inject codemode when pg_execute_code explicitly excluded", () => {
    const config = parseToolFilter("core,-pg_execute_code");
    expect(config.enabledTools.has("pg_execute_code")).toBe(false);
    expect(config.enabledTools.size).toBe(20); // core(20) only
  });

  it("should not inject codemode when all tools are excluded", () => {
    const config = parseToolFilter("-all");
    expect(config.enabledTools.size).toBe(0);
    expect(config.enabledTools.has("pg_execute_code")).toBe(false);
  });

  it("should include codemode in blacklist mode by default", () => {
    const config = parseToolFilter("-vector");
    expect(config.enabledTools.has("pg_execute_code")).toBe(true);
    expect(config.enabledTools.size).toBe(TOTAL_TOOLS - groupSum("vector"));
  });

  it("should allow excluding codemode in blacklist mode", () => {
    const config = parseToolFilter("-codemode");
    expect(config.enabledTools.has("pg_execute_code")).toBe(false);
    expect(config.enabledTools.size).toBe(TOTAL_TOOLS - 1);
  });
});

describe("filterTools", () => {
  const mockHandler = async () => ({ result: "ok" });
  const mockTools: ToolDefinition[] = [
    {
      name: "pg_read_query",
      description: "Read query",
      inputSchema: {},
      group: "core",
      handler: mockHandler,
    },
    {
      name: "pg_write_query",
      description: "Write query",
      inputSchema: {},
      group: "core",
      handler: mockHandler,
    },
    {
      name: "pg_jsonb_extract",
      description: "JSONB extract",
      inputSchema: {},
      group: "jsonb",
      handler: mockHandler,
    },
  ];

  it("should return all tools when no filter", () => {
    const config = parseToolFilter("");
    const filtered = filterTools(mockTools, config);
    expect(filtered).toHaveLength(3);
  });

  it("should filter out disabled tools", () => {
    const config = parseToolFilter("-pg_read_query");
    const filtered = filterTools(mockTools, config);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((t) => t.name)).not.toContain("pg_read_query");
  });

  it("should filter by group", () => {
    const config = parseToolFilter("-jsonb");
    const filtered = filterTools(mockTools, config);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((t) => t.name)).not.toContain("pg_jsonb_extract");
  });
});

describe("getFilterSummary", () => {
  it("should generate summary for no filter", () => {
    const config = parseToolFilter("");
    const summary = getFilterSummary(config);
    expect(summary).toContain(String(TOTAL_TOOLS));
    expect(summary).toContain("Enabled");
  });

  it("should show rules in summary", () => {
    const config = parseToolFilter("-core");
    const summary = getFilterSummary(config);
    expect(summary).toContain("-core");
    expect(summary).toContain("group");
  });

  it("should show per-group breakdown", () => {
    const config = parseToolFilter("-vector");
    const summary = getFilterSummary(config);
    expect(summary).toContain("By group:");
    expect(summary).toContain("vector: 0/16");
  });
});
