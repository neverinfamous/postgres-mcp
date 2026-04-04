/**
 * postgres-mcp — Partitioning Schemas: Range (Mutating Operations)
 *
 * Input validation schemas for creating, attaching, and detaching partitions.
 * Includes parameter preprocessing to smooth common agent input mistakes.
 */

import { z } from "zod";
import { ErrorResponseFields } from "../error-response-fields.js";

import {
  parseSchemaFromIdentifier,
  preprocessPartitionParams,
} from "./preprocess.js";


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
  table: z.string().optional().describe("Alias for name"),
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
  key: z.string().optional().describe("Alias for partitionKey"),
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
  )
    .refine((data) => Array.isArray(data.columns) && data.columns.length > 0, {
      message: "columns must not be empty",
      path: ["columns"],
    })
    .refine(
      (data) =>
        typeof data.partitionBy === "string" &&
        ["range", "list", "hash"].includes(data.partitionBy),
      {
        message: "partitionBy is required (range, list, or hash)",
        path: ["partitionBy"],
      },
    )
    .refine(
      (data) =>
        typeof data.partitionKey === "string" && data.partitionKey.length > 0,
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
  partitionName: z.string().optional().describe("Alias for name"),
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
  default: z.boolean().optional().describe("Alias for isDefault"),
  from: z.string().optional().describe("RANGE bound start"),
  to: z.string().optional().describe("RANGE bound end"),
  rangeFrom: z.string().optional().describe("RANGE bound start"),
  rangeTo: z.string().optional().describe("RANGE bound end"),
  values: z.array(z.string()).optional().describe("LIST partition values"),
  listValues: z.array(z.string()).optional().describe("LIST partition values"),
  modulus: z.number().optional().describe("HASH partition modulus"),
  remainder: z.number().optional().describe("HASH partition remainder"),
  hashModulus: z.number().optional().describe("HASH partition modulus"),
  hashRemainder: z.number().optional().describe("HASH partition remainder"),
  // Sub-partitioning support for multi-level partitions
  subpartitionBy: z
    .string()
    .optional()
    .describe(
      "Make this partition itself partitionable. For multi-level partitioning. Accepts: range, list, hash.",
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
  CreatePartitionSchemaBase.refine(
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
        data.name !== undefined ||
        data.partitionName !== undefined,
      {
        message: "One of name or partitionName is required",
        path: ["name"],
      },
    )
    .refine((data) => data.forValues !== undefined || data.isDefault === true, {
      message:
        "Either forValues or isDefault: true is required. Use isDefault: true for DEFAULT partitions.",
      path: ["forValues"],
    })
    .refine(
      (data) =>
        data.subpartitionBy === undefined ||
        (typeof data.subpartitionBy === "string" &&
          ["range", "list", "hash"].includes(data.subpartitionBy.toLowerCase())),
      {
        message: "subpartitionBy must be range, list, or hash",
        path: ["subpartitionBy"],
      },
    ),
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
  default: z.boolean().optional().describe("Alias for isDefault"),
  from: z.string().optional().describe("RANGE bound start"),
  to: z.string().optional().describe("RANGE bound end"),
  rangeFrom: z.string().optional().describe("RANGE bound start"),
  rangeTo: z.string().optional().describe("RANGE bound end"),
  values: z.array(z.string()).optional().describe("LIST partition values"),
  listValues: z.array(z.string()).optional().describe("LIST partition values"),
  modulus: z.number().optional().describe("HASH partition modulus"),
  remainder: z.number().optional().describe("HASH partition remainder"),
  hashModulus: z.number().optional().describe("HASH partition modulus"),
  hashRemainder: z.number().optional().describe("HASH partition remainder"),
});

// Preprocessed schema for handler parsing (with alias support)
export const AttachPartitionSchema = z.preprocess(
  preprocessPartitionParams,
  AttachPartitionSchemaBase.refine(
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
    .refine((data) => data.forValues !== undefined || data.isDefault === true, {
      message:
        "Either forValues or isDefault: true is required. Use isDefault: true for DEFAULT partitions.",
      path: ["forValues"],
    }),
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
  DetachPartitionSchemaBase.refine(
    (data) =>
      data.parent !== undefined ||
      data.parentTable !== undefined ||
      data.table !== undefined,
    {
      message: "One of parent, parentTable, or table is required",
      path: ["parent"],
    },
  ).refine(
    (data) =>
      data.partition !== undefined ||
      data.partitionTable !== undefined ||
      data.partitionName !== undefined,
    {
      message: "One of partition, partitionTable, or partitionName is required",
      path: ["partition"],
    },
  ),
);

// ============================================================================
// Output Schemas
// ============================================================================

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
}).extend(ErrorResponseFields.shape);

/**
 * pg_detach_partition output
 */
export const DetachPartitionOutputSchema = z.object({
  success: z.boolean().optional().describe("Whether the operation succeeded"),
  error: z.string().optional().describe("Error message if operation failed"),
  parent: z.string().optional().describe("Parent table name"),
  partition: z.string().optional().describe("Detached partition name"),
}).extend(ErrorResponseFields.shape);
