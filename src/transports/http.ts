/**
 * postgres-mcp - HTTP Transport
 *
 * Dual-protocol HTTP transport with backward compatibility:
 * - `/mcp` — Streamable HTTP transport (MCP protocol 2025-11-25)
 * - `/sse` + `/messages` — Legacy SSE transport (MCP protocol 2024-11-05)
 *
 * Includes OAuth 2.0 support, rate limiting, CORS, and security headers.
 */

import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { OAuthResourceServer } from "../auth/OAuthResourceServer.js";
import type { TokenValidator } from "../auth/TokenValidator.js";
import {
  validateAuth,
  formatOAuthError,
  type AuthenticatedContext,
} from "../auth/middleware.js";
import { runWithAuthContext } from "../auth/auth-context.js";
import { logger } from "../utils/logger.js";

/**
 * HTTP transport configuration
 */
export interface HttpTransportConfig {
  /** Port to listen on */
  port: number;

  /** Host to bind to (default: localhost) */
  host?: string;

  /** OAuth resource server (optional) */
  resourceServer?: OAuthResourceServer;

  /** Token validator (optional, required if resourceServer is provided) */
  tokenValidator?: TokenValidator;

  /** CORS allowed origins (default: none) */
  corsOrigins?: string[];

  /** Allow credentials in CORS requests (default: false) */
  corsAllowCredentials?: boolean;

  /** Paths that bypass authentication */
  publicPaths?: string[];

  // =========================================================================
  // Security Options
  // =========================================================================

  /**
   * Enable rate limiting (default: true)
   * Helps prevent DoS attacks and brute-force attempts
   */
  enableRateLimit?: boolean;

  /**
   * Rate limit window in milliseconds (default: 60000 = 1 minute)
   */
  rateLimitWindowMs?: number;

  /**
   * Maximum requests per window per IP (default: 100)
   */
  rateLimitMaxRequests?: number;

  /**
   * Maximum request body size in bytes (default: 1MB = 1048576)
   * Prevents memory exhaustion from large payloads
   */
  maxBodySize?: number;

  /**
   * Enable HTTP Strict Transport Security header (default: false)
   * Should only be enabled when running behind HTTPS
   */
  enableHSTS?: boolean;

  /**
   * HSTS max-age in seconds (default: 31536000 = 1 year)
   */
  hstsMaxAge?: number;
}

/**
 * Rate limit entry for tracking request counts per IP
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * HTTP Transport for MCP
 *
 * Supports two transport protocols simultaneously:
 * 1. Streamable HTTP (2025-11-25) via `/mcp` — preferred for modern clients
 * 2. Legacy SSE (2024-11-05) via `/sse` + `/messages` — backward compatibility
 */
export class HttpTransport {
  private server: ReturnType<typeof createServer> | null = null;
  private readonly config: HttpTransportConfig;
  private readonly onConnect?: (transport: Transport) => void;

  /** Active transports by session ID (supports both transport types) */
  private readonly transports = new Map<
    string,
    StreamableHTTPServerTransport | SSEServerTransport
  >();

  // Rate limiting state
  private readonly rateLimitMap = new Map<string, RateLimitEntry>();
  private rateLimitCleanupInterval: NodeJS.Timeout | null = null;

  // Default configuration values
  private static readonly DEFAULT_RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
  private static readonly DEFAULT_RATE_LIMIT_MAX_REQUESTS = 100;
  private static readonly DEFAULT_MAX_BODY_SIZE = 1048576; // 1MB
  private static readonly DEFAULT_HSTS_MAX_AGE = 31536000; // 1 year

