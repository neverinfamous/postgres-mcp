/**
 * postgres-mcp - OAuth Middleware
 *
 * Authentication and authorization middleware for HTTP transport.
 * Transport-agnostic utilities (AuthenticatedContext, formatOAuthError,
 * createAuthenticatedContext, validateAuth) live in transport-agnostic.ts.
 * This file re-exports the shared type/formatter and provides
 * middleware-specific wrappers with config-object signatures.
 */

import type { TokenValidator } from "./token-validator.js";
import {
  TokenMissingError,
  InvalidTokenError,
  InsufficientScopeError,
} from "./errors.js";
import { hasScope, hasAnyScope, SCOPES } from "./scopes.js";

// Re-export shared type and formatter from transport-agnostic module
export type { AuthenticatedContext } from "./transport-agnostic.js";
export { formatOAuthError } from "./transport-agnostic.js";

// Re-export shared helper for backward compat
export { extractBearerToken } from "./helpers.js";

// Import for local use
import type { AuthenticatedContext } from "./transport-agnostic.js";
import { extractBearerToken } from "./helpers.js";

/**
 * Auth middleware configuration
 */
export interface AuthMiddlewareConfig {
  /** Token validator instance */
  tokenValidator: TokenValidator;

  /** Whether to require authentication (default: true) */
  required?: boolean;

  /** Required scopes (any of these) */
  requiredScopes?: string[];
}

/**
 * Create authentication context from request
 */
export async function createAuthContext(
  authHeader: string | undefined,
  tokenValidator: TokenValidator,
): Promise<AuthenticatedContext> {
  const token = extractBearerToken(authHeader);

  if (!token) {
    return { authenticated: false, scopes: [] };
  }

  const result = await tokenValidator.validate(token);

  if (!result.valid || !result.claims) {
    return { authenticated: false, scopes: [] };
  }

  return {
    authenticated: true,
    claims: result.claims,
    scopes: result.claims.scopes,
  };
}

/**
 * Validate authentication and authorization (middleware variant).
 * Uses config object for Express middleware chaining.
 * For transport-agnostic usage, see validateAuth in transport-agnostic.ts.
 */
export async function validateAuth(
  authHeader: string | undefined,
  config: AuthMiddlewareConfig,
): Promise<AuthenticatedContext> {
  const token = extractBearerToken(authHeader);

  // Check if token is required
  if (!token) {
    if (config.required !== false) {
      throw new TokenMissingError();
    }
    return { authenticated: false, scopes: [] };
  }

  // Validate the token
  const result = await config.tokenValidator.validate(token);

  if (!result.valid || !result.claims) {
    throw new InvalidTokenError(result.error ?? "Invalid token");
  }

  const context: AuthenticatedContext = {
    authenticated: true,
    claims: result.claims,
    scopes: result.claims.scopes,
  };

  // Check required scopes
  if (config.requiredScopes && config.requiredScopes.length > 0) {
    if (!hasAnyScope(context.scopes, config.requiredScopes)) {
      throw new InsufficientScopeError(config.requiredScopes);
    }
  }

  return context;
}

/**
 * Check if context has required scope
 */
export function requireScope(
  context: AuthenticatedContext,
  scope: string,
): void {
  if (!context.authenticated) {
    throw new TokenMissingError();
  }

  if (!hasScope(context.scopes, scope)) {
    throw new InsufficientScopeError([scope]);
  }
}

/**
 * Check if context has any of the required scopes
 */
export function requireAnyScope(
  context: AuthenticatedContext,
  scopes: string[],
): void {
  if (!context.authenticated) {
    throw new TokenMissingError();
  }

  if (!hasAnyScope(context.scopes, scopes)) {
    throw new InsufficientScopeError(scopes);
  }
}

/**
 * Check if context has scope for a tool operation
 */
export function requireToolScope(
  context: AuthenticatedContext,
  requiredScopes: string[],
): void {
  if (!context.authenticated) {
    throw new TokenMissingError();
  }

  // Map tool required scopes to actual OAuth scopes
  const mappedScopes = requiredScopes.map((scope) => {
    switch (scope) {
      case "read":
        return SCOPES.READ;
      case "write":
        return SCOPES.WRITE;
      case "admin":
        return SCOPES.ADMIN;
      default:
        return scope;
    }
  });

  if (!hasAnyScope(context.scopes, mappedScopes)) {
    throw new InsufficientScopeError(mappedScopes);
  }
}
