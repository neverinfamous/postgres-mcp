/**
 * postgres-mcp - Extension Tool Schemas
 *
 * Input validation schemas for PostgreSQL extensions:
 * - pg_stat_kcache
 * - citext
 * - ltree
 * - pgcrypto
 */

import { z } from "zod";

// =============================================================================
// pg_stat_kcache Schemas
// =============================================================================

/**
 * Schema for querying enhanced statistics with kcache data.
 * Joins pg_stat_statements with pg_stat_kcache for full picture.
 */
export const KcacheQueryStatsSchemaBase = z.object({
  limit: z
    .number()
    .optional()
    .describe("Maximum number of queries to return (default: 20)"),
  orderBy: z
    .string()
    .optional()
    .describe(
      "Order results by metric (default: total_time). Valid: total_time, cpu_time, reads, writes",
    ),
  minCalls: z.number().optional().describe("Minimum call count to include"),
  queryPreviewLength: z
    .number()
    .optional()
    .describe(
      "Characters for query preview (default: 100, max: 500, 0 for full)",
    ),
});

export const KcacheQueryStatsSchema = z.preprocess(
  normalizeOptionalParams,
  KcacheQueryStatsSchemaBase,
);

/**
 * Schema for top resource consumers query.
 */
export const KcacheTopConsumersSchema = z.object({
  resource: z
    .enum(["cpu", "reads", "writes", "page_faults"])
    .describe("Resource type to rank by"),
  limit: z
    .number()
    .optional()
    .describe("Number of top queries to return (default: 10)"),
});

/**
 * Base schema for MCP visibility - pg_kcache_top_cpu parameters.
 */
export const KcacheTopCpuSchemaBase = z.object({
  limit: z
    .number()
    .optional()
    .describe("Number of top queries to return (default: 10)"),
  queryPreviewLength: z
    .number()
    .optional()
    .describe(
      "Characters for query preview (default: 100, max: 500, 0 for full)",
    ),
});

/**
 * Base schema for MCP visibility - pg_kcache_top_io parameters.
 */
export const KcacheTopIoSchemaBase = z.object({
  type: z
    .enum(["reads", "writes", "both"])
    .optional()
    .describe("I/O type to rank by (default: both)"),
  ioType: z
    .enum(["reads", "writes", "both"])
    .optional()
    .describe("Alias for type"),
  limit: z
    .number()
    .optional()
    .describe("Number of top queries to return (default: 10)"),
  queryPreviewLength: z
    .number()
    .optional()
    .describe(
      "Characters for query preview (default: 100, max: 500, 0 for full)",
    ),
});

/**
 * Schema for database-level aggregation.
 */
export const KcacheDatabaseStatsSchemaBase = z.object({
  database: z
    .string()
    .optional()
    .describe("Database name (current database if omitted)"),
});

export const KcacheDatabaseStatsSchema = z.preprocess(
  normalizeOptionalParams,
  KcacheDatabaseStatsSchemaBase,
);

/**
 * Schema for identifying resource-bound queries.
 */
export const KcacheResourceAnalysisSchemaBase = z.object({
  queryId: z
    .string()
    .optional()
    .describe("Specific query ID to analyze (all if omitted)"),
  threshold: z
    .number()
    .optional()
    .describe("CPU/IO ratio threshold for classification (default: 0.5)"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of queries to return (default: 20)"),
  minCalls: z.number().optional().describe("Minimum call count to include"),
  queryPreviewLength: z
    .number()
    .optional()
    .describe(
      "Characters for query preview (default: 100, max: 500, 0 for full)",
    ),
});

export const KcacheResourceAnalysisSchema = z.preprocess(
  normalizeOptionalParams,
  KcacheResourceAnalysisSchemaBase,
);

// =============================================================================
// citext Schemas
// =============================================================================

/**
 * Handle undefined/null params for tools with optional-only parameters
 */
function normalizeOptionalParams(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null) {
    return {};
  }
  return input as Record<string, unknown>;
}

/**
 * Preprocess citext table parameters:
 * - Alias: tableName -> table
 * - Alias: col -> column
 * - Parse schema.table format
 */
function preprocessCitextTableParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const obj = input as Record<string, unknown>;
  const result = { ...obj };

  // Alias: tableName -> table
  if (result["table"] === undefined && result["tableName"] !== undefined) {
    result["table"] = result["tableName"];
  }

  // Alias: col -> column
  if (result["col"] !== undefined && result["column"] === undefined) {
    result["column"] = result["col"];
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

/**
 * Base schema for MCP visibility (shows all parameters including aliases).
 */
export const CitextConvertColumnSchemaBase = z.object({
  table: z.string().describe("Table name"),
  column: z.string().optional().describe("Text column to convert to citext"),
  col: z.string().optional().describe("Alias for column"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

/**
 * Transformed schema for converting a text column to citext.
 * Resolves aliases, parses schema.table format, and validates required fields.
 */
export const CitextConvertColumnSchema = z
  .preprocess(preprocessCitextTableParams, CitextConvertColumnSchemaBase)
  .transform((data) => ({
    table: data.table,
    column: data.column ?? data.col ?? "",
    schema: data.schema,
  }))
  .refine((data) => data.column !== "", {
    message: "column (or col alias) is required",
  });

/**
 * Base schema for MCP visibility - shows all parameters for listColumns.
 */
export const CitextListColumnsSchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Schema name to filter (all schemas if omitted)"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of columns to return (default: 100, 0 for all)"),
});

/**
 * Schema for listing citext columns.
 * Preprocesses to handle empty/null params.
 */
export const CitextListColumnsSchema = z.preprocess(
  normalizeOptionalParams,
  CitextListColumnsSchemaBase,
);

/**
 * Base schema for MCP visibility - shows all parameters for analyzeCandidates.
 */
export const CitextAnalyzeCandidatesSchemaBase = z.object({
  patterns: z
    .array(z.string())
    .optional()
    .describe(
      "Column name patterns to match (default: email, username, name, etc.)",
    ),
  schema: z.string().optional().describe("Schema name to filter"),
  table: z
    .string()
    .optional()
    .describe("Table name to filter (analyzes single table)"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of candidates to return"),
  excludeSystemSchemas: z
    .boolean()
    .optional()
    .describe(
      "Exclude extension/system schemas like cron, topology, partman (default: true)",
    ),
});

/**
 * Schema for analyzing candidate columns for citext conversion.
 * Preprocesses to handle empty/null params.
 */
export const CitextAnalyzeCandidatesSchema = z.preprocess(
  (input) => preprocessCitextTableParams(normalizeOptionalParams(input)),
  CitextAnalyzeCandidatesSchemaBase,
);

/**
 * Base schema for MCP visibility (shows all parameters including aliases).
 */
export const CitextSchemaAdvisorSchemaBase = z.object({
  table: z.string().optional().describe("Table name to analyze (required)"),
  tableName: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

/**
 * Transformed schema for citext schema advisor tool.
 * Resolves aliases, parses schema.table format, and validates required fields.
 */
export const CitextSchemaAdvisorSchema = z
  .preprocess(preprocessCitextTableParams, CitextSchemaAdvisorSchemaBase)
  .transform((data) => ({
    table: data.table ?? data.tableName ?? "",
    schema: data.schema,
  }))
  .refine((data) => data.table !== "", {
    message: "table (or tableName alias) is required",
  });

// =============================================================================
// ltree Schemas
// =============================================================================

/**
 * Preprocess ltree table parameters:
 * - Alias: tableName/name -> table
 * - Alias: col -> column
 * - Parse schema.table format
 */
function preprocessLtreeTableParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const obj = input as Record<string, unknown>;
  const result = { ...obj };

  // Alias: tableName/name -> table
  if (result["table"] === undefined) {
    if (result["tableName"] !== undefined)
      result["table"] = result["tableName"];
    else if (result["name"] !== undefined) result["table"] = result["name"];
  }

  // Alias: col -> column
  if (result["col"] !== undefined && result["column"] === undefined) {
    result["column"] = result["col"];
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

// -----------------------------------------------------------------------------
// Base schemas for MCP visibility (simple z.object with all params + aliases)
// -----------------------------------------------------------------------------

/**
 * Base schema for MCP visibility - shows all parameters including aliases.
 */
export const LtreeQuerySchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  name: z.string().optional().describe("Alias for table"),
  column: z.string().optional().describe("ltree column name"),
  col: z.string().optional().describe("Alias for column"),
  path: z
    .string()
    .describe('ltree path to query (e.g., "Top.Science.Astronomy")'),
  pattern: z.string().optional().describe("Alias for path"),
  mode: z
    .enum(["ancestors", "descendants", "exact"])
    .optional()
    .describe("Query mode: ancestors, descendants (default), or exact"),
  type: z
    .enum(["ancestors", "descendants", "exact"])
    .optional()
    .describe("Alias for mode"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  limit: z.number().optional().describe("Maximum results"),
});

/**
 * Base schema for MCP visibility - shows all parameters including aliases.
 */
export const LtreeSubpathSchemaBase = z.object({
  path: z.string().describe('ltree path (e.g., "Top.Science.Astronomy.Stars")'),
  offset: z
    .number()
    .optional()
    .describe("Starting position (0-indexed, negative counts from end)"),
  start: z.number().optional().describe("Alias for offset"),
  from: z.number().optional().describe("Alias for offset"),
  length: z
    .number()
    .optional()
    .describe("Number of labels (omit for rest of path)"),
  len: z.number().optional().describe("Alias for length"),
});

/**
 * Base schema for MCP visibility - shows all parameters including aliases.
 */
export const LtreeMatchSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  name: z.string().optional().describe("Alias for table"),
  column: z.string().optional().describe("ltree column name"),
  col: z.string().optional().describe("Alias for column"),
  pattern: z
    .string()
    .optional()
    .describe('lquery pattern (e.g., "*.Science.*" or "Top.*{1,3}.Stars")'),
  query: z.string().optional().describe("Alias for pattern"),
  lquery: z.string().optional().describe("Alias for pattern"),
  schema: z.string().optional().describe("Schema name (default: public)"),
  limit: z.number().optional().describe("Maximum results"),
  maxResults: z.number().optional().describe("Alias for limit"),
});

/**
 * Base schema for MCP visibility - shows all parameters including aliases.
 */
export const LtreeConvertColumnSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  name: z.string().optional().describe("Alias for table"),
  column: z.string().optional().describe("Text column to convert to ltree"),
  col: z.string().optional().describe("Alias for column"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

/**
 * Base schema for MCP visibility - shows all parameters including aliases.
 */
export const LtreeIndexSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  tableName: z.string().optional().describe("Alias for table"),
  name: z.string().optional().describe("Alias for table"),
  column: z.string().optional().describe("ltree column name"),
  col: z.string().optional().describe("Alias for column"),
  indexName: z
    .string()
    .optional()
    .describe("Custom index name (auto-generated if omitted)"),
  schema: z.string().optional().describe("Schema name (default: public)"),
});

// -----------------------------------------------------------------------------
// Transformed schemas for handler validation (with alias resolution)
// -----------------------------------------------------------------------------

/**
 * Schema for querying ltree hierarchies (ancestors/descendants).
 * Accepts 'pattern' as alias for 'path', 'type' as alias for 'mode', 'col'/'tableName'/'name' aliases.
 */
export const LtreeQuerySchema = z.preprocess(
  (input) => {
    const obj = preprocessLtreeTableParams(input);
    if (typeof obj !== "object" || obj === null) return obj;
    const result = obj as Record<string, unknown>;
    if ("pattern" in result && !("path" in result)) {
      result["path"] = result["pattern"];
    }
    // Alias: type -> mode
    if ("type" in result && !("mode" in result)) {
      result["mode"] = result["type"];
    }
    return result;
  },
  z.object({
    table: z.string().describe("Table name"),
    column: z.string().describe("ltree column name"),
    path: z
      .string()
      .describe('ltree path to query (e.g., "Top.Science.Astronomy")'),
    mode: z
      .enum(["ancestors", "descendants", "exact"])
      .optional()
      .describe(
        "Query mode: ancestors (@>), descendants (<@), or exact (default: descendants)",
      ),
    schema: z.string().optional().describe("Schema name (default: public)"),
    limit: z.number().optional().describe("Maximum results"),
  }),
);

/**
 * Schema for extracting subpath from ltree.
 * Accepts 'start'/'from' as alias for 'offset', 'len'/'end' as alias for 'length'.
 */
export const LtreeSubpathSchema = z.preprocess(
  (input) => {
    if (typeof input !== "object" || input === null) return input;
    const obj = input as Record<string, unknown>;
    const result = { ...obj };
    // Alias: len -> length (PostgreSQL function uses len)
    if ("len" in obj && !("length" in obj)) {
      result["length"] = obj["len"];
    }
    // Alias: start/from -> offset
    if ("start" in obj && !("offset" in obj)) {
      result["offset"] = obj["start"];
    } else if ("from" in obj && !("offset" in obj)) {
      result["offset"] = obj["from"];
    }
    // Default offset to 0 if not provided
    if (result["offset"] === undefined) {
      result["offset"] = 0;
    }
    // Alias: end -> length (calculate length from start/end if both provided)
    if ("end" in obj && !("length" in obj) && !("len" in obj)) {
      const start = (result["offset"] ?? 0) as number;
      const end = obj["end"] as number;
      result["length"] = end - start;
    }
    return result;
  },
  z.object({
    path: z
      .string()
      .describe('ltree path (e.g., "Top.Science.Astronomy.Stars")'),
    offset: z
      .number()
      .describe(
        "Starting position (0-indexed, negative counts from end). Default: 0",
      ),
    length: z
      .number()
      .optional()
      .describe("Number of labels (omit for rest of path). Alias: len"),
  }),
);

/**
 * Schema for finding longest common ancestor.
 */
export const LtreeLcaSchema = z.object({
  paths: z
    .array(z.string())
    .min(2)
    .describe("Array of ltree paths to find common ancestor"),
});

/**
 * Schema for pattern matching with lquery.
 * Accepts 'query'/'lquery' as aliases for 'pattern', 'maxResults' as alias for 'limit'.
 */
export const LtreeMatchSchema = z.preprocess(
  (input) => {
    const obj = preprocessLtreeTableParams(input);
    if (typeof obj !== "object" || obj === null) return obj;
    const result = obj as Record<string, unknown>;
    // Alias: query/lquery -> pattern
    if (result["pattern"] === undefined) {
      if (result["query"] !== undefined) result["pattern"] = result["query"];
      else if (result["lquery"] !== undefined)
        result["pattern"] = result["lquery"];
    }
    // Alias: maxResults -> limit
    if (result["maxResults"] !== undefined && result["limit"] === undefined) {
      result["limit"] = result["maxResults"];
    }
    return result;
  },
  z.object({
    table: z.string().describe("Table name"),
    column: z.string().describe("ltree column name"),
    pattern: z
      .string()
      .describe('lquery pattern (e.g., "*.Science.*" or "Top.*{1,3}.Stars")'),
    schema: z.string().optional().describe("Schema name (default: public)"),
    limit: z.number().optional().describe("Maximum results"),
  }),
);

/**
 * Schema for listing ltree columns in the database.
 */
export const LtreeListColumnsSchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Schema name to filter (all schemas if omitted)"),
});

