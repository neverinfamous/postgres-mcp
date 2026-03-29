/**
 * postgres-mcp - Backup Tools Unit Tests
 *
 * Tests for PostgreSQL backup tools with focus on
 * audit log backup restoration and diffing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getBackupTools } from "../backup/index.js";
import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { BackupManager } from "../../../../audit/backup-manager.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../__tests__/mocks/index.js";
import { ValidationError } from "../../../../types/index.js";

describe("getBackupTools", () => {
  let adapter: PostgresAdapter;
  let tools: ReturnType<typeof getBackupTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockPostgresAdapter() as unknown as PostgresAdapter;
    tools = getBackupTools(adapter, null);
  });

  it("should return 12 backup tools", () => {
    expect(tools).toHaveLength(12);
  });

  it("should have group set to backup for all tools", () => {
    for (const tool of tools) {
      expect(tool.group).toBe("backup");
    }
  });
});

describe("pg_audit_list_backups", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let mockBackupManager: any;
  let tools: ReturnType<typeof getBackupTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    mockBackupManager = {
      listSnapshots: vi.fn(),
      getSnapshot: vi.fn(),
    };
    tools = getBackupTools(mockAdapter as unknown as PostgresAdapter, mockBackupManager as unknown as BackupManager);
    mockContext = createMockRequestContext();
  });

  it("should fail gracefully when backupManager is null", async () => {
    const disabledTools = getBackupTools(mockAdapter as unknown as PostgresAdapter, null);
    const tool = disabledTools.find((t) => t.name === "pg_audit_list_backups")!;
    const result = (await tool.handler({}, mockContext)) as { success: boolean; code?: string; error: string };
    
    expect(result.success).toBe(false);
    expect(result.code).toBe("VALIDATION_ERROR");
  });

  it("should return list of snapshots with applied filtering", async () => {
    mockBackupManager.listSnapshots.mockResolvedValue([
      { filename: "a", target: "table1", tool: "demo_tool_1" },
      { filename: "b", target: "table2", tool: "demo_tool_2" },
      { filename: "c", target: "unknown", tool: "anon_tool" },
    ]);

    const tool = tools.find((t) => t.name === "pg_audit_list_backups")!;
    
    // Default handles filtering out unknown
    const result1 = (await tool.handler({}, mockContext)) as any;
    expect(result1.count).toBe(2);
    
    // Explicit limit targeting table1
    const result2 = (await tool.handler({ target: "table1" }, mockContext)) as any;
    expect(result2.count).toBe(1);
    expect(result2.snapshots[0].filename).toBe("a");
  });
});

describe("pg_audit_restore_backup", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let mockBackupManager: any;
  let tools: ReturnType<typeof getBackupTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    mockBackupManager = {
      listSnapshots: vi.fn(),
      getSnapshot: vi.fn(),
    };
    tools = getBackupTools(mockAdapter as unknown as PostgresAdapter, mockBackupManager as unknown as BackupManager);
    mockContext = createMockRequestContext();
  });

  it("should fail when backupManager is null", async () => {
    const disabledTools = getBackupTools(mockAdapter as unknown as PostgresAdapter, null);
    const tool = disabledTools.find((t) => t.name === "pg_audit_restore_backup")!;
    const result = (await tool.handler({ filename: "x.json", confirm: true }, mockContext)) as any;
    expect(result.success).toBe(false);
    expect(result.code).toBe("VALIDATION_ERROR");
  });

  it("should fail when confirm is missing for destructive restores", async () => {
    const tool = tools.find((t) => t.name === "pg_audit_restore_backup")!;
    const result = (await tool.handler({ filename: "x.json" }, mockContext)) as any;
    expect(result.success).toBe(false);
    expect(result.code).toBe("VALIDATION_ERROR");
    expect(result.error).toMatch(/confirm: true is required/i);
  });

  it("should return dryRun output without executing DDL", async () => {
    mockBackupManager.getSnapshot.mockResolvedValue({
      metadata: { target: "test_t", schema: "public" },
      ddl: "CREATE TABLE ...",
      data: "INSERT INTO ...",
    });

    const tool = tools.find((t) => t.name === "pg_audit_restore_backup")!;
    const result = (await tool.handler({ filename: "x.json", dryRun: true }, mockContext)) as any;
    
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.ddl).toContain("DROP TABLE IF EXISTS");
    expect(mockAdapter.executeQuery).not.toHaveBeenCalled();
  });

  it("should handle restoreAs replacing target identifiers to side-by-side restore", async () => {
    mockBackupManager.getSnapshot.mockResolvedValue({
      metadata: { target: "users", schema: "public" },
      ddl: 'CREATE TABLE "public"."users" (id int);\nCREATE SEQUENCE "public"."users_id_seq"',
      data: 'INSERT INTO "public"."users" VALUES (1);',
    });

    mockAdapter.executeQuery.mockResolvedValue({});
    
    const tool = tools.find((t) => t.name === "pg_audit_restore_backup")!;
    const result = (await tool.handler({ filename: "x.json", restoreAs: "users_backup" }, mockContext)) as any;
    
    expect(result.success).toBe(true);
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith("BEGIN");
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE "public"."users_backup"')
    );
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO "public"."users_backup"')
    );
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith("COMMIT");
  });
});

describe("pg_audit_diff_backup", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let mockBackupManager: any;
  let tools: ReturnType<typeof getBackupTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    mockBackupManager = {
      getSnapshot: vi.fn(),
    };
    tools = getBackupTools(mockAdapter as unknown as PostgresAdapter, mockBackupManager as unknown as BackupManager);
    mockContext = createMockRequestContext();
  });

  it("should detect diff drifts perfectly", async () => {
    mockBackupManager.getSnapshot.mockResolvedValue({
      metadata: { target: "t1", schema: "public", rowCount: 10, totalSizeBytes: 1024 },
      ddl: 'CREATE TABLE "public"."t1" (\n    "id" int NOT NULL\n);',
    });

    mockAdapter.describeTable = vi.fn().mockResolvedValue({
        columns: [
            { name: "id", type: "int", nullable: false },
            { name: "new_col", type: "text", nullable: true }
        ]
    });
    
    mockAdapter.executeQuery.mockResolvedValue({
        rows: [{ row_count: 15, total_size_bytes: 2048 }]
    });

    const tool = tools.find((t) => t.name === "pg_audit_diff_backup")!;
    const result = (await tool.handler({ filename: "t1_snapshot.json" }, mockContext)) as any;
    
    expect(result.success).toBe(true);
    expect(result.hasDrift).toBe(true);
    expect(result.diff.additions.some((line: string) => line.includes("new_col"))).toBe(true);
    expect(result.volumeDrift.rowCountSnapshot).toBe(10);
    expect(result.volumeDrift.rowCountCurrent).toBe(15);
  });
});
