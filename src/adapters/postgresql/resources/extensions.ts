/**
 * Extensions Resource
 *
 * Extension inventory with versions and installation recommendations.
 */

import type { PostgresAdapter } from "../postgres-adapter.js";
import type {
  ResourceDefinition,
  RequestContext,
} from "../../../types/index.js";
import { LOW_PRIORITY } from "../../../utils/resource-annotations.js";

interface ExtensionRecommendation {
  extension: string;
  priority: "HIGH" | "MEDIUM" | "OPTIONAL";
  sql: string;
  reason: string;
}

export function createExtensionsResource(
  adapter: PostgresAdapter,
): ResourceDefinition {
  return {
    uri: "postgres://extensions",
    name: "Extensions Info",
    description:
      "Installed extensions with versions and installation recommendations",
    mimeType: "application/json",
    annotations: LOW_PRIORITY,
    handler: async (_uri: string, _context: RequestContext) => {
      // Get installed extensions
      const installedResult = await adapter.executeQuery(`
                SELECT 
                    e.extname,
                    e.extversion,
                    e.extrelocatable,
                    n.nspname as schema,
                    d.description
                FROM pg_extension e
                LEFT JOIN pg_namespace n ON e.extnamespace = n.oid
                LEFT JOIN pg_description d ON d.objoid = e.oid
                ORDER BY e.extname
            `);
      const installed = installedResult.rows ?? [];
      const installedNames = installed.map(
        (e: Record<string, unknown>) => e["extname"] as string,
      );

      // Get available but not installed extensions
      const availableResult = await adapter.executeQuery(`
                SELECT name, default_version, comment
                FROM pg_available_extensions
                WHERE name NOT IN (SELECT extname FROM pg_extension)
                AND name IN ('hypopg', 'pg_stat_statements', 'vector', 'postgis', 'pg_trgm', 'fuzzystrmatch')
                ORDER BY name
            `);
      const available = availableResult.rows ?? [];

      // Generate recommendations
      const recommendations: ExtensionRecommendation[] = [];

      const criticalExtensions = ["pg_stat_statements", "hypopg"];
      const optionalExtensions = [
        "vector",
        "postgis",
        "pg_trgm",
        "fuzzystrmatch",
      ];

      for (const extName of criticalExtensions) {
        if (!installedNames.includes(extName)) {
          recommendations.push({
            extension: extName,
            priority: "HIGH",
            sql: `CREATE EXTENSION IF NOT EXISTS ${extName};`,
            reason:
              extName === "pg_stat_statements"
                ? "Critical for performance monitoring"
                : "Enables risk-free index testing",
          });
        }
      }

      const reasonMap: Record<string, string> = {
        vector: "Enables AI-native semantic search",
        postgis: "Enables geospatial operations",
        pg_trgm: "Enables fuzzy text search",
        fuzzystrmatch: "Enables phonetic matching",
      };

      for (const extName of optionalExtensions) {
        if (!installedNames.includes(extName)) {
          recommendations.push({
            extension: extName,
            priority: "OPTIONAL",
            sql: `CREATE EXTENSION IF NOT EXISTS ${extName};`,
            reason: reasonMap[extName] ?? "Adds useful functionality",
          });
        }
      }

      return {
        installedCount: installed.length,
        installedExtensions: installed,
        availableExtensions: available,
        recommendations,
      };
    },
  };
}
