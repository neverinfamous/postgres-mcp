/**
 * PostgreSQL MCP Resources
 *
 * Provides structured data access via URI patterns.
 * 21 resources total.
 */

import type { PostgresAdapter } from "../postgres-adapter.js";
import type { ResourceDefinition } from "../../../types/index.js";

// Core resources
import { createSchemaResource } from "./schema.js";
import { createTablesResource } from "./tables.js";
import { createSettingsResource } from "./settings.js";
import { createStatsResource } from "./stats.js";
import { createActivityResource } from "./activity.js";
import { createPoolResource } from "./pool.js";

// Observability resources
import { createCapabilitiesResource } from "./capabilities.js";
import { createPerformanceResource } from "./performance.js";
import { createHealthResource } from "./health.js";
import { createExtensionsResource } from "./extensions.js";
import { createIndexesResource } from "./indexes.js";
import { createReplicationResource } from "./replication.js";
import { createVacuumResource } from "./vacuum.js";
import { createLocksResource } from "./locks.js";

// Extension status resources
import { createCronResource } from "./cron.js";
import { createPartmanResource } from "./partman.js";
import { createKcacheResource } from "./kcache.js";
import { createVectorResource } from "./vector.js";
import { createPostgisResource } from "./postgis.js";
import { createCryptoResource } from "./crypto.js";

// Utility resources
import { createInsightsResource } from "./insights.js";

/**
 * Get all PostgreSQL resources (21 total)
 *
 * Core (7):
 * - postgres://schema - Full database schema
 * - postgres://tables - Table listing with metadata
 * - postgres://settings - PostgreSQL configuration
 * - postgres://stats - Table/index statistics with stale detection
 * - postgres://activity - Active connections and queries
 * - postgres://pool - Connection pool statistics
 *
 * Observability (8):
 * - postgres://capabilities - Server version, extensions, tool categories
 * - postgres://performance - pg_stat_statements query metrics
 * - postgres://health - Comprehensive database health status
 * - postgres://extensions - Extension inventory with recommendations
 * - postgres://indexes - Index usage with unused detection
 * - postgres://replication - Replication status and lag monitoring
 * - postgres://vacuum - Vacuum stats and wraparound warnings
 * - postgres://locks - Lock contention detection
 *
 * Extension status (6):
 * - postgres://cron - pg_cron job status and history
 * - postgres://partman - pg_partman partition configuration
 * - postgres://kcache - pg_stat_kcache CPU/I/O metrics
 * - postgres://vector - pgvector columns and indexes
 * - postgres://postgis - PostGIS spatial columns and indexes
 * - postgres://crypto - pgcrypto availability and recommendations
 *
 * Utility (1):
 * - postgres://insights - Business insights memo from pg_append_insight
 *
 */
export function getPostgresResources(
  adapter: PostgresAdapter,
): ResourceDefinition[] {
  return [
    // Core resources
    createSchemaResource(adapter),
    createTablesResource(adapter),
    createSettingsResource(adapter),
    createStatsResource(adapter),
    createActivityResource(adapter),
    createPoolResource(adapter),
    // Observability resources
    createCapabilitiesResource(adapter),
    createPerformanceResource(adapter),
    createHealthResource(adapter),
    createExtensionsResource(adapter),
    createIndexesResource(adapter),
    createReplicationResource(adapter),
    createVacuumResource(adapter),
    createLocksResource(adapter),
    // Extension status resources
    createCronResource(adapter),
    createPartmanResource(adapter),
    createKcacheResource(adapter),
    createVectorResource(adapter),
    createPostgisResource(adapter),
    createCryptoResource(adapter),
    // Utility resources
    createInsightsResource(),
  ];
}
