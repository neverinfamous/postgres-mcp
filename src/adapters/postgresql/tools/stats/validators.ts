/**
 * PostgreSQL Statistics Tools - Column Validation
 *
 * Shared validator for numeric column requirements.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import { ValidationError } from "../../../../types/errors.js";

/**
 * Numeric types supported by PostgreSQL statistical functions.
 */
const NUMERIC_TYPES = [
  "integer",
  "bigint",
  "smallint",
  "numeric",
  "decimal",
  "real",
  "double precision",
  "money",
];

/**
 * Validate that a table exists and a column is numeric.
 * Throws user-friendly error messages for missing table/column.
 */
export async function validateNumericColumn(
  adapter: PostgresAdapter,
  table: string,
  column: string,
  schema: string,
): Promise<void> {
  const typeCheckQuery = `
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = $1
    AND table_name = $2
    AND column_name = $3
  `;
  const typeResult = await adapter.executeQuery(typeCheckQuery, [
    schema,
    table,
    column,
  ]);
  const typeRow = typeResult.rows?.[0] as { data_type: string } | undefined;

  if (!typeRow) {
    // Check if table exists
    const tableCheckQuery = `
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = $1 AND table_name = $2
    `;
    const tableResult = await adapter.executeQuery(tableCheckQuery, [
      schema,
      table,
    ]);
    if (tableResult.rows?.length === 0) {
      throw new ValidationError(`Table "${schema}.${table}" not found`);
    }
    throw new ValidationError(
      `Column "${column}" not found in table "${schema}.${table}"`,
    );
  }

  if (!NUMERIC_TYPES.includes(typeRow.data_type)) {
    throw new ValidationError(
      `Column "${column}" is type "${typeRow.data_type}" but must be a numeric type for statistical analysis`,
    );
  }
}
