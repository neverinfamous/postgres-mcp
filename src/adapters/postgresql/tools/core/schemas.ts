/**
 * PostgreSQL Core Tools - Additional Schemas
 *
 * Schemas that are defined in core tools but not in the main schemas directory.
 */

import { z } from "zod";

// Helper to handle undefined params (allows tools to be called without {})
const defaultToEmpty = (val: unknown): unknown => val ?? {};

/**
 * Preprocess list objects params for type/types alias handling
 */
function preprocessListObjectsParams(input: unknown): unknown {
  if (input === undefined || input === null) return {};
  if (typeof input !== "object") return input;
  const result = { ...(input as Record<string, unknown>) };

  // Handle 'type' as alias for 'types' (support singular form)
  if (result["types"] === undefined && result["type"] !== undefined) {
    const typeValue = result["type"];
    // Convert single string to array
    if (typeof typeValue === "string") {
      result["types"] = [typeValue];
    } else if (Array.isArray(typeValue)) {
      result["types"] = typeValue;
    }
    delete result["type"];
  }

  // If types is a single string, wrap in array
  if (typeof result["types"] === "string") {
    result["types"] = [result["types"]];
  }

  return result;
}

// Base schema for MCP visibility - exposes all parameters without transform
export const ListObjectsSchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Schema name (default: all user schemas)"),
  types: z
    .array(
      z.enum([
        "table",
        "view",
        "materialized_view",
        "function",
        "procedure",
        "sequence",
        "index",
        "trigger",
      ]),
    )
    .optional()
    .describe("Object types to include"),
  type: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe("Alias for types (singular or array)"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of objects to return (default: 100)"),
});

// Transformed schema with preprocess for handler parsing
export const ListObjectsSchema = z.preprocess(
  preprocessListObjectsParams,
  ListObjectsSchemaBase,
);

