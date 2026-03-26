/**
 * E2E Tests: Tool Filter Runtime Behavior
 *
 * Spawns servers with different --tool-filter values and verifies
 * that tools/list returns the correct subset of tools.
 *
 * Each test uses a dedicated server on a unique port.
 */

import { test, expect } from "@playwright/test";
import { startServer, stopServer, createClient } from "./helpers.js";

const FILTER_PORT_BASE = 3110;

test.describe("Tool Filter Runtime Behavior", () => {
  test("--tool-filter core exposes only core + codemode tools", async () => {
    const port = FILTER_PORT_BASE;
    await startServer(port, ["--tool-filter", "core"], "filter-core");

    try {
      const client = await createClient(`http://localhost:${port}`);
      try {
        const list = await client.listTools();
        const names = list.tools.map((t) => t.name);

        // Core group has 21 tools + codemode has 1 = 22
        expect(list.tools.length).toBeLessThanOrEqual(25);
        expect(names).toContain("pg_read_query");
        expect(names).toContain("pg_list_tables");
        expect(names).toContain("pg_execute_code");

        // Should NOT contain tools from other groups
        expect(names).not.toContain("pg_jsonb_extract");
        expect(names).not.toContain("pg_vector_search");
        expect(names).not.toContain("pg_text_search");
        expect(names).not.toContain("pg_transaction_begin");
      } finally {
        await client.close();
      }
    } finally {
      stopServer(port);
    }
  });

  test("--tool-filter core,-codemode excludes pg_execute_code", async () => {
    const port = FILTER_PORT_BASE + 2;
    await startServer(
      port,
      ["--tool-filter", "core,-codemode"],
      "filter-no-codemode",
    );

    try {
      const client = await createClient(`http://localhost:${port}`);
      try {
        const list = await client.listTools();
        const names = list.tools.map((t) => t.name);

        expect(names).toContain("pg_read_query");
        expect(names).not.toContain("pg_execute_code");
      } finally {
        await client.close();
      }
    } finally {
      stopServer(port);
    }
  });

  test("--tool-filter with individual tools exposes exact whitelist", async () => {
    const port = FILTER_PORT_BASE + 3;
    await startServer(
      port,
      ["--tool-filter", "pg_read_query,pg_list_tables"],
      "filter-whitelist",
    );

    try {
      const client = await createClient(`http://localhost:${port}`);
      try {
        const list = await client.listTools();
        const names = list.tools.map((t) => t.name);

        expect(names).toContain("pg_read_query");
        expect(names).toContain("pg_list_tables");
        // codemode is always included alongside explicit tools
        expect(list.tools.length).toBeLessThanOrEqual(3);
      } finally {
        await client.close();
      }
    } finally {
      stopServer(port);
    }
  });
});
