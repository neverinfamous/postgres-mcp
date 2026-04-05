/**
 * PostGIS Status Resource
 *
 * Provides PostGIS extension status, spatial columns, and index information.
 */

import type { PostgresAdapter } from "../postgres-adapter.js";
import type { ResourceDefinition } from "../../../types/index.js";
import { LOW_PRIORITY } from "../../../utils/resource-annotations.js";
import { toStr, SMALL_TABLE_THRESHOLD } from "../../../utils/query-helpers.js";

interface SpatialColumn {
  schema: string;
  table: string;
  column: string;
  type: string;
  srid: number;
  dimensions: number;
  rowCount: number;
}

interface SpatialIndex {
  schema: string;
  table: string;
  indexName: string;
  column: string;
  indexType: string;
  size: string;
}

interface UnindexedSpatialColumn {
  column: string;
  suggestedGistSql: string;
}

interface PostgisResourceData {
  extensionInstalled: boolean;
  extensionVersion: string | null;
  fullVersion: string | null;
  spatialColumns: SpatialColumn[];
  columnCount: number;
  geometryCount: number;
  geographyCount: number;
  indexes: SpatialIndex[];
  indexCount: number;
  unindexedColumns: UnindexedSpatialColumn[];
  sridDistribution: { srid: number; count: number }[];
  typeGuidance?: {
    geometry: string;
    geography: string;
    recommendation: string;
  };
  recommendations: string[];
}

