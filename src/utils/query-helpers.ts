/**
 * postgres-mcp - Query Helpers
 *
 * Shared utilities for tool handlers that build SQL queries.
 * Eliminates duplicated limit-coercion and default-limit logic.
 */

/** Default maximum rows returned when no limit is specified */
export const DEFAULT_QUERY_LIMIT = 100;

/**
 * Coerce a raw limit parameter into a usable value.
 *
 * MCP clients may pass limits as strings, numbers, undefined, or 0.
 * This helper normalizes all cases:
 * - `undefined` → defaultLimit
 * - `NaN` / non-numeric strings → defaultLimit
 * - `0` → `null` (no limit — return all rows)
 * - Positive number → that number
 * - Negative / other → defaultLimit
 *
 * @param raw - Raw limit value from parsed Zod schema (may be any type)
 * @param defaultLimit - Fallback limit (default: DEFAULT_QUERY_LIMIT)
 * @returns The resolved limit, or `null` for unlimited
 */
export function coerceLimit(
  raw: unknown,
  defaultLimit: number = DEFAULT_QUERY_LIMIT,
): number | null {
  if (raw === undefined) return defaultLimit;
  const num = Number(raw);
  if (isNaN(num)) return defaultLimit;
  if (num === 0) return null;
  return num > 0 ? num : defaultLimit;
}

/**
 * Build a SQL LIMIT clause from a coerced limit value.
 *
 * @param limitVal - Resolved limit from coerceLimit(), or null for unlimited
 * @returns ` LIMIT N` string, or empty string for unlimited
 */
export function buildLimitClause(limitVal: number | null): string {
  return limitVal !== null ? ` LIMIT ${String(limitVal)}` : "";
}
