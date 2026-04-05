/**
 * Replication Resource
 *
 * Primary/replica status, replication slots, WAL status, and lag monitoring.
 */

import type { PostgresAdapter } from "../postgres-adapter.js";
import type {
  ResourceDefinition,
  RequestContext,
} from "../../../types/index.js";
import { LOW_PRIORITY } from "../../../utils/resource-annotations.js";

interface ReplicationInfo {
  role: string;
  replicationSlots: Record<string, unknown>[];
  replicationStats: Record<string, unknown>[];
  walStatus: Record<string, unknown>;
  replicationDelay?: string;
  statusMessage: string;
}

export function createReplicationResource(
  adapter: PostgresAdapter,
): ResourceDefinition {
  return {
    uri: "postgres://replication",
    name: "Replication Status",
    description:
      "Primary/replica status, replication slots, WAL status, and lag monitoring",
    mimeType: "application/json",
    annotations: LOW_PRIORITY,
    handler: async (_uri: string, _context: RequestContext) => {
      // Check if we're on primary or replica
      const roleResult = await adapter.executeQuery(
        "SELECT pg_is_in_recovery() as is_replica",
      );
      const isReplica = roleResult.rows?.[0]?.["is_replica"] === true;

      // Determine if this is a standalone server (not a replica and no replicas connected)
      let role: string;
      let statusMessage: string;
      let replicationSlots: Record<string, unknown>[] = [];
      let replicationStats: Record<string, unknown>[] = [];

      if (isReplica) {
        role = "replica";
        statusMessage =
          "This server is a replica receiving data from a primary server.";
      } else {
        // Primary server - check for replication activity
        const slotsResult = await adapter.executeQuery(`
                    SELECT
                        slot_name,
                        slot_type,
                        database,
                        active,
                        restart_lsn,
                        confirmed_flush_lsn,
                        wal_status,
                        safe_wal_size
                    FROM pg_replication_slots
                `);
        replicationSlots = slotsResult.rows ?? [];

        // Get replication statistics
        const statsResult = await adapter.executeQuery(`
                    SELECT
                        client_addr,
                        application_name,
                        state,
                        sync_state,
                        replay_lsn,
                        write_lag,
                        flush_lag,
                        replay_lag
                    FROM pg_stat_replication
                `);
        replicationStats = statsResult.rows ?? [];

        // Determine if standalone (not a replica and no replication activity)
        const hasReplicationSlots = replicationSlots.length > 0;
        const hasConnectedReplicas = replicationStats.length > 0;

        if (hasReplicationSlots || hasConnectedReplicas) {
          role = "primary";
          const activeSlots = replicationSlots.filter(
            (s) => s["active"] === true,
          ).length;
          if (hasConnectedReplicas) {
            statusMessage = `Primary server with ${replicationStats.length.toString()} connected replica(s).`;
          } else if (activeSlots === 0 && hasReplicationSlots) {
            statusMessage = `Primary server with ${replicationSlots.length.toString()} replication slot(s) but no connected replicas. Check replica connectivity.`;
          } else {
            statusMessage = "Primary server configured for replication.";
          }
        } else {
          role = "standalone";
          statusMessage =
            "Standalone PostgreSQL server with no replication configured. This is expected if you do not require high availability or read replicas.";
        }
      }

      const replicationInfo: ReplicationInfo = {
        role,
        replicationSlots,
        replicationStats,
        walStatus: {},
        statusMessage,
      };

      if (isReplica) {
        // Replica server - get replication delay
        const lagResult = await adapter.executeQuery(`
                    SELECT
                        now() - pg_last_xact_replay_timestamp() AS replication_delay
                `);
        const delay = lagResult.rows?.[0]?.["replication_delay"];
        // Handle interval type from PostgreSQL - convert to string representation
        if (delay != null && typeof delay === "object") {
          replicationInfo.replicationDelay = JSON.stringify(delay);
        } else if (typeof delay === "string") {
          replicationInfo.replicationDelay = delay;
        } else if (delay != null) {
          replicationInfo.replicationDelay = JSON.stringify(delay);
        } else {
          replicationInfo.replicationDelay = "Unknown";
        }
      }

      // Get WAL status (works on both primary and replica)
      try {
        const walResult = await adapter.executeQuery(`
                    SELECT
                        pg_current_wal_lsn() as current_wal_lsn,
                        pg_walfile_name(pg_current_wal_lsn()) as current_wal_file
                `);
        replicationInfo.walStatus = walResult.rows?.[0] ?? {};
      } catch {
        // pg_current_wal_lsn() might fail on replica
        replicationInfo.walStatus = {
          note: "WAL position unavailable (replica mode)",
        };
      }

      return replicationInfo;
    },
  };
}
