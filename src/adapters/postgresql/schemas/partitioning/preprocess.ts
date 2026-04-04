/**
 * postgres-mcp — Partitioning Preprocessing
 *
 * Preprocessing functions to normalize partition parameters.
 * Handles aliases, schema.table parsing, and bounds construction.
 */



/**
 * Parse schema from schema.table format identifier
 * Returns { name, schema? } or undefined if input is undefined
 */
export function parseSchemaFromIdentifier(
  value: unknown,
): { name: string; schema: string | undefined } | { name: unknown; schema: undefined } | undefined {
  if (!value) return undefined;
  if (typeof value === "string" && value.includes(".")) {
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
export function preprocessPartitionParams(input: unknown): unknown {
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
    if (typeof raw.parent === "string" && raw.parent.includes(".") && typeof parsedParent.name === "string") result.parent = parsedParent.name;
    if (typeof raw.parentTable === "string" && raw.parentTable.includes(".") && typeof parsedParent.name === "string") result.parentTable = parsedParent.name;
    if (typeof raw.table === "string" && raw.table.includes(".") && typeof parsedParent.name === "string") result.table = parsedParent.name;
  }

  // Parse schema.table format from partition parameter
  const parsedPartition = parseSchemaFromIdentifier(
    raw.partition ?? raw.partitionTable ?? raw.partitionName,
  );
  if (parsedPartition?.schema && result.schema === undefined) {
    result.schema = parsedPartition.schema;
  }
  // Update resolved partition to just the table name
  if (typeof raw.partition === "string" && raw.partition.includes(".") && parsedPartition && typeof parsedPartition.name === "string") {
    result.partition = parsedPartition.name;
  }
  if (typeof raw.partitionTable === "string" && raw.partitionTable.includes(".") && parsedPartition && typeof parsedPartition.name === "string") {
    result.partitionTable = parsedPartition.name;
  }
  if (typeof raw.partitionName === "string" && raw.partitionName.includes(".") && parsedPartition && typeof parsedPartition.name === "string") {
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