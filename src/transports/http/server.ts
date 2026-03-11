/**
 * postgres-mcp - HTTP Transport Server
 *
 * Dual-protocol HTTP transport with backward compatibility:
 * - `/mcp` — Streamable HTTP transport (MCP protocol 2025-11-25)
 * - `/sse` + `/messages` — Legacy SSE transport (MCP protocol 2024-11-05)
 *
 * Security utilities and endpoint handlers are in ./security.ts and ./handlers.ts.
 * Config types and constants are in ./types.ts.
 */

import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
// Legacy SSE transport — intentionally used for MCP 2024-11-05 backward compatibility
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  validateAuth,
  formatOAuthError,
  type AuthenticatedContext,
} from "../../auth/middleware.js";
import { runWithAuthContext } from "../../auth/auth-context.js";
import { logger } from "../../utils/logger.js";
import type { HttpTransportConfig } from "./types.js";
import {
  HTTP_REQUEST_TIMEOUT_MS,
  HTTP_KEEP_ALIVE_TIMEOUT_MS,
  HTTP_HEADERS_TIMEOUT_MS,
} from "./types.js";
import {
  type RateLimitEntry,
  DEFAULTS,
  checkRateLimit,
  setSecurityHeaders,
  setCorsHeaders,
  readBody,
} from "./security.js";
import {
  handleProtectedResourceMetadata,
  handleHealthCheck,
  handleRootInfo,
} from "./handlers.js";

// Re-export for consumers and tests
export type { HttpTransportConfig } from "./types.js";

/**
 * HTTP Transport for MCP
 *
 * Supports two transport protocols simultaneously:
 * 1. Streamable HTTP (2025-11-25) via `/mcp` — preferred for modern clients
 * 2. Legacy SSE (2024-11-05) via `/sse` + `/messages` — backward compatibility
 */
export class HttpTransport {
  private server: ReturnType<typeof createServer> | null = null;
  readonly config: HttpTransportConfig;
  private readonly onConnect?: (transport: Transport) => void | Promise<void>;

  /** Active transports by session ID (supports both transport types) */
  private readonly transports = new Map<
    string,
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    StreamableHTTPServerTransport | SSEServerTransport
  >();

  // Rate limiting state
  private readonly rateLimitMap = new Map<string, RateLimitEntry>();
  private rateLimitCleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    config: HttpTransportConfig,
    onConnect?: (transport: Transport) => void | Promise<void>,
  ) {
    this.config = {
      ...config,
      host: config.host ?? "localhost",
      publicPaths: config.publicPaths ?? ["/health", "/.well-known/*"],
      enableRateLimit: config.enableRateLimit ?? true,
      rateLimitWindowMs:
        config.rateLimitWindowMs ?? DEFAULTS.RATE_LIMIT_WINDOW_MS,
      rateLimitMaxRequests:
        config.rateLimitMaxRequests ?? DEFAULTS.RATE_LIMIT_MAX_REQUESTS,
      maxBodySize: config.maxBodySize ?? DEFAULTS.MAX_BODY_SIZE,
      enableHSTS: config.enableHSTS ?? false,
      hstsMaxAge: config.hstsMaxAge ?? DEFAULTS.HSTS_MAX_AGE,
      trustProxy: config.trustProxy ?? false,
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

      // Server timeouts — prevent slowloris-style DoS attacks
      this.server.setTimeout(HTTP_REQUEST_TIMEOUT_MS);
      this.server.keepAliveTimeout = HTTP_KEEP_ALIVE_TIMEOUT_MS;
      this.server.headersTimeout = HTTP_HEADERS_TIMEOUT_MS;

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
   * Handle incoming HTTP request
   */
  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    // Set security headers for all responses
    setSecurityHeaders(res, this.config);

    // Set CORS headers
    setCorsHeaders(req, res, this.config);

    // Handle preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );

    // Health check — bypass rate limiting (always available for monitoring)
    if (url.pathname === "/health") {
      handleHealthCheck(res, !!this.config.resourceServer);
      return;
    }

    // Check rate limit (after health check bypass)
    if (!checkRateLimit(req, this.config, this.rateLimitMap)) {
      const entry = this.rateLimitMap.get(
        req.socket.remoteAddress ?? "unknown",
      );
      const retryAfter = entry
        ? Math.ceil((entry.resetTime - Date.now()) / 1000)
        : 60;
      res.writeHead(429, {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      });
      res.end(
        JSON.stringify({
          error: "rate_limit_exceeded",
          error_description: "Too many requests. Please try again later.",
          retryAfter,
        }),
      );
      return;
    }

    // Check body size — fast rejection via Content-Length header.
    // Streaming byte tracking for spoofed/missing headers is handled inside readBody().
    const maxBodySize = this.config.maxBodySize ?? DEFAULTS.MAX_BODY_SIZE;
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

    // Handle well-known endpoints
    if (url.pathname === "/.well-known/oauth-protected-resource") {
      handleProtectedResourceMetadata(res, this.config.resourceServer);
      return;
    }

    // Root info endpoint
    if (url.pathname === "/" && req.method === "GET") {
      handleRootInfo(res);
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

    // For non-POST requests (GET for SSE stream, DELETE for session termination),
    // delegate directly to the transport if we have a valid session
    if (req.method !== "POST") {
      if (sessionId && this.transports.has(sessionId)) {
        const existing = this.transports.get(sessionId);
        if (existing instanceof StreamableHTTPServerTransport) {
          await existing.handleRequest(req, res);
          return;
        }
      }
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

    // POST requests — pre-parse the body so the SDK receives parsed JSON
    const maxBodySize = this.config.maxBodySize ?? DEFAULTS.MAX_BODY_SIZE;
    let body: unknown;
    try {
      body = await readBody(req, res, maxBodySize);
    } catch (readError) {
      // readBody rejects with "Payload too large" after sending 413 to client
      if (
        readError instanceof Error &&
        readError.message === "Payload too large"
      ) {
        return;
      }
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32700, message: "Parse error: Invalid JSON" },
          id: null,
        }),
      );
      return;
    }

    // Existing session — route to the correct transport
    if (sessionId && this.transports.has(sessionId)) {
      const existing = this.transports.get(sessionId);
      if (existing instanceof StreamableHTTPServerTransport) {
        await existing.handleRequest(req, res, body);
        return;
      }
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

    // No session ID — must be an initialization request
    if (!sessionId && isInitializeRequest(body)) {
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

      // Connect MCP server to this transport (must complete before handling request)
      if (this.onConnect) {
        await this.onConnect(newTransport as unknown as Transport);
      }

      // Handle request with pre-parsed body
      await newTransport.handleRequest(req, res, body);
      return;
    }

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

    // eslint-disable-next-line @typescript-eslint/no-deprecated
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
      void this.onConnect(transport as unknown as Transport);
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

    // eslint-disable-next-line @typescript-eslint/no-deprecated
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
  // Accessors
  // ===========================================================================

  /**
   * Get all active transports (for testing/introspection)
   */
  getTransports(): Map<
    string,
    // eslint-disable-next-line @typescript-eslint/no-deprecated
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
