/**
 * postgres-mcp — Partitioning Schemas: List & Info (Read-Only Operations)
 *
 * Input validation schemas for listing partitions and partition info queries.
 * Includes parameter preprocessing and output schemas.
 */

import { z } from "zod";

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

  const raw = input as Record<string, unknown>;
  const result: ListInfoInput = { ...(raw as ListInfoInput) };

  // Resolve table from aliases
  const resolvedTable =
    (raw["table"] as string) ??
    (raw["parent"] as string) ??
    (raw["parentTable"] as string) ??
    (raw["name"] as string);
  if (resolvedTable !== undefined) {
    result.table = resolvedTable;
  }

  // Parse schema.table format
  if (result.table?.includes(".")) {
    const parts = result.table.split(".");
    result.schema ??= parts[0];
    result.table = parts[1] ?? result.table;
  }

  // Safe numeric coercion for limit (Optional Numeric Param Relaxation Pattern)
  if (raw["limit"] !== undefined) {
    const n = Number(raw["limit"]);
    result.limit = Number.isFinite(n) ? n : undefined;
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
  limit: z.any().optional().describe("Maximum partitions to return"),
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
