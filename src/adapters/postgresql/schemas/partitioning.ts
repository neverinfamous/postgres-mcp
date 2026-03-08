/**
 * postgres-mcp - Partitioning Tool Schemas
 *
 * Input validation schemas for table partitioning.
 * Includes parameter preprocessing to smooth common agent input mistakes.
 */

import { z } from "zod";

/**
 * Parse schema from schema.table format identifier
 * Returns { name, schema? } or undefined if input is undefined
 */
function parseSchemaFromIdentifier(
  value: string | undefined,
): { name: string; schema: string | undefined } | undefined {
  if (!value) return undefined;
  if (value.includes(".")) {
    const parts = value.split(".");
    return { name: parts[1] ?? value, schema: parts[0] };
  }
  return { name: value, schema: undefined };
}

/**
 * Helper type for raw partition input with common aliases
 */
interface RawPartitionInput {
  parent?: string;
  parentTable?: string; // Common alias for parent
  table?: string; // Common alias for parent
  name?: string;
  partitionName?: string; // Common alias for name AND partition
  partition?: string;
  partitionTable?: string; // Common alias for partition
  schema?: string;
  forValues?: string;
  isDefault?: boolean; // Create DEFAULT partition
  default?: boolean; // Alias for isDefault
  from?: string; // Alias for RANGE bounds
  to?: string; // Alias for RANGE bounds
  rangeFrom?: string; // Intuitive alias for RANGE bounds
  rangeTo?: string; // Intuitive alias for RANGE bounds
  values?: string[]; // Alias for LIST partition values
  listValues?: string[]; // Intuitive alias for LIST partition values
  modulus?: number; // Alias for HASH partition modulus
  remainder?: number; // Alias for HASH partition remainder
  hashModulus?: number; // Intuitive alias for HASH partition modulus
  hashRemainder?: number; // Intuitive alias for HASH partition remainder
  concurrently?: boolean;
  subpartitionBy?: string; // Sub-partition strategy (case-insensitive)
}

/**
 * Preprocess partition parameters to normalize common input patterns:
 * - parentTable → parent (common alias)
 * - table → parent (common alias)
 * - partitionName → name OR partition (common alias)
 * - partitionTable → partition (common alias)
 * - from/to → forValues (build RANGE bounds)
 * - values → forValues (build LIST bounds)
 * - modulus/remainder → forValues (build HASH bounds)
 */
function preprocessPartitionParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }

  const raw = input as RawPartitionInput;
  const result: RawPartitionInput & { schema?: string } = { ...raw };

  // Parse schema.table format from parent parameter
  const parsedParent = parseSchemaFromIdentifier(
    raw.parent ?? raw.parentTable ?? raw.table,
  );
  if (parsedParent?.schema && result.schema === undefined) {
    result.schema = parsedParent.schema;
    // Update the resolved parent to just the table name
    if (raw.parent?.includes(".")) result.parent = parsedParent.name;
    if (raw.parentTable?.includes(".")) result.parentTable = parsedParent.name;
    if (raw.table?.includes(".")) result.table = parsedParent.name;
  }

  // Parse schema.table format from partition parameter
  const parsedPartition = parseSchemaFromIdentifier(
    raw.partition ?? raw.partitionTable ?? raw.partitionName,
  );
  if (parsedPartition?.schema && result.schema === undefined) {
    result.schema = parsedPartition.schema;
  }
  // Update resolved partition to just the table name
  if (raw.partition?.includes(".") && parsedPartition) {
    result.partition = parsedPartition.name;
  }
  if (raw.partitionTable?.includes(".") && parsedPartition) {
    result.partitionTable = parsedPartition.name;
  }
  if (raw.partitionName?.includes(".") && parsedPartition) {
    result.partitionName = parsedPartition.name;
  }

  // Alias: parentTable → parent
  if (result.parentTable !== undefined && result.parent === undefined) {
    result.parent = result.parentTable;
  }

  // Alias: table → parent
  if (result.table !== undefined && result.parent === undefined) {
    result.parent = result.table;
  }

  // Alias: partitionName → name (for pg_create_partition)
  if (result.partitionName !== undefined && result.name === undefined) {
    result.name = result.partitionName;
  }

  // Alias: name → partitionName (for detachPartition API consistency in Code Mode)
  if (result.name !== undefined && result.partitionName === undefined) {
    result.partitionName = result.name;
  }

  // Alias: partitionName → partition (for pg_attach_partition, pg_detach_partition)
  if (result.partitionName !== undefined && result.partition === undefined) {
    result.partition = result.partitionName;
  }

  // Alias: partitionTable → partition
  if (result.partitionTable !== undefined && result.partition === undefined) {
    result.partition = result.partitionTable;
  }

  // Alias: rangeFrom → from, rangeTo → to
  if (result.rangeFrom !== undefined && result.from === undefined) {
    result.from = result.rangeFrom;
  }
  if (result.rangeTo !== undefined && result.to === undefined) {
    result.to = result.rangeTo;
  }

  // Build forValues from from/to for RANGE partitions
  if (
    result.from !== undefined &&
    result.to !== undefined &&
    result.forValues === undefined
  ) {
    result.forValues = `FROM ('${result.from}') TO ('${result.to}')`;
  }

  // Alias: listValues → values
  if (result.listValues !== undefined && result.values === undefined) {
    result.values = result.listValues;
  }

  // Build forValues from values array for LIST partitions
  if (
    result.values !== undefined &&
    Array.isArray(result.values) &&
    result.forValues === undefined
  ) {
    const quotedValues = result.values.map((v: string) => `'${v}'`).join(", ");
    result.forValues = `IN (${quotedValues})`;
  }

  // Alias: hashModulus → modulus, hashRemainder → remainder
  if (result.hashModulus !== undefined && result.modulus === undefined) {
    result.modulus = result.hashModulus;
  }
  if (result.hashRemainder !== undefined && result.remainder === undefined) {
    result.remainder = result.hashRemainder;
  }
  // Build forValues from modulus/remainder for HASH partitions
  if (
    result.modulus !== undefined &&
    result.remainder !== undefined &&
    result.forValues === undefined
  ) {
    result.forValues = `WITH (MODULUS ${String(result.modulus)}, REMAINDER ${String(result.remainder)})`;
  }

  // Alias: default → isDefault
  if (result.default === true && result.isDefault === undefined) {
    result.isDefault = result.default;
  }

  // Handle isDefault: true for DEFAULT partitions
  if (result.isDefault === true && result.forValues === undefined) {
    result.forValues = "__DEFAULT__"; // Special marker for handler
  }

  // Normalize subpartitionBy to lowercase (RANGE → range, LIST → list, HASH → hash)
  if (typeof result.subpartitionBy === "string") {
    result.subpartitionBy = result.subpartitionBy.toLowerCase();
  }

  return result;
}

/**
 * Preprocess CreatePartitionedTable parameters:
 * - Parse schema.table format from name (e.g., 'myschema.events' → schema: 'myschema', name: 'events')
 * - Normalize partitionBy to lowercase (RANGE → range)
 * - Alias: table → name
 * - Alias: key → partitionKey
 */
function preprocessCreatePartitionedTable(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }

  const result = { ...(input as Record<string, unknown>) };

  // Alias: table → name
  if (result["table"] !== undefined && result["name"] === undefined) {
    result["name"] = result["table"];
  }

  // Parse schema.table format from name parameter
  const nameValue = result["name"];
  if (typeof nameValue === "string" && nameValue.includes(".")) {
    const parsed = parseSchemaFromIdentifier(nameValue);
    if (parsed?.schema && result["schema"] === undefined) {
      result["schema"] = parsed.schema;
      result["name"] = parsed.name;
    }
  }

  // Alias: key → partitionKey
  if (result["key"] !== undefined && result["partitionKey"] === undefined) {
    result["partitionKey"] = result["key"];
  }

  // Normalize partitionBy to lowercase
  if (typeof result["partitionBy"] === "string") {
    result["partitionBy"] = result["partitionBy"].toLowerCase();
  }

  return result;
}

