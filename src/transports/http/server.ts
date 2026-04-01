/**
 * postgres-mcp - HTTP Transport Server
 *
 * Dual-protocol HTTP transport with backward compatibility:
 * - `/mcp` — Streamable HTTP transport (MCP protocol 2025-11-25)
 * - `/sse` + `/messages` — Legacy SSE transport (MCP protocol 2024-11-05)
 *
 * Transport-specific handlers are in ./streamable.ts, ./stateless.ts, and ./legacy-sse.ts.
 * Security utilities and endpoint handlers are in ./security.ts and ./handlers.ts.
 * Config types and constants are in ./types.ts.
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
// Legacy SSE transport — intentionally used for MCP 2024-11-05 backward compatibility
import type { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
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
  validateHostHeader,
} from "./security.js";
import {
  handleProtectedResourceMetadata,
  handleHealthCheck,
  handleRootInfo,
} from "./handlers.js";
import { handleStreamableRequest } from "./streamable.js";
import { handleStatelessRequest } from "./stateless.js";
import {
  handleLegacySSERequest,
  handleLegacyMessageRequest,
} from "./legacy-sse.js";

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
      host: config.host ?? "127.0.0.1",
      publicPaths: config.publicPaths ?? ["/health", "/.well-known/*"],
      enableRateLimit: config.enableRateLimit ?? true,
      rateLimitWindowMs:
        config.rateLimitWindowMs ?? DEFAULTS.RATE_LIMIT_WINDOW_MS,
      rateLimitMaxRequests:
        config.rateLimitMaxRequests ??
        (process.env["MCP_RATE_LIMIT_MAX"]
          ? parseInt(process.env["MCP_RATE_LIMIT_MAX"], 10)
          : DEFAULTS.RATE_LIMIT_MAX_REQUESTS),
      maxBodySize: config.maxBodySize ?? DEFAULTS.MAX_BODY_SIZE,
      enableHSTS:
        config.enableHSTS ?? process.env["MCP_ENABLE_HSTS"] === "true",
      hstsMaxAge: config.hstsMaxAge ?? DEFAULTS.HSTS_MAX_AGE,
      trustProxy: config.trustProxy ?? false,
      stateless: config.stateless ?? false,
      headersTimeoutMs: config.headersTimeoutMs ??
        (process.env["MCP_HEADERS_TIMEOUT"]
          ? parseInt(process.env["MCP_HEADERS_TIMEOUT"], 10)
          : undefined),
      requestTimeoutMs: config.requestTimeoutMs ??
        (process.env["MCP_REQUEST_TIMEOUT"]
          ? parseInt(process.env["MCP_REQUEST_TIMEOUT"], 10)
          : undefined),
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
      this.server.setTimeout(this.config.requestTimeoutMs ?? HTTP_REQUEST_TIMEOUT_MS);
      this.server.keepAliveTimeout = HTTP_KEEP_ALIVE_TIMEOUT_MS;
      this.server.headersTimeout = this.config.headersTimeoutMs ?? HTTP_HEADERS_TIMEOUT_MS;

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
        // Don't block process exit
        this.rateLimitCleanupInterval.unref();
      }

      this.server.on("error", reject);

      this.server.listen(this.config.port, this.config.host, () => {
        logger.info(
          `HTTP transport listening on ${this.config.host ?? "127.0.0.1"}:${String(this.config.port)}`,
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

    // DNS rebinding protection — only for localhost-bound servers
    const host = this.config.host ?? "127.0.0.1";
    if (
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "localhost"
    ) {
      if (!validateHostHeader(req, res)) {
        return;
      }
    }

    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "127.0.0.1"}`,
    );

    // Health check — bypass rate limiting (always available for monitoring)
    if (url.pathname === "/health") {
      handleHealthCheck(res, !!this.config.resourceServer);
      return;
    }

    // Check rate limit (after health check bypass)
    const rateLimitResult = checkRateLimit(req, this.config, this.rateLimitMap);
    if (!rateLimitResult.allowed) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (rateLimitResult.retryAfterSeconds !== undefined) {
        headers["Retry-After"] = String(rateLimitResult.retryAfterSeconds);
      }
      res.writeHead(429, headers);
      res.end(
        JSON.stringify({
          error: "rate_limit_exceeded",
          error_description: "Too many requests. Please try again later.",
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

    // =========================================================================
    // Authentication: Simple Bearer Token (lighter-weight alternative to OAuth)
    // =========================================================================
    if (this.config.authToken && !this.config.resourceServer) {
      if (!this.isPublicPath(url.pathname)) {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
          res.writeHead(401, {
            "Content-Type": "application/json",
            "WWW-Authenticate": 'Bearer realm="postgres-mcp"',
          });
          res.end(
            JSON.stringify({
              error: "unauthorized",
              error_description: "Bearer token required",
            }),
          );
          return;
        }
        const token = authHeader.slice(7);
        if (token !== this.config.authToken) {
          res.writeHead(401, {
            "Content-Type": "application/json",
            "WWW-Authenticate":
              'Bearer realm="postgres-mcp", error="invalid_token"',
          });
          res.end(
            JSON.stringify({
              error: "unauthorized",
              error_description: "Invalid bearer token",
            }),
          );
          return;
        }
      }
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
        } catch (error: unknown) {
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
        if (this.config.stateless) {
          await handleStatelessRequest(req, res, this.config, this.onConnect);
        } else {
          await handleStreamableRequest(
            req,
            res,
            this.config,
            this.transports,
            this.onConnect,
          );
        }
        return;
      }

      // =====================================================================
      // Legacy SSE Transport (Protocol 2024-11-05) — backward compatibility
      // =====================================================================
      if (url.pathname === "/sse") {
        if (this.config.stateless) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Not found" }));
          return;
        }
        await handleLegacySSERequest(
          req,
          res,
          this.transports,
          this.onConnect,
        );
        return;
      }

      if (url.pathname === "/messages") {
        if (this.config.stateless) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Not found" }));
          return;
        }
        await handleLegacyMessageRequest(req, res, url, this.transports);
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
