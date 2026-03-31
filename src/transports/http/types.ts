/**
 * postgres-mcp - HTTP Transport Types
 *
 * Shared interfaces and constants for the HTTP transport module.
 */

import type { OAuthResourceServer } from "../../auth/oauth-resource-server.js";
import type { TokenValidator } from "../../auth/token-validator.js";

// =============================================================================
// Server Timeout Constants
// =============================================================================

/** HTTP request timeout (ms) — prevents slowloris-style DoS */
export const HTTP_REQUEST_TIMEOUT_MS = 120_000;

/** Keep-alive timeout (ms) — slightly above common LB idle timeout */
export const HTTP_KEEP_ALIVE_TIMEOUT_MS = 65_000;

/** Headers timeout (ms) — must be > keepAliveTimeout per Node.js docs */
export const HTTP_HEADERS_TIMEOUT_MS = 66_000;

// =============================================================================
// Configuration
// =============================================================================

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

  /** Simple bearer token for lightweight authentication (alternative to OAuth) */
  authToken?: string;

  /** Enable stateless mode — no sessions, no SSE, each request is independent */
  stateless?: boolean;

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

  /**
   * Trust proxy headers for client IP extraction (default: false)
   * When enabled, uses the leftmost IP from X-Forwarded-For for rate limiting.
   * Only enable when running behind a trusted reverse proxy.
   */
  trustProxy?: boolean;

  /**
   * Override HTTP headers timeout (ms)
   * Prevents slowloris attacks by dropping connections that take too long to send headers
   */
  headersTimeoutMs?: number | undefined;

  /**
   * Override HTTP request timeout (ms)
   */
  requestTimeoutMs?: number | undefined;
}
