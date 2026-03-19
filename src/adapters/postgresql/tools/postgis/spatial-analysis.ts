/**
 * PostgreSQL PostGIS Extension Tools - Spatial Analysis
 *
 * Spatial index optimization and spatial clustering tools.
 * 2 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { sanitizeTableName } from "../../../../utils/identifiers.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import {
  GeoClusterSchemaBase,
  GeoClusterSchema,
  // Output schemas
  GeoIndexOptimizeOutputSchema,
  GeoClusterOutputSchema,
} from "../../schemas/index.js";

// =============================================================================
// pg_geo_index_optimize
// =============================================================================

/**
 * Analyze and optimize spatial indexes
 */
export function createGeoIndexOptimizeTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_geo_index_optimize",
    description:
      "Analyze spatial indexes and provide optimization recommendations.",
    group: "postgis",
    inputSchema: z.object({
      table: z
        .string()
        .optional()
        .describe("Specific table to analyze (or all spatial tables)"),
      schema: z.string().optional().describe("Schema name"),
    }),
    outputSchema: GeoIndexOptimizeOutputSchema,
    annotations: readOnly("Geo Index Optimize"),
    icons: getToolIcons("postgis", readOnly("Geo Index Optimize")),
    handler: async (params: unknown, _context: RequestContext) => {
      const parsed = params as { table?: string; schema?: string };
      const schemaName = parsed.schema ?? "public";

      const indexQuery = `
                SELECT
                    c.relname as table_name,
                    i.relname as index_name,
                    a.attname as column_name,
                    pg_size_pretty(pg_relation_size(i.oid)) as index_size,
                    pg_relation_size(i.oid) as index_size_bytes,
                    idx_scan as index_scans,
                    idx_tup_read as tuples_read,
                    idx_tup_fetch as tuples_fetched
                FROM pg_index x
                JOIN pg_class c ON c.oid = x.indrelid
                JOIN pg_class i ON i.oid = x.indexrelid
                JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(x.indkey)
                JOIN pg_namespace n ON n.oid = c.relnamespace
                JOIN pg_type t ON t.oid = a.atttypid
                LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.oid
                WHERE n.nspname = $1
                AND (pg_get_indexdef(i.oid) LIKE '%gist%' OR pg_get_indexdef(i.oid) LIKE '%spgist%')
                AND t.typname IN ('geometry', 'geography')
                ${parsed.table !== undefined ? `AND c.relname = $2` : ""}
                ORDER BY index_size_bytes DESC
            `;

      const indexParams: unknown[] = [schemaName];
      if (parsed.table !== undefined) indexParams.push(parsed.table);

      const [indexes, tableStats] = await Promise.all([
        adapter.executeQuery(indexQuery, indexParams),
        adapter.executeQuery(
          `
                    SELECT
                        c.relname as table_name,
                        n_live_tup as row_count,
                        pg_size_pretty(pg_table_size(c.oid)) as table_size
                    FROM pg_stat_user_tables t
                    JOIN pg_class c ON c.relname = t.relname
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = $1
                    ${parsed.table !== undefined ? `AND c.relname = $${String(parsed.table !== undefined ? 2 : 1)}` : ""}
                    AND EXISTS (
                        SELECT 1 FROM information_schema.columns ic
                        WHERE ic.table_schema = n.nspname
                        AND ic.table_name = c.relname
                        AND ic.udt_name IN ('geometry', 'geography')
                    )
                `,
          indexParams,
        ),
      ]);

      const recommendations: string[] = [];

      for (const idx of indexes.rows ?? []) {
        const scans = Number(idx["index_scans"] ?? 0);
        const sizeBytes = Number(idx["index_size_bytes"] ?? 0);

        if (scans === 0 && sizeBytes > 1024 * 1024) {
          recommendations.push(
            `Index "${String(idx["index_name"])}" on ${String(idx["table_name"])} is unused but takes ${String(idx["index_size"])}. Consider dropping it.`,
          );
        }
        if (scans > 0 && sizeBytes > 100 * 1024 * 1024) {
          recommendations.push(
            `Large spatial index "${String(idx["index_name"])}" (${String(idx["index_size"])}). Consider partitioning the table for better performance.`,
          );
        }
      }

      for (const table of tableStats.rows ?? []) {
        const rowCount = Number(table["row_count"] ?? 0);
        const hasIndex = (indexes.rows ?? []).some(
          (idx) => idx["table_name"] === table["table_name"],
        );

        if (rowCount > 10000 && !hasIndex) {
          recommendations.push(
            `Table "${String(table["table_name"])}" has ${String(rowCount)} rows but no spatial index. Consider adding a GiST index.`,
          );
        }
      }

      // Warn if table filter specified but no results found
      if (
        parsed.table !== undefined &&
        (indexes.rows?.length ?? 0) === 0 &&
        (tableStats.rows?.length ?? 0) === 0
      ) {
        return {
          warning: `Table "${parsed.table}" not found in schema "${schemaName}" or has no spatial columns/indexes.`,
          table: parsed.table,
          schema: schemaName,
          spatialIndexes: [],
          tableStats: [],
          recommendations: [
            `Verify table "${parsed.table}" exists and has geometry/geography columns.`,
          ],
        };
      }

      return {
        spatialIndexes: indexes.rows,
        tableStats: tableStats.rows,
        recommendations:
          recommendations.length > 0
            ? recommendations
            : (indexes.rows?.length ?? 0) === 0
              ? [
                  "No spatial indexes found in this schema. Consider adding GiST indexes for spatial columns.",
                ]
              : ["All spatial indexes appear optimized"],
        tips: [
          "Use GiST indexes for general spatial queries",
          "Consider SP-GiST for point-only data",
          "CLUSTER table by spatial index for range queries",
          "Use BRIN indexes for very large, sorted spatial data",
        ],
      };
    },
  };
}

