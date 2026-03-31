/**
 * E2E Tests: OAuth 2.1 Scope Enforcement
 *
 * Verifies that the adapter-level scope enforcement (database-adapter.ts)
 * correctly blocks tool calls when the JWT lacks the required scope.
 *
 * Architecture note: postgres-mcp enforces scope inside the registerTool()
 * callback via getAuthContext() → getRequiredScope() → requireScope().
 * This means denied calls return MCP-level isError responses (HTTP 200),
 * not HTTP 403. All test cases require a full session handshake.
 *
 * Representative tools per scope level:
 *   read:  pg_list_tables      (core group → read scope)
 *   write: pg_transaction_status (transactions group → write scope)
 *   admin: pg_vacuum            (admin group → admin scope)
 *
 * Ports: 3107 (MCP server), 3108 (mock JWKS)
 */

import { test, expect } from "./fixtures.js";
import { type ChildProcess, spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import * as jose from "jose";

const MCP_PORT = 3107;
const JWKS_PORT = 3108;
const ISSUER = "https://auth.example.com/postgres-scope-test";
const AUDIENCE = "postgres-mcp-server";

test.describe.configure({ mode: "serial" });

test.describe.serial("OAuth 2.1 Scope Enforcement E2E", () => {
  let serverProcess: ChildProcess;
  let jwksServer: Server;

  // JWTs
  let readToken: string;
  let writeToken: string;
  let adminToken: string;
  let expiredToken: string;
  let invalidSignatureToken: string;

  test.beforeAll(async () => {
    // 1. Generate RS256 keypair
    const keypair = await jose.generateKeyPair("RS256");
    const publicJwk = await jose.exportJWK(keypair.publicKey);
    publicJwk.kid = "scope-test-kid-1";
    publicJwk.use = "sig";
    publicJwk.alg = "RS256";

    // 2. Start mock JWKS HTTP server (raw node:http)
    await new Promise<void>((resolve) => {
      jwksServer = createServer((req, res) => {
        if (req.url === "/jwks") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ keys: [publicJwk] }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      jwksServer.listen(JWKS_PORT, () => resolve());
    });

    // 3. Generate tokens with varying scopes
    const makeToken = async (scope: string): Promise<string> =>
      await new jose.SignJWT({ scope })
        .setProtectedHeader({ alg: "RS256", kid: "scope-test-kid-1" })
        .setIssuedAt()
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setExpirationTime("1h")
        .sign(keypair.privateKey);

    readToken = await makeToken("read");
    writeToken = await makeToken("read write");
    adminToken = await makeToken("admin read write");

    // Token that expired 1 hour ago
    expiredToken = await new jose.SignJWT({ scope: "read" })
      .setProtectedHeader({ alg: "RS256", kid: "scope-test-kid-1" })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(keypair.privateKey);

    // Token with invalid signature
    const badKeypair = await jose.generateKeyPair("RS256");
    invalidSignatureToken = await new jose.SignJWT({ scope: "read" })
      .setProtectedHeader({ alg: "RS256", kid: "scope-test-kid-1" })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime("1h")
      .sign(badKeypair.privateKey);

    // 4. Start postgres-mcp with OAuth enabled
    serverProcess = spawn(
      "node",
      [
        "dist/cli.js",
        "--transport",
        "http",
        "--port",
        String(MCP_PORT),
        "--postgres",
        process.env.MCP_TEST_DB || "postgres://postgres:postgres@localhost:5432/postgres",
        "--tool-filter",
        "+all",
        "--oauth-enabled",
        "--oauth-issuer",
        ISSUER,
        "--oauth-audience",
        AUDIENCE,
        "--oauth-jwks-uri",
        `http://127.0.0.1:${JWKS_PORT}/jwks`,
      ],
      {
        cwd: process.cwd(),
        stdio: "pipe",
        env: { ...process.env, MCP_RATE_LIMIT_MAX: "10000" },
      },
    );

    // Wait for server readiness
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${MCP_PORT}/health`);
        if (res.ok) break;
      } catch {
        // Not ready yet
      }
      await delay(500);
    }
  });

  test.afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
    }
    if (jwksServer) {
      await new Promise<void>((resolve) =>
        jwksServer.close(() => resolve()),
      );
    }
  });

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Establish a session with the given token.
   * Returns the mcp-session-id header for subsequent calls.
   */
  async function initializeSession(token: string): Promise<string> {
    const base = `http://127.0.0.1:${MCP_PORT}/mcp`;
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
    };

    const initRes = await fetch(base, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "scope-test-client", version: "1.0" },
        },
      }),
    });
    expect(initRes.status).toBe(200);
    const sessionId = initRes.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();

    // Send initialized notification
    await fetch(base, {
      method: "POST",
      headers: { ...headers, "mcp-session-id": sessionId! },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    });

    return sessionId!;
  }

  /**
   * Call a tool on an established session.
   * Returns the parsed JSON-RPC response body.
   */
  async function callTool(
    token: string,
    sessionId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`http://127.0.0.1:${MCP_PORT}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
        "mcp-session-id": sessionId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Math.floor(Math.random() * 10000),
        method: "tools/call",
        params: { name: toolName, arguments: args },
      }),
    });

    expect(res.status).toBe(200);

    // Response may be SSE or JSON depending on transport mode
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) {
      const text = await res.text();
      // Parse the last SSE data event
      const lines = text.split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (line?.startsWith("data: ")) {
          return JSON.parse(line.slice(6)) as Record<string, unknown>;
        }
      }
      throw new Error("No data event found in SSE response");
    }

    return (await res.json()) as Record<string, unknown>;
  }

  /**
   * Extract the MCP result from a JSON-RPC response.
   * Handles both direct result and nested result.content patterns.
   */
  function extractResult(rpcResponse: Record<string, unknown>): {
    isError: boolean;
    text: string;
  } {
    const result = rpcResponse.result as
      | {
          content?: Array<{ type: string; text: string }>;
          isError?: boolean;
        }
      | undefined;

    if (!result?.content?.[0]) {
      return { isError: true, text: "No content in response" };
    }

    return {
      isError: result.isError === true,
      text: result.content[0].text,
    };
  }

  // ─── Tests ──────────────────────────────────────────────────────────────────

  test("read token can call read-scoped tools but is blocked from write and admin tools", async () => {
    const session = await initializeSession(readToken);

    // ✅ ALLOWED: pg_list_tables (core group → read scope)
    const listResult = await callTool(readToken, session, "pg_list_tables", {});
    const listExtracted = extractResult(listResult);
    expect(listExtracted.isError).toBe(false);

    // ❌ DENIED: pg_transaction_status (transactions group → write scope)
    const txResult = await callTool(
      readToken,
      session,
      "pg_transaction_status",
      {},
    );
    const txExtracted = extractResult(txResult);
    expect(txExtracted.isError).toBe(true);
    expect(txExtracted.text.toLowerCase()).toContain("insufficient scope");

    // ❌ DENIED: pg_vacuum (admin group → admin scope)
    const vacuumResult = await callTool(readToken, session, "pg_vacuum", {
      table: "information_schema.tables",
    });
    const vacuumExtracted = extractResult(vacuumResult);
    expect(vacuumExtracted.isError).toBe(true);
    expect(vacuumExtracted.text.toLowerCase()).toContain("insufficient scope");
  });

  test("write token can call read and write tools but is blocked from admin tools", async () => {
    const session = await initializeSession(writeToken);

    // ✅ ALLOWED: pg_list_tables (core → read, write scope includes read)
    const listResult = await callTool(
      writeToken,
      session,
      "pg_list_tables",
      {},
    );
    const listExtracted = extractResult(listResult);
    expect(listExtracted.isError).toBe(false);

    // ✅ ALLOWED: pg_transaction_status (transactions → write scope)
    const txResult = await callTool(
      writeToken,
      session,
      "pg_transaction_status",
      {},
    );
    const txExtracted = extractResult(txResult);
    expect(txExtracted.isError).toBe(false);

    // ❌ DENIED: pg_vacuum (admin group → admin scope)
    const vacuumResult = await callTool(writeToken, session, "pg_vacuum", {
      table: "information_schema.tables",
    });
    const vacuumExtracted = extractResult(vacuumResult);
    expect(vacuumExtracted.isError).toBe(true);
    expect(vacuumExtracted.text.toLowerCase()).toContain("insufficient scope");
  });

  test("admin token can call admin-scoped tools", async () => {
    const session = await initializeSession(adminToken);

    // ✅ ALLOWED: pg_vacuum (admin group → admin scope)
    // Scope check passes; underlying DB operation may succeed or fail,
    // but the error will NOT be "insufficient scope"
    const vacuumResult = await callTool(adminToken, session, "pg_vacuum", {
      table: "information_schema.tables",
    });
    const vacuumExtracted = extractResult(vacuumResult);

    // If it errors, it should be a DB-level error, not a scope error
    if (vacuumExtracted.isError) {
      expect(vacuumExtracted.text.toLowerCase()).not.toContain(
        "insufficient scope",
      );
    }
  });

  test("read token is blocked from core write tools", async () => {
    const session = await initializeSession(readToken);

    // ❌ DENIED: pg_write_query (core group → write scope override)
    const writeResult = await callTool(readToken, session, "pg_write_query", {
      sql: "INSERT INTO information_schema.tables (table_name) VALUES ('test')",
    });
    const writeExtracted = extractResult(writeResult);
    expect(writeExtracted.isError).toBe(true);
    expect(writeExtracted.text.toLowerCase()).toContain("insufficient scope");

    // ❌ DENIED: pg_create_table (core group → write scope override)
    const createResult = await callTool(readToken, session, "pg_create_table", {
      table: "test_table",
      columns: [{ name: "id", type: "integer" }],
    });
    const createExtracted = extractResult(createResult);
    expect(createExtracted.isError).toBe(true);
    expect(createExtracted.text.toLowerCase()).toContain("insufficient scope");
  });

  test("write token is blocked from core destructive tools but allowed core write tools", async () => {
    const session = await initializeSession(writeToken);

    // ✅ ALLOWED: pg_write_query (core group → write scope override)
    const writeResult = await callTool(writeToken, session, "pg_write_query", {
      sql: "INSERT INTO information_schema.tables (table_name) VALUES ('test')",
    });
    const writeExtracted = extractResult(writeResult);
    // Should pass scope check, fail DB check
    if (writeExtracted.isError) {
      expect(writeExtracted.text.toLowerCase()).not.toContain("insufficient scope");
    }

    // ❌ DENIED: pg_drop_table (core group → admin scope override)
    const dropResult = await callTool(writeToken, session, "pg_drop_table", {
      table: "test_table",
    });
    const dropExtracted = extractResult(dropResult);
    expect(dropExtracted.isError).toBe(true);
    expect(dropExtracted.text.toLowerCase()).toContain("insufficient scope");
  });

  test("read token is allowed backup audit read tools despite backup group admin default", async () => {
    const session = await initializeSession(readToken);

    // ✅ ALLOWED: pg_audit_list_backups (backup group → read scope override)
    const listResult = await callTool(readToken, session, "pg_audit_list_backups", {});
    const listExtracted = extractResult(listResult);
    // Should pass scope check, might return success
    if (listExtracted.isError) {
      expect(listExtracted.text.toLowerCase()).not.toContain("insufficient scope");
    }

    // ❌ DENIED: pg_audit_restore_backup (backup group → admin scope default)
    const restoreResult = await callTool(readToken, session, "pg_audit_restore_backup", {
      backupFile: "test.snapshot.json",
      confirm: true,
    });
    const restoreExtracted = extractResult(restoreResult);
    expect(restoreExtracted.isError).toBe(true);
    expect(restoreExtracted.text.toLowerCase()).toContain("insufficient scope");
  });

  test("expired or invalid tokens are rejected at connection time", async () => {
    const base = `http://127.0.0.1:${MCP_PORT}/mcp`;

    const getInitRes = async (token: string) => fetch(base, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "scope-test-client", version: "1.0" },
        },
      }),
    });

    const resExpired = await getInitRes(expiredToken);
    expect(resExpired.status).toBe(401);

    const resInvalid = await getInitRes(invalidSignatureToken);
    expect(resInvalid.status).toBe(401);
  });
});
