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

  it("should return 11 introspection tools", () => {
    expect(tools).toHaveLength(11);
  });

  it("should have all expected tool names", () => {
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("pg_dependency_graph");
    expect(toolNames).toContain("pg_topological_sort");
    expect(toolNames).toContain("pg_cascade_simulator");
    expect(toolNames).toContain("pg_schema_snapshot");
    expect(toolNames).toContain("pg_constraint_analysis");
    expect(toolNames).toContain("pg_migration_risks");
    expect(toolNames).toContain("pg_migration_init");
    expect(toolNames).toContain("pg_migration_record");
    expect(toolNames).toContain("pg_migration_rollback");
    expect(toolNames).toContain("pg_migration_history");
    expect(toolNames).toContain("pg_migration_status");
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
    )) as { error?: string; severity: string; affectedTables: unknown[] };

    expect(result.error).toBeDefined();
    expect(result.error).toContain("not found");
    expect(result.affectedTables).toHaveLength(0);
    expect(result.severity).toBe("low");
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

// =============================================================================
// pg_migration_init
// =============================================================================

describe("pg_migration_init", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getIntrospectionTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getIntrospectionTools(mockAdapter as unknown as PostgresAdapter);
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
});

// =============================================================================
// pg_migration_record
// =============================================================================

describe("pg_migration_record", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getIntrospectionTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getIntrospectionTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should record a migration successfully", async () => {
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
          status: "applied",
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
    )) as { success: boolean; record?: { version: string } };

    expect(result.success).toBe(true);
    expect(result.record).toBeDefined();
    expect(result.record!.version).toBe("1.0.0");
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
});

// =============================================================================
// pg_migration_rollback
// =============================================================================

describe("pg_migration_rollback", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getIntrospectionTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getIntrospectionTools(mockAdapter as unknown as PostgresAdapter);
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
});

// =============================================================================
// pg_migration_history
// =============================================================================

describe("pg_migration_history", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getIntrospectionTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getIntrospectionTools(mockAdapter as unknown as PostgresAdapter);
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
});

// =============================================================================
// pg_migration_status
// =============================================================================

describe("pg_migration_status", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getIntrospectionTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getIntrospectionTools(mockAdapter as unknown as PostgresAdapter);
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
