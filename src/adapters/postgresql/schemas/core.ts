/**
 * postgres-mcp - Core Tool Schemas
 *
 * Input validation schemas for core database operations.
 */

import { z } from "zod";

// Helper to handle undefined params (allows tools to be called without {})
const defaultToEmpty = (val: unknown): unknown => val ?? {};

// =============================================================================
// Query Schemas
// =============================================================================

// MCP visibility schema - sql OR query required (both optional in schema, refine enforces)
export const ReadQuerySchemaBase = z.object({
  sql: z.string().optional().describe("SELECT query to execute"),
  query: z.string().optional().describe("Alias for sql"),
  params: z
    .array(z.unknown())
    .optional()
    .describe("Query parameters ($1, $2, etc.)"),
  transactionId: z
    .string()
    .optional()
    .describe("Transaction ID to execute within (from pg_transaction_begin)"),
  txId: z.string().optional().describe("Alias for transactionId"),
  tx: z.string().optional().describe("Alias for transactionId"),
});

// Internal parsing schema - sql optional for alias resolution
const ReadQueryParseSchema = z.object({
  sql: z.string().optional().describe("SELECT query to execute"),
  query: z.string().optional().describe("Alias for sql"),
  params: z
    .array(z.unknown())
    .optional()
    .describe("Query parameters ($1, $2, etc.)"),
  transactionId: z
    .string()
    .optional()
    .describe("Transaction ID to execute within (from pg_transaction_begin)"),
  txId: z.string().optional().describe("Alias for transactionId"),
  tx: z.string().optional().describe("Alias for transactionId"),
});

// Transformed schema with alias resolution (for handler parsing)
export const ReadQuerySchema = ReadQueryParseSchema.transform((data) => ({
  sql: data.sql ?? data.query ?? "",
  params: data.params,
  transactionId: data.transactionId ?? data.txId ?? data.tx,
})).refine((data) => data.sql !== "", {
  message: "sql (or query alias) is required",
});

// MCP visibility schema - sql OR query required (both optional in schema, refine enforces)
export const WriteQuerySchemaBase = z.object({
  sql: z.string().optional().describe("INSERT/UPDATE/DELETE query to execute"),
  query: z.string().optional().describe("Alias for sql"),
  params: z
    .array(z.unknown())
    .optional()
    .describe("Query parameters ($1, $2, etc.)"),
  transactionId: z
    .string()
    .optional()
    .describe("Transaction ID to execute within (from pg_transaction_begin)"),
  txId: z.string().optional().describe("Alias for transactionId"),
  tx: z.string().optional().describe("Alias for transactionId"),
});

// Internal parsing schema - sql optional for alias resolution
const WriteQueryParseSchema = z.object({
  sql: z.string().optional().describe("INSERT/UPDATE/DELETE query to execute"),
  query: z.string().optional().describe("Alias for sql"),
  params: z
    .array(z.unknown())
    .optional()
    .describe("Query parameters ($1, $2, etc.)"),
  transactionId: z
    .string()
    .optional()
    .describe("Transaction ID to execute within (from pg_transaction_begin)"),
  txId: z.string().optional().describe("Alias for transactionId"),
  tx: z.string().optional().describe("Alias for transactionId"),
});

// Transformed schema with alias resolution (for handler parsing)
export const WriteQuerySchema = WriteQueryParseSchema.transform((data) => ({
  sql: data.sql ?? data.query ?? "",
  params: data.params,
  transactionId: data.transactionId ?? data.txId ?? data.tx,
})).refine((data) => data.sql !== "", {
  message: "sql (or query alias) is required",
});

// =============================================================================
// Table Schemas
// =============================================================================

/**
 * Preprocess table parameters:
 * - Alias: tableName/name → table
 * - Parse schema.table format (e.g., 'public.users' → schema: 'public', table: 'users')
 */
function preprocessTableParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const result = { ...(input as Record<string, unknown>) };

  // Alias: tableName/name → table
  if (result["table"] === undefined) {
    if (result["tableName"] !== undefined)
      result["table"] = result["tableName"];
    else if (result["name"] !== undefined) result["table"] = result["name"];
  }

  // Parse schema.table format
  if (
    typeof result["table"] === "string" &&
    result["table"].includes(".") &&
    result["schema"] === undefined
  ) {
    const parts = result["table"].split(".");
    if (parts.length === 2) {
      result["schema"] = parts[0];
      result["table"] = parts[1];
    }
  }

  return result;
}

// Base schema for MCP visibility - exported for inputSchema (Split Schema pattern)
export const ListTablesSchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Schema name (default: all user schemas)"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of tables to return (default: 100)"),
  exclude: z
    .array(z.string())
    .optional()
    .describe(
      "Schema/extension names to exclude (e.g., ['cron', 'topology', 'partman']). Filters by schema name.",
    ),
});

// Full schema with preprocess for handler parsing (handles undefined params)
export const ListTablesSchema = z.preprocess(
  defaultToEmpty,
  ListTablesSchemaBase,
);

// MCP visibility schema - table OR tableName/name required (all optional in schema, refine enforces)
export const DescribeTableSchemaBase = z.object({
  table: z
    .string()
    .optional()
    .describe("Table name (supports schema.table format)"),
  tableName: z.string().optional().describe("Alias for table"),
  name: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

// Internal parsing schema - table optional for alias resolution
const DescribeTableParseSchema = z.object({
  table: z
    .string()
    .optional()
    .describe("Table name (supports schema.table format)"),
  tableName: z.string().optional().describe("Alias for table"),
  name: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

// Transformed schema with alias resolution and schema.table parsing
export const DescribeTableSchema = z
  .preprocess(preprocessTableParams, DescribeTableParseSchema)
  .transform((data) => ({
    table: data.table ?? data.tableName ?? data.name ?? "",
    schema: data.schema,
  }))
  .refine((data) => data.table !== "", {
    message:
      'table (or tableName/name alias) is required. Usage: pg_describe_table({ table: "users" }) or pg_describe_table({ table: "public.users" })',
  });

// Base schema for MCP visibility - exported for inputSchema
export const CreateTableSchemaBase = z.object({
  table: z
    .string()
    .optional()
    .describe("Table name (supports schema.table format)"),
  tableName: z.string().optional().describe("Alias for table"),
  name: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  columns: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        nullable: z
          .boolean()
          .optional()
          .describe("Allow NULL values (default: true)"),
        notNull: z
          .boolean()
          .optional()
          .describe("Alias: notNull=true ≡ nullable=false"),
        primaryKey: z.boolean().optional(),
        unique: z.boolean().optional(),
        default: z
          .union([z.string(), z.number(), z.boolean()])
          .optional()
          .describe(
            "Default value (raw SQL expression). Numbers/booleans auto-coerced to string.",
          ),
        defaultValue: z
          .union([z.string(), z.number(), z.boolean()])
          .optional()
          .describe(
            "Alias for default. Numbers/booleans auto-coerced to string.",
          ),
        check: z.string().optional().describe("CHECK constraint expression"),
        // Support both object {table, column} and string 'table(column)' syntax
        references: z
          .union([
            z.object({
              table: z.string(),
              column: z.string(),
              onDelete: z.string().optional(),
              onUpdate: z.string().optional(),
            }),
            z.string().describe('String syntax: "table(column)"'),
          ])
          .optional()
          .describe(
            'Foreign key reference: {table, column} or "table(column)"',
          ),
      }),
    )
    .describe("Column definitions"),
  primaryKey: z
    .array(z.string())
    .optional()
    .describe(
      "Composite primary key columns (alternative to column-level primaryKey: true)",
    ),
  constraints: z
    .array(
      z.object({
        name: z.string().optional().describe("Constraint name"),
        type: z.enum(["check", "unique"]).describe("Constraint type"),
        expression: z
          .string()
          .optional()
          .describe("CHECK expression or columns for UNIQUE"),
        columns: z
          .array(z.string())
          .optional()
          .describe("Columns for UNIQUE constraint"),
      }),
    )
    .optional()
    .describe("Table-level constraints (CHECK, UNIQUE)"),
  ifNotExists: z.boolean().optional().describe("Use IF NOT EXISTS"),
});

/**
 * Preprocess create table params for schema.table parsing
 */
function preprocessCreateTableParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const result = { ...(input as Record<string, unknown>) };

  // Get table name from table, tableName, or name aliases
  const tableName = result["table"] ?? result["tableName"] ?? result["name"];

  // Parse schema.table format if schema not explicitly provided
  if (
    typeof tableName === "string" &&
    tableName.includes(".") &&
    result["schema"] === undefined
  ) {
    const parts = tableName.split(".");
    if (parts.length === 2) {
      result["schema"] = parts[0];
      // Update the correct field based on which was provided
      if (result["table"] !== undefined) {
        result["table"] = parts[1];
      } else if (result["tableName"] !== undefined) {
        result["tableName"] = parts[1];
      } else {
        result["name"] = parts[1];
      }
    }
  }

  return result;
}

