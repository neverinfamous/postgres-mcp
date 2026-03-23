/**
 * postgres-mcp - Prompts Unit Tests
 *
 * Tests for PostgreSQL prompts verifying structure, handlers,
 * and proper argument handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPostgresPrompts } from "../index.js";
import type { PostgresAdapter } from "../../postgres-adapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../__tests__/mocks/index.js";

describe("getPostgresPrompts", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let prompts: ReturnType<typeof getPostgresPrompts>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    // Mock getToolDefinitions to return sample tools for tool index prompt
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([
      {
        name: "pg_read_query",
        description: "Execute a read query",
        group: "core",
      },
      {
        name: "pg_write_query",
        description: "Execute a write query",
        group: "core",
      },
    ]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
  });

  it("should return 20 prompts", () => {
    expect(prompts).toHaveLength(20);
  });

  it("should have all expected prompt names", () => {
    const promptNames = prompts.map((p) => p.name);

    // Original prompts
    expect(promptNames).toContain("pg_query_builder");
    expect(promptNames).toContain("pg_schema_design");
    expect(promptNames).toContain("pg_performance_analysis");
    expect(promptNames).toContain("pg_migration");
    expect(promptNames).toContain("pg_tool_index");
    expect(promptNames).toContain("pg_quick_query");
    expect(promptNames).toContain("pg_quick_schema");

    // Health and optimization prompts
    expect(promptNames).toContain("pg_database_health_check");
    expect(promptNames).toContain("pg_backup_strategy");
    expect(promptNames).toContain("pg_index_tuning");
    expect(promptNames).toContain("pg_extension_setup");

    // Extension setup prompts
    expect(promptNames).toContain("pg_setup_pgvector");
    expect(promptNames).toContain("pg_setup_postgis");
    expect(promptNames).toContain("pg_setup_pgcron");
    expect(promptNames).toContain("pg_setup_partman");
    expect(promptNames).toContain("pg_setup_kcache");
    expect(promptNames).toContain("pg_setup_citext");
    expect(promptNames).toContain("pg_setup_ltree");
    expect(promptNames).toContain("pg_setup_pgcrypto");

    // Audit & restore prompts
    expect(promptNames).toContain("pg_safe_restore_workflow");
  });

  it("should have handler function for all prompts", () => {
    for (const prompt of prompts) {
      expect(typeof prompt.handler).toBe("function");
    }
  });

  it("should have required description for all prompts", () => {
    for (const prompt of prompts) {
      expect(prompt.description).toBeDefined();
      expect(prompt.description.length).toBeGreaterThan(0);
    }
  });
});

describe("pg_query_builder prompt", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should require tables and operation arguments", () => {
    const prompt = prompts.find((p) => p.name === "pg_query_builder")!;
    expect(prompt.arguments).toHaveLength(2);
    expect(prompt.arguments?.find((a) => a.name === "tables")?.required).toBe(
      true,
    );
    expect(
      prompt.arguments?.find((a) => a.name === "operation")?.required,
    ).toBe(true);
  });

  it("should generate query guidance with tables and operation", async () => {
    const prompt = prompts.find((p) => p.name === "pg_query_builder")!;
    const result = await prompt.handler(
      { tables: "users,orders", operation: "JOIN" },
      mockContext,
    );

    expect(result).toContain("users,orders");
    expect(result).toContain("JOIN");
    expect(result).toContain("parameterized queries");
  });
});

describe("pg_schema_design prompt", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should accept useCase and optional requirements", () => {
    const prompt = prompts.find((p) => p.name === "pg_schema_design")!;
    expect(prompt.arguments?.find((a) => a.name === "useCase")?.required).toBe(
      true,
    );
    expect(
      prompt.arguments?.find((a) => a.name === "requirements")?.required,
    ).toBe(false);
  });

  it("should generate schema design guidance", async () => {
    const prompt = prompts.find((p) => p.name === "pg_schema_design")!;
    const result = await prompt.handler(
      {
        useCase: "E-commerce platform",
        requirements: "Must support 1M users",
      },
      mockContext,
    );

    expect(result).toContain("E-commerce platform");
    expect(result).toContain("1M users");
    expect(result).toContain("data types");
  });
});

describe("pg_performance_analysis prompt", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should accept query and optional context", () => {
    const prompt = prompts.find((p) => p.name === "pg_performance_analysis")!;
    expect(prompt.arguments?.find((a) => a.name === "query")?.required).toBe(
      true,
    );
    expect(prompt.arguments?.find((a) => a.name === "context")?.required).toBe(
      false,
    );
  });

  it("should generate performance analysis guidance", async () => {
    const prompt = prompts.find((p) => p.name === "pg_performance_analysis")!;
    const result = await prompt.handler(
      {
        query: "SELECT * FROM users WHERE email LIKE $1",
        context: "Table has 10M rows",
      },
      mockContext,
    );

    expect(result).toContain("SELECT * FROM users");
    expect(result).toContain("10M rows");
    expect(result).toContain("pg_explain");
  });
});

describe("pg_migration prompt", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should generate migration guidance", async () => {
    const prompt = prompts.find((p) => p.name === "pg_migration")!;
    const result = await prompt.handler(
      {
        change: "Add email column",
        table: "users",
      },
      mockContext,
    );

    expect(result).toContain("Add email column");
    expect(result).toContain("users");
    expect(result).toContain("Up Migration");
    expect(result).toContain("Down Migration");
  });
});

describe("pg_tool_index prompt", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([
      {
        name: "pg_read_query",
        description: "Execute a read query. Returns rows.",
        group: "core",
      },
      {
        name: "pg_write_query",
        description: "Execute a write query. Returns affected rows.",
        group: "core",
      },
      {
        name: "pg_explain",
        description: "Explain a query plan.",
        group: "performance",
      },
    ]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should generate tool index with groups", async () => {
    const prompt = prompts.find((p) => p.name === "pg_tool_index")!;
    const result = await prompt.handler({}, mockContext);

    expect(result).toContain("PostgreSQL MCP Tools");
    expect(result).toContain("core");
    expect(result).toContain("pg_read_query");
  });
});

describe("pg_quick_query prompt", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should generate quick query guidance", async () => {
    const prompt = prompts.find((p) => p.name === "pg_quick_query")!;
    const result = await prompt.handler(
      {
        action: "find users by email",
      },
      mockContext,
    );

    expect(result).toContain("find users by email");
    expect(result).toContain("pg_read_query");
  });
});

describe("pg_quick_schema prompt", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return schema exploration reference", async () => {
    const prompt = prompts.find((p) => p.name === "pg_quick_schema")!;
    const result = await prompt.handler({}, mockContext);

    expect(result).toContain("pg_list_tables");
    expect(result).toContain("pg_describe_table");
    expect(result).toContain("postgres://schema");
  });
});

describe("Extension setup prompts", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("pg_setup_pgvector should provide pgvector setup guidance", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_pgvector")!;
    const result = (await prompt.handler({}, mockContext)) as string;

    expect(result).toContain("pgvector");
    expect(result.toLowerCase()).toContain("vector");
  });

  it("pg_setup_pgvector should highlight cosine distance metric when selected", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_pgvector")!;
    const result = (await prompt.handler(
      { distanceMetric: "cosine" },
      mockContext,
    )) as string;

    expect(result).toContain("✓ Selected");
    expect(result).toContain("cosine");
  });

  it("pg_setup_pgvector should highlight l2 distance metric when selected", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_pgvector")!;
    const result = (await prompt.handler(
      { distanceMetric: "l2" },
      mockContext,
    )) as string;

    expect(result).toContain("L2/Euclidean (✓ Selected)");
    expect(result).toContain("vector_l2_ops");
  });

  it("pg_setup_pgvector should highlight inner_product distance metric when selected", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_pgvector")!;
    const result = (await prompt.handler(
      { distanceMetric: "inner_product" },
      mockContext,
    )) as string;

    expect(result).toContain("Inner Product (✓ Selected)");
    expect(result).toContain("vector_inner_product_ops");
  });

  it("pg_setup_pgvector should use custom content type and dimensions", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_pgvector")!;
    const result = (await prompt.handler(
      {
        contentType: "products",
        dimensions: "768",
      },
      mockContext,
    )) as string;

    expect(result).toContain("Products");
    expect(result).toContain("768");
    expect(result).toContain("CREATE TABLE products");
  });

  it("pg_setup_postgis should provide PostGIS setup guidance", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_postgis")!;
    const result = await prompt.handler({}, mockContext);

    expect(result).toContain("PostGIS");
  });

  it("pg_setup_pgcron should provide pg_cron setup guidance", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_pgcron")!;
    const result = await prompt.handler({}, mockContext);

    expect(result).toContain("pg_cron");
  });

  it("pg_setup_partman should provide pg_partman setup guidance", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_partman")!;
    const result = await prompt.handler({}, mockContext);

    expect(result).toContain("pg_partman");
  });

  it("pg_setup_kcache should provide pg_stat_kcache setup guidance", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_kcache")!;
    const result = (await prompt.handler({}, mockContext)) as string;

    expect(result.toLowerCase()).toContain("kcache");
  });

  it("pg_setup_citext should provide citext setup guidance", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_citext")!;
    const result = await prompt.handler({}, mockContext);

    expect(result).toContain("citext");
  });

  it("pg_setup_ltree should provide ltree setup guidance", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_ltree")!;
    const result = await prompt.handler({}, mockContext);

    expect(result).toContain("ltree");
  });

  it("pg_setup_pgcrypto should provide pgcrypto setup guidance", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_pgcrypto")!;
    const result = await prompt.handler({}, mockContext);

    expect(result).toContain("pgcrypto");
  });
});

describe("Health and optimization prompts", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("pg_database_health_check should provide health check guidance", async () => {
    const prompt = prompts.find((p) => p.name === "pg_database_health_check")!;
    const result = (await prompt.handler({}, mockContext)) as string;

    expect(result.toLowerCase()).toContain("health");
  });

  it("pg_backup_strategy should provide backup guidance", async () => {
    const prompt = prompts.find((p) => p.name === "pg_backup_strategy")!;
    const result = (await prompt.handler({}, mockContext)) as string;

    expect(result.toLowerCase()).toContain("backup");
  });

  it("pg_index_tuning should provide index optimization guidance", async () => {
    const prompt = prompts.find((p) => p.name === "pg_index_tuning")!;
    const result = (await prompt.handler({}, mockContext)) as string;

    expect(result.toLowerCase()).toContain("index");
  });

  it("pg_extension_setup should provide extension guidance", async () => {
    const prompt = prompts.find((p) => p.name === "pg_extension_setup")!;
    const result = (await prompt.handler({}, mockContext)) as string;

    expect(result.toLowerCase()).toContain("extension");
  });
});

// =============================================================================
// Prompt UseCase Branch Coverage Tests
// =============================================================================

describe("pg_setup_ltree useCase branches", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should handle categories useCase (default)", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_ltree")!;
    const result = (await prompt.handler({}, mockContext)) as string;

    expect(result).toContain("categories");
    expect(result).toContain("CREATE TABLE categories");
    expect(result).toContain("Electronics");
  });

  it("should handle org_chart useCase", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_ltree")!;
    const result = (await prompt.handler(
      { useCase: "org_chart" },
      mockContext,
    )) as string;

    expect(result).toContain("Org Chart");
    expect(result).toContain("CREATE TABLE employees");
    expect(result).toContain("CEO");
    expect(result).toContain("org_path");
  });

  it("should handle file_paths useCase", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_ltree")!;
    const result = (await prompt.handler(
      { useCase: "file_paths" },
      mockContext,
    )) as string;

    expect(result).toContain("File Paths");
    expect(result).toContain("CREATE TABLE files");
    expect(result).toContain("home.user1.documents");
  });

  it("should handle taxonomy useCase (default branch)", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_ltree")!;
    const result = (await prompt.handler(
      { useCase: "taxonomy" },
      mockContext,
    )) as string;

    expect(result).toContain("Taxonomy");
    expect(result).toContain("CREATE TABLE species");
    expect(result).toContain("Homo sapiens");
  });
});

describe("pg_setup_pgcron useCase branches", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should handle maintenance useCase (default)", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_pgcron")!;
    const result = (await prompt.handler({}, mockContext)) as string;

    expect(result).toContain("Maintenance");
    expect(result).toContain("VACUUM ANALYZE");
    expect(result).toContain("REINDEX");
  });

  it("should handle cleanup useCase", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_pgcron")!;
    const result = (await prompt.handler(
      { useCase: "cleanup" },
      mockContext,
    )) as string;

    expect(result).toContain("Cleanup");
    expect(result).toContain("DELETE FROM logs");
    expect(result).toContain("purge-sessions");
  });

  it("should handle reporting useCase", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_pgcron")!;
    const result = (await prompt.handler(
      { useCase: "reporting" },
      mockContext,
    )) as string;

    expect(result).toContain("Reporting");
    expect(result).toContain("daily-summary");
    expect(result).toContain("MATERIALIZED VIEW");
  });

  it("should handle etl useCase", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_pgcron")!;
    const result = (await prompt.handler(
      { useCase: "etl" },
      mockContext,
    )) as string;

    expect(result).toContain("Etl");
    expect(result).toContain("incremental-load");
    expect(result).toContain("full-sync");
  });

  it("should handle backup useCase (default branch)", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_pgcron")!;
    const result = (await prompt.handler(
      { useCase: "backup" },
      mockContext,
    )) as string;

    expect(result).toContain("Backup");
    expect(result).toContain("CHECKPOINT");
    expect(result).toContain("pg_switch_wal");
  });
});

describe("pg_setup_postgis useCase branches", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should handle mapping useCase (default)", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_postgis")!;
    const result = (await prompt.handler({}, mockContext)) as string;

    expect(result).toContain("Mapping");
    expect(result).toContain("CREATE TABLE locations");
    expect(result).toContain("GEOGRAPHY(POINT, 4326)");
  });

  it("should handle distance_calc useCase", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_postgis")!;
    const result = (await prompt.handler(
      { useCase: "distance_calc" },
      mockContext,
    )) as string;

    expect(result).toContain("Distance Calc");
    expect(result).toContain("CREATE TABLE points_of_interest");
    expect(result).toContain("ST_Distance");
  });

  it("should handle spatial_analysis useCase", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_postgis")!;
    const result = (await prompt.handler(
      { useCase: "spatial_analysis" },
      mockContext,
    )) as string;

    expect(result).toContain("Spatial Analysis");
    expect(result).toContain("CREATE TABLE regions");
    expect(result).toContain("POLYGON");
    expect(result).toContain("ST_Contains");
  });

  it("should handle routing useCase (default branch)", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_postgis")!;
    const result = (await prompt.handler(
      { useCase: "routing" },
      mockContext,
    )) as string;

    expect(result).toContain("Routing");
    expect(result).toContain("CREATE TABLE roads");
    expect(result).toContain("LINESTRING");
    expect(result).toContain("ST_DWithin");
  });
});

describe("pg_backup_strategy backupType branches", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should handle logical backupType (default)", async () => {
    const prompt = prompts.find((p) => p.name === "pg_backup_strategy")!;
    const result = (await prompt.handler({}, mockContext)) as string;

    expect(result).toContain("Logical Backup");
    expect(result).toContain("pg_dump");
    expect(result).toContain("Full Backup");
    expect(result).toContain("Schema-Only Backup");
  });

  it("should handle explicit logical backupType", async () => {
    const prompt = prompts.find((p) => p.name === "pg_backup_strategy")!;
    const result = (await prompt.handler(
      { backupType: "logical" },
      mockContext,
    )) as string;

    expect(result).toContain("Logical Backup");
    expect(result).toContain("pg_dump -Fc -Z9");
    expect(result).toContain("--schema-only");
  });

  it("should handle physical backupType", async () => {
    const prompt = prompts.find((p) => p.name === "pg_backup_strategy")!;
    const result = (await prompt.handler(
      { backupType: "physical" },
      mockContext,
    )) as string;

    expect(result).toContain("Physical Backup");
    expect(result).toContain("pg_basebackup");
    expect(result).toContain("Base Backup");
    expect(result).toContain("WAL Archiving");
    expect(result).toContain("archive_mode");
    expect(result).toContain("archive_command");
  });

  it("should handle continuous backupType", async () => {
    const prompt = prompts.find((p) => p.name === "pg_backup_strategy")!;
    const result = (await prompt.handler(
      { backupType: "continuous" },
      mockContext,
    )) as string;

    expect(result).toContain("Continuous Archiving");
    expect(result).toContain("PITR");
    expect(result).toContain("point in time");
  });

  it("should include custom retention period", async () => {
    const prompt = prompts.find((p) => p.name === "pg_backup_strategy")!;
    const result = (await prompt.handler(
      {
        backupType: "physical",
        retentionDays: "60",
      },
      mockContext,
    )) as string;

    expect(result).toContain("60 days");
  });
});

describe("pg_setup_partman useCase branches", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should handle time-series partitionType (default)", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_partman")!;
    const result = (await prompt.handler({}, mockContext)) as string;

    expect(result).toContain("pg_partman");
    expect(result).toContain("Time Partitioning");
    expect(result).toContain("event_time");
  });

  it("should handle serial partitionType", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_partman")!;
    const result = (await prompt.handler(
      { partitionType: "serial" },
      mockContext,
    )) as string;

    // This triggers the serial/id branch in the partman prompt
    expect(result).toContain("Serial Partitioning");
    expect(result).toContain("orders");
    expect(result).toContain("1000000");
  });

  it("should handle id partitionType", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_partman")!;
    const result = (await prompt.handler(
      { partitionType: "id" },
      mockContext,
    )) as string;

    expect(result).toContain("Id Partitioning");
    expect(result).toContain("PARTITION BY RANGE (id)");
  });
});

// =============================================================================
// Additional Branch Coverage Tests - Phase 1
// =============================================================================

describe("pg_setup_citext useCase branches", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should handle email useCase (default)", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_citext")!;
    const result = (await prompt.handler({}, mockContext)) as string;

    expect(result).toContain("Emails");
    expect(result).toContain("CREATE TABLE users");
    expect(result).toContain("email CITEXT UNIQUE");
  });

  it("should handle username useCase", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_citext")!;
    const result = (await prompt.handler(
      { useCase: "username" },
      mockContext,
    )) as string;

    expect(result).toContain("Usernames");
    expect(result).toContain("CREATE TABLE accounts");
    expect(result).toContain("username CITEXT UNIQUE");
    expect(result).toContain("duplicate usernames");
  });

  it("should handle tags useCase", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_citext")!;
    const result = (await prompt.handler(
      { useCase: "tags" },
      mockContext,
    )) as string;

    expect(result).toContain("Tagss");
    expect(result).toContain("CREATE TABLE tags");
    expect(result).toContain("name CITEXT UNIQUE");
    expect(result).toContain("post_tags");
  });

  it("should handle domains useCase (else branch)", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_citext")!;
    const result = (await prompt.handler(
      { useCase: "domains" },
      mockContext,
    )) as string;

    expect(result).toContain("Domainss");
    expect(result).toContain("CREATE TABLE websites");
    expect(result).toContain("domain CITEXT UNIQUE");
  });
});

describe("pg_setup_pgcrypto useCase branches", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should handle password_hashing useCase (default)", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_pgcrypto")!;
    const result = (await prompt.handler({}, mockContext)) as string;

    expect(result).toContain("Password Hashing");
    expect(result).toContain("crypt");
    expect(result).toContain("gen_salt");
    expect(result).toContain("bcrypt");
  });

  it("should handle encryption useCase", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_pgcrypto")!;
    const result = (await prompt.handler(
      { useCase: "encryption" },
      mockContext,
    )) as string;

    expect(result).toContain("Encryption");
    expect(result).toContain("pgp_sym_encrypt");
    expect(result).toContain("pgp_sym_decrypt");
    expect(result).toContain("AES");
  });

  it("should handle uuid useCase", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_pgcrypto")!;
    const result = (await prompt.handler(
      { useCase: "uuid" },
      mockContext,
    )) as string;

    expect(result).toContain("Uuid");
    expect(result).toContain("gen_random_uuid");
    expect(result).toContain("UUID PRIMARY KEY");
    expect(result).toContain("gen_random_bytes");
  });

  it("should handle hmac useCase (else branch)", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_pgcrypto")!;
    const result = (await prompt.handler(
      { useCase: "hmac" },
      mockContext,
    )) as string;

    expect(result).toContain("Hmac");
    expect(result).toContain("hmac");
    expect(result).toContain("sha256");
    expect(result).toContain("signature");
  });
});

describe("pg_setup_partman interval branches", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should handle daily interval (default)", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_partman")!;
    const result = (await prompt.handler({}, mockContext)) as string;

    expect(result).toContain("1 day");
    expect(result).toContain("90 days");
  });

  it("should handle weekly interval", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_partman")!;
    const result = (await prompt.handler(
      { interval: "weekly" },
      mockContext,
    )) as string;

    expect(result).toContain("1 week");
    expect(result).toContain("52 weeks");
  });

  it("should handle monthly interval", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_partman")!;
    const result = (await prompt.handler(
      { interval: "monthly" },
      mockContext,
    )) as string;

    expect(result).toContain("1 month");
    expect(result).toContain("24 months");
  });

  it("should handle yearly interval", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_partman")!;
    const result = (await prompt.handler(
      { interval: "yearly" },
      mockContext,
    )) as string;

    expect(result).toContain("1 year");
    expect(result).toContain("5 years");
  });
});

describe("pg_setup_kcache focus branches", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should handle all focus (default)", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_kcache")!;
    const result = (await prompt.handler({}, mockContext)) as string;

    expect(result).toContain("ALL Analysis");
    expect(result).toContain("CPU Analysis");
    expect(result).toContain("I/O Analysis");
    expect(result).toContain("Memory Analysis");
  });

  it("should handle cpu focus", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_kcache")!;
    const result = (await prompt.handler(
      { focus: "cpu" },
      mockContext,
    )) as string;

    expect(result).toContain("CPU Analysis");
    expect(result).toContain("user_time");
    expect(result).toContain("system_time");
    expect(result).not.toContain("I/O Analysis");
    expect(result).not.toContain("Memory Analysis");
  });

  it("should handle io focus", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_kcache")!;
    const result = (await prompt.handler(
      { focus: "io" },
      mockContext,
    )) as string;

    expect(result).toContain("I/O Analysis");
    expect(result).toContain("reads");
    expect(result).toContain("writes");
    expect(result).not.toContain("CPU Analysis");
    expect(result).not.toContain("Memory Analysis");
  });

  it("should handle memory focus", async () => {
    const prompt = prompts.find((p) => p.name === "pg_setup_kcache")!;
    const result = (await prompt.handler(
      { focus: "memory" },
      mockContext,
    )) as string;

    expect(result).toContain("Memory Analysis");
    expect(result).toContain("page_faults");
    expect(result).toContain("majflts");
    expect(result).not.toContain("CPU Analysis");
    expect(result).not.toContain("I/O Analysis");
  });
});

describe("pg_database_health_check focus branches", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should handle all focus (default)", async () => {
    const prompt = prompts.find((p) => p.name === "pg_database_health_check")!;
    const result = (await prompt.handler({}, mockContext)) as string;

    expect(result).toContain("Index Health");
    expect(result).toContain("Connection Health");
    expect(result).toContain("Vacuum Health");
    expect(result).toContain("Replication Health");
    expect(result).toContain("Buffer Cache Health");
  });

  it("should handle indexes focus", async () => {
    const prompt = prompts.find((p) => p.name === "pg_database_health_check")!;
    const result = (await prompt.handler(
      { focus: "indexes" },
      mockContext,
    )) as string;

    expect(result).toContain("Index Health");
    expect(result).toContain("Invalid indexes");
    expect(result).not.toContain("Connection Health");
  });

  it("should handle connections focus", async () => {
    const prompt = prompts.find((p) => p.name === "pg_database_health_check")!;
    const result = (await prompt.handler(
      { focus: "connections" },
      mockContext,
    )) as string;

    expect(result).toContain("Connection Health");
    expect(result).toContain("max_connections");
    expect(result).not.toContain("Index Health");
  });

  it("should handle vacuum focus", async () => {
    const prompt = prompts.find((p) => p.name === "pg_database_health_check")!;
    const result = (await prompt.handler(
      { focus: "vacuum" },
      mockContext,
    )) as string;

    expect(result).toContain("Vacuum Health");
    expect(result).toContain("wraparound");
    expect(result).not.toContain("Index Health");
  });

  it("should handle replication focus", async () => {
    const prompt = prompts.find((p) => p.name === "pg_database_health_check")!;
    const result = (await prompt.handler(
      { focus: "replication" },
      mockContext,
    )) as string;

    expect(result).toContain("Replication Health");
    expect(result).toContain("Replication lag");
    expect(result).not.toContain("Index Health");
  });

  it("should handle buffer focus", async () => {
    const prompt = prompts.find((p) => p.name === "pg_database_health_check")!;
    const result = (await prompt.handler(
      { focus: "buffer" },
      mockContext,
    )) as string;

    expect(result).toContain("Buffer Cache Health");
    expect(result).toContain("Cache hit ratio");
    expect(result).not.toContain("Index Health");
  });
});

describe("pg_index_tuning focus branches", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should handle all focus (default)", async () => {
    const prompt = prompts.find((p) => p.name === "pg_index_tuning")!;
    const result = (await prompt.handler({}, mockContext)) as string;

    expect(result).toContain("All");
    expect(result).toContain("Unused Indexes");
    expect(result).toContain("Missing Indexes");
    expect(result).toContain("Duplicate/Redundant Indexes");
  });

  it("should handle unused focus", async () => {
    const prompt = prompts.find((p) => p.name === "pg_index_tuning")!;
    const result = (await prompt.handler(
      { focus: "unused" },
      mockContext,
    )) as string;

    expect(result).toContain("Unused Indexes");
    expect(result).toContain("idx_scan = 0");
    expect(result).not.toContain("Missing Indexes");
  });

  it("should handle missing focus", async () => {
    const prompt = prompts.find((p) => p.name === "pg_index_tuning")!;
    const result = (await prompt.handler(
      { focus: "missing" },
      mockContext,
    )) as string;

    expect(result).toContain("Missing Indexes");
    expect(result).toContain("pg_analyze_workload");
    expect(result).not.toContain("Unused Indexes");
  });

  it("should handle duplicate focus", async () => {
    const prompt = prompts.find((p) => p.name === "pg_index_tuning")!;
    const result = (await prompt.handler(
      { focus: "duplicate" },
      mockContext,
    )) as string;

    expect(result).toContain("Duplicate/Redundant Indexes");
    expect(result).toContain("Redundant patterns");
    expect(result).not.toContain("Unused Indexes");
  });

  it("should handle custom schema", async () => {
    const prompt = prompts.find((p) => p.name === "pg_index_tuning")!;
    const result = (await prompt.handler(
      { schema: "custom_schema" },
      mockContext,
    )) as string;

    expect(result).toContain("custom_schema");
  });
});

// =============================================================================
// Optional Parameter Empty Value Branch Coverage
// =============================================================================

describe("pg_schema_design optional requirements branch", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should handle empty requirements (empty string branch)", async () => {
    const prompt = prompts.find((p) => p.name === "pg_schema_design")!;
    const result = (await prompt.handler(
      {
        useCase: "Blog platform",
        requirements: "",
      },
      mockContext,
    )) as string;

    // Should not include Requirements section when empty
    expect(result).toContain("Blog platform");
    expect(result).not.toContain("**Requirements:**");
  });

  it("should handle undefined requirements (nullish branch)", async () => {
    const prompt = prompts.find((p) => p.name === "pg_schema_design")!;
    const result = (await prompt.handler(
      {
        useCase: "E-commerce",
      },
      mockContext,
    )) as string;

    expect(result).toContain("E-commerce");
    expect(result).not.toContain("**Requirements:**");
  });
});

describe("pg_performance_analysis optional context branch", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should handle empty context (empty string branch)", async () => {
    const prompt = prompts.find((p) => p.name === "pg_performance_analysis")!;
    const result = (await prompt.handler(
      {
        query: "SELECT * FROM users",
        context: "",
      },
      mockContext,
    )) as string;

    expect(result).toContain("SELECT * FROM users");
    expect(result).not.toContain("**Context:**");
  });

  it("should handle undefined context (nullish branch)", async () => {
    const prompt = prompts.find((p) => p.name === "pg_performance_analysis")!;
    const result = (await prompt.handler(
      {
        query: "SELECT * FROM orders",
      },
      mockContext,
    )) as string;

    expect(result).toContain("SELECT * FROM orders");
    expect(result).not.toContain("**Context:**");
  });
});

describe("pg_migration optional table branch", () => {
  let prompts: ReturnType<typeof getPostgresPrompts>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAdapter = createMockPostgresAdapter();
    (
      mockAdapter.getToolDefinitions as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    prompts = getPostgresPrompts(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should handle empty table (empty string branch)", async () => {
    const prompt = prompts.find((p) => p.name === "pg_migration")!;
    const result = (await prompt.handler(
      {
        change: "Add new index",
        table: "",
      },
      mockContext,
    )) as string;

    expect(result).toContain("Add new index");
    expect(result).not.toContain("**Table:**");
  });

  it("should handle undefined table (nullish branch)", async () => {
    const prompt = prompts.find((p) => p.name === "pg_migration")!;
    const result = (await prompt.handler(
      {
        change: "Create sequence",
      },
      mockContext,
    )) as string;

    expect(result).toContain("Create sequence");
    expect(result).not.toContain("**Table:**");
  });
});