export const LtreeListColumnsSchema = z.preprocess(
  normalizeOptionalParams,
  LtreeListColumnsSchemaBase,
);

/**
 * Schema for converting a text column to ltree.
 * Accepts 'tableName'/'name' as aliases for 'table', 'col' as alias for 'column'.
 */
export const LtreeConvertColumnSchema = z.preprocess(
  preprocessLtreeTableParams,
  z.object({
    table: z.string().describe("Table name"),
    column: z.string().describe("Text column to convert to ltree"),
    schema: z.string().optional().describe("Schema name (default: public)"),
  }),
);

/**
 * Schema for creating a GiST index on ltree column.
 * Accepts 'tableName'/'name' as aliases for 'table', 'col' as alias for 'column'.
 */
export const LtreeIndexSchema = z.preprocess(
  preprocessLtreeTableParams,
  z.object({
    table: z.string().describe("Table name"),
    column: z.string().describe("ltree column name"),
    indexName: z
      .string()
      .optional()
      .describe("Custom index name (auto-generated if omitted)"),
    schema: z.string().optional().describe("Schema name (default: public)"),
  }),
);

// =============================================================================
// pgcrypto Schemas
// =============================================================================

/**
 * Schema for hashing data with digest().
 */
export const PgcryptoHashSchema = z.object({
  data: z.string().describe("Data to hash"),
  algorithm: z
    .enum(["md5", "sha1", "sha224", "sha256", "sha384", "sha512"])
    .describe("Hash algorithm"),
  encoding: z
    .enum(["hex", "base64"])
    .optional()
    .describe("Output encoding (default: hex)"),
});

