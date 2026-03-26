/**
 * Error Suggestions
 *
 * Pattern-based suggestions for common errors. Maps error message patterns
 * to actionable user-facing suggestions. Used by PostgresMcpError constructor
 * for auto-refinement of generic error codes and suggestion auto-detection.
 *
 * Complements error-parser.ts (PG-specific error code mapping) by handling
 * generic message patterns that don't have PG error codes attached.
 */

import { ErrorCategory } from "../types/error-types.js";

/**
 * Pattern-based suggestions for common errors
 */
const ERROR_SUGGESTIONS: {
  pattern: RegExp;
  suggestion: string;
  category?: ErrorCategory | undefined;
  /** Specific error code override (takes precedence over category default code) */
  code?: string | undefined;
}[] = [
  // Validation errors
  {
    pattern: /invalid table name/i,
    suggestion:
      "Table names must follow PostgreSQL identifier rules: start with a letter or underscore, contain only alphanumeric characters or underscores.",
    category: ErrorCategory.VALIDATION,
  },
  {
    pattern: /invalid column name/i,
    suggestion:
      "Column names must follow PostgreSQL identifier rules: start with a letter or underscore, contain only alphanumeric characters or underscores.",
    category: ErrorCategory.VALIDATION,
  },
  {
    pattern: /invalid (view|index|schema|sequence) name/i,
    suggestion:
      "Names must follow PostgreSQL identifier rules: start with a letter or underscore, followed by alphanumeric characters only.",
    category: ErrorCategory.VALIDATION,
  },
  {
    pattern: /vector dimensions must match/i,
    suggestion:
      "All vectors in comparison must have the same number of dimensions.",
    category: ErrorCategory.VALIDATION,
    code: "DIMENSION_MISMATCH",
  },
  {
    pattern: /insufficient data/i,
    suggestion:
      "Not enough data points for the requested analysis. Add more data or reduce the degree.",
    category: ErrorCategory.VALIDATION,
  },

  // Resource errors — specific codes for table/column not found
  {
    pattern: /relation ".*" does not exist/i,
    suggestion:
      "Table or view not found. Run pg_list_tables to see available tables.",
    category: ErrorCategory.RESOURCE,
    code: "TABLE_NOT_FOUND",
  },
  {
    pattern: /table (?:or view )?['"].*['"] not found/i,
    suggestion:
      "Table or view not found. Run pg_list_tables to see available tables.",
    category: ErrorCategory.RESOURCE,
    code: "TABLE_NOT_FOUND",
  },
  {
    pattern: /object ['"].*['"] not found/i,
    suggestion:
      "Object not found. Use pg_list_objects to discover database objects.",
    category: ErrorCategory.RESOURCE,
    code: "OBJECT_NOT_FOUND",
  },
  {
    pattern: /column ".*" does not exist/i,
    suggestion:
      "Column not found. Use pg_describe_table to see available columns.",
    category: ErrorCategory.RESOURCE,
    code: "COLUMN_NOT_FOUND",
  },
  {
    pattern: /schema ".*" does not exist/i,
    suggestion:
      "Schema not found. Use pg_list_schemas to see available schemas.",
    category: ErrorCategory.RESOURCE,
    code: "SCHEMA_NOT_FOUND",
  },
  {
    pattern: /index ".*" does not exist/i,
    suggestion:
      "Index not found. Use pg_get_indexes to see available indexes.",
    category: ErrorCategory.RESOURCE,
    code: "INDEX_NOT_FOUND",
  },
  {
    pattern: /database ".*" does not exist/i,
    suggestion:
      "Database not found. Verify the database name or omit the parameter to use the current database.",
    category: ErrorCategory.RESOURCE,
    code: "DATABASE_NOT_FOUND",
  },
  {
    pattern: /wrong key or corrupt data/i,
    suggestion:
      "Decryption failed. Ensure the correct passphrase and cipher algorithm are used.",
    category: ErrorCategory.VALIDATION,
    code: "DECRYPTION_FAILED",
  },
  {
    pattern: /invalid base64 end sequence/i,
    suggestion:
      "Decryption failed. The provided text is not a valid base64 encoded string.",
    category: ErrorCategory.VALIDATION,
    code: "INVALID_BASE64",
  },

  // Query errors
  {
    pattern: /syntax error/i,
    suggestion:
      "Check SQL syntax. Common issues: missing quotes, commas, parentheses, or reserved word conflicts.",
    category: ErrorCategory.QUERY,
  },
  {
    pattern: /unique constraint/i,
    suggestion:
      "A row with this value already exists. Use pg_upsert for insert-or-update behavior.",
    category: ErrorCategory.QUERY,
  },
  {
    pattern: /duplicate key/i,
    suggestion:
      "A row with this key already exists. Use pg_upsert for insert-or-update behavior.",
    category: ErrorCategory.QUERY,
  },
  {
    pattern: /foreign key constraint/i,
    suggestion:
      "The referenced row does not exist. Ensure the parent record exists before inserting.",
    category: ErrorCategory.QUERY,
  },
  {
    pattern: /not-null constraint/i,
    suggestion:
      "A required column is missing a value. Provide a value or set a default.",
    category: ErrorCategory.QUERY,
  },
  {
    pattern: /check constraint/i,
    suggestion:
      "The value does not meet the column's check constraint requirements.",
    category: ErrorCategory.QUERY,
  },
  {
    pattern: /current transaction is aborted/i,
    suggestion:
      "Use pg_transaction_rollback to end the aborted transaction, or pg_transaction_rollback_to to recover to a savepoint.",
    category: ErrorCategory.QUERY,
    code: "TRANSACTION_CONFLICT",
  },

  // Connection errors
  {
    pattern: /not connected/i,
    suggestion:
      "Database connection not established. Ensure the database is configured and connected.",
    category: ErrorCategory.CONNECTION,
  },
  {
    pattern: /connection refused/i,
    suggestion:
      "PostgreSQL server is not accepting connections. Verify the host, port, and that the server is running.",
    category: ErrorCategory.CONNECTION,
  },
  {
    pattern: /too many connections/i,
    suggestion:
      "Connection limit reached. Close unused connections or increase max_connections in postgresql.conf.",
    category: ErrorCategory.CONNECTION,
  },
  {
    pattern: /connection terminated/i,
    suggestion:
      "Database connection was closed unexpectedly. This may indicate a server restart or timeout.",
    category: ErrorCategory.CONNECTION,
  },

  // Permission errors
  {
    pattern: /permission denied/i,
    suggestion:
      "Insufficient privileges. Check the user's permissions on the target database object.",
    category: ErrorCategory.PERMISSION,
  },

  // Extension errors
  {
    pattern: /extension ".*" is not available/i,
    suggestion:
      "Extension is not installed on this PostgreSQL server. Contact your database administrator.",
    category: ErrorCategory.CONFIGURATION,
  },

  // Codemode errors
  {
    pattern: /code validation failed/i,
    suggestion:
      "Check for blocked patterns: require(), process., eval(), Function(), import(). Use pg.* API instead.",
    category: ErrorCategory.VALIDATION,
  },
  {
    pattern: /rate limit exceeded/i,
    suggestion:
      "Wait before retrying. Combine multiple operations into fewer pg_execute_code calls.",
    category: ErrorCategory.PERMISSION,
  },
  {
    pattern: /execution timed out/i,
    suggestion:
      "Reduce code complexity or increase timeout (max 30s). Break into smaller operations.",
    category: ErrorCategory.QUERY,
  },
  {
    pattern: /sandbox.*not initialized/i,
    suggestion: "Internal sandbox error. Retry the operation.",
    category: ErrorCategory.INTERNAL,
  },
];

/**
 * Find a suggestion for an error message
 */
export function findSuggestion(message: string): {
  suggestion: string;
  category?: ErrorCategory | undefined;
  code?: string | undefined;
} | null {
  for (const entry of ERROR_SUGGESTIONS) {
    if (entry.pattern.test(message)) {
      return {
        suggestion: entry.suggestion,
        category: entry.category,
        code: entry.code,
      };
    }
  }
  return null;
}
