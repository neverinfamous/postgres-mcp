/**
 * postgres-mcp - Tool Filtering & Registration Performance Benchmarks
 *
 * Measures filter parsing, tool registration, and definition caching.
 *
 * Run: npm run bench
 */

import { describe, bench, vi } from "vitest";
import {
  parseToolFilter,
  getAllToolNames,
  getToolGroup,
  getFilterSummary,
  TOOL_GROUPS,
  META_GROUPS,
} from "../../filtering/ToolFilter.js";
import { getMetaGroupTools } from "../../filtering/ToolFilter.js";
import type { ToolGroup, MetaGroup } from "../../types/index.js";


// Suppress logger output
vi.mock("../../utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    notice: vi.fn(),
    critical: vi.fn(),
    alert: vi.fn(),
    emergency: vi.fn(),
    setLevel: vi.fn(),
    setMcpServer: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// 1. Filter Parsing
// ---------------------------------------------------------------------------
describe("parseToolFilter()", () => {
  bench(
    "no filter (all tools)",
    () => {
      parseToolFilter(undefined);
    },
    { iterations: 2000, warmupIterations: 20 },
  );

  bench(
    'simple shortcut ("starter")',
    () => {
      parseToolFilter("starter");
    },
    { iterations: 2000, warmupIterations: 20 },
  );

  bench(
    "complex filter expression",
    () => {
      parseToolFilter("starter,+text,+vector,-pg_drop_table,-pg_truncate");
    },
    { iterations: 2000, warmupIterations: 20 },
  );

  bench(
    'codemode-only filter ("codemode")',
    () => {
      parseToolFilter("codemode");
    },
    { iterations: 2000, warmupIterations: 20 },
  );

  bench(
    "exclusion-mode filter (-vector,-postgis,...)",
    () => {
      parseToolFilter("-vector,-postgis,-cron,-partman,-kcache,-ltree");
    },
    { iterations: 2000, warmupIterations: 20 },
  );
});

// ---------------------------------------------------------------------------
// 2. Lookup Operations
// ---------------------------------------------------------------------------
describe("Lookup Operations", () => {
  // Prime caches before benchmarks
  getAllToolNames();

  bench(
    "getAllToolNames() (cached)",
    () => {
      getAllToolNames();
    },
    { iterations: 5000, warmupIterations: 50 },
  );

  bench(
    "getAllToolNames() (cold, fresh parse)",
    () => {
      // Parse from scratch to simulate cold path
      parseToolFilter(undefined);
    },
    { iterations: 500, warmupIterations: 10 },
  );

  // Prime the cache
  getToolGroup("pg_read_query");

  bench(
    "getToolGroup() x4 lookups",
    () => {
      getToolGroup("pg_read_query");
      getToolGroup("pg_jsonb_extract");
      getToolGroup("pg_vector_search");
      getToolGroup("pg_execute_code");
    },
    { iterations: 5000, warmupIterations: 50 },
  );
});

// ---------------------------------------------------------------------------
// 3. Filter Summary & Catalog
// ---------------------------------------------------------------------------
describe("Filter Summary", () => {
  const config = parseToolFilter("starter");

  bench(
    "getFilterSummary() for starter",
    () => {
      getFilterSummary(config);
    },
    { iterations: 1000, warmupIterations: 10 },
  );

  bench(
    "getToolGroupInfo() catalog (inline)",
    () => {
      Object.entries(TOOL_GROUPS).map(([group, tools]) => ({
        group: group as ToolGroup,
        count: tools.length,
        tools,
      }));
    },
    { iterations: 2000, warmupIterations: 20 },
  );

  bench(
    "getMetaGroupInfo() catalog (inline)",
    () => {
      Object.entries(META_GROUPS).map(([metaGroup, groups]) => ({
        metaGroup: metaGroup as MetaGroup,
        groups,
        count: getMetaGroupTools(metaGroup as MetaGroup).length,
      }));
    },
    { iterations: 2000, warmupIterations: 20 },
  );
});
