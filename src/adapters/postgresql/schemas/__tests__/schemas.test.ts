/**
 * Unit tests for PostgreSQL Validation Schemas
 *
 * Tests for Zod schemas that validate tool input parameters.
 * Focus on edge cases and validation paths for coverage improvement.
 */

import { describe, it, expect } from "vitest";

// Vector schemas
import {
  FiniteNumberArray,
  VectorSearchSchema,
  VectorCreateIndexSchema,
} from "../vector.js";

// PostGIS schemas
import {
  preprocessPostgisParams,
  preprocessPoint,
  convertToMeters,
  GeometryColumnSchema,
  GeometryDistanceSchema,
  BufferSchema,
  GeocodeSchema,
  GeoTransformSchema,
} from "../postgis/index.js";

// Schema management schemas
import {
  CreateSequenceSchema,
  CreateViewSchema,
  DropSequenceSchema,
  DropViewSchema,
  ListFunctionsSchema,
} from "../schema-mgmt.js";

// =============================================================================
// Vector Schema Tests
// =============================================================================
describe("FiniteNumberArray", () => {
  it("should accept valid finite number arrays", () => {
    const result = FiniteNumberArray.safeParse([1, 2, 3, 4.5, -0.5]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([1, 2, 3, 4.5, -0.5]);
    }
  });

  it("should accept empty arrays", () => {
    const result = FiniteNumberArray.safeParse([]);
    expect(result.success).toBe(true);
  });

  // Note: Zod v4's z.number() already rejects Infinity/NaN at parse level
  // The superRefine provides a clearer error for v3 compatibility, but in v4 these fail earlier
  it("should reject arrays containing Infinity", () => {
    const result = FiniteNumberArray.safeParse([1, Infinity, 3]);
    expect(result.success).toBe(false);
  });

  it("should reject arrays containing -Infinity", () => {
    const result = FiniteNumberArray.safeParse([1, -Infinity, 3]);
    expect(result.success).toBe(false);
  });

  it("should reject arrays containing NaN", () => {
    const result = FiniteNumberArray.safeParse([1, NaN, 3]);
    expect(result.success).toBe(false);
  });

  it("should reject arrays with multiple invalid values", () => {
    const result = FiniteNumberArray.safeParse([1, Infinity, 3, NaN, 5]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it("should accept large finite numbers", () => {
    const result = FiniteNumberArray.safeParse([
      Number.MAX_VALUE,
      Number.MIN_VALUE,
    ]);
    expect(result.success).toBe(true);
  });
});

describe("VectorSearchSchema", () => {
  it("should resolve table and column from aliases", () => {
    const result = VectorSearchSchema.parse({
      tableName: "embeddings",
      col: "vector",
      vector: [1, 2, 3],
    });
    expect(result.table).toBe("embeddings");
    expect(result.column).toBe("vector");
  });

  it("should parse schema.table format", () => {
    const result = VectorSearchSchema.parse({
      table: "myschema.embeddings",
      column: "vector",
      vector: [1, 2, 3],
    });
    expect(result.table).toBe("embeddings");
    expect(result.schema).toBe("myschema");
  });

  it("should prefer embedded schema over explicit schema param", () => {
    const result = VectorSearchSchema.parse({
      table: "embedded.embeddings",
      column: "vector",
      vector: [1, 2, 3],
      schema: "explicit",
    });
    // Embedded schema takes priority
    expect(result.schema).toBe("embedded");
    expect(result.table).toBe("embeddings");
  });

  it("should handle table without schema", () => {
    const result = VectorSearchSchema.parse({
      table: "embeddings",
      column: "vector",
      vector: [0.1, 0.2],
    });
    expect(result.table).toBe("embeddings");
    expect(result.schema).toBeUndefined();
  });

  it("should resolve where from filter alias", () => {
    const result = VectorSearchSchema.parse({
      table: "embeddings",
      column: "vector",
      vector: [1, 2],
      filter: "active = true",
    });
    expect(result.where).toBe("active = true");
  });

  it("should accept all optional parameters", () => {
    const result = VectorSearchSchema.parse({
      table: "embeddings",
      column: "vector",
      vector: [1, 2, 3],
      metric: "cosine",
      limit: 10,
      select: ["id", "name"],
      where: "category = 'test'",
      excludeNull: true,
    });
    expect(result.metric).toBe("cosine");
    expect(result.limit).toBe(10);
    expect(result.select).toEqual(["id", "name"]);
    expect(result.excludeNull).toBe(true);
  });
});

describe("VectorCreateIndexSchema", () => {
  it("should resolve type from method alias", () => {
    const result = VectorCreateIndexSchema.parse({
      table: "embeddings",
      column: "vector",
      method: "hnsw",
    });
    expect(result.type).toBe("hnsw");
  });

  it("should throw when type is missing", () => {
    expect(() =>
      VectorCreateIndexSchema.parse({
        table: "embeddings",
        column: "vector",
      }),
    ).toThrow("type (or method alias) is required");
  });

  it("should accept all HNSW parameters", () => {
    const result = VectorCreateIndexSchema.parse({
      table: "embeddings",
      column: "vector",
      type: "hnsw",
      m: 16,
      efConstruction: 64,
      ifNotExists: true,
    });
    expect(result.m).toBe(16);
    expect(result.efConstruction).toBe(64);
    expect(result.ifNotExists).toBe(true);
  });

  it("should accept IVFFlat parameters", () => {
    const result = VectorCreateIndexSchema.parse({
      table: "embeddings",
      column: "vector",
      type: "ivfflat",
      lists: 100,
      metric: "cosine",
    });
    expect(result.type).toBe("ivfflat");
    expect(result.lists).toBe(100);
    expect(result.metric).toBe("cosine");
  });

  it("should default metric to l2", () => {
    const result = VectorCreateIndexSchema.parse({
      table: "embeddings",
      column: "vector",
      type: "ivfflat",
    });
    expect(result.metric).toBe("l2");
  });
});

// =============================================================================
// PostGIS Schema Tests
// =============================================================================
describe("preprocessPostgisParams", () => {
  it("should pass through non-objects", () => {
    expect(preprocessPostgisParams(null)).toBe(null);
    expect(preprocessPostgisParams("string")).toBe("string");
    expect(preprocessPostgisParams(42)).toBe(42);
  });

  it("should resolve tableName to table", () => {
    const result = preprocessPostgisParams({ tableName: "locations" });
    expect(result).toEqual({ tableName: "locations", table: "locations" });
  });

  it("should not overwrite existing table", () => {
    const result = preprocessPostgisParams({
      table: "primary",
      tableName: "alias",
    });
    expect((result as Record<string, unknown>).table).toBe("primary");
  });

  it("should parse schema.table format", () => {
    const result = preprocessPostgisParams({ table: "myschema.locations" });
    expect(result).toEqual({
      table: "locations",
      schema: "myschema",
    });
  });

  it("should not parse schema.table if schema already provided", () => {
    const result = preprocessPostgisParams({
      table: "other.locations",
      schema: "explicit",
    });
    expect((result as Record<string, unknown>).table).toBe("other.locations");
    expect((result as Record<string, unknown>).schema).toBe("explicit");
  });
});

describe("preprocessPoint", () => {
  it("should resolve lat/lng", () => {
    expect(preprocessPoint({ lat: 40.7, lng: -74.0 })).toEqual({
      lat: 40.7,
      lng: -74.0,
    });
  });

  it("should resolve latitude/longitude aliases", () => {
    expect(preprocessPoint({ latitude: 40.7, longitude: -74.0 })).toEqual({
      lat: 40.7,
      lng: -74.0,
    });
  });

  it("should resolve x/y aliases", () => {
    expect(preprocessPoint({ x: -74.0, y: 40.7 })).toEqual({
      lat: 40.7,
      lng: -74.0,
    });
  });

  it("should resolve lon alias", () => {
    expect(preprocessPoint({ lat: 40.7, lon: -74.0 })).toEqual({
      lat: 40.7,
      lng: -74.0,
    });
  });

  it("should return undefined for non-objects", () => {
    expect(preprocessPoint(null)).toBeUndefined();
    expect(preprocessPoint("string")).toBeUndefined();
  });

  it("should return undefined if lat or lng missing", () => {
    expect(preprocessPoint({ lat: 40.7 })).toBeUndefined();
    expect(preprocessPoint({ lng: -74.0 })).toBeUndefined();
  });

  it("should throw for invalid latitude", () => {
    expect(() => preprocessPoint({ lat: 91, lng: 0 })).toThrow(
      "Invalid latitude 91",
    );
    expect(() => preprocessPoint({ lat: -91, lng: 0 })).toThrow(
      "Invalid latitude -91",
    );
  });

  it("should throw for invalid longitude", () => {
    expect(() => preprocessPoint({ lat: 0, lng: 181 })).toThrow(
      "Invalid longitude 181",
    );
    expect(() => preprocessPoint({ lat: 0, lng: -181 })).toThrow(
      "Invalid longitude -181",
    );
  });

  it("should skip validation when validateBounds is false", () => {
    expect(preprocessPoint({ lat: 100, lng: 200 }, false)).toEqual({
      lat: 100,
      lng: 200,
    });
  });
});

describe("convertToMeters", () => {
  it("should return meters unchanged", () => {
    expect(convertToMeters(1000)).toBe(1000);
    expect(convertToMeters(1000, "meters")).toBe(1000);
    expect(convertToMeters(1000, "m")).toBe(1000);
  });

  it("should convert kilometers to meters", () => {
    expect(convertToMeters(1, "kilometers")).toBe(1000);
    expect(convertToMeters(1, "km")).toBe(1000);
  });

  it("should convert miles to meters", () => {
    expect(convertToMeters(1, "miles")).toBeCloseTo(1609.344);
    expect(convertToMeters(1, "mi")).toBeCloseTo(1609.344);
  });

  it("should default to meters for unknown units", () => {
    expect(convertToMeters(500, "unknown")).toBe(500);
  });

  it("should pass through negative values", () => {
    expect(convertToMeters(-1, "km")).toBe(-1);
  });
});

describe("GeometryColumnSchema", () => {
  it("should resolve column aliases", () => {
    const result = GeometryColumnSchema.parse({
      table: "locations",
      geom: "geometry",
    });
    expect(result.column).toBe("geometry");
  });

  it("should resolve geometryColumn alias", () => {
    const result = GeometryColumnSchema.parse({
      table: "locations",
      geometryColumn: "geom_col",
    });
    expect(result.column).toBe("geom_col");
  });

  it("should fail when table is missing", () => {
    expect(() => GeometryColumnSchema.parse({ column: "geom" })).toThrow(
      "table (or tableName alias) is required",
    );
  });

  it("should fail when column is missing", () => {
    expect(() => GeometryColumnSchema.parse({ table: "locations" })).toThrow(
      "column (or geom/geometryColumn alias) is required",
    );
  });
});

describe("GeometryDistanceSchema", () => {
  it("should convert distance units", () => {
    const result = GeometryDistanceSchema.parse({
      table: "locations",
      column: "geom",
      point: { lat: 40, lng: -74 },
      maxDistance: 1,
      unit: "kilometers",
    });
    expect(result.maxDistance).toBe(1000);
  });

  it("should resolve radius alias for maxDistance", () => {
    const result = GeometryDistanceSchema.parse({
      table: "locations",
      column: "geom",
      point: { lat: 40, lng: -74 },
      radius: 500,
    });
    expect(result.maxDistance).toBe(500);
  });

  it("should reject negative distance", () => {
    expect(() =>
      GeometryDistanceSchema.parse({
        table: "locations",
        column: "geom",
        point: { lat: 40, lng: -74 },
        maxDistance: -100,
      }),
    ).toThrow("distance must be a non-negative number");
  });
});

describe("BufferSchema", () => {
  it("should require positive distance", () => {
    expect(() =>
      BufferSchema.parse({
        table: "areas",
        column: "geom",
        distance: 0,
      }),
    ).toThrow(
      "distance (or radius/meters alias) is required and must be positive",
    );
  });

  it("should resolve meters alias", () => {
    const result = BufferSchema.parse({
      table: "areas",
      column: "geom",
      meters: 500,
    });
    expect(result.distance).toBe(500);
  });

  it("should reject negative simplify", () => {
    expect(() =>
      BufferSchema.parse({
        table: "areas",
        column: "geom",
        distance: 100,
        simplify: -5,
      }),
    ).toThrow("simplify must be a non-negative number");
  });
});

describe("GeocodeSchema", () => {
  it("should resolve latitude/longitude aliases", () => {
    const result = GeocodeSchema.parse({
      latitude: 40.7,
      longitude: -74.0,
    });
    expect(result.lat).toBe(40.7);
    expect(result.lng).toBe(-74.0);
  });

  it("should resolve lon alias", () => {
    const result = GeocodeSchema.parse({
      lat: 40.7,
      lon: -74.0,
    });
    expect(result.lng).toBe(-74.0);
  });

  it("should require lat", () => {
    expect(() => GeocodeSchema.parse({ lng: -74 })).toThrow(
      "lat (or latitude alias) is required",
    );
  });

  it("should require lng", () => {
    expect(() => GeocodeSchema.parse({ lat: 40.7 })).toThrow(
      "lng (or lon/longitude alias) is required",
    );
  });

  it("should validate lat bounds", () => {
    expect(() => GeocodeSchema.parse({ lat: 95, lng: 0 })).toThrow(
      "lat must be between -90 and 90",
    );
  });

  it("should validate lng bounds", () => {
    expect(() => GeocodeSchema.parse({ lat: 0, lng: 200 })).toThrow(
      "lng must be between -180 and 180",
    );
  });
});

describe("GeoTransformSchema", () => {
  it("should resolve SRID aliases", () => {
    const result = GeoTransformSchema.parse({
      table: "locations",
      column: "geom",
      sourceSrid: 4326,
      targetSrid: 3857,
    });
    expect(result.fromSrid).toBe(4326);
    expect(result.toSrid).toBe(3857);
  });

  it("should default fromSrid to 0 for auto-detection when not provided", () => {
    const result = GeoTransformSchema.parse({
      table: "locations",
      column: "geom",
      toSrid: 3857,
    });
    expect(result.fromSrid).toBe(0);
  });

  it("should require toSrid", () => {
    expect(() =>
      GeoTransformSchema.parse({
        table: "locations",
        column: "geom",
        fromSrid: 4326,
      }),
    ).toThrow("toSrid (or targetSrid alias) is required");
  });
});

// =============================================================================
// Schema Management Tests
// =============================================================================
describe("CreateSequenceSchema", () => {
  it("should resolve sequenceName alias", () => {
    const result = CreateSequenceSchema.parse({
      sequenceName: "my_seq",
    });
    expect(result.name).toBe("my_seq");
  });

  it("should parse schema.name format", () => {
    const result = CreateSequenceSchema.parse({
      name: "myschema.my_seq",
    });
    expect(result.name).toBe("my_seq");
    expect(result.schema).toBe("myschema");
  });

  it("should require name", () => {
    expect(() => CreateSequenceSchema.parse({})).toThrow(
      "name (or sequenceName alias) is required",
    );
  });

  it("should accept all sequence options", () => {
    const result = CreateSequenceSchema.parse({
      name: "my_seq",
      start: 100,
      increment: 10,
      minValue: 1,
      maxValue: 10000,
      cache: 5,
      cycle: true,
      ownedBy: "users.id",
      ifNotExists: true,
    });
    expect(result.start).toBe(100);
    expect(result.increment).toBe(10);
    expect(result.cycle).toBe(true);
    expect(result.ifNotExists).toBe(true);
  });
});

describe("CreateViewSchema", () => {
  it("should resolve viewName alias", () => {
    const result = CreateViewSchema.parse({
      viewName: "active_users",
      query: "SELECT * FROM users WHERE active",
    });
    expect(result.name).toBe("active_users");
  });

  it("should resolve sql alias for query", () => {
    const result = CreateViewSchema.parse({
      name: "my_view",
      sql: "SELECT 1",
    });
    expect(result.query).toBe("SELECT 1");
  });

  it("should resolve definition alias for query", () => {
    const result = CreateViewSchema.parse({
      name: "my_view",
      definition: "SELECT 2",
    });
    expect(result.query).toBe("SELECT 2");
  });

  it("should parse schema.name format", () => {
    const result = CreateViewSchema.parse({
      name: "analytics.daily_stats",
      query: "SELECT * FROM raw_data",
    });
    expect(result.name).toBe("daily_stats");
    expect(result.schema).toBe("analytics");
  });

  it("should require name", () => {
    expect(() => CreateViewSchema.parse({ query: "SELECT 1" })).toThrow(
      "name (or viewName alias) is required",
    );
  });

  it("should require query", () => {
    expect(() => CreateViewSchema.parse({ name: "my_view" })).toThrow(
      "query (or sql/definition alias) is required",
    );
  });
});

describe("DropSequenceSchema", () => {
  it("should parse schema.name format", () => {
    const result = DropSequenceSchema.parse({
      name: "myschema.my_seq",
    });
    expect((result as { name: string }).name).toBe("my_seq");
    expect((result as { schema: string }).schema).toBe("myschema");
  });

  it("should accept drop options", () => {
    const result = DropSequenceSchema.parse({
      name: "my_seq",
      ifExists: true,
      cascade: true,
    });
    expect((result as { ifExists: boolean }).ifExists).toBe(true);
    expect((result as { cascade: boolean }).cascade).toBe(true);
  });
});

describe("DropViewSchema", () => {
  it("should parse schema.name format", () => {
    const result = DropViewSchema.parse({
      name: "analytics.old_view",
    });
    expect((result as { name: string }).name).toBe("old_view");
    expect((result as { schema: string }).schema).toBe("analytics");
  });

  it("should accept materialized option", () => {
    const result = DropViewSchema.parse({
      name: "mat_view",
      materialized: true,
    });
    expect((result as { materialized: boolean }).materialized).toBe(true);
  });
});

describe("ListFunctionsSchema", () => {
  it("should accept empty input", () => {
    const result = ListFunctionsSchema.parse({});
    expect(result).toEqual({});
  });

  it("should handle null input", () => {
    const result = ListFunctionsSchema.parse(null);
    expect(result).toEqual({});
  });

  it("should accept all filter options", () => {
    const result = ListFunctionsSchema.parse({
      schema: "public",
      exclude: ["postgis", "ltree"],
      language: "plpgsql",
      limit: 100,
    });
    expect(result.schema).toBe("public");
    expect(result.exclude).toEqual(["postgis", "ltree"]);
    expect(result.language).toBe("plpgsql");
    expect(result.limit).toBe(100);
  });
});

// =============================================================================
// Stats Schema Tests
// =============================================================================

import {
  StatsPercentilesSchema,
  StatsCorrelationSchema,
  StatsRegressionSchema,
  StatsHypothesisSchema,
  StatsTimeSeriesSchema,
} from "../stats/index.js";

describe("StatsPercentilesSchema", () => {
  it("should normalize percentiles from 0-100 to 0-1 format", () => {
    const result = StatsPercentilesSchema.parse({
      table: "orders",
      column: "amount",
      percentiles: [25, 50, 75],
    });
    expect(result.percentiles).toEqual([0.25, 0.5, 0.75]);
  });

  it("should use default percentiles for empty array", () => {
    const result = StatsPercentilesSchema.parse({
      table: "orders",
      column: "amount",
      percentiles: [],
    });
    expect(result.percentiles).toEqual([0.25, 0.5, 0.75]);
  });

  it("should resolve tableName alias to table", () => {
    const result = StatsPercentilesSchema.parse({
      tableName: "orders",
      column: "amount",
    });
    expect(result.table).toBe("orders");
  });

  it("should resolve col alias to column", () => {
    const result = StatsPercentilesSchema.parse({
      table: "orders",
      col: "price",
    });
    expect(result.column).toBe("price");
  });

  it("should parse schema.table format", () => {
    const result = StatsPercentilesSchema.parse({
      table: "analytics.orders",
      column: "amount",
    });
    expect(result.table).toBe("orders");
    expect(result.schema).toBe("analytics");
  });
});

describe("StatsCorrelationSchema", () => {
  it("should resolve x and y aliases to column1 and column2", () => {
    const result = StatsCorrelationSchema.parse({
      table: "sales",
      x: "price",
      y: "quantity",
    });
    expect(result.column1).toBe("price");
    expect(result.column2).toBe("quantity");
  });

  it("should resolve col1 and col2 aliases", () => {
    const result = StatsCorrelationSchema.parse({
      table: "sales",
      col1: "revenue",
      col2: "cost",
    });
    expect(result.column1).toBe("revenue");
    expect(result.column2).toBe("cost");
  });
});

describe("StatsRegressionSchema", () => {
  it("should resolve x and y aliases to xColumn and yColumn", () => {
    const result = StatsRegressionSchema.parse({
      table: "metrics",
      x: "time",
      y: "value",
    });
    expect(result.xColumn).toBe("time");
    expect(result.yColumn).toBe("value");
  });

  it("should resolve column1 and column2 aliases for consistency with correlation", () => {
    const result = StatsRegressionSchema.parse({
      table: "metrics",
      column1: "advertising",
      column2: "revenue",
    });
    expect(result.xColumn).toBe("advertising");
    expect(result.yColumn).toBe("revenue");
  });
});

describe("StatsHypothesisSchema", () => {
  it("should normalize t-test variants to t_test", () => {
    const result1 = StatsHypothesisSchema.parse({
      table: "scores",
      column: "value",
      testType: "ttest",
    });
    expect(result1.testType).toBe("t_test");

    const result2 = StatsHypothesisSchema.parse({
      table: "scores",
      column: "value",
      testType: "t-test",
    });
    expect(result2.testType).toBe("t_test");
  });

  it("should normalize z-test variants to z_test", () => {
    const result = StatsHypothesisSchema.parse({
      table: "scores",
      column: "value",
      testType: "ztest",
      populationStdDev: 10,
    });
    expect(result.testType).toBe("z_test");
  });

  it("should default to z_test when populationStdDev is provided", () => {
    const result = StatsHypothesisSchema.parse({
      table: "scores",
      column: "value",
      populationStdDev: 15,
    });
    expect(result.testType).toBe("z_test");
  });

  it("should default to t_test when no testType provided", () => {
    const result = StatsHypothesisSchema.parse({
      table: "scores",
      column: "value",
    });
    expect(result.testType).toBe("t_test");
  });
});

describe("StatsTimeSeriesSchema", () => {
  it("should normalize interval shorthands (daily → day)", () => {
    const result = StatsTimeSeriesSchema.parse({
      table: "metrics",
      valueColumn: "value",
      timeColumn: "ts",
      interval: "daily",
    });
    expect(result.interval).toBe("day");
  });

  it("should resolve value and time aliases", () => {
    const result = StatsTimeSeriesSchema.parse({
      table: "metrics",
      value: "amount",
      time: "created_at",
    });
    expect(result.valueColumn).toBe("amount");
    expect(result.timeColumn).toBe("created_at");
  });

  it("should resolve bucket alias to interval", () => {
    const result = StatsTimeSeriesSchema.parse({
      table: "metrics",
      valueColumn: "value",
      timeColumn: "ts",
      bucket: "hour",
    });
    expect(result.interval).toBe("hour");
  });

  it("should default interval to day when not provided", () => {
    const result = StatsTimeSeriesSchema.parse({
      table: "metrics",
      valueColumn: "value",
      timeColumn: "ts",
    });
    expect(result.interval).toBe("day");
  });
});

// =============================================================================
// JSONB Schema Path Helpers Tests
// =============================================================================

import {
  stringPathToArray,
  normalizePathForInsert,
  parseJsonbValue,
  normalizePathToArray,
  normalizePathToString,
} from "../jsonb/index.js";

describe("stringPathToArray", () => {
  it("should convert simple dot notation", () => {
    expect(stringPathToArray("a.b.c")).toEqual(["a", "b", "c"]);
  });

  it("should convert array notation [0] to .0", () => {
    expect(stringPathToArray("a[0].b")).toEqual(["a", "0", "b"]);
    expect(stringPathToArray("items[2].name")).toEqual(["items", "2", "name"]);
  });

  it("should handle JSONPath format ($.a.b)", () => {
    expect(stringPathToArray("$.a.b")).toEqual(["a", "b"]);
    expect(stringPathToArray("$a.b")).toEqual(["a", "b"]);
  });

  it("should handle leading dots", () => {
    expect(stringPathToArray(".a.b")).toEqual(["a", "b"]);
  });
});

describe("normalizePathForInsert", () => {
  it("should wrap bare number in array", () => {
    expect(normalizePathForInsert(0)).toEqual([0]);
    expect(normalizePathForInsert(-1)).toEqual([-1]);
  });

  it("should convert string path and parse numeric segments", () => {
    expect(normalizePathForInsert("tags.0")).toEqual(["tags", 0]);
    expect(normalizePathForInsert("items.-1")).toEqual(["items", -1]);
  });

  it("should preserve mixed types in array", () => {
    expect(normalizePathForInsert(["tags", 0])).toEqual(["tags", 0]);
    expect(normalizePathForInsert(["a", "1", "b"])).toEqual(["a", 1, "b"]);
  });
});

describe("parseJsonbValue", () => {
  it("should parse valid JSON strings", () => {
    expect(parseJsonbValue('{"key": "value"}')).toEqual({ key: "value" });
    expect(parseJsonbValue("[1, 2, 3]")).toEqual([1, 2, 3]);
  });

  it("should return non-JSON strings as-is", () => {
    expect(parseJsonbValue("hello world")).toBe("hello world");
    expect(parseJsonbValue("not{json")).toBe("not{json");
  });

  it("should return non-string values as-is", () => {
    expect(parseJsonbValue({ key: "value" })).toEqual({ key: "value" });
    expect(parseJsonbValue(123)).toBe(123);
    expect(parseJsonbValue(null)).toBe(null);
  });
});

describe("normalizePathToArray", () => {
  it("should convert string path to array", () => {
    expect(normalizePathToArray("a.b.c")).toEqual(["a", "b", "c"]);
  });

  it("should convert mixed array to string array", () => {
    expect(normalizePathToArray(["a", 1, "b"])).toEqual(["a", "1", "b"]);
  });
});

describe("normalizePathToString", () => {
  it("should join array to dot-separated string", () => {
    expect(normalizePathToString(["a", "b", "c"])).toBe("a.b.c");
    expect(normalizePathToString(["items", 0, "name"])).toBe("items.0.name");
  });

  it("should return string as-is", () => {
    expect(normalizePathToString("a.b.c")).toBe("a.b.c");
  });
});

// =============================================================================
// Partitioning Schema Tests
// =============================================================================

import {
  CreatePartitionSchema,
  CreatePartitionedTableSchema,
} from "../partitioning.js";

describe("CreatePartitionSchema", () => {
  it("should resolve parentTable alias to parent", () => {
    const result = CreatePartitionSchema.parse({
      parentTable: "orders",
      name: "orders_2024",
      forValues: "FROM ('2024-01-01') TO ('2025-01-01')",
    });
    expect(result.parent).toBe("orders");
  });

  it("should resolve table alias to parent", () => {
    const result = CreatePartitionSchema.parse({
      table: "events",
      name: "events_jan",
      forValues: "FOR VALUES IN ('jan')",
    });
    expect(result.parent).toBe("events");
  });

  it("should build forValues from from/to (RANGE)", () => {
    const result = CreatePartitionSchema.parse({
      parent: "orders",
      name: "orders_q1",
      from: "2024-01-01",
      to: "2024-04-01",
    });
    expect(result.forValues).toBe("FROM ('2024-01-01') TO ('2024-04-01')");
  });

  it("should build forValues from values array (LIST)", () => {
    const result = CreatePartitionSchema.parse({
      parent: "orders",
      name: "orders_us",
      values: ["US", "CA", "MX"],
    });
    expect(result.forValues).toBe("IN ('US', 'CA', 'MX')");
  });

  it("should build forValues from modulus/remainder (HASH)", () => {
    const result = CreatePartitionSchema.parse({
      parent: "orders",
      name: "orders_p0",
      modulus: 4,
      remainder: 0,
    });
    expect(result.forValues).toBe("WITH (MODULUS 4, REMAINDER 0)");
  });
});

describe("CreatePartitionedTableSchema", () => {
  it("should resolve table alias to name", () => {
    const result = CreatePartitionedTableSchema.parse({
      table: "events",
      columns: [{ name: "id", type: "integer" }],
      partitionBy: "RANGE",
      partitionKey: "(created_at)",
    });
    expect(result.name).toBe("events");
  });

  it("should normalize partitionBy to lowercase", () => {
    const result = CreatePartitionedTableSchema.parse({
      name: "events",
      columns: [{ name: "id", type: "integer" }],
      partitionBy: "RANGE",
      partitionKey: "(created_at)",
    });
    expect(result.partitionBy).toBe("range");
  });

  it("should parse schema.table format", () => {
    const result = CreatePartitionedTableSchema.parse({
      name: "analytics.events",
      columns: [{ name: "id", type: "integer" }],
      partitionBy: "list",
      partitionKey: "(region)",
    });
    expect(result.name).toBe("events");
    expect(result.schema).toBe("analytics");
  });
});

// =============================================================================
// Core Schema Tests
// =============================================================================

import {
  ReadQuerySchema,
  WriteQuerySchema,
  DescribeTableSchema,
  CreateTableSchema,
  DropTableSchema,
  CreateIndexSchema,
  BeginTransactionSchema,
  TransactionIdSchema,
  SavepointSchema,
  TransactionExecuteSchema,
  ListTablesSchema,
} from "../core/index.js";

describe("ReadQuerySchema", () => {
  it("should resolve query alias to sql", () => {
    const result = ReadQuerySchema.parse({ query: "SELECT 1" });
    expect(result.sql).toBe("SELECT 1");
  });

  it("should resolve txId alias to transactionId", () => {
    const result = ReadQuerySchema.parse({
      sql: "SELECT 1",
      txId: "tx-123",
    });
    expect(result.transactionId).toBe("tx-123");
  });

  it("should resolve tx alias to transactionId", () => {
    const result = ReadQuerySchema.parse({
      sql: "SELECT 1",
      tx: "tx-456",
    });
    expect(result.transactionId).toBe("tx-456");
  });

  it("should reject when neither sql nor query provided", () => {
    expect(() => ReadQuerySchema.parse({})).toThrow(
      "sql (or query alias) is required",
    );
  });
});

describe("WriteQuerySchema", () => {
  it("should resolve query alias to sql", () => {
    const result = WriteQuerySchema.parse({
      query: "INSERT INTO users DEFAULT VALUES",
    });
    expect(result.sql).toBe("INSERT INTO users DEFAULT VALUES");
  });

  it("should reject when neither sql nor query provided", () => {
    expect(() => WriteQuerySchema.parse({})).toThrow(
      "sql (or query alias) is required",
    );
  });
});

describe("DescribeTableSchema", () => {
  it("should resolve tableName alias", () => {
    const result = DescribeTableSchema.parse({ tableName: "orders" });
    expect(result.table).toBe("orders");
  });

  it("should resolve name alias", () => {
    const result = DescribeTableSchema.parse({ name: "products" });
    expect(result.table).toBe("products");
  });

  it("should parse schema.table format", () => {
    const result = DescribeTableSchema.parse({
      table: "analytics.events",
    });
    expect(result.table).toBe("events");
    expect(result.schema).toBe("analytics");
  });

  it("should reject when no table provided", () => {
    expect(() => DescribeTableSchema.parse({})).toThrow(
      "table (or tableName/name alias) is required",
    );
  });
});

describe("DropTableSchema", () => {
  it("should resolve tableName alias", () => {
    const result = DropTableSchema.parse({ tableName: "old_table" });
    expect(result.table).toBe("old_table");
  });

  it("should parse schema.table format", () => {
    const result = DropTableSchema.parse({ table: "legacy.old_data" });
    expect(result.table).toBe("old_data");
    expect(result.schema).toBe("legacy");
  });

  it("should preserve drop options", () => {
    const result = DropTableSchema.parse({
      table: "temp",
      ifExists: true,
      cascade: true,
    });
    expect(result.ifExists).toBe(true);
    expect(result.cascade).toBe(true);
  });
});

describe("CreateTableSchema", () => {
  it("should auto-quote string default values", () => {
    const result = CreateTableSchema.parse({
      name: "test",
      columns: [{ name: "status", type: "text", default: "active" }],
    });
    expect(result.columns[0]?.default).toBe("'active'");
  });

  it("should not quote SQL keyword defaults", () => {
    const result = CreateTableSchema.parse({
      name: "test",
      columns: [{ name: "id", type: "integer", default: "NULL" }],
    });
    expect(result.columns[0]?.default).toBe("NULL");
  });

  it("should convert now() to CURRENT_TIMESTAMP", () => {
    const result = CreateTableSchema.parse({
      name: "test",
      columns: [{ name: "created", type: "timestamp", default: "now()" }],
    });
    expect(result.columns[0]?.default).toBe("CURRENT_TIMESTAMP");
  });

  it("should coerce number default to string", () => {
    const result = CreateTableSchema.parse({
      name: "test",
      columns: [{ name: "priority", type: "integer", default: 0 }],
    });
    expect(result.columns[0]?.default).toBe("0");
  });

  it("should coerce boolean default to string", () => {
    const result = CreateTableSchema.parse({
      name: "test",
      columns: [{ name: "active", type: "boolean", default: true }],
    });
    expect(result.columns[0]?.default).toBe("true");
  });

  it("should parse string reference syntax users(id)", () => {
    const result = CreateTableSchema.parse({
      name: "orders",
      columns: [
        {
          name: "user_id",
          type: "integer",
          references: "users(id)",
        },
      ],
    });
    expect(result.columns[0]?.references?.table).toBe("users");
    expect(result.columns[0]?.references?.column).toBe("id");
  });

  it("should reject invalid string reference syntax", () => {
    expect(() =>
      CreateTableSchema.parse({
        name: "test",
        columns: [{ name: "fk", type: "integer", references: "invalid" }],
      }),
    ).toThrow("Invalid references format");
  });

  it("should handle notNull alias for nullable", () => {
    const result = CreateTableSchema.parse({
      name: "test",
      columns: [{ name: "email", type: "text", notNull: true }],
    });
    expect(result.columns[0]?.nullable).toBe(false);
  });

  it("should parse schema.table format via tableName alias", () => {
    const result = CreateTableSchema.parse({
      tableName: "analytics.events",
      columns: [{ name: "id", type: "serial" }],
    });
    expect(result.name).toBe("events");
    expect(result.schema).toBe("analytics");
  });

  it("should parse schema.table format via name field", () => {
    const result = CreateTableSchema.parse({
      name: "analytics.events",
      columns: [{ name: "id", type: "serial" }],
    });
    expect(result.name).toBe("events");
    expect(result.schema).toBe("analytics");
  });

  it("should reject empty columns", () => {
    expect(() =>
      CreateTableSchema.parse({ name: "test", columns: [] }),
    ).toThrow("columns must not be empty");
  });
});

describe("CreateIndexSchema", () => {
  it("should auto-generate index name from table and columns", () => {
    const result = CreateIndexSchema.parse({
      table: "users",
      columns: ["email"],
    });
    expect(result.name).toBe("idx_users_email");
  });

  it("should resolve column (singular) to columns array", () => {
    const result = CreateIndexSchema.parse({
      table: "users",
      column: "name",
    });
    expect(result.columns).toEqual(["name"]);
  });

  it("should resolve method alias to type", () => {
    const result = CreateIndexSchema.parse({
      table: "docs",
      columns: ["data"],
      method: "gin",
    });
    expect(result.type).toBe("gin");
  });

  it("should parse JSON-encoded columns string", () => {
    const result = CreateIndexSchema.parse({
      table: "users",
      columns: '["email", "name"]' as unknown as string[],
    });
    expect(result.columns).toEqual(["email", "name"]);
  });

  it("should resolve indexName alias", () => {
    const result = CreateIndexSchema.parse({
      table: "users",
      columns: ["email"],
      indexName: "my_idx",
    });
    expect(result.name).toBe("my_idx");
  });
});

describe("BeginTransactionSchema", () => {
  it("should normalize isolation level shorthands", () => {
    expect(
      BeginTransactionSchema.parse({ isolationLevel: "ru" }).isolationLevel,
    ).toBe("READ UNCOMMITTED");

    expect(
      BeginTransactionSchema.parse({ isolationLevel: "rc" }).isolationLevel,
    ).toBe("READ COMMITTED");

    expect(
      BeginTransactionSchema.parse({ isolationLevel: "rr" }).isolationLevel,
    ).toBe("REPEATABLE READ");

    expect(
      BeginTransactionSchema.parse({ isolationLevel: "s" }).isolationLevel,
    ).toBe("SERIALIZABLE");
  });

  it("should accept undefined input (no params)", () => {
    const result = BeginTransactionSchema.parse(undefined);
    expect(result.isolationLevel).toBeUndefined();
  });
});

describe("TransactionIdSchema", () => {
  it("should resolve txId alias", () => {
    const result = TransactionIdSchema.parse({ txId: "tx-1" });
    expect(result.transactionId).toBe("tx-1");
  });

  it("should resolve tx alias", () => {
    const result = TransactionIdSchema.parse({ tx: "tx-2" });
    expect(result.transactionId).toBe("tx-2");
  });

  it("should reject empty transactionId", () => {
    expect(() => TransactionIdSchema.parse({})).toThrow(
      "transactionId is required",
    );
  });
});

describe("SavepointSchema", () => {
  it("should resolve savepoint alias for name", () => {
    const result = SavepointSchema.parse({
      transactionId: "tx-1",
      savepoint: "sp1",
    });
    expect(result.name).toBe("sp1");
  });

  it("should reject invalid savepoint names", () => {
    expect(() =>
      SavepointSchema.parse({
        transactionId: "tx-1",
        name: "invalid name!",
      }),
    ).toThrow("valid SQL identifier");
  });
});

describe("TransactionExecuteSchema", () => {
  it("should resolve query alias in statements", () => {
    const result = TransactionExecuteSchema.parse({
      statements: [{ query: "INSERT INTO t DEFAULT VALUES" }],
    });
    expect(result.statements[0]?.sql).toBe("INSERT INTO t DEFAULT VALUES");
  });

  it("should reject empty statements", () => {
    expect(() => TransactionExecuteSchema.parse({ statements: [] })).toThrow(
      "statements is required",
    );
  });

  it("should reject statements without sql", () => {
    expect(() =>
      TransactionExecuteSchema.parse({
        statements: [{}],
      }),
    ).toThrow("Each statement must have");
  });

  it("should resolve txId in transaction execute", () => {
    const result = TransactionExecuteSchema.parse({
      statements: [{ sql: "SELECT 1" }],
      txId: "tx-join",
    });
    expect(result.transactionId).toBe("tx-join");
  });
});

describe("ListTablesSchema", () => {
  it("should handle undefined input", () => {
    const result = ListTablesSchema.parse(undefined);
    expect(result).toEqual({});
  });

  it("should accept exclude array", () => {
    const result = ListTablesSchema.parse({ exclude: ["cron", "partman"] });
    expect(result.exclude).toEqual(["cron", "partman"]);
  });
});

// =============================================================================
// Admin Schema Tests
// =============================================================================

import {
  VacuumSchema,
  AnalyzeSchema,
  ReindexSchema,
  TerminateBackendSchema,
  CancelBackendSchema,
} from "../admin.js";

describe("VacuumSchema", () => {
  it("should resolve tableName alias", () => {
    const result = VacuumSchema.parse({ tableName: "orders" });
    expect(result.table).toBe("orders");
  });

  it("should parse schema.table format", () => {
    const result = VacuumSchema.parse({ table: "public.orders" });
    expect(result.table).toBe("orders");
    expect(result.schema).toBe("public");
  });

  it("should not override explicit schema", () => {
    const result = VacuumSchema.parse({
      table: "other.orders",
      schema: "explicit",
    });
    expect(result.schema).toBe("explicit");
    expect(result.table).toBe("orders");
  });

  it("should handle null input", () => {
    const result = VacuumSchema.parse(null);
    expect(result.table).toBeUndefined();
  });

  it("should handle undefined input", () => {
    const result = VacuumSchema.parse(undefined);
    expect(result.table).toBeUndefined();
  });
});

describe("AnalyzeSchema", () => {
  it("should resolve tableName alias", () => {
    const result = AnalyzeSchema.parse({ tableName: "products" });
    expect(result.table).toBe("products");
  });

  it("should accept columns array", () => {
    const result = AnalyzeSchema.parse({
      table: "orders",
      columns: ["created_at", "status"],
    });
    expect(result.columns).toEqual(["created_at", "status"]);
  });
});

describe("ReindexSchema", () => {
  it("should resolve tableName alias to name", () => {
    const result = ReindexSchema.parse({
      target: "table",
      tableName: "orders",
    });
    expect(result.name).toBe("orders");
  });

  it("should resolve table alias to name", () => {
    const result = ReindexSchema.parse({
      target: "table",
      table: "products",
    });
    expect(result.name).toBe("products");
  });

  it("should resolve indexName alias to name", () => {
    const result = ReindexSchema.parse({
      target: "index",
      indexName: "idx_users_email",
    });
    expect(result.name).toBe("idx_users_email");
  });

  it("should allow database target without name", () => {
    const result = ReindexSchema.parse({ target: "database" });
    expect(result.name).toBeUndefined();
  });

  it("should reject table target without name", () => {
    expect(() => ReindexSchema.parse({ target: "table" })).toThrow(
      "name is required when target is table",
    );
  });
});

describe("TerminateBackendSchema", () => {
  it("should resolve processId alias to pid", () => {
    const result = TerminateBackendSchema.parse({ processId: 12345 });
    expect(result.pid).toBe(12345);
  });
});

describe("CancelBackendSchema", () => {
  it("should resolve processId alias to pid", () => {
    const result = CancelBackendSchema.parse({ processId: 67890 });
    expect(result.pid).toBe(67890);
  });
});

// =============================================================================
// Text Search Schema Tests
// =============================================================================

import {
  preprocessTextParams,
  TextSearchSchema,
  TrigramSimilaritySchema,
  RegexpMatchSchema,
} from "../text-search.js";

describe("preprocessTextParams", () => {
  it("should pass through non-objects", () => {
    expect(preprocessTextParams(null)).toBe(null);
    expect(preprocessTextParams("string")).toBe("string");
  });

  it("should resolve tableName alias to table", () => {
    const result = preprocessTextParams({
      tableName: "articles",
      column: "content",
    }) as Record<string, unknown>;
    expect(result.table).toBe("articles");
  });

  it("should resolve col alias to column", () => {
    const result = preprocessTextParams({
      table: "users",
      col: "name",
    }) as Record<string, unknown>;
    expect(result.column).toBe("name");
  });

  it("should resolve filter alias to where", () => {
    const result = preprocessTextParams({
      table: "users",
      column: "name",
      filter: "active = true",
    }) as Record<string, unknown>;
    expect(result.where).toBe("active = true");
  });

  it("should resolve text alias to value", () => {
    const result = preprocessTextParams({
      table: "users",
      column: "name",
      text: "john",
    }) as Record<string, unknown>;
    expect(result.value).toBe("john");
  });

  it("should resolve indexName alias to name", () => {
    const result = preprocessTextParams({
      table: "articles",
      column: "content",
      indexName: "idx_search",
    }) as Record<string, unknown>;
    expect(result.name).toBe("idx_search");
  });

  it("should wrap column string to columns array", () => {
    const result = preprocessTextParams({
      table: "articles",
      column: "content",
    }) as Record<string, unknown>;
    expect(result.columns).toEqual(["content"]);
  });

  it("should parse schema.table format", () => {
    const result = preprocessTextParams({
      table: "search.articles",
      column: "body",
    }) as Record<string, unknown>;
    expect(result.table).toBe("articles");
    expect(result.schema).toBe("search");
  });

  it("should not override explicit schema in schema.table parsing", () => {
    const result = preprocessTextParams({
      table: "other.articles",
      column: "body",
      schema: "explicit",
    }) as Record<string, unknown>;
    // Table is still parsed but schema is preserved
    expect(result.schema).toBe("explicit");
    expect(result.table).toBe("articles");
  });
});

describe("TextSearchSchema", () => {
  it("should accept valid text search input", () => {
    const result = TextSearchSchema.parse({
      table: "articles",
      column: "content",
      query: "database",
    });
    expect(result).toBeDefined();
  });

  it("should accept tableName alias", () => {
    const result = TextSearchSchema.parse({
      tableName: "articles",
      column: "body",
      query: "test",
    });
    expect(result).toBeDefined();
  });
});

describe("TrigramSimilaritySchema", () => {
  it("should accept valid trigram input", () => {
    const result = TrigramSimilaritySchema.parse({
      table: "users",
      column: "name",
      value: "john",
    });
    expect(result).toBeDefined();
  });

  it("should reject when table is missing", () => {
    expect(() =>
      TrigramSimilaritySchema.parse({ column: "name", value: "test" }),
    ).toThrow("Either 'table' or 'tableName' is required");
  });
});

describe("RegexpMatchSchema", () => {
  it("should accept valid regexp input", () => {
    const result = RegexpMatchSchema.parse({
      table: "logs",
      column: "message",
      pattern: "error.*timeout",
    });
    expect(result).toBeDefined();
  });
});

// =============================================================================
// JSONB Schema Tests
// =============================================================================

import {
  preprocessJsonbParams,
  normalizePathToArray,
  normalizePathToString,
  normalizePathForInsert,
  parseJsonbValue,
  JsonbExtractSchema,
  JsonbSetSchema,
  JsonbContainsSchema,
  JsonbInsertSchema,
  JsonbDeleteSchema,
  JsonbAggSchema,
} from "../jsonb/index.js";

describe("preprocessJsonbParams", () => {
  it("should pass through non-objects", () => {
    expect(preprocessJsonbParams(null)).toBe(null);
    expect(preprocessJsonbParams("string")).toBe("string");
  });

  it("should resolve tableName alias to table", () => {
    const result = preprocessJsonbParams({
      tableName: "users",
      column: "data",
    }) as Record<string, unknown>;
    expect(result.table).toBe("users");
  });

  it("should resolve name alias to table", () => {
    const result = preprocessJsonbParams({
      name: "users",
      column: "data",
    }) as Record<string, unknown>;
    expect(result.table).toBe("users");
  });

  it("should resolve col alias to column", () => {
    const result = preprocessJsonbParams({
      table: "users",
      col: "metadata",
    }) as Record<string, unknown>;
    expect(result.column).toBe("metadata");
  });

  it("should resolve filter alias to where", () => {
    const result = preprocessJsonbParams({
      table: "users",
      column: "data",
      filter: "id > 5",
    }) as Record<string, unknown>;
    expect(result.where).toBe("id > 5");
  });

  it("should parse schema.table format", () => {
    const result = preprocessJsonbParams({
      table: "analytics.events",
      column: "data",
    }) as Record<string, unknown>;
    expect(result.table).toBe("events");
    expect(result.schema).toBe("analytics");
  });

  it("should not override explicit schema", () => {
    const result = preprocessJsonbParams({
      table: "other.events",
      column: "data",
      schema: "explicit",
    }) as Record<string, unknown>;
    expect(result.schema).toBe("explicit");
    expect(result.table).toBe("events");
  });
});

describe("normalizePathToArray", () => {
  it("should convert string path to array", () => {
    expect(normalizePathToArray("a.b.c")).toEqual(["a", "b", "c"]);
  });

  it("should convert mixed-type array to string array", () => {
    expect(normalizePathToArray(["a", 0, "b"])).toEqual(["a", "0", "b"]);
  });
});

describe("normalizePathToString", () => {
  it("should convert array to dot-separated string", () => {
    expect(normalizePathToString(["a", "b", 0])).toBe("a.b.0");
  });

  it("should return string paths unchanged", () => {
    expect(normalizePathToString("a.b.c")).toBe("a.b.c");
  });
});

describe("normalizePathForInsert", () => {
  it("should wrap bare number in array", () => {
    expect(normalizePathForInsert(0)).toEqual([0]);
  });

  it("should convert string path and parse numeric segments", () => {
    expect(normalizePathForInsert("tags.0")).toEqual(["tags", 0]);
  });

  it("should handle mixed-type array with numbers preserved", () => {
    expect(normalizePathForInsert(["tags", 0, "name"])).toEqual([
      "tags",
      0,
      "name",
    ]);
  });

  it("should convert numeric strings to numbers in arrays", () => {
    expect(normalizePathForInsert(["tags", "0"])).toEqual(["tags", 0]);
  });
});

describe("parseJsonbValue", () => {
  it("should parse valid JSON strings", () => {
    expect(parseJsonbValue('{"key": "value"}')).toEqual({ key: "value" });
  });

  it("should return non-JSON strings as-is", () => {
    expect(parseJsonbValue("hello")).toBe("hello");
  });

  it("should pass through non-strings", () => {
    expect(parseJsonbValue(42)).toBe(42);
    expect(parseJsonbValue(null)).toBe(null);
  });
});

describe("JsonbExtractSchema", () => {
  it("should accept valid input with tableName and col aliases", () => {
    const result = JsonbExtractSchema.parse({
      tableName: "users",
      col: "data",
      path: "name",
    });
    expect(result).toBeDefined();
  });
});

describe("JsonbSetSchema", () => {
  it("should accept valid input with filter alias", () => {
    const result = JsonbSetSchema.parse({
      table: "users",
      column: "data",
      path: "name",
      value: "test",
      filter: "id = 1",
    });
    expect(result).toBeDefined();
  });

  it("should reject when no where/filter provided", () => {
    expect(() =>
      JsonbSetSchema.parse({
        table: "users",
        column: "data",
        path: "name",
        value: "test",
      }),
    ).toThrow("Either 'where' or 'filter' is required");
  });
});

describe("JsonbContainsSchema", () => {
  it("should accept valid input with col alias", () => {
    const result = JsonbContainsSchema.parse({
      table: "users",
      col: "data",
      value: { status: "active" },
    });
    expect(result).toBeDefined();
  });
});

describe("JsonbInsertSchema", () => {
  it("should accept valid input with filter alias", () => {
    const result = JsonbInsertSchema.parse({
      table: "users",
      column: "data",
      path: "tags.0",
      value: "new-tag",
      filter: "id = 1",
    });
    expect(result).toBeDefined();
  });
});

describe("JsonbDeleteSchema", () => {
  it("should accept valid input with name alias for table", () => {
    const result = JsonbDeleteSchema.parse({
      name: "users",
      column: "data",
      path: "old_key",
      where: "id = 1",
    });
    expect(result).toBeDefined();
  });
});

describe("JsonbAggSchema", () => {
  it("should accept valid input with tableName alias", () => {
    const result = JsonbAggSchema.parse({
      tableName: "users",
    });
    expect(result).toBeDefined();
  });
});

// =============================================================================
// Extension Schema Tests (citext, ltree, pgcrypto)
// =============================================================================

import {
  CitextConvertColumnSchema,
  CitextSchemaAdvisorSchema,
  LtreeQuerySchema,
  LtreeSubpathSchema,
  LtreeMatchSchema,
  LtreeConvertColumnSchema,
  LtreeIndexSchema,
  PgcryptoEncryptSchema,
  PgcryptoDecryptSchema,
} from "../extensions/index.js";

describe("CitextConvertColumnSchema", () => {
  it("should resolve col alias to column", () => {
    const result = CitextConvertColumnSchema.parse({
      table: "users",
      col: "email",
    });
    expect(result.column).toBe("email");
  });

  it("should parse schema.table format", () => {
    const result = CitextConvertColumnSchema.parse({
      table: "auth.users",
      column: "email",
    });
    expect(result.table).toBe("users");
    expect(result.schema).toBe("auth");
  });

  it("should reject when no column provided", () => {
    expect(() => CitextConvertColumnSchema.parse({ table: "users" })).toThrow(
      "column (or col alias) is required",
    );
  });
});

describe("CitextSchemaAdvisorSchema", () => {
  it("should resolve tableName alias", () => {
    const result = CitextSchemaAdvisorSchema.parse({
      tableName: "users",
    });
    expect(result.table).toBe("users");
  });

  it("should reject when no table provided", () => {
    expect(() => CitextSchemaAdvisorSchema.parse({})).toThrow(
      "table (or tableName alias) is required",
    );
  });
});

describe("LtreeQuerySchema", () => {
  it("should resolve pattern alias to path", () => {
    const result = LtreeQuerySchema.parse({
      table: "categories",
      column: "path",
      pattern: "Top.Science",
    });
    expect(result.path).toBe("Top.Science");
  });

  it("should resolve type alias to mode", () => {
    const result = LtreeQuerySchema.parse({
      table: "categories",
      column: "path",
      path: "Top.Science",
      type: "ancestors",
    });
    expect(result.mode).toBe("ancestors");
  });

  it("should resolve tableName alias via preprocessor", () => {
    const result = LtreeQuerySchema.parse({
      tableName: "categories",
      column: "path",
      path: "Top",
    });
    expect(result.table).toBe("categories");
  });

  it("should resolve name alias via preprocessor", () => {
    const result = LtreeQuerySchema.parse({
      name: "categories",
      col: "path",
      path: "Top",
    });
    expect(result.table).toBe("categories");
    expect(result.column).toBe("path");
  });

  it("should parse schema.table format", () => {
    const result = LtreeQuerySchema.parse({
      table: "tree.categories",
      column: "path",
      path: "Top",
    });
    expect(result.table).toBe("categories");
    expect(result.schema).toBe("tree");
  });
});

describe("LtreeSubpathSchema", () => {
  it("should resolve start alias to offset", () => {
    const result = LtreeSubpathSchema.parse({
      path: "Top.Science.Astronomy.Stars",
      start: 1,
      length: 2,
    });
    expect(result.offset).toBe(1);
  });

  it("should resolve from alias to offset", () => {
    const result = LtreeSubpathSchema.parse({
      path: "Top.Science.Astronomy",
      from: 0,
      length: 2,
    });
    expect(result.offset).toBe(0);
  });

  it("should resolve len alias to length", () => {
    const result = LtreeSubpathSchema.parse({
      path: "Top.Science.Astronomy",
      len: 2,
    });
    expect(result.length).toBe(2);
  });

  it("should default offset to 0", () => {
    const result = LtreeSubpathSchema.parse({
      path: "Top.Science.Astronomy",
    });
    expect(result.offset).toBe(0);
  });

  it("should calculate length from end alias", () => {
    const result = LtreeSubpathSchema.parse({
      path: "Top.Science.Astronomy.Stars",
      start: 1,
      end: 3,
    });
    expect(result.length).toBe(2);
  });
});

describe("LtreeMatchSchema", () => {
  it("should resolve query alias to pattern", () => {
    const result = LtreeMatchSchema.parse({
      table: "categories",
      column: "path",
      query: "*.Science.*",
    });
    expect(result.pattern).toBe("*.Science.*");
  });

  it("should resolve lquery alias to pattern", () => {
    const result = LtreeMatchSchema.parse({
      table: "categories",
      column: "path",
      lquery: "Top.*{1,3}",
    });
    expect(result.pattern).toBe("Top.*{1,3}");
  });

  it("should resolve maxResults alias to limit", () => {
    const result = LtreeMatchSchema.parse({
      table: "categories",
      column: "path",
      pattern: "*",
      maxResults: 10,
    });
    expect(result.limit).toBe(10);
  });
});

describe("LtreeConvertColumnSchema", () => {
  it("should resolve tableName/col aliases", () => {
    const result = LtreeConvertColumnSchema.parse({
      tableName: "categories",
      col: "path_text",
    });
    expect(result.table).toBe("categories");
    expect(result.column).toBe("path_text");
  });
});

describe("LtreeIndexSchema", () => {
  it("should resolve name and col aliases", () => {
    const result = LtreeIndexSchema.parse({
      name: "categories",
      col: "path",
    });
    expect(result.table).toBe("categories");
    expect(result.column).toBe("path");
  });
});

describe("PgcryptoEncryptSchema", () => {
  it("should resolve key alias to password", () => {
    const result = PgcryptoEncryptSchema.parse({
      data: "secret",
      key: "my-pass",
    });
    expect(result.password).toBe("my-pass");
  });

  it("should reject when no password/key provided", () => {
    expect(() => PgcryptoEncryptSchema.parse({ data: "secret" })).toThrow(
      "password (or key alias) is required",
    );
  });
});

describe("PgcryptoDecryptSchema", () => {
  it("should resolve data alias to encryptedData", () => {
    const result = PgcryptoDecryptSchema.parse({
      data: "encrypted-data",
      password: "my-pass",
    });
    expect(result.encryptedData).toBe("encrypted-data");
  });

  it("should resolve key alias to password", () => {
    const result = PgcryptoDecryptSchema.parse({
      encryptedData: "encrypted-data",
      key: "my-pass",
    });
    expect(result.password).toBe("my-pass");
  });

  it("should reject when no encryptedData/data provided", () => {
    expect(() => PgcryptoDecryptSchema.parse({ password: "my-pass" })).toThrow(
      "encryptedData (or data alias) is required",
    );
  });

  it("should reject when no password/key provided", () => {
    expect(() =>
      PgcryptoDecryptSchema.parse({ encryptedData: "data" }),
    ).toThrow("password (or key alias) is required");
  });
});

// =============================================================================
// Backup Schema Tests
// =============================================================================

import { CopyExportSchema } from "../backup.js";

describe("CopyExportSchema", () => {
  it("should resolve sql alias to query", () => {
    const result = CopyExportSchema.parse({
      sql: "SELECT * FROM users",
      limit: 0,
    });
    expect(result.query).toContain("SELECT * FROM users");
  });

  it("should auto-generate query from table", () => {
    const result = CopyExportSchema.parse({ table: "users" });
    expect(result.query).toContain("users");
    expect(result.query).toContain("LIMIT");
  });

  it("should parse schema.table format in table shortcut", () => {
    const result = CopyExportSchema.parse({
      table: "analytics.events",
    });
    expect(result.query).toContain("analytics");
    expect(result.query).toContain("events");
  });

  it("should detect conflict when both query and table provided", () => {
    const result = CopyExportSchema.parse({
      query: "SELECT 1",
      table: "users",
      limit: 0,
    });
    expect(result.conflictWarning).toContain("Both query and table");
  });

  it("should use default limit of 500 when not specified", () => {
    const result = CopyExportSchema.parse({ table: "users" });
    expect(result.usedDefaultLimit).toBe(true);
    expect(result.query).toContain("500");
  });

  it("should use explicit limit 0 for no limit", () => {
    const result = CopyExportSchema.parse({
      table: "users",
      limit: 0,
    });
    expect(result.effectiveLimit).toBeUndefined();
    expect(result.query).not.toContain("LIMIT");
  });

  it("should append LIMIT to custom query if not present", () => {
    const result = CopyExportSchema.parse({
      query: "SELECT * FROM users WHERE active",
      limit: 10,
    });
    expect(result.query).toContain("LIMIT 10");
  });

  it("should not append LIMIT if query already has one", () => {
    const result = CopyExportSchema.parse({
      query: "SELECT * FROM users LIMIT 5",
      limit: 100,
    });
    // Should not double-append LIMIT
    expect(result.query).toBe("SELECT * FROM users LIMIT 5");
  });

  it("should throw when neither query nor table provided", () => {
    expect(() => CopyExportSchema.parse({})).toThrow(
      "Either query/sql or table parameter is required",
    );
  });
});

// =============================================================================
// Partitioning Schema Tests
// =============================================================================

import {
  CreatePartitionSchema,
  AttachPartitionSchema,
  DetachPartitionSchema,
  ListPartitionsSchema,
  PartitionInfoSchema,
  CreatePartitionedTableSchema,
} from "../partitioning.js";

describe("CreatePartitionSchema (preprocessPartitionParams)", () => {
  it("should resolve parentTable alias to parent", () => {
    const result = CreatePartitionSchema.parse({
      parentTable: "events",
      name: "events_2024",
      forValues: "FROM ('2024-01-01') TO ('2025-01-01')",
    });
    expect(result.parent).toBe("events");
  });

  it("should resolve table alias to parent", () => {
    const result = CreatePartitionSchema.parse({
      table: "events",
      name: "events_2024",
      forValues: "FROM ('2024-01-01') TO ('2025-01-01')",
    });
    expect(result.parent).toBe("events");
  });

  it("should resolve partitionName alias to name", () => {
    const result = CreatePartitionSchema.parse({
      parent: "events",
      partitionName: "events_2024",
      forValues: "FROM ('2024-01-01') TO ('2025-01-01')",
    });
    expect(result.name).toBe("events_2024");
  });

  it("should build forValues from rangeFrom/rangeTo", () => {
    const result = CreatePartitionSchema.parse({
      parent: "events",
      name: "events_2024",
      rangeFrom: "2024-01-01",
      rangeTo: "2025-01-01",
    });
    expect(result.forValues).toContain("FROM");
    expect(result.forValues).toContain("TO");
  });

  it("should build forValues from from/to", () => {
    const result = CreatePartitionSchema.parse({
      parent: "events",
      name: "events_2024",
      from: "2024-01-01",
      to: "2025-01-01",
    });
    expect(result.forValues).toContain("FROM");
    expect(result.forValues).toContain("TO");
  });

  it("should build forValues from listValues", () => {
    const result = CreatePartitionSchema.parse({
      parent: "events",
      name: "events_us",
      listValues: ["US", "CA"],
    });
    expect(result.forValues).toContain("IN");
    expect(result.forValues).toContain("US");
  });

  it("should build forValues from values array", () => {
    const result = CreatePartitionSchema.parse({
      parent: "events",
      name: "events_list",
      values: ["A", "B"],
    });
    expect(result.forValues).toContain("IN");
  });

  it("should build forValues from hashModulus/hashRemainder", () => {
    const result = CreatePartitionSchema.parse({
      parent: "events",
      name: "events_hash_0",
      hashModulus: 4,
      hashRemainder: 0,
    });
    expect(result.forValues).toContain("MODULUS");
    expect(result.forValues).toContain("REMAINDER");
  });

  it("should build forValues from modulus/remainder", () => {
    const result = CreatePartitionSchema.parse({
      parent: "events",
      name: "events_hash_1",
      modulus: 4,
      remainder: 1,
    });
    expect(result.forValues).toContain("MODULUS 4");
    expect(result.forValues).toContain("REMAINDER 1");
  });

  it("should handle isDefault for DEFAULT partitions", () => {
    const result = CreatePartitionSchema.parse({
      parent: "events",
      name: "events_default",
      isDefault: true,
    });
    expect(result.forValues).toBe("__DEFAULT__");
  });

  it("should handle default → isDefault alias", () => {
    const result = CreatePartitionSchema.parse({
      parent: "events",
      name: "events_default",
      default: true,
    });
    expect(result.isDefault).toBe(true);
  });

  it("should normalize subpartitionBy to lowercase", () => {
    const result = CreatePartitionSchema.parse({
      parent: "events",
      name: "events_2024",
      forValues: "FROM ('2024-01-01') TO ('2025-01-01')",
      subpartitionBy: "RANGE",
      subpartitionKey: "region",
    });
    expect(result.subpartitionBy).toBe("range");
  });

  it("should parse schema.table format from parent", () => {
    const result = CreatePartitionSchema.parse({
      parent: "analytics.events",
      name: "events_2024",
      forValues: "FROM ('2024-01-01') TO ('2025-01-01')",
    });
    expect(result.parent).toBe("events");
    expect(result.schema).toBe("analytics");
  });

  it("should reject when no parent/table/parentTable", () => {
    expect(() =>
      CreatePartitionSchema.parse({
        name: "events_2024",
        forValues: "FROM ('2024-01-01') TO ('2025-01-01')",
      }),
    ).toThrow("One of parent, parentTable, or table is required");
  });

  it("should reject when no forValues or isDefault", () => {
    expect(() =>
      CreatePartitionSchema.parse({
        parent: "events",
        name: "events_2024",
      }),
    ).toThrow("Either forValues or isDefault");
  });
});

describe("AttachPartitionSchema", () => {
  it("should resolve partitionTable alias to partition", () => {
    const result = AttachPartitionSchema.parse({
      parent: "events",
      partitionTable: "events_2024",
      forValues: "FROM ('2024-01-01') TO ('2025-01-01')",
    });
    expect(result.partition).toBe("events_2024");
  });

  it("should resolve partitionName alias to partition", () => {
    const result = AttachPartitionSchema.parse({
      parent: "events",
      partitionName: "events_2024",
      forValues: "FROM ('2024-01-01') TO ('2025-01-01')",
    });
    expect(result.partition).toBe("events_2024");
  });

  it("should parse schema.table from partition", () => {
    const result = AttachPartitionSchema.parse({
      parent: "events",
      partition: "analytics.events_2024",
      forValues: "FROM ('2024-01-01') TO ('2025-01-01')",
    });
    expect(result.partition).toBe("events_2024");
  });

  it("should reject when no partition/partitionTable/partitionName", () => {
    expect(() =>
      AttachPartitionSchema.parse({
        parent: "events",
        forValues: "FROM ('2024-01-01') TO ('2025-01-01')",
      }),
    ).toThrow("One of partition, partitionTable, or partitionName is required");
  });
});

describe("DetachPartitionSchema", () => {
  it("should resolve table alias to parent", () => {
    const result = DetachPartitionSchema.parse({
      table: "events",
      partition: "events_2024",
    });
    expect(result.parent).toBe("events");
  });

  it("should reject when no parent provided", () => {
    expect(() =>
      DetachPartitionSchema.parse({ partition: "events_2024" }),
    ).toThrow("One of parent, parentTable, or table is required");
  });

  it("should reject when no partition provided", () => {
    expect(() => DetachPartitionSchema.parse({ parent: "events" })).toThrow(
      "One of partition, partitionTable, or partitionName is required",
    );
  });
});

describe("ListPartitionsSchema (preprocessListInfoParams)", () => {
  it("should resolve parent alias to table", () => {
    const result = ListPartitionsSchema.parse({ parent: "events" });
    expect(result.table).toBe("events");
  });

  it("should resolve parentTable alias to table", () => {
    const result = ListPartitionsSchema.parse({ parentTable: "events" });
    expect(result.table).toBe("events");
  });

  it("should resolve name alias to table", () => {
    const result = ListPartitionsSchema.parse({ name: "events" });
    expect(result.table).toBe("events");
  });

  it("should parse schema.table format", () => {
    const result = ListPartitionsSchema.parse({
      table: "analytics.events",
    });
    expect(result.table).toBe("events");
    expect(result.schema).toBe("analytics");
  });

  it("should reject when no table alias provided", () => {
    expect(() => ListPartitionsSchema.parse({})).toThrow(
      "One of table, parent, parentTable, or name is required",
    );
  });
});

describe("PartitionInfoSchema", () => {
  it("should resolve parent alias", () => {
    const result = PartitionInfoSchema.parse({ parent: "events" });
    expect(result.table).toBe("events");
  });

  it("should reject when no table alias provided", () => {
    expect(() => PartitionInfoSchema.parse({})).toThrow(
      "One of table, parent, parentTable, or name is required",
    );
  });
});

describe("CreatePartitionedTableSchema", () => {
  it("should resolve table alias to name", () => {
    const result = CreatePartitionedTableSchema.parse({
      table: "events",
      columns: [{ name: "id", type: "serial" }],
      partitionBy: "range",
      partitionKey: "created_at",
    });
    expect(result.name).toBe("events");
  });

  it("should resolve key alias to partitionKey", () => {
    const result = CreatePartitionedTableSchema.parse({
      name: "events",
      columns: [{ name: "id", type: "serial" }],
      partitionBy: "range",
      key: "created_at",
    });
    expect(result.partitionKey).toBe("created_at");
  });

  it("should parse schema.table format", () => {
    const result = CreatePartitionedTableSchema.parse({
      name: "analytics.events",
      columns: [{ name: "id", type: "serial" }],
      partitionBy: "range",
      partitionKey: "created_at",
    });
    expect(result.name).toBe("events");
    expect(result.schema).toBe("analytics");
  });

  it("should normalize partitionBy to lowercase", () => {
    const result = CreatePartitionedTableSchema.parse({
      name: "events",
      columns: [{ name: "id", type: "serial" }],
      partitionBy: "range",
      partitionKey: "created_at",
    });
    expect(result.partitionBy).toBe("range");
  });
});

// =============================================================================
// Partman Schema Tests
// =============================================================================

import {
  PartmanCreateParentSchema,
  PartmanRunMaintenanceSchema,
  PartmanUndoPartitionSchema,
  PartmanRetentionSchema,
} from "../partman.js";

describe("PartmanCreateParentSchema (preprocessPartmanParams)", () => {
  it("should resolve table alias to parentTable with auto-prefix", () => {
    const result = PartmanCreateParentSchema.parse({
      table: "events",
      controlColumn: "created_at",
      interval: "1 month",
    });
    expect(result.parentTable).toBe("public.events");
  });

  it("should resolve parent alias to parentTable", () => {
    const result = PartmanCreateParentSchema.parse({
      parent: "events",
      controlColumn: "created_at",
      interval: "1 month",
    });
    expect(result.parentTable).toBe("public.events");
  });

  it("should resolve name alias to parentTable", () => {
    const result = PartmanCreateParentSchema.parse({
      name: "events",
      controlColumn: "created_at",
      interval: "1 month",
    });
    expect(result.parentTable).toBe("public.events");
  });

  it("should resolve column alias to controlColumn", () => {
    const result = PartmanCreateParentSchema.parse({
      table: "events",
      column: "created_at",
      interval: "1 month",
    });
    expect(result.controlColumn).toBe("created_at");
  });

  it("should resolve control alias to controlColumn", () => {
    const result = PartmanCreateParentSchema.parse({
      table: "events",
      control: "created_at",
      interval: "1 month",
    });
    expect(result.controlColumn).toBe("created_at");
  });

  it("should resolve partitionColumn alias to controlColumn", () => {
    const result = PartmanCreateParentSchema.parse({
      table: "events",
      partitionColumn: "created_at",
      interval: "1 month",
    });
    expect(result.controlColumn).toBe("created_at");
  });

  it("should resolve partitionInterval alias to interval", () => {
    const result = PartmanCreateParentSchema.parse({
      table: "events",
      controlColumn: "created_at",
      partitionInterval: "1 week",
    });
    expect(result.interval).toBe("1 week");
  });

  it("should not auto-prefix parentTable that already contains schema", () => {
    const result = PartmanCreateParentSchema.parse({
      parentTable: "analytics.events",
      controlColumn: "created_at",
      interval: "1 month",
    });
    expect(result.parentTable).toBe("analytics.events");
  });

  it("should pass deprecated interval keyword 'daily' through schema (handler validates)", () => {
    const result = PartmanCreateParentSchema.parse({
      table: "events",
      controlColumn: "created_at",
      interval: "daily",
    });
    expect(result.interval).toBe("daily");
  });

  it("should pass deprecated interval keyword 'monthly' through schema (handler validates)", () => {
    const result = PartmanCreateParentSchema.parse({
      table: "events",
      controlColumn: "created_at",
      interval: "monthly",
    });
    expect(result.interval).toBe("monthly");
  });
});

describe("PartmanUndoPartitionSchema", () => {
  it("should resolve target alias to targetTable", () => {
    const result = PartmanUndoPartitionSchema.parse({
      table: "events",
      target: "events_consolidated",
    });
    expect(result.targetTable).toBe("events_consolidated");
  });
});

describe("PartmanRetentionSchema", () => {
  it("should resolve keepTable alias to retentionKeepTable", () => {
    const result = PartmanRetentionSchema.parse({
      table: "events",
      retention: "30 days",
      keepTable: true,
    });
    expect(result.retentionKeepTable).toBe(true);
  });
});

describe("PartmanRunMaintenanceSchema", () => {
  it("should auto-prefix parentTable for maintenance", () => {
    const result = PartmanRunMaintenanceSchema.parse({
      table: "events",
    });
    expect(result.parentTable).toBe("public.events");
  });

  it("should accept empty input for all-tables maintenance", () => {
    const result = PartmanRunMaintenanceSchema.parse({});
    expect(result.parentTable).toBeUndefined();
  });
});

// =============================================================================
// Vector Schema Tests
// =============================================================================

import {
  VectorSearchSchema,
  VectorCreateIndexSchema,
  FiniteNumberArray,
} from "../vector.js";

describe("VectorSearchSchema", () => {
  it("should resolve tableName alias to table", () => {
    const result = VectorSearchSchema.parse({
      tableName: "embeddings",
      column: "vector",
      vector: [1.0, 2.0, 3.0],
    });
    expect(result.table).toBe("embeddings");
  });

  it("should resolve col alias to column", () => {
    const result = VectorSearchSchema.parse({
      table: "embeddings",
      col: "embedding",
      vector: [1.0, 2.0, 3.0],
    });
    expect(result.column).toBe("embedding");
  });

  it("should resolve filter alias to where", () => {
    const result = VectorSearchSchema.parse({
      table: "embeddings",
      column: "vector",
      vector: [1.0, 2.0, 3.0],
      filter: "active = true",
    });
    expect(result.where).toBe("active = true");
  });

  it("should parse schema.table format", () => {
    const result = VectorSearchSchema.parse({
      table: "ml.embeddings",
      column: "vector",
      vector: [1.0, 2.0, 3.0],
    });
    expect(result.table).toBe("embeddings");
    expect(result.schema).toBe("ml");
  });
});

describe("VectorCreateIndexSchema", () => {
  it("should resolve method alias to type", () => {
    const result = VectorCreateIndexSchema.parse({
      table: "embeddings",
      column: "vector",
      method: "hnsw",
    });
    expect(result.type).toBe("hnsw");
  });

  it("should resolve tableName and col aliases", () => {
    const result = VectorCreateIndexSchema.parse({
      tableName: "embeddings",
      col: "vector",
      type: "ivfflat",
    });
    expect(result.table).toBe("embeddings");
    expect(result.column).toBe("vector");
  });

  it("should throw when neither type nor method provided", () => {
    expect(() =>
      VectorCreateIndexSchema.parse({
        table: "embeddings",
        column: "vector",
      }),
    ).toThrow("type (or method alias) is required");
  });
});

describe("FiniteNumberArray", () => {
  it("should accept valid finite numbers", () => {
    const result = FiniteNumberArray.parse([1.0, 2.0, -3.0]);
    expect(result).toEqual([1.0, 2.0, -3.0]);
  });

  it("should reject arrays containing Infinity", () => {
    expect(() => FiniteNumberArray.parse([1.0, Infinity, 3.0])).toThrow(
      "expected number",
    );
  });

  it("should reject arrays containing NaN", () => {
    expect(() => FiniteNumberArray.parse([1.0, NaN, 3.0])).toThrow(
      "expected number",
    );
  });
});

// =============================================================================
// PostGIS Schema Tests
// =============================================================================

import {
  preprocessPostgisParams,
  preprocessPoint,
  convertToMeters,
  GeocodeSchema,
  GeometryColumnSchema,
  BufferSchema,
  GeoTransformSchema,
  GeometryTransformSchema,
  GeometryBufferSchema,
} from "../postgis/index.js";

describe("preprocessPostgisParams", () => {
  it("should pass through non-objects", () => {
    expect(preprocessPostgisParams(null)).toBe(null);
    expect(preprocessPostgisParams("string")).toBe("string");
  });

  it("should resolve tableName alias to table", () => {
    const result = preprocessPostgisParams({
      tableName: "locations",
    }) as Record<string, unknown>;
    expect(result.table).toBe("locations");
  });

  it("should parse schema.table format", () => {
    const result = preprocessPostgisParams({
      table: "geo.locations",
    }) as Record<string, unknown>;
    expect(result.table).toBe("locations");
    expect(result.schema).toBe("geo");
  });

  it("should not override explicit schema", () => {
    const result = preprocessPostgisParams({
      table: "geo.locations",
      schema: "explicit",
    }) as Record<string, unknown>;
    expect(result.schema).toBe("explicit");
  });
});

describe("preprocessPoint", () => {
  it("should resolve lat/lng", () => {
    const result = preprocessPoint({ lat: 40.7, lng: -74.0 });
    expect(result).toEqual({ lat: 40.7, lng: -74.0 });
  });

  it("should resolve latitude/longitude aliases", () => {
    const result = preprocessPoint({
      latitude: 40.7,
      longitude: -74.0,
    });
    expect(result).toEqual({ lat: 40.7, lng: -74.0 });
  });

  it("should resolve x/y aliases", () => {
    const result = preprocessPoint({ y: 40.7, x: -74.0 });
    expect(result).toEqual({ lat: 40.7, lng: -74.0 });
  });

  it("should resolve lon alias to lng", () => {
    const result = preprocessPoint({ lat: 40.7, lon: -74.0 });
    expect(result).toEqual({ lat: 40.7, lng: -74.0 });
  });

  it("should return undefined for non-objects", () => {
    expect(preprocessPoint(null)).toBeUndefined();
    expect(preprocessPoint("string")).toBeUndefined();
  });

  it("should return undefined when coordinates missing", () => {
    expect(preprocessPoint({ lat: 40.7 })).toBeUndefined();
  });

  it("should throw for out-of-range latitude", () => {
    expect(() => preprocessPoint({ lat: 91, lng: 0 })).toThrow(
      "Invalid latitude",
    );
  });

  it("should throw for out-of-range longitude", () => {
    expect(() => preprocessPoint({ lat: 0, lng: 181 })).toThrow(
      "Invalid longitude",
    );
  });

  it("should skip bounds validation when validateBounds is false", () => {
    const result = preprocessPoint({ lat: 91, lng: 181 }, false);
    expect(result).toEqual({ lat: 91, lng: 181 });
  });
});

describe("convertToMeters", () => {
  it("should return meters unchanged", () => {
    expect(convertToMeters(100, "meters")).toBe(100);
    expect(convertToMeters(100, "m")).toBe(100);
    expect(convertToMeters(100, undefined)).toBe(100);
  });

  it("should convert kilometers to meters", () => {
    expect(convertToMeters(1, "kilometers")).toBe(1000);
    expect(convertToMeters(1, "km")).toBe(1000);
  });

  it("should convert miles to meters", () => {
    expect(convertToMeters(1, "miles")).toBe(1609.344);
    expect(convertToMeters(1, "mi")).toBe(1609.344);
  });

  it("should return negative distances unchanged", () => {
    expect(convertToMeters(-100, "km")).toBe(-100);
  });

  it("should default to meters for unknown units", () => {
    expect(convertToMeters(100, "feet")).toBe(100);
  });
});

describe("GeocodeSchema", () => {
  it("should resolve latitude/longitude aliases", () => {
    const result = GeocodeSchema.parse({
      latitude: 40.7,
      longitude: -74.0,
    });
    expect(result.lat).toBe(40.7);
    expect(result.lng).toBe(-74.0);
  });

  it("should resolve lon alias to lng", () => {
    const result = GeocodeSchema.parse({ lat: 40.7, lon: -74.0 });
    expect(result.lng).toBe(-74.0);
  });

  it("should reject missing lat", () => {
    expect(() => GeocodeSchema.parse({ lng: -74.0 })).toThrow(
      "lat (or latitude alias) is required",
    );
  });

  it("should reject missing lng", () => {
    expect(() => GeocodeSchema.parse({ lat: 40.7 })).toThrow(
      "lng (or lon/longitude alias) is required",
    );
  });

  it("should reject out-of-range lat", () => {
    expect(() => GeocodeSchema.parse({ lat: 91, lng: 0 })).toThrow(
      "lat must be between -90 and 90",
    );
  });

  it("should reject out-of-range lng", () => {
    expect(() => GeocodeSchema.parse({ lat: 0, lng: 181 })).toThrow(
      "lng must be between -180 and 180",
    );
  });
});

describe("GeometryColumnSchema", () => {
  it("should reject missing table", () => {
    expect(() => GeometryColumnSchema.parse({ column: "geom" })).toThrow(
      "table (or tableName alias) is required",
    );
  });

  it("should reject missing column", () => {
    expect(() => GeometryColumnSchema.parse({ table: "locations" })).toThrow(
      "column (or geom/geometryColumn alias) is required",
    );
  });

  it("should resolve geom alias to column", () => {
    const result = GeometryColumnSchema.parse({
      table: "locations",
      geom: "the_geom",
    });
    expect(result.column).toBe("the_geom");
  });
});

describe("BufferSchema", () => {
  it("should resolve meters alias to distance", () => {
    const result = BufferSchema.parse({
      table: "locations",
      column: "geom",
      meters: 1000,
    });
    expect(result.distance).toBe(1000);
  });

  it("should resolve radius alias to distance", () => {
    const result = BufferSchema.parse({
      table: "locations",
      column: "geom",
      radius: 500,
    });
    expect(result.distance).toBe(500);
  });

  it("should reject zero distance", () => {
    expect(() =>
      BufferSchema.parse({
        table: "locations",
        column: "geom",
        distance: 0,
      }),
    ).toThrow("must be positive");
  });
});

describe("GeoTransformSchema", () => {
  it("should resolve sourceSrid alias", () => {
    const result = GeoTransformSchema.parse({
      table: "locations",
      column: "geom",
      sourceSrid: 4326,
      toSrid: 3857,
    });
    expect(result.fromSrid).toBe(4326);
  });

  it("should resolve targetSrid alias", () => {
    const result = GeoTransformSchema.parse({
      table: "locations",
      column: "geom",
      fromSrid: 4326,
      targetSrid: 3857,
    });
    expect(result.toSrid).toBe(3857);
  });

  it("should reject missing toSrid", () => {
    expect(() =>
      GeoTransformSchema.parse({
        table: "locations",
        column: "geom",
      }),
    ).toThrow("toSrid (or targetSrid alias) is required");
  });
});

describe("GeometryTransformSchema (standalone)", () => {
  it("should resolve wkt alias to geometry", () => {
    const result = GeometryTransformSchema.parse({
      wkt: "POINT(0 0)",
      fromSrid: 4326,
      toSrid: 3857,
    });
    expect(result.geometry).toBe("POINT(0 0)");
  });

  it("should resolve sourceSrid/targetSrid aliases", () => {
    const result = GeometryTransformSchema.parse({
      geometry: "POINT(0 0)",
      sourceSrid: 4326,
      targetSrid: 3857,
    });
    expect(result.fromSrid).toBe(4326);
    expect(result.toSrid).toBe(3857);
  });

  it("should reject missing geometry", () => {
    expect(() =>
      GeometryTransformSchema.parse({
        fromSrid: 4326,
        toSrid: 3857,
      }),
    ).toThrow("geometry (or wkt/geojson alias) is required");
  });

  it("should reject missing fromSrid", () => {
    expect(() =>
      GeometryTransformSchema.parse({
        geometry: "POINT(0 0)",
        toSrid: 3857,
      }),
    ).toThrow("fromSrid (or sourceSrid alias) is required");
  });
});

describe("GeometryBufferSchema (standalone)", () => {
  it("should resolve radius alias to distance", () => {
    const result = GeometryBufferSchema.parse({
      geometry: "POINT(0 0)",
      radius: 500,
    });
    expect(result.distance).toBe(500);
  });

  it("should resolve wkt alias to geometry", () => {
    const result = GeometryBufferSchema.parse({
      wkt: "POINT(0 0)",
      distance: 500,
    });
    expect(result.geometry).toBe("POINT(0 0)");
  });

  it("should reject missing geometry", () => {
    expect(() => GeometryBufferSchema.parse({ distance: 500 })).toThrow(
      "geometry (or wkt/geojson alias) is required",
    );
  });

  it("should reject zero distance", () => {
    expect(() =>
      GeometryBufferSchema.parse({
        geometry: "POINT(0 0)",
        distance: 0,
      }),
    ).toThrow("must be positive");
  });
});

// =============================================================================
// Cron Schema Tests
// =============================================================================

import {
  CronScheduleSchema,
  CronScheduleInDatabaseSchema,
  CronAlterJobSchema,
  CronUnscheduleSchema,
  CronCleanupHistorySchema,
} from "../cron.js";

describe("CronScheduleSchema (preprocessCronParams)", () => {
  it("should resolve sql alias to command", () => {
    const result = CronScheduleSchema.parse({
      schedule: "0 10 * * *",
      sql: "SELECT 1",
    });
    expect(result.command).toBe("SELECT 1");
  });

  it("should resolve query alias to command", () => {
    const result = CronScheduleSchema.parse({
      schedule: "0 10 * * *",
      query: "SELECT 1",
    });
    expect(result.command).toBe("SELECT 1");
  });

  it("should resolve name alias to jobName", () => {
    const result = CronScheduleSchema.parse({
      schedule: "0 10 * * *",
      command: "SELECT 1",
      name: "my_job",
    });
    expect(result.jobName).toBe("my_job");
  });

  it("should reject when no command/sql/query provided", () => {
    expect(() => CronScheduleSchema.parse({ schedule: "0 10 * * *" })).toThrow(
      "Either command, sql, or query must be provided",
    );
  });

  it("should accept valid interval schedule (30 seconds)", () => {
    const result = CronScheduleSchema.parse({
      schedule: "30 seconds",
      command: "SELECT 1",
    });
    expect(result.schedule).toBe("30 seconds");
  });

  it("should reject invalid interval (60 seconds)", () => {
    expect(() =>
      CronScheduleSchema.parse({
        schedule: "60 seconds",
        command: "SELECT 1",
      }),
    ).toThrow("1-59 seconds");
  });

  it("should reject invalid interval (0 seconds)", () => {
    expect(() =>
      CronScheduleSchema.parse({
        schedule: "0 seconds",
        command: "SELECT 1",
      }),
    ).toThrow("1-59 seconds");
  });
});

describe("CronScheduleInDatabaseSchema", () => {
  it("should resolve db alias to database", () => {
    const result = CronScheduleInDatabaseSchema.parse({
      name: "my_job",
      schedule: "0 10 * * *",
      command: "SELECT 1",
      db: "other_db",
    });
    expect(result.database).toBe("other_db");
  });

  it("should reject when no database/db provided", () => {
    expect(() =>
      CronScheduleInDatabaseSchema.parse({
        name: "my_job",
        schedule: "0 10 * * *",
        command: "SELECT 1",
      }),
    ).toThrow("Either database or db must be provided");
  });

  it("should reject when no jobName/name provided", () => {
    expect(() =>
      CronScheduleInDatabaseSchema.parse({
        schedule: "0 10 * * *",
        command: "SELECT 1",
        database: "other_db",
      }),
    ).toThrow("jobName (or name alias) is required");
  });
});

describe("CronAlterJobSchema", () => {
  it("should accept numeric string jobId via coercion", () => {
    const result = CronAlterJobSchema.parse({
      jobId: "123",
      active: false,
    });
    expect(result.jobId).toBe(123);
  });

  it("should reject invalid interval schedule", () => {
    expect(() =>
      CronAlterJobSchema.parse({
        jobId: 1,
        schedule: "60 seconds",
      }),
    ).toThrow("1-59 seconds");
  });

  it("should accept valid schedule change", () => {
    const result = CronAlterJobSchema.parse({
      jobId: 1,
      schedule: "30 seconds",
    });
    expect(result.schedule).toBe("30 seconds");
  });
});

describe("CronUnscheduleSchema", () => {
  it("should accept jobId", () => {
    const result = CronUnscheduleSchema.parse({ jobId: 1 });
    expect(result.jobId).toBe(1);
  });

  it("should accept jobName", () => {
    const result = CronUnscheduleSchema.parse({ jobName: "my_job" });
    expect(result.jobName).toBe("my_job");
  });

  it("should reject when neither jobId nor jobName provided", () => {
    expect(() => CronUnscheduleSchema.parse({})).toThrow(
      "Either jobId or jobName must be provided",
    );
  });

  it("should accept string jobId via coercion", () => {
    const result = CronUnscheduleSchema.parse({ jobId: "42" });
    expect(result.jobId).toBe(42);
  });
});

describe("CronCleanupHistorySchema", () => {
  it("should resolve days alias to olderThanDays", () => {
    const result = CronCleanupHistorySchema.parse({ days: 14 });
    expect(result.olderThanDays).toBe(14);
  });
});

// =============================================================================
// Stats Schema Tests
// =============================================================================

import {
  StatsDescriptiveSchema,
  StatsPercentilesSchema,
  StatsCorrelationSchema,
  StatsRegressionSchema,
  StatsTimeSeriesSchema,
  StatsDistributionSchema,
  StatsHypothesisSchema,
  StatsSamplingSchema,
} from "../stats/index.js";

describe("StatsDescriptiveSchema (preprocessBasicStatsParams)", () => {
  it("should resolve tableName alias to table", () => {
    const result = StatsDescriptiveSchema.parse({
      tableName: "sales",
      column: "amount",
    });
    expect(result.table).toBe("sales");
  });

  it("should resolve col alias to column", () => {
    const result = StatsDescriptiveSchema.parse({
      table: "sales",
      col: "amount",
    });
    expect(result.column).toBe("amount");
  });

  it("should resolve filter alias to where", () => {
    const result = StatsDescriptiveSchema.parse({
      table: "sales",
      column: "amount",
      filter: "active = true",
    });
    expect(result.where).toBe("active = true");
  });

  it("should parse schema.table format", () => {
    const result = StatsDescriptiveSchema.parse({
      table: "analytics.sales",
      column: "amount",
    });
    expect(result.table).toBe("sales");
    expect(result.schema).toBe("analytics");
  });
});

describe("StatsPercentilesSchema", () => {
  it("should normalize percentiles from 0-100 to 0-1", () => {
    const result = StatsPercentilesSchema.parse({
      table: "sales",
      column: "amount",
      percentiles: [25, 50, 75],
    });
    expect(result.percentiles).toEqual([0.25, 0.5, 0.75]);
  });

  it("should keep percentiles already in 0-1 format", () => {
    const result = StatsPercentilesSchema.parse({
      table: "sales",
      column: "amount",
      percentiles: [0.25, 0.5, 0.75],
    });
    expect(result.percentiles).toEqual([0.25, 0.5, 0.75]);
  });

  it("should replace empty percentiles array with defaults", () => {
    const result = StatsPercentilesSchema.parse({
      table: "sales",
      column: "amount",
      percentiles: [],
    });
    expect(result.percentiles).toEqual([0.25, 0.5, 0.75]);
  });

  it("should reject percentiles over 100", () => {
    expect(() =>
      StatsPercentilesSchema.parse({
        table: "sales",
        column: "amount",
        percentiles: [150],
      }),
    ).toThrow("All percentiles must be between 0 and 1");
  });

  it("should add warning for mixed percentile scales", () => {
    const result = StatsPercentilesSchema.parse({
      table: "sales",
      column: "amount",
      percentiles: [0.1, 50],
    });
    // Mixed scale: 0.1 is in 0-1 range, 50 is in 1-100 range
    // All get divided by 100 since max > 1
    expect(result.percentiles).toEqual([0.001, 0.5]);
    expect(result._percentileScaleWarning).toContain("Mixed percentile");
  });
});

describe("StatsCorrelationSchema (preprocessCorrelationParams)", () => {
  it("should resolve x/y aliases to column1/column2", () => {
    const result = StatsCorrelationSchema.parse({
      table: "sales",
      x: "quantity",
      y: "revenue",
    });
    expect(result.column1).toBe("quantity");
    expect(result.column2).toBe("revenue");
  });

  it("should resolve col1/col2 aliases", () => {
    const result = StatsCorrelationSchema.parse({
      table: "sales",
      col1: "quantity",
      col2: "revenue",
    });
    expect(result.column1).toBe("quantity");
    expect(result.column2).toBe("revenue");
  });

  it("should resolve filter alias to where", () => {
    const result = StatsCorrelationSchema.parse({
      table: "sales",
      column1: "quantity",
      column2: "revenue",
      filter: "active = true",
    });
    expect(result.where).toBe("active = true");
  });

  it("should parse schema.table format", () => {
    const result = StatsCorrelationSchema.parse({
      table: "analytics.sales",
      column1: "quantity",
      column2: "revenue",
    });
    expect(result.table).toBe("sales");
    expect(result.schema).toBe("analytics");
  });

  it("should reject missing column1", () => {
    expect(() =>
      StatsCorrelationSchema.parse({
        table: "sales",
        column2: "revenue",
      }),
    ).toThrow("column1 (or alias 'x') is required");
  });

  it("should reject missing column2", () => {
    expect(() =>
      StatsCorrelationSchema.parse({
        table: "sales",
        column1: "quantity",
      }),
    ).toThrow("column2 (or alias 'y') is required");
  });
});

describe("StatsRegressionSchema (preprocessRegressionParams)", () => {
  it("should resolve x/y aliases to xColumn/yColumn", () => {
    const result = StatsRegressionSchema.parse({
      table: "sales",
      x: "quantity",
      y: "revenue",
    });
    expect(result.xColumn).toBe("quantity");
    expect(result.yColumn).toBe("revenue");
  });

  it("should resolve column1/column2 aliases", () => {
    const result = StatsRegressionSchema.parse({
      table: "sales",
      column1: "quantity",
      column2: "revenue",
    });
    expect(result.xColumn).toBe("quantity");
    expect(result.yColumn).toBe("revenue");
  });

  it("should resolve filter alias to where", () => {
    const result = StatsRegressionSchema.parse({
      table: "sales",
      xColumn: "quantity",
      yColumn: "revenue",
      filter: "active = true",
    });
    expect(result.where).toBe("active = true");
  });

  it("should reject missing xColumn", () => {
    expect(() =>
      StatsRegressionSchema.parse({
        table: "sales",
        yColumn: "revenue",
      }),
    ).toThrow("xColumn (or alias 'x' or 'column1') is required");
  });

  it("should reject missing yColumn", () => {
    expect(() =>
      StatsRegressionSchema.parse({
        table: "sales",
        xColumn: "quantity",
      }),
    ).toThrow("yColumn (or alias 'y' or 'column2') is required");
  });
});

describe("StatsTimeSeriesSchema (preprocessTimeSeriesParams)", () => {
  it("should resolve column alias to valueColumn", () => {
    const result = StatsTimeSeriesSchema.parse({
      table: "sales",
      column: "amount",
      timeColumn: "created_at",
    });
    expect(result.valueColumn).toBe("amount");
  });

  it("should resolve value alias to valueColumn", () => {
    const result = StatsTimeSeriesSchema.parse({
      table: "sales",
      value: "amount",
      timeColumn: "created_at",
    });
    expect(result.valueColumn).toBe("amount");
  });

  it("should resolve time alias to timeColumn", () => {
    const result = StatsTimeSeriesSchema.parse({
      table: "sales",
      valueColumn: "amount",
      time: "created_at",
    });
    expect(result.timeColumn).toBe("created_at");
  });

  it("should resolve bucket alias to interval", () => {
    const result = StatsTimeSeriesSchema.parse({
      table: "sales",
      valueColumn: "amount",
      timeColumn: "created_at",
      bucket: "hour",
    });
    expect(result.interval).toBe("hour");
  });

  it("should convert interval shorthands (daily → day)", () => {
    const result = StatsTimeSeriesSchema.parse({
      table: "sales",
      valueColumn: "amount",
      timeColumn: "created_at",
      interval: "daily",
    });
    expect(result.interval).toBe("day");
  });

  it("should convert interval shorthands (hourly → hour)", () => {
    const result = StatsTimeSeriesSchema.parse({
      table: "sales",
      valueColumn: "amount",
      timeColumn: "created_at",
      interval: "hourly",
    });
    expect(result.interval).toBe("hour");
  });

  it("should extract unit from PostgreSQL-style interval (1 day)", () => {
    const result = StatsTimeSeriesSchema.parse({
      table: "sales",
      valueColumn: "amount",
      timeColumn: "created_at",
      interval: "1 day",
    });
    expect(result.interval).toBe("day");
  });

  it("should handle plural form (days → day)", () => {
    const result = StatsTimeSeriesSchema.parse({
      table: "sales",
      valueColumn: "amount",
      timeColumn: "created_at",
      interval: "days",
    });
    expect(result.interval).toBe("day");
  });

  it("should default interval to 'day' when not provided", () => {
    const result = StatsTimeSeriesSchema.parse({
      table: "sales",
      valueColumn: "amount",
      timeColumn: "created_at",
    });
    expect(result.interval).toBe("day");
  });

  it("should reject missing valueColumn", () => {
    expect(() =>
      StatsTimeSeriesSchema.parse({
        table: "sales",
        timeColumn: "created_at",
      }),
    ).toThrow("valueColumn (or alias 'value') is required");
  });

  it("should reject missing timeColumn", () => {
    expect(() =>
      StatsTimeSeriesSchema.parse({
        table: "sales",
        valueColumn: "amount",
      }),
    ).toThrow("timeColumn (or alias 'time') is required");
  });
});

describe("StatsHypothesisSchema (preprocessHypothesisParams)", () => {
  it("should normalize 'ttest' to 't_test'", () => {
    const result = StatsHypothesisSchema.parse({
      table: "sales",
      column: "amount",
      testType: "ttest",
    });
    expect(result.testType).toBe("t_test");
  });

  it("should normalize 't-test' to 't_test'", () => {
    const result = StatsHypothesisSchema.parse({
      table: "sales",
      column: "amount",
      testType: "t-test",
    });
    expect(result.testType).toBe("t_test");
  });

  it("should normalize 't' to 't_test'", () => {
    const result = StatsHypothesisSchema.parse({
      table: "sales",
      column: "amount",
      testType: "t",
    });
    expect(result.testType).toBe("t_test");
  });

  it("should normalize 'ztest' to 'z_test'", () => {
    const result = StatsHypothesisSchema.parse({
      table: "sales",
      column: "amount",
      testType: "ztest",
    });
    expect(result.testType).toBe("z_test");
  });

  it("should normalize 'z' to 'z_test'", () => {
    const result = StatsHypothesisSchema.parse({
      table: "sales",
      column: "amount",
      testType: "z",
    });
    expect(result.testType).toBe("z_test");
  });

  it("should default testType to 't_test' when not provided", () => {
    const result = StatsHypothesisSchema.parse({
      table: "sales",
      column: "amount",
    });
    expect(result.testType).toBe("t_test");
  });

  it("should auto-detect z_test when populationStdDev is provided", () => {
    const result = StatsHypothesisSchema.parse({
      table: "sales",
      column: "amount",
      populationStdDev: 10,
    });
    expect(result.testType).toBe("z_test");
  });

  it("should auto-detect z_test when sigma alias is provided", () => {
    const result = StatsHypothesisSchema.parse({
      table: "sales",
      column: "amount",
      sigma: 10,
    });
    expect(result.testType).toBe("z_test");
    expect(result.populationStdDev).toBe(10);
  });

  it("should resolve mean alias to hypothesizedMean", () => {
    const result = StatsHypothesisSchema.parse({
      table: "sales",
      column: "amount",
      mean: 50,
    });
    expect(result.hypothesizedMean).toBe(50);
  });

  it("should resolve expected alias to hypothesizedMean", () => {
    const result = StatsHypothesisSchema.parse({
      table: "sales",
      column: "amount",
      expected: 100,
    });
    expect(result.hypothesizedMean).toBe(100);
  });

  it("should resolve col alias to column", () => {
    const result = StatsHypothesisSchema.parse({
      table: "sales",
      col: "amount",
    });
    expect(result.column).toBe("amount");
  });

  it("should reject negative populationStdDev", () => {
    expect(() =>
      StatsHypothesisSchema.parse({
        table: "sales",
        column: "amount",
        testType: "z_test",
        populationStdDev: -1,
      }),
    ).toThrow("populationStdDev must be greater than 0");
  });
});

describe("StatsDistributionSchema (preprocessDistributionParams)", () => {
  it("should resolve tableName alias to table", () => {
    const result = StatsDistributionSchema.parse({
      tableName: "sales",
      column: "amount",
    });
    expect(result.table).toBe("sales");
  });

  it("should resolve col alias to column", () => {
    const result = StatsDistributionSchema.parse({
      table: "sales",
      col: "amount",
    });
    expect(result.column).toBe("amount");
  });

  it("should resolve filter alias to where", () => {
    const result = StatsDistributionSchema.parse({
      table: "sales",
      column: "amount",
      filter: "active = true",
    });
    expect(result.where).toBe("active = true");
  });

  it("should reject buckets <= 0", () => {
    expect(() =>
      StatsDistributionSchema.parse({
        table: "sales",
        column: "amount",
        buckets: 0,
      }),
    ).toThrow("buckets must be greater than 0");
  });
});

describe("StatsSamplingSchema (preprocessSamplingParams)", () => {
  it("should resolve tableName alias to table", () => {
    const result = StatsSamplingSchema.parse({
      tableName: "sales",
    });
    expect(result.table).toBe("sales");
  });

  it("should resolve columns alias to select", () => {
    const result = StatsSamplingSchema.parse({
      table: "sales",
      columns: ["id", "name"],
    });
    expect(result.select).toEqual(["id", "name"]);
  });

  it("should resolve filter alias to where", () => {
    const result = StatsSamplingSchema.parse({
      table: "sales",
      filter: "active = true",
    });
    expect(result.where).toBe("active = true");
  });

  it("should reject sampleSize <= 0", () => {
    expect(() =>
      StatsSamplingSchema.parse({
        table: "sales",
        sampleSize: 0,
      }),
    ).toThrow("sampleSize must be greater than 0");
  });

  it("should reject percentage > 100", () => {
    expect(() =>
      StatsSamplingSchema.parse({
        table: "sales",
        method: "bernoulli",
        percentage: 101,
      }),
    ).toThrow("percentage must be between 0 and 100");
  });
});

// =============================================================================
// Schema Management Tests
// =============================================================================

import {
  CreateSequenceSchema,
  CreateViewSchema,
  DropSequenceSchema,
  DropViewSchema,
} from "../schema-mgmt.js";

describe("CreateSequenceSchema", () => {
  it("should resolve sequenceName alias to name", () => {
    const result = CreateSequenceSchema.parse({
      sequenceName: "order_id_seq",
    });
    expect(result.name).toBe("order_id_seq");
  });

  it("should parse schema.name format", () => {
    const result = CreateSequenceSchema.parse({
      name: "sales.order_id_seq",
    });
    expect(result.name).toBe("order_id_seq");
    expect(result.schema).toBe("sales");
  });

  it("should reject missing name", () => {
    expect(() => CreateSequenceSchema.parse({})).toThrow(
      "name (or sequenceName alias) is required",
    );
  });

  it("should not parse schema.name if schema already set", () => {
    const result = CreateSequenceSchema.parse({
      name: "sales.order_id_seq",
      schema: "explicit",
    });
    // When schema is explicit, schema.name parsing is skipped
    expect(result.schema).toBe("explicit");
  });
});

describe("CreateViewSchema", () => {
  it("should resolve viewName alias to name", () => {
    const result = CreateViewSchema.parse({
      viewName: "active_users",
      query: "SELECT * FROM users WHERE active",
    });
    expect(result.name).toBe("active_users");
  });

  it("should resolve sql alias to query", () => {
    const result = CreateViewSchema.parse({
      name: "active_users",
      sql: "SELECT * FROM users WHERE active",
    });
    expect(result.query).toBe("SELECT * FROM users WHERE active");
  });

  it("should resolve definition alias to query", () => {
    const result = CreateViewSchema.parse({
      name: "active_users",
      definition: "SELECT * FROM users WHERE active",
    });
    expect(result.query).toBe("SELECT * FROM users WHERE active");
  });

  it("should parse schema.name format", () => {
    const result = CreateViewSchema.parse({
      name: "reports.active_users",
      query: "SELECT * FROM users",
    });
    expect(result.name).toBe("active_users");
    expect(result.schema).toBe("reports");
  });

  it("should reject missing name", () => {
    expect(() => CreateViewSchema.parse({ query: "SELECT 1" })).toThrow(
      "name (or viewName alias) is required",
    );
  });

  it("should reject missing query", () => {
    expect(() => CreateViewSchema.parse({ name: "test_view" })).toThrow(
      "query (or sql/definition alias) is required",
    );
  });
});

describe("DropSequenceSchema", () => {
  it("should parse schema.name format", () => {
    const result = DropSequenceSchema.parse({
      name: "sales.order_id_seq",
    });
    expect(result.name).toBe("order_id_seq");
    expect(result.schema).toBe("sales");
  });

  it("should not parse schema.name if schema already set", () => {
    const result = DropSequenceSchema.parse({
      name: "sales.order_id_seq",
      schema: "explicit",
    });
    expect(result.schema).toBe("explicit");
  });
});

describe("DropViewSchema", () => {
  it("should parse schema.name format", () => {
    const result = DropViewSchema.parse({
      name: "reports.active_users",
    });
    expect(result.name).toBe("active_users");
    expect(result.schema).toBe("reports");
  });

  it("should not parse schema.name if schema already set", () => {
    const result = DropViewSchema.parse({
      name: "reports.view",
      schema: "explicit",
    });
    expect(result.schema).toBe("explicit");
  });
});

// =============================================================================
// Stats Schema Tests
// =============================================================================

import {
  StatsRegressionSchema,
  StatsTimeSeriesSchema,
  StatsHypothesisSchema,
  StatsDistributionSchema,
  StatsSamplingSchema,
  StatsPercentilesSchema,
  StatsCorrelationSchema,
} from "../stats/index.js";

describe("StatsRegressionSchema", () => {
  it("should resolve tableName alias", () => {
    const result = StatsRegressionSchema.parse({
      tableName: "metrics",
      x: "time",
      y: "value",
    });
    expect(result.table).toBe("metrics");
    expect(result.xColumn).toBe("time");
    expect(result.yColumn).toBe("value");
  });

  it("should resolve column1/column2 to xColumn/yColumn", () => {
    const result = StatsRegressionSchema.parse({
      table: "data",
      column1: "x_col",
      column2: "y_col",
    });
    expect(result.xColumn).toBe("x_col");
    expect(result.yColumn).toBe("y_col");
  });

  it("should parse schema.table format", () => {
    const result = StatsRegressionSchema.parse({
      table: "analytics.metrics",
      x: "time",
      y: "value",
    });
    expect(result.table).toBe("metrics");
    expect(result.schema).toBe("analytics");
  });

  it("should resolve filter alias to where", () => {
    const result = StatsRegressionSchema.parse({
      table: "data",
      x: "a",
      y: "b",
      filter: "active = true",
    });
    expect(result.where).toBe("active = true");
  });
});

describe("StatsTimeSeriesSchema", () => {
  it("should resolve tableName/column/time aliases", () => {
    const result = StatsTimeSeriesSchema.parse({
      tableName: "events",
      column: "revenue",
      time: "created_at",
    });
    expect(result.table).toBe("events");
    expect(result.valueColumn).toBe("revenue");
    expect(result.timeColumn).toBe("created_at");
  });

  it("should resolve value and bucket aliases", () => {
    const result = StatsTimeSeriesSchema.parse({
      table: "events",
      value: "amount",
      time: "ts",
      bucket: "hour",
    });
    expect(result.valueColumn).toBe("amount");
    expect(result.interval).toBe("hour");
  });

  it("should normalize PostgreSQL-style intervals", () => {
    const result = StatsTimeSeriesSchema.parse({
      table: "events",
      valueColumn: "count",
      timeColumn: "ts",
      interval: "2 hours",
    });
    expect(result.interval).toBe("hour");
  });

  it("should handle shorthand intervals (daily, hourly)", () => {
    const result = StatsTimeSeriesSchema.parse({
      table: "events",
      valueColumn: "count",
      timeColumn: "ts",
      interval: "daily",
    });
    expect(result.interval).toBe("day");
  });

  it("should default interval to day", () => {
    const result = StatsTimeSeriesSchema.parse({
      table: "events",
      valueColumn: "count",
      timeColumn: "ts",
    });
    expect(result.interval).toBe("day");
  });

  it("should parse schema.table format", () => {
    const result = StatsTimeSeriesSchema.parse({
      table: "analytics.events",
      valueColumn: "v",
      timeColumn: "t",
    });
    expect(result.table).toBe("events");
    expect(result.schema).toBe("analytics");
  });

  it("should resolve filter alias", () => {
    const result = StatsTimeSeriesSchema.parse({
      table: "events",
      valueColumn: "v",
      timeColumn: "t",
      filter: "region = 'US'",
    });
    expect(result.where).toBe("region = 'US'");
  });
});

describe("StatsHypothesisSchema", () => {
  it("should resolve tableName and col aliases", () => {
    const result = StatsHypothesisSchema.parse({
      tableName: "measurements",
      col: "weight",
    });
    expect(result.table).toBe("measurements");
    expect(result.column).toBe("weight");
    expect(result.testType).toBe("t_test");
  });

  it("should normalize testType variants (ttest → t_test)", () => {
    const result = StatsHypothesisSchema.parse({
      table: "data",
      column: "val",
      testType: "ttest",
    });
    expect(result.testType).toBe("t_test");
  });

  it("should normalize z_test variants", () => {
    const result = StatsHypothesisSchema.parse({
      table: "data",
      column: "val",
      testType: "z-test",
    });
    expect(result.testType).toBe("z_test");
  });

  it("should auto-detect z_test when populationStdDev is provided", () => {
    const result = StatsHypothesisSchema.parse({
      table: "data",
      column: "val",
      populationStdDev: 5,
    });
    expect(result.testType).toBe("z_test");
  });

  it("should parse schema.table format", () => {
    const result = StatsHypothesisSchema.parse({
      table: "science.measurements",
      column: "val",
    });
    expect(result.table).toBe("measurements");
    expect(result.schema).toBe("science");
  });

  it("should resolve filter alias", () => {
    const result = StatsHypothesisSchema.parse({
      table: "data",
      column: "val",
      filter: "active = true",
    });
    expect(result.where).toBe("active = true");
  });
});

describe("StatsDistributionSchema", () => {
  it("should resolve tableName and col aliases", () => {
    const result = StatsDistributionSchema.parse({
      tableName: "data",
      col: "value",
    });
    expect(result.table).toBe("data");
    expect(result.column).toBe("value");
  });

  it("should resolve filter alias", () => {
    const result = StatsDistributionSchema.parse({
      table: "data",
      column: "val",
      filter: "x > 0",
    });
    expect(result.where).toBe("x > 0");
  });

  it("should parse schema.table format", () => {
    const result = StatsDistributionSchema.parse({
      table: "analytics.data",
      column: "value",
    });
    expect(result.table).toBe("data");
    expect(result.schema).toBe("analytics");
  });
});

describe("StatsSamplingSchema", () => {
  it("should resolve tableName and columns aliases", () => {
    const result = StatsSamplingSchema.parse({
      tableName: "users",
      columns: ["id", "name"],
    });
    expect(result.table).toBe("users");
    expect(result.select).toEqual(["id", "name"]);
  });

  it("should resolve filter alias", () => {
    const result = StatsSamplingSchema.parse({
      table: "users",
      filter: "active = true",
    });
    expect(result.where).toBe("active = true");
  });

  it("should parse schema.table format", () => {
    const result = StatsSamplingSchema.parse({
      table: "app.users",
    });
    expect(result.table).toBe("users");
    expect(result.schema).toBe("app");
  });
});

describe("StatsPercentilesSchema", () => {
  it("should normalize 0-100 percentiles to 0-1", () => {
    const result = StatsPercentilesSchema.parse({
      table: "data",
      column: "val",
      percentiles: [25, 50, 75],
    });
    expect(result.percentiles).toEqual([0.25, 0.5, 0.75]);
  });

  it("should default empty percentiles array", () => {
    const result = StatsPercentilesSchema.parse({
      table: "data",
      column: "val",
      percentiles: [],
    });
    expect(result.percentiles).toEqual([0.25, 0.5, 0.75]);
  });

  it("should warn about mixed percentile scales", () => {
    const result = StatsPercentilesSchema.parse({
      table: "data",
      column: "val",
      percentiles: [0.1, 50],
    });
    // Mixed scales: 0.1 looks like 0-1, 50 looks like 0-100
    // All get divided by 100 since max > 1
    expect(result.percentiles).toEqual([0.001, 0.5]);
  });
});

describe("StatsCorrelationSchema", () => {
  it("should resolve x/y aliases to column1/column2", () => {
    const result = StatsCorrelationSchema.parse({
      table: "data",
      x: "height",
      y: "weight",
    });
    expect(result.column1).toBe("height");
    expect(result.column2).toBe("weight");
  });

  it("should resolve col1/col2 aliases", () => {
    const result = StatsCorrelationSchema.parse({
      table: "data",
      col1: "a",
      col2: "b",
    });
    expect(result.column1).toBe("a");
    expect(result.column2).toBe("b");
  });

  it("should resolve tableName alias", () => {
    const result = StatsCorrelationSchema.parse({
      tableName: "metrics",
      column1: "x",
      column2: "y",
    });
    expect(result.table).toBe("metrics");
  });

  it("should parse schema.table format", () => {
    const result = StatsCorrelationSchema.parse({
      table: "analytics.metrics",
      column1: "x",
      column2: "y",
    });
    expect(result.table).toBe("metrics");
    expect(result.schema).toBe("analytics");
  });

  it("should resolve filter alias", () => {
    const result = StatsCorrelationSchema.parse({
      table: "data",
      column1: "a",
      column2: "b",
      filter: "active = true",
    });
    expect(result.where).toBe("active = true");
  });
});

// =============================================================================
// Core Schemas - ListObjectsSchema & ObjectDetailsSchema preprocess tests
// =============================================================================

import {
  ListObjectsSchema,
  ObjectDetailsSchema,
} from "../../tools/core/schemas.js";

describe("ListObjectsSchema preprocess", () => {
  it("should convert type array alias to types", () => {
    const result = ListObjectsSchema.parse({
      type: ["table", "view"],
    });
    expect(result.types).toEqual(["table", "view"]);
  });

  it("should wrap types string in array", () => {
    const result = ListObjectsSchema.parse({
      types: "table",
    });
    expect(result.types).toEqual(["table"]);
  });
});

describe("ObjectDetailsSchema preprocess", () => {
  it("should resolve object alias to name", () => {
    const result = ObjectDetailsSchema.parse({
      object: "users",
    });
    expect(result.name).toBe("users");
  });

  it("should resolve objectName alias to name", () => {
    const result = ObjectDetailsSchema.parse({
      objectName: "orders",
    });
    expect(result.name).toBe("orders");
  });

  it("should normalize objectType to lowercase", () => {
    const result = ObjectDetailsSchema.parse({
      name: "users",
      objectType: "TABLE",
    });
    expect(result.type).toBe("table");
  });
});

// =============================================================================
// Utility Validators - fts-config and where-clause
// =============================================================================

import {
  validateFtsConfig,
  InvalidFtsConfigError,
} from "../../../../utils/fts-config.js";
import {
  validateWhereClause,
  UnsafeWhereClauseError,
} from "../../../../utils/where-clause.js";

describe("validateFtsConfig edge cases", () => {
  it("should throw for empty/falsy config", () => {
    expect(() => validateFtsConfig("")).toThrow(InvalidFtsConfigError);
  });

  it("should throw for config exceeding max length", () => {
    const longConfig = "a".repeat(64);
    expect(() => validateFtsConfig(longConfig)).toThrow(InvalidFtsConfigError);
  });
});

describe("validateWhereClause edge cases", () => {
  it("should throw for empty/falsy where clause", () => {
    expect(() => validateWhereClause("")).toThrow(UnsafeWhereClauseError);
  });
});
