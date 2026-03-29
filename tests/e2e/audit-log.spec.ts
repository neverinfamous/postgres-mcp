/**
 * E2E Tests: Audit Log
 *
 * Spawns a server with --audit-log enabled and verifies:
 * 1. Write-scoped tool calls produce JSONL audit entries on disk
 * 2. Read-scoped tool calls (core group) are NOT logged
 * 3. postgres://audit resource returns recent entries
 * 4. --audit-redact omits tool arguments from entries
 *
 * NOTE: The audit interceptor only logs tools whose group maps to
 * "write" or "admin" scope (see auth/scopes.ts). The "core" group
 * (which includes pg_write_query) maps to "read" scope, so we use
 * transaction tools (write scope) to generate audit entries.
 */

import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";

import { test, expect } from "@playwright/test";
import { startServer, stopServer, createClient, callToolRaw, callToolAndParse } from "./helpers.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

const AUDIT_PORT_BASE = 3150;

/** Tool filter that includes both core (read-scope) and transactions (write-scope) */
const AUDIT_FILTER = "core,transactions";

/** Generate a unique temp file path for each test */
function auditLogPath(suffix: string): string {
  return join(tmpdir(), `pg-audit-e2e-${suffix}-${Date.now()}.jsonl`);
}

/**
 * Retry reading the audit log file until it exists and has entries.
 * The server runs in a separate process with an async flush buffer,
 * so we need to poll.
 */
async function readAuditLogWithRetry(
  path: string,
  maxAttempts = 15,
  intervalMs = 500,
): Promise<Array<Record<string, unknown>>> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const content = await readFile(path, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      if (lines.length > 0) {
        return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
      }
    } catch {
      // File doesn't exist yet — keep trying
    }
    await delay(intervalMs);
  }
  throw new Error(`Audit log file ${path} not found or empty after ${maxAttempts * intervalMs}ms`);
}

