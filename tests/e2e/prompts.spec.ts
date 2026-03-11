/**
 * E2E Tests: MCP Prompt Reads via SDK Client
 *
 * Verifies all 19 prompts are registered and return structured
 * content when invoked via the MCP SDK client.
 */

import { test, expect } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

test.describe.configure({ mode: "serial" });

test.describe("E2E Prompt Reads (via MCP SDK Client)", () => {
  let client: Client;

  test.beforeAll(async () => {
    const transport = new SSEClientTransport(
      new URL("http://localhost:3000/sse"),
    );
    client = new Client(
      { name: "playwright-prompt-test", version: "1.0.0" },
      { capabilities: {} },
    );
    await client.connect(transport);
  });

  test.afterAll(async () => {
    await client.close();
  });

  const EXPECTED_PROMPTS = [
    "pg_query_builder",
    "pg_schema_design",
    "pg_performance_analysis",
    "pg_migration",
    "pg_tool_index",
    "pg_quick_query",
    "pg_quick_schema",
    "pg_database_health_check",
    "pg_backup_strategy",
    "pg_index_tuning",
    "pg_extension_setup",
    "pg_setup_pgvector",
    "pg_setup_postgis",
    "pg_setup_pgcron",
    "pg_setup_partman",
    "pg_setup_kcache",
    "pg_setup_citext",
    "pg_setup_ltree",
    "pg_setup_pgcrypto",
  ];

  test("should list all 19 prompts", async () => {
    const listResponse = await client.listPrompts();

    expect(listResponse.prompts).toBeDefined();
    expect(listResponse.prompts.length).toBe(19);

    const names = listResponse.prompts.map((p) => p.name);
    for (const expected of EXPECTED_PROMPTS) {
      expect(names).toContain(expected);
    }
  });

  test("should get pg_query_builder prompt", async () => {
    const response = await client.getPrompt({
      name: "pg_query_builder",
      arguments: { tables: "users", operation: "SELECT" },
    });

    expect(response.messages).toBeDefined();
    expect(response.messages.length).toBeGreaterThan(0);
    const text = (response.messages[0].content as any).text as string;
    expect(text).toContain("PostgreSQL");
  });

  test("should get pg_schema_design prompt", async () => {
    const response = await client.getPrompt({
      name: "pg_schema_design",
      arguments: { useCase: "E-commerce platform" },
    });

    expect(response.messages).toBeDefined();
    const text = (response.messages[0].content as any).text as string;
    expect(text).toContain("schema");
  });

  test("should get pg_performance_analysis prompt", async () => {
    const response = await client.getPrompt({
      name: "pg_performance_analysis",
      arguments: { query: "SELECT * FROM slow_table" },
    });

    expect(response.messages).toBeDefined();
    const text = (response.messages[0].content as any).text as string;
    expect(text).toContain("pg_explain");
  });

  test("should get pg_migration prompt", async () => {
    const response = await client.getPrompt({
      name: "pg_migration",
      arguments: { change: "Add column", table: "users" },
    });

    expect(response.messages).toBeDefined();
    const text = (response.messages[0].content as any).text as string;
    expect(text).toContain("migration");
  });

  test("should get pg_tool_index prompt", async () => {
    const response = await client.getPrompt({
      name: "pg_tool_index",
      arguments: {},
    });

    expect(response.messages).toBeDefined();
    const text = (response.messages[0].content as any).text as string;
    expect(text).toContain("PostgreSQL MCP Tools");
  });

  test("should get pg_quick_query prompt", async () => {
    const response = await client.getPrompt({
      name: "pg_quick_query",
      arguments: { action: "find users by email" },
    });

    expect(response.messages).toBeDefined();
    const text = (response.messages[0].content as any).text as string;
    expect(text).toContain("pg_read_query");
  });

  test("should get pg_quick_schema prompt", async () => {
    const response = await client.getPrompt({
      name: "pg_quick_schema",
      arguments: {},
    });

    expect(response.messages).toBeDefined();
    const text = (response.messages[0].content as any).text as string;
    expect(text).toContain("pg_list_tables");
  });

  test("should get pg_database_health_check prompt", async () => {
    const response = await client.getPrompt({
      name: "pg_database_health_check",
      arguments: {},
    });

    expect(response.messages).toBeDefined();
    const text = (response.messages[0].content as any).text as string;
    expect(text.toLowerCase()).toContain("health");
  });

  test("should get pg_backup_strategy prompt", async () => {
    const response = await client.getPrompt({
      name: "pg_backup_strategy",
      arguments: {},
    });

    expect(response.messages).toBeDefined();
    const text = (response.messages[0].content as any).text as string;
    expect(text.toLowerCase()).toContain("backup");
  });

  test("should get pg_index_tuning prompt", async () => {
    const response = await client.getPrompt({
      name: "pg_index_tuning",
      arguments: {},
    });

    expect(response.messages).toBeDefined();
    const text = (response.messages[0].content as any).text as string;
    expect(text.toLowerCase()).toContain("index");
  });

  test("should get pg_extension_setup prompt", async () => {
    const response = await client.getPrompt({
      name: "pg_extension_setup",
      arguments: {},
    });

    expect(response.messages).toBeDefined();
    const text = (response.messages[0].content as any).text as string;
    expect(text.toLowerCase()).toContain("extension");
  });

  test("should get pg_setup_pgvector prompt", async () => {
    const response = await client.getPrompt({
      name: "pg_setup_pgvector",
      arguments: {},
    });

    expect(response.messages).toBeDefined();
    const text = (response.messages[0].content as any).text as string;
    expect(text.toLowerCase()).toContain("pgvector");
  });

  test("should get pg_setup_postgis prompt", async () => {
    const response = await client.getPrompt({
      name: "pg_setup_postgis",
      arguments: {},
    });

    expect(response.messages).toBeDefined();
    const text = (response.messages[0].content as any).text as string;
    expect(text.toLowerCase()).toContain("postgis");
  });

  test("should get pg_setup_pgcron prompt", async () => {
    const response = await client.getPrompt({
      name: "pg_setup_pgcron",
      arguments: {},
    });

    expect(response.messages).toBeDefined();
    const text = (response.messages[0].content as any).text as string;
    expect(text.toLowerCase()).toContain("pg_cron");
  });

  test("should get pg_setup_partman prompt", async () => {
    const response = await client.getPrompt({
      name: "pg_setup_partman",
      arguments: {},
    });

    expect(response.messages).toBeDefined();
    const text = (response.messages[0].content as any).text as string;
    expect(text.toLowerCase()).toContain("partman");
  });

  test("should get pg_setup_kcache prompt", async () => {
    const response = await client.getPrompt({
      name: "pg_setup_kcache",
      arguments: {},
    });

    expect(response.messages).toBeDefined();
    const text = (response.messages[0].content as any).text as string;
    expect(text.toLowerCase()).toContain("pg_stat_kcache");
  });

  test("should get pg_setup_citext prompt", async () => {
    const response = await client.getPrompt({
      name: "pg_setup_citext",
      arguments: {},
    });

    expect(response.messages).toBeDefined();
    const text = (response.messages[0].content as any).text as string;
    expect(text.toLowerCase()).toContain("citext");
  });

  test("should get pg_setup_ltree prompt", async () => {
    const response = await client.getPrompt({
      name: "pg_setup_ltree",
      arguments: {},
    });

    expect(response.messages).toBeDefined();
    const text = (response.messages[0].content as any).text as string;
    expect(text.toLowerCase()).toContain("ltree");
  });

  test("should get pg_setup_pgcrypto prompt", async () => {
    const response = await client.getPrompt({
      name: "pg_setup_pgcrypto",
      arguments: {},
    });

    expect(response.messages).toBeDefined();
    const text = (response.messages[0].content as any).text as string;
    expect(text.toLowerCase()).toContain("pgcrypto");
  });
});