// =============================================================================
// pg_geo_cluster
// =============================================================================

/**
 * Spatial clustering using ST_ClusterDBSCAN or ST_ClusterKMeans
 */
export function createGeoClusterTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_geo_cluster",
    description:
      "Perform spatial clustering using DBSCAN or K-Means. DBSCAN defaults: eps=100m, minPoints=3. K-Means default: numClusters=5 (provide explicit value for best results).",
    group: "postgis",
    inputSchema: GeoClusterSchemaBase, // Base schema for MCP visibility
    outputSchema: GeoClusterOutputSchema,
    annotations: readOnly("Geo Cluster"),
    icons: getToolIcons("postgis", readOnly("Geo Cluster")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = GeoClusterSchema.parse(params ?? {});

        const method = parsed.method ?? "dbscan";
        const schemaName = parsed.schema ?? "public";
        const qualifiedTable = sanitizeTableName(
          parsed.table,
          schemaName !== "public" ? schemaName : undefined,
        );
        const whereClause =
          parsed.where !== undefined
            ? `WHERE ${sanitizeWhereClause(parsed.where)}`
            : "";
        const limitClause =
          parsed.limit !== undefined && parsed.limit > 0
            ? `LIMIT ${String(parsed.limit)}`
            : "";

        // Track warning if K > N
        let warning: string | undefined;

        // For K-Means, validate and adjust numClusters
        let effectiveNumClusters = parsed.numClusters ?? 5;
        let rowCount: number;
        if (method === "kmeans") {
          // Validate numClusters > 0
          if (effectiveNumClusters <= 0) {
            return {
              error: `numClusters must be greater than 0 (received: ${String(effectiveNumClusters)}).`,
              method,
              table: parsed.table,
              numClusters: effectiveNumClusters,
              suggestion:
                "Provide a positive integer for numClusters (e.g., numClusters: 3)",
            };
          }

          const countResult = await adapter.executeQuery(
            `SELECT COUNT(*) as cnt FROM ${qualifiedTable} ${whereClause}`,
          );
          rowCount = Number(countResult.rows?.[0]?.["cnt"] ?? 0);

          if (rowCount === 0) {
            return {
              error: `No rows found in table ${parsed.table}${whereClause !== "" ? " matching filter" : ""}. K-Means requires at least 1 row.`,
              method,
              table: parsed.table,
              rowCount: 0,
            };
          }

          // Clamp K to row count and warn if exceeded
          if (effectiveNumClusters > rowCount) {
            warning = `Requested ${String(parsed.numClusters)} clusters but only ${String(rowCount)} rows available. Using ${String(rowCount)} clusters instead.`;
            effectiveNumClusters = rowCount;
          }
        }

        let clusterFunction: string;
        if (method === "kmeans") {
          clusterFunction = `ST_ClusterKMeans("${parsed.column}", ${String(effectiveNumClusters)}) OVER ()`;
        } else {
          const eps = parsed.eps ?? 100;
          const minPoints = parsed.minPoints ?? 3;
          clusterFunction = `ST_ClusterDBSCAN("${parsed.column}", ${String(eps)}, ${String(minPoints)}) OVER ()`;
        }

        const sql = `
                  WITH clustered AS (
                      SELECT
                          *,
                          ${clusterFunction} as cluster_id
                      FROM ${qualifiedTable}
                      ${whereClause}
                  )
                  SELECT
                      cluster_id,
                      COUNT(*) as point_count,
                      ST_AsGeoJSON(ST_Centroid(ST_Collect("${parsed.column}"))) as centroid,
                      ST_AsGeoJSON(ST_ConvexHull(ST_Collect("${parsed.column}"))) as hull
                  FROM clustered
                  WHERE cluster_id IS NOT NULL
                  GROUP BY cluster_id
                  ORDER BY point_count DESC
                  ${limitClause}
              `;

        const [clustersResult, summaryResult] = await Promise.all([
          adapter.executeQuery(sql),
          adapter.executeQuery(`
                      WITH clustered AS (
                          SELECT ${clusterFunction} as cluster_id
                          FROM ${qualifiedTable}
                          ${whereClause}
                      )
                      SELECT
                          COUNT(DISTINCT cluster_id) as num_clusters,
                          COUNT(*) FILTER (WHERE cluster_id IS NULL) as noise_points,
                          COUNT(*) as total_points
                      FROM clustered
                  `),
        ]);

        // Normalize cluster point_count to numbers
        const normalizedClusters = (clustersResult.rows ?? []).map((row) => ({
          ...row,
          point_count: Number(row["point_count"]),
        }));

        // Normalize summary values to numbers for consistency
        const rawSummary = summaryResult.rows?.[0] ?? {};
        const normalizedSummary = {
          num_clusters: Number(rawSummary["num_clusters"] ?? 0),
          noise_points: Number(rawSummary["noise_points"] ?? 0),
          total_points: Number(rawSummary["total_points"] ?? 0),
        };

        // Build response
        const response: Record<string, unknown> = {
          method,
          parameters:
            method === "kmeans"
              ? { numClusters: effectiveNumClusters }
              : { eps: parsed.eps ?? 100, minPoints: parsed.minPoints ?? 3 },
          summary: normalizedSummary,
          clusters: normalizedClusters,
        };

        // Add warning if K was clamped
        if (warning !== undefined) {
          response["warning"] = warning;
          response["requestedClusters"] = parsed.numClusters;
          response["actualClusters"] = effectiveNumClusters;
        }

        // Add contextual hints based on method and results
        const numClusters = normalizedSummary.num_clusters;
        const noisePoints = normalizedSummary.noise_points;
        const totalPoints = normalizedSummary.total_points;

        if (method === "dbscan") {
          const eps = parsed.eps ?? 100;
          const minPoints = parsed.minPoints ?? 3;

          // Provide hints about DBSCAN parameter trade-offs
          const hints: string[] = [];

          if (numClusters === 1 && totalPoints > 1) {
            hints.push(
              `All ${String(totalPoints)} points formed a single cluster. Consider decreasing eps (currently ${String(eps)}m) to create more distinct clusters.`,
            );
          }

          if (noisePoints > 0 && noisePoints > totalPoints * 0.5) {
            hints.push(
              `${String(noisePoints)} of ${String(totalPoints)} points (${String(Math.round((noisePoints / totalPoints) * 100))}%) are noise. Consider increasing eps or decreasing minPoints (currently ${String(minPoints)}).`,
            );
          }

          if (numClusters === 0 && totalPoints > 0) {
            hints.push(
              `No clusters formed - all points are noise. Try increasing eps (currently ${String(eps)}m) or decreasing minPoints (currently ${String(minPoints)}).`,
            );
          }

          response["notes"] =
            "Noise points (cluster_id = NULL) are points not belonging to any cluster";

          if (hints.length > 0) {
            response["hints"] = hints;
          }

          response["parameterGuide"] = {
            eps: `Distance threshold in meters. Larger values group more distant points together.`,
            minPoints: `Minimum points required to form a cluster. Higher values create fewer, denser clusters.`,
          };
        } else {
          response["notes"] =
            "K-Means will always assign all points to a cluster";
        }

        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_geo_cluster",
            table:
              ((params as Record<string, unknown>)?.["table"] as string) ??
              undefined,
          });
      }
    },
  };
}
