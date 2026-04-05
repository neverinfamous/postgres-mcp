/**
 * Resource Annotations Presets
 *
 * Reusable annotation configurations for MCP resources.
 * Used by all resource definition files for consistency.
 */

import type { ResourceAnnotations } from "../types/index.js";

// =============================================================================
// Resource Annotation Presets
// =============================================================================

/**
 * High priority resource (0.8+) - critical for understanding database state
 * Examples: health, activity, schema
 */
export const HIGH_PRIORITY: ResourceAnnotations = {
  audience: ["user", "assistant"],
  priority: 0.9,
};

/**
 * Medium priority resource (0.5-0.7) - useful for analysis and monitoring
 * Examples: performance, statistics, indexes
 */
export const MEDIUM_PRIORITY: ResourceAnnotations = {
  audience: ["user", "assistant"],
  priority: 0.6,
};

/**
 * Low priority resource (0.3-0.4) - supplementary information
 * Examples: extension status, pool stats
 */
export const LOW_PRIORITY: ResourceAnnotations = {
  audience: ["user", "assistant"],
  priority: 0.4,
};

/**
 * Assistant-focused resource - primarily for agent consumption
 * Examples: capabilities, settings reference
 */
export const ASSISTANT_FOCUSED: ResourceAnnotations = {
  audience: ["assistant"],
  priority: 0.5,
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create annotations with a custom priority
 */
export function withPriority(
  priority: number,
  base: ResourceAnnotations = HIGH_PRIORITY,
): ResourceAnnotations {
  return { ...base, priority };
}

/**
 * Create annotations with lastModified timestamp
 */
export function withTimestamp(
  base: ResourceAnnotations = MEDIUM_PRIORITY,
): ResourceAnnotations {
  return { ...base, lastModified: new Date().toISOString() };
}
