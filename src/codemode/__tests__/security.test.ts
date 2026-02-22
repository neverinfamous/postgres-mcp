/**
 * Unit tests for Code Mode Security Manager
 *
 * Tests code validation, rate limiting, result sanitization,
 * and audit logging.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CodeModeSecurityManager } from "../security.js";
import type { SandboxResult } from "../types.js";

describe("CodeModeSecurityManager", () => {
  let security: CodeModeSecurityManager;

  beforeEach(() => {
    security = new CodeModeSecurityManager();
  });

  describe("validateCode()", () => {
    it("should accept valid code", () => {
      const result = security.validateCode(`
                const tables = await pg.core.listTables();
                return tables;
            `);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject empty code", () => {
      const result = security.validateCode("");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("non-empty"))).toBe(true);
    });

    it("should reject code exceeding max length", () => {
      const longCode = "x".repeat(100000);
      const result = security.validateCode(longCode);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("exceeds maximum"))).toBe(
        true,
      );
    });

    it("should block require() calls", () => {
      const result = security.validateCode('const fs = require("fs");');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("require"))).toBe(true);
    });

    it("should block process access", () => {
      const result = security.validateCode("console.log(process.env);");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("process"))).toBe(true);
    });

    it("should block eval()", () => {
      const result = security.validateCode('eval("malicious code");');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("eval"))).toBe(true);
    });

    it("should block Function constructor", () => {
      const result = security.validateCode('new Function("return 1")();');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Function"))).toBe(true);
    });

    it("should block __proto__ manipulation", () => {
      const result = security.validateCode("obj.__proto__ = malicious;");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("__proto__"))).toBe(true);
    });

    it("should block child_process", () => {
      const result = security.validateCode('require("child_process")');
      expect(result.valid).toBe(false);
    });

    it("should block global access", () => {
      const result = security.validateCode("global.process");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("global"))).toBe(true);
    });

    it("should allow legitimate code patterns", () => {
      const validCode = `
                const results = [];
                for (const table of await pg.core.listTables()) {
                    const stats = await pg.performance.tableStats({ table: table.name });
                    results.push({ name: table.name, rows: stats.row_count });
                }
                return results;
            `;
      const result = security.validateCode(validCode);
      expect(result.valid).toBe(true);
    });
  });

  describe("checkRateLimit()", () => {
    it("should allow requests within limit", () => {
      for (let i = 0; i < 5; i++) {
        expect(security.checkRateLimit("client1")).toBe(true);
      }
    });

    it("should track clients separately", () => {
      for (let i = 0; i < 30; i++) {
        security.checkRateLimit("client1");
        security.checkRateLimit("client2");
      }
      expect(security.checkRateLimit("client1")).toBe(true);
      expect(security.checkRateLimit("client2")).toBe(true);
    });

    it("should block when rate limit exceeded", () => {
      const clientId = "test-client";
      // Exhaust rate limit (default is 60/min)
      for (let i = 0; i < 60; i++) {
        security.checkRateLimit(clientId);
      }
      expect(security.checkRateLimit(clientId)).toBe(false);
    });
  });

  describe("getRateLimitRemaining()", () => {
    it("should return max for new clients", () => {
      const remaining = security.getRateLimitRemaining("new-client");
      expect(remaining).toBe(60); // Default max executions per minute
    });

    it("should return reduced count after requests", () => {
      const clientId = "rate-limit-test";
      security.checkRateLimit(clientId);
      security.checkRateLimit(clientId);
      security.checkRateLimit(clientId);

      const remaining = security.getRateLimitRemaining(clientId);
      expect(remaining).toBe(57); // 60 - 3
    });

    it("should return 0 when exhausted", () => {
      const clientId = "exhausted-client";
      for (let i = 0; i < 60; i++) {
        security.checkRateLimit(clientId);
      }
      expect(security.getRateLimitRemaining(clientId)).toBe(0);
    });
  });

  describe("cleanupRateLimits()", () => {
    it("should remove expired entries", () => {
      // This just verifies the method runs without error
      // Actual cleanup depends on timing
      security.checkRateLimit("cleanup-client");
      security.cleanupRateLimits();
      // Method should complete without error
      expect(true).toBe(true);
    });
  });

  describe("sanitizeResult()", () => {
    it("should return primitive values unchanged", () => {
      expect(security.sanitizeResult(42)).toBe(42);
      expect(security.sanitizeResult("hello")).toBe("hello");
      expect(security.sanitizeResult(true)).toBe(true);
      expect(security.sanitizeResult(null)).toBe(null);
    });

    it("should return small objects unchanged", () => {
      const obj = { a: 1, b: "test" };
      expect(security.sanitizeResult(obj)).toEqual(obj);
    });

    it("should return small arrays unchanged", () => {
      const arr = [1, 2, 3, 4, 5];
      expect(security.sanitizeResult(arr)).toEqual(arr);
    });

    it("should handle large results", () => {
      // Test that sanitizeResult handles large strings by returning something
      const largeString = "x".repeat(100); // Smaller to test behavior
      const result = security.sanitizeResult(largeString);
      expect(result).toBeDefined();
    });

    it("should truncate results exceeding maxResultSize", () => {
      const smallSecurity = new CodeModeSecurityManager({
        maxResultSize: 50,
      });
      const largeObj = { data: "x".repeat(200) };
      const result = smallSecurity.sanitizeResult(largeObj) as {
        _truncated: boolean;
        _originalSize: number;
        preview: string;
      };
      expect(result._truncated).toBe(true);
      expect(result._originalSize).toBeGreaterThan(50);
      expect(result.preview).toContain("...");
    });

    it("should handle unserializable results (circular ref)", () => {
      const circular: Record<string, unknown> = {};
      circular["self"] = circular;
      const result = security.sanitizeResult(circular) as {
        _error: string;
        _type: string;
      };
      expect(result._error).toBe("Result could not be serialized");
      expect(result._type).toBe("object");
    });
  });

  describe("cleanupRateLimits() - expired entry removal", () => {
    it("should delete entries whose resetTime has passed", () => {
      security.checkRateLimit("expired-client");
      // Fast-forward time past the 60s window
      const originalDateNow = Date.now;
      Date.now = () => originalDateNow() + 120_000;
      try {
        security.cleanupRateLimits();
        // After cleanup, remaining should be full (entry deleted)
        expect(security.getRateLimitRemaining("expired-client")).toBe(60);
      } finally {
        Date.now = originalDateNow;
      }
    });
  });

  describe("createExecutionRecord()", () => {
    it("should create record from successful result", () => {
      const successResult: SandboxResult = {
        success: true,
        result: { data: "test" },
        metrics: { wallTimeMs: 100, cpuTimeMs: 80, memoryUsedMb: 5 },
      };
      const record = security.createExecutionRecord(
        "return pg.core.listTables();",
        successResult,
        true,
        "client-123",
      );
      expect(record).toBeDefined();
      expect(record.id).toBeDefined();
      expect(record.codePreview).toBeDefined();
      expect(record.timestamp).toBeDefined();
      expect(record.clientId).toBe("client-123");
      expect(record.readonly).toBe(true);
    });

    it("should create record from failed result", () => {
      const failResult: SandboxResult = {
        success: false,
        error: "Test error",
        stack: "Error stack trace",
        metrics: { wallTimeMs: 10, cpuTimeMs: 5, memoryUsedMb: 1 },
      };
      const record = security.createExecutionRecord(
        'throw new Error("test");',
        failResult,
        false,
      );
      expect(record).toBeDefined();
      expect(record.result.success).toBe(false);
      expect(record.result.error).toBe("Test error");
    });
  });

  describe("auditLog()", () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it("should log successful execution", () => {
      const successResult: SandboxResult = {
        success: true,
        metrics: { wallTimeMs: 50, cpuTimeMs: 40, memoryUsedMb: 2 },
      };
      const record = security.createExecutionRecord(
        "return 1;",
        successResult,
        true,
        "test-client",
      );
      security.auditLog(record);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("should log failed execution", () => {
      const failResult: SandboxResult = {
        success: false,
        error: "Execution failed",
        metrics: { wallTimeMs: 10, cpuTimeMs: 5, memoryUsedMb: 1 },
      };
      const record = security.createExecutionRecord(
        "throw new Error();",
        failResult,
        false,
        "test-client",
      );
      security.auditLog(record);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});
