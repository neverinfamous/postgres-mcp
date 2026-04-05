/**
 * postgres-mcp — Query Validation
 *
 * SQL query safety checks extracted from `DatabaseAdapter` to keep
 * that base class under the 500-line target.
 *
 * Used exclusively by `DatabaseAdapter.validateQuery()`.
 */

import { ValidationError } from "../types/index.js";

/**
 * Dangerous multi-statement patterns that appear only in injection
 * attempts — legitimate queries do not contain these sequences.
 */
const DANGEROUS_PATTERNS = [
  /;\s*DROP\s+/i,
  /;\s*DELETE\s+/i,
  /;\s*TRUNCATE\s+/i,
  /;\s*INSERT\s+/i,
  /;\s*UPDATE\s+/i,
  /--\s*$/m,
] as const;

/**
 * Keywords that begin write statements — used to enforce read-only mode.
 */
const WRITE_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "CREATE",
  "ALTER",
  "TRUNCATE",
  "GRANT",
  "REVOKE",
] as const;

/**
 * Validate a SQL query string for safety.
 *
 * Checks for multi-statement injection patterns and, when `isReadOnly`
 * is `true`, rejects queries that start with write keywords.
 *
 * Parameterized queries provide the primary defense against data-level
 * injection — this function guards against structural/statement attacks.
 *
 * @param sql       SQL query to validate
 * @param isReadOnly Whether to enforce read-only restrictions
 * @throws {ValidationError} on dangerous or disallowed patterns
 */
export function validateQuery(sql: string, isReadOnly: boolean): void {
  if (!sql || typeof sql !== "string") {
    throw new ValidationError("Query must be a non-empty string");
  }

  // Check for dangerous multi-statement injection patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(sql)) {
      throw new ValidationError(
        "Query contains potentially dangerous patterns",
      );
    }
  }

  // Enforce read-only for SELECT queries
  if (isReadOnly) {
    const normalizedSql = sql.trim().toUpperCase();
    for (const keyword of WRITE_KEYWORDS) {
      if (normalizedSql.startsWith(keyword)) {
        throw new ValidationError(
          `Read-only mode: ${keyword} statements are not allowed`,
        );
      }
    }
  }
}
