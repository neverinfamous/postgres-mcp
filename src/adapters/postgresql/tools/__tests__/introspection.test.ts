/**
 * postgres-mcp - Introspection Tools Unit Tests
 *
 * Tests for agent-optimized introspection tools: dependency graphs,
 * topological sort, cascade simulation, schema snapshots,
 * constraint analysis, and migration risk analysis.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getIntrospectionTools } from "../introspection/index.js";
import { getMigrationTools } from "../migration/index.js";
import type { PostgresAdapter } from "../../postgres-adapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../__tests__/mocks/index.js";

describe("getIntrospectionTools", () => {
  let adapter: PostgresAdapter;
  let tools: ReturnType<typeof getIntrospectionTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockPostgresAdapter() as unknown as PostgresAdapter;
    tools = getIntrospectionTools(adapter);
  });

  it("should return 6 introspection tools", () => {
    expect(tools).toHaveLength(6);
  });

  it("should have all expected tool names", () => {
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("pg_dependency_graph");
    expect(toolNames).toContain("pg_topological_sort");
    expect(toolNames).toContain("pg_cascade_simulator");
    expect(toolNames).toContain("pg_schema_snapshot");
    expect(toolNames).toContain("pg_constraint_analysis");
    expect(toolNames).toContain("pg_migration_risks");
  });

  it("should have group set to introspection for all tools", () => {
    for (const tool of tools) {
      expect(tool.group).toBe("introspection");
    }
  });

  it("should have output schemas for all tools", () => {
    for (const tool of tools) {
      expect(tool.outputSchema).toBeDefined();
    }
  });
});

// =============================================================================
// pg_dependency_graph
// =============================================================================

describe("pg_dependency_graph", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getIntrospectionTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getIntrospectionTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return dependency graph with nodes and edges", async () => {
    // Mock FK query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          constraint_name: "fk_orders_user",
          from_schema: "public",
          from_table: "orders",
          from_columns: ["user_id"],
          to_schema: "public",
          to_table: "users",
          to_columns: ["id"],
          on_delete: "CASCADE",
          on_update: "NO ACTION",
        },
      ],
    });

    // Mock table nodes query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "users",
          row_count: 1000,
          size_bytes: 65536,
        },
        {
          schema: "public",
          table_name: "orders",
          row_count: 5000,
          size_bytes: 131072,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_dependency_graph")!;
    const result = (await tool.handler({}, mockContext)) as {
      nodes: unknown[];
      edges: unknown[];
      circularDependencies: unknown[];
      stats: {
        totalTables: number;
        totalRelationships: number;
        rootTables: string[];
        leafTables: string[];
      };
    };

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.circularDependencies).toBeUndefined();
    expect(result.stats.totalTables).toBe(2);
    expect(result.stats.totalRelationships).toBe(1);
  });

  it("should detect circular dependencies", async () => {
    // Mock FK query with bidirectional references
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          constraint_name: "fk_a_b",
          from_schema: "public",
          from_table: "table_a",
          from_columns: ["b_id"],
          to_schema: "public",
          to_table: "table_b",
          to_columns: ["id"],
          on_delete: "CASCADE",
          on_update: "NO ACTION",
        },
        {
          constraint_name: "fk_b_a",
          from_schema: "public",
          from_table: "table_b",
          from_columns: ["a_id"],
          to_schema: "public",
          to_table: "table_a",
          to_columns: ["id"],
          on_delete: "CASCADE",
          on_update: "NO ACTION",
        },
      ],
    });

    // Mock table nodes query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "table_a",
          row_count: 10,
          size_bytes: 8192,
        },
        {
          schema: "public",
          table_name: "table_b",
          row_count: 20,
          size_bytes: 8192,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_dependency_graph")!;
    const result = (await tool.handler({}, mockContext)) as {
      circularDependencies: string[][];
    };

    expect(result.circularDependencies.length).toBeGreaterThan(0);
  });

  it("should filter by schema", async () => {
    // Schema existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    });
    // FK and table queries
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_dependency_graph")!;
    await tool.handler({ schema: "app" }, mockContext);

    // Second call (FK query) should use schema filter
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("$1"),
      ["app"],
    );
  });

  it("should return structured error for nonexistent schema", async () => {
    // Schema existence check returns no rows
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_dependency_graph")!;
    const result = (await tool.handler(
      { schema: "nonexistent_schema_xyz" },
      mockContext,
    )) as {
      success: false;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("nonexistent_schema_xyz");
    expect(result.error).toContain("does not exist");
  });

  it("should exclude extension schemas by default", async () => {
    // Mock FK and table queries returning empty
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_dependency_graph")!;
    await tool.handler({}, mockContext);

    // Verify the FK query includes extension schema exclusion
    const fkQueryCall = mockAdapter.executeQuery.mock.calls[0]!;
    expect(fkQueryCall[0]).toContain("'cron'");
    expect(fkQueryCall[0]).toContain("'topology'");
    expect(fkQueryCall[0]).toContain("'tiger'");
    expect(fkQueryCall[0]).toContain("'tiger_data'");

    // Verify the table query also includes extension schema exclusion
    const tableQueryCall = mockAdapter.executeQuery.mock.calls[1]!;
    expect(tableQueryCall[0]).toContain("'cron'");
    expect(tableQueryCall[0]).toContain("'tiger_data'");
  });
});

// =============================================================================
// pg_topological_sort
// =============================================================================

describe("pg_topological_sort", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getIntrospectionTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getIntrospectionTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return tables in create order (dependencies first)", async () => {
    // orders depends on users
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          constraint_name: "fk_orders_user",
          from_schema: "public",
          from_table: "orders",
          from_columns: ["user_id"],
          to_schema: "public",
          to_table: "users",
          to_columns: ["id"],
          on_delete: "CASCADE",
          on_update: "NO ACTION",
        },
      ],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "users",
          row_count: 100,
          size_bytes: 8192,
        },
        {
          schema: "public",
          table_name: "orders",
          row_count: 500,
          size_bytes: 16384,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_topological_sort")!;
    const result = (await tool.handler(
      { direction: "create" },
      mockContext,
    )) as {
      order: Array<{ table: string; level: number }>;
      direction: string;
      hasCycles: boolean;
    };

    expect(result.direction).toBe("create");
    expect(result.hasCycles).toBe(false);
    // In create order, users should come before orders
    const usersIdx = result.order.findIndex((o) => o.table === "users");
    const ordersIdx = result.order.findIndex((o) => o.table === "orders");
    expect(usersIdx).toBeLessThan(ordersIdx);
  });

  it("should return tables in drop order (dependents first)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          constraint_name: "fk_orders_user",
          from_schema: "public",
          from_table: "orders",
          from_columns: ["user_id"],
          to_schema: "public",
          to_table: "users",
          to_columns: ["id"],
          on_delete: "CASCADE",
          on_update: "NO ACTION",
        },
      ],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "users",
          row_count: 100,
          size_bytes: 8192,
        },
        {
          schema: "public",
          table_name: "orders",
          row_count: 500,
          size_bytes: 16384,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_topological_sort")!;
    const result = (await tool.handler({ direction: "drop" }, mockContext)) as {
      order: Array<{ table: string }>;
      direction: string;
    };

    expect(result.direction).toBe("drop");
    // In drop order, orders should come before users
    const usersIdx = result.order.findIndex((o) => o.table === "users");
    const ordersIdx = result.order.findIndex((o) => o.table === "orders");
    expect(ordersIdx).toBeLessThan(usersIdx);
  });

  it("should handle self-referencing FKs without false cycles", async () => {
    // employees has a self-reference (manager_id -> id)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          constraint_name: "fk_manager",
          from_schema: "public",
          from_table: "employees",
          from_columns: ["manager_id"],
          to_schema: "public",
          to_table: "employees",
          to_columns: ["id"],
          on_delete: "SET NULL",
          on_update: "NO ACTION",
        },
        {
          constraint_name: "fk_dept",
          from_schema: "public",
          from_table: "employees",
          from_columns: ["dept_id"],
          to_schema: "public",
          to_table: "departments",
          to_columns: ["id"],
          on_delete: "CASCADE",
          on_update: "NO ACTION",
        },
      ],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "departments",
          row_count: 10,
          size_bytes: 8192,
        },
        {
          schema: "public",
          table_name: "employees",
          row_count: 100,
          size_bytes: 16384,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_topological_sort")!;
    const result = (await tool.handler(
      { direction: "create" },
      mockContext,
    )) as {
      order: Array<{ table: string; level: number; dependencies: string[] }>;
      hasCycles: boolean;
    };

    // Self-reference should NOT cause a cycle
    expect(result.hasCycles).toBe(false);
    // departments (level 0) should come before employees (level 1)
    const deptEntry = result.order.find((o) => o.table === "departments");
    const empEntry = result.order.find((o) => o.table === "employees");
    expect(deptEntry!.level).toBe(0);
    expect(empEntry!.level).toBeGreaterThan(0);
  });

  it("should exclude extension schemas by default", async () => {
    // Mock FK and table queries returning empty
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_topological_sort")!;
    await tool.handler({}, mockContext);

    // Verify the FK query includes extension schema exclusion
    const fkQueryCall = mockAdapter.executeQuery.mock.calls[0]!;
    expect(fkQueryCall[0]).toContain("'cron'");
    expect(fkQueryCall[0]).toContain("'topology'");
    expect(fkQueryCall[0]).toContain("'tiger'");
    expect(fkQueryCall[0]).toContain("'tiger_data'");

    // Verify the table query also includes extension schema exclusion
    const tableQueryCall = mockAdapter.executeQuery.mock.calls[1]!;
    expect(tableQueryCall[0]).toContain("'cron'");
    expect(tableQueryCall[0]).toContain("'tiger_data'");
  });

  it("should preserve original dependency levels in drop direction", async () => {
    // 3-level chain: assignments -> projects -> departments
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          constraint_name: "fk_proj_dept",
          from_schema: "public",
          from_table: "projects",
          from_columns: ["dept_id"],
          to_schema: "public",
          to_table: "departments",
          to_columns: ["id"],
          on_delete: "CASCADE",
          on_update: "NO ACTION",
        },
        {
          constraint_name: "fk_assign_proj",
          from_schema: "public",
          from_table: "assignments",
          from_columns: ["project_id"],
          to_schema: "public",
          to_table: "projects",
          to_columns: ["id"],
          on_delete: "CASCADE",
          on_update: "NO ACTION",
        },
      ],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "departments",
          row_count: 10,
          size_bytes: 8192,
        },
        {
          schema: "public",
          table_name: "projects",
          row_count: 50,
          size_bytes: 16384,
        },
        {
          schema: "public",
          table_name: "assignments",
          row_count: 200,
          size_bytes: 32768,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_topological_sort")!;
    const result = (await tool.handler({ direction: "drop" }, mockContext)) as {
      order: Array<{ table: string; level: number }>;
      direction: string;
      hasCycles: boolean;
    };

    expect(result.direction).toBe("drop");
    expect(result.hasCycles).toBe(false);

    // Levels should reflect original dependency depth (not re-computed for drop order)
    const deptEntry = result.order.find((o) => o.table === "departments");
    const projEntry = result.order.find((o) => o.table === "projects");
    const assignEntry = result.order.find((o) => o.table === "assignments");
    expect(deptEntry!.level).toBe(0); // root — no dependencies
    expect(projEntry!.level).toBe(1); // depends on departments
    expect(assignEntry!.level).toBe(2); // depends on projects

    // Drop order: assignments before projects before departments
    const deptIdx = result.order.findIndex((o) => o.table === "departments");
    const projIdx = result.order.findIndex((o) => o.table === "projects");
    const assignIdx = result.order.findIndex((o) => o.table === "assignments");
    expect(assignIdx).toBeLessThan(projIdx);
    expect(projIdx).toBeLessThan(deptIdx);
  });

  it("should return structured error for nonexistent schema", async () => {
    // Schema existence check returns no rows
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_topological_sort")!;
    const result = (await tool.handler(
      { schema: "nonexistent_schema_xyz" },
      mockContext,
    )) as {
      success: false;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("nonexistent_schema_xyz");
    expect(result.error).toContain("does not exist");
  });
});

// =============================================================================
// pg_cascade_simulator
// =============================================================================

describe("pg_cascade_simulator", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getIntrospectionTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getIntrospectionTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should simulate cascade delete impact", async () => {
    // Mock FK query (orders references users with CASCADE)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          constraint_name: "fk_orders_user",
          from_schema: "public",
          from_table: "orders",
          from_columns: ["user_id"],
          to_schema: "public",
          to_table: "users",
          to_columns: ["id"],
          on_delete: "CASCADE",
          on_update: "NO ACTION",
        },
      ],
    });

    // Mock table nodes
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "users",
          row_count: 1000,
          size_bytes: 65536,
        },
        {
          schema: "public",
          table_name: "orders",
          row_count: 5000,
          size_bytes: 131072,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_cascade_simulator")!;
    const result = (await tool.handler({ table: "users" }, mockContext)) as {
      sourceTable: string;
      operation: string;
      affectedTables: Array<{
        table: string;
        action: string;
        estimatedRows: number;
      }>;
      severity: string;
      stats: {
        totalTablesAffected: number;
        cascadeActions: number;
        blockingActions: number;
      };
    };

    expect(result.sourceTable).toBe("public.users");
    expect(result.operation).toBe("DELETE");
    expect(result.affectedTables.length).toBeGreaterThan(0);
    expect(result.stats.cascadeActions).toBe(1);
  });

  it("should detect RESTRICT severity as critical", async () => {
    // orders references users with RESTRICT
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          constraint_name: "fk_orders_user",
          from_schema: "public",
          from_table: "orders",
          from_columns: ["user_id"],
          to_schema: "public",
          to_table: "users",
          to_columns: ["id"],
          on_delete: "RESTRICT",
          on_update: "NO ACTION",
        },
      ],
    });

    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "users",
          row_count: 100,
          size_bytes: 8192,
        },
        {
          schema: "public",
          table_name: "orders",
          row_count: 500,
          size_bytes: 16384,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_cascade_simulator")!;
    const result = (await tool.handler({ table: "users" }, mockContext)) as {
      severity: string;
      stats: { blockingActions: number };
    };

    expect(result.severity).toBe("high");
    expect(result.stats.blockingActions).toBe(1);
  });

  it("should support schema.table format", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_cascade_simulator")!;
    const result = (await tool.handler(
      { table: "app.users" },
      mockContext,
    )) as { success: false; error: string };

    // Table doesn't exist in mock — verify error uses the schema-qualified name
    expect(result.success).toBe(false);
    expect(result.error).toContain("app.users");
  });

  it("should rate DROP operation with cascades as critical severity", async () => {
    // orders references users with CASCADE
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          constraint_name: "fk_orders_user",
          from_schema: "public",
          from_table: "orders",
          from_columns: ["user_id"],
          to_schema: "public",
          to_table: "users",
          to_columns: ["id"],
          on_delete: "RESTRICT",
          on_update: "NO ACTION",
        },
      ],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "users",
          row_count: 100,
          size_bytes: 8192,
        },
        {
          schema: "public",
          table_name: "orders",
          row_count: 500,
          size_bytes: 16384,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_cascade_simulator")!;
    const result = (await tool.handler(
      { table: "users", operation: "DROP" },
      mockContext,
    )) as { severity: string; stats: { cascadeActions: number } };

    // DROP forces CASCADE regardless of the FK ON DELETE rule
    expect(result.severity).toBe("critical");
    expect(result.stats.cascadeActions).toBe(1);
  });

  it("should return error for nonexistent table", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_cascade_simulator")!;
    const result = (await tool.handler(
      { table: "nonexistent_xyz" },
      mockContext,
    )) as { success: false; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
  });

  it("should preserve NO ACTION label (not conflate with RESTRICT)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          constraint_name: "fk_orders_user",
          from_schema: "public",
          from_table: "orders",
          from_columns: ["user_id"],
          to_schema: "public",
          to_table: "users",
          to_columns: ["id"],
          on_delete: "NO ACTION",
          on_update: "NO ACTION",
        },
      ],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "users",
          row_count: 100,
          size_bytes: 8192,
        },
        {
          schema: "public",
          table_name: "orders",
          row_count: 500,
          size_bytes: 16384,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_cascade_simulator")!;
    const result = (await tool.handler({ table: "users" }, mockContext)) as {
      affectedTables: Array<{ table: string; action: string }>;
      stats: { blockingActions: number };
    };

    // action should be "NO ACTION", not "RESTRICT"
    expect(result.affectedTables[0]!.action).toBe("NO ACTION");
    // Still counts as a blocking action
    expect(result.stats.blockingActions).toBe(1);
  });

  it("should preserve RESTRICT label in action field", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          constraint_name: "fk_orders_user",
          from_schema: "public",
          from_table: "orders",
          from_columns: ["user_id"],
          to_schema: "public",
          to_table: "users",
          to_columns: ["id"],
          on_delete: "RESTRICT",
          on_update: "NO ACTION",
        },
      ],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "users",
          row_count: 100,
          size_bytes: 8192,
        },
        {
          schema: "public",
          table_name: "orders",
          row_count: 500,
          size_bytes: 16384,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_cascade_simulator")!;
    const result = (await tool.handler({ table: "users" }, mockContext)) as {
      affectedTables: Array<{ table: string; action: string }>;
    };

    expect(result.affectedTables[0]!.action).toBe("RESTRICT");
  });
});

// =============================================================================
// pg_schema_snapshot
// =============================================================================

describe("pg_schema_snapshot", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getIntrospectionTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getIntrospectionTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return full schema snapshot with all sections", async () => {
    // Mock responses for each section query (9 total: tables, views, indexes,
    // constraints, functions, triggers, sequences, types, extensions)
    for (let i = 0; i < 9; i++) {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ name: `item_${String(i)}` }],
      });
    }

    const tool = tools.find((t) => t.name === "pg_schema_snapshot")!;
    const result = (await tool.handler({}, mockContext)) as {
      snapshot: Record<string, unknown>;
      stats: Record<string, number>;
      generatedAt: string;
    };

    expect(result.snapshot).toBeDefined();
    expect(result.stats).toBeDefined();
    expect(result.generatedAt).toBeDefined();
    expect(typeof result.generatedAt).toBe("string");
  });

  it("should filter by specific sections", async () => {
    // Only 2 queries should fire (tables + constraints)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ name: "users" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ name: "pk_users" }],
    });

    const tool = tools.find((t) => t.name === "pg_schema_snapshot")!;
    const result = (await tool.handler(
      { sections: ["tables", "constraints"] },
      mockContext,
    )) as {
      snapshot: Record<string, unknown>;
      stats: Record<string, number>;
    };

    expect(result.snapshot["tables"]).toBeDefined();
    expect(result.snapshot["constraints"]).toBeDefined();
    expect(result.snapshot["views"]).toBeUndefined();
    expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(2);
  });

  it("should exclude extension schemas by default", async () => {
    // Mock 9 section queries
    for (let i = 0; i < 9; i++) {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    }

    const tool = tools.find((t) => t.name === "pg_schema_snapshot")!;
    await tool.handler({}, mockContext);

    // First call (tables) should contain the extension schema exclusion
    const firstCallSql = mockAdapter.executeQuery.mock.calls[0]![0] as string;
    expect(firstCallSql).toContain("'cron'");
    expect(firstCallSql).toContain("'topology'");
    expect(firstCallSql).toContain("'tiger'");
    expect(firstCallSql).toContain("'tiger_data'");
  });

  it("should include extension schemas when excludeExtensionSchemas is false", async () => {
    // Mock 9 section queries
    for (let i = 0; i < 9; i++) {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    }

    const tool = tools.find((t) => t.name === "pg_schema_snapshot")!;
    await tool.handler({ excludeExtensionSchemas: false }, mockContext);

    // First call (tables) should NOT contain the extension schema exclusion
    const firstCallSql = mockAdapter.executeQuery.mock.calls[0]![0] as string;
    expect(firstCallSql).not.toContain("'cron'");
  });

  it("should exclude extension-owned objects by default", async () => {
    // Mock 9 section queries
    for (let i = 0; i < 9; i++) {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    }

    const tool = tools.find((t) => t.name === "pg_schema_snapshot")!;
    await tool.handler({}, mockContext);

    // Tables query (first call) should contain pg_depend exclusion
    const tablesSql = mockAdapter.executeQuery.mock.calls[0]![0] as string;
    expect(tablesSql).toContain("pg_depend");
    expect(tablesSql).toContain("deptype = 'e'");
  });

  it("should return error for nonexistent schema filter", async () => {
    // Schema existence check returns no rows
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_schema_snapshot")!;
    const result = (await tool.handler(
      { schema: "nonexistent_schema_xyz" },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("nonexistent_schema_xyz");
    expect(result.error).toContain("does not exist");
    // Only the schema existence check query should have been called
    expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(1);
  });

  it("should omit extensions when schema filter is set", async () => {
    // Mock schema existence check + 8 section queries (NOT 9 — extensions query should be skipped)
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ x: 1 }] }); // schema exists
    for (let i = 0; i < 8; i++) {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ name: `item_${i}` }],
      });
    }

    const tool = tools.find((t) => t.name === "pg_schema_snapshot")!;
    const result = (await tool.handler({ schema: "public" }, mockContext)) as {
      snapshot: Record<string, unknown>;
      stats: Record<string, number>;
    };

    // Extensions should be omitted with no extensions query fired
    expect(result.stats["extensions"]).toBeUndefined();
    // Verify no call contained the extensions query (skip first call which is schema check)
    const allSqlCalls = mockAdapter.executeQuery.mock.calls.map(
      (call) => call[0] as string,
    );
    const extensionCall = allSqlCalls.find((sql) =>
      sql.includes("pg_extension"),
    );
    expect(extensionCall).toBeUndefined();
    // 1 schema check + 8 section queries = 9 total
    expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(9);
  });

  it("should omit columns from tables by default (compact: true)", async () => {
    // Mock 9 section queries
    for (let i = 0; i < 9; i++) {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ name: `item_${String(i)}`, schema: "public" }],
      });
    }

    const tool = tools.find((t) => t.name === "pg_schema_snapshot")!;
    const result = (await tool.handler({}, mockContext)) as {
      snapshot: Record<string, unknown>;
      stats: Record<string, number>;
      compact?: boolean;
    };

    expect(result.compact).toBeUndefined();
    // First call (tables query) should NOT contain the columns subquery
    const tablesSql = mockAdapter.executeQuery.mock.calls[0]![0] as string;
    expect(tablesSql).not.toContain("json_agg");
    expect(tablesSql).not.toContain("pg_attribute");
    expect(tablesSql).not.toContain("attname");
  });

  it("should include columns when compact is explicitly false", async () => {
    // Mock 9 section queries
    for (let i = 0; i < 9; i++) {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ name: `item_${String(i)}`, schema: "public" }],
      });
    }

    const tool = tools.find((t) => t.name === "pg_schema_snapshot")!;
    const result = (await tool.handler({ compact: false }, mockContext)) as {
      compact?: boolean;
    };

    // compact should not be in response when false
    expect(result.compact).toBeUndefined();
    // First call (tables query) should contain the columns subquery
    const tablesSql = mockAdapter.executeQuery.mock.calls[0]![0] as string;
    expect(tablesSql).toContain("json_agg");
    expect(tablesSql).toContain("pg_attribute");
    expect(tablesSql).toContain("attname");
  });
});

// =============================================================================
// pg_constraint_analysis
// =============================================================================

describe("pg_constraint_analysis", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getIntrospectionTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getIntrospectionTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should detect tables without primary keys", async () => {
    // missing_pk query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ schema: "public", table_name: "audit_logs" }],
    });
    // unindexed_fk query
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // missing_not_null query
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_constraint_analysis")!;
    const result = (await tool.handler({}, mockContext)) as {
      findings: Array<{ type: string; severity: string; table: string }>;
      summary: { totalFindings: number; byType: Record<string, number> };
    };

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.type).toBe("missing_pk");
    expect(result.findings[0]!.severity).toBe("error");
    expect(result.findings[0]!.table).toBe("public.audit_logs");
    expect(result.summary.totalFindings).toBe(1);
    expect(result.summary.byType["missing_pk"]).toBe(1);
  });

  it("should detect unindexed foreign keys", async () => {
    // missing_pk query
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // unindexed_fk query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          schema: "public",
          table_name: "orders",
          constraint_name: "fk_user",
          columns: ["user_id"],
        },
      ],
    });
    // missing_not_null query
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_constraint_analysis")!;
    const result = (await tool.handler({}, mockContext)) as {
      findings: Array<{ type: string; severity: string }>;
    };

    const fkFinding = result.findings.find((f) => f.type === "unindexed_fk");
    expect(fkFinding).toBeDefined();
    expect(fkFinding!.severity).toBe("warning");
  });

  it("should run only specified checks", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_constraint_analysis")!;
    await tool.handler({ checks: ["missing_pk"] }, mockContext);

    // Only 1 query should have been executed (missing_pk check only)
    expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(1);
  });

  it("should exclude extension schemas by default", async () => {
    // Mock all 3 check queries
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_constraint_analysis")!;
    await tool.handler({}, mockContext);

    // All 3 queries should include extension schema exclusion
    for (let i = 0; i < 3; i++) {
      const sql = mockAdapter.executeQuery.mock.calls[i]![0] as string;
      expect(sql).toContain("'cron'");
      expect(sql).toContain("'tiger_data'");
    }
  });

  it("should return error for nonexistent table", async () => {
    // Table existence check returns no rows → table doesn't exist
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_constraint_analysis")!;
    const result = (await tool.handler(
      { table: "nonexistent_table_xyz" },
      mockContext,
    )) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("nonexistent_table_xyz");
    expect(result.error).toContain("does not exist");
    // Only the table existence check query should have been called
    expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// pg_migration_risks
// =============================================================================

describe("pg_migration_risks", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getIntrospectionTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getIntrospectionTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should detect DROP TABLE as critical risk", async () => {
    const tool = tools.find((t) => t.name === "pg_migration_risks")!;
    const result = (await tool.handler(
      { statements: ["DROP TABLE users"] },
      mockContext,
    )) as {
      risks: Array<{
        severity: string;
        category: string;
        statement: string;
      }>;
      summary: {
        totalStatements: number;
        totalRisks: number;
        highestSeverity: string;
      };
    };

    expect(result.risks.length).toBeGreaterThan(0);
    expect(result.risks[0]!.severity).toBe("critical");
    expect(result.risks[0]!.category).toBe("data_loss");
    expect(result.summary.highestSeverity).toBe("critical");
    expect(result.summary.totalStatements).toBe(1);
  });

  it("should detect CREATE INDEX without CONCURRENTLY as high risk", async () => {
    const tool = tools.find((t) => t.name === "pg_migration_risks")!;
    const result = (await tool.handler(
      { statements: ["CREATE INDEX idx_email ON users(email)"] },
      mockContext,
    )) as {
      risks: Array<{ severity: string; category: string }>;
    };

    const lockingRisk = result.risks.find((r) => r.category === "locking");
    expect(lockingRisk).toBeDefined();
    expect(lockingRisk!.severity).toBe("high");
  });

  it("should detect CREATE INDEX CONCURRENTLY as low risk", async () => {
    const tool = tools.find((t) => t.name === "pg_migration_risks")!;
    const result = (await tool.handler(
      {
        statements: ["CREATE INDEX CONCURRENTLY idx_email ON users(email)"],
      },
      mockContext,
    )) as {
      risks: Array<{ severity: string }>;
      summary: { highestSeverity: string };
    };

    expect(result.risks.length).toBeGreaterThan(0);
    expect(result.summary.highestSeverity).toBe("low");
  });

  it("should report no risks for safe DDL", async () => {
    const tool = tools.find((t) => t.name === "pg_migration_risks")!;
    const result = (await tool.handler(
      { statements: ["SELECT 1"] },
      mockContext,
    )) as {
      risks: unknown[];
      summary: { totalRisks: number; highestSeverity: string };
    };

    expect(result.risks).toBeUndefined();
    expect(result.summary.totalRisks).toBe(0);
    expect(result.summary.highestSeverity).toBe("low");
  });

  it("should analyze multiple statements", async () => {
    const tool = tools.find((t) => t.name === "pg_migration_risks")!;
    const result = (await tool.handler(
      {
        statements: [
          "ALTER TABLE users ADD COLUMN bio TEXT",
          "DROP TABLE old_users",
          "CREATE INDEX CONCURRENTLY idx_bio ON users(bio)",
        ],
      },
      mockContext,
    )) as {
      risks: Array<{ statementIndex: number }>;
      summary: { totalStatements: number; highestSeverity: string };
    };

    expect(result.summary.totalStatements).toBe(3);
    expect(result.summary.highestSeverity).toBe("critical");
  });

  it("should detect column type change as requiring downtime", async () => {
    const tool = tools.find((t) => t.name === "pg_migration_risks")!;
    const result = (await tool.handler(
      {
        statements: ["ALTER TABLE users ALTER COLUMN age TYPE bigint"],
      },
      mockContext,
    )) as {
      summary: { requiresDowntime: boolean };
    };

    expect(result.summary.requiresDowntime).toBe(true);
  });
});

// =============================================================================
// pg_migration_init
// =============================================================================

describe("pg_migration_init", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMigrationTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMigrationTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should create tracking table on first call", async () => {
    // Table does not exist
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: false }],
    });
    // CREATE TABLE IF NOT EXISTS
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // COUNT query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ count: 0 }],
    });

    const tool = tools.find((t) => t.name === "pg_migration_init")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      tableCreated: boolean;
      existingRecords: number;
    };

    expect(result.success).toBe(true);
    expect(result.tableCreated).toBe(true);
    expect(result.existingRecords).toBe(0);
  });

  it("should be idempotent when table already exists", async () => {
    // Table already exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    // COUNT query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ count: 3 }],
    });

    const tool = tools.find((t) => t.name === "pg_migration_init")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      tableCreated: boolean;
      existingRecords: number;
    };

    expect(result.success).toBe(true);
    expect(result.tableCreated).toBe(false);
    expect(result.existingRecords).toBe(3);
  });

  it("should create tracking table in custom schema", async () => {
    // Table does not exist in custom schema
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: false }],
    });
    // CREATE TABLE IF NOT EXISTS in custom schema
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // COUNT query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ count: 0 }],
    });

    const tool = tools.find((t) => t.name === "pg_migration_init")!;
    const result = (await tool.handler({ schema: "app" }, mockContext)) as {
      success: boolean;
      tableCreated: boolean;
      tableName: string;
    };

    expect(result.success).toBe(true);
    expect(result.tableCreated).toBe(true);
    // Verify schema-qualified name uses sanitized identifier
    expect(result.tableName).toContain('"app"');
    expect(result.tableName).toContain("_mcp_schema_versions");

    // Verify CREATE TABLE SQL references the custom schema
    const createCall = mockAdapter.executeQuery.mock.calls[1]![0] as string;
    expect(createCall).toContain('"app"');
    expect(createCall).toContain("CREATE TABLE IF NOT EXISTS");
  });
});

// =============================================================================
// pg_migration_record
// =============================================================================

describe("pg_migration_record", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMigrationTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMigrationTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should record a migration successfully with status 'recorded'", async () => {
    // ensureTrackingTable: exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    // Duplicate check: no duplicates
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT RETURNING *
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          version: "1.0.0",
          description: "Add users table",
          applied_at: new Date("2026-01-01T00:00:00Z"),
          applied_by: "agent",
          migration_hash: "abc123",
          source_system: "agent",
          status: "recorded",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_migration_record")!;
    const result = (await tool.handler(
      {
        version: "1.0.0",
        description: "Add users table",
        migrationSql: "CREATE TABLE users (id SERIAL PRIMARY KEY)",
        sourceSystem: "agent",
      },
      mockContext,
    )) as { success: boolean; record?: { version: string; status: string } };

    expect(result.success).toBe(true);
    expect(result.record).toBeDefined();
    expect(result.record!.version).toBe("1.0.0");
    expect(result.record!.status).toBe("recorded");

    // Verify INSERT SQL uses 'recorded' status
    const insertCall = mockAdapter.executeQuery.mock.calls[2]![0] as string;
    expect(insertCall).toContain("'recorded'");
  });

  it("should detect duplicate migration by hash", async () => {
    // ensureTrackingTable: exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    // Duplicate check: found duplicate
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1, version: "1.0.0", status: "applied" }],
    });

    const tool = tools.find((t) => t.name === "pg_migration_record")!;
    const result = (await tool.handler(
      {
        version: "1.0.1",
        migrationSql: "CREATE TABLE users (id SERIAL PRIMARY KEY)",
      },
      mockContext,
    )) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Duplicate migration");
  });

  it("should return structured error for missing version", async () => {
    const tool = tools.find((t) => t.name === "pg_migration_record")!;
    const result = (await tool.handler(
      {
        migrationSql: "CREATE TABLE users (id SERIAL PRIMARY KEY)",
      },
      mockContext,
    )) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("Validation error");
  });

  it("should return structured error for missing migrationSql", async () => {
    const tool = tools.find((t) => t.name === "pg_migration_record")!;
    const result = (await tool.handler(
      {
        version: "1.0.0",
      },
      mockContext,
    )) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("Validation error");
  });
});

// =============================================================================
// pg_migration_apply
// =============================================================================

describe("pg_migration_apply", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMigrationTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMigrationTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should execute migration SQL and record atomically", async () => {
    // ensureTrackingTable: exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    // Duplicate check: no duplicates
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Execute migration SQL
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT RETURNING *
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          version: "1.0.0",
          description: "Add users table",
          applied_at: new Date("2026-01-01T00:00:00Z"),
          applied_by: "agent",
          migration_hash: "abc123",
          source_system: "agent",
          status: "applied",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_migration_apply")!;
    const result = (await tool.handler(
      {
        version: "1.0.0",
        description: "Add users table",
        migrationSql: "CREATE TABLE users (id SERIAL PRIMARY KEY)",
        rollbackSql: "DROP TABLE users",
        sourceSystem: "agent",
      },
      mockContext,
    )) as { success: boolean; record?: { version: string }; error?: string };

    if (!result.success) console.error("XYZ-ERROR", result.error);

    expect(result.success).toBe(true);
    expect(result.record).toBeDefined();
    expect(result.record!.version).toBe("1.0.0");

    // Verify BEGIN was called
    expect(mockAdapter.beginTransaction).toHaveBeenCalled();
    // Verify migration SQL was executed
    expect(mockAdapter.executeOnConnection).toHaveBeenCalledWith(
      expect.anything(),
      "CREATE TABLE users (id SERIAL PRIMARY KEY)",
    );
    // Verify COMMIT was called
    expect(mockAdapter.commitTransaction).toHaveBeenCalled();
  });

  it("should rollback and record failed entry on SQL error", async () => {
    // ensureTrackingTable: exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    // Duplicate check: no duplicates
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Execute migration SQL — FAILS
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error('relation "users" already exists'),
    );
    // INSERT failed record (best-effort)
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_migration_apply")!;
    const result = (await tool.handler(
      {
        version: "1.0.0",
        migrationSql: "CREATE TABLE users (id SERIAL PRIMARY KEY)",
      },
      mockContext,
    )) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("already exists");
    expect(result.error).toContain("rolled back");

    // Verify ROLLBACK was called
    expect(mockAdapter.rollbackTransaction).toHaveBeenCalled();
    // Verify failed record was inserted
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("'failed'"),
      expect.any(Array),
    );
  });

  it("should detect duplicate migration by hash", async () => {
    // ensureTrackingTable: exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    // Duplicate check: found duplicate
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1, version: "1.0.0", status: "applied" }],
    });

    const tool = tools.find((t) => t.name === "pg_migration_apply")!;
    const result = (await tool.handler(
      {
        version: "1.0.1",
        migrationSql: "CREATE TABLE users (id SERIAL PRIMARY KEY)",
      },
      mockContext,
    )) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Duplicate migration");
    // Should NOT have called BEGIN (rejected before execution)
    expect(mockAdapter.beginTransaction).not.toHaveBeenCalled();
  });

  it("should return structured error for missing version", async () => {
    const tool = tools.find((t) => t.name === "pg_migration_apply")!;
    const result = (await tool.handler(
      {
        migrationSql: "CREATE TABLE users (id SERIAL PRIMARY KEY)",
      },
      mockContext,
    )) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("Validation error");
  });

  it("should return structured error for missing migrationSql", async () => {
    const tool = tools.find((t) => t.name === "pg_migration_apply")!;
    const result = (await tool.handler(
      {
        version: "1.0.0",
      },
      mockContext,
    )) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("Validation error");
  });

  it("should still return migration error when failed-record INSERT also throws", async () => {
    // ensureTrackingTable: exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    // Duplicate check: no duplicates
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Execute migration SQL — FAILS
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error('syntax error at or near "CRATE"'),
    );
    // INSERT failed record — ALSO FAILS (best-effort path)
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("connection lost"),
    );

    const tool = tools.find((t) => t.name === "pg_migration_apply")!;
    const result = (await tool.handler(
      {
        version: "1.0.0",
        migrationSql: "CRATE TABLE users (id INT)",
      },
      mockContext,
    )) as { success: boolean; error?: string };

    // Original migration error should still be returned
    expect(result.success).toBe(false);
    expect(result.error).toContain("CRATE");
    expect(result.error).toContain("rolled back");
  });
});

// =============================================================================
// pg_migration_rollback
// =============================================================================

describe("pg_migration_rollback", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMigrationTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMigrationTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return rollback SQL in dry-run mode", async () => {
    // ensureTrackingTable: exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    // Find migration
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          version: "1.0.0",
          description: "Add users",
          applied_at: new Date("2026-01-01T00:00:00Z"),
          applied_by: "agent",
          migration_hash: "abc123",
          source_system: "agent",
          rollback_sql: "DROP TABLE users",
          status: "applied",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_migration_rollback")!;
    const result = (await tool.handler(
      { version: "1.0.0", dryRun: true },
      mockContext,
    )) as {
      success: boolean;
      dryRun: boolean;
      rollbackSql: string;
      record: { version: string };
    };

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.rollbackSql).toBe("DROP TABLE users");
    expect(result.record.version).toBe("1.0.0");
  });

  it("should return error for nonexistent migration", async () => {
    // ensureTrackingTable: exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    // Find migration: none
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_migration_rollback")!;
    const result = (await tool.handler(
      { version: "nonexistent" },
      mockContext,
    )) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("should require id or version", async () => {
    // ensureTrackingTable: exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });

    const tool = tools.find((t) => t.name === "pg_migration_rollback")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error?: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Either");
  });

  it("should execute rollback SQL and update status in transaction", async () => {
    // ensureTrackingTable: exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    // Find migration
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 5,
          version: "1.0.0",
          description: "Add users",
          applied_at: new Date("2026-01-01T00:00:00Z"),
          applied_by: "agent",
          migration_hash: "abc123",
          source_system: "agent",
          rollback_sql: "DROP TABLE users",
          status: "applied",
        },
      ],
    });
    // BEGIN
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Execute rollback SQL
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // UPDATE status
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // COMMIT
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_migration_rollback")!;
    const result = (await tool.handler({ version: "1.0.0" }, mockContext)) as {
      success: boolean;
      dryRun: boolean;
      rollbackSql: string;
      record: { status: string };
    };

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(result.rollbackSql).toBe("DROP TABLE users");
    expect(result.record.status).toBe("rolled_back");

    // Verify transaction sequence
    expect(mockAdapter.beginTransaction).toHaveBeenCalled();
    expect(mockAdapter.executeOnConnection).toHaveBeenCalledWith(
      expect.anything(),
      "DROP TABLE users",
    );
    expect(mockAdapter.commitTransaction).toHaveBeenCalled();
  });

  it("should reject already-rolled-back migration", async () => {
    // ensureTrackingTable: exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    // Find migration: status is rolled_back
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 5,
          version: "1.0.0",
          description: "Add users",
          applied_at: new Date("2026-01-01T00:00:00Z"),
          applied_by: "agent",
          migration_hash: "abc123",
          source_system: "agent",
          rollback_sql: "DROP TABLE users",
          status: "rolled_back",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_migration_rollback")!;
    const result = (await tool.handler({ version: "1.0.0" }, mockContext)) as {
      success: boolean;
      error?: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("already been rolled back");
  });

  it("should return error when rollback_sql is null", async () => {
    // ensureTrackingTable: exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    // Find migration: no rollback_sql
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 5,
          version: "1.0.0",
          description: "Add users",
          applied_at: new Date("2026-01-01T00:00:00Z"),
          applied_by: "agent",
          migration_hash: "abc123",
          source_system: "agent",
          rollback_sql: null,
          status: "applied",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_migration_rollback")!;
    const result = (await tool.handler({ version: "1.0.0" }, mockContext)) as {
      success: boolean;
      error?: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("no rollback SQL");
  });

  it("should rollback transaction and return error on rollback SQL failure", async () => {
    // ensureTrackingTable: exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    // Find migration
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 5,
          version: "1.0.0",
          description: "Add users",
          applied_at: new Date("2026-01-01T00:00:00Z"),
          applied_by: "agent",
          migration_hash: "abc123",
          source_system: "agent",
          rollback_sql: "DROP TABLE users",
          status: "applied",
        },
      ],
    });
    // Execute rollback SQL — FAILS
    mockAdapter.executeOnConnection.mockRejectedValueOnce(
      new Error('table "users" does not exist'),
    );

    const tool = tools.find((t) => t.name === "pg_migration_rollback")!;
    const result = (await tool.handler({ version: "1.0.0" }, mockContext)) as {
      success: boolean;
      error?: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Rollback failed");
    expect(result.error).toContain('table "users" does not exist');
    expect(mockAdapter.rollbackTransaction).toHaveBeenCalled();
  });
});

// =============================================================================
// pg_migration_history
// =============================================================================

describe("pg_migration_history", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMigrationTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMigrationTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return paginated migration history", async () => {
    // ensureTrackingTable: exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    // COUNT query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ count: 2 }],
    });
    // Data query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 2,
          version: "1.1.0",
          description: "Add orders",
          applied_at: new Date("2026-01-02T00:00:00Z"),
          applied_by: "agent",
          migration_hash: "def456",
          source_system: "agent",
          has_rollback: true,
          status: "applied",
        },
        {
          id: 1,
          version: "1.0.0",
          description: "Add users",
          applied_at: new Date("2026-01-01T00:00:00Z"),
          applied_by: "agent",
          migration_hash: "abc123",
          source_system: "agent",
          has_rollback: false,
          status: "applied",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_migration_history")!;
    const result = (await tool.handler({}, mockContext)) as {
      records: Array<{ version: string }>;
      total: number;
      limit: number;
      offset: number;
    };

    expect(result.total).toBe(2);
    expect(result.records).toHaveLength(2);
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it("should filter by status parameter", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ count: 1 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          version: "1.0.0",
          description: "init",
          applied_at: "2026-01-01T00:00:00Z",
          applied_by: "agent",
          migration_hash: "abc",
          source_system: "agent",
          has_rollback: false,
          status: "applied",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_migration_history")!;
    await tool.handler({ status: "applied" }, mockContext);

    // COUNT query should include WHERE status = $1
    const countCallSql = mockAdapter.executeQuery.mock.calls[1]![0] as string;
    expect(countCallSql).toContain("status = $1");
    const countCallParams = mockAdapter.executeQuery.mock
      .calls[1]![1] as unknown[];
    expect(countCallParams).toContain("applied");
  });

  it("should filter by sourceSystem parameter", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ count: 1 }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          version: "1.0.0",
          description: "init",
          applied_at: "2026-01-01T00:00:00Z",
          applied_by: "agent",
          migration_hash: "abc",
          source_system: "agent",
          has_rollback: false,
          status: "applied",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_migration_history")!;
    await tool.handler({ sourceSystem: "agent" }, mockContext);

    // COUNT query should include WHERE source_system = $1
    const countCallSql = mockAdapter.executeQuery.mock.calls[1]![0] as string;
    expect(countCallSql).toContain("source_system = $1");
    const countCallParams = mockAdapter.executeQuery.mock
      .calls[1]![1] as unknown[];
    expect(countCallParams).toContain("agent");
  });
});

// =============================================================================
// pg_migration_status
// =============================================================================

describe("pg_migration_status", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMigrationTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMigrationTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return uninitialized status when table doesn't exist", async () => {
    // Table does not exist
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: false }],
    });

    const tool = tools.find((t) => t.name === "pg_migration_status")!;
    const result = (await tool.handler({}, mockContext)) as {
      initialized: boolean;
      latestVersion: string | null;
      counts: { total: number };
    };

    expect(result.initialized).toBe(false);
    expect(result.latestVersion).toBeNull();
    expect(result.counts.total).toBe(0);
  });

  it("should return aggregate status", async () => {
    // Table exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    // Stats query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 5, applied: 4, rolled_back: 1, failed: 0 }],
    });
    // Latest query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          version: "2.0.0",
          applied_at: new Date("2026-02-01T00:00:00Z"),
        },
      ],
    });
    // Source systems query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ source_system: "agent" }, { source_system: "manual" }],
    });

    const tool = tools.find((t) => t.name === "pg_migration_status")!;
    const result = (await tool.handler({}, mockContext)) as {
      initialized: boolean;
      latestVersion: string;
      counts: {
        total: number;
        applied: number;
        rolledBack: number;
        failed: number;
      };
      sourceSystems: string[];
    };

    expect(result.initialized).toBe(true);
    expect(result.latestVersion).toBe("2.0.0");
    expect(result.counts.total).toBe(5);
    expect(result.counts.applied).toBe(4);
    expect(result.counts.rolledBack).toBe(1);
    expect(result.sourceSystems).toEqual(["agent", "manual"]);
  });
});

// ==========================================================================
// Coverage-targeted tests for migration.ts uncovered branches
// ==========================================================================

describe("pg_migration_init — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMigrationTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMigrationTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should handle outer error gracefully", async () => {
    // pg_tables check throws
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("connection refused"),
    );

    const tool = tools.find((t) => t.name === "pg_migration_init")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("connection refused");
  });
});

describe("pg_migration_record — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMigrationTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMigrationTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return error when INSERT RETURNING returns empty rows", async () => {
    // ensureTrackingTable: table exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    // checkDuplicateHash: no duplicate
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT RETURNING: empty (edge case)
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_migration_record")!;
    const result = (await tool.handler(
      {
        version: "1.0.0",
        migrationSql: "CREATE TABLE foo (id int)",
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to insert");
  });
});

describe("pg_migration_apply — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMigrationTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMigrationTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return error when INSERT RETURNING is empty after COMMIT", async () => {
    // ensureTrackingTable: table exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    // checkDuplicateHash: no duplicate
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Execute migration SQL
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT RETURNING: empty
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_migration_apply")!;
    const result = (await tool.handler(
      {
        version: "1.0.0",
        migrationSql: "CREATE TABLE bar (id int)",
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("failed to insert tracking record");
  });

  it("should record failed entry and rollback on SQL error", async () => {
    // ensureTrackingTable: table exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    // checkDuplicateHash: no duplicate
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Migration SQL fails
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("syntax error at position 42"),
    );
    // Record failed entry
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_migration_apply")!;
    const result = (await tool.handler(
      {
        version: "1.0.0",
        migrationSql: "INVALID SQL STATEMENT;",
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("syntax error");
    expect(result.error).toContain("rolled back");
    // Verify ROLLBACK was called
    expect(mockAdapter.rollbackTransaction).toHaveBeenCalled();
  });
});

describe("pg_migration_rollback — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMigrationTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMigrationTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return error when id is NaN (coerceNumber returns undefined)", async () => {
    const tool = tools.find((t) => t.name === "pg_migration_rollback")!;
    const result = (await tool.handler({ id: NaN }, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    // coerceNumber converts NaN → undefined, so handler sees no id/version
    expect(result.error).toContain("Either");
  });

  it("should return error when migration is already rolled back", async () => {
    // ensureTrackingTable: table exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    // Find migration
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          version: "1.0.0",
          status: "rolled_back",
          rollback_sql: "DROP TABLE foo",
          applied_at: "2026-01-01",
          migration_hash: "abc",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_migration_rollback")!;
    const result = (await tool.handler({ id: 1 }, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("already been rolled back");
  });

  it("should return error when no rollback SQL is stored", async () => {
    // ensureTrackingTable: table exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    // Find migration - no rollback_sql
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 2,
          version: "2.0.0",
          status: "applied",
          rollback_sql: null,
          applied_at: "2026-01-01",
          migration_hash: "def",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_migration_rollback")!;
    const result = (await tool.handler({ id: 2 }, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("no rollback SQL stored");
  });

  it("should handle rollback SQL execution failure", async () => {
    // ensureTrackingTable: table exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    // Find migration
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 3,
          version: "3.0.4",
          status: "applied",
          rollback_sql: "DROP TABLE foo CASCADE",
          applied_at: "2026-01-01",
          migration_hash: "ghi",
        },
      ],
    });
    // Rollback SQL fails
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("table does not exist"),
    );

    const tool = tools.find((t) => t.name === "pg_migration_rollback")!;
    const result = (await tool.handler({ id: 3 }, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Rollback failed");
    expect(result.error).toContain("table does not exist");
  });

  it("should handle outer error gracefully", async () => {
    // ensureTrackingTable fails
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("connection timeout"),
    );

    const tool = tools.find((t) => t.name === "pg_migration_rollback")!;
    const result = (await tool.handler({ version: "1.0.0" }, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("connection timeout");
  });
});

describe("pg_migration_history — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMigrationTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMigrationTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should handle outer error gracefully", async () => {
    // ensureTrackingTable fails
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("database offline"),
    );

    const tool = tools.find((t) => t.name === "pg_migration_history")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("database offline");
  });
});

describe("pg_migration_status — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getMigrationTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getMigrationTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should handle outer error gracefully", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("permission denied"),
    );

    const tool = tools.find((t) => t.name === "pg_migration_status")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("permission denied");
  });

  it("should handle string applied_at (non-Date) in latest result", async () => {
    // Table exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ table_exists: true }],
    });
    // Stats query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 1, applied: 1, recorded: 0, rolled_back: 0, failed: 0 }],
    });
    // Latest query with string applied_at (not Date object)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ version: "1.0.0", applied_at: "2026-01-15T12:00:00Z" }],
    });
    // Source systems query
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_migration_status")!;
    const result = (await tool.handler({}, mockContext)) as {
      initialized: boolean;
      latestVersion: string;
      latestAppliedAt: string;
    };

    expect(result.initialized).toBe(true);
    expect(result.latestVersion).toBe("1.0.0");
    expect(result.latestAppliedAt).toBe("2026-01-15T12:00:00Z");
  });
});
