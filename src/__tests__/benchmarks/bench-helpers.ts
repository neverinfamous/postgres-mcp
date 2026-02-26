/**
 * postgres-mcp - Benchmark Helper Utilities
 *
 * Extracted validation logic for benchmarking without requiring
 * a full DatabaseAdapter instance.
 */

/**
 * Dangerous SQL patterns used by DatabaseAdapter.validateQuery()
 * Extracted here to allow standalone benchmarking.
 */
const DANGEROUS_SQL_PATTERNS = [
  /;\s*(DROP|DELETE|UPDATE|INSERT|CREATE|ALTER|TRUNCATE|GRANT|REVOKE)/i,
  /--/,
  /\/\*/,
  /\bEXEC\b/i,
  /\bEXECUTE\b\s/i,
  /\bxp_\w+/i,
  /\bUNION\s+(ALL\s+)?SELECT\b/i,
  /\bINTO\s+(OUT|DUMP)FILE\b/i,
  /\bLOAD_FILE\s*\(/i,
];

const READ_ONLY_PATTERN =
  /^\s*(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|MERGE)\b/i;

/**
 * Validate a SQL query for safety, mimicking DatabaseAdapter.validateQuery()
 */
export function validateCode(sql: string, isReadOnly: boolean): void {
  if (!sql || typeof sql !== "string") {
    throw new Error("Query must be a non-empty string");
  }

  if (isReadOnly && READ_ONLY_PATTERN.test(sql)) {
    throw new Error("Write operation not allowed in read-only mode");
  }

  for (const pattern of DANGEROUS_SQL_PATTERNS) {
    if (pattern.test(sql)) {
      throw new Error(`Potentially dangerous SQL pattern detected`);
    }
  }
}
