/**
 * Locks Resource
 *
 * Lock contention detection and blocking query identification.
 */

import type { PostgresAdapter } from "../postgres-adapter.js";
import type {
  ResourceDefinition,
  RequestContext,
} from "../../../types/index.js";
import { MEDIUM_PRIORITY } from "../../../utils/resource-annotations.js";

interface LockWarning {
  severity: "HIGH" | "MEDIUM" | "INFO";
  message: string;
  recommendation?: string;
}

interface LockRow {
  locktype: string;
  mode: string;
  granted: boolean;
  pid: number;
  usename: string;
  application_name: string;
  client_addr: string;
  state: string;
  wait_event_type: string;
  wait_event: string;
  relation: string;
  query_preview: string;
  query_duration_seconds: number;
}

export function createLocksResource(
  adapter: PostgresAdapter,
): ResourceDefinition {
  return {
    uri: "postgres://locks",
    name: "Lock Information",
    description: "Current lock information with contention detection",
    mimeType: "application/json",
    annotations: MEDIUM_PRIORITY,
    handler: async (_uri: string, _context: RequestContext) => {
      // Get lock information
      const locksResult = await adapter.executeQuery(`
                SELECT
                    l.locktype,
                    l.mode,
                    l.granted,
                    l.pid,
                    a.usename,
                    a.application_name,
                    a.client_addr::text as client_addr,
                    a.state,
                    a.wait_event_type,
                    a.wait_event,
                    COALESCE(r.relname, l.relation::text) as relation,
                    LEFT(a.query, 100) as query_preview,
                    EXTRACT(EPOCH FROM age(now(), a.query_start)) as query_duration_seconds
                FROM pg_locks l
                LEFT JOIN pg_stat_activity a ON l.pid = a.pid
                LEFT JOIN pg_class r ON l.relation = r.oid
                WHERE l.pid != pg_backend_pid()
                ORDER BY l.granted, a.query_start NULLS LAST
                LIMIT 50
            `);
      const locks = (locksResult.rows ?? []) as unknown as LockRow[];

      // Get active session count for context
      const sessionResult = await adapter.executeQuery(`
                SELECT COUNT(*) as count FROM pg_stat_activity 
                WHERE pid != pg_backend_pid() 
                  AND state = 'active'
            `);
      const activeSessions = Number(sessionResult.rows?.[0]?.["count"] ?? 0);

      // Analyze locks
      const blockingLocks = locks.filter((lock: LockRow) => !lock.granted);
      const activeLocks = locks.filter((lock: LockRow) => lock.granted);

      // Generate warnings
      const warnings: LockWarning[] = [];

      if (blockingLocks.length > 0) {
        warnings.push({
          severity: "HIGH",
          message:
            blockingLocks.length.toString() + " blocked queries detected",
          recommendation:
            "Review blocking queries and consider terminating long-running transactions",
        });
      }

      if (locks.length > 100) {
        warnings.push({
          severity: "MEDIUM",
          message:
            "High number of locks (" +
            locks.length.toString() +
            ") - showing top 50",
          recommendation:
            "May indicate lock contention or long-running transactions",
        });
      }

      if (warnings.length === 0) {
        warnings.push({
          severity: "INFO",
          message: "No lock contention detected",
        });
      }

      // Generate summary message
      const summary =
        locks.length === 0
          ? `No locks detected. ${String(activeSessions)} active sessions. Empty result is normal when queries complete quickly.`
          : `${String(locks.length)} locks held by ${String(new Set(locks.map((l) => l.pid)).size)} processes. ${String(activeSessions)} active sessions.`;

      return {
        totalLocks: locks.length,
        activeLocks: activeLocks.length,
        blockingLocks: blockingLocks.length,
        activeSessions,
        lockDetails: locks,
        warnings,
        summary,
      };
    },
  };
}
