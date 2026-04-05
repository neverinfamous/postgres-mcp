/**
 * E2E Tests: Rate Limiting
 *
 * Tests the built-in rate limiter by launching servers with very
 * low rate limits and verifying 429 behavior, Retry-After headers,
 * and health endpoint exemption.
 *
 * Each test spawns its own server process to control MCP_RATE_LIMIT_MAX.
 *
 * Ported from db-mcp/tests/e2e/rate-limiting.spec.ts — adapted for postgres-mcp.
 */

import { test, expect } from "./fixtures.js";

const RATE_PORT_1 = 4104;
const RATE_PORT_2 = 4105;
const RATE_PORT_3 = 4106;

test.describe.serial("Rate Limiting", () => {
  test("should return 429 after exceeding rate limit", async () => {
    const { spawn } = await import("node:child_process");
    const { setTimeout: delay } = await import("node:timers/promises");

    const serverProcess = spawn(
      "node",
      [
        "dist/cli.js",
        "--transport",
        "http",
        "--port",
        String(RATE_PORT_1),
        "--postgres",
        process.env.MCP_TEST_DB ||
          "postgres://postgres:postgres@localhost:5432/postgres",
        "--tool-filter",
        "starter",
      ],
      {
        cwd: process.cwd(),
        stdio: "pipe",
        env: {
          ...process.env,
          MCP_RATE_LIMIT_MAX: "5",
        },
      },
    );

    const RATE_BASE = `http://127.0.0.1:${RATE_PORT_1}`;

    // Wait for server to start
    let serverReady = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`${RATE_BASE}/health`);
        if (res.ok) {
          serverReady = true;
          break;
        }
      } catch {
        // Not ready
      }
      await delay(500);
    }
    if (!serverReady)
      throw new Error("Server failed to start on port " + RATE_PORT_1);

    try {
      // Send 5 requests (within limit)
      for (let i = 0; i < 5; i++) {
        const res = await fetch(`${RATE_BASE}/mcp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: i + 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-03-26",
              capabilities: {},
              clientInfo: { name: "rate-test", version: "1.0" },
            },
          }),
        });
        // These should succeed (200 or 400 for non-init, but not 429)
        expect(res.status).not.toBe(429);
      }

      // 6th request should be rate-limited
      const limitedResponse = await fetch(`${RATE_BASE}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 99,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "rate-test", version: "1.0" },
          },
        }),
      });

      expect(limitedResponse.status).toBe(429);
    } finally {
      serverProcess.kill("SIGTERM");
    }
  });

  test("should include Retry-After header on 429", async () => {
    const { spawn } = await import("node:child_process");
    const { setTimeout: delay } = await import("node:timers/promises");

    const serverProcess = spawn(
      "node",
      [
        "dist/cli.js",
        "--transport",
        "http",
        "--port",
        String(RATE_PORT_2),
        "--postgres",
        process.env.MCP_TEST_DB ||
          "postgres://postgres:postgres@localhost:5432/postgres",
        "--tool-filter",
        "starter",
      ],
      {
        cwd: process.cwd(),
        stdio: "pipe",
        env: {
          ...process.env,
          MCP_RATE_LIMIT_MAX: "3",
        },
      },
    );

    const RATE_BASE = `http://127.0.0.1:${RATE_PORT_2}`;
    let serverReady = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`${RATE_BASE}/health`);
        if (res.ok) {
          serverReady = true;
          break;
        }
      } catch {
        // Not ready
      }
      await delay(500);
    }
    if (!serverReady)
      throw new Error("Server failed to start on port " + RATE_PORT_2);

    try {
      // Exhaust the limit
      for (let i = 0; i < 3; i++) {
        await fetch(`${RATE_BASE}/mcp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: i + 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-03-26",
              capabilities: {},
              clientInfo: { name: "retry-test", version: "1.0" },
            },
          }),
        });
      }

      // Next request should be 429 with Retry-After
      const response = await fetch(`${RATE_BASE}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 99,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "retry-test", version: "1.0" },
          },
        }),
      });

      expect(response.status).toBe(429);
      const retryAfter = response.headers.get("retry-after");
      expect(retryAfter).toBeDefined();
      expect(Number(retryAfter)).toBeGreaterThan(0);
    } finally {
      serverProcess.kill("SIGTERM");
    }
  });

  test("should exempt /health from rate limiting", async () => {
    const { spawn } = await import("node:child_process");
    const { setTimeout: delay } = await import("node:timers/promises");

    const serverProcess = spawn(
      "node",
      [
        "dist/cli.js",
        "--transport",
        "http",
        "--port",
        String(RATE_PORT_3),
        "--postgres",
        process.env.MCP_TEST_DB ||
          "postgres://postgres:postgres@localhost:5432/postgres",
        "--tool-filter",
        "starter",
      ],
      {
        cwd: process.cwd(),
        stdio: "pipe",
        env: {
          ...process.env,
          MCP_RATE_LIMIT_MAX: "2",
        },
      },
    );

    const RATE_BASE = `http://127.0.0.1:${RATE_PORT_3}`;
    let serverReady = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`${RATE_BASE}/health`);
        if (res.ok) {
          serverReady = true;
          break;
        }
      } catch {
        // Not ready
      }
      await delay(500);
    }
    if (!serverReady)
      throw new Error("Server failed to start on port " + RATE_PORT_3);

    try {
      // Exhaust rate limit
      for (let i = 0; i < 2; i++) {
        await fetch(`${RATE_BASE}/mcp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: i + 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-03-26",
              capabilities: {},
              clientInfo: { name: "health-test", version: "1.0" },
            },
          }),
        });
      }

      // /health should still work
      const healthResponse = await fetch(`${RATE_BASE}/health`);
      expect(healthResponse.status).toBe(200);
      const body = (await healthResponse.json()) as { status: string };
      expect(body).toHaveProperty("status", "healthy");

      // But /mcp should be 429
      const mcpResponse = await fetch(`${RATE_BASE}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 99,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "health-test", version: "1.0" },
          },
        }),
      });
      expect(mcpResponse.status).toBe(429);
    } finally {
      serverProcess.kill("SIGTERM");
    }
  });
});
