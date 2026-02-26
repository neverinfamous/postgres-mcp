/**
 * postgres-mcp - Code Mode Tool: pg_execute_code
 *
 * MCP tool that executes LLM-generated code in a sandboxed environment
 * with access to all 194 PostgreSQL tools via the pg.* API.
 */

import { z } from "zod";
import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type { ToolDefinition } from "../../../../types/index.js";
import { SandboxPool } from "../../../../codemode/sandbox.js";
import { CodeModeSecurityManager } from "../../../../codemode/security.js";
import { createPgApi } from "../../../../codemode/api.js";
import type { ExecuteCodeOptions } from "../../../../codemode/types.js";
import { getToolIcons } from "../../../../utils/icons.js";

// Schema for pg_execute_code input
export const ExecuteCodeSchema = z.object({
  code: z
    .string()
    .describe(
      "TypeScript/JavaScript code to execute. Use pg.{group}.{method}() for database operations.",
    ),
  timeout: z
    .number()
    .optional()
    .describe("Execution timeout in milliseconds (max 30000, default 30000)"),
  readonly: z
    .boolean()
    .optional()
    .describe("If true, restricts to read-only operations"),
});

// Schema for pg_execute_code output
export const ExecuteCodeOutputSchema = z.object({
  success: z.boolean().describe("Whether the code executed successfully"),
  result: z
    .unknown()
    .optional()
    .describe("Return value from the executed code"),
  error: z.string().optional().describe("Error message if execution failed"),
  metrics: z
    .object({
      wallTimeMs: z
        .number()
        .describe("Wall clock execution time in milliseconds"),
      cpuTimeMs: z.number().describe("CPU time used in milliseconds"),
      memoryUsedMb: z.number().describe("Memory used in megabytes"),
    })
    .optional()
    .describe("Execution performance metrics"),
  hint: z.string().optional().describe("Helpful tip or additional information"),
});

// Singleton instances (initialized on first use)
let sandboxPool: SandboxPool | null = null;
let securityManager: CodeModeSecurityManager | null = null;

/**
 * Initialize Code Mode infrastructure
 */
function ensureInitialized(): {
  pool: SandboxPool;
  security: CodeModeSecurityManager;
} {
  sandboxPool ??= new SandboxPool();
  sandboxPool.initialize();
  securityManager ??= new CodeModeSecurityManager();
  return { pool: sandboxPool, security: securityManager };
}

/**
 * Create the pg_execute_code tool
 */
