/**
 * Tool Icons Utility
 *
 * Programmatic SVG icons for MCP tool categories with per-tool variants
 * based on behavior annotations (destructive, admin, etc.).
 */

import type { ToolIcon, ToolGroup, ToolAnnotations } from "../types/index.js";

// =============================================================================
// SVG Icon Generator
// =============================================================================

/**
 * Create a base64-encoded SVG data URI
 */
function createSvgDataUri(pathContent: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${pathContent}</svg>`;
  // Use Buffer for Node.js base64 encoding
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** SVG path content and color for each tool category */
const CATEGORY_ICONS: Record<ToolGroup, { path: string; color: string }> = {
  // Core: Database cylinder
  core: {
    path: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>',
    color: "#3B82F6",
  },
  // Transactions: Circular arrows
  transactions: {
    path: '<path d="M21 12a9 9 0 1 1-9-9"/><path d="M21 3v9h-9"/>',
    color: "#8B5CF6",
  },
  // JSONB: Curly braces
  jsonb: {
    path: '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/>',
    color: "#F59E0B",
  },
  // Text: Search magnifier with text
  text: {
    path: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M8 11h6"/>',
    color: "#06B6D4",
  },
  // Performance: Gauge/speedometer
  performance: {
    path: '<path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 12l5-5"/><circle cx="12" cy="12" r="2"/>',
    color: "#10B981",
  },
  // Admin: Wrench
  admin: {
    path: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    color: "#6B7280",
  },
  // Monitoring: Eye
  monitoring: {
    path: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    color: "#6366F1",
  },
  // Backup: Download/archive
  backup: {
    path: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    color: "#475569",
  },
  // Schema: Table grid
  schema: {
    path: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
    color: "#14B8A6",
  },
  // Vector: 3D cube
  vector: {
    path: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27,6.96 12,12.01 20.73,6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    color: "#7C3AED",
  },
  // PostGIS: Globe
  postgis: {
    path: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    color: "#059669",
  },
  // Partitioning: Pie slices
  partitioning: {
    path: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
    color: "#F43F5E",
  },
  // Stats: Bar chart
  stats: {
    path: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
    color: "#0EA5E9",
  },
  // Cron: Clock
  cron: {
    path: '<circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>',
    color: "#D97706",
  },
  // Partman: Calendar
  partman: {
    path: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    color: "#C026D3",
  },
  // Kcache: CPU chip
  kcache: {
    path: '<rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
    color: "#EF4444",
  },
  // Citext: Aa letters
  citext: {
    path: '<path d="M3 21h4l3-9 3 9h4"/><path d="M14 21h4l1-3h-6l1 3z"/><path d="M7 9l3-6 3 6"/>',
    color: "#84CC16",
  },
  // Ltree: Tree branches
  ltree: {
    path: '<path d="M8 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3"/><path d="M16 5h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-3"/><line x1="12" y1="3" x2="12" y2="21"/>',
    color: "#22C55E",
  },
  // Pgcrypto: Lock/shield
  pgcrypto: {
    path: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    color: "#EAB308",
  },
  // Introspection: Magnifying glass with graph nodes
  introspection: {
    path: '<circle cx="10" cy="10" r="7"/><path d="m21 21-4.35-4.35"/><circle cx="8" cy="8" r="1.5"/><circle cx="12" cy="10" r="1.5"/><path d="M8 8l4 2"/>',
    color: "#A855F7",
  },
  // Codemode: Terminal/code
  codemode: {
    path: '<polyline points="4,17 10,11 4,5"/><line x1="12" y1="19" x2="20" y2="19"/>',
    color: "#EC4899",
  },
};

// =============================================================================
// Special Behavior Icons
// =============================================================================

/** Warning icon for destructive operations (red triangle) */
const WARNING_ICON_PATH =
  '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>';
const WARNING_COLOR = "#EF4444";

/** Admin icon for maintenance operations (gear) */
const ADMIN_ICON_PATH =
  '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>';
const ADMIN_COLOR = "#F59E0B";

// =============================================================================
// Icon Builders
// =============================================================================

/**
 * Create a ToolIcon array for standard category icons
 */
function createCategoryIcon(group: ToolGroup): ToolIcon[] {
  const { path, color } = CATEGORY_ICONS[group];
  return [
    {
      src: createSvgDataUri(path, color),
      mimeType: "image/svg+xml",
      sizes: ["any"],
    },
  ];
}

/**
 * Create a warning icon for destructive operations
 */
function createWarningIcon(): ToolIcon[] {
  return [
    {
      src: createSvgDataUri(WARNING_ICON_PATH, WARNING_COLOR),
      mimeType: "image/svg+xml",
      sizes: ["any"],
    },
  ];
}

/**
 * Create an admin/maintenance icon
 */
function createAdminIcon(): ToolIcon[] {
  return [
    {
      src: createSvgDataUri(ADMIN_ICON_PATH, ADMIN_COLOR),
      mimeType: "image/svg+xml",
      sizes: ["any"],
    },
  ];
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Get appropriate icons for a tool based on its group and annotations.
 *
 * Priority:
 * 1. Destructive tools → Warning icon
 * 2. Admin tools (VACUUM, ANALYZE, REINDEX) → Admin gear icon
 * 3. All other tools → Category-specific icon
 */
export function getToolIcons(
  group: ToolGroup,
  annotations?: ToolAnnotations,
): ToolIcon[] {
  // Destructive operations get warning icon
  if (annotations?.destructiveHint === true) {
    return createWarningIcon();
  }

  // Admin/maintenance operations get gear icon
  const title = annotations?.title?.toLowerCase() ?? "";
  if (
    title.includes("vacuum") ||
    title.includes("analyze") ||
    title.includes("reindex")
  ) {
    return createAdminIcon();
  }

  // Default to category icon
  return createCategoryIcon(group);
}

/**
 * Get the category icon for a tool group (ignores behavior annotations)
 */
export function getCategoryIcon(group: ToolGroup): ToolIcon[] {
  return createCategoryIcon(group);
}

/**
 * Get all category icons for documentation/discovery
 */
export function getAllCategoryIcons(): Record<ToolGroup, ToolIcon[]> {
  const result = {} as Record<ToolGroup, ToolIcon[]>;
  for (const group of Object.keys(CATEGORY_ICONS) as ToolGroup[]) {
    result[group] = createCategoryIcon(group);
  }
  return result;
}
