/**
 * postgres-mcp - PostGIS Tools Unit Tests
 *
 * Tests for PostGIS spatial operations covering tool definitions,
 * schema validation, and handler execution.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPostgisTools } from "../index.js";
import type { PostgresAdapter } from "../../../PostgresAdapter.js";
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
          { buffer_geojson: '{"type":"Polygon"}', buffer_wkt: "POLYGON(...)" },
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
          { buffer_geojson: "{}", buffer_wkt: "", inputFormat: "GeoJSON" },
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
      // Call sequence: 1) SRID detect, 2) column query, 3) transform query, 4) count query
      mockAdapter.executeQuery
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
              transformed_wkt: "POINT(0 0)",
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
      // Call sequence: 1) SRID detect, 2) column query, 3) transform query, 4) count query
      mockAdapter.executeQuery
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
              transformed_wkt: "POINT(0 0)",
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
      mockAdapter.executeQuery.mockResolvedValueOnce({
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
              transformed_wkt: "POINT(0 0)",
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

  it("should propagate database errors from extension check", async () => {
    const dbError = new Error('extension "postgis" is not available');
    mockAdapter.executeQuery.mockRejectedValue(dbError);

    const tool = tools.find((t) => t.name === "pg_postgis_create_extension")!;

    await expect(tool.handler({}, mockContext)).rejects.toThrow(
      'extension "postgis" is not available',
    );
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
    "$name should throw structured error for nonexistent table",
    async ({ name, params }) => {
      const pgError = new Error(
        'relation "nonexistent_xyz" does not exist',
      ) as Error & { code: string };
      pgError.code = "42P01";
      mockAdapter.executeQuery.mockRejectedValue(pgError);

      const tool = tools.find((t) => t.name === name)!;
      await expect(tool.handler(params, mockContext)).rejects.toThrow(
        /not found/i,
      );
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
    "$name should throw structured error for invalid geometry",
    async ({ name, params }) => {
      const pgError = new Error("parse error - invalid geometry") as Error & {
        code: string;
      };
      pgError.code = "XX000";
      mockAdapter.executeQuery.mockRejectedValue(pgError);

      const tool = tools.find((t) => t.name === name)!;
      await expect(tool.handler(params, mockContext)).rejects.toThrow(
        /Invalid geometry input/i,
      );
    },
  );

  it("pg_bounding_box should throw when table has no columns (nonexistent table)", async () => {
    // Column lookup returns empty rows (table doesn't exist)
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    const tool = tools.find((t) => t.name === "pg_bounding_box")!;
    await expect(
      tool.handler(
        {
          table: "nonexistent_xyz",
          column: "geom",
          minLng: 0,
          minLat: 0,
          maxLng: 1,
          maxLat: 1,
        },
        mockContext,
      ),
    ).rejects.toThrow(/not found/i);
  });

  it("pg_geo_transform should throw structured error for nonexistent table", async () => {
    // SRID detection returns a result (simulating geometry_columns lookup success)
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ srid: 4326 }] })
      // Column lookup succeeds but main query fails with 42P01
      .mockResolvedValueOnce({ rows: [{ column_name: "id" }] })
      .mockRejectedValueOnce(
        Object.assign(new Error('relation "nonexistent_xyz" does not exist'), {
          code: "42P01",
        }),
      );
    const tool = tools.find((t) => t.name === "pg_geo_transform")!;
    await expect(
      tool.handler(
        { table: "nonexistent_xyz", column: "geom", toSrid: 3857 },
        mockContext,
      ),
    ).rejects.toThrow(/not found/i);
  });
});