export function createExecuteCodeTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_execute_code",
    description: `Execute TypeScript/JavaScript code in a sandboxed environment with access to all PostgreSQL tools via the pg.* API.

Available API groups:
- pg.core: readQuery, writeQuery, listTables, describeTable, createTable, createIndex, etc. (18 methods)
- pg.transactions: begin, commit, rollback, savepoint, execute (7 methods)
- pg.jsonb: extract, set, insert, delete, contains, pathQuery (19 methods)
- pg.text: search, fuzzy, headline, rank (11 methods)
- pg.performance: explain, tableStats, indexStats (16 methods)
- pg.admin: vacuum, analyze, reindex (10 methods)
- pg.monitoring: databaseSize, tableSizes, connectionStats (11 methods)
- pg.backup: dumpTable, dumpSchema, copyExport, copyImport, createBackupPlan, restoreCommand, physical, restoreValidate, scheduleOptimize (9 methods)
- pg.schema: createSchema, createView, createSequence (13 methods)
- pg.vector: search, createIndex, embed (14 methods)
- pg.postgis: distance, buffer, pointInPolygon (15 methods)
- pg.partitioning: createPartition, listPartitions (6 methods)
- pg.stats: descriptive, percentiles, correlation (8 methods)
- pg.cron: schedule, unschedule, listJobs (8 methods)
- pg.partman: createParent, runMaintenance (10 methods)
- pg.kcache: queryStats, reset (7 methods)
- pg.citext: convertColumn, listColumns (6 methods)
- pg.ltree: query, subpath, lca (8 methods)
- pg.pgcrypto: hash, encrypt, decrypt (9 methods)

Example:
\`\`\`javascript
const tables = await pg.core.listTables();
const results = [];
for (const t of tables.tables) {
    const count = await pg.core.readQuery({sql: \`SELECT COUNT(*) as n FROM \${t.name}\`});
    results.push({ table: t.name, rows: count.rows[0].n });
}
return results;
\`\`\``,
    group: "codemode",
    tags: ["code", "execute", "sandbox", "script", "batch"],
    inputSchema: ExecuteCodeSchema,
    outputSchema: ExecuteCodeOutputSchema,
    requiredScopes: ["admin"],
    annotations: {
      title: "Execute Code",
      readOnlyHint: false,
      destructiveHint: true, // Can perform any operation
      idempotentHint: false,
      openWorldHint: false,
    },
    icons: getToolIcons("codemode", { destructiveHint: true }),
    handler: async (params: unknown) => {
      const { code, readonly } = params as ExecuteCodeOptions;

      // Initialize infrastructure
      const { pool, security } = ensureInitialized();

      // Validate code
      const validation = security.validateCode(code);
      if (!validation.valid) {
        return {
          success: false,
          error: `Code validation failed: ${validation.errors.join("; ")}`,
          metrics: { wallTimeMs: 0, cpuTimeMs: 0, memoryUsedMb: 0 },
        };
      }

      // Check rate limit
      const clientId = "default"; // Could be extracted from context in future
      if (!security.checkRateLimit(clientId)) {
        return {
          success: false,
          error: "Rate limit exceeded. Please wait before executing more code.",
          metrics: { wallTimeMs: 0, cpuTimeMs: 0, memoryUsedMb: 0 },
        };
      }

      // Create pg API bindings
      const pgApi = createPgApi(adapter);
      const bindings = pgApi.createSandboxBindings();

      // Validate bindings are populated
      const totalMethods = Object.values(bindings).reduce(
        (sum: number, group) => {
          if (typeof group === "object" && group !== null) {
            return sum + Object.keys(group).length;
          }
          return sum;
        },
        0,
      );
      if (totalMethods === 0) {
        return {
          success: false,
          error:
            "pg.* API not available: no tool bindings were created. Ensure adapter.getToolDefinitions() returns valid tools.",
          metrics: { wallTimeMs: 0, cpuTimeMs: 0, memoryUsedMb: 0 },
        };
      }

      // Capture active transactions before execution for cleanup on error
      const transactionsBefore = new Set(adapter.getActiveTransactionIds());

      // Execute in sandbox
      const result = await pool.execute(code, bindings);

      // Cleanup orphaned transactions on failure
      // Any transaction started during execution but not committed/rolled back is orphaned
      if (!result.success) {
        const transactionsAfter = adapter.getActiveTransactionIds();
        const orphanedTransactions = transactionsAfter.filter(
          (txId) => !transactionsBefore.has(txId),
        );

        // Best-effort cleanup of orphaned transactions
        for (const txId of orphanedTransactions) {
          await adapter.cleanupTransaction(txId);
        }
      }

      // Sanitize result
      if (result.success && result.result !== undefined) {
        result.result = security.sanitizeResult(result.result);
      }

      // Audit log
      const record = security.createExecutionRecord(
        code,
        result,
        readonly ?? false,
        clientId,
      );
      security.auditLog(record);

      // Add help hint for discoverability
      const helpHint =
        "Tip: Use pg.help() to list all groups, or pg.core.help() for group-specific methods.";

      // Include hint in response
      return {
        ...result,
        hint: helpHint,
      };
    },
  };
}

/**
 * Get all Code Mode tools
 */
export function getCodeModeTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [createExecuteCodeTool(adapter)];
}

/**
 * Cleanup Code Mode resources (call on server shutdown)
 */
export function cleanupCodeMode(): void {
  if (sandboxPool) {
    sandboxPool.dispose();
    sandboxPool = null;
  }
}
