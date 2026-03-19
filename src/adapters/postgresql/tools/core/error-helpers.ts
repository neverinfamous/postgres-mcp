/**
 * PostgreSQL Core Tools - Error Helpers
 *
 * Shared helpers for formatting PostgreSQL errors into structured
 * responses. The actual error parsing logic lives in error-parser.ts.
 */

import { ErrorCategory } from "../../../../types/error-types.js";
import type { ErrorResponse } from "../../../../types/error-types.js";
import { PostgresMcpError } from "../../../../types/errors.js";
import { parsePostgresError } from "./error-parser.js";
import type { ErrorContext } from "./error-parser.js";

// Re-export for consumers
export { parsePostgresError } from "./error-parser.js";
export type { ErrorContext } from "./error-parser.js";

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
  // ZodError instances have an .issues array — detect via duck-typing to
  // avoid importing zod in this shared module.
  if (
    error instanceof Error &&
    "issues" in error &&
    Array.isArray((error as Record<string, unknown>)["issues"])
  ) {
    const issues = (error as Record<string, unknown>)["issues"] as {
      message?: string;
      path?: unknown[];
    }[];
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
    return error.toResponse();
  }

  // Zod validation errors — duck-type detection
  if (
    error instanceof Error &&
    "issues" in error &&
    Array.isArray((error as Record<string, unknown>)["issues"])
  ) {
    const issues = (error as Record<string, unknown>)["issues"] as {
      message?: string;
      path?: unknown[];
    }[];
    const message = issues
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

    return {
      success: false,
      error: message,
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
    return {
      success: false,
      error: message,
      code: "QUERY_ERROR",
      category: ErrorCategory.QUERY,
      suggestion: undefined,
      recoverable: false,
      details: undefined,
    };
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
