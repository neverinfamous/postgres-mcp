/**
 * Capabilities Resource
 *
 * Server version, tool categories, extension status, and recommendations.
 */

import type { PostgresAdapter } from "../postgres-adapter.js";
import type {
  ResourceDefinition,
  RequestContext,
} from "../../../types/index.js";
import { ASSISTANT_FOCUSED } from "../../../utils/resource-annotations.js";

interface ExtensionStatus {
  installed: boolean;
  purpose: string;
  whyCritical: string;
  installNote: string;
  requiredFor: string[];
}

interface ToolCategory {
  count: number;
  description: string;
  examples: string[];
}

export function createCapabilitiesResource(
  adapter: PostgresAdapter,
): ResourceDefinition {
  return {
    uri: "postgres://capabilities",
    name: "Server Capabilities",
    description:
      "PostgreSQL version, installed extensions, tool categories, and recommendations",
    mimeType: "application/json",
    annotations: ASSISTANT_FOCUSED,
    handler: async (_uri: string, _context: RequestContext) => {
      // Get PostgreSQL version
      const versionResult = await adapter.executeQuery("SELECT version()");
      const pgVersion = versionResult.rows?.[0]?.["version"] ?? "Unknown";

      // Get installed extensions
      const extResult = await adapter.executeQuery(`
                SELECT extname, extversion
                FROM pg_extension
                ORDER BY extname
            `);
      const extensions = extResult.rows ?? [];
      const installedNames = extensions.map(
        (e: Record<string, unknown>) => e["extname"] as string,
      );

      // Check critical extensions
      const hasPgStat = installedNames.includes("pg_stat_statements");
      const hasHypopg = installedNames.includes("hypopg");
      const hasPgvector = installedNames.includes("vector");
      const hasPostgis = installedNames.includes("postgis");

      // Tool categories with examples
      const toolCategories: Record<string, ToolCategory> = {
        Core: {
          count: 13,
          description: "CRUD, schema, tables, indexes, health analysis",
          examples: ["pg_query", "pg_insert", "pg_create_table"],
        },
        Transactions: {
          count: 7,
          description: "BEGIN, COMMIT, ROLLBACK, savepoints",
          examples: ["pg_begin", "pg_commit", "pg_savepoint"],
        },
        JSONB: {
          count: 19,
          description: "jsonb_set, jsonb_extract, path queries, merge, diff",
          examples: ["pg_jsonb_get", "pg_jsonb_set", "pg_jsonb_merge"],
        },
        Text: {
          count: 11,
          description: "Full-text search, trigram, fuzzy matching",
          examples: ["pg_fts_search", "pg_trigram_search", "pg_fuzzy_match"],
        },
        Stats: {
          count: 8,
          description:
            "Descriptive stats, percentiles, correlation, regression",
          examples: ["pg_stats_summary", "pg_percentile", "pg_correlation"],
        },
        Performance: {
          count: 16,
          description: "EXPLAIN ANALYZE, plan compare, baseline",
          examples: [
            "pg_explain_analyze",
            "pg_plan_compare",
            "pg_query_baseline",
          ],
        },
        Admin: {
          count: 10,
          description: "VACUUM, ANALYZE, REINDEX, configuration",
          examples: ["pg_vacuum", "pg_analyze", "pg_reindex"],
        },
        Monitoring: {
          count: 11,
          description: "Database sizes, connections, replication",
          examples: [
            "pg_database_size",
            "pg_active_connections",
            "pg_replication_status",
          ],
        },
        Backup: {
          count: 9,
          description: "pg_dump, COPY, physical backup, restore validation",
          examples: ["pg_dump_schema", "pg_copy_export", "pg_restore_command"],
        },
        Schema: {
          count: 10,
          description: "Schemas, sequences, views, functions, triggers",
          examples: ["pg_create_schema", "pg_create_view", "pg_list_functions"],
        },
        Vector: {
          count: 14,
          description: "pgvector - similarity search, clustering",
          examples: [
            "pg_vector_search",
            "pg_vector_add_column",
            "pg_vector_create_index",
          ],
        },
        PostGIS: {
          count: 12,
          description: "Geospatial operations, spatial indexes",
          examples: ["pg_distance", "pg_intersection", "pg_spatial_index"],
        },
        Partitioning: {
          count: 6,
          description: "Range/list/hash partitioning management",
          examples: [
            "pg_create_partitioned_table",
            "pg_create_partition",
            "pg_attach_partition",
          ],
        },
      };

      // Critical extension status with explanations
      const criticalExtensions: Record<string, ExtensionStatus> = {
        pg_stat_statements: {
          installed: hasPgStat,
          purpose: "Query performance tracking",
          whyCritical:
            "Essential for identifying slow queries, optimization opportunities, and workload analysis. Without it, performance tuning is guesswork.",
          installNote:
            "CREATE EXTENSION pg_stat_statements; -- Also add to shared_preload_libraries in postgresql.conf and restart",
          requiredFor: ["pg_top_queries", "pg_slow_queries", "pg_query_stats"],
        },
        hypopg: {
          installed: hasHypopg,
          purpose: "Hypothetical index testing (zero-risk)",
          whyCritical:
            "Allows testing index effectiveness without actually creating them. Prevents creating unused indexes.",
          installNote: "CREATE EXTENSION hypopg; -- No restart required",
          requiredFor: ["pg_explain_analyze with hypothetical indexes"],
        },
        pgvector: {
          installed: hasPgvector,
          purpose: "Vector similarity search",
          whyCritical:
            "Required for AI/ML embeddings, semantic search, and recommendation systems.",
          installNote:
            "CREATE EXTENSION vector; -- May need to install from packages first",
          requiredFor: [
            "pg_vector_search",
            "pg_vector_create_index",
            "all pg_vector_* tools",
          ],
        },
        postgis: {
          installed: hasPostgis,
          purpose: "Geospatial operations",
          whyCritical:
            "Required for location-based queries, mapping, and geographic analysis.",
          installNote:
            "CREATE EXTENSION postgis; -- May need to install from packages first",
          requiredFor: ["pg_distance", "pg_intersection", "all pg_geo_* tools"],
        },
      };

      // Generate recommendations
      const recommendations: {
        priority: string;
        extension: string;
        sql: string;
        reason: string;
      }[] = [];

      if (!hasPgStat) {
        recommendations.push({
          priority: "HIGH",
          extension: "pg_stat_statements",
          sql: "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;",
          reason: "Critical for performance monitoring",
        });
      }
      if (!hasHypopg) {
        recommendations.push({
          priority: "MEDIUM",
          extension: "hypopg",
          sql: "CREATE EXTENSION IF NOT EXISTS hypopg;",
          reason: "Enables risk-free index testing",
        });
      }

      return {
        serverVersion: "0.3.0",
        postgresqlVersion: pgVersion,
        totalTools: 146,
        totalResources: 23,
        totalPrompts: 7,
        toolCategories,
        installedExtensions: extensions,
        criticalExtensions,
        recommendations,
      };
    },
  };
}
