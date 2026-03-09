/**
 * postgres-mcp - Migration Tools Unit Tests
 *
 * Tests for migration tracking tools group registration.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMigrationTools } from "../migration/index.js";
import type { PostgresAdapter } from "../../PostgresAdapter.js";
import { createMockPostgresAdapter } from "../../../../__tests__/mocks/index.js";

describe("getMigrationTools", () => {
  let adapter: PostgresAdapter;
  let tools: ReturnType<typeof getMigrationTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockPostgresAdapter() as unknown as PostgresAdapter;
    tools = getMigrationTools(adapter);
  });

  it("should return 6 migration tools", () => {
    expect(tools).toHaveLength(6);
  });

  it("should have all expected tool names", () => {
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("pg_migration_init");
    expect(toolNames).toContain("pg_migration_record");
    expect(toolNames).toContain("pg_migration_apply");
    expect(toolNames).toContain("pg_migration_rollback");
    expect(toolNames).toContain("pg_migration_history");
    expect(toolNames).toContain("pg_migration_status");
  });

  it("should have group set to migration for all tools", () => {
    for (const tool of tools) {
      expect(tool.group).toBe("migration");
    }
  });

  it("should have output schemas for all tools", () => {
    for (const tool of tools) {
      expect(tool.outputSchema).toBeDefined();
    }
  });
});
