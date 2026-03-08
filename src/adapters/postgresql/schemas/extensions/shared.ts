/**
 * postgres-mcp - Extension Schemas Shared Utilities
 *
 * Common helper functions used across extension schema modules.
 */

/**
 * Handle undefined/null params for tools with optional-only parameters
 */
export function normalizeOptionalParams(
  input: unknown,
): Record<string, unknown> {
  if (typeof input !== "object" || input === null) {
    return {};
  }
  return input as Record<string, unknown>;
}
