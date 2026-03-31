/**
 * PostgreSQL Statistics Tools - Time Series Analysis
 *
 * Aggregate data into time buckets for time series analysis.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { ValidationError } from "../../../../types/errors.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import {
  // Base schemas for MCP visibility
  StatsTimeSeriesSchemaBase,
  // Preprocessed schemas for handler parsing
  StatsTimeSeriesSchema,
  // Output schemas for MCP structured content
  TimeSeriesOutputSchema,
} from "../../schemas/index.js";

/**
 * Time series analysis
 */
export function createStatsTimeSeriesTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stats_time_series",
    description:
      "Aggregate data into time buckets for time series analysis. Use groupBy to get separate time series per category.",
    group: "stats",
    inputSchema: StatsTimeSeriesSchemaBase.partial(), // Base schema for MCP visibility
    outputSchema: TimeSeriesOutputSchema,
    annotations: readOnly("Time Series Analysis"),
    icons: getToolIcons("stats", readOnly("Time Series Analysis")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const {
          table,
          valueColumn,
          timeColumn,
          interval,
          aggregation,
          schema,
          where,
          params: queryParams,
          limit,
          groupBy,
          groupLimit,
        } = StatsTimeSeriesSchema.parse(params) as {
          table: string;
          valueColumn: string;
          timeColumn: string;
          interval: string;
          aggregation?: string;
          schema?: string;
          where?: string;
          params?: unknown[];
          limit?: number;
          groupBy?: string;
          groupLimit?: number;
        };

        const schemaPrefix = schema ? `"${schema}".` : "";
        const whereClause = where ? `WHERE ${sanitizeWhereClause(where)}` : "";
        const agg = aggregation ?? "avg";

        // Handle limit: undefined uses default (100), 0 means no limit (which we safely cap at MAX_LIMIT)
        // Track whether user explicitly provided a limit
        const userProvidedLimit = limit !== undefined;
        const DEFAULT_LIMIT = 100;
        const MAX_LIMIT = 10000;
        
        if (limit !== undefined && limit > MAX_LIMIT) {
          throw new ValidationError(`Parameter 'limit' cannot exceed ${String(MAX_LIMIT)}.`);
        }
        
        // limit === 0 originally meant "no limit", but we safely cap it at 10000 to prevent context explosions
        const effectiveLimit = limit === 0 ? MAX_LIMIT : (limit ?? DEFAULT_LIMIT);
        const usingDefaultLimit = !userProvidedLimit && effectiveLimit < MAX_LIMIT;

        // First check if table exists
        const schemaName = schema ?? "public";
        const tableCheckQuery = `
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2
      `;
        const tableCheckResult = await adapter.executeQuery(tableCheckQuery, [
          schemaName,
          table,
        ]);
        if (tableCheckResult.rows?.length === 0) {
          throw new ValidationError(`Table "${schemaName}.${table}" does not exist`);
        }

        // Validate timeColumn is a timestamp/date type
        const typeCheckQuery = `
                SELECT data_type
                FROM information_schema.columns
                WHERE table_schema = $1
                AND table_name = $2
                AND column_name = $3
            `;
        const typeResult = await adapter.executeQuery(typeCheckQuery, [
          schemaName,
          table,
          timeColumn,
        ]);
        const typeRow = typeResult.rows?.[0] as
          | { data_type: string }
          | undefined;

        if (!typeRow) {
          throw new ValidationError(`Column "${timeColumn}" does not exist`);
        }

        const validTypes = [
          "timestamp without time zone",
          "timestamp with time zone",
          "date",
          "time",
          "time without time zone",
          "time with time zone",
        ];
        if (!validTypes.includes(typeRow.data_type)) {
          throw new ValidationError(
            `Column "${timeColumn}" is type "${typeRow.data_type}" but must be a timestamp or date type for time series analysis`,
          );
        }

        // Note: schemaName already defined above for table check

        // Validate valueColumn exists and is numeric
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
        const valueTypeQuery = `
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = $1
        AND table_name = $2
        AND column_name = $3
      `;
        const valueTypeResult = await adapter.executeQuery(valueTypeQuery, [
          schemaName,
          table,
          valueColumn,
        ]);
        const valueTypeRow = valueTypeResult.rows?.[0] as
          | { data_type: string }
          | undefined;

        if (!valueTypeRow) {
          throw new ValidationError(`Column "${valueColumn}" does not exist`);
        }

        if (!numericTypes.includes(valueTypeRow.data_type)) {
          throw new ValidationError(
            `Column "${valueColumn}" is type "${valueTypeRow.data_type}" but must be a numeric type for time series aggregation`,
          );
        }

        // Helper to map bucket row - convert Date to ISO string for JSON Schema
        // Handles both Date objects (from real DB) and strings (from mocks)
        const mapBucket = (
          row: Record<string, unknown>,
        ): { timeBucket: string; value: number; count: number } => {
          const timeBucketValue = row["time_bucket"];
          let timeBucket: string;
          if (timeBucketValue instanceof Date) {
            timeBucket = timeBucketValue.toISOString();
          } else if (typeof timeBucketValue === "string") {
            timeBucket = timeBucketValue;
          } else {
            // Fallback: null, undefined, or unexpected type
            timeBucket = "";
          }
          return {
            timeBucket,
            value: Number(row["value"]),
            count: Number(row["count"]),
          };
        };

        if (groupBy !== undefined) {
          // Handle groupLimit: undefined uses default (20), 0 means MAX to prevent payload explosion
          const DEFAULT_GROUP_LIMIT = 20;
          const MAX_GROUP_LIMIT = 1000;
          
          if (groupLimit !== undefined && groupLimit > MAX_GROUP_LIMIT) {
            throw new ValidationError(`Parameter 'groupLimit' cannot exceed ${String(MAX_GROUP_LIMIT)}.`);
          }
          
          const userProvidedGroupLimit = groupLimit !== undefined;
          const effectiveGroupLimit = groupLimit === 0 ? MAX_GROUP_LIMIT : (groupLimit ?? DEFAULT_GROUP_LIMIT);

          // First get total count of distinct groups for truncation indicator
          // COUNT(DISTINCT) excludes NULLs per SQL standard, so add 1 if any NULLs exist
          const groupCountSql = `
          SELECT COUNT(DISTINCT "${groupBy}") +
            CASE WHEN COUNT(*) > COUNT("${groupBy}") THEN 1 ELSE 0 END as total_groups
          FROM ${schemaPrefix}"${table}"
          ${whereClause}
        `;
          const groupCountResult = await adapter.executeQuery(groupCountSql);
          const totalGroupCount = Number(
            (groupCountResult.rows?.[0] as { total_groups: string | number })
              ?.total_groups ?? 0,
          );

          // Grouped time series
          const sql = `
                    SELECT
                        "${groupBy}" as group_key,
                        DATE_TRUNC('${interval}', "${timeColumn}") as time_bucket,
                        ${agg.toUpperCase()}("${valueColumn}")::numeric(20,6) as value,
                        COUNT(*) as count
                    FROM ${schemaPrefix}"${table}"
                    ${whereClause}
                    GROUP BY "${groupBy}", DATE_TRUNC('${interval}', "${timeColumn}")
                    ORDER BY "${groupBy}", time_bucket DESC
                `;

          const result = await adapter.executeQuery(
            sql,
            ...(queryParams !== undefined && queryParams.length > 0
              ? [queryParams]
              : []),
          );
          const rows = result.rows ?? [];

          // Group results by group_key
          const groupsMap = new Map<
            unknown,
            { timeBucket: string; value: number; count: number }[]
          >();
          const groupsTotalCount = new Map<unknown, number>();
          let groupsProcessed = 0;

          for (const row of rows) {
            const key = row["group_key"];
            if (!groupsMap.has(key)) {
              // Check if we've hit the group limit
              if (
                effectiveGroupLimit !== undefined &&
                groupsProcessed >= effectiveGroupLimit
              ) {
                continue;
              }
              groupsMap.set(key, []);
              groupsTotalCount.set(key, 0);
              groupsProcessed++;
            }
            const currentTotal = groupsTotalCount.get(key) ?? 0;
            groupsTotalCount.set(key, currentTotal + 1);

            const bucketList = groupsMap.get(key);
            // Only add if no limit or under limit
            if (
              bucketList !== undefined &&
              (effectiveLimit === undefined ||
                bucketList.length < effectiveLimit)
            ) {
              bucketList.push(mapBucket(row));
            }
          }

          const groups = Array.from(groupsMap.entries()).map(
            ([key, buckets]) => ({
              groupKey: key,
              buckets,
            }),
          );

          // Build response with truncation indicators
          const response: Record<string, unknown> = {
            table: `${schema ?? "public"}.${table}`,
            valueColumn,
            timeColumn,
            interval,
            aggregation: agg,
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

        // Ungrouped time series
        // Build LIMIT clause: no LIMIT if effectiveLimit is undefined (limit: 0)
        const limitClause =
          effectiveLimit !== undefined ? `LIMIT ${String(effectiveLimit)}` : "";

        // Get total count if using default limit (for truncation indicator)
        let totalCount: number | undefined;
        if (usingDefaultLimit) {
          const countSql = `
          SELECT COUNT(DISTINCT DATE_TRUNC('${interval}', "${timeColumn}")) as total_buckets
          FROM ${schemaPrefix}"${table}"
          ${whereClause}
        `;
          const countResult = await adapter.executeQuery(
            countSql,
            ...(queryParams !== undefined && queryParams.length > 0
              ? [queryParams]
              : []),
          );
          const countRow = countResult.rows?.[0] as
            | { total_buckets: string | number }
            | undefined;
          totalCount = countRow ? Number(countRow.total_buckets) : undefined;
        }

        const sql = `
                SELECT
                    DATE_TRUNC('${interval}', "${timeColumn}") as time_bucket,
                    ${agg.toUpperCase()}("${valueColumn}")::numeric(20,6) as value,
                    COUNT(*) as count
                FROM ${schemaPrefix}"${table}"
                ${whereClause}
                GROUP BY DATE_TRUNC('${interval}', "${timeColumn}")
                ORDER BY time_bucket DESC
                ${limitClause}
            `;

        const result = await adapter.executeQuery(
          sql,
          ...(queryParams !== undefined && queryParams.length > 0
            ? [queryParams]
            : []),
        );

        const buckets = (result.rows ?? []).map((row) => mapBucket(row));

        // Build response
        const response: Record<string, unknown> = {
          table: `${schema ?? "public"}.${table}`,
          valueColumn,
          timeColumn,
          interval,
          aggregation: agg,
          buckets,
        };

        // Add truncation indicators when default limit was applied
        if (usingDefaultLimit && totalCount !== undefined) {
          response["truncated"] = buckets.length < totalCount;
          response["totalCount"] = totalCount;
        }

        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_stats_time_series" });
      }
    },
  };
}
