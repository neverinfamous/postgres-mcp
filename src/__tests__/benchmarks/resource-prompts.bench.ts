/**
 * postgres-mcp - Resource & Prompt Generation Performance Benchmarks
 *
 * Measures resource URI matching, prompt generation, and the
 * overhead of compact tool index / discovery prompt assembly.
 *
 * Run: npm run bench
 */

import { describe, bench, vi } from "vitest";


// Suppress logger output
vi.mock("../../utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    notice: vi.fn(),
    critical: vi.fn(),
    alert: vi.fn(),
    emergency: vi.fn(),
    setLevel: vi.fn(),
    setMcpServer: vi.fn(),
  },
}));


// Resource URI templates (same pattern as postgres-mcp)
const resourceTemplates = [
  { uriTemplate: "postgres://schema", name: "Database Schema" },
  { uriTemplate: "postgres://tables", name: "Table List" },
  { uriTemplate: "postgres://pool", name: "Connection Pool" },
  { uriTemplate: "postgres://performance", name: "Performance Stats" },
  { uriTemplate: "postgres://health", name: "Health Check" },
  { uriTemplate: "postgres://extensions", name: "Extensions" },
  { uriTemplate: "postgres://stats", name: "Statistics" },
  { uriTemplate: "postgres://indexes", name: "Indexes" },
  { uriTemplate: "postgres://locks", name: "Active Locks" },
  { uriTemplate: "postgres://activity", name: "Activity Monitor" },
  { uriTemplate: "postgres://settings", name: "Settings" },
  { uriTemplate: "postgres://replication", name: "Replication" },
  { uriTemplate: "postgres://vacuum", name: "Vacuum Status" },
  { uriTemplate: "postgres://capabilities", name: "Capabilities" },
  { uriTemplate: "postgres://vector", name: "Vector Status" },
  { uriTemplate: "postgres://postgis", name: "PostGIS Status" },
  { uriTemplate: "postgres://kcache", name: "Kcache Status" },
  { uriTemplate: "postgres://cron", name: "Cron Jobs" },
  { uriTemplate: "postgres://partman", name: "Partman Status" },
  { uriTemplate: "postgres://crypto", name: "Crypto Status" },
];

// ---------------------------------------------------------------------------
// 1. Resource URI Matching
// ---------------------------------------------------------------------------
describe("Resource URI Matching", () => {
  const resourceMap = new Map<string, (typeof resourceTemplates)[0]>();
  for (const template of resourceTemplates) {
    resourceMap.set(template.uriTemplate, template);
  }

  bench(
    "Map.get() single URI match",
    () => {
      resourceMap.get("postgres://schema");
    },
    { iterations: 50000, warmupIterations: 500 },
  );

  bench(
    "Map.get() miss (unknown URI)",
    () => {
      resourceMap.get("postgres://nonexistent");
    },
    { iterations: 50000, warmupIterations: 500 },
  );

  bench(
    "scan all resource templates (Array.find())",
    () => {
      const targetUri = "postgres://postgis";
      resourceTemplates.find((t) => t.uriTemplate === targetUri);
    },
    { iterations: 30000, warmupIterations: 300 },
  );

  bench(
    "list all resources (Array.map → URIs)",
    () => {
      const uris = resourceTemplates.map((t) => t.uriTemplate);
      void uris.length;
    },
    { iterations: 10000, warmupIterations: 100 },
  );
});


// ---------------------------------------------------------------------------
// 3. Prompt Message Assembly
// ---------------------------------------------------------------------------
describe("Prompt Message Assembly", () => {
  bench(
    "build prompt messages array (3 messages)",
    () => {
      const messages = [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: "How do I set up vector search in PostgreSQL?",
          },
        },
        {
          role: "assistant" as const,
          content: {
            type: "text" as const,
            text: "To set up vector search, first install pgvector...",
          },
        },
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: "What about indexing?",
          },
        },
      ];
      void JSON.stringify(messages);
    },
    { iterations: 5000, warmupIterations: 50 },
  );

  bench(
    "prompt argument schema parse (simple)",
    () => {
      // Simulate what prompt handlers do: validate arguments
      const args: Record<string, string | undefined> = {
        topic: "vector search",
        extension: "pgvector",
      };
      const validated: Record<string, string> = {};
      for (const [key, value] of Object.entries(args)) {
        if (typeof value === "string" && value.length > 0) {
          validated[key] = value;
        }
      }
      void validated;
    },
    { iterations: 10000, warmupIterations: 100 },
  );
});
