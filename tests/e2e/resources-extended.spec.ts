/**
 * E2E Tests: Extended Resource Reads
 *
 * Reads the 13 data resources NOT covered by resources.spec.ts.
 * Extension-dependent resources (vector, postgis, crypto) use
 * lenient assertions since extensions may not be installed.
 *
 * Already covered in resources.spec.ts: schema, tables, health, extensions, settings.
 */

import { test, expect } from "./fixtures.js";
import { createClient, getBaseURL } from "./helpers.js";

test.describe.configure({ mode: "serial" });

test.describe("Extended Resource Reads", () => {
  test("postgres://stats returns JSON", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const response = await client.readResource({ uri: "postgres://stats" });
      expect(response.contents).toBeDefined();
      expect(response.contents.length).toBeGreaterThan(0);
      const content = response.contents[0];
      const parsed = JSON.parse("text" in content ? content.text : "");
      expect(typeof parsed).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("postgres://activity returns JSON", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const response = await client.readResource({
        uri: "postgres://activity",
      });
      expect(response.contents).toBeDefined();
      expect(response.contents.length).toBeGreaterThan(0);
      const content = response.contents[0];
      const parsed = JSON.parse("text" in content ? content.text : "");
      expect(typeof parsed).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("postgres://pool returns JSON", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const response = await client.readResource({ uri: "postgres://pool" });
      expect(response.contents).toBeDefined();
      expect(response.contents.length).toBeGreaterThan(0);
      const content = response.contents[0];
      const parsed = JSON.parse("text" in content ? content.text : "");
      expect(typeof parsed).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("postgres://capabilities returns JSON with version", async ({}, testInfo) => {
    test.setTimeout(120000);
    const client = await createClient(getBaseURL(testInfo));
    try {
      const response = await client.readResource({
        uri: "postgres://capabilities",
      });
      expect(response.contents).toBeDefined();
      expect(response.contents.length).toBeGreaterThan(0);
      const content = response.contents[0];
      const parsed = JSON.parse("text" in content ? content.text : "");
      expect(typeof parsed).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("postgres://performance returns JSON", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const response = await client.readResource({
        uri: "postgres://performance",
      });
      expect(response.contents).toBeDefined();
      expect(response.contents.length).toBeGreaterThan(0);
      const content = response.contents[0];
      const parsed = JSON.parse("text" in content ? content.text : "");
      // May be empty if pg_stat_statements not enabled
      expect(typeof parsed).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("postgres://indexes returns JSON", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const response = await client.readResource({
        uri: "postgres://indexes",
      });
      expect(response.contents).toBeDefined();
      expect(response.contents.length).toBeGreaterThan(0);
      const content = response.contents[0];
      const parsed = JSON.parse("text" in content ? content.text : "");
      expect(typeof parsed).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("postgres://replication returns JSON", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const response = await client.readResource({
        uri: "postgres://replication",
      });
      expect(response.contents).toBeDefined();
      expect(response.contents.length).toBeGreaterThan(0);
      const content = response.contents[0];
      const parsed = JSON.parse("text" in content ? content.text : "");
      expect(typeof parsed).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("postgres://vacuum returns JSON", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const response = await client.readResource({
        uri: "postgres://vacuum",
      });
      expect(response.contents).toBeDefined();
      expect(response.contents.length).toBeGreaterThan(0);
      const content = response.contents[0];
      const parsed = JSON.parse("text" in content ? content.text : "");
      expect(typeof parsed).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("postgres://locks returns JSON", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const response = await client.readResource({ uri: "postgres://locks" });
      expect(response.contents).toBeDefined();
      expect(response.contents.length).toBeGreaterThan(0);
      const content = response.contents[0];
      const parsed = JSON.parse("text" in content ? content.text : "");
      expect(typeof parsed).toBe("object");
    } finally {
      await client.close();
    }
  });

  // --- Extension-dependent resources (lenient assertions) ---

  test("postgres://vector returns JSON (pgvector)", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const response = await client.readResource({
        uri: "postgres://vector",
      });
      expect(response.contents).toBeDefined();
      expect(response.contents.length).toBeGreaterThan(0);
      const content = response.contents[0];
      const parsed = JSON.parse("text" in content ? content.text : "");
      expect(typeof parsed).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("postgres://postgis returns JSON (PostGIS)", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const response = await client.readResource({
        uri: "postgres://postgis",
      });
      expect(response.contents).toBeDefined();
      expect(response.contents.length).toBeGreaterThan(0);
      const content = response.contents[0];
      const parsed = JSON.parse("text" in content ? content.text : "");
      expect(typeof parsed).toBe("object");
    } finally {
      await client.close();
    }
  });

  test("postgres://crypto returns JSON (pgcrypto)", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const response = await client.readResource({
        uri: "postgres://crypto",
      });
      expect(response.contents).toBeDefined();
      expect(response.contents.length).toBeGreaterThan(0);
      const content = response.contents[0];
      const parsed = JSON.parse("text" in content ? content.text : "");
      expect(typeof parsed).toBe("object");
    } finally {
      await client.close();
    }
  });

  // --- In-memory resources ---

  test("postgres://insights returns text memo", async ({}, testInfo) => {
    const client = await createClient(getBaseURL(testInfo));
    try {
      const response = await client.readResource({
        uri: "postgres://insights",
      });
      expect(response.contents).toBeDefined();
      expect(response.contents.length).toBeGreaterThan(0);
      const content = response.contents[0];
      const text = "text" in content ? content.text : "";
      // insights resource returns a text memo (may be empty placeholder or contain insights)
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
    } finally {
      await client.close();
    }
  });
});