  constructor(
    config: HttpTransportConfig,
    onConnect?: (transport: Transport) => void,
  ) {
    this.config = {
      ...config,
      host: config.host ?? "localhost",
      publicPaths: config.publicPaths ?? ["/health", "/.well-known/*"],
      enableRateLimit: config.enableRateLimit ?? true,
      rateLimitWindowMs:
        config.rateLimitWindowMs ?? HttpTransport.DEFAULT_RATE_LIMIT_WINDOW_MS,
      rateLimitMaxRequests:
        config.rateLimitMaxRequests ??
        HttpTransport.DEFAULT_RATE_LIMIT_MAX_REQUESTS,
      maxBodySize: config.maxBodySize ?? HttpTransport.DEFAULT_MAX_BODY_SIZE,
      enableHSTS: config.enableHSTS ?? false,
      hstsMaxAge: config.hstsMaxAge ?? HttpTransport.DEFAULT_HSTS_MAX_AGE,
    };
    if (onConnect) {
      this.onConnect = onConnect;
    }
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res).catch((error: unknown) => {
          logger.error("HTTP request handler error", { error: String(error) });
          if (!res.headersSent) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: "Internal server error" }));
          }
        });
      });

      // Start deterministic rate limit cleanup (every 60s)
      if (this.config.enableRateLimit) {
        this.rateLimitCleanupInterval = setInterval(() => {
          const now = Date.now();
          for (const [ip, entry] of this.rateLimitMap) {
            if (now > entry.resetTime) {
              this.rateLimitMap.delete(ip);
            }
          }
        }, 60_000);
      }

      this.server.on("error", reject);

      this.server.listen(this.config.port, this.config.host, () => {
        logger.info(
          `HTTP transport listening on ${this.config.host ?? "localhost"}:${String(this.config.port)}`,
        );
        resolve();
      });
    });
  }

  /**
   * Stop the HTTP server
   */
  async stop(): Promise<void> {
    if (this.rateLimitCleanupInterval) {
      clearInterval(this.rateLimitCleanupInterval);
      this.rateLimitCleanupInterval = null;
    }

    // Close all active transports
    for (const [sessionId, transport] of this.transports) {
      try {
        await transport.close();
      } catch {
        logger.warn("Error closing transport during shutdown", { sessionId });
      }
    }
    this.transports.clear();

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info("HTTP transport stopped");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Check if a path is public (bypasses authentication)
   */
  private isPublicPath(pathname: string): boolean {
    const publicPaths = this.config.publicPaths ?? [];
    for (const pattern of publicPaths) {
      if (pattern.endsWith("/*")) {
        // Wildcard pattern
        const prefix = pattern.slice(0, -2);
        if (pathname.startsWith(prefix)) {
          return true;
        }
      } else if (pattern === pathname) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check rate limit for a request
   * @returns true if request should be allowed, false if rate limited
   */
  private checkRateLimit(req: IncomingMessage): boolean {
    if (!this.config.enableRateLimit) {
      return true;
    }

    const clientIp = req.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    const windowMs =
      this.config.rateLimitWindowMs ??
      HttpTransport.DEFAULT_RATE_LIMIT_WINDOW_MS;
    const maxRequests =
      this.config.rateLimitMaxRequests ??
      HttpTransport.DEFAULT_RATE_LIMIT_MAX_REQUESTS;

    const entry = this.rateLimitMap.get(clientIp);

    // Expired entries are cleaned up by a deterministic interval (see start())

    if (!entry || now > entry.resetTime) {
      // Start new window
      this.rateLimitMap.set(clientIp, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (entry.count >= maxRequests) {
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Read and parse JSON body from an incoming request.
   * Returns undefined for GET/DELETE/OPTIONS (no body expected).
   */
  private async readBody(req: IncomingMessage): Promise<unknown> {
    if (
      req.method === "GET" ||
      req.method === "DELETE" ||
      req.method === "OPTIONS"
    ) {
      return undefined;
    }

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf-8");
        if (!raw) {
          resolve(undefined);
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error("Invalid JSON in request body"));
        }
      });
      req.on("error", reject);
    });
  }

  /**
   * Handle incoming HTTP request
   */
  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    // Set security headers for all responses
    this.setSecurityHeaders(res);

    // Set CORS headers
    this.setCorsHeaders(req, res);

    // Handle preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Check rate limit
    if (!this.checkRateLimit(req)) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "rate_limit_exceeded",
          error_description: "Too many requests. Please try again later.",
        }),
      );
      return;
    }

    // Check body size — two-layer enforcement:
    // 1. Content-Length header for fast rejection of well-behaved clients
    // 2. Streaming byte tracking for missing/spoofed headers and chunked encoding
    const maxBodySize = this.config.maxBodySize ?? 1048576;
    const contentLength = parseInt(req.headers["content-length"] ?? "0", 10);
    if (contentLength > maxBodySize) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "payload_too_large",
          error_description: `Request body exceeds maximum size of ${String(maxBodySize)} bytes.`,
        }),
      );
      return;
    }

    // Streaming body size enforcement — track actual received bytes
    // Guard: only attach if req supports event listeners (real IncomingMessage)
    let receivedBytes = 0;
    let bodyLimitExceeded = false;
    if (typeof req.on === "function") {
      req.on("data", (chunk: Buffer) => {
        receivedBytes += chunk.length;
        if (receivedBytes > maxBodySize && !bodyLimitExceeded) {
          bodyLimitExceeded = true;
          req.destroy();
          if (!res.headersSent) {
            res.writeHead(413, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: "payload_too_large",
                error_description: `Request body exceeds maximum size of ${String(maxBodySize)} bytes.`,
              }),
            );
          }
        }
      });
    }

    if (bodyLimitExceeded) return;

    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );

    // Handle well-known endpoints
    if (url.pathname === "/.well-known/oauth-protected-resource") {
      this.handleProtectedResourceMetadata(res);
      return;
    }

    // Health check
    if (url.pathname === "/health") {
      this.handleHealthCheck(res);
      return;
    }

    // Authenticate if OAuth is configured and path is not public
    let authCtx: AuthenticatedContext | undefined;
    if (this.config.resourceServer && this.config.tokenValidator) {
      if (!this.isPublicPath(url.pathname)) {
        try {
          authCtx = await validateAuth(req.headers.authorization, {
            tokenValidator: this.config.tokenValidator,
            required: true,
          });
        } catch (error) {
          const { status, body } = formatOAuthError(error);
          res.writeHead(status, {
            "Content-Type": "application/json",
            "WWW-Authenticate": "Bearer",
          });
          res.end(JSON.stringify(body));
          return;
        }
      }
    }

    // Dispatch MCP requests — wrap in auth context if OAuth is active
    const dispatch = async (): Promise<void> => {
      // =====================================================================
      // Streamable HTTP Transport (Protocol 2025-11-25) — canonical endpoint
      // =====================================================================
      if (url.pathname === "/mcp") {
        await this.handleStreamableRequest(req, res);
        return;
      }

      // =====================================================================
      // Legacy SSE Transport (Protocol 2024-11-05) — backward compatibility
      // =====================================================================
      if (url.pathname === "/sse") {
        this.handleLegacySSERequest(req, res);
        return;
      }

      if (url.pathname === "/messages") {
        await this.handleLegacyMessageRequest(req, res, url);
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: "Not found" }));
    };

    if (authCtx) {
      await runWithAuthContext(authCtx, dispatch);
    } else {
      await dispatch();
    }
  }

  // ===========================================================================
  // Streamable HTTP Transport (Protocol 2025-11-25)
  // ===========================================================================

  /**
   * Handle Streamable HTTP requests on `/mcp`.
   *
   * Supports GET (SSE stream), POST (initialize + messages), DELETE (terminate).
   * Session management is handled via the `Mcp-Session-Id` header.
   */
  private async handleStreamableRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport | undefined;

    if (sessionId && this.transports.has(sessionId)) {
      const existing = this.transports.get(sessionId);
      if (existing instanceof StreamableHTTPServerTransport) {
        transport = existing;
      } else {
        // Session exists but uses legacy SSE transport
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message:
                "Bad Request: Session exists but uses a different transport protocol",
            },
            id: null,
          }),
        );
        return;
      }
    } else if (!sessionId && req.method === "POST") {
      // Parse body to check if this is an initialization request
      let body: unknown;
      try {
        body = await this.readBody(req);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32700, message: "Parse error" },
            id: null,
          }),
        );
        return;
      }

      if (isInitializeRequest(body)) {
        const newTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId: string) => {
            logger.debug("Streamable HTTP session initialized", {
              sessionId: newSessionId,
            });
            this.transports.set(newSessionId, newTransport);
          },
        });

        // Clean up on close
        newTransport.onclose = () => {
          const sid = newTransport.sessionId;
          if (sid && this.transports.has(sid)) {
            logger.debug("Streamable HTTP transport closed", {
              sessionId: sid,
            });
            this.transports.delete(sid);
          }
        };

        // Connect MCP server to this transport
        if (this.onConnect) {
          this.onConnect(newTransport as unknown as Transport);
        }

        // Handle request with pre-parsed body
        await newTransport.handleRequest(req, res, body);
        return;
      } else {
        // POST without session ID and not an initialization request
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Bad Request: No valid session ID provided",
            },
            id: null,
          }),
        );
        return;
      }
    } else {
      // No session ID and not a POST, or invalid session
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: null,
        }),
      );
      return;
    }

    // Existing session — handle the request directly
    await transport.handleRequest(req, res);
  }

  // ===========================================================================
  // Legacy SSE Transport (Protocol 2024-11-05)
  // ===========================================================================

  /**
   * Handle legacy SSE connection request (GET /sse).
   *
   * Creates an SSEServerTransport that establishes an event stream and
   * directs the client to POST messages to `/messages?sessionId=<id>`.
   */
  private handleLegacySSERequest(
    _req: IncomingMessage,
    res: ServerResponse,
  ): void {
    logger.debug("Legacy SSE connection established");

    const transport = new SSEServerTransport("/messages", res);
    this.transports.set(transport.sessionId, transport);

    // Clean up on disconnect
    res.on("close", () => {
      logger.debug("Legacy SSE transport closed", {
        sessionId: transport.sessionId,
      });
      this.transports.delete(transport.sessionId);
    });

    // Connect MCP server to this transport
    if (this.onConnect) {
      this.onConnect(transport as unknown as Transport);
    }
  }

  /**
   * Handle legacy message request (POST /messages?sessionId=<id>).
   *
   * Routes the message to the correct SSEServerTransport instance.
   */
  private async handleLegacyMessageRequest(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    const sessionId = url.searchParams.get("sessionId");

    if (!sessionId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing sessionId parameter" }));
      return;
    }

    const transport = this.transports.get(sessionId);

    if (!transport) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No transport found for sessionId" }));
      return;
    }

    if (!(transport instanceof SSEServerTransport)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error:
            "Session exists but uses a different transport protocol. Use /mcp instead.",
        }),
      );
      return;
    }

    await transport.handlePostMessage(req, res);
  }

  // ===========================================================================
  // Utility Endpoints
  // ===========================================================================

  /**
   * Handle protected resource metadata endpoint
   */
  private handleProtectedResourceMetadata(res: ServerResponse): void {
    if (!this.config.resourceServer) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "OAuth not configured" }));
      return;
    }

    const metadata = this.config.resourceServer.getMetadata();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(metadata));
  }

  /**
   * Handle health check endpoint
   */
  private handleHealthCheck(res: ServerResponse): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy",
        timestamp: new Date().toISOString(),
      }),
    );
  }

  // ===========================================================================
  // Security Headers
  // ===========================================================================

  /**
   * Set security headers for all responses
   */
  private setSecurityHeaders(res: ServerResponse): void {
    // Prevent MIME type sniffing
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Prevent clickjacking
    res.setHeader("X-Frame-Options", "DENY");
    // Prevent caching of API responses
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    // Content Security Policy - API server has no content to load
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'",
    );
    // Restrict browser features not needed by an API server
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );

    // HTTP Strict Transport Security (for HTTPS deployments)
    if (this.config.enableHSTS) {
      const maxAge =
        this.config.hstsMaxAge ?? HttpTransport.DEFAULT_HSTS_MAX_AGE;
      res.setHeader(
        "Strict-Transport-Security",
        `max-age=${String(maxAge)}; includeSubDomains`,
      );
    }
  }

  /**
   * Set CORS headers for browser-based MCP client support
   *
   * This implements the MCP SDK 1.25.1 recommendation of using external middleware
   * for origin validation rather than the deprecated built-in options.
   */
  private setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
    const origin = req.headers.origin;

    // Only allow configured origins
    if (origin && this.config.corsOrigins?.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, DELETE, OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
      );
      res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
      res.setHeader("Access-Control-Max-Age", "86400");

      // Vary header is important for correct caching behavior
      res.setHeader("Vary", "Origin");

      // Allow credentials if explicitly configured (needed for browser cookies/auth)
      if (this.config.corsAllowCredentials) {
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }
    }
  }

  // ===========================================================================
  // Accessors
  // ===========================================================================

  /**
   * Get all active transports (for testing/introspection)
   */
  getTransports(): Map<
    string,
    StreamableHTTPServerTransport | SSEServerTransport
  > {
    return this.transports;
  }
}

/**
 * Create an HTTP transport instance
 */
export function createHttpTransport(
  config: HttpTransportConfig,
  onConnect?: (transport: Transport) => void,
): HttpTransport {
  return new HttpTransport(config, onConnect);
}
