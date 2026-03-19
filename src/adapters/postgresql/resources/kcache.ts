/**
 * pg_stat_kcache Status Resource
 *
 * Provides pg_stat_kcache OS-level performance metrics summary.
 */

import type { PostgresAdapter } from "../postgres-adapter.js";
import type { ResourceDefinition } from "../../../types/index.js";
import { LOW_PRIORITY } from "../../../utils/resource-annotations.js";

/** Safely convert unknown value to string */
function toStr(value: unknown): string {
  return typeof value === "string" ? value : "";
}

interface KcacheResourceData {
  extensionInstalled: boolean;
  extensionVersion: string | null;
  pgStatStatementsInstalled: boolean;
  summary: {
    totalQueries: number;
    totalCpuTime: number;
    totalReads: number;
    totalWrites: number;
  };
  topCpuQueries: {
    queryPreview: string;
    calls: number;
    cpuTimeSeconds: number;
    cpuPerCall: number;
  }[];
  topIoQueries: {
    queryPreview: string;
    calls: number;
    readsBytes: number;
    writesBytes: number;
  }[];
  resourceClassification: {
    cpuBound: number;
    ioBound: number;
    balanced: number;
  };
  classificationThresholds?: {
    formula: string;
    cpuBound: string;
    ioBound: string;
    balanced: string;
  };
  recommendations: string[];
}

/**
 * Column naming in pg_stat_kcache changed in version 2.2:
 * - Old (< 2.2): user_time, system_time, reads, writes
 * - New (>= 2.2): exec_user_time, exec_system_time, exec_reads, exec_writes
 *
 * The pg_stat_kcache() FUNCTION returns columns like exec_reads (bytes).
 */
interface KcacheColumns {
  userTime: string;
  systemTime: string;
  reads: string;
  writes: string;
}

