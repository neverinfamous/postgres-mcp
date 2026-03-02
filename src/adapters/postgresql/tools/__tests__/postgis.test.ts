/**
 * postgres-mcp - PostGIS Extension Tools Unit Tests
 *
 * Tests for geospatial operations (15 tools total).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PostgresAdapter } from "../../PostgresAdapter.js";
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
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

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
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

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
      expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(1);
    });

    it("should accept indexName as alias for name", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

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
