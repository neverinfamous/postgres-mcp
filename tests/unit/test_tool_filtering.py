"""
Tests for tool filtering module.

Tests the POSTGRES_MCP_TOOL_FILTER environment variable parsing and filtering logic.
Covers filter syntax (-group, -tool, +tool), order of operations, edge cases,
and real-world usage scenarios.
"""

from __future__ import annotations

import os
from unittest.mock import MagicMock

import pytest

from postgres_mcp.tool_filtering import (
    ALL_TOOLS,
    TOOL_GROUPS,
    clear_cache,
    filter_tools,
    get_all_tool_names,
    get_available_groups,
    get_included_tools,
    is_tool_enabled,
)


class TestToolFilteringBase:
    """Base class with setup/teardown for tool filtering tests."""

    def setup_method(self) -> None:
        """Reset environment and cache before each test."""
        self._original_filter = os.environ.get("POSTGRES_MCP_TOOL_FILTER")
        os.environ.pop("POSTGRES_MCP_TOOL_FILTER", None)
        clear_cache()

    def teardown_method(self) -> None:
        """Restore environment after each test."""
        if self._original_filter is not None:
            os.environ["POSTGRES_MCP_TOOL_FILTER"] = self._original_filter
        else:
            os.environ.pop("POSTGRES_MCP_TOOL_FILTER", None)
        clear_cache()

    def set_filter(self, value: str) -> None:
        """Helper to set filter and clear cache."""
        os.environ["POSTGRES_MCP_TOOL_FILTER"] = value
        clear_cache()


class TestToolGroups(TestToolFilteringBase):
    """Tests for TOOL_GROUPS constant structure."""

    def test_all_expected_groups_exist(self) -> None:
        """All expected groups should be defined."""
        expected = {
            "core",
            "json",
            "text",
            "stats",
            "performance",
            "vector",
            "geo",
            "backup",
            "monitoring",
        }
        assert set(TOOL_GROUPS.keys()) == expected

    def test_core_group_has_expected_tools(self) -> None:
        """Core group should contain database operations."""
        assert TOOL_GROUPS["core"] == {
            "list_schemas",
            "list_objects",
            "get_object_details",
            "explain_query",
            "execute_sql",
            "analyze_workload_indexes",
            "analyze_query_indexes",
            "analyze_db_health",
            "get_top_queries",
        }

    def test_json_group_has_expected_tools(self) -> None:
        """JSON group should contain JSON/JSONB operations."""
        assert TOOL_GROUPS["json"] == {
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
        }

    def test_vector_group_has_expected_tools(self) -> None:
        """Vector group should contain vector/semantic search tools."""
        assert TOOL_GROUPS["vector"] == {
            "vector_embed",
            "vector_similarity",
            "vector_search",
            "vector_cluster",
            "vector_index_optimize",
            "vector_dimension_reduce",
            "hybrid_search",
            "vector_performance",
        }

    def test_all_tools_derived_from_groups(self) -> None:
        """ALL_TOOLS should be the union of all group tools."""
        expected = set().union(*TOOL_GROUPS.values())
        assert ALL_TOOLS == expected

    def test_no_duplicate_tools_across_groups(self) -> None:
        """Each tool should belong to exactly one group."""
        seen: set[str] = set()
        for group_name, tools in TOOL_GROUPS.items():
            duplicates = seen & tools
            assert not duplicates, f"Duplicate tools in '{group_name}': {duplicates}"
            seen |= tools

    def test_all_63_tools_accounted_for(self) -> None:
        """Should have exactly 63 tools total."""
        assert len(ALL_TOOLS) == 63

    def test_group_sizes(self) -> None:
        """Each group should have the expected number of tools."""
        expected_sizes = {
            "core": 9,
            "json": 11,
            "text": 5,
            "stats": 8,
            "performance": 6,
            "vector": 8,
            "geo": 7,
            "backup": 4,
            "monitoring": 5,
        }
        for group, expected_size in expected_sizes.items():
            assert len(TOOL_GROUPS[group]) == expected_size, f"Group '{group}' has wrong size"