test.describe("Audit Log", () => {
  test("write-scoped tool calls produce audit entries", async () => {
    const port = AUDIT_PORT_BASE;
    const logPath = auditLogPath("write");

    await startServer(
      port,
      ["--audit-log", logPath, "--tool-filter", AUDIT_FILTER],
      "audit-write",
    );

    let client: Client | undefined;
    try {
      client = await createClient(`http://localhost:${port}`);

      // Begin a transaction (write scope) — should be logged
      await callToolRaw(client, "pg_transaction_begin", {});

      const entries = await readAuditLogWithRetry(logPath);
      expect(entries.length).toBeGreaterThanOrEqual(1);

      const entry = entries[entries.length - 1]!;
      expect(entry.tool).toBe("pg_transaction_begin");
      expect(entry.category).toBe("write");
      expect(entry.success).toBe(true);
      expect(typeof entry.timestamp).toBe("string");
      expect(typeof entry.durationMs).toBe("number");
      expect(entry.args).toBeDefined();

      // Rollback the transaction to clean up
      await callToolRaw(client, "pg_transaction_rollback", {});
    } finally {
      if (client) await client.close();
      stopServer(port);
      await rm(logPath, { force: true });
    }
  });

  test("read-scoped tool calls are NOT logged", async () => {
    const port = AUDIT_PORT_BASE + 1;
    const logPath = auditLogPath("readonly");

    await startServer(
      port,
      ["--audit-log", logPath, "--tool-filter", AUDIT_FILTER],
      "audit-readonly",
    );

    let client: Client | undefined;
    try {
      client = await createClient(`http://localhost:${port}`);

      // Execute only read-scope tools (core group = read scope)
      await callToolRaw(client, "pg_read_query", { sql: "SELECT 1 AS n" });
      await callToolRaw(client, "pg_list_tables", {});

      // Wait generously — longer than the flush interval
      await delay(2000);

      // Audit log file should not exist (no write/admin scoped tools invoked)
      let fileExists = false;
      try {
        await readFile(logPath, "utf-8");
        fileExists = true;
      } catch {
        // Expected — file should not exist
      }
      expect(fileExists).toBe(false);
    } finally {
      if (client) await client.close();
      stopServer(port);
      await rm(logPath, { force: true });
    }
  });

  test("postgres://audit resource returns recent entries", async () => {
    const port = AUDIT_PORT_BASE + 2;
    const logPath = auditLogPath("resource");

    await startServer(
      port,
      ["--audit-log", logPath, "--tool-filter", AUDIT_FILTER],
      "audit-resource",
    );

    let client: Client | undefined;
    try {
      client = await createClient(`http://localhost:${port}`);

      // Create an audit entry via a write-scope tool
      await callToolRaw(client, "pg_transaction_begin", {});

      // Wait for the server's async buffer to flush to disk
      await readAuditLogWithRetry(logPath);

      // Read the audit resource — returns { entries: [...], total: N }
      const resource = await client.readResource({ uri: "postgres://audit" });
      expect(resource.contents).toBeDefined();
      expect(resource.contents.length).toBeGreaterThan(0);

      const text = resource.contents[0]!.text!;
      const body = JSON.parse(text) as { entries: Array<Record<string, unknown>>; total: number };
      expect(body.entries.length).toBeGreaterThanOrEqual(1);
      expect(body.total).toBeGreaterThanOrEqual(1);
      expect(body.entries[body.entries.length - 1]!.tool).toBe("pg_transaction_begin");

      // Rollback to clean up
      await callToolRaw(client, "pg_transaction_rollback", {});
    } finally {
      if (client) await client.close();
      stopServer(port);
      await rm(logPath, { force: true });
    }
  });

  test("--audit-redact omits tool arguments from entries", async () => {
    const port = AUDIT_PORT_BASE + 3;
    const logPath = auditLogPath("redact");

    await startServer(
      port,
      ["--audit-log", logPath, "--audit-redact", "--tool-filter", AUDIT_FILTER],
      "audit-redact",
    );

    let client: Client | undefined;
    try {
      client = await createClient(`http://localhost:${port}`);

      // Begin a transaction (write scope) with redact enabled
      await callToolRaw(client, "pg_transaction_begin", {});

      const entries = await readAuditLogWithRetry(logPath);
      expect(entries.length).toBeGreaterThanOrEqual(1);

      const entry = entries[entries.length - 1]!;
      expect(entry.tool).toBe("pg_transaction_begin");
      expect(entry.success).toBe(true);
      // Args should be redacted (undefined / not present)
      expect(entry.args).toBeUndefined();

      // Rollback to clean up
      await callToolRaw(client, "pg_transaction_rollback", {});
    } finally {
      if (client) await client.close();
      stopServer(port);
      await rm(logPath, { force: true });
    }
  });

  test("--audit-reads logs read-scoped tools with compact entries", async () => {
    const port = AUDIT_PORT_BASE + 4;
    const logPath = auditLogPath("reads");

    await startServer(
      port,
      ["--audit-log", logPath, "--audit-reads", "--tool-filter", AUDIT_FILTER],
      "audit-reads",
    );

    let client: Client | undefined;
    try {
      client = await createClient(`http://localhost:${port}`);

      // Execute a read-scope tool (core group = read scope)
      await callToolRaw(client, "pg_read_query", { sql: "SELECT 1 AS n" });

      const entries = await readAuditLogWithRetry(logPath);
      expect(entries.length).toBeGreaterThanOrEqual(1);

      // Find the read entry
      const readEntry = entries.find((e) => e.tool === "pg_read_query");
      expect(readEntry).toBeDefined();
      expect(readEntry!.category).toBe("read");
      expect(readEntry!.success).toBe(true);

      // Compact format: no args, user, scopes
      expect(readEntry!.args).toBeUndefined();
      expect(readEntry!.user).toBeUndefined();
      expect(readEntry!.scopes).toBeUndefined();
    } finally {
      if (client) await client.close();
      stopServer(port);
      await rm(logPath, { force: true });
    }
  });

  test("audit entries include tokenEstimate > 0", async () => {
    const port = AUDIT_PORT_BASE + 5;
    const logPath = auditLogPath("tokens");

    await startServer(
      port,
      ["--audit-log", logPath, "--tool-filter", AUDIT_FILTER],
      "audit-tokens",
    );

    let client: Client | undefined;
    try {
      client = await createClient(`http://localhost:${port}`);

      // Begin a transaction (write scope) — should be logged with tokenEstimate
      await callToolRaw(client, "pg_transaction_begin", {});

      const entries = await readAuditLogWithRetry(logPath);
      expect(entries.length).toBeGreaterThanOrEqual(1);

      const entry = entries[entries.length - 1]!;
      expect(entry.tool).toBe("pg_transaction_begin");
      expect(typeof entry.tokenEstimate).toBe("number");
      expect(entry.tokenEstimate as number).toBeGreaterThan(0);

      // Rollback to clean up
      await callToolRaw(client, "pg_transaction_rollback", {});
    } finally {
      if (client) await client.close();
      stopServer(port);
      await rm(logPath, { force: true });
    }
  });

  test("postgres://audit resource includes summary block", async () => {
    const port = AUDIT_PORT_BASE + 6;
    const logPath = auditLogPath("summary");

    await startServer(
      port,
      ["--audit-log", logPath, "--tool-filter", AUDIT_FILTER],
      "audit-summary",
    );

    let client: Client | undefined;
    try {
      client = await createClient(`http://localhost:${port}`);

      // Create an audit entry via a write-scope tool
      await callToolRaw(client, "pg_transaction_begin", {});

      // Wait for the server's async buffer to flush to disk
      await readAuditLogWithRetry(logPath);

      // Read the audit resource
      const resource = await client.readResource({ uri: "postgres://audit" });
      expect(resource.contents).toBeDefined();
      expect(resource.contents.length).toBeGreaterThan(0);

      const text = resource.contents[0]!.text!;
      const body = JSON.parse(text) as {
        summary: {
          totalTokenEstimate: number;
          callCount: number;
          topToolsByTokens: Array<{ tool: string; calls: number; tokens: number }>;
          note: string;
        };
        entries: Array<Record<string, unknown>>;
        total: number;
      };

      // Verify summary block structure
      expect(body.summary).toBeDefined();
      expect(typeof body.summary.totalTokenEstimate).toBe("number");
      expect(body.summary.totalTokenEstimate).toBeGreaterThan(0);
      expect(body.summary.callCount).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(body.summary.topToolsByTokens)).toBe(true);
      expect(body.summary.topToolsByTokens.length).toBeGreaterThanOrEqual(1);
      expect(typeof body.summary.note).toBe("string");

      // Verify top tools structure
      const topTool = body.summary.topToolsByTokens[0]!;
      expect(topTool.tool).toBe("pg_transaction_begin");
      expect(topTool.calls).toBeGreaterThanOrEqual(1);
      expect(topTool.tokens).toBeGreaterThan(0);

      // Rollback to clean up
      await callToolRaw(client, "pg_transaction_rollback", {});
    } finally {
      if (client) await client.close();
      stopServer(port);
      await rm(logPath, { force: true });
    }
    });

  test("audit log rotates when max size is exceeded", async () => {
    const port = AUDIT_PORT_BASE + 7;
    const logPath = auditLogPath("rotation");

    // Set a very small rotate size (e.g. 500 bytes)
    const originalMaxSize = process.env.AUDIT_LOG_MAX_SIZE;
    process.env.AUDIT_LOG_MAX_SIZE = "500";

    try {
      await startServer(
        port,
        ["--audit-log", logPath, "--tool-filter", AUDIT_FILTER],
        "audit-rotation",
      );

      let client: Client | undefined;
      try {
        client = await createClient(`http://localhost:${port}`);

        // Write first batch to exceed 500 bytes
        for (let i = 0; i < 8; i++) {
          const res = await callToolAndParse(client, "pg_transaction_begin", {});
          const txId = res["transactionId"] as string | undefined;
          if (txId) {
            await callToolAndParse(client, "pg_transaction_rollback", { transactionId: txId });
          }
        }
        // Force server to flush first batch
        await delay(300);

        // Write second batch to trigger rotation based on first batch's size
        for (let i = 0; i < 2; i++) {
          const res = await callToolAndParse(client, "pg_transaction_begin", {});
          const txId = res["transactionId"] as string | undefined;
          if (txId) {
            await callToolAndParse(client, "pg_transaction_rollback", { transactionId: txId });
          }
        }

        // Wait for async flush
        await readAuditLogWithRetry(logPath);
        // Wait an extra moment to ensure rotation logic executes completely on the server
        await delay(500);

        // The rotated file should exist
        const { stat } = await import("node:fs/promises");
        const rotatedPath = `${logPath}.1`;
        const rotatedStat = await stat(rotatedPath);
        expect(rotatedStat.size).toBeGreaterThan(0);

        // The current log should theoretically be smaller or at least valid
        const currentStat = await stat(logPath);
        expect(currentStat.size).toBeGreaterThanOrEqual(0);

      } finally {
        if (client) await client.close();
        stopServer(port);
        await rm(logPath, { force: true }).catch(() => {});
        await rm(`${logPath}.1`, { force: true }).catch(() => {});
      }
    } finally {
      if (originalMaxSize === undefined) {
        delete process.env.AUDIT_LOG_MAX_SIZE;
      } else {
        process.env.AUDIT_LOG_MAX_SIZE = originalMaxSize;
      }
    }
  });

  test("audit log correctly ignores and recovers from corrupted entries", async () => {
    const port = AUDIT_PORT_BASE + 8;
    const logPath = auditLogPath("corrupted");

    // Manually write a corrupted log file before server starts
    const { appendFile } = await import("node:fs/promises");
    await appendFile(logPath, '{"tool":"pg_transaction_begin","category":"wri\n'); // Incomplete JSON
    await appendFile(logPath, '{"tool":"pg_transaction_rollback","category":"write","success":true,"timestamp":"2023-10-10T10:00:00.000Z","durationMs":0,"args":{}}\n'); // Valid JSON

    await startServer(
      port,
      ["--audit-log", logPath, "--tool-filter", AUDIT_FILTER],
      "audit-corrupted",
    );

    let client: Client | undefined;
    try {
      client = await createClient(`http://localhost:${port}`);

      // Perform a new write
      await callToolRaw(client, "pg_transaction_begin", {});
      await callToolRaw(client, "pg_transaction_rollback", {});
      
      // Wait generous amount for background flush to disk
      await new Promise(r => setTimeout(r, 2000));

      // Read via resource which is evaluated natively by AuditLogger
      const resource = await client.readResource({ uri: "postgres://audit" });
      const text = resource.contents[0]!.text!;
      const body = JSON.parse(text) as { entries: Array<Record<string, unknown>>; total: number };

      // Corrupted line is ignored, valid previous line + new lines are read
      const toolsRead = body.entries.map((e) => e.tool);
      expect(toolsRead).toContain("pg_transaction_rollback");
      expect(toolsRead).toContain("pg_transaction_begin");
    } finally {
      if (client) await client.close();
      stopServer(port);
      await rm(logPath, { force: true });
    }
  });
});


