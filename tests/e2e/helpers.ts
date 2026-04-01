/**
 * Shared E2E test helpers for payload contract tests.
 *
 * Provides utilities for creating MCP SDK clients via SSE transport,
 * parsing tool responses, asserting error shapes, and managing
 * dedicated server processes for isolated test scenarios.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";

function getDefaultPostgresUrl(): string {
  return process.env.MCP_TEST_DB || "postgres://postgres:postgres@127.0.0.1:5432/postgres";
}

// ─── Client creation ────────────────────────────────────────────────────────

/**
 * Resolve the baseURL from Playwright test info.
 * Falls back to DEFAULT_BASE_URL if not set.
 */
export function getBaseURL(testInfo: TestInfo): string {
  return (testInfo.project.use as { baseURL?: string }).baseURL ?? (process.env.MCP_TEST_URL || "http://127.0.0.1:3000");
}

/**
 * Create a connected MCP client via SSE transport.
 * Caller is responsible for calling `client.close()` in a finally block.
 *
 * @param baseURL - Server base URL. Defaults to `http://127.0.0.1:3000`.
 */
export async function createClient(
  baseURL?: string,
): Promise<Client> {
  const url = new URL(`${baseURL ?? process.env.MCP_TEST_URL ?? "http://127.0.0.1:3000"}/sse`);
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const transport = new SSEClientTransport(url);
      const client = new Client(
        { name: "payload-test-client", version: "1.0.0" },
        { capabilities: {} },
      );
      await client.connect(transport);
      return client;
    } catch {
      if (attempt === maxRetries - 1) throw new Error(`Failed to connect to ${url} after ${maxRetries} attempts`);
      await delay(500);
    }
  }

  throw new Error("Unreachable");
}

// ─── Tool call helpers ──────────────────────────────────────────────────────

/**
 * Call a tool and parse the JSON response payload.
 * Asserts that the response has text content and returns the parsed object.
 */
export async function callToolAndParse(
  client: Client,
  toolName: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await client.callTool({ name: toolName, arguments: args });

  expect(Array.isArray(response.content)).toBe(true);
  const content = response.content as Array<{ type: string; text?: string }>;
  expect(content.length).toBeGreaterThan(0);

  const first = content[0];
  expect(first.type).toBe("text");

  try {
    return JSON.parse(first.text!) as Record<string, unknown>;
  } catch (err: unknown) {
    throw new Error(`Failed to parse tool response as JSON. Response text was:\n${first.text}\n\nOriginal error: ${(err as Error).message}`);
  }
}

/**
 * Call a tool and return the raw MCP response (without parsing).
 * Useful for inspecting isError, checking raw text, or handling non-JSON.
 */
export async function callToolRaw(
  client: Client,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  const response = await client.callTool({ name: toolName, arguments: args });
  return response as {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
}

// ─── Assertion helpers ──────────────────────────────────────────────────────

/**
 * Assert that a payload does not contain an error.
 */
export function expectSuccess(payload: Record<string, unknown>): void {
  if (payload.success === false) {
    throw new Error(`Tool returned error: ${JSON.stringify(payload.error)}`);
  }
}

/**
 * Assert that a payload IS a structured handler error.
 * Checks for `{ success: false, error: "..." }` shape.
 */
export function expectHandlerError(
  payload: Record<string, unknown>,
  expectedMessage?: string | RegExp,
): void {
  expect(payload.success, `Expected handler error, got: ${JSON.stringify(payload)}`).toBe(false);
  expect(typeof payload.error, `Missing error string in: ${JSON.stringify(payload)}`).toBe("string");

  if (expectedMessage instanceof RegExp) {
    expect(payload.error as string).toMatch(expectedMessage);
  } else if (typeof expectedMessage === "string") {
    expect((payload.error as string).toLowerCase()).toContain(expectedMessage.toLowerCase());
  }
}

// ─── Server process management ──────────────────────────────────────────────

const serverProcesses = new Map<number, ChildProcess>();

/**
 * Start a postgres-mcp server on a custom port.
 *
 * Spawns `node dist/cli.js` with HTTP transport and waits
 * for the /health endpoint to respond.
 *
 * @param port - Port to run the server on.
 * @param extraArgs - Additional CLI arguments (e.g., `--oauth-enabled`).
 * @param label - Debug label for error messages.
 */
export async function startServer(
  port: number,
  extraArgs: string[] = [],
  label = "test",
): Promise<void> {
  const hasPostgres = extraArgs.includes("--postgres");
  const proc = spawn(
    "node",
    [
      "dist/cli.js",
      "--transport",
      "http",
      "--port",
      String(port),
      ...(!hasPostgres ? ["--postgres", getDefaultPostgresUrl()] : []),
      "--tool-filter",
      "+all",
      ...extraArgs,
    ],
    {
      cwd: process.cwd(),
      stdio: "pipe",
      env: {
        ...process.env,
        MCP_RATE_LIMIT_MAX: "10000",
      },
    },
  );

  proc.stderr?.on("data", (data) => {
    console.error(`[${label}:${port}] STDERR: ${String(data)}`);
  });
  proc.stdout?.on("data", (data) => {
    console.log(`[${label}:${port}] STDOUT: ${String(data)}`);
  });

  serverProcesses.set(port, proc);

  // Wait for server readiness
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {
      // Not ready yet
    }
    await delay(500);
  }

  throw new Error(`[${label}] Server on port ${port} did not start within ${maxAttempts * 500}ms`);
}

/**
 * Stop a server started by `startServer()`.
 */
export function stopServer(port: number): void {
  const proc = serverProcesses.get(port);
  if (proc) {
    proc.kill("SIGTERM");
    serverProcesses.delete(port);
  }
}
