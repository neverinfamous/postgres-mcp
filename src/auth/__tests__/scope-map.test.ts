/**
 * Tests for scope-map (tool name → required scope reverse lookup)
 */

import { describe, it, expect } from "vitest";
import { getRequiredScope, getToolScopeMap } from "../../auth/scope-map.js";
import { TOOL_GROUPS } from "../../filtering/tool-constants.js";
import { TOOL_GROUP_SCOPES } from "../../auth/scopes.js";
import type { ToolGroup } from "../../types/index.js";

describe("Tool Scope Map", () => {
  it("should have an entry for every tool in TOOL_GROUPS", () => {
    const scopeMap = getToolScopeMap();
    for (const [, tools] of Object.entries(TOOL_GROUPS)) {
      for (const toolName of tools) {
        expect(scopeMap.has(toolName)).toBe(true);
      }
    }
  });

  it("should map core tools to read scope", () => {
    expect(getRequiredScope("pg_read_query")).toBe("read");
    expect(getRequiredScope("pg_list_tables")).toBe("read");
    expect(getRequiredScope("pg_describe_table")).toBe("read");
  });

  it("should map transaction tools to write scope", () => {
    expect(getRequiredScope("pg_transaction_begin")).toBe("write");
    expect(getRequiredScope("pg_transaction_commit")).toBe("write");
    expect(getRequiredScope("pg_transaction_execute")).toBe("write");
  });

  it("should map admin tools to admin scope", () => {
    expect(getRequiredScope("pg_vacuum")).toBe("admin");
    expect(getRequiredScope("pg_analyze")).toBe("admin");
    expect(getRequiredScope("pg_reindex")).toBe("admin");
  });

  it("should map codemode to admin scope", () => {
    expect(getRequiredScope("pg_execute_code")).toBe("admin");
  });

  it("should map extension tools correctly", () => {
    // Cron requires admin
    expect(getRequiredScope("pg_cron_schedule")).toBe("admin");
    // Vector requires read
    expect(getRequiredScope("pg_vector_search")).toBe("read");
    // Pgcrypto requires read
    expect(getRequiredScope("pg_pgcrypto_hash")).toBe("read");
    // Partman requires admin
    expect(getRequiredScope("pg_partman_create_parent")).toBe("admin");
  });

  it("should match TOOL_GROUP_SCOPES for every group", () => {
    for (const [group, tools] of Object.entries(TOOL_GROUPS)) {
      const expectedScope = TOOL_GROUP_SCOPES[group as ToolGroup];
      for (const toolName of tools) {
        expect(getRequiredScope(toolName)).toBe(expectedScope);
      }
    }
  });

  it("should default to read for unknown tools", () => {
    expect(getRequiredScope("pg_nonexistent_tool")).toBe("read");
  });
});
