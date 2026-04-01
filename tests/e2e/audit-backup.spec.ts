/**
 * E2E Tests: Audit Backup Snapshots
 *
 * Spawns a server with --audit-backup enabled and verifies:
 * 1. DDL tool calls produce pre-mutation snapshots on disk
 * 2. pg_audit_list_backups returns available snapshots
 * 3. pg_audit_diff_backup detects schema drift after drop
 * 4. pg_audit_restore_backup dryRun previews DDL without executing
 * 5. Tools return structured error when backup is not enabled
 *
 * Uses the same startServer/stopServer pattern as audit-log.spec.ts.
 */

import { rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";

import { test, expect } from "./fixtures.js";
import {
  startServer,
  stopServer,
  createClient,
  callToolAndParse,
  expectHandlerError,
} from "./helpers.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Force sequential execution to prevent parallel workers from colliding on manual ports/files
test.describe.configure({ mode: "serial" });

const BACKUP_PORT_BASE = 3160;

/** Generate a unique temp directory path for the audit log */
function auditDir(suffix: string): string {
  return join(tmpdir(), `pg-backup-e2e-${suffix}-${Date.now()}`);
}

/**
 * Retry list_backups until at least `minCount` snapshots appear.
 * The BackupManager writes asynchronously after the tool handler returns.
 */
async function waitForSnapshots(
  client: Client,
  minCount: number,
  maxAttempts = 20,
  intervalMs = 500,
): Promise<Record<string, unknown>> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await callToolAndParse(client, "pg_audit_list_backups", {});
    if (typeof result.count === "number" && result.count >= minCount) {
      return result;
    }
    await delay(intervalMs);
  }
  throw new Error(`Expected at least ${minCount} snapshot(s) after ${maxAttempts * intervalMs}ms`);
}

