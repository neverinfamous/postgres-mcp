/**
 * PostgreSQL PostGIS Extension Tools
 *
 * Geospatial operations and spatial queries.
 * 15 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

// Setup & DDL tools
import {
  createPostgisExtensionTool,
  createGeometryColumnTool,
  createSpatialIndexTool,
} from "./setup.js";

// Spatial query tools
import {
  createPointInPolygonTool,
  createDistanceTool,
  createBufferTool,
  createIntersectionTool,
  createBoundingBoxTool,
} from "./query.js";

// Advanced coordinate operations
import {
  createGeocodeTool,
  createGeoTransformTool,
} from "./advanced.js";

// Spatial analysis operations
import {
  createGeoIndexOptimizeTool,
  createGeoClusterTool,
} from "./spatial-analysis.js";

// Standalone geometry operations (WKT/GeoJSON input)
import {
  createGeometryBufferTool,
  createGeometryIntersectionTool,
  createGeometryTransformTool,
} from "./standalone.js";

/**
 * Get all PostGIS tools
 */
export function getPostgisTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    // Basic table-based tools
    createPostgisExtensionTool(adapter),
    createGeometryColumnTool(adapter),
    createPointInPolygonTool(adapter),
    createDistanceTool(adapter),
    createBufferTool(adapter),
    createIntersectionTool(adapter),
    createBoundingBoxTool(adapter),
    createSpatialIndexTool(adapter),
    // Advanced table-based tools
    createGeocodeTool(adapter),
    createGeoTransformTool(adapter),
    createGeoIndexOptimizeTool(adapter),
    createGeoClusterTool(adapter),
    // Standalone geometry tools (WKT/GeoJSON input)
    createGeometryBufferTool(adapter),
    createGeometryIntersectionTool(adapter),
    createGeometryTransformTool(adapter),
  ];
}

// Re-export individual tool creators
export {
  // Basic
  createPostgisExtensionTool,
  createGeometryColumnTool,
  createPointInPolygonTool,
  createDistanceTool,
  createBufferTool,
  createIntersectionTool,
  createBoundingBoxTool,
  createSpatialIndexTool,
  // Advanced
  createGeocodeTool,
  createGeoTransformTool,
  createGeoIndexOptimizeTool,
  createGeoClusterTool,
  // Standalone
  createGeometryBufferTool,
  createGeometryIntersectionTool,
  createGeometryTransformTool,
};
