/**
 * postgres-mcp - WHERE Clause Validation
 *
 * Validates WHERE clause parameters to prevent SQL injection.
 * Uses a blocklist approach to reject dangerous patterns while
 * allowing legitimate complex conditions.
 */

/**
 * Error thrown when an unsafe WHERE clause is detected
 */
export class UnsafeWhereClauseError extends Error {
  constructor(reason: string) {
    super(`Unsafe WHERE clause: ${reason}`);
    this.name = "UnsafeWhereClauseError";
  }
}

/**
 * Dangerous SQL patterns that should never appear in WHERE clauses.
 * These patterns indicate SQL injection attempts.
 */
const DANGEROUS_PATTERNS: { pattern: RegExp; reason: string }[] = [
  // Statement terminators and new statements
  {
    pattern:
      /;\s*(DROP|DELETE|TRUNCATE|INSERT|UPDATE|CREATE|ALTER|GRANT|REVOKE)/i,
    reason: "contains statement terminator followed by dangerous keyword",
  },
  // Trailing semicolons (potential statement injection)
  {
    pattern: /;\s*$/,
    reason: "contains trailing semicolon",
  },
  // SQL comments (can be used to comment out security checks)
  {
    pattern: /--/,
    reason: "contains SQL line comment",
  },
  {
    pattern: /\/\*/,
    reason: "contains SQL block comment",
  },
  // UNION injection (data exfiltration)
  {
    pattern: /\bUNION\s+(ALL\s+)?SELECT\b/i,
    reason: "contains UNION SELECT",
  },
  // File operations
  {
    pattern: /\bINTO\s+(OUT|DUMP)FILE\b/i,
    reason: "contains file write operation",
  },
  {
    pattern: /\bLOAD_FILE\s*\(/i,
    reason: "contains file read operation",
  },
  // PostgreSQL specific dangerous functions
  {
    pattern: /\bpg_sleep\s*\(/i,
    reason: "contains time-based injection function",
  },
  {
    pattern: /\bpg_read_file\s*\(/i,
    reason: "contains file read function",
  },
  {
    pattern: /\bpg_read_binary_file\s*\(/i,
    reason: "contains binary file read function",
  },
  {
    pattern: /\bpg_ls_dir\s*\(/i,
    reason: "contains directory listing function",
  },
  {
    pattern: /\blo_import\s*\(/i,
    reason: "contains large object import function",
  },
  {
    pattern: /\blo_export\s*\(/i,
    reason: "contains large object export function",
  },
  // Remote server access via dblink
  {
    pattern: /\bdblink_connect\s*\(/i,
    reason: "contains remote server connection function",
  },
  {
    pattern: /\bdblink_exec\s*\(/i,
    reason: "contains remote query execution function",
  },
  // Asynchronous notification side channel
  {
    pattern: /\bpg_notify\s*\(/i,
    reason: "contains notification side-channel function",
  },
  // System command execution
  {
    pattern: /\bCOPY\s+.*\s+(FROM|TO)\s+PROGRAM\b/i,
    reason: "contains COPY PROGRAM (command execution)",
  },
  // Remote query execution via dblink()
  {
    pattern: /\bdblink\s*\(/i,
    reason: "contains remote query execution function",
  },
  // OS command execution (PostgreSQL 12+)
  {
    pattern: /\bpg_execute_server_program\s*\(/i,
    reason: "contains OS command execution function",
  },
];

/**
 * Validates a WHERE clause for dangerous SQL patterns.
 *
 * This function uses a blocklist approach to detect and reject
 * common SQL injection patterns. It allows legitimate complex
 * conditions while blocking obvious attack vectors.
 *
 * @param where - The WHERE clause to validate
 * @throws UnsafeWhereClauseError if a dangerous pattern is detected
 *
 * @example
 * validateWhereClause("price > 10");                    // OK
 * validateWhereClause("status = 'active' AND id < 100"); // OK
 * validateWhereClause("1=1; DROP TABLE users;--");      // Throws
 * validateWhereClause("1=1 UNION SELECT * FROM pg_shadow"); // Throws
 */
export function validateWhereClause(where: string): void {
  if (!where || typeof where !== "string") {
    throw new UnsafeWhereClauseError("WHERE clause must be a non-empty string");
  }

  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(where)) {
      throw new UnsafeWhereClauseError(reason);
    }
  }
}

/**
 * Validates and returns a safe WHERE clause.
 *
 * @param where - The WHERE clause to sanitize
 * @returns The validated WHERE clause (unchanged if safe)
 * @throws UnsafeWhereClauseError if a dangerous pattern is detected
 */
export function sanitizeWhereClause(where: string): string {
  validateWhereClause(where);
  return where;
}