/**
 * Schema for HMAC authentication.
 */
export const PgcryptoHmacSchema = z.object({
  data: z.string().describe("Data to authenticate"),
  key: z.string().describe("Secret key for HMAC"),
  algorithm: z
    .enum(["md5", "sha1", "sha224", "sha256", "sha384", "sha512"])
    .describe("Hash algorithm"),
  encoding: z
    .enum(["hex", "base64"])
    .optional()
    .describe("Output encoding (default: hex)"),
});

/**
 * Schema for PGP symmetric encryption.
 * Accepts 'key' as alias for 'password'.
 *
 * Uses base schema for MCP exposure and transform schema for validation.
 */
export const PgcryptoEncryptSchemaBase = z.object({
  data: z.string().describe("Data to encrypt"),
  password: z.string().optional().describe("Encryption password"),
  key: z.string().optional().describe("Alias for password"),
  options: z
    .string()
    .optional()
    .describe('PGP options (e.g., "compress-algo=1, cipher-algo=aes256")'),
});

export const PgcryptoEncryptSchema = PgcryptoEncryptSchemaBase.transform(
  (data) => {
    // Handle alias: key -> password
    const resolvedPassword = data.password ?? data.key;
    return {
      ...data,
      password: resolvedPassword,
    };
  },
).refine((data) => data.password !== undefined, {
  message: "password (or key alias) is required",
});

