/**
 * postgres-mcp - PostGIS Extension Tools Unit Tests
 *
 * Tests for geospatial operations (15 tools total).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PostgresAdapter } from "../../postgres-adapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../__tests__/mocks/index.js";
import { getPostgisTools } from "../postgis/index.js";

describe("PostGIS Tools", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let mockContext: ReturnType<typeof createMockRequestContext>;
  let tools: ReturnType<typeof getPostgisTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    mockContext = createMockRequestContext();
    tools = getPostgisTools(mockAdapter as unknown as PostgresAdapter);
  });

  const findTool = (name: string) => tools.find((t) => t.name === name);

  describe("pg_postgis_create_extension", () => {
    it("should create PostGIS extension", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_postgis_create_extension");
      const result = (await tool!.handler({}, mockContext)) as {
        success: boolean;
        message: string;
      };

      expect(result.success).toBe(true);
      expect(result.message).toContain("PostGIS");
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("CREATE EXTENSION IF NOT EXISTS postgis"),
      );
    });
  });

  describe("pg_geometry_column", () => {
    it("should add geometry column with defaults", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_geometry_column");
      const result = (await tool!.handler(
        {
          table: "locations",
          column: "geom",
        },
        mockContext,
      )) as { success: boolean; srid: number; type: string };

      expect(result.success).toBe(true);
      expect(result.srid).toBe(4326);
      expect(result.type).toBe("GEOMETRY");
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("AddGeometryColumn"),
        ["public", "locations", "geom", 4326, "GEOMETRY"],
      );
    });

    it("should add geometry column with custom settings", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_geometry_column");
      await tool!.handler(
        {
          table: "regions",
          column: "boundary",
          srid: 3857,
          type: "POLYGON",
          schema: "geo",
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("AddGeometryColumn"),
        ["geo", "regions", "boundary", 3857, "POLYGON"],
      );
    });

    it("should return alreadyExists when ifNotExists is true and column exists", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ column_name: "geom" }],
      });

      const tool = findTool("pg_geometry_column");
      const result = (await tool!.handler(
        {
          table: "locations",
          column: "geom",
          ifNotExists: true,
        },
        mockContext,
      )) as { success: boolean; alreadyExists: boolean };

      expect(result.success).toBe(true);
      expect(result.alreadyExists).toBe(true);
      // Should only call the check query, not AddGeometryColumn
      expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(1);
    });

    it("should accept tableName as alias for table", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_geometry_column");
      await tool!.handler(
        {
          tableName: "locations", // Using alias
          column: "geom",
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("AddGeometryColumn"),
        expect.arrayContaining(["locations"]),
      );
    });
  });

  describe("pg_point_in_polygon", () => {
    it("should find polygons containing a point", async () => {
      // First mock: geometry type check
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ geom_type: "POLYGON" }],
      });
      // Second mock: column query to get non-geometry columns
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ column_name: "id" }, { column_name: "name" }],
      });
      // Third mock: actual point in polygon query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: "Zone A", geometry_text: "POLYGON(...)" }],
      });

      const tool = findTool("pg_point_in_polygon");
      const result = (await tool!.handler(
        {
          table: "zones",
          column: "geom",
          point: { lat: 40.7128, lng: -74.006 },
        },
        mockContext,
      )) as { containingPolygons: unknown[]; count: number };

      expect(result.count).toBe(1);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("ST_Contains"),
        [-74.006, 40.7128],
      );
    });

    it("should use schema parameter for non-public schemas", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ geom_type: "POLYGON" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_point_in_polygon");
      await tool!.handler(
        {
          schema: "geo",
          table: "zones",
          column: "geom",
          point: { lat: 40.7128, lng: -74.006 },
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('"geo"."zones"'),
        expect.anything(),
      );
    });
  });

  describe("pg_distance", () => {
    it("should find nearby geometries", async () => {
      // First mock: column query to get non-geometry columns
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ column_name: "id" }, { column_name: "name" }],
      });
      // Second mock: actual distance query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, name: "Store 1", distance_meters: 150 },
          { id: 2, name: "Store 2", distance_meters: 300 },
        ],
      });

      const tool = findTool("pg_distance");
      const result = (await tool!.handler(
        {
          table: "stores",
          column: "location",
          point: { lat: 40.7128, lng: -74.006 },
          limit: 5,
        },
        mockContext,
      )) as { results: unknown[]; count: number };

      expect(result.count).toBe(2);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("ST_Distance"),
        [-74.006, 40.7128],
      );
    });

    it("should use schema parameter for non-public schemas", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ column_name: "id" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_distance");
      await tool!.handler(
        {
          schema: "geo",
          table: "stores",
          column: "location",
          point: { lat: 40.7128, lng: -74.006 },
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('"geo"."stores"'),
        expect.anything(),
      );
    });

    it("should filter by max distance", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ column_name: "id" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_distance");
      await tool!.handler(
        {
          table: "stores",
          column: "location",
          point: { lat: 40.7128, lng: -74.006 },
          maxDistance: 1000,
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("<= 1000"),
        expect.anything(),
      );
    });

    it("should use CTE for consistent distance filtering", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ column_name: "id" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_distance");
      await tool!.handler(
        {
          table: "stores",
          column: "location",
          point: { lat: 40.7128, lng: -74.006 },
          maxDistance: 5000,
        },
        mockContext,
      );

      // Verify CTE structure is used
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("WITH distances AS"),
        expect.anything(),
      );
      // Verify filtering uses computed distance_meters column
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("WHERE distance_meters <="),
        expect.anything(),
      );
    });

    it("should accept geom as alias for column", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ column_name: "id" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_distance");
      await tool!.handler(
        {
          table: "stores",
          geom: "location", // Using alias
          point: { lat: 40.7128, lng: -74.006 },
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('"location"'),
        expect.anything(),
      );
    });

    it("should accept geometry as alias for column", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ column_name: "id" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_distance");
      await tool!.handler(
        {
          table: "stores",
          geometry: "location", // Using alias
          point: { lat: 40.7128, lng: -74.006 },
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('"location"'),
        expect.anything(),
      );
    });
  });

  describe("pg_buffer", () => {
    it("should create buffer zones", async () => {
      // First mock: column query to get non-geometry columns
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ column_name: "id" }],
      });
      // Second mock: actual buffer query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 1, buffer_geojson: '{"type":"Polygon",...}' }],
      });

      const tool = findTool("pg_buffer");
      const result = (await tool!.handler(
        {
          table: "locations",
          column: "geom",
          distance: 500,
        },
        mockContext,
      )) as { results: unknown[] };

      expect(result.results).toHaveLength(1);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("ST_Buffer"),
        [500],
      );
    });

    it("should apply where clause", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ column_name: "id" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_buffer");
      await tool!.handler(
        {
          table: "locations",
          column: "geom",
          distance: 100,
          where: "type = 'store'",
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("type = 'store'"),
        expect.anything(),
      );
    });
  });

  describe("pg_intersection", () => {
    it("should find intersecting geometries with GeoJSON", async () => {
      // First mock: column query to get non-geometry columns
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ column_name: "id" }, { column_name: "name" }],
      });
      // Second mock: actual intersection query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, geometry_text: "POINT(...)" },
          { id: 2, geometry_text: "POINT(...)" },
        ],
      });

      const tool = findTool("pg_intersection");
      const result = (await tool!.handler(
        {
          table: "parcels",
          column: "boundary",
          geometry:
            '{"type":"Polygon","coordinates":[[[-74,40],[-74,41],[-73,41],[-73,40],[-74,40]]]}',
        },
        mockContext,
      )) as { intersecting: unknown[]; count: number };

      expect(result.count).toBe(2);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("ST_GeomFromGeoJSON"),
        expect.anything(),
      );
    });

    it("should find intersecting geometries with WKT", async () => {
      // First mock: column query to get non-geometry columns
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ column_name: "id" }],
      });
      // Second mock: actual intersection query
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_intersection");
      await tool!.handler(
        {
          table: "parcels",
          column: "boundary",
          geometry: "POLYGON((-74 40, -74 41, -73 41, -73 40, -74 40))",
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("ST_GeomFromText"),
        expect.anything(),
      );
    });
  });

  describe("pg_bounding_box", () => {
    it("should find geometries in bounding box", async () => {
      // First mock: column query to get non-geometry columns
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ column_name: "id" }, { column_name: "name" }],
      });
      // Second mock: actual bounding box query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, geometry_text: "POINT(...)" },
          { id: 2, geometry_text: "POINT(...)" },
          { id: 3, geometry_text: "POINT(...)" },
        ],
      });

      const tool = findTool("pg_bounding_box");
      const result = (await tool!.handler(
        {
          table: "points",
          column: "geom",
          minLng: -74.1,
          minLat: 40.7,
          maxLng: -73.9,
          maxLat: 40.8,
        },
        mockContext,
      )) as { results: unknown[]; count: number };

      expect(result.count).toBe(3);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("ST_MakeEnvelope"),
        [-74.1, 40.7, -73.9, 40.8],
      );
    });
  });

  describe("pg_spatial_index", () => {
    it("should create GiST spatial index", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }); // Table exists
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // Index does not exist

      const tool = findTool("pg_spatial_index");
      const result = (await tool!.handler(
        {
          table: "locations",
          column: "geom",
        },
        mockContext,
      )) as { success: boolean; index: string };

      expect(result.success).toBe(true);
      expect(result.index).toContain("idx_locations_geom");
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("USING GIST"),
      );
    });

    it("should use custom index name", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }); // Table exists
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // Index does not exist

      const tool = findTool("pg_spatial_index");
      await tool!.handler(
        {
          table: "locations",
          column: "geom",
          name: "custom_spatial_idx",
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('"custom_spatial_idx"'),
      );
    });

    it("should return alreadyExists when ifNotExists is true and index exists", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }); // Table exists
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ exists: true }],
      });

      const tool = findTool("pg_spatial_index");
      const result = (await tool!.handler(
        {
          table: "locations",
          column: "geom",
          ifNotExists: true,
        },
        mockContext,
      )) as { success: boolean; alreadyExists: boolean };

      expect(result.success).toBe(true);
      expect(result.alreadyExists).toBe(true);
      expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(2);
    });

    it("should accept indexName as alias for name", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }); // Table exists
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // Index does not exist

      const tool = findTool("pg_spatial_index");
      await tool!.handler(
        {
          table: "locations",
          column: "geom",
          indexName: "my_custom_idx", // Using alias
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('"my_custom_idx"'),
      );
    });
  });

  // Advanced PostGIS Tools

  describe("pg_geocode", () => {
    it("should create point from coordinates", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          {
            geojson: '{"type":"Point","coordinates":[-74.0060,40.7128]}',
            wkt: "POINT(-74.0060 40.7128)",
          },
        ],
      });

      const tool = findTool("pg_geocode");
      const result = (await tool!.handler(
        {
          lat: 40.7128,
          lng: -74.006,
        },
        mockContext,
      )) as { geojson: string; wkt: string };

      expect(result.geojson).toContain("Point");
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("ST_MakePoint"),
        [-74.006, 40.7128, 4326],
      );
    });

    it("should use custom SRID", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{}] });

      const tool = findTool("pg_geocode");
      await tool!.handler(
        {
          lat: 40.7128,
          lng: -74.006,
          srid: 3857,
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.anything(),
        [-74.006, 40.7128, 3857],
      );
    });

    it("should reject when lat/lng are missing", async () => {
      const tool = findTool("pg_geocode");

      // Empty object should fail validation
      const result1 = (await tool!.handler({}, mockContext)) as {
        success: boolean;
        error: string;
      };
      expect(result1.success).toBe(false);
      expect(result1.error).toMatch(/lat.*required/i);

      // Only lat without lng should fail
      const result2 = (await tool!.handler({ lat: 40.7128 }, mockContext)) as {
        success: boolean;
        error: string;
      };
      expect(result2.success).toBe(false);
      expect(result2.error).toMatch(/lng.*required/i);
    });
  });

  describe("pg_geo_transform", () => {
    it("should transform geometry between SRIDs", async () => {
      // First mock: column query to get non-geometry columns
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ column_name: "id" }, { column_name: "name" }],
      });
      // Second mock: actual transform query
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test",
            transformed_geojson: "{}",
            transformed_wkt: "POINT(...)",
          },
        ],
      });

      const tool = findTool("pg_geo_transform");
      const result = (await tool!.handler(
        {
          table: "locations",
          column: "geom",
          fromSrid: 4326,
          toSrid: 3857,
        },
        mockContext,
      )) as { fromSrid: number; toSrid: number };

      expect(result.fromSrid).toBe(4326);
      expect(result.toSrid).toBe(3857);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("ST_Transform"),
      );
    });
  });

  describe("pg_geo_index_optimize", () => {
    it("should analyze spatial indexes", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({
          rows: [
            {
              table_name: "locations",
              index_name: "idx_locations_geom",
              index_size: "10 MB",
              index_scans: 1000,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { table_name: "locations", row_count: 50000, table_size: "100 MB" },
          ],
        });

      const tool = findTool("pg_geo_index_optimize");
      const result = (await tool!.handler({}, mockContext)) as {
        spatialIndexes: unknown[];
        recommendations: string[];
      };

      expect(result.spatialIndexes).toHaveLength(1);
      expect(result.recommendations).toBeDefined();
    });

    it("should recommend index for large unindexed tables", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [] }) // No indexes
        .mockResolvedValueOnce({
          rows: [{ table_name: "big_table", row_count: 100000 }],
        });

      const tool = findTool("pg_geo_index_optimize");
      const result = (await tool!.handler({}, mockContext)) as {
        recommendations: string[];
      };

      expect(
        result.recommendations.some((r) => r.includes("no spatial index")),
      ).toBe(true);
    });
  });

  describe("pg_geo_cluster", () => {
    it("should perform DBSCAN clustering by default", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({
          rows: [
            { cluster_id: 0, point_count: 50, centroid: "{}" },
            { cluster_id: 1, point_count: 30, centroid: "{}" },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ num_clusters: 2, noise_points: 10, total_points: 90 }],
        });

      const tool = findTool("pg_geo_cluster");
      const result = (await tool!.handler(
        {
          table: "points",
          column: "geom",
        },
        mockContext,
      )) as { method: string; clusters: unknown[] };

      expect(result.method).toBe("dbscan");
      expect(result.clusters).toHaveLength(2);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("ST_ClusterDBSCAN"),
      );
    });

    it("should perform K-Means clustering", async () => {
      // First call is COUNT validation, then 2 clustering queries
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ cnt: 10 }] }) // COUNT validation
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{}] });

      const tool = findTool("pg_geo_cluster");
      await tool!.handler(
        {
          table: "points",
          column: "geom",
          method: "kmeans",
          numClusters: 5,
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("ST_ClusterKMeans"),
      );
    });

    it("should accept algorithm as alias for method", async () => {
      // First call is COUNT validation, then 2 clustering queries
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ cnt: 10 }] }) // COUNT validation
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{}] });

      const tool = findTool("pg_geo_cluster");
      await tool!.handler(
        {
          table: "points",
          column: "geom",
          algorithm: "kmeans", // Using alias
          numClusters: 5,
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("ST_ClusterKMeans"),
      );
    });

    it("should accept k as alias for numClusters", async () => {
      // First call is COUNT validation, then 2 clustering queries
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ cnt: 10 }] }) // COUNT validation
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{}] });

      const tool = findTool("pg_geo_cluster");
      await tool!.handler(
        {
          table: "points",
          column: "geom",
          method: "kmeans",
          k: 3, // Using k alias instead of numClusters
        },
        mockContext,
      );

      // Verify k=3 is used, not default of 5
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ST_ClusterKMeans("geom", 3)'),
      );
    });

    it("should merge params object with top-level params", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{}] });

      const tool = findTool("pg_geo_cluster");
      await tool!.handler(
        {
          table: "points",
          column: "geom",
          method: "dbscan",
          eps: 200, // Top-level overrides params.eps
          params: { eps: 100, minPoints: 5 }, // minPoints comes from params
        },
        mockContext,
      );

      // Top-level eps (200) takes precedence, params.minPoints (5) is used
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ST_ClusterDBSCAN("geom", 200, 5)'),
      );
    });
  });

  describe("Basic Tools Error and Edge Case Coverage", () => {
    const basicTools = [
      "pg_geometry_column",
      "pg_point_in_polygon",
      "pg_distance",
      "pg_buffer",
      "pg_intersection",
      "pg_bounding_box",
      "pg_spatial_index",
    ];

    it("should catch ZodError for invalid inputs across basic tools", async () => {
      for (const toolName of basicTools) {
        const tool = findTool(toolName);
        const result = (await tool!.handler(
          { invalidParam: 123 },
          mockContext,
        )) as any;
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
      }
    });

    it("should format Postgres errors across basic tools", async () => {
      // Create valid params for each tool
      const validParams: Record<string, any> = {
        pg_geometry_column: { table: "t", column: "c" },
        pg_point_in_polygon: {
          table: "t",
          column: "c",
          point: { lat: 0, lng: 0 },
        },
        pg_distance: { table: "t", column: "c", point: { lat: 0, lng: 0 } },
        pg_buffer: { table: "t", column: "c", distance: 10 },
        pg_intersection: { table: "t", column: "c", geometry: "POINT(0 0)" },
        pg_bounding_box: {
          table: "t",
          column: "c",
          minLng: 0,
          minLat: 0,
          maxLng: 1,
          maxLat: 1,
        },
        pg_spatial_index: { table: "t", column: "c" },
      };

      for (const toolName of basicTools) {
        mockAdapter.executeQuery.mockRejectedValue(new Error("Database error"));
        const tool = findTool(toolName);
        const result = (await tool!.handler(
          validParams[toolName],
          mockContext,
        )) as any;
        expect(result.success).toBe(false);
        expect(result.error).toContain("Database error");
        vi.clearAllMocks();
      }
    });

    describe("pg_geometry_column edge cases", () => {
      it("should error if without ifNotExists: true and column exists", async () => {
        mockAdapter.executeQuery.mockResolvedValueOnce({
          rows: [{ column_name: "c" }],
        }); // check Result
        const tool = findTool("pg_geometry_column");
        const result = (await tool!.handler(
          { table: "t", column: "c" },
          mockContext,
        )) as any;
        expect(result.success).toBe(false);
        expect(result.error).toContain("already exists in table");
      });

      it("should error if table does not exist", async () => {
        mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // check column Result
        mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // tableCheck Result
        const tool = findTool("pg_geometry_column");
        const result = (await tool!.handler(
          { table: "t", column: "c" },
          mockContext,
        )) as any;
        expect(result.success).toBe(false);
        expect(result.error).toContain("does not exist in schema");
      });
    });

    describe("pg_point_in_polygon edge cases", () => {
      it("should add warning if geometry type is not polygon", async () => {
        mockAdapter.executeQuery.mockResolvedValueOnce({
          rows: [{ geom_type: "POINT" }],
        }); // typeCheck
        mockAdapter.executeQuery.mockResolvedValueOnce({
          rows: [{ column_name: "id" }],
        }); // colQuery
        mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // actual query
        const tool = findTool("pg_point_in_polygon");
        const result = (await tool!.handler(
          { table: "t", column: "c", point: { lat: 0, lng: 0 } },
          mockContext,
        )) as any;
        expect(result.warning).toContain("geometries, not polygons");
      });
    });

    describe("pg_buffer edge cases", () => {
      it("should return truncated indicator if totalCount > limit", async () => {
        mockAdapter.executeQuery.mockResolvedValueOnce({
          rows: [{ column_name: "id" }],
        }); // colQuery
        mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // actual query
        mockAdapter.executeQuery.mockResolvedValueOnce({
          rows: [{ cnt: 100 }],
        }); // count query

        const tool = findTool("pg_buffer");
        const result = (await tool!.handler(
          { table: "t", column: "c", distance: 10, limit: 10 },
          mockContext,
        )) as any;
        expect(result.truncated).toBe(true);
        expect(result.totalCount).toBe(100);
      });
    });

    describe("pg_intersection edge cases", () => {
      it("should handle table with no non-geom columns correctly", async () => {
        mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // colQuery (no columns)
        mockAdapter.executeQuery.mockResolvedValueOnce({
          rows: [{ srid: 4326 }],
        }); // srid query
        mockAdapter.executeQuery.mockResolvedValueOnce({
          rows: [{ geometry_text: "POINT(0 0)" }],
        }); // actual query

        const tool = findTool("pg_intersection");
        const result = (await tool!.handler(
          { table: "t", column: "c", geometry: "POINT(0 0)" },
          mockContext,
        )) as any;
        expect(result.intersecting).toHaveLength(1);
      });
    });

    describe("pg_bounding_box edge cases", () => {
      it("should error if table has no cols (does not exist)", async () => {
        mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // colQuery empty
        const tool = findTool("pg_bounding_box");
        const result = (await tool!.handler(
          {
            table: "t",
            column: "c",
            minLng: 0,
            minLat: 0,
            maxLng: 1,
            maxLat: 1,
          },
          mockContext,
        )) as any;
        expect(result.success).toBe(false);
        expect(result.error).toContain("does not exist in schema");
      });
    });

    describe("pg_spatial_index edge cases", () => {
      it("should add note instead of Postgres error if index exists without ifNotExists: true", async () => {
        mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }); // Table exists
        mockAdapter.executeQuery.mockResolvedValueOnce({
          rows: [{ exists: true }],
        }); // check Result
        const tool = findTool("pg_spatial_index");
        const result = (await tool!.handler(
          { table: "t", column: "c" },
          mockContext,
        )) as any;
        expect(result.success).toBe(true);
        expect(result.note).toContain("Index already exists.");
      });

      it("should error if table does not exist", async () => {
        mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // tableCheck Result
        const tool = findTool("pg_spatial_index");
        const result = (await tool!.handler(
          { table: "t", column: "c" },
          mockContext,
        )) as any;
        expect(result.success).toBe(false);
        expect(result.error).toContain("does not exist in schema");
      });
    });
  });

  it("should export all 15 PostGIS tools", () => {
    expect(tools).toHaveLength(15);
    const toolNames = tools.map((t) => t.name);
    // Basic
    expect(toolNames).toContain("pg_postgis_create_extension");
    expect(toolNames).toContain("pg_geometry_column");
    expect(toolNames).toContain("pg_point_in_polygon");
    expect(toolNames).toContain("pg_distance");
    expect(toolNames).toContain("pg_buffer");
    expect(toolNames).toContain("pg_intersection");
    expect(toolNames).toContain("pg_bounding_box");
    expect(toolNames).toContain("pg_spatial_index");
    // Advanced
    expect(toolNames).toContain("pg_geocode");
    expect(toolNames).toContain("pg_geo_transform");
    expect(toolNames).toContain("pg_geo_index_optimize");
    expect(toolNames).toContain("pg_geo_cluster");
    // Standalone geometry tools
    expect(toolNames).toContain("pg_geometry_buffer");
    expect(toolNames).toContain("pg_geometry_intersection");
    expect(toolNames).toContain("pg_geometry_transform");
  });
});

// =============================================================================
// Standalone Geometry Tools - uncovered ZodError/error catch blocks
// =============================================================================

describe("PostGIS standalone tools uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let mockContext: ReturnType<typeof createMockRequestContext>;
  let tools: ReturnType<typeof getPostgisTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    mockContext = createMockRequestContext();
    tools = getPostgisTools(mockAdapter as unknown as PostgresAdapter);
  });

  const findTool = (name: string) => tools.find((t) => t.name === name);

  // standalone.ts L134-140: pg_geometry_buffer ZodError catch
  it("should return structured error for pg_geometry_buffer validation failure", async () => {
    const tool = findTool("pg_geometry_buffer");
    const result = (await tool!.handler(
      { geometry: "POINT(0 0)" }, // missing required 'distance'
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // standalone.ts L103-110: pg_geometry_buffer DB error catch (inner)
  it("should return structured error for pg_geometry_buffer DB failure", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("PostGIS extension not available"),
    );

    const tool = findTool("pg_geometry_buffer");
    const result = (await tool!.handler(
      { geometry: "POINT(0 0)", distance: 100 },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("PostGIS");
  });

  // standalone.ts L206-212: pg_geometry_intersection ZodError catch
  it("should return structured error for pg_geometry_intersection validation failure", async () => {
    const tool = findTool("pg_geometry_intersection");
    const result = (await tool!.handler(
      { geometry1: "POINT(0 0)" }, // missing geometry2
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // standalone.ts L191-198: pg_geometry_intersection DB error (inner)
  it("should return structured error for pg_geometry_intersection DB failure", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("PostGIS extension not available"),
    );

    const tool = findTool("pg_geometry_intersection");
    const result = (await tool!.handler(
      {
        geometry1: "POINT(0 0)",
        geometry2: "POINT(1 1)",
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("PostGIS");
  });

  // standalone.ts L269-275: pg_geometry_transform ZodError catch
  it("should return structured error for pg_geometry_transform validation failure", async () => {
    const tool = findTool("pg_geometry_transform");
    const result = (await tool!.handler(
      { geometry: "POINT(0 0)" }, // missing fromSrid, toSrid
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // standalone.ts L254-261: pg_geometry_transform DB error (inner)
  it("should return structured error for pg_geometry_transform DB failure", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(new Error("invalid SRID"));

    const tool = findTool("pg_geometry_transform");
    const result = (await tool!.handler(
      { geometry: "POINT(0 0)", fromSrid: 4326, toSrid: 9999 },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("invalid SRID");
  });

  // standalone.ts L118-130: pg_geometry_buffer simplification
  it("should include simplification info in pg_geometry_buffer response", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          buffer_geojson: '{"type":"Polygon"}',
          buffer_wkt: "POLYGON(...)",
          distance_meters: 100,
          srid: 4326,
        },
      ],
    });

    const tool = findTool("pg_geometry_buffer");
    const result = (await tool!.handler(
      { geometry: "POINT(0 0)", distance: 100, simplify: 50 },
      mockContext,
    )) as {
      simplified: boolean;
      simplifyTolerance: number;
    };

    expect(result.simplified).toBe(true);
    expect(result.simplifyTolerance).toBe(50);
  });

  // standalone.ts L123-129: simplification causing null geometry collapse
  it("should warn when simplification causes geometry collapse", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          buffer_geojson: null, // collapsed
          buffer_wkt: null,
          distance_meters: 10,
          srid: 4326,
        },
      ],
    });

    const tool = findTool("pg_geometry_buffer");
    const result = (await tool!.handler(
      { geometry: "POINT(0 0)", distance: 10, simplify: 10000 },
      mockContext,
    )) as {
      simplified: boolean;
      warning: string;
    };

    expect(result.simplified).toBe(true);
    expect(result.warning).toContain("collapsed to null");
  });
});