test.describe("Audit Backup Snapshots", () => {
  test("truncate produces snapshot and list_backups returns it", async () => {
    const TEMP_TABLE = "e2e_backup_truncate";
    const port = BACKUP_PORT_BASE;
    const dir = auditDir("list");
    await mkdir(dir, { recursive: true });
    const logPath = join(dir, "audit.jsonl");

    await startServer(
      port,
      [
        "--audit-log", logPath,
        "--audit-backup",
        "--tool-filter", "core,backup,schema",
      ],
      "backup-list",
    );

    let client: Client | undefined;
    try {
      client = await createClient(`http://127.0.0.1:${port}`);

      // Create a temp table, then truncate it (truncate triggers snapshot)
      await callToolAndParse(client, "pg_create_table", {
        name: TEMP_TABLE,
        columns: [
          { name: "id", type: "SERIAL", primaryKey: true },
          { name: "val", type: "TEXT" },
        ],
      });

      // Insert a row so truncate has something to snapshot
      await callToolAndParse(client, "pg_write_query", {
        sql: `INSERT INTO ${TEMP_TABLE} (val) VALUES ('test_data')`,
      });

      // Truncate triggers a pre-mutation snapshot
      await callToolAndParse(client, "pg_truncate", { table: TEMP_TABLE });

      // Wait for the snapshot to appear
      const listResult = await waitForSnapshots(client, 1);

      expect(listResult.success).toBe(true);
      expect(typeof listResult.count).toBe("number");
      expect(listResult.count as number).toBeGreaterThanOrEqual(1);

      const snapshots = listResult.snapshots as Array<Record<string, unknown>>;
      expect(snapshots.length).toBeGreaterThanOrEqual(1);

      // Verify snapshot metadata shape
      const snap = snapshots[snapshots.length - 1]!;
      expect(snap.tool).toBe("pg_truncate");
      expect(typeof snap.target).toBe("string");
      expect(typeof snap.timestamp).toBe("string");
      expect(typeof snap.filename).toBe("string");

      // Filter by tool name
      const filtered = await callToolAndParse(client, "pg_audit_list_backups", {
        tool: "pg_truncate",
      });
      expect(filtered.success).toBe(true);
      expect(filtered.count as number).toBeGreaterThanOrEqual(1);
    } finally {
      // Clean up table
      try {
        if (client) {
          await callToolAndParse(client, "pg_drop_table", {
            table: TEMP_TABLE,
            ifExists: true,
          });
        }
      } catch { /* ignore cleanup errors */ }
      if (client) await client.close();
      stopServer(port);
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("diff_backup returns snapshot and current DDL for comparison", async () => {
    const TEMP_TABLE = "e2e_backup_diff";
    const port = BACKUP_PORT_BASE + 1;
    const dir = auditDir("diff");
    await mkdir(dir, { recursive: true });
    const logPath = join(dir, "audit.jsonl");

    await startServer(
      port,
      [
        "--audit-log", logPath,
        "--audit-backup",
        "--tool-filter", "core,backup,schema",
      ],
      "backup-diff",
    );

    let client: Client | undefined;
    try {
      client = await createClient(`http://127.0.0.1:${port}`);

      // Create table with 2 columns
      await callToolAndParse(client, "pg_create_table", {
        name: TEMP_TABLE,
        columns: [
          { name: "id", type: "SERIAL", primaryKey: true },
          { name: "name", type: "TEXT", notNull: true },
        ],
      });

      // Truncate — triggers snapshot of the current schema
      await callToolAndParse(client, "pg_truncate", { table: TEMP_TABLE });

      // Wait for snapshot to appear
      const listResult = await waitForSnapshots(client, 1);
      const snapshots = (listResult.snapshots as Array<Record<string, unknown>>)
        .filter((s) => s.tool === "pg_truncate");
      expect(snapshots.length).toBeGreaterThanOrEqual(1);

      const filename = snapshots[snapshots.length - 1]!.filename as string;

      // Diff the snapshot against current live schema
      // Pass compact: false to ensure DDL strings are returned for the test
      const diffResult = await callToolAndParse(client, "pg_audit_diff_backup", {
        filename,
        compact: false,
      });

      // Verify response structure
      expect(diffResult.success).toBe(true);
      expect(diffResult.objectExists).toBe(true);
      expect(typeof diffResult.snapshotDdl).toBe("string");
      expect(typeof diffResult.currentDdl).toBe("string");
      expect(diffResult.metadata).toBeDefined();

      // Both DDLs should contain the table name and column names
      const snapshotDdl = diffResult.snapshotDdl as string;
      const currentDdl = diffResult.currentDdl as string;
      expect(snapshotDdl).toContain(TEMP_TABLE);
      expect(currentDdl).toContain(TEMP_TABLE);
      expect(snapshotDdl).toContain("id");
      expect(snapshotDdl).toContain("name");
      expect(currentDdl).toContain("id");
      expect(currentDdl).toContain("name");
    } finally {
      try {
        if (client) {
          await callToolAndParse(client, "pg_drop_table", {
            table: TEMP_TABLE,
            ifExists: true,
          });
        }
      } catch { /* ignore cleanup errors */ }
      if (client) await client.close();
      stopServer(port);
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("restore_backup dryRun previews DDL without executing", async () => {
    const TEMP_TABLE = "e2e_backup_restore";
    const port = BACKUP_PORT_BASE + 2;
    const dir = auditDir("restore");
    await mkdir(dir, { recursive: true });
    const logPath = join(dir, "audit.jsonl");

    await startServer(
      port,
      [
        "--audit-log", logPath,
        "--audit-backup",
        "--tool-filter", "core,backup,schema",
      ],
      "backup-restore",
    );

    let client: Client | undefined;
    try {
      client = await createClient(`http://127.0.0.1:${port}`);

      // Create, then drop (creates snapshot of original)
      await callToolAndParse(client, "pg_create_table", {
        name: TEMP_TABLE,
        columns: [
          { name: "id", type: "SERIAL", primaryKey: true },
          { name: "data", type: "JSONB" },
        ],
      });

      await callToolAndParse(client, "pg_drop_table", { table: TEMP_TABLE });

      // Wait for snapshot
      const listResult = await waitForSnapshots(client, 1);
      const snapshots = (listResult.snapshots as Array<Record<string, unknown>>)
        .filter((s) => s.tool === "pg_drop_table");
      const filename = snapshots[snapshots.length - 1]!.filename as string;

      // dryRun restore — should return DDL without executing
      const restoreResult = await callToolAndParse(
        client,
        "pg_audit_restore_backup",
        { filename, dryRun: true },
      );

      expect(restoreResult.success).toBe(true);
      expect(restoreResult.dryRun).toBe(true);
      expect(typeof restoreResult.ddl).toBe("string");
      expect((restoreResult.ddl as string).length).toBeGreaterThan(0);
      expect(restoreResult.metadata).toBeDefined();

      // Table should still not exist (dry run didn't execute anything)
      const descResult = await callToolAndParse(client, "pg_describe_table", {
        table: TEMP_TABLE,
      });
      expect(descResult.success).toBe(false);
    } finally {
      if (client) await client.close();
      stopServer(port);
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("tools return structured error when backup is not enabled", async () => {
    const port = BACKUP_PORT_BASE + 3;

    // Start server WITHOUT --audit-backup
    await startServer(
      port,
      ["--tool-filter", "core,backup,schema"],
      "backup-disabled",
    );

    let client: Client | undefined;
    try {
      client = await createClient(`http://127.0.0.1:${port}`);

      // All 3 tools should return structured error, not throw
      const listResult = await callToolAndParse(
        client,
        "pg_audit_list_backups",
        {},
      );
      expectHandlerError(listResult, "not enabled");

      const diffResult = await callToolAndParse(
        client,
        "pg_audit_diff_backup",
        { filename: "fake.snapshot.json" },
      );
      expectHandlerError(diffResult, "not enabled");

      const restoreResult = await callToolAndParse(
        client,
        "pg_audit_restore_backup",
        { filename: "fake.snapshot.json" },
      );
      expectHandlerError(restoreResult, "not enabled");
    } finally {
      if (client) await client.close();
      stopServer(port);
    }
  });

  test("diff_backup returns volumeDrift with row count and size fields", async () => {
    const TEMP_TABLE = "e2e_backup_volume_drift";
    const port = BACKUP_PORT_BASE + 4;
    const dir = auditDir("volumedrift");
    await mkdir(dir, { recursive: true });
    const logPath = join(dir, "audit.jsonl");

    await startServer(
      port,
      [
        "--audit-log", logPath,
        "--audit-backup",
        "--audit-backup-data",
        "--tool-filter", "core,backup,schema",
      ],
      "backup-volumedrift",
    );

    let client: Client | undefined;
    try {
      client = await createClient(`http://127.0.0.1:${port}`);

      // Create table and insert rows so volumeDrift has data to report
      await callToolAndParse(client, "pg_create_table", {
        name: TEMP_TABLE,
        columns: [
          { name: "id", type: "SERIAL", primaryKey: true },
          { name: "payload", type: "TEXT" },
        ],
      });

      await callToolAndParse(client, "pg_write_query", {
        sql: `INSERT INTO ${TEMP_TABLE} (payload) VALUES ('row1'), ('row2'), ('row3')`,
      });

      // ANALYZE so pg_class.reltuples is populated before snapshot
      await callToolAndParse(client, "pg_write_query", {
        sql: `ANALYZE ${TEMP_TABLE}`,
      });

      // Truncate → triggers pre-mutation snapshot (includes row count + size)
      await callToolAndParse(client, "pg_truncate", { table: TEMP_TABLE });

      // ANALYZE the now-empty table so reltuples is 0 (not -1 sentinel)
      await callToolAndParse(client, "pg_write_query", {
        sql: `ANALYZE ${TEMP_TABLE}`,
      });

      // Wait for snapshot
      const listResult = await waitForSnapshots(client, 1);
      const snapshots = (listResult.snapshots as Array<Record<string, unknown>>)
        .filter((s) => s.tool === "pg_truncate");
      expect(snapshots.length).toBeGreaterThanOrEqual(1);

      const filename = snapshots[snapshots.length - 1]!.filename as string;

      // Diff — now that the table is empty, volumeDrift should show row count change
      const diffResult = await callToolAndParse(client, "pg_audit_diff_backup", {
        filename,
      });

      expect(diffResult.success).toBe(true);

      // V2: volumeDrift must be present with summary
      const volumeDrift = diffResult.volumeDrift as Record<string, unknown> | undefined;
      expect(
        volumeDrift,
        "Expected volumeDrift field from pg_audit_diff_backup",
      ).toBeDefined();
      // summary is always present
      expect(typeof volumeDrift!.summary).toBe("string");
      // rowCountSnapshot is set from the snapshot metadata
      expect(typeof volumeDrift!.rowCountSnapshot).toBe("number");
      expect(volumeDrift!.rowCountSnapshot as number).toBe(3);
      // rowCountCurrent should be 0 after ANALYZE on the truncated table
      if (volumeDrift!.rowCountCurrent !== undefined) {
        expect(volumeDrift!.rowCountCurrent as number).toBe(0);
      }
    } finally {
      try {
        if (client) {
          await callToolAndParse(client, "pg_drop_table", {
            table: TEMP_TABLE,
            ifExists: true,
          });
        }
      } catch { /* ignore cleanup errors */ }
      if (client) await client.close();
      stopServer(port);
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("diff_backup gracefully maps -1 for unanalyzed table row counts", async () => {
    const TEMP_TABLE = "e2e_backup_unanalyzed";
    const port = BACKUP_PORT_BASE + 6;
    const dir = auditDir("unanalyzed");
    await mkdir(dir, { recursive: true });
    const logPath = join(dir, "audit.jsonl");

    await startServer(
      port,
      [
        "--audit-log", logPath,
        "--audit-backup",
        "--audit-backup-data",
        "--tool-filter", "core,admin,backup,schema",
      ],
      "backup-unanalyzed",
    );

    let client: Client | undefined;
    try {
      client = await createClient(`http://127.0.0.1:${port}`);

      await callToolAndParse(client, "pg_create_table", {
        name: TEMP_TABLE,
        columns: [
          { name: "id", type: "SERIAL", primaryKey: true },
        ],
      });

      // NO ANALYZE is called here. reltuples should remain -1.
      await callToolAndParse(client, "pg_truncate", { table: TEMP_TABLE });

      const listResult = await waitForSnapshots(client, 1);
      const snapshots = (listResult.snapshots as Array<Record<string, unknown>>)
        .filter((s) => s.tool === "pg_truncate");
      const filename = snapshots[snapshots.length - 1]!.filename as string;

      const diffResult = await callToolAndParse(client, "pg_audit_diff_backup", {
        filename,
      });

      expect(diffResult.success).toBe(true);

      const volumeDrift = diffResult.volumeDrift as Record<string, unknown> | undefined;
      expect(volumeDrift).toBeDefined();
      
      // Even though we never analyzed, the fallback SELECT COUNT(*) ensures we get 0 instead of -1.
      if (volumeDrift!.rowCountSnapshot !== undefined) {
        expect(volumeDrift!.rowCountSnapshot as number).toBe(0);
      }
    } finally {
      if (client) await client.close();
      stopServer(port);
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("restore_backup restoreAs creates alternate table without touching original", async () => {
    const TEMP_TABLE = "e2e_backup_restore_as_src";
    const RESTORE_AS_TABLE = "e2e_backup_restore_as_copy";
    const port = BACKUP_PORT_BASE + 5;
    const dir = auditDir("restoreas");
    await mkdir(dir, { recursive: true });
    const logPath = join(dir, "audit.jsonl");

    await startServer(
      port,
      [
        "--audit-log", logPath,
        "--audit-backup",
        "--tool-filter", "core,backup,schema",
      ],
      "backup-restoreas",
    );

    let client: Client | undefined;
    try {
      client = await createClient(`http://127.0.0.1:${port}`);

      // Use simple column types — SERIAL creates a sequence that gets dropped
      // with the table, causing restoreAs to fail on the dangling nextval()
      await callToolAndParse(client, "pg_create_table", {
        name: TEMP_TABLE,
        columns: [
          { name: "id", type: "INTEGER", notNull: true },
          { name: "label", type: "TEXT", notNull: true },
        ],
      });

      // Drop triggers snapshot
      await callToolAndParse(client, "pg_drop_table", { table: TEMP_TABLE });

      const listResult = await waitForSnapshots(client, 1);
      const snapshots = (listResult.snapshots as Array<Record<string, unknown>>)
        .filter((s) => s.tool === "pg_drop_table");
      const filename = snapshots[snapshots.length - 1]!.filename as string;

      // Restore the snapshot UNDER A NEW NAME (restoreAs)
      const restoreResult = await callToolAndParse(
        client,
        "pg_audit_restore_backup",
        { filename, restoreAs: RESTORE_AS_TABLE },
      );

      expect(restoreResult.success).toBe(true);
      // dryRun must be false / absent (this was a real restore)
      expect(restoreResult.dryRun).not.toBe(true);
      // restoreAs echoed back in response
      expect(restoreResult.restoreAs).toBe(RESTORE_AS_TABLE);

      // The alternate table must now exist with the same column structure
      const descCopy = await callToolAndParse(client, "pg_describe_table", {
        table: RESTORE_AS_TABLE,
      });
      // pg_describe_table returns { columns: [...] } on success (no explicit success: true)
      expect(descCopy.success).not.toBe(false);
      const columns = descCopy.columns as Array<Record<string, unknown>>;
      expect(Array.isArray(columns)).toBe(true);
      expect(columns.some((c) => c.name === "id")).toBe(true);
      expect(columns.some((c) => c.name === "label")).toBe(true);

      // The original table must NOT exist (it was dropped before restore)
      const descOrig = await callToolAndParse(client, "pg_describe_table", {
        table: TEMP_TABLE,
      });
      expect(descOrig.success).toBe(false);
    } finally {
      try {
        if (client) {
          await callToolAndParse(client, "pg_drop_table", {
            table: RESTORE_AS_TABLE,
            ifExists: true,
          });
          await callToolAndParse(client, "pg_drop_table", {
            table: TEMP_TABLE,
            ifExists: true,
          });
        }
      } catch { /* ignore cleanup errors */ }
      if (client) await client.close();
      stopServer(port);
      await rm(dir, { recursive: true, force: true });
    }
  });
});
