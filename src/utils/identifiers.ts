/**
 * postgres-mcp - Identifier Sanitization Utilities
 *
 * Provides safe handling of PostgreSQL identifiers (table names, column names, schema names)
 * to prevent SQL injection attacks via identifier interpolation.
 *
 * PostgreSQL identifier rules:
 * - Must start with a letter (a-z) or underscore (_)
 * - Can contain letters, digits (0-9), underscores, and dollar signs ($)
 * - Maximum length: 63 bytes (NAMEDATALEN - 1)
 * - Case-insensitive unless quoted
 */

/**
 * Regex pattern for valid PostgreSQL identifiers
 * Must start with letter or underscore, followed by letters, digits, underscores, or dollar signs
 */
const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_$]*$/;

/**
 * Maximum identifier length in PostgreSQL (NAMEDATALEN - 1)
 */
const MAX_IDENTIFIER_LENGTH = 63;

/**
 * Reserved PostgreSQL keywords that require quoting
 * This is a subset of the most commonly problematic keywords
 */
const RESERVED_KEYWORDS = new Set([
  "all",
  "analyse",
  "analyze",
  "and",
  "any",
  "array",
  "as",
  "asc",
  "asymmetric",
  "both",
  "case",
  "cast",
  "check",
  "collate",
  "column",
  "constraint",
  "create",
  "cross",
  "current_catalog",
  "current_date",
  "current_role",
  "current_schema",
  "current_time",
  "current_timestamp",
  "current_user",
  "default",
  "deferrable",
  "desc",
  "distinct",
  "do",
  "else",
  "end",
  "except",
  "false",
  "fetch",
  "for",
  "foreign",
  "from",
  "full",
  "grant",
  "group",
  "having",
  "in",
  "initially",
  "inner",
  "intersect",
  "into",
  "join",
  "lateral",
  "leading",
  "left",
  "limit",
  "localtime",
  "localtimestamp",
  "natural",
  "not",
  "null",
  "offset",
  "on",
  "only",
  "or",
  "order",
  "outer",
  "placing",
  "primary",
  "references",
  "returning",
  "right",
  "select",
  "session_user",
  "some",
  "symmetric",
  "table",
  "then",
  "to",
  "trailing",
  "true",
  "union",
  "unique",
  "user",
  "using",
  "variadic",
  "when",
  "where",
  "window",
  "with",
]);

/**
 * Error thrown when an identifier is invalid
 */
export class InvalidIdentifierError extends Error {
  constructor(
    public readonly identifier: string,
    public readonly reason: string,
  ) {
    super(`Invalid identifier "${identifier}": ${reason}`);
    this.name = "InvalidIdentifierError";
  }
}

/**
 * Validate a PostgreSQL identifier
 *
 * @param name - The identifier to validate
 * @throws InvalidIdentifierError if the identifier is invalid
 */
export function validateIdentifier(name: string): void {
  if (!name || typeof name !== "string") {
    throw new InvalidIdentifierError(
      name,
      "Identifier must be a non-empty string",
    );
  }

  if (name.length > MAX_IDENTIFIER_LENGTH) {
    throw new InvalidIdentifierError(
      name,
      `Identifier exceeds maximum length of ${String(MAX_IDENTIFIER_LENGTH)} characters`,
    );
  }

  if (!IDENTIFIER_PATTERN.test(name)) {
    // Check if user is trying to use schema.table format
    if (name.includes(".")) {
      throw new InvalidIdentifierError(
        name,
        'Schema-qualified names (schema.table) are not supported in this parameter. Use the separate "schema" parameter instead.',
      );
    }
    throw new InvalidIdentifierError(
      name,
      "Identifier contains invalid characters. Must start with a letter or underscore and contain only letters, digits, underscores, or dollar signs",
    );
  }
}

/**
 * Sanitize and quote a PostgreSQL identifier for safe use in SQL queries
 *
 * This function:
 * 1. Validates the identifier against PostgreSQL naming rules
 * 2. Escapes any embedded double quotes
 * 3. Wraps the identifier in double quotes for safe interpolation
 *
 * @param name - The identifier to sanitize
 * @returns The sanitized, double-quoted identifier
 * @throws InvalidIdentifierError if the identifier is invalid
 *
 * @example
 * sanitizeIdentifier('users') // Returns: "users"
 * sanitizeIdentifier('my_table') // Returns: "my_table"
 * sanitizeIdentifier('User"Data') // Throws: InvalidIdentifierError
 */
export function sanitizeIdentifier(name: string): string {
  validateIdentifier(name);

  // validateIdentifier() guarantees no double-quote characters can pass,
  // so the previous .replace(/"/g, '""') was always a no-op allocation.
  return `"${name}"`;
}

/**
 * Check if an identifier needs quoting (is a reserved keyword or has special characters)
 *
 * @param name - The identifier to check
 * @returns True if the identifier needs quoting
 */
export function needsQuoting(name: string): boolean {
  // Reserved keywords need quoting
  if (RESERVED_KEYWORDS.has(name.toLowerCase())) {
    return true;
  }

  // Identifiers with mixed case, starting with underscore, or containing $ need quoting for safety
  if (
    name !== name.toLowerCase() ||
    name.startsWith("_") ||
    name.includes("$")
  ) {
    return true;
  }

  return false;
}

