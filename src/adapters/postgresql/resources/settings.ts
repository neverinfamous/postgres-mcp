/**
 * Settings Resource
 *
 * Current PostgreSQL configuration settings with production defaults analysis.
 */

import type { PostgresAdapter } from "../postgres-adapter.js";
import type {
  ResourceDefinition,
  RequestContext,
} from "../../../types/index.js";
import { ASSISTANT_FOCUSED } from "../../../utils/resource-annotations.js";

interface ProductionRecommendation {
  setting: string;
  currentValue: string;
  category: "performance" | "security" | "replication" | "logging";
  priority: "HIGH" | "MEDIUM" | "LOW" | "INFO";
  recommendation: string;
  context?: string;
}

export function createSettingsResource(
  adapter: PostgresAdapter,
): ResourceDefinition {
  return {
    uri: "postgres://settings",
    name: "Server Settings",
    description:
      "Current PostgreSQL configuration settings with production defaults analysis",
    mimeType: "application/json",
    annotations: ASSISTANT_FOCUSED,
    handler: async (_uri: string, _context: RequestContext) => {
      // Get all settings
      const result = await adapter.executeQuery(`
                SELECT name, setting, unit, category, short_desc, boot_val, reset_val
                FROM pg_settings
                WHERE category NOT LIKE '%Developer%'
                ORDER BY category, name
            `);

      // Get key settings for analysis
      const keySettings = await adapter.executeQuery(`
                SELECT name, setting, unit
                FROM pg_settings
                WHERE name IN (
                    'shared_buffers', 'work_mem', 'maintenance_work_mem', 
                    'effective_cache_size', 'max_connections',
                    'wal_level', 'max_wal_senders', 'wal_keep_size',
                    'ssl', 'password_encryption', 'log_connections', 
                    'log_disconnections', 'log_statement', 'log_min_duration_statement',
                    'checkpoint_timeout', 'checkpoint_completion_target'
                )
            `);

      // Build settings map for analysis
      const settingsMap = new Map<
        string,
        { value: string; unit: string | null }
      >();
      for (const row of keySettings.rows ?? []) {
        const name = row["name"] as string;
        const setting = row["setting"] as string;
        const unit = row["unit"] as string | null;
        settingsMap.set(name, { value: setting, unit });
      }

      // Generate production recommendations
      const recommendations: ProductionRecommendation[] = [];

      // Performance settings
      const sharedBuffers = settingsMap.get("shared_buffers");
      if (sharedBuffers) {
        const valueKb = parseInt(sharedBuffers.value, 10) * 8; // 8KB pages
        const valueMb = valueKb / 1024;
        if (valueMb < 256) {
          recommendations.push({
            setting: "shared_buffers",
            currentValue: `${String(valueMb)}MB`,
            category: "performance",
            priority: "HIGH",
            recommendation:
              "Consider increasing to 25% of available RAM (minimum 256MB for production)",
            context: "Default is often too low for production workloads",
          });
        }
      }

      const workMem = settingsMap.get("work_mem");
      if (workMem) {
        const valueKb = parseInt(workMem.value, 10);
        if (valueKb < 8192) {
          // < 8MB
          recommendations.push({
            setting: "work_mem",
            currentValue: `${String(valueKb)}KB`,
            category: "performance",
            priority: "MEDIUM",
            recommendation:
              "Consider increasing to 8-64MB for complex queries (balance with max_connections)",
            context: "Per-operation memory limit affects sorting and hashing",
          });
        }
      }

      const maxConnections = settingsMap.get("max_connections");
      if (maxConnections && parseInt(maxConnections.value, 10) > 200) {
        recommendations.push({
          setting: "max_connections",
          currentValue: maxConnections.value,
          category: "performance",
          priority: "MEDIUM",
          recommendation:
            "High connection count may waste resources. Consider using connection pooling (pgbouncer)",
          context: "Each connection consumes memory; pooling is more efficient",
        });
      }

      // Replication settings
      const walLevel = settingsMap.get("wal_level");
      if (walLevel?.value === "minimal") {
        recommendations.push({
          setting: "wal_level",
          currentValue: "minimal",
          category: "replication",
          priority: "HIGH",
          recommendation:
            'Set to "replica" or "logical" for point-in-time recovery and replication',
          context: "Required for backups, replication, and disaster recovery",
        });
      }

      // Security settings
      const ssl = settingsMap.get("ssl");
      if (ssl?.value === "off") {
        recommendations.push({
          setting: "ssl",
          currentValue: "off",
          category: "security",
          priority: "HIGH",
          recommendation: "Enable SSL for encrypted connections in production",
          context: "Protects data in transit from eavesdropping",
        });
      }

      const passwordEncryption = settingsMap.get("password_encryption");
      if (passwordEncryption?.value === "md5") {
        recommendations.push({
          setting: "password_encryption",
          currentValue: "md5",
          category: "security",
          priority: "MEDIUM",
          recommendation:
            "Consider using scram-sha-256 for stronger password hashing",
          context: "MD5 is cryptographically weaker than SCRAM-SHA-256",
        });
      }

      // Logging settings - log_statement = 'none' is often intentional for high-throughput production systems
      const logStatement = settingsMap.get("log_statement");
      if (logStatement?.value === "none") {
        recommendations.push({
          setting: "log_statement",
          currentValue: "none",
          category: "logging",
          priority: "LOW",
          recommendation:
            'For development/debugging: consider "ddl" or "mod". Production systems often keep "none" for performance.',
          context:
            "log_statement=all can significantly impact performance; evaluate based on your environment",
        });
      }

      // Build memory context with absolute values
      const memoryContext: {
        setting: string;
        currentMb: number;
        description: string;
      }[] = [];

      if (sharedBuffers) {
        const valueKb = parseInt(sharedBuffers.value, 10) * 8;
        const valueMb = Math.round(valueKb / 1024);
        memoryContext.push({
          setting: "shared_buffers",
          currentMb: valueMb,
          description:
            "PostgreSQL buffer cache. Typical recommendation: 25% of system RAM.",
        });
      }

      if (workMem) {
        const valueKb = parseInt(workMem.value, 10);
        const valueMb = Math.round(valueKb / 1024);
        memoryContext.push({
          setting: "work_mem",
          currentMb: valueMb,
          description:
            "Per-operation memory for sorts/hashes. Used per-sort-step, so effective usage = work_mem × concurrent operations.",
        });
      }

      const maintenanceWorkMem = settingsMap.get("maintenance_work_mem");
      if (maintenanceWorkMem) {
        const valueKb = parseInt(maintenanceWorkMem.value, 10);
        const valueMb = Math.round(valueKb / 1024);
        memoryContext.push({
          setting: "maintenance_work_mem",
          currentMb: valueMb,
          description:
            "Memory for VACUUM, CREATE INDEX, ALTER TABLE. Higher values speed up these operations.",
        });
      }

      const effectiveCacheSize = settingsMap.get("effective_cache_size");
      if (effectiveCacheSize) {
        const valueKb = parseInt(effectiveCacheSize.value, 10) * 8;
        const valueGb = Math.round((valueKb / 1024 / 1024) * 10) / 10;
        memoryContext.push({
          setting: "effective_cache_size",
          currentMb: Math.round(valueKb / 1024),
          description: `Planner estimate of OS cache (~${String(valueGb)}GB). Affects index usage decisions.`,
        });
      }

      return {
        settings: result.rows,
        settingsCount: result.rows?.length ?? 0,
        productionRecommendations: recommendations,
        memoryContext,
        analysisNote:
          'Recommendations are general guidance based on common best practices. RAM percentages (e.g., "25% of RAM") are theoretical - PostgreSQL cannot detect actual server memory. Review your specific server specs to calculate actual values. Development databases have different optimal settings than production.',
      };
    },
  };
}
