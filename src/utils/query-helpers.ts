/**
 * postgres-mcp - Query Helpers
 *
 * Shared utilities for tool handlers and resource files.
 * Eliminates duplicated limit-coercion, default-limit, and type-coercion logic.
 */

/** Default maximum rows returned when no limit is specified */
export const DEFAULT_QUERY_LIMIT = 100;

/**
 * Safe numeric coercion for z.preprocess() in SchemaBase definitions.
 *
 * z.coerce.number() converts "abc" → NaN, which Zod rejects at the SDK
 * boundary with a raw MCP -32602 error before the handler's try/catch.
 * This helper converts non-numeric values to undefined so the
 * .optional() chain kicks in and the handler receives undefined instead.
 *
 * Usage: `z.preprocess(coerceNumber, z.number().optional())`
 */
export function coerceNumber(val: unknown, _ctx?: unknown): unknown {
  if (val === undefined || val === null) return undefined;
  if (typeof val === "number") return Number.isNaN(val) ? undefined : val;
  if (typeof val === "string") {
    const n = Number(val);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

/**
 * Row-count threshold below which index recommendations are suppressed.
 * Used by resource handlers (vector, postgis) to skip index suggestions
 * on tables too small to benefit from them.
 */
export const SMALL_TABLE_THRESHOLD = 1000;

/**
 * Safely coerce an unknown database row value to a string.
 * Handles string, number, null/undefined, and object values.
 */
export function toStr(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value.toString();
  if (typeof value === "object") return JSON.stringify(value);
  return "";
}

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
