/**
 * E2E Tests: Audit Token Summary Accuracy
 *
 * Verifies that the postgres://audit resource accurately computes the
 * summary metrics (totalTokenEstimate, callCount, topToolsByTokens) by
 * comparing them directly against the raw tool responses.
 */

import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { test, expect } from "@playwright/test";
import { startServer, stopServer, createClient, callToolAndParse } from "./helpers.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

const AUDIT_PORT_BASE = 3160;
const AUDIT_FILTER = "core,transactions,performance";

function auditLogPath(suffix: string): string {
  return join(tmpdir(), `pg-audit-summary-${suffix}-${Date.now()}.jsonl`);
}

test.describe.configure({ mode: "serial" });

test.describe("Audit Token Summary Accuracy", () => {
  test("postgres://audit summary accurately aggregates tool token estimates", async () => {
    const port = AUDIT_PORT_BASE + 1;
    const logPath = auditLogPath("accuracy");

    // Enable audit reads so read-scoped tools are also logged
    await startServer(
      port,
      ["--audit-log", logPath, "--audit-reads", "--tool-filter", AUDIT_FILTER],
      "audit-accuracy",
    );

    let client: Client | undefined;
    try {
      client = await createClient(`http://localhost:${port}`);

      const toolsToCall = [
        { name: "pg_transaction_begin", args: {} },
        { name: "pg_read_query", args: { sql: "SELECT 1 AS test_val" } },
        { name: "pg_list_tables", args: { limit: 2 } },
        { name: "pg_transaction_rollback", args: {} },
      ];

      let expectedTotalTokens = 0;
      const expectedTokensByTool: Record<string, number> = {};
      let currentTxId: string | undefined;

      // Execute each tool and accumulate the returned token estimates
      for (const t of toolsToCall) {
        if (t.name === "pg_transaction_rollback" && currentTxId) {
          t.args = { transactionId: currentTxId };
        }
        
        const payload = await callToolAndParse(client, t.name, t.args);
        expect(payload.error).toBeUndefined();
        
        if (t.name === "pg_transaction_begin") {
          currentTxId = payload["transactionId"] as string | undefined;
        }
        
        const meta = payload._meta as Record<string, unknown> | undefined;
        expect(typeof meta?.tokenEstimate).toBe("number");
        const tokens = meta!.tokenEstimate as number;
        
        expectedTotalTokens += tokens;
        expectedTokensByTool[t.name] = (expectedTokensByTool[t.name] || 0) + tokens;
        
        // Brief delay to ensure async audit log write
        await new Promise(r => setTimeout(r, 100));
      }

      // Read the audit resource
      const resource = await client.readResource({ uri: "postgres://audit" });
      expect(resource.contents).toBeDefined();
      
      const body = JSON.parse(resource.contents[0]!.text!) as {
        summary: {
          totalTokenEstimate: number;
          callCount: number;
          topToolsByTokens: Array<{ tool: string; calls: number; tokens: number }>;
        };
      };

      // Verify topTools distribution
      for (const t of toolsToCall) {
        const topToolStat = body.summary.topToolsByTokens.find(stat => stat.tool === t.name);
        expect(topToolStat).toBeDefined();
        // The aggregated tokens for the tool should match our tracked expected total
        expect(topToolStat!.tokens).toBe(expectedTokensByTool[t.name]);
      }

      // Summary totals must accurately match the sums from individual _meta payloads
      expect(body.summary.callCount).toBe(4);
      expect(body.summary.totalTokenEstimate).toBe(expectedTotalTokens);
      
    } finally {
      if (client) await client.close();
      stopServer(port);
      await rm(logPath, { force: true }).catch(() => {});
    }
  });
});
