/**
 * postgres-mcp — Auth Helpers
 *
 * Shared authentication utilities used by both middleware.ts
 * (Express-style) and transport-agnostic.ts.
 */

/**
 * Extract a Bearer token from an Authorization header.
 *
 * - Returns `null` for missing, malformed, or non-Bearer headers
 * - Trims the token and rejects empty tokens
 * - Case-insensitive scheme matching (`Bearer`, `bearer`, etc.)
 */
export function extractBearerToken(
  authHeader: string | undefined,
): string | null {
  if (!authHeader) return null;

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer") return null;

  const tokenPart = parts[1];
  if (tokenPart === undefined) return null;

  const token = tokenPart.trim();
  return token.length > 0 ? token : null;
}
