/**
 * Unit tests for Extension Setup Prompt
 *
 * Tests the prompt handler returns correct content for each extension.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createExtensionSetupPrompt } from "../extension-setup.js";
import type {
  PromptDefinition,
  RequestContext,
} from "../../../../types/index.js";

describe("Extension Setup Prompt", () => {
  let prompt: PromptDefinition;
  let mockContext: RequestContext;

  beforeEach(() => {
    prompt = createExtensionSetupPrompt();
    mockContext = {
      timestamp: new Date(),
      requestId: "test-request-123",
    };
  });

  describe("prompt definition", () => {
    it("should have correct name", () => {
      expect(prompt.name).toBe("pg_extension_setup");
    });

    it("should have description", () => {
      expect(prompt.description).toBeDefined();
      expect(prompt.description.length).toBeGreaterThan(0);
    });

    it("should have extensionName argument", () => {
      expect(prompt.arguments).toBeDefined();
      expect(
        prompt.arguments?.some((arg) => arg.name === "extensionName"),
      ).toBe(true);
    });

    it("should have extensionName as required", () => {
      const extensionArg = prompt.arguments?.find(
        (arg) => arg.name === "extensionName",
      );
      expect(extensionArg?.required).toBe(true);
    });
  });

  describe("pg_stat_statements extension", () => {
    it("should return setup content", async () => {
      const content = await prompt.handler(
        { extensionName: "pg_stat_statements" },
        mockContext,
      );
      expect(content).toContain("pg_stat_statements");
    });

    it("should include shared_preload_libraries config", async () => {
      const content = await prompt.handler(
        { extensionName: "pg_stat_statements" },
        mockContext,
      );
      expect(content).toContain("shared_preload_libraries");
    });

    it("should mention restart requirement", async () => {
      const content = await prompt.handler(
        { extensionName: "pg_stat_statements" },
        mockContext,
      );
      expect(content).toContain("Restart");
    });
  });

  describe("hypopg extension", () => {
    it("should return setup content", async () => {
      const content = await prompt.handler(
        { extensionName: "hypopg" },
        mockContext,
      );
      expect(content).toContain("hypopg");
    });

    it("should include hypopg_create_index example", async () => {
      const content = await prompt.handler(
        { extensionName: "hypopg" },
        mockContext,
      );
      expect(content).toContain("hypopg_create_index");
    });

    it("should mention no configuration needed", async () => {
      const content = await prompt.handler(
        { extensionName: "hypopg" },
        mockContext,
      );
      expect(content).toContain("No configuration needed");
    });
  });

  describe("pgvector extension", () => {
    it("should return setup content", async () => {
      const content = await prompt.handler(
        { extensionName: "pgvector" },
        mockContext,
      );
      expect(content).toContain("pgvector");
    });

    it("should include vector column example", async () => {
      const content = await prompt.handler(
        { extensionName: "pgvector" },
        mockContext,
      );
      expect(content).toContain("vector");
    });

    it("should mention HNSW index", async () => {
      const content = await prompt.handler(
        { extensionName: "pgvector" },
        mockContext,
      );
      expect(content).toContain("hnsw");
    });

    it("should reference pg_setup_pgvector prompt", async () => {
      const content = await prompt.handler(
        { extensionName: "pgvector" },
        mockContext,
      );
      expect(content).toContain("pg_setup_pgvector");
    });
  });

  describe("postgis extension", () => {
    it("should return setup content", async () => {
      const content = await prompt.handler(
        { extensionName: "postgis" },
        mockContext,
      );
      expect(content).toContain("postgis");
    });

    it("should include PostGIS_Full_Version check", async () => {
      const content = await prompt.handler(
        { extensionName: "postgis" },
        mockContext,
      );
      expect(content).toContain("PostGIS_Full_Version");
    });

    it("should include GEOGRAPHY type example", async () => {
      const content = await prompt.handler(
        { extensionName: "postgis" },
        mockContext,
      );
      expect(content).toContain("GEOGRAPHY");
    });

    it("should mention GIST index", async () => {
      const content = await prompt.handler(
        { extensionName: "postgis" },
        mockContext,
      );
      expect(content).toContain("GIST");
    });
  });

  describe("pg_cron extension", () => {
    it("should return setup content", async () => {
      const content = await prompt.handler(
        { extensionName: "pg_cron" },
        mockContext,
      );
      expect(content).toContain("pg_cron");
    });

    it("should include cron.schedule example", async () => {
      const content = await prompt.handler(
        { extensionName: "pg_cron" },
        mockContext,
      );
      expect(content).toContain("cron.schedule");
    });

    it("should include cron.database_name config", async () => {
      const content = await prompt.handler(
        { extensionName: "pg_cron" },
        mockContext,
      );
      expect(content).toContain("cron.database_name");
    });
  });

  describe("pg_partman extension", () => {
    it("should return setup content", async () => {
      const content = await prompt.handler(
        { extensionName: "pg_partman" },
        mockContext,
      );
      expect(content).toContain("pg_partman");
    });

    it("should include partman.create_parent example", async () => {
      const content = await prompt.handler(
        { extensionName: "pg_partman" },
        mockContext,
      );
      expect(content).toContain("partman.create_parent");
    });
  });

  describe("pg_stat_kcache extension", () => {
    it("should return setup content", async () => {
      const content = await prompt.handler(
        { extensionName: "pg_stat_kcache" },
        mockContext,
      );
      expect(content).toContain("pg_stat_kcache");
    });

    it("should include shared_preload_libraries config", async () => {
      const content = await prompt.handler(
        { extensionName: "pg_stat_kcache" },
        mockContext,
      );
      expect(content).toContain("shared_preload_libraries");
    });
  });

  describe("citext extension", () => {
    it("should return setup content", async () => {
      const content = await prompt.handler(
        { extensionName: "citext" },
        mockContext,
      );
      expect(content).toContain("citext");
    });

    it("should include CITEXT type example", async () => {
      const content = await prompt.handler(
        { extensionName: "citext" },
        mockContext,
      );
      expect(content).toContain("CITEXT");
    });
  });

  describe("ltree extension", () => {
    it("should return setup content", async () => {
      const content = await prompt.handler(
        { extensionName: "ltree" },
        mockContext,
      );
      expect(content).toContain("ltree");
    });

    it("should include LTREE type example", async () => {
      const content = await prompt.handler(
        { extensionName: "ltree" },
        mockContext,
      );
      expect(content).toContain("LTREE");
    });

    it("should mention GIST index", async () => {
      const content = await prompt.handler(
        { extensionName: "ltree" },
        mockContext,
      );
      expect(content).toContain("GIST");
    });
  });

  describe("pgcrypto extension", () => {
    it("should return setup content", async () => {
      const content = await prompt.handler(
        { extensionName: "pgcrypto" },
        mockContext,
      );
      expect(content).toContain("pgcrypto");
    });

    it("should include crypt function example", async () => {
      const content = await prompt.handler(
        { extensionName: "pgcrypto" },
        mockContext,
      );
      expect(content).toContain("crypt");
    });

    it("should include gen_salt example", async () => {
      const content = await prompt.handler(
        { extensionName: "pgcrypto" },
        mockContext,
      );
      expect(content).toContain("gen_salt");
    });
  });

  describe("unknown extension", () => {
    it("should return generic content for unknown extension", async () => {
      const content = await prompt.handler(
        { extensionName: "unknown_extension" },
        mockContext,
      );
      expect(content).toContain("unknown_extension");
    });

    it("should include generic configuration message", async () => {
      const content = await prompt.handler(
        { extensionName: "some_other_ext" },
        mockContext,
      );
      expect(content).toContain("Extension-specific configuration may vary");
    });
  });

  describe("default extension", () => {
    it("should use pg_stat_statements when no extension specified", async () => {
      const content = await prompt.handler({}, mockContext);
      expect(content).toContain("pg_stat_statements");
    });
  });

  describe("common content", () => {
    it("should include best practices section", async () => {
      const content = await prompt.handler(
        { extensionName: "pgvector" },
        mockContext,
      );
      expect(content).toContain("Best Practices");
    });

    it("should include troubleshooting section", async () => {
      const content = await prompt.handler(
        { extensionName: "postgis" },
        mockContext,
      );
      expect(content).toContain("Troubleshooting");
    });

    it("should include CREATE EXTENSION command", async () => {
      const content = await prompt.handler(
        { extensionName: "citext" },
        mockContext,
      );
      expect(content).toContain("CREATE EXTENSION");
    });

    it("should include pg_available_extensions check", async () => {
      const content = await prompt.handler(
        { extensionName: "ltree" },
        mockContext,
      );
      expect(content).toContain("pg_available_extensions");
    });
  });
});
