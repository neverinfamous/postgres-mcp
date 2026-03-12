/**
 * postgres-mcp - OAuth Errors
 *
 * Error classes for OAuth 2.0 authentication and authorization.
 */

/**
 * Base OAuth error class
 */
export class OAuthError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;

  constructor(message: string, code: string, httpStatus = 401) {
    super(message);
    this.name = "OAuthError";
    this.code = code;
    this.httpStatus = httpStatus;
    Object.setPrototypeOf(this, OAuthError.prototype);
  }
}

/**
 * Token missing from request
 */
export class TokenMissingError extends OAuthError {
  constructor(message = "No bearer token provided") {
    super(message, "TOKEN_MISSING", 401);
    this.name = "TokenMissingError";
    Object.setPrototypeOf(this, TokenMissingError.prototype);
  }
}

/**
 * Token is invalid (malformed, wrong signature, etc.)
 */
export class InvalidTokenError extends OAuthError {
  constructor(message = "Invalid access token") {
    super(message, "INVALID_TOKEN", 401);
    this.name = "InvalidTokenError";
    Object.setPrototypeOf(this, InvalidTokenError.prototype);
  }
}

/**
 * Token has expired
 */
export class TokenExpiredError extends OAuthError {
  constructor(message = "Access token has expired") {
    super(message, "TOKEN_EXPIRED", 401);
    this.name = "TokenExpiredError";
    Object.setPrototypeOf(this, TokenExpiredError.prototype);
  }
}

/**
 * Token signature is invalid
 */
export class InvalidSignatureError extends OAuthError {
  constructor(message = "Invalid token signature") {
    super(message, "INVALID_SIGNATURE", 401);
    this.name = "InvalidSignatureError";
    Object.setPrototypeOf(this, InvalidSignatureError.prototype);
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
    );
    this.name = "InsufficientScopeError";
    this.requiredScopes = requiredScopes;
    Object.setPrototypeOf(this, InsufficientScopeError.prototype);
  }
}

/**
 * Authorization server discovery failed
 */
export class AuthServerDiscoveryError extends OAuthError {
  constructor(message = "Failed to discover authorization server metadata") {
    super(message, "DISCOVERY_FAILED", 500);
    this.name = "AuthServerDiscoveryError";
    Object.setPrototypeOf(this, AuthServerDiscoveryError.prototype);
  }
}

/**
 * JWKS fetch failed
 */
export class JwksFetchError extends OAuthError {
  constructor(message = "Failed to fetch JWKS") {
    super(message, "JWKS_FETCH_FAILED", 500);
    this.name = "JwksFetchError";
    Object.setPrototypeOf(this, JwksFetchError.prototype);
  }
}

/**
 * Client registration failed
 */
export class ClientRegistrationError extends OAuthError {
  constructor(message = "Client registration failed") {
    super(message, "REGISTRATION_FAILED", 400);
    this.name = "ClientRegistrationError";
    Object.setPrototypeOf(this, ClientRegistrationError.prototype);
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
 * Formats based on error type per RFC 6750 §3.
 */
export function getWWWAuthenticateHeader(
  error: OAuthError,
  realm = "postgres-mcp",
): string {
  if (error instanceof InsufficientScopeError) {
    return `Bearer error="insufficient_scope", scope="${error.requiredScopes.join(" ")}"`;
  }

  if (error instanceof TokenMissingError) {
    return `Bearer realm="${realm}"`;
  }

  return `Bearer error="invalid_token"`;
}
