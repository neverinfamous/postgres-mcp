/**
 * postgres-mcp - Statistics Schema Preprocessing
 *
 * Parameter preprocessing / alias normalization functions for stats tools.
 * Handles tableName→table, col→column, schema.table parsing, percentile normalization, etc.
 */

// =============================================================================
// Schema.Table Parsing
// =============================================================================

/**
 * Parse schema.table format from table name.
 * Returns { table, schema } with schema extracted from prefix if present.
 * Embedded schema takes priority over explicit schema parameter.
 */
export function parseSchemaTable(
  table: string,
  explicitSchema?: string,
): { table: string; schema: string } {
  if (table.includes(".")) {
    const parts = table.split(".");
    if (parts.length === 2 && parts[0] && parts[1]) {
      return {
        schema: parts[0],
        table: parts[1],
      };
    }
  }
  return { table, schema: explicitSchema ?? "public" };
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Valid interval units for time series analysis
 */
export const VALID_INTERVALS = [
  "second",
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "year",
] as const;

/**
 * Interval shorthand mappings
 */
export const INTERVAL_SHORTHANDS: Record<string, string> = {
  daily: "day",
  hourly: "hour",
  weekly: "week",
  monthly: "month",
  yearly: "year",
  minutely: "minute",
};

// =============================================================================
// Preprocessing Functions
// =============================================================================

/**
 * Preprocess basic stats parameters to normalize common input patterns:
 * - tableName → table
 * - col → column
 * - Auto-normalize percentiles from 0-100 to 0-1 format
 * - Replace empty percentiles array with defaults
 */
export function preprocessBasicStatsParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  const result = { ...(input as Record<string, unknown>) };
  // Alias: tableName → table
  if (result["tableName"] !== undefined && result["table"] === undefined) {
    result["table"] = result["tableName"];
  }
  // Alias: col → column
  if (result["col"] !== undefined && result["column"] === undefined) {
    result["column"] = result["col"];
  }
  // Alias: filter → where
  if (result["filter"] !== undefined && result["where"] === undefined) {
    result["where"] = result["filter"];
  }
  // Alias: fractions → percentiles
  if (result["fractions"] !== undefined && result["percentiles"] === undefined) {
    result["percentiles"] = result["fractions"];
  }
  // Parse schema.table format (embedded schema takes priority)
  if (typeof result["table"] === "string" && result["table"].includes(".")) {
    const parsed = parseSchemaTable(
      result["table"],
      result["schema"] as string | undefined,
    );
    result["table"] = parsed.table;
    result["schema"] = parsed.schema;
  }
  // Handle percentiles: normalize 0-100 to 0-1 and replace empty array
  if (Array.isArray(result["percentiles"])) {
    if (result["percentiles"].length === 0) {
      // Empty array → use defaults
      result["percentiles"] = [0.25, 0.5, 0.75];
    } else {
      // Determine format: if ALL values are in 0-1, treat as already normalized
      // If ANY value > 1 (but <= 100), treat as 0-100 format and divide all by 100
      // If ANY value > 100, it's an error (will be caught by refine validation after normalization)
      const pctiles = result["percentiles"] as number[];
      const hasValuesInZeroToOne = pctiles.some(
        (p) => typeof p === "number" && p > 0 && p <= 1,
      );
      const hasValuesOver1 = pctiles.some(
        (p) => typeof p === "number" && p > 1,
      );
      const hasValuesOver100 = pctiles.some(
        (p) => typeof p === "number" && p > 100,
      );

      // Detect mixed scales: some values in 0-1 range and some in 1-100 range
      // This produces unexpected keys (e.g., [0.1, 50] → p0, p50 not p10, p50)
      if (hasValuesInZeroToOne && hasValuesOver1 && !hasValuesOver100) {
        result["_percentileScaleWarning"] =
          "Mixed percentile scales detected: some values appear to be in 0-1 format while others are in 0-100 format. " +
          "When max > 1, all values are treated as 0-100 scale. For example, [0.1, 50] produces p0 and p50, not p10 and p50. " +
          "Use consistent scale (all 0-1 or all 0-100) for expected results.";
      }

      if (hasValuesOver100) {
        // Leave as-is - will fail validation with clear error
      } else if (hasValuesOver1) {
        // Normalize 0-100 format to 0-1
        result["percentiles"] = pctiles.map((p) =>
          typeof p === "number" ? p / 100 : p,
        );
      }
      // else: already in 0-1 format, no change needed
    }
  }
  return result;
}

/**
 * Preprocess correlation parameters:
 * - tableName → table
 * - col1/col2 → column1/column2
 */
