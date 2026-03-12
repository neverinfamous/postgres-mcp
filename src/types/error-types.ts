/**
 * postgres-mcp - Error Types
 *
 * Shared error classification types. Part of the harmonized
 * error handling standard across MCP projects.
 */

/**
 * Error categories for classification and handling
 */
export enum ErrorCategory {
  /** Input validation failures (invalid names, paths, types) */
  VALIDATION = "validation",
  /** Database connection issues */
  CONNECTION = "connection",
  /** SQL execution errors */
  QUERY = "query",
  /** Authorization/permission failures */
  PERMISSION = "permission",
  /** Configuration/setup issues */
  CONFIGURATION = "config",
  /** Missing resources (tables, columns, views) */
  RESOURCE = "resource",
  /** Authentication failures (invalid credentials, expired tokens) */
  AUTHENTICATION = "authentication",
  /** Authorization failures (insufficient scope/permissions) */
  AUTHORIZATION = "authorization",
  /** Unexpected internal errors */
  INTERNAL = "internal",
}

/**
 * Structured error response format
 */
export interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  category: ErrorCategory;
  suggestion: string | undefined;
  recoverable: boolean;
  details: Record<string, unknown> | undefined;
}

/**
 * Context about the operation that triggered the error.
 * Passed to formatHandlerError for context-aware error mapping.
 */
export interface ErrorContext {
  tool: string;
  sql?: string;
  table?: string;
  index?: string;
  schema?: string;
  target?: string;
  objectType?: string;
}
