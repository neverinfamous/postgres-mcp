/**
 * PostgreSQL Core Tools - Error Helpers
 *
 * Shared helper for mapping raw PostgreSQL exceptions to structured,
 * high-signal error messages with actionable guidance.
 */

/**
 * Context about the operation that triggered the error.
 */
interface ErrorContext {
  tool: string;
  sql?: string;
  table?: string;
  index?: string;
  schema?: string;
}

/**
 * Parse a raw PostgreSQL error and return a structured Error with
 * actionable guidance. Non-PG errors (connection refused, auth, etc.)
 * are re-thrown unchanged to preserve their original stack trace.
 *
 * Supported PG error codes:
 * - 42P01: undefined_table (relation does not exist)
 * - 42P07: duplicate_table (relation already exists)
 * - 42704: undefined_object (index/type does not exist)
 * - 3F000: invalid_schema_name (schema does not exist)
 */
export function parsePostgresError(
  error: unknown,
  context: ErrorContext,
): Error {
  if (!(error instanceof Error)) {
    throw error;
  }

  const pgCode = (error as unknown as Record<string, unknown>)["code"] as
    | string
    | undefined;
  const msg = error.message;

  // 42P01 — relation does not exist (table, view, sequence)
  if (pgCode === "42P01" || /relation ".*" does not exist/i.test(msg)) {
    const match = /relation "([^"]+)"/i.exec(msg);
    const objectName = match?.[1] ?? context.table ?? "unknown";
    throw new Error(
      `Table or view '${objectName}' not found. Use pg_list_tables to see available tables.`,
      { cause: error },
    );
  }

  // 42P07 — duplicate relation (table or index already exists)
  if (pgCode === "42P07" || /already exists/i.test(msg)) {
    const match = /relation "([^"]+)"/i.exec(msg);
    const objectName =
      match?.[1] ?? context.index ?? context.table ?? "unknown";

    // Distinguish index vs table context
    if (
      context.tool === "pg_create_index" ||
      /index/i.test(msg) ||
      context.index
    ) {
      throw new Error(
        `Index '${objectName}' already exists. Use ifNotExists: true to skip if it exists.`,
        { cause: error },
      );
    }

    throw new Error(
      `Table '${objectName}' already exists. Use ifNotExists: true to skip if it exists.`,
      { cause: error },
    );
  }

  // 42704 — undefined object (index, type, etc.)
  if (pgCode === "42704" || /does not exist/i.test(msg)) {
    // Schema-specific: "schema X does not exist" (e.g., CREATE TABLE in nonexistent schema)
    if (/schema ".*" does not exist/i.test(msg)) {
      const schemaMatch = /schema "([^"]+)"/i.exec(msg);
      const schemaName = schemaMatch?.[1] ?? context.schema ?? "unknown";
      throw new Error(
        `Schema '${schemaName}' does not exist. Create it with pg_create_schema or use pg_list_schemas to see available schemas.`,
        { cause: error },
      );
    }

    if (
      context.tool === "pg_drop_index" ||
      /index/i.test(msg) ||
      context.index
    ) {
      const match = /index "([^"]+)"/i.exec(msg);
      const indexName = match?.[1] ?? context.index ?? "unknown";
      throw new Error(
        `Index '${indexName}' not found. Use ifExists: true to avoid this error, or pg_get_indexes to see available indexes.`,
        { cause: error },
      );
    }

    // Table-specific fallback for pg_drop_table
    if (context.tool === "pg_drop_table") {
      const objectName = context.table ?? "unknown";
      throw new Error(
        `Table '${context.schema ?? "public"}.${objectName}' not found. Use ifExists: true to avoid this error, or pg_list_tables to verify.`,
        { cause: error },
      );
    }

    // Generic "does not exist" fallback
    const match =
      /(?:table|relation) "([^"]+)"/i.exec(msg) ??
      /"([^"]+)" does not exist/i.exec(msg);
    const objectName = match?.[1] ?? context.table ?? "unknown";
    throw new Error(
      `Object '${objectName}' not found. Use ifExists: true to avoid this error.`,
      { cause: error },
    );
  }

  // 3F000 — invalid schema name
  if (pgCode === "3F000" || /schema ".*" does not exist/i.test(msg)) {
    const match = /schema "([^"]+)"/i.exec(msg);
    const schemaName = match?.[1] ?? context.schema ?? "unknown";
    throw new Error(
      `Schema '${schemaName}' does not exist. Use pg_list_objects with type 'table' to see available schemas.`,
      { cause: error },
    );
  }

  // Unrecognized PG error — re-throw with cause preserved
  throw error;
}
