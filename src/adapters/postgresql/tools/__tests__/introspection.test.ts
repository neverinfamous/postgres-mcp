/**
 * postgres-mcp - Introspection Tools Unit Tests
 *
 * Tests for agent-optimized introspection tools: dependency graphs,
 * topological sort, cascade simulation, schema snapshots,
 * constraint analysis, and migration risk analysis.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getIntrospectionTools } from "../introspection.js";
import type { PostgresAdapter } from "../../PostgresAdapter.js";
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
    expect(result.circularDependencies).toHaveLength(0);
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
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_dependency_graph")!;
    await tool.handler({ schema: "app" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("$1"),
      ["app"],
    );
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
        restrictActions: number;
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
      stats: { restrictActions: number };
    };

    expect(result.severity).toBe("critical");
    expect(result.stats.restrictActions).toBe(1);
  });

  it("should support schema.table format", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_cascade_simulator")!;
    const result = (await tool.handler(
      { table: "app.users" },
      mockContext,
    )) as { sourceTable: string };

    expect(result.sourceTable).toBe("app.users");
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
        riskLevel: string;
        category: string;
        statement: string;
      }>;
      summary: {
        totalStatements: number;
        totalRisks: number;
        highestRisk: string;
      };
    };

    expect(result.risks.length).toBeGreaterThan(0);
    expect(result.risks[0]!.riskLevel).toBe("critical");
    expect(result.risks[0]!.category).toBe("data_loss");
    expect(result.summary.highestRisk).toBe("critical");
    expect(result.summary.totalStatements).toBe(1);
  });

  it("should detect CREATE INDEX without CONCURRENTLY as high risk", async () => {
    const tool = tools.find((t) => t.name === "pg_migration_risks")!;
    const result = (await tool.handler(
      { statements: ["CREATE INDEX idx_email ON users(email)"] },
      mockContext,
    )) as {
      risks: Array<{ riskLevel: string; category: string }>;
    };

    const lockingRisk = result.risks.find((r) => r.category === "locking");
    expect(lockingRisk).toBeDefined();
    expect(lockingRisk!.riskLevel).toBe("high");
  });

  it("should detect CREATE INDEX CONCURRENTLY as low risk", async () => {
    const tool = tools.find((t) => t.name === "pg_migration_risks")!;
    const result = (await tool.handler(
      {
        statements: ["CREATE INDEX CONCURRENTLY idx_email ON users(email)"],
      },
      mockContext,
    )) as {
      risks: Array<{ riskLevel: string }>;
      summary: { highestRisk: string };
    };

    expect(result.risks.length).toBeGreaterThan(0);
    expect(result.summary.highestRisk).toBe("low");
  });

  it("should report no risks for safe DDL", async () => {
    const tool = tools.find((t) => t.name === "pg_migration_risks")!;
    const result = (await tool.handler(
      { statements: ["SELECT 1"] },
      mockContext,
    )) as {
      risks: unknown[];
      summary: { totalRisks: number; highestRisk: string };
    };

    expect(result.risks).toHaveLength(0);
    expect(result.summary.totalRisks).toBe(0);
    expect(result.summary.highestRisk).toBe("low");
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
      summary: { totalStatements: number; highestRisk: string };
    };

    expect(result.summary.totalStatements).toBe(3);
    expect(result.summary.highestRisk).toBe("critical");
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
