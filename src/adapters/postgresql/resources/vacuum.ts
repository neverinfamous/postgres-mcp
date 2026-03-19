/**
 * Vacuum Resource
 *
 * Vacuum statistics, dead tuples, and transaction ID wraparound warnings.
 */

import type { PostgresAdapter } from "../postgres-adapter.js";
import type {
  ResourceDefinition,
  RequestContext,
} from "../../../types/index.js";
import { MEDIUM_PRIORITY } from "../../../utils/resource-annotations.js";

interface VacuumWarning {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
  message: string;
  table?: string;
  recommendation?: string;
}

interface VacuumRow {
  schemaname: string;
  relname: string;
  last_vacuum: string | null;
  last_autovacuum: string | null;
  last_analyze: string | null;
  last_autoanalyze: string | null;
  vacuum_count: number;
  autovacuum_count: number;
  analyze_count: number;
  autoanalyze_count: number;
  n_dead_tup: number;
  n_live_tup: number;
  dead_tuple_percent: number;
}

interface WraparoundInfo {
  datname: string;
  xid_age: number;
  xids_until_wraparound: number;
  percent_toward_wraparound: number;
}

export function createVacuumResource(
  adapter: PostgresAdapter,
): ResourceDefinition {
  return {
    uri: "postgres://vacuum",
    name: "Vacuum Status",
    description:
      "Vacuum statistics, dead tuples, and transaction ID wraparound warnings",
    mimeType: "application/json",
    annotations: MEDIUM_PRIORITY,
    handler: async (_uri: string, _context: RequestContext) => {
      // Get vacuum statistics
      const vacuumResult = await adapter.executeQuery(`
                SELECT
                    schemaname,
                    relname,
                    last_vacuum,
                    last_autovacuum,
                    last_analyze,
                    last_autoanalyze,
                    vacuum_count,
                    autovacuum_count,
                    analyze_count,
                    autoanalyze_count,
                    n_dead_tup,
                    n_live_tup,
                    CASE
                        WHEN n_live_tup > 0
                        THEN round(100.0 * n_dead_tup / n_live_tup, 2)
                        ELSE 0
                    END as dead_tuple_percent
                FROM pg_stat_user_tables
                WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
                ORDER BY n_dead_tup DESC
                LIMIT 20
            `);
      const vacuumStats = (vacuumResult.rows ?? []) as unknown as VacuumRow[];

      // Get transaction ID wraparound info
      const wraparoundResult = await adapter.executeQuery(`
                SELECT
                    datname,
                    age(datfrozenxid) as xid_age,
                    2147483648 - age(datfrozenxid) as xids_until_wraparound,
                    round(100.0 * age(datfrozenxid) / 2147483648, 2) as percent_toward_wraparound
                FROM pg_database
                WHERE datname = current_database()
            `);
      const wraparoundRow = (wraparoundResult.rows?.[0] ??
        null) as WraparoundInfo | null;
      const wraparoundInfo = wraparoundRow ?? {
        datname: "",
        xid_age: 0,
        xids_until_wraparound: 0,
        percent_toward_wraparound: 0,
      };

      // Generate warnings
      const warnings: VacuumWarning[] = [];
      const pctWraparound = wraparoundInfo.percent_toward_wraparound;

      if (pctWraparound > 75) {
        warnings.push({
          severity: "CRITICAL",
          message:
            "Transaction ID wraparound at " + pctWraparound.toString() + "%",
          recommendation:
            "Run VACUUM FREEZE immediately to prevent database shutdown",
        });
      } else if (pctWraparound > 50) {
        warnings.push({
          severity: "HIGH",
          message:
            "Transaction ID wraparound at " + pctWraparound.toString() + "%",
          recommendation: "Schedule VACUUM FREEZE during maintenance window",
        });
      }

      for (const table of vacuumStats.slice(0, 5)) {
        // Handle edge case: empty tables (both live and dead = 0)
        const isEmptyTable = table.n_live_tup === 0 && table.n_dead_tup === 0;

        // Ensure we have a valid number, not NaN
        const deadPct = isFinite(table.dead_tuple_percent)
          ? table.dead_tuple_percent
          : 0;

        if (isEmptyTable) {
          // Skip empty tables in warnings - they don't need vacuum
          continue;
        }

        if (deadPct > 20) {
          warnings.push({
            severity: "MEDIUM",
            table: table.schemaname + "." + table.relname,
            message: deadPct.toString() + "% dead tuples",
            recommendation:
              "Run VACUUM ANALYZE " +
              table.schemaname +
              "." +
              table.relname +
              ";",
          });
        }
      }

      if (warnings.length === 0) {
        warnings.push({
          severity: "INFO",
          message: "Vacuum status looks healthy",
        });
      }

      return {
        vacuumStatistics: vacuumStats,
        transactionIdWraparound: {
          ...wraparoundInfo,
          thresholdExplanation: {
            limit:
              "PostgreSQL uses 32-bit transaction IDs with a 2 billion XID horizon. Approaching this limit requires aggressive vacuuming.",
            critical75:
              ">75%: CRITICAL - Database will shut down to prevent corruption if wraparound occurs. Run VACUUM FREEZE immediately.",
            warning50:
              ">50%: HIGH - Schedule VACUUM FREEZE during maintenance window. Still safe but needs attention.",
            healthy:
              "<50%: Normal operation. Autovacuum should handle routine cleanup.",
          },
        },
        warnings,
      };
    },
  };
}