// Inner schema for ObjectDetails (used by preprocess and as base for MCP visibility)
const ObjectDetailsInnerSchema = z.object({
  name: z
    .string()
    .optional()
    .describe("Object name (supports schema.name format)"),
  object: z.string().optional().describe("Alias for name"),
  objectName: z.string().optional().describe("Alias for name (Code Mode API)"),
  table: z.string().optional().describe("Alias for name"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  type: z
    .enum([
      "table",
      "view",
      "materialized_view",
      "partitioned_table",
      "function",
      "sequence",
      "index",
    ])
    .optional()
    .describe("Object type hint (case-insensitive)"),
  objectType: z
    .enum([
      "table",
      "view",
      "materialized_view",
      "partitioned_table",
      "function",
      "sequence",
      "index",
    ])
    .optional()
    .describe("Alias for type"),
});

// Preprocess function for ObjectDetails
function preprocessObjectDetailsParams(val: unknown): unknown {
  const obj = (val ?? {}) as Record<string, unknown>;
  // Support 'table', 'object', and 'objectName' as aliases for 'name'
  if (obj["name"] === undefined) {
    if (obj["table"] !== undefined) obj["name"] = obj["table"];
    else if (obj["object"] !== undefined) obj["name"] = obj["object"];
    else if (obj["objectName"] !== undefined) obj["name"] = obj["objectName"];
  }
  // Parse schema.name format if schema not explicitly provided
  if (
    typeof obj["name"] === "string" &&
    obj["name"].includes(".") &&
    obj["schema"] === undefined
  ) {
    const parts = obj["name"].split(".");
    if (parts.length === 2) {
      obj["schema"] = parts[0];
      obj["name"] = parts[1];
    }
  }
  // Normalize 'type' and 'objectType' to lowercase for case-insensitivity
  if (typeof obj["type"] === "string") {
    obj["type"] = obj["type"].toLowerCase();
  }
  if (typeof obj["objectType"] === "string") {
    obj["objectType"] = obj["objectType"].toLowerCase();
  }
  return obj;
}

// Base schema for MCP visibility - exported directly without preprocess wrapper
// so MCP clients can see all input parameters
export const ObjectDetailsSchemaBase = z.object({
  name: z
    .string()
    .optional()
    .describe("Object name (supports schema.name format)"),
  object: z.string().optional().describe("Alias for name"),
  objectName: z.string().optional().describe("Alias for name (Code Mode API)"),
  table: z.string().optional().describe("Alias for name"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  type: z
    .enum([
      "table",
      "view",
      "materialized_view",
      "partitioned_table",
      "function",
      "sequence",
      "index",
    ])
    .optional()
    .describe("Object type hint (case-insensitive)"),
  objectType: z
    .enum([
      "table",
      "view",
      "materialized_view",
      "partitioned_table",
      "function",
      "sequence",
      "index",
    ])
    .optional()
    .describe("Alias for type"),
});

// Full schema with transform for handler parsing
export const ObjectDetailsSchema = z
  .preprocess(preprocessObjectDetailsParams, ObjectDetailsInnerSchema)
  .transform((data) => ({
    name: data.name ?? data.object ?? data.objectName ?? data.table ?? "",
    schema: data.schema,
    type: data.type ?? data.objectType,
  }))
  .refine((data) => data.name !== "", {
    message: "name (or object/objectName/table alias) is required",
  });

export const AnalyzeDbHealthSchema = z.preprocess(
  defaultToEmpty,
  z.object({
    includeIndexes: z
      .boolean()
      .optional()
      .describe("Include unused indexes analysis (default: true)"),
    includeVacuum: z
      .boolean()
      .optional()
      .describe("Include tables needing vacuum analysis (default: true)"),
    includeConnections: z
      .boolean()
      .optional()
      .describe("Include connection stats (default: true)"),
  }),
);

export const AnalyzeWorkloadIndexesSchema = z.preprocess(
  defaultToEmpty,
  z.object({
    topQueries: z
      .number()
      .optional()
      .describe("Number of top queries to analyze (default: 20)"),
    minCalls: z.number().optional().describe("Minimum call count threshold"),
    queryPreviewLength: z
      .number()
      .optional()
      .describe(
        "Maximum characters for query preview (default: 200). Truncated queries end with '…'",
      ),
  }),
);

// Base schema for MCP visibility - exported so tool can use it for inputSchema
export const AnalyzeQueryIndexesSchemaBase = z.object({
  sql: z
    .string()
    .optional()
    .describe("Query to analyze for index recommendations"),
  query: z.string().optional().describe("Alias for sql"),
  params: z.array(z.unknown()).optional().describe("Query parameters"),
  verbosity: z
    .enum(["summary", "full"])
    .optional()
    .describe(
      "Response detail level: 'summary' (compact), 'full' (include full plan). Default: summary",
    ),
});

// Transformed schema with alias resolution
export const AnalyzeQueryIndexesSchema =
  AnalyzeQueryIndexesSchemaBase.transform((data) => ({
    sql: data.sql ?? data.query ?? "",
    params: data.params,
    verbosity: data.verbosity ?? "summary",
  })).refine((data) => data.sql !== "", {
    message: "sql (or query alias) is required",
  });

// ============== OUTPUT SCHEMAS (MCP 2025-11-25 structuredContent) ==============

// Field schema for query results
const FieldSchema = z.object({
  name: z.string().describe("Column name"),
  dataTypeID: z.number().optional().describe("PostgreSQL data type OID"),
});

// Output schema for pg_read_query
export const ReadQueryOutputSchema = z.object({
  success: z.boolean().optional().describe("Whether the operation succeeded"),
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Query result rows"),
  rowCount: z.number().optional().describe("Number of rows returned"),
  fields: z.array(FieldSchema).optional().describe("Column metadata"),
  executionTimeMs: z.number().optional().describe("Query execution time in ms"),
  error: z.string().optional().describe("Error message if operation failed"),
});

// Output schema for pg_write_query, pg_upsert, pg_batch_insert
export const WriteQueryOutputSchema = z.object({
  success: z.boolean().optional().describe("Whether the operation succeeded"),
  operation: z.string().optional().describe("Operation type (insert/update)"),
  rowsAffected: z.number().optional().describe("Number of rows affected"),
  affectedRows: z.number().optional().describe("Alias for rowsAffected"),
  rowCount: z.number().optional().describe("Alias for rowsAffected"),
  insertedCount: z.number().optional().describe("Rows inserted (batch insert)"),
  command: z.string().optional().describe("SQL command executed"),
  executionTimeMs: z.number().optional().describe("Execution time in ms"),
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Returned rows (RETURNING clause)"),
  sql: z.string().optional().describe("Generated SQL statement"),
  hint: z.string().optional().describe("Additional information"),
  error: z.string().optional().describe("Error message if operation failed"),
});

// Table info schema for list tables
const TableInfoSchema = z.object({
  name: z.string().describe("Table name"),
  schema: z.string().describe("Schema name"),
  type: z.string().describe("Object type (table/view/materialized_view)"),
  rowCount: z.number().optional().describe("Estimated row count"),
  sizeBytes: z.number().optional().describe("Table size in bytes"),
});

// Output schema for pg_list_tables
export const TableListOutputSchema = z.object({
  tables: z.array(TableInfoSchema).describe("List of tables"),
  count: z.number().describe("Number of tables returned"),
  totalCount: z.number().describe("Total number of tables"),
  truncated: z.boolean().optional().describe("Whether results were truncated"),
  hint: z.string().optional().describe("Pagination hint"),
});

// Column info schema for describe table
const ColumnInfoSchema = z.object({
  name: z.string().describe("Column name"),
  type: z.string().describe("Data type"),
  nullable: z.boolean().describe("Whether column allows nulls"),
  default: z.string().optional().describe("Default value"),
  primaryKey: z.boolean().optional().describe("Whether column is primary key"),
});

// Output schema for pg_describe_table
export const TableDescribeOutputSchema = z.object({
  success: z.boolean().optional().describe("Whether the operation succeeded"),
  name: z.string().optional().describe("Table name"),
  schema: z.string().optional().describe("Schema name"),
  type: z.string().optional().describe("Object type"),
  columns: z.array(ColumnInfoSchema).optional().describe("Column definitions"),
  primaryKey: z
    .array(z.string())
    .nullable()
    .optional()
    .describe("Primary key columns"),
  foreignKeys: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Foreign key constraints"),
  indexes: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Index definitions"),
  rowCount: z.number().optional().describe("Estimated row count"),
  error: z.string().optional().describe("Error message if operation failed"),
});

// Output schema for pg_create_table, pg_drop_table
export const TableOperationOutputSchema = z.object({
  success: z.boolean().optional().describe("Whether the operation succeeded"),
  table: z.string().optional().describe("Qualified table name"),
  dropped: z.string().optional().describe("Dropped table name (drop only)"),
  existed: z.boolean().optional().describe("Whether table existed before drop"),
  sql: z.string().optional().describe("Generated SQL statement"),
  compositePrimaryKey: z
    .array(z.string())
    .optional()
    .describe("Composite PK columns"),
  error: z.string().optional().describe("Error message if operation failed"),
});

// Output schema for pg_truncate
export const TruncateOutputSchema = z.object({
  success: z.boolean().describe("Whether the operation succeeded"),
  table: z.string().optional().describe("Truncated table"),
  cascade: z.boolean().optional().describe("Whether CASCADE was used"),
  restartIdentity: z
    .boolean()
    .optional()
    .describe("Whether identity was restarted"),
  error: z.string().optional().describe("Error message if operation failed"),
});

// Index info schema
const IndexInfoSchema = z.object({
  name: z.string().describe("Index name"),
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  indexName: z.string().optional().describe("Alias for name"),
  schemaName: z.string().optional().describe("Schema name (alias)"),
  schema: z.string().optional().describe("Schema name"),
  type: z.string().optional().describe("Index type (btree, hash, gin, etc)"),
  unique: z.boolean().optional().describe("Whether index is unique"),
  columns: z.array(z.string()).optional().describe("Indexed columns"),
});

// Output schema for pg_get_indexes
export const IndexListOutputSchema = z.object({
  success: z.boolean().optional().describe("Whether the operation succeeded"),
  indexes: z.array(IndexInfoSchema).optional().describe("List of indexes"),
  count: z.number().optional().describe("Number of indexes"),
  totalCount: z.number().optional().describe("Total count before truncation"),
  truncated: z.boolean().optional().describe("Whether results were truncated"),
  hint: z.string().optional().describe("Additional information"),
  error: z.string().optional().describe("Error message if operation failed"),
});

// Output schema for pg_create_index, pg_drop_index
export const IndexOperationOutputSchema = z.object({
  success: z.boolean().optional().describe("Whether the operation succeeded"),
  message: z.string().optional().describe("Result message"),
  index: z.string().optional().describe("Index name"),
  table: z.string().optional().describe("Table name"),
  sql: z.string().optional().describe("Generated SQL"),
  hint: z.string().optional().describe("Additional information"),
  error: z.string().optional().describe("Error message if operation failed"),
});

// Database object schema
const DatabaseObjectSchema = z.object({
  name: z.string().describe("Object name"),
  schema: z.string().describe("Schema name"),
  type: z.string().describe("Object type"),
  owner: z.string().optional().describe("Object owner"),
});

// Output schema for pg_list_objects
export const ObjectListOutputSchema = z.object({
  objects: z.array(DatabaseObjectSchema).describe("List of database objects"),
  count: z.number().describe("Number of objects returned"),
  totalCount: z.number().optional().describe("Total count before truncation"),
  truncated: z.boolean().optional().describe("Whether results were truncated"),
  hint: z.string().optional().describe("Additional information"),
});

// Output schema for pg_object_details - flexible due to different object types
export const ObjectDetailsOutputSchema = z.object({
  success: z.boolean().optional().describe("Whether the operation succeeded"),
  name: z.string().optional().describe("Object name"),
  schema: z.string().optional().describe("Schema name"),
  type: z.string().optional().describe("Object type"),
  owner: z.string().optional().describe("Object owner"),
  details: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Type-specific details"),
  error: z.string().optional().describe("Error message if operation failed"),
});

// Extension info schema
const ExtensionInfoSchema = z.object({
  name: z.string().describe("Extension name"),
  version: z.string().optional().describe("Installed version"),
  schema: z.string().optional().describe("Extension schema"),
  description: z.string().optional().describe("Extension description"),
});

// Output schema for pg_list_extensions
export const ExtensionListOutputSchema = z.object({
  extensions: z.array(ExtensionInfoSchema).describe("List of extensions"),
  count: z.number().describe("Number of extensions"),
});

// Cache hit ratio schema for health analysis
const CacheHitRatioSchema = z.object({
  ratio: z.number().nullable().optional().describe("Primary numeric value"),
  heap: z.number().nullable().optional().describe("Heap hit ratio"),
  index: z.number().nullable().optional().describe("Index hit ratio"),
  status: z.string().optional().describe("Status (good/fair/poor)"),
});

// Output schema for pg_analyze_db_health
export const HealthAnalysisOutputSchema = z.object({
  cacheHitRatio: CacheHitRatioSchema.optional().describe(
    "Buffer cache hit ratio details",
  ),
  databaseSize: z.string().optional().describe("Database size"),
  tableStats: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Table statistics"),
  unusedIndexes: z
    .union([z.number(), z.string()])
    .optional()
    .describe("Count of unused indexes"),
  tablesNeedingVacuum: z
    .union([z.number(), z.string()])
    .optional()
    .describe("Count of tables needing vacuum"),
  connections: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Connection statistics"),
  isReplica: z.boolean().optional().describe("Whether database is a replica"),
  bloat: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Bloat estimation"),
  overallScore: z.number().optional().describe("Overall health score (0-100)"),
  overallStatus: z
    .string()
    .optional()
    .describe("Overall status (healthy/needs_attention/critical)"),
});

// Output schema for pg_analyze_workload_indexes
export const IndexRecommendationsOutputSchema = z.object({
  recommendations: z
    .array(z.record(z.string(), z.unknown()))
    .describe("Index recommendations"),
  queriesAnalyzed: z.number().optional().describe("Number of queries analyzed"),
  hint: z.string().optional().describe("Additional information"),
});

// Output schema for pg_analyze_query_indexes
export const QueryIndexAnalysisOutputSchema = z.object({
  sql: z.string().optional().describe("Analyzed query"),
  plan: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Query execution plan"),
  recommendations: z
    .array(z.string())
    .optional()
    .describe("Index recommendations"),
  issues: z
    .array(z.string())
    .optional()
    .describe("Issues detected in query plan"),
  executionTime: z.number().optional().describe("Query execution time in ms"),
  planningTime: z.number().optional().describe("Planning time in ms"),
  verbosity: z.string().optional().describe("Response verbosity level"),
  hint: z.string().optional().describe("Additional information"),
  error: z.string().optional().describe("Error message if analysis failed"),
});

// Output schema for pg_count
export const CountOutputSchema = z.object({
  success: z.boolean().optional().describe("Whether the operation succeeded"),
  count: z.number().optional().describe("Row count"),
  error: z.string().optional().describe("Error message if operation failed"),
});

// Output schema for pg_exists
export const ExistsOutputSchema = z.object({
  success: z.boolean().optional().describe("Whether the operation succeeded"),
  exists: z.boolean().optional().describe("Whether rows exist"),
  table: z.string().optional().describe("Table checked"),
  mode: z.enum(["filtered", "any_rows"]).optional().describe("Check mode"),
  where: z.string().optional().describe("WHERE clause used (filtered mode)"),
  hint: z.string().optional().describe("Clarifying hint (any_rows mode)"),
  error: z.string().optional().describe("Error message if operation failed"),
});
