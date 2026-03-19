/**
 * Tool Annotations Presets
 *
 * Reusable annotation configurations for common tool behavior patterns.
 * Used by all tool definition files for consistency.
 */

import type { ToolAnnotations } from "../types/index.js";

// =============================================================================
// Base Annotation Presets
// =============================================================================

/** Read-only query tools (SELECT, EXPLAIN, metadata retrieval) */
export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};

/** Standard write tools (INSERT, UPDATE, CREATE) */
export const WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
};

/** Destructive tools (DELETE, DROP, TRUNCATE) */
export const DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
};

/** Idempotent tools (CREATE IF NOT EXISTS, upserts) */
export const IDEMPOTENT: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** Admin/maintenance tools (VACUUM, ANALYZE, REINDEX) */
export const ADMIN: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create annotations with a custom title
 */
export function withTitle(
  title: string,
  base: ToolAnnotations = READ_ONLY,
): ToolAnnotations {
  return { title, ...base };
}

/**
 * Create read-only annotations with title
 */
export function readOnly(title: string): ToolAnnotations {
  return { title, ...READ_ONLY };
}

/**
 * Create write annotations with title
 */
export function write(title: string): ToolAnnotations {
  return { title, ...WRITE };
}

/**
 * Create destructive annotations with title
 */
export function destructive(title: string): ToolAnnotations {
  return { title, ...DESTRUCTIVE };
}

/**
 * Create idempotent annotations with title
 */
export function idempotent(title: string): ToolAnnotations {
  return { title, ...IDEMPOTENT };
}

/**
 * Create admin annotations with title
 */
export function admin(title: string): ToolAnnotations {
  return { title, ...ADMIN };
}
