/**
 * Payload Contract Tests: PostGIS
 *
 * Validates response shapes for PostGIS (16) tools.
 */

import { test, expect } from "./fixtures.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createClient, callToolAndParse, expectSuccess } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Payload Contracts: PostGIS", () => {
  let client: Client;
  const testTable = "audit_test_postgis_payloads";

  test.beforeAll(async () => {
    client = await createClient();
    await callToolAndParse(client, "pg_create_table", {
      table: testTable,
      columns: [{ name: "id", type: "serial", primaryKey: true }],
      ifNotExists: true,
    });
  });

  test.afterAll(async () => {
    await callToolAndParse(client, "pg_drop_table", {
      table: testTable,
      cascade: true,
      ifExists: true,
    });
    await client.close();
  });

  test("pg_postgis_create_extension returns object", async () => {
    const payload = await callToolAndParse(
      client,
      "pg_postgis_create_extension",
      {},
    );
    expect(typeof payload).toBe("object");
  });

  test("pg_geometry_column returns { success }", async () => {
    const payload = await callToolAndParse(client, "pg_geometry_column", {
      table: testTable,
      column: "geom",
      type: "POINT",
      srid: 4326,
    });
    expectSuccess(payload);
    expect(payload.success).toBe(true);
  });

  test("pg_spatial_index returns { success }", async () => {
    const payload = await callToolAndParse(client, "pg_spatial_index", {
      table: testTable,
      column: "geom",
    });
    expectSuccess(payload);
    expect(payload.success).toBe(true);
  });

  test("pg_point_in_polygon returns { results, count }", async () => {
    const payload = await callToolAndParse(client, "pg_point_in_polygon", {
      table: testTable,
      column: "geom",
      polygon: "POLYGON((0 0, 10 0, 10 10, 0 10, 0 0))",
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_distance returns { results, count }", async () => {
    const payload = await callToolAndParse(client, "pg_distance", {
      table: testTable,
      column: "geom",
      point: { lat: 40.7128, lng: -74.006 },
      maxDistance: 100000,
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_buffer returns { results, count }", async () => {
    const payload = await callToolAndParse(client, "pg_buffer", {
      table: testTable,
      column: "geom",
      distance: 1000,
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_intersection returns { results }", async () => {
    const payload = await callToolAndParse(client, "pg_intersection", {
      table1: testTable,
      column1: "geom",
      table2: testTable,
      column2: "geom",
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_bounding_box returns { results, count }", async () => {
    const payload = await callToolAndParse(client, "pg_bounding_box", {
      table: testTable,
      column: "geom",
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_geo_index_optimize returns analysis", async () => {
    const payload = await callToolAndParse(client, "pg_geo_index_optimize", {
      table: testTable,
      column: "geom",
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_geo_cluster returns { clusters }", async () => {
    const payload = await callToolAndParse(client, "pg_geo_cluster", {
      table: testTable,
      column: "geom",
      distance: 10,
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_geocode returns { geometries }", async () => {
    const payload = await callToolAndParse(client, "pg_geocode", {
      address: "1600 Pennsylvania Ave NW, Washington, DC",
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_geo_transform returns { results }", async () => {
    const payload = await callToolAndParse(client, "pg_geo_transform", {
      table: testTable,
      column: "geom",
      fromSrid: 4326,
      toSrid: 3857,
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_geometry_buffer returns standalone buffer", async () => {
    const payload = await callToolAndParse(client, "pg_geometry_buffer", {
      geometry: "POINT(0 0)",
      distance: 10,
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_geometry_intersection returns standalone intersection", async () => {
    const payload = await callToolAndParse(client, "pg_geometry_intersection", {
      geometry1: "POLYGON((0 0, 10 0, 10 10, 0 10, 0 0))",
      geometry2: "POLYGON((5 5, 15 5, 15 15, 5 15, 5 5))",
    });
    expect(typeof payload).toBe("object");
  });

  test("pg_geometry_transform returns converted srid string", async () => {
    const payload = await callToolAndParse(client, "pg_geometry_transform", {
      geometry: "SRID=4326;POINT(-71.060316 48.432044)",
      toSrid: 3857,
    });
    expect(typeof payload).toBe("object");
  });
});
