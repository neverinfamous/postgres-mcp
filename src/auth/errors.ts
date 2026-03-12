/**
 * postgres-mcp - OAuth Errors
 *
 * Error classes for OAuth 2.1 authentication and authorization.
 * Follows the harmonized error handling standard — OAuthError
 * extends PostgresMcpError for full category/suggestion/toResponse() support.
 */

import { PostgresMcpError } from "../types/errors.js";
import { ErrorCategory } from "../types/error-types.js";

/**
 * Base OAuth error class
 */
export class OAuthError extends PostgresMcpError {
  public readonly httpStatus: number;
  public readonly wwwAuthenticate: string;

  constructor(
    message: string,
    code: string,
    httpStatus = 401,
    options?: {
      details?: Record<string, unknown>;
      wwwAuthenticate?: string;
    },
  ) {
    super(message, `AUTH_${code}`, ErrorCategory.AUTHENTICATION, {
      details: options?.details,
      recoverable: false,
    });
    this.name = "OAuthError";
    this.httpStatus = httpStatus;
    this.wwwAuthenticate =
      options?.wwwAuthenticate ?? `Bearer error="invalid_token"`;
  }
}

/**
 * Token missing from request
 */
export class TokenMissingError extends OAuthError {
  constructor(message = "No bearer token provided") {
    super(message, "TOKEN_MISSING", 401, {
      wwwAuthenticate: `Bearer realm="postgres-mcp"`,
    });
    this.name = "TokenMissingError";
  }
}

/**
 * Token is invalid (malformed, wrong signature, etc.)
 */
export class InvalidTokenError extends OAuthError {
  constructor(message = "Invalid access token") {
    super(message, "INVALID_TOKEN", 401);
    this.name = "InvalidTokenError";
  }
}

/**
 * Token has expired
 */
export class TokenExpiredError extends OAuthError {
  constructor(message = "Access token has expired") {
    super(message, "TOKEN_EXPIRED", 401);
    this.name = "TokenExpiredError";
  }
}

/**
 * Token signature is invalid
 */
export class InvalidSignatureError extends OAuthError {
  constructor(message = "Invalid token signature") {
    super(message, "INVALID_SIGNATURE", 401);
    this.name = "InvalidSignatureError";
  }
}

/**
 * Token lacks required scope
 */
export class InsufficientScopeError extends OAuthError {
  public readonly requiredScopes: string[];

  constructor(requiredScopes: string[], message?: string) {
    super(
      message ?? `Insufficient scope. Required: ${requiredScopes.join(", ")}`,
      "INSUFFICIENT_SCOPE",
      403,
      {
        details: { requiredScopes },
        wwwAuthenticate: `Bearer error="insufficient_scope", scope="${requiredScopes.join(" ")}"`,
      },
    );
    this.name = "InsufficientScopeError";
    this.requiredScopes = requiredScopes;
  }
}

/**
 * Authorization server discovery failed
 */
export class AuthServerDiscoveryError extends OAuthError {
  constructor(message = "Failed to discover authorization server metadata") {
    super(message, "DISCOVERY_FAILED", 500);
    this.name = "AuthServerDiscoveryError";
  }
}

/**
 * JWKS fetch failed
 */
export class JwksFetchError extends OAuthError {
  constructor(message = "Failed to fetch JWKS") {
    super(message, "JWKS_FETCH_FAILED", 500);
    this.name = "JwksFetchError";
  }
}

/**
 * Client registration failed
 */
export class ClientRegistrationError extends OAuthError {
  constructor(message = "Client registration failed") {
    super(message, "REGISTRATION_FAILED", 400);
    this.name = "ClientRegistrationError";
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if an error is an OAuth error
 */
export function isOAuthError(error: unknown): error is OAuthError {
  return error instanceof OAuthError;
}

/**
 * Get WWW-Authenticate header for an OAuth error.
 * @deprecated Use error.wwwAuthenticate property directly instead.
 */
export function getWWWAuthenticateHeader(
  error: OAuthError,
  _realm = "postgres-mcp",
): string {
  return error.wwwAuthenticate;
}
