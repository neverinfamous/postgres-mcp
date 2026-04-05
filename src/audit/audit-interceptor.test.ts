/**
 * postgres-mcp — Audit Interceptor Tests
 *
 * Tests the audit interceptor's scope-based filtering,
 * OAuth identity capture, error handling, and timing.
 * Uses mocked auth context and scope-map.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { AuditLogger } from "./logger.js";
import { createAuditInterceptor } from "./interceptor.js";
import type { AuditEntry } from "./types.js";

// Mock the auth context and scope-map modules
vi.mock("../auth/auth-context.js", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("../auth/scope-map.js", () => ({
  getRequiredScope: vi.fn(),
}));

import { getAuthContext } from "../auth/auth-context.js";
import { getRequiredScope } from "../auth/scope-map.js";

const mockGetAuthContext = vi.mocked(getAuthContext);
const mockGetRequiredScope = vi.mocked(getRequiredScope);

function tempDir(): string {
  return join(
    tmpdir(),
    `pg-audit-int-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
}

describe("AuditInterceptor", () => {
  let dir: string;
  let logger: AuditLogger;

  beforeEach(() => {
    dir = tempDir();
    logger = new AuditLogger({
      enabled: true,
      logPath: join(dir, "audit.jsonl"),
      redact: false,
      auditReads: false,
      maxSizeBytes: 0,
    });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await logger.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("should skip read-only tools", async () => {
    mockGetRequiredScope.mockReturnValue("read");

    const interceptor = createAuditInterceptor(logger);
    const result = await interceptor.around(
      "pg_read_query",
      { sql: "SELECT 1" },
      "req-001",
      async () => ({ rows: [] }),
    );

    expect(result).toEqual({ rows: [] });
    await logger.flush();

    // No audit file should be created for read-only tools
    await expect(readFile(join(dir, "audit.jsonl"), "utf-8")).rejects.toThrow();
  });

  it("should log write tool execution", async () => {
    mockGetRequiredScope.mockReturnValue("write");
    mockGetAuthContext.mockReturnValue(undefined);

    const interceptor = createAuditInterceptor(logger);
    await interceptor.around(
      "pg_write_query",
      { sql: "INSERT INTO t VALUES (1)" },
      "req-002",
      async () => ({ rowsAffected: 1 }),
    );
    await logger.flush();

    const content = await readFile(join(dir, "audit.jsonl"), "utf-8");
    const entry = JSON.parse(content.trim()) as AuditEntry;

    expect(entry.tool).toBe("pg_write_query");
    expect(entry.category).toBe("write");
    expect(entry.scope).toBe("write");
    expect(entry.success).toBe(true);
    expect(entry.requestId).toBe("req-002");
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("should log admin tool execution with category=admin", async () => {
    mockGetRequiredScope.mockReturnValue("admin");
    mockGetAuthContext.mockReturnValue(undefined);

    const interceptor = createAuditInterceptor(logger);
    await interceptor.around(
      "pg_execute_code",
      { code: "pg.core.readQuery({sql: 'SELECT 1'})" },
      "req-003",
      async () => ({ result: 1 }),
    );
    await logger.flush();

    const content = await readFile(join(dir, "audit.jsonl"), "utf-8");
    const entry = JSON.parse(content.trim()) as AuditEntry;

    expect(entry.tool).toBe("pg_execute_code");
    expect(entry.category).toBe("admin");
    expect(entry.scope).toBe("admin");
  });

  it("should capture OAuth identity from auth context", async () => {
    mockGetRequiredScope.mockReturnValue("write");
    mockGetAuthContext.mockReturnValue({
      authenticated: true,
      claims: {
        sub: "alice@team.com",
        scopes: ["write", "db:production"],
        exp: Date.now() / 1000 + 3600,
        iat: Date.now() / 1000,
      },
      scopes: ["write", "db:production"],
    });

    const interceptor = createAuditInterceptor(logger);
    await interceptor.around(
      "pg_create_table",
      { name: "users" },
      "req-004",
      async () => ({ success: true }),
    );
    await logger.flush();

    const content = await readFile(join(dir, "audit.jsonl"), "utf-8");
    const entry = JSON.parse(content.trim()) as AuditEntry;

    expect(entry.user).toBe("alice@team.com");
    expect(entry.scopes).toEqual(["write", "db:production"]);
  });

  it("should set user=null when no OAuth context", async () => {
    mockGetRequiredScope.mockReturnValue("write");
    mockGetAuthContext.mockReturnValue(undefined);

    const interceptor = createAuditInterceptor(logger);
    await interceptor.around(
      "pg_drop_table",
      { table: "old_data" },
      "req-005",
      async () => ({ success: true }),
    );
    await logger.flush();

    const content = await readFile(join(dir, "audit.jsonl"), "utf-8");
    const entry = JSON.parse(content.trim()) as AuditEntry;

    expect(entry.user).toBeNull();
    expect(entry.scopes).toEqual([]);
  });

  it("should capture errors and re-throw", async () => {
    mockGetRequiredScope.mockReturnValue("write");
    mockGetAuthContext.mockReturnValue(undefined);

    const interceptor = createAuditInterceptor(logger);

    await expect(
      interceptor.around(
        "pg_write_query",
        { sql: "INSERT INTO nonexistent" },
        "req-006",
        async () => {
          throw new Error('relation "nonexistent" does not exist');
        },
      ),
    ).rejects.toThrow('relation "nonexistent" does not exist');

    await logger.flush();

    const content = await readFile(join(dir, "audit.jsonl"), "utf-8");
    const entry = JSON.parse(content.trim()) as AuditEntry;

    expect(entry.success).toBe(false);
    expect(entry.error).toBe('relation "nonexistent" does not exist');
    expect(entry.tool).toBe("pg_write_query");
  });

  it("should measure duration", async () => {
    mockGetRequiredScope.mockReturnValue("write");
    mockGetAuthContext.mockReturnValue(undefined);

    const interceptor = createAuditInterceptor(logger);
    await interceptor.around("pg_write_query", {}, "req-007", async () => {
      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { ok: true };
    });
    await logger.flush();

    const content = await readFile(join(dir, "audit.jsonl"), "utf-8");
    const entry = JSON.parse(content.trim()) as AuditEntry;

    expect(entry.durationMs).toBeGreaterThanOrEqual(5);
  });

  it("should redact args when logger is in redact mode", async () => {
    await logger.close();
    logger = new AuditLogger({
      enabled: true,
      logPath: join(dir, "audit-redacted.jsonl"),
      redact: true,
      auditReads: false,
      maxSizeBytes: 0,
    });

    mockGetRequiredScope.mockReturnValue("write");
    mockGetAuthContext.mockReturnValue(undefined);

    const interceptor = createAuditInterceptor(logger);
    await interceptor.around(
      "pg_write_query",
      { sql: "UPDATE users SET email='secret@test.com'" },
      "req-008",
      async () => ({ rowsAffected: 1 }),
    );
    await logger.flush();

    const content = await readFile(join(dir, "audit-redacted.jsonl"), "utf-8");
    const entry = JSON.parse(content.trim()) as AuditEntry;

    expect(entry.args).toBeUndefined();
    expect(entry.tool).toBe("pg_write_query");
    expect(entry.success).toBe(true);
  });

  it("should return the tool result unchanged", async () => {
    mockGetRequiredScope.mockReturnValue("admin");
    mockGetAuthContext.mockReturnValue(undefined);

    const interceptor = createAuditInterceptor(logger);
    const expected = { rows: [{ id: 1 }], rowsAffected: 0 };

    const result = await interceptor.around(
      "pg_vacuum",
      { table: "users" },
      "req-009",
      async () => expected,
    );

    expect(result).toBe(expected); // Same reference — not cloned
  });

  it("should include tokenEstimate on write tool entries", async () => {
    mockGetRequiredScope.mockReturnValue("write");
    mockGetAuthContext.mockReturnValue(undefined);

    const interceptor = createAuditInterceptor(logger);
    await interceptor.around(
      "pg_write_query",
      { sql: "INSERT INTO t VALUES (1)" },
      "req-010",
      async () => ({ rowsAffected: 1, success: true }),
    );
    await logger.flush();

    const content = await readFile(join(dir, "audit.jsonl"), "utf-8");
    const entry = JSON.parse(content.trim()) as AuditEntry;

    expect(typeof entry.tokenEstimate).toBe("number");
    expect(entry.tokenEstimate).toBeGreaterThan(0);
  });

  it("should log read-scoped tools when auditReads is enabled", async () => {
    await logger.close();
    logger = new AuditLogger({
      enabled: true,
      logPath: join(dir, "audit-reads.jsonl"),
      redact: false,
      auditReads: true,
      maxSizeBytes: 0,
    });

    mockGetRequiredScope.mockReturnValue("read");
    mockGetAuthContext.mockReturnValue(undefined);

    const interceptor = createAuditInterceptor(logger);
    await interceptor.around(
      "pg_read_query",
      { sql: "SELECT 1" },
      "req-011",
      async () => ({ rows: [{ n: 1 }] }),
    );
    await logger.flush();

    const content = await readFile(join(dir, "audit-reads.jsonl"), "utf-8");
    const entry = JSON.parse(content.trim()) as AuditEntry;

    expect(entry.tool).toBe("pg_read_query");
    expect(entry.category).toBe("read");
    expect(entry.success).toBe(true);
    expect(typeof entry.tokenEstimate).toBe("number");
    expect(entry.tokenEstimate).toBeGreaterThan(0);
  });

  it("should use compact format for read entries (no args, user, scopes)", async () => {
    await logger.close();
    logger = new AuditLogger({
      enabled: true,
      logPath: join(dir, "audit-compact.jsonl"),
      redact: false,
      auditReads: true,
      maxSizeBytes: 0,
    });

    mockGetRequiredScope.mockReturnValue("read");
    mockGetAuthContext.mockReturnValue({
      authenticated: true,
      claims: {
        sub: "bob@team.com",
        scopes: ["read"],
        exp: Date.now() / 1000 + 3600,
        iat: Date.now() / 1000,
      },
      scopes: ["read"],
    });

    const interceptor = createAuditInterceptor(logger);
    await interceptor.around("pg_list_tables", {}, "req-012", async () => ({
      tables: ["users"],
    }));
    await logger.flush();

    const content = await readFile(join(dir, "audit-compact.jsonl"), "utf-8");
    const entry = JSON.parse(content.trim()) as AuditEntry;

    // Compact format omits args, user, scopes
    expect(entry.args).toBeUndefined();
    expect(entry.user).toBeUndefined();
    expect(entry.scopes).toBeUndefined();
    // But retains essential fields
    expect(entry.tool).toBe("pg_list_tables");
    expect(entry.category).toBe("read");
    expect(entry.success).toBe(true);
    expect(entry.tokenEstimate).toBeGreaterThan(0);
  });
});