async function getKcacheColumnNames(
  adapter: PostgresAdapter,
): Promise<KcacheColumns> {
  const result = await adapter.executeQuery(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'pg_stat_kcache' AND column_name = 'exec_user_time'
    `);
  const isNewVersion = (result.rows?.length ?? 0) > 0;

  if (isNewVersion) {
    return {
      userTime: "exec_user_time",
      systemTime: "exec_system_time",
      reads: "exec_reads",
      writes: "exec_writes",
    };
  }
  return {
    userTime: "user_time",
    systemTime: "system_time",
    reads: "reads",
    writes: "writes",
  };
}

export function createKcacheResource(
  adapter: PostgresAdapter,
): ResourceDefinition {
  return {
    uri: "postgres://kcache",
    name: "pg_stat_kcache Status",
    description:
      "pg_stat_kcache OS-level CPU and I/O performance metrics summary",
    mimeType: "application/json",
    annotations: LOW_PRIORITY,
    handler: async (): Promise<string> => {
      const result: KcacheResourceData = {
        extensionInstalled: false,
        extensionVersion: null,
        pgStatStatementsInstalled: false,
        summary: {
          totalQueries: 0,
          totalCpuTime: 0,
          totalReads: 0,
          totalWrites: 0,
        },
        topCpuQueries: [],
        topIoQueries: [],
        resourceClassification: {
          cpuBound: 0,
          ioBound: 0,
          balanced: 0,
        },
        recommendations: [],
      };

      // Check for pg_stat_statements first (required) - outside try-catch for correct error messaging
      const stmtCheck = await adapter.executeQuery(
        `SELECT extversion FROM pg_extension WHERE extname = 'pg_stat_statements'`,
      );

      result.pgStatStatementsInstalled = (stmtCheck.rows?.length ?? 0) > 0;

      // Check if pg_stat_kcache is installed
      const extCheck = await adapter.executeQuery(
        `SELECT extversion FROM pg_extension WHERE extname = 'pg_stat_kcache'`,
      );

      if (!extCheck.rows || extCheck.rows.length === 0) {
        result.recommendations.push(
          "pg_stat_kcache extension is not installed. Use pg_kcache_create_extension to enable OS-level performance monitoring.",
        );
        if (!result.pgStatStatementsInstalled) {
          result.recommendations.push(
            "pg_stat_statements is also required and not installed.",
          );
        }
        return JSON.stringify(result, null, 2);
      }

      result.extensionInstalled = true;
      const extVersion = extCheck.rows[0]?.["extversion"];
      result.extensionVersion =
        typeof extVersion === "string" ? extVersion : null;

      if (!result.pgStatStatementsInstalled) {
        result.recommendations.push(
          "pg_stat_statements is required but not installed. pg_stat_kcache will not function properly.",
        );
        return JSON.stringify(result, null, 2);
      }

      try {
        // Get version-aware column names
        const cols = await getKcacheColumnNames(adapter);

        // Get summary statistics using the FUNCTION (not the VIEW)
        const summaryResult = await adapter.executeQuery(
          `SELECT 
                        COUNT(*)::int as total_queries,
                        COALESCE(SUM(${cols.userTime} + ${cols.systemTime}), 0)::float as total_cpu,
                        COALESCE(SUM(${cols.reads}), 0)::bigint as total_reads,
                        COALESCE(SUM(${cols.writes}), 0)::bigint as total_writes
                     FROM pg_stat_kcache()`,
        );

        if (summaryResult.rows && summaryResult.rows.length > 0) {
          const row = summaryResult.rows[0];
          result.summary.totalQueries = Number(row?.["total_queries"] ?? 0);
          result.summary.totalCpuTime = Number(row?.["total_cpu"] ?? 0);
          result.summary.totalReads = Number(row?.["total_reads"] ?? 0);
          result.summary.totalWrites = Number(row?.["total_writes"] ?? 0);
        }

        // Get top CPU-consuming queries using FUNCTION
        const cpuResult = await adapter.executeQuery(
          `SELECT 
                        substring(s.query, 1, 100) as query,
                        s.calls::int,
                        round((k.${cols.userTime} + k.${cols.systemTime})::numeric, 3) as cpu_time,
                        round(((k.${cols.userTime} + k.${cols.systemTime}) / NULLIF(s.calls, 0))::numeric, 6) as cpu_per_call
                     FROM pg_stat_kcache() k
                     JOIN pg_stat_statements s ON k.queryid = s.queryid AND k.dbid = s.dbid AND k.userid = s.userid
                     WHERE s.calls > 0
                     ORDER BY (k.${cols.userTime} + k.${cols.systemTime}) DESC
                     LIMIT 5`,
        );

        if (cpuResult.rows) {
          for (const row of cpuResult.rows) {
            result.topCpuQueries.push({
              queryPreview: toStr(row["query"]),
              calls: Number(row["calls"] ?? 0),
              cpuTimeSeconds: Number(row["cpu_time"] ?? 0),
              cpuPerCall: Number(row["cpu_per_call"] ?? 0),
            });
          }
        }

        // Get top I/O-consuming queries using FUNCTION
        const ioResult = await adapter.executeQuery(
          `SELECT 
                        substring(s.query, 1, 100) as query,
                        s.calls::int,
                        k.${cols.reads}::bigint as reads,
                        k.${cols.writes}::bigint as writes
                     FROM pg_stat_kcache() k
                     JOIN pg_stat_statements s ON k.queryid = s.queryid AND k.dbid = s.dbid AND k.userid = s.userid
                     WHERE s.calls > 0
                     ORDER BY k.${cols.reads} DESC
                     LIMIT 5`,
        );

        if (ioResult.rows) {
          for (const row of ioResult.rows) {
            result.topIoQueries.push({
              queryPreview: toStr(row["query"]),
              calls: Number(row["calls"] ?? 0),
              readsBytes: Number(row["reads"] ?? 0),
              writesBytes: Number(row["writes"] ?? 0),
            });
          }
        }

        // Resource classification using FUNCTION
        const classResult = await adapter.executeQuery(
          `WITH metrics AS (
                        SELECT 
                            queryid,
                            (${cols.userTime} + ${cols.systemTime}) as cpu_time,
                            ${cols.reads} + ${cols.writes} as io_bytes
                        FROM pg_stat_kcache()
                        WHERE ${cols.userTime} + ${cols.systemTime} > 0 OR ${cols.reads} + ${cols.writes} > 0
                    )
                    SELECT 
                        CASE 
                            WHEN cpu_time > io_bytes / 1000000.0 * 2 THEN 'cpu_bound'
                            WHEN io_bytes / 1000000.0 > cpu_time * 2 THEN 'io_bound'
                            ELSE 'balanced'
                        END as classification,
                        COUNT(*)::int as count
                    FROM metrics
                    GROUP BY 1`,
        );

        if (classResult.rows) {
          for (const row of classResult.rows) {
            const classification = toStr(row["classification"]);
            const count = Number(row["count"] ?? 0);
            if (classification === "cpu_bound") {
              result.resourceClassification.cpuBound = count;
            } else if (classification === "io_bound") {
              result.resourceClassification.ioBound = count;
            } else {
              result.resourceClassification.balanced = count;
            }
          }
        }

        // Generate recommendations
        if (result.summary.totalQueries === 0) {
          result.recommendations.push(
            "No query statistics collected yet. Run some queries and check again.",
          );
        } else if (
          result.summary.totalReads === 0 &&
          result.summary.totalWrites === 0 &&
          result.summary.totalCpuTime === 0
        ) {
          result.recommendations.push(
            "All pg_stat_kcache metrics are zero. Possible causes: (1) No query activity since last reset, (2) pg_stat_kcache not in shared_preload_libraries (requires server restart), (3) Stats recently reset with pg_stat_kcache_reset(). Check postgresql.conf for: shared_preload_libraries = 'pg_stat_statements,pg_stat_kcache'",
          );
        }

        // Generate recommendations based on workload classification
        // Only provide classification recommendations when there's meaningful activity
        const totalClassified =
          result.resourceClassification.cpuBound +
          result.resourceClassification.ioBound +
          result.resourceClassification.balanced;
        const hasSignificantActivity =
          totalClassified >= 5 && result.summary.totalCpuTime >= 0.1;

        if (!hasSignificantActivity && totalClassified > 0) {
          result.recommendations.push(
            "Insufficient query activity for meaningful workload classification. Run more queries to gather accurate metrics.",
          );
        } else if (
          result.resourceClassification.cpuBound >
          result.resourceClassification.ioBound * 2
        ) {
          result.recommendations.push(
            "Workload is heavily CPU-bound. Consider optimizing complex calculations or using materialized views.",
          );
        }

        if (
          hasSignificantActivity &&
          result.resourceClassification.ioBound >
            result.resourceClassification.cpuBound * 2
        ) {
          result.recommendations.push(
            "Workload is heavily I/O-bound. Review indexes and consider increasing shared_buffers.",
          );
        }

        if (
          result.topCpuQueries.length > 0 &&
          result.topCpuQueries[0] !== undefined &&
          result.topCpuQueries[0].cpuTimeSeconds > 100
        ) {
          result.recommendations.push(
            "Some queries have very high CPU time. Use pg_kcache_top_cpu for detailed analysis.",
          );
        }

        // Add classification thresholds explanation
        result.classificationThresholds = {
          formula:
            "Compares (user_time + system_time) vs (reads + writes in MB). cpu_time > io_MB * 2 = CPU-bound; io_MB > cpu_time * 2 = I/O-bound; else balanced.",
          cpuBound:
            "Query spends 2x more time on CPU than on I/O operations. Optimize calculations, use materialized views, or simplify queries.",
          ioBound:
            "Query spends 2x more time on I/O than CPU. Add indexes, increase shared_buffers, or optimize disk access patterns.",
          balanced:
            "Query has relatively equal CPU and I/O usage. Standard optimization techniques apply.",
        };
      } catch {
        // Extension is installed but data queries failed
        result.recommendations.push(
          "Error querying pg_stat_kcache data. Check permissions on pg_stat_kcache() function.",
        );
      }

      return JSON.stringify(result, null, 2);
    },
  };
}