// Base schema for MCP visibility (no preprocessing)
// All fields optional in Base to prevent MCP-level Zod errors.
// Validation enforced via .refine() on the preprocessed Schema (handler-side try/catch).
export const CreatePartitionedTableSchemaBase = z.object({
  name: z.string().optional().describe("Table name"),
  schema: z.string().optional().describe("Schema name"),
  columns: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        nullable: z
          .boolean()
          .optional()
          .describe("Allow NULL values (default: true)"),
        notNull: z.boolean().optional().describe("Alias for nullable: false"),
        primaryKey: z
          .boolean()
          .optional()
          .describe("Create PRIMARY KEY constraint"),
        unique: z.boolean().optional().describe("Create UNIQUE constraint"),
        default: z
          .union([z.string(), z.number(), z.boolean(), z.null()])
          .optional()
          .describe("Default value"),
      }),
    )
    .optional()
    .default([])
    .describe("Column definitions"),
  partitionBy: z
    .string()
    .optional()
    .describe("Partition strategy (range, list, or hash)"),
  partitionKey: z.string().optional().describe("Partition key column(s)"),
  primaryKey: z
    .array(z.string())
    .optional()
    .describe(
      "Table-level primary key columns. Must include partition key column.",
    ),
});

// Preprocessed schema for handler parsing (with alias support)
export const CreatePartitionedTableSchema = z.preprocess(
  preprocessCreatePartitionedTable,
  CreatePartitionedTableSchemaBase.refine(
    (data) => typeof data.name === "string" && data.name.length > 0,
    {
      message: "name (or table alias) is required",
      path: ["name"],
    },
  ).refine(
    (data) => Array.isArray(data.columns) && data.columns.length > 0,
    {
      message: "columns must not be empty",
      path: ["columns"],
    },
  ).refine(
    (data) => typeof data.partitionBy === "string" && data.partitionBy.length > 0,
    {
      message: "partitionBy is required (range, list, or hash)",
      path: ["partitionBy"],
    },
  ).refine(
    (data) => typeof data.partitionKey === "string" && data.partitionKey.length > 0,
    {
      message: "partitionKey is required",
      path: ["partitionKey"],
    },
  ),
);

// Base schema for MCP visibility (with alias parameters for Split Schema compliance)
export const CreatePartitionSchemaBase = z.object({
  parent: z
    .string()
    .optional()
    .describe("Parent table name (aliases: parentTable, table)"),
  parentTable: z.string().optional().describe("Alias for parent"),
  table: z.string().optional().describe("Alias for parent"),
  name: z.string().optional().describe("Partition name (alias: partitionName)"),
  schema: z.string().optional().describe("Schema name"),
  forValues: z
    .string()
    .optional()
    .describe(
      "Raw SQL partition bounds string (REQUIRED). Examples: \"FROM ('2024-01-01') TO ('2024-07-01')\", \"IN ('US', 'CA')\", \"WITH (MODULUS 4, REMAINDER 0)\". For DEFAULT partitions, use isDefault: true instead",
    ),
  isDefault: z
    .boolean()
    .optional()
    .describe(
      "Create DEFAULT partition. Use instead of forValues for default partitions.",
    ),
  // Sub-partitioning support for multi-level partitions
  subpartitionBy: z
    .enum(["range", "list", "hash"])
    .optional()
    .describe(
      "Make this partition itself partitionable. For multi-level partitioning.",
    ),
  subpartitionKey: z
    .string()
    .optional()
    .describe(
      "Column(s) to partition sub-partitions by. Required if subpartitionBy is set.",
    ),
});

// Preprocessed schema for handler parsing (with alias support)
export const CreatePartitionSchema = z.preprocess(
  preprocessPartitionParams,
  CreatePartitionSchemaBase
    .refine(
      (data) =>
        data.parent !== undefined ||
        data.parentTable !== undefined ||
        data.table !== undefined,
      {
        message: "One of parent, parentTable, or table is required",
        path: ["parent"],
      },
    )
    .refine((data) => data.forValues !== undefined || data.isDefault === true, {
      message:
        "Either forValues or isDefault: true is required. Use isDefault: true for DEFAULT partitions.",
      path: ["forValues"],
    }),
);

