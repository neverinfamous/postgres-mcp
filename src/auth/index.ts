/**
 * postgres-mcp - Auth Module
 *
 * OAuth 2.0 authentication and authorization for PostgreSQL MCP Server.
 */

// Types
export type {
  ProtectedResourceMetadata,
  AuthorizationServerMetadata,
  ClientRegistrationRequest,
  ClientRegistrationResponse,
  JWK,
  JWKSDocument,
  TokenValidationResult,
  TokenClaims,
  ResourceServerConfig,
  TokenValidatorConfig,
  AuthServerDiscoveryConfig,
} from "./types.js";

// Errors
export {
  OAuthError,
  TokenMissingError,
  InvalidTokenError,
  TokenExpiredError,
  InvalidSignatureError,
  InsufficientScopeError,
  AuthServerDiscoveryError,
  JwksFetchError,
  ClientRegistrationError,
  isOAuthError,
} from "./errors.js";

// Scopes
export {
  SCOPES,
  ALL_SCOPES,
  BASE_SCOPES,
  SCOPE_PATTERNS,
  TOOL_GROUP_SCOPES,
  parseScopes,
  hasScope,
  hasAnyScope,
  hasAllScopes,
  getScopeForToolGroup,
  hasDatabaseScope,
  hasSchemaScope,
  hasTableScope,
  getScopeDisplayName,
} from "./scopes.js";
export type { StandardScope } from "./scopes.js";

// Components
export { TokenValidator, createTokenValidator } from "./TokenValidator.js";
export {
  AuthorizationServerDiscovery,
  createAuthServerDiscovery,
} from "./AuthorizationServerDiscovery.js";
export {
  OAuthResourceServer,
  createOAuthResourceServer,
} from "./OAuthResourceServer.js";

// Middleware
export {
  extractBearerToken,
  createAuthContext,
  validateAuth,
  requireScope,
  requireAnyScope,
  requireToolScope,
  formatOAuthError,
} from "./middleware.js";
export type {
  AuthenticatedContext,
  AuthMiddlewareConfig,
} from "./middleware.js";
