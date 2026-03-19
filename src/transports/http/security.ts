/**
 * postgres-mcp - HTTP Transport Security Utilities
 *
 * Standalone security functions extracted from the HttpTransport class.
 * These handle security headers, CORS headers, rate limiting, DNS rebinding
 * protection, and body parsing.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { HttpTransportConfig } from "./types.js";

// =============================================================================
// DNS Rebinding Protection
// =============================================================================

/**
 * Default allowed hostnames for DNS rebinding protection.
 * Matches the MCP SDK's `localhostHostValidation()` — allows only localhost
 * addresses to prevent DNS rebinding attacks on local servers.
 */
const ALLOWED_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Validate the Host header to prevent DNS rebinding attacks.
 *
 * DNS rebinding attacks bypass same-origin policy by manipulating DNS to
 * point attacker-controlled domains to localhost, allowing malicious
 * websites to access local MCP servers.
 *
 * Equivalent to the MCP SDK's `localhostHostValidation()` middleware,
 * adapted for raw Node.js HTTP (non-Express).
 *
 * @returns true if the request should proceed, false if it was rejected
 */
export function validateHostHeader(
  req: IncomingMessage,
  res: ServerResponse,
): boolean {
  const hostHeader = req.headers.host;
  if (!hostHeader) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Missing Host header" },
        id: null,
      }),
    );
    return false;
  }

  let hostname: string;
  try {
    hostname = new URL(`http://${hostHeader}`).hostname;
  } catch {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: `Invalid Host header: ${hostHeader}` },
        id: null,
      }),
    );
    return false;
  }

  if (!ALLOWED_HOSTNAMES.has(hostname)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: `Invalid Host: ${hostname}` },
        id: null,
      }),
    );
    return false;
  }

  return true;
}

/**
 * Rate limit entry for tracking request counts per IP
 */
export interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/** Default configuration values */
export const DEFAULTS = {
  RATE_LIMIT_WINDOW_MS: 60000, // 1 minute
  RATE_LIMIT_MAX_REQUESTS: 100,
  MAX_BODY_SIZE: 1048576, // 1MB
  HSTS_MAX_AGE: 31536000, // 1 year
} as const;

/**
 * Extract the client IP address from the request.
 * When trustProxy is enabled, uses the leftmost IP from X-Forwarded-For.
 * Falls back to req.socket.remoteAddress.
 */
export function getClientIp(
  req: IncomingMessage,
  trustProxy: boolean,
): string {
  if (trustProxy) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
      const firstIp = forwarded.split(",")[0]?.trim();
      if (firstIp) return firstIp;
    }
  }
  return req.socket.remoteAddress ?? "unknown";
}

/**
 * Check rate limit for a request.
 * @returns Object with `allowed` flag and optional `retryAfterSeconds`.
 */
export function checkRateLimit(
  req: IncomingMessage,
  config: HttpTransportConfig,
  rateLimitMap: Map<string, RateLimitEntry>,
): { allowed: boolean; retryAfterSeconds?: number } {
  if (!config.enableRateLimit) {
    return { allowed: true };
  }

  const clientIp = getClientIp(req, config.trustProxy ?? false);
  const now = Date.now();
  const windowMs = config.rateLimitWindowMs ?? DEFAULTS.RATE_LIMIT_WINDOW_MS;
  const maxRequests =
    config.rateLimitMaxRequests ??
    (process.env["MCP_RATE_LIMIT_MAX"]
      ? parseInt(process.env["MCP_RATE_LIMIT_MAX"], 10)
      : DEFAULTS.RATE_LIMIT_MAX_REQUESTS);

  const entry = rateLimitMap.get(clientIp);

  if (!entry || now > entry.resetTime) {
    // Start new window
    rateLimitMap.set(clientIp, { count: 1, resetTime: now + windowMs });
    return { allowed: true };
  }

  if (entry.count >= maxRequests) {
    const retryAfterSeconds = Math.ceil((entry.resetTime - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  entry.count++;
  return { allowed: true };
}

// =============================================================================
// Security Headers
// =============================================================================

/**
 * Set security headers for all responses
 */
export function setSecurityHeaders(
  res: ServerResponse,
  config: HttpTransportConfig,
): void {
  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");
  // Prevent caching
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate",
  );
  // Referrer policy
  res.setHeader("Referrer-Policy", "no-referrer");
  // Permissions policy (restrict browser features)
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  // Content Security Policy (restrict origins)
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'",
  );

  // HSTS header — only set if explicitly enabled (requires HTTPS)
  if (config.enableHSTS) {
    const maxAge = config.hstsMaxAge ?? DEFAULTS.HSTS_MAX_AGE;
    res.setHeader(
      "Strict-Transport-Security",
      `max-age=${String(maxAge)}; includeSubDomains`,
    );
  }
}

/**
 * Set CORS headers based on configuration
 */
export function setCorsHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  config: HttpTransportConfig,
): void {
  const origins = config.corsOrigins;
  if (!origins || origins.length === 0) return;

  const origin = req.headers.origin;
  if (!origin) return;

  // Check if origin is allowed
  const isAllowed =
    origins.includes("*") ||
    origins.some((allowed) => {
      if (allowed === "*") return true;
      if (allowed.startsWith("*.")) {
        // Wildcard subdomain matching: "*.example.com" → ".example.com"
        const domain = allowed.slice(1);
        return origin.endsWith(domain) && origin.length > domain.length;
      }
      return origin === allowed;
    });

  if (isAllowed) {
    // Use specific origin instead of * for proper CORS handling
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
    if (config.corsAllowCredentials) {
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
  }
}

// =============================================================================
// Body Parsing
// =============================================================================

/**
 * Read and parse JSON body from an incoming request.
 * Returns undefined for GET/DELETE/OPTIONS (no body expected).
 * Enforces maxBodySize limit while streaming to prevent memory exhaustion.
 */
export async function readBody(
  req: IncomingMessage,
  res: ServerResponse,
  maxBodySize: number,
): Promise<unknown> {
  if (
    req.method === "GET" ||
    req.method === "DELETE" ||
    req.method === "OPTIONS"
  ) {
    return undefined;
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    let limitExceeded = false;

    req.on("data", (chunk: Buffer) => {
      if (limitExceeded) return;
      receivedBytes += chunk.length;
      if (receivedBytes > maxBodySize) {
        limitExceeded = true;
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
        reject(new Error("Payload too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (limitExceeded) return;
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