/**
 * Schema for PGP symmetric decryption.
 * Accepts 'data' as alias for 'encryptedData', 'key' as alias for 'password'.
 *
 * Uses base schema for MCP exposure and transform schema for validation.
 */
export const PgcryptoDecryptSchemaBase = z.object({
  encryptedData: z
    .string()
    .optional()
    .describe("Encrypted data (base64 from encrypt)"),
  data: z.string().optional().describe("Alias for encryptedData"),
  password: z.string().optional().describe("Decryption password"),
  key: z.string().optional().describe("Alias for password"),
});

export const PgcryptoDecryptSchema = PgcryptoDecryptSchemaBase.transform(
  (data) => {
    // Handle aliases
    const resolvedEncryptedData = data.encryptedData ?? data.data;
    const resolvedPassword = data.password ?? data.key;
    return {
      encryptedData: resolvedEncryptedData,
      password: resolvedPassword,
    };
  },
)
  .refine((data) => data.encryptedData !== undefined, {
    message: "encryptedData (or data alias) is required",
  })
  .refine((data) => data.password !== undefined, {
    message: "password (or key alias) is required",
  });

/**
 * Schema for generating random bytes.
 */
export const PgcryptoRandomBytesSchema = z.object({
  length: z
    .number()
    .min(1)
    .max(1024)
    .describe("Number of random bytes to generate (1-1024)"),
  encoding: z
    .enum(["hex", "base64"])
    .optional()
    .describe("Output encoding (default: hex)"),
});

/**
 * Schema for generating password salt.
 */
export const PgcryptoGenSaltSchema = z.object({
  type: z
    .enum(["bf", "md5", "xdes", "des"])
    .describe("Salt type: bf (bcrypt, recommended), md5, xdes, or des"),
  iterations: z
    .number()
    .optional()
    .describe("Iteration count (for bf: 4-31, for xdes: odd 1-16777215)"),
});

/**
 * Schema for password hashing with crypt().
 */
export const PgcryptoCryptSchema = z.object({
  password: z.string().describe("Password to hash or verify"),
  salt: z
    .string()
    .describe("Salt from gen_salt() or stored hash for verification"),
});

// ============================================================================
// OUTPUT SCHEMAS - pg_stat_kcache tools
// ============================================================================

/**
 * Output schema for pg_kcache_create_extension
 */
export const KcacheCreateExtensionOutputSchema = z
  .object({
    success: z.boolean().describe("Whether extension was enabled"),
    message: z.string().optional().describe("Status message"),
    note: z.string().optional().describe("Additional note"),
    error: z.string().optional().describe("Error message"),
    hint: z.string().optional().describe("Helpful hint"),
  })
  .describe("pg_stat_kcache extension creation result");

/**
 * Output schema for pg_kcache_query_stats
 */
