/**
 * PostgreSQL Core Tools - Error Helpers
 *
 * Shared helpers for formatting PostgreSQL errors into structured
 * responses. The actual error parsing logic lives in error-parser.ts.
 */

import { ErrorCategory } from "../../../../types/error-types.js";
import type { ErrorResponse } from "../../../../types/error-types.js";
import { PostgresMcpError, QueryError } from "../../../../types/errors.js";
import { parsePostgresError } from "./error-parser.js";
import type { ErrorContext } from "./error-parser.js";

// Re-export for consumers
export { parsePostgresError } from "./error-parser.js";
export type { ErrorContext } from "./error-parser.js";

/**
 * Check whether an error is a Zod-like validation error (duck-type detection).
 * Avoids importing zod in this shared module.
 */
function isZodLikeError(
  error: unknown,
): error is Error & { issues: { message?: string; path?: unknown[] }[] } {
  return (
    error instanceof Error &&
    "issues" in error &&
    Array.isArray((error as Record<string, unknown>)["issues"])
  );
}

/**
 * Format Zod validation issues into a human-readable semicolon-separated string.
 * Shared between formatPostgresError() and formatHandlerErrorResponse().
 */
function formatZodIssues(
  issues: { message?: string; path?: unknown[] }[],
): string {
  return issues
    .map((issue) => {
      const pathStr =
        Array.isArray(issue.path) && issue.path.length > 0
          ? issue.path.join(".")
          : "";
      const msg = issue.message ?? "Unknown validation error";
      return pathStr !== ""
        ? `Validation error: ${msg} (${pathStr})`
        : `Validation error: ${msg}`;
    })
    .join("; ");
}

/**
 * Wrapper around parsePostgresError that returns the structured error message
 * as a string instead of throwing. Use this in handler catch blocks where you
 * want to return `{ success: false, error: formatPostgresError(...) }`.
 *
 * parsePostgresError always throws — this function catches the throw and
 * extracts the message for structured error responses.
 */
export function formatPostgresError(
  error: unknown,
  context: ErrorContext,
): string {
  // Handle Zod validation errors: extract clean messages from issues array
  if (isZodLikeError(error)) {
    return formatZodIssues(error.issues);
  }

  try {
    parsePostgresError(error, context);
    // parsePostgresError always throws, but fallback just in case
    return error instanceof Error ? error.message : String(error);
  } catch (structured: unknown) {
    return structured instanceof Error
      ? structured.message
      : String(structured);
  }
}

/**
 * Canonical error formatter returning a rich ErrorResponse.
 * Part of the harmonized error handling standard across MCP projects.
 *
 * Combines:
 * - PostgresMcpError.toResponse() for typed errors
 * - parsePostgresError() for PG-specific error code mapping
 * - Zod validation path extraction
 * - Fallback for unknown errors
 */
export function formatHandlerErrorResponse(
  error: unknown,
  context: ErrorContext,
): ErrorResponse {
  // Typed postgres-mcp errors — use toResponse() directly
  if (error instanceof PostgresMcpError) {
    // If it's a QueryError wrapping a raw PG error, unwrap it so
    // parsePostgresError gets a chance to format it first natively.
    if (error.name === "QueryError" && error.cause !== undefined) {
      error = error.cause;
    } else {
      return error.toResponse();
    }
  }

  // Zod validation errors — shared formatter
  if (isZodLikeError(error)) {
    return {
      success: false,
      error: formatZodIssues(error.issues),
      code: "VALIDATION_ERROR",
      category: ErrorCategory.VALIDATION,
      suggestion: "Check the input parameters match the expected schema.",
      recoverable: false,
      details: undefined,
    };
  }

  // Raw PG errors — run through parsePostgresError for actionable messages
  try {
    parsePostgresError(error, context);
  } catch (structured: unknown) {
    const message =
      structured instanceof Error ? structured.message : String(structured);

    // Instantiate a QueryError to seamlessly apply auto-refinements via findSuggestion mapped to ERROR_SUGGESTIONS
    // This allows converting "Query error: Table X not found" into "TABLE_NOT_FOUND" code.
    const queryError = new QueryError(
      message,
      undefined,
      structured instanceof Error ? { cause: structured } : undefined,
    );

    return queryError.toResponse();
  }

  // Fallback for non-PG errors
  const message = error instanceof Error ? error.message : String(error);
  return {
    success: false,
    error: message,
    code: "INTERNAL_ERROR",
    category: ErrorCategory.INTERNAL,
    suggestion: undefined,
    recoverable: false,
    details: undefined,
  };
}
