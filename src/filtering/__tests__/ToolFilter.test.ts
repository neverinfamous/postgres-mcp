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
} from "../ToolFilter.js";
import type { ToolDefinition } from "../../types/index.js";

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

  it("should have correct tool counts per group", () => {
    expect(TOOL_GROUPS.core).toHaveLength(20);
    expect(TOOL_GROUPS.transactions).toHaveLength(7);
    expect(TOOL_GROUPS.jsonb).toHaveLength(19);
    expect(TOOL_GROUPS.text).toHaveLength(13);
    expect(TOOL_GROUPS.performance).toHaveLength(24);
    expect(TOOL_GROUPS.admin).toHaveLength(10);
    expect(TOOL_GROUPS.monitoring).toHaveLength(11);
    expect(TOOL_GROUPS.backup).toHaveLength(9);
    expect(TOOL_GROUPS.schema).toHaveLength(12);
    expect(TOOL_GROUPS.vector).toHaveLength(16);
    expect(TOOL_GROUPS.postgis).toHaveLength(15);
    expect(TOOL_GROUPS.partitioning).toHaveLength(6);
    expect(TOOL_GROUPS.stats).toHaveLength(8);
    expect(TOOL_GROUPS.cron).toHaveLength(8);
    expect(TOOL_GROUPS.partman).toHaveLength(10);
    expect(TOOL_GROUPS.kcache).toHaveLength(7);
    expect(TOOL_GROUPS.citext).toHaveLength(6);
    expect(TOOL_GROUPS.ltree).toHaveLength(8);
    expect(TOOL_GROUPS.introspection).toHaveLength(6);
    expect(TOOL_GROUPS.migration).toHaveLength(6);
    expect(TOOL_GROUPS.pgcrypto).toHaveLength(9);
    expect(TOOL_GROUPS.codemode).toHaveLength(1);
  });

  it("should total 231 tools across all groups", () => {
    const totalTools = Object.values(TOOL_GROUPS).flat().length;
    expect(totalTools).toBe(231);
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
  it("should return all 231 tool names", () => {
    const tools = getAllToolNames();
    expect(tools).toHaveLength(231);
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
    // starter = core(20) + transactions(7) + jsonb(19) + schema(12) + codemode(1) = 59
    expect(tools).toHaveLength(59);
  });

  it("should return all tools for essential meta-group", () => {
    const tools = getMetaGroupTools("essential");
    // essential = core(20) + transactions(7) + jsonb(19) + codemode(1) = 47
    expect(tools).toHaveLength(47);
  });

  it("should return correct tools for ext-ai meta-group", () => {
    const tools = getMetaGroupTools("ext-ai");
    // ext-ai = vector(16) + pgcrypto(9) + codemode(1) = 26
    expect(tools).toHaveLength(26);
  });

  it("should return correct tools for dev-schema meta-group", () => {
    const tools = getMetaGroupTools("dev-schema");
    // dev-schema = core(20) + transactions(7) + schema(12) + introspection(6) + migration(6) + codemode(1) = 52
    expect(tools).toHaveLength(52);
  });

  it("should return correct tools for dev-analytics meta-group", () => {
    const tools = getMetaGroupTools("dev-analytics");
    // dev-analytics = core(20) + transactions(7) + stats(8) + partitioning(6) + codemode(1) = 42
    expect(tools).toHaveLength(42);
  });

  it("should return correct tools for base-ops meta-group", () => {
    const tools = getMetaGroupTools("base-ops");
    // base-ops = admin(10) + monitoring(11) + backup(9) + partitioning(6) + stats(8) + citext(6) + codemode(1) = 51
    expect(tools).toHaveLength(51);
  });

  it("should return correct tools for dba-monitor meta-group", () => {
    const tools = getMetaGroupTools("dba-monitor");
    // dba-monitor = core(20) + monitoring(11) + performance(24) + transactions(7) + codemode(1) = 63
    expect(tools).toHaveLength(63);
  });

  it("should return correct tools for dba-schema meta-group", () => {
    const tools = getMetaGroupTools("dba-schema");
    // dba-schema = core(20) + schema(12) + introspection(6) + migration(6) + codemode(1) = 45
    expect(tools).toHaveLength(45);
  });

  it("should return correct tools for dba-infra meta-group", () => {
    const tools = getMetaGroupTools("dba-infra");
    // dba-infra = core(20) + admin(10) + backup(9) + partitioning(6) + codemode(1) = 46
    expect(tools).toHaveLength(46);
  });

  it("should return correct tools for dba-stats meta-group", () => {
    const tools = getMetaGroupTools("dba-stats");
    // dba-stats = core(20) + admin(10) + monitoring(11) + transactions(7) + stats(8) + codemode(1) = 57
    expect(tools).toHaveLength(57);
  });
});

describe("parseToolFilter", () => {
  it("should return all 231 tools enabled for empty filter", () => {
    const config = parseToolFilter("");
    expect(config.enabledTools.size).toBe(231);
    expect(config.rules).toHaveLength(0);
    expect(config.enabledTools.has("pg_read_query")).toBe(true);
  });

  it("should return all 231 tools enabled for undefined filter", () => {
    const config = parseToolFilter(undefined);
    expect(config.enabledTools.size).toBe(231);
    expect(config.rules).toHaveLength(0);
  });

  it("should disable a single tool", () => {
    const config = parseToolFilter("-pg_read_query");
    expect(config.enabledTools.size).toBe(230); // 231 - 1
    expect(config.enabledTools.has("pg_read_query")).toBe(false);
    expect(config.enabledTools.has("pg_write_query")).toBe(true);
  });

  it("should disable a tool group", () => {
    const config = parseToolFilter("-core");
    expect(config.enabledTools.size).toBe(211); // 231 - 20
    expect(config.enabledTools.has("pg_read_query")).toBe(false);
    expect(config.enabledTools.has("pg_jsonb_extract")).toBe(true);
  });

  it("should disable a meta-group", () => {
    const config = parseToolFilter("-starter");
    expect(config.enabledTools.size).toBe(172); // 231 - 59
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
    expect(config.enabledTools.size).toBe(59); // starter has 59 tools
  });

  it("should handle explicit whitelist syntax (+group)", () => {
    const config = parseToolFilter("+starter");
    expect(config.enabledTools.size).toBe(59);
  });

  it("should handle whitelist with exclusion (starter,-jsonb)", () => {
    // starter(59) - jsonb(19) = 40
    const config = parseToolFilter("starter,-jsonb");
    expect(config.enabledTools.size).toBe(40);
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
    expect(config.enabledTools.size).toBe(215); // 231 - 16
  });

  it("should allow excluding codemode in blacklist mode", () => {
    const config = parseToolFilter("-codemode");
    expect(config.enabledTools.has("pg_execute_code")).toBe(false);
    expect(config.enabledTools.size).toBe(230); // 231 - 1
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
    expect(summary).toContain("231");
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
