/**
 * postgres-mcp - JSONB Schema Utilities
 *
 * Path normalization, preprocessing, and helper functions for JSONB operations.
 *
 * PATH FORMAT NORMALIZATION:
 * All tools now accept BOTH formats for paths:
 * - STRING: 'a.b[0]' or 'a.b.0' (dot notation)
 * - ARRAY: ['a', 'b', '0']
 */

/**
 * Convert a string path to array format
 * 'a.b[0].c' → ['a', 'b', '0', 'c']
 * 'a.b.0' → ['a', 'b', '0']
 * '[-1]' → ['-1'] (supports negative indices)
 */
export function stringPathToArray(path: string): string[] {
  // Handle JSONPath format ($.a.b) - strip leading $. if present
  let normalized = path.startsWith("$.") ? path.slice(2) : path;
  // Remove leading $ if present
  if (normalized.startsWith("$")) normalized = normalized.slice(1);
  if (normalized.startsWith(".")) normalized = normalized.slice(1);

  // Replace array notation [0] or [-1] with .0 or .-1 (supports negative indices)
  normalized = normalized.replace(/\[(-?\d+)\]/g, ".$1");

  // Split by dot and filter empty strings
  return normalized.split(".").filter((p) => p !== "");
}

/**
 * Convert array path to string format for extract
 * ['a', 'b', '0'] → 'a.b.0'
 */
export function arrayPathToString(path: string[]): string {
  return path.join(".");
}

/**
 * Normalize path to array format (for set/insert handlers)
 * Accepts both string paths and arrays with mixed string/number elements
 */
export function normalizePathToArray(
  path: string | number | (string | number)[],
): string[] {
  if (typeof path === "number") {
    return [String(path)];
  }
  if (typeof path === "string") {
    return stringPathToArray(path);
  }
  // Convert all elements to strings
  return path.map((p) => String(p));
}

/**
 * Normalize path for jsonb_insert - converts numeric path segments to numbers
 * PostgreSQL jsonb_insert requires integer indices for array access
 * 'tags.0' → ['tags', 0] (number, not string)
 * 0 → [0] (bare number wrapped in array)
 */
export function normalizePathForInsert(
  path: string | number | (string | number)[],
): (string | number)[] {
  // Handle bare numbers (e.g., 0, -1 for array positions)
  if (typeof path === "number") {
    return [path];
  }
  if (typeof path === "string") {
    const segments = stringPathToArray(path);
    // Convert numeric strings to numbers for array access
    return segments.map((p) => (/^-?\d+$/.test(p) ? parseInt(p, 10) : p));
  }
  // Already mixed types - ensure numbers stay as numbers
  return path.map((p) =>
    typeof p === "number" ? p : /^-?\d+$/.test(p) ? parseInt(p, 10) : p,
  );
}

/**
 * Normalize path to string format (for extract handler)
 * Accepts both string paths and arrays with mixed string/number elements
 */
export function normalizePathToString(
  path: string | number | (string | number)[],
): string {
  if (typeof path === "number") {
    return String(path);
  }
  if (Array.isArray(path)) {
    return path.map((p) => String(p)).join(".");
  }
  return path;
}

/**
 * Parse JSON string values for JSONB value parameters
 * MCP clients may send objects as JSON strings
 */
export function parseJsonbValue(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value; // Keep as string if not valid JSON
    }
  }
  return value;
}

/**
 * Preprocess JSONB tool parameters to normalize common input patterns.
 * Handles aliases and schema.table format parsing.
 * Exported so tools can apply it in their handlers.
 *
 * SPLIT SCHEMA PATTERN:
 * - Base schemas use optional table/tableName with .refine() for MCP visibility
 * - Handlers use z.preprocess(preprocessJsonbParams, BaseSchema) for alias resolution
 */
export function preprocessJsonbParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  const result = { ...(input as Record<string, unknown>) };

  // Alias: tableName → table
  if (result["tableName"] !== undefined && result["table"] === undefined) {
    result["table"] = result["tableName"];
  }
  // Alias: name → table (for consistency with other tool groups)
  if (result["name"] !== undefined && result["table"] === undefined) {
    result["table"] = result["name"];
  }
  // Alias: col → column
  if (result["col"] !== undefined && result["column"] === undefined) {
    result["column"] = result["col"];
  }
  // Alias: filter → where
  if (result["filter"] !== undefined && result["where"] === undefined) {
    result["where"] = result["filter"];
  }
  // Alias: contains → value (for pg_jsonb_contains)
  if (result["contains"] !== undefined && result["value"] === undefined) {
    result["value"] = result["contains"];
  }

  // Parse schema.table format (embedded schema takes priority)
  if (typeof result["table"] === "string" && result["table"].includes(".")) {
    const parts = result["table"].split(".");
    if (parts.length === 2 && parts[0] && parts[1]) {
      // Only override schema if not already explicitly set
      if (result["schema"] === undefined) {
        result["schema"] = parts[0];
      }
      result["table"] = parts[1];
    }
  }

  return result;
}
