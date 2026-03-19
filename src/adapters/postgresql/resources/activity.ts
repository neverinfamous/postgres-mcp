/**
 * Activity Resource
 *
 * Current database connections and running queries with blocking detection.
 */

import type { PostgresAdapter } from "../postgres-adapter.js";
import type {
  ResourceDefinition,
  RequestContext,
} from "../../../types/index.js";
import { HIGH_PRIORITY } from "../../../utils/resource-annotations.js";

/** Safely convert unknown value to string */
function toStr(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value.toString();
  if (typeof value === "object") return JSON.stringify(value);
  return "";
}

interface BlockingRelationship {
  blockerPid: number;
  blockerQuery: string;
  blockedPid: number;
  blockedQuery: string;
  blockedDuration: string;
}

export function createActivityResource(
  adapter: PostgresAdapter,
): ResourceDefinition {
  return {
    uri: "postgres://activity",
    name: "Active Connections",
    description:
      "Current database connections, running queries with duration, and blocking relationship detection",
    mimeType: "application/json",
    annotations: HIGH_PRIORITY,
    handler: async (_uri: string, _context: RequestContext) => {
      // Get connections with formatted duration
      const result = await adapter.executeQuery(`
                SELECT pid, usename, datname, client_addr, state,
                       query_start, state_change,
                       now() - query_start as duration,
                       CASE 
                           WHEN now() - query_start < interval '1 second' THEN '<1s'
                           WHEN now() - query_start < interval '1 minute' THEN 
                               EXTRACT(EPOCH FROM (now() - query_start))::int || 's'
                           WHEN now() - query_start < interval '1 hour' THEN 
                               EXTRACT(EPOCH FROM (now() - query_start))::int / 60 || 'm ' ||
                               EXTRACT(EPOCH FROM (now() - query_start))::int % 60 || 's'
                           ELSE 
                               EXTRACT(EPOCH FROM (now() - query_start))::int / 3600 || 'h ' ||
                               (EXTRACT(EPOCH FROM (now() - query_start))::int % 3600) / 60 || 'm'
                       END as duration_formatted,
                       LEFT(query, 200) as query_preview,
                       wait_event_type,
                       wait_event
                FROM pg_stat_activity
                WHERE pid != pg_backend_pid()
                ORDER BY query_start NULLS LAST
            `);

      // Connection counts by state
      const counts = await adapter.executeQuery(`
                SELECT state, count(*) as count
                FROM pg_stat_activity
                WHERE pid != pg_backend_pid()
                GROUP BY state
            `);

      // Detect blocking relationships
      let blockingRelationships: BlockingRelationship[] = [];
      let blockingCount = 0;
      let blockedCount = 0;

      try {
        const blockingResult = await adapter.executeQuery(`
                    SELECT 
                        blocker.pid as blocker_pid,
                        LEFT(blocker.query, 100) as blocker_query,
                        blocked.pid as blocked_pid,
                        LEFT(blocked.query, 100) as blocked_query,
                        CASE 
                            WHEN now() - blocked.query_start < interval '1 second' THEN '<1s'
                            WHEN now() - blocked.query_start < interval '1 minute' THEN 
                                EXTRACT(EPOCH FROM (now() - blocked.query_start))::int || 's'
                            ELSE 
                                EXTRACT(EPOCH FROM (now() - blocked.query_start))::int / 60 || 'm'
                        END as blocked_duration
                    FROM pg_stat_activity blocked
                    JOIN LATERAL unnest(pg_blocking_pids(blocked.pid)) as blocker_pid ON true
                    JOIN pg_stat_activity blocker ON blocker.pid = blocker_pid
                    WHERE blocked.pid != pg_backend_pid()
                    LIMIT 20
                `);

        if (blockingResult.rows && blockingResult.rows.length > 0) {
          blockingRelationships = blockingResult.rows.map((row) => ({
            blockerPid: Number(row["blocker_pid"]),
            blockerQuery: toStr(row["blocker_query"]),
            blockedPid: Number(row["blocked_pid"]),
            blockedQuery: toStr(row["blocked_query"]),
            blockedDuration: toStr(row["blocked_duration"]),
          }));

          // Count unique blockers and blocked
          const blockers = new Set(
            blockingRelationships.map((r) => r.blockerPid),
          );
          const blocked = new Set(
            blockingRelationships.map((r) => r.blockedPid),
          );
          blockingCount = blockers.size;
          blockedCount = blocked.size;
        }
      } catch {
        // pg_blocking_pids might not be available in older versions
      }

      // Generate summary
      const activeCount =
        result.rows?.filter(
          (r: Record<string, unknown>) => r["state"] === "active",
        ).length ?? 0;
      const idleCount =
        result.rows?.filter(
          (r: Record<string, unknown>) => r["state"] === "idle",
        ).length ?? 0;

      return {
        connections: result.rows,
        total: result.rows?.length ?? 0,
        byState: counts.rows,
        activeQueries: activeCount,
        idleConnections: idleCount,
        blockingRelationships,
        blockingCount,
        blockedCount,
        summary:
          blockedCount > 0
            ? `${String(result.rows?.length ?? 0)} connections (${String(activeCount)} active). ${String(blockedCount)} queries blocked by ${String(blockingCount)} blocker(s).`
            : `${String(result.rows?.length ?? 0)} connections (${String(activeCount)} active, ${String(idleCount)} idle). No blocking detected.`,
      };
    },
  };
}
