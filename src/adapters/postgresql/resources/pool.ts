/**
 * Pool Resource
 *
 * MCP server connection pool statistics with external pooler detection.
 */

import type { PostgresAdapter } from "../postgres-adapter.js";
import type {
  ResourceDefinition,
  RequestContext,
} from "../../../types/index.js";
import { LOW_PRIORITY } from "../../../utils/resource-annotations.js";

interface ExternalPoolerInfo {
  detected: boolean;
  type: "pgbouncer" | "pgpool" | "none";
  hint?: string;
}

export function createPoolResource(
  adapter: PostgresAdapter,
): ResourceDefinition {
  return {
    uri: "postgres://pool",
    name: "Connection Pool",
    description:
      "MCP server connection pool statistics with external pooler detection",
    mimeType: "application/json",
    annotations: LOW_PRIORITY,
    handler: async (_uri: string, _context: RequestContext) => {
      const pool = adapter.getPool();
      if (!pool) {
        return { error: "Pool not initialized" };
      }

      const stats = pool.getStats();
      const health = await pool.checkHealth();

      // Determine pool status
      let status: "idle" | "active" | "busy" | "empty";
      if (stats.total === 0) {
        status = "empty";
      } else if (stats.active > 0 && stats.active >= stats.total - 1) {
        status = "busy";
      } else if (stats.active > 0) {
        status = "active";
      } else {
        status = "idle";
      }

      // Detect external poolers
      const externalPooler: ExternalPoolerInfo = {
        detected: false,
        type: "none",
      };

      try {
        // Check for pgbouncer by looking for its admin database or signature
        const pgbouncerCheck = await adapter.executeQuery(`
                    SELECT COUNT(*) as count FROM pg_database WHERE datname = 'pgbouncer'
                `);
        const hasPgbouncerDb =
          Number(pgbouncerCheck.rows?.[0]?.["count"] ?? 0) > 0;

        if (hasPgbouncerDb) {
          externalPooler.detected = true;
          externalPooler.type = "pgbouncer";
          externalPooler.hint =
            'pgbouncer database detected. Use "SHOW POOLS" on pgbouncer admin database for pooler stats.';
        }

        // Alternative detection: check for pgbouncer in application_name patterns
        if (!hasPgbouncerDb) {
          const appNameCheck = await adapter.executeQuery(`
                        SELECT COUNT(*) as count FROM pg_stat_activity 
                        WHERE application_name ILIKE '%pgbouncer%' OR application_name ILIKE '%pgpool%'
                    `);
          const hasPoolerConnections =
            Number(appNameCheck.rows?.[0]?.["count"] ?? 0) > 0;
          if (hasPoolerConnections) {
            externalPooler.detected = true;
            externalPooler.type = "pgbouncer";
            externalPooler.hint =
              "Connections via external pooler detected. This resource shows MCP internal pool stats only.";
          }
        }
      } catch {
        // Detection failed, continue with default
      }

      // Build contextual note
      let note = "Reports the MCP server internal connection pool.";
      if (status === "empty" || status === "idle") {
        note += " Values of 0 are normal when the pool is idle.";
      }
      if (externalPooler.detected) {
        note += ` External pooler (${externalPooler.type}) detected - see externalPooler.hint for querying pooler stats.`;
      } else {
        note +=
          " For external poolers like PgBouncer, query the pgbouncer admin database directly.";
      }

      return {
        stats,
        health,
        isInitialized: pool.isInitialized(),
        status,
        externalPooler,
        note,
      };
    },
  };
}