// Base schema for MCP visibility (with alias parameters for Split Schema compliance)
export const AttachPartitionSchemaBase = z.object({
  parent: z
    .string()
    .optional()
    .describe("Parent table name (aliases: parentTable, table)"),
  parentTable: z.string().optional().describe("Alias for parent"),
  table: z.string().optional().describe("Alias for parent"),
  partition: z
    .string()
    .optional()
    .describe("Table to attach (aliases: partitionTable, partitionName)"),
  partitionTable: z.string().optional().describe("Alias for partition"),
  partitionName: z.string().optional().describe("Alias for partition"),
  schema: z
    .string()
    .optional()
    .describe("Schema name (auto-parsed from schema.table format)"),
  forValues: z
    .string()
    .optional()
    .describe(
      "Raw SQL partition bounds string (REQUIRED). Examples: \"FROM ('2024-01-01') TO ('2024-07-01')\", \"IN ('US', 'CA')\", \"WITH (MODULUS 4, REMAINDER 0)\". For DEFAULT partitions, use isDefault: true instead",
    ),
  isDefault: z
    .boolean()
    .optional()
    .describe(
      "Attach as DEFAULT partition. Use instead of forValues for default partitions.",
    ),
});

// Preprocessed schema for handler parsing (with alias support)
export const AttachPartitionSchema = z.preprocess(
  preprocessPartitionParams,
  AttachPartitionSchemaBase
    .refine(
      (data) =>
        data.parent !== undefined ||
        data.parentTable !== undefined ||
        data.table !== undefined,
      {
        message: "One of parent, parentTable, or table is required",
        path: ["parent"],
      },
    )
    .refine(
      (data) =>
        data.partition !== undefined ||
        data.partitionTable !== undefined ||
        data.partitionName !== undefined,
      {
        message:
          "One of partition, partitionTable, or partitionName is required",
        path: ["partition"],
      },
    )
    .refine(
      (data) => data.forValues !== undefined || data.isDefault === true,
      {
        message:
          "Either forValues or isDefault: true is required. Use isDefault: true for DEFAULT partitions.",
        path: ["forValues"],
      },
    ),
);

// Base schema for MCP visibility (with alias parameters for Split Schema compliance)
export const DetachPartitionSchemaBase = z.object({
  parent: z
    .string()
    .optional()
    .describe("Parent table name (aliases: parentTable, table)"),
  parentTable: z.string().optional().describe("Alias for parent"),
  table: z.string().optional().describe("Alias for parent"),
  partition: z
    .string()
    .optional()
    .describe("Partition to detach (aliases: partitionTable, partitionName)"),
  partitionTable: z.string().optional().describe("Alias for partition"),
  partitionName: z.string().optional().describe("Alias for partition"),
  schema: z
    .string()
    .optional()
    .describe("Schema name (auto-parsed from schema.table format)"),
  concurrently: z
    .boolean()
    .optional()
    .describe("Detach concurrently (non-blocking)"),
  finalize: z
    .boolean()
    .optional()
    .describe(
      "Complete an interrupted CONCURRENTLY detach. Only use after a prior CONCURRENTLY detach was interrupted.",
    ),
});

// Preprocessed schema for handler parsing (with alias support)
export const DetachPartitionSchema = z.preprocess(
  preprocessPartitionParams,
  DetachPartitionSchemaBase
    .refine(
      (data) =>
        data.parent !== undefined ||
        data.parentTable !== undefined ||
        data.table !== undefined,
      {
        message: "One of parent, parentTable, or table is required",
        path: ["parent"],
      },
    )
    .refine(
      (data) =>
        data.partition !== undefined ||
        data.partitionTable !== undefined ||
        data.partitionName !== undefined,
      {
        message:
          "One of partition, partitionTable, or partitionName is required",
        path: ["partition"],
      },
    ),
);

/**
 * Preprocess list/info parameters:
 * - Resolve table from aliases (table, parent, parentTable, name)
 * - Parse schema.table format
 */
function preprocessListInfoParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }

  interface ListInfoInput {
    table?: string | undefined;
    parent?: string | undefined;
    parentTable?: string | undefined;
    name?: string | undefined;
    schema?: string | undefined;
    limit?: number | undefined;
  }

  const raw = input as ListInfoInput;
  const result: ListInfoInput = { ...raw };

  // Resolve table from aliases
  const resolvedTable = raw.table ?? raw.parent ?? raw.parentTable ?? raw.name;
  if (resolvedTable !== undefined) {
    result.table = resolvedTable;
  }

  // Parse schema.table format
  if (result.table?.includes(".")) {
    const parts = result.table.split(".");
    result.schema ??= parts[0];
    result.table = parts[1] ?? result.table;
  }

  return result;
}

