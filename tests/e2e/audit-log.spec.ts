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
import { startServer, stopServer, createClient, callToolRaw } from "./helpers.js";
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
});
