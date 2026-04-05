/**
 * PostgreSQL Monitoring — Capacity Planning
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { getToolIcons } from "../../../../utils/icons.js";
import {
  CapacityPlanningSchemaBase,
  CapacityPlanningSchema,
  CapacityPlanningOutputSchema,
} from "../../schemas/index.js";

// =============================================================================
// pg_capacity_planning
// =============================================================================

export function createCapacityPlanningTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_capacity_planning",
    description:
      "Analyze database growth trends and provide capacity planning forecasts. Note: Growth estimates are based on pg_stat_user_tables counters since last stats reset; accuracy depends on how long stats have been accumulating.",
    group: "monitoring",
    inputSchema: CapacityPlanningSchemaBase,
    outputSchema: CapacityPlanningOutputSchema,
    annotations: readOnly("Capacity Planning"),
    icons: getToolIcons("monitoring", readOnly("Capacity Planning")),
    handler: async (params: unknown, _context: RequestContext) => {
      let parsed;
      try {
        parsed = CapacityPlanningSchema.parse(params ?? {});
        const projectionDays = parsed.projectionDays;

        const [dbSize, tableStats, connStats, statsAge] = await Promise.all([
          adapter.executeQuery(`
                    SELECT
                        pg_database_size(current_database()) as current_size_bytes,
                        pg_size_pretty(pg_database_size(current_database())) as current_size
                `),
          adapter.executeQuery(`
                    SELECT
                        count(*) as table_count,
                        sum(n_live_tup) as total_rows,
                        sum(n_tup_ins) as total_inserts,
                        sum(n_tup_del) as total_deletes
                    FROM pg_stat_user_tables
                `),
          adapter.executeQuery(`
                    SELECT
                        current_setting('max_connections')::int as max_connections,
                        count(*) as current_connections
                    FROM pg_stat_activity
                    WHERE backend_type = 'client backend'
                `),
          // Get time since stats reset for accurate daily rate calculation
          // Use pg_stat_database.stats_reset (works in all PG versions including 17+)
          // Fall back to server start time if stats_reset is NULL
          adapter.executeQuery(`
                    SELECT
                        COALESCE(
                            (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()),
                            pg_postmaster_start_time()
                        ) as stats_since,
                        EXTRACT(EPOCH FROM (now() - COALESCE(
                            (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()),
                            pg_postmaster_start_time()
                        ))) / 86400.0 as days_of_data
                `),
        ]);

        const currentBytes = Number(
          dbSize.rows?.[0]?.["current_size_bytes"] ?? 0,
        );
        const tableData = tableStats.rows?.[0];
        const connData = connStats.rows?.[0];
        const ageData = statsAge.rows?.[0];

        const totalInserts = Number(tableData?.["total_inserts"] ?? 0);
        const totalDeletes = Number(tableData?.["total_deletes"] ?? 0);
        const netRowGrowth = totalInserts - totalDeletes;

        const totalRows = Number(tableData?.["total_rows"] ?? 1);
        const avgRowSize = currentBytes / Math.max(totalRows, 1);

        // Use actual days of data for accurate daily growth rate
        const daysOfData = Number(ageData?.["days_of_data"] ?? 1);
        const dailyRowGrowth =
          daysOfData > 0.01 ? netRowGrowth / daysOfData : 0;
        const dailyGrowthBytes = dailyRowGrowth * avgRowSize;
        const projectedGrowthBytes = dailyGrowthBytes * projectionDays;
        const projectedTotalBytes = currentBytes + projectedGrowthBytes;

        // Determine estimation quality based on data availability
        const estimationQuality =
          daysOfData < 1
            ? "Low confidence - less than 1 day of data"
            : daysOfData < 7
              ? "Moderate confidence - less than 1 week of data"
              : daysOfData < 30
                ? "Good confidence - more than 1 week of data"
                : "High confidence - more than 30 days of data";

        // Coerce numeric fields
        const dbSizeRow = dbSize.rows?.[0] as
          | { current_size_bytes: string | number; current_size: string }
          | undefined;
        const coercedDbSize = dbSizeRow
          ? {
              current_size_bytes:
                typeof dbSizeRow.current_size_bytes === "number"
                  ? dbSizeRow.current_size_bytes
                  : typeof dbSizeRow.current_size_bytes === "string"
                    ? parseInt(dbSizeRow.current_size_bytes, 10)
                    : 0,
              current_size: dbSizeRow.current_size,
            }
          : undefined;

        const tableCountRaw = tableData?.["table_count"];
        const totalRowsRaw = tableData?.["total_rows"];
        const totalInsertsRaw = tableData?.["total_inserts"];
        const totalDeletesRaw = tableData?.["total_deletes"];

        return {
          success: true,
          current: {
            databaseSize: coercedDbSize,
            tableCount:
              typeof tableCountRaw === "number"
                ? tableCountRaw
                : typeof tableCountRaw === "string"
                  ? parseInt(tableCountRaw, 10)
                  : 0,
            totalRows:
              typeof totalRowsRaw === "number"
                ? totalRowsRaw
                : typeof totalRowsRaw === "string"
                  ? parseInt(totalRowsRaw, 10)
                  : 0,
            connections: `${String(Number(connData?.["current_connections"] ?? 0))}/${String(Number(connData?.["max_connections"] ?? 0))}`,
          },
          growth: {
            totalInserts:
              typeof totalInsertsRaw === "number"
                ? totalInsertsRaw
                : typeof totalInsertsRaw === "string"
                  ? parseInt(totalInsertsRaw, 10)
                  : 0,
            totalDeletes:
              typeof totalDeletesRaw === "number"
                ? totalDeletesRaw
                : typeof totalDeletesRaw === "string"
                  ? parseInt(totalDeletesRaw, 10)
                  : 0,
            netRowGrowth,
            daysOfData: parseFloat(daysOfData.toFixed(1)),
            statsSince: ageData?.["stats_since"],
            estimatedDailyRowGrowth: Math.round(dailyRowGrowth),
            estimatedDailyGrowthBytes: Math.round(dailyGrowthBytes),
            estimationQuality,
          },
          projection: {
            days: projectionDays,
            projectedSizeBytes: Math.round(projectedTotalBytes),
            projectedSizePretty: `${(projectedTotalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`,
            growthPercentage:
              currentBytes > 0
                ? parseFloat(
                    ((projectedGrowthBytes / currentBytes) * 100).toFixed(1),
                  )
                : 0.0,
          },
          recommendations: [
            projectedTotalBytes > 100 * 1024 * 1024 * 1024
              ? "Consider archiving old data or implementing table partitioning"
              : null,
            Number(connData?.["current_connections"] ?? 0) >
            Number(connData?.["max_connections"] ?? 100) * 0.7
              ? "Connection usage is high, consider increasing max_connections"
              : null,
            daysOfData < 7
              ? "Wait for more data accumulation for more accurate projections"
              : null,
          ].filter(Boolean),
        };
      } catch (err) {
        return formatHandlerErrorResponse(err, {
          tool: "pg_capacity_planning",
        });
      }
    },
  };
}