class TestNoFiltering(TestToolFilteringBase):
    """Tests when no filtering is configured."""

    @pytest.mark.parametrize("env_value", [None, "", "   ", "\t\n"])
    def test_no_filter_returns_empty_frozenset(self, env_value: str | None) -> None:
        """Empty/missing env var should return empty frozenset (no filtering)."""
        if env_value is not None:
            os.environ["POSTGRES_MCP_TOOL_FILTER"] = env_value
        clear_cache()

        assert get_included_tools() == frozenset()

    def test_all_tools_enabled_when_no_filter(self) -> None:
        """All tools should be enabled when no filter is set."""
        for tool in ALL_TOOLS:
            assert is_tool_enabled(tool) is True

    def test_filter_tools_returns_all_when_no_filter(self) -> None:
        """filter_tools should return all tools when no filter is set."""
        mock_tools = [MagicMock(name=n) for n in ["list_schemas", "execute_sql"]]
        for i, name in enumerate(["list_schemas", "execute_sql"]):
            mock_tools[i].name = name

        assert filter_tools(mock_tools) == mock_tools


class TestDisableGroup(TestToolFilteringBase):
    """Tests for disabling groups with -group syntax."""

    def test_disable_single_group(self) -> None:
        """Disabling a group should remove all its tools."""
        self.set_filter("-vector")
        result = get_included_tools()

        assert not (result & TOOL_GROUPS["vector"]), "Vector tools should be excluded"
        assert TOOL_GROUPS["core"] <= result, "Core tools should remain"

    @pytest.mark.parametrize(
        "groups",
        [
            ["vector", "stats"],
            ["vector", "stats", "geo"],
            ["backup", "monitoring"],
        ],
    )
    def test_disable_multiple_groups(self, groups: list[str]) -> None:
        """Disabling multiple groups should remove all their tools."""
        self.set_filter(",".join(f"-{g}" for g in groups))
        result = get_included_tools()

        for group in groups:
            assert not (
                result & TOOL_GROUPS[group]
            ), f"{group} tools should be excluded"

    def test_disable_all_groups_results_in_empty_set(self) -> None:
        """Disabling all groups should result in empty set."""
        self.set_filter(",".join(f"-{g}" for g in TOOL_GROUPS.keys()))
        assert get_included_tools() == frozenset()


class TestDisableTool(TestToolFilteringBase):
    """Tests for disabling individual tools with -tool syntax."""

    @pytest.mark.parametrize("tool", ["execute_sql", "list_schemas", "vector_search"])
    def test_disable_single_tool(self, tool: str) -> None:
        """Disabling a single tool should only remove that tool."""
        self.set_filter(f"-{tool}")
        result = get_included_tools()

        assert tool not in result
        assert len(result) == len(ALL_TOOLS) - 1

    def test_disable_multiple_tools(self) -> None:
        """Disabling multiple tools should remove all of them."""
        self.set_filter("-execute_sql,-list_schemas,-vector_search")
        result = get_included_tools()

        assert "execute_sql" not in result
        assert "list_schemas" not in result
        assert "vector_search" not in result
        assert len(result) == len(ALL_TOOLS) - 3


class TestEnableTool(TestToolFilteringBase):
    """Tests for re-enabling tools with +tool syntax."""

    def test_enable_tool_after_group_disable(self) -> None:
        """Re-enabling a tool after disabling its group should work."""
        self.set_filter("-core,+list_schemas")
        result = get_included_tools()

        assert "list_schemas" in result
        assert not (result & (TOOL_GROUPS["core"] - {"list_schemas"}))

    def test_enable_multiple_tools_after_group_disable(self) -> None:
        """Re-enabling multiple tools after group disable should work."""
        self.set_filter("-core,+list_schemas,+execute_sql")
        result = get_included_tools()

        assert {"list_schemas", "execute_sql"} <= result
        remaining_core = TOOL_GROUPS["core"] - {"list_schemas", "execute_sql"}
        assert not (result & remaining_core)

    def test_enable_already_enabled_tool_is_noop(self) -> None:
        """Enabling an already-enabled tool should be a no-op."""
        self.set_filter("+list_schemas")
        result = get_included_tools()

        assert "list_schemas" in result
        assert len(result) == len(ALL_TOOLS)