// Base schema for MCP visibility (with alias parameters for Split Schema compliance)
export const ListPartitionsSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  parent: z.string().optional().describe("Alias for table"),
  parentTable: z.string().optional().describe("Alias for table"),
  name: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name"),
  limit: z.coerce
    .number()
    .optional()
    .describe("Maximum partitions to return"),
});

// Preprocessed schema for handler parsing (with alias support)
export const ListPartitionsSchema = z.preprocess(
  preprocessListInfoParams,
  ListPartitionsSchemaBase.refine(
    (data) =>
      data.table !== undefined ||
      data.parent !== undefined ||
      data.parentTable !== undefined ||
      data.name !== undefined,
    {
      message: "One of table, parent, parentTable, or name is required",
      path: ["table"],
    },
  ),
);

// Base schema for MCP visibility (with alias parameters for Split Schema compliance)
export const PartitionInfoSchemaBase = z.object({
  table: z.string().optional().describe("Table name"),
  parent: z.string().optional().describe("Alias for table"),
  parentTable: z.string().optional().describe("Alias for table"),
  name: z.string().optional().describe("Alias for table"),
  schema: z.string().optional().describe("Schema name"),
});

// Preprocessed schema for handler parsing (with alias support)
export const PartitionInfoSchema = z.preprocess(
  preprocessListInfoParams,
  PartitionInfoSchemaBase.refine(
    (data) =>
      data.table !== undefined ||
      data.parent !== undefined ||
      data.parentTable !== undefined ||
      data.name !== undefined,
    {
      message: "One of table, parent, parentTable, or name is required",
      path: ["table"],
    },
  ),
);

// ============================================================================
// Output Schemas
// ============================================================================

/**
 * pg_list_partitions output
 */
export const ListPartitionsOutputSchema = z
  .object({
    partitions: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Partition list with name, bounds, size"),
    count: z.number().optional().describe("Number of partitions returned"),
    truncated: z
      .boolean()
      .optional()
      .describe("Whether results were truncated"),
    totalCount: z.number().optional().describe("Total count when truncated"),
    warning: z
      .string()
      .optional()
      .describe("Warning message if table not partitioned"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .loose();

/**
 * pg_create_partitioned_table output
 */
export const CreatePartitionedTableOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if operation failed"),
    table: z.string().optional().describe("Table name (schema.name)"),
    partitionBy: z.string().optional().describe("Partition strategy used"),
    partitionKey: z.string().optional().describe("Partition key column(s)"),
    primaryKey: z
      .array(z.string())
      .optional()
      .describe("Primary key columns if set"),
  })
  .loose();

/**
 * pg_create_partition output
 */
export const CreatePartitionOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether the operation succeeded"),
    error: z.string().optional().describe("Error message if operation failed"),
    partition: z.string().optional().describe("Partition name (schema.name)"),
    parent: z.string().optional().describe("Parent table name"),
    bounds: z.string().optional().describe("Partition bounds description"),
    subpartitionBy: z.string().optional().describe("Sub-partition strategy"),
    subpartitionKey: z.string().optional().describe("Sub-partition key"),
  })
  .loose();

/**
 * pg_attach_partition output
 */
export const AttachPartitionOutputSchema = z.object({
  success: z.boolean().optional().describe("Whether the operation succeeded"),
  error: z.string().optional().describe("Error message if operation failed"),
  parent: z.string().optional().describe("Parent table name"),
  partition: z.string().optional().describe("Attached partition name"),
  bounds: z.string().optional().describe("Partition bounds description"),
});

/**
 * pg_detach_partition output
 */
export const DetachPartitionOutputSchema = z.object({
  success: z.boolean().optional().describe("Whether the operation succeeded"),
  error: z.string().optional().describe("Error message if operation failed"),
  parent: z.string().optional().describe("Parent table name"),
  partition: z.string().optional().describe("Detached partition name"),
});

/**
 * pg_partition_info output
 */
export const PartitionInfoOutputSchema = z
  .object({
    tableInfo: z
      .record(z.string(), z.unknown())
      .nullable()
      .optional()
      .describe("Table partitioning info"),
    partitions: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Partition details with size and row counts"),
    totalSizeBytes: z
      .number()
      .optional()
      .describe("Total size of all partitions"),
    warning: z
      .string()
      .optional()
      .describe("Warning message if table not partitioned"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .loose();
