/**
 * postgres-mcp - HTTP Transport & Auth Middleware Performance Benchmarks
 *
 * Measures request pipeline overhead, rate limiting, CORS/security headers,
 * and OAuth middleware functions.
 *
 * Run: npm run bench
 */

import { describe, bench, vi } from "vitest";
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

// ---------------------------------------------------------------------------
// 1. Token Extraction
// ---------------------------------------------------------------------------
describe("Token Extraction", () => {
  const validHeader =
    "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiYXVkIjoicG9zdGdyZXMtbWNwLWNsaWVudCIsImlzcyI6Imh0dHA6Ly9sb2NhbGhvc3Q6ODA4MC9yZWFsbXMvcG9zdGdyZXMtbWNwIiwic2NvcGUiOiJyZWFkIHdyaXRlIGFkbWluIn0.signature";

  bench(
    "extractBearerToken(valid)",
    () => {
      extractBearerToken(validHeader);
    },
    { iterations: 10000, warmupIterations: 100 },
  );

  bench(
    "extractBearerToken(undefined)",
    () => {
      extractBearerToken(undefined);
    },
    { iterations: 10000, warmupIterations: 100 },
  );

  bench(
    "extractBearerToken(Basic — malformed)",
    () => {
      extractBearerToken("Basic dXNlcjpwYXNz");
    },
    { iterations: 10000, warmupIterations: 100 },
  );
});

// ---------------------------------------------------------------------------
// 2. Scope Checking
// ---------------------------------------------------------------------------
describe("Scope Checking", () => {
  bench(
    'hasScope("read")',
    () => {
      hasScope(validContext.scopes, "read");
    },
    { iterations: 10000, warmupIterations: 100 },
  );

  bench(
    'hasAnyScope(["admin","full"])',
    () => {
      hasAnyScope(validContext.scopes, ["admin", "full"]);
    },
    { iterations: 10000, warmupIterations: 100 },
  );

  bench(
    'requireScope("read") success path',
    () => {
      requireScope(validContext, "read");
    },
    { iterations: 10000, warmupIterations: 100 },
  );

  bench(
    'requireToolScope(["read"])',
    () => {
      requireToolScope(validContext, ["read"]);
    },
    { iterations: 10000, warmupIterations: 100 },
  );

  bench(
    "requireAnyScope(pattern-based scopes)",
    () => {
      requireAnyScope(validContext, ["db:mydb", "table:public:users", "admin"]);
    },
    { iterations: 10000, warmupIterations: 100 },
  );
});

// ---------------------------------------------------------------------------
// 3. Error Formatting
// ---------------------------------------------------------------------------
describe("Error Formatting", () => {
  const errors = [
    new TokenMissingError(),
    new InvalidTokenError("Token expired"),
    new InsufficientScopeError(["admin"]),
    new Error("Generic error"),
  ];

  bench(
    "formatOAuthError() x4 error types",
    () => {
      for (const err of errors) formatOAuthError(err);
    },
    { iterations: 5000, warmupIterations: 50 },
  );
});

// ---------------------------------------------------------------------------
// 4. Rate Limiting
// ---------------------------------------------------------------------------
describe("HTTP Rate Limiting", () => {
  bench(
    "rate limit check (single IP)",
    () => {
      const rateLimitMap = new Map<
        string,
        { count: number; resetTime: number }
      >();
      const windowMs = 60000;
      const now = Date.now();
      const existing = rateLimitMap.get("192.168.1.1");
      if (!existing || now >= existing.resetTime) {
        rateLimitMap.set("192.168.1.1", {
          count: 1,
          resetTime: now + windowMs,
        });
      } else {
        existing.count++;
      }
    },
    { iterations: 10000, warmupIterations: 100 },
  );

  bench(
    "rate limit check (100 unique IPs, random access)",
    () => {
      const rateLimitMap = new Map<
        string,
        { count: number; resetTime: number }
      >();
      const windowMs = 60000;
      const maxRequests = 100;
      const now = Date.now();
      for (let i = 0; i < 100; i++) {
        rateLimitMap.set(`192.168.1.${String(i)}`, {
          count: 1,
          resetTime: now + windowMs,
        });
      }
      const ip = `192.168.1.${String(Math.floor(Math.random() * 100))}`;
      const entry = rateLimitMap.get(ip);
      if (entry && entry.count < maxRequests) {
        entry.count++;
      }
    },
    { iterations: 10000, warmupIterations: 100 },
  );
});
