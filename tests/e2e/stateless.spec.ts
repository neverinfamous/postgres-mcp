/**
 * E2E Tests: Stateless HTTP Mode
 *
 * Tests the --stateless mode behavior. Uses a test-local server
 * on port 3102 to avoid conflicting with the main webServer.
 */

import { test, expect } from "./fixtures.js";
import { type ChildProcess, spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const STATELESS_PORT = 3102;
const STATELESS_BASE = `http://127.0.0.1:${STATELESS_PORT}`;

let serverProcess: ChildProcess | null = null;

async function startStatelessServer(): Promise<void> {
  serverProcess = spawn(
    "node",
    [
      "dist/cli.js",
      "--transport",
      "http",
      "--port",
      String(STATELESS_PORT),
      "--postgres",
      process.env.MCP_TEST_DB ||
        "postgres://postgres:postgres@localhost:5432/postgres",
      "--stateless",
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
      const res = await fetch(`${STATELESS_BASE}/health`);
      if (res.ok) return;
    } catch {
      // Server not ready yet
    }
    await delay(500);
  }
  throw new Error("Stateless server did not start within timeout");
}

function stopStatelessServer(): void {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
}

test.describe.serial("Stateless HTTP Mode", () => {
  test.beforeAll(async () => {
    await startStatelessServer();
  });

  test.afterAll(() => {
    stopStatelessServer();
  });

  test("POST /mcp should accept requests without session ID (stateless)", async () => {
    const response = await fetch(`${STATELESS_BASE}/mcp`, {
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

    expect(response.status).toBe(200);
  });

  test("GET /mcp should return 405 (SSE not available in stateless)", async () => {
    const response = await fetch(`${STATELESS_BASE}/mcp`);

    expect(response.status).toBe(405);
    const body = (await response.json()) as {
      error: { message: string };
    };
    expect(body.error.message).toContain("stateless");
  });

  test("DELETE /mcp should return 204 (no-op in stateless)", async () => {
    const response = await fetch(`${STATELESS_BASE}/mcp`, {
      method: "DELETE",
      headers: {
        "mcp-session-id": "fake-session-id",
      },
    });

    expect(response.status).toBe(204);
  });

  test("GET /sse should return 404 (legacy SSE not available in stateless)", async () => {
    const response = await fetch(`${STATELESS_BASE}/sse`);

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body).toHaveProperty("error", "Not found");
  });
});
