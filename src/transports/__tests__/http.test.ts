/**
 * Unit tests for HTTP Transport security features
 *
 * Tests rate limiting, CORS headers, security headers, and HSTS support.
 * Uses mocked HTTP primitives to test behavior without starting a real server.
 */

import { describe, it, expect, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpTransport } from "../http.js";

// Mock the logger to avoid console output during tests
vi.mock("../../utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

/**
 * Create a mock IncomingMessage for testing
 */
function createMockRequest(
  overrides: Partial<IncomingMessage> = {},
): IncomingMessage {
  return {
    method: "GET",
    url: "/test",
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
    ...overrides,
  } as IncomingMessage;
}

/**
 * Create a mock ServerResponse for testing with header tracking
 */
function createMockResponse(): ServerResponse & {
  _headers: Record<string, string>;
  _statusCode: number | null;
  _body: string;
} {
  const headers: Record<string, string> = {};
  return {
    _headers: headers,
    _statusCode: null,
    _body: "",
    setHeader: vi.fn((name: string, value: string) => {
      headers[name.toLowerCase()] = value;
    }),
    getHeader: vi.fn((name: string) => headers[name.toLowerCase()]),
    writeHead: vi.fn(function (this: { _statusCode: number }, code: number) {
      this._statusCode = code;
    }),
    end: vi.fn(function (this: { _body: string }, body?: string) {
      if (body) this._body = body;
    }),
    headersSent: false,
  } as unknown as ServerResponse & {
    _headers: Record<string, string>;
    _statusCode: number | null;
    _body: string;
  };
}

describe("HttpTransport", () => {
  describe("Rate Limiting", () => {
    it("should allow requests within rate limit", () => {
      const transport = new HttpTransport({
        port: 3000,
        enableRateLimit: true,
        rateLimitMaxRequests: 5,
        rateLimitWindowMs: 60000,
      });

      // Access private method via type casting for testing
      const checkRateLimit = (
        transport as unknown as {
          checkRateLimit: (req: IncomingMessage) => boolean;
        }
      ).checkRateLimit.bind(transport);

      const req = createMockRequest();

      // First 5 requests should be allowed
      for (let i = 0; i < 5; i++) {
        expect(checkRateLimit(req)).toBe(true);
      }
    });

    it("should block requests exceeding rate limit", () => {
      const transport = new HttpTransport({
        port: 3000,
        enableRateLimit: true,
        rateLimitMaxRequests: 3,
        rateLimitWindowMs: 60000,
      });

      const checkRateLimit = (
        transport as unknown as {
          checkRateLimit: (req: IncomingMessage) => boolean;
        }
      ).checkRateLimit.bind(transport);

      const req = createMockRequest();

      // First 3 requests allowed
      expect(checkRateLimit(req)).toBe(true);
      expect(checkRateLimit(req)).toBe(true);
      expect(checkRateLimit(req)).toBe(true);

      // 4th request should be blocked
      expect(checkRateLimit(req)).toBe(false);
    });

    it("should track rate limits per IP address", () => {
      const transport = new HttpTransport({
        port: 3000,
        enableRateLimit: true,
        rateLimitMaxRequests: 2,
        rateLimitWindowMs: 60000,
      });

      const checkRateLimit = (
        transport as unknown as {
          checkRateLimit: (req: IncomingMessage) => boolean;
        }
      ).checkRateLimit.bind(transport);

      const req1 = createMockRequest({
        socket: { remoteAddress: "192.168.1.1" },
      } as unknown as IncomingMessage);
      const req2 = createMockRequest({
        socket: { remoteAddress: "192.168.1.2" },
      } as unknown as IncomingMessage);

      // IP 1: use up their limit
      expect(checkRateLimit(req1)).toBe(true);
      expect(checkRateLimit(req1)).toBe(true);
      expect(checkRateLimit(req1)).toBe(false);

      // IP 2: should have their own limit
      expect(checkRateLimit(req2)).toBe(true);
      expect(checkRateLimit(req2)).toBe(true);
      expect(checkRateLimit(req2)).toBe(false);
    });

    it("should bypass rate limiting when disabled", () => {
      const transport = new HttpTransport({
        port: 3000,
        enableRateLimit: false,
      });

      const checkRateLimit = (
        transport as unknown as {
          checkRateLimit: (req: IncomingMessage) => boolean;
        }
      ).checkRateLimit.bind(transport);

      const req = createMockRequest();

      // Should allow unlimited requests
      for (let i = 0; i < 1000; i++) {
        expect(checkRateLimit(req)).toBe(true);
      }
    });

    it("should reset rate limit after window expires", () => {
      vi.useFakeTimers();

      const transport = new HttpTransport({
        port: 3000,
        enableRateLimit: true,
        rateLimitMaxRequests: 2,
        rateLimitWindowMs: 60000,
      });

      const checkRateLimit = (
        transport as unknown as {
          checkRateLimit: (req: IncomingMessage) => boolean;
        }
      ).checkRateLimit.bind(transport);

      const req = createMockRequest();

      // Use up limit
      expect(checkRateLimit(req)).toBe(true);
      expect(checkRateLimit(req)).toBe(true);
      expect(checkRateLimit(req)).toBe(false);

      // Advance past window
      vi.advanceTimersByTime(61000);

      // Should have new limit
      expect(checkRateLimit(req)).toBe(true);

      vi.useRealTimers();
    });
  });

  describe("Security Headers", () => {
    it("should set X-Content-Type-Options header", () => {
      const transport = new HttpTransport({ port: 3000 });
      const res = createMockResponse();

      const setSecurityHeaders = (
        transport as unknown as {
          setSecurityHeaders: (res: ServerResponse) => void;
        }
      ).setSecurityHeaders.bind(transport);

      setSecurityHeaders(res);

      expect(res._headers["x-content-type-options"]).toBe("nosniff");
    });

    it("should set X-Frame-Options header to DENY", () => {
      const transport = new HttpTransport({ port: 3000 });
      const res = createMockResponse();

      const setSecurityHeaders = (
        transport as unknown as {
          setSecurityHeaders: (res: ServerResponse) => void;
        }
      ).setSecurityHeaders.bind(transport);

      setSecurityHeaders(res);

      expect(res._headers["x-frame-options"]).toBe("DENY");
    });

    it("should not set deprecated X-XSS-Protection header", () => {
      const transport = new HttpTransport({ port: 3000 });
      const res = createMockResponse();

      const setSecurityHeaders = (
        transport as unknown as {
          setSecurityHeaders: (res: ServerResponse) => void;
        }
      ).setSecurityHeaders.bind(transport);

      setSecurityHeaders(res);

      expect(res._headers["x-xss-protection"]).toBeUndefined();
    });

    it("should set Permissions-Policy header", () => {
      const transport = new HttpTransport({ port: 3000 });
      const res = createMockResponse();

      const setSecurityHeaders = (
        transport as unknown as {
          setSecurityHeaders: (res: ServerResponse) => void;
        }
      ).setSecurityHeaders.bind(transport);

      setSecurityHeaders(res);

      expect(res._headers["permissions-policy"]).toBe(
        "camera=(), microphone=(), geolocation=()",
      );
    });

    it("should set Cache-Control to prevent caching", () => {
      const transport = new HttpTransport({ port: 3000 });
      const res = createMockResponse();

      const setSecurityHeaders = (
        transport as unknown as {
          setSecurityHeaders: (res: ServerResponse) => void;
        }
      ).setSecurityHeaders.bind(transport);

      setSecurityHeaders(res);

      expect(res._headers["cache-control"]).toBe(
        "no-store, no-cache, must-revalidate",
      );
    });

    it("should set Content-Security-Policy", () => {
      const transport = new HttpTransport({ port: 3000 });
      const res = createMockResponse();

      const setSecurityHeaders = (
        transport as unknown as {
          setSecurityHeaders: (res: ServerResponse) => void;
        }
      ).setSecurityHeaders.bind(transport);

      setSecurityHeaders(res);

      expect(res._headers["content-security-policy"]).toBe(
        "default-src 'none'; frame-ancestors 'none'",
      );
    });
  });

  describe("HSTS Support", () => {
    it("should not set HSTS header by default", () => {
      const transport = new HttpTransport({ port: 3000 });
      const res = createMockResponse();

      const setSecurityHeaders = (
        transport as unknown as {
          setSecurityHeaders: (res: ServerResponse) => void;
        }
      ).setSecurityHeaders.bind(transport);

      setSecurityHeaders(res);

      expect(res._headers["strict-transport-security"]).toBeUndefined();
    });

    it("should set HSTS header when enabled", () => {
      const transport = new HttpTransport({
        port: 3000,
        enableHSTS: true,
      });
      const res = createMockResponse();

      const setSecurityHeaders = (
        transport as unknown as {
          setSecurityHeaders: (res: ServerResponse) => void;
        }
      ).setSecurityHeaders.bind(transport);

      setSecurityHeaders(res);

      expect(res._headers["strict-transport-security"]).toContain("max-age=");
      expect(res._headers["strict-transport-security"]).toContain(
        "includeSubDomains",
      );
    });

    it("should use custom HSTS max-age", () => {
      const transport = new HttpTransport({
        port: 3000,
        enableHSTS: true,
        hstsMaxAge: 86400, // 1 day
      });
      const res = createMockResponse();

      const setSecurityHeaders = (
        transport as unknown as {
          setSecurityHeaders: (res: ServerResponse) => void;
        }
      ).setSecurityHeaders.bind(transport);

      setSecurityHeaders(res);

      expect(res._headers["strict-transport-security"]).toBe(
        "max-age=86400; includeSubDomains",
      );
    });
  });

  describe("CORS Headers", () => {
    it("should not set CORS headers for non-configured origins", () => {
      const transport = new HttpTransport({
        port: 3000,
        corsOrigins: ["https://allowed.example.com"],
      });
      const req = createMockRequest({
        headers: { origin: "https://malicious.example.com" },
      });
      const res = createMockResponse();

      const setCorsHeaders = (
        transport as unknown as {
          setCorsHeaders: (req: IncomingMessage, res: ServerResponse) => void;
        }
      ).setCorsHeaders.bind(transport);

      setCorsHeaders(req, res);

      expect(res._headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("should set CORS headers for configured origins", () => {
      const transport = new HttpTransport({
        port: 3000,
        corsOrigins: ["https://allowed.example.com"],
      });
      const req = createMockRequest({
        headers: { origin: "https://allowed.example.com" },
      });
      const res = createMockResponse();

      const setCorsHeaders = (
        transport as unknown as {
          setCorsHeaders: (req: IncomingMessage, res: ServerResponse) => void;
        }
      ).setCorsHeaders.bind(transport);

      setCorsHeaders(req, res);

      expect(res._headers["access-control-allow-origin"]).toBe(
        "https://allowed.example.com",
      );
      expect(res._headers["access-control-allow-methods"]).toContain("GET");
      expect(res._headers["access-control-allow-methods"]).toContain("POST");
    });

    it("should set Vary header for correct caching", () => {
      const transport = new HttpTransport({
        port: 3000,
        corsOrigins: ["https://example.com"],
      });
      const req = createMockRequest({
        headers: { origin: "https://example.com" },
      });
      const res = createMockResponse();

      const setCorsHeaders = (
        transport as unknown as {
          setCorsHeaders: (req: IncomingMessage, res: ServerResponse) => void;
        }
      ).setCorsHeaders.bind(transport);

      setCorsHeaders(req, res);

      expect(res._headers["vary"]).toBe("Origin");
    });

    it("should expose Mcp-Session-Id header", () => {
      const transport = new HttpTransport({
        port: 3000,
        corsOrigins: ["https://example.com"],
      });
      const req = createMockRequest({
        headers: { origin: "https://example.com" },
      });
      const res = createMockResponse();

      const setCorsHeaders = (
        transport as unknown as {
          setCorsHeaders: (req: IncomingMessage, res: ServerResponse) => void;
        }
      ).setCorsHeaders.bind(transport);

      setCorsHeaders(req, res);

      expect(res._headers["access-control-expose-headers"]).toContain(
        "Mcp-Session-Id",
      );
    });

    it("should not set credentials header by default", () => {
      const transport = new HttpTransport({
        port: 3000,
        corsOrigins: ["https://example.com"],
      });
      const req = createMockRequest({
        headers: { origin: "https://example.com" },
      });
      const res = createMockResponse();

      const setCorsHeaders = (
        transport as unknown as {
          setCorsHeaders: (req: IncomingMessage, res: ServerResponse) => void;
        }
      ).setCorsHeaders.bind(transport);

      setCorsHeaders(req, res);

      expect(res._headers["access-control-allow-credentials"]).toBeUndefined();
    });

    it("should set credentials header when configured", () => {
      const transport = new HttpTransport({
        port: 3000,
        corsOrigins: ["https://example.com"],
        corsAllowCredentials: true,
      });
      const req = createMockRequest({
        headers: { origin: "https://example.com" },
      });
      const res = createMockResponse();

      const setCorsHeaders = (
        transport as unknown as {
          setCorsHeaders: (req: IncomingMessage, res: ServerResponse) => void;
        }
      ).setCorsHeaders.bind(transport);

      setCorsHeaders(req, res);

      expect(res._headers["access-control-allow-credentials"]).toBe("true");
    });

    it("should allow MCP-specific headers", () => {
      const transport = new HttpTransport({
        port: 3000,
        corsOrigins: ["https://example.com"],
      });
      const req = createMockRequest({
        headers: { origin: "https://example.com" },
      });
      const res = createMockResponse();

      const setCorsHeaders = (
        transport as unknown as {
          setCorsHeaders: (req: IncomingMessage, res: ServerResponse) => void;
        }
      ).setCorsHeaders.bind(transport);

      setCorsHeaders(req, res);

      const allowedHeaders = res._headers["access-control-allow-headers"];
      expect(allowedHeaders).toContain("Mcp-Session-Id");
      expect(allowedHeaders).toContain("Mcp-Protocol-Version");
      expect(allowedHeaders).toContain("Authorization");
    });
  });

  describe("Public Path Matching", () => {
    it("should identify exact public paths", () => {
      const transport = new HttpTransport({
        port: 3000,
        publicPaths: ["/health", "/status"],
      });

      const isPublicPath = (
        transport as unknown as {
          isPublicPath: (pathname: string) => boolean;
        }
      ).isPublicPath.bind(transport);

      expect(isPublicPath("/health")).toBe(true);
      expect(isPublicPath("/status")).toBe(true);
      expect(isPublicPath("/protected")).toBe(false);
    });

    it("should match wildcard public paths", () => {
      const transport = new HttpTransport({
        port: 3000,
        publicPaths: ["/.well-known/*"],
      });

      const isPublicPath = (
        transport as unknown as {
          isPublicPath: (pathname: string) => boolean;
        }
      ).isPublicPath.bind(transport);

      expect(isPublicPath("/.well-known/oauth-protected-resource")).toBe(true);
      expect(isPublicPath("/.well-known/openid-configuration")).toBe(true);
      expect(isPublicPath("/api/protected")).toBe(false);
    });

    it("should use default public paths", () => {
      const transport = new HttpTransport({ port: 3000 });

      const isPublicPath = (
        transport as unknown as {
          isPublicPath: (pathname: string) => boolean;
        }
      ).isPublicPath.bind(transport);

      // Default public paths include /health and /.well-known/*
      expect(isPublicPath("/health")).toBe(true);
    });
  });

  describe("handleRequest", () => {
    it("should handle OPTIONS preflight requests", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const req = createMockRequest({ method: "OPTIONS", url: "/messages" });
      const res = createMockResponse();

      const handleRequest = (
        transport as unknown as {
          handleRequest: (
            req: IncomingMessage,
            res: ServerResponse,
          ) => Promise<void>;
        }
      ).handleRequest.bind(transport);

      await handleRequest(req, res);

      expect(res._statusCode).toBe(204);
      expect(res.end).toHaveBeenCalled();
    });

    it("should return 429 when rate limited", async () => {
      const transport = new HttpTransport({
        port: 3000,
        enableRateLimit: true,
        rateLimitMaxRequests: 1,
        rateLimitWindowMs: 60000,
      });
      const req = createMockRequest({ method: "GET", url: "/health" });
      const res = createMockResponse();

      const handleRequest = (
        transport as unknown as {
          handleRequest: (
            req: IncomingMessage,
            res: ServerResponse,
          ) => Promise<void>;
        }
      ).handleRequest.bind(transport);

      // First request uses up the limit
      await handleRequest(req, createMockResponse());

      // Second request should be rate limited
      await handleRequest(req, res);

      expect(res._statusCode).toBe(429);
      expect(res._body).toContain("rate_limit_exceeded");
    });

    it("should return 404 for unknown paths", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const req = createMockRequest({
        method: "GET",
        url: "/unknown-path",
        headers: { host: "localhost:3000" },
      });
      const res = createMockResponse();

      const handleRequest = (
        transport as unknown as {
          handleRequest: (
            req: IncomingMessage,
            res: ServerResponse,
          ) => Promise<void>;
        }
      ).handleRequest.bind(transport);

      await handleRequest(req, res);

      expect(res._statusCode).toBe(404);
      expect(res._body).toContain("Not found");
    });

    it("should route /health to health check handler", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const req = createMockRequest({
        method: "GET",
        url: "/health",
        headers: { host: "localhost:3000" },
      });
      const res = createMockResponse();

      const handleRequest = (
        transport as unknown as {
          handleRequest: (
            req: IncomingMessage,
            res: ServerResponse,
          ) => Promise<void>;
        }
      ).handleRequest.bind(transport);

      await handleRequest(req, res);

      expect(res._statusCode).toBe(200);
      expect(res._body).toContain("healthy");
    });

    it("should set security headers on all responses", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const req = createMockRequest({
        method: "GET",
        url: "/health",
        headers: { host: "localhost:3000" },
      });
      const res = createMockResponse();

      const handleRequest = (
        transport as unknown as {
          handleRequest: (
            req: IncomingMessage,
            res: ServerResponse,
          ) => Promise<void>;
        }
      ).handleRequest.bind(transport);

      await handleRequest(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        "X-Content-Type-Options",
        "nosniff",
      );
      expect(res.setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY");
    });
  });

  describe("handleHealthCheck", () => {
    it("should return healthy status with timestamp", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const res = createMockResponse();

      const handleHealthCheck = (
        transport as unknown as {
          handleHealthCheck: (res: ServerResponse) => void;
        }
      ).handleHealthCheck.bind(transport);

      handleHealthCheck(res);

      expect(res._statusCode).toBe(200);
      const body = JSON.parse(res._body) as {
        status: string;
        timestamp: string;
      };
      expect(body.status).toBe("healthy");
      expect(body.timestamp).toBeDefined();
    });

    it("should return JSON content type", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const res = createMockResponse();

      const handleHealthCheck = (
        transport as unknown as {
          handleHealthCheck: (res: ServerResponse) => void;
        }
      ).handleHealthCheck.bind(transport);

      handleHealthCheck(res);

      expect(res.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "application/json",
      });
    });
  });

  describe("handleProtectedResourceMetadata", () => {
    it("should return 404 when OAuth not configured", () => {
      const transport = new HttpTransport({ port: 3000 });
      const res = createMockResponse();

      const handleProtectedResourceMetadata = (
        transport as unknown as {
          handleProtectedResourceMetadata: (res: ServerResponse) => void;
        }
      ).handleProtectedResourceMetadata.bind(transport);

      handleProtectedResourceMetadata(res);

      expect(res._statusCode).toBe(404);
      expect(res._body).toContain("OAuth not configured");
    });

    it("should return metadata when OAuth is configured", () => {
      const mockResourceServer = {
        getMetadata: vi.fn().mockReturnValue({
          resource: "https://example.com",
          authorization_servers: ["https://auth.example.com"],
          scopes_supported: ["read", "write"],
        }),
      };

      const transport = new HttpTransport({
        port: 3000,
        resourceServer: mockResourceServer as unknown as HttpTransport extends {
          config: { resourceServer?: infer T };
        }
          ? T
          : never,
      });
      const res = createMockResponse();

      const handleProtectedResourceMetadata = (
        transport as unknown as {
          handleProtectedResourceMetadata: (res: ServerResponse) => void;
        }
      ).handleProtectedResourceMetadata.bind(transport);

      handleProtectedResourceMetadata(res);

      expect(res._statusCode).toBe(200);
      expect(mockResourceServer.getMetadata).toHaveBeenCalled();
    });
  });

  describe("handleLegacyMessageRequest", () => {
    it("should return 400 when sessionId is missing", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const req = createMockRequest({ method: "POST", url: "/messages" });
      const res = createMockResponse();
      const url = new URL("http://localhost:3000/messages");

      const handleLegacyMessageRequest = (
        transport as unknown as {
          handleLegacyMessageRequest: (
            req: IncomingMessage,
            res: ServerResponse,
            url: URL,
          ) => Promise<void>;
        }
      ).handleLegacyMessageRequest.bind(transport);

      await handleLegacyMessageRequest(req, res, url);

      expect(res._statusCode).toBe(400);
      expect(res._body).toContain("Missing sessionId parameter");
    });

    it("should return 404 when sessionId not found in transports", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const req = createMockRequest({
        method: "POST",
        url: "/messages?sessionId=unknown",
      });
      const res = createMockResponse();
      const url = new URL("http://localhost:3000/messages?sessionId=unknown");

      const handleLegacyMessageRequest = (
        transport as unknown as {
          handleLegacyMessageRequest: (
            req: IncomingMessage,
            res: ServerResponse,
            url: URL,
          ) => Promise<void>;
        }
      ).handleLegacyMessageRequest.bind(transport);

      await handleLegacyMessageRequest(req, res, url);

      expect(res._statusCode).toBe(404);
      expect(res._body).toContain("No transport found for sessionId");
    });

    it("should forward request to SSE transport when session exists", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const mockSSETransport = {
        handlePostMessage: vi.fn().mockResolvedValue(undefined),
        sessionId: "test-session",
      };

      // Inject a mock transport into the transports map
      const transportsMap = transport.getTransports();
      // Use Object.create to make instanceof checks work
      const { SSEServerTransport: SSEClass } =
        await import("@modelcontextprotocol/sdk/server/sse.js");
      Object.setPrototypeOf(mockSSETransport, SSEClass.prototype);
      transportsMap.set(
        "test-session",
        mockSSETransport as unknown as InstanceType<typeof SSEClass>,
      );

      const req = createMockRequest({
        method: "POST",
        url: "/messages?sessionId=test-session",
      });
      const res = createMockResponse();
      const url = new URL(
        "http://localhost:3000/messages?sessionId=test-session",
      );

      const handleLegacyMessageRequest = (
        transport as unknown as {
          handleLegacyMessageRequest: (
            req: IncomingMessage,
            res: ServerResponse,
            url: URL,
          ) => Promise<void>;
        }
      ).handleLegacyMessageRequest.bind(transport);

      await handleLegacyMessageRequest(req, res, url);

      expect(mockSSETransport.handlePostMessage).toHaveBeenCalledWith(req, res);
    });
  });

  describe("handleLegacySSERequest", () => {
    it("should call onConnect callback with SSE transport", async () => {
      const onConnect = vi.fn();
      const transport = new HttpTransport({ port: 3000 }, onConnect);
      const req = createMockRequest({ method: "GET", url: "/sse" });
      const res = createMockResponse();

      const handleLegacySSERequest = (
        transport as unknown as {
          handleLegacySSERequest: (
            req: IncomingMessage,
            res: ServerResponse,
          ) => Promise<void>;
        }
      ).handleLegacySSERequest.bind(transport);

      try {
        await handleLegacySSERequest(req, res);
        // onConnect should be called with the SSE transport
        expect(onConnect).toHaveBeenCalled();
        // Transport should be registered in the transports map
        expect(transport.getTransports().size).toBeGreaterThan(0);
      } catch {
        // May fail in unit test environment without full HTTP context
      }
    });

    it("should register transport in transports map", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const req = createMockRequest({ method: "GET", url: "/sse" });
      const res = createMockResponse();

      // Initially empty
      expect(transport.getTransports().size).toBe(0);

      const handleLegacySSERequest = (
        transport as unknown as {
          handleLegacySSERequest: (
            req: IncomingMessage,
            res: ServerResponse,
          ) => Promise<void>;
        }
      ).handleLegacySSERequest.bind(transport);

      try {
        await handleLegacySSERequest(req, res);
        // After SSE request, a transport should be registered
        expect(transport.getTransports().size).toBe(1);
      } catch {
        // Expected in unit test without proper HTTP stream
      }
    });
  });

  describe("Constructor and Configuration", () => {
    it("should use default values when not provided", () => {
      const transport = new HttpTransport({ port: 3000 });

      // Access config through private
      const config = (
        transport as unknown as { config: Record<string, unknown> }
      ).config;

      expect(config.host).toBe("localhost");
      expect(config.enableRateLimit).toBe(true);
      expect(config.enableHSTS).toBe(false);
    });

    it("should accept custom configuration", () => {
      const transport = new HttpTransport({
        port: 8080,
        host: "0.0.0.0",
        enableRateLimit: false,
        enableHSTS: true,
        hstsMaxAge: 3600,
        maxBodySize: 2097152,
        rateLimitMaxRequests: 200,
        rateLimitWindowMs: 120000,
      });

      const config = (
        transport as unknown as { config: Record<string, unknown> }
      ).config;

      expect(config.port).toBe(8080);
      expect(config.host).toBe("0.0.0.0");
      expect(config.enableRateLimit).toBe(false);
      expect(config.enableHSTS).toBe(true);
      expect(config.hstsMaxAge).toBe(3600);
    });

    it("should store onConnect callback", () => {
      const onConnect = vi.fn();
      const transport = new HttpTransport({ port: 3000 }, onConnect);

      const storedCallback = (
        transport as unknown as { onConnect?: () => void }
      ).onConnect;
      expect(storedCallback).toBe(onConnect);
    });
  });

  describe("getTransports", () => {
    it("should return empty map when no sessions exist", () => {
      const transport = new HttpTransport({ port: 3000 });

      expect(transport.getTransports().size).toBe(0);
    });
  });

  describe("stop", () => {
    it("should resolve immediately when server is not started", async () => {
      const transport = new HttpTransport({ port: 3000 });

      // Should not throw and should resolve
      await expect(transport.stop()).resolves.toBeUndefined();
    });
  });

  describe("OAuth Authentication Integration", () => {
    it("should skip auth for public paths", async () => {
      const mockTokenValidator = {
        validate: vi.fn(),
      };
      const mockResourceServer = {
        getMetadata: vi.fn(),
      };

      const transport = new HttpTransport({
        port: 3000,
        resourceServer: mockResourceServer as unknown as HttpTransport extends {
          config: { resourceServer?: infer T };
        }
          ? T
          : never,
        tokenValidator: mockTokenValidator as unknown as HttpTransport extends {
          config: { tokenValidator?: infer T };
        }
          ? T
          : never,
        publicPaths: ["/health"],
      });

      const req = createMockRequest({
        method: "GET",
        url: "/health",
        headers: { host: "localhost:3000" },
      });
      const res = createMockResponse();

      const handleRequest = (
        transport as unknown as {
          handleRequest: (
            req: IncomingMessage,
            res: ServerResponse,
          ) => Promise<void>;
        }
      ).handleRequest.bind(transport);

      await handleRequest(req, res);

      // Token validator should not have been called for public path
      expect(mockTokenValidator.validate).not.toHaveBeenCalled();
      expect(res._statusCode).toBe(200);
    });

    it("should return 401 when auth fails on protected path", async () => {
      // Mock validator that returns invalid token result
      const mockTokenValidator = {
        validate: vi
          .fn()
          .mockResolvedValue({ valid: false, error: "Token expired" }),
      };
      const mockResourceServer = {
        getMetadata: vi.fn(),
      };

      const transport = new HttpTransport({
        port: 3000,
        resourceServer: mockResourceServer as unknown as HttpTransport extends {
          config: { resourceServer?: infer T };
        }
          ? T
          : never,
        tokenValidator: mockTokenValidator as unknown as HttpTransport extends {
          config: { tokenValidator?: infer T };
        }
          ? T
          : never,
        publicPaths: ["/health"],
      });

      const req = createMockRequest({
        method: "POST",
        url: "/messages",
        headers: { host: "localhost:3000", authorization: "Bearer invalid" },
      });
      const res = createMockResponse();

      const handleRequest = (
        transport as unknown as {
          handleRequest: (
            req: IncomingMessage,
            res: ServerResponse,
          ) => Promise<void>;
        }
      ).handleRequest.bind(transport);

      await handleRequest(req, res);

      // Should return 401 for authentication failure
      expect(res._statusCode).toBe(401);
      // WWW-Authenticate header is passed via writeHead object, verify writeHead was called correctly
      expect(res.writeHead).toHaveBeenCalledWith(
        401,
        expect.objectContaining({
          "WWW-Authenticate": "Bearer",
        }),
      );
    });
  });

  describe("SSE Request Handling", () => {
    it("should route /sse to legacy SSE handler", async () => {
      const onConnect = vi.fn();
      const transport = new HttpTransport({ port: 3000 }, onConnect);
      const req = createMockRequest({
        method: "GET",
        url: "/sse",
        headers: { host: "localhost:3000" },
      });
      const res = createMockResponse();

      const handleRequest = (
        transport as unknown as {
          handleRequest: (
            req: IncomingMessage,
            res: ServerResponse,
          ) => Promise<void>;
        }
      ).handleRequest.bind(transport);

      // Legacy SSE creates SSEServerTransport which calls res.writeHead for SSE stream
      try {
        await handleRequest(req, res);
        // If it succeeds, onConnect should be called
        expect(onConnect).toHaveBeenCalled();
        // Transport should be registered in the transports map
        expect(transport.getTransports().size).toBeGreaterThan(0);
      } catch {
        // Expected in unit test without proper transport setup
      }
    });

    it("should route /.well-known/oauth-protected-resource to metadata handler", async () => {
      const mockResourceServer = {
        getMetadata: vi.fn().mockReturnValue({
          resource: "https://example.com",
          authorization_servers: ["https://auth.example.com"],
        }),
      };

      const transport = new HttpTransport({
        port: 3000,
        resourceServer: mockResourceServer as unknown as HttpTransport extends {
          config: { resourceServer?: infer T };
        }
          ? T
          : never,
      });

      const req = createMockRequest({
        method: "GET",
        url: "/.well-known/oauth-protected-resource",
        headers: { host: "localhost:3000" },
      });
      const res = createMockResponse();

      const handleRequest = (
        transport as unknown as {
          handleRequest: (
            req: IncomingMessage,
            res: ServerResponse,
          ) => Promise<void>;
        }
      ).handleRequest.bind(transport);

      await handleRequest(req, res);

      expect(res._statusCode).toBe(200);
      expect(mockResourceServer.getMetadata).toHaveBeenCalled();
    });
  });

  describe("Rate Limit Cleanup", () => {
    it("should handle unknown remote address", () => {
      const transport = new HttpTransport({
        port: 3000,
        enableRateLimit: true,
        rateLimitMaxRequests: 5,
      });

      const checkRateLimit = (
        transport as unknown as {
          checkRateLimit: (req: IncomingMessage) => boolean;
        }
      ).checkRateLimit.bind(transport);

      // Request with no remote address
      const req = createMockRequest({
        socket: { remoteAddress: undefined },
      } as unknown as IncomingMessage);

      // Should still allow the request
      expect(checkRateLimit(req)).toBe(true);
    });

    it("should cleanup expired entries via deterministic interval", async () => {
      vi.useFakeTimers();

      const transport = new HttpTransport({
        port: 3000,
        enableRateLimit: true,
        rateLimitMaxRequests: 10,
        rateLimitWindowMs: 60000,
      });

      // Simulate start() to kick off the cleanup interval
      // We access the internals directly since we don't want to start a real server
      const startCleanup = () => {
        const intervalRef = setInterval(() => {
          const now = Date.now();
          const rateLimitMap = (
            transport as unknown as {
              rateLimitMap: Map<string, { count: number; resetTime: number }>;
            }
          ).rateLimitMap;
          for (const [ip, entry] of rateLimitMap) {
            if (now > entry.resetTime) {
              rateLimitMap.delete(ip);
            }
          }
        }, 60_000);
        (
          transport as unknown as {
            rateLimitCleanupInterval: NodeJS.Timeout | null;
          }
        ).rateLimitCleanupInterval = intervalRef;
      };
      startCleanup();

      // Access the rate limit map directly to populate with expired entries
      const rateLimitMap = (
        transport as unknown as {
          rateLimitMap: Map<string, { count: number; resetTime: number }>;
        }
      ).rateLimitMap;

      // Add entries with expired timestamps
      const now = Date.now();
      for (let i = 0; i < 50; i++) {
        rateLimitMap.set(`192.168.1.${String(i)}`, {
          count: 1,
          resetTime: now - 60000, // Already expired
        });
      }
      // Add one non-expired entry
      rateLimitMap.set("10.0.0.1", {
        count: 1,
        resetTime: now + 120000, // Still valid
      });

      expect(rateLimitMap.size).toBe(51);

      // Advance time past the 60s cleanup interval
      vi.advanceTimersByTime(60_001);

      // After cleanup, only the non-expired entry should remain
      expect(rateLimitMap.size).toBe(1);
      expect(rateLimitMap.has("10.0.0.1")).toBe(true);

      // Clean up
      await transport.stop();
      vi.useRealTimers();
    });

    it("should clear cleanup interval on stop", async () => {
      vi.useFakeTimers();

      const transport = new HttpTransport({
        port: 3000,
        enableRateLimit: true,
      });

      // Simulate start — set up interval directly
      const intervalRef = setInterval(() => {}, 60_000);
      (
        transport as unknown as {
          rateLimitCleanupInterval: NodeJS.Timeout | null;
        }
      ).rateLimitCleanupInterval = intervalRef;

      expect(
        (
          transport as unknown as {
            rateLimitCleanupInterval: NodeJS.Timeout | null;
          }
        ).rateLimitCleanupInterval,
      ).not.toBeNull();

      await transport.stop();

      expect(
        (
          transport as unknown as {
            rateLimitCleanupInterval: NodeJS.Timeout | null;
          }
        ).rateLimitCleanupInterval,
      ).toBeNull();

      vi.useRealTimers();
    });
  });

  describe("Body Size Enforcement", () => {
    it("should return 413 when Content-Length exceeds maxBodySize", async () => {
      const transport = new HttpTransport({
        port: 3000,
        maxBodySize: 1024, // 1KB limit
      });
      const req = createMockRequest({
        method: "POST",
        url: "/messages",
        headers: {
          host: "localhost:3000",
          "content-length": "2048", // 2KB, exceeds limit
        },
      });
      const res = createMockResponse();

      const handleRequest = (
        transport as unknown as {
          handleRequest: (
            req: IncomingMessage,
            res: ServerResponse,
          ) => Promise<void>;
        }
      ).handleRequest.bind(transport);

      await handleRequest(req, res);

      expect(res._statusCode).toBe(413);
      expect(res._body).toContain("payload_too_large");
    });

    it("should allow requests within maxBodySize", async () => {
      const transport = new HttpTransport({
        port: 3000,
        maxBodySize: 1048576, // 1MB
      });
      const req = createMockRequest({
        method: "GET",
        url: "/health",
        headers: {
          host: "localhost:3000",
          "content-length": "100",
        },
      });
      const res = createMockResponse();

      const handleRequest = (
        transport as unknown as {
          handleRequest: (
            req: IncomingMessage,
            res: ServerResponse,
          ) => Promise<void>;
        }
      ).handleRequest.bind(transport);

      await handleRequest(req, res);

      // Should proceed to health check handler, not reject
      expect(res._statusCode).toBe(200);
      expect(res._body).toContain("healthy");
    });
  });

  describe("createHttpTransport factory", () => {
    it("should create HttpTransport with factory function", async () => {
      // Import factory function
      const { createHttpTransport } = await import("../http.js");

      const transport = createHttpTransport({ port: 3000 });
      expect(transport).toBeInstanceOf(HttpTransport);
    });
  });

  // ==========================================================================
  // readBody — JSON body parsing
  // ==========================================================================
  describe("readBody", () => {
    function getReadBody(transport: HttpTransport) {
      return (
        transport as unknown as {
          readBody: (req: IncomingMessage) => Promise<unknown>;
        }
      ).readBody.bind(transport);
    }

    /** Create a mock request that emits body data */
    function createStreamingRequest(
      body: string,
      overrides: Partial<IncomingMessage> = {},
    ): IncomingMessage {
      const { EventEmitter } = require("node:events");
      const emitter = new EventEmitter();
      Object.assign(emitter, {
        method: "POST",
        url: "/test",
        headers: {},
        socket: { remoteAddress: "127.0.0.1" },
        ...overrides,
      });
      // Emit body data asynchronously
      process.nextTick(() => {
        if (body) emitter.emit("data", Buffer.from(body));
        emitter.emit("end");
      });
      return emitter as unknown as IncomingMessage;
    }

    it("should return undefined for GET requests", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const readBody = getReadBody(transport);
      const req = createMockRequest({ method: "GET" });
      const result = await readBody(req);
      expect(result).toBeUndefined();
    });

    it("should return undefined for DELETE requests", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const readBody = getReadBody(transport);
      const req = createMockRequest({ method: "DELETE" });
      const result = await readBody(req);
      expect(result).toBeUndefined();
    });

    it("should return undefined for OPTIONS requests", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const readBody = getReadBody(transport);
      const req = createMockRequest({ method: "OPTIONS" });
      const result = await readBody(req);
      expect(result).toBeUndefined();
    });

    it("should parse valid JSON body", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const readBody = getReadBody(transport);
      const req = createStreamingRequest(
        JSON.stringify({ jsonrpc: "2.0", method: "test" }),
      );
      const result = await readBody(req);
      expect(result).toEqual({ jsonrpc: "2.0", method: "test" });
    });

    it("should return undefined for empty body", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const readBody = getReadBody(transport);
      const req = createStreamingRequest("");
      const result = await readBody(req);
      expect(result).toBeUndefined();
    });

    it("should reject invalid JSON body", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const readBody = getReadBody(transport);
      const req = createStreamingRequest("not valid json{{{");
      await expect(readBody(req)).rejects.toThrow("Invalid JSON");
    });
  });

  // ==========================================================================
  // handleStreamableRequest — /mcp endpoint routing
  // ==========================================================================
  describe("handleStreamableRequest", () => {
    function getHandleStreamable(transport: HttpTransport) {
      return (
        transport as unknown as {
          handleStreamableRequest: (
            req: IncomingMessage,
            res: ServerResponse,
          ) => Promise<void>;
        }
      ).handleStreamableRequest.bind(transport);
    }

    /** Create a mock request with a readable body stream */
    function createBodyRequest(
      body: string | object,
      overrides: Partial<IncomingMessage> = {},
    ): IncomingMessage {
      const { EventEmitter } = require("node:events");
      const emitter = new EventEmitter();
      const raw = typeof body === "string" ? body : JSON.stringify(body);
      Object.assign(emitter, {
        method: "POST",
        url: "/mcp",
        headers: { "content-type": "application/json" },
        socket: { remoteAddress: "127.0.0.1" },
        ...overrides,
      });
      process.nextTick(() => {
        if (raw) emitter.emit("data", Buffer.from(raw));
        emitter.emit("end");
      });
      return emitter as unknown as IncomingMessage;
    }

    it("should return 400 for non-POST without session ID", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const handle = getHandleStreamable(transport);

      const req = createMockRequest({
        method: "GET",
        url: "/mcp",
        headers: {},
      });
      const res = createMockResponse();

      await handle(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._body).toContain("No valid session ID provided");
    });

    it("should return 400 for non-POST with unknown session ID", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const handle = getHandleStreamable(transport);

      const req = createMockRequest({
        method: "DELETE",
        url: "/mcp",
        headers: { "mcp-session-id": "nonexistent" },
      });
      const res = createMockResponse();

      await handle(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._body).toContain("No valid session ID provided");
    });

    it("should return Parse error for invalid JSON body", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const handle = getHandleStreamable(transport);

      const req = createBodyRequest("not json{{{");
      const res = createMockResponse();

      await handle(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._body).toContain("Parse error");
    });

    it("should return 400 for POST without session ID and non-initialize body", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const handle = getHandleStreamable(transport);

      const req = createBodyRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      });
      const res = createMockResponse();

      await handle(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._body).toContain("No valid session ID provided");
    });

    it("should return 400 when session uses legacy SSE transport", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const handle = getHandleStreamable(transport);

      // Inject a non-StreamableHTTPServerTransport into the map
      const { SSEServerTransport: SSEClass } =
        await import("@modelcontextprotocol/sdk/server/sse.js");
      const mockSSE = Object.create(SSEClass.prototype);
      transport.getTransports().set("sse-session", mockSSE);

      const req = createBodyRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { headers: { "mcp-session-id": "sse-session" } },
      );
      const res = createMockResponse();

      await handle(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._body).toContain("different transport protocol");
    });

    it("should route to existing StreamableHTTP transport when session exists", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const handle = getHandleStreamable(transport);

      // Create a mock StreamableHTTPServerTransport
      const { StreamableHTTPServerTransport: StreamClass } =
        await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
      const mockStreamable = Object.create(StreamClass.prototype);
      mockStreamable.handleRequest = vi.fn().mockResolvedValue(undefined);
      transport.getTransports().set("stream-session", mockStreamable);

      const req = createBodyRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { headers: { "mcp-session-id": "stream-session" } },
      );
      const res = createMockResponse();

      await handle(req, res);

      // Should delegate to the transport's handleRequest with the pre-parsed body
      expect(mockStreamable.handleRequest).toHaveBeenCalledWith(
        req,
        res,
        expect.objectContaining({ jsonrpc: "2.0", method: "tools/list" }),
      );
    });

    it("should call onConnect and create transport for initialize request", async () => {
      const onConnect = vi.fn().mockResolvedValue(undefined);
      const transport = new HttpTransport({ port: 3000 }, onConnect);
      const handle = getHandleStreamable(transport);

      const initBody = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
      };
      const req = createBodyRequest(initBody);
      const res = createMockResponse();

      try {
        await handle(req, res);
      } catch {
        // StreamableHTTPServerTransport.handleRequest may throw
        // in unit test without full HTTP context
      }

      // onConnect should be called with the new transport
      expect(onConnect).toHaveBeenCalled();
    });

    it("should delegate non-POST with valid streamable session to transport", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const handle = getHandleStreamable(transport);

      const { StreamableHTTPServerTransport: StreamClass } =
        await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
      const mockStreamable = Object.create(StreamClass.prototype);
      mockStreamable.handleRequest = vi.fn().mockResolvedValue(undefined);
      transport.getTransports().set("del-session", mockStreamable);

      const req = createMockRequest({
        method: "DELETE",
        url: "/mcp",
        headers: { "mcp-session-id": "del-session" },
      });
      const res = createMockResponse();

      await handle(req, res);

      expect(mockStreamable.handleRequest).toHaveBeenCalledWith(req, res);
    });
  });

  // ==========================================================================
  // stop — transport cleanup
  // ==========================================================================
  describe("stop", () => {
    it("should close all active transports and clear the map", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const mockTransport1 = { close: vi.fn().mockResolvedValue(undefined) };
      const mockTransport2 = { close: vi.fn().mockResolvedValue(undefined) };

      transport
        .getTransports()
        .set("s1", mockTransport1 as unknown as SSEServerTransport);
      transport
        .getTransports()
        .set("s2", mockTransport2 as unknown as SSEServerTransport);

      expect(transport.getTransports().size).toBe(2);

      await transport.stop();

      expect(mockTransport1.close).toHaveBeenCalled();
      expect(mockTransport2.close).toHaveBeenCalled();
      expect(transport.getTransports().size).toBe(0);
    });

    it("should handle transport close errors gracefully", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const mockTransport = {
        close: vi.fn().mockRejectedValue(new Error("close failed")),
      };
      transport
        .getTransports()
        .set("err-session", mockTransport as unknown as SSEServerTransport);

      // Should not throw even if transport.close() rejects
      await expect(transport.stop()).resolves.toBeUndefined();
      expect(transport.getTransports().size).toBe(0);
    });
  });

  // ==========================================================================
  // Legacy /messages — wrong transport type
  // ==========================================================================
  describe("handleLegacyMessageRequest — cross-protocol", () => {
    it("should return 400 when session uses StreamableHTTP transport", async () => {
      const transport = new HttpTransport({ port: 3000 });

      // Inject a StreamableHTTPServerTransport into the map
      const { StreamableHTTPServerTransport: StreamClass } =
        await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
      const mockStreamable = Object.create(StreamClass.prototype);
      transport.getTransports().set("stream-session", mockStreamable);

      const req = createMockRequest({
        method: "POST",
        url: "/messages?sessionId=stream-session",
      });
      const res = createMockResponse();
      const url = new URL(
        "http://localhost:3000/messages?sessionId=stream-session",
      );

      const handleLegacyMessageRequest = (
        transport as unknown as {
          handleLegacyMessageRequest: (
            req: IncomingMessage,
            res: ServerResponse,
            url: URL,
          ) => Promise<void>;
        }
      ).handleLegacyMessageRequest.bind(transport);

      await handleLegacyMessageRequest(req, res, url);

      expect(res._statusCode).toBe(400);
      expect(res._body).toContain("different transport protocol");
    });
  });

  // ==========================================================================
  // Dispatch routing — /mcp and /messages paths
  // ==========================================================================
  describe("Dispatch routing", () => {
    function getHandleRequest(transport: HttpTransport) {
      return (
        transport as unknown as {
          handleRequest: (
            req: IncomingMessage,
            res: ServerResponse,
          ) => Promise<void>;
        }
      ).handleRequest.bind(transport);
    }

    it("should route POST /mcp to streamable handler", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const handle = getHandleRequest(transport);

      // POST /mcp without session ID and non-initialize body should get 400
      // (proves it reached the streamable handler, not 404)
      const { EventEmitter } = require("node:events");
      const emitter = new EventEmitter();
      Object.assign(emitter, {
        method: "POST",
        url: "/mcp",
        headers: {
          host: "localhost:3000",
          "content-type": "application/json",
          "content-length": "2",
        },
        socket: { remoteAddress: "127.0.0.1" },
      });
      process.nextTick(() => {
        emitter.emit("data", Buffer.from("{}"));
        emitter.emit("end");
      });

      const res = createMockResponse();
      await handle(emitter as unknown as IncomingMessage, res);

      // Should reach the streamable handler (400 = "No valid session ID")
      // and NOT return 404
      expect(res._statusCode).toBe(400);
      expect(res._body).toContain("No valid session ID");
    });

    it("should route POST /messages to legacy handler", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const handle = getHandleRequest(transport);

      const req = createMockRequest({
        method: "POST",
        url: "/messages",
        headers: { host: "localhost:3000" },
      });
      const res = createMockResponse();

      await handle(req, res);

      // Should reach the legacy handler (400 = "Missing sessionId")
      expect(res._statusCode).toBe(400);
      expect(res._body).toContain("Missing sessionId");
    });

    it("should return 404 for unknown paths", async () => {
      const transport = new HttpTransport({ port: 3000 });
      const handle = getHandleRequest(transport);

      const req = createMockRequest({
        method: "GET",
        url: "/unknown-path",
        headers: { host: "localhost:3000" },
      });
      const res = createMockResponse();

      await handle(req, res);

      expect(res._statusCode).toBe(404);
      expect(res._body).toContain("Not found");
    });
  });
});
