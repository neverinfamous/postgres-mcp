/**
 * postgres-mcp - PostGIS Schema Utilities
 *
 * Preprocessing, coordinate validation, and unit conversion helpers
 * for geospatial operations.
 */

import { z } from "zod";
import { coerceNumber } from "../../../../utils/query-helpers.js";
import { ValidationError } from "../../../../types/errors.js";

/**
 * Preprocess PostGIS parameters:
 * - Alias: tableName -> table
 * - Parse schema.table format
 * Exported for use in tool files with inline schemas.
 */
export function preprocessPostgisParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  const result = { ...(input as Record<string, unknown>) };

  // Alias: tableName -> table
  if (result["tableName"] !== undefined && result["table"] === undefined) {
    result["table"] = result["tableName"];
  }

  // Parse schema.table format
  if (
    typeof result["table"] === "string" &&
    result["table"].includes(".") &&
    result["schema"] === undefined
  ) {
    const parts = result["table"].split(".");
    if (parts.length === 2) {
      result["schema"] = parts[0];
      result["table"] = parts[1];
    }
  }

  // Assemble flat lat/lng into point object for code mode compatibility
  // Supports the same aliases as preprocessPoint: lat/latitude/y, lng/lon/longitude/x
  if (
    result["point"] === undefined ||
    (typeof result["point"] === "object" &&
      result["point"] !== null &&
      Object.keys(result["point"] as Record<string, unknown>).length === 0)
  ) {
    const lat = result["lat"] ?? result["latitude"] ?? result["y"];
    const lng =
      result["lng"] ?? result["lon"] ?? result["longitude"] ?? result["x"];
    if (lat !== undefined || lng !== undefined) {
      result["point"] = { lat, lng };
      // Clean up flat keys to prevent schema noise
      delete result["lat"];
      delete result["latitude"];
      delete result["y"];
      delete result["lng"];
      delete result["lon"];
      delete result["longitude"];
      delete result["x"];
    }
  }

  return result;
}

/**
 * Preprocess point object to support aliases:
 * - lon/longitude -> lng
 * - latitude -> lat
 * - x/y -> lng/lat
 *
 * Also validates coordinate bounds when validateBounds is true (default).
 * Throws ZodError-compatible error for consistency with schema validation.
 */
export function preprocessPoint(
  point: unknown,
  validateBounds = true,
): { lat: number; lng: number } | undefined {
  if (typeof point !== "object" || point === null) {
    return undefined;
  }
  const p = point as Record<string, unknown>;

  // Resolve lat aliases
  const lat = (p["lat"] ?? p["latitude"] ?? p["y"]) as number | undefined;
  // Resolve lng aliases
  const lng = (p["lng"] ?? p["lon"] ?? p["longitude"] ?? p["x"]) as
    | number
    | undefined;

  if (lat !== undefined && lng !== undefined) {
    // Validate coordinate bounds for consistency with pg_geocode
    if (validateBounds) {
      if (lat < -90 || lat > 90) {
        throw new ValidationError(
          `Invalid latitude ${String(lat)}: must be between -90 and 90 degrees`,
        );
      }
      if (lng < -180 || lng > 180) {
        throw new ValidationError(
          `Invalid longitude ${String(lng)}: must be between -180 and 180 degrees`,
        );
      }
    }
    return { lat, lng };
  }
  return undefined;
}

/**
 * Convert distance to meters based on unit
 */
export function convertToMeters(distance: number, unit?: string): number {
  if (distance < 0) {
    return distance; // Let validation catch negatives
  }
  if (unit === undefined || unit === "meters" || unit === "m") {
    return distance;
  }
  const u = unit.toLowerCase();
  if (u === "kilometers" || u === "km") {
    return distance * 1000;
  }
  if (u === "miles" || u === "mi") {
    return distance * 1609.344;
  }
  // Default to meters for unknown units
  return distance;
}

// =============================================================================
// Point schema (reused across multiple tools)
// =============================================================================
export const PointSchemaBase = z.object({
  lat: z.preprocess(coerceNumber, z.number().optional()).optional(),
  latitude: z.preprocess(coerceNumber, z.number().optional()).optional(),
  y: z.preprocess(coerceNumber, z.number().optional()).optional(),
  lng: z.preprocess(coerceNumber, z.number().optional()).optional(),
  lon: z.preprocess(coerceNumber, z.number().optional()).optional(),
  longitude: z.preprocess(coerceNumber, z.number().optional()).optional(),
  x: z.preprocess(coerceNumber, z.number().optional()).optional(),
});