/**
 * Parse string foreign key reference syntax: "table(column)" or "schema.table(column)"
 */
function parseStringReference(
  ref: string,
): { table: string; column: string } | undefined {
  // Match patterns like "users(id)" or "public.users(id)"
  const regex = /^([a-zA-Z_][a-zA-Z0-9_.]*)\(([a-zA-Z_][a-zA-Z0-9_]*)\)$/;
  const match = regex.exec(ref);
  if (match?.[1] !== undefined && match[2] !== undefined) {
    return { table: match[1], column: match[2] };
  }
  return undefined;
}

// Transformed schema with alias resolution and preprocessing
export const CreateTableSchema = z
  .preprocess(preprocessCreateTableParams, CreateTableSchemaBase)
  .transform((data) => ({
    name: data.table ?? data.tableName ?? data.name ?? "",
    schema: data.schema,
    columns: data.columns.map((col) => {
      // Parse string references like 'users(id)' → {table: 'users', column: 'id'}
      type RefType =
        | {
            table: string;
            column: string;
            onDelete?: string;
            onUpdate?: string;
          }
        | undefined;
      let references: RefType = undefined;

      if (typeof col.references === "string") {
        const parsed = parseStringReference(col.references);
        if (!parsed) {
          throw new Error(
            `Invalid references format: '${col.references}'. ` +
              `Use object syntax {table: 'name', column: 'col'} or string syntax 'table(column)'.`,
          );
        }
        references = parsed;
      } else if (col.references !== undefined) {
        // Explicitly cast to preserve the object structure
        references = col.references as RefType;
      }

      // Auto-coerce numbers/booleans to strings for defaultValue
      const rawDefault = col.default ?? col.defaultValue;
      let defaultValue: string | undefined;
      if (rawDefault !== undefined && rawDefault !== null) {
        defaultValue =
          typeof rawDefault === "string" ? rawDefault : String(rawDefault);

        // Auto-convert common function shortcuts to valid SQL expressions
        // e.g., now() → CURRENT_TIMESTAMP (PostgreSQL rejects now() as column reference)
        const functionConversions: Record<string, string> = {
          "now()": "CURRENT_TIMESTAMP",
          "current_date()": "CURRENT_DATE",
          "current_time()": "CURRENT_TIME",
          "current_timestamp()": "CURRENT_TIMESTAMP",
        };
        const lowerDefault = defaultValue.toLowerCase().trim();
        if (functionConversions[lowerDefault]) {
          defaultValue = functionConversions[lowerDefault];
        } else if (typeof rawDefault === "string") {
          // Auto-quote string literals that are not SQL expressions
          // Detect SQL expressions by checking for:
          // - Already quoted (starts with ')
          // - Function calls (contains parentheses)
          // - SQL keywords (CURRENT_*, NULL, TRUE, FALSE, etc.)
          // - Type casts (contains ::)
          // - Numeric values
          // - Operators or complex expressions
          const trimmed = defaultValue.trim();
          const isAlreadyQuoted =
            trimmed.startsWith("'") && trimmed.endsWith("'");
          const isSqlExpression =
            /^[0-9.\-+eE]+$/.test(trimmed) || // Numeric
            /\(.*\)/.test(trimmed) || // Function call
            trimmed.includes("::") || // Type cast
            /^(NULL|TRUE|FALSE|CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME|CURRENT_USER|SESSION_USER|LOCALTIME|LOCALTIMESTAMP)$/i.test(
              trimmed,
            ) || // SQL keywords
            /^nextval\s*\(/i.test(trimmed) || // nextval function
            /^(gen_random_uuid|uuid_generate_v[1-4])\s*\(/i.test(trimmed); // UUID functions

          if (!isAlreadyQuoted && !isSqlExpression) {
            // Quote the string literal, escaping any internal single quotes
            defaultValue = `'${trimmed.replace(/'/g, "''")}'`;
          }
        }
      }

      return {
        name: col.name,
        type: col.type,
        // Support notNull: notNull=true → nullable=false
        nullable: col.nullable ?? (col.notNull === true ? false : undefined),
        primaryKey: col.primaryKey,
        unique: col.unique,
        // Support defaultValue alias with auto-coercion
        default: defaultValue,
        check: col.check,
        references,
      };
    }),
    primaryKey: data.primaryKey,
    constraints: data.constraints,
    ifNotExists: data.ifNotExists,
  }))
  .refine((data) => data.name !== "", {
    message: "name (or table alias) is required",
  })
  .refine((data) => data.columns.length > 0, {
    message: "columns must not be empty",
  });

// Base schema for MCP visibility - exported for inputSchema
export const DropTableSchemaBase = z.object({
  table: z
    .string()
    .optional()
    .describe("Table name (supports schema.table format)"),
  tableName: z.string().optional().describe("Alias for table"),
  name: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  ifExists: z.boolean().optional().describe("Use IF EXISTS"),
  cascade: z.boolean().optional().describe("Use CASCADE"),
});

// Transformed schema with alias resolution and schema.table parsing
export const DropTableSchema = z
  .preprocess(preprocessTableParams, DropTableSchemaBase)
  .transform((data) => ({
    table: data.table ?? data.tableName ?? data.name ?? "",
    schema: data.schema,
    ifExists: data.ifExists,
    cascade: data.cascade,
  }))
  .refine((data) => data.table !== "", {
    message: "table (or tableName/name alias) is required",
  });

// =============================================================================
// Index Schemas
// =============================================================================

// Base schema for MCP visibility - exported for inputSchema (Split Schema pattern)
export const GetIndexesSchemaBase = z.object({
  table: z
    .string()
    .optional()
    .describe(
      "Table name (supports schema.table format). Omit to list all indexes.",
    ),
  tableName: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  limit: z
    .number()
    .optional()
    .describe(
      "Maximum indexes to return (default: 100 when no table specified)",
    ),
});

// Transformed schema with alias resolution and schema.table parsing
// Note: table is now optional - when omitted, lists all indexes in database
export const GetIndexesSchema = z
  .preprocess((val: unknown) => {
    // First apply default empty object, then preprocess table params
    const result = preprocessTableParams(val ?? {});
    return result;
  }, GetIndexesSchemaBase)
  .transform((data) => ({
    table: data.table ?? data.tableName,
    schema: data.schema,
    limit: data.limit,
  }));

/**
 * Preprocess create index params:
 * - Alias: tableName → table
 * - Parse schema.table format (e.g., 'public.users' → schema: 'public', table: 'users')
 * - Parse JSON-encoded columns array
 * - Handle single column string → array
 */
function preprocessCreateIndexParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const result = { ...(input as Record<string, unknown>) };

  // Alias: tableName → table
  if (result["table"] === undefined && result["tableName"] !== undefined) {
    result["table"] = result["tableName"];
  }

  // Parse schema.table format
  if (
    typeof result["table"] === "string" &&
    result["table"].includes(".") &&
    result["schema"] === undefined
  ) {
    const parts = result["table"].split(".");
    if (parts.length === 2) {
      result["schema"] = parts[0];
      result["table"] = parts[1];
    }
  }

  // Parse JSON-encoded columns array
  if (typeof result["columns"] === "string") {
    try {
      const parsed: unknown = JSON.parse(result["columns"]);
      if (
        Array.isArray(parsed) &&
        parsed.every((item): item is string => typeof item === "string")
      ) {
        result["columns"] = parsed;
      }
    } catch {
      // Not JSON, might be single column - let schema handle it
    }
  }

  // Support 'method' as alias for 'type' (common terminology)
  if (result["method"] !== undefined && result["type"] === undefined) {
    result["type"] = result["method"];
  }

  // Normalize type to lowercase
  if (typeof result["type"] === "string") {
    result["type"] = result["type"].toLowerCase();
  }

  return result;
}

// Base schema for MCP visibility - exported for inputSchema
export const CreateIndexSchemaBase = z.object({
  table: z
    .string()
    .optional()
    .describe("Table name (supports schema.table format)"),
  tableName: z.string().optional().describe("Alias for table"),
  name: z.string().optional().describe("Index name"),
  indexName: z.string().optional().describe("Alias for name"),
  index: z.string().optional().describe("Alias for name"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  columns: z.array(z.string()).optional().describe("Columns to index"),
  column: z
    .string()
    .optional()
    .describe("Single column (auto-wrapped to array)"),
  unique: z.boolean().optional().describe("Create a unique index"),
  type: z
    .enum(["btree", "hash", "gist", "gin", "spgist", "brin"])
    .optional()
    .describe("Index type"),
  method: z
    .enum(["btree", "hash", "gist", "gin", "spgist", "brin"])
    .optional()
    .describe("Alias for type"),
  where: z.string().optional().describe("Partial index condition"),
  concurrently: z.boolean().optional().describe("Create index concurrently"),
  ifNotExists: z
    .boolean()
    .optional()
    .describe("Use IF NOT EXISTS (silently succeeds if index exists)"),
});

// Transformed schema with alias resolution and preprocessing
export const CreateIndexSchema = z
  .preprocess(preprocessCreateIndexParams, CreateIndexSchemaBase)
  .transform((data) => {
    // Resolve table from aliases: table, tableName
    const table = data.table ?? data.tableName ?? "";

    // Handle column → columns smoothing (wrap string in array)
    const columns = data.columns ?? (data.column ? [data.column] : []);

    // Resolve index name from all aliases: name, indexName, index
    let name = data.name ?? data.indexName ?? data.index ?? "";

    // Auto-generate index name if not provided: idx_{table}_{columns}
    if (name === "" && table !== "" && columns.length > 0) {
      name = `idx_${table}_${columns.join("_")}`;
    }

    return {
      name,
      table,
      schema: data.schema,
      columns,
      unique: data.unique,
      type: data.type,
      where: data.where,
      concurrently: data.concurrently,
      ifNotExists: data.ifNotExists,
    };
  })
  .refine((data) => data.table !== "", {
    message: "table (or tableName alias) is required",
  })
  .refine((data) => data.name !== "", {
    message:
      "name (or indexName/index alias) is required (or provide table and columns to auto-generate)",
  })
  .refine((data) => data.columns.length > 0, {
    message: "columns (or column alias) is required",
  });

// =============================================================================
// Transaction Schemas
// =============================================================================

/**
 * Preprocess transaction begin params:
 * - Normalize isolationLevel case (serializable → SERIALIZABLE)
 * - Handle shorthand forms (ru → READ UNCOMMITTED, etc.)
 */
function preprocessBeginParams(input: unknown): unknown {
  const normalized = defaultToEmpty(input) as Record<string, unknown>;
  if (typeof normalized["isolationLevel"] === "string") {
    const level = normalized["isolationLevel"].toUpperCase().trim();
    // Map shorthands
    const levelMap: Record<string, string> = {
      RU: "READ UNCOMMITTED",
      RC: "READ COMMITTED",
      RR: "REPEATABLE READ",
      S: "SERIALIZABLE",
      READUNCOMMITTED: "READ UNCOMMITTED",
      READCOMMITTED: "READ COMMITTED",
      REPEATABLEREAD: "REPEATABLE READ",
    };
    normalized["isolationLevel"] = levelMap[level.replace(/\s+/g, "")] ?? level;
  }
  return normalized;
}

export const BeginTransactionSchemaBase = z.object({
  isolationLevel: z
    .enum([
      "READ UNCOMMITTED",
      "READ COMMITTED",
      "REPEATABLE READ",
      "SERIALIZABLE",
    ])
    .optional()
    .describe("Transaction isolation level"),
});

export const BeginTransactionSchema = z.preprocess(
  preprocessBeginParams,
  BeginTransactionSchemaBase,
);

// Base schema for MCP visibility (shows transactionId and aliases)
export const TransactionIdSchemaBase = z.object({
  transactionId: z
    .string()
    .optional()
    .describe("Transaction ID from pg_transaction_begin"),
  txId: z.string().optional().describe("Alias for transactionId"),
  tx: z.string().optional().describe("Alias for transactionId"),
});

// Transformed schema with alias resolution and undefined handling
export const TransactionIdSchema = z
  .preprocess(defaultToEmpty, TransactionIdSchemaBase)
  .transform((data) => ({
    transactionId: data.transactionId ?? data.txId ?? data.tx ?? "",
  }))
  .refine((data) => data.transactionId !== "", {
    message:
      'transactionId is required. Get one from pg_transaction_begin first, then pass {transactionId: "..."}',
  });

// Base schema for MCP visibility
export const SavepointSchemaBase = z.object({
  transactionId: z.string().optional().describe("Transaction ID"),
  txId: z.string().optional().describe("Alias for transactionId"),
  tx: z.string().optional().describe("Alias for transactionId"),
  name: z.string().optional().describe("Savepoint name"),
  savepoint: z.string().optional().describe("Alias for name"),
});

// Transformed schema with alias resolution and undefined handling
export const SavepointSchema = z
  .preprocess(defaultToEmpty, SavepointSchemaBase)
  .transform((data) => ({
    transactionId: data.transactionId ?? data.txId ?? data.tx ?? "",
    name: data.name ?? data.savepoint ?? "",
  }))
  .refine((data) => data.transactionId !== "" && data.name !== "", {
    message:
      'Both transactionId and name are required. Example: {transactionId: "...", name: "sp1"}',
  })
  .refine(
    (data) => data.name === "" || /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(data.name),
    {
      message:
        "Savepoint name must be a valid SQL identifier (letters, numbers, underscores only)",
    },
  );

// Base schema for MCP visibility
const ExecuteInTransactionSchemaBase = z.object({
  transactionId: z.string().optional().describe("Transaction ID"),
  txId: z.string().optional().describe("Alias for transactionId"),
  tx: z.string().optional().describe("Alias for transactionId"),
  sql: z.string().describe("SQL to execute"),
  params: z.array(z.unknown()).optional().describe("Query parameters"),
});

// Transformed schema with alias resolution
export const ExecuteInTransactionSchema =
  ExecuteInTransactionSchemaBase.transform((data) => ({
    transactionId: data.transactionId ?? data.txId ?? data.tx ?? "",
    sql: data.sql,
    params: data.params,
  })).refine((data) => data.transactionId !== "", {
    message: "transactionId (or txId/tx alias) is required",
  });

// Base schema for MCP visibility (pg_transaction_execute)
export const TransactionExecuteSchemaBase = z.object({
  statements: z
    .array(
      z.object({
        sql: z.string().optional().describe("SQL statement to execute"),
        query: z.string().optional().describe("Alias for sql"),
        params: z.array(z.unknown()).optional().describe("Query parameters"),
      }),
    )
    .optional()
    .describe(
      'Statements to execute atomically. Each must be an object with {sql: "..."} format.',
    ),
  transactionId: z
    .string()
    .optional()
    .describe(
      "Optional: Join existing transaction from pg_transaction_begin. If omitted, creates new auto-commit transaction.",
    ),
  txId: z.string().optional().describe("Alias for transactionId"),
  tx: z.string().optional().describe("Alias for transactionId"),
  isolationLevel: z
    .enum([
      "READ UNCOMMITTED",
      "READ COMMITTED",
      "REPEATABLE READ",
      "SERIALIZABLE",
    ])
    .optional()
    .describe("Transaction isolation level"),
});

// Schema with undefined handling for pg_transaction_execute
export const TransactionExecuteSchema = z
  .preprocess(
    (val: unknown) => preprocessBeginParams(defaultToEmpty(val)),
    TransactionExecuteSchemaBase,
  )
  .transform((data) => ({
    statements: (data.statements ?? []).map((stmt) => ({
      sql: stmt.sql ?? stmt.query ?? "",
      params: stmt.params,
    })),
    transactionId: data.transactionId ?? data.txId ?? data.tx,
    isolationLevel: data.isolationLevel,
  }))
  .refine((data) => data.statements.length > 0, {
    message:
      'statements is required. Format: {statements: [{sql: "INSERT INTO..."}, {sql: "UPDATE..."}]}. Each statement must be an object with "sql" property, not a raw string.',
  })
  .refine((data) => data.statements.every((s) => s.sql !== ""), {
    message:
      'Each statement must have "sql" (or "query" alias). Format: {statements: [{sql: "INSERT INTO..."}]}',
  });

// =============================================================================
// Transaction Output Schemas
// =============================================================================

// Output schema for pg_transaction_begin
export const TransactionBeginOutputSchema = z.object({
  success: z
    .boolean()
    .optional()
    .describe("False when the operation failed (omitted on success)"),
  error: z.string().optional().describe("Error message when success is false"),
  transactionId: z
    .string()
    .optional()
    .describe("Unique transaction ID for subsequent operations"),
  isolationLevel: z.string().optional().describe("Transaction isolation level"),
  message: z.string().optional().describe("Confirmation message"),
});

// Output schema for pg_transaction_commit, pg_transaction_rollback
export const TransactionResultOutputSchema = z.object({
  success: z.boolean().describe("Whether the operation succeeded"),
  error: z.string().optional().describe("Error message when success is false"),
  transactionId: z
    .string()
    .optional()
    .describe("Transaction ID that was operated on"),
  message: z.string().optional().describe("Result message"),
});

// Output schema for pg_transaction_savepoint, pg_transaction_release, pg_transaction_rollback_to
export const SavepointResultOutputSchema = z.object({
  success: z.boolean().describe("Whether the operation succeeded"),
  error: z.string().optional().describe("Error message when success is false"),
  transactionId: z.string().optional().describe("Transaction ID"),
  savepoint: z.string().optional().describe("Savepoint name"),
  message: z.string().optional().describe("Result message"),
});

// Statement result schema for transaction execute
const StatementResultSchema = z.object({
  sql: z.string().describe("Executed SQL statement"),
  rowsAffected: z.number().describe("Number of rows affected"),
  rowCount: z.number().describe("Number of rows returned"),
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Returned rows (when using RETURNING)"),
});

// Output schema for pg_transaction_execute
export const TransactionExecuteOutputSchema = z.object({
  success: z.boolean().describe("Whether all statements executed successfully"),
  error: z.string().optional().describe("Error message when success is false"),
  statementsExecuted: z
    .number()
    .optional()
    .describe("Number of statements executed"),
  statementsTotal: z
    .number()
    .optional()
    .describe("Total number of statements attempted"),
  failedStatement: z
    .string()
    .optional()
    .describe("SQL of the statement that failed"),
  autoRolledBack: z
    .boolean()
    .optional()
    .describe("Whether the transaction was automatically rolled back"),
  results: z
    .array(StatementResultSchema)
    .optional()
    .describe("Results from each statement"),
  transactionId: z
    .string()
    .optional()
    .describe("Transaction ID (when joining existing transaction)"),
});
