/**
 * postgres-mcp - PostGIS Tools Unit Tests
 *
 * Tests for PostGIS spatial operations covering tool definitions,
 * schema validation, and handler execution.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPostgisTools } from "../index.js";
import type { PostgresAdapter } from "../../../postgres-adapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../../__tests__/mocks/index.js";

describe("getPostgisTools", () => {
  let adapter: PostgresAdapter;
  let tools: ReturnType<typeof getPostgisTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockPostgresAdapter() as unknown as PostgresAdapter;
    tools = getPostgisTools(adapter);
  });

  it("should return 15 PostGIS tools", () => {
    expect(tools).toHaveLength(15);
  });

  it("should have all expected tool names", () => {
    const toolNames = tools.map((t) => t.name);
    // Basic tools
    expect(toolNames).toContain("pg_postgis_create_extension");
    expect(toolNames).toContain("pg_geometry_column");
    expect(toolNames).toContain("pg_point_in_polygon");
    expect(toolNames).toContain("pg_distance");
    expect(toolNames).toContain("pg_buffer");
    expect(toolNames).toContain("pg_intersection");
    expect(toolNames).toContain("pg_bounding_box");
    expect(toolNames).toContain("pg_spatial_index");
    // Advanced tools
    expect(toolNames).toContain("pg_geocode");
    expect(toolNames).toContain("pg_geo_transform");
    expect(toolNames).toContain("pg_geo_index_optimize");
    expect(toolNames).toContain("pg_geo_cluster");
    // Standalone geometry tools
    expect(toolNames).toContain("pg_geometry_buffer");
    expect(toolNames).toContain("pg_geometry_intersection");
    expect(toolNames).toContain("pg_geometry_transform");
  });

  it("should have handler function for all tools", () => {
    for (const tool of tools) {
      expect(typeof tool.handler).toBe("function");
    }
  });

  it("should have inputSchema for all tools", () => {
    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it("should have group set to postgis for all tools", () => {
    for (const tool of tools) {
      expect(tool.group).toBe("postgis");
    }
  });
});

describe("Tool Annotations", () => {
  let tools: ReturnType<typeof getPostgisTools>;

  beforeEach(() => {
    tools = getPostgisTools(
      createMockPostgresAdapter() as unknown as PostgresAdapter,
    );
  });

  it("pg_point_in_polygon should be read-only", () => {
    const tool = tools.find((t) => t.name === "pg_point_in_polygon")!;
    expect(tool.annotations?.readOnlyHint).toBe(true);
  });

  it("pg_distance should be read-only", () => {
    const tool = tools.find((t) => t.name === "pg_distance")!;
    expect(tool.annotations?.readOnlyHint).toBe(true);
  });

  it("pg_geometry_column should be destructive", () => {
    const tool = tools.find((t) => t.name === "pg_geometry_column")!;
    expect(tool.annotations?.readOnlyHint).toBe(false);
  });

  it("pg_spatial_index should be destructive", () => {
    const tool = tools.find((t) => t.name === "pg_spatial_index")!;
    expect(tool.annotations?.readOnlyHint).toBe(false);
  });

  it("pg_geometry_buffer should be read-only", () => {
    const tool = tools.find((t) => t.name === "pg_geometry_buffer")!;
    expect(tool.annotations?.readOnlyHint).toBe(true);
  });

  it("pg_geometry_intersection should be read-only", () => {
    const tool = tools.find((t) => t.name === "pg_geometry_intersection")!;
    expect(tool.annotations?.readOnlyHint).toBe(true);
  });

  it("pg_geometry_transform should be read-only", () => {
    const tool = tools.find((t) => t.name === "pg_geometry_transform")!;
    expect(tool.annotations?.readOnlyHint).toBe(true);
  });
});

describe("Handler Execution", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPostgisTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPostgisTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  describe("pg_postgis_create_extension", () => {
    it("should check/create PostGIS extension", async () => {
      mockAdapter.executeQuery.mockResolvedValue({ rows: [] });

      const tool = tools.find((t) => t.name === "pg_postgis_create_extension")!;
      const result = (await tool.handler({}, mockContext)) as Record<
        string,
        unknown
      >;

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("pg_geo_cluster", () => {
    it("should cluster geometries", async () => {
      mockAdapter.executeQuery.mockResolvedValue({
        rows: [{ cluster_id: 1, geom: "POINT(0 0)" }],
      });

      const tool = tools.find((t) => t.name === "pg_geo_cluster")!;
      const result = (await tool.handler(
        {
          table: "locations",
          column: "geom",
          numClusters: 5,
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("pg_geometry_buffer", () => {
    it("should create buffer from WKT geometry", async () => {
      mockAdapter.executeQuery.mockResolvedValue({
        rows: [
          { buffer_geojson: '{"type":"Polygon"}' },
        ],
      });

      const tool = tools.find((t) => t.name === "pg_geometry_buffer")!;
      const result = (await tool.handler(
        {
          geometry: "POINT(-74.006 40.7128)",
          distance: 1000,
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("should detect GeoJSON input format", async () => {
      mockAdapter.executeQuery.mockResolvedValue({
        rows: [
          { buffer_geojson: "{}", inputFormat: "GeoJSON" },
        ],
      });

      const tool = tools.find((t) => t.name === "pg_geometry_buffer")!;
      const result = (await tool.handler(
        {
          geometry: '{"type":"Point","coordinates":[-74.006,40.7128]}',
          distance: 500,
          srid: 4326,
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(result["inputFormat"]).toBe("GeoJSON");
    });
  });

  describe("pg_geometry_intersection", () => {
    it("should compute intersection of two geometries", async () => {
      mockAdapter.executeQuery.mockResolvedValue({
        rows: [{ intersects: true, intersection_geojson: "{}" }],
      });

      const tool = tools.find((t) => t.name === "pg_geometry_intersection")!;
      const result = (await tool.handler(
        {
          geometry1: "POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))",
          geometry2: "POLYGON((0.5 0.5, 2 0.5, 2 2, 0.5 2, 0.5 0.5))",
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("pg_geometry_transform", () => {
    it("should transform geometry between SRIDs", async () => {
      mockAdapter.executeQuery.mockResolvedValue({
        rows: [{ transformed_geojson: "{}", from_srid: 4326, to_srid: 3857 }],
      });

      const tool = tools.find((t) => t.name === "pg_geometry_transform")!;
      const result = (await tool.handler(
        {
          geometry: "POINT(-74.006 40.7128)",
          fromSrid: 4326,
          toSrid: 3857,
        },
        mockContext,
      )) as Record<string, unknown>;

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("pg_buffer truncation with explicit limit", () => {
    it("should return truncated + totalCount when explicit limit truncates results", async () => {
      // Call sequence: 1) column query, 2) buffer query, 3) count query
      mockAdapter.executeQuery
        .mockResolvedValueOnce({
          rows: [{ column_name: "id" }, { column_name: "name" }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              name: "A",
              geometry_text: "POINT(0 0)",
              buffer_geojson: "{}",
            },
            {
              id: 2,
              name: "B",
              geometry_text: "POINT(1 1)",
              buffer_geojson: "{}",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ cnt: 5 }],
        });

      const tool = tools.find((t) => t.name === "pg_buffer")!;
      const result = (await tool.handler(
        { table: "locations", column: "geom", distance: 1000, limit: 2 },
        mockContext,
      )) as Record<string, unknown>;

      expect(result["truncated"]).toBe(true);
      expect(result["totalCount"]).toBe(5);
      expect(result["limit"]).toBe(2);
    });

    it("should not return truncated when explicit limit covers all rows", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({
          rows: [{ column_name: "id" }],
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 1, geometry_text: "POINT(0 0)", buffer_geojson: "{}" },
            { id: 2, geometry_text: "POINT(1 1)", buffer_geojson: "{}" },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ cnt: 2 }],
        });

      const tool = tools.find((t) => t.name === "pg_buffer")!;
      const result = (await tool.handler(
        { table: "locations", column: "geom", distance: 1000, limit: 2 },
        mockContext,
      )) as Record<string, unknown>;

      expect(result["truncated"]).toBeUndefined();
    });
  });

  describe("pg_geo_transform truncation with explicit limit", () => {
    it("should return truncated + totalCount when explicit limit truncates results", async () => {
      // Call sequence: 1) table check, 2) SRID detect, 3) column query, 4) transform query, 5) count query
      mockAdapter.executeQuery
        .mockResolvedValueOnce({
          rows: [{ "?column?": 1 }],
        })
        .mockResolvedValueOnce({
          rows: [{ srid: 4326 }],
        })
        .mockResolvedValueOnce({
          rows: [{ column_name: "id" }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              transformed_geojson: "{}",
              output_srid: 3857,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ cnt: 10 }],
        });

      const tool = tools.find((t) => t.name === "pg_geo_transform")!;
      const result = (await tool.handler(
        { table: "locations", column: "geom", toSrid: 3857, limit: 1 },
        mockContext,
      )) as Record<string, unknown>;

      expect(result["truncated"]).toBe(true);
      expect(result["totalCount"]).toBe(10);
      expect(result["limit"]).toBe(1);
      expect(result["autoDetectedSrid"]).toBe(true);
    });
  });

  describe("pg_geo_transform SRID auto-detection", () => {
    it("should auto-detect fromSrid from column metadata", async () => {
      // Call sequence: 1) table check, 2) SRID detect, 3) column query, 4) transform query, 5) count query
      mockAdapter.executeQuery
        .mockResolvedValueOnce({
          rows: [{ "?column?": 1 }],
        })
        .mockResolvedValueOnce({
          rows: [{ srid: 4326 }],
        })
        .mockResolvedValueOnce({
          rows: [{ column_name: "id" }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              transformed_geojson: "{}",
              output_srid: 3857,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ cnt: 1 }],
        });

      const tool = tools.find((t) => t.name === "pg_geo_transform")!;
      const result = (await tool.handler(
        { table: "locations", column: "geom", toSrid: 3857 },
        mockContext,
      )) as Record<string, unknown>;

      expect(result["fromSrid"]).toBe(4326);
      expect(result["autoDetectedSrid"]).toBe(true);
      expect(result["toSrid"]).toBe(3857);
    });

    it("should return structured error when SRID cannot be detected", async () => {
      // Table exists but SRID lookup returns empty
      mockAdapter.executeQuery
        .mockResolvedValueOnce({
          rows: [{ "?column?": 1 }],
        })
        .mockResolvedValueOnce({
          rows: [],
        });

      const tool = tools.find((t) => t.name === "pg_geo_transform")!;
      const result = (await tool.handler(
        { table: "locations", column: "geom", toSrid: 3857 },
        mockContext,
      )) as Record<string, unknown>;

      expect(result["success"]).toBe(false);
      expect(result["error"]).toContain("Could not auto-detect SRID");
      expect(result["suggestion"]).toContain("fromSrid: 4326");
    });

    it("should use explicit fromSrid when provided", async () => {
      // Call sequence: 1) column query, 2) transform query, 3) count query
      mockAdapter.executeQuery
        .mockResolvedValueOnce({
          rows: [{ column_name: "id" }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              transformed_geojson: "{}",
              output_srid: 3857,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ cnt: 1 }],
        });

      const tool = tools.find((t) => t.name === "pg_geo_transform")!;
      const result = (await tool.handler(
        { table: "locations", column: "geom", fromSrid: 4326, toSrid: 3857 },
        mockContext,
      )) as Record<string, unknown>;

      expect(result["fromSrid"]).toBe(4326);
      expect(result["autoDetectedSrid"]).toBeUndefined();
    });
  });
});

describe("Error Handling", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPostgisTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPostgisTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return structured error for database errors from extension check", async () => {
    const dbError = new Error('extension "postgis" is not available');
    mockAdapter.executeQuery.mockRejectedValue(dbError);

    const tool = tools.find((t) => t.name === "pg_postgis_create_extension")!;

    // pg_postgis_create_extension now has structured error handling
    const result = await tool.handler({}, mockContext);
    expect(result).toMatchObject({
      success: false,
      error: 'extension "postgis" is not available',
      code: 'QUERY_ERROR',
      category: 'query'
    });
  });
});

// ============================================================
// Structured Error Handling (parsePostgresError)
// ============================================================

describe("Structured Error Handling (parsePostgresError)", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPostgisTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPostgisTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  const tableTools = [
    {
      name: "pg_point_in_polygon",
      params: {
        table: "nonexistent_xyz",
        column: "geom",
        point: { lat: 40, lng: -74 },
      },
    },
    {
      name: "pg_distance",
      params: {
        table: "nonexistent_xyz",
        column: "geom",
        point: { lat: 40, lng: -74 },
      },
    },
    {
      name: "pg_buffer",
      params: { table: "nonexistent_xyz", column: "geom", distance: 1000 },
    },
    {
      name: "pg_bounding_box",
      params: {
        table: "nonexistent_xyz",
        column: "geom",
        minLng: -120,
        minLat: 30,
        maxLng: 0,
        maxLat: 50,
      },
    },
    {
      name: "pg_intersection",
      params: {
        table: "nonexistent_xyz",
        column: "geom",
        geometry: "POINT(0 0)",
      },
    },
    {
      name: "pg_geo_cluster",
      params: { table: "nonexistent_xyz", column: "geom" },
    },
  ];

  it.each(tableTools)(
    "$name should return structured error for nonexistent table",
    async ({ name, params }) => {
      const pgError = new Error(
        'relation "nonexistent_xyz" does not exist',
      ) as Error & { code: string };
      pgError.code = "42P01";
      mockAdapter.executeQuery.mockRejectedValue(pgError);

      const tool = tools.find((t) => t.name === name)!;
      const result = (await tool.handler(params, mockContext)) as Record<
        string,
        unknown
      >;
      expect(result["success"]).toBe(false);
      expect(result["error"]).toMatch(/not found/i);
    },
  );

  const standaloneTools = [
    {
      name: "pg_geometry_buffer",
      params: { geometry: "INVALID_WKT", distance: 1000 },
    },
    {
      name: "pg_geometry_intersection",
      params: { geometry1: "INVALID_WKT", geometry2: "ALSO_INVALID" },
    },
    {
      name: "pg_geometry_transform",
      params: { geometry: "INVALID_WKT", fromSrid: 4326, toSrid: 3857 },
    },
  ];

  it.each(standaloneTools)(
    "$name should return structured error for invalid geometry",
    async ({ name, params }) => {
      const pgError = new Error("parse error - invalid geometry") as Error & {
        code: string;
      };
      pgError.code = "XX000";
      mockAdapter.executeQuery.mockRejectedValue(pgError);

      const tool = tools.find((t) => t.name === name)!;
      const result = (await tool.handler(params, mockContext)) as Record<
        string,
        unknown
      >;
      expect(result["success"]).toBe(false);
      expect(result["error"]).toMatch(/Invalid geometry input/i);
    },
  );

  it("pg_bounding_box should return structured error when table has no columns (nonexistent table)", async () => {
    // Column lookup returns empty rows (table doesn't exist)
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    const tool = tools.find((t) => t.name === "pg_bounding_box")!;
    const result = (await tool.handler(
      {
        table: "nonexistent_xyz",
        column: "geom",
        minLng: 0,
        minLat: 0,
        maxLng: 1,
        maxLat: 1,
      },
      mockContext,
    )) as Record<string, unknown>;
    expect(result["success"]).toBe(false);
    expect(result["error"]).toMatch(/not found/i);
  });

  it("pg_geo_transform should return structured error for nonexistent table", async () => {
    // Table existence check returns empty rows (table doesn't exist)
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    const tool = tools.find((t) => t.name === "pg_geo_transform")!;
    const result = (await tool.handler(
      { table: "nonexistent_xyz", column: "geom", toSrid: 3857 },
      mockContext,
    )) as Record<string, unknown>;
    expect(result["success"]).toBe(false);
    expect(result["error"]).toMatch(/not found/i);
  });
  it("pg_geocode should return structured error for out-of-bounds latitude", async () => {
    const tool = tools.find((t) => t.name === "pg_geocode")!;
    const result = (await tool.handler(
      { lat: 95, lng: -74.006 },
      mockContext,
    )) as Record<string, unknown>;
    expect(result["success"]).toBe(false);
    expect(result["error"]).toContain("lat must be between -90 and 90 degrees");
  });

  it("pg_geocode should return structured error for out-of-bounds longitude", async () => {
    const tool = tools.find((t) => t.name === "pg_geocode")!;
    const result = (await tool.handler(
      { lat: 40, lng: 200 },
      mockContext,
    )) as Record<string, unknown>;
    expect(result["success"]).toBe(false);
    expect(result["error"]).toContain(
      "lng must be between -180 and 180 degrees",
    );
  });

  it("pg_distance should return structured error for out-of-bounds latitude", async () => {
    const tool = tools.find((t) => t.name === "pg_distance")!;
    const result = (await tool.handler(
      { table: "locations", column: "geom", point: { lat: 95, lng: -74 } },
      mockContext,
    )) as Record<string, unknown>;
    expect(result["success"]).toBe(false);
    expect(result["error"]).toMatch(/must be between -90 and 90/);
  });

  it("pg_distance should return structured error for out-of-bounds longitude", async () => {
    const tool = tools.find((t) => t.name === "pg_distance")!;
    const result = (await tool.handler(
      { table: "locations", column: "geom", point: { lat: 40, lng: 200 } },
      mockContext,
    )) as Record<string, unknown>;
    expect(result["success"]).toBe(false);
    expect(result["error"]).toMatch(/must be between -180 and 180/);
  });

  it("pg_distance should return structured error for flat top-level out-of-bounds latitude", async () => {
    const tool = tools.find((t) => t.name === "pg_distance")!;
    const result = (await tool.handler(
      { table: "locations", column: "geom", lat: 95, lng: -74 },
      mockContext,
    )) as Record<string, unknown>;
    expect(result["success"]).toBe(false);
    expect(result["error"]).toMatch(/must be between -90 and 90/);
  });

  it("pg_distance should return structured error for flat top-level out-of-bounds longitude", async () => {
    const tool = tools.find((t) => t.name === "pg_distance")!;
    const result = (await tool.handler(
      { table: "locations", column: "geom", lat: 40, lng: 200 },
      mockContext,
    )) as Record<string, unknown>;
    expect(result["success"]).toBe(false);
    expect(result["error"]).toMatch(/must be between -180 and 180/);
  });
});

// ============================================================
// PostGIS standalone geometry edge cases
// ============================================================

describe("PostGIS Standalone Geometry Edge Cases", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPostgisTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPostgisTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("pg_geometry_buffer should include simplification info when simplify > 0", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          buffer_geojson: '{"type":"Polygon"}',
          distance_meters: 1000,
          srid: 4326,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_geometry_buffer")!;
    const result = (await tool.handler(
      {
        geometry: "POINT(-74.006 40.7128)",
        distance: 1000,
        simplify: 100,
      },
      mockContext,
    )) as Record<string, unknown>;

    expect(result["simplified"]).toBe(true);
    expect(result["simplifyTolerance"]).toBe(100);
  });

  it("pg_geometry_buffer should warn when simplification collapses geometry", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          buffer_geojson: null,
          distance_meters: 10,
          srid: 4326,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_geometry_buffer")!;
    const result = (await tool.handler(
      {
        geometry: "POINT(-74.006 40.7128)",
        distance: 10,
        simplify: 50000,
      },
      mockContext,
    )) as Record<string, unknown>;

    expect(result["warning"]).toContain("collapsed to null");
  });

  it("pg_geometry_intersection should include geometry format info", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          intersects: true,
          intersection_geojson: "{}",
          intersection_area_sqm: 0,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_geometry_intersection")!;
    const result = (await tool.handler(
      {
        geometry1: '{"type":"Point","coordinates":[-74,40]}',
        geometry2: "POLYGON((0 0,1 0,1 1,0 1,0 0))",
      },
      mockContext,
    )) as Record<string, unknown>;

    expect(result["geometry1Format"]).toBe("GeoJSON");
    expect(result["geometry2Format"]).toBe("WKT");
    expect(result["sridUsed"]).toBe(4326);
  });

  it("pg_geometry_transform should return inner DB-error as structured error", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("could not find projection for SRID 99999"),
    );

    const tool = tools.find((t) => t.name === "pg_geometry_transform")!;
    const result = (await tool.handler(
      {
        geometry: "POINT(-74.006 40.7128)",
        fromSrid: 4326,
        toSrid: 99999,
      },
      mockContext,
    )) as Record<string, unknown>;

    expect(result["success"]).toBe(false);
    expect(result["error"]).toBeDefined();
  });

  it("pg_geometry_buffer should return inner DB-error as structured error", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("ST_Buffer failed"),
    );

    const tool = tools.find((t) => t.name === "pg_geometry_buffer")!;
    const result = (await tool.handler(
      { geometry: "POINT(0 0)", distance: 100 },
      mockContext,
    )) as Record<string, unknown>;

    expect(result["success"]).toBe(false);
    expect(result["error"]).toBeDefined();
  });

  it("pg_geometry_intersection should return inner DB-error as structured error", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("ST_Intersection failed"),
    );

    const tool = tools.find((t) => t.name === "pg_geometry_intersection")!;
    const result = (await tool.handler(
      {
        geometry1: "POLYGON((0 0,1 0,1 1,0 1,0 0))",
        geometry2: "POLYGON((0 0,2 0,2 2,0 2,0 0))",
      },
      mockContext,
    )) as Record<string, unknown>;

    expect(result["success"]).toBe(false);
    expect(result["error"]).toBeDefined();
  });
});

// ============================================================
// PostGIS advanced tool edge cases
// ============================================================

describe("PostGIS Advanced Tool Edge Cases", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPostgisTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPostgisTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("pg_geocode should include SRID note for non-4326 SRID", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ geojson: '{"type":"Point"}', wkt: "POINT(-74 40)" }],
    });

    const tool = tools.find((t) => t.name === "pg_geocode")!;
    const result = (await tool.handler(
      { lat: 40.7128, lng: -74.006, srid: 3857 },
      mockContext,
    )) as Record<string, unknown>;

    expect(result["note"]).toContain("SRID 3857");
  });

  it("pg_geocode should return structured error for DB errors", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("connection refused"),
    );

    const tool = tools.find((t) => t.name === "pg_geocode")!;
    const result = (await tool.handler(
      { lat: 40, lng: -74 },
      mockContext,
    )) as Record<string, unknown>;

    expect(result["success"]).toBe(false);
    expect(result["error"]).toBeDefined();
  });

  it("pg_geocode should handle empty result row", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [],
    });

    const tool = tools.find((t) => t.name === "pg_geocode")!;
    const result = (await tool.handler(
      { lat: 40, lng: -74 },
      mockContext,
    )) as Record<string, unknown>;

    // Should return success: true for undefined row
    expect(result).toEqual({ success: true });
  });

  it("pg_geo_index_optimize should warn when table filter matches nothing", async () => {
    // Both queries return empty rows
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_geo_index_optimize")!;
    const result = (await tool.handler(
      { table: "nonexistent_table" },
      mockContext,
    )) as Record<string, unknown>;

    expect(result["success"]).toBe(false);
    expect(result["error"]).toContain("not found");
  });

  it("pg_geo_index_optimize should recommend GiST for large tables without spatial indexes", async () => {
    // Index query returns no indexes
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Table stats shows large table without spatial index
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          table_name: "locations",
          row_count: 50000,
          table_size: "100 MB",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_geo_index_optimize")!;
    const result = (await tool.handler({}, mockContext)) as Record<
      string,
      unknown
    >;

    expect((result["recommendations"] as string[]).join(" ")).toContain("GiST");
  });

  it("pg_geo_index_optimize should flag unused large indexes", async () => {
    // Index query returns one unused large index
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          table_name: "locations",
          index_name: "idx_big_unused",
          column_name: "geom",
          index_size: "5 MB",
          index_size_bytes: 5 * 1024 * 1024,
          index_scans: 0,
          tuples_read: 0,
          tuples_fetched: 0,
        },
      ],
    });
    // No table stats
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_geo_index_optimize")!;
    const result = (await tool.handler({}, mockContext)) as Record<
      string,
      unknown
    >;

    expect((result["recommendations"] as string[]).join(" ")).toContain(
      "unused",
    );
  });

  it("pg_geo_cluster with kmeans should clamp K when K > N", async () => {
    // Count query returns 3 rows
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ cnt: 3 }] })
      // Cluster query
      .mockResolvedValueOnce({
        rows: [
          { cluster_id: 0, point_count: 2, centroid: "{}", hull: "{}" },
          { cluster_id: 1, point_count: 1, centroid: "{}", hull: "{}" },
        ],
      })
      // Summary query
      .mockResolvedValueOnce({
        rows: [{ num_clusters: 2, noise_points: 0, total_points: 3 }],
      });

    const tool = tools.find((t) => t.name === "pg_geo_cluster")!;
    const result = (await tool.handler(
      {
        table: "locations",
        column: "geom",
        method: "kmeans",
        numClusters: 100,
      },
      mockContext,
    )) as Record<string, unknown>;

    expect(result["warning"]).toContain("3 rows available");
    expect(result["requestedClusters"]).toBe(100);
    expect(result["actualClusters"]).toBe(3);
  });

  it("pg_geo_cluster with kmeans should error for zero numClusters", async () => {
    const tool = tools.find((t) => t.name === "pg_geo_cluster")!;
    const result = (await tool.handler(
      {
        table: "locations",
        column: "geom",
        method: "kmeans",
        numClusters: 0,
      },
      mockContext,
    )) as Record<string, unknown>;

    expect(result["success"]).toBe(false);
    expect(result["error"]).toMatch(/must be greater than 0/i);
  });

  it("pg_geo_cluster with kmeans should error for empty table", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ cnt: 0 }],
    });

    const tool = tools.find((t) => t.name === "pg_geo_cluster")!;
    const result = (await tool.handler(
      {
        table: "locations",
        column: "geom",
        method: "kmeans",
        numClusters: 5,
      },
      mockContext,
    )) as Record<string, unknown>;

    expect(result["success"]).toBe(false);
    expect(result["error"]).toMatch(/No rows found/i);
  });

  it("pg_geo_cluster with dbscan should return noise hints when noise > 50%", async () => {
    mockAdapter.executeQuery
      // Cluster query
      .mockResolvedValueOnce({
        rows: [{ cluster_id: 0, point_count: 2, centroid: "{}", hull: "{}" }],
      })
      // Summary query shows 80% noise
      .mockResolvedValueOnce({
        rows: [{ num_clusters: 1, noise_points: 8, total_points: 10 }],
      });

    const tool = tools.find((t) => t.name === "pg_geo_cluster")!;
    const result = (await tool.handler(
      {
        table: "locations",
        column: "geom",
        method: "dbscan",
        eps: 10,
        minPoints: 5,
      },
      mockContext,
    )) as Record<string, unknown>;

    expect((result["hints"] as string[]).join(" ")).toContain("noise");
  });

  it("pg_geo_cluster with dbscan should hint when all points form single cluster", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [{ cluster_id: 0, point_count: 100, centroid: "{}", hull: "{}" }],
      })
      .mockResolvedValueOnce({
        rows: [{ num_clusters: 1, noise_points: 0, total_points: 100 }],
      });

    const tool = tools.find((t) => t.name === "pg_geo_cluster")!;
    const result = (await tool.handler(
      {
        table: "locations",
        column: "geom",
        method: "dbscan",
      },
      mockContext,
    )) as Record<string, unknown>;

    expect((result["hints"] as string[]).join(" ")).toContain("single cluster");
  });

  it("pg_geo_cluster with dbscan should hint when no clusters formed", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ num_clusters: 0, noise_points: 5, total_points: 5 }],
      });

    const tool = tools.find((t) => t.name === "pg_geo_cluster")!;
    const result = (await tool.handler(
      {
        table: "locations",
        column: "geom",
        method: "dbscan",
      },
      mockContext,
    )) as Record<string, unknown>;

    expect((result["hints"] as string[]).join(" ")).toContain("No clusters");
  });

  it("pg_geo_cluster should return structured error for DB errors", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("connection refused"),
    );

    const tool = tools.find((t) => t.name === "pg_geo_cluster")!;
    const result = (await tool.handler(
      {
        table: "locations",
        column: "geom",
      },
      mockContext,
    )) as Record<string, unknown>;

    expect(result["success"]).toBe(false);
    expect(result["error"]).toBeDefined();
  });

  it("pg_geo_transform should return structured error for DB errors", async () => {
    const pgError = new Error("connection refused") as Error & {
      code: string;
    };
    pgError.code = "08000";
    mockAdapter.executeQuery.mockRejectedValue(pgError);

    const tool = tools.find((t) => t.name === "pg_geo_transform")!;
    const result = (await tool.handler(
      { table: "locations", column: "geom", fromSrid: 4326, toSrid: 3857 },
      mockContext,
    )) as Record<string, unknown>;

    expect(result["success"]).toBe(false);
    expect(result["error"]).toBeDefined();
  });
});

// ============================================================
// PostGIS basic tool DB-error paths
// ============================================================

describe("PostGIS Basic Tool DB-Error Paths", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getPostgisTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getPostgisTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("pg_geometry_column should return structured error for DB errors", async () => {
    const pgError = new Error(
      'relation "nonexistent" does not exist',
    ) as Error & { code: string };
    pgError.code = "42P01";
    mockAdapter.executeQuery.mockRejectedValue(pgError);

    const tool = tools.find((t) => t.name === "pg_geometry_column")!;
    const result = (await tool.handler(
      {
        table: "nonexistent",
        column: "geom",
        type: "POINT",
        srid: 4326,
      },
      mockContext,
    )) as Record<string, unknown>;

    expect(result["success"]).toBe(false);
    expect(result["error"]).toBeDefined();
  });

  it("pg_spatial_index should return structured error for DB errors", async () => {
    const pgError = new Error(
      'relation "nonexistent" does not exist',
    ) as Error & { code: string };
    pgError.code = "42P01";
    mockAdapter.executeQuery.mockRejectedValue(pgError);

    const tool = tools.find((t) => t.name === "pg_spatial_index")!;
    const result = (await tool.handler(
      { table: "nonexistent", column: "geom" },
      mockContext,
    )) as Record<string, unknown>;

    expect(result["success"]).toBe(false);
    expect(result["error"]).toBeDefined();
  });

  it("pg_point_in_polygon should handle empty result rows", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [],
    });

    const tool = tools.find((t) => t.name === "pg_point_in_polygon")!;
    const result = (await tool.handler(
      {
        table: "zones",
        column: "geom",
        point: { lat: 40, lng: -74 },
      },
      mockContext,
    )) as Record<string, unknown>;

    expect(result).toBeDefined();
  });
});