export const KcacheQueryStatsOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether query succeeded"),
    queries: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Query statistics with CPU/IO metrics"),
    count: z.number().optional().describe("Number of queries returned"),
    orderBy: z.string().optional().describe("Order by metric"),
    truncated: z.boolean().optional().describe("Results were truncated"),
    totalCount: z.number().optional().describe("Total available count"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Query statistics with OS-level metrics");

/**
 * Output schema for pg_kcache_top_cpu
 */
export const KcacheTopCpuOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether query succeeded"),
    topCpuQueries: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Top CPU-consuming queries"),
    count: z.number().optional().describe("Number of queries returned"),
    description: z.string().optional().describe("Result description"),
    truncated: z.boolean().optional().describe("Results were truncated"),
    totalCount: z.number().optional().describe("Total available count"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Top CPU-consuming queries result");

/**
 * Output schema for pg_kcache_top_io
 */
export const KcacheTopIoOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether query succeeded"),
    topIoQueries: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Top I/O-consuming queries"),
    count: z.number().optional().describe("Number of queries returned"),
    ioType: z
      .enum(["reads", "writes", "both"])
      .optional()
      .describe("I/O type ranked by"),
    description: z.string().optional().describe("Result description"),
    truncated: z.boolean().optional().describe("Results were truncated"),
    totalCount: z.number().optional().describe("Total available count"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Top I/O-consuming queries result");

/**
 * Output schema for pg_kcache_database_stats
 */
export const KcacheDatabaseStatsOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether query succeeded"),
    databaseStats: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Database-level statistics"),
    count: z.number().optional().describe("Number of databases"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Database-level aggregated statistics");

/**
 * Output schema for pg_kcache_resource_analysis
 */
export const KcacheResourceAnalysisOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether analysis succeeded"),
    queries: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Analyzed queries with resource classification"),
    count: z.number().optional().describe("Number of queries analyzed"),
    summary: z
      .object({
        cpuBound: z.number().describe("CPU-bound query count"),
        ioBound: z.number().describe("I/O-bound query count"),
        balanced: z.number().describe("Balanced query count"),
        threshold: z.number().describe("Classification threshold"),
      })
      .optional()
      .describe("Resource classification summary"),
    recommendations: z.array(z.string()).optional().describe("Recommendations"),
    truncated: z.boolean().optional().describe("Results were truncated"),
    totalCount: z.number().optional().describe("Total available count"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Resource classification analysis result");

/**
 * Output schema for pg_kcache_reset
 */
export const KcacheResetOutputSchema = z
  .object({
    success: z.boolean().describe("Whether reset succeeded"),
    message: z.string().optional().describe("Status message"),
    note: z.string().optional().describe("Additional note"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("pg_stat_kcache reset result");

// ============================================================================
// OUTPUT SCHEMAS - citext tools
// ============================================================================

/**
 * Output schema for pg_citext_create_extension
 */
export const CitextCreateExtensionOutputSchema = z
  .object({
    success: z.boolean().describe("Whether extension was enabled"),
    message: z.string().describe("Status message"),
    usage: z.string().describe("Usage information"),
  })
  .describe("citext extension creation result");

/**
 * Output schema for pg_citext_convert_column
 */
export const CitextConvertColumnOutputSchema = z
  .object({
    success: z.boolean().describe("Whether conversion succeeded"),
    message: z.string().optional().describe("Status message"),
    table: z.string().optional().describe("Qualified table name"),
    previousType: z.string().optional().describe("Previous column type"),
    wasAlreadyCitext: z
      .boolean()
      .optional()
      .describe("Column was already citext"),
    error: z.string().optional().describe("Error message"),
    currentType: z.string().optional().describe("Current column type"),
    allowedTypes: z
      .array(z.string())
      .optional()
      .describe("Allowed source types"),
    suggestion: z.string().optional().describe("Suggestion for resolution"),
    dependentViews: z
      .array(z.string())
      .optional()
      .describe("Views that depend on this column"),
    hint: z.string().optional().describe("Helpful hint"),
    affectedViews: z
      .array(z.string())
      .optional()
      .describe("Views affected by conversion"),
  })
  .describe("Column conversion result");

/**
 * Output schema for pg_citext_list_columns
 */
export const CitextListColumnsOutputSchema = z
  .object({
    columns: z
      .array(z.record(z.string(), z.unknown()))
      .describe("citext columns"),
    count: z.number().describe("Number of columns returned"),
    totalCount: z.number().describe("Total available count"),
    truncated: z.boolean().describe("Results were truncated"),
    limit: z.number().optional().describe("Limit applied"),
    schema: z.string().optional().describe("Schema filter applied"),
  })
  .describe("List of citext columns");

/**
 * Output schema for pg_citext_analyze_candidates
 */
export const CitextAnalyzeCandidatesOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether analysis succeeded"),
    candidates: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Candidate columns"),
    count: z.number().optional().describe("Number of candidates returned"),
    totalCount: z.number().optional().describe("Total available count"),
    truncated: z.boolean().optional().describe("Results were truncated"),
    limit: z.number().optional().describe("Limit applied"),
    table: z.string().optional().describe("Table filter applied"),
    schema: z.string().optional().describe("Schema filter applied"),
    summary: z
      .object({
        highConfidence: z.number().describe("High confidence count"),
        mediumConfidence: z.number().describe("Medium confidence count"),
      })
      .optional()
      .describe("Confidence summary"),
    recommendation: z.string().optional().describe("Recommendation"),
    excludedSchemas: z
      .array(z.string())
      .optional()
      .describe("Excluded schemas"),
    patternsUsed: z
      .array(z.string())
      .optional()
      .describe("Search patterns used"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Candidate analysis result");

/**
 * Output schema for pg_citext_compare
 */
export const CitextCompareOutputSchema = z
  .object({
    value1: z.string().describe("First value"),
    value2: z.string().describe("Second value"),
    citextEqual: z.boolean().optional().describe("citext equality result"),
    textEqual: z.boolean().describe("Text equality result"),
    lowerEqual: z.boolean().describe("Lowercase equality result"),
    extensionInstalled: z.boolean().describe("Whether citext is installed"),
    hint: z.string().optional().describe("Helpful hint"),
  })
  .describe("Comparison result");

/**
 * Output schema for pg_citext_schema_advisor
 */
export const CitextSchemaAdvisorOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether analysis succeeded"),
    table: z.string().optional().describe("Analyzed table"),
    recommendations: z
      .array(
        z.object({
          column: z.string().describe("Column name"),
          currentType: z.string().describe("Current data type"),
          previousType: z.string().optional().describe("Previous type"),
          recommendation: z
            .enum(["convert", "keep", "already_citext"])
            .describe("Recommendation"),
          confidence: z.enum(["high", "medium", "low"]).describe("Confidence"),
          reason: z.string().describe("Reason for recommendation"),
        }),
      )
      .optional()
      .describe("Column recommendations"),
    summary: z
      .object({
        totalTextColumns: z.number().describe("Total text columns"),
        recommendConvert: z.number().describe("Columns to convert"),
        highConfidence: z.number().describe("High confidence count"),
        alreadyCitext: z.number().describe("Already citext count"),
      })
      .optional()
      .describe("Summary statistics"),
    nextSteps: z.array(z.string()).optional().describe("Suggested next steps"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Schema advisor result");

// ============================================================================
// OUTPUT SCHEMAS - ltree tools
// ============================================================================

/**
 * Output schema for pg_ltree_create_extension
 */
export const LtreeCreateExtensionOutputSchema = z
  .object({
    success: z.boolean().describe("Whether extension was enabled"),
    message: z.string().describe("Status message"),
  })
  .describe("ltree extension creation result");

/**
 * Output schema for pg_ltree_query
 */
export const LtreeQueryOutputSchema = z
  .object({
    path: z.string().optional().describe("Query path"),
    mode: z.string().optional().describe("Query mode"),
    isPattern: z.boolean().optional().describe("Whether query uses patterns"),
    results: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Query results"),
    count: z.number().optional().describe("Number of results"),
    truncated: z.boolean().optional().describe("Results were truncated"),
    totalCount: z.number().optional().describe("Total available count"),
    success: z.boolean().optional().describe("Whether query succeeded"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Ltree query result");

/**
 * Output schema for pg_ltree_subpath
 */
export const LtreeSubpathOutputSchema = z
  .object({
    originalPath: z.string().describe("Original path"),
    offset: z.number().optional().describe("Offset used"),
    length: z
      .union([z.number(), z.string()])
      .optional()
      .describe("Length used"),
    subpath: z.string().optional().describe("Extracted subpath"),
    originalDepth: z.number().optional().describe("Original path depth"),
    pathDepth: z.number().optional().describe("Path depth for error"),
    success: z.boolean().optional().describe("Whether extraction succeeded"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Subpath extraction result");

/**
 * Output schema for pg_ltree_lca
 */
export const LtreeLcaOutputSchema = z
  .object({
    paths: z.array(z.string()).describe("Input paths"),
    longestCommonAncestor: z.string().describe("LCA path"),
    hasCommonAncestor: z.boolean().describe("Whether LCA exists"),
  })
  .describe("Longest common ancestor result");

/**
 * Output schema for pg_ltree_match
 */
export const LtreeMatchOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether match succeeded"),
    pattern: z.string().optional().describe("Query pattern"),
    results: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Matching results"),
    count: z.number().optional().describe("Number of results"),
    truncated: z.boolean().optional().describe("Results were truncated"),
    totalCount: z.number().optional().describe("Total available count"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Pattern match result");

/**
 * Output schema for pg_ltree_list_columns
 */
export const LtreeListColumnsOutputSchema = z
  .object({
    columns: z
      .array(z.record(z.string(), z.unknown()))
      .describe("ltree columns"),
    count: z.number().describe("Number of columns"),
  })
  .describe("List of ltree columns");

/**
 * Output schema for pg_ltree_convert_column
 */
export const LtreeConvertColumnOutputSchema = z
  .object({
    success: z.boolean().describe("Whether conversion succeeded"),
    message: z.string().optional().describe("Status message"),
    table: z.string().optional().describe("Qualified table name"),
    previousType: z.string().optional().describe("Previous column type"),
    wasAlreadyLtree: z
      .boolean()
      .optional()
      .describe("Column was already ltree"),
    error: z.string().optional().describe("Error message"),
    currentType: z.string().optional().describe("Current column type"),
    allowedTypes: z
      .array(z.string())
      .optional()
      .describe("Allowed source types"),
    suggestion: z.string().optional().describe("Suggestion for resolution"),
    dependentViews: z
      .array(z.string())
      .optional()
      .describe("Views that depend on this column"),
    hint: z.string().optional().describe("Helpful hint"),
  })
  .describe("Column conversion result");

/**
 * Output schema for pg_ltree_create_index
 */
export const LtreeCreateIndexOutputSchema = z
  .object({
    success: z.boolean().describe("Whether index was created"),
    message: z.string().optional().describe("Status message"),
    indexName: z.string().optional().describe("Index name"),
    alreadyExists: z.boolean().optional().describe("Index already existed"),
    table: z.string().optional().describe("Qualified table name"),
    column: z.string().optional().describe("Column name"),
    indexType: z.string().optional().describe("Index type (gist)"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Index creation result");

// ============================================================================
// OUTPUT SCHEMAS - pgcrypto tools
// ============================================================================

/**
 * Output schema for pg_pgcrypto_create_extension
 */
export const PgcryptoCreateExtensionOutputSchema = z
  .object({
    success: z.boolean().describe("Whether extension was enabled"),
    message: z.string().describe("Status message"),
  })
  .describe("pgcrypto extension creation result");

/**
 * Output schema for pg_pgcrypto_hash
 */
export const PgcryptoHashOutputSchema = z
  .object({
    success: z.boolean().describe("Whether hash succeeded"),
    algorithm: z.string().describe("Hash algorithm used"),
    encoding: z.string().describe("Output encoding"),
    hash: z.string().describe("Hash result"),
    inputLength: z.number().describe("Input data length"),
  })
  .describe("Hash result");

/**
 * Output schema for pg_pgcrypto_hmac
 */
export const PgcryptoHmacOutputSchema = z
  .object({
    success: z.boolean().describe("Whether HMAC succeeded"),
    algorithm: z.string().describe("HMAC algorithm used"),
    encoding: z.string().describe("Output encoding"),
    hmac: z.string().describe("HMAC result"),
  })
  .describe("HMAC result");

/**
 * Output schema for pg_pgcrypto_encrypt
 */
export const PgcryptoEncryptOutputSchema = z
  .object({
    success: z.boolean().describe("Whether encryption succeeded"),
    encrypted: z.string().optional().describe("Encrypted data"),
    encoding: z.string().optional().describe("Output encoding"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Encryption result");

/**
 * Output schema for pg_pgcrypto_decrypt
 */
export const PgcryptoDecryptOutputSchema = z
  .object({
    success: z.boolean().describe("Whether decryption succeeded"),
    decrypted: z.string().optional().describe("Decrypted data"),
    verified: z.boolean().optional().describe("Whether decryption verified"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Decryption result");

/**
 * Output schema for pg_pgcrypto_gen_random_uuid
 */
export const PgcryptoGenRandomUuidOutputSchema = z
  .object({
    success: z.boolean().describe("Whether generation succeeded"),
    uuids: z.array(z.string()).describe("Generated UUIDs"),
    count: z.number().describe("Number of UUIDs generated"),
    uuid: z.string().optional().describe("First UUID (for single requests)"),
  })
  .describe("UUID generation result");

/**
 * Output schema for pg_pgcrypto_gen_random_bytes
 */
export const PgcryptoGenRandomBytesOutputSchema = z
  .object({
    success: z.boolean().describe("Whether generation succeeded"),
    randomBytes: z.string().describe("Random bytes"),
    length: z.number().describe("Number of bytes"),
    encoding: z.string().describe("Output encoding"),
  })
  .describe("Random bytes generation result");

/**
 * Output schema for pg_pgcrypto_gen_salt
 */
export const PgcryptoGenSaltOutputSchema = z
  .object({
    success: z.boolean().describe("Whether salt generation succeeded"),
    salt: z.string().describe("Generated salt"),
    type: z.string().describe("Salt type"),
  })
  .describe("Salt generation result");

/**
 * Output schema for pg_pgcrypto_crypt
 */
export const PgcryptoCryptOutputSchema = z
  .object({
    success: z.boolean().describe("Whether password hashing succeeded"),
    hash: z.string().describe("Password hash"),
    algorithm: z.string().describe("Detected algorithm"),
  })
  .describe("Password crypt result");