export function createPostgisResource(
  adapter: PostgresAdapter,
): ResourceDefinition {
  return {
    uri: "postgres://postgis",
    name: "PostGIS Status",
    description:
      "PostGIS extension status, spatial columns, index usage, and optimization recommendations",
    mimeType: "application/json",
    annotations: LOW_PRIORITY,
    handler: async (): Promise<string> => {
      const result: PostgisResourceData = {
        extensionInstalled: false,
        extensionVersion: null,
        fullVersion: null,
        spatialColumns: [],
        columnCount: 0,
        geometryCount: 0,
        geographyCount: 0,
        indexes: [],
        indexCount: 0,
        unindexedColumns: [],
        sridDistribution: [],
        recommendations: [],
      };

      // Check if PostGIS is installed (outside try-catch for correct error messaging)
      const extCheck = await adapter.executeQuery(
        `SELECT extversion FROM pg_extension WHERE extname = 'postgis'`,
      );

      if (!extCheck.rows || extCheck.rows.length === 0) {
        result.recommendations.push(
          "PostGIS extension is not installed. Use pg_postgis_create_extension to enable geospatial operations.",
        );
        return JSON.stringify(result, null, 2);
      }

      result.extensionInstalled = true;
      const extVersion = extCheck.rows[0]?.["extversion"];
      result.extensionVersion =
        typeof extVersion === "string" ? extVersion : null;

      try {
        // Get full PostGIS version info
        try {
          const versionResult = await adapter.executeQuery(
            `SELECT PostGIS_Full_Version() as version`,
          );
          const fullVersion = versionResult.rows?.[0]?.["version"];
          result.fullVersion =
            typeof fullVersion === "string" ? fullVersion : null;
        } catch {
          // Function might not exist in older versions
        }

        // Get spatial columns from geometry_columns view
        const columnsResult = await adapter.executeQuery(
          `SELECT 
                        gc.f_table_schema,
                        gc.f_table_name,
                        gc.f_geometry_column,
                        gc.type,
                        gc.srid,
                        gc.coord_dimension,
                        COALESCE(s.n_live_tup, 0)::int as row_count
                     FROM geometry_columns gc
                     LEFT JOIN pg_stat_user_tables s 
                        ON s.schemaname = gc.f_table_schema 
                        AND s.relname = gc.f_table_name
                     ORDER BY gc.f_table_schema, gc.f_table_name`,
        );

        if (columnsResult.rows) {
          for (const row of columnsResult.rows) {
            result.spatialColumns.push({
              schema: toStr(row["f_table_schema"]),
              table: toStr(row["f_table_name"]),
              column: toStr(row["f_geometry_column"]),
              type: toStr(row["type"]),
              srid: Number(row["srid"] ?? 0),
              dimensions: Number(row["coord_dimension"] ?? 2),
              rowCount: Number(row["row_count"] ?? 0),
            });
          }
        }

        // Also check geography columns
        try {
          const geoColumnsResult = await adapter.executeQuery(
            `SELECT 
                            gc.f_table_schema,
                            gc.f_table_name,
                            gc.f_geography_column,
                            gc.type,
                            gc.srid,
                            gc.coord_dimension,
                            COALESCE(s.n_live_tup, 0)::int as row_count
                         FROM geography_columns gc
                         LEFT JOIN pg_stat_user_tables s 
                            ON s.schemaname = gc.f_table_schema 
                            AND s.relname = gc.f_table_name
                         ORDER BY gc.f_table_schema, gc.f_table_name`,
          );

          if (geoColumnsResult.rows) {
            for (const row of geoColumnsResult.rows) {
              const geoType = toStr(row["type"]);
              result.spatialColumns.push({
                schema: toStr(row["f_table_schema"]),
                table: toStr(row["f_table_name"]),
                column: toStr(row["f_geography_column"]),
                type: `geography(${geoType})`,
                srid: Number(row["srid"] ?? 4326),
                dimensions: Number(row["coord_dimension"] ?? 2),
                rowCount: Number(row["row_count"] ?? 0),
              });
              result.geographyCount++;
            }
          }
        } catch {
          // geography_columns might not exist
        }

        result.columnCount = result.spatialColumns.length;
        result.geometryCount = result.columnCount - result.geographyCount;

        // Get spatial indexes (GiST on geometry/geography columns)
        const indexResult = await adapter.executeQuery(
          `SELECT 
                        n.nspname as schema_name,
                        t.relname as table_name,
                        i.relname as index_name,
                        a.attname as column_name,
                        am.amname as index_type,
                        pg_size_pretty(pg_relation_size(i.oid)) as index_size
                     FROM pg_index idx
                     JOIN pg_class i ON idx.indexrelid = i.oid
                     JOIN pg_class t ON idx.indrelid = t.oid
                     JOIN pg_namespace n ON t.relnamespace = n.oid
                     JOIN pg_am am ON i.relam = am.oid
                     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(idx.indkey)
                     JOIN pg_type ty ON a.atttypid = ty.oid
                     WHERE am.amname IN ('gist', 'spgist', 'brin')
                       AND ty.typname IN ('geometry', 'geography')
                       AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                     ORDER BY n.nspname, t.relname, i.relname`,
        );

        if (indexResult.rows) {
          for (const row of indexResult.rows) {
            result.indexes.push({
              schema: toStr(row["schema_name"]),
              table: toStr(row["table_name"]),
              indexName: toStr(row["index_name"]),
              column: toStr(row["column_name"]),
              indexType: toStr(row["index_type"]),
              size: toStr(row["index_size"]) || "0 bytes",
            });
          }
        }
        result.indexCount = result.indexes.length;

        // Find unindexed spatial columns and generate actionable SQL
        // Skip small tables where GiST indexes provide minimal benefit
        const indexedColumns = new Set(
          result.indexes.map((i) => `${i.schema}.${i.table}.${i.column}`),
        );

        // Get existing index names to avoid conflicts
        const existingIndexResult = await adapter.executeQuery(`
                    SELECT indexname FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
                `);
        const existingIndexNames = new Set(
          (existingIndexResult.rows ?? []).map(
            (r: Record<string, unknown>) => r["indexname"] as string,
          ),
        );

        const unindexedCols = result.spatialColumns.filter(
          (c) =>
            !indexedColumns.has(`${c.schema}.${c.table}.${c.column}`) &&
            c.rowCount >= SMALL_TABLE_THRESHOLD,
        );

        const smallTableCount = result.spatialColumns.filter(
          (c) =>
            !indexedColumns.has(`${c.schema}.${c.table}.${c.column}`) &&
            c.rowCount < SMALL_TABLE_THRESHOLD,
        ).length;

        result.unindexedColumns = unindexedCols.map((c) => {
          // Generate unique index name
          let gistName = `idx_${c.table}_${c.column}_gist`;

          // Add suffix if name already exists
          let suffix = 1;
          while (existingIndexNames.has(gistName)) {
            gistName = `idx_${c.table}_${c.column}_gist_${String(suffix)}`;
            suffix++;
          }

          return {
            column: `${c.schema}.${c.table}.${c.column}`,
            suggestedGistSql: `CREATE INDEX IF NOT EXISTS "${gistName}" ON "${c.schema}"."${c.table}" USING GIST ("${c.column}");`,
          };
        });

        // SRID distribution
        const sridCounts = new Map<number, number>();
        for (const col of result.spatialColumns) {
          sridCounts.set(col.srid, (sridCounts.get(col.srid) ?? 0) + 1);
        }
        result.sridDistribution = Array.from(sridCounts.entries())
          .map(([srid, count]) => ({ srid, count }))
          .sort((a, b) => b.count - a.count);

        // Generate recommendations
        if (result.columnCount === 0) {
          result.recommendations.push(
            "No spatial columns found. Use pg_geometry_column to add geometry/geography columns.",
          );
        }

        if (result.unindexedColumns.length > 0) {
          const columnNames = result.unindexedColumns
            .slice(0, 3)
            .map((c) => c.column)
            .join(", ");
          result.recommendations.push(
            `${String(result.unindexedColumns.length)} spatial column(s) on larger tables without GiST indexes: ${columnNames}${result.unindexedColumns.length > 3 ? "..." : ""}. See unindexedColumns for ready-to-use CREATE INDEX SQL.`,
          );
        }

        // Note about small tables that were skipped
        if (smallTableCount > 0 && result.unindexedColumns.length === 0) {
          result.recommendations.push(
            `${String(smallTableCount)} unindexed spatial column(s) on small tables (<${String(SMALL_TABLE_THRESHOLD)} rows). Indexes optional for small tables.`,
          );
        }

        for (const col of result.spatialColumns) {
          const isUnindexed = result.unindexedColumns.some(
            (u) => u.column === `${col.schema}.${col.table}.${col.column}`,
          );
          // PostGIS: 10K threshold — spatial queries are expensive even on
          // moderate tables, so GiST indexes matter sooner than for vector search.
          if (col.rowCount > 10000 && isUnindexed) {
            result.recommendations.push(
              `Large unindexed spatial column: ${col.table}.${col.column} (${String(col.rowCount)} rows). GiST index strongly recommended.`,
            );
          }
        }

        if (result.geometryCount > 0 && result.geographyCount === 0) {
          result.recommendations.push(
            "Only geometry columns found. Consider geography type for global distance calculations over large areas.",
          );
        }

        // Add type guidance
        result.typeGuidance = {
          geometry:
            "Geometry type: Planar (flat-earth) calculations. Faster computations. Best for: local areas, projected data, city/region level. Uses cartesian math.",
          geography:
            "Geography type: Spherical (round-earth) calculations. Accurate for global distances. Best for: global datasets, long-distance queries, GPS coordinates. Uses geodetic math.",
          recommendation:
            result.geographyCount > 0 && result.geometryCount > 0
              ? "Using both types appropriately. Geometry for local operations, geography for global calculations."
              : result.geographyCount > 0
                ? "Using geography type - correct for global distance calculations."
                : "Using geometry only. If calculating distances across continents or between far-apart cities, geography type provides more accurate results.",
        };

        // Check for SRID 0 (unknown)
        const unknownSrid = result.spatialColumns.filter((c) => c.srid === 0);
        if (unknownSrid.length > 0) {
          result.recommendations.push(
            `${String(unknownSrid.length)} columns with SRID 0 (unknown). Set proper SRID for accurate calculations.`,
          );
        }
      } catch {
        // Extension is installed but data queries failed
        result.recommendations.push(
          "Error querying PostGIS data. Check permissions on geometry_columns view.",
        );
      }

      return JSON.stringify(result, null, 2);
    },
  };
}