export function preprocessCorrelationParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  const result = { ...(input as Record<string, unknown>) };
  // Alias: tableName → table
  if (result["tableName"] !== undefined && result["table"] === undefined) {
    result["table"] = result["tableName"];
  }
  // Alias: x → column1
  if (result["x"] !== undefined && result["column1"] === undefined) {
    result["column1"] = result["x"];
  }
  // Alias: y → column2
  if (result["y"] !== undefined && result["column2"] === undefined) {
    result["column2"] = result["y"];
  }
  // Alias: col1 → column1
  if (result["col1"] !== undefined && result["column1"] === undefined) {
    result["column1"] = result["col1"];
  }
  // Alias: col2 → column2
  if (result["col2"] !== undefined && result["column2"] === undefined) {
    result["column2"] = result["col2"];
  }
  // Alias: filter → where
  if (result["filter"] !== undefined && result["where"] === undefined) {
    result["where"] = result["filter"];
  }
  // Parse schema.table format (embedded schema takes priority)
  if (typeof result["table"] === "string" && result["table"].includes(".")) {
    const parsed = parseSchemaTable(
      result["table"],
      result["schema"] as string | undefined,
    );
    result["table"] = parsed.table;
    result["schema"] = parsed.schema;
  }
  return result;
}

/**
 * Preprocess regression parameters:
 * - tableName → table
 * - x → xColumn
 * - y → yColumn
 * - column1 → xColumn (for consistency with correlation)
 * - column2 → yColumn (for consistency with correlation)
 */
export function preprocessRegressionParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  const result = { ...(input as Record<string, unknown>) };
  // Alias: tableName → table
  if (result["tableName"] !== undefined && result["table"] === undefined) {
    result["table"] = result["tableName"];
  }
  // Alias: x → xColumn
  if (result["x"] !== undefined && result["xColumn"] === undefined) {
    result["xColumn"] = result["x"];
  }
  // Alias: independentColumn → xColumn
  if (result["independentColumn"] !== undefined && result["xColumn"] === undefined) {
    result["xColumn"] = result["independentColumn"];
  }
  // Alias: y → yColumn
  if (result["y"] !== undefined && result["yColumn"] === undefined) {
    result["yColumn"] = result["y"];
  }
  // Alias: dependentColumn → yColumn
  if (result["dependentColumn"] !== undefined && result["yColumn"] === undefined) {
    result["yColumn"] = result["dependentColumn"];
  }
  // Alias: column1 → xColumn (for consistency with correlation)
  if (result["column1"] !== undefined && result["xColumn"] === undefined) {
    result["xColumn"] = result["column1"];
  }
  // Alias: column2 → yColumn (for consistency with correlation)
  if (result["column2"] !== undefined && result["yColumn"] === undefined) {
    result["yColumn"] = result["column2"];
  }
  // Alias: filter → where
  if (result["filter"] !== undefined && result["where"] === undefined) {
    result["where"] = result["filter"];
  }
  // Parse schema.table format (embedded schema takes priority)
  if (typeof result["table"] === "string" && result["table"].includes(".")) {
    const parsed = parseSchemaTable(
      result["table"],
      result["schema"] as string | undefined,
    );
    result["table"] = parsed.table;
    result["schema"] = parsed.schema;
  }
  return result;
}

/**
 * Preprocess time series parameters:
 * - Extract interval unit from PostgreSQL-style intervals ('1 day' → 'day', '2 hours' → 'hour')
 * - Normalize to lowercase
 * - Handle shorthands: daily→day, hourly→hour, weekly→week, monthly→month
 * - Alias: column → valueColumn, time → timeColumn
 * - Alias: tableName → table
 * - Default interval to 'day' if not provided
 */
export function preprocessTimeSeriesParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }

  const result = { ...(input as Record<string, unknown>) };

  // Alias: tableName → table
  if (result["tableName"] !== undefined && result["table"] === undefined) {
    result["table"] = result["tableName"];
  }

  // Alias: column → valueColumn
  if (result["column"] !== undefined && result["valueColumn"] === undefined) {
    result["valueColumn"] = result["column"];
  }

  // Alias: value → valueColumn
  if (result["value"] !== undefined && result["valueColumn"] === undefined) {
    result["valueColumn"] = result["value"];
  }

  // Alias: time → timeColumn
  if (result["time"] !== undefined && result["timeColumn"] === undefined) {
    result["timeColumn"] = result["time"];
  }

  // Alias: bucket → interval
  if (result["bucket"] !== undefined && result["interval"] === undefined) {
    result["interval"] = result["bucket"];
  }

  if (typeof result["interval"] === "string") {
    let interval = result["interval"].toLowerCase().trim();

    // Handle shorthands: daily → day, hourly → hour, etc.
    const shorthand = INTERVAL_SHORTHANDS[interval];
    if (shorthand !== undefined) {
      interval = shorthand;
    }

    // Extract unit from PostgreSQL-style interval: '1 day', '2 hours', etc.
    const match = /^\d+\s*(\w+?)s?$/.exec(interval);
    if (match?.[1] !== undefined) {
      interval = match[1];
    }

    // Handle plural forms: 'days' → 'day', 'hours' → 'hour'
    if (
      interval.endsWith("s") &&
      VALID_INTERVALS.includes(
        interval.slice(0, -1) as (typeof VALID_INTERVALS)[number],
      )
    ) {
      interval = interval.slice(0, -1);
    }

    result["interval"] = interval;
  } else if (result["interval"] === undefined) {
    // Default interval to 'day' if not provided
    result["interval"] = "day";
  }

  // Alias: filter → where
  if (result["filter"] !== undefined && result["where"] === undefined) {
    result["where"] = result["filter"];
  }

  // Parse schema.table format (embedded schema takes priority)
  if (typeof result["table"] === "string" && result["table"].includes(".")) {
    const parsed = parseSchemaTable(
      result["table"],
      result["schema"] as string | undefined,
    );
    result["table"] = parsed.table;
    result["schema"] = parsed.schema;
  }

  return result;
}

