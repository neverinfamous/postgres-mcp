/**
 * postgres-mcp - ToolFilter Unit Tests
 *
 * Comprehensive tests for the tool filtering system.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  TOOL_GROUPS,
  META_GROUPS,
  getAllToolNames,
  getToolGroup,
  getMetaGroupTools,
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
    (sum, g) => sum + ((TOOL_GROUPS as Record<string, string[]>)[g]?.length ?? 0),
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
      expect(tools.length, `group "${group}" should not be empty`).toBeGreaterThan(0);
      // Every tool should follow pg_ naming convention
      for (const tool of tools) {
        expect(tool, `tool in "${group}" should start with pg_`).toMatch(/^pg_/);
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

describe("META_GROUPS", () => {
  it("should contain all 16 meta-groups", () => {
    const expectedMetaGroups = [
      "starter",
      "essential",
      "dev-schema",
      "dev-analytics",
      "ai-data",
      "ai-vector",
      "dba-monitor",
      "dba-schema",
      "dba-infra",
      "dba-stats",
      "geo",
      "base-ops",
      "ext-ai",
      "ext-geo",
      "ext-schedule",
      "ext-perf",
    ];
    expect(Object.keys(META_GROUPS)).toHaveLength(16);
    for (const metaGroup of expectedMetaGroups) {
      expect(META_GROUPS).toHaveProperty(metaGroup);
    }
  });

  it("should have correct group expansions", () => {
    expect(META_GROUPS.starter).toContain("core");
    expect(META_GROUPS.starter).toContain("transactions");
    expect(META_GROUPS.starter).toContain("jsonb");
    expect(META_GROUPS.starter).toContain("schema");
    expect(META_GROUPS.starter).toContain("codemode");

    expect(META_GROUPS.essential).toContain("core");
    expect(META_GROUPS.essential).toContain("transactions");
    expect(META_GROUPS.essential).toContain("codemode");

    expect(META_GROUPS["ext-ai"]).toContain("vector");
    expect(META_GROUPS["ext-ai"]).toContain("pgcrypto");
    expect(META_GROUPS["ext-ai"]).toContain("codemode");
  });

  it("should include codemode in every meta-group", () => {
    for (const [, groups] of Object.entries(META_GROUPS)) {
      expect(groups).toContain("codemode");
    }
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

describe("getMetaGroupTools", () => {
  it("should return all tools for starter meta-group", () => {
    const tools = getMetaGroupTools("starter");
    // starter = core + transactions + jsonb + schema + codemode
    expect(tools).toHaveLength(groupSum("core", "transactions", "jsonb", "schema", "codemode"));
  });

  it("should return all tools for essential meta-group", () => {
    const tools = getMetaGroupTools("essential");
    // essential = core + transactions + jsonb + codemode
    expect(tools).toHaveLength(groupSum("core", "transactions", "jsonb", "codemode"));
  });

  it("should return correct tools for ext-ai meta-group", () => {
    const tools = getMetaGroupTools("ext-ai");
    // ext-ai = vector + pgcrypto + codemode
    expect(tools).toHaveLength(groupSum("vector", "pgcrypto", "codemode"));
  });

  it("should return correct tools for dev-schema meta-group", () => {
    const tools = getMetaGroupTools("dev-schema");
    // dev-schema = core + transactions + schema + introspection + migration + codemode
    expect(tools).toHaveLength(groupSum("core", "transactions", "schema", "introspection", "migration", "codemode"));
  });

  it("should return correct tools for dev-analytics meta-group", () => {
    const tools = getMetaGroupTools("dev-analytics");
    // dev-analytics = core + transactions + stats + partitioning + codemode
    expect(tools).toHaveLength(groupSum("core", "transactions", "stats", "partitioning", "codemode"));
  });

  it("should return correct tools for base-ops meta-group", () => {
    const tools = getMetaGroupTools("base-ops");
    // base-ops = admin + monitoring + backup + partitioning + stats + citext + codemode
    expect(tools).toHaveLength(groupSum("admin", "monitoring", "backup", "partitioning", "stats", "citext", "codemode"));
  });

  it("should return correct tools for dba-monitor meta-group", () => {
    const tools = getMetaGroupTools("dba-monitor");
    // dba-monitor = core + monitoring + performance + transactions + codemode
    expect(tools).toHaveLength(groupSum("core", "monitoring", "performance", "transactions", "codemode"));
  });

  it("should return correct tools for dba-schema meta-group", () => {
    const tools = getMetaGroupTools("dba-schema");
    // dba-schema = core + schema + introspection + migration + codemode
    expect(tools).toHaveLength(groupSum("core", "schema", "introspection", "migration", "codemode"));
  });

  it("should return correct tools for dba-infra meta-group", () => {
    const tools = getMetaGroupTools("dba-infra");
    // dba-infra = core + admin + backup + partitioning + codemode
    expect(tools).toHaveLength(groupSum("core", "admin", "backup", "partitioning", "codemode"));
  });

  it("should return correct tools for dba-stats meta-group", () => {
    const tools = getMetaGroupTools("dba-stats");
    // dba-stats = core + admin + monitoring + transactions + stats + codemode
    expect(tools).toHaveLength(groupSum("core", "admin", "monitoring", "transactions", "stats", "codemode"));
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

  it("should disable a meta-group", () => {
    const config = parseToolFilter("-starter");
    const starterSize = groupSum("core", "transactions", "jsonb", "schema", "codemode");
    expect(config.enabledTools.size).toBe(TOTAL_TOOLS - starterSize);
    expect(config.enabledTools.has("pg_read_query")).toBe(false);
    expect(config.enabledTools.has("pg_jsonb_extract")).toBe(false);
    expect(config.enabledTools.has("pg_vector_search")).toBe(true);
  });

  it("should enable tools with + prefix", () => {
    const config = parseToolFilter("-core,+pg_read_query");
    // Disabled all 20 core tools, re-enabled 1
    expect(config.enabledTools.has("pg_read_query")).toBe(true);
    expect(config.enabledTools.has("pg_write_query")).toBe(false);
  });

  it("should handle whitelist with a meta-group", () => {
    const config = parseToolFilter("starter");
    const starterSize = groupSum("core", "transactions", "jsonb", "schema", "codemode");
    expect(config.enabledTools.size).toBe(starterSize);
  });

  it("should handle explicit whitelist syntax (+group)", () => {
    const config = parseToolFilter("+starter");
    const starterSize = groupSum("core", "transactions", "jsonb", "schema", "codemode");
    expect(config.enabledTools.size).toBe(starterSize);
  });

  it("should handle whitelist with exclusion (starter,-jsonb)", () => {
    const starterMinusJsonb = groupSum("core", "transactions", "schema", "codemode");
    const config = parseToolFilter("starter,-jsonb");
    expect(config.enabledTools.size).toBe(starterMinusJsonb);
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

  it("should show meta-group rules", () => {
    const config = parseToolFilter("-starter");
    const summary = getFilterSummary(config);
    expect(summary).toContain("-starter");
    expect(summary).toContain("meta-group");
  });

  it("should show per-group breakdown", () => {
    const config = parseToolFilter("-vector");
    const summary = getFilterSummary(config);
    expect(summary).toContain("By group:");
    expect(summary).toContain("vector: 0/16");
  });
});
