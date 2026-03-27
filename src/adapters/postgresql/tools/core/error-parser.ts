/**
 * PostgreSQL Core Tools - Error Parser
 *
 * Maps raw PostgreSQL error codes and messages to structured,
 * high-signal error messages with actionable guidance.
 *
 * Split from error-helpers.ts for modularity.
 */

import type { ErrorContext } from "../../../../types/error-types.js";

// Re-export ErrorContext for consumers that previously imported from error-helpers
export type { ErrorContext } from "../../../../types/error-types.js";

/**
 * Parse a raw PostgreSQL error and return a structured Error with
 * actionable guidance. Non-PG errors (connection refused, auth, etc.)
 * are re-thrown unchanged to preserve their original stack trace.
 *
 * Supported PG error codes:
 * - 42P01: undefined_table (relation does not exist)
 * - 42P07: duplicate_table (relation already exists)
 * - 42P06: duplicate_schema (schema already exists)
 * - 42704: undefined_object (index/type does not exist)
 * - 42601: syntax_error (SQL syntax error)
 * - 42703: undefined_column (column does not exist)
 * - 23505: unique_violation (duplicate key value)
 * - 23503: foreign_key_violation (FK constraint violated)
 * - 3F000: invalid_schema_name (schema does not exist)
 * - 3D000: invalid_catalog_name (database does not exist)
 * - 3B001: savepoint_exception (savepoint does not exist)
 * - 25P02: in_failed_sql_transaction (transaction is aborted)
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

  // Idempotency guard: if the error has a `cause` but no PG error code,
  // it was already processed by a prior parsePostgresError call (e.g., in the
  // adapter layer). Re-throw unchanged to prevent double-processing, which
  // can produce misleading messages (e.g., "Object 'unknown' not found"
  // instead of "Savepoint 'X' does not exist").
  if (error.cause !== undefined && !pgCode) {
    throw error;
  }

  const msg = error.message;

  // 42P01 — relation does not exist (table, view, sequence)
  // Regex anchored: must NOT be preceded by "of " (which indicates 42703 column errors)
  if (
    pgCode === "42P01" ||
    (/(?:relation|view|sequence|materialized view) ".*" does not exist/i.test(msg) && !/of relation/i.test(msg))
  ) {
    // pg_reindex with target=index: index-specific message
    if (context.tool === "pg_reindex" && context.target === "index") {
      const match = /(?:relation|view|sequence|materialized view) "([^"]+)"/i.exec(msg);
      const indexName = match?.[1] ?? context.index ?? "unknown";
      throw new Error(
        `Index '${indexName}' not found. Use pg_get_indexes to see available indexes.`,
        { cause: error },
      );
    }

    const match = /(?:relation|view|sequence|materialized view) "([^"]+)"/i.exec(msg);
    const objectName = match?.[1] ?? context.table ?? "unknown";
    
    let entityTypeStr = "Table or view";
    if (context.objectType === "sequence" || /sequence/i.test(msg)) {
      entityTypeStr = "Sequence";
    }

    throw new Error(
      `${entityTypeStr} '${objectName}' not found. Use pg_list_tables to see available tables.`,
      { cause: error },
    );
  }

  // 42P06 — duplicate schema (schema already exists)
  // Note: also checks message text because the adapter wraps PG errors
  // in QueryError (code: "QUERY_ERROR"), stripping the original PG code.
  if (pgCode === "42P06" || /schema ".*" already exists/i.test(msg)) {
    const match = /schema "([^"]+)"/i.exec(msg);
    const objectName = match?.[1] ?? context.schema ?? "unknown";
    throw new Error(
      `Schema '${objectName}' already exists. Use ifNotExists: true to skip if it exists.`,
      { cause: error },
    );
  }

  // 42P07 — duplicate relation (table, index, sequence, or view already exists)
  if (pgCode === "42P07" || /already exists/i.test(msg)) {
    const match = /relation "([^"]+)"/i.exec(msg);
    const objectName =
      match?.[1] ?? context.index ?? context.table ?? "unknown";

    // Distinguish index vs table context
    if (
      context.tool === "pg_create_index" ||
      context.tool === "pg_vector_create_index" ||
      /index/i.test(msg) ||
      context.index ||
      /^idx_/i.test(objectName)
    ) {
      throw new Error(
        `Index '${objectName}' already exists. Use ifNotExists: true to skip if it exists.`,
        { cause: error },
      );
    }

    // Sequence-specific message
    if (context.objectType === "sequence") {
      throw new Error(
        `Sequence '${objectName}' already exists. Use ifNotExists: true to skip if it exists.`,
        { cause: error },
      );
    }

    // View-specific message
    if (context.objectType === "view") {
      throw new Error(
        `View '${objectName}' already exists. Use orReplace: true to replace it.`,
        { cause: error },
      );
    }

    throw new Error(
      `Table '${objectName}' already exists. Use ifNotExists: true to skip if it exists.`,
      { cause: error },
    );
  }

  // 42601 — syntax error in SQL statement
  if (pgCode === "42601" || /syntax error/i.test(msg)) {
    throw new Error(`SQL syntax error: ${msg}. Verify your SQL is valid.`, {
      cause: error,
    });
  }

  // 42703 — undefined column (checked before 42704 whose broad regex would match)
  if (
    pgCode === "42703" ||
    /column ".*" (?:of relation .+)?does not exist/i.test(msg)
  ) {
    throw new Error(
      `Column not found: ${msg}. Use pg_describe_table to see available columns.`,
      { cause: error },
    );
  }

  // Sub-partitioning PK constraint (42P16 — unique constraint must include all partitioning columns)
  // MUST be checked before the generic 23505 unique constraint handler below,
  // because this message also contains "unique constraint" text.
  if (
    /unique constraint on partitioned table must include all partitioning columns/i.test(
      msg,
    )
  ) {
    throw new Error(
      `Primary key on partitioned table must include all partitioning columns. The sub-partition key column must be part of the parent table's primary key. Recreate the parent with a composite primary key that includes both the partition key and sub-partition key.`,
      { cause: error },
    );
  }

  // 23503 — foreign key constraint violation
  if (pgCode === "23503" || /violates foreign key constraint/i.test(msg)) {
    throw new Error(
      `Foreign key constraint violated: ${msg}. Verify the referenced row exists in the parent table.`,
      { cause: error },
    );
  }

  // 23505 — unique constraint violation (duplicate key)
  if (
    pgCode === "23505" ||
    /unique constraint/i.test(msg) ||
    /duplicate key/i.test(msg)
  ) {
    throw new Error(
      `Unique constraint violated: ${msg}. Use pg_upsert for insert-or-update behavior.`,
      { cause: error },
    );
  }

  // 3B001 — savepoint does not exist (checked before 42704 whose broad regex would match)
  if (pgCode === "3B001" || /savepoint ".*" does not exist/i.test(msg)) {
    const match = /savepoint "([^"]+)"/i.exec(msg);
    const spName = match?.[1] ?? "unknown";
    throw new Error(
      `Savepoint '${spName}' does not exist in this transaction. Use pg_transaction_savepoint to create it first.`,
      { cause: error },
    );
  }

  // 25P02 — current transaction is aborted (checked before 42704 whose broad regex would match)
  if (pgCode === "25P02" || /current transaction is aborted/i.test(msg)) {
    throw new Error(
      "Transaction is in an aborted state — only ROLLBACK or ROLLBACK TO SAVEPOINT commands are allowed. " +
        "A previous statement in this transaction failed, putting it into an error state. " +
        "Use pg_transaction_rollback to end it, or pg_transaction_rollback_to to recover to a savepoint.",
      { cause: error },
    );
  }

  // Unrecognized configuration parameter (pg_set_config)
  // Standalone check: adapter wraps PG errors with code "QUERY_ERROR",
  // so this won't enter the 42704 block — must match on message text.
  if (/unrecognized configuration parameter/i.test(msg)) {
    const paramMatch = /parameter "([^"]+)"/i.exec(msg);
    const paramName = paramMatch?.[1] ?? "unknown";
    throw new Error(
      `Unrecognized configuration parameter '${paramName}'. Use pg_show_settings to see available parameters.`,
      { cause: error },
    );
  }

  // pg_cron: "could not find valid entry for job" (unschedule nonexistent job)
  if (/could not find valid entry for job/i.test(msg)) {
    const jobMatch = /for job\s+'?"?([^'"]+)'?"?/i.exec(msg);
    const jobIdentifier = jobMatch?.[1] ?? context.target ?? "unknown";
    throw new Error(
      `Job '${jobIdentifier}' not found. Use pg_cron_list_jobs to see available jobs.`,
      { cause: error },
    );
  }

  // pg_cron: "invalid schedule" (invalid cron syntax passed to pg_cron)
  if (/invalid schedule:/i.test(msg)) {
    throw new Error(
      `Invalid cron schedule. Use standard cron syntax (e.g., "0 2 * * *") or interval syntax ("1-59 seconds").`,
      { cause: error },
    );
  }

  // 3D000 — invalid catalog name (database does not exist)
  if (pgCode === "3D000" || /database ".*" does not exist/i.test(msg)) {
    const match = /database "([^"]+)"/i.exec(msg);
    const dbName = match?.[1] ?? "unknown";
    throw new Error(
      `Database '${dbName}' does not exist. Verify the database name or omit the parameter to use the current database.`,
      { cause: error },
    );
  }

  // 42704 — undefined object (index, type, etc.)
  if (pgCode === "42704" || /does not exist/i.test(msg)) {
    // Schema-specific: "schema X does not exist" (e.g., CREATE TABLE in nonexistent schema)
    if (/schema ["'].*["'] does not exist/i.test(msg)) {
      const schemaMatch = /schema ["']([^"']+)["']/i.exec(msg);
      const schemaName = schemaMatch?.[1] ?? context.schema ?? "unknown";
      throw new Error(
        `Schema '${schemaName}' does not exist. Create it with pg_create_schema or use pg_list_schemas to see available schemas.`,
        { cause: error },
      );
    }

    // pg_cluster: index-not-found — omit ifExists (not a valid cluster param)
    if (
      context.tool === "pg_cluster" &&
      (/index/i.test(msg) || context.index)
    ) {
      const match = /index "([^"]+)"/i.exec(msg);
      const indexName = match?.[1] ?? context.index ?? "unknown";
      throw new Error(
        `Index '${indexName}' not found. Use pg_get_indexes to see available indexes.`,
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

    // Function not found with tsvector argument — column is already tsvector type
    if (/function .*tsvector.* does not exist/i.test(msg)) {
      throw new Error(
        `Column appears to be a tsvector type, which cannot be used directly with text search tools. ` +
          `Use a text column instead, or query the tsvector column directly with raw SQL (pg_read_query).`,
        { cause: error },
      );
    }

    // pg_cron tool context guard — provide cron-appropriate messages
    // instead of the misleading generic "Object 'X' not found"
    if (context.tool?.startsWith("pg_cron_")) {
      if (context.tool === "pg_cron_alter_job") {
        const jobId = context.target ?? "unknown";
        throw new Error(
          `Job ${jobId} not found. Use pg_cron_list_jobs to see available jobs.`,
          { cause: error },
        );
      }
      if (context.tool === "pg_cron_schedule_in_database") {
        const dbMatch = /database "([^"]+)"/i.exec(msg);
        const dbName = dbMatch?.[1] ?? context.target ?? "unknown";
        throw new Error(
          `Database '${dbName}' not found or not accessible for cron scheduling. Verify the database name exists.`,
          { cause: error },
        );
      }
      // Generic cron fallback
      throw new Error(
        `Cron operation failed: ${msg}. Use pg_cron_list_jobs to verify job state.`,
        { cause: error },
      );
    }

    // Generic "does not exist" fallback
    const match =
      /(?:table|relation|object) ["']([^"']+)["']/i.exec(msg) ??
      /["']([^"']+)["'] does not exist/i.exec(msg);
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

  // Overlapping partition bounds (RANGE overlap or conflicting LIST values)
  if (
    /conflicting values for partition/i.test(msg) ||
    /would overlap partition/i.test(msg)
  ) {
    throw new Error(
      `Partition bounds overlap with an existing partition. Use pg_list_partitions to see current partition bounds.`,
      { cause: error },
    );
  }

  // Already-attached partition (attempting to attach a table that is already a partition)
  if (/is already a partition/i.test(msg)) {
    const match = /"([^"]+)" is already a partition/i.exec(msg);
    const tableName = match?.[1] ?? context.table ?? "unknown";
    throw new Error(
      `Table '${tableName}' is already a partition. Use pg_list_partitions to see current partitions, or pg_detach_partition to detach it first.`,
      { cause: error },
    );
  }

  // XX000 — invalid geometry (PostGIS WKT/GeoJSON parse failure)
  if (/parse error - invalid geometry/i.test(msg)) {
    throw new Error(
      `Invalid geometry input. Use WKT format (e.g., 'POINT(-74 40)', 'POLYGON((...))') or GeoJSON format (e.g., '{"type":"Point","coordinates":[-74,40]}').`,
      { cause: error },
    );
  }

  // Unrecognized PG error — re-throw with cause preserved
  throw error;
}
