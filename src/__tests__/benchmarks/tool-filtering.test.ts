/**
 * postgres-mcp - Tool Filtering & Registration Performance Benchmarks
 *
 * Measures filter parsing, tool registration, and definition caching.
 *
 * Run: npm test -- --grep="Tool Filtering Benchmarks"
 */

import { describe, it, expect, vi } from "vitest";
import {
  parseToolFilter,
  getAllToolNames,
  getToolGroup,
  getFilterSummary,
  clearToolFilterCaches,
  getToolGroupInfo,
  getMetaGroupInfo,
} from "../../filtering/ToolFilter.js";

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

function benchmark(
  fn: () => void,
  iterations = 1000,
): { mean: number; p50: number; p95: number; p99: number } {
  const times: number[] = [];
  for (let i = 0; i < 5; i++) fn();
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push((performance.now() - start) * 1000);
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  return {
    mean: Math.round(mean * 100) / 100,
    p50: Math.round(times[Math.floor(times.length * 0.5)]! * 100) / 100,
    p95: Math.round(times[Math.floor(times.length * 0.95)]! * 100) / 100,
    p99: Math.round(times[Math.floor(times.length * 0.99)]! * 100) / 100,
  };
}

describe("Tool Filtering Benchmarks", () => {
  // -------------------------------------------------------------------------
  // 1. Filter parsing — various complexity levels
  // -------------------------------------------------------------------------
  describe("parseToolFilter()", () => {
    it("no filter (all tools enabled)", () => {
      const result = benchmark(() => {
        parseToolFilter(undefined);
      }, 2000);

      console.error(
        `[BENCH] parseToolFilter(undefined):  mean=${String(result.mean)}µs  p50=${String(result.p50)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(500);
    });

    it("simple shortcut (starter)", () => {
      const result = benchmark(() => {
        parseToolFilter("starter");
      }, 2000);

      console.error(
        `[BENCH] parseToolFilter("starter"):  mean=${String(result.mean)}µs  p50=${String(result.p50)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(500);
    });

    it("complex filter expression", () => {
      const result = benchmark(() => {
        parseToolFilter("starter,+text,+vector,-pg_drop_table,-pg_truncate");
      }, 2000);

      console.error(
        `[BENCH] parseToolFilter(complex):  mean=${String(result.mean)}µs  p50=${String(result.p50)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(1000);
    });

    it("codemode-only filter", () => {
      const result = benchmark(() => {
        parseToolFilter("codemode");
      }, 2000);

      const config = parseToolFilter("codemode");
      console.error(
        `[BENCH] parseToolFilter("codemode"):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs  tools=${String(config.enabledTools.size)}`,
      );

      expect(config.enabledTools.has("pg_execute_code")).toBe(true);
    });

    it("exclusion-mode filter (-vector,-postgis)", () => {
      const result = benchmark(() => {
        parseToolFilter("-vector,-postgis,-cron,-partman,-kcache,-ltree");
      }, 2000);

      console.error(
        `[BENCH] parseToolFilter(exclusion):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(1000);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Lookup operations
  // -------------------------------------------------------------------------
  describe("Lookup Operations", () => {
    it("getAllToolNames() (cached)", () => {
      // Ensure cache is populated
      getAllToolNames();

      const result = benchmark(() => {
        getAllToolNames();
      }, 5000);

      const names = getAllToolNames();
      console.error(
        `[BENCH] getAllToolNames(cached):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs  count=${String(names.length)}`,
      );

      expect(result.p95).toBeLessThan(10);
    });

    it("getAllToolNames() after cache clear", () => {
      const result = benchmark(() => {
        clearToolFilterCaches();
        getAllToolNames();
      }, 500);

      console.error(
        `[BENCH] getAllToolNames(cold):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(1000);
    });

    it("getToolGroup() O(1) lookup", () => {
      // Prime the cache
      getToolGroup("pg_read_query");

      const result = benchmark(() => {
        getToolGroup("pg_read_query");
        getToolGroup("pg_jsonb_extract");
        getToolGroup("pg_vector_search");
        getToolGroup("pg_execute_code");
      }, 5000);

      console.error(
        `[BENCH] getToolGroup() x4:  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      // 4 Map.get calls; should be < 5µs total
      expect(result.p95).toBeLessThan(20);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Filter summary generation
  // -------------------------------------------------------------------------
  describe("Filter Summary", () => {
    it("getFilterSummary() for starter", () => {
      const config = parseToolFilter("starter");

      const result = benchmark(() => {
        getFilterSummary(config);
      }, 1000);

      console.error(
        `[BENCH] getFilterSummary:  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(2000);
    });

    it("getToolGroupInfo() catalog", () => {
      const result = benchmark(() => {
        getToolGroupInfo();
      }, 2000);

      const info = getToolGroupInfo();
      console.error(
        `[BENCH] getToolGroupInfo():  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs  groups=${String(info.length)}`,
      );

      expect(info.length).toBe(21);
      expect(result.p95).toBeLessThan(500);
    });

    it("getMetaGroupInfo() catalog", () => {
      const result = benchmark(() => {
        getMetaGroupInfo();
      }, 2000);

      const info = getMetaGroupInfo();
      console.error(
        `[BENCH] getMetaGroupInfo():  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs  metaGroups=${String(info.length)}`,
      );

      expect(result.p95).toBeLessThan(500);
    });
  });
});
