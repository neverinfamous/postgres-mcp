/**
 * PostgreSQL Statistics Tools - Distribution Analysis
 *
 * Analyze data distribution with histogram buckets, skewness, and kurtosis.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import { validateNumericColumn } from "./math-utils.js";
import {
  StatsDistributionSchemaBase,
  StatsDistributionSchema,
  DistributionOutputSchema,
} from "../../schemas/index.js";

/**
 * Distribution analysis with histogram
 */
export function createStatsDistributionTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stats_distribution",
    description:
      "Analyze data distribution with histogram buckets, skewness, and kurtosis. Use groupBy to get distribution per category.",
    group: "stats",
    inputSchema: StatsDistributionSchemaBase.partial(), // Base schema for MCP visibility
    outputSchema: DistributionOutputSchema,
    annotations: readOnly("Distribution Analysis"),
    icons: getToolIcons("stats", readOnly("Distribution Analysis")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = StatsDistributionSchema.parse(params) as {
          table: string;
          column: string;
          buckets?: number;
          schema?: string;
          where?: string;
          params?: unknown[];
          groupBy?: string;
          groupLimit?: number;
        };
        const {
          table,
          column,
          buckets,
          schema,
          where,
          params: queryParams,
          groupBy,
          groupLimit,
        } = parsed;

        const schemaName = schema ?? "public";
        const schemaPrefix = schema ? `"${schema}".` : "";
        const whereClause = where ? `WHERE ${sanitizeWhereClause(where)}` : "";
        const numBuckets = buckets ?? 10;

        // Validate column exists and is numeric
        await validateNumericColumn(adapter, table, column, schemaName);

        // Helper to compute skewness and kurtosis for a given group
        const computeMoments = async (
          groupFilter?: string,
        ): Promise<{
          minVal: number;
          maxVal: number;
          skewness: number | null;
          kurtosis: number | null;
        } | null> => {
          const filterClause = groupFilter
            ? whereClause
              ? `${whereClause} AND ${groupFilter}`
              : `WHERE ${groupFilter}`
            : whereClause;

          const statsQuery = `
                    WITH stats AS (
                        SELECT
                            MIN("${column}") as min_val,
                            MAX("${column}") as max_val,
                            AVG("${column}") as mean,
                            STDDEV_POP("${column}") as stddev,
                            COUNT("${column}") as n
                        FROM ${schemaPrefix}"${table}"
                        ${filterClause}
                    ),
                    moments AS (
                        SELECT
                            s.min_val,
                            s.max_val,
                            s.mean,
                            s.stddev,
                            s.n,
                            CASE WHEN s.stddev > 0 AND s.n > 2 THEN
                                (SUM(POWER(("${column}" - s.mean) / s.stddev, 3)) / s.n)::numeric(10,6)
                            ELSE NULL END as skewness,
                            CASE WHEN s.stddev > 0 AND s.n > 3 THEN
                                ((SUM(POWER(("${column}" - s.mean) / s.stddev, 4)) / s.n) - 3)::numeric(10,6)
                            ELSE NULL END as kurtosis
                        FROM ${schemaPrefix}"${table}" t, stats s
                        ${filterClause}
                        GROUP BY s.min_val, s.max_val, s.mean, s.stddev, s.n
                    )
                    SELECT * FROM moments
                `;

          const result = await adapter.executeQuery(
            statsQuery,
            ...(queryParams !== undefined && queryParams.length > 0
              ? [queryParams]
              : []),
          );
          const row = result.rows?.[0];

          if (row?.["min_val"] == null || row["max_val"] == null) {
            return null;
          }

          return {
            minVal: Number(row["min_val"]),
            maxVal: Number(row["max_val"]),
            skewness: row["skewness"] !== null ? Number(row["skewness"]) : null,
            kurtosis: row["kurtosis"] !== null ? Number(row["kurtosis"]) : null,
          };
        };

        // Helper to generate histogram for given min/max
        const generateHistogram = async (
          minVal: number,
          maxVal: number,
          groupFilter?: string,
        ): Promise<
          {
            bucket: number;
            frequency: number;
            rangeMin: number;
            rangeMax: number;
          }[]
        > => {
          const filterClause = groupFilter
            ? whereClause
              ? `${whereClause} AND ${groupFilter}`
              : `WHERE ${groupFilter}`
            : whereClause;

          const histogramQuery = `
                    SELECT
                        WIDTH_BUCKET("${column}", ${String(minVal)}, ${String(maxVal + 0.0001)}, ${String(numBuckets)}) as bucket,
                        COUNT(*) as frequency,
                        MIN("${column}") as bucket_min,
                        MAX("${column}") as bucket_max
                    FROM ${schemaPrefix}"${table}"
                    ${filterClause}
                    GROUP BY WIDTH_BUCKET("${column}", ${String(minVal)}, ${String(maxVal + 0.0001)}, ${String(numBuckets)})
                    ORDER BY bucket
                `;

          const result = await adapter.executeQuery(
            histogramQuery,
            ...(queryParams !== undefined && queryParams.length > 0
              ? [queryParams]
              : []),
          );
          return (result.rows ?? []).map((row) => ({
            bucket: Number(row["bucket"]),
            frequency: Number(row["frequency"]),
            rangeMin: Number(row["bucket_min"]),
            rangeMax: Number(row["bucket_max"]),
          }));
        };

        if (groupBy !== undefined) {
          // Handle groupLimit: undefined uses default (20), 0 means no limit
          const DEFAULT_GROUP_LIMIT = 20;
          const userProvidedGroupLimit = groupLimit !== undefined;
          const effectiveGroupLimit =
            groupLimit === 0 ? undefined : (groupLimit ?? DEFAULT_GROUP_LIMIT);

          // Get distinct groups first
          const groupsQuery = `
                    SELECT DISTINCT "${groupBy}" as group_key
                    FROM ${schemaPrefix}"${table}"
                    ${whereClause}
                    ORDER BY "${groupBy}"
                `;
          const groupsResult = await adapter.executeQuery(
            groupsQuery,
            ...(queryParams !== undefined && queryParams.length > 0
              ? [queryParams]
              : []),
          );
          const allGroupKeys = (groupsResult.rows ?? []).map(
            (r) => r["group_key"],
          );
          const totalGroupCount = allGroupKeys.length;

          // Apply group limit
          const groupKeys =
            effectiveGroupLimit !== undefined
              ? allGroupKeys.slice(0, effectiveGroupLimit)
              : allGroupKeys;

          // Process each group
          const groups: {
            groupKey: unknown;
            range: { min: number; max: number };
            bucketWidth: number;
            skewness: number | null;
            kurtosis: number | null;
            histogram: {
              bucket: number;
              frequency: number;
              rangeMin: number;
              rangeMax: number;
            }[];
          }[] = [];

          for (const groupKey of groupKeys) {
            const groupFilter =
              typeof groupKey === "string"
                ? `"${groupBy}" = '${groupKey.replace(/'/g, "''")}'`
                : `"${groupBy}" = ${String(groupKey)}`;

            const moments = await computeMoments(groupFilter);
            if (moments === null) continue;

            const { minVal, maxVal, skewness, kurtosis } = moments;
            const bucketWidth =
              Math.round(((maxVal - minVal) / numBuckets) * 1e6) / 1e6;
            const histogram = await generateHistogram(
              minVal,
              maxVal,
              groupFilter,
            );

            groups.push({
              groupKey,
              range: { min: minVal, max: maxVal },
              bucketWidth,
              skewness,
              kurtosis,
              histogram,
            });
          }

          // Build response with truncation indicators
          const response: Record<string, unknown> = {
            table: `${schema ?? "public"}.${table}`,
            column,
            groupBy,
            groups,
            count: groups.length,
          };

          // Add truncation indicators when groups are limited
          const groupsTruncated =
            effectiveGroupLimit !== undefined &&
            totalGroupCount > effectiveGroupLimit;
          if (groupsTruncated || !userProvidedGroupLimit) {
            response["truncated"] = groupsTruncated;
            response["totalGroupCount"] = totalGroupCount;
          }

          return response;
        }

        // Ungrouped distribution (existing logic)
        const moments = await computeMoments();
        if (moments === null) {
          return { error: "No data or all nulls in column" };
        }

        const { minVal, maxVal, skewness, kurtosis } = moments;
        const bucketWidth =
          Math.round(((maxVal - minVal) / numBuckets) * 1e6) / 1e6;
        const histogram = await generateHistogram(minVal, maxVal);

        return {
          table: `${schema ?? "public"}.${table}`,
          column,
          range: { min: minVal, max: maxVal },
          bucketWidth,
          skewness,
          kurtosis,
          histogram,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_stats_distribution" });
      }
    },
  };
}
