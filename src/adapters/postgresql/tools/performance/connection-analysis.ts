/**
 * PostgreSQL Performance Tools - Connection Analysis
 *
 * Detects unusual connection patterns: concentration by user/application,
 * idle-in-transaction buildup, and overall connection pressure.
 *
 * Tools:
 *   - pg_detect_connection_spike: connection concentration detection
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { DetectConnectionSpikeOutputSchema } from "../../schemas/performance.js";
import { toNum, toStr, safeNum, riskFromScore } from "./anomaly-detection.js";

// =============================================================================
// pg_detect_connection_spike
// =============================================================================

const ConnectionSpikeInputBase = z.object({
  warningPercent: z
    .any()
    .optional()
    .describe("Percentage threshold for flagging concentration (default: 70)"),
});

const ConnectionSpikeInput = ConnectionSpikeInputBase.transform((data) => ({
  warningPercent: Math.max(10, Math.min(100, safeNum(data.warningPercent, 70))),
}));

interface ConnectionConcentration {
  dimension: string;
  value: string;
  count: number;
  percent: number;
}

export function createDetectConnectionSpikeTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_detect_connection_spike",
    description:
      "Detects unusual connection patterns by analyzing concentration " +
      "by user, application, state, and wait events. Flags when a single " +
      "user or application monopolizes the connection pool, or when " +
      "idle-in-transaction connections accumulate.",
    inputSchema: ConnectionSpikeInputBase, // Split Schema: full ZodObject for MCP parameter visibility
    outputSchema: DetectConnectionSpikeOutputSchema,
    group: "performance",
    annotations: readOnly("Detect connection spike"),
    icons: getToolIcons("performance", readOnly("Detect connection spike")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = ConnectionSpikeInput.safeParse(params);
        if (!parsed.success) {
          return {
            success: false,
            error: `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          };
        }

        const { warningPercent } = parsed.data;

        // Gather connection data in parallel
        const [stateResult, userResult, appResult, maxResult, idleTxResult] =
          await Promise.all([
            // By state
            adapter.executeQuery(`
            SELECT state, count(*) AS count
            FROM pg_stat_activity
            WHERE pid != pg_backend_pid()
            GROUP BY state
            ORDER BY count DESC
          `),
            // By user
            adapter.executeQuery(`
            SELECT usename, count(*) AS count
            FROM pg_stat_activity
            WHERE pid != pg_backend_pid()
            GROUP BY usename
            ORDER BY count DESC
          `),
            // By application
            adapter.executeQuery(`
            SELECT COALESCE(application_name, '') AS app_name, count(*) AS count
            FROM pg_stat_activity
            WHERE pid != pg_backend_pid()
            GROUP BY application_name
            ORDER BY count DESC
          `),
            // Max connections
            adapter.executeQuery(`SHOW max_connections`),
            // Idle-in-transaction details
            adapter.executeQuery(`
            SELECT pid, usename,
                   COALESCE(application_name, '') AS app_name,
                   now() - state_change AS idle_duration,
                   EXTRACT(EPOCH FROM (now() - state_change))::int AS idle_seconds
            FROM pg_stat_activity
            WHERE state = 'idle in transaction'
              AND pid != pg_backend_pid()
            ORDER BY state_change ASC
            LIMIT 20
          `),
          ]);

        const byState = stateResult.rows ?? [];
        const totalConnections = byState.reduce(
          (sum: number, r: Record<string, unknown>) => sum + toNum(r["count"]),
          0,
        );
        const maxConnections = toNum(maxResult.rows?.[0]?.["max_connections"]);
        const usagePercent =
          maxConnections > 0
            ? Math.round((totalConnections / maxConnections) * 100 * 10) / 10
            : 0;

        const concentrations: ConnectionConcentration[] = [];
        const warnings: string[] = [];

        // Check user concentration
        for (const row of userResult.rows ?? []) {
          const count = toNum(row["count"]);
          const percent =
            totalConnections > 0
              ? Math.round((count / totalConnections) * 100 * 10) / 10
              : 0;
          if (percent >= warningPercent) {
            const user = toStr(row["usename"], "unknown");
            concentrations.push({
              dimension: "user",
              value: user,
              count,
              percent,
            });
            warnings.push(
              `User '${user}' holds ${String(percent)}% of connections (${String(count)}/${String(totalConnections)})`,
            );
          }
        }

        // Check application concentration
        for (const row of appResult.rows ?? []) {
          const count = toNum(row["count"]);
          const percent =
            totalConnections > 0
              ? Math.round((count / totalConnections) * 100 * 10) / 10
              : 0;
          if (percent >= warningPercent) {
            const app = toStr(row["app_name"]);
            if (app) {
              concentrations.push({
                dimension: "application",
                value: app,
                count,
                percent,
              });
              warnings.push(
                `Application '${app}' holds ${String(percent)}% of connections (${String(count)}/${String(totalConnections)})`,
              );
            }
          }
        }

        // Check idle-in-transaction buildup
        const idleTxRows = idleTxResult.rows ?? [];
        if (idleTxRows.length > 0) {
          const longIdleTx = idleTxRows.filter(
            (r: Record<string, unknown>) => toNum(r["idle_seconds"]) > 300,
          );
          if (longIdleTx.length > 0) {
            warnings.push(
              `${String(longIdleTx.length)} connection(s) idle in transaction for >5 minutes — these hold locks and block autovacuum`,
            );
          }
          if (idleTxRows.length >= 5) {
            warnings.push(
              `${String(idleTxRows.length)} total idle-in-transaction connections — check for uncommitted transactions`,
            );
          }
        }

        // Check overall pressure
        if (usagePercent >= 90) {
          warnings.push(
            `Critical connection pressure: ${String(usagePercent)}% of max_connections in use`,
          );
        } else if (usagePercent >= 80) {
          warnings.push(
            `High connection pressure: ${String(usagePercent)}% of max_connections in use`,
          );
        }

        // Calculate risk level
        let riskScore = 0;
        if (usagePercent >= 90) riskScore += 40;
        else if (usagePercent >= 80) riskScore += 25;
        else if (usagePercent >= 70) riskScore += 10;

        if (concentrations.length >= 2) riskScore += 30;
        else if (concentrations.length >= 1) riskScore += 15;

        if (idleTxRows.length >= 5) riskScore += 25;
        else if (idleTxRows.length >= 1) riskScore += 10;

        const riskLevel = riskFromScore(riskScore);

        const summary =
          warnings.length === 0
            ? `No connection anomalies detected (${String(totalConnections)}/${String(maxConnections)} connections, ${String(usagePercent)}% usage)`
            : `${String(warnings.length)} warning(s) detected: ${String(totalConnections)}/${String(maxConnections)} connections (${String(usagePercent)}% usage)`;

        return {
          success: true as const,
          totalConnections,
          maxConnections,
          usagePercent,
          byState: byState.map((r: Record<string, unknown>) => ({
            state: toStr(r["state"], "null"),
            count: toNum(r["count"]),
          })),
          concentrations,
          warnings,
          riskLevel,
          summary,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_detect_connection_spike",
          });
      }
    },
  };
}
