/**
 * PostgreSQL Statistics Tools - Hypothesis Testing
 *
 * Perform one-sample t-test or z-test against a hypothesized mean.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerError } from "../core/error-helpers.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import {
  calculateTTestPValue,
  calculateZTestPValue,
  validateNumericColumn,
} from "./math-utils.js";
import {
  StatsHypothesisSchemaBase,
  StatsHypothesisSchema,
  HypothesisOutputSchema,
} from "../../schemas/index.js";

/**
 * Hypothesis testing (t-test or z-test)
 */
export function createStatsHypothesisTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stats_hypothesis",
    description:
      "Perform one-sample t-test or z-test against a hypothesized mean. For z-test, provide populationStdDev (sigma) for accurate results. Use groupBy to test each group separately.",
    group: "stats",
    inputSchema: StatsHypothesisSchemaBase, // Base schema for MCP visibility
    outputSchema: HypothesisOutputSchema,
    annotations: readOnly("Hypothesis Testing"),
    icons: getToolIcons("stats", readOnly("Hypothesis Testing")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const {
          table,
          column,
          testType,
          hypothesizedMean,
          populationStdDev,
          schema,
          where,
          params: queryParams,
          groupBy,
        } = StatsHypothesisSchema.parse(params) as {
          table: string;
          column: string;
          testType: string;
          hypothesizedMean: number;
          populationStdDev?: number;
          groupBy?: string;
          schema?: string;
          where?: string;
          params?: unknown[];
        };

        const schemaName = schema ?? "public";
        const schemaPrefix = schema ? `"${schema}".` : "";
        const whereClause = where ? `WHERE ${sanitizeWhereClause(where)}` : "";

        // Validate column exists and is numeric
        await validateNumericColumn(adapter, table, column, schemaName);

        // Helper to calculate test results from row stats
        const calculateTestResults = (
          n: number,
          sampleMean: number,
          sampleStdDev: number,
        ):
          | {
              sampleSize: number;
              sampleMean: number;
              sampleStdDev: number;
              populationStdDev: number | null;
              standardError: number;
              testStatistic: number;
              pValue: number;
              degreesOfFreedom: number | null;
              interpretation: string;
              note: string;
            }
          | { error: string; sampleSize: number } => {
          if (n < 2 || isNaN(sampleStdDev) || sampleStdDev === 0) {
            return {
              error: "Insufficient data or zero variance",
              sampleSize: n,
            };
          }

          let stddevUsed: number;
          let stddevNote: string | undefined;

          if (testType === "z_test") {
            if (populationStdDev !== undefined) {
              stddevUsed = populationStdDev;
            } else {
              stddevUsed = sampleStdDev;
              stddevNote =
                "No populationStdDev provided; using sample stddev (less accurate for z-test)";
            }
          } else {
            stddevUsed = sampleStdDev;
          }

          const standardError = stddevUsed / Math.sqrt(n);
          const testStatistic = (sampleMean - hypothesizedMean) / standardError;
          const degreesOfFreedom = n - 1;

          // Calculate p-value based on test type
          const pValue =
            testType === "z_test"
              ? calculateZTestPValue(testStatistic)
              : calculateTTestPValue(testStatistic, degreesOfFreedom);

          // Round p-value to 6 decimal places for cleaner output
          const pValueRounded = Math.round(pValue * 1e6) / 1e6;

          // Determine significance based on p-value
          let interpretation: string;
          if (pValueRounded < 0.001) {
            interpretation =
              "Highly significant (p < 0.001): Strong evidence against the null hypothesis";
          } else if (pValueRounded < 0.01) {
            interpretation =
              "Very significant (p < 0.01): Strong evidence against the null hypothesis";
          } else if (pValueRounded < 0.05) {
            interpretation =
              "Significant (p < 0.05): Evidence against the null hypothesis at α=0.05 level";
          } else if (pValueRounded < 0.1) {
            interpretation =
              "Marginally significant (p < 0.1): Weak evidence against the null hypothesis";
          } else {
            interpretation =
              "Not significant (p ≥ 0.1): Insufficient evidence to reject the null hypothesis";
          }

          // Build note with warnings
          let noteText =
            stddevNote ??
            "Two-tailed p-value calculated using numerical approximation";
          if (n < 30) {
            noteText =
              `Small sample size (n=${String(n)}): results may be less reliable. ` +
              noteText;
          }

          return {
            sampleSize: n,
            sampleMean,
            sampleStdDev,
            populationStdDev:
              testType === "z_test" ? (populationStdDev ?? null) : null,
            standardError,
            testStatistic,
            pValue: pValueRounded,
            degreesOfFreedom: testType === "t_test" ? degreesOfFreedom : null,
            interpretation,
            note: noteText,
          };
        };

        if (groupBy !== undefined) {
          // Grouped hypothesis tests
          const sql = `
                    SELECT
                        "${groupBy}" as group_key,
                        COUNT("${column}") as n,
                        AVG("${column}")::numeric(20,6) as mean,
                        STDDEV_SAMP("${column}")::numeric(20,6) as stddev
                    FROM ${schemaPrefix}"${table}"
                    ${whereClause}
                    GROUP BY "${groupBy}"
                    ORDER BY "${groupBy}"
                `;

          const result = await adapter.executeQuery(
            sql,
            ...(queryParams !== undefined && queryParams.length > 0
              ? [queryParams]
              : []),
          );
          const rows = result.rows ?? [];

          const groups = rows.map((row) => {
            const n = Number(row["n"]);
            const sampleMean = Number(row["mean"]);
            const sampleStdDev = Number(row["stddev"]);
            return {
              groupKey: row["group_key"],
              results: calculateTestResults(n, sampleMean, sampleStdDev),
            };
          });

          return {
            table: `${schema ?? "public"}.${table}`,
            column,
            testType,
            hypothesizedMean,
            groupBy,
            groups,
            count: groups.length,
          };
        }

        // Ungrouped hypothesis test
        const sql = `
                SELECT
                    COUNT("${column}") as n,
                    AVG("${column}")::numeric(20,6) as mean,
                    STDDEV_SAMP("${column}")::numeric(20,6) as stddev
                FROM ${schemaPrefix}"${table}"
                ${whereClause}
            `;

        const result = await adapter.executeQuery(
          sql,
          ...(queryParams !== undefined && queryParams.length > 0
            ? [queryParams]
            : []),
        );
        const row = result.rows?.[0] as
          | {
              n: string | number;
              mean: string | number;
              stddev: string | number;
            }
          | undefined;
        if (!row) return { error: "No data found" };

        const n = Number(row.n);
        const sampleMean = Number(row.mean);
        const sampleStdDev = Number(row.stddev);

        const testResults = calculateTestResults(n, sampleMean, sampleStdDev);

        // If error, return at top level (not nested in results)
        if ("error" in testResults) {
          return testResults;
        }

        return {
          table: `${schema ?? "public"}.${table}`,
          column,
          testType,
          hypothesizedMean,
          results: testResults,
        };
      } catch (error: unknown) {
        return formatHandlerError(error, { tool: "pg_stats_hypothesis" });
      }
    },
  };
}
