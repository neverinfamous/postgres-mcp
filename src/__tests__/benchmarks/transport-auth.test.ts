/**
 * postgres-mcp - HTTP Transport & Auth Middleware Performance Benchmarks
 *
 * Measures request pipeline overhead, rate limiting, CORS/security headers,
 * and OAuth middleware functions.
 *
 * Run: npm test -- --grep="Transport & Auth Benchmarks"
 */

import { describe, it, expect, vi } from "vitest";
import {
  extractBearerToken,
  requireScope,
  requireAnyScope,
  requireToolScope,
  formatOAuthError,
} from "../../auth/middleware.js";
import {
  TokenMissingError,
  InvalidTokenError,
  InsufficientScopeError,
} from "../../auth/errors.js";
import { hasScope, hasAnyScope } from "../../auth/scopes.js";
import type { AuthenticatedContext } from "../../auth/middleware.js";

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
  iterations = 5000,
): { mean: number; p50: number; p95: number; p99: number } {
  const times: number[] = [];
  for (let i = 0; i < 10; i++) fn();
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

describe("Transport & Auth Benchmarks", () => {
  // -------------------------------------------------------------------------
  // 1. Bearer token extraction — called on every HTTP request
  // -------------------------------------------------------------------------
  describe("Token Extraction", () => {
    it("extractBearerToken() with valid token", () => {
      const header =
        "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiYXVkIjoicG9zdGdyZXMtbWNwLWNsaWVudCIsImlzcyI6Imh0dHA6Ly9sb2NhbGhvc3Q6ODA4MC9yZWFsbXMvcG9zdGdyZXMtbWNwIiwic2NvcGUiOiJyZWFkIHdyaXRlIGFkbWluIn0.signature";

      const result = benchmark(() => {
        extractBearerToken(header);
      }, 10000);

      console.error(
        `[BENCH] extractBearerToken(valid):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      // String split + comparison; should be < 3µs
      expect(result.p95).toBeLessThan(20);
    });

    it("extractBearerToken() with no header", () => {
      const result = benchmark(() => {
        extractBearerToken(undefined);
      }, 10000);

      console.error(
        `[BENCH] extractBearerToken(undefined):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(10);
    });

    it("extractBearerToken() with malformed header", () => {
      const result = benchmark(() => {
        extractBearerToken("Basic dXNlcjpwYXNz");
      }, 10000);

      console.error(
        `[BENCH] extractBearerToken(Basic):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(10);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Scope checking — called on every authenticated request
  // -------------------------------------------------------------------------
  describe("Scope Checking", () => {
    const validContext: AuthenticatedContext = {
      authenticated: true,
      claims: {
        sub: "user-123",
        iss: "http://localhost:8080/realms/postgres-mcp",
        aud: "postgres-mcp-client",
        scopes: ["read", "write", "admin", "db:mydb", "table:public:users"],
        exp: Date.now() / 1000 + 3600,
        iat: Date.now() / 1000,
      },
      scopes: ["read", "write", "admin", "db:mydb", "table:public:users"],
    };

    it("hasScope() simple scope", () => {
      const result = benchmark(() => {
        hasScope(validContext.scopes, "read");
      }, 10000);

      console.error(
        `[BENCH] hasScope("read"):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(10);
    });

    it("hasAnyScope() multiple scopes", () => {
      const result = benchmark(() => {
        hasAnyScope(validContext.scopes, ["admin", "full"]);
      }, 10000);

      console.error(
        `[BENCH] hasAnyScope(["admin","full"]):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(20);
    });

    it("requireScope() success path", () => {
      const result = benchmark(() => {
        requireScope(validContext, "read");
      }, 10000);

      console.error(
        `[BENCH] requireScope("read"):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(20);
    });

    it("requireToolScope() with scope mapping", () => {
      const result = benchmark(() => {
        requireToolScope(validContext, ["read"]);
      }, 10000);

      console.error(
        `[BENCH] requireToolScope(["read"]):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(30);
    });

    it("requireAnyScope() with pattern-based scopes", () => {
      const result = benchmark(() => {
        requireAnyScope(validContext, [
          "db:mydb",
          "table:public:users",
          "admin",
        ]);
      }, 10000);

      console.error(
        `[BENCH] requireAnyScope(pattern):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(30);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Error formatting — called on auth failures
  // -------------------------------------------------------------------------
  describe("Error Formatting", () => {
    it("formatOAuthError() for each error type", () => {
      const errors = [
        new TokenMissingError(),
        new InvalidTokenError("Token expired"),
        new InsufficientScopeError(["admin"]),
        new Error("Generic error"),
      ];

      const result = benchmark(() => {
        for (const err of errors) formatOAuthError(err);
      }, 5000);

      console.error(
        `[BENCH] formatOAuthError() x4 types:  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      // instanceof checks + object creation; should be < 20µs
      expect(result.p95).toBeLessThan(100);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Rate limiting simulation (replicates HttpTransport.checkRateLimit logic)
  // -------------------------------------------------------------------------
  describe("HTTP Rate Limiting", () => {
    it("rate limit check (Map-based)", () => {
      const rateLimitMap = new Map<
        string,
        { count: number; resetTime: number }
      >();
      const windowMs = 60000;
      const maxRequests = 100;

      const checkRateLimit = (ip: string): boolean => {
        const now = Date.now();
        const existing = rateLimitMap.get(ip);
        if (!existing || now >= existing.resetTime) {
          rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
          return true;
        }
        if (existing.count >= maxRequests) return false;
        existing.count++;
        return true;
      };

      const result = benchmark(() => {
        checkRateLimit("192.168.1.1");
      }, 10000);

      console.error(
        `[BENCH] checkRateLimit(Map):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      // Map.get + Date.now() + conditional; should be < 3µs
      expect(result.p95).toBeLessThan(20);
    });

    it("rate limit with 100 unique IPs", () => {
      const rateLimitMap = new Map<
        string,
        { count: number; resetTime: number }
      >();
      const windowMs = 60000;
      const maxRequests = 100;

      // Pre-populate 100 IPs
      const now = Date.now();
      for (let i = 0; i < 100; i++) {
        rateLimitMap.set(`192.168.1.${String(i)}`, {
          count: 1,
          resetTime: now + windowMs,
        });
      }

      const result = benchmark(() => {
        const ip = `192.168.1.${String(Math.floor(Math.random() * 100))}`;
        const entry = rateLimitMap.get(ip);
        if (entry && entry.count < maxRequests) {
          entry.count++;
        }
      }, 10000);

      console.error(
        `[BENCH] checkRateLimit(100 IPs):  mean=${String(result.mean)}µs  p95=${String(result.p95)}µs`,
      );

      expect(result.p95).toBeLessThan(20);
    });
  });
});
