/**
 * E2E Tests: Help Resources
 *
 * Validates the postgres://help resource system that agents use
 * for on-demand tool reference documentation.
 *
 * Tests:
 * - postgres://help (root gotchas + code mode)
 * - postgres://help/{group} for all 22 tool groups
 * - Content structure and non-empty responses
 *
 * The test server runs with --tool-filter +all, so all 22 help
 * resources should be registered.
 *
 * Ported from db-mcp/tests/e2e/help-resources.spec.ts — adapted for postgres-mcp.
 */

import { test, expect } from "./fixtures.js";
import { createClient, getBaseURL } from "./helpers.js";

test.describe.configure({ mode: "serial" });

const HELP_GROUPS = [
  "admin",
  "backup",
  "citext",
  "cron",
  "introspection",
  "jsonb",
  "kcache",
  "ltree",
  "migration",
  "monitoring",
  "partitioning",
  "partman",
  "performance",
  "pgcrypto",
  "postgis",
  "schema",
  "stats",
  "text",
  "transactions",
  "vector",
];

test.describe("Help Resources", () => {
  test("postgres://help is listed in resources", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const list = await client.listResources();
      const uris = list.resources.map((r) => r.uri);
      expect(uris).toContain("postgres://help");
    } finally {
      await client.close();
    }
  });

  test("all 20 group help resources are listed", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const list = await client.listResources();
      const uris = list.resources.map((r) => r.uri);
      for (const group of HELP_GROUPS) {
        expect(uris, `Missing postgres://help/${group}`).toContain(
          `postgres://help/${group}`,
        );
      }
    } finally {
      await client.close();
    }
  });

  test("postgres://help returns non-empty markdown", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const response = await client.readResource({ uri: "postgres://help" });

      expect(response.contents).toBeDefined();
      expect(response.contents.length).toBe(1);
      expect(response.contents[0].uri).toBe("postgres://help");
      expect(response.contents[0].mimeType).toBe("text/markdown");

      const text = response.contents[0].text as string;
      expect(text.length).toBeGreaterThan(100);
    } finally {
      await client.close();
    }
  });

  test("postgres://help contains critical section keywords", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const response = await client.readResource({ uri: "postgres://help" });
      const text = (response.contents[0].text as string).toLowerCase();

      // Root help should mention key concepts
      expect(text).toContain("gotcha");
      expect(text).toContain("code mode");
    } finally {
      await client.close();
    }
  });

  for (const group of HELP_GROUPS) {
    test(`postgres://help/${group} returns non-empty markdown`, async ({}, testInfo) => {
      const client = await createClient(getBaseURL(testInfo));
      try {
        const response = await client.readResource({
          uri: `postgres://help/${group}`,
        });

        expect(response.contents).toBeDefined();
        expect(response.contents.length).toBe(1);
        expect(response.contents[0].uri).toBe(`postgres://help/${group}`);
        expect(response.contents[0].mimeType).toBe("text/markdown");

        const text = response.contents[0].text as string;
        expect(text.length, `${group} help content too short`).toBeGreaterThan(
          50,
        );
      } finally {
        await client.close();
      }
    });
  }
});