/**
 * Sanitize a schema-qualified table name
 *
 * @param table - The table name
 * @param schema - Optional schema name (defaults to no schema prefix)
 * @returns The sanitized, fully-qualified table reference
 *
 * @example
 * sanitizeTableName('users') // Returns: "users"
 * sanitizeTableName('users', 'public') // Returns: "public"."users"
 */
export function sanitizeTableName(table: string, schema?: string): string {
  const sanitizedTable = sanitizeIdentifier(table);

  if (schema) {
    const sanitizedSchema = sanitizeIdentifier(schema);
    return `${sanitizedSchema}.${sanitizedTable}`;
  }

  return sanitizedTable;
}

/**
 * Sanitize a column reference with optional table qualifier
 *
 * @param column - The column name
 * @param table - Optional table name or alias
 * @returns The sanitized column reference
 *
 * @example
 * sanitizeColumnRef('id') // Returns: "id"
 * sanitizeColumnRef('id', 'users') // Returns: "users"."id"
 */
export function sanitizeColumnRef(column: string, table?: string): string {
  const sanitizedColumn = sanitizeIdentifier(column);

  if (table) {
    const sanitizedTable = sanitizeIdentifier(table);
    return `${sanitizedTable}.${sanitizedColumn}`;
  }

  return sanitizedColumn;
}

/**
 * Sanitize an array of identifiers
 *
 * @param names - Array of identifier names
 * @returns Array of sanitized identifiers
 */
export function sanitizeIdentifiers(names: string[]): string[] {
  return names.map(sanitizeIdentifier);
}

/**
 * Create a safe column list for SELECT statements
 *
 * @param columns - Array of column names
 * @returns Comma-separated list of sanitized column names
 *
 * @example
 * createColumnList(['id', 'name', 'email']) // Returns: "id", "name", "email"
 */
export function createColumnList(columns: string[]): string {
  return sanitizeIdentifiers(columns).join(", ");
}

/**
 * Sanitize an index name
 * PostgreSQL index names follow the same rules as identifiers
 *
 * @param name - The index name
 * @returns The sanitized index name
 */
export function sanitizeIndexName(name: string): string {
  return sanitizeIdentifier(name);
}

/**
 * Generate a safe default index name from table and column names
 *
 * @param table - The table name
 * @param columns - The column name(s)
 * @param prefix - Optional prefix (default: 'idx')
 * @returns A sanitized index name
 */
export function generateIndexName(
  table: string,
  columns: string | string[],
  prefix = "idx",
): string {
  const columnPart = Array.isArray(columns) ? columns.join("_") : columns;
  const name = `${prefix}_${table}_${columnPart}`;

  // Truncate if needed
  const truncated =
    name.length > MAX_IDENTIFIER_LENGTH
      ? name.substring(0, MAX_IDENTIFIER_LENGTH)
      : name;

  // Validate the generated name
  validateIdentifier(truncated);

  return sanitizeIdentifier(truncated);
}

/**
 * Quote an identifier for safe use in SQL without strict validation.
 *
 * Unlike sanitizeIdentifier(), this function:
 * - Allows reserved keywords (they become valid when quoted)
 * - Allows any valid PostgreSQL identifier characters
 * - Only validates basic safety (length, no dangerous characters)
 *
 * Use this for user-provided names like savepoints where reserved keywords
 * are perfectly valid PostgreSQL identifiers when properly quoted.
 *
 * @param name - The identifier to quote
 * @returns The double-quoted identifier safe for SQL interpolation
 * @throws InvalidIdentifierError if the identifier is genuinely invalid
 *
 * @example
 * quoteIdentifier('outer') // Returns: "outer" (reserved keyword, but valid)
 * quoteIdentifier('my_savepoint') // Returns: "my_savepoint"
 * quoteIdentifier('sp1') // Returns: "sp1"
 */
export function quoteIdentifier(name: string): string {
  if (!name || typeof name !== "string") {
    throw new InvalidIdentifierError(
      name,
      "Identifier must be a non-empty string",
    );
  }

  if (name.length > MAX_IDENTIFIER_LENGTH) {
    throw new InvalidIdentifierError(
      name,
      `Identifier exceeds maximum length of ${String(MAX_IDENTIFIER_LENGTH)} characters`,
    );
  }

  // Basic pattern validation - allows letters, digits, underscores, dollar signs
  // This is less strict than validateIdentifier() - allows reserved keywords
  if (!IDENTIFIER_PATTERN.test(name)) {
    // Check if user is trying to use schema.table format
    if (name.includes(".")) {
      throw new InvalidIdentifierError(
        name,
        'Schema-qualified names (schema.table) are not supported in this parameter. Use the separate "schema" parameter instead.',
      );
    }
    throw new InvalidIdentifierError(
      name,
      "Identifier contains invalid characters. Must start with a letter or underscore and contain only letters, digits, underscores, or dollar signs",
    );
  }

  // IDENTIFIER_PATTERN guarantees no double-quote characters can pass,
  // so the previous .replace(/"/g, '""') was always a no-op allocation.
  return `"${name}"`;
}
