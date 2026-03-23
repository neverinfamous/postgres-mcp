/**
 * postgres-mcp — Backup Manager Tests
 *
 * Tests the BackupManager snapshot system:
 * - shouldSnapshot filtering
 * - createSnapshot DDL capture
 * - createSnapshot data capture
 * - listSnapshots / getSnapshot
 * - cleanup retention policy
 * - getStats
 * - Non-blocking error handling
 * - Path traversal sanitization
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "node:path";
import { rm, readdir, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { BackupManager, type SnapshotQueryAdapter } from "./backup-manager.js";
import type { BackupConfig } from "./types.js";

/** Helper: create a unique temp directory path */
function tempDir(): string {
  return join(
    tmpdir(),
    `pg-backup-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
}

/** Helper: build a default BackupConfig */
function defaultConfig(overrides: Partial<BackupConfig> = {}): BackupConfig {
  return {
    enabled: true,
    includeData: false,
    maxAgeDays: 30,
    maxCount: 100,
    ...overrides,
  };
}

/** Helper: create a mock SnapshotQueryAdapter */
function mockAdapter(overrides: Partial<SnapshotQueryAdapter> = {}): SnapshotQueryAdapter {
  return {
    executeQuery: vi.fn().mockResolvedValue({ rows: [] }),
    describeTable: vi.fn().mockResolvedValue({
      columns: [
        { name: "id", type: "integer", nullable: false },
        { name: "name", type: "varchar(255)", nullable: true },
      ],
    }),
    ...overrides,
  };
}

describe("BackupManager", () => {
  let dir: string;
  let logPath: string;

  beforeEach(() => {
    dir = tempDir();
    logPath = join(dir, "audit.jsonl");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // =========================================================================
  // shouldSnapshot
  // =========================================================================

  describe("shouldSnapshot", () => {
    it("should return true for snapshotted tools", () => {
      const mgr = new BackupManager(defaultConfig(), logPath);
      expect(mgr.shouldSnapshot("pg_drop_table")).toBe(true);
      expect(mgr.shouldSnapshot("pg_vacuum")).toBe(true);
      expect(mgr.shouldSnapshot("pg_migration_apply")).toBe(true);
      expect(mgr.shouldSnapshot("pg_drop_schema")).toBe(true);
    });

    it("should return false for non-snapshotted tools", () => {
      const mgr = new BackupManager(defaultConfig(), logPath);
      expect(mgr.shouldSnapshot("pg_read_query")).toBe(false);
      expect(mgr.shouldSnapshot("pg_write_query")).toBe(false);
      expect(mgr.shouldSnapshot("pg_list_tables")).toBe(false);
    });

    it("should return false when disabled", () => {
      const mgr = new BackupManager(defaultConfig({ enabled: false }), logPath);
      expect(mgr.shouldSnapshot("pg_drop_table")).toBe(false);
    });
  });

  // =========================================================================
  // createSnapshot
  // =========================================================================

  describe("createSnapshot", () => {
    it("should capture DDL snapshot for a table tool", async () => {
      const adapter = mockAdapter();
      const mgr = new BackupManager(defaultConfig(), logPath);

      const filename = await mgr.createSnapshot(
        "pg_drop_table",
        { table: "users", schema: "public" },
        "req-001",
        adapter,
      );

      expect(filename).toBeDefined();
      expect(filename).toContain("pg_drop_table");
      expect(filename).toContain("users");
      expect(filename).toMatch(/\.snapshot\.json$/);
      expect(adapter.describeTable).toHaveBeenCalledWith("users", "public");
    });

    it("should return undefined for non-snapshotted tools", async () => {
      const adapter = mockAdapter();
      const mgr = new BackupManager(defaultConfig(), logPath);

      const filename = await mgr.createSnapshot(
        "pg_read_query",
        { sql: "SELECT 1" },
        "req-002",
        adapter,
      );

      expect(filename).toBeUndefined();
    });

    it("should handle schema.table format", async () => {
      const adapter = mockAdapter();
      const mgr = new BackupManager(defaultConfig(), logPath);

      await mgr.createSnapshot(
        "pg_drop_table",
        { table: "myschema.users" },
        "req-003",
        adapter,
      );

      expect(adapter.describeTable).toHaveBeenCalledWith("users", "myschema");
    });

    it("should include data when configured", async () => {
      const adapter = mockAdapter({
        executeQuery: vi.fn().mockResolvedValue({
          rows: [
            { id: 1, name: "Alice" },
            { id: 2, name: "Bob" },
          ],
        }),
      });
      const mgr = new BackupManager(
        defaultConfig({ includeData: true }),
        logPath,
      );

      const filename = await mgr.createSnapshot(
        "pg_drop_table",
        { table: "users" },
        "req-004",
        adapter,
      );

      expect(filename).toBeDefined();

      // Read the stored snapshot and verify data
      const snapshot = await mgr.getSnapshot(filename!);
      expect(snapshot).not.toBeNull();
      expect(snapshot!.metadata.type).toBe("ddl+data");
      expect(snapshot!.data).toContain("INSERT INTO");
      expect(snapshot!.data).toContain("Alice");
    });

    it("should capture migration markers", async () => {
      const adapter = mockAdapter();
      const mgr = new BackupManager(defaultConfig(), logPath);

      const filename = await mgr.createSnapshot(
        "pg_migration_apply",
        { sql: "ALTER TABLE users ADD COLUMN age INT" },
        "req-005",
        adapter,
      );

      expect(filename).toBeDefined();
      const snapshot = await mgr.getSnapshot(filename!);
      expect(snapshot!.ddl).toContain("Pre-migration schema snapshot");
    });

    it("should capture schema drop snapshots", async () => {
      const adapter = mockAdapter({
        executeQuery: vi.fn().mockResolvedValue({
          rows: [{ tablename: "users" }, { tablename: "orders" }],
        }),
      });
      const mgr = new BackupManager(defaultConfig(), logPath);

      const filename = await mgr.createSnapshot(
        "pg_drop_schema",
        { schema: "old_schema" },
        "req-006",
        adapter,
      );

      expect(filename).toBeDefined();
      const snapshot = await mgr.getSnapshot(filename!);
      expect(snapshot!.ddl).toContain('Pre-drop snapshot of schema "old_schema"');
      expect(snapshot!.ddl).toContain("users");
    });

    it("should handle adapter errors gracefully (non-throwing)", async () => {
      const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
      const adapter = mockAdapter({
        describeTable: vi.fn().mockRejectedValue(new Error("Connection lost")),
      });
      const mgr = new BackupManager(defaultConfig(), logPath);

      const filename = await mgr.createSnapshot(
        "pg_drop_table",
        { table: "users" },
        "req-007",
        adapter,
      );

      expect(filename).toBeUndefined();
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("Snapshot failed"),
      );
      stderrSpy.mockRestore();
    });

    it("should default target to 'unknown' for non-string args", async () => {
      const adapter = mockAdapter();
      const mgr = new BackupManager(defaultConfig(), logPath);

      const filename = await mgr.createSnapshot(
        "pg_drop_table",
        { table: 42 } as unknown as Record<string, unknown>,
        "req-008",
        adapter,
      );

      expect(filename).toBeDefined();
      expect(filename).toContain("unknown");
    });
  });

  // =========================================================================
  // listSnapshots / getSnapshot
  // =========================================================================

  describe("listSnapshots", () => {
    it("should list created snapshots sorted newest first", async () => {
      const adapter = mockAdapter();
      const mgr = new BackupManager(defaultConfig(), logPath);

      await mgr.createSnapshot("pg_drop_table", { table: "first" }, "req-a", adapter);
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));
      await mgr.createSnapshot("pg_vacuum", { table: "second" }, "req-b", adapter);

      const snapshots = await mgr.listSnapshots();
      expect(snapshots).toHaveLength(2);
      // Newest first
      expect(snapshots[0]!.target).toBe("second");
      expect(snapshots[1]!.target).toBe("first");
    });

    it("should return empty array when no snapshots", async () => {
      const mgr = new BackupManager(defaultConfig(), logPath);
      const snapshots = await mgr.listSnapshots();
      expect(snapshots).toEqual([]);
    });
  });

  describe("getSnapshot", () => {
    it("should return snapshot content by filename", async () => {
      const adapter = mockAdapter();
      const mgr = new BackupManager(defaultConfig(), logPath);

      const filename = await mgr.createSnapshot(
        "pg_drop_table",
        { table: "users" },
        "req-010",
        adapter,
      );

      const snapshot = await mgr.getSnapshot(filename!);
      expect(snapshot).not.toBeNull();
      expect(snapshot!.metadata.tool).toBe("pg_drop_table");
      expect(snapshot!.metadata.target).toBe("users");
      expect(snapshot!.ddl).toContain("CREATE TABLE");
    });

    it("should return null for non-existent snapshot", async () => {
      const mgr = new BackupManager(defaultConfig(), logPath);
      const snapshot = await mgr.getSnapshot("does-not-exist.snapshot.json");
      expect(snapshot).toBeNull();
    });

    it("should sanitize path traversal attempts", async () => {
      const mgr = new BackupManager(defaultConfig(), logPath);
      const snapshot = await mgr.getSnapshot("../../../etc/passwd");
      expect(snapshot).toBeNull();
    });
  });

  // =========================================================================
  // cleanup
  // =========================================================================

  describe("cleanup", () => {
    it("should delete snapshots exceeding maxCount", async () => {
      const adapter = mockAdapter();
      const mgr = new BackupManager(defaultConfig({ maxCount: 2 }), logPath);

      // Create 3 snapshots
      await mgr.createSnapshot("pg_drop_table", { table: "a" }, "req-a", adapter);
      await new Promise((r) => setTimeout(r, 10));
      await mgr.createSnapshot("pg_drop_table", { table: "b" }, "req-b", adapter);
      await new Promise((r) => setTimeout(r, 10));
      await mgr.createSnapshot("pg_drop_table", { table: "c" }, "req-c", adapter);

      const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
      const deleted = await mgr.cleanup();
      stderrSpy.mockRestore();

      expect(deleted).toBe(1);
      const remaining = await mgr.listSnapshots();
      expect(remaining).toHaveLength(2);
    });

    it("should return 0 when disabled", async () => {
      const mgr = new BackupManager(defaultConfig({ enabled: false }), logPath);
      const deleted = await mgr.cleanup();
      expect(deleted).toBe(0);
    });

    it("should return 0 when no snapshots exist", async () => {
      const mgr = new BackupManager(defaultConfig(), logPath);
      // Ensure directory exists but is empty
      await mkdir(join(dir, "snapshots"), { recursive: true });
      const deleted = await mgr.cleanup();
      expect(deleted).toBe(0);
    });
  });

  // =========================================================================
  // getStats
  // =========================================================================

  describe("getStats", () => {
    it("should return stats for existing snapshots", async () => {
      const adapter = mockAdapter();
      const mgr = new BackupManager(defaultConfig(), logPath);

      await mgr.createSnapshot("pg_drop_table", { table: "users" }, "req-s1", adapter);

      const stats = await mgr.getStats();
      expect(stats.count).toBe(1);
      expect(stats.totalSizeKB).toBeGreaterThanOrEqual(0);
      expect(stats.oldestAge).toBeDefined();
    });

    it("should return zeros when no snapshots", async () => {
      const mgr = new BackupManager(defaultConfig(), logPath);
      const stats = await mgr.getStats();
      expect(stats.count).toBe(0);
      expect(stats.totalSizeKB).toBe(0);
      expect(stats.oldestAge).toBeUndefined();
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe("edge cases", () => {
    it("should handle corrupt snapshot files in listSnapshots", async () => {
      const mgr = new BackupManager(defaultConfig(), logPath);
      const snapshotDir = join(dir, "snapshots");
      await mkdir(snapshotDir, { recursive: true });

      // Write a corrupt file
      await writeFile(
        join(snapshotDir, "corrupt.snapshot.json"),
        "NOT VALID JSON{{{",
        "utf-8",
      );

      const snapshots = await mgr.listSnapshots();
      expect(snapshots).toEqual([]);
    });

    it("should ignore non-snapshot files in directory", async () => {
      const adapter = mockAdapter();
      const mgr = new BackupManager(defaultConfig(), logPath);

      await mgr.createSnapshot("pg_drop_table", { table: "t" }, "req-x", adapter);

      // Write a non-snapshot file
      const snapshotDir = join(dir, "snapshots");
      await writeFile(join(snapshotDir, "notes.txt"), "hello", "utf-8");

      const snapshots = await mgr.listSnapshots();
      expect(snapshots).toHaveLength(1);
    });

    it("should handle data capture failure gracefully", async () => {
      const execMock = vi.fn()
        .mockRejectedValueOnce(new Error("query failed"));
      const adapter = mockAdapter({
        executeQuery: execMock,
      });
      const mgr = new BackupManager(
        defaultConfig({ includeData: true }),
        logPath,
      );

      const filename = await mgr.createSnapshot(
        "pg_drop_table",
        { table: "users" },
        "req-data-err",
        adapter,
      );

      expect(filename).toBeDefined();
      const snapshot = await mgr.getSnapshot(filename!);
      expect(snapshot!.metadata.type).toBe("ddl");
      expect(snapshot!.data).toBeUndefined();
    });

    it("should handle schema drop when object enumeration fails", async () => {
      const adapter = mockAdapter({
        executeQuery: vi.fn().mockRejectedValue(new Error("perm denied")),
      });
      const mgr = new BackupManager(defaultConfig(), logPath);

      const filename = await mgr.createSnapshot(
        "pg_drop_schema",
        { schema: "gone" },
        "req-enum-err",
        adapter,
      );

      expect(filename).toBeDefined();
      const snapshot = await mgr.getSnapshot(filename!);
      expect(snapshot!.ddl).toContain("Could not enumerate schema objects");
    });
  });
});
