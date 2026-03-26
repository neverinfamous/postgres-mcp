/**
 * PostgreSQL Core Tools - Output Schemas
 *
 * MCP 2025-11-25 structuredContent output schemas for core tools:
 * queries, tables, indexes, objects, health analysis.
 */

import { z } from "zod";
import { ErrorResponseFields } from "../../../schemas/error-response-fields.js";

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
}).extend(ErrorResponseFields.shape);

// Output schema for pg_write_query, pg_upsert, pg_batch_insert
export const WriteQueryOutputSchema = z.object({
  success: z.boolean().optional().describe("Whether the operation succeeded"),
  operation: z.string().optional().describe("Operation type (insert/update)"),
  rowsAffected: z.number().optional().describe("Number of rows affected"),
  insertedCount: z.number().optional().describe("Number of rows inserted (batch/bulk)"),
  command: z.string().optional().describe("SQL command executed"),
  executionTimeMs: z.number().optional().describe("Execution time in ms"),
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Returned rows (RETURNING clause)"),
  sql: z.string().optional().describe("Generated SQL statement"),
  hint: z.string().optional().describe("Additional information"),
  error: z.string().optional().describe("Error message if operation failed"),
}).extend(ErrorResponseFields.shape);

// Table info schema for list tables
const TableInfoSchema = z.object({
  name: z.string().describe("Table name"),
  schema: z.string().describe("Schema name"),
  type: z.string().describe("Object type (table/view/materialized_view)"),
  owner: z.string().optional().describe("Table owner"),
  rowCount: z.number().optional().describe("Estimated row count"),
  sizeBytes: z.number().optional().describe("Table size in bytes"),
  totalSizeBytes: z.number().optional().describe("Total size including indexes"),
  comment: z.string().nullable().optional().describe("Table comment"),
  statsStale: z.boolean().optional().describe("Whether pg_class stats are stale"),
});

// Output schema for pg_list_tables
export const TableListOutputSchema = z.object({
  tables: z.array(TableInfoSchema).optional().describe("List of tables"),
  count: z.number().optional().describe("Number of tables returned"),
  totalCount: z.number().optional().describe("Total number of tables"),
  truncated: z.boolean().optional().describe("Whether results were truncated"),
  hint: z.string().optional().describe("Pagination hint"),
}).extend(ErrorResponseFields.shape);

// Column info schema for describe table
const ColumnInfoSchema = z.object({
  name: z.string().describe("Column name"),
  type: z.string().describe("Data type"),
  notNull: z.boolean().describe("Whether column prohibits nulls"),
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
}).extend(ErrorResponseFields.shape);

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
}).extend(ErrorResponseFields.shape);

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
}).extend(ErrorResponseFields.shape);

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
}).extend(ErrorResponseFields.shape);

// Output schema for pg_create_index, pg_drop_index
export const IndexOperationOutputSchema = z.object({
  success: z.boolean().optional().describe("Whether the operation succeeded"),
  message: z.string().optional().describe("Result message"),
  index: z.string().optional().describe("Index name"),
  table: z.string().optional().describe("Table name"),
  sql: z.string().optional().describe("Generated SQL"),
  hint: z.string().optional().describe("Additional information"),
  error: z.string().optional().describe("Error message if operation failed"),
}).extend(ErrorResponseFields.shape);

// Database object schema
const DatabaseObjectSchema = z.object({
  name: z.string().describe("Object name"),
  schema: z.string().describe("Schema name"),
  type: z.string().describe("Object type"),
  owner: z.string().optional().describe("Object owner"),
});

// Output schema for pg_list_objects
export const ObjectListOutputSchema = z.object({
  success: z.boolean().optional().describe("Whether the operation succeeded"),
  objects: z
    .array(DatabaseObjectSchema)
    .optional()
    .describe("List of database objects"),
  count: z.number().optional().describe("Number of objects returned"),
  totalCount: z.number().optional().describe("Total count before truncation"),
  byType: z
    .record(z.string(), z.number())
    .optional()
    .describe("Object counts grouped by type"),
  truncated: z.boolean().optional().describe("Whether results were truncated"),
  hint: z.string().optional().describe("Additional information"),
  error: z.string().optional().describe("Error message if operation failed"),
}).extend(ErrorResponseFields.shape);

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
}).extend(ErrorResponseFields.shape);

// Extension info schema
const ExtensionInfoSchema = z.object({
  name: z.string().describe("Extension name"),
  version: z.string().optional().describe("Installed version"),
  schema: z.string().optional().describe("Extension schema"),
  description: z.string().optional().describe("Extension description"),
});

// Output schema for pg_list_extensions
export const ExtensionListOutputSchema = z.object({
  extensions: z.array(ExtensionInfoSchema).optional().describe("List of extensions"),
  count: z.number().optional().describe("Number of extensions"),
}).extend(ErrorResponseFields.shape);

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
}).extend(ErrorResponseFields.shape);

// Output schema for pg_analyze_workload_indexes
export const IndexRecommendationsOutputSchema = z.object({
  recommendations: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Index recommendations"),
  queriesAnalyzed: z.number().optional().describe("Number of queries analyzed"),
  hint: z.string().optional().describe("Additional information"),
}).extend(ErrorResponseFields.shape);

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
}).extend(ErrorResponseFields.shape);

// Output schema for pg_count
export const CountOutputSchema = z.object({
  success: z.boolean().optional().describe("Whether the operation succeeded"),
  count: z.number().optional().describe("Row count"),
  error: z.string().optional().describe("Error message if operation failed"),
}).extend(ErrorResponseFields.shape);

// Output schema for pg_exists
export const ExistsOutputSchema = z.object({
  success: z.boolean().optional().describe("Whether the operation succeeded"),
  exists: z.boolean().optional().describe("Whether rows exist"),
  table: z.string().optional().describe("Table checked"),
  mode: z.enum(["filtered", "any_rows"]).optional().describe("Check mode"),
  where: z.string().optional().describe("WHERE clause used (filtered mode)"),
  hint: z.string().optional().describe("Clarifying hint (any_rows mode)"),
  error: z.string().optional().describe("Error message if operation failed"),
}).extend(ErrorResponseFields.shape);