class TestOrderOfOperations(TestToolFilteringBase):
    """Tests for left-to-right processing order."""

    @pytest.mark.parametrize(
        "filter_str,tool,expected",
        [
            ("-core,+list_schemas", "list_schemas", True),  # disable then enable
            ("+list_schemas,-core", "list_schemas", False),  # enable then disable
            ("-vector,+vector_search,-vector_search", "vector_search", False),  # complex
        ],
    )
    def test_order_matters(self, filter_str: str, tool: str, expected: bool) -> None:
        """Filter rules should process left-to-right."""
        self.set_filter(filter_str)
        assert is_tool_enabled(tool) is expected


class TestInvalidInput(TestToolFilteringBase):
    """Tests for handling invalid input."""

    @pytest.mark.parametrize(
        "filter_str",
        [
            "-nonexistent_group",
            "-nonexistent_tool",
            "+nonexistent_tool",
            "list_schemas",  # missing prefix
        ],
    )
    def test_invalid_rules_ignored(self, filter_str: str) -> None:
        """Invalid rules should be ignored, all tools remain enabled."""
        self.set_filter(filter_str)
        assert len(get_included_tools()) == len(ALL_TOOLS)

    def test_mixed_valid_and_invalid_rules(self) -> None:
        """Valid rules should work even with invalid ones present."""
        self.set_filter("-vector,invalid,+list_schemas,-nonexistent")
        result = get_included_tools()

        assert not (result & TOOL_GROUPS["vector"])
        assert "list_schemas" in result


class TestWhitespaceHandling(TestToolFilteringBase):
    """Tests for whitespace handling in filter rules."""

    @pytest.mark.parametrize(
        "filter_str",
        [
            "  -vector  ,  -stats  ",
            "-vector,,-stats",
            " -vector , , -stats ",
        ],
    )
    def test_whitespace_and_empty_rules_handled(self, filter_str: str) -> None:
        """Whitespace should be trimmed, empty rules ignored."""
        self.set_filter(filter_str)
        result = get_included_tools()

        assert not (result & TOOL_GROUPS["vector"])
        assert not (result & TOOL_GROUPS["stats"])


class TestIsToolEnabled(TestToolFilteringBase):
    """Tests for is_tool_enabled function."""

    def test_enabled_tool_returns_true(self) -> None:
        self.set_filter("-vector")
        assert is_tool_enabled("list_schemas") is True

    def test_disabled_tool_returns_false(self) -> None:
        self.set_filter("-vector")
        assert is_tool_enabled("vector_search") is False

    def test_unknown_tool_when_no_filter(self) -> None:
        """Unknown tool returns True when no filter is set."""
        assert is_tool_enabled("unknown_tool") is True

    def test_unknown_tool_when_filter_active(self) -> None:
        """Unknown tool returns False when filter is active (not in included set)."""
        self.set_filter("-vector")
        assert is_tool_enabled("unknown_tool") is False


class TestFilterTools(TestToolFilteringBase):
    """Tests for filter_tools function."""

    def test_filters_tool_list(self) -> None:
        """filter_tools should filter MCP Tool objects by name."""
        self.set_filter("-vector")

        mock_tools = []
        for name in ["list_schemas", "vector_search", "execute_sql"]:
            tool = MagicMock()
            tool.name = name
            mock_tools.append(tool)

        result = filter_tools(mock_tools)
        result_names = [t.name for t in result]

        assert result_names == ["list_schemas", "execute_sql"]

    def test_preserves_order(self) -> None:
        """filter_tools should preserve order of tools."""
        self.set_filter("-vector")

        mock_tools = []
        for name in ["execute_sql", "list_schemas", "explain_query"]:
            tool = MagicMock()
            tool.name = name
            mock_tools.append(tool)

        result_names = [t.name for t in filter_tools(mock_tools)]
        assert result_names == ["execute_sql", "list_schemas", "explain_query"]


