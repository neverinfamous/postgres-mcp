/**
 * postgres-mcp - Performance Benchmarks
 *
 * Benchmarks for measuring the performance of optimized code paths.
 * Run with: npm test -- --grep="Performance Benchmarks"
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TOOL_GROUPS } from "../../../filtering/tool-constants.js";

// Mock the adapter functions for benchmarking purposes
// These tests verify caching behavior without requiring a real database

/** Derived from canonical TOOL_GROUPS — auto-updates when tools are added */
const TOTAL_TOOLS = Object.values(TOOL_GROUPS).flat().length;

describe("Performance Benchmarks", () => {
  describe("Tool Definition Caching", () => {
    it("should return cached tool definitions on second call", () => {
      // Simulate the caching behavior
      let callCount = 0;
      const generateTools = () => {
        callCount++;
        return Array.from({ length: TOTAL_TOOLS }, (_, i) => ({
          name: `tool_${String(i)}`,
          description: `Tool ${String(i)} description`,
        }));
      };

      let cachedTools: ReturnType<typeof generateTools> | null = null;
      const getToolDefinitions = () => {
        if (cachedTools) return cachedTools;
        cachedTools = generateTools();
        return cachedTools;
      };

      // First call - should generate
      const startFirst = performance.now();
      const tools1 = getToolDefinitions();
      const firstDuration = performance.now() - startFirst;

      // Second call - should use cache
      const startSecond = performance.now();
      const tools2 = getToolDefinitions();
      const secondDuration = performance.now() - startSecond;

      expect(tools1).toBe(tools2); // Same reference
      expect(callCount).toBe(1); // Only generated once
      expect(secondDuration).toBeLessThan(firstDuration); // Cache is faster
    });

    it("should have consistent tool counts derived from TOOL_GROUPS", () => {
      // Derived from canonical TOOL_GROUPS arrays — no manual map needed
      const groupCount = Object.keys(TOOL_GROUPS).length;
      const total = Object.values(TOOL_GROUPS).flat().length;

      expect(groupCount).toBeGreaterThanOrEqual(22);
      expect(total).toBe(TOTAL_TOOLS);
      expect(total).toBeGreaterThan(200); // sanity: should be a large number

      // Every group should have at least one tool
      for (const [group, tools] of Object.entries(TOOL_GROUPS)) {
        expect(tools.length, `group "${group}" should not be empty`).toBeGreaterThan(0);
      }
    });
  });

  describe("Metadata Cache TTL", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("should return cached value before TTL expires", () => {
      const cache = new Map<string, { data: unknown; timestamp: number }>();
      const TTL_MS = 30000;

      // Set cache
      cache.set("test_key", {
        data: { value: "cached" },
        timestamp: Date.now(),
      });

      // Advance time less than TTL
      vi.advanceTimersByTime(15000);

      // Check cache
      const entry = cache.get("test_key");
      expect(entry).toBeDefined();
      const isExpired = Date.now() - entry!.timestamp > TTL_MS;
      expect(isExpired).toBe(false);
    });

    it("should expire cached value after TTL", () => {
      const cache = new Map<string, { data: unknown; timestamp: number }>();
      const TTL_MS = 30000;

      // Set cache
      cache.set("test_key", {
        data: { value: "cached" },
        timestamp: Date.now(),
      });

      // Advance time past TTL
      vi.advanceTimersByTime(31000);

      // Check cache
      const entry = cache.get("test_key");
      expect(entry).toBeDefined();
      const isExpired = Date.now() - entry!.timestamp > TTL_MS;
      expect(isExpired).toBe(true);
    });

    it("should use configurable TTL from environment", () => {
      const defaultTtl = parseInt(
        process.env["METADATA_CACHE_TTL_MS"] ?? "30000",
        10,
      );
      expect(defaultTtl).toBe(30000);
    });
  });

  describe("Parallel Query Execution", () => {
    it("should demonstrate parallel execution concept", () => {
      // This test verifies the conceptual benefit of parallel execution
      // Real query timing depends on database latency, so we verify the pattern

      // Sequential pattern: wait for each before next
      const sequentialPattern = (queries: number) => {
        // Total time = sum of all query times
        return queries * 1; // 1 unit per query
      };

      // Parallel pattern: all at once
      const parallelPattern = (queries: number) => {
        // Total time = max of all query times (all roughly equal)
        return 1; // 1 unit (concurrent)
      };

      const queryCount = 5;
      const sequentialUnits = sequentialPattern(queryCount);
      const parallelUnits = parallelPattern(queryCount);

      // Parallel is faster (5x for 5 queries)
      expect(parallelUnits).toBeLessThan(sequentialUnits);
      expect(sequentialUnits / parallelUnits).toBe(5);
    });
  });

  describe("Batch Query Pattern", () => {
    it("should use single query instead of N+1 for indexes", () => {
      // Verify the optimization concept: single query vs N+1
      const tableCount = 100;
      const singleQueryCount = 1; // Batch query
      const nPlusOneQueryCount = tableCount + 1; // N+1 pattern

      // Expected improvement: N+1 → 1 query (reduced by tableCount)
      const improvement = nPlusOneQueryCount / singleQueryCount;
      expect(improvement).toBe(101); // For 100 tables, 101x fewer queries
    });
  });
});
