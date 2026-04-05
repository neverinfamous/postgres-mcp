/**
 * E2E Tests: Bearer Token Authentication
 *
 * Tests the --auth-token middleware. Uses a test-local server
 * on port 3101 to avoid conflicting with the main webServer.
 */

import { test, expect } from "./fixtures.js";
import { type ChildProcess, spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const AUTH_TOKEN = "test-secret-token-e2e";
const AUTH_PORT = 3101;
const AUTH_BASE = `http://127.0.0.1:${AUTH_PORT}`;

let serverProcess: ChildProcess | null = null;

async function startAuthServer(): Promise<void> {
  serverProcess = spawn(
    "node",
    [
      "dist/cli.js",
      "--transport",
      "http",
      "--port",
      String(AUTH_PORT),
      "--postgres",
      process.env.MCP_TEST_DB ||
        "postgres://postgres:postgres@localhost:5432/postgres",
      "--auth-token",
      AUTH_TOKEN,
      "--tool-filter",
      "starter",
    ],
    {
      cwd: process.cwd(),
      stdio: "pipe",
      env: { ...process.env, MCP_RATE_LIMIT_MAX: "10000" },
    },
  );

  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${AUTH_BASE}/health`);
      if (res.ok) return;
    } catch {
      // Server not ready yet
    }
    await delay(500);
  }
  throw new Error("Auth server did not start within timeout");
}

function stopAuthServer(): void {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
}

test.describe.serial("Bearer Token Authentication", () => {
  test.beforeAll(async () => {
    await startAuthServer();
  });

  test.afterAll(() => {
    stopAuthServer();
  });

  test("/health should be accessible without token (exempt)", async () => {
    const response = await fetch(`${AUTH_BASE}/health`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("status");
  });

  test("POST /mcp should return 401 without Authorization header", async () => {
    const response = await fetch(`${AUTH_BASE}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
      }),
    });

    expect(response.status).toBe(401);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("error", "unauthorized");

    // Must include WWW-Authenticate header per RFC 6750
    const wwwAuth = response.headers.get("www-authenticate");
    expect(wwwAuth).toBeTruthy();
    expect(wwwAuth).toContain("Bearer");
  });

  test("POST /mcp should return 401 with wrong token", async () => {
    const response = await fetch(`${AUTH_BASE}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer wrong-token",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
      }),
    });

    expect(response.status).toBe(401);

    // Must include invalid_token error in WWW-Authenticate
    const wwwAuth = response.headers.get("www-authenticate");
    expect(wwwAuth).toContain("invalid_token");
  });

  test("POST /mcp should succeed with correct Bearer token", async () => {
    const response = await fetch(`${AUTH_BASE}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
      }),
    });

    expect(response.status).toBe(200);
  });

  test("GET /sse should return 401 without token", async () => {
    const response = await fetch(`${AUTH_BASE}/sse`);
    expect(response.status).toBe(401);
  });
});
