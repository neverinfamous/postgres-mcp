import { test, expect } from "@playwright/test";
import { startServer, stopServer, createClient, callToolAndParse } from "./helpers.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

const WORKER_PORT = 3125;

test.describe.configure({ mode: "serial" });

test.describe("Code Mode Worker-Thread Execution", () => {
  let client: Client;

  test.beforeAll(async () => {
    process.env.CODEMODE_WORKER = "true";
    await startServer(WORKER_PORT, ["--tool-filter", "codemode,core"], "worker-mode");
    client = await createClient(`http://localhost:${WORKER_PORT}`);
  });

  test.afterAll(async () => {
    if (client) await client.close();
    stopServer(WORKER_PORT);
    delete process.env.CODEMODE_WORKER;
  });

  test("should successfully execute simple expressions in worker sandbox", async () => {
    const response = await callToolAndParse(client, "pg_execute_code", {
      code: "10 + 20",
    });

    expect(response.success).toBe(true);
    expect(response.result).toBe(30);
    expect(response.metrics).toBeDefined();
    // Verify it actually executed quickly
    expect((response.metrics as any).wallTimeMs).toBeGreaterThanOrEqual(0);
  });

  test("should execute pg.* API tools in worker sandbox", async () => {
    const code = `
      const p = await pg.core.readQuery({ sql: "SELECT 42 as num" });
      return p.rows[0].num;
    `;

    const response = await callToolAndParse(client, "pg_execute_code", {
      code,
    });

    expect(response.success).toBe(true);
    expect(response.result).toBe(42);
  });

  test("should enforce timeouts via ResourceLimits in worker sandbox", async () => {
    // A tight infinite loop that will trigger the hard timeout in worker_threads
    const code = `
      let x = 0;
      while (true) { x++; }
      return x;
    `;

    const response = await callToolAndParse(client, "pg_execute_code", {
      code,
      timeout: 500, // Small timeout to ensure it hits fast
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain("timed out");
  });
});
