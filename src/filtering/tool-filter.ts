/**
 * postgres-mcp - Tool Filtering System
 *
 * Parses and applies tool filter rules from environment variables.
 * Compatible with db-mcp filtering syntax.
 *
 * Syntax:
 *   -group    → Disable all tools in a group
 *   +group    → Enable all tools in a group
 *   -tool     → Disable a specific tool
 *   +tool     → Enable a specific tool (after group disable)
 */

import type {
  ToolGroup,
  ToolFilterConfig,
  ToolDefinition,
} from "../types/index.js";

/**
 * Cached list of all tool names
 * Lazy-initialized since TOOL_GROUPS is immutable
 */
let cachedAllToolNames: string[] | null = null;

/**
 * Reverse lookup map: tool name -> group
 * Lazy-initialized for O(1) tool group lookups
 */
let toolToGroupMap: Map<string, ToolGroup> | null = null;

/**
 * Default tool groups and their member tools.
 * This serves as the canonical mapping of tools to groups.
 */
export { TOOL_GROUPS } from "./tool-constants.js";
import { TOOL_GROUPS } from "./tool-constants.js";

/**
 * Get all tool names from all groups (cached)
 */
export function getAllToolNames(): string[] {
  if (cachedAllToolNames) {
    return cachedAllToolNames;
  }
  const groups = Object.keys(TOOL_GROUPS) as ToolGroup[];
  cachedAllToolNames = groups.flatMap((group) => TOOL_GROUPS[group]);
  return cachedAllToolNames;
}

/**
 * Get or initialize the tool-to-group reverse lookup map
 */
function getToolToGroupMap(): Map<string, ToolGroup> {
  if (toolToGroupMap) {
    return toolToGroupMap;
  }

  toolToGroupMap = new Map<string, ToolGroup>();
  const groups = Object.keys(TOOL_GROUPS) as ToolGroup[];
  for (const group of groups) {
    for (const tool of TOOL_GROUPS[group]) {
      toolToGroupMap.set(tool, group);
    }
  }
  return toolToGroupMap;
}

/**
 * Get the group for a specific tool (O(1) lookup)
 */
export function getToolGroup(toolName: string): ToolGroup | undefined {
  return getToolToGroupMap().get(toolName);
}

/**
 * Derive the set of enabled ToolGroup names from a set of enabled tool names.
 * A group is considered enabled if at least one of its tools is in the set.
 */
export function getEnabledGroups(enabledTools: Set<string>): Set<ToolGroup> {
  const groups = new Set<ToolGroup>();
  for (const [group, tools] of Object.entries(TOOL_GROUPS) as [ToolGroup, string[]][]) {
    if (tools.some((tool) => enabledTools.has(tool))) {
      groups.add(group);
    }
  }
  return groups;
}

/**
 * Check if a name is a valid tool group
 */
export function isToolGroup(name: string): name is ToolGroup {
  return name in TOOL_GROUPS;
}



/**
 * Parse a tool filter string into structured rules
 *
 * @param filterString - The filter string (e.g., "starter" or "-vector,-postgis,+pg_vector_search")
 * @returns Parsed filter configuration
 */
