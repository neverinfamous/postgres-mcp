"""Tool filtering for PostgreSQL MCP Server.

Provides environment-based filtering to expose only a subset of tools,
useful for staying under tool limits (e.g., Windsurf's 100-tool limit).

Configuration via environment variable:
  POSTGRES_MCP_TOOL_FILTER  Comma-separated filter rules processed left-to-right

Filter syntax:
  -group    Disable all tools in a group (e.g., -vector, -stats)
  -tool     Disable a specific tool (e.g., -execute_sql)
  +tool     Enable a specific tool (e.g., +list_schemas)

Examples:
  "-vector,-stats"                    Disable vector and stats groups
  "-core,+list_schemas"               Disable core group but keep list_schemas
  "-vector,-geo,+vector_search"       Disable groups but re-enable one tool

If not set or empty, all tools are enabled (no filtering).

Available groups: core, json, text, stats, performance, vector, geo, backup, monitoring

MCP Config:
    {
        "mcpServers": {
            "postgres-mcp": {
                "command": "docker",
                "args": ["run", "-i", "--rm", "-e", "DATABASE_URI",
                         "writenotenow/postgres-mcp-enhanced:latest", "--access-mode=restricted"],
                "env": {
                    "DATABASE_URI": "postgresql://user:pass@localhost:5432/db",
                    "POSTGRES_MCP_TOOL_FILTER": "-vector,-geo,-stats,-text"
                }
            }
        }
    }

"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import TYPE_CHECKING
from typing import Any

if TYPE_CHECKING:
    import mcp.types as types

logger = logging.getLogger(__name__)

# Tool groups - each group maps to a set of tool names
TOOL_GROUPS: dict[str, set[str]] = {
    "core": {
        "list_schemas",
        "list_objects",
        "get_object_details",
        "explain_query",
        "execute_sql",
        "analyze_workload_indexes",
        "analyze_query_indexes",
        "analyze_db_health",
        "get_top_queries",
    },
    "json": {
        "json_insert",
        "json_update",
        "json_select",
        "json_query",
        "json_validate_path",
        "json_merge",
        "json_normalize",
        "json_diff",
        "jsonb_index_suggest",
        "json_security_scan",
        "jsonb_stats",
    },
    "text": {
        "text_similarity",
        "text_search_advanced",
        "regex_extract_all",
        "fuzzy_match",
        "text_sentiment",
    },
    "stats": {
        "stats_descriptive",
        "stats_percentiles",
        "stats_correlation",
        "stats_regression",
        "stats_time_series",
        "stats_distribution",
        "stats_hypothesis",
        "stats_sampling",
    },
    "performance": {
        "query_plan_compare",
        "performance_baseline",
        "slow_query_analyzer",
        "connection_pool_optimize",
        "vacuum_strategy_recommend",
        "partition_strategy_suggest",
    },
    "vector": {
        "vector_embed",
        "vector_similarity",
        "vector_search",
        "vector_cluster",
        "vector_index_optimize",
        "vector_dimension_reduce",
        "hybrid_search",
        "vector_performance",
    },
    "geo": {
        "geo_distance",
        "geo_within",
        "geo_buffer",
        "geo_intersection",
        "geo_index_optimize",
        "geo_transform",
        "geo_cluster",
    },
    "backup": {
        "backup_logical",
        "backup_physical",
        "restore_validate",
        "backup_schedule_optimize",
    },
    "monitoring": {
        "monitor_real_time",
        "alert_threshold_set",
        "capacity_planning",
        "resource_usage_analyze",
        "replication_monitor",
    },
}

# All available tools (derived from groups)
ALL_TOOLS: set[str] = set().union(*TOOL_GROUPS.values())


@lru_cache(maxsize=1)
def get_included_tools() -> frozenset[str]:
    """Determine which tools to include based on POSTGRES_MCP_TOOL_FILTER.

    Starts with all tools enabled, then processes filter rules left-to-right:
      -name   Disable group or tool
      +name   Enable tool (can restore after group disable)

    Returns:
        Frozen set of tool names to include. If env var not set, returns empty
        frozenset (meaning no filtering - all tools enabled).
    """
    filter_env = os.environ.get("POSTGRES_MCP_TOOL_FILTER", "").strip()

    if not filter_env:
        logger.debug("POSTGRES_MCP_TOOL_FILTER not set - all tools enabled")
        return frozenset()

    # Start with all tools
    result: set[str] = ALL_TOOLS.copy()
    rules = [r.strip() for r in filter_env.split(",") if r.strip()]

    for rule in rules:
        if rule.startswith("-"):
            name = rule[1:]
            if name in TOOL_GROUPS:
                removed = result & TOOL_GROUPS[name]
                result -= TOOL_GROUPS[name]
                if removed:
                    logger.info(f"Disabled group '{name}': -{len(removed)} tools")
            elif name in ALL_TOOLS:
                if name in result:
                    result.discard(name)
                    logger.info(f"Disabled tool '{name}'")
            else:
                logger.warning(f"Unknown group/tool ignored: '{name}'")
        elif rule.startswith("+"):
            name = rule[1:]
            if name in ALL_TOOLS:
                if name not in result:
                    result.add(name)
                    logger.info(f"Enabled tool '{name}'")
            else:
                logger.warning(f"Unknown tool ignored: '{name}'")
        else:
            logger.warning(f"Invalid filter rule (must start with + or -): '{rule}'")

    logger.info(f"Tool filtering active: {len(result)}/{len(ALL_TOOLS)} tools enabled")
    return frozenset(result)


def is_tool_enabled(name: str) -> bool:
    """Check if a tool is enabled.

    Args:
        name: Tool name to check.

    Returns:
        True if tool is enabled, False if disabled by filtering.
    """
    included = get_included_tools()
    # Empty set means no filtering (all enabled)
    if not included:
        return True
    return name in included


def filter_tools(tools: list[types.Tool]) -> list[types.Tool]:
    """Filter a list of tools based on environment configuration.

    Args:
        tools: List of MCP Tool objects to filter.

    Returns:
        Filtered list containing only enabled tools.
    """
    included = get_included_tools()
    # Empty set means no filtering
    if not included:
        return tools
    return [t for t in tools if t.name in included]


def clear_cache() -> None:
    """Clear the cached included tools. Useful for testing."""
    get_included_tools.cache_clear()


def get_available_groups() -> dict[str, set[str]]:
    """Return available tool groups for documentation/CLI purposes."""
    return TOOL_GROUPS.copy()


def get_all_tool_names() -> set[str]:
    """Return all known tool names."""
    return ALL_TOOLS.copy()


def filter_tools_from_server(fastmcp_server: Any) -> None:
    """Filter tools from a FastMCP server based on environment configuration.

    This function modifies the FastMCP server's internal tool registry
    to remove disabled tools.

    Args:
        fastmcp_server: FastMCP server instance to filter tools from.
    """
    included = get_included_tools()

    # Empty set means no filtering
    if not included:
        logger.debug("No tool filtering applied - all tools enabled")
        return

    # FastMCP stores tools in _tool_manager._tools dict
    if hasattr(fastmcp_server, "_tool_manager"):
        tool_manager = fastmcp_server._tool_manager
        if hasattr(tool_manager, "_tools"):
            tools_dict: dict[str, Any] = tool_manager._tools
            tools_to_remove = [name for name in tools_dict if name not in included]
            for tool_name in tools_to_remove:
                del tools_dict[tool_name]
                logger.debug(f"Removed disabled tool: {tool_name}")

            logger.info(f"Tool filtering applied: {len(tools_dict)} tools remaining ({len(tools_to_remove)} removed)")
