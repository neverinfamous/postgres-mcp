/**
 * postgres-mcp - Core Tool Schemas
 *
 * Input validation schemas for core database operations.
 */

import { z } from "zod";

// Helper to handle undefined params (allows tools to be called without {})
export const defaultToEmpty = (val: unknown): unknown => val ?? {};

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
export function preprocessTableParams(input: unknown): unknown {
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
          .unknown()
          .optional()
          .describe(
            "Default value (raw SQL expression). Numbers/booleans auto-coerced to string.",
          ),
        defaultValue: z
          .unknown()
          .optional()
          .describe(
            "Alias for default. Numbers/booleans auto-coerced to string.",
          ),
        check: z.string().optional().describe("CHECK constraint expression"),
        // Support both object {table, column} and string 'table(column)' syntax
        references: z
          .unknown()
          .optional()
          .describe(
            'Foreign key reference: {table, column} or "table(column)"',
          ),
      }),
    )
    .optional()
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
    columns: (data.columns ?? []).map((col) => {
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
          typeof rawDefault === "object"
            ? JSON.stringify(rawDefault)
            : String(rawDefault as string | number | boolean);

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
  .refine((data) => data.columns !== undefined && data.columns.length > 0, {
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