export function parseToolFilter(
  filterString: string | undefined,
): ToolFilterConfig {
  const allTools = getAllToolNames();
  const enabledTools = new Set<string>(allTools);

  if (!filterString || filterString.trim() === "") {
    return {
      raw: "",
      rules: [],
      enabledTools,
    };
  }

  const rules: ToolFilterConfig["rules"] = [];
  const parts = filterString
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p);

  if (parts.length === 0) {
    return {
      raw: filterString,
      rules: [],
      enabledTools,
    };
  }

  // If first rule is exclusion (-), start with ALL tools
  // If first rule is inclusion (+) or no prefix, start with NO tools (whitelist mode)
  const firstPart = parts[0];
  if (!firstPart) {
    return {
      raw: filterString,
      rules: [],
      enabledTools,
    };
  }
  const startsWithExclude = firstPart.startsWith("-");

  if (!startsWithExclude) {
    enabledTools.clear();
  }

  for (const part of parts) {
    if (!part) continue;

    let isInclude = true; // Default to include
    let isExclude = false;
    let target = part;

    if (part.startsWith("+")) {
      isInclude = true;
      target = part.substring(1);
    } else if (part.startsWith("-")) {
      isInclude = false;
      isExclude = true;
      target = part.substring(1);
    }

    // Special case: 'all'
    if (target === "all") {
      if (isExclude) {
        enabledTools.clear();
      } else {
        for (const tool of allTools) {
          enabledTools.add(tool);
        }
      }
      continue;
    }

    const targetIsGroup = isToolGroup(target);

    rules.push({
      type: isInclude ? "include" : "exclude",
      target,
      isGroup: targetIsGroup,
    });

    if (targetIsGroup) {
      const groupTools = TOOL_GROUPS[target as ToolGroup];
      if (isExclude) {
        for (const tool of groupTools) {
          enabledTools.delete(tool);
        }
      } else {
        for (const tool of groupTools) {
          enabledTools.add(tool);
        }
      }
    } else {
      // Individual tool
      if (isExclude) {
        enabledTools.delete(target);
      } else {
        enabledTools.add(target);
      }
    }
  }

  // Auto-inject codemode tools (pg_execute_code) in whitelist mode only.
  // In blacklist mode (starts with -), codemode is already in the initial set
  // and user exclusions are respected. In whitelist mode, raw group filters
  // (e.g., "core") would otherwise miss codemode — every meta-group includes it.
  if (!startsWithExclude && enabledTools.size > 0) {
    const codemodeExplicitlyExcluded = parts.some(
      (p) => p === "-codemode" || p === "-pg_execute_code",
    );
    if (!codemodeExplicitlyExcluded) {
      for (const tool of TOOL_GROUPS.codemode) {
        enabledTools.add(tool);
      }
    }
  }

  return {
    raw: filterString,
    rules,
    enabledTools,
  };
}

/**
 * Filter a list of tool definitions based on filter configuration
 */
export function filterTools(
  tools: ToolDefinition[],
  config: ToolFilterConfig,
): ToolDefinition[] {
  return tools.filter((tool) => config.enabledTools.has(tool.name));
}

/**
 * Get the tool filter from environment variable
 */
export function getToolFilterFromEnv(): ToolFilterConfig {
  const filterString =
    process.env["POSTGRES_TOOL_FILTER"] ??
    process.env["MCP_TOOL_FILTER"] ??
    process.env["TOOL_FILTER"];
  return parseToolFilter(filterString);
}

/**
 * Generate a summary of the current filter configuration
 */
export function getFilterSummary(config: ToolFilterConfig): string {
  const allTools = getAllToolNames();
  const enabledCount = config.enabledTools.size;
  const disabledCount = allTools.length - enabledCount;

  const lines: string[] = [
    `Tool Filter Summary:`,
    `  Total tools: ${String(allTools.length)}`,
    `  Enabled: ${String(enabledCount)}`,
    `  Disabled: ${String(disabledCount)}`,
  ];

  if (config.rules.length > 0) {
    lines.push(`  Rules applied:`);
    for (const rule of config.rules) {
      const prefix = rule.type === "include" ? "+" : "-";
      const type = rule.isGroup ? "group" : "tool";
      lines.push(`    ${prefix}${rule.target} (${type})`);
    }
  }

  // Show per-group breakdown
  lines.push(`  By group:`);
  for (const [group, tools] of Object.entries(TOOL_GROUPS)) {
    const enabled = tools.filter((t) => config.enabledTools.has(t)).length;
    lines.push(`    ${group}: ${String(enabled)}/${String(tools.length)}`);
  }

  return lines.join("\n");
}
