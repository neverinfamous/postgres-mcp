/**
 * PostgreSQL Statistics Tools - Math Utilities
 *
 * P-value calculation utilities and validation helpers
 * used by the advanced statistics tools.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";

// =============================================================================
// P-Value Calculation Utilities
// =============================================================================

/**
 * Log gamma function using Lanczos approximation.
 * Used for computing the incomplete beta function.
 */
function logGamma(x: number): number {
  // Lanczos coefficients (truncated to 14 significant digits for JS precision)
  const c0 = 76.18009172947;
  const c1 = -86.50532032942;
  const c2 = 24.01409824083;
  const c3 = -1.2317395724502;
  const c4 = 0.0012086509738662;
  const c5 = -0.000005395239385;

  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;

  y += 1;
  ser += c0 / y;
  y += 1;
  ser += c1 / y;
  y += 1;
  ser += c2 / y;
  y += 1;
  ser += c3 / y;
  y += 1;
  ser += c4 / y;
  y += 1;
  ser += c5 / y;

  return -tmp + Math.log((2.506628274631 * ser) / x);
}

/**
 * Regularized incomplete beta function using continued fraction expansion.
 * I_x(a,b) = B_x(a,b) / B(a,b)
 *
 * This is used to compute the CDF of the t-distribution.
 */
function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use symmetry relation if x > (a+1)/(a+b+2)
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - incompleteBeta(b, a, 1 - x);
  }

  // Compute the prefactor
  const lnBeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(
    Math.log(x) * a + Math.log(1 - x) * b - lnBeta - Math.log(a),
  );

  // Lentz's algorithm for continued fraction
  const maxIterations = 200;
  const epsilon = 1e-14;
  const tiny = 1e-30;

  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m;

    // Even step
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;

    // Odd step
    aa = -((a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;

    if (Math.abs(delta - 1) < epsilon) break;
  }

  return front * h;
}

/**
 * Cumulative distribution function for the t-distribution.
 * Uses the relationship between t-distribution and incomplete beta function.
 *
 * @param t - The t-statistic
 * @param df - Degrees of freedom
 * @returns Probability P(T <= t) for a t-distributed random variable
 */
function tDistributionCDF(t: number, df: number): number {
  const x = df / (df + t * t);
  const beta = incompleteBeta(df / 2, 0.5, x);

  if (t >= 0) {
    return 1 - 0.5 * beta;
  } else {
    return 0.5 * beta;
  }
}

/**
 * Calculate two-tailed p-value for a t-test.
 *
 * @param t - The t-statistic
 * @param df - Degrees of freedom
 * @returns Two-tailed p-value
 */
export function calculateTTestPValue(t: number, df: number): number {
  // Two-tailed: P(|T| > |t|) = 2 * P(T > |t|) = 2 * (1 - CDF(|t|))
  const absT = Math.abs(t);
  return 2 * (1 - tDistributionCDF(absT, df));
}

/**
 * Cumulative distribution function for the standard normal distribution.
 * Uses the error function approximation.
 *
 * @param z - The z-statistic
 * @returns Probability P(Z <= z) for a standard normal random variable
 */
function normalCDF(z: number): number {
  // Approximation using the error function
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);

  const t = 1 / (1 + p * x);
  const y =
    1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1 + sign * y);
}

/**
 * Calculate two-tailed p-value for a z-test.
 *
 * @param z - The z-statistic
 * @returns Two-tailed p-value
 */
export function calculateZTestPValue(z: number): number {
  // Two-tailed: P(|Z| > |z|) = 2 * P(Z > |z|) = 2 * (1 - CDF(|z|))
  const absZ = Math.abs(z);
  return 2 * (1 - normalCDF(absZ));
}

// =============================================================================
// Validation Helpers
// =============================================================================

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
  const numericTypes = [
    "integer",
    "bigint",
    "smallint",
    "numeric",
    "decimal",
    "real",
    "double precision",
    "money",
  ];

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
      throw new Error(`Table "${schema}.${table}" not found`);
    }
    throw new Error(
      `Column "${column}" not found in table "${schema}.${table}"`,
    );
  }

  if (!numericTypes.includes(typeRow.data_type)) {
    throw new Error(
      `Column "${column}" is type "${typeRow.data_type}" but must be a numeric type for statistical analysis`,
    );
  }
}

/**
 * Validate that a table exists (for tools that don't require a specific column).
 * Throws user-friendly error message for missing table.
 */
export async function validateTableExists(
  adapter: PostgresAdapter,
  table: string,
  schema: string,
): Promise<void> {
  const tableCheckQuery = `
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = $1 AND table_name = $2
  `;
  const tableResult = await adapter.executeQuery(tableCheckQuery, [
    schema,
    table,
  ]);
  if (tableResult.rows?.length === 0) {
    throw new Error(`Table "${schema}.${table}" not found`);
  }
}
