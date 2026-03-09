/**
 * PostgreSQL Performance Tools - Anomaly Detection
 *
 * Lightweight anomaly detectors that compare current state against
 * historical baselines using PostgreSQL system views. Returns risk
 * scores, trend analysis, and actionable recommendations.
 *
 * Tools:
 *   - pg_detect_query_anomalies: z-score analysis via pg_stat_statements
 *   - pg_detect_bloat_risk: multi-factor bloat risk scoring
 *   - pg_detect_connection_spike: connection concentration detection
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatPostgresError } from "../core/error-helpers.js";

// =============================================================================
// Shared Helpers
// =============================================================================

type RiskLevel = "low" | "moderate" | "high" | "critical";

const toNum = (val: unknown): number =>
  val === null || val === undefined ? 0 : Number(val);

const toStr = (val: unknown, fallback = ""): string =>
  typeof val === "string" ? val : fallback;

function riskFromScore(score: number): RiskLevel {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "moderate";
  return "low";
}

// =============================================================================
// 1. pg_detect_query_anomalies
// =============================================================================

const QueryAnomaliesInputBase = z.object({
  threshold: z
    .any()
    .optional()
    .describe(
      "Standard deviation multiplier for anomaly detection (default: 2.0)",
    ),
  minCalls: z
    .any()
    .optional()
    .describe("Minimum call count to filter noise (default: 10)"),
});

const QueryAnomaliesInput = QueryAnomaliesInputBase.transform((data) => ({
  threshold: Math.max(0.5, Math.min(10, Number(data.threshold) || 2.0)),
  minCalls: Math.max(1, Math.min(10000, Number(data.minCalls) || 10)),
}));

export function createDetectQueryAnomaliesTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_detect_query_anomalies",
    description:
      "Detects queries deviating from their historical execution time norms " +
      "using z-score analysis. Requires pg_stat_statements extension. " +
      "Returns anomalous queries ranked by deviation severity with risk level.",
    inputSchema: QueryAnomaliesInputBase.shape,
    outputSchema: z.object({
      anomalies: z.array(z.any()),
      riskLevel: z.enum(["low", "moderate", "high", "critical"]),
      totalAnalyzed: z.number(),
      anomalyCount: z.number(),
      summary: z.string(),
    }),
    group: "performance",
    annotations: readOnly("Detect query anomalies"),
    icons: getToolIcons("performance", readOnly("Detect query anomalies")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = QueryAnomaliesInput.safeParse(params);
        if (!parsed.success) {
          return {
            success: false,
            error: `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          };
        }

        const { threshold, minCalls } = parsed.data;

        // Check if pg_stat_statements is available
        const extCheck = await adapter.executeQuery(
          `SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'`,
        );
        if (!extCheck.rows || extCheck.rows.length === 0) {
          return {
            success: false,
            error:
              "pg_stat_statements extension is not installed. " +
              "Install with: CREATE EXTENSION pg_stat_statements; " +
              "(requires shared_preload_libraries configuration)",
            suggestion:
              "Use pg_diagnose_database_performance for baseline-free health checks",
          };
        }

        // Count total analyzed queries
        const countResult = await adapter.executeQuery(
          `SELECT COUNT(*) AS total FROM pg_stat_statements WHERE calls >= ${String(minCalls)}`,
        );
        const totalAnalyzed = toNum(countResult.rows?.[0]?.["total"]);

        // Find anomalous queries using z-score
        const result = await adapter.executeQuery(`
          SELECT
            LEFT(query, 200) AS query_preview,
            calls,
            round(mean_exec_time::numeric, 3) AS mean_exec_time_ms,
            round(stddev_exec_time::numeric, 3) AS stddev_exec_time_ms,
            round((mean_exec_time / NULLIF(stddev_exec_time, 0))::numeric, 2) AS z_score,
            round(total_exec_time::numeric, 2) AS total_exec_time_ms,
            rows
          FROM pg_stat_statements
          WHERE calls >= ${String(minCalls)}
            AND stddev_exec_time > 0
            AND mean_exec_time > (stddev_exec_time * ${String(threshold)})
          ORDER BY (mean_exec_time / NULLIF(stddev_exec_time, 0)) DESC
          LIMIT 20
        `);

        const anomalies = (result.rows ?? []).map(
          (row: Record<string, unknown>) => ({
            queryPreview: toStr(row["query_preview"]),
            calls: toNum(row["calls"]),
            meanExecTimeMs: toNum(row["mean_exec_time_ms"]),
            stddevExecTimeMs: toNum(row["stddev_exec_time_ms"]),
            zScore: toNum(row["z_score"]),
            totalExecTimeMs: toNum(row["total_exec_time_ms"]),
            rows: toNum(row["rows"]),
          }),
        );

        const anomalyCount = anomalies.length;
        const maxZScore =
          anomalies.length > 0 ? (anomalies[0]?.zScore ?? 0) : 0;

        // Risk based on count and severity
        let riskScore = 0;
        if (anomalyCount >= 10) riskScore += 40;
        else if (anomalyCount >= 5) riskScore += 25;
        else if (anomalyCount >= 1) riskScore += 10;

        if (maxZScore >= 10) riskScore += 50;
        else if (maxZScore >= 5) riskScore += 30;
        else if (maxZScore >= 3) riskScore += 15;

        const riskLevel = riskFromScore(riskScore);

        const summary =
          anomalyCount === 0
            ? `No query anomalies detected (analyzed ${String(totalAnalyzed)} queries with threshold ${String(threshold)}σ)`
            : `${String(anomalyCount)} anomalous queries detected out of ${String(totalAnalyzed)} analyzed (threshold: ${String(threshold)}σ, max z-score: ${String(maxZScore)})`;

        return {
          anomalies,
          riskLevel,
          totalAnalyzed,
          anomalyCount,
          summary,
        };
      } catch (error: unknown) {
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_detect_query_anomalies",
          }),
        };
      }
    },
  };
}

// =============================================================================
// 2. pg_detect_bloat_risk
// =============================================================================

const BloatRiskInputBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Filter to a specific schema (default: all user schemas)"),
  minRows: z
    .any()
    .optional()
    .describe("Minimum live rows to include (default: 1000)"),
});

const BloatRiskInput = BloatRiskInputBase.transform((data) => ({
  schema: data.schema,
  minRows: Math.max(0, Math.min(1000000, Number(data.minRows) || 1000)),
}));

export function createDetectBloatRiskTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_detect_bloat_risk",
    description:
      "Scores tables by bloat risk using multiple factors: dead tuple ratio, " +
      "vacuum staleness, table size, and autovacuum effectiveness. " +
      "Returns per-table risk scores (0-100) with actionable recommendations.",
    inputSchema: BloatRiskInputBase.shape,
    outputSchema: z.object({
      tables: z.array(z.any()),
      highRiskCount: z.number(),
      totalAnalyzed: z.number(),
      summary: z.string(),
    }),
    group: "performance",
    annotations: readOnly("Detect bloat risk"),
    icons: getToolIcons("performance", readOnly("Detect bloat risk")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = BloatRiskInput.safeParse(params);
        if (!parsed.success) {
          return {
            success: false,
            error: `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          };
        }

        const { schema, minRows } = parsed.data;

        const schemaFilter = schema
          ? `AND schemaname = '${schema.replace(/'/g, "''")}'`
          : `AND schemaname NOT IN ('pg_catalog', 'information_schema', 'cron', 'topology', 'tiger', 'tiger_data')`;

        const result = await adapter.executeQuery(`
          SELECT
            schemaname AS schema,
            relname AS table_name,
            n_live_tup AS live_tuples,
            n_dead_tup AS dead_tuples,
            CASE WHEN n_live_tup + n_dead_tup > 0
              THEN round((100.0 * n_dead_tup / (n_live_tup + n_dead_tup))::numeric, 2)
              ELSE 0
            END AS dead_pct,
            pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)) AS total_size,
            pg_total_relation_size(schemaname || '.' || relname) AS total_bytes,
            last_vacuum,
            last_autovacuum,
            last_analyze,
            last_autoanalyze,
            vacuum_count,
            autovacuum_count,
            autoanalyze_count,
            EXTRACT(EPOCH FROM (now() - COALESCE(last_autovacuum, last_vacuum)))::int AS seconds_since_vacuum
          FROM pg_stat_user_tables
          WHERE n_live_tup >= ${String(minRows)}
            ${schemaFilter}
          ORDER BY n_dead_tup DESC
          LIMIT 50
        `);

        const rows = result.rows ?? [];

        const tables = rows.map((row: Record<string, unknown>) => {
          const liveTuples = toNum(row["live_tuples"]);
          const deadTuples = toNum(row["dead_tuples"]);
          const totalTuples = liveTuples + deadTuples;
          const deadPct = toNum(row["dead_pct"]);
          const totalBytes = toNum(row["total_bytes"]);
          const secondsSinceVacuum = toNum(row["seconds_since_vacuum"]);
          const autovacuumCount = toNum(row["autovacuum_count"]);
          const autoanalyzeCount = toNum(row["autoanalyze_count"]);

          // Risk scoring (0-100)
          // Factor 1: Dead tuple ratio (35% weight)
          let deadTupleScore = 0;
          if (totalTuples > 0) {
            const ratio = deadTuples / totalTuples;
            if (ratio >= 0.5) deadTupleScore = 100;
            else if (ratio >= 0.3) deadTupleScore = 80;
            else if (ratio >= 0.1) deadTupleScore = 50;
            else if (ratio >= 0.05) deadTupleScore = 25;
          }

          // Factor 2: Vacuum staleness (25% weight)
          let vacuumStalenessScore = 0;
          const hoursSinceVacuum = secondsSinceVacuum / 3600;
          if (secondsSinceVacuum === 0 && deadTuples > 0) {
            vacuumStalenessScore = 80; // Never vacuumed but has dead tuples
          } else if (hoursSinceVacuum >= 168) {
            vacuumStalenessScore = 100; // > 7 days
          } else if (hoursSinceVacuum >= 72) {
            vacuumStalenessScore = 70; // > 3 days
          } else if (hoursSinceVacuum >= 24) {
            vacuumStalenessScore = 40; // > 1 day
          }

          // Factor 3: Table size blast radius (15% weight)
          let sizeScore = 0;
          const sizeMB = totalBytes / (1024 * 1024);
          if (sizeMB >= 10000)
            sizeScore = 100; // > 10 GB
          else if (sizeMB >= 1000)
            sizeScore = 70; // > 1 GB
          else if (sizeMB >= 100) sizeScore = 40; // > 100 MB

          // Factor 4: Autovacuum effectiveness (25% weight)
          let autovacuumScore = 0;
          if (autovacuumCount === 0 && deadTuples > 0) {
            autovacuumScore = 90; // Autovacuum never ran but has dead tuples
          } else if (autoanalyzeCount === 0 && liveTuples > 10000) {
            autovacuumScore = 60; // Autoanalyze never ran on large table
          }

          const riskScore = Math.round(
            deadTupleScore * 0.35 +
              vacuumStalenessScore * 0.25 +
              sizeScore * 0.15 +
              autovacuumScore * 0.25,
          );

          const recommendations: string[] = [];
          if (deadPct >= 10) {
            recommendations.push(
              `Run VACUUM ANALYZE on ${toStr(row["schema"])}.${toStr(row["table_name"])}`,
            );
          }
          if (secondsSinceVacuum === 0 && deadTuples > 0) {
            recommendations.push("Table has never been vacuumed — run VACUUM");
          }
          if (autovacuumCount === 0 && deadTuples > 1000) {
            recommendations.push(
              "Autovacuum has never run — check autovacuum settings",
            );
          }
          if (hoursSinceVacuum >= 72 && deadTuples > 0) {
            recommendations.push(
              `Last vacuum was ${String(Math.round(hoursSinceVacuum))}h ago — schedule more frequent vacuuming`,
            );
          }

          return {
            schema: toStr(row["schema"]),
            tableName: toStr(row["table_name"]),
            liveTuples,
            deadTuples,
            deadPct,
            totalSize: toStr(row["total_size"], "0 bytes"),
            lastVacuum: row["last_vacuum"],
            lastAutovacuum: row["last_autovacuum"],
            hoursSinceVacuum: Math.round(hoursSinceVacuum),
            autovacuumCount,
            riskScore,
            riskLevel: riskFromScore(riskScore),
            factors: {
              deadTupleRatio: Math.round(deadTupleScore * 0.35),
              vacuumStaleness: Math.round(vacuumStalenessScore * 0.25),
              tableSizeImpact: Math.round(sizeScore * 0.15),
              autovacuumEffectiveness: Math.round(autovacuumScore * 0.25),
            },
            recommendations,
          };
        });

        // Sort by risk score descending
        tables.sort(
          (a: { riskScore: number }, b: { riskScore: number }) =>
            b.riskScore - a.riskScore,
        );

        const highRiskCount = tables.filter(
          (t: { riskScore: number }) => t.riskScore >= 60,
        ).length;

        const summary =
          highRiskCount === 0
            ? `No high-risk bloat detected across ${String(tables.length)} tables`
            : `${String(highRiskCount)} table(s) at high bloat risk out of ${String(tables.length)} analyzed`;

        return {
          tables,
          highRiskCount,
          totalAnalyzed: tables.length,
          summary,
        };
      } catch (error: unknown) {
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_detect_bloat_risk",
          }),
        };
      }
    },
  };
}

// =============================================================================
// 3. pg_detect_connection_spike
// =============================================================================

const ConnectionSpikeInputBase = z.object({
  warningPercent: z
    .any()
    .optional()
    .describe("Percentage threshold for flagging concentration (default: 70)"),
});

const ConnectionSpikeInput = ConnectionSpikeInputBase.transform((data) => ({
  warningPercent: Math.max(
    10,
    Math.min(100, Number(data.warningPercent) || 70),
  ),
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
    inputSchema: ConnectionSpikeInputBase.shape,
    outputSchema: z.object({
      totalConnections: z.number(),
      maxConnections: z.number(),
      usagePercent: z.number(),
      byState: z.array(z.any()),
      concentrations: z.array(z.any()),
      warnings: z.array(z.string()),
      riskLevel: z.enum(["low", "moderate", "high", "critical"]),
      summary: z.string(),
    }),
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
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_detect_connection_spike",
          }),
        };
      }
    },
  };
}