/**
 * Preprocess hypothesis test parameters:
 * - Normalize testType variants: 'ttest', 't-test', 'T_TEST' → 't_test'
 * - Default testType to 't_test' if not provided
 * - Alias: tableName → table, col → column
 */
export function preprocessHypothesisParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }

  const result = { ...(input as Record<string, unknown>) };

  // Alias: tableName → table
  if (result["tableName"] !== undefined && result["table"] === undefined) {
    result["table"] = result["tableName"];
  }

  // Alias: col → column
  if (result["col"] !== undefined && result["column"] === undefined) {
    result["column"] = result["col"];
  }

  if (typeof result["testType"] === "string") {
    const normalized = result["testType"].toLowerCase().trim();

    // t_test variants: t, ttest, t-test, t_test, T_TEST
    if (normalized === "t" || /^t[-_]?test$/.test(normalized)) {
      result["testType"] = "t_test";
    }
    // z_test variants: z, ztest, z-test, z_test, Z_TEST
    else if (normalized === "z" || /^z[-_]?test$/.test(normalized)) {
      result["testType"] = "z_test";
    }
  } else if (result["testType"] === undefined) {
    // Auto-detect: if populationStdDev or sigma provided, default to z_test
    if (
      result["populationStdDev"] !== undefined ||
      result["sigma"] !== undefined
    ) {
      result["testType"] = "z_test";
    } else {
      // Default testType to 't_test' if not provided
      result["testType"] = "t_test";
    }
  }

  // Alias: filter → where
  if (result["filter"] !== undefined && result["where"] === undefined) {
    result["where"] = result["filter"];
  }

  // Parse schema.table format (embedded schema takes priority)
  if (typeof result["table"] === "string" && result["table"].includes(".")) {
    const parsed = parseSchemaTable(
      result["table"],
      result["schema"] as string | undefined,
    );
    result["table"] = parsed.table;
    result["schema"] = parsed.schema;
  }

  return result;
}

/**
 * Preprocess distribution parameters:
 * - Alias: tableName → table, col → column
 */
export function preprocessDistributionParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  const result = { ...(input as Record<string, unknown>) };
  // Alias: tableName → table
  if (result["tableName"] !== undefined && result["table"] === undefined) {
    result["table"] = result["tableName"];
  }
  // Alias: col → column
  if (result["col"] !== undefined && result["column"] === undefined) {
    result["column"] = result["col"];
  }
  // Alias: filter → where
  if (result["filter"] !== undefined && result["where"] === undefined) {
    result["where"] = result["filter"];
  }
  // Parse schema.table format (embedded schema takes priority)
  if (typeof result["table"] === "string" && result["table"].includes(".")) {
    const parsed = parseSchemaTable(
      result["table"],
      result["schema"] as string | undefined,
    );
    result["table"] = parsed.table;
    result["schema"] = parsed.schema;
  }
  return result;
}

/**
 * Preprocess sampling parameters:
 * - Alias: tableName → table, columns → select
 */
export function preprocessSamplingParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  const result = { ...(input as Record<string, unknown>) };
  // Alias: tableName → table
  if (result["tableName"] !== undefined && result["table"] === undefined) {
    result["table"] = result["tableName"];
  }
  // Alias: columns → select
  if (result["columns"] !== undefined && result["select"] === undefined) {
    result["select"] = result["columns"];
  }
  // Alias: filter → where
  if (result["filter"] !== undefined && result["where"] === undefined) {
    result["where"] = result["filter"];
  }
  // Parse schema.table format (embedded schema takes priority)
  if (typeof result["table"] === "string" && result["table"].includes(".")) {
    const parsed = parseSchemaTable(
      result["table"],
      result["schema"] as string | undefined,
    );
    result["table"] = parsed.table;
    result["schema"] = parsed.schema;
  }
  return result;
}
