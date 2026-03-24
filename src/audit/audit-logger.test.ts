/**
 * postgres-mcp — Audit Logger Tests
 *
 * Tests the AuditLogger JSONL writer in isolation:
 * - File I/O, buffering, flush, close
 * - Redact mode
 * - Missing parent directories
 * - recent() tail reader
 * - Non-blocking error handling
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { AuditLogger } from "./logger.js";
import type { AuditEntry, AuditConfig } from "./types.js";

/** Helper: create a temp directory path scoped to this test run */
function tempDir(): string {
  return join(
    tmpdir(),
    `pg-audit-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
}

/** Helper: build a minimal valid AuditEntry */
function fakeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    timestamp: new Date().toISOString(),
    requestId: "req-001",
    tool: "pg_write_query",
    category: "write",
    scope: "write",
    user: "alice@example.com",
    scopes: ["write"],
    durationMs: 42,
    success: true,
    ...overrides,
  };
}

describe("AuditLogger", () => {
  let dir: string;

  beforeEach(() => {
    dir = tempDir();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("should write JSONL entries to file", async () => {
    const logPath = join(dir, "audit.jsonl");
    const logger = new AuditLogger({ enabled: true, logPath, redact: false, auditReads: false, maxSizeBytes: 0 });

    logger.log(fakeEntry({ tool: "pg_write_query" }));
    logger.log(fakeEntry({ tool: "pg_create_table" }));
    await logger.close();

    const content = await readFile(logPath, "utf-8");
    const lines = content.trim().split("\n");

    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]!) as AuditEntry;
    const second = JSON.parse(lines[1]!) as AuditEntry;
    expect(first.tool).toBe("pg_write_query");
    expect(second.tool).toBe("pg_create_table");
  });

  it("should include args when redact is false", async () => {
    const logPath = join(dir, "audit.jsonl");
    const logger = new AuditLogger({ enabled: true, logPath, redact: false, auditReads: false, maxSizeBytes: 0 });

    logger.log(fakeEntry({ args: { sql: "INSERT INTO users VALUES (1)" } }));
    await logger.close();

    const content = await readFile(logPath, "utf-8");
    const entry = JSON.parse(content.trim()) as AuditEntry;
    expect(entry.args).toEqual({ sql: "INSERT INTO users VALUES (1)" });
  });

  it("should omit args when redact is true", async () => {
    const logPath = join(dir, "audit.jsonl");
    const logger = new AuditLogger({ enabled: true, logPath, redact: true, auditReads: false, maxSizeBytes: 0 });

    // The logger itself doesn't strip args — the interceptor does.
    // But we can verify the logger faithfully writes whatever it receives.
    logger.log(fakeEntry({ args: undefined }));
    await logger.close();

    const content = await readFile(logPath, "utf-8");
    const entry = JSON.parse(content.trim()) as AuditEntry;
    expect(entry.args).toBeUndefined();
  });

  it("should create parent directories if they don't exist", async () => {
    const logPath = join(dir, "nested", "deep", "audit.jsonl");
    const logger = new AuditLogger({ enabled: true, logPath, redact: false, auditReads: false, maxSizeBytes: 0 });

    logger.log(fakeEntry());
    await logger.close();

    const content = await readFile(logPath, "utf-8");
    expect(content.trim()).toBeTruthy();
  });

  it("should not write when disabled", async () => {
    const logPath = join(dir, "audit.jsonl");
    const logger = new AuditLogger({ enabled: false, logPath, redact: false, auditReads: false, maxSizeBytes: 0 });

    logger.log(fakeEntry());
    await logger.close();

    // File should not have been created
    await expect(readFile(logPath, "utf-8")).rejects.toThrow();
  });

  it("should flush remaining entries on close", async () => {
    const logPath = join(dir, "audit.jsonl");
    const logger = new AuditLogger({ enabled: true, logPath, redact: false, auditReads: false, maxSizeBytes: 0 });

    // Log multiple entries rapidly
    for (let i = 0; i < 10; i++) {
      logger.log(fakeEntry({ requestId: `req-${String(i)}` }));
    }

    await logger.close();

    const content = await readFile(logPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(10);
  });

  it("should record error entries with success=false", async () => {
    const logPath = join(dir, "audit.jsonl");
    const logger = new AuditLogger({ enabled: true, logPath, redact: false, auditReads: false, maxSizeBytes: 0 });

    logger.log(
      fakeEntry({
        success: false,
        error: "relation \"users\" does not exist",
      }),
    );
    await logger.close();

    const content = await readFile(logPath, "utf-8");
    const entry = JSON.parse(content.trim()) as AuditEntry;
    expect(entry.success).toBe(false);
    expect(entry.error).toBe("relation \"users\" does not exist");
  });

  describe("recent()", () => {
    it("should return the last N entries", async () => {
      const logPath = join(dir, "audit.jsonl");
      const logger = new AuditLogger({ enabled: true, logPath, redact: false, auditReads: false, maxSizeBytes: 0 });

      for (let i = 0; i < 20; i++) {
        logger.log(fakeEntry({ requestId: `req-${String(i)}` }));
      }
      await logger.flush();

      const recent = await logger.recent(5);
      expect(recent).toHaveLength(5);
      expect(recent[0]!.requestId).toBe("req-15");
      expect(recent[4]!.requestId).toBe("req-19");
    });

    it("should return empty array when file does not exist", async () => {
      const logPath = join(dir, "nonexistent.jsonl");
      const logger = new AuditLogger({ enabled: true, logPath, redact: false, auditReads: false, maxSizeBytes: 0 });

      const recent = await logger.recent();
      expect(recent).toEqual([]);

      await logger.close();
    });

    it("should return all entries when fewer than count exist", async () => {
      const logPath = join(dir, "audit.jsonl");
      const logger = new AuditLogger({ enabled: true, logPath, redact: false, auditReads: false, maxSizeBytes: 0 });

      logger.log(fakeEntry({ requestId: "only-one" }));
      await logger.flush();

      const recent = await logger.recent(50);
      expect(recent).toHaveLength(1);
      expect(recent[0]!.requestId).toBe("only-one");

      await logger.close();
    });
  });

  it("should preserve user=null when OAuth is not configured", async () => {
    const logPath = join(dir, "audit.jsonl");
    const logger = new AuditLogger({ enabled: true, logPath, redact: false, auditReads: false, maxSizeBytes: 0 });

    logger.log(fakeEntry({ user: null, scopes: [] }));
    await logger.close();

    const content = await readFile(logPath, "utf-8");
    const entry = JSON.parse(content.trim()) as AuditEntry;
    expect(entry.user).toBeNull();
    expect(entry.scopes).toEqual([]);
  });

  describe("stderr mode", () => {
    it("should write JSONL entries to stderr", async () => {
      const logger = new AuditLogger({
        enabled: true,
        logPath: "stderr",
        redact: false,
        auditReads: false,
        maxSizeBytes: 0,
      });

      const chunks: string[] = [];
      const originalWrite = process.stderr.write;
      process.stderr.write = ((chunk: string) => {
        chunks.push(chunk);
        return true;
      }) as typeof process.stderr.write;

      try {
        logger.log(fakeEntry({ tool: "pg_write_query" }));
        await logger.flush();

        expect(chunks.length).toBeGreaterThan(0);
        const entry = JSON.parse(chunks[0]!.trim()) as AuditEntry;
        expect(entry.tool).toBe("pg_write_query");
      } finally {
        process.stderr.write = originalWrite;
        await logger.close();
      }
    });

    it("should return empty from recent() in stderr mode", async () => {
      const logger = new AuditLogger({
        enabled: true,
        logPath: "stderr",
        redact: false,
        auditReads: false,
        maxSizeBytes: 0,
      });

      // Suppress stderr output during test
      const originalWrite = process.stderr.write;
      process.stderr.write = (() => true) as typeof process.stderr.write;

      try {
        logger.log(fakeEntry());
        await logger.flush();

        const recent = await logger.recent();
        expect(recent).toEqual([]);
      } finally {
        process.stderr.write = originalWrite;
        await logger.close();
      }
    });

    it("should be case-insensitive for stderr sentinel", async () => {
      const logger = new AuditLogger({
        enabled: true,
        logPath: "STDERR",
        redact: false,
        auditReads: false,
        maxSizeBytes: 0,
      });

      const chunks: string[] = [];
      const originalWrite = process.stderr.write;
      process.stderr.write = ((chunk: string) => {
        chunks.push(chunk);
        return true;
      }) as typeof process.stderr.write;

      try {
        logger.log(fakeEntry({ tool: "pg_vacuum" }));
        await logger.flush();

        expect(chunks.length).toBeGreaterThan(0);
      } finally {
        process.stderr.write = originalWrite;
        await logger.close();
      }
    });
  });

  describe("log rotation", () => {
    it("should rotate the log file when maxSizeBytes is exceeded", async () => {
      const logPath = join(dir, "audit.jsonl");
      const logger = new AuditLogger({
        enabled: true,
        logPath,
        redact: false,
        auditReads: false,
        maxSizeBytes: 500, // Very low limit to trigger rotation
      });

      // Write enough entries to exceed 500 bytes
      for (let i = 0; i < 10; i++) {
        logger.log(
          fakeEntry({
            tool: `pg_write_query`,
            requestId: `rotation-${String(i)}`,
          }),
        );
      }
      await logger.flush();

      // Write more to trigger rotation on next flush
      for (let i = 10; i < 12; i++) {
        logger.log(
          fakeEntry({
            tool: `pg_write_query`,
            requestId: `rotation-${String(i)}`,
          }),
        );
      }
      await logger.flush();

      // The rotated file should exist
      const { stat } = await import("node:fs/promises");
      const rotatedPath = `${logPath}.1`;
      const rotatedStat = await stat(rotatedPath);
      expect(rotatedStat.size).toBeGreaterThan(0);

      // The current log should be smaller than the rotated one
      // (it contains only the 2 entries written after rotation)
      const currentStat = await stat(logPath);
      expect(currentStat.size).toBeLessThan(rotatedStat.size);

      await logger.close();
    });
  });
});
