/**
 * postgres-mcp - Error Types
 *
 * Custom error classes for postgres-mcp operations.
 * Follows the harmonized error handling standard with
 * category, suggestion, recoverable flag, auto-refinement, and toResponse().
 */

import { ErrorCategory } from "./error-types.js";
import type { ErrorResponse } from "./error-types.js";
import { findSuggestion } from "../utils/error-suggestions.js";

/**
 * Generic error codes that should be auto-refined when findSuggestion
 * provides a more specific code (e.g., QUERY_ERROR → TABLE_NOT_FOUND).
 */
const REFINABLE_CODES = new Set([
  "QUERY_ERROR",
  "VALIDATION_ERROR",
  "RESOURCE_ERROR",
  "UNKNOWN_ERROR",
]);

/**
 * Base error class for postgres-mcp with enhanced diagnostics
 */
export class PostgresMcpError extends Error {
  /** Error category for classification */
  readonly category: ErrorCategory;
  /** Module-prefixed error code (e.g., CONNECTION_ERROR) */
  readonly code: string;
  /** Actionable suggestion for resolving the error */
  readonly suggestion: string | undefined;
  /** Additional error details */
  readonly details: Record<string, unknown> | undefined;
  /** Whether the error is recoverable (can retry) */
  readonly recoverable: boolean;

  constructor(
    message: string,
    code: string,
    category: ErrorCategory,
    options?: {
      suggestion?: string | undefined;
      details?: Record<string, unknown> | undefined;
      recoverable?: boolean | undefined;
      cause?: Error | undefined;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = this.constructor.name;
    this.category = category;
    this.recoverable = options?.recoverable ?? false;
    this.details = options?.details;

    // Auto-detect suggestion and refine generic codes
    const match = findSuggestion(message);
    this.suggestion = options?.suggestion ?? match?.suggestion;

    // Prefer the suggestion's specific code over generic category codes
    this.code = match?.code && REFINABLE_CODES.has(code) ? match.code : code;

    // Capture stack trace
    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * Convert to structured response object
   */
  toResponse(): ErrorResponse {
    return {
      success: false,
      error: this.message,
      code: this.code,
      category: this.category,
      suggestion: this.suggestion,
      recoverable: this.recoverable,
      details: this.details,
    };
  }
}

/**
 * Database connection error
 */
export class ConnectionError extends PostgresMcpError {
  constructor(
    message: string,
    details?: Record<string, unknown>,
    options?: { cause?: Error },
  ) {
    super(message, "CONNECTION_ERROR", ErrorCategory.CONNECTION, {
      suggestion:
        "Verify PostgreSQL is running and connection parameters are correct.",
      details,
      recoverable: true,
      cause: options?.cause,
    });
  }
}

/**
 * Connection pool error
 */
export class PoolError extends PostgresMcpError {
  constructor(
    message: string,
    details?: Record<string, unknown>,
    options?: { cause?: Error },
  ) {
    super(message, "POOL_ERROR", ErrorCategory.CONNECTION, {
      suggestion:
        "Check pool size limits or wait for connections to be released.",
      details,
      recoverable: true,
      cause: options?.cause,
    });
  }
}

/**
 * Query execution error
 */
export class QueryError extends PostgresMcpError {
  constructor(
    message: string,
    details?: Record<string, unknown>,
    options?: { cause?: Error },
  ) {
    super(message, "QUERY_ERROR", ErrorCategory.QUERY, {
      details,
      recoverable: false,
      cause: options?.cause,
    });
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends PostgresMcpError {
  constructor(
    message: string,
    details?: Record<string, unknown>,
    options?: { cause?: Error },
  ) {
    super(message, "AUTHENTICATION_ERROR", ErrorCategory.AUTHENTICATION, {
      suggestion: "Verify database credentials and authentication method.",
      details,
      recoverable: false,
      cause: options?.cause,
    });
  }
}

/**
 * Authorization error (insufficient permissions)
 */
export class AuthorizationError extends PostgresMcpError {
  constructor(
    message: string,
    details?: Record<string, unknown>,
    options?: { cause?: Error },
  ) {
    super(message, "AUTHORIZATION_ERROR", ErrorCategory.AUTHORIZATION, {
      suggestion: "Check the user's privileges on the target database object.",
      details,
      recoverable: false,
      cause: options?.cause,
    });
  }
}

/**
 * Validation error for input parameters
 */
export class ValidationError extends PostgresMcpError {
  constructor(
    message: string,
    details?: Record<string, unknown>,
    options?: { cause?: Error },
  ) {
    super(message, "VALIDATION_ERROR", ErrorCategory.VALIDATION, {
      details,
      recoverable: false,
      cause: options?.cause,
    });
  }
}

/**
 * Transaction error
 */
export class TransactionError extends PostgresMcpError {
  constructor(
    message: string,
    details?: Record<string, unknown>,
    options?: { cause?: Error },
  ) {
    super(message, "TRANSACTION_ERROR", ErrorCategory.QUERY, {
      suggestion:
        "Use pg_transaction_rollback to end the aborted transaction, or pg_transaction_rollback_to to recover to a savepoint.",
      details,
      recoverable: true,
      cause: options?.cause,
    });
  }
}

/**
 * Extension not available error
 */
export class ExtensionNotAvailableError extends PostgresMcpError {
  constructor(
    extensionName: string,
    details?: Record<string, unknown>,
    options?: { cause?: Error },
  ) {
    super(
      `Extension '${extensionName}' is not installed or enabled`,
      "EXTENSION_NOT_AVAILABLE",
      ErrorCategory.CONFIGURATION,
      {
        suggestion: `Install the '${extensionName}' extension with CREATE EXTENSION ${extensionName}.`,
        details: { extension: extensionName, ...details },
        recoverable: false,
        cause: options?.cause,
      },
    );
  }
}
