import type { PostgresAdapter } from "./postgres-adapter.js";
import type { BackupManager } from "../../audit/backup-manager.js";
import type {
  ToolDefinition,
  ResourceDefinition,
  PromptDefinition,
  ToolGroup,
} from "../../types/index.js";

import { getCoreTools } from "./tools/core/index.js";
import { getTransactionTools } from "./tools/transactions.js";
import { getJsonbTools } from "./tools/jsonb/index.js";
import { getTextTools } from "./tools/text/index.js";
import { getPerformanceTools } from "./tools/performance/index.js";
import { getAdminTools } from "./tools/admin/index.js";
import { getMonitoringTools } from "./tools/monitoring/index.js";
import { getBackupTools } from "./tools/backup/index.js";
import { getSchemaTools } from "./tools/schema/index.js";
import { getVectorTools } from "./tools/vector/index.js";
import { getPostgisTools } from "./tools/postgis/index.js";
import { getPartitioningTools } from "./tools/partitioning/index.js";
import { getStatsTools } from "./tools/stats/index.js";
import { getCronTools } from "./tools/cron/index.js";
import { getPartmanTools } from "./tools/partman/index.js";
import { getKcacheTools } from "./tools/kcache/index.js";
import { getCitextTools } from "./tools/citext/index.js";
import { getLtreeTools } from "./tools/ltree/index.js";
import { getPgcryptoTools } from "./tools/pgcrypto.js";
import { getIntrospectionTools } from "./tools/introspection/index.js";
import { getMigrationTools } from "./tools/migration/index.js";
import { getCodeModeTools } from "./tools/codemode/index.js";
import { getPostgresResources } from "./resources/index.js";
import { getPostgresPrompts } from "./prompts/index.js";

export function getSupportedPostgresToolGroups(): ToolGroup[] {
  return [
    "core",
    "transactions",
    "jsonb",
    "text",
    "performance",
    "admin",
    "monitoring",
    "backup",
    "schema",
    "vector",
    "postgis",
    "partitioning",
    "stats",
    "cron",
    "partman",
    "kcache",
    "citext",
    "ltree",
    "pgcrypto",
    "introspection",
    "migration",
    "codemode",
  ];
}

export function buildPostgresToolDefinitions(
  adapter: PostgresAdapter,
  backupManager: BackupManager | null,
): ToolDefinition[] {
  return [
    ...getCoreTools(adapter),
    ...getTransactionTools(adapter),
    ...getJsonbTools(adapter),
    ...getTextTools(adapter),
    ...getPerformanceTools(adapter),
    ...getAdminTools(adapter),
    ...getMonitoringTools(adapter),
    ...getBackupTools(adapter, backupManager),
    ...getSchemaTools(adapter),
    ...getVectorTools(adapter),
    ...getPostgisTools(adapter),
    ...getPartitioningTools(adapter),
    ...getStatsTools(adapter),
    ...getCronTools(adapter),
    ...getPartmanTools(adapter),
    ...getKcacheTools(adapter),
    ...getCitextTools(adapter),
    ...getLtreeTools(adapter),
    ...getPgcryptoTools(adapter),
    ...getIntrospectionTools(adapter),
    ...getMigrationTools(adapter),
    ...getCodeModeTools(adapter),
  ];
}

export function buildPostgresResourceDefinitions(
  adapter: PostgresAdapter,
): ResourceDefinition[] {
  return getPostgresResources(adapter);
}

export function buildPostgresPromptDefinitions(
  adapter: PostgresAdapter,
): PromptDefinition[] {
  return getPostgresPrompts(adapter);
}