class TestCaching(TestToolFilteringBase):
    """Tests for LRU cache behavior."""

    def test_cache_returns_same_object(self) -> None:
        """Cached result should be the same object on subsequent calls."""
        self.set_filter("-vector")
        result1 = get_included_tools()
        result2 = get_included_tools()
        assert result1 is result2

    def test_clear_cache_allows_new_result(self) -> None:
        """Clearing cache should compute new result."""
        self.set_filter("-vector")
        result1 = get_included_tools()

        self.set_filter("-stats")
        result2 = get_included_tools()

        assert "vector_search" not in result1
        assert "vector_search" in result2


class TestHelperFunctions(TestToolFilteringBase):
    """Tests for helper/utility functions."""

    def test_get_available_groups_returns_copy(self) -> None:
        """get_available_groups should return a copy, not the original."""
        groups = get_available_groups()
        groups["test_group"] = set()
        assert "test_group" not in TOOL_GROUPS

    def test_get_all_tool_names_returns_copy(self) -> None:
        """get_all_tool_names should return a copy, not the original."""
        tools = get_all_tool_names()
        tools.add("test_tool")
        assert "test_tool" not in ALL_TOOLS


class TestRealWorldScenarios(TestToolFilteringBase):
    """Tests for real-world usage scenarios."""

    def test_windsurf_100_tool_limit(self) -> None:
        """Reduce tools to stay under Windsurf's 100-tool limit."""
        self.set_filter("-vector,-geo,-stats,-text")
        result = get_included_tools()

        # Should reduce from 63 to ~35 tools (removing 28)
        assert len(result) < 50
        assert {"list_schemas", "execute_sql", "explain_query"} <= result

    def test_read_only_mode(self) -> None:
        """Read-only mode by disabling execute_sql."""
        self.set_filter("-execute_sql")
        result = get_included_tools()

        assert "execute_sql" not in result
        assert "list_schemas" in result
        assert "explain_query" in result

    def test_minimal_core_only(self) -> None:
        """Only core tools."""
        non_core = [g for g in TOOL_GROUPS.keys() if g != "core"]
        self.set_filter(",".join(f"-{g}" for g in non_core))

        assert get_included_tools() == frozenset(TOOL_GROUPS["core"])

    def test_core_with_specific_tools(self) -> None:
        """Disable core but keep list_schemas."""
        self.set_filter("-core,+list_schemas")
        result = get_included_tools()

        assert "list_schemas" in result
        assert "execute_sql" not in result

    def test_disable_extension_dependent_tools(self) -> None:
        """Disable tools that require PostgreSQL extensions (pgvector, PostGIS)."""
        self.set_filter("-vector,-geo")
        result = get_included_tools()

        assert "vector_search" not in result
        assert "geo_distance" not in result
        assert "json_query" in result  # JSON tools should remain
        assert "stats_descriptive" in result  # Stats tools should remain

    def test_analytics_focus(self) -> None:
        """Analytics focus - keep stats and performance, disable others."""
        self.set_filter("-vector,-geo,-backup")
        result = get_included_tools()

        assert TOOL_GROUPS["stats"] <= result
        assert TOOL_GROUPS["performance"] <= result
        assert not (result & TOOL_GROUPS["vector"])
        assert not (result & TOOL_GROUPS["geo"])

    def test_cicd_mode(self) -> None:
        """CI/CD mode - disable backup and monitoring."""
        self.set_filter("-backup,-monitoring")
        result = get_included_tools()

        assert not (result & TOOL_GROUPS["backup"])
        assert not (result & TOOL_GROUPS["monitoring"])
        assert TOOL_GROUPS["core"] <= result


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

